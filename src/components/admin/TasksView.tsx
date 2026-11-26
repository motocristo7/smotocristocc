import React, { useEffect, useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  AdminTask,
  AdminTaskCategory,
  AdminTaskPriority,
  DEFAULT_ADMIN_TASK_CATEGORIES,
} from '../../types';
import {
  Bell,
  BellOff,
  BellRing,
  Calendar,
  Check,
  CheckCircle2,
  Circle,
  Clock,
  Edit3,
  MessageSquare,
  Plus,
  Search,
  Trash2,
  User,
  Volume2,
  VolumeX,
  X,
  AlertTriangle,
  RotateCcw,
} from 'lucide-react';
import {
  buildTaskAssignmentWhatsAppUrl,
  buildTaskReminderWhatsAppUrl,
  formatTaskScheduleLabel,
  getAdminTaskCategoryLabel,
  getBrowserNotificationPermission,
  getLocalTimeHHMM,
  getLocalTodayISO,
  getTaskTimingState,
  playTaskReminderChime,
  requestBrowserNotificationPermission,
} from '../../utils/taskNotifications';
import {
  TASK_ALERTS_MUTE_EVENT,
  TASK_ALERTS_MUTE_STORAGE_KEY,
} from './TaskReminderNotifier';

type TaskStatusTab = 'PENDIENTES' | 'HOY' | 'URGENTES' | 'REALIZADAS' | 'TODAS';

interface TaskFormState {
  title: string;
  description: string;
  category: AdminTaskCategory;
  priority: AdminTaskPriority;
  assignedWorkerId: string; // 'user:<id>' | 'tech:<id>' | 'CUSTOM'
  assignedUserId?: string;
  assignedWorkerName: string;
  assignedWorkerPhone: string;
  dueDate: string;
  dueTime: string;
  reminderMinutesBefore: number;
  notifyWorkerOnSave: boolean;
}

const QUICK_TASK_TEMPLATES: Array<{
  label: string;
  title: string;
  category: AdminTaskCategory;
  priority: AdminTaskPriority;
  description: string;
}> = [
  {
    label: 'Envío encomienda',
    title: 'Realizar envío por MRW / Zoom',
    category: 'ENVIOS',
    priority: 'ALTA',
    description: 'Empacar pedido, llevar a la agencia y enviar foto de la guía al cliente.',
  },
  {
    label: 'Comprar materiales',
    title: 'Comprar materiales e insumos',
    category: 'COMPRAR_MATERIALES',
    priority: 'MEDIA',
    description: 'Verificar lista de materiales faltantes y traer factura o nota de compra.',
  },
  {
    label: 'Entregar repuesto',
    title: 'Buscar / entregar repuesto',
    category: 'REPUESTOS',
    priority: 'ALTA',
    description: 'Confirmar referencia exacta del repuesto antes de retirar o despachar.',
  },
  {
    label: 'Trabajo de taller',
    title: 'Terminar trabajo de taller / tapicería',
    category: 'TALLER',
    priority: 'MEDIA',
    description: 'Revisar acabados y avisar al cliente cuando esté listo para retiro.',
  },
];

function getDefaultDueTimePlusMinutes(minutesAhead: number): { date: string; time: string } {
  const target = new Date(Date.now() + minutesAhead * 60 * 1000);
  return {
    date: getLocalTodayISO(target),
    time: getLocalTimeHHMM(target),
  };
}

export const TasksView: React.FC = () => {
  const {
    adminTasks,
    addAdminTask,
    updateAdminTask,
    toggleAdminTaskStatus,
    markAdminTaskNotified,
    deleteAdminTask,
    technicians,
    staffUsers,
    currentUser,
    settings,
    setWhatsappModalData,
  } = useApp();

  const [nowMs, setNowMs] = useState<number>(() => Date.now());
  const [activeTab, setActiveTab] = useState<TaskStatusTab>('PENDIENTES');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedWorkerFilter, setSelectedWorkerFilter] = useState<string>('ALL');
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>('ALL');

  // Notification & sound state
  const [notifPermission, setNotifPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getBrowserNotificationPermission()
  );
  const [isMuted, setIsMuted] = useState<boolean>(() => {
    try {
      return localStorage.getItem(TASK_ALERTS_MUTE_STORAGE_KEY) === 'true';
    } catch {
      return false;
    }
  });

  // Modal state
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string>('');
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const [form, setForm] = useState<TaskFormState>(() => {
    const def = getDefaultDueTimePlusMinutes(30);
    return {
      title: '',
      description: '',
      category: 'ENVIOS',
      priority: 'MEDIA',
      assignedWorkerId: 'CUSTOM',
      assignedWorkerName: '',
      assignedWorkerPhone: '',
      dueDate: def.date,
      dueTime: def.time,
      reminderMinutesBefore: 5,
      notifyWorkerOnSave: true,
    };
  });

  // Keep live countdown labels fresh every 15 seconds
  useEffect(() => {
    const timer = setInterval(() => setNowMs(Date.now()), 15000);
    return () => clearInterval(timer);
  }, []);

  // Sync mute state with TaskReminderNotifier
  useEffect(() => {
    const syncMute = () => {
      try {
        setIsMuted(localStorage.getItem(TASK_ALERTS_MUTE_STORAGE_KEY) === 'true');
      } catch {}
    };
    window.addEventListener(TASK_ALERTS_MUTE_EVENT, syncMute);
    return () => window.removeEventListener(TASK_ALERTS_MUTE_EVENT, syncMute);
  }, []);

  const handleToggleMute = () => {
    const next = !isMuted;
    setIsMuted(next);
    try {
      localStorage.setItem(TASK_ALERTS_MUTE_STORAGE_KEY, next ? 'true' : 'false');
    } catch {}
    window.dispatchEvent(new Event(TASK_ALERTS_MUTE_EVENT));
    if (!next) {
      playTaskReminderChime(false);
    }
  };

  const handleRequestNotifications = async () => {
    const result = await requestBrowserNotificationPermission();
    setNotifPermission(result);
    if (result === 'granted' && !isMuted) {
      playTaskReminderChime(false);
    }
  };

  const activeTechnicians = useMemo(
    () => technicians.filter((t) => t.active !== false),
    [technicians]
  );

  const activeStaffEmployees = useMemo(
    () => staffUsers.filter((u) => u.role === 'EMPLEADO' && u.active !== false),
    [staffUsers]
  );

  // Worker options for filter bar
  const workerFilterOptions = useMemo(() => {
    const names = new Set<string>();
    activeStaffEmployees.forEach((u) => {
      if (u.name.trim()) names.add(u.name.trim());
    });
    activeTechnicians.forEach((t) => {
      if (t.name.trim()) names.add(t.name.trim());
    });
    adminTasks.forEach((t) => {
      if (t.assignedWorkerName.trim()) names.add(t.assignedWorkerName.trim());
    });
    return Array.from(names).sort((a, b) => a.localeCompare(b, 'es'));
  }, [activeStaffEmployees, activeTechnicians, adminTasks]);

  const todayISO = getLocalTodayISO(new Date(nowMs));

  // Precompute timing states for all tasks
  const enrichedTasks = useMemo(() => {
    return adminTasks.map((task) => ({
      task,
      timing: getTaskTimingState(task, nowMs),
    }));
  }, [adminTasks, nowMs]);

  // Summary metrics
  const summary = useMemo(() => {
    let pendingToday = 0;
    let pendingUpcoming = 0;
    let urgentOrOverdue = 0;
    let completed = 0;
    let totalPending = 0;

    for (const { task, timing } of enrichedTasks) {
      if (task.status === 'REALIZADA') {
        completed += 1;
        continue;
      }
      totalPending += 1;
      if (timing.isAlertActive) {
        urgentOrOverdue += 1;
      }
      if (task.dueDate === todayISO) {
        pendingToday += 1;
      } else if (task.dueDate > todayISO) {
        pendingUpcoming += 1;
      }
    }

    return {
      totalPending,
      pendingToday,
      pendingUpcoming,
      urgentOrOverdue,
      completed,
    };
  }, [enrichedTasks, todayISO]);

  // Filtered and sorted rows
  const filteredTasks = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();

    const filtered = enrichedTasks.filter(({ task, timing }) => {
      if (activeTab === 'PENDIENTES' && task.status !== 'PENDIENTE') return false;
      if (activeTab === 'HOY' && (task.status !== 'PENDIENTE' || task.dueDate !== todayISO)) return false;
      if (activeTab === 'URGENTES' && !(task.status === 'PENDIENTE' && timing.isAlertActive)) return false;
      if (activeTab === 'REALIZADAS' && task.status !== 'REALIZADA') return false;

      if (selectedWorkerFilter !== 'ALL' && task.assignedWorkerName !== selectedWorkerFilter) {
        return false;
      }

      if (selectedCategoryFilter !== 'ALL' && task.category !== selectedCategoryFilter) {
        return false;
      }

      if (q) {
        const haystack = [
          task.title,
          task.description || '',
          task.assignedWorkerName,
          task.assignedWorkerPhone || '',
          getAdminTaskCategoryLabel(task.category),
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });

    // Sort: Pending tasks first ordered by soonest/most overdue; completed tasks newest completion first
    return filtered.sort((a, b) => {
      if (a.task.status !== b.task.status) {
        return a.task.status === 'PENDIENTE' ? -1 : 1;
      }
      if (a.task.status === 'REALIZADA') {
        return (b.task.completedAt || b.task.updatedAt || '').localeCompare(
          a.task.completedAt || a.task.updatedAt || ''
        );
      }
      const tsA = a.timing.dueTimestamp ?? Number.MAX_SAFE_INTEGER;
      const tsB = b.timing.dueTimestamp ?? Number.MAX_SAFE_INTEGER;
      return tsA - tsB;
    });
  }, [
    enrichedTasks,
    activeTab,
    todayISO,
    selectedWorkerFilter,
    selectedCategoryFilter,
    searchQuery,
  ]);

  const openCreateModal = () => {
    const def = getDefaultDueTimePlusMinutes(30);
    const firstEmployee = activeStaffEmployees[0];
    const firstTech = activeTechnicians[0];
    setEditingTaskId(null);
    setFormError('');
    setForm({
      title: '',
      description: '',
      category: 'ENVIOS',
      priority: 'MEDIA',
      assignedWorkerId: firstEmployee
        ? `user:${firstEmployee.id}`
        : firstTech
        ? `tech:${firstTech.id}`
        : 'CUSTOM',
      assignedUserId: firstEmployee?.id,
      assignedWorkerName: firstEmployee ? firstEmployee.name : firstTech ? firstTech.name : '',
      assignedWorkerPhone: firstEmployee?.phone || firstTech?.phone || '',
      dueDate: def.date,
      dueTime: def.time,
      reminderMinutesBefore: 5,
      notifyWorkerOnSave: true,
    });
    setIsModalOpen(true);
  };

  const openEditModal = (task: AdminTask) => {
    const matchedEmployee = activeStaffEmployees.find(
      (u) =>
        (task.assignedUserId && u.id === task.assignedUserId) ||
        u.name.trim().toLowerCase() === task.assignedWorkerName.trim().toLowerCase()
    );
    const matchedTech = activeTechnicians.find(
      (t) => t.id === task.assignedWorkerId || t.name === task.assignedWorkerName
    );
    setEditingTaskId(task.id);
    setFormError('');
    setForm({
      title: task.title,
      description: task.description || '',
      category: task.category,
      priority: task.priority,
      assignedWorkerId: matchedEmployee
        ? `user:${matchedEmployee.id}`
        : matchedTech
        ? `tech:${matchedTech.id}`
        : 'CUSTOM',
      assignedUserId: matchedEmployee?.id || task.assignedUserId,
      assignedWorkerName: task.assignedWorkerName,
      assignedWorkerPhone: task.assignedWorkerPhone || '',
      dueDate: task.dueDate,
      dueTime: task.dueTime,
      reminderMinutesBefore: task.reminderMinutesBefore || 5,
      notifyWorkerOnSave: false,
    });
    setIsModalOpen(true);
  };

  const handleWorkerSelectChange = (value: string) => {
    if (value === 'CUSTOM') {
      setForm((prev) => ({
        ...prev,
        assignedWorkerId: 'CUSTOM',
        assignedUserId: undefined,
        assignedWorkerName: '',
        assignedWorkerPhone: '',
      }));
      return;
    }
    if (value.startsWith('user:')) {
      const uid = value.slice(5);
      const emp = activeStaffEmployees.find((u) => u.id === uid);
      if (emp) {
        setForm((prev) => ({
          ...prev,
          assignedWorkerId: value,
          assignedUserId: emp.id,
          assignedWorkerName: emp.name,
          assignedWorkerPhone: emp.phone || '',
        }));
      }
      return;
    }
    const techId = value.startsWith('tech:') ? value.slice(5) : value;
    const tech = activeTechnicians.find((t) => t.id === techId);
    if (tech) {
      const linkedEmp = activeStaffEmployees.find((u) => u.linkedTechnicianId === tech.id);
      setForm((prev) => ({
        ...prev,
        assignedWorkerId: `tech:${tech.id}`,
        assignedUserId: linkedEmp?.id,
        assignedWorkerName: tech.name,
        assignedWorkerPhone: tech.phone || linkedEmp?.phone || '',
      }));
    }
  };

  const applyQuickTimePreset = (preset: '10m' | '30m' | '1h' | 'today14' | 'tomorrow9') => {
    if (preset === '10m') {
      const t = getDefaultDueTimePlusMinutes(10);
      setForm((prev) => ({ ...prev, dueDate: t.date, dueTime: t.time }));
    } else if (preset === '30m') {
      const t = getDefaultDueTimePlusMinutes(30);
      setForm((prev) => ({ ...prev, dueDate: t.date, dueTime: t.time }));
    } else if (preset === '1h') {
      const t = getDefaultDueTimePlusMinutes(60);
      setForm((prev) => ({ ...prev, dueDate: t.date, dueTime: t.time }));
    } else if (preset === 'today14') {
      setForm((prev) => ({ ...prev, dueDate: getLocalTodayISO(), dueTime: '14:00' }));
    } else if (preset === 'tomorrow9') {
      const tomorrow = new Date();
      tomorrow.setDate(tomorrow.getDate() + 1);
      setForm((prev) => ({
        ...prev,
        dueDate: getLocalTodayISO(tomorrow),
        dueTime: '09:00',
      }));
    }
  };

  const handleSaveTask = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.title.trim()) {
      setFormError('Escribe el título o descripción corta de la tarea.');
      return;
    }
    if (!form.assignedWorkerName.trim()) {
      setFormError('Selecciona o escribe el nombre del trabajador responsable.');
      return;
    }
    if (!form.dueDate || !form.dueTime) {
      setFormError('Selecciona el día y la hora programada.');
      return;
    }

    setFormError('');
    const cleanPhone = form.assignedWorkerPhone.trim();
    const hasValidPhone = cleanPhone.replace(/\D/g, '').length >= 7;

    let savedTask: AdminTask | null = null;

    let resolvedWorkerId: string | undefined;
    let resolvedUserId: string | undefined = form.assignedUserId;

    if (form.assignedWorkerId.startsWith('user:')) {
      const uid = form.assignedWorkerId.slice(5);
      const emp = activeStaffEmployees.find((u) => u.id === uid);
      resolvedUserId = emp?.id || uid;
      resolvedWorkerId = emp?.linkedTechnicianId;
    } else if (form.assignedWorkerId.startsWith('tech:')) {
      resolvedWorkerId = form.assignedWorkerId.slice(5);
    } else if (form.assignedWorkerId !== 'CUSTOM') {
      resolvedWorkerId = form.assignedWorkerId;
    }

    if (editingTaskId) {
      savedTask = updateAdminTask(editingTaskId, {
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        priority: form.priority,
        assignedWorkerId: resolvedWorkerId,
        assignedUserId: resolvedUserId,
        assignedWorkerName: form.assignedWorkerName.trim(),
        assignedWorkerPhone: cleanPhone || undefined,
        dueDate: form.dueDate,
        dueTime: form.dueTime,
        reminderMinutesBefore: form.reminderMinutesBefore,
      });
    } else {
      savedTask = addAdminTask({
        title: form.title.trim(),
        description: form.description.trim() || undefined,
        category: form.category,
        priority: form.priority,
        assignedWorkerId: resolvedWorkerId,
        assignedUserId: resolvedUserId,
        assignedWorkerName: form.assignedWorkerName.trim(),
        assignedWorkerPhone: cleanPhone || undefined,
        dueDate: form.dueDate,
        dueTime: form.dueTime,
        reminderMinutesBefore: form.reminderMinutesBefore,
        assignedNotifiedAt: form.notifyWorkerOnSave && hasValidPhone ? new Date().toISOString() : undefined,
      });
    }

    setIsModalOpen(false);

    // Open clean WhatsApp preview modal to notify worker immediately (zero popup-blocker issues)
    if (savedTask && form.notifyWorkerOnSave && hasValidPhone) {
      const waUrl = buildTaskAssignmentWhatsAppUrl(savedTask, settings.commercialName);
      const schedule = formatTaskScheduleLabel(savedTask.dueDate, savedTask.dueTime);
      const categoryLabel = getAdminTaskCategoryLabel(savedTask.category);
      const previewMessage = `📋 NUEVA TAREA ASIGNADA — ${settings.commercialName.toUpperCase()}\n\n👤 Responsable: ${savedTask.assignedWorkerName}\n📌 Tarea: ${savedTask.title}\n🏷️ Tipo: ${categoryLabel}\n📅 Cuándo: ${schedule} (${savedTask.dueDate})${savedTask.description ? `\n📝 Detalles: ${savedTask.description}` : ''}\n\n⏰ Recordatorio: Aviso ${savedTask.reminderMinutesBefore} min antes.`;

      setWhatsappModalData({
        title: `Notificar Tarea a ${savedTask.assignedWorkerName}`,
        message: previewMessage,
        url: waUrl,
        phone: cleanPhone,
        recipientName: savedTask.assignedWorkerName,
        primaryLabel: 'Enviar Tarea por WhatsApp',
        isTechnician: true,
      });
    }
  };

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-[11px] font-bold text-amber-700 uppercase tracking-wider">
            Agenda Operativa del Equipo
          </span>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-slate-900 mt-0.5">
            Tareas Pendientes y Recordatorios
          </h1>
          <p className="text-xs text-slate-600 mt-1">
            Asigna envíos, compras de materiales y pendientes a tu equipo con alertas en pantalla{' '}
            <strong className="text-slate-900">5 minutos antes</strong> y avisos al WhatsApp. Al marcar una tarea como realizada, sus recordatorios se detienen automáticamente.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          {/* Desktop Notification Permission Control */}
          {notifPermission !== 'unsupported' && (
            <button
              type="button"
              onClick={handleRequestNotifications}
              className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer ${
                notifPermission === 'granted'
                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                  : notifPermission === 'denied'
                  ? 'bg-slate-100 text-slate-500 border-slate-200'
                  : 'bg-amber-50 hover:bg-amber-100 text-amber-900 border-amber-300'
              }`}
              title={
                notifPermission === 'granted'
                  ? 'Notificaciones de escritorio activas'
                  : notifPermission === 'denied'
                  ? 'Notificaciones bloqueadas en el navegador (habilítalas en el candado de la barra de direcciones)'
                  : 'Activar notificaciones en tu computadora o teléfono'
              }
            >
              {notifPermission === 'granted' ? (
                <>
                  <BellRing className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Alertas Activas</span>
                </>
              ) : notifPermission === 'denied' ? (
                <>
                  <BellOff className="w-3.5 h-3.5" />
                  <span>Alertas Bloqueadas</span>
                </>
              ) : (
                <>
                  <Bell className="w-3.5 h-3.5 text-amber-700" />
                  <span>Activar Alertas</span>
                </>
              )}
            </button>
          )}

          {/* Audio Toggle */}
          <button
            type="button"
            onClick={handleToggleMute}
            className={`px-3 py-2 rounded-lg text-xs font-semibold border transition-colors flex items-center gap-1.5 cursor-pointer ${
              isMuted
                ? 'bg-slate-100 text-slate-600 border-slate-300 hover:bg-slate-200'
                : 'bg-white text-slate-700 border-slate-300 hover:bg-slate-50'
            }`}
            title={isMuted ? 'Activar sonido de aviso' : 'Silenciar sonido de aviso'}
          >
            {isMuted ? (
              <>
                <VolumeX className="w-3.5 h-3.5 text-rose-600" />
                <span>Silenciado</span>
              </>
            ) : (
              <>
                <Volume2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>Con Sonido</span>
              </>
            )}
          </button>

          {/* Primary Create CTA */}
          <button
            type="button"
            onClick={openCreateModal}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4" />
            <span>Nueva Tarea</span>
          </button>
        </div>
      </div>

      {/* 4-Column Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        <button
          type="button"
          onClick={() => setActiveTab('HOY')}
          className={`text-left bg-white rounded-xl border p-4 transition-colors cursor-pointer ${
            activeTab === 'HOY' ? 'border-amber-500 ring-1 ring-amber-500' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Pendientes Hoy
          </span>
          <p className="text-2xl font-bold font-mono text-slate-950 mt-1 tabular-nums">
            {summary.pendingToday}
          </p>
          <span className="text-[11px] text-slate-500">Programadas para hoy</span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('URGENTES')}
          className={`text-left bg-white rounded-xl border p-4 transition-colors cursor-pointer ${
            activeTab === 'URGENTES'
              ? 'border-rose-500 ring-1 ring-rose-500'
              : summary.urgentOrOverdue > 0
              ? 'border-rose-200 hover:border-rose-300'
              : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Por Vencer / Vencidas
          </span>
          <p
            className={`text-2xl font-bold font-mono mt-1 tabular-nums ${
              summary.urgentOrOverdue > 0 ? 'text-rose-600' : 'text-slate-950'
            }`}
          >
            {summary.urgentOrOverdue}
          </p>
          <span className="text-[11px] text-slate-500">
            {summary.urgentOrOverdue > 0 ? 'Con recordatorio activo' : 'Todo al día'}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('PENDIENTES')}
          className={`text-left bg-white rounded-xl border p-4 transition-colors cursor-pointer ${
            activeTab === 'PENDIENTES' ? 'border-amber-500 ring-1 ring-amber-500' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Total Pendientes
          </span>
          <p className="text-2xl font-bold font-mono text-slate-950 mt-1 tabular-nums">
            {summary.totalPending}
          </p>
          <span className="text-[11px] text-slate-500 tabular-nums">
            {summary.pendingUpcoming} para próximos días
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('REALIZADAS')}
          className={`text-left bg-white rounded-xl border p-4 transition-colors cursor-pointer ${
            activeTab === 'REALIZADAS' ? 'border-emerald-500 ring-1 ring-emerald-500' : 'border-slate-200 hover:border-slate-300'
          }`}
        >
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Realizadas
          </span>
          <p className="text-2xl font-bold font-mono text-emerald-700 mt-1 tabular-nums">
            {summary.completed}
          </p>
          <span className="text-[11px] text-slate-500">Alertas detenidas</span>
        </button>
      </div>

      {/* Filters & Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-3">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
          {/* Segmented Status Tabs */}
          <div className="flex flex-wrap items-center gap-1 bg-slate-100 p-1 rounded-lg">
            {(
              [
                { id: 'PENDIENTES', label: `Pendientes (${summary.totalPending})` },
                { id: 'HOY', label: `Hoy (${summary.pendingToday})` },
                { id: 'URGENTES', label: `Urgentes (${summary.urgentOrOverdue})` },
                { id: 'REALIZADAS', label: `Realizadas (${summary.completed})` },
                { id: 'TODAS', label: `Todas (${adminTasks.length})` },
              ] as Array<{ id: TaskStatusTab; label: string }>
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-colors cursor-pointer tabular-nums ${
                  activeTab === tab.id
                    ? 'bg-slate-900 text-white'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {/* Search & Dropdowns */}
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative flex-1 min-w-[190px]">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar tarea o trabajador..."
                className="w-full pl-8 pr-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
              />
            </div>

            <select
              value={selectedWorkerFilter}
              onChange={(e) => setSelectedWorkerFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-400"
              aria-label="Filtrar por trabajador"
            >
              <option value="ALL">Todos los trabajadores</option>
              {workerFilterOptions.map((name) => (
                <option key={name} value={name}>
                  {name}
                </option>
              ))}
            </select>

            <select
              value={selectedCategoryFilter}
              onChange={(e) => setSelectedCategoryFilter(e.target.value)}
              className="px-2.5 py-1.5 text-xs border border-slate-300 rounded-lg bg-white text-slate-700 font-medium focus:outline-hidden focus:ring-2 focus:ring-amber-400"
              aria-label="Filtrar por categoría"
            >
              <option value="ALL">Todas las categorías</option>
              {DEFAULT_ADMIN_TASK_CATEGORIES.map((cat) => (
                <option key={cat.id} value={cat.id}>
                  {cat.label}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Task List */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filteredTasks.length === 0 ? (
          <div className="py-12 px-6 text-center space-y-2.5">
            <div className="w-11 h-11 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <CheckCircle2 className="w-5 h-5" />
            </div>
            <h3 className="text-sm font-bold text-slate-800">
              {adminTasks.length === 0
                ? 'Aún no hay tareas registradas'
                : 'No hay tareas que coincidan con este filtro'}
            </h3>
            <p className="text-xs text-slate-500 max-w-md mx-auto">
              Crea una tarea para programar envíos, compras de materiales o pendientes del taller, asignarla a un trabajador y recibir recordatorios 5 minutos antes.
            </p>
            <div className="pt-1">
              <button
                type="button"
                onClick={openCreateModal}
                className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>Crear Primera Tarea</span>
              </button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {filteredTasks.map(({ task, timing }) => {
              const isDone = task.status === 'REALIZADA';
              const hasPhone = Boolean(
                task.assignedWorkerPhone && task.assignedWorkerPhone.replace(/\D/g, '').length >= 7
              );
              const isUrgent = !isDone && (timing.isOverdue || timing.isDueNow);
              const isPreWindow = !isDone && timing.isInPreReminderWindow;
              const useReminderMessage = isUrgent || isPreWindow;
              const waUrl = hasPhone
                ? useReminderMessage
                  ? buildTaskReminderWhatsAppUrl(task, settings.commercialName, timing)
                  : buildTaskAssignmentWhatsAppUrl(task, settings.commercialName)
                : '';

              return (
                <div
                  key={task.id}
                  className={`p-4 transition-colors flex flex-col lg:flex-row lg:items-center gap-3.5 ${
                    isDone
                      ? 'bg-slate-50/70'
                      : isUrgent
                      ? 'bg-rose-50/40'
                      : isPreWindow
                      ? 'bg-amber-50/50'
                      : 'hover:bg-slate-50/60'
                  }`}
                >
                  {/* Left: 1-Click Complete Toggle + Main Details */}
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <button
                      type="button"
                      onClick={() =>
                        toggleAdminTaskStatus(task.id, currentUser?.name || 'Administrador')
                      }
                      className={`mt-0.5 shrink-0 transition-colors cursor-pointer ${
                        isDone
                          ? 'text-emerald-600 hover:text-emerald-700'
                          : isUrgent
                          ? 'text-rose-500 hover:text-emerald-600'
                          : 'text-slate-400 hover:text-emerald-600'
                      }`}
                      title={
                        isDone
                          ? 'Reabrir tarea como pendiente'
                          : 'Marcar como realizada (detiene notificaciones)'
                      }
                    >
                      {isDone ? (
                        <CheckCircle2 className="w-5 h-5" />
                      ) : (
                        <Circle className="w-5 h-5" />
                      )}
                    </button>

                    <div className="min-w-0 flex-1 space-y-1">
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <h3
                          className={`text-sm font-bold leading-snug ${
                            isDone ? 'text-slate-500 line-through' : 'text-slate-900'
                          }`}
                        >
                          {task.title}
                        </h3>
                        <span className="text-[11px] font-semibold text-slate-600 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                          {getAdminTaskCategoryLabel(task.category)}
                        </span>
                        <span
                          className={`text-[11px] font-bold uppercase tracking-wider ${
                            task.priority === 'ALTA'
                              ? 'text-rose-600'
                              : task.priority === 'MEDIA'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          · {task.priority}
                        </span>
                      </div>

                      {task.description && (
                        <p className={`text-xs ${isDone ? 'text-slate-400' : 'text-slate-600'}`}>
                          {task.description}
                        </p>
                      )}

                      <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-600 pt-0.5">
                        <span className="inline-flex items-center gap-1.5 font-medium text-slate-800">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>{task.assignedWorkerName}</span>
                          {task.assignedWorkerPhone && (
                            <span className="text-[11px] font-mono text-slate-500">
                              ({task.assignedWorkerPhone})
                            </span>
                          )}
                        </span>

                        {task.assignedNotifiedAt && (
                          <span className="text-[11px] text-emerald-700 font-medium inline-flex items-center gap-1">
                            <Check className="w-3 h-3" />
                            <span>Asignación notificada</span>
                          </span>
                        )}

                        {task.preReminderSentAt && !isDone && (
                          <span className="text-[11px] text-amber-800 font-medium inline-flex items-center gap-1">
                            <BellRing className="w-3 h-3" />
                            <span>Recordatorio enviado</span>
                          </span>
                        )}

                        {isDone && task.completedAt && (
                          <span className="text-[11px] text-emerald-700 font-medium">
                            Realizada el{' '}
                            {new Date(task.completedAt).toLocaleString('es-VE', {
                              day: '2-digit',
                              month: 'short',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Middle: Schedule & Live Timing Status */}
                  <div className="flex flex-row lg:flex-col items-center lg:items-end justify-between gap-1 shrink-0 pl-8 lg:pl-0 lg:min-w-[165px]">
                    <div className="flex items-center gap-1.5 text-xs font-mono font-bold text-slate-900 tabular-nums">
                      <Calendar className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                      <span>{formatTaskScheduleLabel(task.dueDate, task.dueTime)}</span>
                    </div>

                    <div className="flex items-center gap-1.5 text-xs font-bold tabular-nums">
                      {isDone ? (
                        <span className="text-emerald-700">Completada</span>
                      ) : isUrgent ? (
                        <span className="text-rose-600 inline-flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5" />
                          <span>{timing.urgencyLabel}</span>
                        </span>
                      ) : isPreWindow ? (
                        <span className="text-amber-700 inline-flex items-center gap-1">
                          <BellRing className="w-3.5 h-3.5" />
                          <span>{timing.urgencyLabel}</span>
                        </span>
                      ) : (
                        <span className="text-slate-500 font-medium inline-flex items-center gap-1">
                          <Clock className="w-3.5 h-3.5" />
                          <span>{timing.urgencyLabel}</span>
                        </span>
                      )}
                    </div>

                    {!isDone && (
                      <span className="hidden lg:block text-[10px] text-slate-400 font-medium">
                        Aviso {task.reminderMinutesBefore || 5} min antes
                      </span>
                    )}
                  </div>

                  {/* Right: Operational Actions */}
                  <div className="flex flex-wrap items-center gap-1.5 pl-8 lg:pl-0 shrink-0">
                    {!isDone && hasPhone && (
                      <a
                        href={waUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        onClick={() =>
                          markAdminTaskNotified(
                            task.id,
                            useReminderMessage ? 'preReminder' : 'assigned'
                          )
                        }
                        className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
                          useReminderMessage
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold'
                            : 'bg-emerald-600 hover:bg-emerald-700 text-white'
                        }`}
                        title={
                          useReminderMessage
                            ? 'Enviar recordatorio urgente al WhatsApp del trabajador'
                            : 'Enviar notificación de tarea al WhatsApp del trabajador'
                        }
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span>{useReminderMessage ? 'Recordar' : 'Notificar'}</span>
                      </a>
                    )}

                    <button
                      type="button"
                      onClick={() =>
                        toggleAdminTaskStatus(task.id, currentUser?.name || 'Administrador')
                      }
                      className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold border transition-colors inline-flex items-center gap-1 cursor-pointer ${
                        isDone
                          ? 'bg-white hover:bg-slate-100 text-slate-700 border-slate-300'
                          : 'bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border-emerald-200'
                      }`}
                    >
                      {isDone ? (
                        <>
                          <RotateCcw className="w-3.5 h-3.5" />
                          <span>Reabrir</span>
                        </>
                      ) : (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>Realizada</span>
                        </>
                      )}
                    </button>

                    <button
                      type="button"
                      onClick={() => openEditModal(task)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg border border-transparent hover:border-slate-200 transition-colors cursor-pointer"
                      title="Editar tarea"
                    >
                      <Edit3 className="w-4 h-4" />
                    </button>

                    {confirmDeleteId === task.id ? (
                      <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1 text-[11px]">
                        <span className="font-semibold text-rose-800">¿Borrar?</span>
                        <button
                          type="button"
                          onClick={() => {
                            deleteAdminTask(task.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-1.5 py-0.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded cursor-pointer"
                        >
                          Sí
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteId(null)}
                          className="px-1.5 py-0.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-300 font-semibold rounded cursor-pointer"
                        >
                          No
                        </button>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(task.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar tarea"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Create / Edit Task Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden my-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingTaskId ? 'Editar Tarea Programada' : 'Nueva Tarea Pendiente'}
                </h2>
                <p className="text-xs text-slate-500">
                  Define el responsable, fecha, hora y el aviso previo automático.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTask} className="p-5 space-y-4 max-h-[82vh] overflow-y-auto">
              {/* Quick templates when creating */}
              {!editingTaskId && (
                <div>
                  <span className="block text-[11px] font-bold text-slate-500 uppercase tracking-wider mb-1.5">
                    Plantillas rápidas
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {QUICK_TASK_TEMPLATES.map((tpl) => (
                      <button
                        key={tpl.label}
                        type="button"
                        onClick={() =>
                          setForm((prev) => ({
                            ...prev,
                            title: tpl.title,
                            category: tpl.category,
                            priority: tpl.priority,
                            description: tpl.description,
                          }))
                        }
                        className="px-2.5 py-1 text-xs font-semibold bg-slate-100 hover:bg-amber-100 text-slate-700 hover:text-amber-950 border border-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        + {tpl.label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {/* Title */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  ¿Qué se debe hacer? *
                </label>
                <input
                  type="text"
                  value={form.title}
                  onChange={(e) => setForm((prev) => ({ ...prev, title: e.target.value }))}
                  placeholder="Ej: Enviar paquete por MRW a Valencia / Comprar goma espuma"
                  className="w-full px-3 py-2 text-sm border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-400 focus:border-amber-400"
                  autoFocus
                />
              </div>

              {/* Category & Priority */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Categoría</label>
                  <select
                    value={form.category}
                    onChange={(e) =>
                      setForm((prev) => ({
                        ...prev,
                        category: e.target.value as AdminTaskCategory,
                      }))
                    }
                    className="w-full px-3 py-2 text-xs font-medium border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                  >
                    {DEFAULT_ADMIN_TASK_CATEGORIES.map((cat) => (
                      <option key={cat.id} value={cat.id}>
                        {cat.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">Prioridad</label>
                  <div className="grid grid-cols-3 gap-1.5">
                    {(['ALTA', 'MEDIA', 'BAJA'] as AdminTaskPriority[]).map((prio) => (
                      <button
                        key={prio}
                        type="button"
                        onClick={() => setForm((prev) => ({ ...prev, priority: prio }))}
                        className={`py-2 text-xs font-bold rounded-lg border transition-colors cursor-pointer ${
                          form.priority === prio
                            ? prio === 'ALTA'
                              ? 'bg-rose-600 text-white border-rose-600'
                              : prio === 'MEDIA'
                              ? 'bg-amber-500 text-slate-950 border-amber-500'
                              : 'bg-slate-800 text-white border-slate-800'
                            : 'bg-white text-slate-600 border-slate-300 hover:bg-slate-50'
                        }`}
                      >
                        {prio}
                      </button>
                    ))}
                  </div>
                </div>
              </div>

              {/* Worker Assignment */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1">
                    Asignar a trabajador *
                  </label>
                  <select
                    value={form.assignedWorkerId}
                    onChange={(e) => handleWorkerSelectChange(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                  >
                    {activeStaffEmployees.length > 0 && (
                      <optgroup label="Usuarios del Sistema (Reciben notificación en pantalla)">
                        {activeStaffEmployees.map((emp) => (
                          <option key={emp.id} value={`user:${emp.id}`}>
                            {emp.name}
                            {emp.position ? ` — ${emp.position}` : ''}
                            {emp.username ? ` (@${emp.username})` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    {activeTechnicians.length > 0 && (
                      <optgroup label="Técnicos de Taller">
                        {activeTechnicians.map((tech) => (
                          <option key={tech.id} value={`tech:${tech.id}`}>
                            {tech.name}
                            {tech.specialty ? ` (${tech.specialty})` : ''}
                            {tech.phone ? ` · ${tech.phone}` : ''}
                          </option>
                        ))}
                      </optgroup>
                    )}
                    <option value="CUSTOM">Otro trabajador (escribir nombre y WhatsApp)</option>
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Nombre del responsable *
                    </label>
                    <input
                      type="text"
                      value={form.assignedWorkerName}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, assignedWorkerName: e.target.value }))
                      }
                      placeholder="Nombre del trabajador"
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      WhatsApp del trabajador
                    </label>
                    <input
                      type="tel"
                      value={form.assignedWorkerPhone}
                      onChange={(e) =>
                        setForm((prev) => ({ ...prev, assignedWorkerPhone: e.target.value }))
                      }
                      placeholder="Ej: 0412-1234567"
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                </div>
              </div>

              {/* Date, Time & Reminder Lead Time */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-800">
                    Día y hora programada *
                  </label>
                  <div className="flex flex-wrap items-center gap-1">
                    {(
                      [
                        { id: '10m', label: '+10 min' },
                        { id: '30m', label: '+30 min' },
                        { id: '1h', label: '+1 hora' },
                        { id: 'today14', label: 'Hoy 2 PM' },
                        { id: 'tomorrow9', label: 'Mañana 9 AM' },
                      ] as const
                    ).map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => applyQuickTimePreset(p.id)}
                        className="px-2 py-0.5 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer"
                      >
                        {p.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Fecha
                    </label>
                    <input
                      type="date"
                      value={form.dueDate}
                      onChange={(e) => setForm((prev) => ({ ...prev, dueDate: e.target.value }))}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Hora
                    </label>
                    <input
                      type="time"
                      value={form.dueTime}
                      onChange={(e) => setForm((prev) => ({ ...prev, dueTime: e.target.value }))}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Recordatorio previo
                    </label>
                    <select
                      value={form.reminderMinutesBefore}
                      onChange={(e) =>
                        setForm((prev) => ({
                          ...prev,
                          reminderMinutesBefore: Number(e.target.value) || 5,
                        }))
                      }
                      className="w-full px-3 py-2 text-xs font-semibold border border-slate-300 rounded-lg bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                    >
                      <option value={5}>5 min antes</option>
                      <option value={10}>10 min antes</option>
                      <option value={15}>15 min antes</option>
                      <option value={30}>30 min antes</option>
                    </select>
                  </div>
                </div>
              </div>

              {/* Notes */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Detalles / instrucciones (opcional)
                </label>
                <textarea
                  rows={2}
                  value={form.description}
                  onChange={(e) => setForm((prev) => ({ ...prev, description: e.target.value }))}
                  placeholder="Dirección, proveedor, datos del cliente o notas importantes..."
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                />
              </div>

              {/* Notify Worker Option */}
              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50/70 border border-emerald-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.notifyWorkerOnSave}
                  onChange={(e) =>
                    setForm((prev) => ({ ...prev, notifyWorkerOnSave: e.target.checked }))
                  }
                  className="mt-0.5 rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500"
                />
                <div className="text-xs">
                  <span className="font-bold text-emerald-950 block">
                    Notificar al trabajador por WhatsApp al guardar
                  </span>
                  <span className="text-[11px] text-emerald-800">
                    Abrirá el mensaje listo con la tarea, hora y recordatorio de {form.reminderMinutesBefore} min antes.
                  </span>
                </div>
              </label>

              {formError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-xs font-semibold text-rose-700">
                  {formError}
                </div>
              )}

              {/* Footer Buttons */}
              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  {editingTaskId ? 'Guardar Cambios' : 'Programar Tarea'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
