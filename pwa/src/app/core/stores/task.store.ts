import { computed, inject, Injectable, signal } from '@angular/core';
import { Task, TaskDetailResponse } from '../models/task.model';
import { ApiService } from '../services/api.service';

export type CalendarViewType = 'day' | 'week' | 'month';

const OFFLINE_CACHE_KEY = 'nora_offline_tasks_cache_v1';

@Injectable({
  providedIn: 'root',
})
export class TaskStore {
  private readonly api = inject(ApiService);

  // Estado reactivo (Signals)
  readonly tasks = signal<Task[]>(this.getInitialCachedTasks());
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);
  readonly isOnline = signal<boolean>(typeof navigator !== 'undefined' ? navigator.onLine : true);

  constructor() {
    if (typeof window !== 'undefined') {
      window.addEventListener('online', () => this.isOnline.set(true));
      window.addEventListener('offline', () => this.isOnline.set(false));
    }
  }

  private getInitialCachedTasks(): Task[] {
    if (typeof localStorage === 'undefined') return [];
    try {
      const raw = localStorage.getItem(OFFLINE_CACHE_KEY);
      return raw ? JSON.parse(raw) : [];
    } catch {
      return [];
    }
  }

  private saveTasksToCache(tasks: Task[]): void {
    if (typeof localStorage === 'undefined') return;
    try {
      localStorage.setItem(OFFLINE_CACHE_KEY, JSON.stringify(tasks));
    } catch {}
  }

  // Filtros de navegación
  readonly selectedView = signal<CalendarViewType>('month');
  readonly selectedDate = signal<Date>(new Date());
  readonly searchQuery = signal<string>('');
  readonly filterUserId = signal<string | null>(null);

  // Tarea activa para modal de detalle
  readonly activeTaskDetail = signal<TaskDetailResponse | null>(null);
  readonly isDetailLoading = signal<boolean>(false);

  // Computados
  readonly filteredTasks = computed(() => {
    let list = this.tasks();
    const query = this.searchQuery().toLowerCase().trim();
    if (query) {
      list = list.filter(
        (t) =>
          t.title.toLowerCase().includes(query) ||
          (t.description && t.description.toLowerCase().includes(query)) ||
          (t.responsible_name && t.responsible_name.toLowerCase().includes(query))
      );
    }
    const user = this.filterUserId();
    if (user) {
      list = list.filter((t) => t.owner_id === user || t.assignee_id === user);
    }
    return list;
  });

  // Tareas agrupadas por fecha (YYYY-MM-DD)
  readonly tasksByDate = computed(() => {
    const map = new Map<string, Task[]>();
    for (const t of this.filteredTasks()) {
      const key = t.due_date ? t.due_date.substring(0, 10) : 'sin_fecha';
      const current = map.get(key) || [];
      current.push(t);
      map.set(key, current);
    }
    return map;
  });

  // Tareas de Hoy
  readonly todayTasks = computed(() => {
    const todayStr = this.formatDateIso(new Date());
    return this.filteredTasks().filter((t) => (t.due_date ? t.due_date.substring(0, 10) : '') === todayStr);
  });

  // Métodos de carga
  loadTasks(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const params: Record<string, string> = {};
    const filterUser = this.filterUserId();
    if (filterUser) {
      params['user_id'] = filterUser;
    }
    const query = this.searchQuery();
    if (query) {
      params['search'] = query;
    }

    this.api
      .get<{ tasks: Task[] }>('tasks', params)
      .subscribe({
        next: (res) => {
          const list = [...(res.tasks || [])];
          this.tasks.set(list);
          this.saveTasksToCache(list);
          this.isLoading.set(false);
        },
        error: (err) => {
          if (this.tasks().length > 0) {
            this.errorMessage.set('Modo sin conexión: mostrando tareas guardadas localmente.');
          } else {
            this.errorMessage.set('Error al sincronizar tareas con el backend.');
          }
          this.isLoading.set(false);
        },
      });
  }

  // Refresca la lista de tareas restableciendo cualquier filtro de usuario para asegurar que las nuevas tareas se pinten de inmediato
  refreshAndClearFilter(): void {
    if (this.filterUserId()) {
      this.filterUserId.set(null);
    }
    this.loadTasks();
  }

  // Toggle optimista de estado completada
  toggleTaskStatus(task: Task): void {
    const oldStatus = task.status;
    const newStatus: 1 | 2 | 3 = oldStatus === 3 ? 1 : 3;

    // Actualización optimista inmediata en Signal
    this.tasks.update((items) =>
      items.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );

    // Llamada al backend
    this.api.patch<{ task: Task }>(`tasks/${task.id}/status`, { status: newStatus }).subscribe({
      next: (res) => {
        // Confirmado por backend
      },
      error: () => {
        // Rollback en caso de fallo
        this.tasks.update((items) =>
          items.map((t) => (t.id === task.id ? { ...t, status: oldStatus } : t))
        );
      },
    });
  }

  // Cargar información detallada de una tarea
  loadTaskDetail(taskId: string): void {
    this.isDetailLoading.set(true);
    this.api.get<TaskDetailResponse>(`tasks/${taskId}/detail`).subscribe({
      next: (res) => {
        this.activeTaskDetail.set(res);
        this.isDetailLoading.set(false);
      },
      error: () => {
        this.isDetailLoading.set(false);
      },
    });
  }

  closeTaskDetail(): void {
    this.activeTaskDetail.set(null);
  }

  // Eliminar tarea (solo creador)
  deleteTask(taskId: string): void {
    this.api.delete<{ success: boolean; message?: string }>(`tasks/${taskId}`).subscribe({
      next: () => {
        this.tasks.update((items) => items.filter((t) => t.id !== taskId));
        this.saveTasksToCache(this.tasks());
        this.closeTaskDetail();
      },
      error: (err) => {
        alert(err.error?.error || 'No tienes permiso para eliminar esta tarea.');
      },
    });
  }

  // Navegación de fechas
  goToToday(): void {
    this.selectedDate.set(new Date());
    this.loadTasks();
  }

  previousMonth(): void {
    const current = this.selectedDate();
    this.selectedDate.set(new Date(current.getFullYear(), current.getMonth() - 1, 1));
    this.loadTasks();
  }

  nextMonth(): void {
    const current = this.selectedDate();
    this.selectedDate.set(new Date(current.getFullYear(), current.getMonth() + 1, 1));
    this.loadTasks();
  }

  setView(view: CalendarViewType): void {
    this.selectedView.set(view);
  }

  private formatDateIso(date: Date): string {
    const y = date.getFullYear();
    const m = String(date.getMonth() + 1).padStart(2, '0');
    const d = String(date.getDate()).padStart(2, '0');
    return `${y}-${m}-${d}`;
  }
}
