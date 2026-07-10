import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { ApiService } from '../../core/services/api.service';

interface PipelineReport {
  stages: Array<{
    stage: string;
    label: string;
    count: number;
    total_revenue: number;
    avg_probability: number;
  }>;
}

interface RevenueReport {
  total_pipeline: number;
  weighted_pipeline: number;
  won_revenue: number;
  closing_in_30_days: {
    count: number;
    total: number;
  };
}

interface PerformanceReport {
  reps: Array<{
    id: string;
    name: string;
    total_deals: number;
    won_deals: number;
    conversion_rate: number;
    total_revenue: number;
  }>;
}

interface TaskReport {
  total_created_30d: number;
  completed_30d: number;
  completion_rate: number;
  overdue: number;
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatProgressSpinnerModule],
  template: `
    <div class="reports-container">
      <div class="list-header">
        <div>
          <h1>Performance Reports</h1>
          <p class="subtitle">CRM metrics, pipeline forecasts, and performance analytics</p>
        </div>
      </div>

      @if (loading()) {
        <div class="loading-state">
          <mat-spinner diameter="48"></mat-spinner>
          <p>Compiling analytics reports...</p>
        </div>
      } @else {
        <!-- Financial Forecast Summary Grid -->
        <div class="forecast-grid" *ngIf="revenue()">
          <div class="report-card kpi">
            <span class="card-label">Weighted Pipeline Value</span>
            <span class="card-value font-green">\${{ revenue()?.weighted_pipeline | number:'1.0-0' }}</span>
            <span class="card-desc">Weighted value based on close probabilities</span>
          </div>

          <div class="report-card kpi">
            <span class="card-label">Total Closed Revenue (Won)</span>
            <span class="card-value font-blue">\${{ revenue()?.won_revenue | number:'1.0-0' }}</span>
            <span class="card-desc">Revenue from CLOSED_WON opportunities</span>
          </div>

          <div class="report-card kpi">
            <span class="card-label">Closing in 30 Days</span>
            <span class="card-value font-orange">\${{ revenue()?.closing_in_30_days?.total | number:'1.0-0' }}</span>
            <span class="card-desc">{{ revenue()?.closing_in_30_days?.count }} deals nearing expected close</span>
          </div>
        </div>

        <div class="reports-layouts">
          <!-- Left Column -->
          <div class="column-left">
            <!-- Pipeline Stage Distribution -->
            <div class="card report-section-card" *ngIf="pipeline()">
              <div class="card-header">
                <mat-icon>bar_chart</mat-icon>
                <h3>Pipeline Stage Breakdown</h3>
              </div>
              <div class="card-body">
                <div class="stages-breakdown-list">
                  @for (stage of pipeline()?.stages; track stage.stage) {
                    <div class="breakdown-row">
                      <div class="row-details">
                        <span class="stage-name">{{ stage.label }}</span>
                        <span class="stage-stats">
                          {{ stage.count }} deals (Avg. {{ stage.avg_probability | number:'1.0-0' }}% Prob)
                        </span>
                      </div>
                      <div class="value-block">
                        \${{ stage.total_revenue | number:'1.0-0' }}
                      </div>
                    </div>
                  }
                </div>
              </div>
            </div>

            <!-- Task Performance -->
            <div class="card report-section-card" *ngIf="tasks()">
              <div class="card-header">
                <mat-icon>task_alt</mat-icon>
                <h3>Activity & Tasks Analytics</h3>
              </div>
              <div class="card-body">
                <div class="tasks-analytics-grid">
                  <div class="analytic-item">
                    <span class="analytic-val">{{ tasks()?.total_created_30d }}</span>
                    <span class="analytic-lbl">Created (30d)</span>
                  </div>
                  <div class="analytic-item">
                    <span class="analytic-val">{{ tasks()?.completed_30d }}</span>
                    <span class="analytic-lbl">Completed (30d)</span>
                  </div>
                  <div class="analytic-item">
                    <span class="analytic-val color-green">{{ tasks()?.completion_rate }}%</span>
                    <span class="analytic-lbl">Completion Rate</span>
                  </div>
                  <div class="analytic-item">
                    <span class="analytic-val color-red">{{ tasks()?.overdue }}</span>
                    <span class="analytic-lbl">Overdue Tasks</span>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <!-- Right Column -->
          <div class="column-right">
            <!-- Rep Leaderboard -->
            <div class="card report-section-card" *ngIf="performance()">
              <div class="card-header">
                <mat-icon>leaderboard</mat-icon>
                <h3>Sales Rep Leaderboard</h3>
              </div>
              <div class="card-body">
                <div class="reps-leaderboard">
                  @for (rep of performance()?.reps; track rep.id) {
                    <div class="rep-row">
                      <div class="rep-info">
                        <div class="rep-name">{{ rep.name }}</div>
                        <div class="rep-meta">
                          Deals: {{ rep.won_deals }} Won / {{ rep.total_deals }} Total ({{ rep.conversion_rate }}% CR)
                        </div>
                      </div>
                      <div class="rep-revenue">
                        \${{ rep.total_revenue | number:'1.0-0' }}
                      </div>
                    </div>
                  }
                  @if (performance()?.reps?.length === 0) {
                    <div class="empty-feed">
                      <mat-icon>leaderboard</mat-icon>
                      <p>No active deals recorded for sales reps.</p>
                    </div>
                  }
                </div>
              </div>
            </div>
          </div>
        </div>
      }
    </div>
  `,
  styles: [`
    .reports-container {
      font-family: 'Inter', sans-serif;
      color: #cbd5e1;
    }

    .list-header {
      margin-bottom: 2rem;
    }

    h1 {
      font-size: 1.75rem;
      font-weight: 700;
      margin: 0 0 0.25rem 0;
      color: #f8fafc;
      letter-spacing: -0.025em;
    }

    .subtitle {
      color: #64748b;
      margin: 0;
      font-size: 0.9rem;
    }

    .loading-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      height: 60vh;
      color: #64748b;
      gap: 1rem;
    }

    .forecast-grid {
      display: grid;
      grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
      gap: 1.25rem;
      margin-bottom: 2rem;
    }

    .report-card.kpi {
      background-color: #0f172a;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      padding: 1.5rem;
      display: flex;
      flex-direction: column;
    }

    .card-label {
      font-size: 0.75rem;
      color: #64748b;
      text-transform: uppercase;
      font-weight: 700;
      letter-spacing: 0.05em;
    }

    .card-value {
      font-size: 1.75rem;
      font-weight: 800;
      margin: 0.5rem 0;
    }

    .card-value.font-green { color: #34d399; }
    .card-value.font-blue { color: #60a5fa; }
    .card-value.font-orange { color: #fbbf24; }

    .card-desc {
      font-size: 0.8rem;
      color: #475569;
    }

    /* Column layouts */
    .reports-layouts {
      display: grid;
      grid-template-columns: 1fr 340px;
      gap: 1.5rem;
      align-items: start;
    }

    .column-left, .column-right {
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
      color: #f8fafc;
    }

    .card-header mat-icon {
      color: #3b82f6;
      margin-right: 0.5rem;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .card-header h3 {
      font-size: 0.85rem;
      font-weight: 700;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      margin: 0;
    }

    .card-body {
      padding: 1.25rem;
    }

    /* Stage Breakdown List */
    .stages-breakdown-list {
      display: flex;
      flex-direction: column;
      gap: 0.85rem;
    }

    .breakdown-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.6rem 0.75rem;
      background-color: rgba(255, 255, 255, 0.01);
      border: 1px solid rgba(255, 255, 255, 0.03);
      border-radius: 6px;
    }

    .row-details {
      display: flex;
      flex-direction: column;
    }

    .stage-name {
      font-weight: 600;
      font-size: 0.85rem;
      color: #f8fafc;
    }

    .stage-stats {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .value-block {
      font-weight: 700;
      font-size: 0.95rem;
      color: #cbd5e1;
    }

    /* Leaderboard list */
    .reps-leaderboard {
      display: flex;
      flex-direction: column;
      gap: 0.75rem;
    }

    .rep-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 0.75rem;
      background-color: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
    }

    .rep-info {
      display: flex;
      flex-direction: column;
    }

    .rep-name {
      font-weight: 600;
      font-size: 0.85rem;
      color: #f8fafc;
    }

    .rep-meta {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.1rem;
    }

    .rep-revenue {
      font-weight: 700;
      font-size: 0.95rem;
      color: #34d399;
    }

    /* Task Analytics Grid */
    .tasks-analytics-grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 1rem;
    }

    .analytic-item {
      background: rgba(255, 255, 255, 0.015);
      border: 1px solid rgba(255, 255, 255, 0.04);
      border-radius: 8px;
      padding: 1rem;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
    }

    .analytic-val {
      font-size: 1.5rem;
      font-weight: 800;
      color: #f8fafc;
    }

    .analytic-val.color-green { color: #34d399; }
    .analytic-val.color-red { color: #f87171; }

    .analytic-lbl {
      font-size: 0.75rem;
      color: #64748b;
      margin-top: 0.25rem;
      font-weight: 600;
    }

    .empty-feed {
      display: flex;
      flex-direction: column;
      align-items: center;
      text-align: center;
      padding: 2rem 1rem;
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
export class ReportsComponent implements OnInit {
  private readonly apiService = inject(ApiService);

  readonly loading = signal(true);
  readonly pipeline = signal<PipelineReport | null>(null);
  readonly revenue = signal<RevenueReport | null>(null);
  readonly performance = signal<PerformanceReport | null>(null);
  readonly tasks = signal<TaskReport | null>(null);

  ngOnInit(): void {
    // Parallel loading of report items
    this.apiService.get<PipelineReport>('/reports/pipeline/').subscribe((res) => this.pipeline.set(res));
    this.apiService.get<RevenueReport>('/reports/revenue/').subscribe((res) => this.revenue.set(res));
    this.apiService.get<PerformanceReport>('/reports/performance/').subscribe((res) => this.performance.set(res));
    this.apiService.get<TaskReport>('/reports/tasks/').subscribe((res) => {
      this.tasks.set(res);
      this.loading.set(false);
    });
  }
}
