import { computed, inject, Injectable, signal } from '@angular/core';
import { Task, TaskDetailResponse } from '../models/task.model';
import { ApiService } from '../services/api.service';

export type CalendarViewType = 'day' | 'week' | 'month';

@Injectable({
  providedIn: 'root',
})
export class TaskStore {
  private readonly api = inject(ApiService);

  // Estado reactivo (Signals)
  readonly tasks = signal<Task[]>([]);
  readonly isLoading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

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
      const key = t.due_date || 'sin_fecha';
      const current = map.get(key) || [];
      current.push(t);
      map.set(key, current);
    }
    return map;
  });

  // Tareas de Hoy
  readonly todayTasks = computed(() => {
    const todayStr = this.formatDateIso(new Date());
    return this.filteredTasks().filter((t) => t.due_date === todayStr);
  });

  // Métodos de carga
  loadTasks(): void {
    this.isLoading.set(true);
    this.errorMessage.set(null);

    const year = this.selectedDate().getFullYear();
    const month = this.selectedDate().getMonth() + 1;

    this.api
      .get<{ tasks: Task[] }>('tasks', {
        user_id: this.filterUserId() || '',
        search: this.searchQuery() || '',
      })
      .subscribe({
        next: (res) => {
          this.tasks.set(res.tasks || []);
          this.isLoading.set(false);
        },
        error: (err) => {
          this.errorMessage.set('Error al sincronizar tareas con el backend.');
          this.isLoading.set(false);
        },
      });
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
