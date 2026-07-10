import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
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

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, MatProgressSpinnerModule],
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
  `]
})
export class DashboardComponent implements OnInit {
  private readonly apiService = inject(ApiService);
  private readonly notification = inject(NotificationService);

  readonly loading = signal(true);
  readonly data = signal<DashboardData | null>(null);

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
  }

  getStageBarWidth(value: number): number {
    const kpis = this.data()?.kpis;
    const max = kpis?.pipeline_value || 1;
    return Math.max(Math.min((value / max) * 100, 100), 2); // default min 2% bar
  }

  getStageBarColorClass(stage: string): string {
    return stage;
  }
}
