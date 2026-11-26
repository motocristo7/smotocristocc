import {
  AppUser,
  Sale,
  StaffAttendanceRecord,
  AdminTask,
  ServiceOrder,
  AttendancePunctualityStatus,
} from '../types';
import { getLocalTodayISO, getLocalTimeHHMM } from './taskNotifications';

export function parseTimeToMinutes(hhmm?: string): number | null {
  if (!hhmm || typeof hhmm !== 'string') return null;
  const parts = hhmm.trim().split(':');
  if (parts.length < 2) return null;
  const h = Number(parts[0]);
  const m = Number(parts[1]);
  if (Number.isNaN(h) || Number.isNaN(m) || h < 0 || h > 23 || m < 0 || m > 59) {
    return null;
  }
  return h * 60 + m;
}

export function formatTime12h(hhmm?: string): string {
  const mins = parseTimeToMinutes(hhmm);
  if (mins === null) return '—';
  const h24 = Math.floor(mins / 60);
  const m = mins % 60;
  const period = h24 >= 12 ? 'PM' : 'AM';
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return `${h12}:${String(m).padStart(2, '0')} ${period}`;
}

export function computePunctuality(
  checkInTimeHHMM: string,
  scheduledStartTimeHHMM: string = '08:00',
  lateToleranceMinutes: number = 10
): { status: AttendancePunctualityStatus; minutesLate: number } {
  const arrival = parseTimeToMinutes(checkInTimeHHMM);
  const scheduled = parseTimeToMinutes(scheduledStartTimeHHMM);
  if (arrival === null || scheduled === null) {
    return { status: 'PUNTUAL', minutesLate: 0 };
  }
  const tolerance = Math.max(0, Number(lateToleranceMinutes) || 0);
  const rawDiff = arrival - scheduled;
  if (rawDiff <= tolerance) {
    return { status: 'PUNTUAL', minutesLate: 0 };
  }
  return { status: 'TARDE', minutesLate: rawDiff };
}

export function calculateWorkedMinutes(
  checkInTimeHHMM?: string,
  checkOutTimeHHMM?: string
): number | undefined {
  const start = parseTimeToMinutes(checkInTimeHHMM);
  const end = parseTimeToMinutes(checkOutTimeHHMM);
  if (start === null || end === null) return undefined;
  const diff = end - start;
  if (diff < 0) return undefined;
  return diff;
}

export function formatDurationMinutes(totalMinutes?: number): string {
  if (totalMinutes === undefined || totalMinutes === null || Number.isNaN(totalMinutes) || totalMinutes <= 0) {
    return '—';
  }
  const hrs = Math.floor(totalMinutes / 60);
  const mins = Math.round(totalMinutes % 60);
  if (hrs === 0) return `${mins} min`;
  if (mins === 0) return `${hrs} h`;
  return `${hrs} h ${mins} m`;
}

export type EvaluationDatePreset = 'TODAY' | 'WEEK' | 'MONTH' | 'LAST_30' | 'ALL';

export function getEvaluationDateRange(preset: EvaluationDatePreset): {
  startDate: string | null; // YYYY-MM-DD
  endDate: string | null; // YYYY-MM-DD
  label: string;
} {
  const now = new Date();
  const today = getLocalTodayISO(now);

  if (preset === 'TODAY') {
    return { startDate: today, endDate: today, label: `Hoy (${today})` };
  }
  if (preset === 'WEEK') {
    const start = new Date(now);
    start.setDate(now.getDate() - 6);
    const s = getLocalTodayISO(start);
    return { startDate: s, endDate: today, label: `Últimos 7 días (${s} al ${today})` };
  }
  if (preset === 'MONTH') {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const s = getLocalTodayISO(start);
    return { startDate: s, endDate: today, label: `Mes actual (${s} al ${today})` };
  }
  if (preset === 'LAST_30') {
    const start = new Date(now);
    start.setDate(now.getDate() - 29);
    const s = getLocalTodayISO(start);
    return { startDate: s, endDate: today, label: `Últimos 30 días (${s} al ${today})` };
  }
  return { startDate: null, endDate: null, label: 'Todo el historial' };
}

export function extractLocalDateFromISO(isoString?: string): string {
  if (!isoString) return '';
  const parsed = new Date(isoString);
  if (Number.isNaN(parsed.getTime())) {
    return isoString.slice(0, 10);
  }
  return getLocalTodayISO(parsed);
}

export function isDateInRange(
  dateYYYYMMDD: string,
  startDate: string | null,
  endDate: string | null
): boolean {
  if (!dateYYYYMMDD) return false;
  if (startDate && dateYYYYMMDD < startDate) return false;
  if (endDate && dateYYYYMMDD > endDate) return false;
  return true;
}

export interface EmployeeActivityItem {
  id: string;
  timestamp: string;
  type: 'VENTA' | 'ASISTENCIA' | 'TAREA' | 'TALLER';
  title: string;
  detail: string;
  amountUSD?: number;
}

export interface EmployeePerformanceReport {
  user: AppUser;
  // Sales
  salesCount: number;
  salesTotalUSD: number;
  salesTotalBs: number;
  avgTicketUSD: number;
  salesSharePct: number;
  monthlyGoalUSD: number;
  goalProgressPct: number | null;
  // Attendance & Punctuality
  attendanceDays: number;
  punctualDays: number;
  lateDays: number;
  absentDays: number;
  permissionDays: number;
  punctualityPct: number | null; // null if 0 attendance days recorded
  avgMinutesLate: number;
  totalMinutesLate: number;
  totalWorkedMinutes: number;
  avgArrivalTimeLabel: string;
  // Tasks
  tasksAssigned: number;
  tasksCompleted: number;
  tasksCompletedOnTime: number;
  tasksPending: number;
  tasksOverdue: number;
  taskCompletionPct: number | null; // null if 0 tasks assigned
  // Workshop (if linkedTechnicianId or name match)
  workshopOrdersCount: number;
  workshopOrdersCompleted: number;
  workshopRevenueUSD: number;
  // Recent detailed lists
  matchedSales: Sale[];
  matchedAttendance: StaffAttendanceRecord[];
  matchedTasks: AdminTask[];
  matchedWorkshopOrders: ServiceOrder[];
  recentActivity: EmployeeActivityItem[];
}

export function buildEmployeePerformanceReports(params: {
  staffUsers: AppUser[];
  sales: Sale[];
  staffAttendance: StaffAttendanceRecord[];
  adminTasks: AdminTask[];
  serviceOrders: ServiceOrder[];
  startDate: string | null;
  endDate: string | null;
  bcvRate: number;
}): EmployeePerformanceReport[] {
  const {
    staffUsers,
    sales,
    staffAttendance,
    adminTasks,
    serviceOrders,
    startDate,
    endDate,
    bcvRate,
  } = params;

  const validSalesInRange = sales.filter((s) => {
    if (s.isVoided) return false;
    const d = extractLocalDateFromISO(s.createdAt);
    return isDateInRange(d, startDate, endDate);
  });

  const totalRangeSalesUSD = validSalesInRange.reduce((acc, s) => acc + (Number(s.total) || 0), 0);
  const nowDate = getLocalTodayISO();
  const nowTime = getLocalTimeHHMM();

  return staffUsers.map((user) => {
    const userNameNorm = user.name.trim().toLowerCase();
    const userPhoneDigits = (user.phone || '').replace(/\D/g, '');

    // 1. Sales attributed to this user
    const matchedSales = validSalesInRange
      .filter((s) => {
        if (s.soldByUserId && s.soldByUserId === user.id) return true;
        if (!s.soldByUserId && s.soldByUserName && s.soldByUserName.trim().toLowerCase() === userNameNorm) {
          return true;
        }
        return false;
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const salesCount = matchedSales.length;
    const salesTotalUSD =
      Math.round(matchedSales.reduce((acc, s) => acc + (Number(s.total) || 0), 0) * 100) / 100;
    const salesTotalBs =
      Math.round(
        matchedSales.reduce(
          (acc, s) => acc + (Number(s.totalBs) || (Number(s.total) || 0) * bcvRate),
          0
        ) * 100
      ) / 100;
    const avgTicketUSD = salesCount > 0 ? Math.round((salesTotalUSD / salesCount) * 100) / 100 : 0;
    const salesSharePct =
      totalRangeSalesUSD > 0 ? Math.round((salesTotalUSD / totalRangeSalesUSD) * 1000) / 10 : 0;
    const monthlyGoalUSD = Math.max(0, Number(user.monthlySalesGoalUSD) || 0);
    const goalProgressPct =
      monthlyGoalUSD > 0 ? Math.round((salesTotalUSD / monthlyGoalUSD) * 1000) / 10 : null;

    // 2. Attendance in range
    const matchedAttendance = staffAttendance
      .filter((rec) => rec.userId === user.id && isDateInRange(rec.date, startDate, endDate))
      .sort((a, b) => b.date.localeCompare(a.date));

    const punctualDays = matchedAttendance.filter((r) => r.punctualityStatus === 'PUNTUAL').length;
    const lateDays = matchedAttendance.filter((r) => r.punctualityStatus === 'TARDE').length;
    const absentDays = matchedAttendance.filter((r) => r.punctualityStatus === 'AUSENTE').length;
    const permissionDays = matchedAttendance.filter((r) => r.punctualityStatus === 'PERMISO').length;
    const attendanceDays = punctualDays + lateDays;
    const punctualityPct =
      attendanceDays > 0 ? Math.round((punctualDays / attendanceDays) * 1000) / 10 : null;
    const totalMinutesLate = matchedAttendance.reduce(
      (acc, r) => acc + (r.punctualityStatus === 'TARDE' ? Number(r.minutesLate) || 0 : 0),
      0
    );
    const avgMinutesLate = lateDays > 0 ? Math.round(totalMinutesLate / lateDays) : 0;
    const totalWorkedMinutes = matchedAttendance.reduce(
      (acc, r) => acc + (Number(r.workedMinutes) || 0),
      0
    );

    const arrivalMinutesList = matchedAttendance
      .map((r) => parseTimeToMinutes(r.checkInTime))
      .filter((v): v is number => v !== null);
    let avgArrivalTimeLabel = '—';
    if (arrivalMinutesList.length > 0) {
      const avgMins = Math.round(
        arrivalMinutesList.reduce((acc, m) => acc + m, 0) / arrivalMinutesList.length
      );
      const hh = String(Math.floor(avgMins / 60)).padStart(2, '0');
      const mm = String(avgMins % 60).padStart(2, '0');
      avgArrivalTimeLabel = formatTime12h(`${hh}:${mm}`);
    }

    // 3. Tasks assigned to this user
    const matchedTasks = adminTasks
      .filter((task) => {
        if (!isDateInRange(task.dueDate, startDate, endDate)) return false;
        if (task.assignedUserId && task.assignedUserId === user.id) return true;
        if (user.linkedTechnicianId && task.assignedWorkerId === user.linkedTechnicianId) return true;
        if (task.assignedWorkerName && task.assignedWorkerName.trim().toLowerCase() === userNameNorm) {
          return true;
        }
        if (
          userPhoneDigits.length >= 7 &&
          task.assignedWorkerPhone &&
          task.assignedWorkerPhone.replace(/\D/g, '') === userPhoneDigits
        ) {
          return true;
        }
        return false;
      })
      .sort((a, b) => `${b.dueDate}T${b.dueTime}`.localeCompare(`${a.dueDate}T${a.dueTime}`));

    const tasksAssigned = matchedTasks.length;
    const tasksCompleted = matchedTasks.filter((t) => t.status === 'REALIZADA').length;
    const tasksCompletedOnTime = matchedTasks.filter((t) => {
      if (t.status !== 'REALIZADA') return false;
      if (!t.completedAt) return true;
      const dueLocal = new Date(`${t.dueDate}T${t.dueTime || '23:59'}:00`);
      const doneAt = new Date(t.completedAt);
      if (Number.isNaN(dueLocal.getTime()) || Number.isNaN(doneAt.getTime())) return true;
      return doneAt.getTime() <= dueLocal.getTime() + 15 * 60 * 1000;
    }).length;
    const tasksPending = matchedTasks.filter((t) => t.status === 'PENDIENTE').length;
    const tasksOverdue = matchedTasks.filter((t) => {
      if (t.status !== 'PENDIENTE') return false;
      return `${t.dueDate}T${t.dueTime}` < `${nowDate}T${nowTime}`;
    }).length;
    const taskCompletionPct =
      tasksAssigned > 0 ? Math.round((tasksCompleted / tasksAssigned) * 1000) / 10 : null;

    // 4. Workshop orders (when linked to a technician or matching name)
    const matchedWorkshopOrders = serviceOrders
      .filter((ord) => {
        const d = extractLocalDateFromISO(ord.createdAt);
        if (!isDateInRange(d, startDate, endDate)) return false;
        if (user.linkedTechnicianId && ord.assignedTechnicianId === user.linkedTechnicianId) return true;
        if (ord.assignedTechnician && ord.assignedTechnician.trim().toLowerCase() === userNameNorm) {
          return true;
        }
        return false;
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));

    const workshopOrdersCount = matchedWorkshopOrders.length;
    const workshopOrdersCompleted = matchedWorkshopOrders.filter(
      (o) => o.status === 'CULMINADA' || o.status === 'ENTREGADA'
    ).length;
    const workshopRevenueUSD =
      Math.round(
        matchedWorkshopOrders.reduce((acc, o) => acc + (Number(o.totalCost) || 0), 0) * 100
      ) / 100;

    // 5. Combined recent activity log (real events only)
    const recentActivity: EmployeeActivityItem[] = [
      ...matchedSales.slice(0, 15).map((s) => ({
        id: `act-sale-${s.id}`,
        timestamp: s.createdAt,
        type: 'VENTA' as const,
        title: `Venta ${s.invoiceNumber}`,
        detail: `${s.customerName} · ${s.paymentType || 'CONTADO'} · ${s.paymentMethod}`,
        amountUSD: s.total,
      })),
      ...matchedAttendance.slice(0, 15).map((a) => ({
        id: `act-att-${a.id}`,
        timestamp: a.checkInAt || `${a.date}T${a.checkInTime || '08:00'}:00`,
        type: 'ASISTENCIA' as const,
        title:
          a.punctualityStatus === 'PUNTUAL'
            ? `Llegada puntual (${formatTime12h(a.checkInTime)})`
            : a.punctualityStatus === 'TARDE'
            ? `Llegada con retraso (+${a.minutesLate} min · ${formatTime12h(a.checkInTime)})`
            : a.punctualityStatus === 'PERMISO'
            ? 'Permiso registrado'
            : 'Ausencia registrada',
        detail: a.checkOutTime
          ? `${a.date} · Salida ${formatTime12h(a.checkOutTime)} (${formatDurationMinutes(a.workedMinutes)})`
          : `${a.date} · Horario esperado ${formatTime12h(a.scheduledStartTime)}`,
      })),
      ...matchedTasks.slice(0, 15).map((t) => ({
        id: `act-tsk-${t.id}`,
        timestamp: t.completedAt || t.updatedAt || t.createdAt,
        type: 'TAREA' as const,
        title: t.status === 'REALIZADA' ? `Tarea completada: ${t.title}` : `Tarea asignada: ${t.title}`,
        detail: `Programada ${t.dueDate} ${formatTime12h(t.dueTime)} · ${t.status === 'REALIZADA' ? 'Realizada' : 'Pendiente'}`,
      })),
      ...matchedWorkshopOrders.slice(0, 10).map((o) => ({
        id: `act-ord-${o.id}`,
        timestamp: o.updatedAt || o.createdAt,
        type: 'TALLER' as const,
        title: `Orden ${o.orderNumber} (${o.status})`,
        detail: `${o.customerName} · ${o.serviceType}`,
        amountUSD: o.totalCost,
      })),
    ]
      .sort((a, b) => (b.timestamp || '').localeCompare(a.timestamp || ''))
      .slice(0, 25);

    return {
      user,
      salesCount,
      salesTotalUSD,
      salesTotalBs,
      avgTicketUSD,
      salesSharePct,
      monthlyGoalUSD,
      goalProgressPct,
      attendanceDays,
      punctualDays,
      lateDays,
      absentDays,
      permissionDays,
      punctualityPct,
      avgMinutesLate,
      totalMinutesLate,
      totalWorkedMinutes,
      avgArrivalTimeLabel,
      tasksAssigned,
      tasksCompleted,
      tasksCompletedOnTime,
      tasksPending,
      tasksOverdue,
      taskCompletionPct,
      workshopOrdersCount,
      workshopOrdersCompleted,
      workshopRevenueUSD,
      matchedSales,
      matchedAttendance,
      matchedTasks,
      matchedWorkshopOrders,
      recentActivity,
    };
  });
}

export function exportEmployeeReportsCsv(
  reports: EmployeePerformanceReport[],
  rangeLabel: string
): void {
  const headers = [
    'Trabajador',
    'Usuario',
    'Cargo',
    'Estado',
    'Horario Entrada',
    'Ventas (#)',
    'Ventas Total (USD)',
    'Ventas Total (Bs)',
    'Ticket Promedio (USD)',
    'Meta Mensual (USD)',
    'Avance Meta (%)',
    'Dias Asistidos',
    'Dias Puntuales',
    'Llegadas Tarde',
    'Puntualidad (%)',
    'Retraso Promedio (min)',
    'Hora Llegada Promedio',
    'Horas Trabajadas',
    'Tareas Asignadas',
    'Tareas Realizadas',
    'Cumplimiento Tareas (%)',
    'Ordenes Taller',
    'Periodo',
  ];

  const escapeCsv = (val: string | number) => {
    const str = String(val ?? '');
    if (str.includes(',') || str.includes('"') || str.includes('\n')) {
      return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
  };

  const rows = reports.map((r) => [
    r.user.name,
    r.user.username || r.user.email || r.user.phone || '',
    r.user.position || (r.user.role === 'ADMIN' ? 'Administrador' : 'Empleado'),
    r.user.active === false ? 'Inactivo' : 'Activo',
    r.user.scheduledStartTime || '08:00',
    r.salesCount,
    r.salesTotalUSD.toFixed(2),
    r.salesTotalBs.toFixed(2),
    r.avgTicketUSD.toFixed(2),
    r.monthlyGoalUSD.toFixed(2),
    r.goalProgressPct !== null ? `${r.goalProgressPct}%` : 'N/A',
    r.attendanceDays,
    r.punctualDays,
    r.lateDays,
    r.punctualityPct !== null ? `${r.punctualityPct}%` : 'Sin registros',
    r.avgMinutesLate,
    r.avgArrivalTimeLabel,
    formatDurationMinutes(r.totalWorkedMinutes),
    r.tasksAssigned,
    r.tasksCompleted,
    r.taskCompletionPct !== null ? `${r.taskCompletionPct}%` : 'Sin tareas',
    r.workshopOrdersCount,
    rangeLabel,
  ]);

  const csvContent =
    '\uFEFF' +
    [headers, ...rows].map((row) => row.map(escapeCsv).join(',')).join('\n');

  const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `reporte-equipo-${getLocalTodayISO()}.csv`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}
