import { Routes } from '@angular/router';
import { AgendaComponent } from './features/agenda/agenda.component';

export const routes: Routes = [
  {
    path: '',
    component: AgendaComponent,
    title: 'Agenda — Nora',
  },
  {
    path: '**',
    redirectTo: '',
  },
];
