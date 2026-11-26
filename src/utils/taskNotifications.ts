import { AdminTask, AdminTaskCategory, DEFAULT_ADMIN_TASK_CATEGORIES } from '../types';
import { buildWhatsAppSendUrl } from './whatsapp';

export function getAdminTaskCategoryLabel(category: AdminTaskCategory): string {
  const found = DEFAULT_ADMIN_TASK_CATEGORIES.find((c) => c.id === category);
  return found ? found.label : category || 'Otros';
}

export function getLocalTodayISO(referenceDate = new Date()): string {
  const year = referenceDate.getFullYear();
  const month = String(referenceDate.getMonth() + 1).padStart(2, '0');
  const day = String(referenceDate.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function getLocalTimeHHMM(referenceDate = new Date()): string {
  const hours = String(referenceDate.getHours()).padStart(2, '0');
  const minutes = String(referenceDate.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

/**
 * Parses a task's scheduled dueDate (YYYY-MM-DD) and dueTime (HH:mm) into a local timestamp (ms).
 */
export function parseTaskDueTimestamp(task: Pick<AdminTask, 'dueDate' | 'dueTime'>): number | null {
  if (!task.dueDate) return null;
  const dateMatch = /^(\d{4})-(\d{2})-(\d{2})$/.exec(task.dueDate.trim());
  if (!dateMatch) return null;
  const year = Number(dateMatch[1]);
  const month = Number(dateMatch[2]) - 1;
  const day = Number(dateMatch[3]);

  const timeMatch = /^(\d{1,2}):(\d{2})$/.exec((task.dueTime || '09:00').trim());
  const hour = timeMatch ? Math.min(23, Math.max(0, Number(timeMatch[1]))) : 9;
  const minute = timeMatch ? Math.min(59, Math.max(0, Number(timeMatch[2]))) : 0;

  const dateObj = new Date(year, month, day, hour, minute, 0, 0);
  const ts = dateObj.getTime();
  return Number.isNaN(ts) ? null : ts;
}

export function formatTime12h(hhmm: string): string {
  const match = /^(\d{1,2}):(\d{2})$/.exec((hhmm || '').trim());
  if (!match) return hhmm || '';
  let h = Number(match[1]);
  const m = match[2];
  const suffix = h >= 12 ? 'PM' : 'AM';
  h = h % 12;
  if (h === 0) h = 12;
  return `${h}:${m} ${suffix}`;
}

export function formatTaskScheduleLabel(
  dueDate: string,
  dueTime: string,
  now = new Date()
): string {
  const todayStr = getLocalTodayISO(now);
  const tomorrow = new Date(now);
  tomorrow.setDate(tomorrow.getDate() + 1);
  const tomorrowStr = getLocalTodayISO(tomorrow);

  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  const yesterdayStr = getLocalTodayISO(yesterday);

  let dayLabel = dueDate;
  if (dueDate === todayStr) {
    dayLabel = 'Hoy';
  } else if (dueDate === tomorrowStr) {
    dayLabel = 'Mañana';
  } else if (dueDate === yesterdayStr) {
    dayLabel = 'Ayer';
  } else {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(dueDate);
    if (match) {
      const d = new Date(Number(match[1]), Number(match[2]) - 1, Number(match[3]));
      dayLabel = d.toLocaleDateString('es-VE', {
        day: '2-digit',
        month: 'short',
        year: d.getFullYear() !== now.getFullYear() ? 'numeric' : undefined,
      });
    }
  }

  return `${dayLabel} · ${formatTime12h(dueTime)}`;
}

export interface TaskTimingState {
  dueTimestamp: number | null;
  minutesUntilDue: number | null; // positive = in future, negative = overdue
  isInPreReminderWindow: boolean; // 0 < minutesUntilDue <= reminderMinutesBefore
  isDueNow: boolean; // -1 <= minutesUntilDue <= 0
  isOverdue: boolean; // minutesUntilDue < -1
  isAlertActive: boolean; // should trigger/display screen reminder if status === 'PENDIENTE'
  urgencyLabel: string;
}

export function getTaskTimingState(task: AdminTask, nowMs = Date.now()): TaskTimingState {
  const dueTs = parseTaskDueTimestamp(task);
  if (dueTs === null) {
    return {
      dueTimestamp: null,
      minutesUntilDue: null,
      isInPreReminderWindow: false,
      isDueNow: false,
      isOverdue: false,
      isAlertActive: false,
      urgencyLabel: 'Sin fecha',
    };
  }

  const diffMs = dueTs - nowMs;
  const minutesUntilDue = diffMs / 60000;
  const preWindow = Math.max(1, Number(task.reminderMinutesBefore) || 5);

  const isInPreReminderWindow = minutesUntilDue > 0 && minutesUntilDue <= preWindow;
  const isDueNow = minutesUntilDue <= 0 && minutesUntilDue >= -1;
  const isOverdue = minutesUntilDue < -1;
  const isAlertActive =
    task.status === 'PENDIENTE' && (isInPreReminderWindow || isDueNow || isOverdue);

  let urgencyLabel = '';
  if (task.status === 'REALIZADA') {
    urgencyLabel = 'Realizada';
  } else if (isDueNow) {
    urgencyLabel = '¡Es la hora!';
  } else if (isInPreReminderWindow) {
    const mins = Math.max(1, Math.ceil(minutesUntilDue));
    urgencyLabel = `Falta${mins === 1 ? '' : 'n'} ${mins} min`;
  } else if (isOverdue) {
    const absMins = Math.floor(Math.abs(minutesUntilDue));
    if (absMins < 60) {
      urgencyLabel = `Vencida hace ${absMins} min`;
    } else if (absMins < 1440) {
      const h = Math.floor(absMins / 60);
      const m = absMins % 60;
      urgencyLabel = m > 0 ? `Vencida hace ${h}h ${m}m` : `Vencida hace ${h}h`;
    } else {
      const days = Math.floor(absMins / 1440);
      urgencyLabel = `Vencida hace ${days} día${days === 1 ? '' : 's'}`;
    }
  } else {
    const totalMins = Math.ceil(minutesUntilDue);
    if (totalMins < 60) {
      urgencyLabel = `En ${totalMins} min`;
    } else if (totalMins < 1440) {
      const h = Math.floor(totalMins / 60);
      const m = totalMins % 60;
      urgencyLabel = m > 0 ? `En ${h}h ${m}m` : `En ${h}h`;
    } else {
      const days = Math.floor(totalMins / 1440);
      urgencyLabel = `En ${days} día${days === 1 ? '' : 's'}`;
    }
  }

  return {
    dueTimestamp: dueTs,
    minutesUntilDue,
    isInPreReminderWindow,
    isDueNow,
    isOverdue,
    isAlertActive,
    urgencyLabel,
  };
}

export function buildTaskAssignmentWhatsAppUrl(
  task: AdminTask,
  commercialName: string
): string {
  const categoryLabel = getAdminTaskCategoryLabel(task.category);
  const schedule = formatTaskScheduleLabel(task.dueDate, task.dueTime);
  const priorityLabel =
    task.priority === 'ALTA' ? 'ALTA 🔴' : task.priority === 'MEDIA' ? 'MEDIA 🟡' : 'BAJA 🟢';
  const detailsLine = task.description?.trim()
    ? `\n📝 *Detalles:* ${task.description.trim()}`
    : '';
  const reminderMins = Math.max(1, Number(task.reminderMinutesBefore) || 5);

  const message = `📋 *NUEVA TAREA ASIGNADA — ${commercialName.toUpperCase()}*

👤 *Responsable:* ${task.assignedWorkerName}
📌 *Tarea:* ${task.title}
🏷️ *Tipo:* ${categoryLabel}
⚡ *Prioridad:* ${priorityLabel}
📅 *Cuándo:* ${schedule} (${task.dueDate})${detailsLine}

⏰ *Recordatorio:* Por favor tenlo listo a tiempo (se enviará aviso ${reminderMins} min antes). Confirma por aquí cuando la completes.`;

  return buildWhatsAppSendUrl(task.assignedWorkerPhone, message);
}

export function buildTaskReminderWhatsAppUrl(
  task: AdminTask,
  commercialName: string,
  timing?: TaskTimingState
): string {
  const categoryLabel = getAdminTaskCategoryLabel(task.category);
  const schedule = formatTaskScheduleLabel(task.dueDate, task.dueTime);
  const detailsLine = task.description?.trim()
    ? `\n📝 *Detalles:* ${task.description.trim()}`
    : '';

  let headerText = `⏰ *RECORDATORIO DE TAREA (5 MIN ANTES) — ${commercialName.toUpperCase()}*`;
  if (timing?.isOverdue) {
    headerText = `🚨 *TAREA PENDIENTE VENCIDA — ${commercialName.toUpperCase()}*`;
  } else if (timing?.isDueNow) {
    headerText = `🔔 *ES HORA DE REALIZAR ESTA TAREA — ${commercialName.toUpperCase()}*`;
  } else if (timing?.isInPreReminderWindow && timing.minutesUntilDue !== null) {
    const mins = Math.max(1, Math.ceil(timing.minutesUntilDue));
    headerText = `⏰ *RECORDATORIO: FALTAN ${mins} MIN — ${commercialName.toUpperCase()}*`;
  }

  const message = `${headerText}

👤 *Responsable:* ${task.assignedWorkerName}
📌 *Tarea:* ${task.title}
🏷️ *Tipo:* ${categoryLabel}
📅 *Hora programada:* ${schedule}${detailsLine}

✅ Por favor avísanos apenas quede realizada para marcarla como completada.`;

  return buildWhatsAppSendUrl(task.assignedWorkerPhone, message);
}

let sharedAudioCtx: AudioContext | null = null;

export function playTaskReminderChime(urgent = false): void {
  if (typeof window === 'undefined') return;
  try {
    const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
    if (!AudioCtx) return;
    if (!sharedAudioCtx) {
      sharedAudioCtx = new AudioCtx();
    }
    if (sharedAudioCtx.state === 'suspended') {
      sharedAudioCtx.resume().catch(() => {});
    }

    const now = sharedAudioCtx.currentTime;
    const notes = urgent ? [880, 1174.66, 880] : [659.25, 880];

    notes.forEach((freq, index) => {
      if (!sharedAudioCtx) return;
      const osc = sharedAudioCtx.createOscillator();
      const gain = sharedAudioCtx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, now + index * 0.16);

      gain.gain.setValueAtTime(0.0001, now + index * 0.16);
      gain.gain.exponentialRampToValueAtTime(0.12, now + index * 0.16 + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, now + index * 0.16 + 0.24);

      osc.connect(gain);
      gain.connect(sharedAudioCtx.destination);
      osc.start(now + index * 0.16);
      osc.stop(now + index * 0.16 + 0.26);
    });
  } catch {
    // Browser autoplay policy may block audio before first user gesture
  }
}

export function getBrowserNotificationPermission(): NotificationPermission | 'unsupported' {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  return Notification.permission;
}

export async function requestBrowserNotificationPermission(): Promise<
  NotificationPermission | 'unsupported'
> {
  if (typeof window === 'undefined' || !('Notification' in window)) {
    return 'unsupported';
  }
  try {
    return await Notification.requestPermission();
  } catch {
    return Notification.permission;
  }
}

export function sendBrowserTaskNotification(
  title: string,
  body: string,
  tag: string,
  onClick?: () => void
): void {
  if (typeof window === 'undefined' || !('Notification' in window)) return;
  if (Notification.permission !== 'granted') return;
  try {
    const notification = new Notification(title, {
      body,
      tag,
      requireInteraction: true,
    });
    notification.onclick = () => {
      try {
        window.focus();
      } catch {}
      onClick?.();
      notification.close();
    };
  } catch {
    // Ignore notification errors in restricted iframes
  }
}
