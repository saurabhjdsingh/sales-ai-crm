import { Injectable, computed, inject, signal } from '@angular/core';
import { SequenceService } from '../services/sequence.service';
import {
  Sequence,
  SequenceDashboardMetrics,
  SequenceEmailDraft,
  SequenceEnrollment,
} from '../../../core/models/crm.model';

@Injectable({
  providedIn: 'root'
})
export class SequenceStore {
  private readonly sequenceService = inject(SequenceService);

  // Private writable signals
  private readonly _sequences = signal<Sequence[]>([]);
  private readonly _currentSequence = signal<Sequence | null>(null);
  private readonly _enrollments = signal<SequenceEnrollment[]>([]);
  private readonly _pendingDrafts = signal<SequenceEmailDraft[]>([]);
  private readonly _metrics = signal<SequenceDashboardMetrics | null>(null);
  private readonly _loading = signal<boolean>(false);
  private readonly _error = signal<string | null>(null);

  // Public read-only computed signals
  readonly sequences = computed(() => this._sequences());
  readonly currentSequence = computed(() => this._currentSequence());
  readonly enrollments = computed(() => this._enrollments());
  readonly pendingDrafts = computed(() => this._pendingDrafts());
  readonly pendingCount = computed(() => this._pendingDrafts().length);
  readonly metrics = computed(() => this._metrics());
  readonly loading = computed(() => this._loading());
  readonly error = computed(() => this._error());

  loadSequences(filters?: Record<string, any>): void {
    this._loading.set(true);
    this._error.set(null);
    this.sequenceService.getSequences(filters).subscribe({
      next: (res) => {
        this._sequences.set(res.results || []);
        this._loading.set(false);
      },
      error: (err) => {
        this._error.set(err.message || 'Failed to load sequences');
        this._loading.set(false);
      }
    });
  }

  loadSequence(id: string): void {
    this._loading.set(true);
    this.sequenceService.getSequence(id).subscribe({
      next: (seq) => {
        this._currentSequence.set(seq);
        this._loading.set(false);
      },
      error: (err) => {
        this._error.set(err.message || 'Failed to load sequence');
        this._loading.set(false);
      }
    });
  }

  loadApprovalQueue(): void {
    this.sequenceService.getApprovalQueue().subscribe({
      next: (res) => {
        this._pendingDrafts.set(res.results || []);
      },
      error: (err) => {
        console.error('Error loading approval queue:', err);
      }
    });
  }

  loadDashboardMetrics(sequenceId?: string): void {
    this.sequenceService.getDashboardMetrics(sequenceId).subscribe({
      next: (m) => {
        this._metrics.set(m);
      },
      error: (err) => {
        console.error('Error loading sequence dashboard metrics:', err);
      }
    });
  }
}
