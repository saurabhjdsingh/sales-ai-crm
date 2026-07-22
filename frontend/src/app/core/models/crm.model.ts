export type UserRole = 'admin' | 'manager' | 'sales_rep';

export interface User {
  id: string;
  email: string;
  username: string;
  first_name: string;
  last_name: string;
  full_name: string;
  role: UserRole;
  phone?: string;
  avatar_url?: string;
  timezone: string;
  job_title?: string;
  is_active: boolean;
  is_superuser?: boolean;
  date_joined: string;
  last_login?: string;
}

export type CompanyStage = 'cold' | 'current_client' | 'active_opportunity' | 'dead_opportunity' | 'do_not_prospect';

export interface Company {
  id: string;
  name: string;
  website?: string;
  industry?: string;
  company_size?: string;
  country?: string;
  linkedin_url?: string;
  apollo_id?: string;
  description?: string;
  stage: CompanyStage;
  owner?: string;
  owner_detail?: {
    id: string;
    name: string;
    email: string;
  };
  tags: string[];
  source?: string;
  icp_score?: number;
  icp_explanation?: string;
  ai_summary?: string;
  contact_count?: number;
  deal_count?: number;
  open_deal_count?: number;
  created_at: string;
  updated_at: string;
  created_by?: { id: string; name: string };
  updated_by?: { id: string; name: string };
}

export type ContactStage =
  | 'cold'
  | 'approaching'
  | 'replied'
  | 'follow_up'
  | 'interested'
  | 'not_icp'
  | 'not_interested'
  | 'unresponsive'
  | 'do_not_contact'
  | 'bad_data'
  | 'changed_job'
  | 'on_hold'
  | 'won';

export interface Contact {
  id: string;
  company: string;
  company_name?: string;
  company_website?: string;
  company_size?: string;
  first_name: string;
  last_name: string;
  full_name: string;
  email?: string;
  phone?: string;
  job_title?: string;
  department?: string;
  linkedin_url?: string;
  apollo_id?: string;
  timezone?: string;
  country?: string;
  owner?: string;
  owner_detail?: {
    id: string;
    name: string;
    email: string;
  };
  stage: ContactStage;
  ai_summary?: string;
  created_at: string;
  updated_at: string;
}

export type DealStage =
  | 'lead'
  | 'sales_qualified'
  | 'meeting_booked'
  | 'negotiation'
  | 'poc'
  | 'contract_sent'
  | 'closed_won'
  | 'closed_lost'
  | 'on_hold';

export type DealPriority = 'low' | 'medium' | 'high' | 'critical';
export type DealRisk = 'low' | 'medium' | 'high';
export type DealContactRole = 'decision_maker' | 'champion' | 'influencer' | 'blocker' | 'user' | 'evaluator';

export interface DealContact {
  id: string;
  deal: string;
  contact: string;
  contact_name: string;
  contact_email?: string;
  contact_job_title?: string;
  role: DealContactRole | '';
  is_primary: boolean;
  created_at: string;
}

export interface Deal {
  id: string;
  name: string;
  company: string;
  company_name?: string;
  expected_revenue?: number;
  owner?: string;
  owner_detail?: {
    id: string;
    name: string;
    email: string;
  };
  stage: DealStage;
  priority: DealPriority;
  expected_close_date?: string;
  risk: DealRisk;
  probability?: number;
  description?: string;
  internal_notes?: string;
  ai_analysis?: string;
  deal_contacts?: DealContact[];
  created_at: string;
  updated_at: string;
}

export type TaskStatus = 'pending' | 'in_progress' | 'completed' | 'cancelled';
export type TaskPriority = 'low' | 'medium' | 'high' | 'urgent';
export type TaskType = 'call' | 'email' | 'linkedin' | 'follow_up' | 'meeting' | 'review_proposal' | 'other';
export type TaskRepeat = 'none' | 'daily' | 'weekly' | 'monthly';

export interface Task {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  reminder_at?: string;
  priority: TaskPriority;
  owner?: string;
  owner_detail?: {
    id: string;
    name: string;
    email: string;
  };
  status: TaskStatus;
  task_type: TaskType;
  repeat: TaskRepeat;
  completed_at?: string;
  company?: string;
  company_name?: string;
  contact?: string;
  contact_name?: string;
  deal?: string;
  deal_name?: string;
  is_overdue?: boolean;
  created_at: string;
  updated_at: string;
}

export type ActivityType =
  | 'import'
  | 'email'
  | 'call'
  | 'meeting'
  | 'task_completed'
  | 'note'
  | 'stage_changed'
  | 'ai_research'
  | 'linkedin_request'
  | 'proposal_sent'
  | 'document_uploaded';

export interface Activity {
  id: string;
  activity_type: ActivityType;
  title: string;
  description?: string;
  metadata?: any;
  performed_by?: string;
  performed_by_name?: string;
  company?: string;
  company_name?: string;
  contact?: string;
  deal?: string;
  created_at: string;
}

export interface Note {
  id: string;
  content: string;
  is_pinned: boolean;
  company?: string;
  contact?: string;
  deal?: string;
  created_at: string;
  updated_at: string;
  created_by?: { id: string; name: string };
  updated_by?: { id: string; name: string };
}

export interface CompanyResearch {
  id: string;
  company: string;
  company_name?: string;
  business_summary?: string;
  estimated_size?: string;
  icp_match?: boolean;
  pain_points: string[];
  technology_stack: string[];
  recent_hiring?: string;
  security_maturity?: string;
  why_radar36_fits?: string;
  potential_objections: string[];
  buying_signals: string[];
  latest_news: any[];
  services: string[];
  products: string[];
  website_summary?: string;
  linkedin_summary?: string;
  researched_at?: string;
  research_status: 'pending' | 'in_progress' | 'completed' | 'failed';
  created_at: string;
  updated_at: string;
}

export interface AIConversation {
  id: string;
  title: string;
  entity_type: 'company' | 'contact' | 'deal';
  company?: string;
  contact?: string;
  deal?: string;
  is_archived: boolean;
  message_count: number;
  last_message_at?: string;
  created_at: string;
  updated_at: string;
  messages?: AIMessage[];
}

export interface AIMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  model_used?: string;
  tokens_used?: number;
  debug_report?: any;
  created_at: string;
}

export interface ImportJob {
  id: string;
  file_name: string;
  entity_type: 'company' | 'contact' | 'unified';
  status: 'pending' | 'mapping' | 'processing' | 'completed' | 'failed';
  total_rows: number;
  processed_rows: number;
  success_count: number;
  error_count: number;
  duplicate_count: number;
  progress_percent: number;
  column_mapping: Record<string, string>;
  started_by?: string;
  started_by_name?: string;
  created_at: string;
  updated_at: string;
  errors?: any[];
}

export interface ImportRecord {
  id: string;
  row_number: number;
  status: 'success' | 'error' | 'duplicate' | 'skipped';
  raw_data: Record<string, any>;
  error_message?: string;
  entity_id?: string;
  created_at: string;
}

export interface PaginatedResult<T> {
  count: number;
  page: number;
  page_size: number;
  total_pages: number;
  next: string | null;
  previous: string | null;
  results: T[];
}

export type SequenceActionType = 'ai_email' | 'manual_task' | 'wait' | 'update_stage' | 'linkedin_message' | 'phone_call' | 'sms' | 'webhook';
export type DelayUnit = 'minutes' | 'hours' | 'days';
export type EnrollmentStatus = 'draft' | 'running' | 'waiting' | 'waiting_approval' | 'completed' | 'stopped' | 'paused' | 'failed';
export type DraftStatus = 'draft_pending' | 'approved' | 'sent' | 'rejected' | 'cancelled';

export interface SequenceStep {
  id?: string;
  step_number: number;
  action_type: SequenceActionType;
  delay: number;
  delay_unit: DelayUnit;
  configuration: Record<string, any>;
}

export interface Sequence {
  id: string;
  name: string;
  description?: string;
  is_active: boolean;
  track_opens: boolean;
  track_clicks: boolean;
  auto_task_on_open_enabled?: boolean;
  auto_task_open_count?: number;
  auto_task_on_click_enabled?: boolean;
  auto_task_click_count?: number;
  task_assignment_strategy?: 'enrolled_by' | 'sequence_owner';
  auto_stop_on_reply?: boolean;
  auto_stop_contact_stages?: string[];
  auto_stop_deal_stages?: string[];
  steps_count?: number;
  active_enrollments_count?: number;
  total_enrolled_count?: number;
  steps?: SequenceStep[];
  created_at: string;
  updated_at: string;
}

export interface SequenceEnrollment {
  id: string;
  sequence: string;
  sequence_name?: string;
  contact: string;
  contact_name?: string;
  contact_email?: string;
  company?: string;
  company_name?: string;
  deal?: string;
  status: EnrollmentStatus;
  current_step_number: number;
  next_execution_at?: string;
  stop_reason?: string;
  stopped_at?: string;
  open_count?: number;
  click_count?: number;
  has_replied?: boolean;
  last_opened_at?: string;
  last_clicked_at?: string;
  created_at: string;
  updated_at: string;
}

export interface SequenceEmailDraft {
  id: string;
  execution?: string;
  enrollment: string;
  sequence_name?: string;
  contact: string;
  contact_name?: string;
  contact_email?: string;
  sender?: string;
  subject: string;
  reply_to?: string;
  body_html: string;
  body_text: string;
  context_summary?: string;
  status: DraftStatus;
  open_count: number;
  first_opened_at?: string;
  last_opened_at?: string;
  click_count: number;
  first_clicked_at?: string;
  last_clicked_at?: string;
  approved_at?: string;
  sent_at?: string;
  created_at: string;
}

export interface SequenceDashboardMetrics {
  active_sequences: number;
  total_enrolled: number;
  running: number;
  waiting_approval: number;
  completed: number;
  stopped: number;
  paused: number;
  reply_rate: number;
  open_rate: number;
  click_rate: number;
  completion_rate: number;
  emails_sent: number;
  tasks_completed: number;
}

export interface EmailMessage {
  id: string;
  gmail_message_id: string;
  sender: string;
  recipients: string[];
  cc?: string[];
  bcc?: string[];
  direction: string;
  subject: string;
  plain_text_body: string;
  html_body: string;
  internal_date: string;
  labels?: string[];
  tracking_token?: string;
  open_count?: number;
  click_count?: number;
  has_replied?: boolean;
  last_opened_at?: string;
  last_clicked_at?: string;
  imported_at?: string;
}

export interface EmailThread {
  id: string;
  gmail_thread_id: string;
  subject: string;
  participants: string[];
  snippet: string;
  last_message_time: string;
  company?: string;
  company_name?: string;
  contact?: string;
  contact_name?: string;
  deal?: string;
  messages: EmailMessage[];
  open_count?: number;
  click_count?: number;
  has_replied?: boolean;
  last_opened_at?: string;
  last_clicked_at?: string;
}

export interface EmailAccount {
  id: string;
  email: string;
  provider_type: 'gmail' | 'outlook' | 'smtp';
  account_role: 'primary' | 'secondary_outbound';
  is_default_outbound: boolean;
  smtp_host?: string;
  smtp_port?: number;
  smtp_username?: string;
  smtp_use_tls?: boolean;
  smtp_use_ssl?: boolean;
  status: 'connected' | 'disconnected' | 'error';
  created_at: string;
}

export interface EmailStatusResponse {
  connected: boolean;
  email?: string;
  status?: string;
  provider?: string;
  accounts?: EmailAccount[];
  primary_account?: EmailAccount | null;
  secondary_account?: EmailAccount | null;
}

