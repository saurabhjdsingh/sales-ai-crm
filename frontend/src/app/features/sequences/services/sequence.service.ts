import { Injectable, inject } from '@angular/core';
import { Observable, forkJoin, of } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import {
  PaginatedResult,
  Sequence,
  SequenceDashboardMetrics,
  SequenceEmailDraft,
  SequenceEnrollment,
} from '../../../core/models/crm.model';

@Injectable({
  providedIn: 'root'
})
export class SequenceService {
  private readonly api = inject(ApiService);

  getSequences(filters?: Record<string, any>): Observable<PaginatedResult<Sequence>> {
    return this.api.get<PaginatedResult<Sequence>>('/sequences/', filters);
  }

  getSequence(id: string): Observable<Sequence> {
    return this.api.get<Sequence>(`/sequences/${id}/`);
  }

  createSequence(sequence: Partial<Sequence>): Observable<Sequence> {
    return this.api.post<Sequence>('/sequences/', sequence);
  }

  updateSequence(id: string, sequence: Partial<Sequence>): Observable<Sequence> {
    return this.api.patch<Sequence>(`/sequences/${id}/`, sequence);
  }

  deleteSequence(id: string): Observable<void> {
    return this.api.delete<void>(`/sequences/${id}/`);
  }

  duplicateSequence(id: string): Observable<Sequence> {
    return this.api.post<Sequence>(`/sequences/${id}/duplicate/`, {});
  }

  enrollContacts(sequenceId: string, payload: { contact_ids: string[]; company_id?: string; deal_id?: string }): Observable<any> {
    return this.api.post<any>(`/sequences/${sequenceId}/enroll/`, payload);
  }

  getEnrollments(filters?: Record<string, any>): Observable<PaginatedResult<SequenceEnrollment>> {
    return this.api.get<PaginatedResult<SequenceEnrollment>>('/sequences/enrollments/', filters);
  }

  pauseEnrollment(id: string): Observable<SequenceEnrollment> {
    return this.api.post<SequenceEnrollment>(`/sequences/enrollments/${id}/pause/`, {});
  }

  resumeEnrollment(id: string): Observable<SequenceEnrollment> {
    return this.api.post<SequenceEnrollment>(`/sequences/enrollments/${id}/resume/`, {});
  }

  stopEnrollment(id: string, reason?: string): Observable<SequenceEnrollment> {
    return this.api.post<SequenceEnrollment>(`/sequences/enrollments/${id}/stop/`, { reason });
  }

  sendNowEnrollment(id: string): Observable<SequenceEnrollment> {
    return this.api.post<SequenceEnrollment>(`/sequences/enrollments/${id}/send-now/`, {});
  }

  scheduleEnrollment(id: string, payload?: { send_mode?: string; manual_time_utc?: string }): Observable<SequenceEnrollment> {
    return this.api.post<SequenceEnrollment>(`/sequences/enrollments/${id}/schedule/`, payload || {});
  }

  bulkPauseEnrollments(ids: string[]): Observable<any> {
    if (!ids || ids.length === 0) return of([]);
    return forkJoin(ids.map(id => this.pauseEnrollment(id)));
  }

  bulkResumeEnrollments(ids: string[]): Observable<any> {
    if (!ids || ids.length === 0) return of([]);
    return forkJoin(ids.map(id => this.resumeEnrollment(id)));
  }

  bulkStopEnrollments(ids: string[], reason?: string): Observable<any> {
    if (!ids || ids.length === 0) return of([]);
    return forkJoin(ids.map(id => this.stopEnrollment(id, reason)));
  }

  getApprovalQueue(): Observable<PaginatedResult<SequenceEmailDraft>> {
    return this.api.get<PaginatedResult<SequenceEmailDraft>>('/sequences/approvals/');
  }

  approveDraft(id: string, payload?: { subject?: string; reply_to?: string; body_html?: string; body_text?: string; send_now?: boolean; send_mode?: string; manual_time_utc?: string }): Observable<SequenceEmailDraft> {
    return this.api.post<SequenceEmailDraft>(`/sequences/approvals/${id}/approve/`, payload || {});
  }

  sendNowDraft(id: string): Observable<SequenceEmailDraft> {
    return this.api.post<SequenceEmailDraft>(`/sequences/approvals/${id}/send-now/`, {});
  }

  regenerateDraft(id: string, feedback: string): Observable<SequenceEmailDraft> {
    return this.api.post<SequenceEmailDraft>(`/sequences/approvals/${id}/regenerate/`, { feedback });
  }

  rejectDraft(id: string, reason?: string, stopEnrollment: boolean = true): Observable<SequenceEmailDraft> {
    return this.api.post<SequenceEmailDraft>(`/sequences/approvals/${id}/reject/`, { reason, stop_enrollment: stopEnrollment });
  }

  getScheduleSettings(): Observable<any> {
    return this.api.get<any>('/sequences/schedule-settings/');
  }

  updateScheduleSettings(settings: any): Observable<any> {
    return this.api.patch<any>('/sequences/schedule-settings/', settings);
  }

  getDashboardMetrics(sequenceId?: string): Observable<SequenceDashboardMetrics> {
    const params = sequenceId ? { sequence_id: sequenceId } : undefined;
    return this.api.get<SequenceDashboardMetrics>('/sequences/dashboard/', params);
  }
}
