import { computed, inject, Injectable, signal } from '@angular/core';
import { Observable, tap } from 'rxjs';
import { Task, TaskDetailResponse } from '../models/task.model';
import { ApiService } from '../services/api.service';

export type CalendarViewType = 'day' | 'week' | 'month';
export type TaskTimeScope = 'all' | 'today' | 'upcoming' | 'overdue' | 'completed';

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

  // Filtros de navegación y clasificación (RF-06, RF-09)
  readonly selectedView = signal<CalendarViewType>('month');
  readonly selectedDate = signal<Date>(new Date());
  readonly searchQuery = signal<string>('');
  readonly filterUserId = signal<string | null>(null);
  readonly filterTimeScope = signal<TaskTimeScope>('all');
  readonly filterPriority = signal<number | null>(null);

  // Tarea activa para modal de detalle
  readonly activeTaskDetail = signal<TaskDetailResponse | null>(null);
  readonly isDetailLoading = signal<boolean>(false);

  // Lista base tras búsqueda, usuario y prioridad (antes de alcance temporal)
  readonly baseFilteredTasks = computed(() => {
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
    const priority = this.filterPriority();
    if (priority !== null) {
      list = list.filter((t) => t.priority === priority);
    }
    return list;
  });

  // Contadores para vistas Hoy / Próximas / Vencidas / Completadas (RF-06)
  readonly scopeCounts = computed(() => {
    const todayStr = this.formatDateIso(new Date());
    const base = this.baseFilteredTasks();
    let today = 0;
    let upcoming = 0;
    let overdue = 0;
    let completed = 0;

    for (const t of base) {
      const due = t.due_date ? t.due_date.substring(0, 10) : '';
      if (t.status === 3) {
        completed++;
      } else if (due === todayStr) {
        today++;
      } else if (due && due < todayStr) {
        overdue++;
      } else {
        upcoming++;
      }
    }

    return {
      all: base.length,
      today,
      upcoming,
      overdue,
      completed,
    };
  });

  // Tareas filtradas combinando alcance temporal, prioridad, usuario y texto
  readonly filteredTasks = computed(() => {
    const base = this.baseFilteredTasks();
    const scope = this.filterTimeScope();
    if (scope === 'all') {
      return base;
    }

    const todayStr = this.formatDateIso(new Date());
    return base.filter((t) => {
      const due = t.due_date ? t.due_date.substring(0, 10) : '';
      switch (scope) {
        case 'completed':
          return t.status === 3;
        case 'today':
          return t.status !== 3 && due === todayStr;
        case 'overdue':
          return t.status !== 3 && due !== '' && due < todayStr;
        case 'upcoming':
          return t.status !== 3 && (due === '' || due > todayStr);
        default:
          return true;
      }
    });
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
    return this.filteredTasks().filter(
      (t) => (t.due_date ? t.due_date.substring(0, 10) : '') === todayStr
    );
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

    this.api.get<{ tasks: Task[] }>('tasks', params).subscribe({
      next: (res) => {
        const list = [...(res.tasks || [])];
        this.tasks.set(list);
        this.saveTasksToCache(list);
        this.isLoading.set(false);
      },
      error: () => {
        if (this.tasks().length > 0) {
          this.errorMessage.set('Modo sin conexión: mostrando tareas guardadas localmente.');
        } else {
          this.errorMessage.set('Error al sincronizar tareas con el backend.');
        }
        this.isLoading.set(false);
      },
    });
  }

  // Refresca la lista de tareas restableciendo filtros que ocultarían nuevas tareas
  refreshAndClearFilter(): void {
    if (this.filterUserId()) {
      this.filterUserId.set(null);
    }
    this.loadTasks();
  }

  // Cambio optimista explícito entre Pendiente (1), En Progreso (2) y Hecha (3) — RF-08
  updateTaskStatus(task: Task, newStatus: 1 | 2 | 3): void {
    const oldStatus = task.status;
    if (oldStatus === newStatus) return;

    this.tasks.update((items) =>
      items.map((t) => (t.id === task.id ? { ...t, status: newStatus } : t))
    );

    const activeDetail = this.activeTaskDetail();
    if (activeDetail && activeDetail.task.id === task.id) {
      this.activeTaskDetail.set({
        ...activeDetail,
        task: { ...activeDetail.task, status: newStatus },
      });
    }

    this.api.patch<{ task: Task }>(`tasks/${task.id}/status`, { status: newStatus }).subscribe({
      next: (res) => {
        if (res.task) {
          this.tasks.update((items) =>
            items.map((t) => (t.id === task.id ? { ...t, ...res.task } : t))
          );
          this.saveTasksToCache(this.tasks());
        }
      },
      error: () => {
        // Rollback en caso de fallo
        this.tasks.update((items) =>
          items.map((t) => (t.id === task.id ? { ...t, status: oldStatus } : t))
        );
        const detail = this.activeTaskDetail();
        if (detail && detail.task.id === task.id) {
          this.activeTaskDetail.set({
            ...detail,
            task: { ...detail.task, status: oldStatus },
          });
        }
      },
    });
  }

  // Toggle optimista rápido entre Hecha (3) y Pendiente (1)
  toggleTaskStatus(task: Task): void {
    const newStatus: 1 | 2 | 3 = task.status === 3 ? 1 : 3;
    this.updateTaskStatus(task, newStatus);
  }

  // Actualización completa de tarea (título, descripción, fecha, hora, prioridad, responsable, estado) — RF-07
  updateTask(taskId: string, changes: Partial<Task>): Observable<{ task: Task }> {
    return this.api.put<{ task: Task }>(`tasks/${taskId}`, changes).pipe(
      tap((res) => {
        if (res.task) {
          this.tasks.update((items) =>
            items.map((t) => (t.id === taskId ? { ...t, ...res.task } : t))
          );
          this.saveTasksToCache(this.tasks());
          const detail = this.activeTaskDetail();
          if (detail && detail.task.id === taskId) {
            this.activeTaskDetail.set({
              ...detail,
              task: { ...detail.task, ...res.task },
              audit_detail: {
                ...detail.audit_detail,
                last_updated: res.task.updated_at || new Date().toISOString(),
              },
            });
          }
        }
      })
    );
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

  // Eliminar tarea (solo creador o supervisor)
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
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: 'America/Santo_Domingo',
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
      }).format(date);
    } catch {
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const d = String(date.getDate()).padStart(2, '0');
      return `${y}-${m}-${d}`;
    }
  }
}
