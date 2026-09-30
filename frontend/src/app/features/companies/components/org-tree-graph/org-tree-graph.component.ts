import { Component, Input, Output, EventEmitter, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { RouterModule } from '@angular/router';
import { OrgChartData, OrgNode } from '../../services/research-parser.util';
import { CompanyService } from '../../services/company.service';
import { NotificationService } from '../../../../core/services/notification.service';

@Component({
  selector: 'app-org-tree-graph',
  standalone: true,
  imports: [
    CommonModule,
    MatIconModule,
    MatButtonModule,
    MatTooltipModule,
    MatProgressSpinnerModule,
    RouterModule
  ],
  template: `
    <div class="org-tree-container">
      <div class="org-tree-header">
        <div class="header-left">
          <mat-icon class="tree-icon">account_tree</mat-icon>
          <h3>Account Org Hierarchy</h3>
          <span class="node-count-badge">{{ totalNodes() }} Members</span>
        </div>
        <div class="legend">
          <span class="legend-item"><span class="dot gold"></span> Commercial Lead</span>
          <span class="legend-item"><span class="dot indigo"></span> Technical Decision Maker</span>
          <span class="legend-item"><span class="dot slate"></span> Practitioner</span>
        </div>
      </div>

      <div class="tree-canvas">
        <!-- Root Level (CEO / Founder) -->
        @if (rootNode(); as root) {
          <div class="tree-level level-root">
            <div class="node-card card-root" [ngClass]="{ 'in-crm': root.in_crm }">
              <div class="card-avatar avatar-gold">
                <mat-icon>stars</mat-icon>
              </div>
              <div class="card-details">
                <div class="name-row">
                  <span class="person-name">{{ root.name }}</span>
                  <a *ngIf="root.linkedin_url" [href]="root.linkedin_url" target="_blank" rel="noopener noreferrer" class="linkedin-btn" matTooltip="Open LinkedIn Profile">
                    <svg class="linkedin-svg" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
                    </svg>
                  </a>
                </div>
                <div class="person-title">{{ root.title || 'Founder & CEO' }}</div>
                <div class="badge-row">
                  <span class="classification-badge badge-primary">{{ root.classification || 'Primary Business Contact' }}</span>
                </div>
              </div>
              <div class="card-actions">
                @if (root.in_crm) {
                  <span class="crm-status-pill in-crm" matTooltip="Already registered as CRM Contact">
                    <mat-icon>check_circle</mat-icon> In CRM
                  </span>
                } @else {
                  <button mat-stroked-button class="add-crm-btn" (click)="promoteToContact(root)" [disabled]="isPromoting(root.id)">
                    @if (isPromoting(root.id)) {
                      <mat-spinner diameter="14"></mat-spinner>
                    } @else {
                      <mat-icon>person_add</mat-icon>
                    }
                    <span>+ CRM Contact</span>
                  </button>
                }
              </div>
            </div>

            <!-- Vertical Connector Line from Root -->
            <div class="connector-vertical" *ngIf="childNodes().length > 0"></div>
          </div>
        }

        <!-- Level 2 (Technical Leads / Department Managers) -->
        @if (childNodes().length > 0) {
          <div class="tree-level-wrapper">
            <div class="horizontal-branch-line" *ngIf="childNodes().length > 1"></div>
            <div class="tree-level level-children">
              @for (child of childNodes(); track child.id) {
                <div class="tree-branch">
                  <div class="connector-branch-top"></div>
                  
                  <div class="node-card" [ngClass]="getCardClass(child)" [class.in-crm]="child.in_crm">
                    <div class="card-avatar" [ngClass]="getAvatarClass(child)">
                      <mat-icon>{{ getIcon(child) }}</mat-icon>
                    </div>
                    <div class="card-details">
                      <div class="name-row">
                        <span class="person-name">{{ child.name }}</span>
                        <a *ngIf="child.linkedin_url" [href]="child.linkedin_url" target="_blank" rel="noopener noreferrer" class="linkedin-btn" matTooltip="Open LinkedIn Profile">
                          <svg class="linkedin-svg" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M19 3a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h14m-.5 15.5v-5.3a3.26 3.26 0 0 0-3.26-3.26c-.85 0-1.84.52-2.28 1.3v-1.11h-2.79v8.37h2.79v-4.93c0-.77.62-1.4 1.39-1.4a1.4 1.4 0 0 1 1.4 1.4v4.93h2.75M6.88 8.56a1.68 1.68 0 0 0 1.68-1.68c0-.93-.75-1.69-1.68-1.69a1.69 1.69 0 0 0-1.69 1.69c0 .93.76 1.68 1.69 1.68m1.39 9.94v-8.37H5.5v8.37h2.77z"/>
                          </svg>
                        </a>
                      </div>
                      <div class="person-title">{{ child.title || 'Security Practitioner' }}</div>
                      <div class="badge-row">
                        <span class="classification-badge" [ngClass]="getBadgeClass(child)">
                          {{ child.classification || 'Practitioner' }}
                        </span>
                      </div>
                    </div>
                    <div class="card-actions">
                      @if (child.in_crm) {
                        <span class="crm-status-pill in-crm" matTooltip="Already registered as CRM Contact">
                          <mat-icon>check_circle</mat-icon> In CRM
                        </span>
                      } @else {
                        <button mat-stroked-button class="add-crm-btn" (click)="promoteToContact(child)" [disabled]="isPromoting(child.id)">
                          @if (isPromoting(child.id)) {
                            <mat-spinner diameter="14"></mat-spinner>
                          } @else {
                            <mat-icon>person_add</mat-icon>
                          }
                          <span>+ CRM Contact</span>
                        </button>
                      }
                    </div>
                  </div>
                </div>
              }
            </div>
          </div>
        }

        <!-- Empty State -->
        @if (!rootNode() && childNodes().length === 0) {
          <div class="empty-tree-state">
            <mat-icon>schema</mat-icon>
            <p>No organizational structure data found in this research dossier.</p>
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .org-tree-container {
      background: #0f172a;
      border: 1px solid #1e293b;
      border-radius: 12px;
      padding: 1.5rem;
      margin-bottom: 1.5rem;
    }

    .org-tree-header {
      display: flex;
      justify-content: space-between;
      align-items: center;
      border-bottom: 1px solid #1e293b;
      padding-bottom: 1rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
      gap: 1rem;
    }

    .header-left {
      display: flex;
      align-items: center;
      gap: 0.75rem;

      .tree-icon {
        color: #38bdf8;
      }

      h3 {
        margin: 0;
        font-size: 1.15rem;
        font-weight: 600;
        color: #f1f5f9;
      }

      .node-count-badge {
        background: #1e293b;
        color: #94a3b8;
        font-size: 0.75rem;
        padding: 0.2rem 0.6rem;
        border-radius: 999px;
        border: 1px solid #334155;
      }
    }

    .legend {
      display: flex;
      align-items: center;
      gap: 1rem;
      font-size: 0.8rem;
      color: #94a3b8;

      .legend-item {
        display: flex;
        align-items: center;
        gap: 0.4rem;

        .dot {
          width: 8px;
          height: 8px;
          border-radius: 50%;

          &.gold { background: #f59e0b; }
          &.indigo { background: #6366f1; }
          &.slate { background: #64748b; }
        }
      }
    }

    .tree-canvas {
      display: flex;
      flex-direction: column;
      align-items: center;
      overflow-x: auto;
      padding: 1rem 0;
    }

    .tree-level {
      display: flex;
      justify-content: center;
      align-items: center;
      position: relative;
    }

    .tree-level-wrapper {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: center;
      width: 100%;
    }

    .horizontal-branch-line {
      height: 2px;
      background: #334155;
      width: 80%;
      margin: 0 auto;
    }

    .level-children {
      display: flex;
      gap: 1.25rem;
      flex-wrap: wrap;
      justify-content: center;
      padding-top: 1rem;
    }

    .tree-branch {
      display: flex;
      flex-direction: column;
      align-items: center;
      position: relative;
    }

    .connector-vertical {
      width: 2px;
      height: 24px;
      background: #334155;
      margin: 0 auto;
    }

    .connector-branch-top {
      width: 2px;
      height: 16px;
      background: #334155;
      margin-bottom: 0.25rem;
    }

    /* Node Cards */
    .node-card {
      background: #1e293b;
      border: 1px solid #334155;
      border-radius: 10px;
      padding: 0.85rem 1rem;
      width: 260px;
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      transition: all 0.2s ease;
      position: relative;

      &:hover {
        transform: translateY(-2px);
        box-shadow: 0 8px 20px rgba(0, 0, 0, 0.4);
      }

      &.card-root {
        border: 1px solid #f59e0b;
        background: linear-gradient(145deg, #1e293b 0%, #172554 100%);
        width: 300px;
      }

      &.card-technical {
        border-color: #6366f1;
      }

      &.in-crm {
        border-right: 3px solid #10b981;
      }
    }

    .card-avatar {
      width: 32px;
      height: 32px;
      border-radius: 8px;
      display: flex;
      align-items: center;
      justify-content: center;
      position: absolute;
      top: 0.75rem;
      right: 0.75rem;

      &.avatar-gold {
        background: rgba(245, 158, 11, 0.15);
        color: #f59e0b;
      }

      &.avatar-indigo {
        background: rgba(99, 102, 241, 0.15);
        color: #818cf8;
      }

      &.avatar-slate {
        background: rgba(148, 163, 184, 0.1);
        color: #94a3b8;
      }

      mat-icon {
        font-size: 18px;
        width: 18px;
        height: 18px;
      }
    }

    .card-details {
      padding-right: 2.5rem;
      display: flex;
      flex-direction: column;
      gap: 0.2rem;
    }

    .name-row {
      display: flex;
      align-items: center;
      gap: 0.4rem;

      .person-name {
        font-size: 0.95rem;
        font-weight: 600;
        color: #f8fafc;
        white-space: nowrap;
        overflow: hidden;
        text-overflow: ellipsis;
      }

      .linkedin-btn {
        display: inline-flex;
        align-items: center;
        color: #0ea5e9;
        transition: color 0.15s;

        &:hover {
          color: #38bdf8;
        }

        .linkedin-svg {
          width: 15px;
          height: 15px;
        }
      }
    }

    .person-title {
      font-size: 0.8rem;
      color: #94a3b8;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .badge-row {
      margin-top: 0.25rem;
    }

    .classification-badge {
      display: inline-block;
      font-size: 0.68rem;
      font-weight: 500;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      background: #0f172a;
      border: 1px solid #334155;
      color: #94a3b8;

      &.badge-primary {
        background: rgba(245, 158, 11, 0.15);
        color: #fbbf24;
        border-color: rgba(245, 158, 11, 0.3);
      }

      &.badge-technical {
        background: rgba(99, 102, 241, 0.15);
        color: #a5b4fc;
        border-color: rgba(99, 102, 241, 0.3);
      }

      &.badge-practitioner {
        background: rgba(16, 185, 129, 0.1);
        color: #6ee7b7;
        border-color: rgba(16, 185, 129, 0.25);
      }
    }

    .card-actions {
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      padding-top: 0.4rem;
      display: flex;
      justify-content: flex-end;
      align-items: center;
    }

    .crm-status-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.72rem;
      color: #10b981;
      font-weight: 500;

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
      }
    }

    .add-crm-btn {
      font-size: 0.72rem;
      height: 26px;
      line-height: 24px;
      padding: 0 0.5rem;
      color: #38bdf8;
      border-color: rgba(56, 189, 248, 0.3);

      &:hover {
        background: rgba(56, 189, 248, 0.1);
      }

      mat-icon {
        font-size: 14px;
        width: 14px;
        height: 14px;
        margin-right: 0.25rem;
      }
    }

    .empty-tree-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 2rem;
      color: #64748b;
      gap: 0.5rem;

      mat-icon {
        font-size: 32px;
        width: 32px;
        height: 32px;
      }
    }

    /* Light Theme Styles */
    :host-context(body.light-theme) .org-tree-container {
      background: #ffffff;
      border-color: #e2e8f0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.04);
    }

    :host-context(body.light-theme) .org-tree-header {
      border-bottom-color: #e2e8f0;

      .header-left {
        .tree-icon {
          color: #0284c7;
        }

        h3 {
          color: #0f172a;
        }

        .node-count-badge {
          background: #f1f5f9;
          color: #475569;
          border-color: #e2e8f0;
        }
      }

      .legend {
        color: #64748b;
        font-weight: 500;
      }
    }

    :host-context(body.light-theme) .horizontal-branch-line,
    :host-context(body.light-theme) .connector-vertical,
    :host-context(body.light-theme) .connector-branch-top {
      background: #cbd5e1;
    }

    :host-context(body.light-theme) .node-card {
      background: #ffffff;
      border: 1px solid #e2e8f0;
      box-shadow: 0 1px 3px rgba(0, 0, 0, 0.06), 0 1px 2px rgba(0, 0, 0, 0.03);

      &:hover {
        border-color: #cbd5e1;
        box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
      }

      &.card-root {
        border: 1.5px solid #f59e0b;
        background: linear-gradient(145deg, #ffffff 0%, #fffbeb 100%);
        box-shadow: 0 4px 14px rgba(245, 158, 11, 0.12);
      }

      &.card-technical {
        border: 1px solid #818cf8;
        background: linear-gradient(145deg, #ffffff 0%, #f5f3ff 100%);
      }

      &.in-crm {
        border-right: 3px solid #10b981;
      }
    }

    :host-context(body.light-theme) .person-name {
      color: #0f172a;
    }

    :host-context(body.light-theme) .person-title {
      color: #64748b;
      font-weight: 500;
    }

    :host-context(body.light-theme) .linkedin-btn {
      color: #0284c7;

      &:hover {
        color: #0369a1;
      }
    }

    :host-context(body.light-theme) .card-avatar {
      &.avatar-gold {
        background: #fef3c7;
        color: #d97706;
      }

      &.avatar-indigo {
        background: #e0e7ff;
        color: #4f46e5;
      }

      &.avatar-slate {
        background: #f1f5f9;
        color: #64748b;
      }
    }

    :host-context(body.light-theme) .card-actions {
      border-top-color: #f1f5f9;
    }

    :host-context(body.light-theme) .crm-status-pill {
      color: #059669;
      font-weight: 600;
    }

    :host-context(body.light-theme) .classification-badge {
      background: #f1f5f9;
      border-color: #e2e8f0;
      color: #475569;

      &.badge-primary {
        background: #fef3c7;
        color: #92400e;
        border-color: #fde68a;
      }

      &.badge-technical {
        background: #e0e7ff;
        color: #3730a3;
        border-color: #c7d2fe;
      }

      &.badge-practitioner {
        background: #ecfdf5;
        color: #065f46;
        border-color: #a7f3d0;
      }
    }

    :host-context(body.light-theme) .add-crm-btn {
      color: #0284c7;
      border-color: #bae6fd;
      background: #f0f9ff;

      &:hover {
        background: #e0f2fe;
        border-color: #0284c7;
      }
    }

    :host-context(body.light-theme) .empty-tree-state {
      color: #64748b;
    }
  `]
})
export class OrgTreeGraphComponent {
  private readonly companyService = inject(CompanyService);
  private readonly notification = inject(NotificationService);

  @Input() companyId = '';
  @Input() set orgData(data: any) {
    if (data && data.nodes) {
      this._nodes.set(data.nodes);
    } else {
      this._nodes.set([]);
    }
  }

  @Output() contactAdded = new EventEmitter<void>();

  private readonly _nodes = signal<OrgNode[]>([]);
  readonly promotingIds = signal<Set<string>>(new Set());

  totalNodes = () => this._nodes().length;

  rootNode(): OrgNode | null {
    const nodes = this._nodes();
    if (nodes.length === 0) return null;
    return nodes.find(n => n.reports_to === null || n.classification_type === 'primary') || nodes[0];
  }

  childNodes(): OrgNode[] {
    const root = this.rootNode();
    if (!root) return [];
    return this._nodes().filter(n => n.id !== root.id);
  }

  isPromoting(nodeId: string): boolean {
    return this.promotingIds().has(nodeId);
  }

  promoteToContact(node: OrgNode): void {
    if (!this.companyId) {
      this.notification.info('Please save the company before adding individual contacts.');
      return;
    }

    this.promotingIds.update(set => new Set(set).add(node.id));

    this.companyService.importSingleContact(this.companyId, {
      name: node.name,
      role: node.title,
      linkedin_url: node.linkedin_url
    }).subscribe({
      next: (res) => {
        node.in_crm = true;
        node.crm_contact_id = res.contact_id;
        this.notification.success(`Added ${node.name} to CRM Contacts`);
        this.contactAdded.emit();
      },
      error: (err) => {
        this.notification.error(err.error?.error || 'Failed to add contact');
      },
      complete: () => {
        this.promotingIds.update(set => {
          const next = new Set(set);
          next.delete(node.id);
          return next;
        });
      }
    });
  }

  getCardClass(node: OrgNode): string {
    if (node.classification_type === 'technical') return 'card-technical';
    return '';
  }

  getAvatarClass(node: OrgNode): string {
    if (node.classification_type === 'technical') return 'avatar-indigo';
    return 'avatar-slate';
  }

  getBadgeClass(node: OrgNode): string {
    if (node.classification_type === 'technical') return 'badge-technical';
    return 'badge-practitioner';
  }

  getIcon(node: OrgNode): string {
    if (node.classification_type === 'technical') return 'security';
    return 'person';
  }
}
