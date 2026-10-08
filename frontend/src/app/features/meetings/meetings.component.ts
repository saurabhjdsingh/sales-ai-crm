import { Component, OnInit, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { RouterModule } from '@angular/router';
import { MatIconModule } from '@angular/material/icon';
import { MatButtonModule } from '@angular/material/button';
import { MatProgressSpinnerModule } from '@angular/material/progress-spinner';
import { MatDialog, MatDialogModule } from '@angular/material/dialog';
import { MatTooltipModule } from '@angular/material/tooltip';

import { MeetingService } from '../../core/services/meeting.service';
import { NotificationService } from '../../core/services/notification.service';
import { Meeting } from '../../core/models/crm.model';
import { MeetingEditDialogComponent } from './meeting-edit-dialog.component';
import { MeetingIntelligenceDialogComponent } from './meeting-intelligence-dialog.component';

@Component({
  selector: 'app-meetings',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    RouterModule,
    MatIconModule,
    MatButtonModule,
    MatProgressSpinnerModule,
    MatDialogModule,
    MatTooltipModule,
  ],
  template: `
    <div class="meetings-page">
      <!-- ─── HEADER ─── -->
      <div class="page-header">
        <div class="header-left">
          <div class="title-with-badge">
            <h1>Meetings & Calendar</h1>
            <span class="count-badge">{{ meetings().length }}</span>
          </div>
          <p class="header-subtitle">
            Synchronize Google Calendar events, auto-match contacts and companies, and capture post-meeting intelligence.
          </p>
        </div>

        <div class="header-actions">
          <div class="sync-range-wrapper" matTooltip="Calendar fetch range window">
            <mat-icon class="range-icon">date_range</mat-icon>
            <select class="range-select" [ngModel]="selectedTimeRange()" (ngModelChange)="selectedTimeRange.set($event)">
              <option value="next_month">Through Next Month</option>
              <option value="14_days">Next 14 Days</option>
              <option value="30_days">Next 30 Days</option>
              <option value="60_days">Next 60 Days</option>
              <option value="90_days">Next 90 Days</option>
            </select>
          </div>

          <button
            mat-flat-button
            color="primary"
            class="sync-btn"
            (click)="syncCalendar()"
            [disabled]="syncing()"
          >
            @if (syncing()) {
              <mat-spinner diameter="18"></mat-spinner>
              <span>Syncing with Google...</span>
            } @else {
              <mat-icon>sync</mat-icon>
              <span>Sync Google Calendar</span>
            }
          </button>
        </div>
      </div>

      <!-- ─── FILTER & CONTROLS BAR ─── -->
      <div class="controls-bar">
        <!-- Tab Filter Pills -->
        <div class="filter-tabs">
          <button
            class="filter-tab"
            [class.active]="activeFilter() === 'upcoming'"
            (click)="setFilter('upcoming')"
          >
            <mat-icon>upcoming</mat-icon>
            <span>Upcoming Meetings</span>
          </button>
          <button
            class="filter-tab"
            [class.active]="activeFilter() === 'past'"
            (click)="setFilter('past')"
          >
            <mat-icon>history</mat-icon>
            <span>Past Meetings</span>
          </button>
          <button
            class="filter-tab warning-tab"
            [class.active]="activeFilter() === 'needs_review'"
            (click)="setFilter('needs_review')"
          >
            <mat-icon>warning_amber</mat-icon>
            <span>Needs Review (Unmatched)</span>
          </button>
          <button
            class="filter-tab"
            [class.active]="activeFilter() === 'all'"
            (click)="setFilter('all')"
          >
            <mat-icon>view_list</mat-icon>
            <span>All</span>
          </button>
        </div>

        <!-- Search Box -->
        <div class="search-box">
          <mat-icon class="search-icon">search</mat-icon>
          <input
            type="text"
            placeholder="Search meetings, attendees, companies..."
            [(ngModel)]="searchQuery"
            (ngModelChange)="onSearchChange()"
          />
          @if (searchQuery) {
            <button mat-icon-button class="clear-search-btn" (click)="clearSearch()">
              <mat-icon>close</mat-icon>
            </button>
          }
        </div>
      </div>

      <!-- ─── MEETINGS LIST ─── -->
      <div class="meetings-content">
        @if (loading()) {
          <div class="loading-state">
            <mat-spinner diameter="40"></mat-spinner>
            <p>Loading your calendar meetings...</p>
          </div>
        } @else if (meetings().length === 0) {
          <div class="empty-state">
            <div class="empty-icon-box">
              <mat-icon>event_busy</mat-icon>
            </div>
            <h3>No meetings found</h3>
            <p>
              @if (activeFilter() === 'upcoming') {
                You have no upcoming calendar meetings scheduled.
              } @else if (activeFilter() === 'needs_review') {
                Great job! All your meetings are cleanly linked to CRM contacts and companies.
              } @else {
                No calendar meetings match your current filters.
              }
            </p>
            <button mat-stroked-button class="empty-sync-btn" (click)="syncCalendar()" [disabled]="syncing()">
              <mat-icon>sync</mat-icon>
              <span>Check for New Google Events</span>
            </button>
          </div>
        } @else {
          <div class="meetings-grid">
            @for (m of meetings(); track m.id) {
              <div class="meeting-card" [class.finished]="m.is_finished" [class.unmatched]="!m.contact && !m.company">
                <!-- 1. Left Date Block -->
                <div class="date-column">
                  <span class="month-label">{{ m.start_time | date:'MMM' | uppercase }}</span>
                  <span class="day-number">{{ m.start_time | date:'dd' }}</span>
                  <span class="weekday-label">{{ m.start_time | date:'EEE' }}</span>
                  <div class="time-range">
                    <span>{{ m.start_time | date:'shortTime' }}</span>
                  </div>
                </div>

                <!-- 2. Middle Details Column -->
                <div class="details-column">
                  <div class="card-top-row">
                    <h3 class="meeting-title" [matTooltip]="m.title">{{ m.title }}</h3>
                    <div class="status-tags">
                      <span class="status-badge" [ngClass]="m.status">{{ m.status | uppercase }}</span>
                      @if (m.is_finished) {
                        <span class="tag-concluded">CONCLUDED</span>
                      }
                    </div>
                  </div>

                  @if (m.description) {
                    <p class="meeting-desc">{{ m.description }}</p>
                  }

                  <!-- Meeting Video Call Link -->
                  @if (m.meeting_url) {
                    <div class="meeting-link-row">
                      <a [href]="m.meeting_url" target="_blank" rel="noopener noreferrer" class="join-call-btn">
                        <mat-icon class="video-icon">videocam</mat-icon>
                        <span>Join Meeting</span>
                        <mat-icon class="external-icon">open_in_new</mat-icon>
                      </a>
                      @if (m.location && m.location !== m.meeting_url) {
                        <span class="location-text">
                          <mat-icon>location_on</mat-icon> {{ m.location }}
                        </span>
                      }
                    </div>
                  }

                  <!-- Attendees Chips -->
                  @if (m.attendees?.length) {
                    <div class="attendees-row">
                      <span class="attendees-label">Attendees:</span>
                      <div class="attendees-chips">
                        @for (att of m.attendees; track att.email) {
                          <span
                            class="attendee-chip"
                            [class.is-matched]="m.matched_attendee_email === att.email"
                            [matTooltip]="att.email + ' (' + (att.responseStatus || 'pending') + ')'"
                          >
                            {{ att.displayName || att.email }}
                          </span>
                        }
                      </div>
                    </div>
                  }

                  <!-- Post-Meeting Badges -->
                  <div class="intelligence-badges">
                    @if (m.meeting_notes) {
                      <span class="intel-badge notes">
                        <mat-icon>edit_note</mat-icon> Notes Added
                      </span>
                    }
                    @if (m.analysis?.summary) {
                      <span class="intel-badge ai">
                        <mat-icon>auto_awesome</mat-icon> AI Analyzed
                      </span>
                    }
                    @if (m.transcript) {
                      <span class="intel-badge transcript">
                        <mat-icon>record_voice_over</mat-icon> Transcript Saved
                      </span>
                    }
                  </div>

                  <!-- Automated Reminder Settings & Status -->
                  <div class="reminder-status-row">
                    <button
                      type="button"
                      class="reminder-toggle-btn"
                      [class.active]="m.send_reminders"
                      (click)="toggleReminders(m)"
                      [matTooltip]="m.send_reminders ? 'Automatic reminders enabled (24h & 1h prior via Gmail). Click to disable.' : 'Automatic reminders off. Click to enable.'"
                    >
                      <mat-icon>{{ m.send_reminders ? 'notifications_active' : 'notifications_off' }}</mat-icon>
                      <span>{{ m.send_reminders ? 'Reminders On' : 'Reminders Off' }}</span>
                    </button>

                    @if (m.send_reminders) {
                      <div class="reminder-pills">
                        <span class="reminder-sent-chip" [class.sent]="m.reminder_24h_sent" [matTooltip]="m.reminder_24h_sent ? ('24h reminder sent at ' + (m.reminder_24h_sent_at | date:'short')) : '24h reminder scheduled'">
                          <mat-icon>{{ m.reminder_24h_sent ? 'check_circle' : 'schedule' }}</mat-icon>
                          24h Reminder
                        </span>
                        <span class="reminder-sent-chip" [class.sent]="m.reminder_1h_sent" [matTooltip]="m.reminder_1h_sent ? ('1h reminder sent at ' + (m.reminder_1h_sent_at | date:'short')) : '1h reminder scheduled'">
                          <mat-icon>{{ m.reminder_1h_sent ? 'check_circle' : 'schedule' }}</mat-icon>
                          1h Reminder
                        </span>
                      </div>
                    }
                  </div>
                </div>

                <!-- 3. Right Column: CRM Association & Actions -->
                <div class="crm-column">
                  <div class="association-box">
                    <span class="section-label">CRM Association:</span>
                    @if (m.company || m.contact) {
                      <div class="linked-entities">
                        @if (m.company_name) {
                          <a [routerLink]="['/companies', m.company]" class="entity-pill company">
                            <mat-icon>business</mat-icon>
                            <span>{{ m.company_name }}</span>
                          </a>
                        }
                        @if (m.contact_name) {
                          <a [routerLink]="['/contacts', m.contact]" class="entity-pill contact">
                            <mat-icon>person</mat-icon>
                            <span>{{ m.contact_name }}</span>
                          </a>
                        }
                        @if (m.is_auto_matched && !m.is_manually_edited) {
                          <span class="auto-match-tag">
                            <mat-icon>auto_fix_high</mat-icon> Auto-matched
                          </span>
                        }
                      </div>
                      <button mat-button class="edit-link-btn" (click)="openEditDialog(m)">
                        <mat-icon>edit</mat-icon>
                        <span>Change</span>
                      </button>
                    } @else {
                      <div class="unlinked-state">
                        <div class="unlinked-pill">
                          <mat-icon>link_off</mat-icon>
                          <span>Not Linked</span>
                        </div>
                        <button mat-stroked-button class="link-btn" (click)="openEditDialog(m)">
                          <mat-icon>add_link</mat-icon>
                          <span>Link to CRM</span>
                        </button>
                      </div>
                    }
                  </div>

                  <!-- Post-Meeting Action Hub -->
                  <div class="action-buttons">
                    <button
                      mat-flat-button
                      class="intel-hub-btn"
                      [class.has-notes]="m.has_post_meeting_notes"
                      (click)="openIntelligenceDialog(m)"
                    >
                      <mat-icon>{{ m.has_post_meeting_notes ? 'insights' : 'rate_review' }}</mat-icon>
                      <span>{{ m.has_post_meeting_notes ? 'View Intelligence' : 'Add Notes & AI' }}</span>
                    </button>

                    <button
                      mat-button
                      class="delete-meeting-btn"
                      (click)="removeMeeting(m)"
                      matTooltip="Remove this meeting from CRM permanently and prevent it from re-syncing"
                    >
                      <mat-icon>delete_outline</mat-icon>
                      <span>Remove from CRM</span>
                    </button>
                  </div>
                </div>
              </div>
            }
          </div>
        }
      </div>
    </div>
  `,
  styles: [`
    .meetings-page {
      padding: 2rem;
      font-family: 'Inter', sans-serif;
      color: #e2e8f0;
      min-height: 100%;
    }

    /* ─── HEADER ─── */
    .page-header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 2rem;
    }

    .title-with-badge {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .title-with-badge h1 {
      margin: 0;
      font-size: 1.75rem;
      font-weight: 800;
      letter-spacing: -0.025em;
      color: #f8fafc;
    }

    .count-badge {
      font-size: 0.8rem;
      font-weight: 700;
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      padding: 0.2rem 0.6rem;
      border-radius: 20px;
      border: 1px solid rgba(59, 130, 246, 0.3);
    }

    .header-subtitle {
      margin: 0.35rem 0 0 0;
      font-size: 0.9rem;
      color: #94a3b8;
      max-width: 650px;
      line-height: 1.5;
    }

    .header-actions {
      display: flex;
      align-items: center;
      gap: 0.75rem;
    }

    .sync-range-wrapper {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.12);
      border-radius: 8px;
      padding: 0.2rem 0.6rem;
    }

    .range-icon {
      font-size: 18px;
      width: 18px;
      height: 18px;
      color: #94a3b8;
    }

    .range-select {
      background: transparent;
      border: none;
      color: #f1f5f9;
      font-size: 0.82rem;
      font-weight: 500;
      outline: none;
      cursor: pointer;
      padding: 0.35rem 0.2rem;
    }

    .range-select option {
      background: #1e293b;
      color: #f1f5f9;
    }

    .sync-btn {
      font-weight: 600;
      border-radius: 8px;
      display: inline-flex;
      align-items: center;
      gap: 0.5rem;
      box-shadow: 0 4px 14px rgba(59, 130, 246, 0.3);
    }

    /* ─── CONTROLS BAR ─── */
    .controls-bar {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1.5rem;
      margin-bottom: 1.5rem;
      flex-wrap: wrap;
    }

    .filter-tabs {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.06);
      padding: 0.3rem;
      border-radius: 10px;
    }

    .filter-tab {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      background: transparent;
      border: none;
      color: #94a3b8;
      font-size: 0.82rem;
      font-weight: 600;
      padding: 0.5rem 0.85rem;
      border-radius: 8px;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .filter-tab mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .filter-tab:hover {
      color: #f8fafc;
      background: rgba(255, 255, 255, 0.04);
    }

    .filter-tab.active {
      color: #ffffff;
      background: #2563eb;
      box-shadow: 0 2px 8px rgba(37, 99, 235, 0.4);
    }

    .filter-tab.warning-tab.active {
      background: #d97706;
      box-shadow: 0 2px 8px rgba(217, 119, 6, 0.4);
    }

    .search-box {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      background: rgba(255, 255, 255, 0.03);
      border: 1px solid rgba(255, 255, 255, 0.08);
      border-radius: 8px;
      padding: 0.4rem 0.85rem;
      min-width: 320px;
      transition: border-color 0.2s;
    }

    .search-box:focus-within {
      border-color: #3b82f6;
    }

    .search-icon {
      color: #64748b;
      font-size: 20px;
      width: 20px;
      height: 20px;
    }

    .search-box input {
      background: transparent;
      border: none;
      outline: none;
      color: #f8fafc;
      font-size: 0.85rem;
      width: 100%;
    }

    .search-box input::placeholder {
      color: #64748b;
    }

    .clear-search-btn {
      color: #64748b !important;
      width: 24px !important;
      height: 24px !important;
      line-height: 24px !important;
    }

    .clear-search-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    /* ─── MEETINGS LIST & CARDS ─── */
    .meetings-grid {
      display: flex;
      flex-direction: column;
      gap: 1rem;
    }

    .meeting-card {
      display: grid;
      grid-template-columns: 105px 1fr 280px;
      gap: 1.5rem;
      background: #0b1329;
      border: 1px solid rgba(255, 255, 255, 0.06);
      border-radius: 12px;
      padding: 1.25rem;
      transition: all 0.25s cubic-bezier(0.16, 1, 0.3, 1);
      box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
    }

    .meeting-card:hover {
      border-color: rgba(59, 130, 246, 0.3);
      transform: translateY(-2px);
      box-shadow: 0 8px 30px rgba(0, 0, 0, 0.45), 0 0 15px rgba(59, 130, 246, 0.1);
    }

    .meeting-card.unmatched {
      border-left: 4px solid #f59e0b;
    }

    .meeting-card.finished {
      opacity: 0.95;
    }

    /* 1. Date Column */
    .date-column {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      background: rgba(255, 255, 255, 0.02);
      border: 1px solid rgba(255, 255, 255, 0.05);
      border-radius: 10px;
      padding: 0.75rem 0.5rem;
      text-align: center;
    }

    .month-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: #3b82f6;
      letter-spacing: 0.05em;
    }

    .day-number {
      font-size: 1.6rem;
      font-weight: 800;
      color: #f8fafc;
      line-height: 1.1;
      margin: 0.15rem 0;
    }

    .weekday-label {
      font-size: 0.75rem;
      color: #64748b;
      font-weight: 600;
      text-transform: uppercase;
    }

    .time-range {
      margin-top: 0.5rem;
      padding-top: 0.35rem;
      border-top: 1px solid rgba(255, 255, 255, 0.05);
      font-size: 0.72rem;
      font-weight: 600;
      color: #94a3b8;
    }

    /* 2. Details Column */
    .details-column {
      display: flex;
      flex-direction: column;
      gap: 0.65rem;
    }

    .card-top-row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      gap: 1rem;
    }

    .meeting-title {
      margin: 0;
      font-size: 1.1rem;
      font-weight: 700;
      color: #f8fafc;
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
    }

    .status-tags {
      display: flex;
      align-items: center;
      gap: 0.4rem;
      flex-shrink: 0;
    }

    .status-badge {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      background: rgba(59, 130, 246, 0.15);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.25);
    }

    .status-badge.confirmed {
      background: rgba(16, 185, 129, 0.15);
      color: #34d399;
      border-color: rgba(16, 185, 129, 0.25);
    }

    .status-badge.cancelled {
      background: rgba(239, 68, 68, 0.15);
      color: #f87171;
      border-color: rgba(239, 68, 68, 0.25);
    }

    .tag-concluded {
      font-size: 0.68rem;
      font-weight: 700;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
      background: rgba(148, 163, 184, 0.15);
      color: #cbd5e1;
    }

    .meeting-desc {
      margin: 0;
      font-size: 0.82rem;
      color: #94a3b8;
      line-height: 1.4;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .meeting-link-row {
      display: flex;
      align-items: center;
      gap: 1rem;
    }

    .join-call-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      background: rgba(59, 130, 246, 0.12);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.25);
      padding: 0.3rem 0.75rem;
      border-radius: 6px;
      font-size: 0.8rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s ease;
    }

    .join-call-btn:hover {
      background: rgba(59, 130, 246, 0.22);
      color: #93c5fd;
    }

    .video-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
    }

    .external-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      opacity: 0.7;
    }

    .location-text {
      display: flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.78rem;
      color: #94a3b8;
    }

    .location-text mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }

    .attendees-row {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      font-size: 0.78rem;
    }

    .attendees-label {
      color: #64748b;
      font-weight: 600;
    }

    .attendees-chips {
      display: flex;
      flex-wrap: wrap;
      gap: 0.35rem;
    }

    .attendee-chip {
      background: rgba(255, 255, 255, 0.04);
      color: #cbd5e1;
      padding: 0.1rem 0.5rem;
      border-radius: 12px;
      font-size: 0.74rem;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .attendee-chip.is-matched {
      background: rgba(16, 185, 129, 0.15);
      color: #6ee7b7;
      border-color: rgba(16, 185, 129, 0.3);
      font-weight: 600;
    }

    .intelligence-badges {
      display: flex;
      align-items: center;
      gap: 0.5rem;
      margin-top: 0.2rem;
    }

    .intel-badge {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.72rem;
      font-weight: 600;
      padding: 0.15rem 0.5rem;
      border-radius: 4px;
    }

    .intel-badge.notes {
      background: rgba(59, 130, 246, 0.12);
      color: #93c5fd;
    }

    .intel-badge.ai {
      background: rgba(168, 85, 247, 0.15);
      color: #c084fc;
      border: 1px solid rgba(168, 85, 247, 0.3);
    }

    .intel-badge.transcript {
      background: rgba(148, 163, 184, 0.12);
      color: #94a3b8;
    }

    .intel-badge mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .reminder-status-row {
      display: flex;
      align-items: center;
      flex-wrap: wrap;
      gap: 0.6rem;
      margin-top: 0.35rem;
    }

    .reminder-toggle-btn {
      display: inline-flex;
      align-items: center;
      gap: 0.35rem;
      background: rgba(255, 255, 255, 0.05);
      border: 1px solid rgba(255, 255, 255, 0.1);
      color: #94a3b8;
      border-radius: 6px;
      padding: 0.2rem 0.55rem;
      font-size: 0.72rem;
      font-weight: 600;
      cursor: pointer;
      transition: all 0.2s ease;
    }

    .reminder-toggle-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      color: #f8fafc;
    }

    .reminder-toggle-btn.active {
      background: rgba(16, 185, 129, 0.12);
      color: #34d399;
      border-color: rgba(16, 185, 129, 0.3);
    }

    .reminder-toggle-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .reminder-pills {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
    }

    .reminder-sent-chip {
      display: inline-flex;
      align-items: center;
      gap: 0.25rem;
      font-size: 0.68rem;
      padding: 0.15rem 0.45rem;
      border-radius: 4px;
      background: rgba(255, 255, 255, 0.04);
      color: #64748b;
      border: 1px solid rgba(255, 255, 255, 0.06);
    }

    .reminder-sent-chip mat-icon {
      font-size: 12px;
      width: 12px;
      height: 12px;
    }

    .reminder-sent-chip.sent {
      background: rgba(59, 130, 246, 0.12);
      color: #60a5fa;
      border-color: rgba(59, 130, 246, 0.25);
    }

    /* 3. Right CRM Column */
    .crm-column {
      display: flex;
      flex-direction: column;
      justify-content: space-between;
      border-left: 1px solid rgba(255, 255, 255, 0.05);
      padding-left: 1.5rem;
    }

    .association-box {
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .section-label {
      font-size: 0.72rem;
      font-weight: 700;
      color: #64748b;
      text-transform: uppercase;
      letter-spacing: 0.04em;
    }

    .linked-entities {
      display: flex;
      flex-direction: column;
      gap: 0.35rem;
    }

    .entity-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.4rem;
      padding: 0.25rem 0.6rem;
      border-radius: 6px;
      font-size: 0.78rem;
      font-weight: 600;
      text-decoration: none;
      transition: all 0.2s;
    }

    .entity-pill.company {
      background: rgba(59, 130, 246, 0.12);
      color: #60a5fa;
      border: 1px solid rgba(59, 130, 246, 0.25);
    }

    .entity-pill.company:hover {
      background: rgba(59, 130, 246, 0.2);
    }

    .entity-pill.contact {
      background: rgba(16, 185, 129, 0.12);
      color: #34d399;
      border: 1px solid rgba(16, 185, 129, 0.25);
    }

    .entity-pill.contact:hover {
      background: rgba(16, 185, 129, 0.2);
    }

    .entity-pill mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }

    .auto-match-tag {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      font-size: 0.68rem;
      font-weight: 600;
      color: #34d399;
    }

    .auto-match-tag mat-icon {
      font-size: 13px;
      width: 13px;
      height: 13px;
    }

    .edit-link-btn {
      align-self: flex-start;
      font-size: 0.75rem !important;
      padding: 0 0.4rem !important;
      height: 24px !important;
      line-height: 24px !important;
      color: #64748b !important;
    }

    .edit-link-btn mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
      margin-right: 2px;
    }

    .unlinked-state {
      display: flex;
      flex-direction: column;
      gap: 0.5rem;
      margin-top: 0.25rem;
    }

    .unlinked-pill {
      display: inline-flex;
      align-items: center;
      gap: 0.3rem;
      background: rgba(245, 158, 11, 0.12);
      color: #fbbf24;
      border: 1px solid rgba(245, 158, 11, 0.25);
      padding: 0.2rem 0.5rem;
      border-radius: 6px;
      font-size: 0.75rem;
      font-weight: 600;
      width: fit-content;
    }

    .unlinked-pill mat-icon {
      font-size: 14px;
      width: 14px;
      height: 14px;
    }

    .link-btn {
      font-size: 0.78rem !important;
      height: 30px !important;
      line-height: 30px !important;
      color: #3b82f6 !important;
      border-color: rgba(59, 130, 246, 0.3) !important;
      border-radius: 6px;
    }

    .link-btn mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
      margin-right: 3px;
    }

    .action-buttons {
      margin-top: 1rem;
      display: flex;
      flex-direction: column;
      gap: 0.4rem;
    }

    .intel-hub-btn {
      width: 100%;
      font-size: 0.8rem;
      font-weight: 600;
      border-radius: 8px;
      background: rgba(255, 255, 255, 0.05);
      color: #f8fafc;
      border: 1px solid rgba(255, 255, 255, 0.1);
      transition: all 0.2s;
    }

    .intel-hub-btn:hover {
      background: rgba(255, 255, 255, 0.1);
      border-color: rgba(255, 255, 255, 0.2);
    }

    .intel-hub-btn.has-notes {
      background: linear-gradient(135deg, rgba(59, 130, 246, 0.2), rgba(147, 51, 234, 0.2));
      border-color: rgba(147, 51, 234, 0.4);
      color: #c084fc;
    }

    .intel-hub-btn mat-icon {
      font-size: 16px;
      width: 16px;
      height: 16px;
      margin-right: 4px;
    }

    .delete-meeting-btn {
      width: 100%;
      font-size: 0.75rem !important;
      height: 28px !important;
      line-height: 28px !important;
      color: #94a3b8 !important;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 0.3rem;
      transition: all 0.2s;
    }

    .delete-meeting-btn:hover {
      color: #f87171 !important;
      background: rgba(239, 68, 68, 0.08) !important;
    }

    .delete-meeting-btn mat-icon {
      font-size: 15px;
      width: 15px;
      height: 15px;
    }

    /* States */
    .loading-state,
    .empty-state {
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      padding: 4rem 2rem;
      text-align: center;
      color: #94a3b8;
    }

    .empty-icon-box {
      width: 64px;
      height: 64px;
      border-radius: 16px;
      background: rgba(255, 255, 255, 0.03);
      display: flex;
      align-items: center;
      justify-content: center;
      color: #64748b;
      margin-bottom: 1rem;
    }

    .empty-icon-box mat-icon {
      font-size: 32px;
      width: 32px;
      height: 32px;
    }

    .empty-state h3 {
      margin: 0;
      font-size: 1.2rem;
      font-weight: 700;
      color: #f8fafc;
    }

    .empty-state p {
      margin: 0.35rem 0 1.25rem 0;
      font-size: 0.85rem;
      max-width: 400px;
    }

    .empty-sync-btn {
      color: #3b82f6 !important;
      border-color: rgba(59, 130, 246, 0.3) !important;
    }

    /* ─── LIGHT THEME OVERRIDES ─── */
    :host-context(body.light-theme) .meetings-page {
      color: #334155;
    }

    :host-context(body.light-theme) .title-with-badge h1 {
      color: #0f172a;
    }

    :host-context(body.light-theme) .header-subtitle {
      color: #64748b;
    }

    :host-context(body.light-theme) .filter-tabs {
      background: #f1f5f9;
      border-color: #e2e8f0;
    }

    :host-context(body.light-theme) .filter-tab {
      color: #64748b;
    }

    :host-context(body.light-theme) .filter-tab:hover {
      background: #e2e8f0;
      color: #0f172a;
    }

    :host-context(body.light-theme) .filter-tab.active {
      color: #ffffff;
      background: #2563eb;
    }

    :host-context(body.light-theme) .search-box {
      background: #ffffff;
      border-color: #cbd5e1;
    }

    :host-context(body.light-theme) .search-box input {
      color: #0f172a;
    }

    :host-context(body.light-theme) .meeting-card {
      background: #ffffff;
      border-color: #e2e8f0;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.05);
    }

    :host-context(body.light-theme) .meeting-card:hover {
      box-shadow: 0 10px 25px rgba(0, 0, 0, 0.08);
    }

    :host-context(body.light-theme) .date-column {
      background: #f8fafc;
      border-color: #e2e8f0;
    }

    :host-context(body.light-theme) .day-number {
      color: #0f172a;
    }

    :host-context(body.light-theme) .meeting-title {
      color: #0f172a;
    }

    :host-context(body.light-theme) .meeting-desc {
      color: #64748b;
    }

    :host-context(body.light-theme) .status-badge.confirmed {
      background: #dcfce7;
      color: #15803d;
      border-color: #bbf7d0;
    }

    :host-context(body.light-theme) .status-badge.cancelled {
      background: #fee2e2;
      color: #b91c1c;
      border-color: #fecaca;
    }

    :host-context(body.light-theme) .join-call-btn {
      background: #eff6ff;
      color: #1d4ed8;
      border-color: #bfdbfe;
    }

    :host-context(body.light-theme) .attendee-chip {
      background: #f1f5f9;
      color: #475569;
      border-color: #e2e8f0;
    }

    :host-context(body.light-theme) .crm-column {
      border-left-color: #e2e8f0;
    }

    :host-context(body.light-theme) .entity-pill.company {
      background: #eff6ff;
      color: #1d4ed8;
      border-color: #bfdbfe;
    }

    :host-context(body.light-theme) .entity-pill.contact {
      background: #ecfdf5;
      color: #047857;
      border-color: #a7f3d0;
    }

    :host-context(body.light-theme) .intel-hub-btn {
      background: #f8fafc;
      color: #0f172a;
      border-color: #e2e8f0;
    }

    :host-context(body.light-theme) .intel-hub-btn.has-notes {
      background: #faf5ff;
      border-color: #d8b4fe;
      color: #6b21a8;
    }

    :host-context(body.light-theme) .empty-state h3 {
      color: #0f172a;
    }

    :host-context(body.light-theme) .sync-range-wrapper {
      background: #f8fafc;
      border-color: #cbd5e1;
    }

    :host-context(body.light-theme) .range-select {
      color: #0f172a;
    }

    :host-context(body.light-theme) .range-select option {
      background: #ffffff;
      color: #0f172a;
    }

    :host-context(body.light-theme) .reminder-toggle-btn {
      background: #f1f5f9;
      border-color: #cbd5e1;
      color: #64748b;
    }

    :host-context(body.light-theme) .reminder-toggle-btn.active {
      background: #ecfdf5;
      color: #047857;
      border-color: #a7f3d0;
    }

    :host-context(body.light-theme) .reminder-sent-chip {
      background: #f1f5f9;
      color: #64748b;
      border-color: #e2e8f0;
    }

    :host-context(body.light-theme) .reminder-sent-chip.sent {
      background: #eff6ff;
      color: #1d4ed8;
      border-color: #bfdbfe;
    }

    :host-context(body.light-theme) .delete-meeting-btn {
      color: #64748b !important;
    }

    :host-context(body.light-theme) .delete-meeting-btn:hover {
      background: #fee2e2 !important;
      color: #b91c1c !important;
    }
  `]
})
export class MeetingsComponent implements OnInit {
  private readonly meetingService = inject(MeetingService);
  private readonly dialog = inject(MatDialog);
  private readonly notification = inject(NotificationService);

  readonly meetings = signal<Meeting[]>([]);
  readonly loading = signal(false);
  readonly syncing = signal(false);
  readonly activeFilter = signal<'upcoming' | 'past' | 'needs_review' | 'all'>('upcoming');
  readonly selectedTimeRange = signal<string>('next_month');

  searchQuery = '';

  ngOnInit(): void {
    this.loadMeetings();
  }

  loadMeetings(): void {
    this.loading.set(true);
    this.meetingService
      .getMeetings({
        filter: this.activeFilter(),
        search: this.searchQuery,
      })
      .subscribe({
        next: (res) => {
          this.meetings.set(res);
          this.loading.set(false);
        },
        error: (err: any) => {
          this.loading.set(false);
          this.notification.error('Failed to load meetings list.');
        },
      });
  }

  setFilter(filter: 'upcoming' | 'past' | 'needs_review' | 'all'): void {
    this.activeFilter.set(filter);
    this.loadMeetings();
  }

  onSearchChange(): void {
    this.loadMeetings();
  }

  clearSearch(): void {
    this.searchQuery = '';
    this.loadMeetings();
  }

  syncCalendar(): void {
    this.syncing.set(true);
    this.meetingService.syncCalendar(this.selectedTimeRange()).subscribe({
      next: (res: any) => {
        this.syncing.set(false);
        this.notification.success(res.message || 'Google Calendar synced successfully!');
        this.loadMeetings();
      },
      error: (err: any) => {
        this.syncing.set(false);
        if (err.status === 403 && err.error?.code === 'insufficient_scopes') {
          this.notification.error('Google Calendar access missing. Please reconnect Google in Integrations.');
        } else {
          this.notification.error(err?.error?.error || 'Calendar sync failed. Make sure Google is connected.');
        }
      },
    });
  }

  toggleReminders(meeting: Meeting): void {
    const nextState = !meeting.send_reminders;
    this.meetingService.toggleReminders(meeting.id, nextState).subscribe({
      next: (updated: Meeting) => {
        meeting.send_reminders = updated.send_reminders;
        this.notification.success(nextState ? 'Reminders enabled for this meeting' : 'Reminders disabled for this meeting');
      },
      error: () => {
        this.notification.error('Failed to update reminder settings.');
      }
    });
  }

  removeMeeting(meeting: Meeting): void {
    if (!confirm(`Remove "${meeting.title}" from CRM? This meeting will be permanently excluded and will not re-sync.`)) {
      return;
    }
    this.meetingService.deleteMeeting(meeting.id).subscribe({
      next: () => {
        this.notification.success('Meeting removed and excluded from CRM.');
        this.meetings.update(list => list.filter(m => m.id !== meeting.id));
      },
      error: () => {
        this.notification.error('Failed to remove meeting.');
      }
    });
  }

  openEditDialog(meeting: Meeting): void {
    const ref = this.dialog.open(MeetingEditDialogComponent, {
      width: '560px',
      maxWidth: '95vw',
      maxHeight: '85vh',
      data: { meeting },
      panelClass: ['dark-dialog-panel', 'meeting-dialog-panel'],
    });

    ref.afterClosed().subscribe((updated) => {
      if (updated) {
        this.loadMeetings();
      }
    });
  }

  openIntelligenceDialog(meeting: Meeting): void {
    const ref = this.dialog.open(MeetingIntelligenceDialogComponent, {
      width: '780px',
      maxWidth: '95vw',
      maxHeight: '85vh',
      data: { meeting },
      panelClass: ['dark-dialog-panel', 'meeting-dialog-panel'],
    });

    ref.afterClosed().subscribe((updated) => {
      if (updated) {
        this.loadMeetings();
      }
    });
  }
}
