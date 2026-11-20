import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TaskStore } from '../../../core/stores/task.store';
import { AuthService } from '../../../core/services/auth.service';
import { AppIconComponent } from '../app-icon/app-icon.component';

@Component({
  selector: 'app-task-detail-modal',
  standalone: true,
  imports: [CommonModule, AppIconComponent],
  templateUrl: './task-detail-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDetailModalComponent {
  protected readonly store = inject(TaskStore);
  protected readonly auth = inject(AuthService);

  // Toggle reactivo para desplegar la información detallada de auditoría
  readonly showAuditInfo = signal<boolean>(false);

  // Solo el usuario creador tiene permiso para eliminar la tarea
  readonly isOwner = computed(() => {
    const detail = this.store.activeTaskDetail();
    const currentUser = this.auth.currentUser();
    return !!detail && !!currentUser && detail.task.owner_id === currentUser.id;
  });

  toggleAuditInfo(): void {
    this.showAuditInfo.update((val) => !val);
  }

  close(): void {
    this.showAuditInfo.set(false);
    this.store.closeTaskDetail();
  }

  deleteTask(): void {
    const detail = this.store.activeTaskDetail();
    if (!detail) return;

    if (!this.isOwner()) {
      alert('Solo puedes eliminar las tareas que tú mismo has creado.');
      return;
    }

    const confirmed = confirm(
      `¿Estás seguro de que deseas eliminar la tarea "${detail.task.title}"? Esta acción no se puede deshacer.`
    );
    if (confirmed) {
      this.store.deleteTask(detail.task.id);
    }
  }

  toggleStatus(): void {
    const detail = this.store.activeTaskDetail();
    if (!detail) return;
    this.store.toggleTaskStatus(detail.task);
    // Reflejar localmente en el modal
    const updatedStatus: 1 | 2 | 3 = detail.task.status === 3 ? 1 : 3;
    this.store.activeTaskDetail.set({
      ...detail,
      task: { ...detail.task, status: updatedStatus },
    });
  }

  getPriorityLabel(priority: number): string {
    switch (priority) {
      case 3:
        return 'Alta / Urgente';
      case 2:
        return 'Media';
      default:
        return 'Baja';
    }
  }

  getPriorityClass(priority: number): string {
    switch (priority) {
      case 3:
        return 'bg-red-950/80 text-red-200 border-red-800';
      case 2:
        return 'bg-amber-950/70 text-amber-200 border-amber-800';
      default:
        return 'bg-blue-950/60 text-blue-200 border-blue-800';
    }
  }
}
