import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
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
}

@Component({
  selector: 'app-users-admin',
  standalone: true,
  imports: [CommonModule, AppIconComponent, DataTableComponent],
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

  // Drill-down de tareas por colaborador
  readonly selectedUser = signal<UserListItem | null>(null);
  readonly selectedUserTasks = signal<UserTaskItem[]>([]);
  readonly loadingTasks = signal<boolean>(false);

  // Modal crítico de borrado en cascada
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
