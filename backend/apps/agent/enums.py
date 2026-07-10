from django.db import models


class SourceType(models.TextChoices):
    WEBSITE = "website", "Website"
    LINKEDIN_COMPANY = "linkedin_company", "LinkedIn Company"
    LINKEDIN_PERSON = "linkedin_person", "LinkedIn Person"
    NEWS = "news", "News"
    BLOG = "blog", "Blog"
    ABOUT_PAGE = "about_page", "About Page"
    CAREERS = "careers", "Careers"
    CASE_STUDIES = "case_studies", "Case Studies"
    DOCS = "docs", "Documentation"
    GITHUB = "github", "GitHub"
    TWITTER = "twitter", "Twitter"
    CRUNCHBASE = "crunchbase", "Crunchbase"
    G2 = "g2", "G2"
    REDDIT = "reddit", "Reddit"


class InsightCategory(models.TextChoices):
    SERVICES = "services", "Services"
    PRODUCTS = "products", "Products"
    INDUSTRIES = "industries", "Industries"
    CUSTOMERS = "customers", "Customers"
    TECHNOLOGY = "technology", "Technology Stack"
    COMPLIANCE = "compliance", "Compliance"
    CASE_STUDIES = "case_studies", "Case Studies"
    PAIN_POINTS = "pain_points", "Pain Points"
    GROWTH_SIGNALS = "growth_signals", "Growth Signals"
    HIRING = "hiring", "Hiring"
    BUYING_SIGNALS = "buying_signals", "Buying Signals"
    PARTNERSHIPS = "partnerships", "Partnerships"


class ApprovalStatus(models.TextChoices):
    PENDING = "pending", "Pending"
    APPROVED = "approved", "Approved"
    REJECTED = "rejected", "Rejected"
    EXPIRED = "expired", "Expired"


class PermissionLevel(models.TextChoices):
    READ_ONLY = "read_only", "Read Only"
    WRITE_CRM = "write_crm", "Write CRM"
    EXTERNAL_ACTION = "external_action", "External Action"


class ToolExecutionStatus(models.TextChoices):
    SUCCESS = "success", "Success"
    FAILURE = "failure", "Failure"
    PENDING_APPROVAL = "pending_approval", "Pending Approval"
