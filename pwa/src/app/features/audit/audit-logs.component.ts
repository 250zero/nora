import { CommonModule } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { AppIconComponent } from '../../shared/components/app-icon/app-icon.component';

export interface AuditLogItem {
  id: string;
  user_id: string;
  action: 'INSERT' | 'UPDATE' | 'DELETE' | 'SELECT';
  table_name: string;
  record_id?: string;
  old_data?: any;
  new_data?: any;
  ip_address: string;
  user_agent?: string;
  created_at: string;
}

@Component({
  selector: 'app-audit-logs',
  standalone: true,
  imports: [CommonModule, AppIconComponent],
  templateUrl: './audit-logs.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuditLogsComponent implements OnInit {
  private readonly api = inject(ApiService);
  readonly auth = inject(AuthService);

  readonly logs = signal<AuditLogItem[]>([]);
  readonly total = signal<number>(0);
  readonly loading = signal<boolean>(false);
  readonly error = signal<string | null>(null);
  readonly selectedLog = signal<AuditLogItem | null>(null);

  ngOnInit(): void {
    this.loadAuditLogs();
  }

  loadAuditLogs(): void {
    this.loading.set(true);
    this.error.set(null);
    this.api
      .get<{ logs: AuditLogItem[]; total: number }>('audit-logs', { limit: 50, offset: 0 })
      .subscribe({
        next: (res) => {
          this.logs.set(res.logs || []);
          this.total.set(res.total || 0);
          this.loading.set(false);
        },
        error: (err) => {
          this.error.set(err.error?.error || 'No se pudieron cargar los registros de auditoría');
          this.loading.set(false);
        },
      });
  }

  viewLogDetail(item: AuditLogItem): void {
    this.selectedLog.set(item);
  }

  closeDetail(): void {
    this.selectedLog.set(null);
  }

  getActionBadgeClass(action: string): string {
    switch (action) {
      case 'INSERT':
        return 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20';
      case 'UPDATE':
        return 'bg-blue-500/10 text-blue-400 border border-blue-500/20';
      case 'DELETE':
        return 'bg-rose-500/10 text-rose-400 border border-rose-500/20';
      default:
        return 'bg-slate-800 text-slate-300 border border-slate-700';
    }
  }
}
