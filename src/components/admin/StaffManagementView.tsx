import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  ADMIN_MODULES_CATALOG,
  AdminModuleId,
  AppUser,
  AttendancePunctualityStatus,
  STAFF_ROLE_PRESETS,
  StaffAttendanceRecord,
  StaffNotificationPriority,
} from '../../types';
import {
  buildEmployeePerformanceReports,
  EmployeePerformanceReport,
  EvaluationDatePreset,
  exportEmployeeReportsCsv,
  formatDurationMinutes,
  formatTime12h,
  getEvaluationDateRange,
} from '../../utils/staffAnalytics';
import { getLocalTimeHHMM, getLocalTodayISO } from '../../utils/taskNotifications';
import { buildWhatsAppSendUrl, formatBs, formatUSD } from '../../utils/whatsapp';
import {
  Users,
  UserPlus,
  Clock,
  BarChart3,
  Bell,
  Search,
  Edit3,
  Trash2,
  ShieldCheck,
  CheckCircle2,
  X,
  Download,
  Printer,
  Send,
  LogIn,
  LogOut,
  Eye,
  MessageSquare,
  Power,
  KeyRound,
  AlertTriangle,
  Calendar,
  Wrench,
  ShoppingBag,
  ListTodo,
  FileText,
} from 'lucide-react';

type StaffWorkspaceTab = 'USUARIOS' | 'ASISTENCIA' | 'REPORTES' | 'NOTIFICACIONES';

interface StaffFormState {
  name: string;
  username: string;
  documentId: string;
  phone: string;
  email: string;
  position: string;
  password: string;
  allowedModules: AdminModuleId[];
  scheduledStartTime: string;
  scheduledEndTime: string;
  lateToleranceMinutes: number;
  monthlySalesGoalUSD: string;
  linkedTechnicianId: string;
  notes: string;
  active: boolean;
}

const DEFAULT_EMPLOYEE_MODULES: AdminModuleId[] = [
  'admin_pos',
  'admin_ventas',
  'admin_clientes',
  'admin_inventario',
  'admin_tareas',
];

const ASSIGNABLE_MODULES = ADMIN_MODULES_CATALOG.filter((m) => !m.adminOnly);

export const StaffManagementView: React.FC = () => {
  const {
    isAdmin,
    staffUsers,
    createStaffUser,
    updateStaffUser,
    deleteStaffUser,
    staffAttendance,
    recordStaffCheckIn,
    recordStaffCheckOut,
    upsertStaffAttendance,
    deleteStaffAttendance,
    staffNotifications,
    sendStaffNotification,
    deleteStaffNotification,
    sales,
    adminTasks,
    serviceOrders,
    technicians,
    settings,
  } = useApp();

  const [activeTab, setActiveTab] = useState<StaffWorkspaceTab>('USUARIOS');
  const [searchQuery, setSearchQuery] = useState('');
  const [toast, setToast] = useState<string | null>(null);

  const showToast = (msg: string) => {
    setToast(msg);
    setTimeout(() => setToast(null), 3500);
  };

  // Employee list (excluding owner ADMIN for account management, optional include in reports)
  const employeeAccounts = useMemo(
    () =>
      staffUsers
        .filter((u) => u.role === 'EMPLEADO')
        .sort((a, b) => (a.active === false ? 1 : 0) - (b.active === false ? 1 : 0) || a.name.localeCompare(b.name, 'es')),
    [staffUsers]
  );

  const activeEmployees = useMemo(
    () => employeeAccounts.filter((u) => u.active !== false),
    [employeeAccounts]
  );

  // =========================================================================
  // Tab 1: Create / Edit Staff User Modal
  // =========================================================================
  const [isUserModalOpen, setIsUserModalOpen] = useState(false);
  const [editingUserId, setEditingUserId] = useState<string | null>(null);
  const [userFormError, setUserFormError] = useState('');
  const [isSavingUser, setIsSavingUser] = useState(false);
  const [confirmDeleteUserId, setConfirmDeleteUserId] = useState<string | null>(null);
  const [lastCreatedCredentials, setLastCreatedCredentials] = useState<{
    name: string;
    username: string;
    password: string;
    phone: string;
    position: string;
  } | null>(null);

  const [userForm, setUserForm] = useState<StaffFormState>({
    name: '',
    username: '',
    documentId: '',
    phone: '',
    email: '',
    position: 'Vendedor',
    password: '',
    allowedModules: [...DEFAULT_EMPLOYEE_MODULES],
    scheduledStartTime: '08:00',
    scheduledEndTime: '18:00',
    lateToleranceMinutes: 10,
    monthlySalesGoalUSD: '',
    linkedTechnicianId: '',
    notes: '',
    active: true,
  });

  const openCreateUserModal = () => {
    setEditingUserId(null);
    setUserFormError('');
    setUserForm({
      name: '',
      username: '',
      documentId: '',
      phone: '',
      email: '',
      position: 'Vendedor',
      password: '',
      allowedModules: [...DEFAULT_EMPLOYEE_MODULES],
      scheduledStartTime: '08:00',
      scheduledEndTime: '18:00',
      lateToleranceMinutes: 10,
      monthlySalesGoalUSD: '',
      linkedTechnicianId: '',
      notes: '',
      active: true,
    });
    setIsUserModalOpen(true);
  };

  const openEditUserModal = (user: AppUser) => {
    setEditingUserId(user.id);
    setUserFormError('');
    setUserForm({
      name: user.name || '',
      username: user.username || '',
      documentId: user.documentId || '',
      phone: user.phone || '',
      email: user.email || '',
      position: user.position || 'Trabajador',
      password: '',
      allowedModules:
        Array.isArray(user.allowedModules) && user.allowedModules.length > 0
          ? user.allowedModules.filter((m) => m !== 'admin_usuarios')
          : ['admin_tareas'],
      scheduledStartTime: user.scheduledStartTime || '08:00',
      scheduledEndTime: user.scheduledEndTime || '18:00',
      lateToleranceMinutes: user.lateToleranceMinutes ?? 10,
      monthlySalesGoalUSD: user.monthlySalesGoalUSD ? String(user.monthlySalesGoalUSD) : '',
      linkedTechnicianId: user.linkedTechnicianId || '',
      notes: user.notes || '',
      active: user.active !== false,
    });
    setIsUserModalOpen(true);
  };

  const toggleModulePermission = (moduleId: AdminModuleId) => {
    setUserForm((prev) => {
      const exists = prev.allowedModules.includes(moduleId);
      return {
        ...prev,
        allowedModules: exists
          ? prev.allowedModules.filter((m) => m !== moduleId)
          : [...prev.allowedModules, moduleId],
      };
    });
  };

  const applyRolePreset = (presetId: string) => {
    const preset = STAFF_ROLE_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;
    setUserForm((prev) => ({
      ...prev,
      position: prev.position.trim() ? prev.position : preset.defaultPosition,
      allowedModules: [...preset.modules],
    }));
  };

  const handleSaveUser = async (e: React.FormEvent) => {
    e.preventDefault();
    setUserFormError('');
    if (!userForm.name.trim()) {
      setUserFormError('Ingresa el nombre completo del trabajador.');
      return;
    }
    if (!userForm.username.trim()) {
      setUserFormError('Ingresa un nombre de usuario corto (ej. juan.ventas).');
      return;
    }
    if (userForm.allowedModules.length === 0) {
      setUserFormError('Selecciona al menos un área del sistema para este trabajador.');
      return;
    }
    if (!editingUserId && userForm.password.trim().length < 4) {
      setUserFormError('Define una contraseña inicial de al menos 4 caracteres.');
      return;
    }

    setIsSavingUser(true);
    try {
      if (editingUserId) {
        const result = await updateStaffUser(
          editingUserId,
          {
            name: userForm.name,
            username: userForm.username,
            documentId: userForm.documentId,
            phone: userForm.phone,
            email: userForm.email,
            position: userForm.position,
            allowedModules: userForm.allowedModules,
            scheduledStartTime: userForm.scheduledStartTime,
            scheduledEndTime: userForm.scheduledEndTime,
            lateToleranceMinutes: userForm.lateToleranceMinutes,
            monthlySalesGoalUSD: parseFloat(userForm.monthlySalesGoalUSD) || 0,
            linkedTechnicianId: userForm.linkedTechnicianId || undefined,
            notes: userForm.notes,
            active: userForm.active,
          },
          userForm.password.trim() || undefined
        );
        if (!result.success) {
          setUserFormError(result.error || 'No se pudo actualizar el usuario.');
          return;
        }
        setIsUserModalOpen(false);
        showToast(`Usuario ${userForm.name.trim()} actualizado correctamente.`);
      } else {
        const result = await createStaffUser({
          name: userForm.name,
          username: userForm.username,
          documentId: userForm.documentId,
          phone: userForm.phone,
          email: userForm.email,
          position: userForm.position,
          password: userForm.password,
          allowedModules: userForm.allowedModules,
          scheduledStartTime: userForm.scheduledStartTime,
          scheduledEndTime: userForm.scheduledEndTime,
          lateToleranceMinutes: userForm.lateToleranceMinutes,
          monthlySalesGoalUSD: parseFloat(userForm.monthlySalesGoalUSD) || 0,
          linkedTechnicianId: userForm.linkedTechnicianId || undefined,
          notes: userForm.notes,
          active: userForm.active,
        });
        if (!result.success) {
          setUserFormError(result.error || 'No se pudo crear el usuario.');
          return;
        }
        setLastCreatedCredentials({
          name: userForm.name.trim(),
          username: userForm.username.trim().toLowerCase().replace(/\s+/g, '.'),
          password: userForm.password,
          phone: userForm.phone.trim(),
          position: userForm.position.trim() || 'Trabajador',
        });
        setIsUserModalOpen(false);
        showToast(`Cuenta creada para ${userForm.name.trim()}.`);
      }
    } finally {
      setIsSavingUser(false);
    }
  };

  const filteredEmployees = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return employeeAccounts;
    return employeeAccounts.filter(
      (u) =>
        u.name.toLowerCase().includes(q) ||
        (u.username || '').toLowerCase().includes(q) ||
        (u.position || '').toLowerCase().includes(q) ||
        (u.documentId || '').toLowerCase().includes(q) ||
        (u.phone || '').toLowerCase().includes(q)
    );
  }, [employeeAccounts, searchQuery]);

  // =========================================================================
  // Tab 2: Attendance & Punctuality
  // =========================================================================
  const [attendanceRange, setAttendanceRange] = useState<EvaluationDatePreset>('TODAY');
  const [attendanceUserFilter, setAttendanceUserFilter] = useState<string>('ALL');
  const [isAttendanceModalOpen, setIsAttendanceModalOpen] = useState(false);
  const [attForm, setAttForm] = useState<{
    id?: string;
    userId: string;
    date: string;
    checkInTime: string;
    checkOutTime: string;
    punctualityStatus: '' | AttendancePunctualityStatus;
    notes: string;
  }>({
    userId: '',
    date: getLocalTodayISO(),
    checkInTime: getLocalTimeHHMM(),
    checkOutTime: '',
    punctualityStatus: '',
    notes: '',
  });
  const [confirmDeleteAttId, setConfirmDeleteAttId] = useState<string | null>(null);

  const attendanceDateBounds = useMemo(
    () => getEvaluationDateRange(attendanceRange),
    [attendanceRange]
  );

  const filteredAttendance = useMemo(() => {
    return staffAttendance.filter((r) => {
      if (attendanceUserFilter !== 'ALL' && r.userId !== attendanceUserFilter) return false;
      if (attendanceDateBounds.startDate && r.date < attendanceDateBounds.startDate) return false;
      if (attendanceDateBounds.endDate && r.date > attendanceDateBounds.endDate) return false;
      return true;
    });
  }, [staffAttendance, attendanceUserFilter, attendanceDateBounds]);

  const todayISO = getLocalTodayISO();
  const attendanceTodaySummary = useMemo(() => {
    const todayRecs = staffAttendance.filter((r) => r.date === todayISO);
    const present = todayRecs.filter((r) => r.punctualityStatus === 'PUNTUAL' || r.punctualityStatus === 'TARDE').length;
    const punctual = todayRecs.filter((r) => r.punctualityStatus === 'PUNTUAL').length;
    const late = todayRecs.filter((r) => r.punctualityStatus === 'TARDE').length;
    const absentOrPerm = todayRecs.filter((r) => r.punctualityStatus === 'AUSENTE' || r.punctualityStatus === 'PERMISO').length;
    return { present, punctual, late, absentOrPerm };
  }, [staffAttendance, todayISO]);

  const openAttendanceModal = (record?: StaffAttendanceRecord) => {
    if (record) {
      setAttForm({
        id: record.id,
        userId: record.userId,
        date: record.date,
        checkInTime: record.checkInTime || '',
        checkOutTime: record.checkOutTime || '',
        punctualityStatus:
          record.punctualityStatus === 'AUSENTE' || record.punctualityStatus === 'PERMISO'
            ? record.punctualityStatus
            : '',
        notes: record.notes || '',
      });
    } else {
      setAttForm({
        userId: activeEmployees[0]?.id || employeeAccounts[0]?.id || '',
        date: getLocalTodayISO(),
        checkInTime: getLocalTimeHHMM(),
        checkOutTime: '',
        punctualityStatus: '',
        notes: '',
      });
    }
    setIsAttendanceModalOpen(true);
  };

  const handleSaveAttendance = (e: React.FormEvent) => {
    e.preventDefault();
    if (!attForm.userId || !attForm.date) return;
    upsertStaffAttendance({
      id: attForm.id,
      userId: attForm.userId,
      date: attForm.date,
      checkInTime: attForm.checkInTime || undefined,
      checkOutTime: attForm.checkOutTime || undefined,
      punctualityStatus: attForm.punctualityStatus || undefined,
      notes: attForm.notes,
      checkInSource: 'ADMIN',
    });
    setIsAttendanceModalOpen(false);
    showToast('Registro de asistencia guardado.');
  };

  // =========================================================================
  // Tab 3: Performance Evaluation & Reports
  // =========================================================================
  const [reportPreset, setReportPreset] = useState<EvaluationDatePreset>('MONTH');
  const [includeAdminInReport, setIncludeAdminInReport] = useState(false);
  const [selectedReportUserId, setSelectedReportUserId] = useState<string | null>(null);
  const [detailSubTab, setDetailSubTab] = useState<'ACTIVIDAD' | 'VENTAS' | 'ASISTENCIA' | 'TAREAS' | 'NOTAS'>('ACTIVIDAD');
  const [evalNotesDraft, setEvalNotesDraft] = useState('');

  const reportRange = useMemo(() => getEvaluationDateRange(reportPreset), [reportPreset]);

  const evaluatedUsers = useMemo(() => {
    if (includeAdminInReport) {
      return staffUsers.filter((u) => u.role === 'EMPLEADO' || u.role === 'ADMIN');
    }
    return employeeAccounts;
  }, [staffUsers, employeeAccounts, includeAdminInReport]);

  const performanceReports = useMemo(
    () =>
      buildEmployeePerformanceReports({
        staffUsers: evaluatedUsers,
        sales,
        staffAttendance,
        adminTasks,
        serviceOrders,
        startDate: reportRange.startDate,
        endDate: reportRange.endDate,
        bcvRate: settings.bcvRate,
      }),
    [evaluatedUsers, sales, staffAttendance, adminTasks, serviceOrders, reportRange, settings.bcvRate]
  );

  const executiveSummary = useMemo(() => {
    const teamSalesUSD = performanceReports.reduce((sum, r) => sum + r.salesTotalUSD, 0);
    const teamSalesCount = performanceReports.reduce((sum, r) => sum + r.salesCount, 0);
    const totalAttDays = performanceReports.reduce((sum, r) => sum + r.attendanceDays, 0);
    const totalPunctualDays = performanceReports.reduce((sum, r) => sum + r.punctualDays, 0);
    const avgPunctualityPct =
      totalAttDays > 0 ? Math.round((totalPunctualDays / totalAttDays) * 1000) / 10 : null;
    const totalTasksAssigned = performanceReports.reduce((sum, r) => sum + r.tasksAssigned, 0);
    const totalTasksDone = performanceReports.reduce((sum, r) => sum + r.tasksCompleted, 0);
    const avgTaskPct =
      totalTasksAssigned > 0 ? Math.round((totalTasksDone / totalTasksAssigned) * 1000) / 10 : null;
    return {
      teamSalesUSD,
      teamSalesCount,
      avgPunctualityPct,
      totalAttDays,
      totalTasksAssigned,
      totalTasksDone,
      avgTaskPct,
    };
  }, [performanceReports]);

  const selectedReport: EmployeePerformanceReport | null = useMemo(
    () => performanceReports.find((r) => r.user.id === selectedReportUserId) || null,
    [performanceReports, selectedReportUserId]
  );

  const openEmployeeScorecard = (report: EmployeePerformanceReport) => {
    setSelectedReportUserId(report.user.id);
    setDetailSubTab('ACTIVIDAD');
    setEvalNotesDraft(report.user.notes || '');
  };

  const handleSaveEvaluationNotes = async () => {
    if (!selectedReport || selectedReport.user.role === 'ADMIN') return;
    const res = await updateStaffUser(selectedReport.user.id, { notes: evalNotesDraft });
    if (res.success) {
      showToast('Observaciones de evaluación guardadas.');
    }
  };

  // =========================================================================
  // Tab 4: Staff Notifications Composer
  // =========================================================================
  const [notifRecipient, setNotifRecipient] = useState<string>('ALL_STAFF');
  const [notifPriority, setNotifPriority] = useState<StaffNotificationPriority>('INFO');
  const [notifTitle, setNotifTitle] = useState('');
  const [notifMessage, setNotifMessage] = useState('');
  const [notifView, setNotifView] = useState<'' | AdminModuleId>('');

  const handleSendNotification = (e: React.FormEvent) => {
    e.preventDefault();
    if (!notifTitle.trim() || !notifMessage.trim()) return;
    const sent = sendStaffNotification({
      recipientUserId: notifRecipient,
      title: notifTitle,
      message: notifMessage,
      priority: notifPriority,
      type: 'MENSAJE_ADMIN',
      relatedView: notifView || undefined,
    });
    if (sent.length === 0) {
      showToast('No hay trabajadores activos para recibir la notificación.');
      return;
    }
    setNotifTitle('');
    setNotifMessage('');
    setNotifView('');
    showToast(
      sent.length === 1
        ? `Notificación enviada a ${sent[0].recipientUserName}.`
        : `Notificación enviada a ${sent.length} trabajadores.`
    );
  };

  if (!isAdmin) {
    return (
      <div className="bg-white border border-slate-200 rounded-xl p-8 text-center">
        <ShieldCheck className="w-8 h-8 text-slate-400 mx-auto mb-2" />
        <h2 className="text-base font-bold text-slate-900">Acceso exclusivo del Administrador</h2>
        <p className="text-sm text-slate-500 mt-1">
          Solo el propietario puede gestionar cuentas de trabajadores y reportes de desempeño.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      {/* Feedback Toast */}
      {toast && (
        <div className="fixed bottom-5 left-1/2 -translate-x-1/2 z-50 bg-slate-900 text-white px-4 py-2.5 rounded-lg shadow-xl text-xs font-semibold flex items-center gap-2 border border-slate-700 no-print">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span>{toast}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-xl font-bold text-slate-900 tracking-tight">
            Equipo, Usuarios y Evaluación
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestiona cuentas de trabajadores, permisos por área, control de llegada, notificaciones y reportes reales de desempeño.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={openCreateUserModal}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer"
          >
            <UserPlus className="w-4 h-4 text-amber-400" />
            <span>Nuevo Trabajador</span>
          </button>
        </div>
      </div>

      {/* Credentials Share Banner right after creating a worker */}
      {lastCreatedCredentials && (
        <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-4 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="space-y-0.5">
            <p className="text-xs font-bold text-emerald-900">
              Cuenta lista para {lastCreatedCredentials.name} ({lastCreatedCredentials.position})
            </p>
            <p className="text-xs text-emerald-800 font-mono">
              Usuario: <strong>{lastCreatedCredentials.username}</strong> · Contraseña inicial:{' '}
              <strong>{lastCreatedCredentials.password}</strong>
            </p>
            <p className="text-[11px] text-emerald-700">
              Guarda o envía estos datos al trabajador. Por seguridad, la contraseña queda cifrada y no se volverá a mostrar.
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            {lastCreatedCredentials.phone.replace(/\D/g, '').length >= 7 && (
              <a
                href={buildWhatsAppSendUrl(
                  lastCreatedCredentials.phone,
                  `Hola ${lastCreatedCredentials.name}, ya tienes acceso al sistema de *${settings.commercialName}*.\n\n👤 Usuario: ${lastCreatedCredentials.username}\n🔑 Contraseña: ${lastCreatedCredentials.password}\n\nAl iniciar sesión quedará registrada automáticamente tu hora de llegada diaria.`
                )}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Enviar por WhatsApp</span>
              </a>
            )}
            <button
              type="button"
              onClick={() => setLastCreatedCredentials(null)}
              className="p-1.5 text-emerald-700 hover:text-emerald-900 cursor-pointer"
              aria-label="Cerrar aviso"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* Segmented Navigation Tabs */}
      <div className="flex flex-wrap items-center gap-1 border-b border-slate-200 no-print">
        {[
          { id: 'USUARIOS' as const, label: 'Usuarios y Permisos', count: employeeAccounts.length, icon: Users },
          { id: 'ASISTENCIA' as const, label: 'Asistencia y Puntualidad', count: attendanceTodaySummary.present, icon: Clock },
          { id: 'REPORTES' as const, label: 'Reportes y Evaluación', icon: BarChart3 },
          { id: 'NOTIFICACIONES' as const, label: 'Notificaciones al Equipo', count: staffNotifications.length, icon: Bell },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={`px-3.5 py-2.5 text-xs font-bold border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap shrink-0 cursor-pointer ${
                active
                  ? 'border-slate-900 text-slate-900'
                  : 'border-transparent text-slate-500 hover:text-slate-800'
              }`}
            >
              <Icon className="w-3.5 h-3.5" />
              <span>{tab.label}</span>
              {tab.count !== undefined && (
                <span className="text-[11px] font-mono tabular-nums text-slate-400">({tab.count})</span>
              )}
            </button>
          );
        })}
      </div>

      {/* =================================================================== */}
      {/* TAB 1: USUARIOS Y PERMISOS                                          */}
      {/* =================================================================== */}
      {activeTab === 'USUARIOS' && (
        <div className="space-y-4">
          {/* Summary Strip */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Trabajadores Registrados
              </p>
              <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                {employeeAccounts.length}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {activeEmployees.length} activos · {employeeAccounts.length - activeEmployees.length} inactivos
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Asistencia Hoy
              </p>
              <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                {attendanceTodaySummary.present} / {activeEmployees.length}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {attendanceTodaySummary.punctual} puntuales · {attendanceTodaySummary.late} tarde
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Ventas del Mes (Equipo)
              </p>
              <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                {formatUSD(executiveSummary.teamSalesUSD)}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 font-mono tabular-nums">
                {executiveSummary.teamSalesCount} ventas registradas
              </p>
            </div>
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Notificaciones Sin Leer
              </p>
              <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                {staffNotifications.filter((n) => !n.readAt).length}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5">
                de {staffNotifications.length} enviadas al equipo
              </p>
            </div>
          </div>

          {/* Search Bar */}
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="relative flex-1 max-w-md">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Buscar por nombre, usuario, cargo o cédula..."
                className="w-full pl-9 pr-3 py-2 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:border-slate-400"
              />
            </div>
            <p className="text-[11px] text-slate-500">
              Cada trabajador inicia sesión desde &quot;Ingresar&quot; con su usuario, correo, cédula o teléfono.
            </p>
          </div>

          {/* Employee Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredEmployees.length === 0 ? (
              <div className="p-10 text-center">
                <Users className="w-8 h-8 text-slate-300 mx-auto mb-2" />
                <p className="text-sm font-bold text-slate-800">Aún no has registrado trabajadores</p>
                <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
                  Crea una cuenta para cada empleado, elige a qué áreas del sistema puede entrar y comienza a medir sus ventas, puntualidad y tareas automáticamente.
                </p>
                <button
                  type="button"
                  onClick={openCreateUserModal}
                  className="mt-4 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg inline-flex items-center gap-1.5 cursor-pointer"
                >
                  <UserPlus className="w-3.5 h-3.5 text-amber-400" />
                  <span>Crear primer trabajador</span>
                </button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Trabajador</th>
                      <th className="py-3 px-4">Acceso</th>
                      <th className="py-3 px-4">Horario</th>
                      <th className="py-3 px-4">Áreas Permitidas</th>
                      <th className="py-3 px-4">Estado</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredEmployees.map((emp) => {
                      const isActive = emp.active !== false;
                      const mods = emp.allowedModules || [];
                      const todayAtt = staffAttendance.find(
                        (r) => r.userId === emp.id && r.date === todayISO
                      );
                      return (
                        <tr key={emp.id} className="hover:bg-slate-50/80 transition-colors">
                          <td className="py-3 px-4">
                            <p className="font-bold text-slate-900">{emp.name}</p>
                            <p className="text-[11px] text-slate-500">
                              {emp.position || 'Trabajador'} · {emp.documentId || 'Sin cédula'}
                              {emp.phone ? ` · ${emp.phone}` : ''}
                            </p>
                          </td>
                          <td className="py-3 px-4 font-mono text-[11px] text-slate-700">
                            <p className="font-semibold text-slate-900">{emp.username || '—'}</p>
                            {emp.email && <p className="text-slate-500">{emp.email}</p>}
                          </td>
                          <td className="py-3 px-4 font-mono tabular-nums text-[11px]">
                            <p className="text-slate-900 font-semibold">
                              {formatTime12h(emp.scheduledStartTime || '08:00')} –{' '}
                              {formatTime12h(emp.scheduledEndTime || '18:00')}
                            </p>
                            <p className="text-slate-500">
                              {todayAtt
                                ? todayAtt.punctualityStatus === 'PUNTUAL'
                                  ? `Hoy: ${formatTime12h(todayAtt.checkInTime)} (Puntual)`
                                  : todayAtt.punctualityStatus === 'TARDE'
                                  ? `Hoy: ${formatTime12h(todayAtt.checkInTime)} (+${todayAtt.minutesLate}m)`
                                  : `Hoy: ${todayAtt.punctualityStatus}`
                                : `Tolerancia ${emp.lateToleranceMinutes ?? 10} min`}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <p className="font-semibold text-slate-800 tabular-nums">
                              {mods.length} {mods.length === 1 ? 'área' : 'áreas'}
                            </p>
                            <p className="text-[11px] text-slate-500 max-w-[240px] truncate">
                              {mods
                                .map(
                                  (id) =>
                                    ADMIN_MODULES_CATALOG.find((m) => m.id === id)?.label || id
                                )
                                .join(' · ')}
                            </p>
                          </td>
                          <td className="py-3 px-4">
                            <span
                              className={`text-xs font-bold ${
                                isActive ? 'text-emerald-700' : 'text-slate-400'
                              }`}
                            >
                              {isActive ? 'Activo' : 'Inactivo'}
                            </span>
                            {emp.monthlySalesGoalUSD ? (
                              <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                                Meta {formatUSD(emp.monthlySalesGoalUSD)}/mes
                              </p>
                            ) : null}
                          </td>
                          <td className="py-3 px-4">
                            <div className="flex items-center justify-end gap-1.5">
                              {!todayAtt && isActive && (
                                <button
                                  type="button"
                                  onClick={() => {
                                    recordStaffCheckIn(emp, 'ADMIN');
                                    showToast(`Llegada registrada para ${emp.name}.`);
                                  }}
                                  className="px-2 py-1 text-[11px] font-semibold text-emerald-700 hover:bg-emerald-50 border border-emerald-200 rounded-md flex items-center gap-1 whitespace-nowrap cursor-pointer"
                                  title="Marcar llegada ahora"
                                >
                                  <LogIn className="w-3 h-3" />
                                  <span>Llegada</span>
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setNotifRecipient(emp.id);
                                  setActiveTab('NOTIFICACIONES');
                                }}
                                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                                title="Enviar notificación"
                              >
                                <Bell className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => openEditUserModal(emp)}
                                className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-md cursor-pointer"
                                title="Editar permisos, horario o contraseña"
                              >
                                <Edit3 className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={async () => {
                                  await updateStaffUser(emp.id, { active: !isActive });
                                  showToast(
                                    isActive
                                      ? `Cuenta de ${emp.name} desactivada.`
                                      : `Cuenta de ${emp.name} activada.`
                                  );
                                }}
                                className={`p-1.5 rounded-md cursor-pointer ${
                                  isActive
                                    ? 'text-amber-700 hover:bg-amber-50'
                                    : 'text-emerald-700 hover:bg-emerald-50'
                                }`}
                                title={isActive ? 'Desactivar cuenta' : 'Reactivar cuenta'}
                              >
                                <Power className="w-3.5 h-3.5" />
                              </button>
                              {confirmDeleteUserId === emp.id ? (
                                <div className="flex items-center gap-1">
                                  <button
                                    type="button"
                                    onClick={() => {
                                      deleteStaffUser(emp.id);
                                      setConfirmDeleteUserId(null);
                                      showToast(`Usuario ${emp.name} eliminado.`);
                                    }}
                                    className="px-2 py-1 bg-rose-600 text-white text-[11px] font-bold rounded cursor-pointer"
                                  >
                                    Confirmar
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteUserId(null)}
                                    className="px-1.5 py-1 text-slate-500 text-[11px] cursor-pointer"
                                  >
                                    No
                                  </button>
                                </div>
                              ) : (
                                <button
                                  type="button"
                                  onClick={() => setConfirmDeleteUserId(emp.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-md cursor-pointer"
                                  title="Eliminar cuenta"
                                >
                                  <Trash2 className="w-3.5 h-3.5" />
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 2: ASISTENCIA Y PUNTUALIDAD                                     */}
      {/* =================================================================== */}
      {activeTab === 'ASISTENCIA' && (
        <div className="space-y-4">
          {/* Controls Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-2">
              {(['TODAY', 'WEEK', 'MONTH', 'ALL'] as EvaluationDatePreset[]).map((p) => (
                <button
                  key={p}
                  type="button"
                  onClick={() => setAttendanceRange(p)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    attendanceRange === p
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {p === 'TODAY'
                    ? 'Hoy'
                    : p === 'WEEK'
                    ? 'Últimos 7 días'
                    : p === 'MONTH'
                    ? 'Este mes'
                    : 'Todo'}
                </button>
              ))}

              <select
                value={attendanceUserFilter}
                onChange={(e) => setAttendanceUserFilter(e.target.value)}
                className="px-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg text-slate-700 font-medium"
              >
                <option value="ALL">Todos los trabajadores</option>
                {employeeAccounts.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.name}
                  </option>
                ))}
              </select>
            </div>

            <button
              type="button"
              disabled={employeeAccounts.length === 0}
              onClick={() => openAttendanceModal()}
              className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
            >
              <Clock className="w-3.5 h-3.5 text-amber-400" />
              <span>Registrar Asistencia / Permiso</span>
            </button>
          </div>

          {/* Quick Today Check-in Strip for Active Employees */}
          {activeEmployees.length > 0 && attendanceRange === 'TODAY' && (
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs font-bold text-slate-900">
                  Control rápido de jornada — Hoy ({todayISO})
                </p>
                <p className="text-[11px] text-slate-500">
                  La llegada se registra automáticamente cuando el trabajador inicia sesión, o puedes marcarla aquí.
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                {activeEmployees.map((emp) => {
                  const rec = staffAttendance.find((r) => r.userId === emp.id && r.date === todayISO);
                  return (
                    <div
                      key={emp.id}
                      className="border border-slate-200 rounded-lg p-3 flex items-center justify-between gap-2 bg-slate-50/50"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-900 truncate">{emp.name}</p>
                        <p className="text-[11px] text-slate-500 tabular-nums">
                          {rec
                            ? rec.punctualityStatus === 'PUNTUAL'
                              ? `Llegó ${formatTime12h(rec.checkInTime)} · Puntual`
                              : rec.punctualityStatus === 'TARDE'
                              ? `Llegó ${formatTime12h(rec.checkInTime)} · +${rec.minutesLate} min`
                              : rec.punctualityStatus
                            : `Entrada ${formatTime12h(emp.scheduledStartTime || '08:00')} · Sin marcar`}
                        </p>
                      </div>
                      {!rec ? (
                        <button
                          type="button"
                          onClick={() => {
                            recordStaffCheckIn(emp, 'ADMIN');
                            showToast(`Llegada marcada para ${emp.name}.`);
                          }}
                          className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-md flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <LogIn className="w-3 h-3" />
                          <span>Llegada</span>
                        </button>
                      ) : !rec.checkOutTime &&
                        (rec.punctualityStatus === 'PUNTUAL' || rec.punctualityStatus === 'TARDE') ? (
                        <button
                          type="button"
                          onClick={() => {
                            recordStaffCheckOut(rec.id);
                            showToast(`Salida marcada para ${emp.name}.`);
                          }}
                          className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold rounded-md flex items-center gap-1 shrink-0 cursor-pointer"
                        >
                          <LogOut className="w-3 h-3" />
                          <span>Salida</span>
                        </button>
                      ) : (
                        <span className="text-[11px] font-semibold text-slate-500 shrink-0 tabular-nums">
                          {rec.checkOutTime ? `Sal. ${formatTime12h(rec.checkOutTime)}` : rec.punctualityStatus}
                        </span>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Attendance Log Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {filteredAttendance.length === 0 ? (
              <div className="p-8 text-center">
                <Clock className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">
                  No hay registros de asistencia en este período
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Trabajador</th>
                      <th className="py-3 px-4">Fecha</th>
                      <th className="py-3 px-4">Horario</th>
                      <th className="py-3 px-4">Llegada</th>
                      <th className="py-3 px-4">Salida</th>
                      <th className="py-3 px-4">Puntualidad</th>
                      <th className="py-3 px-4">Horas</th>
                      <th className="py-3 px-4 text-right">Acciones</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredAttendance.map((rec) => (
                      <tr key={rec.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900">{rec.userName}</p>
                          <p className="text-[11px] text-slate-500">
                            {rec.userPosition || 'Trabajador'} ·{' '}
                            {rec.checkInSource === 'AUTO_LOGIN'
                              ? 'Login automático'
                              : rec.checkInSource === 'MANUAL_STAFF'
                              ? 'Marcado por trabajador'
                              : 'Registrado por Admin'}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700">{rec.date}</td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-500">
                          {formatTime12h(rec.scheduledStartTime)}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900">
                          {formatTime12h(rec.checkInTime)}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                          {formatTime12h(rec.checkOutTime)}
                        </td>
                        <td className="py-3 px-4">
                          <span
                            className={`font-bold ${
                              rec.punctualityStatus === 'PUNTUAL'
                                ? 'text-emerald-700'
                                : rec.punctualityStatus === 'TARDE'
                                ? 'text-amber-700'
                                : rec.punctualityStatus === 'PERMISO'
                                ? 'text-blue-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {rec.punctualityStatus === 'PUNTUAL'
                              ? 'Puntual'
                              : rec.punctualityStatus === 'TARDE'
                              ? `Tarde (+${rec.minutesLate} min)`
                              : rec.punctualityStatus === 'PERMISO'
                              ? 'Permiso'
                              : 'Ausente'}
                          </span>
                          {rec.notes && (
                            <p className="text-[11px] text-slate-500 truncate max-w-[180px]">
                              {rec.notes}
                            </p>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums text-slate-700">
                          {formatDurationMinutes(rec.workedMinutes)}
                        </td>
                        <td className="py-3 px-4 text-right">
                          <div className="flex items-center justify-end gap-1">
                            <button
                              type="button"
                              onClick={() => openAttendanceModal(rec)}
                              className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                              title="Editar registro"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            {confirmDeleteAttId === rec.id ? (
                              <button
                                type="button"
                                onClick={() => {
                                  deleteStaffAttendance(rec.id);
                                  setConfirmDeleteAttId(null);
                                  showToast('Registro de asistencia eliminado.');
                                }}
                                className="px-2 py-1 bg-rose-600 text-white text-[11px] font-bold rounded cursor-pointer"
                              >
                                Eliminar
                              </button>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteAttId(rec.id)}
                                className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            )}
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 3: REPORTES Y EVALUACIÓN DE DESEMPEÑO                           */}
      {/* =================================================================== */}
      {activeTab === 'REPORTES' && (
        <div className="space-y-4">
          {/* Period & Export Bar */}
          <div className="flex flex-wrap items-center justify-between gap-3 no-print">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'TODAY', label: 'Hoy' },
                  { id: 'WEEK', label: '7 días' },
                  { id: 'MONTH', label: 'Este mes' },
                  { id: 'LAST_30', label: '30 días' },
                  { id: 'ALL', label: 'Todo' },
                ] as Array<{ id: EvaluationDatePreset; label: string }>
              ).map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => setReportPreset(opt.id)}
                  className={`px-3 py-1.5 text-xs font-semibold rounded-lg border transition-colors whitespace-nowrap cursor-pointer ${
                    reportPreset === opt.id
                      ? 'bg-slate-900 text-white border-slate-900'
                      : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                  }`}
                >
                  {opt.label}
                </button>
              ))}

              <label className="ml-2 flex items-center gap-1.5 text-xs text-slate-600 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={includeAdminInReport}
                  onChange={(e) => setIncludeAdminInReport(e.target.checked)}
                  className="rounded border-slate-300"
                />
                <span>Incluir Administrador</span>
              </label>
            </div>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => exportEmployeeReportsCsv(performanceReports, reportRange.label)}
                disabled={performanceReports.length === 0}
                className="px-3 py-1.5 bg-white hover:bg-slate-50 disabled:opacity-40 text-slate-700 border border-slate-300 text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Download className="w-3.5 h-3.5" />
                <span>Exportar CSV</span>
              </button>
              <button
                type="button"
                onClick={() => window.print()}
                className="px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-lg flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
              >
                <Printer className="w-3.5 h-3.5" />
                <span>Imprimir</span>
              </button>
            </div>
          </div>

          {/* Executive Summary KPIs */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Ventas del Equipo
              </p>
              <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                {formatUSD(executiveSummary.teamSalesUSD)}
              </p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums mt-0.5">
                {executiveSummary.teamSalesCount} ventas · {formatBs(executiveSummary.teamSalesUSD * settings.bcvRate)}
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Puntualidad Promedio
              </p>
              <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                {executiveSummary.avgPunctualityPct !== null
                  ? `${executiveSummary.avgPunctualityPct}%`
                  : 'Sin datos'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                {executiveSummary.totalAttDays} jornadas registradas
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Cumplimiento de Tareas
              </p>
              <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-1">
                {executiveSummary.avgTaskPct !== null
                  ? `${executiveSummary.avgTaskPct}%`
                  : 'Sin tareas'}
              </p>
              <p className="text-[11px] text-slate-500 mt-0.5 tabular-nums">
                {executiveSummary.totalTasksDone} de {executiveSummary.totalTasksAssigned} realizadas
              </p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl p-4">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Período Evaluado
              </p>
              <p className="text-sm font-bold text-slate-900 mt-1.5 leading-snug">
                {reportRange.label}
              </p>
              <p className="text-[11px] text-slate-500 mt-1">
                {evaluatedUsers.length}{' '}
                {evaluatedUsers.length === 1 ? 'integrante evaluado' : 'integrantes evaluados'}
              </p>
            </div>
          </div>

          {/* Performance Comparison Table */}
          <div className="bg-white border border-slate-200 rounded-xl overflow-hidden">
            {performanceReports.length === 0 ? (
              <div className="p-8 text-center">
                <BarChart3 className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                <p className="text-xs font-semibold text-slate-600">
                  Crea usuarios de trabajadores para visualizar sus reportes de rendimiento.
                </p>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                      <th className="py-3 px-4">Trabajador</th>
                      <th className="py-3 px-4">Ventas</th>
                      <th className="py-3 px-4">Meta Mensual</th>
                      <th className="py-3 px-4">Puntualidad</th>
                      <th className="py-3 px-4">Horas / Llegada</th>
                      <th className="py-3 px-4">Tareas</th>
                      <th className="py-3 px-4">Taller</th>
                      <th className="py-3 px-4 text-right no-print">Ficha</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {performanceReports.map((rep) => (
                      <tr key={rep.user.id} className="hover:bg-slate-50/70">
                        <td className="py-3 px-4">
                          <p className="font-bold text-slate-900">{rep.user.name}</p>
                          <p className="text-[11px] text-slate-500">
                            {rep.user.position || (rep.user.role === 'ADMIN' ? 'Administrador' : 'Empleado')}
                            {rep.user.active === false ? ' · Inactivo' : ''}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums">
                          <p className="font-bold text-slate-900">{formatUSD(rep.salesTotalUSD)}</p>
                          <p className="text-[11px] text-slate-500">
                            {rep.salesCount} {rep.salesCount === 1 ? 'venta' : 'ventas'} · Prom.{' '}
                            {formatUSD(rep.avgTicketUSD)}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums">
                          {rep.monthlyGoalUSD > 0 && rep.goalProgressPct !== null ? (
                            <div className="w-28">
                              <div className="flex justify-between text-[11px] mb-1">
                                <span
                                  className={`font-bold ${
                                    rep.goalProgressPct >= 100
                                      ? 'text-emerald-700'
                                      : rep.goalProgressPct >= 60
                                      ? 'text-slate-900'
                                      : 'text-amber-700'
                                  }`}
                                >
                                  {rep.goalProgressPct}%
                                </span>
                                <span className="text-slate-400">
                                  {formatUSD(rep.monthlyGoalUSD)}
                                </span>
                              </div>
                              <div className="h-1.5 bg-slate-100 rounded-full overflow-hidden">
                                <div
                                  className={`h-full rounded-full ${
                                    rep.goalProgressPct >= 100 ? 'bg-emerald-600' : 'bg-slate-900'
                                  }`}
                                  style={{ width: `${Math.min(100, rep.goalProgressPct)}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className="text-[11px] text-slate-400">Sin meta</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums">
                          {rep.punctualityPct !== null ? (
                            <>
                              <p
                                className={`font-bold ${
                                  rep.punctualityPct >= 90
                                    ? 'text-emerald-700'
                                    : rep.punctualityPct >= 75
                                    ? 'text-amber-700'
                                    : 'text-rose-700'
                                }`}
                              >
                                {rep.punctualityPct}% puntual
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {rep.punctualDays} punt. · {rep.lateDays} tarde
                                {rep.avgMinutesLate > 0 ? ` (prom +${rep.avgMinutesLate}m)` : ''}
                              </p>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400">Sin registros</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums">
                          <p className="font-semibold text-slate-800">
                            {formatDurationMinutes(rep.totalWorkedMinutes)}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Prom. llegada: {rep.avgArrivalTimeLabel}
                          </p>
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums">
                          {rep.tasksAssigned > 0 ? (
                            <>
                              <p className="font-bold text-slate-900">
                                {rep.tasksCompleted}/{rep.tasksAssigned} ({rep.taskCompletionPct}%)
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {rep.tasksOverdue > 0 ? (
                                  <span className="text-rose-600 font-semibold">
                                    {rep.tasksOverdue} vencidas
                                  </span>
                                ) : (
                                  `${rep.tasksPending} pendientes`
                                )}
                              </p>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400">Sin tareas</span>
                          )}
                        </td>
                        <td className="py-3 px-4 font-mono tabular-nums">
                          {rep.workshopOrdersCount > 0 ? (
                            <>
                              <p className="font-semibold text-slate-900">
                                {rep.workshopOrdersCompleted}/{rep.workshopOrdersCount} órd.
                              </p>
                              <p className="text-[11px] text-slate-500">
                                {formatUSD(rep.workshopRevenueUSD)}
                              </p>
                            </>
                          ) : (
                            <span className="text-[11px] text-slate-400">—</span>
                          )}
                        </td>
                        <td className="py-3 px-4 text-right no-print">
                          <button
                            type="button"
                            onClick={() => openEmployeeScorecard(rep)}
                            className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-900 text-xs font-bold rounded-lg inline-flex items-center gap-1 whitespace-nowrap cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Ver Ficha</span>
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* TAB 4: NOTIFICACIONES AL EQUIPO                                     */}
      {/* =================================================================== */}
      {activeTab === 'NOTIFICACIONES' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
          {/* Compose Form */}
          <form
            onSubmit={handleSendNotification}
            className="lg:col-span-5 bg-white border border-slate-200 rounded-xl p-5 space-y-4 h-fit"
          >
            <div>
              <h2 className="text-sm font-bold text-slate-900">Enviar notificación interna</h2>
              <p className="text-xs text-slate-500 mt-0.5">
                Llegará al instante a la campana y pantalla del trabajador cuando esté conectado.
              </p>
            </div>

            <div className="space-y-3">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Destinatario
                </label>
                <select
                  value={notifRecipient}
                  onChange={(e) => setNotifRecipient(e.target.value)}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                >
                  <option value="ALL_STAFF">
                    Todos los trabajadores activos ({activeEmployees.length})
                  </option>
                  {activeEmployees.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.position || 'Trabajador'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prioridad
                  </label>
                  <select
                    value={notifPriority}
                    onChange={(e) => setNotifPriority(e.target.value as StaffNotificationPriority)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="INFO">Aviso normal</option>
                    <option value="IMPORTANTE">Importante</option>
                    <option value="URGENTE">Urgente</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Enlazar módulo (opcional)
                  </label>
                  <select
                    value={notifView}
                    onChange={(e) => setNotifView(e.target.value as '' | AdminModuleId)}
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="">Ninguno</option>
                    {ASSIGNABLE_MODULES.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Título / Asunto
                </label>
                <input
                  type="text"
                  required
                  value={notifTitle}
                  onChange={(e) => setNotifTitle(e.target.value)}
                  placeholder="Ej. Revisar pedido MRW antes de las 3:00 PM"
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Mensaje
                </label>
                <textarea
                  required
                  rows={3}
                  value={notifMessage}
                  onChange={(e) => setNotifMessage(e.target.value)}
                  placeholder="Escribe las instrucciones o el comunicado..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg resize-none"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={activeEmployees.length === 0}
              className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white text-xs font-bold rounded-lg flex items-center justify-center gap-1.5 cursor-pointer"
            >
              <Send className="w-3.5 h-3.5 text-amber-400" />
              <span>Enviar Notificación</span>
            </button>
          </form>

          {/* Sent Notifications History */}
          <div className="lg:col-span-7 bg-white border border-slate-200 rounded-xl overflow-hidden">
            <div className="px-4 py-3 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <p className="text-xs font-bold text-slate-800">
                Historial de notificaciones enviadas ({staffNotifications.length})
              </p>
              <p className="text-[11px] text-slate-500">Confirmación de lectura en tiempo real</p>
            </div>

            {staffNotifications.length === 0 ? (
              <div className="p-8 text-center">
                <Bell className="w-7 h-7 text-slate-300 mx-auto mb-2" />
                <p className="text-xs text-slate-500">Aún no se han enviado notificaciones.</p>
              </div>
            ) : (
              <div className="divide-y divide-slate-100 max-h-[520px] overflow-y-auto">
                {staffNotifications.map((n) => (
                  <div key={n.id} className="p-4 flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] mb-0.5">
                        <span className="font-bold text-slate-900">Para: {n.recipientUserName}</span>
                        <span className="text-slate-300">·</span>
                        <span
                          className={`font-bold uppercase ${
                            n.priority === 'URGENTE'
                              ? 'text-rose-700'
                              : n.priority === 'IMPORTANTE'
                              ? 'text-amber-700'
                              : 'text-slate-500'
                          }`}
                        >
                          {n.priority}
                        </span>
                        <span className="text-slate-300">·</span>
                        <span
                          className={`font-semibold ${
                            n.readAt ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {n.readAt ? 'Leída' : 'Pendiente de lectura'}
                        </span>
                      </div>
                      <p className="text-xs font-bold text-slate-900">{n.title}</p>
                      <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                      <p className="text-[11px] text-slate-400 mt-1 tabular-nums">
                        Enviada: {new Date(n.createdAt).toLocaleString('es-VE')}
                        {n.readAt ? ` · Leída: ${new Date(n.readAt).toLocaleString('es-VE')}` : ''}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => deleteStaffNotification(n.id)}
                      className="p-1.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer shrink-0"
                      title="Eliminar notificación"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: CREAR / EDITAR TRABAJADOR Y PERMISOS                         */}
      {/* =================================================================== */}
      {isUserModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[90vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-sm font-bold text-slate-900">
                  {editingUserId ? 'Editar Trabajador y Permisos' : 'Crear Cuenta de Trabajador'}
                </h2>
                <p className="text-[11px] text-slate-500">
                  Define sus credenciales, horario laboral, meta mensual y áreas autorizadas.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsUserModalOpen(false)}
                className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveUser} className="overflow-y-auto p-5 space-y-5">
              {userFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-lg text-xs text-rose-700 font-semibold flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{userFormError}</span>
                </div>
              )}

              {/* Basic Info */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nombre completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={userForm.name}
                    onChange={(e) => setUserForm({ ...userForm, name: e.target.value })}
                    placeholder="Ej. Carlos Mendoza"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cargo / Puesto *
                  </label>
                  <input
                    type="text"
                    required
                    value={userForm.position}
                    onChange={(e) => setUserForm({ ...userForm, position: e.target.value })}
                    placeholder="Vendedor, Cajero, Mecánico, Tapicero..."
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Usuario de acceso *
                  </label>
                  <input
                    type="text"
                    required
                    value={userForm.username}
                    onChange={(e) => setUserForm({ ...userForm, username: e.target.value })}
                    placeholder="ej. carlos.ventas"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    {editingUserId ? 'Nueva contraseña (dejar vacío para mantener)' : 'Contraseña inicial *'}
                  </label>
                  <div className="relative">
                    <KeyRound className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="password"
                      required={!editingUserId}
                      value={userForm.password}
                      onChange={(e) => setUserForm({ ...userForm, password: e.target.value })}
                      placeholder={editingUserId ? '••••••••' : 'Mínimo 4 caracteres'}
                      className="w-full pl-8 pr-3 py-2 text-xs border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cédula
                  </label>
                  <input
                    type="text"
                    value={userForm.documentId}
                    onChange={(e) => setUserForm({ ...userForm, documentId: e.target.value })}
                    placeholder="V-25000000"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    WhatsApp / Teléfono
                  </label>
                  <input
                    type="text"
                    value={userForm.phone}
                    onChange={(e) => setUserForm({ ...userForm, phone: e.target.value })}
                    placeholder="04141234567"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Correo (opcional)
                  </label>
                  <input
                    type="email"
                    value={userForm.email}
                    onChange={(e) => setUserForm({ ...userForm, email: e.target.value })}
                    placeholder="trabajador@correo.com"
                    className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Meta mensual de ventas USD (opcional)
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="0.01"
                    value={userForm.monthlySalesGoalUSD}
                    onChange={(e) => setUserForm({ ...userForm, monthlySalesGoalUSD: e.target.value })}
                    placeholder="Ej. 1500"
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
              </div>

              {/* Shift Schedule & Linked Technician */}
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-lg space-y-3">
                <p className="text-xs font-bold text-slate-800">Horario laboral y vinculación de taller</p>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Hora entrada
                    </label>
                    <input
                      type="time"
                      value={userForm.scheduledStartTime}
                      onChange={(e) => setUserForm({ ...userForm, scheduledStartTime: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Hora salida
                    </label>
                    <input
                      type="time"
                      value={userForm.scheduledEndTime}
                      onChange={(e) => setUserForm({ ...userForm, scheduledEndTime: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Tolerancia (min)
                    </label>
                    <input
                      type="number"
                      min="0"
                      max="60"
                      value={userForm.lateToleranceMinutes}
                      onChange={(e) =>
                        setUserForm({
                          ...userForm,
                          lateToleranceMinutes: Math.max(0, Number(e.target.value) || 0),
                        })
                      }
                      className="w-full px-2.5 py-1.5 text-xs font-mono bg-white border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                      Técnico taller
                    </label>
                    <select
                      value={userForm.linkedTechnicianId}
                      onChange={(e) => setUserForm({ ...userForm, linkedTechnicianId: e.target.value })}
                      className="w-full px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg"
                    >
                      <option value="">Ninguno</option>
                      {technicians.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Role Presets & Module Permissions */}
              <div className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800">
                    Áreas del sistema permitidas ({userForm.allowedModules.length})
                  </p>
                  <div className="flex flex-wrap items-center gap-1.5">
                    {STAFF_ROLE_PRESETS.map((preset) => (
                      <button
                        key={preset.id}
                        type="button"
                        onClick={() => applyRolePreset(preset.id)}
                        className="px-2 py-1 text-[11px] font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer"
                      >
                        {preset.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  {ASSIGNABLE_MODULES.map((mod) => {
                    const checked = userForm.allowedModules.includes(mod.id);
                    return (
                      <label
                        key={mod.id}
                        className={`flex items-start gap-2.5 p-2.5 rounded-lg border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-slate-900/5 border-slate-400'
                            : 'bg-white border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        <input
                          type="checkbox"
                          checked={checked}
                          onChange={() => toggleModulePermission(mod.id)}
                          className="mt-0.5 rounded border-slate-300"
                        />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-900 leading-tight">{mod.label}</p>
                          <p className="text-[11px] text-slate-500 leading-tight mt-0.5">
                            {mod.description}
                          </p>
                        </div>
                      </label>
                    );
                  })}
                </div>
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsUserModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isSavingUser}
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 disabled:opacity-50 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  {isSavingUser
                    ? 'Guardando...'
                    : editingUserId
                    ? 'Guardar Cambios'
                    : 'Crear Trabajador'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: REGISTRAR / EDITAR ASISTENCIA                                */}
      {/* =================================================================== */}
      {isAttendanceModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-md overflow-hidden">
            <div className="px-5 py-3.5 border-b border-slate-200 bg-slate-50 flex items-center justify-between">
              <h3 className="text-sm font-bold text-slate-900">Registro de Asistencia</h3>
              <button
                type="button"
                onClick={() => setIsAttendanceModalOpen(false)}
                className="text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <form onSubmit={handleSaveAttendance} className="p-5 space-y-3.5">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">Trabajador</label>
                <select
                  required
                  value={attForm.userId}
                  onChange={(e) => setAttForm({ ...attForm, userId: e.target.value })}
                  className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                >
                  {employeeAccounts.map((u) => (
                    <option key={u.id} value={u.id}>
                      {u.name} ({u.position || 'Trabajador'})
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Fecha</label>
                  <input
                    type="date"
                    required
                    value={attForm.date}
                    onChange={(e) => setAttForm({ ...attForm, date: e.target.value })}
                    className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">Tipo</label>
                  <select
                    value={attForm.punctualityStatus}
                    onChange={(e) =>
                      setAttForm({
                        ...attForm,
                        punctualityStatus: e.target.value as '' | AttendancePunctualityStatus,
                      })
                    }
                    className="w-full px-3 py-2 text-xs bg-white border border-slate-200 rounded-lg"
                  >
                    <option value="">Calcular por hora de llegada</option>
                    <option value="PERMISO">Permiso justificado</option>
                    <option value="AUSENTE">Ausencia / Inasistencia</option>
                  </select>
                </div>
              </div>

              {attForm.punctualityStatus !== 'AUSENTE' && attForm.punctualityStatus !== 'PERMISO' && (
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hora llegada
                    </label>
                    <input
                      type="time"
                      value={attForm.checkInTime}
                      onChange={(e) => setAttForm({ ...attForm, checkInTime: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                    />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Hora salida (opcional)
                    </label>
                    <input
                      type="time"
                      value={attForm.checkOutTime}
                      onChange={(e) => setAttForm({ ...attForm, checkOutTime: e.target.value })}
                      className="w-full px-3 py-2 text-xs font-mono border border-slate-200 rounded-lg"
                    />
                  </div>
                </div>
              )}

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Observaciones (opcional)
                </label>
                <input
                  type="text"
                  value={attForm.notes}
                  onChange={(e) => setAttForm({ ...attForm, notes: e.target.value })}
                  placeholder="Ej. Permiso médico, corte de luz, horas extras..."
                  className="w-full px-3 py-2 text-xs border border-slate-200 rounded-lg"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAttendanceModalOpen(false)}
                  className="px-3.5 py-2 text-xs font-semibold text-slate-600 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer"
                >
                  Guardar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL: FICHA INDIVIDUAL DE EVALUACIÓN                               */}
      {/* =================================================================== */}
      {selectedReport && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 shadow-2xl w-full max-w-3xl max-h-[90vh] flex flex-col overflow-hidden">
            {/* Header */}
            <div className="px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-bold">{selectedReport.user.name}</p>
                <p className="text-[11px] text-slate-300">
                  {selectedReport.user.position || 'Trabajador'} · {reportRange.label}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setSelectedReportUserId(null)}
                className="p-1 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Individual Real KPI Strip */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-4 bg-slate-50 border-b border-slate-200">
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Ventas</p>
                <p className="text-base font-bold text-slate-900 font-mono tabular-nums">
                  {formatUSD(selectedReport.salesTotalUSD)}
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {selectedReport.salesCount} facturas ({selectedReport.salesSharePct}% del total)
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Puntualidad</p>
                <p className="text-base font-bold text-slate-900 font-mono tabular-nums">
                  {selectedReport.punctualityPct !== null ? `${selectedReport.punctualityPct}%` : '—'}
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {selectedReport.punctualDays} punt. · {selectedReport.lateDays} tarde · {selectedReport.absentDays} aus.
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Tareas</p>
                <p className="text-base font-bold text-slate-900 font-mono tabular-nums">
                  {selectedReport.tasksCompleted}/{selectedReport.tasksAssigned}
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  {selectedReport.taskCompletionPct !== null
                    ? `${selectedReport.taskCompletionPct}% completadas`
                    : 'Sin tareas'}
                </p>
              </div>
              <div className="bg-white border border-slate-200 rounded-lg p-3">
                <p className="text-[10px] font-semibold text-slate-500 uppercase">Jornada</p>
                <p className="text-base font-bold text-slate-900 font-mono tabular-nums">
                  {formatDurationMinutes(selectedReport.totalWorkedMinutes)}
                </p>
                <p className="text-[11px] text-slate-500 tabular-nums">
                  Llegada prom. {selectedReport.avgArrivalTimeLabel}
                </p>
              </div>
            </div>

            {/* Sub-tabs */}
            <div className="px-4 border-b border-slate-200 flex items-center gap-1 overflow-x-auto">
              {[
                { id: 'ACTIVIDAD' as const, label: 'Actividad Reciente', icon: Calendar },
                { id: 'VENTAS' as const, label: `Ventas (${selectedReport.salesCount})`, icon: ShoppingBag },
                { id: 'ASISTENCIA' as const, label: `Asistencia (${selectedReport.matchedAttendance.length})`, icon: Clock },
                { id: 'TAREAS' as const, label: `Tareas (${selectedReport.tasksAssigned})`, icon: ListTodo },
                { id: 'NOTAS' as const, label: 'Notas RRHH', icon: FileText },
              ].map((st) => {
                const Icon = st.icon;
                const active = detailSubTab === st.id;
                return (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setDetailSubTab(st.id)}
                    className={`px-3 py-2.5 text-xs font-bold border-b-2 flex items-center gap-1.5 whitespace-nowrap cursor-pointer ${
                      active ? 'border-slate-900 text-slate-900' : 'border-transparent text-slate-500'
                    }`}
                  >
                    <Icon className="w-3.5 h-3.5" />
                    <span>{st.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Body */}
            <div className="p-4 overflow-y-auto flex-1">
              {detailSubTab === 'ACTIVIDAD' && (
                selectedReport.recentActivity.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    Sin actividad registrada en este período.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100">
                    {selectedReport.recentActivity.map((item) => (
                      <div key={item.id} className="py-2.5 flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-[11px] text-slate-500">
                            <span className="font-bold text-slate-700">{item.type}</span>
                            <span>·</span>
                            <span className="tabular-nums">
                              {new Date(item.timestamp).toLocaleString('es-VE')}
                            </span>
                          </div>
                          <p className="text-xs font-bold text-slate-900 mt-0.5">{item.title}</p>
                          <p className="text-xs text-slate-600">{item.detail}</p>
                        </div>
                        {item.amountUSD !== undefined && (
                          <span className="text-xs font-bold font-mono tabular-nums text-emerald-700 shrink-0">
                            {formatUSD(item.amountUSD)}
                          </span>
                        )}
                      </div>
                    ))}
                  </div>
                )
              )}

              {detailSubTab === 'VENTAS' && (
                selectedReport.matchedSales.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    No hay ventas registradas por este trabajador en este período.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {selectedReport.matchedSales.map((s) => (
                      <div key={s.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900 font-mono">
                            {s.invoiceNumber} · <span className="font-sans">{s.customerName}</span>
                          </p>
                          <p className="text-[11px] text-slate-500">
                            {new Date(s.createdAt).toLocaleString('es-VE')} · {s.paymentType || 'CONTADO'} · {s.paymentMethod}
                          </p>
                        </div>
                        <div className="text-right font-mono tabular-nums shrink-0">
                          <p className="font-bold text-slate-900">{formatUSD(s.total)}</p>
                          <p className="text-[11px] text-slate-500">{formatBs(s.totalBs || s.total * settings.bcvRate)}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {detailSubTab === 'ASISTENCIA' && (
                selectedReport.matchedAttendance.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    No hay asistencias registradas en este período.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {selectedReport.matchedAttendance.map((a) => (
                      <div key={a.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900 font-mono tabular-nums">
                            {a.date} · Llegada {formatTime12h(a.checkInTime)}
                            {a.checkOutTime ? ` · Salida ${formatTime12h(a.checkOutTime)}` : ''}
                          </p>
                          <p className="text-[11px] text-slate-500">
                            Horario esperado {formatTime12h(a.scheduledStartTime)}
                            {a.notes ? ` · ${a.notes}` : ''}
                          </p>
                        </div>
                        <div className="text-right shrink-0">
                          <span
                            className={`font-bold ${
                              a.punctualityStatus === 'PUNTUAL'
                                ? 'text-emerald-700'
                                : a.punctualityStatus === 'TARDE'
                                ? 'text-amber-700'
                                : 'text-rose-700'
                            }`}
                          >
                            {a.punctualityStatus === 'TARDE'
                              ? `Tarde (+${a.minutesLate}m)`
                              : a.punctualityStatus}
                          </span>
                          <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                            {formatDurationMinutes(a.workedMinutes)}
                          </p>
                        </div>
                      </div>
                    ))}
                  </div>
                )
              )}

              {detailSubTab === 'TAREAS' && (
                selectedReport.matchedTasks.length === 0 ? (
                  <p className="text-xs text-slate-500 text-center py-6">
                    Sin tareas asignadas en este período.
                  </p>
                ) : (
                  <div className="divide-y divide-slate-100 text-xs">
                    {selectedReport.matchedTasks.map((t) => (
                      <div key={t.id} className="py-2.5 flex items-center justify-between gap-2">
                        <div>
                          <p className="font-bold text-slate-900">{t.title}</p>
                          <p className="text-[11px] text-slate-500">
                            Programada: {t.dueDate} {formatTime12h(t.dueTime)}
                          </p>
                        </div>
                        <span
                          className={`font-bold shrink-0 ${
                            t.status === 'REALIZADA' ? 'text-emerald-700' : 'text-amber-700'
                          }`}
                        >
                          {t.status === 'REALIZADA' ? 'Realizada' : 'Pendiente'}
                        </span>
                      </div>
                    ))}
                  </div>
                )
              )}

              {detailSubTab === 'NOTAS' && (
                <div className="space-y-3">
                  <p className="text-xs text-slate-600">
                    Registra observaciones de desempeño, acuerdos, fortalezas o aspectos por mejorar de este trabajador (solo visible para el administrador).
                  </p>
                  <textarea
                    rows={5}
                    value={evalNotesDraft}
                    onChange={(e) => setEvalNotesDraft(e.target.value)}
                    disabled={selectedReport.user.role === 'ADMIN'}
                    placeholder="Ej. Excelente atención al cliente y puntualidad constante. Meta de ventas superada..."
                    className="w-full p-3 text-xs border border-slate-200 rounded-lg resize-none"
                  />
                  {selectedReport.user.role !== 'ADMIN' && (
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleSaveEvaluationNotes}
                        className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer"
                      >
                        Guardar Observaciones
                      </button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
