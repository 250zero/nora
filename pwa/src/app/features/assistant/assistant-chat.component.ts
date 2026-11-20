import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  inject,
  OnInit,
  signal,
  ViewChild,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { ApiService } from '../../core/services/api.service';
import { AuthService } from '../../core/services/auth.service';
import { TaskStore } from '../../core/stores/task.store';
import { AppIconComponent } from '../../shared/components/app-icon/app-icon.component';

export interface ChatMessage {
  id: string;
  sender: 'user' | 'nora';
  text: string;
  timestamp: Date;
  suggestedSlots?: string[];
  actionRequired?: {
    type: string;
    taskId?: string;
    taskTitle?: string;
    pendingActionId?: string;
  };
  toolExecuted?: string;
  failedPrompt?: string;
}

const WELCOME_MSG: ChatMessage = {
  id: 'welcome',
  sender: 'nora',
  text: '¡Hola! Soy Nora, tu asistente ejecutiva con IA. Puedo consultar tus horas libres, agendar tareas y reuniones, o gestionar tus prioridades sin que tengas que llenar formularios manuales. ¿Qué coordinamos hoy?',
  timestamp: new Date(),
};

@Component({
  selector: 'app-assistant-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent],
  templateUrl: './assistant-chat.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantChatComponent implements OnInit {
  private readonly api = inject(ApiService);
  private readonly taskStore = inject(TaskStore);
  private readonly cdr = inject(ChangeDetectorRef);
  readonly auth = inject(AuthService);

  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  readonly isOpen = signal<boolean>(false);
  readonly inputMessage = signal<string>('');
  readonly isSending = signal<boolean>(false);
  readonly messages = signal<ChatMessage[]>([WELCOME_MSG]);

  ngOnInit(): void {
    this.loadHistory();
  }

  loadHistory(): void {
    if (!this.auth.isAuthenticated()) return;

    this.api
      .get<{
        messages: Array<{
          id: string;
          sender: 'user' | 'nora';
          text: string;
          timestamp: string;
          suggestedSlots?: string[];
          actionRequired?: any;
          toolExecuted?: string;
        }>;
      }>('chat/history')
      .subscribe({
        next: (res) => {
          if (res.messages && res.messages.length > 0) {
            const loaded: ChatMessage[] = res.messages.map((m) => ({
              id: m.id,
              sender: m.sender,
              text: m.text,
              timestamp: new Date(m.timestamp),
              suggestedSlots: m.suggestedSlots || undefined,
              actionRequired: m.actionRequired || undefined,
              toolExecuted: m.toolExecuted || undefined,
            }));
            this.messages.set([WELCOME_MSG, ...loaded]);
            this.cdr.markForCheck();
          }
        },
        error: () => {
          // Falla silenciosa en hidratación inicial si offline
        },
      });
  }

  toggleOpen(): void {
    this.isOpen.update((v) => !v);
    if (this.isOpen()) {
      setTimeout(() => this.scrollToBottom(), 100);
    }
  }

  sendMessage(overrideText?: string): void {
    const text = (overrideText || this.inputMessage()).trim();
    if (!text || this.isSending()) return;

    const userMsg: ChatMessage = {
      id: crypto.randomUUID(),
      sender: 'user',
      text,
      timestamp: new Date(),
    };

    this.messages.update((list) => [...list, userMsg]);
    this.inputMessage.set('');
    this.isSending.set(true);
    this.scrollToBottom();

    // Historial compacto para Gemini (excluye burbujas fallidas)
    const history = this.messages()
      .filter((m) => !m.failedPrompt)
      .slice(-10)
      .map((m) => ({
        role: (m.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
        text: m.text,
      }));

    let clientTz = 'America/Santo_Domingo';
    try {
      clientTz = Intl.DateTimeFormat().resolvedOptions().timeZone || clientTz;
    } catch {}

    this.api
      .post<{
        reply: string;
        suggestedSlots?: string[];
        actionRequired?: any;
        toolExecuted?: string;
      }>('chat', {
        message: text,
        client_timezone: clientTz,
        history,
      })
      .subscribe({
        next: (res) => {
          const noraMsg: ChatMessage = {
            id: crypto.randomUUID(),
            sender: 'nora',
            text: res.reply,
            timestamp: new Date(),
            suggestedSlots: res.suggestedSlots,
            actionRequired: res.actionRequired,
            toolExecuted: res.toolExecuted,
          };

          this.messages.update((list) => [...list, noraMsg]);
          this.isSending.set(false);
          this.scrollToBottom();

          // Refrescar inmediatamente la agenda ante cualquier creación, edición, completado, reprogramación o borrado
          const replyLower = (res.reply || '').toLowerCase();
          const toolExec = res.toolExecuted || '';
          const hasTaskAction =
            toolExec.includes('crear_tarea') ||
            toolExec.includes('actualizar_tarea') ||
            toolExec.includes('completar_tarea') ||
            toolExec.includes('reprogramar_tarea') ||
            toolExec.includes('eliminar_tarea') ||
            replyLower.includes('agendad') ||
            replyLower.includes('registrad') ||
            replyLower.includes('reprogramad') ||
            replyLower.includes('completad') ||
            replyLower.includes('actualizad') ||
            replyLower.includes('eliminad');

          if (hasTaskAction) {
            this.taskStore.refreshAndClearFilter();
          } else if (res.toolExecuted) {
            this.taskStore.loadTasks();
          }
          this.cdr.markForCheck();
        },
        error: (err) => {
          // RF-18: conservar texto escrito y ofrecer botón Reintentar en la burbuja de error
          this.inputMessage.set(text);
          const errorMsg: ChatMessage = {
            id: crypto.randomUUID(),
            sender: 'nora',
            text: `No pude completar tu solicitud: ${err.error?.error || 'Error de conexión con el servidor'}. Conservé tu mensaje en la caja para reintentar.`,
            timestamp: new Date(),
            failedPrompt: text,
          };
          this.messages.update((list) => [...list, errorMsg]);
          this.isSending.set(false);
          this.scrollToBottom();
          this.cdr.markForCheck();
        },
      });
  }

  retryFailedMessage(msg: ChatMessage): void {
    if (!msg.failedPrompt || this.isSending()) return;
    const promptToRetry = msg.failedPrompt;
    this.messages.update((list) => list.filter((m) => m.id !== msg.id));
    this.sendMessage(promptToRetry);
  }

  selectSlot(slot: string): void {
    this.sendMessage(`Por favor agéndalo a las ${slot}`);
  }

  confirmAction(msg: ChatMessage, confirmed: boolean): void {
    if (!msg.actionRequired) return;

    this.isSending.set(true);
    this.api
      .post<{ message: string; cancelled?: boolean }>('chat/confirm-action', {
        action: msg.actionRequired.type,
        taskId: msg.actionRequired.taskId,
        pendingActionId: msg.actionRequired.pendingActionId,
        confirmed,
      })
      .subscribe({
        next: (res) => {
          this.messages.update((list) =>
            list.map((m) => (m.id === msg.id ? { ...m, actionRequired: undefined } : m))
          );

          const feedbackMsg: ChatMessage = {
            id: crypto.randomUUID(),
            sender: 'nora',
            text: res.message,
            timestamp: new Date(),
          };

          this.messages.update((list) => [...list, feedbackMsg]);
          this.isSending.set(false);
          this.scrollToBottom();
          this.taskStore.loadTasks();
          this.cdr.markForCheck();
        },
        error: (err) => {
          this.isSending.set(false);
          alert(`Error: ${err.error?.error || 'No se pudo confirmar la acción'}`);
          this.cdr.markForCheck();
        },
      });
  }

  private scrollToBottom(): void {
    setTimeout(() => {
      if (this.messagesContainer?.nativeElement) {
        this.messagesContainer.nativeElement.scrollTop =
          this.messagesContainer.nativeElement.scrollHeight;
      }
    }, 50);
  }
}
