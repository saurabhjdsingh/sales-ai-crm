import { Component, EventEmitter, Output, OnInit, OnDestroy, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatMenuModule } from '@angular/material/menu';
import { MatBadgeModule } from '@angular/material/badge';
import { Subscription, interval, startWith, switchMap } from 'rxjs';
import { AuthService } from '../../../../core/auth/auth.service';
import { ApiService } from '../../../../core/services/api.service';
import { BrandingService } from '../../../../core/services/branding.service';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [CommonModule, MatIconModule, MatButtonModule, MatMenuModule, MatBadgeModule],
  template: `
    <header class="header-wrapper">
      <div class="header-left">
        <!-- Search trigger -->
        <button class="search-trigger" (click)="searchTriggered.emit()">
          <mat-icon class="search-icon">search</mat-icon>
          <span class="search-placeholder">Search {{ brandingService.organizationName() }}...</span>
          <span class="search-shortcut">⌘K</span>
        </button>
      </div>

      <div class="header-right">
        <!-- Quick Create Menu -->
        <button mat-flat-button color="primary" [matMenuTriggerFor]="createMenu" class="create-btn">
          <mat-icon>add</mat-icon>
          <span>Create</span>
        </button>
        <mat-menu #createMenu="matMenu" xPosition="before" class="dark-menu">
          <button mat-menu-item (click)="createAction.emit('company')">
            <mat-icon>business</mat-icon>
            <span>Company</span>
          </button>
          <button mat-menu-item (click)="createAction.emit('contact')">
            <mat-icon>person</mat-icon>
            <span>Contact</span>
          </button>
          <button mat-menu-item (click)="createAction.emit('deal')">
            <mat-icon>monetization_on</mat-icon>
            <span>Deal</span>
          </button>
          <button mat-menu-item (click)="createAction.emit('task')">
            <mat-icon>assignment</mat-icon>
            <span>Task</span>
          </button>
        </mat-menu>

        <button mat-icon-button class="icon-btn" (click)="toggleTheme()" aria-label="Toggle Theme">
          <mat-icon>{{ isLightTheme() ? 'dark_mode' : 'light_mode' }}</mat-icon>
        </button>

        <!-- Notifications Menu -->
        <button mat-icon-button class="icon-btn" [matMenuTriggerFor]="notificationMenu" aria-label="View notifications">
          <mat-icon [matBadge]="unreadCount()" matBadgeColor="warn" [matBadgeHidden]="unreadCount() === 0">notifications</mat-icon>
        </button>
        <mat-menu #notificationMenu="matMenu" xPosition="before" class="dark-menu notification-menu">
          <div class="notification-header" (click)="$event.stopPropagation()">
            <h3>Notifications</h3>
            <button mat-button color="primary" *ngIf="unreadCount() > 0" (click)="markAllRead($event)">
              Mark all read
            </button>
          </div>
          <div class="notification-list">
            @for (notif of notifications(); track notif.id) {
              <div class="notification-item" [ngClass]="{ 'unread': !notif.is_read }" (click)="onNotificationClick(notif)">
                <div class="notification-title">{{ notif.title }}</div>
                <div class="notification-desc">{{ notif.message }}</div>
                <div class="notification-time">{{ notif.created_at | date:'shortTime' }}</div>
              </div>
            }
            @if (notifications().length === 0) {
              <div class="empty-notifications">
                <mat-icon>notifications_off</mat-icon>
                <p>No task notifications yet</p>
              </div>
            }
          </div>
        </mat-menu>
      </div>
    </header>
  `,
  styles: [`
    .header-wrapper {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 64px;
      padding: 0 1.5rem;
      background-color: #0b1329;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
    }

    .header-left {
      display: flex;
      align-items: center;
      flex: 1;
      max-width: 480px;
    }

    .search-trigger {
      display: flex;
      align-items: center;
      width: 100%;
      height: 38px;
      padding: 0 0.75rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 6px;
      cursor: pointer;
      color: #64748b;
      transition: all 0.2s ease;
      font-size: 0.85rem;
    }

    .search-trigger:hover {
      background: rgba(255, 255, 255, 0.05);
      border-color: rgba(255, 255, 255, 0.1);
    }

    .search-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      margin-right: 0.5rem;
      color: #64748b;
    }

    .search-placeholder {
      flex: 1;
      text-align: left;
    }

    .search-shortcut {
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 4px;
      padding: 0.1rem 0.3rem;
      font-size: 0.7rem;
      color: #94a3b8;
      font-family: monospace;
    }

    .header-right {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .create-btn {
      background-color: #3b82f6 !important;
      color: white !important;
      border-radius: 6px;
    }

    .icon-btn {
      color: #94a3b8 !important;
    }

    .icon-btn:hover {
      color: #f8fafc !important;
      background-color: rgba(255, 255, 255, 0.03) !important;
    }

    .notification-menu {
      width: 320px !important;
      max-height: 480px !important;
      background-color: #0b1329 !important;
      border: 1px solid rgba(255, 255, 255, 0.08) !important;
      border-radius: 8px !important;
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.4) !important;
      padding: 0 !important;
      overflow: hidden !important;
    }

    .notification-header {
      display: flex;
      align-items: center;
      justify-content: space-between;
      padding: 0.75rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.05);
      background-color: #090f1f;
    }

    .notification-header h3 {
      font-size: 0.9rem;
      font-weight: 700;
      color: #f8fafc;
      margin: 0;
    }

    .notification-header button {
      font-size: 0.75rem !important;
      height: 28px !important;
      line-height: 28px !important;
      padding: 0 0.5rem !important;
    }

    .notification-list {
      max-height: 400px;
      overflow-y: auto;
    }

    .notification-item {
      padding: 0.75rem 1rem;
      border-bottom: 1px solid rgba(255, 255, 255, 0.03);
      cursor: pointer;
      transition: background-color 0.15s ease;
    }

    .notification-item:hover {
      background-color: rgba(255, 255, 255, 0.02);
    }

    .notification-item.unread {
      background-color: rgba(59, 130, 246, 0.04);
    }

    .notification-item.unread:hover {
      background-color: rgba(59, 130, 246, 0.06);
    }

    .notification-title {
      font-size: 0.8rem;
      font-weight: 600;
      color: #cbd5e1;
      margin-bottom: 0.15rem;
    }

    .notification-item.unread .notification-title {
      color: #3b82f6;
    }

    .notification-desc {
      font-size: 0.75rem;
      color: #64748b;
      line-height: 1.4;
      margin-bottom: 0.25rem;
    }

    .notification-time {
      font-size: 0.65rem;
      color: #475569;
      text-align: right;
    }

    .empty-notifications {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 2rem 1rem;
      color: #475569;
      text-align: center;
    }

    .empty-notifications mat-icon {
      font-size: 28px;
      width: 28px;
      height: 28px;
      margin-bottom: 0.5rem;
    }

    .empty-notifications p {
      font-size: 0.8rem;
      margin: 0;
    }
  `]
})
export class HeaderComponent implements OnInit, OnDestroy {
  readonly authService = inject(AuthService);
  readonly brandingService = inject(BrandingService);
  private readonly apiService = inject(ApiService);
  private readonly router = inject(Router);
  readonly isLightTheme = signal(false);

  @Output() readonly searchTriggered = new EventEmitter<void>();
  @Output() readonly createAction = new EventEmitter<'company' | 'contact' | 'deal' | 'task'>();

  readonly notifications = signal<any[]>([]);
  readonly unreadCount = signal<number>(0);
  private pollingSub?: Subscription;
  private isFirstLoad = true;

  constructor() {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme === 'light') {
      this.isLightTheme.set(true);
      document.body.classList.add('light-theme');
    }
  }

  ngOnInit(): void {
    // Poll notifications every 30 seconds
    this.pollingSub = interval(30000).pipe(
      startWith(0),
      switchMap(() => {
        if (this.authService.isAuthenticated()) {
          return this.apiService.get<any>('/tasks/notifications/', { page_size: 10 });
        }
        return [null];
      })
    ).subscribe({
      next: (res: any) => {
        if (res && res.results) {
          const oldUnreadCount = this.unreadCount();
          this.notifications.set(res.results);
          const count = res.results.filter((n: any) => !n.is_read).length;
          this.unreadCount.set(count);

          if (!this.isFirstLoad && count > oldUnreadCount) {
            this.playNotificationSound();
          }
          this.isFirstLoad = false;
        }
      }
    });
  }

  private playNotificationSound(): void {
    try {
      const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioContextClass) return;
      
      const ctx = new AudioContextClass();
      
      const playTone = (frequency: number, startTime: number, duration: number) => {
        const osc = ctx.createOscillator();
        const gainNode = ctx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(frequency, startTime);
        
        // Play soft dual chime: quick attack, smooth linear decay
        gainNode.gain.setValueAtTime(0, startTime);
        gainNode.gain.linearRampToValueAtTime(0.15, startTime + 0.02);
        gainNode.gain.exponentialRampToValueAtTime(0.001, startTime + duration);
        
        osc.connect(gainNode);
        gainNode.connect(ctx.destination);
        
        osc.start(startTime);
        osc.stop(startTime + duration);
      };
      
      const now = ctx.currentTime;
      // Harmonic chime: E5 (659.25Hz) followed by A5 (880Hz)
      playTone(659.25, now, 0.4);
      playTone(880.00, now + 0.12, 0.6);
    } catch (err) {
      console.warn('Failed to play notification sound:', err);
    }
  }

  ngOnDestroy(): void {
    if (this.pollingSub) {
      this.pollingSub.unsubscribe();
    }
  }

  toggleTheme(): void {
    this.isLightTheme.set(!this.isLightTheme());
    if (this.isLightTheme()) {
      document.body.classList.add('light-theme');
      localStorage.setItem('theme', 'light');
    } else {
      document.body.classList.remove('light-theme');
      localStorage.setItem('theme', 'dark');
    }
  }

  markAllRead(event: Event): void {
    event.stopPropagation();
    this.apiService.post('/tasks/notifications/mark-all-read/', {}).subscribe({
      next: () => {
        this.unreadCount.set(0);
        this.notifications.update(notifs => notifs.map(n => ({ ...n, is_read: true })));
      }
    });
  }

  onNotificationClick(notif: any): void {
    if (!notif.is_read) {
      this.apiService.patch(`/tasks/notifications/${notif.id}/`, { is_read: true }).subscribe({
        next: () => {
          this.unreadCount.update(c => Math.max(0, c - 1));
          this.notifications.update(notifs => notifs.map(n => n.id === notif.id ? { ...n, is_read: true } : n));
        }
      });
    }
    if (notif.notification_type === 'task_reminder') {
      this.router.navigate(['/tasks']);
    }
  }
}
