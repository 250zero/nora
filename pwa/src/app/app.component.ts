import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { RouterLink, RouterLinkActive, RouterOutlet } from '@angular/router';
import { ApiService } from './core/services/api.service';
import { AuthService } from './core/services/auth.service';
import { TaskStore } from './core/stores/task.store';
import { AssistantChatComponent } from './features/assistant/assistant-chat.component';
import { AppIconComponent } from './shared/components/app-icon/app-icon.component';

interface HealthResponse {
  status: string;
  service: string;
  version: string;
  timestamp: string;
}

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [RouterOutlet, RouterLink, RouterLinkActive, AppIconComponent, AssistantChatComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AppComponent implements OnInit {
  protected readonly auth = inject(AuthService);
  protected readonly taskStore = inject(TaskStore);
  private readonly api = inject(ApiService);

  readonly backendStatus = signal<'checking' | 'online' | 'offline'>('checking');
  readonly backendInfo = signal<HealthResponse | null>(null);

  ngOnInit(): void {
    this.checkBackendHealth();
  }

  checkBackendHealth(): void {
    this.backendStatus.set('checking');
    this.api.get<HealthResponse>('health').subscribe({
      next: (res) => {
        this.backendStatus.set('online');
        this.backendInfo.set(res);
      },
      error: () => {
        // En desarrollo local o antes de levantar el backend
        this.backendStatus.set('offline');
      },
    });
  }
}
