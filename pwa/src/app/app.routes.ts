import { Routes } from '@angular/router';
import { AgendaComponent } from './features/agenda/agenda.component';
import { UsersAdminComponent } from './features/users-admin/users-admin.component';

export const routes: Routes = [
  {
    path: '',
    component: AgendaComponent,
    title: 'Agenda — Nora',
  },
  {
    path: 'users',
    component: UsersAdminComponent,
    title: 'Gestión de Usuarios — Nora',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
