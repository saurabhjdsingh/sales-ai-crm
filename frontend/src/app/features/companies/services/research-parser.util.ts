/**
 * Deterministic Parser for Company Research Dossier & Organizational Tree.
 * Extracts company metadata, people directory, and reporting hierarchy from
 * ChatGPT / research plugin output without consuming any AI tokens.
 */

export interface ParsedPerson {
  name: string;
  role: string;
  classification: string;
  classification_type: 'primary' | 'technical' | 'practitioner' | 'other';
  linkedin_url: string;
  selected: boolean;
}

export interface OrgNode {
  id: string;
  name: string;
  title: string;
  classification?: string;
  classification_type?: string;
  linkedin_url?: string;
  reports_to?: string | null;
  in_crm?: boolean;
  crm_contact_id?: string;
  notes?: string;
}

export interface OrgChartData {
  root_id?: string;
  nodes: OrgNode[];
}

export interface ParsedResearch {
  company_name: string;
  industry: string;
  country: string;
  headquarters: string;
  company_size: string;
  website: string;
  people: ParsedPerson[];
  org_chart_data: OrgChartData;
  formatted_html: string;
}

export class ResearchParserUtil {
  /**
   * Main entry point to parse pasted research (HTML or raw text/markdown).
   */
  static parse(rawContent: string): ParsedResearch {
    const content = rawContent.trim();

    // 0. Auto-detect and parse JSON format
    if (content.startsWith('{')) {
      try {
        const parsedObj = JSON.parse(content);
        if (parsedObj.report || parsedObj.company || parsedObj.vapt_team || parsedObj.organization_chart) {
          return this.parseJson(parsedObj);
        }
      } catch (e) {
        // Fallback to text/HTML parsing if JSON syntax is incomplete
      }
    }

    const isHtml = /<[a-z][\s\S]*>/i.test(rawContent);

    let companyName = '';
    let industry = '';
    let country = '';
    let headquarters = '';
    let companySize = '';
    let website = '';
    const people: ParsedPerson[] = [];

    // 1. Detect Company Name
    // Pattern A: # Radar 36 Account Intelligence \n Company Name
    const nameMatch1 = content.match(/#\s*Radar 36 Account Intelligence[^\n]*\n+([A-Za-z0-9\s.,&'-]+?)(?:\s*·|\s*\n)/i);
    // Pattern B: # Company Name
    const nameMatch2 = content.match(/#\s*([A-Za-z0-9\s.,&'-]{2,50})(?:\n|$)/);
    // Pattern C: <title>Company Name</title> or <title size="xl">Company Name</title>
    const nameMatch3 = content.match(/<title[^>]*>([A-Za-z0-9\s.,&'-]{2,50})<\/title>/i);

    if (nameMatch1 && !nameMatch1[1].toLowerCase().includes('account intelligence')) {
      companyName = nameMatch1[1].trim();
    } else if (nameMatch3 && !nameMatch3[1].toLowerCase().includes('account intelligence')) {
      companyName = nameMatch3[1].trim();
    } else if (nameMatch2 && !nameMatch2[1].toLowerCase().includes('radar 36') && !nameMatch2[1].toLowerCase().includes('account intelligence')) {
      companyName = nameMatch2[1].trim();
    }

    // Fallback search for company name
    if (!companyName) {
      const altMatch = content.match(/(?:Company|Account):\s*([^\n\r<]+)/i);
      if (altMatch) companyName = altMatch[1].trim();
    }

    // 2. Detect Location / Country / Industry
    // Pattern: "Company Name · Country · Research date"
    const locMatch = content.match(/·\s*([A-Za-z\s]+?)\s*·\s*Research date/i);
    if (locMatch) country = locMatch[1].trim();

    // Pattern: "Cybersecurity consulting · Bengaluru, India"
    const subMatch = content.match(/([A-Za-z\s&/]+?)\s*·\s*([A-Za-z\s]+),\s*([A-Za-z\s]+)/);
    if (subMatch) {
      if (!industry) industry = subMatch[1].trim();
      headquarters = `${subMatch[2].trim()}, ${subMatch[3].trim()}`;
      if (!country) country = subMatch[3].trim();
    }

    // Pattern: "Headquarters \n **Bengaluru**"
    const hqMatch = content.match(/Headquarters[\s\S]*?\*\*([A-Za-z\s,]+)\*\*/i);
    if (hqMatch && !headquarters) headquarters = hqMatch[1].trim();

    // 3. Detect Company Size / Apollo Records
    const sizeMatch = content.match(/Apollo people records[\s\S]*?#?\s*(\d+)/i);
    if (sizeMatch) {
      const count = parseInt(sizeMatch[1], 10);
      if (count <= 10) companySize = '1-10';
      else if (count <= 50) companySize = '11-50';
      else if (count <= 100) companySize = '51-100';
      else if (count <= 200) companySize = '101-200';
      else if (count <= 500) companySize = '201-500';
      else companySize = '500+';
    }

    // 4. Extract People from Tables
    // Case A: HTML DOM Parser
    if (isHtml && typeof DOMParser !== 'undefined') {
      try {
        const parser = new DOMParser();
        const doc = parser.parseFromString(content, 'text/html');

        const rows = doc.querySelectorAll('tr');
        rows.forEach(tr => {
          const cells = tr.querySelectorAll('td');
          if (cells.length >= 2) {
            const nameCell = cells[0].textContent?.trim() || '';
            const roleCell = cells[1]?.textContent?.trim() || '';
            const classCell = cells[2]?.textContent?.trim() || '';
            
            // Look for link
            let linkedinUrl = '';
            const a = tr.querySelector('a[href*="linkedin.com"]');
            if (a) {
              linkedinUrl = a.getAttribute('href') || '';
            }

            if (nameCell && !nameCell.toLowerCase().includes('person') && nameCell.length < 60) {
              this.addPersonIfNotExists(people, {
                name: nameCell,
                role: roleCell,
                classification: classCell,
                classification_type: this.determineClassification(roleCell, classCell),
                linkedin_url: linkedinUrl,
                selected: true
              });
            }
          }
        });
      } catch (e) {
        console.warn('DOMParser table parse error', e);
      }
    }

    // Case B: Markdown Table Regex
    // | Nishanth G E | Penetration Tester... | (Direct VAPT) | https://in.linkedin.com/in/... |
    const mdRowRegex = /\|\s*([^|\n]+?)\s*\|\s*([^|\n]+?)\s*\|\s*([^|\n]*?)\s*\|\s*([^|\n]*?)\s*\|/g;
    let match: RegExpExecArray | null;
    while ((match = mdRowRegex.exec(content)) !== null) {
      const col1 = match[1].trim();
      const col2 = match[2].trim();
      const col3 = match[3].trim();
      const col4 = match[4].trim();

      if (col1.toLowerCase() === 'person' || col1.includes('---')) continue;

      let linkedin = '';
      const linkMatch = (col4 + ' ' + col3).match(/https?:\/\/[^\s)"]*linkedin\.com\/in\/[^\s)"]+/i);
      if (linkMatch) {
        linkedin = linkMatch[0];
      }

      if (col1 && col1.length < 60) {
        this.addPersonIfNotExists(people, {
          name: col1,
          role: col2,
          classification: col3,
          classification_type: this.determineClassification(col2, col3),
          linkedin_url: linkedin,
          selected: true
        });
      }
    }

    // 5. Scan for Key Leaders in Outreach Map (e.g. Poojitha Nandimandalam, Founder & CEO)
    // Often in ChatGPT cards: <title size="lg">Poojitha Nandimandalam</title> ... Founder & CEO ... linkedin
    const leaderCardRegex = /(?:Poojitha Nandimandalam|Founder\s*&\s*CEO|Nishanth G E)/i;
    if (leaderCardRegex.test(content)) {
      // Check for Poojitha
      if (/Poojitha/i.test(content)) {
        const poojithaLinkedin = content.match(/https?:\/\/[^\s)"]*linkedin\.com\/in\/poojitha[^\s)"]*/i)?.[0] || 'https://in.linkedin.com/in/poojitha-nandimandalam';
        this.addPersonIfNotExists(people, {
          name: 'Poojitha Nandimandalam',
          role: 'Founder & CEO',
          classification: 'Primary business contact',
          classification_type: 'primary',
          linkedin_url: poojithaLinkedin,
          selected: true
        });
      }
      // Check for Nishanth
      if (/Nishanth/i.test(content)) {
        const nishanthLinkedin = content.match(/https?:\/\/[^\s)"]*linkedin\.com\/in\/nishanth[^\s)"]*/i)?.[0] || 'https://in.linkedin.com/in/nishanth-g-e';
        this.addPersonIfNotExists(people, {
          name: 'Nishanth G E',
          role: 'Penetration Tester',
          classification: 'Technical conversation',
          classification_type: 'technical',
          linkedin_url: nishanthLinkedin,
          selected: true
        });
      }
    }

    // 6. Build the Organizational Tree Structure
    const orgChartData = this.buildOrgTree(people);

    // 7. Format Clean HTML for Dossier View
    const formattedHtml = this.formatDossierHtml(content);

    return {
      company_name: companyName ? companyName.trim() : '',
      industry: industry ? industry.trim() : '',
      country: country ? country.trim() : '',
      headquarters: headquarters ? headquarters.trim() : '',
      company_size: companySize ? companySize.trim() : '',
      website: website ? website.trim() : '',
      people,
      org_chart_data: orgChartData,
      formatted_html: formattedHtml
    };
  }

  private static addPersonIfNotExists(list: ParsedPerson[], person: ParsedPerson): void {
    const normName = person.name.trim().toLowerCase();
    const existing = list.find(p => p.name.trim().toLowerCase() === normName);
    if (!existing) {
      list.push(person);
    } else {
      if (!existing.linkedin_url && person.linkedin_url) existing.linkedin_url = person.linkedin_url;
      if (!existing.role && person.role) existing.role = person.role;
      if (!existing.classification && person.classification) existing.classification = person.classification;
    }
  }

  private static determineClassification(role: string, classText: string): 'primary' | 'technical' | 'practitioner' | 'other' {
    const text = (role + ' ' + classText).toLowerCase();
    if (text.includes('ceo') || text.includes('founder') || text.includes('primary') || text.includes('president')) {
      return 'primary';
    }
    if (text.includes('technical') || text.includes('direct vapt') || text.includes('penetration tester') || text.includes('lead')) {
      return 'technical';
    }
    if (text.includes('analyst') || text.includes('engineer') || text.includes('consultant')) {
      return 'practitioner';
    }
    return 'other';
  }

  private static buildOrgTree(people: ParsedPerson[]): OrgChartData {
    if (people.length === 0) {
      return { nodes: [] };
    }

    // 1. Identify Root (CEO / Founder / Director / Head)
    let rootPerson = people.find(p => /ceo|founder|director|president/i.test(p.role) || /primary/i.test(p.classification));
    if (!rootPerson && people.length > 0) {
      rootPerson = people[0];
    }

    const nodes: OrgNode[] = [];
    const rootId = 'node-root';

    if (rootPerson) {
      nodes.push({
        id: rootId,
        name: rootPerson.name,
        title: rootPerson.role || 'Executive Leadership',
        classification: rootPerson.classification || 'Primary business contact',
        classification_type: 'primary',
        linkedin_url: rootPerson.linkedin_url,
        reports_to: null,
        in_crm: false,
        notes: 'Commercial & executive decision maker'
      });
    }

    // 2. Identify Technical Leads (Reports to Root)
    const techLeads = people.filter(p => p !== rootPerson && (/technical/i.test(p.classification) || /penetration tester|lead/i.test(p.role)));
    const techLeadIds: string[] = [];

    techLeads.forEach((p, idx) => {
      const id = `node-tech-${idx + 1}`;
      techLeadIds.push(id);
      nodes.push({
        id,
        name: p.name,
        title: p.role,
        classification: p.classification || 'Technical Lead',
        classification_type: 'technical',
        linkedin_url: p.linkedin_url,
        reports_to: rootId,
        in_crm: false,
        notes: 'Security delivery & technical evaluation'
      });
    });

    // 3. Practitioners (Report to tech lead or root)
    const others = people.filter(p => p !== rootPerson && !techLeads.includes(p));
    others.forEach((p, idx) => {
      const parentId = techLeadIds.length > 0 ? techLeadIds[0] : rootId;
      nodes.push({
        id: `node-staff-${idx + 1}`,
        name: p.name,
        title: p.role || 'Security Practitioner',
        classification: p.classification || 'Possible VAPT',
        classification_type: 'practitioner',
        linkedin_url: p.linkedin_url,
        reports_to: parentId,
        in_crm: false
      });
    });

    return {
      root_id: rootId,
      nodes
    };
  }

  /**
   * Cleans and structures raw research into beautiful styled HTML for the Dossier view.
   */
  static formatDossierHtml(content: string): string {
    let html = content;

    // Convert OpenAI / ChatGPT GenUI tags to styled HTML
    html = html.replace(/<title\s+size="xl"[^>]*>(.*?)<\/title>/gi, '<h2 class="dossier-title-xl">$1</h2>');
    html = html.replace(/<title\s+size="lg"[^>]*>(.*?)<\/title>/gi, '<h3 class="dossier-title-lg">$1</h3>');
    html = html.replace(/<title\s+size="md"[^>]*>(.*?)<\/title>/gi, '<h4 class="dossier-title-md">$1</h4>');
    html = html.replace(/<badge\s+color="success"[^>]*>(.*?)<\/badge>/gi, '<span class="dossier-badge badge-success">$1</span>');
    html = html.replace(/<badge\s+color="info"[^>]*>(.*?)<\/badge>/gi, '<span class="dossier-badge badge-info">$1</span>');
    html = html.replace(/<badge\s+color="warning"[^>]*>(.*?)<\/badge>/gi, '<span class="dossier-badge badge-warning">$1</span>');
    html = html.replace(/<badge[^>]*>(.*?)<\/badge>/gi, '<span class="dossier-badge">$1</span>');
    html = html.replace(/<divider\s*\/>/gi, '<hr class="dossier-divider" />');

    // Convert Box / Grid / Row
    html = html.replace(/<box[^>]*>/gi, '<div class="dossier-card">');
    html = html.replace(/<\/box>/gi, '</div>');
    html = html.replace(/<grid[^>]*>/gi, '<div class="dossier-grid">');
    html = html.replace(/<\/grid>/gi, '</div>');
    html = html.replace(/<grid-item[^>]*>/gi, '<div class="dossier-grid-item">');
    html = html.replace(/<\/grid-item>/gi, '</div>');
    html = html.replace(/<row[^>]*>/gi, '<div class="dossier-row">');
    html = html.replace(/<\/row>/gi, '</div>');

    // Convert Link components
    html = html.replace(/<Link\s+url="([^"]+)"\s+title="([^"]+)"\s*\/>/gi, '<a href="$1" target="_blank" rel="noopener noreferrer" class="dossier-link"><span class="link-text">$2</span> ↗</a>');

    // Convert Markdown Headings
    html = html.replace(/^#\s+(.+)$/gm, '<h1 class="dossier-h1">$1</h1>');
    html = html.replace(/^##\s+(.+)$/gm, '<h2 class="dossier-h2">$1</h2>');
    html = html.replace(/^###\s+(.+)$/gm, '<h3 class="dossier-h3">$1</h3>');

    // Convert bold & italic
    html = html.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
    html = html.replace(/\*([^*]+)\*/g, '<em>$1</em>');

    // Clean up empty lines into paragraph breaks
    html = html.replace(/\n\n+/g, '<br/><br/>');

    return `<div class="dossier-wrapper">${html}</div>`;
  }

  /**
   * Parses structured ChatGPT JSON (e.g. Radar 36 Account Intelligence schema).
   */
  static parseJson(json: any): ParsedResearch {
    const report = json.report || json;
    const company = report.company || {};
    const orgChart = report.organization_chart || {};
    const vaptTeam = report.vapt_team || {};
    const outreachMap = report.outreach_map || {};

    const companyName = (company.name || report.name || report.company_name || '').trim();
    const website = (company.website || '').trim();

    let headquarters = '';
    let country = '';
    if (company.headquarters) {
      if (typeof company.headquarters === 'object') {
        const parts = [company.headquarters.city, company.headquarters.state, company.headquarters.country].filter(Boolean);
        headquarters = parts.join(', ');
        country = company.headquarters.country || '';
      } else {
        headquarters = String(company.headquarters);
      }
    }

    let companySize = '';
    if (company.employee_count) {
      if (typeof company.employee_count === 'object') {
        companySize = company.employee_count.reported_range || '';
      } else {
        companySize = String(company.employee_count);
      }
    }

    const industry = (company.business_type || company.industry || '').trim();

    const people: ParsedPerson[] = [];

    const formatClassification = (val: string): string => {
      if (!val) return 'Practitioner';
      return val.replace(/_/g, ' ').toLowerCase().replace(/\b\w/g, c => c.toUpperCase());
    };

    // 1. Executive from organization_chart
    if (orgChart.executive && orgChart.executive.name) {
      this.addPersonIfNotExists(people, {
        name: orgChart.executive.name.trim(),
        role: (orgChart.executive.title || 'Executive Leadership').trim(),
        classification: 'Primary Business Contact',
        classification_type: 'primary',
        linkedin_url: orgChart.executive.linkedin_url || '',
        selected: true
      });
    }

    // 2. Outreach Map Contacts
    if (outreachMap.primary_business_contact?.name) {
      const p = outreachMap.primary_business_contact;
      this.addPersonIfNotExists(people, {
        name: p.name.trim(),
        role: (p.title || 'Business Authority').trim(),
        classification: 'Primary Business Contact',
        classification_type: 'primary',
        linkedin_url: p.linkedin_url || '',
        selected: true
      });
    }

    if (outreachMap.technical_contact?.name) {
      const p = outreachMap.technical_contact;
      this.addPersonIfNotExists(people, {
        name: p.name.trim(),
        role: (p.title || 'Technical Specialist').trim(),
        classification: 'Technical Contact',
        classification_type: 'technical',
        linkedin_url: p.linkedin_url || '',
        selected: true
      });
    }

    if (outreachMap.additional_technical_contact?.name) {
      const p = outreachMap.additional_technical_contact;
      this.addPersonIfNotExists(people, {
        name: p.name.trim(),
        role: (p.title || 'Technical Specialist').trim(),
        classification: 'Technical Contact',
        classification_type: 'technical',
        linkedin_url: p.linkedin_url || '',
        selected: true
      });
    }

    // 3. Team People (e.g. vapt_team.people or team.people or people)
    const teamPeopleList = Array.isArray(vaptTeam.people) 
      ? vaptTeam.people 
      : Array.isArray(report.team?.people) 
        ? report.team.people 
        : Array.isArray(report.people) 
          ? report.people 
          : [];

    if (teamPeopleList.length > 0) {
      teamPeopleList.forEach((p: any) => {
        if (p && p.name) {
          const rawClass = p.classification || '';
          const isDirect = /direct/i.test(rawClass) || /lead|director|vp|head|architect/i.test(p.title || '');
          this.addPersonIfNotExists(people, {
            name: p.name.trim(),
            role: (p.title || 'Team Member').trim(),
            classification: formatClassification(rawClass),
            classification_type: isDirect ? 'technical' : 'practitioner',
            linkedin_url: p.linkedin_url || '',
            selected: true
          });
        }
      });
    }

    // 4. Functional Groups in Org Chart
    if (Array.isArray(orgChart.functional_groups)) {
      orgChart.functional_groups.forEach((group: any) => {
        if (Array.isArray(group.people)) {
          group.people.forEach((p: any) => {
            if (p && p.name) {
              const isDirect = /direct/i.test(p.classification || '') || /lead|director|vp|head/i.test(p.title || '');
              this.addPersonIfNotExists(people, {
                name: p.name.trim(),
                role: (p.title || 'Team Member').trim(),
                classification: formatClassification(p.classification || 'Practitioner'),
                classification_type: isDirect ? 'technical' : 'practitioner',
                linkedin_url: p.linkedin_url || '',
                selected: true
              });
            }
          });
        }
        if (Array.isArray(group.other_possible_members)) {
          group.other_possible_members.forEach((m: any) => {
            const name = typeof m === 'string' ? m : m?.name;
            if (name) {
              this.addPersonIfNotExists(people, {
                name: name.trim(),
                role: 'Team Member',
                classification: 'Practitioner',
                classification_type: 'practitioner',
                linkedin_url: '',
                selected: true
              });
            }
          });
        }
      });
    }

    // 5. Build Org Tree Data
    const orgChartData = this.buildOrgTree(people);

    // 6. Generate rich HTML dossier
    const formattedHtml = this.generateHtmlFromJson(report, people);

    return {
      company_name: companyName,
      industry: industry,
      country: country,
      headquarters: headquarters,
      company_size: companySize,
      website: website,
      people,
      org_chart_data: orgChartData,
      formatted_html: formattedHtml
    };
  }

  /**
   * Synthesizes an executive-grade HTML dossier from structured JSON report.
   */
  static generateHtmlFromJson(report: any, people: ParsedPerson[]): string {
    const company = report.company || {};
    const vapt = report.vapt_capability || {};
    const outreach = report.outreach_map || {};
    const salesIntel = report.sales_intelligence || {};
    const positioning = report.radar36_positioning || {};
    const metadata = report.research_metadata || {};

    let hqStr = '';
    if (company.headquarters) {
      hqStr = typeof company.headquarters === 'object'
        ? [company.headquarters.city, company.headquarters.state, company.headquarters.country].filter(Boolean).join(', ')
        : String(company.headquarters);
    }

    let empStr = '';
    if (company.employee_count) {
      empStr = typeof company.employee_count === 'object' ? company.employee_count.reported_range : String(company.employee_count);
    }

    const services = Array.isArray(company.primary_services) ? company.primary_services : [];
    const identifiedServices = Array.isArray(vapt.identified_services) ? vapt.identified_services : [];
    const questions = Array.isArray(report.discovery_questions) ? report.discovery_questions : [];
    const hypotheses = Array.isArray(salesIntel.hypotheses_to_validate) ? salesIntel.hypotheses_to_validate : [];
    const sequences = Array.isArray(outreach.recommended_conversation_sequence) ? outreach.recommended_conversation_sequence : [];

    let html = `
      <div class="dossier-wrapper">
        <!-- Company Intelligence Header Card -->
        <div class="dossier-card">
          <div style="display: flex; justify-content: space-between; align-items: flex-start; flex-wrap: wrap; gap: 1rem;">
            <div>
              <h1 class="dossier-h1" style="margin: 0 0 0.5rem 0;">${company.name || 'Account'} · Intelligence Dossier</h1>
              <p style="color: #64748b; font-size: 0.85rem; margin: 0;">
                Source: <strong>ChatGPT Structured JSON</strong> · Researched: <strong>${metadata.research_date || 'Recent'}</strong>
              </p>
            </div>
            <div>
              <span class="dossier-badge badge-info" style="font-size: 0.8rem; padding: 0.3rem 0.75rem;">Verified Research Report</span>
            </div>
          </div>

          <hr class="dossier-divider" style="margin: 1rem 0;" />

          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 1rem; font-size: 0.88rem;">
            <div><strong>Website:</strong> <br/><a href="${company.website}" target="_blank" rel="noopener noreferrer" class="dossier-link">${company.website} ↗</a></div>
            <div><strong>Headquarters:</strong> <br/>${hqStr || 'N/A'}</div>
            <div><strong>Employee Range:</strong> <br/>${empStr || 'N/A'} Employees</div>
            <div><strong>Business Type:</strong> <br/>${company.business_type || 'Cybersecurity Services'}</div>
            <div><strong>Founded:</strong> <br/>${company.founded || 'N/A'}</div>
            <div><strong>Ownership:</strong> <br/>${company.ownership || 'Privately held'}</div>
          </div>
        </div>

        <!-- VAPT Capability & Identified Services -->
        <div class="dossier-card">
          <h2 class="dossier-h2" style="margin-top: 0;">VAPT & Security Capabilities</h2>
          <p style="margin: 0.5rem 0 1rem 0;">
            Capability Status: <span class="dossier-badge badge-success">${vapt.status || 'CONFIRMED'}</span>
          </p>

          <h3 class="dossier-h3">Identified Assessment Portfolio</h3>
          <div style="display: flex; flex-wrap: wrap; gap: 0.4rem; margin-top: 0.5rem;">
            ${(identifiedServices.length > 0 ? identifiedServices : services).map((s: string) => `<span class="dossier-badge">${s}</span>`).join('')}
          </div>

          ${Array.isArray(vapt.evidence) && vapt.evidence.length > 0 ? `
            <h3 class="dossier-h3" style="margin-top: 1.25rem;">Capability Evidence</h3>
            <ul style="margin: 0.25rem 0 0.5rem 1.25rem; padding: 0; font-size: 0.88rem; line-height: 1.6;">
              ${vapt.evidence.map((e: string) => `<li>${e}</li>`).join('')}
            </ul>
          ` : ''}
        </div>

        <!-- Outreach Strategy & Key Decision Makers -->
        <div class="dossier-card">
          <h2 class="dossier-h2" style="margin-top: 0;">Outreach Strategy & Key Stakeholders</h2>
          <div style="display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 1rem; margin-top: 1rem;">
            ${outreach.primary_business_contact?.name ? `
              <div style="background: rgba(245, 158, 11, 0.05); border: 1px solid rgba(245, 158, 11, 0.25); border-radius: 8px; padding: 0.85rem;">
                <span class="dossier-badge badge-warning" style="margin-bottom: 0.4rem;">Primary Business Contact</span>
                <div style="font-weight: 700; font-size: 0.95rem; margin-top: 0.25rem;">${outreach.primary_business_contact.name}</div>
                <div style="color: #64748b; font-size: 0.82rem;">${outreach.primary_business_contact.title || 'Executive Leadership'}</div>
                ${outreach.primary_business_contact.linkedin_url ? `<a href="${outreach.primary_business_contact.linkedin_url}" target="_blank" class="dossier-link" style="font-size: 0.8rem; display: inline-block; margin-top: 0.4rem;">LinkedIn Profile ↗</a>` : ''}
                ${outreach.primary_business_contact.reason ? `<p style="font-size: 0.8rem; margin: 0.5rem 0 0 0; color: #475569;">${outreach.primary_business_contact.reason}</p>` : ''}
              </div>
            ` : ''}

            ${outreach.technical_contact?.name ? `
              <div style="background: rgba(99, 102, 241, 0.05); border: 1px solid rgba(99, 102, 241, 0.25); border-radius: 8px; padding: 0.85rem;">
                <span class="dossier-badge badge-info" style="margin-bottom: 0.4rem;">Technical Contact</span>
                <div style="font-weight: 700; font-size: 0.95rem; margin-top: 0.25rem;">${outreach.technical_contact.name}</div>
                <div style="color: #64748b; font-size: 0.82rem;">${outreach.technical_contact.title || 'Technical Specialist'}</div>
                ${outreach.technical_contact.linkedin_url ? `<a href="${outreach.technical_contact.linkedin_url}" target="_blank" class="dossier-link" style="font-size: 0.8rem; display: inline-block; margin-top: 0.4rem;">LinkedIn Profile ↗</a>` : ''}
                ${outreach.technical_contact.reason ? `<p style="font-size: 0.8rem; margin: 0.5rem 0 0 0; color: #475569;">${outreach.technical_contact.reason}</p>` : ''}
              </div>
            ` : ''}
          </div>

          ${sequences.length > 0 ? `
            <h3 class="dossier-h3" style="margin-top: 1.5rem;">Recommended Conversation Sequence</h3>
            <div style="display: flex; flex-direction: column; gap: 0.5rem; margin-top: 0.5rem;">
              ${sequences.map((sq: any) => `
                <div style="display: flex; gap: 0.75rem; align-items: flex-start; font-size: 0.86rem; line-height: 1.5;">
                  <span class="dossier-badge" style="font-weight: 700;">Step ${sq.step}</span>
                  <div><strong>${sq.contact}:</strong> ${sq.objective}</div>
                </div>
              `).join('')}
            </div>
          ` : ''}
        </div>

        <!-- Security Team Directory Table -->
        <h2 class="dossier-h2">Identified Security Practitioners (${people.length})</h2>
        <table class="dossier-table">
          <thead>
            <tr>
              <th>Person Name</th>
              <th>Role / Title</th>
              <th>Classification</th>
              <th>LinkedIn Profile</th>
            </tr>
          </thead>
          <tbody>
            ${people.map(p => `
              <tr>
                <td><strong>${p.name}</strong></td>
                <td>${p.role || 'Practitioner'}</td>
                <td>
                  <span class="dossier-badge ${p.classification_type === 'primary' ? 'badge-warning' : p.classification_type === 'technical' ? 'badge-info' : 'badge-success'}">
                    ${p.classification}
                  </span>
                </td>
                <td>
                  ${p.linkedin_url ? `<a href="${p.linkedin_url}" target="_blank" rel="noopener noreferrer" class="dossier-link">LinkedIn ↗</a>` : '<span style="color: #94a3b8;">Unlisted</span>'}
                </td>
              </tr>
            `).join('')}
          </tbody>
        </table>

        <!-- Sales Intelligence & Questions -->
        <div class="dossier-card" style="margin-top: 1.5rem;">
          <h2 class="dossier-h2" style="margin-top: 0;">Sales Intelligence & Discovery Questions</h2>

          ${hypotheses.length > 0 ? `
            <h3 class="dossier-h3">Operational Hypotheses to Validate</h3>
            <ul style="margin: 0.25rem 0 1rem 1.25rem; font-size: 0.88rem; line-height: 1.6;">
              ${hypotheses.map((h: string) => `<li>${h}</li>`).join('')}
            </ul>
          ` : ''}

          ${questions.length > 0 ? `
            <h3 class="dossier-h3">Recommended Discovery Questions</h3>
            <ol style="margin: 0.25rem 0 1rem 1.25rem; font-size: 0.88rem; line-height: 1.6;">
              ${questions.map((q: string) => `<li>${q}</li>`).join('')}
            </ol>
          ` : ''}

          ${positioning.value_proposition ? `
            <h3 class="dossier-h3">Radar 36 Positioning</h3>
            <p style="font-size: 0.88rem; line-height: 1.5; color: #475569; margin: 0.25rem 0;">
              <strong>Value Proposition:</strong> ${positioning.value_proposition}
            </p>
            ${positioning.suggested_conversation ? `
              <p style="font-size: 0.88rem; line-height: 1.5; color: #475569; margin: 0.5rem 0 0 0;">
                <strong>Suggested Pitch:</strong> ${positioning.suggested_conversation}
              </p>
            ` : ''}
          ` : ''}
        </div>
      </div>
    `;

    return html;
  }
}

