import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AppIconComponent } from '../../shared/components/app-icon/app-icon.component';
import { DataTableComponent, DataTableColumn } from '../../shared/components/data-table';

export interface UserListItem {
  id: string;
  display_name: string;
  email: string;
  timezone: string;
  role: number;
  role_label: string;
  tasks_stats: {
    total: number;
    pending: number;
    completed: number;
  };
  created_at: string;
}

export interface UserTaskItem {
  id: string;
  title: string;
  description?: string;
  due_date?: string;
  due_time?: string;
  priority: 1 | 2 | 3;
  status: 1 | 2 | 3;
  source: 1 | 2;
  responsible_name?: string;
  owner_id?: string;
  assignee_id?: string;
}

@Component({
  selector: 'app-users-admin',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent, DataTableComponent],
  templateUrl: './users-admin.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class UsersAdminComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly users = signal<UserListItem[]>([]);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);

  // Selector de vista: Cuadrícula de Tarjetas vs Tabla con Datatable
  readonly viewMode = signal<'grid' | 'table'>('grid');

  // Columnas tipadas para el DataTable de Usuarios
  readonly userColumns: DataTableColumn<UserListItem>[] = [
    { key: 'display_name', label: 'Colaborador', sortable: true },
    { key: 'email', label: 'Correo Electrónico', sortable: true },
    { key: 'role_label', label: 'Rol', sortable: true, width: '120px' },
    { key: 'tasks_stats', label: 'Tareas (Pend / Comp / Total)', sortable: false, width: '200px' },
    { key: 'created_at', label: 'Fecha Registro', sortable: true, width: '140px' },
    { key: 'id', label: 'Acciones', sortable: false, align: 'right', width: '140px' },
  ];

  // ==================== MODAL CREAR USUARIO ====================
  readonly isCreateModalOpen = signal<boolean>(false);
  readonly creatingUser = signal<boolean>(false);
  readonly createUserError = signal<string | null>(null);
  readonly createUserSuccess = signal<string | null>(null);
  readonly newUserForm = signal<{
    display_name: string;
    email: string;
    password: string;
    role: 1 | 2;
  }>({
    display_name: '',
    email: '',
    password: '',
    role: 1,
  });

  // ==================== DRILL-DOWN DE TAREAS ====================
  readonly selectedUser = signal<UserListItem | null>(null);
  readonly selectedUserTasks = signal<UserTaskItem[]>([]);
  readonly loadingTasks = signal<boolean>(false);

  // ==================== MODAL EDITAR TAREA ====================
  readonly editingTask = signal<UserTaskItem | null>(null);
  readonly savingTask = signal<boolean>(false);
  readonly editTaskForm = signal<{
    title: string;
    description: string;
    due_date: string;
    due_time: string;
    priority: 1 | 2 | 3;
    status: 1 | 2 | 3;
    assignee_id: string;
  }>({
    title: '',
    description: '',
    due_date: '',
    due_time: '',
    priority: 2,
    status: 1,
    assignee_id: '',
  });

  // ==================== MODAL BORRADO DE USUARIO ====================
  readonly userToDelete = signal<UserListItem | null>(null);
  readonly deleting = signal<boolean>(false);

  ngOnInit(): void {
    this.loadUsers();
  }

  loadUsers(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api.get<{ users: UserListItem[] }>('users').subscribe({
      next: (res) => {
        this.users.set(res.users || []);
        this.loading.set(false);
      },
      error: (err) => {
        this.error.set(err.error?.error || 'No se pudieron cargar los usuarios');
        this.loading.set(false);
      },
    });
  }

  // Métodos de Creación de Usuario
  openCreateUserModal(): void {
    this.newUserForm.set({
      display_name: '',
      email: '',
      password: '',
      role: 1,
    });
    this.createUserError.set(null);
    this.createUserSuccess.set(null);
    this.isCreateModalOpen.set(true);
  }

  closeCreateUserModal(): void {
    this.isCreateModalOpen.set(false);
  }

  updateNewUser(field: 'display_name' | 'email' | 'password' | 'role', value: any): void {
    this.newUserForm.update((form) => ({
      ...form,
      [field]: field === 'role' ? (Number(value) === 2 ? 2 : 1) : value,
    }));
  }

  updateEditTask(
    field: 'title' | 'description' | 'due_date' | 'due_time' | 'priority' | 'status' | 'assignee_id',
    value: any
  ): void {
    this.editTaskForm.update((form) => ({
      ...form,
      [field]:
        field === 'priority' || field === 'status'
          ? (Number(value) as 1 | 2 | 3)
          : value,
    }));
  }

  submitCreateUser(): void {
    const form = this.newUserForm();
    if (!form.display_name.trim()) {
      this.createUserError.set('El nombre completo es obligatorio.');
      return;
    }
    if (!form.email.trim() || !form.email.includes('@')) {
      this.createUserError.set('Ingrese un correo electrónico válido.');
      return;
    }
    if (!form.password || form.password.length < 6) {
      this.createUserError.set('La contraseña debe contener al menos 6 caracteres.');
      return;
    }

    this.creatingUser.set(true);
    this.createUserError.set(null);

    this.api
      .post<{ success: boolean; user: any; message: string }>('users', form)
      .subscribe({
        next: (res) => {
          this.creatingUser.set(false);
          this.createUserSuccess.set(res.message || 'Usuario creado exitosamente.');
          setTimeout(() => {
            this.closeCreateUserModal();
            this.loadUsers();
          }, 1200);
        },
        error: (err) => {
          this.creatingUser.set(false);
          this.createUserError.set(err.error?.error || 'Error al crear usuario en Supabase.');
        },
      });
  }

  // Métodos de Drill-down de tareas
  viewUserTasks(user: UserListItem): void {
    this.selectedUser.set(user);
    this.loadingTasks.set(true);
    this.api.get<{ tasks: UserTaskItem[] }>(`users/${user.id}/tasks`).subscribe({
      next: (res) => {
        this.selectedUserTasks.set(res.tasks || []);
        this.loadingTasks.set(false);
      },
      error: () => {
        this.selectedUserTasks.set([]);
        this.loadingTasks.set(false);
      },
    });
  }

  closeTasksDrawer(): void {
    this.selectedUser.set(null);
    this.selectedUserTasks.set([]);
  }

  // Reasignar tarea a otro usuario
  onReassignTask(task: UserTaskItem, event: Event): void {
    const select = event.target as HTMLSelectElement;
    const targetUserId = select.value;
    if (!targetUserId || targetUserId === (task.assignee_id || task.owner_id)) return;

    const targetUser = this.users().find((u) => u.id === targetUserId);
    const newName = targetUser?.display_name || 'Colaborador';

    this.api
      .put<{ task: any }>(`tasks/${task.id}`, {
        assignee_id: targetUserId,
        responsible_name: newName,
      })
      .subscribe({
        next: () => {
          this.selectedUserTasks.update((tasks) =>
            tasks.map((t) =>
              t.id === task.id
                ? { ...t, assignee_id: targetUserId, responsible_name: newName }
                : t
            )
          );
          this.loadUsers();
        },
        error: (err) => {
          alert(`Error al reasignar tarea: ${err.error?.error || 'Fallo del servidor'}`);
        },
      });
  }

  // Abrir Modal de Edición de Tarea
  openEditTask(task: UserTaskItem): void {
    this.editingTask.set(task);
    this.editTaskForm.set({
      title: task.title,
      description: task.description || '',
      due_date: task.due_date || '',
      due_time: task.due_time ? task.due_time.substring(0, 5) : '',
      priority: task.priority,
      status: task.status,
      assignee_id: task.assignee_id || task.owner_id || '',
    });
  }

  closeEditTask(): void {
    this.editingTask.set(null);
  }

  submitEditTask(): void {
    const task = this.editingTask();
    if (!task) return;

    const form = this.editTaskForm();
    if (!form.title.trim()) {
      alert('El título de la tarea es obligatorio.');
      return;
    }

    this.savingTask.set(true);

    const targetUser = this.users().find((u) => u.id === form.assignee_id);
    const responsibleName = targetUser?.display_name || task.responsible_name;

    const payload: any = {
      title: form.title,
      description: form.description || null,
      due_date: form.due_date || null,
      due_time: form.due_time ? (form.due_time.length === 5 ? `${form.due_time}:00` : form.due_time) : null,
      priority: Number(form.priority),
      status: Number(form.status),
      assignee_id: form.assignee_id || null,
      responsible_name: responsibleName,
    };

    this.api.put<{ task: UserTaskItem }>(`tasks/${task.id}`, payload).subscribe({
      next: (res) => {
        this.savingTask.set(false);
        const updated = res.task || { ...task, ...payload };
        this.selectedUserTasks.update((tasks) =>
          tasks.map((t) => (t.id === task.id ? { ...t, ...updated } : t))
        );
        this.closeEditTask();
        this.loadUsers();
      },
      error: (err) => {
        this.savingTask.set(false);
        alert(`Error al guardar cambios: ${err.error?.error || 'Fallo del servidor'}`);
      },
    });
  }

  // Eliminar tarea de un colaborador
  deleteUserTask(task: UserTaskItem): void {
    const confirmed = confirm(
      `¿Estás seguro de que deseas eliminar la tarea "${task.title}"? Esta acción no se puede deshacer.`
    );
    if (!confirmed) return;

    this.api.delete<{ success: boolean; deleted_id: string }>(`tasks/${task.id}`).subscribe({
      next: () => {
        this.selectedUserTasks.update((tasks) => tasks.filter((t) => t.id !== task.id));
        this.loadUsers();
      },
      error: (err) => {
        alert(`Error al eliminar tarea: ${err.error?.error || 'Fallo del servidor'}`);
      },
    });
  }

  // Borrado de usuario en cascada
  promptDeleteUser(user: UserListItem, event?: Event): void {
    if (event) {
      event.stopPropagation();
    }
    this.userToDelete.set(user);
  }

  cancelDelete(): void {
    this.userToDelete.set(null);
  }

  confirmCascadeDelete(): void {
    const target = this.userToDelete();
    if (!target) return;

    this.deleting.set(true);
    this.api.delete<{ success: boolean; deleted_user_id: string }>(`users/${target.id}`).subscribe({
      next: () => {
        this.deleting.set(false);
        this.userToDelete.set(null);
        if (this.selectedUser()?.id === target.id) {
          this.closeTasksDrawer();
        }
        this.loadUsers();
      },
      error: (err) => {
        this.deleting.set(false);
        alert(`Error al eliminar usuario: ${err.error?.error || 'Fallo del servidor'}`);
      },
    });
  }

  getPriorityLabel(p: number): string {
    if (p === 3) return 'Alta';
    if (p === 2) return 'Media';
    return 'Baja';
  }

  getStatusLabel(s: number): string {
    if (s === 3) return 'Completada';
    if (s === 2) return 'En progreso';
    return 'Pendiente';
  }
}
