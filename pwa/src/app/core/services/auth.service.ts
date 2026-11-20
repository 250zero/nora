import { computed, inject, Injectable, signal } from '@angular/core';
import { Router } from '@angular/router';
import { Observable, tap } from 'rxjs';
import { ApiService } from './api.service';

export interface UserProfile {
  id: string;
  displayName: string;
  email: string;
  timezone?: string;
  role: 1 | 2; // 1 = Miembro, 2 = Supervisor
  roleLabel?: string;
}

export interface LoginResponse {
  token: string;
  refreshToken?: string;
  user: UserProfile;
}

export const AUTH_TOKEN_KEY = 'nora_auth_token_v1';
export const AUTH_USER_KEY = 'nora_auth_user_v1';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(this.getStoredToken());
  readonly currentUser = signal<UserProfile | null>(this.getStoredUser());

  // El usuario está autenticado si existe el token, no ha expirado y tiene perfil cargado
  readonly isAuthenticated = computed(() => {
    const t = this.token();
    return t !== null && !this.isTokenExpired(t) && this.currentUser() !== null;
  });
  readonly isSupervisor = computed(() => this.currentUser()?.role === 2);
  readonly isMember = computed(() => this.currentUser()?.role === 1);

  constructor() {
    // Si tenemos token guardado y válido, revalidar sesión con el backend en segundo plano
    if (this.token()) {
      this.checkSession();
    }
  }

  login(credentials: { email: string; password: string }): Observable<LoginResponse> {
    return this.api.post<LoginResponse>('auth/login', credentials).pipe(
      tap((res) => {
        this.setSession(res.token, res.user);
      })
    );
  }

  logout(): void {
    this.clearStorage();
    this.token.set(null);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  /**
   * Valida si un JWT ha expirado leyendo el campo standard `exp` del payload base64.
   */
  isTokenExpired(token: string): boolean {
    if (!token) return true;
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return false;
      const base64 = parts[1].replace(/-/g, '+').replace(/_/g, '/');
      const payload = JSON.parse(decodeURIComponent(escape(atob(base64))));
      if (!payload.exp) return false;
      // Expira si la hora actual supera exp (con 5s de margen de seguridad)
      return Date.now() >= (payload.exp * 1000 - 5000);
    } catch {
      return false;
    }
  }

  private setSession(token: string, user: UserProfile): void {
    this.token.set(token);
    this.currentUser.set(user);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTH_TOKEN_KEY, token);
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
    }
  }

  private clearStorage(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    }
  }

  private checkSession(): void {
    const current = this.token();
    if (!current || this.isTokenExpired(current)) {
      this.logout();
      return;
    }

    this.api.get<{ user: UserProfile }>('auth/me').subscribe({
      next: (res) => {
        if (res.user) {
          this.currentUser.set(res.user);
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
          }
        }
      },
      error: (err) => {
        // Únicamente forzar logout si el backend confirma 401 (token revocado)
        if (err?.status === 401) {
          console.warn('Sesión no autorizada o revocada por el servidor.');
          this.logout();
        }
      },
    });
  }

  private getStoredToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    const token = localStorage.getItem(AUTH_TOKEN_KEY);
    if (!token) return null;
    if (this.isTokenExpired(token)) {
      this.clearStorage();
      return null;
    }
    return token;
  }

  private getStoredUser(): UserProfile | null {
    if (typeof localStorage === 'undefined') return null;
    try {
      const raw = localStorage.getItem(AUTH_USER_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }
}
