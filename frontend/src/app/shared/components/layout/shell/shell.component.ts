import { Component, HostListener, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterOutlet } from '@angular/router';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { HeaderComponent } from '../header/header.component';
import { SearchDialogComponent } from '../../search-dialog/search-dialog.component';
import { PhoneWidgetComponent } from '../../../../features/telephony/phone-widget.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [CommonModule, RouterOutlet, SidebarComponent, HeaderComponent, MatDialogModule, PhoneWidgetComponent],
  template: `
    <div class="shell-container">
      <app-sidebar class="shell-sidebar"></app-sidebar>
      <div class="shell-main">
        <app-header
          (searchTriggered)="openSearch()"
          (createAction)="handleCreate($event)"
        ></app-header>
        <main class="shell-content">
          <router-outlet></router-outlet>
        </main>
      </div>
      <app-phone-widget></app-phone-widget>
    </div>
  `,
  styles: [`
    .shell-container {
      display: flex;
      height: 100vh;
      width: 100vw;
      overflow: hidden;
      background-color: #090f1f;
    }

    .shell-sidebar {
      width: 260px;
      flex-shrink: 0;
      height: 100%;
    }

    .shell-main {
      display: flex;
      flex-direction: column;
      flex: 1;
      height: 100%;
      overflow: hidden;
    }

    .shell-content {
      flex: 1;
      overflow-y: auto;
      padding: 1.5rem;
      background-color: #090f1f;
    }
  `]
})
export class ShellComponent {
  private readonly dialog = inject(MatDialog);

  @HostListener('window:keydown', ['$event'])
  handleKeyDown(event: KeyboardEvent): void {
    // Detect Cmd+K or Ctrl+K
    if ((event.metaKey || event.ctrlKey) && event.key === 'k') {
      event.preventDefault();
      this.openSearch();
    }
  }

  openSearch(): void {
    this.dialog.open(SearchDialogComponent, {
      width: '600px',
      maxHeight: '85vh',
      panelClass: 'search-dialog-panel',
      position: { top: '80px' }
    });
  }

  handleCreate(type: 'company' | 'contact' | 'deal' | 'task'): void {
    // We will open appropriate dialog based on type
    console.log(`Opening create dialog for ${type}`);
    if (type === 'company') {
      import('../../../../features/companies/company-form/company-form.component').then((m) => {
        this.dialog.open(m.CompanyFormComponent, {
          width: '560px',
          panelClass: 'dark-dialog-panel'
        });
      });
    } else if (type === 'contact') {
      import('../../../../features/contacts/contact-form/contact-form.component').then((m) => {
        this.dialog.open(m.ContactFormComponent, {
          width: '560px',
          panelClass: 'dark-dialog-panel'
        });
      });
    } else if (type === 'deal') {
      import('../../../../features/deals/deal-form/deal-form.component').then((m) => {
        this.dialog.open(m.DealFormComponent, {
          width: '560px',
          panelClass: 'dark-dialog-panel'
        });
      });
    } else if (type === 'task') {
      import('../../../../features/tasks/task-form/task-form.component').then((m) => {
        this.dialog.open(m.TaskFormComponent, {
          width: '560px',
          panelClass: 'dark-dialog-panel'
        });
      });
    }
  }
}
