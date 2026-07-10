import { Component, inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatTooltipModule } from '@angular/material/tooltip';
import { AuthService } from '../../../../core/auth/auth.service';
import { BrandingService } from '../../../../core/services/branding.service';

interface NavItem {
  label: string;
  route: string;
  icon: string;
}

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [CommonModule, RouterModule, MatIconModule, MatButtonModule, MatTooltipModule],
  template: `
    <div class="sidebar-wrapper">
      <div class="sidebar-brand">
        @if (brandingService.logoUrl()) {
          <img [src]="brandingService.logoUrl()" class="brand-logo-img" alt="Logo" />
        } @else {
          <mat-icon class="logo-icon">radar</mat-icon>
        }
        <div class="brand-text-container">
          <span class="logo-text">{{ brandingService.organizationName() }}</span>
        </div>
      </div>

      <nav class="sidebar-nav">
        @for (item of navItems; track item.route) {
          <a
            [routerLink]="[item.route]"
            routerLinkActive="active"
            [routerLinkActiveOptions]="{ exact: item.route === '/dashboard' }"
            class="nav-item"
          >
            <mat-icon class="nav-icon">{{ item.icon }}</mat-icon>
            <span class="nav-label">{{ item.label }}</span>
          </a>
        }
      </nav>

      <div class="sidebar-user" *ngIf="authService.currentUser() as user">
        <div class="user-info">
          <img
            [src]="user.avatar_url || 'https://api.dicebear.com/7.x/initials/svg?seed=' + user.full_name"
            [alt]="user.full_name"
            class="user-avatar"
          />
          <div class="user-details">
            <div class="user-name">{{ user.full_name }}</div>
            <div class="user-role">{{ user.role | titlecase }}</div>
          </div>
        </div>
        <button
          mat-icon-button
          color="warn"
          (click)="authService.logout()"
          matTooltip="Log Out"
          class="logout-btn"
        >
          <mat-icon>logout</mat-icon>
        </button>
      </div>
    </div>
  `,
  styles: [`
    .sidebar-wrapper {
      display: flex;
      flex-direction: column;
      height: 100%;
      background-color: #0b1329;
      border-right: 1px solid rgba(255, 255, 255, 0.05);
      color: #94a3b8;
    }

    .sidebar-brand {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      padding: 1.5rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
    }

    .logo-icon {
      color: #3b82f6;
      font-size: 24px;
      width: 24px;
      height: 24px;
    }

    .brand-logo-img {
      width: 32px;
      height: 32px;
      object-fit: contain;
      border-radius: 6px;
      flex-shrink: 0;
    }

    .brand-text-container {
      display: flex;
      flex-direction: column;
      overflow: hidden;
      flex: 1;
    }

    .logo-text {
      color: #f8fafc;
      font-weight: 700;
      font-size: 0.95rem;
      letter-spacing: -0.025em;
      line-height: 1.25;
      word-break: break-word;
    }

    .badge {
      font-size: 0.7rem;
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      padding: 0.05rem 0.3rem;
      border-radius: 4px;
      font-weight: 600;
    }

    .sidebar-nav {
      flex: 1;
      padding: 1.5rem 0.75rem;
      display: flex;
      flex-direction: column;
      gap: 0.25rem;
    }

    .nav-item {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.75rem 1rem;
      color: #94a3b8;
      text-decoration: none;
      border-radius: 8px;
      font-weight: 500;
      font-size: 0.9rem;
      transition: all 0.2s ease;
    }

    .nav-item:hover {
      background-color: rgba(255, 255, 255, 0.03);
      color: #f8fafc;
    }

    .nav-item.active {
      background-color: rgba(59, 130, 246, 0.1);
      color: #3b82f6;
    }

    .nav-icon {
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .sidebar-user {
      padding: 1rem 1.5rem;
      border-top: 1px solid rgba(255, 255, 255, 0.03);
      display: flex;
      align-items: center;
      justify-content: space-between;
      gap: 0.5rem;
    }

    .user-info {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      overflow: hidden;
    }

    .user-avatar {
      width: 36px;
      height: 36px;
      border-radius: 50%;
      border: 1px solid rgba(255, 255, 255, 0.1);
      background-color: #1e293b;
    }

    .user-details {
      display: flex;
      flex-direction: column;
      overflow: hidden;
    }

    .user-name {
      color: #f8fafc;
      font-weight: 600;
      font-size: 0.85rem;
      white-space: nowrap;
      text-overflow: ellipsis;
      overflow: hidden;
    }

    .user-role {
      font-size: 0.75rem;
      color: #64748b;
    }

    .logout-btn {
      color: #94a3b8 !important;
    }

    .logout-btn:hover {
      color: #ef4444 !important;
    }
  `]
})
export class SidebarComponent {
  readonly authService = inject(AuthService);
  readonly brandingService = inject(BrandingService);

  readonly navItems: NavItem[] = [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Companies', route: '/companies', icon: 'business' },
    { label: 'Contacts', route: '/contacts', icon: 'people' },
    { label: 'Deals', route: '/deals', icon: 'monetization_on' },
    { label: 'Tasks', route: '/tasks', icon: 'assignment' },
    { label: 'Import Center', route: '/imports', icon: 'cloud_upload' },
    { label: 'Reports', route: '/reports', icon: 'bar_chart' },
    { label: 'Settings', route: '/settings', icon: 'settings' }
  ];
}
