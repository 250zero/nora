import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Router } from '@angular/router';
import { AuthService } from '../../core/services/auth.service';
import { AppIconComponent } from '../../shared/components/app-icon/app-icon.component';

@Component({
  selector: 'app-login',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent],
  templateUrl: './login.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class LoginComponent {
  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);

  readonly mode = signal<'login' | 'register'>('login');
  readonly email = signal<string>('miembro@nora.com');
  readonly password = signal<string>('Nora2026!');
  readonly displayName = signal<string>('');

  readonly loading = signal<boolean>(false);
  readonly errorMessage = signal<string | null>(null);

  setDemoUser(type: 'supervisor' | 'miembro'): void {
    if (type === 'supervisor') {
      this.email.set('supervisor@nora.com');
      this.password.set('Nora2026!');
    } else {
      this.email.set('miembro@nora.com');
      this.password.set('Nora2026!');
    }
    this.mode.set('login');
    this.errorMessage.set(null);
    this.onSubmit();
  }

  onSubmit(): void {
    this.errorMessage.set(null);
    this.loading.set(true);

    if (this.mode() === 'login') {
      this.auth
        .login({
          email: this.email().trim(),
          password: this.password(),
        })
        .subscribe({
          next: () => {
            this.loading.set(false);
            this.router.navigate(['/']);
          },
          error: (err) => {
            this.loading.set(false);
            this.errorMessage.set(
              err.error?.error || 'No se pudo iniciar sesión. Verifica tu email y contraseña.'
            );
          },
        });
    } else {
      this.auth
        .register({
          email: this.email().trim(),
          password: this.password(),
          displayName: this.displayName().trim(),
        })
        .subscribe({
          next: () => {
            this.loading.set(false);
            this.router.navigate(['/']);
          },
          error: (err) => {
            this.loading.set(false);
            this.errorMessage.set(
              err.error?.error || 'No se pudo completar el registro. Intenta con otro email.'
            );
          },
        });
    }
  }
}
