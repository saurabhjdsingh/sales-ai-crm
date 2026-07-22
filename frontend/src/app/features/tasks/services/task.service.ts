import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { ApiService } from '../../../core/services/api.service';
import { PaginatedResult, Task } from '../../../core/models/crm.model';

@Injectable({
  providedIn: 'root'
})
export class TaskService {
  private readonly api = inject(ApiService);

  getTasks(filters?: Record<string, any>): Observable<PaginatedResult<Task>> {
    return this.api.get<PaginatedResult<Task>>('/tasks/', filters);
  }

  getTodayTasks(): Observable<Task[]> {
    return this.api.get<Task[]>('/tasks/today/');
  }

  getOverdueTasks(): Observable<Task[]> {
    return this.api.get<Task[]>('/tasks/overdue/');
  }

  getTask(id: string): Observable<Task> {
    return this.api.get<Task>(`/tasks/${id}/`);
  }

  createTask(task: Partial<Task>): Observable<Task> {
    return this.api.post<Task>('/tasks/', task);
  }

  updateTask(id: string, task: Partial<Task>): Observable<Task> {
    return this.api.patch<Task>(`/tasks/${id}/`, task);
  }

  deleteTask(id: string): Observable<void> {
    return this.api.delete<void>(`/tasks/${id}/`);
  }

  bulkDeleteTasks(ids: string[]): Observable<void> {
    return this.api.post<void>('/tasks/bulk-delete/', { ids });
  }

  completeTask(id: string, payload?: { outcome?: string; outcome_notes?: string; stop_sequence?: boolean; stop_reason?: string }): Observable<Task> {
    return this.api.post<Task>(`/tasks/${id}/complete/`, payload || {});
  }
}
