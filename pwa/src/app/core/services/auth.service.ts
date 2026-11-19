import { computed, inject, Injectable, signal } from '@angular/core';
import { ApiService } from './api.service';

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  role: 1 | 2; // 1 = Miembro, 2 = Supervisor
}

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(ApiService);

  // Signals de estado de sesión
  readonly currentUser = signal<UserProfile | null>({
    id: 'a0000000-0000-0000-0000-000000000001',
    displayName: 'Juan Pérez',
    email: 'juan@nora.com',
    role: 1, // Por defecto Miembro
  });

  readonly token = signal<string | null>('mock-jwt-token-fase1');

  readonly isAuthenticated = computed(() => this.currentUser() !== null);
  readonly isSupervisor = computed(() => this.currentUser()?.role === 2);
  readonly isMember = computed(() => this.currentUser()?.role === 1);

  // Alternar rol rápidamente para pruebas de evaluación
  toggleRole(): void {
    const current = this.currentUser();
    if (!current) return;
    const nextRole = current.role === 1 ? 2 : 1;
    this.currentUser.set({
      ...current,
      role: nextRole,
      displayName: nextRole === 2 ? 'Ana Gómez (Supervisor)' : 'Juan Pérez (Miembro)',
    });
  }

  logout(): void {
    this.currentUser.set(null);
    this.token.set(null);
  }
}
