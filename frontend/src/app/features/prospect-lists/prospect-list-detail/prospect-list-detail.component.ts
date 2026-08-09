import { Component, OnInit, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ActivatedRoute, RouterModule } from '@angular/router';
import { FormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatTableModule } from '@angular/material/table';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatTabsModule } from '@angular/material/tabs';
import { MatTooltipModule } from '@angular/material/tooltip';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { ProspectListService } from '../services/prospect-list.service';
import { Company, Contact, ProspectList } from '../../../core/models/crm.model';
import { SequenceEnrollDialogComponent } from '../../sequences/sequence-enroll-dialog/sequence-enroll-dialog.component';

@Component({
  selector: 'app-prospect-list-detail',
  standalone: true,
  imports: [
    CommonModule,
    RouterModule,
    FormsModule,
    MatButtonModule,
    MatIconModule,
    MatTableModule,
    MatProgressSpinnerModule,
    MatTabsModule,
    MatTooltipModule,
    MatDialogModule
  ],
  template: `
    <div class="list-container">
      <div *ngIf="loadingList" class="loading-box">
        <mat-spinner diameter="40"></mat-spinner>
      </div>

      <div *ngIf="!loadingList && prospectList" class="space-y-6">
        <!-- Top Navigation & Actions -->
        <div class="top-nav">
          <a [routerLink]="['/lists']" class="back-link">
            <mat-icon>arrow_back</mat-icon>
            <span>Back to Prospect Lists</span>
          </a>

          <div class="flex items-center gap-3">
            <button mat-flat-button color="primary" (click)="openEnrollDialog()" class="enroll-btn" style="background: linear-gradient(135deg, #3b82f6 0%, #2563eb 100%); font-weight: 600;">
              <mat-icon>play_circle</mat-icon>
              <span>Enroll List in Sequence</span>
            </button>

            <button mat-stroked-button (click)="openEditModal()" class="edit-btn">
              <mat-icon>edit</mat-icon>
              <span>Edit List</span>
            </button>
          </div>
        </div>

        <!-- Header Card -->
        <div class="header-card">
          <div class="header-content">
            <div>
              <div class="header-title-row">
                <h1 class="list-title">{{ prospectList.name }}</h1>
                <span class="source-badge">{{ prospectList.source }}</span>
              </div>
              <p class="list-description">{{ prospectList.description || 'No description provided for this prospect list.' }}</p>
            </div>

            <!-- Stat Badges -->
            <div class="stats-box">
              <div class="stat-item">
                <span class="stat-num company-num">{{ prospectList.company_count }}</span>
                <span class="stat-lbl">Companies</span>
              </div>
              <div class="stat-divider"></div>
              <div class="stat-item">
                <span class="stat-num contact-num">{{ prospectList.contact_count }}</span>
                <span class="stat-lbl">Contacts</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Navigation Tabs -->
        <div class="tab-bar">
          <button
            (click)="activeTab = 'companies'"
            class="tab-btn"
            [class.active]="activeTab === 'companies'"
          >
            <mat-icon class="tab-icon">business</mat-icon>
            <span>Companies ({{ prospectList.company_count }})</span>
          </button>

          <button
            (click)="activeTab = 'contacts'"
            class="tab-btn"
            [class.active]="activeTab === 'contacts'"
          >
            <mat-icon class="tab-icon">people</mat-icon>
            <span>Contacts ({{ prospectList.contact_count }})</span>
          </button>
        </div>

        <!-- Companies Tab -->
        <div *ngIf="activeTab === 'companies'" class="tab-content">
          <div *ngIf="loadingMembers" class="py-8 text-center text-slate-400">Loading companies...</div>

          <div *ngIf="!loadingMembers && companies.length === 0" class="empty-state">
            <mat-icon class="empty-icon">business</mat-icon>
            <h3>No Companies Linked</h3>
            <p>Import a CSV or add companies to this list from the Companies table.</p>
          </div>

          <div *ngIf="!loadingMembers && companies.length > 0" class="table-wrapper">
            <table mat-table [dataSource]="companies" class="dark-table">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Company Name</th>
                <td mat-cell *matCellDef="let element" class="clickable" [routerLink]="['/companies', element.id]">
                  <div class="name-cell">
                    <span class="company-name">{{ element.name }}</span>
                    <span *ngIf="element.website" class="website">{{ element.website }}</span>
                  </div>
                </td>
              </ng-container>

              <ng-container matColumnDef="industry">
                <th mat-header-cell *matHeaderCellDef>Industry</th>
                <td mat-cell *matCellDef="let element">{{ element.industry || '—' }}</td>
              </ng-container>

              <ng-container matColumnDef="company_size">
                <th mat-header-cell *matHeaderCellDef>Size</th>
                <td mat-cell *matCellDef="let element">{{ element.company_size || '—' }}</td>
              </ng-container>

              <ng-container matColumnDef="country">
                <th mat-header-cell *matHeaderCellDef>Country</th>
                <td mat-cell *matCellDef="let element">
                  <span *ngIf="element.country" class="country-badge">
                    🌐 {{ element.country_display || element.country }}
                  </span>
                  <span *ngIf="!element.country" class="text-slate-500">—</span>
                </td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let element" class="action-cell">
                  <button mat-button color="warn" (click)="removeCompany(element)">
                    Remove
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="companyColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: companyColumns;" class="table-row"></tr>
            </table>
          </div>
        </div>

        <!-- Contacts Tab -->
        <div *ngIf="activeTab === 'contacts'" class="tab-content">
          <div *ngIf="loadingMembers" class="py-8 text-center text-slate-400">Loading contacts...</div>

          <div *ngIf="!loadingMembers && contacts.length === 0" class="empty-state">
            <mat-icon class="empty-icon">people</mat-icon>
            <h3>No Contacts Linked</h3>
            <p>Import a CSV or add contacts to this list from the Contacts table.</p>
          </div>

          <div *ngIf="!loadingMembers && contacts.length > 0" class="table-wrapper">
            <table mat-table [dataSource]="contacts" class="dark-table">
              <ng-container matColumnDef="name">
                <th mat-header-cell *matHeaderCellDef>Contact Name</th>
                <td mat-cell *matCellDef="let element" class="clickable" [routerLink]="['/contacts', element.id]">
                  <div class="name-cell">
                    <span class="contact-name">{{ element.full_name }}</span>
                    <span *ngIf="element.email" class="contact-email">{{ element.email }}</span>
                  </div>
                </td>
              </ng-container>

              <ng-container matColumnDef="job_title">
                <th mat-header-cell *matHeaderCellDef>Job Title</th>
                <td mat-cell *matCellDef="let element">{{ element.job_title || '—' }}</td>
              </ng-container>

              <ng-container matColumnDef="company_name">
                <th mat-header-cell *matHeaderCellDef>Company</th>
                <td mat-cell *matCellDef="let element">{{ element.company_name || '—' }}</td>
              </ng-container>

              <ng-container matColumnDef="country">
                <th mat-header-cell *matHeaderCellDef>Country</th>
                <td mat-cell *matCellDef="let element">
                  <span *ngIf="element.country" class="country-badge">
                    🌐 {{ element.country_display || element.country }}
                  </span>
                  <span *ngIf="!element.country" class="text-slate-500">—</span>
                </td>
              </ng-container>

              <ng-container matColumnDef="actions">
                <th mat-header-cell *matHeaderCellDef></th>
                <td mat-cell *matCellDef="let element" class="action-cell">
                  <button mat-button color="warn" (click)="removeContact(element)">
                    Remove
                  </button>
                </td>
              </ng-container>

              <tr mat-header-row *matHeaderRowDef="contactColumns"></tr>
              <tr mat-row *matRowDef="let row; columns: contactColumns;" class="table-row"></tr>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
  styles: [`
    .list-container {
      padding: 1.5rem;
      color: #e2e8f0;
      font-family: 'Inter', sans-serif;
    }

    .loading-box {
      display: flex;
      justify-content: center;
      padding: 4rem 0;
    }

    .top-nav {
      display: flex;
      align-items: center;
      justify-content: space-between;
      margin-bottom: 1.25rem;
    }

    .back-link {
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.875rem;
      font-weight: 500;
      color: #94a3b8;
      text-decoration: none;
      transition: color 0.2s;
    }

    .back-link:hover {
      color: #3b82f6;
    }

    .header-card {
      background: linear-gradient(135deg, #0b1329 0%, #1e293b 100%);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 16px;
      padding: 1.75rem;
      margin-bottom: 1.5rem;
      box-shadow: 0 10px 25px -5px rgba(0, 0, 0, 0.3);
    }

    .header-content {
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 1.5rem;
      flex-wrap: wrap;
    }

    .header-title-row {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .list-title {
      font-size: 1.75rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0;
    }

    .source-badge {
      display: inline-block;
      padding: 0.2rem 0.65rem;
      border-radius: 9999px;
      font-size: 0.75rem;
      font-weight: 600;
      background-color: rgba(99, 102, 241, 0.15);
      color: #818cf8;
      border: 1px solid rgba(99, 102, 241, 0.3);
    }

    .list-description {
      color: #94a3b8;
      font-size: 0.9rem;
      margin: 0.5rem 0 0 0;
      max-width: 650px;
    }

    .stats-box {
      display: flex;
      align-items: center;
      background: rgba(15, 23, 42, 0.6);
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 0.75rem 1.25rem;
    }

    .stat-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      padding: 0 1rem;
    }

    .stat-num {
      font-size: 1.5rem;
      font-weight: 800;
      line-height: 1.2;
    }

    .company-num { color: #818cf8; }
    .contact-num { color: #34d399; }

    .stat-lbl {
      font-size: 0.75rem;
      color: #94a3b8;
      font-weight: 500;
    }

    .stat-divider {
      width: 1px;
      height: 32px;
      background-color: rgba(255, 255, 255, 0.08);
    }

    .tab-bar {
      display: flex;
      gap: 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      margin-bottom: 1.5rem;
    }

    .tab-btn {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 0.75rem 0.25rem;
      background: transparent;
      border: none;
      border-bottom: 2px solid transparent;
      color: #94a3b8;
      font-size: 0.9rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s;
    }

    .tab-btn:hover {
      color: #f8fafc;
    }

    .tab-btn.active {
      color: #3b82f6;
      border-bottom-color: #3b82f6;
    }

    .tab-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
    }

    .table-wrapper {
      background-color: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      overflow: auto;
    }

    .dark-table {
      width: 100%;
      background: transparent;
    }

    ::ng-deep .dark-table th.mat-mdc-header-cell {
      background-color: #0b1329;
      color: #64748b;
      font-size: 0.75rem;
      font-weight: 600;
      text-transform: uppercase;
      letter-spacing: 0.05em;
      border-bottom: 1px solid rgba(255, 255, 255, 0.08);
      padding: 1rem;
    }

    ::ng-deep .dark-table td.mat-mdc-cell {
      color: #cbd5e1;
      font-size: 0.875rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.04);
      padding: 1rem;
    }

    .clickable { cursor: pointer; }

    .name-cell {
      display: flex;
      flex-direction: column;
    }

    .company-name, .contact-name {
      color: #f8fafc;
      font-weight: 600;
    }

    .company-name:hover, .contact-name:hover {
      color: #3b82f6;
    }

    .website, .contact-email {
      color: #64748b;
      font-size: 0.75rem;
    }

    .country-badge {
      display: inline-flex;
      align-items: center;
      font-size: 0.75rem;
      padding: 0.2rem 0.6rem;
      border-radius: 9999px;
      background-color: rgba(30, 41, 59, 0.8);
      color: #cbd5e1;
      border: 1px solid rgba(255, 255, 255, 0.08);
    }

    .action-cell {
      text-align: right;
    }

    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 1.5rem;
      color: #64748b;
      background-color: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 12px;
      text-align: center;
    }

    .empty-icon {
      font-size: 48px;
      width: 48px;
      height: 48px;
      margin-bottom: 1rem;
    }

    .empty-state h3 {
      color: #e2e8f0;
      margin: 0 0 0.5rem 0;
      font-size: 1.1rem;
    }

    /* Light Theme Overrides */
    :host-context(body.light-theme) .list-container { color: #1e293b; }
    :host-context(body.light-theme) .header-card { background: linear-gradient(135deg, #ffffff 0%, #f1f5f9 100%); border-color: #e2e8f0; }
    :host-context(body.light-theme) .list-title { color: #0f172a; }
    :host-context(body.light-theme) .list-description { color: #64748b; }
    :host-context(body.light-theme) .stats-box { background: #ffffff; border-color: #e2e8f0; }
    :host-context(body.light-theme) .stat-lbl { color: #64748b; }
    :host-context(body.light-theme) .tab-bar { border-bottom-color: #e2e8f0; }
    :host-context(body.light-theme) .table-wrapper { background-color: #ffffff; border-color: #e2e8f0; }
    :host-context(body.light-theme) ::ng-deep .dark-table th.mat-mdc-header-cell { background-color: #f8fafc; color: #64748b; border-bottom-color: #e2e8f0; }
    :host-context(body.light-theme) ::ng-deep .dark-table td.mat-mdc-cell { color: #1e293b; border-bottom-color: #f1f5f9; }
    :host-context(body.light-theme) .company-name, :host-context(body.light-theme) .contact-name { color: #0f172a; }
    :host-context(body.light-theme) .empty-state { background-color: #ffffff; border-color: #e2e8f0; }
  `]
})
export class ProspectListDetailComponent implements OnInit {
  private readonly route = inject(ActivatedRoute);
  private readonly prospectListService = inject(ProspectListService);
  private readonly dialog = inject(MatDialog);

  listId!: string;
  prospectList: ProspectList | null = null;
  loadingList = true;

  activeTab: 'companies' | 'contacts' = 'companies';
  companyColumns: string[] = ['name', 'industry', 'company_size', 'country', 'actions'];
  contactColumns: string[] = ['name', 'job_title', 'company_name', 'country', 'actions'];

  companies: Company[] = [];
  contacts: Contact[] = [];
  loadingMembers = false;

  ngOnInit(): void {
    this.listId = this.route.snapshot.paramMap.get('id') || '';
    if (this.listId) {
      this.loadListDetail();
    }
  }

  loadListDetail(): void {
    this.loadingList = true;
    this.prospectListService.getProspectList(this.listId).subscribe({
      next: (res: any) => {
        this.prospectList = res;
        this.loadingList = false;
        this.loadMembers();
      },
      error: (err: any) => {
        console.error('Failed to load list details', err);
        this.loadingList = false;
      }
    });
  }

  loadMembers(): void {
    this.loadingMembers = true;
    this.prospectListService.getProspectListCompanies(this.listId, { page_size: 100 }).subscribe({
      next: (res: any) => (this.companies = res.results || [])
    });

    this.prospectListService.getProspectListContacts(this.listId, { page_size: 100 }).subscribe({
      next: (res: any) => {
        this.contacts = res.results || [];
        this.loadingMembers = false;
      }
    });
  }

  removeCompany(company: Company): void {
    if (confirm(`Remove '${company.name}' from this list?`)) {
      this.prospectListService.removeCompanyFromList(this.listId, company.id).subscribe({
        next: () => this.loadListDetail()
      });
    }
  }

  removeContact(contact: Contact): void {
    if (confirm(`Remove '${contact.full_name}' from this list?`)) {
      this.prospectListService.removeContactFromList(this.listId, contact.id).subscribe({
        next: () => this.loadListDetail()
      });
    }
  }

  openEnrollDialog(): void {
    if (!this.prospectList) return;
    this.dialog.open(SequenceEnrollDialogComponent, {
      width: '480px',
      data: {
        listId: this.prospectList.id,
        listName: this.prospectList.name
      }
    });
  }

  openEditModal(): void {
    const newName = prompt('Enter new list name:', this.prospectList?.name);
    if (newName && newName.trim() && newName !== this.prospectList?.name) {
      this.prospectListService.updateProspectList(this.listId, { name: newName.trim() }).subscribe({
        next: () => this.loadListDetail()
      });
    }
  }
}
