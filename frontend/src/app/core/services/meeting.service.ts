import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from './api.service';
import { Meeting, MeetingActionItem, MeetingAnalysis } from '../models/crm.model';

@Injectable({
  providedIn: 'root',
})
export class MeetingService {
  private readonly api = inject(ApiService);

  getMeetings(params: {
    filter?: 'upcoming' | 'past' | 'needs_review' | 'all';
    search?: string;
    contact_id?: string;
    company_id?: string;
    deal_id?: string;
  } = {}): Observable<Meeting[]> {
    return this.api.get<Meeting[]>('/meetings/', params);
  }

  getMeeting(id: string): Observable<Meeting> {
    return this.api.get<Meeting>(`/meetings/${id}/`);
  }

  updateMeeting(id: string, data: Partial<Meeting>): Observable<Meeting> {
    return this.api.patch<Meeting>(`/meetings/${id}/`, data);
  }

  syncCalendar(timeRange: string = 'next_month'): Observable<{
    status: string;
    message: string;
    synced_count: number;
    matched_count: number;
    filtered_count?: number;
  }> {
    return this.api.post('/meetings/sync/', { time_range: timeRange });
  }

  toggleReminders(id: string, sendReminders?: boolean): Observable<Meeting> {
    const payload = sendReminders !== undefined ? { send_reminders: sendReminders } : {};
    return this.api.patch<Meeting>(`/meetings/${id}/toggle-reminders/`, payload);
  }

  analyzeMeeting(
    id: string,
    payload: { notes?: string; transcript?: string }
  ): Observable<{
    status: string;
    analysis: MeetingAnalysis;
    meeting: Meeting;
  }> {
    return this.api.post(`/meetings/${id}/analyze/`, payload);
  }

  createTasksFromActionItems(
    id: string,
    actionItems?: MeetingActionItem[]
  ): Observable<{
    status: string;
    message: string;
    tasks: Array<{ id: string; title: string; due_date: string }>;
  }> {
    return this.api.post(`/meetings/${id}/create-tasks/`, { action_items: actionItems });
  }

  getUpcomingMeetings(): Observable<Meeting[]> {
    return this.api.get<Meeting[]>('/meetings/upcoming/');
  }

  deleteMeeting(id: string): Observable<void> {
    return this.api.delete<void>(`/meetings/${id}/`);
  }
}
