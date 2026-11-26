import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  BellRing,
  CheckCircle2,
  Clock,
  MessageSquare,
  User,
  Volume2,
  VolumeX,
  ArrowRight,
  AlarmClock,
} from 'lucide-react';
import {
  buildTaskReminderWhatsAppUrl,
  formatTaskScheduleLabel,
  getAdminTaskCategoryLabel,
  getTaskTimingState,
  playTaskReminderChime,
  sendBrowserTaskNotification,
} from '../../utils/taskNotifications';

export const TASK_ALERTS_MUTE_STORAGE_KEY = 'servimotos_task_alerts_muted';
export const TASK_ALERTS_MUTE_EVENT = 'servimotos-task-alerts-mute-change';

interface TriggeredTaskTracker {
  preNotified: boolean;
  dueNotified: boolean;
  lastOverduePingAt: number;
}

export const TaskReminderNotifier: React.FC = () => {
  const {
    isAdmin,
    adminTasks,
    toggleAdminTaskStatus,
    markAdminTaskNotified,
    setCurrentView,
    currentUser,
    settings,
  } = useApp();

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [snoozedUntilMap, setSnoozedUntilMap] = useState<Record<string, number>>({});
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TASK_ALERTS_MUTE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Tracks which notification phases have already fired for each task schedule
  const triggeredRef = useRef<Map<string, TriggeredTaskTracker>>(new Map());

  // Tick every 10 seconds so 5-minute-before reminders fire promptly
  useEffect(() => {
    if (!isAdmin) return;
    const interval = setInterval(() => {
      setNowMs(Date.now());
    }, 10000);
    return () => clearInterval(interval);
  }, [isAdmin]);

  // Listen to mute toggle changes from TasksView or other tabs
  useEffect(() => {
    const syncMute = () => {
      try {
        setIsMuted(localStorage.getItem(TASK_ALERTS_MUTE_STORAGE_KEY) === 'true');
      } catch {}
    };
    window.addEventListener(TASK_ALERTS_MUTE_EVENT, syncMute);
    window.addEventListener('storage', syncMute);
    return () => {
      window.removeEventListener(TASK_ALERTS_MUTE_EVENT, syncMute);
      window.removeEventListener('storage', syncMute);
    };
  }, []);

  const toggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    try {
      localStorage.setItem(TASK_ALERTS_MUTE_STORAGE_KEY, next ? 'true' : 'false');
    } catch {}
    window.dispatchEvent(new Event(TASK_ALERTS_MUTE_EVENT));
  };

  // Compute active alerts strictly for tasks with status === 'PENDIENTE'
  // As soon as a task is marked 'REALIZADA', it is excluded immediately and stops all alerts.
  const activeAlerts = useMemo(() => {
    if (!isAdmin) return [];
    return adminTasks
      .filter((task) => task.status === 'PENDIENTE')
      .map((task) => ({
        task,
        timing: getTaskTimingState(task, nowMs),
      }))
      .filter(({ task, timing }) => {
        if (!timing.isAlertActive) return false;
        const snoozedUntil = snoozedUntilMap[task.id] || 0;
        return snoozedUntil <= nowMs;
      })
      .sort((a, b) => {
        const tsA = a.timing.dueTimestamp ?? Number.MAX_SAFE_INTEGER;
        const tsB = b.timing.dueTimestamp ?? Number.MAX_SAFE_INTEGER;
        return tsA - tsB;
      });
  }, [isAdmin, adminTasks, nowMs, snoozedUntilMap]);

  // Clean up tracker & snooze entries for completed or deleted tasks
  useEffect(() => {
    const pendingKeys = new Set(
      adminTasks
        .filter((t) => t.status === 'PENDIENTE')
        .map((t) => `${t.id}::${t.dueDate}::${t.dueTime}`)
    );
    const pendingIds = new Set(
      adminTasks.filter((t) => t.status === 'PENDIENTE').map((t) => t.id)
    );

    for (const key of Array.from(triggeredRef.current.keys())) {
      if (!pendingKeys.has(key)) {
        triggeredRef.current.delete(key);
      }
    }

    setSnoozedUntilMap((prev) => {
      let changed = false;
      const next: Record<string, number> = {};
      for (const [id, until] of Object.entries(prev)) {
        if (pendingIds.has(id) && until > nowMs) {
          next[id] = until;
        } else {
          changed = true;
        }
      }
      return changed ? next : prev;
    });
  }, [adminTasks, nowMs]);

  // Fire chime & OS browser notification when entering 5-min window, due time, or periodic overdue ping
  useEffect(() => {
    if (!isAdmin || activeAlerts.length === 0) return;

    let shouldPlayChime = false;
    let isUrgentChime = false;

    for (const { task, timing } of activeAlerts) {
      const key = `${task.id}::${task.dueDate}::${task.dueTime}`;
      const record = triggeredRef.current.get(key) || {
        preNotified: false,
        dueNotified: false,
        lastOverduePingAt: 0,
      };

      const scheduleText = formatTaskScheduleLabel(task.dueDate, task.dueTime);

      if (timing.isInPreReminderWindow && !record.preNotified) {
        record.preNotified = true;
        shouldPlayChime = true;
        const mins = Math.max(1, Math.ceil(timing.minutesUntilDue || task.reminderMinutesBefore || 5));
        sendBrowserTaskNotification(
          `⏰ Faltan ${mins} min: ${task.title}`,
          `Responsable: ${task.assignedWorkerName} · ${scheduleText}`,
          `task-pre-${task.id}`,
          () => setCurrentView('admin_tareas')
        );
      } else if (timing.isDueNow && !record.dueNotified) {
        record.dueNotified = true;
        record.lastOverduePingAt = nowMs;
        shouldPlayChime = true;
        isUrgentChime = true;
        sendBrowserTaskNotification(
          `🔔 ¡Es la hora!: ${task.title}`,
          `Responsable: ${task.assignedWorkerName} · ${scheduleText}`,
          `task-due-${task.id}`,
          () => setCurrentView('admin_tareas')
        );
      } else if (timing.isOverdue) {
        // First time noticing overdue or every 10 minutes while still pending
        const TEN_MINUTES_MS = 10 * 60 * 1000;
        if (!record.dueNotified || nowMs - record.lastOverduePingAt >= TEN_MINUTES_MS) {
          record.dueNotified = true;
          record.lastOverduePingAt = nowMs;
          shouldPlayChime = true;
          isUrgentChime = true;
          sendBrowserTaskNotification(
            `🚨 Tarea pendiente (${timing.urgencyLabel}): ${task.title}`,
            `Responsable: ${task.assignedWorkerName} · ${scheduleText}`,
            `task-overdue-${task.id}`,
            () => setCurrentView('admin_tareas')
          );
        }
      }

      triggeredRef.current.set(key, record);
    }

    if (shouldPlayChime && !isMuted) {
      playTaskReminderChime(isUrgentChime);
    }
  }, [isAdmin, activeAlerts, isMuted, nowMs, setCurrentView]);

  if (!isAdmin || activeAlerts.length === 0) {
    return null;
  }

  const visibleAlerts = activeAlerts.slice(0, 3);
  const hiddenCount = activeAlerts.length - visibleAlerts.length;

  const handleSnooze = (taskId: string, minutes = 5) => {
    setSnoozedUntilMap((prev) => ({
      ...prev,
      [taskId]: Date.now() + minutes * 60 * 1000,
    }));
  };

  const handleComplete = (taskId: string) => {
    toggleAdminTaskStatus(taskId, currentUser?.name || 'Administrador');
  };

  return (
    <div
      className="fixed bottom-4 right-4 z-50 flex flex-col gap-2.5 w-[calc(100vw-2rem)] max-w-sm no-print"
      role="region"
      aria-label="Recordatorios de tareas pendientes"
    >
      {/* Compact bar when alerts are visible */}
      <div className="flex items-center justify-between px-3 py-1.5 rounded-lg bg-slate-900 text-white border border-slate-700 shadow-lg text-xs">
        <div className="flex items-center gap-1.5 font-semibold">
          <BellRing className="w-3.5 h-3.5 text-amber-400 animate-pulse shrink-0" />
          <span className="tabular-nums">
            {activeAlerts.length}{' '}
            {activeAlerts.length === 1 ? 'recordatorio activo' : 'recordatorios activos'}
          </span>
        </div>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMute}
            className="text-slate-300 hover:text-white flex items-center gap-1 cursor-pointer"
            title={isMuted ? 'Activar sonido de recordatorios' : 'Silenciar sonido de recordatorios'}
          >
            {isMuted ? <VolumeX className="w-3.5 h-3.5 text-rose-400" /> : <Volume2 className="w-3.5 h-3.5 text-emerald-400" />}
            <span className="text-[11px]">{isMuted ? 'Silenciado' : 'Sonido'}</span>
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('admin_tareas')}
            className="text-amber-400 hover:text-amber-300 font-semibold text-[11px] flex items-center gap-0.5 cursor-pointer"
          >
            <span>Ver todas</span>
            <ArrowRight className="w-3 h-3" />
          </button>
        </div>
      </div>

      {visibleAlerts.map(({ task, timing }) => {
        const isUrgent = timing.isOverdue || timing.isDueNow;
        const hasPhone = Boolean(task.assignedWorkerPhone && task.assignedWorkerPhone.replace(/\D/g, '').length >= 7);
        const reminderWaUrl = hasPhone
          ? buildTaskReminderWhatsAppUrl(task, settings.commercialName, timing)
          : '';

        return (
          <div
            key={task.id}
            className={`bg-white rounded-xl border-2 shadow-xl overflow-hidden transition-all ${
              isUrgent ? 'border-rose-500' : 'border-amber-500'
            }`}
          >
            {/* Top Status Strip */}
            <div
              className={`px-3.5 py-2 flex items-center justify-between gap-2 text-xs font-bold ${
                isUrgent
                  ? 'bg-rose-600 text-white'
                  : 'bg-amber-400 text-slate-950'
              }`}
            >
              <div className="flex items-center gap-1.5 min-w-0">
                <Clock className="w-3.5 h-3.5 shrink-0" />
                <span className="truncate tabular-nums">{timing.urgencyLabel}</span>
              </div>
              <span className="text-[11px] font-mono shrink-0 opacity-95 tabular-nums">
                {formatTaskScheduleLabel(task.dueDate, task.dueTime)}
              </span>
            </div>

            {/* Task Body */}
            <div className="p-3.5 space-y-2.5">
              <div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-500 font-medium mb-0.5">
                  <span className="truncate">{getAdminTaskCategoryLabel(task.category)}</span>
                  <span
                    className={`font-bold uppercase tracking-wider shrink-0 ${
                      task.priority === 'ALTA'
                        ? 'text-rose-600'
                        : task.priority === 'MEDIA'
                        ? 'text-amber-700'
                        : 'text-slate-500'
                    }`}
                  >
                    {task.priority === 'ALTA'
                      ? 'Prioridad Alta'
                      : task.priority === 'MEDIA'
                      ? 'Prioridad Media'
                      : 'Prioridad Baja'}
                  </span>
                </div>
                <h4 className="text-sm font-bold text-slate-900 leading-snug">
                  {task.title}
                </h4>
                {task.description && (
                  <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                    {task.description}
                  </p>
                )}
              </div>

              <div className="flex items-center gap-1.5 text-xs text-slate-700 bg-slate-50 border border-slate-200 rounded-lg px-2.5 py-1.5">
                <User className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                <span className="font-semibold truncate">{task.assignedWorkerName}</span>
                {task.assignedWorkerPhone && (
                  <span className="text-[11px] text-slate-500 font-mono ml-auto shrink-0">
                    {task.assignedWorkerPhone}
                  </span>
                )}
              </div>

              {/* Actions */}
              <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                <button
                  type="button"
                  onClick={() => handleComplete(task.id)}
                  className="flex-1 min-w-[130px] px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-lg transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Marcar Realizada</span>
                </button>

                {hasPhone && (
                  <a
                    href={reminderWaUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    onClick={() => markAdminTaskNotified(task.id, 'preReminder')}
                    className="px-2.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                    title="Enviar recordatorio al WhatsApp del trabajador"
                  >
                    <MessageSquare className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Recordar</span>
                  </a>
                )}

                <button
                  type="button"
                  onClick={() => handleSnooze(task.id, 5)}
                  className="px-2.5 py-2 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold text-xs rounded-lg transition-colors flex items-center gap-1 cursor-pointer"
                  title="Posponer este aviso en pantalla por 5 minutos"
                >
                  <AlarmClock className="w-3.5 h-3.5 text-slate-500" />
                  <span>+5m</span>
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {hiddenCount > 0 && (
        <button
          type="button"
          onClick={() => setCurrentView('admin_tareas')}
          className="w-full py-2 px-3 bg-slate-900 hover:bg-slate-800 text-amber-400 font-bold text-xs rounded-lg border border-slate-700 shadow-md text-center cursor-pointer"
        >
          Ver {hiddenCount} {hiddenCount === 1 ? 'tarea pendiente más' : 'tareas pendientes más'} →
        </button>
      )}
    </div>
  );
};
