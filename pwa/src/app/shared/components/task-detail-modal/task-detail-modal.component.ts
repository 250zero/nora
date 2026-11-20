import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  computed,
  inject,
  signal,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { AuthService } from '../../../core/services/auth.service';
import { TaskStore } from '../../../core/stores/task.store';
import { AppIconComponent } from '../app-icon/app-icon.component';

interface TaskEditForm {
  title: string;
  description: string;
  due_date: string;
  due_time: string;
  priority: 1 | 2 | 3;
  responsible_name: string;
}

@Component({
  selector: 'app-task-detail-modal',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent],
  templateUrl: './task-detail-modal.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class TaskDetailModalComponent {
  protected readonly store = inject(TaskStore);
  protected readonly auth = inject(AuthService);

  // Toggle reactivo para desplegar la información detallada de auditoría
  readonly showAuditInfo = signal<boolean>(false);

  // Estado de edición inline (RF-07, RF-10)
  readonly isEditing = signal<boolean>(false);
  readonly isSaving = signal<boolean>(false);
  readonly titleError = signal<string | null>(null);
  readonly dateError = signal<string | null>(null);
  readonly saveError = signal<string | null>(null);
  readonly editForm = signal<TaskEditForm>({
    title: '',
    description: '',
    due_date: '',
    due_time: '',
    priority: 2,
    responsible_name: '',
  });

  // Solo el usuario creador tiene permiso para eliminar la tarea desde la agenda
  readonly isOwner = computed(() => {
    const detail = this.store.activeTaskDetail();
    const currentUser = this.auth.currentUser();
    return !!detail && !!currentUser && detail.task.owner_id === currentUser.id;
  });

  // Creador o supervisor pueden editar los detalles de la tarea
  readonly canEdit = computed(() => {
    return this.isOwner() || this.auth.isSupervisor();
  });

  toggleAuditInfo(): void {
    this.showAuditInfo.update((val) => !val);
  }

  startEditing(): void {
    const detail = this.store.activeTaskDetail();
    if (!detail || !this.canEdit()) return;
    const t = detail.task;
    this.editForm.set({
      title: t.title || '',
      description: t.description || '',
      due_date: t.due_date ? t.due_date.substring(0, 10) : '',
      due_time: t.due_time ? t.due_time.substring(0, 5) : '',
      priority: t.priority || 2,
      responsible_name: t.responsible_name || '',
    });
    this.titleError.set(null);
    this.dateError.set(null);
    this.saveError.set(null);
    this.isEditing.set(true);
  }

  cancelEditing(): void {
    this.isEditing.set(false);
    this.titleError.set(null);
    this.dateError.set(null);
    this.saveError.set(null);
  }

  updateEditField<K extends keyof TaskEditForm>(field: K, value: TaskEditForm[K]): void {
    this.editForm.update((f) => ({ ...f, [field]: value }));
    if (field === 'title') this.titleError.set(null);
    if (field === 'due_date') this.dateError.set(null);
  }

  updatePriorityField(val: string | number): void {
    const num = Number(val);
    const p: 1 | 2 | 3 = num === 3 ? 3 : num === 1 ? 1 : 2;
    this.updateEditField('priority', p);
  }

  saveEdit(): void {
    const detail = this.store.activeTaskDetail();
    if (!detail) return;

    const form = this.editForm();
    let valid = true;

    if (!form.title || form.title.trim().length === 0) {
      this.titleError.set('El título de la tarea es obligatorio.');
      valid = false;
    } else if (form.title.trim().length > 200) {
      this.titleError.set('El título no puede superar los 200 caracteres.');
      valid = false;
    }

    const cleanDate = form.due_date.trim();
    if (cleanDate && !/^\d{4}-\d{2}-\d{2}$/.test(cleanDate)) {
      this.dateError.set('Ingresa una fecha válida en formato YYYY-MM-DD.');
      valid = false;
    } else if (cleanDate) {
      const dt = new Date(`${cleanDate}T12:00:00Z`);
      if (isNaN(dt.getTime()) || dt.toISOString().slice(0, 10) !== cleanDate) {
        this.dateError.set('La fecha seleccionada no existe en el calendario.');
        valid = false;
      }
    }

    if (!valid) return;

    this.isSaving.set(true);
    this.saveError.set(null);

    this.store
      .updateTask(detail.task.id, {
        title: form.title.trim(),
        description: form.description.trim() || null,
        due_date: cleanDate || null,
        due_time: form.due_time.trim() || null,
        priority: form.priority,
        responsible_name: form.responsible_name.trim() || null,
      })
      .subscribe({
        next: () => {
          this.isSaving.set(false);
          this.isEditing.set(false);
        },
        error: (err) => {
          this.isSaving.set(false);
          this.saveError.set(err.error?.error || 'No se pudieron guardar los cambios.');
        },
      });
  }

  close(): void {
    this.showAuditInfo.set(false);
    this.isEditing.set(false);
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

  setStatus(newStatus: 1 | 2 | 3): void {
    const detail = this.store.activeTaskDetail();
    if (!detail) return;
    this.store.updateTaskStatus(detail.task, newStatus);
  }

  toggleStatus(): void {
    const detail = this.store.activeTaskDetail();
    if (!detail) return;
    const updatedStatus: 1 | 2 | 3 = detail.task.status === 3 ? 1 : 3;
    this.setStatus(updatedStatus);
  }

  getStatusLabel(status: number): string {
    switch (status) {
      case 3:
        return 'Completada';
      case 2:
        return 'En progreso';
      default:
        return 'Pendiente';
    }
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
