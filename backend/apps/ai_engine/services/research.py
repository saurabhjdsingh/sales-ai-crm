"""
Company research service — runs AI-powered research on companies with real-time web crawl & Apollo zero-credit grounding.
"""

import json
import logging
from django.utils import timezone

from apps.ai_engine.models import CompanyResearch
from apps.ai_engine.services.copilot import get_llm_provider
from apps.ai_engine.services.prompt_service import PromptService
from apps.common.enums import ActivityType, ResearchStatus

logger = logging.getLogger(__name__)


class ResearchService:
    """Handles AI-powered company research and organizational intelligence."""

    def __init__(self, user=None):
        self.user = user
        self.provider = get_llm_provider(user=user)

    def research_company(self, company_id: str) -> CompanyResearch:
        """
        Run comprehensive AI research on a company.
        Integrates live website crawling + Apollo zero-credit firmographics.
        Populates CompanyResearch (business summary, ICP score, tech stack, pain points,
        interactive org tree data, and rendered HTML dossier) and updates the Company model.
        """
        from apps.companies.models import Company

        company = Company.objects.get(id=company_id)
        if not self.user:
            self.user = company.created_by or company.owner
            if not self.provider and self.user:
                self.provider = get_llm_provider(user=self.user)

        # Create or get research record
        research, created = CompanyResearch.objects.get_or_create(
            company=company,
            defaults={"created_by": company.created_by or self.user},
        )

        research.research_status = ResearchStatus.IN_PROGRESS
        research.save(update_fields=["research_status", "updated_at"])

        try:
            # 1. Grounding: Live website crawling + Apollo firmographics (zero credit)
            crawl_summary = ""
            comp_website = (company.website or "").strip()
            if comp_website and comp_website != "Not provided":
                try:
                    from apps.agent.tools.research.website_research import WebsiteResearchTool
                    crawler = WebsiteResearchTool()
                    url = comp_website if comp_website.startswith(("http://", "https://")) else f"https://{comp_website}"
                    scraped = crawler._crawl_site(url)
                    if scraped:
                        combined = []
                        for page_url, ptext in list(scraped.items())[:3]:
                            clean_text = ptext.strip()[:1000]
                            if clean_text:
                                combined.append(f"--- PAGE: {page_url} ---\n{clean_text}")
                        if combined:
                            crawl_summary = "\n\n".join(combined)
                except Exception as e:
                    logger.warning("Could not crawl website %s for account intelligence: %s", comp_website, e)

            apollo_summary = ""
            try:
                from apps.ai_engine.services.apollo_client import get_user_apollo_client
                apollo_client = get_user_apollo_client(self.user)
                if apollo_client:
                    domain = comp_website.replace("https://", "").replace("http://", "").split("/")[0].strip() if comp_website else ""
                    org_data = apollo_client.view_organization(domain=domain, name=company.name)
                    people_data = apollo_client.view_people(domain=domain, limit=10) if domain else []

                    parts = []
                    if org_data.get("success"):
                        parts.append(
                            f"APOLLO VERIFIED FIRMOGRAPHICS (0 CREDITS):\n"
                            f"- Legal Name: {org_data.get('name')}\n"
                            f"- Headcount: {org_data.get('estimated_num_employees')}\n"
                            f"- Annual Revenue: {org_data.get('annual_revenue')}\n"
                            f"- Total Funding: {org_data.get('total_funding')}\n"
                            f"- Tech Stack: {', '.join(org_data.get('technologies', [])[:10])}\n"
                            f"- Keywords: {', '.join(org_data.get('keywords', [])[:8])}\n"
                            f"- Location: {org_data.get('city')}, {org_data.get('country')}\n"
                            f"- Overview: {org_data.get('short_description')}"
                        )
                    if people_data:
                        plist = [f"- {p.get('name')} ({p.get('title')})" for p in people_data[:10]]
                        parts.append("KEY LEADERSHIP / CONTACTS (VIEW ONLY - 0 CREDITS):\n" + "\n".join(plist))

                    if parts:
                        apollo_summary = "\n\n".join(parts)
            except Exception as e:
                logger.warning("Could not fetch Apollo data for account intelligence: %s", e)

            # 2. Build research prompt (uses customizable Account Intelligence prompt from Settings)
            try:
                user_template = PromptService.get_prompt(self.user, "account_intelligence_user")
            except Exception:
                user_template = PromptService.get_prompt(self.user, "research_user")

            user_prompt = user_template.format(
                company_name=company.name,
                website=company.website or "Not provided",
                industry=company.industry or "Not provided",
                description=company.description or "Not provided",
                country=company.country or "Not provided",
                company_size=company.company_size or "Not provided",
            )

            if crawl_summary or apollo_summary:
                enrichment_context = []
                if crawl_summary:
                    enrichment_context.append(f"LIVE WEBSITE CONTENT:\n{crawl_summary}")
                if apollo_summary:
                    enrichment_context.append(apollo_summary)
                user_prompt += "\n\n### REAL-TIME VERIFIED DATA & LIVE CRAWL:\n" + "\n\n".join(enrichment_context)

            org_persona = PromptService.get_prompt(self.user, "copilot_system")
            try:
                rs_rules = PromptService.get_prompt(self.user, "account_intelligence_system")
            except Exception:
                rs_rules = PromptService.get_prompt(self.user, "research_system")

            research_system = f"{org_persona}\n\n{rs_rules}"

            # 3. Call LLM Provider (with graceful failover and existing raw_data fallback)
            raw_data = None
            try:
                response = self.provider.chat(
                    messages=[{"role": "user", "content": user_prompt}],
                    system_prompt=research_system,
                    purpose="account_intelligence",
                )
                raw_data = self._parse_research_response(response.content)
            except Exception as llm_err:
                logger.warning("LLM provider chat error: %s", llm_err)
                if research.raw_research_data and isinstance(research.raw_research_data, dict):
                    logger.info("Re-processing existing raw_research_data for %s", company.name)
                    raw_data = research.raw_research_data
                else:
                    raise

            if not raw_data:
                raise RuntimeError("Empty response received from research engine.")

            # 4. Process and persist structured research
            return self._process_and_save_research(research, company, raw_data)

        except Exception as e:
            research.research_status = ResearchStatus.FAILED
            research.save(update_fields=["research_status", "updated_at"])
            logger.exception("Research failed for %s: %s", company.name, str(e))
            raise

    def _process_and_save_research(self, research: CompanyResearch, company, raw_data: dict) -> CompanyResearch:
        """
        Parses structured response supporting both custom schema (company_snapshot, vapt_capability, etc.)
        and legacy schema (report.company, etc.), populating all CompanyResearch and Company fields.
        """
        data = raw_data.get("report", raw_data) if isinstance(raw_data, dict) else {}

        # 1. Company snapshot / metadata
        company_snap = data.get("company_snapshot") or data.get("company") or {}
        vapt_cap = data.get("vapt_capability") or {}
        icp_qual = data.get("icp_qualification") or {}
        sales_intel = data.get("sales_intelligence") or {}
        org_chart_raw = data.get("organization_chart") or {}

        # Business summary
        business_summary = (
            data.get("business_summary")
            or company_snap.get("overview")
            or company_snap.get("description")
            or vapt_cap.get("summary")
            or ""
        )
        if not business_summary:
            c_name = company_snap.get("company_name") or company.name
            services = company_snap.get("primary_cybersecurity_services") or []
            services_str = ", ".join(services[:5]) if isinstance(services, list) else str(services)
            country = company_snap.get("country") or company.country or "US"
            emp = company_snap.get("approximate_employee_count") or ""
            parts = [f"{c_name} is a cybersecurity provider based in {country}."]
            if emp:
                parts.append(f"Estimated size: {emp}.")
            if services_str:
                parts.append(f"Key specialized capabilities include {services_str}.")
            business_summary = " ".join(parts)

        # Estimated size
        estimated_size = (
            data.get("estimated_size")
            or company_snap.get("approximate_employee_count")
            or (company_snap.get("employee_count", {}).get("reported_range", "") if isinstance(company_snap.get("employee_count"), dict) else str(company_snap.get("employee_count", "")))
            or ""
        )

        # Pain points
        pain_points = (
            data.get("pain_points")
            or sales_intel.get("hypotheses")
            or sales_intel.get("target_pain_points")
            or icp_qual.get("biggest_uncertainty")
            or []
        )
        if not isinstance(pain_points, list):
            pain_points = [str(pain_points)]

        # Buying signals
        buying_signals = (
            data.get("buying_signals")
            or sales_intel.get("buying_signals")
            or sales_intel.get("triggers")
            or sales_intel.get("sales_plays")
            or []
        )
        if not isinstance(buying_signals, list):
            buying_signals = [str(buying_signals)]

        # Why Radar 36 fits
        why_radar36_fits = (
            data.get("why_radar36_fits")
            or (sales_intel.get("positioning", {}).get("value_proposition", "") if isinstance(sales_intel.get("positioning"), dict) else "")
            or sales_intel.get("recommended_angle", "")
            or sales_intel.get("value_proposition", "")
            or ""
        )

        # Technology stack
        tech_stack = (
            data.get("technology_stack")
            or vapt_cap.get("tools")
            or company_snap.get("tech_stack")
            or []
        )
        if not isinstance(tech_stack, list):
            tech_stack = [str(tech_stack)]

        # Potential objections
        objections = (
            data.get("potential_objections")
            or sales_intel.get("objections")
            or []
        )
        if not isinstance(objections, list):
            objections = [str(objections)]

        # ICP Score calculation
        icp_score = data.get("icp_score")
        tier = icp_qual.get("tier")
        status_val = icp_qual.get("status")
        if icp_score is None or not isinstance(icp_score, (int, float)):
            if tier:
                t_str = str(tier).lower()
                if "1" in t_str:
                    icp_score = 92
                elif "2" in t_str:
                    icp_score = 78
                elif "3" in t_str:
                    icp_score = 55
                elif "4" in t_str:
                    icp_score = 30
            elif status_val:
                s_str = str(status_val).upper()
                if "QUALIFIED" in s_str and "DIS" not in s_str:
                    icp_score = 85
                elif "NEEDS VERIFICATION" in s_str or "VERIFICATION" in s_str:
                    icp_score = 55
                elif "DISQUALIFIED" in s_str:
                    icp_score = 25
            if icp_score is None:
                icp_score = 70

        # ICP Explanation
        icp_reasons = icp_qual.get("reason") or []
        if isinstance(icp_reasons, list):
            icp_explanation = "\n".join(str(r) for r in icp_reasons)
        else:
            icp_explanation = str(icp_reasons)
        if not icp_explanation:
            icp_explanation = data.get("icp_explanation", "")

        # Convert Org Chart to {nodes: [...]}
        nodes = []
        node_id_set = set()

        def add_node(p_id, name, title, classification="Technical", classification_type="technical", linkedin="", reports_to=None):
            clean_id = str(p_id).strip() if p_id else f"node-{len(nodes) + 1}"
            if clean_id in node_id_set:
                clean_id = f"node-{len(nodes) + 1}"
            node_id_set.add(clean_id)
            nodes.append({
                "id": clean_id,
                "name": name,
                "title": title or "Team Member",
                "classification": classification,
                "classification_type": classification_type,
                "linkedin_url": linkedin or "",
                "reports_to": str(reports_to) if reports_to else None,
            })

        def walk_tree(items, parent_id=None):
            for idx, item in enumerate(items):
                if not isinstance(item, dict):
                    continue
                i_id = item.get("id") or f"{parent_id or 'root'}-{idx+1}"
                name = item.get("name") or "Key Leader"
                role = item.get("role") or item.get("title") or "Executive"
                dept = item.get("department") or "Leadership"
                linkedin = item.get("linkedin_url") or ""
                c_type = "primary" if not parent_id else "technical"
                add_node(i_id, name, role, classification=dept, classification_type=c_type, linkedin=linkedin, reports_to=parent_id)
                children = item.get("children") or []
                if isinstance(children, list) and children:
                    walk_tree(children, parent_id=i_id)

        tree = org_chart_raw.get("tree") or []
        if isinstance(tree, list) and tree:
            walk_tree(tree, None)

        # Fallback to people array
        people_list = (
            org_chart_raw.get("people")
            or (data.get("vapt_team", {}).get("people") if isinstance(data.get("vapt_team"), dict) else [])
            or []
        )
        if isinstance(people_list, list):
            for p in people_list:
                if isinstance(p, dict):
                    p_name = p.get("name") or ""
                    p_role = p.get("role") or p.get("title") or ""
                    if p_name and not any(n["name"].lower() == p_name.lower() for n in nodes):
                        c_type = "primary" if not nodes else "technical"
                        add_node(
                            f"p-{len(nodes)+1}",
                            p_name,
                            p_role,
                            classification=p.get("classification", "Core Team"),
                            classification_type=c_type,
                            linkedin=p.get("linkedin_url", ""),
                            reports_to=nodes[0]["id"] if nodes else None,
                        )

        org_chart_data = {"nodes": nodes}

        # Generate complete HTML dossier
        content_html = self._generate_dossier_html(
            company_name=company.name,
            company_snap=company_snap,
            vapt_cap=vapt_cap,
            icp_qual=icp_qual,
            sales_intel=sales_intel,
            nodes=nodes,
            metadata=data.get("report_title") or {},
        )

        # Update research record
        research.business_summary = business_summary
        research.estimated_size = estimated_size
        research.icp_match = (icp_score >= 60)
        research.pain_points = pain_points
        research.technology_stack = tech_stack
        research.why_radar36_fits = why_radar36_fits
        research.potential_objections = objections
        research.buying_signals = buying_signals
        research.services = company_snap.get("primary_cybersecurity_services") or []
        research.website_summary = business_summary
        research.raw_research_data = raw_data
        research.org_chart_data = org_chart_data
        research.content_html = content_html
        research.researched_at = timezone.now()
        research.research_status = ResearchStatus.COMPLETED
        research.source_type = "account_intelligence"
        research.save()

        # Update company model
        company.ai_summary = business_summary
        company.icp_score = min(max(int(icp_score), 0), 100)
        company.icp_explanation = icp_explanation
        company.save(update_fields=["ai_summary", "icp_score", "icp_explanation", "updated_at"])

        # Log Activity
        from apps.activities.models import Activity
        Activity.objects.create(
            activity_type=ActivityType.AI_RESEARCH,
            title=f"Radar 36 Account Intelligence completed for {company.name}",
            company=company,
            metadata={
                "icp_score": company.icp_score,
                "icp_match": research.icp_match,
                "nodes_count": len(nodes),
            },
            created_by=company.created_by or self.user,
        )

        logger.info("Account Intelligence completed for %s (ICP: %s, Nodes: %d)", company.name, company.icp_score, len(nodes))
        return research

    def _generate_dossier_html(self, company_name, company_snap, vapt_cap, icp_qual, sales_intel, nodes, metadata) -> str:
        """Constructs a clean, styled HTML dossier for rendering in the Account Intelligence tab."""
        comp_name = company_snap.get("company_name") or company_name
        comp_web = company_snap.get("website") or ""
        country = company_snap.get("country") or "United States"
        emp_size = company_snap.get("approximate_employee_count") or "11-50"
        biz_type = company_snap.get("business_type") or "Cybersecurity Firm"
        founded = company_snap.get("founded_year") or "N/A"

        icp_status = icp_qual.get("status") or "QUALIFIED"
        icp_tier = icp_qual.get("tier") or "Tier 2"
        reasons = icp_qual.get("reason") or []
        if isinstance(reasons, str):
            reasons = [reasons]
        uncertainties = icp_qual.get("biggest_uncertainty") or []
        if isinstance(uncertainties, str):
            uncertainties = [uncertainties]

        services = company_snap.get("primary_cybersecurity_services") or []
        tools = vapt_cap.get("tools") or []

        hypotheses = sales_intel.get("hypotheses") or sales_intel.get("target_pain_points") or []
        signals = sales_intel.get("buying_signals") or sales_intel.get("triggers") or []
        pos = sales_intel.get("positioning", {}) if isinstance(sales_intel.get("positioning"), dict) else {}
        val_prop = pos.get("value_proposition") or sales_intel.get("recommended_angle") or ""

        reasons_html = "".join(f"<li>{r}</li>" for r in reasons)
        uncertainties_html = "".join(f"<li>{u}</li>" for u in uncertainties)
        services_chips = "".join(f'<span class="dossier-badge badge-info" style="margin-right: 6px; margin-bottom: 6px;">{s}</span>' for s in services)
        tools_chips = "".join(f'<span class="dossier-badge badge-warning" style="margin-right: 6px; margin-bottom: 6px;">{t}</span>' for t in tools)
        hypotheses_html = "".join(f"<li>{h}</li>" for h in hypotheses)
        signals_html = "".join(f"<li>{s}</li>" for s in signals)

        # People table
        rows = []
        for n in nodes[:15]:
            li = f'<a href="{n["linkedin_url"]}" target="_blank" class="dossier-link">LinkedIn ↗</a>' if n.get("linkedin_url") else '—'
            rows.append(f"""
                <tr>
                    <td><strong>{n.get('name')}</strong></td>
                    <td>{n.get('title')}</td>
                    <td><span class="dossier-badge badge-info">{n.get('classification', 'Team')}</span></td>
                    <td>{li}</td>
                </tr>
            """)
        table_html = "".join(rows) if rows else "<tr><td colspan='4'>No team members identified yet.</td></tr>"

        return f"""
        <div class="dossier-wrapper">
          <!-- Company Intelligence Header Card -->
          <div class="dossier-card">
            <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
              <div>
                <h1 class="dossier-h1" style="margin: 0 0 0.5rem 0;">{comp_name} · Intelligence Dossier</h1>
                <p style="color: #64748b; font-size: 0.85rem; margin: 0;">
                  Source: <strong>Radar 36 Account Intelligence</strong> · Researched: <strong>{timezone.now().strftime('%b %d, %Y')}</strong>
                </p>
              </div>
              <div style="display: flex; gap: 0.5rem; flex-wrap: wrap;">
                <span class="dossier-badge badge-warning" style="font-size: 0.8rem; padding: 0.3rem 0.75rem;">{icp_tier}</span>
                <span class="dossier-badge badge-info" style="font-size: 0.8rem; padding: 0.3rem 0.75rem;">Live Grounded</span>
              </div>
            </div>

            <hr class="dossier-divider" style="margin: 1rem 0; border: none; border-top: 1px solid rgba(255,255,255,0.08);" />

            <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; font-size: 0.88rem;">
              <div><strong>Website:</strong> <br/><a href="{comp_web}" target="_blank" rel="noopener noreferrer" class="dossier-link">{comp_web or 'N/A'} ↗</a></div>
              <div><strong>Headquarters:</strong> <br/>{country}</div>
              <div><strong>Employee Count:</strong> <br/>{emp_size} Employees</div>
              <div><strong>Business Type:</strong> <br/>{biz_type}</div>
              <div><strong>Founded:</strong> <br/>{founded}</div>
              <div><strong>VAPT Capability:</strong> <br/><span class="dossier-badge badge-success">Verified Provider</span></div>
            </div>
          </div>

          <!-- ICP Qualification Card -->
          <div class="dossier-card">
            <h2 class="dossier-h2" style="margin-top: 0;">ICP Qualification & Match Rationale</h2>
            <div style="display: flex; align-items: center; gap: 0.75rem; margin-bottom: 0.75rem;">
              <span class="dossier-badge badge-success">Status: {icp_status}</span>
              <span class="dossier-badge badge-info">Tier: {icp_tier}</span>
            </div>
            {f'<h3 class="dossier-h3">Match Rationale</h3><ul style="margin: 0.25rem 0 0.5rem 1.25rem; font-size: 0.88rem; line-height: 1.6;">{reasons_html}</ul>' if reasons else ''}
            {f'<h3 class="dossier-h3" style="margin-top: 0.75rem; color: #f59e0b;">Key Uncertainties</h3><ul style="margin: 0.25rem 0 0.5rem 1.25rem; font-size: 0.88rem; line-height: 1.6;">{uncertainties_html}</ul>' if uncertainties else ''}
          </div>

          <!-- VAPT Services & Tech Stack -->
          <div class="dossier-card">
            <h2 class="dossier-h2" style="margin-top: 0;">Security Capabilities & Technology Stack</h2>
            {f'<h3 class="dossier-h3">Primary Services</h3><div style="display: flex; flex-wrap: wrap; margin-bottom: 0.75rem;">{services_chips}</div>' if services else ''}
            {f'<h3 class="dossier-h3">Detected Tools & Stack</h3><div style="display: flex; flex-wrap: wrap;">{tools_chips}</div>' if tools else ''}
          </div>

          <!-- Sales Intelligence & Positioning -->
          <div class="dossier-card">
            <h2 class="dossier-h2" style="margin-top: 0;">Sales Intelligence & Radar 36 Fit</h2>
            {f'<p style="font-size: 0.9rem; line-height: 1.6; margin-bottom: 1rem;"><strong>Value Proposition:</strong> {val_prop}</p>' if val_prop else ''}
            {f'<h3 class="dossier-h3">Pain Points & Hypotheses</h3><ul style="margin: 0.25rem 0 0.5rem 1.25rem; font-size: 0.88rem; line-height: 1.6;">{hypotheses_html}</ul>' if hypotheses else ''}
            {f'<h3 class="dossier-h3">Buying Signals & Triggers</h3><ul style="margin: 0.25rem 0 0.5rem 1.25rem; font-size: 0.88rem; line-height: 1.6;">{signals_html}</ul>' if signals else ''}
          </div>

          <!-- Identified Decision Makers & Org Structure -->
          <div class="dossier-card">
            <h2 class="dossier-h2" style="margin-top: 0;">Key Leadership & Team Roster ({len(nodes)} Identified)</h2>
            <table class="dossier-table" style="width: 100%; border-collapse: collapse; margin-top: 0.75rem;">
              <thead>
                <tr>
                  <th style="text-align: left; padding: 0.5rem 0.75rem;">Name</th>
                  <th style="text-align: left; padding: 0.5rem 0.75rem;">Title / Role</th>
                  <th style="text-align: left; padding: 0.5rem 0.75rem;">Department</th>
                  <th style="text-align: left; padding: 0.5rem 0.75rem;">Profile</th>
                </tr>
              </thead>
              <tbody>
                {table_html}
              </tbody>
            </table>
          </div>
        </div>
        """

    def _parse_research_response(self, content: str) -> dict:
        """Parse the AI response as JSON, handling common formatting issues."""
        content = content.strip()

        # Remove markdown code block if present
        if content.startswith("```"):
            lines = content.split("\n")
            content = "\n".join(lines[1:-1]) if lines[-1].strip() == "```" else "\n".join(lines[1:])
            content = content.strip()

        try:
            return json.loads(content)
        except json.JSONDecodeError:
            logger.warning("Failed to parse research response as JSON, returning raw")
            return {
                "business_summary": content[:500],
                "website_summary": content,
            }
