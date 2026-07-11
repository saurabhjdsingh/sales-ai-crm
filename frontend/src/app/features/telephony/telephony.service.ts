import { Injectable, inject } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { Observable } from 'rxjs';
import { PaginatedResult } from '../../core/models/crm.model';

export interface TelephonySettings {
  id?: string;
  provider_type: string;
  name: string;
  account_sid: string;
  application_sid: string;
  phone_number: string;
  connection_status?: string;
  transcription_provider: string;
  api_key?: string;
  api_secret?: string;
  transcription_key?: string;
  webhook_url?: string;
}

@Injectable({
  providedIn: 'root'
})
export class TelephonyService {
  private readonly apiService = inject(ApiService);

  /**
   * Fetch active provider configuration.
   */
  getSettings(): Observable<TelephonySettings[]> {
    return this.apiService.get<TelephonySettings[]>('/telephony/settings/');
  }

  /**
   * Save or update provider configuration.
   */
  saveSettings(settings: TelephonySettings): Observable<TelephonySettings> {
    if (settings.id) {
      return this.apiService.put<TelephonySettings>(`/telephony/settings/${settings.id}/`, settings);
    }
    return this.apiService.post<TelephonySettings>('/telephony/settings/', settings);
  }

  /**
   * Run remote credential checks.
   */
  testConnection(providerId: string): Observable<{ connected: boolean; status: string }> {
    return this.apiService.post<{ connected: boolean; status: string }>(
      `/telephony/settings/${providerId}/test-connection/`,
      {}
    );
  }

  /**
   * Create Call record on backend.
   */
  initiateCall(payload: { phone: string; contact_id?: string; deal_id?: string; ai_assist_enabled?: boolean }): Observable<any> {
    return this.apiService.post<any>('/telephony/calls/initiate/', payload);
  }

  /**
   * Fetch recent calls logs list.
   */
  getRecentCalls(filters?: Record<string, any>): Observable<PaginatedResult<any>> {
    return this.apiService.get<PaginatedResult<any>>('/telephony/calls/', filters);
  }

  /**
   * Retrieve specific logged Call detail.
   */
  getCallDetail(id: string): Observable<any> {
    return this.apiService.get<any>(`/telephony/calls/${id}/`);
  }

  /**
   * Transcribe Call chunk using backend integrations.
   */
  uploadAudioChunk(callId: string, audioBlob: Blob): Observable<any> {
    const formData = new FormData();
    formData.append('audio', audioBlob, 'chunk.webm');
    return this.apiService.post<any>(`/telephony/calls/${callId}/transcribe-chunk/`, formData);
  }

  /**
   * Trigger LLM final call summarization.
   */
  summarizeCall(callId: string): Observable<any> {
    return this.apiService.post<any>(`/telephony/calls/${callId}/summarize/`, {});
  }

  /**
   * Log call activity and create approved follow-up tasks in the CRM.
   */
  confirmPostCallReview(callId: string, reviewData: any): Observable<any> {
    return this.apiService.post<any>(`/telephony/calls/${callId}/confirm/`, reviewData);
  }

  /**
   * Search for Contact details card using phone number lookup.
   */
  lookupPhoneNumber(phone: string): Observable<any> {
    return this.apiService.get<any>('/telephony/lookup/', { phone });
  }
}
