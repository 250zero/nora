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

const AUTH_TOKEN_KEY = 'nora_auth_token_v1';
const AUTH_USER_KEY = 'nora_auth_user_v1';

@Injectable({
  providedIn: 'root',
})
export class AuthService {
  private readonly api = inject(ApiService);
  private readonly router = inject(Router);

  readonly token = signal<string | null>(this.getStoredToken());
  readonly currentUser = signal<UserProfile | null>(this.getStoredUser());

  readonly isAuthenticated = computed(() => this.token() !== null && this.currentUser() !== null);
  readonly isSupervisor = computed(() => this.currentUser()?.role === 2);
  readonly isMember = computed(() => this.currentUser()?.role === 1);

  constructor() {
    // Si tenemos token guardado, revalidar en segundo plano
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

  register(data: { email: string; password: string; displayName: string }): Observable<any> {
    return this.api.post('auth/register', data).pipe(
      tap((res: any) => {
        if (res.session?.access_token && res.user) {
          this.setSession(res.session.access_token, res.user);
        }
      })
    );
  }

  logout(): void {
    if (typeof localStorage !== 'undefined') {
      localStorage.removeItem(AUTH_TOKEN_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
    }
    this.token.set(null);
    this.currentUser.set(null);
    this.router.navigate(['/login']);
  }

  // Alternar rol localmente si es necesario para testing
  toggleRole(): void {
    const current = this.currentUser();
    if (!current) return;
    const nextRole = current.role === 1 ? 2 : 1;
    const updated: UserProfile = {
      ...current,
      role: nextRole,
      roleLabel: nextRole === 2 ? 'Supervisor' : 'Miembro',
    };
    this.currentUser.set(updated);
    if (typeof localStorage !== 'undefined') {
      localStorage.setItem(AUTH_USER_KEY, JSON.stringify(updated));
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

  private checkSession(): void {
    this.api.get<{ user: UserProfile }>('auth/me').subscribe({
      next: (res) => {
        if (res.user) {
          this.currentUser.set(res.user);
          if (typeof localStorage !== 'undefined') {
            localStorage.setItem(AUTH_USER_KEY, JSON.stringify(res.user));
          }
        }
      },
      error: () => {
        // Token expirado o revocado
        this.logout();
      },
    });
  }

  private getStoredToken(): string | null {
    if (typeof localStorage === 'undefined') return null;
    return localStorage.getItem(AUTH_TOKEN_KEY);
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
