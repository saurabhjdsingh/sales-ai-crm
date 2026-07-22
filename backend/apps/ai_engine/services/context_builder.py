"""
Context builder for AI conversations.
Automatically assembles relevant information from the database
so the AI has full context without the user manually pasting anything.
"""

import logging
from uuid import UUID

from django.conf import settings

logger = logging.getLogger(__name__)


class ContextBuilder:
    """
    Assembles structured context for AI conversations.
    Supports lightweight Base Context preloading for hybrid context + tool calling architecture.
    """

    MAX_ACTIVITIES = 20
    MAX_NOTES = 10
    MAX_TASKS = 10

    def build_base_context(
        self,
        user=None,
        conversation=None,
        entity_type: str = None,
        company_id=None,
        contact_id=None,
        deal_id=None,
        call_id=None,
        page_type: str = None,
    ) -> str:
        """
        Builds lightweight Base Context (~100-200 tokens).
        Always includes:
        - Current User
        - Current Organization
        - Current Page Type
        - Current Company ID / Contact ID / Deal ID / Call ID
        """
        from apps.accounts.models import OrganizationSettings
        try:
            org_name = OrganizationSettings.get_solo().organization_name
        except Exception:
            org_name = "Sales AI CRM"

        user_name = user.get_full_name() if (user and hasattr(user, "get_full_name")) else "Unknown User"
        user_email = getattr(user, "email", "N/A")
        user_role = getattr(user, "role", "sales_rep")

        # Resolve entity / IDs from conversation if passed
        if conversation:
            entity_type = entity_type or getattr(conversation, "entity_type", None)
            company_id = company_id or getattr(conversation, "company_id", None)
            contact_id = contact_id or getattr(conversation, "contact_id", None)
            deal_id = deal_id or getattr(conversation, "deal_id", None)
            call_id = call_id or getattr(conversation, "call_id", None)

        effective_page_type = page_type or (f"{entity_type}_detail" if entity_type else "global_copilot")

        lines = [
            "## Base Context",
            f"- Current User: {user_name} ({user_email}, Role: {user_role})",
            f"- Current Organization: {org_name}",
            f"- Current Page Type: {effective_page_type}",
        ]

        if company_id:
            lines.append(f"- Current Company ID: {company_id}")
            try:
                from apps.companies.models import Company
                comp = Company.objects.filter(id=company_id).first()
                if comp:
                    lines.append(f"- Current Company Name: {comp.name}")
            except Exception:
                pass

        if contact_id:
            lines.append(f"- Current Contact ID: {contact_id}")
            try:
                from apps.contacts.models import Contact
                cont = Contact.objects.filter(id=contact_id).first()
                if cont:
                    lines.append(f"- Current Contact Name: {cont.full_name}")
            except Exception:
                pass

        if deal_id:
            lines.append(f"- Current Deal ID: {deal_id}")
            try:
                from apps.deals.models import Deal
                dl = Deal.objects.filter(id=deal_id).first()
                if dl:
                    lines.append(f"- Current Deal Name: {dl.name}")
            except Exception:
                pass

        if call_id:
            lines.append(f"- Current Call ID: {call_id}")

        lines.extend([
            "",
            "## Dynamic Tool Access",
            "Notice: Detailed CRM records (full company profile, contacts, deals, notes, tasks, timeline activities, emails, call transcripts, and research) are NOT preloaded to save tokens.",
            "Use internal read-only tools (e.g., get_company, get_contact, get_deal, get_notes, get_tasks, get_recent_timeline_activities, search_timeline_activities, get_recent_email_threads, get_email_thread, search_email_threads, get_recent_call_transcripts, get_call_summary, get_website_research, get_linkedin_research, search_notes, search_contacts, search_companies, search_deals) to fetch exact information needed to answer the user request."
        ])

        return "\n".join(lines)

    def build_call_context(self, call_id: UUID) -> str:
        """Build context for a call-scoped AI conversation."""
        from apps.telephony.models import Call

        call = Call.objects.select_related("contact", "company", "deal").get(id=call_id)

        sections = [
            f"## Active Call Context",
            f"- Direction: {call.direction.capitalize()}",
            f"- Status: {call.status.capitalize()}",
            f"- Contact: {call.contact.full_name if call.contact else 'Unknown'}",
            f"- Company: {call.company.name if call.company else 'Unknown'}",
            f"- Deal: {call.deal.name if call.deal else 'None'}",
        ]

        try:
            transcript = call.transcript
            if transcript.full_text.strip():
                sections.append(f"## Call Transcript So Far\n{transcript.full_text}")
        except Exception:
            pass

        if call.contact:
            sections.append(self._contact_info(call.contact))
        if call.company:
            sections.append(self._company_info(call.company))
        if call.deal:
            sections.append(self._deal_info(call.deal))

        return "\n\n".join(filter(None, sections))

    def build_company_context(self, company_id: UUID) -> str:
        """Build complete context for a company-scoped AI conversation."""
        from apps.companies.models import Company

        company = Company.objects.select_related("owner").get(id=company_id)

        sections = [
            self._company_info(company),
            self._company_research(company),
            self._company_contacts(company),
            self._company_deals(company),
            self._entity_activities(company_id=company_id),
            self._entity_emails(company_id=company_id),
            self._entity_notes(company_id=company_id),
            self._entity_tasks(company_id=company_id),
        ]

        return "\n\n".join(filter(None, sections))

    def build_contact_context(self, contact_id: UUID) -> str:
        """Build complete context for a contact-scoped AI conversation."""
        from apps.contacts.models import Contact

        contact = Contact.objects.select_related("company", "owner").get(id=contact_id)

        sections = [
            self._contact_info(contact),
            self._company_info(contact.company),
            self._entity_activities(contact_id=contact_id),
            self._entity_emails(contact_id=contact_id),
            self._entity_notes(contact_id=contact_id),
            self._entity_tasks(contact_id=contact_id),
        ]

        return "\n\n".join(filter(None, sections))

    def build_deal_context(self, deal_id: UUID) -> str:
        """Build complete context for a deal-scoped AI conversation."""
        from apps.deals.models import Deal

        deal = Deal.objects.select_related("company", "owner").get(id=deal_id)

        sections = [
            self._deal_info(deal),
            self._company_info(deal.company),
            self._deal_contacts(deal),
            self._entity_activities(deal_id=deal_id),
            self._entity_emails(deal_id=deal_id),
            self._entity_notes(deal_id=deal_id),
            self._entity_tasks(deal_id=deal_id),
        ]

        return "\n\n".join(filter(None, sections))

    def _company_info(self, company) -> str:
        lines = [
            "## Company Information",
            f"- Name: {company.name}",
            f"- Website: {company.website or 'N/A'}",
            f"- Industry: {company.industry or 'N/A'}",
            f"- Size: {company.company_size or 'N/A'}",
            f"- Country: {company.country or 'N/A'}",
            f"- Stage: {company.get_stage_display()}",
            f"- Owner: {company.owner.get_full_name() if company.owner else 'Unassigned'}",
            f"- ICP Score: {company.icp_score or 'Not scored'}",
            f"- Source: {company.source or 'N/A'}",
            f"- Tags: {', '.join(company.tags) if company.tags else 'None'}",
        ]
        if company.description:
            lines.append(f"- Description: {company.description}")
        if company.ai_summary:
            lines.append(f"- AI Summary: {company.ai_summary}")
        if company.icp_explanation:
            lines.append(f"- ICP Explanation: {company.icp_explanation}")
        return "\n".join(lines)

    def _company_research(self, company) -> str:
        try:
            research = company.research
            if research.research_status != "completed":
                return ""

            lines = [
                "## AI Research Results",
                f"- Business Summary: {research.business_summary}",
                f"- Estimated Size: {research.estimated_size or 'N/A'}",
                f"- ICP Match: {'Yes' if research.icp_match else 'No' if research.icp_match is not None else 'Unknown'}",
                f"- Security Maturity: {research.security_maturity or 'N/A'}",
                f"- Why Radar 36 Fits: {research.why_radar36_fits or 'N/A'}",
            ]
            if research.pain_points:
                lines.append(f"- Pain Points: {', '.join(research.pain_points)}")
            if research.technology_stack:
                lines.append(f"- Tech Stack: {', '.join(research.technology_stack)}")
            if research.buying_signals:
                lines.append(f"- Buying Signals: {', '.join(research.buying_signals)}")
            if research.potential_objections:
                lines.append(f"- Potential Objections: {', '.join(research.potential_objections)}")
            if research.services:
                lines.append(f"- Services: {', '.join(research.services)}")
            if research.products:
                lines.append(f"- Products: {', '.join(research.products)}")
            return "\n".join(lines)
        except Exception:
            return ""

    def _company_contacts(self, company) -> str:
        contacts = company.contacts.filter(is_deleted=False)[:10]
        if not contacts:
            return ""

        lines = ["## Contacts"]
        for c in contacts:
            lines.append(
                f"- {c.full_name} | {c.job_title or 'N/A'} | "
                f"{c.email or 'N/A'} | Stage: {c.get_stage_display()}"
            )
        return "\n".join(lines)

    def _company_deals(self, company) -> str:
        deals = company.deals.filter(is_deleted=False)[:10]
        if not deals:
            return ""

        lines = ["## Deals"]
        for d in deals:
            revenue = f"${d.expected_revenue:,.2f}" if d.expected_revenue else "N/A"
            lines.append(
                f"- {d.name} | Stage: {d.get_stage_display()} | "
                f"Revenue: {revenue} | Priority: {d.get_priority_display()}"
            )
        return "\n".join(lines)

    def _deal_info(self, deal) -> str:
        revenue = f"${deal.expected_revenue:,.2f}" if deal.expected_revenue else "N/A"
        lines = [
            "## Deal Information",
            f"- Name: {deal.name}",
            f"- Company: {deal.company.name}",
            f"- Stage: {deal.get_stage_display()}",
            f"- Expected Revenue: {revenue}",
            f"- Priority: {deal.get_priority_display()}",
            f"- Risk: {deal.get_risk_display()}",
            f"- Probability: {deal.probability or 'N/A'}%",
            f"- Expected Close: {deal.expected_close_date or 'N/A'}",
            f"- Owner: {deal.owner.get_full_name() if deal.owner else 'Unassigned'}",
        ]
        if deal.description:
            lines.append(f"- Description: {deal.description}")
        if deal.internal_notes:
            lines.append(f"- Internal Notes: {deal.internal_notes}")
        return "\n".join(lines)

    def _deal_contacts(self, deal) -> str:
        deal_contacts = deal.deal_contacts.select_related("contact").all()[:10]
        if not deal_contacts:
            return ""

        lines = ["## Deal Contacts"]
        for dc in deal_contacts:
            c = dc.contact
            primary = " [PRIMARY]" if dc.is_primary else ""
            lines.append(
                f"- {c.full_name} | {c.job_title or 'N/A'} | "
                f"Role: {dc.get_role_display() or 'N/A'}{primary}"
            )
        return "\n".join(lines)

    def _contact_info(self, contact) -> str:
        lines = [
            "## Contact Information",
            f"- Name: {contact.full_name}",
            f"- Email: {contact.email or 'N/A'}",
            f"- Phone: {contact.phone or 'N/A'}",
            f"- Job Title: {contact.job_title or 'N/A'}",
            f"- Department: {contact.department or 'N/A'}",
            f"- Company: {contact.company.name}",
            f"- Stage: {contact.get_stage_display()}",
            f"- Country: {contact.country or 'N/A'}",
        ]
        if contact.ai_summary:
            lines.append(f"- AI Summary: {contact.ai_summary}")
        return "\n".join(lines)

    def _entity_activities(self, company_id=None, contact_id=None, deal_id=None) -> str:
        from apps.activities.models import Activity

        qs = Activity.objects.select_related("performed_by")
        if company_id:
            qs = qs.filter(company_id=company_id)
        elif contact_id:
            qs = qs.filter(contact_id=contact_id)
        elif deal_id:
            qs = qs.filter(deal_id=deal_id)
        else:
            return ""

        activities = qs.order_by("-created_at")[: self.MAX_ACTIVITIES]
        if not activities:
            return ""

        lines = ["## Recent Activity Timeline"]
        for a in activities:
            by = a.performed_by.get_full_name() if a.performed_by else "System"
            lines.append(f"- [{a.created_at:%Y-%m-%d}] {a.get_activity_type_display()}: {a.title} (by {by})")
        return "\n".join(lines)

    def _entity_notes(self, company_id=None, contact_id=None, deal_id=None) -> str:
        from apps.notes.models import Note

        qs = Note.objects.select_related("created_by")
        if company_id:
            qs = qs.filter(company_id=company_id)
        elif contact_id:
            qs = qs.filter(contact_id=contact_id)
        elif deal_id:
            qs = qs.filter(deal_id=deal_id)
        else:
            return ""

        notes = qs.order_by("-created_at")[: self.MAX_NOTES]
        if not notes:
            return ""

        lines = ["## Notes"]
        for n in notes:
            by = n.created_by.get_full_name() if n.created_by else "Unknown"
            content = n.content[:300] + "..." if len(n.content) > 300 else n.content
            lines.append(f"- [{n.created_at:%Y-%m-%d}] by {by}: {content}")
        return "\n".join(lines)

    def _entity_tasks(self, company_id=None, contact_id=None, deal_id=None) -> str:
        from apps.tasks.models import Task

        qs = Task.objects.select_related("owner")
        if company_id:
            qs = qs.filter(company_id=company_id)
        elif contact_id:
            qs = qs.filter(contact_id=contact_id)
        elif deal_id:
            qs = qs.filter(deal_id=deal_id)
        else:
            return ""

        tasks = qs.order_by("-created_at")[: self.MAX_TASKS]
        if not tasks:
            return ""

        lines = ["## Tasks"]
        for t in tasks:
            owner = t.owner.get_full_name() if t.owner else "Unassigned"
            due = t.due_date.strftime("%Y-%m-%d") if t.due_date else "No due date"
            lines.append(
                f"- [{t.get_status_display()}] {t.title} | "
                f"Due: {due} | Assigned: {owner}"
            )
        return "\n".join(lines)

    def _entity_emails(self, company_id=None, contact_id=None, deal_id=None) -> str:
        from django.db.models import Q
        from apps.emails.models import EmailThread

        qs = EmailThread.objects.prefetch_related("messages")
        if company_id:
            qs = qs.filter(Q(company_id=company_id) | Q(contact__company_id=company_id))
        elif contact_id:
            qs = qs.filter(contact_id=contact_id)
        elif deal_id:
            qs = qs.filter(deal_id=deal_id)
        else:
            return ""

        threads = qs.distinct().order_by("-last_message_time")[:10]
        if not threads:
            return ""

        lines = ["## Email Conversations"]
        for thread in threads:
            lines.append(f"### Thread: {thread.subject or '(No Subject)'} (Gmail Thread ID: {thread.gmail_thread_id})")
            
            messages = thread.messages.order_by("internal_date")[:10]
            for m in messages:
                date_str = m.internal_date.strftime("%Y-%m-%d %H:%M:%S UTC")
                dir_indicator = "Outgoing" if m.direction == "outgoing" else "Incoming"
                
                lines.append(f"  - [{date_str}] {dir_indicator} from {m.sender}")
                lines.append(f"    To: {', '.join(m.recipients) if m.recipients else 'N/A'}")
                if m.cc:
                    lines.append(f"    Cc: {', '.join(m.cc)}")
                
                body_content = (m.plain_text_body or m.html_body or "").strip()
                
                body_lines = body_content.split("\n")
                cleaned_body_lines = []
                for bl in body_lines[:15]:
                    cleaned_body_lines.append(f"      {bl}")
                
                body_formatted = "\n".join(cleaned_body_lines)
                if len(body_lines) > 15 or len(body_content) > 1000:
                    body_formatted += "\n      [Truncated...]"
                    
                lines.append(f"    Content:\n{body_formatted}")
                lines.append("")
                
        return "\n".join(lines)
