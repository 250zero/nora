export interface Task {
  id: string;
  owner_id: string;
  assignee_id?: string | null;
  title: string;
  description?: string | null;
  due_date: string | null; // YYYY-MM-DD
  due_time?: string | null; // HH:mm:ss
  priority: 1 | 2 | 3; // 1 = baja, 2 = media, 3 = alta
  status: 1 | 2 | 3; // 1 = pendiente, 2 = en_progreso, 3 = hecha
  responsible_name?: string | null;
  source: 1 | 2; // 1 = manual, 2 = asistente_ia
  completed_at?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface TaskAuditDetail {
  creator_name: string;
  creator_email: string;
  created_at: string;
  source_channel: string;
  device_info: string;
  ip_address: string;
  last_updated: string;
}

export interface TaskDetailResponse {
  task: Task;
  audit_detail: TaskAuditDetail;
}
