import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  OnInit,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Task } from '../../core/models/task.model';
import { AuthService } from '../../core/services/auth.service';
import { CalendarViewType, TaskStore } from '../../core/stores/task.store';
import { AppIconComponent } from '../../shared/components/app-icon/app-icon.component';
import { TaskDetailModalComponent } from '../../shared/components/task-detail-modal/task-detail-modal.component';

interface CalendarDay {
  date: Date;
  dateString: string;
  dayNumber: number;
  isCurrentMonth: boolean;
  isToday: boolean;
  tasks: Task[];
}

@Component({
  selector: 'app-agenda',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, TaskDetailModalComponent],
  templateUrl: './agenda.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AgendaComponent implements OnInit {
  protected readonly store = inject(TaskStore);
  protected readonly auth = inject(AuthService);

  readonly daysOfWeek = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
  readonly hoursOfDay = [8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19, 20];

  ngOnInit(): void {
    this.store.loadTasks();
  }

  // Título del mes actual (ej: "Noviembre 2026")
  readonly monthTitle = computed(() => {
    const d = this.store.selectedDate();
    return d.toLocaleDateString('es-DO', { month: 'long', year: 'numeric' });
  });

  // Generación de la matriz de días para el modo Mes
  readonly monthCalendarDays = computed<CalendarDay[]>(() => {
    const date = this.store.selectedDate();
    const year = date.getFullYear();
    const month = date.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);

    const startingDayOfWeek = firstDayOfMonth.getDay(); // 0 = Domingo
    const totalDaysInMonth = lastDayOfMonth.getDate();

    const days: CalendarDay[] = [];
    const todayStr = this.formatIsoDate(new Date());

    // Días del mes anterior para rellenar
    const prevMonthLastDay = new Date(year, month, 0).getDate();
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      const prevDate = new Date(year, month - 1, prevMonthLastDay - i);
      const iso = this.formatIsoDate(prevDate);
      days.push({
        date: prevDate,
        dateString: iso,
        dayNumber: prevDate.getDate(),
        isCurrentMonth: false,
        isToday: iso === todayStr,
        tasks: this.store.tasksByDate().get(iso) || [],
      });
    }

    // Días del mes actual
    for (let i = 1; i <= totalDaysInMonth; i++) {
      const currentDate = new Date(year, month, i);
      const iso = this.formatIsoDate(currentDate);
      days.push({
        date: currentDate,
        dateString: iso,
        dayNumber: i,
        isCurrentMonth: true,
        isToday: iso === todayStr,
        tasks: this.store.tasksByDate().get(iso) || [],
      });
    }

    // Días del siguiente mes para completar grilla de 35 o 42 celdas
    const remaining = (7 - (days.length % 7)) % 7;
    for (let i = 1; i <= remaining; i++) {
      const nextDate = new Date(year, month + 1, i);
      const iso = this.formatIsoDate(nextDate);
      days.push({
        date: nextDate,
        dateString: iso,
        dayNumber: i,
        isCurrentMonth: false,
        isToday: iso === todayStr,
        tasks: this.store.tasksByDate().get(iso) || [],
      });
    }

    return days;
  });

  // Días para el modo Semana
  readonly weekCalendarDays = computed<CalendarDay[]>(() => {
    const date = this.store.selectedDate();
    const currentDay = date.getDay();
    const startOfWeek = new Date(date);
    startOfWeek.setDate(date.getDate() - currentDay); // Domingo

    const days: CalendarDay[] = [];
    const todayStr = this.formatIsoDate(new Date());

    for (let i = 0; i < 7; i++) {
      const d = new Date(startOfWeek);
      d.setDate(startOfWeek.getDate() + i);
      const iso = this.formatIsoDate(d);
      days.push({
        date: d,
        dateString: iso,
        dayNumber: d.getDate(),
        isCurrentMonth: d.getMonth() === date.getMonth(),
        isToday: iso === todayStr,
        tasks: this.store.tasksByDate().get(iso) || [],
      });
    }
    return days;
  });

  // Tareas para el modo Día
  readonly dayTasks = computed<Task[]>(() => {
    const iso = this.formatIsoDate(this.store.selectedDate());
    return this.store.tasksByDate().get(iso) || [];
  });

  // Tareas de todo el día o sin hora fija para la vista de Día
  readonly allDayTasks = computed<Task[]>(() => {
    return this.dayTasks().filter((t) => !t.due_time);
  });

  openTaskDetail(task: Task, event: Event): void {
    event.stopPropagation();
    this.store.loadTaskDetail(task.id);
  }

  changeView(view: CalendarViewType): void {
    this.store.setView(view);
  }

  formatHour(hour: number): string {
    return hour < 10 ? `0${hour}:00` : `${hour}:00`;
  }

  isTaskInHour(task: Task, hour: number): boolean {
    if (!task.due_time) return false;
    const hourPrefix = hour < 10 ? `0${hour}` : `${hour}`;
    return task.due_time.startsWith(hourPrefix);
  }

  getTaskPillClass(task: Task): string {
    if (task.status === 3) {
      return 'bg-emerald-950/70 text-emerald-300 border-emerald-800 line-through opacity-70';
    }
    switch (task.priority) {
      case 3:
        return 'bg-red-950/80 text-red-200 border-red-800 font-semibold';
      case 2:
        return 'bg-amber-950/70 text-amber-200 border-amber-800';
      default:
        return 'bg-blue-950/60 text-blue-200 border-blue-800';
    }
  }

  private formatIsoDate(d: Date): string {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }
}
