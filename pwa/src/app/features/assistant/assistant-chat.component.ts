import { CommonModule } from '@angular/common';
import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  inject,
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
  };
  toolExecuted?: string;
}

@Component({
  selector: 'app-assistant-chat',
  standalone: true,
  imports: [CommonModule, FormsModule, AppIconComponent],
  templateUrl: './assistant-chat.component.html',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AssistantChatComponent {
  private readonly api = inject(ApiService);
  private readonly taskStore = inject(TaskStore);
  readonly auth = inject(AuthService);

  @ViewChild('messagesContainer') private messagesContainer?: ElementRef<HTMLDivElement>;

  readonly isOpen = signal<boolean>(false);
  readonly inputMessage = signal<string>('');
  readonly isSending = signal<boolean>(false);

  readonly messages = signal<ChatMessage[]>([
    {
      id: 'welcome',
      sender: 'nora',
      text: '¡Hola! Soy Nora, tu asistente ejecutiva con IA. Puedo consultar tus horas libres, agendar tareas y reuniones, o gestionar tus prioridades sin que tengas que llenar formularios manuales. ¿Qué coordinamos hoy?',
      timestamp: new Date(),
    },
  ]);

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

    // Historial compacto para Gemini
    const history = this.messages()
      .slice(-6)
      .map((m) => ({
        role: (m.sender === 'user' ? 'user' : 'model') as 'user' | 'model',
        text: m.text,
      }));

    this.api
      .post<{
        reply: string;
        suggestedSlots?: string[];
        actionRequired?: any;
        toolExecuted?: string;
      }>('chat', {
        message: text,
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

          // Si se creó o eliminó una tarea, refrescar la agenda del usuario inmediatamente
          if (
            res.toolExecuted &&
            (res.toolExecuted.includes('crear_tarea') || res.toolExecuted.includes('eliminar_tarea'))
          ) {
            this.taskStore.loadTasks();
          }
        },
        error: (err) => {
          const errorMsg: ChatMessage = {
            id: crypto.randomUUID(),
            sender: 'nora',
            text: `Disculpa, no pude procesar la solicitud en este momento: ${err.error?.error || 'Error de conexión'}.`,
            timestamp: new Date(),
          };
          this.messages.update((list) => [...list, errorMsg]);
          this.isSending.set(false);
          this.scrollToBottom();
        },
      });
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
        confirmed,
      })
      .subscribe({
        next: (res) => {
          // Desactivar la acción en el mensaje previo
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
        },
        error: (err) => {
          this.isSending.set(false);
          alert(`Error: ${err.error?.error || 'No se pudo confirmar la acción'}`);
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
