import {
  ChangeDetectionStrategy,
  Component,
  inject,
  signal,
} from '@angular/core';
import { CommonModule } from '@angular/common';
import { TaskStore } from '../../../core/stores/task.store';
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

  // Toggle reactivo para desplegar la información detallada de auditoría
  readonly showAuditInfo = signal<boolean>(false);

  toggleAuditInfo(): void {
    this.showAuditInfo.update((val) => !val);
  }

  close(): void {
    this.showAuditInfo.set(false);
    this.store.closeTaskDetail();
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
