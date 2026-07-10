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
  | 'changed_job';

export interface Contact {
  id: string;
  company: string;
  company_name?: string;
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
