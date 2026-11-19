import { Routes } from '@angular/router';
import { authGuard } from './core/guards/auth.guard';
import { AgendaComponent } from './features/agenda/agenda.component';
import { AuditLogsComponent } from './features/audit/audit-logs.component';
import { LoginComponent } from './features/auth/login.component';
import { UsersAdminComponent } from './features/users-admin/users-admin.component';

export const routes: Routes = [
  {
    path: 'login',
    component: LoginComponent,
    title: 'Iniciar Sesión — Nora',
  },
  {
    path: '',
    component: AgendaComponent,
    title: 'Agenda — Nora',
    canActivate: [authGuard],
  },
  {
    path: 'users',
    component: UsersAdminComponent,
    title: 'Gestión de Usuarios — Nora',
    canActivate: [authGuard],
  },
  {
    path: 'audit',
    component: AuditLogsComponent,
    title: 'Auditoría — Nora',
    canActivate: [authGuard],
  },
  {
    path: '**',
    redirectTo: '',
  },
];
