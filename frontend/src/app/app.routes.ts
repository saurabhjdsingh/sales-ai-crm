import { Routes } from '@angular/router';
import { authGuard } from './core/auth/auth.guard';

export const routes: Routes = [
  {
    path: 'login',
    loadComponent: () => import('./features/auth/login.component').then(m => m.LoginComponent)
  },
  {
    path: 'accept-invite',
    loadComponent: () => import('./features/auth/accept-invite.component').then(m => m.AcceptInviteComponent)
  },
  {
    path: 'reset-password',
    loadComponent: () => import('./features/auth/reset-password.component').then(m => m.ResetPasswordComponent)
  },
  {
    path: '',
    loadComponent: () => import('./shared/components/layout/shell/shell.component').then(m => m.ShellComponent),
    canActivate: [authGuard],
    children: [
      {
        path: '',
        redirectTo: 'dashboard',
        pathMatch: 'full'
      },
      {
        path: 'dashboard',
        loadComponent: () => import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent)
      },
      {
        path: 'companies',
        loadComponent: () => import('./features/companies/company-list/company-list.component').then(m => m.CompanyListComponent)
      },
      {
        path: 'companies/:id',
        loadComponent: () => import('./features/companies/company-detail/company-detail.component').then(m => m.CompanyDetailComponent)
      },
      {
        path: 'contacts',
        loadComponent: () => import('./features/contacts/contact-list/contact-list.component').then(m => m.ContactListComponent)
      },
      {
        path: 'contacts/:id',
        loadComponent: () => import('./features/contacts/contact-detail/contact-detail.component').then(m => m.ContactDetailComponent)
      },
      {
        path: 'deals',
        loadComponent: () => import('./features/deals/deal-list/deal-list.component').then(m => m.DealListComponent)
      },
      {
        path: 'deals/:id',
        loadComponent: () => import('./features/deals/deal-detail/deal-detail.component').then(m => m.DealDetailComponent)
      },
      {
        path: 'tasks',
        loadComponent: () => import('./features/tasks/task-list/task-list.component').then(m => m.TaskListComponent)
      },
      {
        path: 'imports',
        loadComponent: () => import('./features/imports/import-center.component').then(m => m.ImportCenterComponent)
      },
      {
        path: 'reports',
        loadComponent: () => import('./features/reports/reports.component').then(m => m.ReportsComponent)
      },
      {
        path: 'settings',
        loadComponent: () => import('./features/settings/settings.component').then(m => m.SettingsComponent)
      },
      {
        path: 'integrations',
        loadComponent: () => import('./features/integrations/integrations.component').then(m => m.IntegrationsComponent)
      },
      {
        path: 'calls',
        loadComponent: () => import('./features/telephony/calls.component').then(m => m.CallsComponent)
      }
    ]
  },
  {
    path: '**',
    redirectTo: ''
  }
];
