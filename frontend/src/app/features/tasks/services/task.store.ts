import { Injectable, inject, signal, computed } from '@angular/core';
import { TaskService } from './task.service';
import { Task } from '../../../core/models/crm.model';
import { finalize, tap } from 'rxjs';
import { NotificationService } from '../../../core/services/notification.service';

@Injectable({
  providedIn: 'root'
})
export class TaskStore {
  private readonly taskService = inject(TaskService);
  private readonly notification = inject(NotificationService);

  // State
  private readonly _tasks = signal<Task[]>([]);
  private readonly _todayTasks = signal<Task[]>([]);
  private readonly _overdueTasks = signal<Task[]>([]);
  private readonly _loading = signal<boolean>(false);
  private readonly _totalCount = signal<number>(0);
  private readonly _page = signal<number>(1);
  private readonly _filters = signal<Record<string, any>>({});

  // Selectors
  readonly tasks = computed(() => this._tasks());
  readonly todayTasks = computed(() => this._todayTasks());
  readonly overdueTasks = computed(() => this._overdueTasks());
  readonly loading = computed(() => this._loading());
  readonly totalCount = computed(() => this._totalCount());
  readonly page = computed(() => this._page());
  readonly filters = computed(() => this._filters());

  loadTasks(page = 1, filters = this._filters()): void {
    this._loading.set(true);
    this._page.set(page);
    this._filters.set(filters);

    this.taskService.getTasks({ page, ...filters }).pipe(
      tap((res) => {
        this._tasks.set(res.results);
        this._totalCount.set(res.count);
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to load tasks')
    });
  }

  loadTodayTasks(): void {
    this.taskService.getTodayTasks().subscribe({
      next: (res) => this._todayTasks.set(res),
      error: () => this.notification.error('Failed to load today\'s tasks')
    });
  }

  loadOverdueTasks(): void {
    this.taskService.getOverdueTasks().subscribe({
      next: (res) => this._overdueTasks.set(res),
      error: () => this.notification.error('Failed to load overdue tasks')
    });
  }

  createTask(task: Partial<Task>, callback?: () => void): void {
    this._loading.set(true);
    this.taskService.createTask(task).pipe(
      tap((newTask) => {
        this._tasks.update((list) => [newTask, ...list]);
        this.notification.success('Task created successfully');
        this.loadTodayTasks(); // Refresh summary lists
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: (err) => {
        const msg = err.error?.error?.message || 'Failed to create task';
        this.notification.error(msg);
      }
    });
  }

  updateTask(id: string, updates: Partial<Task>, callback?: () => void): void {
    this._loading.set(true);
    this.taskService.updateTask(id, updates).pipe(
      tap((updated) => {
        this._tasks.update((list) => list.map((t) => (t.id === id ? updated : t)));
        this.notification.success('Task updated successfully');
        this.loadTodayTasks();
        this.loadOverdueTasks();
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: (err) => {
        const msg = err.error?.error?.message || 'Failed to update task';
        this.notification.error(msg);
      }
    });
  }

  deleteTask(id: string, callback?: () => void): void {
    this._loading.set(true);
    this.taskService.deleteTask(id).pipe(
      tap(() => {
        this._tasks.update((list) => list.filter((t) => t.id !== id));
        this.notification.success('Task deleted successfully');
        this.loadTodayTasks();
        this.loadOverdueTasks();
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to delete task')
    });
  }

  bulkDeleteTasks(ids: string[], callback?: () => void): void {
    this._loading.set(true);
    this.taskService.bulkDeleteTasks(ids).pipe(
      tap(() => {
        this._tasks.update((list) => list.filter((t) => !ids.includes(t.id)));
        this.notification.success('Selected tasks deleted successfully');
        this.loadTodayTasks();
        this.loadOverdueTasks();
        if (callback) callback();
      }),
      finalize(() => this._loading.set(false))
    ).subscribe({
      error: () => this.notification.error('Failed to delete selected tasks')
    });
  }

  completeTask(id: string): void {
    this.taskService.completeTask(id).subscribe({
      next: (updatedTask) => {
        this._tasks.update((list) => list.map((t) => (t.id === id ? updatedTask : t)));
        this._todayTasks.update((list) => list.filter((t) => t.id !== id));
        this._overdueTasks.update((list) => list.filter((t) => t.id !== id));
        this.notification.success('Task marked as completed');
      },
      error: () => this.notification.error('Failed to mark task as completed')
    });
  }
}
