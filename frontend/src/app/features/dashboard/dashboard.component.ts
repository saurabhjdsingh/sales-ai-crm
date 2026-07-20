import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';
import { NotificationService } from '../../core/services/notification.service';

interface DashboardData {
  kpis: {
    total_companies: number;
    total_contacts: number;
    total_deals: number;
    open_deals: number;
    pipeline_value: number;
    won_this_month: number;
    tasks_pending: number;
    companies_added_this_month: number;
  };
  today_tasks: Array<{
    id: string;
    title: string;
    task_type: string;
    priority: string;
    due_date: string | null;
    entity: string | null;
  }>;
  overdue_tasks: Array<{
    id: string;
    title: string;
    due_date: string | null;
    days_overdue: number;
  }>;
  deals_closing_soon: Array<{
    id: string;
    name: string;
    company: string;
    stage: string;
    expected_revenue: number;
    expected_close_date: string | null;
    owner: string | null;
  }>;
  recent_activities: Array<{
    id: string;
    type: string;
    title: string;
    performed_by: string;
    company: string | null;
    created_at: string;
  }>;
  pipeline_summary: Array<{
    stage: string;
    label: string;
    count: number;
    total: number;
  }>;
  top_prospects: Array<{
    id: string;
    name: string;
    industry: string;
    icp_score: number;
    stage: string;
  }>;
}

interface ProductivityData {
  id: string;
  date: string;
  companies_worked: number;
  contacts_worked: number;
  deals_worked: number;
  tasks_worked: number;
  activities_logged: number;
  notes_added: number;
  calls_completed: number;
  emails_imported: number;
  extra_metrics: Record<string, any>;
  total_actions: number;
  created_at: string;
  updated_at: string;
}

interface ProductivityMetric {
  key: string;
  label: string;
  icon: string;
  color: string;
  value: number;
}

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, FormsModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
  template: `
    @if (loading()) {
      <div class="loading-state">
        <mat-spinner diameter="48"></mat-spinner>
        <p>Analyzing CRM database...</p>
      </div>
    } @else if (data(); as d) {
      <div class="dashboard-container">
        <!-- KPI Cards Grid -->
        <div class="kpi-grid">
          <!-- KPI 1 -->
          <div class="kpi-card">
            <div class="kpi-icon-wrapper blue">
              <mat-icon>monetization_on</mat-icon>
            </div>
            <div class="kpi-info">
              <span class="kpi-label">Pipeline Value</span>
              <span class="kpi-value">\${{ d.kpis.pipeline_value | number:'1.0-0' }}</span>
              <span class="kpi-trend">{{ d.kpis.open_deals }} active deals</span>
            </div>
          </div>

          <!-- KPI 2 -->
          <div class="kpi-card">
            <div class="kpi-icon-wrapper green">
              <mat-icon>check_circle</mat-icon>
            </div>
            <div class="kpi-info">
              <span class="kpi-label">Won This Month</span>
              <span class="kpi-value">{{ d.kpis.won_this_month }}</span>
              <span class="kpi-trend green">Closed won deals</span>
            </div>
          </div>

          <!-- KPI 3 -->
          <div class="kpi-card">
            <div class="kpi-icon-wrapper purple">
              <mat-icon>assignment</mat-icon>
            </div>
            <div class="kpi-info">
              <span class="kpi-label">My Tasks Pending</span>
              <span class="kpi-value">{{ d.kpis.tasks_pending }}</span>
              <span class="kpi-trend" [ngClass]="{ 'red': d.overdue_tasks.length > 0 }">
                {{ d.overdue_tasks.length }} overdue
              </span>
            </div>
          </div>

          <!-- KPI 4 -->
          <div class="kpi-card">
            <div class="kpi-icon-wrapper orange">
              <mat-icon>business</mat-icon>
            </div>
            <div class="kpi-info">
              <span class="kpi-label">Total Accounts</span>
              <span class="kpi-value">{{ d.kpis.total_companies }}</span>
              <span class="kpi-trend">+{{ d.kpis.companies_added_this_month }} this month</span>
            </div>
          </div>
        </div>

        <!-- Main Dashboard Section -->
        <div class="dashboard-sections">
          <!-- Left Main Area -->
          <div class="main-sections">
            <!-- Alert Panel for Overdue Tasks -->
            <div class="overdue-alert-card" *ngIf="d.overdue_tasks.length > 0">
              <mat-icon class="alert-icon">warning</mat-icon>
              <div class="alert-text">
                <strong>Attention:</strong> You have {{ d.overdue_tasks.length }} overdue task(s). Action required.
              </div>
              <button mat-flat-button color="warn" routerLink="/tasks" class="alert-action-btn">
                Resolve Tasks
              </button>
            </div>

            <!-- Pipeline Summary & Charts -->
            <div class="card section-card">
              <div class="card-header">
                <mat-icon class="header-icon blue">query_stats</mat-icon>
                <h3>Pipeline Value by Stage</h3>
              </div>
              <div class="card-body">
                <div class="pipeline-chart-list">
                  @for (stage of d.pipeline_summary; track stage.stage) {
                    <div class="pipeline-bar-row">
                      <div class="stage-info">
                        <span class="stage-name">{{ stage.label }}</span>
                        <span class="stage-vals">
                          {{ stage.count }} deals · <strong>\${{ stage.total | number:'1.0-0' }}</strong>
                        </span>
                      </div>
                      <div class="bar-outer">
                        <div class="bar-inner" [ngStyle]="{ 'width': getStageBarWidth(stage.total) + '%' }" [ngClass]="stage.stage"></div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>

            <!-- Today's Tasks -->
            <div class="card section-card">
              <div class="card-header">
                <mat-icon class="header-icon purple">today</mat-icon>
                <h3>Today's Schedule</h3>
                <span class="header-badge" *ngIf="d.today_tasks.length > 0">{{ d.today_tasks.length }} pending</span>
              </div>
              <div class="card-body">
                <div class="tasks-feed">
                  @for (t of d.today_tasks; track t.id) {
                    <div class="task-row" routerLink="/tasks">
                      <mat-icon class="task-icon" [ngClass]="t.priority">check_box_outline_blank</mat-icon>
                      <div class="task-details">
                        <div class="task-title">{{ t.title }}</div>
                        <div class="task-meta">
                          <span class="prio" [ngClass]="t.priority">{{ t.priority | uppercase }}</span>
                          <span class="divider" *ngIf="t.entity">·</span>
                          <span class="entity" *ngIf="t.entity">{{ t.entity }}</span>
                        </div>
                      </div>
                    </div>
                  }
                  @if (d.today_tasks.length === 0) {
                    <div class="empty-feed">
                      <mat-icon>sentiment_satisfied_alt</mat-icon>
                      <p>No tasks remaining today. Go ahead and relax!</p>
                    </div>
                  }
                </div>
              </div>
            </div>

            <!-- Deals Closing Soon -->
            <div class="card section-card">
              <div class="card-header">
                <mat-icon class="header-icon orange">alarm</mat-icon>
                <h3>Deals Closing Soon (14 Days)</h3>
              </div>
              <div class="card-body">
                <div class="closing-deals-list">
                  @for (deal of d.deals_closing_soon; track deal.id) {
                    <div class="deal-row" [routerLink]="['/deals', deal.id]">
                      <div class="deal-info">
                        <div class="deal-name">{{ deal.name }}</div>
                        <div class="deal-company">{{ deal.company }} · Owner: {{ deal.owner || 'Unassigned' }}</div>
                      </div>
                      <div class="deal-revenue-box">
                        <div class="deal-rev">\${{ deal.expected_revenue | number:'1.0-0' }}</div>
                        <div class="deal-date">{{ deal.expected_close_date | date:'dd/MM/yyyy' }}</div>
                      </div>
                    </div>
                  }
                  @if (d.deals_closing_soon.length === 0) {
                    <div class="empty-feed">
                      <mat-icon>trending_flat</mat-icon>
                      <p>No deals are scheduled to close in the next 14 days.</p>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>

          <!-- Right Sidebar Area -->
          <div class="side-sections">
            <!-- Top Prospects (Radar 36 ICP score) -->
            <div class="card section-card">
              <div class="card-header">
                <mat-icon class="header-icon pink">auto_awesome</mat-icon>
                <h3>Top AI-Qualified Prospects</h3>
              </div>
              <div class="card-body">
                <div class="prospects-feed">
                  @for (p of d.top_prospects; track p.id) {
                    <div class="prospect-row" [routerLink]="['/companies', p.id]">
                      <div class="prospect-info">
                        <div class="prospect-name">{{ p.name }}</div>
                        <div class="prospect-industry">{{ p.industry || 'Tech' }}</div>
                      </div>
                      <div class="prospect-score-ring">
                        {{ p.icp_score }}
                      </div>
                    </div>
                  }
                  @if (d.top_prospects.length === 0) {
                    <div class="empty-feed">
                      <mat-icon>search_off</mat-icon>
                      <p>No high-ICP prospects scored yet. Complete CSV imports to score.</p>
                    </div>
                  }
                </div>
              </div>
            </div>


            <!-- ═══════════════════════════════════════════════ -->
            <!-- TODAY'S PRODUCTIVITY WIDGET                     -->
            <!-- ═══════════════════════════════════════════════ -->
            <div class="card section-card productivity-card" id="productivity-widget">
              <div class="card-header productivity-header">
                <mat-icon class="header-icon teal">insights</mat-icon>
                <h3>Productivity</h3>
                <div class="date-selector">
                  <select
                    [ngModel]="selectedRange()"
                    (ngModelChange)="onRangeChange($event)"
                    class="range-select"
                    id="productivity-range-select"
                  >
                    <option value="today">Today</option>
                    <option value="yesterday">Yesterday</option>
                    <option value="7d">Last 7 Days</option>
                    <option value="30d">Last 30 Days</option>
                    <option value="custom">Custom Date</option>
                  </select>
                </div>
              </div>

              <!-- Custom Date Picker -->
              @if (selectedRange() === 'custom') {
                <div class="custom-date-picker">
                  <input
                    type="date"
                    class="date-input"
                    [ngModel]="customDate()"
                    (ngModelChange)="onCustomDateChange($event)"
                    id="productivity-custom-date"
                  />
                </div>
              }

              <div class="card-body productivity-body">
                @if (productivityLoading()) {
                  <div class="productivity-loading">
                    <mat-spinner diameter="28"></mat-spinner>
                    <span>Computing...</span>
                  </div>
                } @else if (productivityError()) {
                  <div class="productivity-error">
                    <mat-icon>error_outline</mat-icon>
                    <p>Failed to load productivity data</p>
                    <button mat-stroked-button (click)="loadProductivity()" class="retry-btn" id="productivity-retry-btn">
                      <mat-icon>refresh</mat-icon> Retry
                    </button>
                  </div>
                } @else if (productivityMetrics(); as metrics) {
                  <!-- Total Banner -->
                  <div class="total-banner">
                    <div class="total-number" [class.animate-in]="!productivityLoading()">
                      {{ getTotalActions() }}
                    </div>
                    <div class="total-label">Unique entities worked on</div>
                  </div>

                  <!-- Metrics Grid -->
                  <div class="metrics-grid">
                    @for (m of metrics; track m.key) {
                      <div class="metric-row" [class.has-value]="m.value > 0">
                        <div class="metric-icon-box" [ngClass]="m.color">
                          <mat-icon>{{ m.icon }}</mat-icon>
                        </div>
                        <span class="metric-label">{{ m.label }}</span>
                        <span class="metric-value" [class.zero]="m.value === 0">{{ m.value }}</span>
                      </div>
                    }
                  </div>

                  <!-- Footer -->
                  <div class="productivity-footer">
                    <mat-icon>schedule</mat-icon>
                    <span>Updated {{ productivityUpdatedAt() | date:'shortTime' }}</span>
                  </div>
                } @else {
                  <div class="empty-feed">
                    <mat-icon>self_improvement</mat-icon>
                    <p>No activity recorded yet. Start working to see your productivity!</p>
                  </div>
                }
              </div>
            </div>

            <!-- Recent Activity Timeline -->
            <div class="card section-card">
              <div class="card-header">
                <mat-icon class="header-icon green">history</mat-icon>
                <h3>Recent Activity Timeline</h3>
              </div>
              <div class="card-body scrollable-timeline">
                <div class="timeline-list">
                  @for (act of d.recent_activities; track act.id) {
                    <div class="timeline-row">
                      <div class="timeline-bullet" [ngClass]="act.type"></div>
                      <div class="timeline-info">
                        <div class="timeline-title">{{ act.title }}</div>
                        <div class="timeline-meta">{{ act.performed_by }} · {{ act.created_at | date:'shortTime' }}</div>
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>
    }
  `,
  styles: [`
    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 70vh;
      color: #64748b;
      gap: 1rem;
    }

    .loading-state p {
      font-size: 0.9rem;
    }

    .dashboard-container {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
      color: #cbd5e1;
      font-family: 'Inter', sans-serif;
    }

    .kpi-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(220px, 1fr));
      gap: 1.25rem;
    }

    .kpi-card {
      display: flex;
      align-items: center;
      padding: 1.25rem;
      background-color: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      gap: 1rem;
    }

    .kpi-icon-wrapper {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 44px;
      height: 44px;
      border-radius: 8px;
    }

    .kpi-icon-wrapper.blue { background-color: rgba(59, 130, 246, 0.1); color: #3b82f6; }
    .kpi-icon-wrapper.green { background-color: rgba(16, 185, 129, 0.1); color: #10b981; }
    .kpi-icon-wrapper.purple { background-color: rgba(139, 92, 246, 0.1); color: #8b5cf6; }
    .kpi-icon-wrapper.orange { background-color: rgba(245, 158, 11, 0.1); color: #f59e0b; }

    .kpi-info {
      display: flex;
      flex-direction: column;
    }

    .kpi-label {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 600;
      letter-spacing: 0.05em;
    }

    .kpi-value {
      font-size: 1.5rem;
      font-weight: 800;
      color: #f8fafc;
      margin: 0.15rem 0;
    }

    .kpi-trend {
      font-size: 0.75rem;
      color: #64748b;
    }

    .kpi-trend.green { color: #34d399; }
    .kpi-trend.red { color: #f87171; font-weight: 600; }

    /* Layout Sections */
    .dashboard-sections {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 1.5rem;
      align-items: start;
    }

    .main-sections, .side-sections {
      display: flex;
      flex-direction: column;
      gap: 1.5rem;
    }

    .card {
      background-color: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      overflow: hidden;
    }

    .card-header {
      display: flex;
      align-items: center;
      padding: 1rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      background-color: #0b1329;
    }

    .header-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
      margin-right: 0.5rem;
    }

    .header-icon.blue { color: #3b82f6; }
    .header-icon.purple { color: #8b5cf6; }
    .header-icon.orange { color: #f59e0b; }
    .header-icon.pink { color: #ec4899; }
    .header-icon.green { color: #10b981; }
    .header-icon.teal { color: #14b8a6; }

    .card-header h3 {
      font-size: 0.9rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      color: #f8fafc;
      margin: 0;
    }

    .header-badge {
      font-size: 0.75rem;
      background: rgba(139, 92, 246, 0.2);
      color: #a78bfa;
      padding: 0.1rem 0.4rem;
      border-radius: 4px;
      margin-left: auto;
      font-weight: 600;
    }

    .card-body {
      padding: 1.25rem;
    }

    /* Overdue Alert */
    .overdue-alert-card {
      display: flex;
      align-items: center;
      padding: 0.85rem 1.25rem;
      background-color: rgba(220, 38, 38, 0.15);
      border: 1px solid rgba(220, 38, 38, 0.3);
      border-radius: 8px;
      gap: 1rem;
    }

    .alert-icon {
      color: #ef4444;
    }

    .alert-text {
      flex: 1;
      font-size: 0.85rem;
      color: #fca5a5;
    }

    .alert-action-btn {
      background-color: #ef4444 !important;
      color: white !important;
      border-radius: 6px;
      font-weight: 600;
    }

    /* Pipeline Bars Chart */
    .pipeline-chart-list {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .pipeline-bar-row {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .stage-info {
      display: flex;
      justify-content: space-between;
      font-size: 0.8rem;
    }

    .stage-name {
      font-weight: 600;
      color: #cbd5e1;
    }

    .stage-vals {
      color: #64748b;
    }

    .bar-outer {
      height: 8px;
      background-color: rgba(255, 255, 255, 0.03);
      border-radius: 4px;
      overflow: hidden;
    }

    .bar-inner {
      height: 100%;
      border-radius: 4px;
      background-color: #3b82f6;
    }

    .bar-inner.lead { background-color: #64748b; }
    .bar-inner.sales_qualified { background-color: #3b82f6; }
    .bar-inner.meeting_booked { background-color: #8b5cf6; }
    .bar-inner.negotiation { background-color: #f59e0b; }
    .bar-inner.poc { background-color: #14b8a6; }
    .bar-inner.contract_sent { background-color: #ec4899; }

    /* Today's Tasks Feed */
    .tasks-feed {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .task-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.6rem;
      border-radius: 6px;
      cursor: pointer;
      background-color: rgba(255, 255, 255, 0.01);
      border: 1px solid rgba(255, 255, 255, 0.03);
      transition: background-color 0.15s ease;
    }

    .task-row:hover {
      background-color: rgba(255, 255, 255, 0.03);
    }

    .task-icon {
      color: #64748b;
    }

    .task-icon.high { color: #f59e0b; }
    .task-icon.urgent { color: #ef4444; }

    .task-title {
      font-size: 0.85rem;
      color: #f8fafc;
      font-weight: 500;
    }

    .task-meta {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .task-meta .prio.high { color: #f59e0b; }
    .task-meta .prio.urgent { color: #f87171; }

    .divider {
      color: #334155;
    }

    /* Closing Deals List */
    .closing-deals-list {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .deal-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      background-color: rgba(255, 255, 255, 0.01);
      border: 1px solid rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .deal-row:hover {
      background-color: rgba(255, 255, 255, 0.03);
      border-color: rgba(255, 255, 255, 0.08);
    }

    .deal-info {
      display: flex;
      flex-direction: column;
    }

    .deal-name {
      font-weight: 600;
      font-size: 0.85rem;
      color: #f8fafc;
    }

    .deal-company {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .deal-revenue-box {
      text-align: right;
    }

    .deal-rev {
      font-weight: 700;
      font-size: 0.9rem;
      color: #f8fafc;
    }

    .deal-date {
      font-size: 0.75rem;
      color: #475569;
      margin-top: 0.1rem;
    }

    /* Top Prospects */
    .prospects-feed {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .prospect-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0.75rem;
      background-color: rgba(255, 255, 255, 0.01);
      border: 1px solid rgba(255, 255, 255, 0.03);
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .prospect-row:hover {
      background-color: rgba(255, 255, 255, 0.03);
    }

    .prospect-info {
      display: flex;
      flex-direction: column;
    }

    .prospect-name {
      font-weight: 600;
      font-size: 0.85rem;
      color: #f8fafc;
    }

    .prospect-industry {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .prospect-score-ring {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 32px;
      height: 32px;
      background-color: rgba(16, 185, 129, 0.15);
      border: 1px solid rgba(16, 185, 129, 0.3);
      color: #34d399;
      border-radius: 50%;
      font-weight: 700;
      font-size: 0.8rem;
    }

    /* Scrollable Timeline side card */
    .scrollable-timeline {
      max-height: 380px;
      overflow-y: auto;
    }

    .timeline-list {
      display: flex;
      flex-direction: column;
      gap: 1.25rem;
      position: relative;
      padding-left: 1.25rem;
    }

    .timeline-list::before {
      content: '';
      position: absolute;
      left: 3px;
      top: 4px;
      bottom: 4px;
      width: 1px;
      background: rgba(255, 255, 255, 0.05);
    }

    .timeline-row {
      display: flex;
      position: relative;
    }

    .timeline-bullet {
      position: absolute;
      left: -1.25rem;
      top: 5px;
      width: 7px;
      height: 7px;
      border-radius: 50%;
      background-color: #cbd5e1;
      border: 2px solid #0f172a;
    }

    .timeline-bullet.call { background-color: #34d399; }
    .timeline-bullet.email { background-color: #60a5fa; }
    .timeline-bullet.meeting { background-color: #fbbf24; }
    .timeline-bullet.task_completed { background-color: #f472b6; }
    .timeline-bullet.ai_research { background-color: #38bdf8; }

    .timeline-info {
      display: flex;
      flex-direction: column;
    }

    .timeline-title {
      font-size: 0.8rem;
      font-weight: 500;
      color: #f8fafc;
      line-height: 1.4;
    }

    .timeline-meta {
      font-size: 0.7rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .empty-feed {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 1.5rem 0.5rem;
      color: #475569;
    }

    .empty-feed mat-icon {
      font-size: 24px;
      width: 24px;
      height: 24px;
      margin-bottom: 0.5rem;
    }

    .empty-feed p {
      font-size: 0.8rem;
      margin: 0;
    }

    /* ═══════════════════════════════════════════════════════ */
    /* PRODUCTIVITY WIDGET STYLES                              */
    /* ═══════════════════════════════════════════════════════ */

    .productivity-card {
      border: 1px solid rgba(20, 184, 166, 0.15);
      background: linear-gradient(145deg, #0f172a 0%, #0c1a2e 100%);
    }

    .productivity-header {
      display: flex;
      align-items: center;
      gap: 0.5rem;
    }

    .date-selector {
      margin-left: auto;
    }

    .range-select {
      appearance: none;
      background-color: rgba(20, 184, 166, 0.08);
      border: 1px solid rgba(20, 184, 166, 0.2);
      color: #5eead4;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.3rem 1.5rem 0.3rem 0.5rem;
      border-radius: 6px;
      cursor: pointer;
      outline: none;
      font-family: 'Inter', sans-serif;
      transition: all 0.15s ease;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%235eead4' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
      background-repeat: no-repeat;
      background-position: right 0.4rem center;
    }

    .range-select:hover {
      background-color: rgba(20, 184, 166, 0.15);
      border-color: rgba(20, 184, 166, 0.35);
    }

    .range-select:focus {
      border-color: #14b8a6;
      box-shadow: 0 0 0 2px rgba(20, 184, 166, 0.15);
    }

    .range-select option {
      background-color: #0f172a;
      color: #cbd5e1;
    }

    .custom-date-picker {
      padding: 0.6rem 1.25rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      background-color: rgba(20, 184, 166, 0.03);
    }

    .date-input {
      width: 100%;
      background-color: rgba(255, 255, 255, 0.04);
      border: 1px solid rgba(255, 255, 255, 0.08);
      color: #cbd5e1;
      font-size: 0.8rem;
      font-family: 'Inter', sans-serif;
      padding: 0.4rem 0.6rem;
      border-radius: 6px;
      outline: none;
      transition: border-color 0.15s ease;
    }

    .date-input:focus {
      border-color: #14b8a6;
    }

    .productivity-body {
      padding: 1rem 1.25rem;
    }

    .productivity-loading {
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 0.75rem;
      padding: 2rem 0;
      color: #64748b;
      font-size: 0.8rem;
    }

    .productivity-error {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 1.5rem 0;
      color: #f87171;
      gap: 0.5rem;
    }

    .productivity-error mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
    }

    .productivity-error p {
      font-size: 0.8rem;
      margin: 0;
      color: #94a3b8;
    }

    .retry-btn {
      font-size: 0.75rem;
      border-color: rgba(255, 255, 255, 0.1) !important;
      color: #94a3b8 !important;
      margin-top: 0.25rem;
    }

    .retry-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 0.25rem;
    }

    /* Total Banner */
    .total-banner {
      text-align: center;
      padding: 0.75rem 0 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      margin-bottom: 0.75rem;
    }

    .total-number {
      font-size: 2.25rem;
      font-weight: 900;
      background: linear-gradient(135deg, #14b8a6 0%, #5eead4 50%, #2dd4bf 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
      line-height: 1.1;
    }

    .total-number.animate-in {
      animation: countPulse 0.4s ease-out;
    }

    @keyframes countPulse {
      0% { transform: scale(0.85); opacity: 0.5; }
      60% { transform: scale(1.05); }
      100% { transform: scale(1); opacity: 1; }
    }

    .total-label {
      font-size: 0.7rem;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.06em;
      font-weight: 600;
      margin-top: 0.25rem;
    }

    /* Metrics Grid */
    .metrics-grid {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .metric-row {
      display: flex;
      align-items: center;
      gap: 0.6rem;
      padding: 0.45rem 0.5rem;
      border-radius: 6px;
      transition: all 0.15s ease;
    }

    .metric-row:hover {
      background-color: rgba(255, 255, 255, 0.02);
    }

    .metric-row.has-value {
      background-color: rgba(255, 255, 255, 0.015);
    }

    .metric-icon-box {
      display: flex;
      align-items: center;
      justify-content: center;
      width: 26px;
      height: 26px;
      border-radius: 5px;
      flex-shrink: 0;
    }

    .metric-icon-box mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }

    .metric-icon-box.blue { background-color: rgba(59, 130, 246, 0.12); color: #60a5fa; }
    .metric-icon-box.cyan { background-color: rgba(6, 182, 212, 0.12); color: #22d3ee; }
    .metric-icon-box.indigo { background-color: rgba(99, 102, 241, 0.12); color: #818cf8; }
    .metric-icon-box.purple { background-color: rgba(139, 92, 246, 0.12); color: #a78bfa; }
    .metric-icon-box.teal { background-color: rgba(20, 184, 166, 0.12); color: #2dd4bf; }
    .metric-icon-box.amber { background-color: rgba(245, 158, 11, 0.12); color: #fbbf24; }
    .metric-icon-box.emerald { background-color: rgba(16, 185, 129, 0.12); color: #34d399; }
    .metric-icon-box.rose { background-color: rgba(244, 63, 94, 0.12); color: #fb7185; }

    .metric-label {
      flex: 1;
      font-size: 0.78rem;
      color: #94a3b8;
      font-weight: 500;
    }

    .metric-value {
      font-size: 0.9rem;
      font-weight: 800;
      color: #f8fafc;
      min-width: 20px;
      text-align: right;
    }

    .metric-value.zero {
      color: #475569;
      font-weight: 600;
    }

    /* Footer */
    .productivity-footer {
      display: flex;
      align-items: center;
      gap: 0.35rem;
      padding-top: 0.75rem;
      margin-top: 0.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.04);
      font-size: 0.68rem;
      color: #475569;
    }

    .productivity-footer mat-icon {
      font-size: 13px;
      width: 13px;
      height: 13px;
      color: #475569;
    }

    /* ═══════════════════════════════════════════════════════ */
    /* LIGHT THEME OVERRIDES                                    */
    /* ═══════════════════════════════════════════════════════ */

    :host-context(body.light-theme) .dashboard-container {
      color: #334155;
    }

    :host-context(body.light-theme) .kpi-card {
      background-color: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    :host-context(body.light-theme) .kpi-value {
      color: #0f172a;
    }

    :host-context(body.light-theme) .card {
      background-color: #ffffff;
      border: 1px solid rgba(0, 0, 0, 0.06);
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    :host-context(body.light-theme) .card-header {
      background-color: #f8fafc;
      border-bottom: 1px solid rgba(0, 0, 0, 0.06);
    }

    :host-context(body.light-theme) .card-header h3 {
      color: #0f172a;
    }

    :host-context(body.light-theme) .stage-name {
      color: #334155;
    }

    :host-context(body.light-theme) .bar-outer {
      background-color: rgba(0, 0, 0, 0.04);
    }

    :host-context(body.light-theme) .task-row {
      background-color: rgba(0, 0, 0, 0.01);
      border-color: rgba(0, 0, 0, 0.05);
    }

    :host-context(body.light-theme) .task-row:hover {
      background-color: rgba(0, 0, 0, 0.03);
    }

    :host-context(body.light-theme) .task-title {
      color: #0f172a;
    }

    :host-context(body.light-theme) .deal-row {
      background-color: rgba(0, 0, 0, 0.01);
      border-color: rgba(0, 0, 0, 0.05);
    }

    :host-context(body.light-theme) .deal-row:hover {
      background-color: rgba(0, 0, 0, 0.03);
      border-color: rgba(0, 0, 0, 0.1);
    }

    :host-context(body.light-theme) .deal-name {
      color: #0f172a;
    }

    :host-context(body.light-theme) .deal-rev {
      color: #0f172a;
    }

    :host-context(body.light-theme) .prospect-row {
      background-color: rgba(0, 0, 0, 0.01);
      border-color: rgba(0, 0, 0, 0.05);
    }

    :host-context(body.light-theme) .prospect-row:hover {
      background-color: rgba(0, 0, 0, 0.03);
    }

    :host-context(body.light-theme) .prospect-name {
      color: #0f172a;
    }

    :host-context(body.light-theme) .timeline-bullet {
      border-color: #ffffff;
    }

    :host-context(body.light-theme) .timeline-list::before {
      background: rgba(0, 0, 0, 0.08);
    }

    :host-context(body.light-theme) .timeline-title {
      color: #0f172a;
    }

    :host-context(body.light-theme) .overdue-alert-card {
      background-color: rgba(220, 38, 38, 0.06);
      border-color: rgba(220, 38, 38, 0.15);
    }

    :host-context(body.light-theme) .alert-text {
      color: #b91c1c;
    }

    :host-context(body.light-theme) .header-badge {
      background: rgba(139, 92, 246, 0.1);
      color: #7c3aed;
    }

    :host-context(body.light-theme) .empty-feed {
      color: #94a3b8;
    }

    /* Productivity card — light theme */
    :host-context(body.light-theme) .productivity-card {
      border-color: rgba(20, 184, 166, 0.12);
      background: linear-gradient(145deg, #ffffff 0%, #f0fdfa 100%);
    }

    :host-context(body.light-theme) .productivity-header {
      background-color: #f0fdfa;
      border-bottom-color: rgba(20, 184, 166, 0.1);
    }

    :host-context(body.light-theme) .range-select {
      background-color: rgba(20, 184, 166, 0.06);
      border-color: rgba(20, 184, 166, 0.18);
      color: #0f766e;
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 24 24' fill='none' stroke='%230f766e' stroke-width='2'%3E%3Cpolyline points='6 9 12 15 18 9'/%3E%3C/svg%3E");
    }

    :host-context(body.light-theme) .range-select:hover {
      background-color: rgba(20, 184, 166, 0.12);
      border-color: rgba(20, 184, 166, 0.3);
    }

    :host-context(body.light-theme) .range-select option {
      background-color: #ffffff;
      color: #334155;
    }

    :host-context(body.light-theme) .custom-date-picker {
      background-color: rgba(20, 184, 166, 0.03);
      border-bottom-color: rgba(0, 0, 0, 0.06);
    }

    :host-context(body.light-theme) .date-input {
      background-color: #ffffff;
      border-color: rgba(0, 0, 0, 0.1);
      color: #334155;
    }

    :host-context(body.light-theme) .total-banner {
      border-bottom-color: rgba(0, 0, 0, 0.06);
    }

    :host-context(body.light-theme) .total-number {
      background: linear-gradient(135deg, #0d9488 0%, #14b8a6 50%, #0f766e 100%);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      background-clip: text;
    }

    :host-context(body.light-theme) .metric-row:hover {
      background-color: rgba(0, 0, 0, 0.02);
    }

    :host-context(body.light-theme) .metric-row.has-value {
      background-color: rgba(20, 184, 166, 0.03);
    }

    :host-context(body.light-theme) .metric-label {
      color: #475569;
    }

    :host-context(body.light-theme) .metric-value {
      color: #0f172a;
    }

    :host-context(body.light-theme) .metric-value.zero {
      color: #94a3b8;
    }

    :host-context(body.light-theme) .metric-icon-box.blue { background-color: rgba(59, 130, 246, 0.08); color: #2563eb; }
    :host-context(body.light-theme) .metric-icon-box.cyan { background-color: rgba(6, 182, 212, 0.08); color: #0891b2; }
    :host-context(body.light-theme) .metric-icon-box.indigo { background-color: rgba(99, 102, 241, 0.08); color: #4f46e5; }
    :host-context(body.light-theme) .metric-icon-box.purple { background-color: rgba(139, 92, 246, 0.08); color: #7c3aed; }
    :host-context(body.light-theme) .metric-icon-box.teal { background-color: rgba(20, 184, 166, 0.08); color: #0d9488; }
    :host-context(body.light-theme) .metric-icon-box.amber { background-color: rgba(245, 158, 11, 0.08); color: #d97706; }
    :host-context(body.light-theme) .metric-icon-box.emerald { background-color: rgba(16, 185, 129, 0.08); color: #059669; }
    :host-context(body.light-theme) .metric-icon-box.rose { background-color: rgba(244, 63, 94, 0.08); color: #e11d48; }

    :host-context(body.light-theme) .productivity-footer {
      border-top-color: rgba(0, 0, 0, 0.06);
      color: #94a3b8;
    }

    :host-context(body.light-theme) .productivity-footer mat-icon {
      color: #94a3b8;
    }

    :host-context(body.light-theme) .productivity-error {
      color: #dc2626;
    }

    /* ═══════════════════════════════════════════════════════ */
    /* RESPONSIVE                                               */
    /* ═══════════════════════════════════════════════════════ */

    @media (max-width: 1024px) {
      .dashboard-sections {
        grid-template-columns: 1fr;
      }
    }

    @media (max-width: 600px) {
      .kpi-grid {
        grid-template-columns: 1fr 1fr;
        gap: 0.75rem;
      }

      .kpi-card {
        padding: 0.85rem;
      }

      .kpi-value {
        font-size: 1.2rem;
      }

      .metrics-grid {
        display: grid;
        grid-template-columns: 1fr 1fr;
        gap: 0.25rem;
      }

      .total-number {
        font-size: 1.75rem;
      }
    }
  `]
})
export class DashboardComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly notification = inject(NotificationService);

  readonly loading = signal(true);
  readonly data = signal<DashboardData | null>(null);

  // Productivity state
  readonly productivityLoading = signal(false);
  readonly productivityError = signal(false);
  readonly productivityData = signal<ProductivityData | null>(null);
  readonly productivityMetrics = signal<ProductivityMetric[] | null>(null);
  readonly productivityUpdatedAt = signal<string>('');
  readonly selectedRange = signal<string>('today');
  readonly customDate = signal<string>('');

  ngOnInit(): void {
    this.apiService.get<DashboardData>('/dashboard/').subscribe({
      next: (res) => {
        this.data.set(res);
        this.loading.set(false);
      },
      error: () => {
        this.loading.set(false);
        this.notification.error('Failed to load dashboard statistics');
      }
    });

    this.loadProductivity();
  }

  getStageBarWidth(value: number): number {
    const kpis = this.data()?.kpis;
    const max = kpis?.pipeline_value || 1;
    return Math.max(Math.min((value / max) * 100, 100), 2); // default min 2% bar
  }

  getStageBarColorClass(stage: string): string {
    return stage;
  }

  // ── Productivity Methods ──────────────────────────

  loadProductivity(): void {
    this.productivityLoading.set(true);
    this.productivityError.set(false);

    const range = this.selectedRange();
    let apiPath: string;

    if (range === 'today') {
      apiPath = '/dashboard/productivity/today/';
    } else if (range === 'yesterday') {
      const yesterday = new Date();
      yesterday.setDate(yesterday.getDate() - 1);
      apiPath = `/dashboard/productivity/${this.formatDate(yesterday)}/`;
    } else if (range === '7d' || range === '30d') {
      const days = range === '7d' ? 7 : 30;
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - (days - 1));
      apiPath = `/dashboard/productivity/range/?start=${this.formatDate(start)}&end=${this.formatDate(end)}`;
    } else if (range === 'custom' && this.customDate()) {
      apiPath = `/dashboard/productivity/${this.customDate()}/`;
    } else {
      apiPath = '/dashboard/productivity/today/';
    }

    // Single-day requests vs range requests
    if (range === '7d' || range === '30d') {
      this.apiService.get<any[]>(apiPath).subscribe({
        next: (res) => {
          this.handleRangeResponse(res);
          this.productivityLoading.set(false);
        },
        error: () => {
          this.productivityError.set(true);
          this.productivityLoading.set(false);
        }
      });
    } else {
      this.apiService.get<ProductivityData>(apiPath).subscribe({
        next: (res) => {
          this.handleSingleDayResponse(res);
          this.productivityLoading.set(false);
        },
        error: () => {
          this.productivityError.set(true);
          this.productivityLoading.set(false);
        }
      });
    }
  }

  onRangeChange(value: string): void {
    this.selectedRange.set(value);
    if (value !== 'custom') {
      this.loadProductivity();
    }
  }

  onCustomDateChange(value: string): void {
    this.customDate.set(value);
    if (value) {
      this.loadProductivity();
    }
  }

  getTotalActions(): number {
    return this.productivityData()?.total_actions ?? 0;
  }

  // ── Private Helpers ─────────────────────────────

  private handleSingleDayResponse(res: ProductivityData): void {
    this.productivityData.set(res);
    this.productivityUpdatedAt.set(res.updated_at);
    this.productivityMetrics.set(this.buildMetrics(res));
  }

  private handleRangeResponse(days: any[]): void {
    // Aggregate range data into a single summary
    const aggregated: ProductivityData = {
      id: '',
      date: '',
      companies_worked: 0,
      contacts_worked: 0,
      deals_worked: 0,
      tasks_worked: 0,
      activities_logged: 0,
      notes_added: 0,
      calls_completed: 0,
      emails_imported: 0,
      extra_metrics: {},
      total_actions: 0,
      created_at: '',
      updated_at: new Date().toISOString(),
    };

    for (const day of days) {
      aggregated.companies_worked += day.companies_worked || 0;
      aggregated.contacts_worked += day.contacts_worked || 0;
      aggregated.deals_worked += day.deals_worked || 0;
      aggregated.tasks_worked += day.tasks_worked || 0;
      aggregated.activities_logged += day.activities_logged || 0;
      aggregated.notes_added += day.notes_added || 0;
      aggregated.calls_completed += day.calls_completed || 0;
      aggregated.emails_imported += day.emails_imported || 0;
      aggregated.total_actions += day.total_actions || 0;
    }

    this.productivityData.set(aggregated);
    this.productivityUpdatedAt.set(aggregated.updated_at);
    this.productivityMetrics.set(this.buildMetrics(aggregated));
  }

  private buildMetrics(data: ProductivityData): ProductivityMetric[] {
    return [
      { key: 'companies_worked', label: 'Companies Worked', icon: 'business', color: 'blue', value: data.companies_worked },
      { key: 'contacts_worked', label: 'Contacts Worked', icon: 'person', color: 'cyan', value: data.contacts_worked },
      { key: 'deals_worked', label: 'Deals Worked', icon: 'handshake', color: 'indigo', value: data.deals_worked },
      { key: 'tasks_worked', label: 'Tasks Worked', icon: 'task_alt', color: 'purple', value: data.tasks_worked },
      { key: 'activities_logged', label: 'Activities Logged', icon: 'timeline', color: 'teal', value: data.activities_logged },
      { key: 'notes_added', label: 'Notes Added', icon: 'edit_note', color: 'amber', value: data.notes_added },
      { key: 'calls_completed', label: 'Calls Completed', icon: 'call', color: 'emerald', value: data.calls_completed },
      { key: 'emails_imported', label: 'Emails Imported', icon: 'mail', color: 'rose', value: data.emails_imported },
    ];
  }

  private formatDate(date: Date): string {
    return date.toISOString().split('T')[0];
  }
}
