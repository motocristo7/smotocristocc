import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  DebtInstallment,
  DebtPaymentFrequency,
  DebtPaymentPlan,
  DebtPaymentStrategy,
  DebtPriority,
  TreasuryCommitmentPaymentCurrency,
  TreasuryCommitmentRateType,
  TreasuryDebt,
} from '../../types';
import { formatUSD, formatBs } from '../../utils/whatsapp';
import { fetchOfficialEuroBcvRate } from '../../services/bcvService';
import {
  Plus,
  Pencil,
  Trash2,
  X,
  Check,
  CalendarClock,
  CheckCircle2,
  Tag,
  Search,
  ChevronDown,
  ChevronUp,
  Wallet,
  RefreshCw,
  ArrowRight,
  CalendarPlus,
  AlertTriangle,
  Receipt,
  SlidersHorizontal,
  History,
  Calculator,
  Flag,
} from 'lucide-react';

interface TreasuryDebtsSectionProps {
  showBanner: (type: 'success' | 'error' | 'info', text: string) => void;
}

const PRIORITY_META: Record<
  DebtPriority,
  { label: string; textClass: string; dotClass: string }
> = {
  ALTA: { label: 'Prioridad Alta', textClass: 'text-rose-700', dotClass: 'bg-rose-500' },
  MEDIA: { label: 'Prioridad Media', textClass: 'text-amber-700', dotClass: 'bg-amber-500' },
  BAJA: { label: 'Prioridad Baja', textClass: 'text-slate-600', dotClass: 'bg-slate-400' },
};

const STRATEGY_LABELS: Record<DebtPaymentStrategy, string> = {
  CUOTAS_IGUALES: 'Cuotas iguales',
  PAGO_UNICO: 'Pago único',
  FLEXIBLE: 'Abonos flexibles',
};

const FREQUENCY_LABELS: Record<DebtPaymentFrequency, string> = {
  SEMANAL: 'Semanal',
  QUINCENAL: 'Quincenal',
  MENSUAL: 'Mensual',
  UNICO: 'Pago único',
};

const MAX_PLAN_INSTALLMENTS = 120;

const WEEKDAY_OPTIONS: { value: number; short: string; label: string }[] = [
  { value: 1, short: 'Lun', label: 'Lunes' },
  { value: 2, short: 'Mar', label: 'Martes' },
  { value: 3, short: 'Mié', label: 'Miércoles' },
  { value: 4, short: 'Jue', label: 'Jueves' },
  { value: 5, short: 'Vie', label: 'Viernes' },
  { value: 6, short: 'Sáb', label: 'Sábado' },
  { value: 0, short: 'Dom', label: 'Domingo' },
];

const WEEKDAY_SHORT_BY_INDEX = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const MONTH_SHORT_ES = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];

interface ScheduleDayOptions {
  paymentWeekdays: number[];
  biweeklyMode: 'FIXED_DAYS' | 'EVERY_15_DAYS';
  biweeklyDays: [number, number];
  monthlyDay: number;
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function parseIsoLocal(isoDate: string): Date {
  const parts = isoDate.split('-').map(Number);
  if (parts.length === 3 && !parts.some(Number.isNaN)) {
    return new Date(parts[0], parts[1] - 1, parts[2]);
  }
  const now = new Date();
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

function formatIsoLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
}

function formatPrettyDateES(isoDate?: string): string {
  if (!isoDate) return '—';
  const d = parseIsoLocal(isoDate);
  return `${WEEKDAY_SHORT_BY_INDEX[d.getDay()]} ${String(d.getDate()).padStart(2, '0')} ${MONTH_SHORT_ES[d.getMonth()]} ${d.getFullYear()}`;
}

function getWeekdayShortES(isoDate?: string): string {
  if (!isoDate) return '';
  return WEEKDAY_SHORT_BY_INDEX[parseIsoLocal(isoDate).getDay()] || '';
}

function formatDurationBetweenES(startIso?: string, endIso?: string): string {
  if (!startIso || !endIso) return '';
  const start = parseIsoLocal(startIso);
  const end = parseIsoLocal(endIso);
  const diffDays = Math.max(0, Math.round((end.getTime() - start.getTime()) / (1000 * 60 * 60 * 24)));
  if (diffDays === 0) return 'mismo día';
  if (diffDays < 7) return `${diffDays} día${diffDays === 1 ? '' : 's'}`;
  if (diffDays < 60) {
    const weeks = Math.floor(diffDays / 7);
    const remDays = diffDays % 7;
    if (remDays === 0) return `${weeks} semana${weeks === 1 ? '' : 's'} (${diffDays} días)`;
    return `${weeks} sem y ${remDays} día${remDays === 1 ? '' : 's'} (${diffDays} días)`;
  }
  const months = Math.floor(diffDays / 30);
  const remDays = diffDays % 30;
  if (remDays === 0) return `${months} mes${months === 1 ? '' : 'es'} (${diffDays} días)`;
  return `${months} mes${months === 1 ? '' : 'es'} y ${remDays} día${remDays === 1 ? '' : 's'}`;
}

function addDaysToIso(isoDate: string, days: number): string {
  const d = parseIsoLocal(isoDate);
  d.setDate(d.getDate() + days);
  return formatIsoLocal(d);
}

function addMonthsToIso(isoDate: string, months: number): string {
  const base = parseIsoLocal(isoDate);
  const target = new Date(base.getFullYear(), base.getMonth() + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(base.getDate(), lastDay));
  return formatIsoLocal(target);
}

function stepDateByFrequency(startDate: string, index: number, frequency: DebtPaymentFrequency): string {
  if (index === 0 || frequency === 'UNICO') return startDate;
  if (frequency === 'SEMANAL') return addDaysToIso(startDate, index * 7);
  if (frequency === 'QUINCENAL') return addDaysToIso(startDate, index * 15);
  return addMonthsToIso(startDate, index);
}

function generatePlanDates(
  count: number,
  startDate: string,
  frequency: DebtPaymentFrequency,
  dayOpts: ScheduleDayOptions
): string[] {
  const safeCount = Math.max(1, Math.min(MAX_PLAN_INSTALLMENTS, Math.floor(count) || 1));
  const start = parseIsoLocal(startDate);
  const startIso = formatIsoLocal(start);

  if (frequency === 'UNICO') {
    return [startIso];
  }

  if (frequency === 'SEMANAL') {
    const activeWeekdays =
      dayOpts.paymentWeekdays.length > 0 ? dayOpts.paymentWeekdays : [start.getDay()];
    const activeSet = new Set(activeWeekdays);
    const dates: string[] = [];
    const cursor = new Date(start.getFullYear(), start.getMonth(), start.getDate());
    let guard = 0;
    while (dates.length < safeCount && guard < 3650) {
      if (activeSet.has(cursor.getDay())) {
        dates.push(formatIsoLocal(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
      guard += 1;
    }
    return dates;
  }

  if (frequency === 'QUINCENAL') {
    if (dayOpts.biweeklyMode === 'EVERY_15_DAYS') {
      const dates: string[] = [];
      for (let i = 0; i < safeCount; i++) {
        dates.push(addDaysToIso(startIso, i * 15));
      }
      return dates;
    }
    const rawD1 = Math.max(1, Math.min(31, Math.floor(dayOpts.biweeklyDays[0]) || 15));
    const rawD2 = Math.max(1, Math.min(31, Math.floor(dayOpts.biweeklyDays[1]) || 30));
    const dates: string[] = [];
    let year = start.getFullYear();
    let month = start.getMonth();
    let guard = 0;
    while (dates.length < safeCount && guard < 180) {
      const lastDay = new Date(year, month + 1, 0).getDate();
      const candidates = Array.from(
        new Set([Math.min(rawD1, lastDay), Math.min(rawD2, lastDay)])
      ).sort((a, b) => a - b);
      for (const day of candidates) {
        const candidateIso = formatIsoLocal(new Date(year, month, day));
        if (candidateIso >= startIso) {
          dates.push(candidateIso);
          if (dates.length >= safeCount) break;
        }
      }
      month += 1;
      if (month > 11) {
        month = 0;
        year += 1;
      }
      guard += 1;
    }
    return dates;
  }

  // MENSUAL
  const targetDay = Math.max(1, Math.min(31, Math.floor(dayOpts.monthlyDay) || start.getDate()));
  let year = start.getFullYear();
  let month = start.getMonth();
  const firstMonthLastDay = new Date(year, month + 1, 0).getDate();
  const firstCandidate = formatIsoLocal(new Date(year, month, Math.min(targetDay, firstMonthLastDay)));
  if (firstCandidate < startIso) {
    month += 1;
    if (month > 11) {
      month = 0;
      year += 1;
    }
  }
  const dates: string[] = [];
  for (let i = 0; i < safeCount; i++) {
    const target = new Date(year, month + i, 1);
    const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
    target.setDate(Math.min(targetDay, lastDay));
    dates.push(formatIsoLocal(target));
  }
  return dates;
}

function buildInstallmentsByCount(
  remainingAmountUSD: number,
  count: number,
  startDate: string,
  frequency: DebtPaymentFrequency,
  dayOpts: ScheduleDayOptions,
  existingPaidInstallments: DebtInstallment[] = []
): DebtInstallment[] {
  const safeCount =
    frequency === 'UNICO' ? 1 : Math.max(1, Math.min(MAX_PLAN_INSTALLMENTS, Math.floor(count) || 1));
  const safeAmount = round2(Math.max(0, remainingAmountUSD));
  const baseInstallment = Math.floor((safeAmount / safeCount) * 100) / 100;
  const remainderCents = Math.round((safeAmount - baseInstallment * safeCount) * 100);
  const dates = generatePlanDates(safeCount, startDate, frequency, dayOpts);
  const startNumber = existingPaidInstallments.length + 1;

  const generatedPending: DebtInstallment[] = dates.map((dueDate, i) => {
    const extraCent = i === dates.length - 1 ? remainderCents / 100 : 0;
    const amountUSD = round2(baseInstallment + extraCent);
    return {
      id: `inst-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      number: startNumber + i,
      dueDate,
      amountUSD,
      status: 'PENDIENTE',
    };
  });

  return [...existingPaidInstallments, ...generatedPending];
}

function buildInstallmentsByAmount(
  remainingAmountUSD: number,
  installmentAmountUSD: number,
  startDate: string,
  frequency: DebtPaymentFrequency,
  dayOpts: ScheduleDayOptions,
  existingPaidInstallments: DebtInstallment[] = []
): { installments: DebtInstallment[]; count: number; rawCount: number; capped: boolean } {
  const safeRemaining = round2(Math.max(0, remainingAmountUSD));
  const safePerInstallment = round2(Math.max(0, installmentAmountUSD));

  if (safeRemaining <= 0.009) {
    return { installments: [...existingPaidInstallments], count: 0, rawCount: 0, capped: false };
  }

  if (frequency === 'UNICO' || safePerInstallment <= 0 || safePerInstallment >= safeRemaining - 0.009) {
    const dates = generatePlanDates(1, startDate, frequency, dayOpts);
    const startNumber = existingPaidInstallments.length + 1;
    return {
      installments: [
        ...existingPaidInstallments,
        {
          id: `inst-${Date.now()}-0-${Math.random().toString(36).slice(2, 5)}`,
          number: startNumber,
          dueDate: dates[0],
          amountUSD: safeRemaining,
          status: 'PENDIENTE',
        },
      ],
      count: 1,
      rawCount: 1,
      capped: false,
    };
  }

  const fullCount = Math.floor((safeRemaining + 0.0001) / safePerInstallment);
  const remainder = round2(safeRemaining - fullCount * safePerInstallment);
  const rawCount = remainder > 0.009 ? fullCount + 1 : Math.max(1, fullCount);
  const capped = rawCount > MAX_PLAN_INSTALLMENTS;
  const effectiveCount = Math.min(MAX_PLAN_INSTALLMENTS, rawCount);
  const dates = generatePlanDates(effectiveCount, startDate, frequency, dayOpts);
  const startNumber = existingPaidInstallments.length + 1;

  const generatedPending: DebtInstallment[] = [];
  let accumulated = 0;

  for (let i = 0; i < effectiveCount; i++) {
    const isLast = i === effectiveCount - 1;
    const amountUSD = isLast
      ? round2(Math.max(0.01, safeRemaining - accumulated))
      : safePerInstallment;
    accumulated = round2(accumulated + amountUSD);
    generatedPending.push({
      id: `inst-${Date.now()}-${i}-${Math.random().toString(36).slice(2, 5)}`,
      number: startNumber + i,
      dueDate: dates[i],
      amountUSD,
      status: 'PENDIENTE',
    });
  }

  return {
    installments: [...existingPaidInstallments, ...generatedPending],
    count: effectiveCount,
    rawCount,
    capped,
  };
}

export const TreasuryDebtsSection: React.FC<TreasuryDebtsSectionProps> = ({ showBanner }) => {
  const {
    settings,
    treasuryAccounts,
    treasuryDebts,
    debtCategories,
    addDebtCategory,
    renameDebtCategory,
    deleteDebtCategory,
    addTreasuryDebt,
    updateTreasuryDebt,
    deleteTreasuryDebt,
    saveDebtPaymentPlan,
    recordDebtPayment,
    scheduleDebtInstallmentToCommitments,
    totalPendingDebtsUSD,
    totalPendingDebtsBs,
    totalLiquidityUSD,
    projectedFreeBalanceUSD,
  } = useApp();

  const bcvRate = settings.bcvRate || 1;
  const todayStr = new Date().toISOString().split('T')[0];

  // Filters & UI state
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'PENDING' | 'EN_PLAN' | 'PAGADA'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [expandedDebtId, setExpandedDebtId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  // Modal 1: Add / Edit Debt
  const [debtModalOpen, setDebtModalOpen] = useState(false);
  const [editingDebtId, setEditingDebtId] = useState<string | null>(null);
  const [debtTitle, setDebtTitle] = useState('');
  const [debtCreditor, setDebtCreditor] = useState('');
  const [debtCategory, setDebtCategory] = useState(debtCategories[0] || 'Otras Deudas');
  const [debtNewCategoryInline, setDebtNewCategoryInline] = useState('');
  const [showInlineNewCat, setShowInlineNewCat] = useState(false);
  const [debtPriority, setDebtPriority] = useState<DebtPriority>('MEDIA');
  const [debtTotalUSD, setDebtTotalUSD] = useState('');
  const [debtInitialPaidUSD, setDebtInitialPaidUSD] = useState('');
  const [debtStartDate, setDebtStartDate] = useState(todayStr);
  const [debtDueDate, setDebtDueDate] = useState('');
  const [debtNotes, setDebtNotes] = useState('');
  const [openPlanAfterCreate, setOpenPlanAfterCreate] = useState(true);

  // Modal 2: Payment Planner
  const [planModalDebt, setPlanModalDebt] = useState<TreasuryDebt | null>(null);
  const [planStrategy, setPlanStrategy] = useState<DebtPaymentStrategy>('CUOTAS_IGUALES');
  const [planFrequency, setPlanFrequency] = useState<DebtPaymentFrequency>('SEMANAL');
  const [planCalcMode, setPlanCalcMode] = useState<'BY_AMOUNT' | 'BY_COUNT'>('BY_AMOUNT');
  const [planInstallmentAmount, setPlanInstallmentAmount] = useState('');
  const [planCount, setPlanCount] = useState('3');
  const [planStartDate, setPlanStartDate] = useState(todayStr);
  const [planWeekdays, setPlanWeekdays] = useState<number[]>([parseIsoLocal(todayStr).getDay()]);
  const [planBiweeklyMode, setPlanBiweeklyMode] = useState<'FIXED_DAYS' | 'EVERY_15_DAYS'>('FIXED_DAYS');
  const [planBiweeklyDay1, setPlanBiweeklyDay1] = useState('15');
  const [planBiweeklyDay2, setPlanBiweeklyDay2] = useState('30');
  const [planMonthlyDay, setPlanMonthlyDay] = useState(String(parseIsoLocal(todayStr).getDate()));
  const [planCappedInfo, setPlanCappedInfo] = useState<{ capped: boolean; rawCount: number }>({
    capped: false,
    rawCount: 0,
  });
  const [planCurrency, setPlanCurrency] = useState<TreasuryCommitmentPaymentCurrency>('EFECTIVO_USD');
  const [planRateType, setPlanRateType] = useState<TreasuryCommitmentRateType>('BCV');
  const [planAppliedRate, setPlanAppliedRate] = useState(String(bcvRate));
  const [planPreferredAccountId, setPlanPreferredAccountId] = useState('');
  const [planNotes, setPlanNotes] = useState('');
  const [planInstallments, setPlanInstallments] = useState<DebtInstallment[]>([]);
  const [isFetchingEuro, setIsFetchingEuro] = useState(false);

  // Modal 3: Record Debt Payment / Abono
  const [payModalDebt, setPayModalDebt] = useState<TreasuryDebt | null>(null);
  const [payInstallmentId, setPayInstallmentId] = useState<string>('');
  const [payAccountId, setPayAccountId] = useState<string>('');
  const [payDate, setPayDate] = useState<string>(todayStr);
  const [payInputCurrency, setPayInputCurrency] = useState<'USD' | 'BS' | 'USDT'>('USD');
  const [payAmountInput, setPayAmountInput] = useState<string>('');
  const [payRate, setPayRate] = useState<string>(String(bcvRate));
  const [payReference, setPayReference] = useState<string>('');
  const [payNotes, setPayNotes] = useState<string>('');
  const [paySyncToExpense, setPaySyncToExpense] = useState<boolean>(false);

  // Modal 4: Manage & Edit Debt Categories
  const [categoryModalOpen, setCategoryModalOpen] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');
  const [renamingCategory, setRenamingCategory] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState('');

  // Enriched accounts with live USD balance
  const enrichedAccounts = useMemo(() => {
    return treasuryAccounts.map((acc) => {
      const liveUSD =
        acc.currency === 'BS'
          ? Math.round(((Number(acc.nativeBalance) || 0) / bcvRate) * 100) / 100
          : Math.round((Number(acc.nativeBalance) || 0) * 100) / 100;
      return { ...acc, liveUSD };
    });
  }, [treasuryAccounts, bcvRate]);

  // All pending debts available to select inside the payment planner
  const pendingDebtsList = useMemo(() => {
    return treasuryDebts.filter((d) => d.status !== 'PAGADA' && d.remainingAmountUSD > 0.009);
  }, [treasuryDebts]);

  // Summary Stats
  const debtStats = useMemo(() => {
    let totalOriginalUSD = 0;
    let totalPaidUSD = 0;
    let activeCount = 0;
    let plannedCount = 0;
    let paidCount = 0;
    let nextDue: { debtTitle: string; dueDate: string; amountUSD: number; label: string } | null = null;

    for (const d of treasuryDebts) {
      totalOriginalUSD += Number(d.totalAmountUSD) || 0;
      totalPaidUSD += Number(d.paidAmountUSD) || 0;
      if (d.status === 'PAGADA' || d.remainingAmountUSD <= 0.009) {
        paidCount += 1;
      } else if (d.status === 'EN_PLAN' && d.paymentPlan?.installments?.length) {
        plannedCount += 1;
        const firstPending = d.paymentPlan.installments
          .filter((i) => i.status === 'PENDIENTE')
          .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
        if (firstPending && (!nextDue || firstPending.dueDate < nextDue.dueDate)) {
          nextDue = {
            debtTitle: d.title,
            dueDate: firstPending.dueDate,
            amountUSD: firstPending.amountUSD,
            label: `Cuota #${firstPending.number}`,
          };
        }
      } else {
        activeCount += 1;
        if (d.dueDate && (!nextDue || d.dueDate < nextDue.dueDate)) {
          nextDue = {
            debtTitle: d.title,
            dueDate: d.dueDate,
            amountUSD: d.remainingAmountUSD,
            label: 'Vencimiento',
          };
        }
      }
    }

    const paidPct =
      totalOriginalUSD > 0 ? Math.min(100, Math.round((totalPaidUSD / totalOriginalUSD) * 100)) : 0;

    return {
      totalOriginalUSD: Math.round(totalOriginalUSD * 100) / 100,
      totalPaidUSD: Math.round(totalPaidUSD * 100) / 100,
      paidPct,
      activeCount,
      plannedCount,
      paidCount,
      nextDue,
    };
  }, [treasuryDebts]);

  // Category usage counts
  const categoryUsageCounts = useMemo(() => {
    const map = new Map<string, number>();
    treasuryDebts.forEach((d) => {
      const key = (d.category || '').trim().toLowerCase();
      map.set(key, (map.get(key) || 0) + 1);
    });
    return map;
  }, [treasuryDebts]);

  // Filtered Debts
  const filteredDebts = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return treasuryDebts
      .filter((d) => {
        if (categoryFilter !== 'ALL' && d.category.toLowerCase() !== categoryFilter.toLowerCase()) {
          return false;
        }
        if (statusFilter === 'PENDING' && (d.status === 'PAGADA' || d.remainingAmountUSD <= 0.009)) {
          return false;
        }
        if (statusFilter === 'EN_PLAN' && d.status !== 'EN_PLAN') {
          return false;
        }
        if (statusFilter === 'PAGADA' && d.status !== 'PAGADA' && d.remainingAmountUSD > 0.009) {
          return false;
        }
        if (q) {
          const hay = `${d.title} ${d.creditor} ${d.category} ${d.debtNumber} ${d.notes || ''}`.toLowerCase();
          if (!hay.includes(q)) return false;
        }
        return true;
      })
      .sort((a, b) => {
        const aPaid = a.status === 'PAGADA' || a.remainingAmountUSD <= 0.009 ? 1 : 0;
        const bPaid = b.status === 'PAGADA' || b.remainingAmountUSD <= 0.009 ? 1 : 0;
        if (aPaid !== bPaid) return aPaid - bPaid;
        const prioOrder: Record<DebtPriority, number> = { ALTA: 0, MEDIA: 1, BAJA: 2 };
        if (prioOrder[a.priority] !== prioOrder[b.priority]) {
          return prioOrder[a.priority] - prioOrder[b.priority];
        }
        return (a.dueDate || '9999-12-31').localeCompare(b.dueDate || '9999-12-31');
      });
  }, [treasuryDebts, categoryFilter, statusFilter, searchQuery]);

  // --- Handlers: Modal 1 (New / Edit Debt) ---
  const openNewDebtModal = () => {
    setEditingDebtId(null);
    setDebtTitle('');
    setDebtCreditor('');
    setDebtCategory(
      categoryFilter !== 'ALL' ? categoryFilter : debtCategories[0] || 'Otras Deudas'
    );
    setDebtNewCategoryInline('');
    setShowInlineNewCat(false);
    setDebtPriority('MEDIA');
    setDebtTotalUSD('');
    setDebtInitialPaidUSD('');
    setDebtStartDate(todayStr);
    setDebtDueDate('');
    setDebtNotes('');
    setOpenPlanAfterCreate(true);
    setDebtModalOpen(true);
  };

  const openEditDebtModal = (debt: TreasuryDebt) => {
    setEditingDebtId(debt.id);
    setDebtTitle(debt.title);
    setDebtCreditor(debt.creditor);
    setDebtCategory(debt.category);
    setDebtNewCategoryInline('');
    setShowInlineNewCat(false);
    setDebtPriority(debt.priority);
    setDebtTotalUSD(String(debt.totalAmountUSD));
    setDebtInitialPaidUSD(String(debt.paidAmountUSD));
    setDebtStartDate(debt.startDate || todayStr);
    setDebtDueDate(debt.dueDate || '');
    setDebtNotes(debt.notes || '');
    setOpenPlanAfterCreate(false);
    setDebtModalOpen(true);
  };

  const handleSaveDebt = (e: React.FormEvent) => {
    e.preventDefault();
    const total = parseFloat(debtTotalUSD);
    if (!debtTitle.trim()) {
      showBanner('error', 'Ingresa el concepto o descripción de la deuda.');
      return;
    }
    if (Number.isNaN(total) || total <= 0) {
      showBanner('error', 'Ingresa un monto total en USD mayor a cero.');
      return;
    }

    let finalCategory = debtCategory;
    if (showInlineNewCat && debtNewCategoryInline.trim()) {
      const res = addDebtCategory(debtNewCategoryInline.trim());
      finalCategory = res.category || finalCategory;
    }

    if (editingDebtId) {
      updateTreasuryDebt(editingDebtId, {
        title: debtTitle.trim(),
        creditor: debtCreditor.trim() || 'Acreedor general',
        category: finalCategory,
        priority: debtPriority,
        totalAmountUSD: total,
        startDate: debtStartDate || todayStr,
        dueDate: debtDueDate || undefined,
        notes: debtNotes.trim() || undefined,
      });
      setDebtModalOpen(false);
      showBanner('success', `Deuda "${debtTitle.trim()}" actualizada correctamente.`);
    } else {
      const initialPaid = Math.max(0, parseFloat(debtInitialPaidUSD) || 0);
      const created = addTreasuryDebt({
        title: debtTitle.trim(),
        creditor: debtCreditor.trim() || 'Acreedor general',
        category: finalCategory,
        priority: debtPriority,
        totalAmountUSD: total,
        initialPaidUSD: initialPaid,
        startDate: debtStartDate || todayStr,
        dueDate: debtDueDate || undefined,
        notes: debtNotes.trim() || undefined,
      });
      setDebtModalOpen(false);
      showBanner('success', `Deuda ${created.debtNumber} registrada (${formatUSD(created.remainingAmountUSD)} pendiente).`);
      if (openPlanAfterCreate && created.remainingAmountUSD > 0.009) {
        openPlannerModal(created);
      }
    }
  };

  // --- Handlers: Modal 2 (Payment Planner) ---
  const getCurrentDayOpts = (overrides?: Partial<ScheduleDayOptions>): ScheduleDayOptions => {
    const d1 = Math.max(1, Math.min(31, parseInt(planBiweeklyDay1, 10) || 15));
    const d2 = Math.max(1, Math.min(31, parseInt(planBiweeklyDay2, 10) || 30));
    const mDay = Math.max(
      1,
      Math.min(31, parseInt(planMonthlyDay, 10) || parseIsoLocal(planStartDate || todayStr).getDate())
    );
    return {
      paymentWeekdays: overrides?.paymentWeekdays ?? planWeekdays,
      biweeklyMode: overrides?.biweeklyMode ?? planBiweeklyMode,
      biweeklyDays: overrides?.biweeklyDays ?? [d1, d2],
      monthlyDay: overrides?.monthlyDay ?? mDay,
    };
  };

  const openPlannerModal = (debt: TreasuryDebt) => {
    setPlanModalDebt(debt);
    setPlanCappedInfo({ capped: false, rawCount: 0 });
    const existing = debt.paymentPlan;

    if (existing) {
      const startDate = existing.startDate || todayStr;
      const startParsed = parseIsoLocal(startDate);
      const pendingInst = existing.installments.filter((i) => i.status === 'PENDIENTE');
      const countNum = Math.max(1, pendingInst.length || existing.installmentsCount || 3);
      const inferredAmount =
        existing.installmentAmountUSD && existing.installmentAmountUSD > 0
          ? existing.installmentAmountUSD
          : pendingInst[0]?.amountUSD || round2(debt.remainingAmountUSD / countNum);

      setPlanStrategy(existing.strategy);
      setPlanFrequency(existing.frequency);
      setPlanCalcMode(existing.calculationMode || 'BY_AMOUNT');
      setPlanInstallmentAmount(String(round2(inferredAmount)));
      setPlanCount(String(countNum));
      setPlanStartDate(startDate);
      setPlanWeekdays(
        existing.paymentWeekdays && existing.paymentWeekdays.length > 0
          ? existing.paymentWeekdays
          : [startParsed.getDay()]
      );
      setPlanBiweeklyMode(existing.biweeklyMode || 'FIXED_DAYS');
      setPlanBiweeklyDay1(String(existing.biweeklyDays?.[0] || 15));
      setPlanBiweeklyDay2(String(existing.biweeklyDays?.[1] || 30));
      setPlanMonthlyDay(String(existing.monthlyDay || startParsed.getDate()));
      setPlanCurrency(existing.paymentCurrency || 'EFECTIVO_USD');
      setPlanRateType(existing.exchangeRateType || 'BCV');
      setPlanAppliedRate(String(existing.appliedExchangeRate || bcvRate));
      setPlanPreferredAccountId(existing.preferredAccountId || treasuryAccounts[0]?.id || '');
      setPlanNotes(existing.notes || '');
      setPlanInstallments(existing.installments.map((i) => ({ ...i })));
    } else {
      const defaultFreq: DebtPaymentFrequency = 'SEMANAL';
      const defaultStart = todayStr;
      const startParsed = parseIsoLocal(defaultStart);
      const defaultWeekdays = [startParsed.getDay()];
      const defaultBiweeklyDays: [number, number] = [15, 30];
      const defaultMonthlyDay = startParsed.getDate();
      const suggestedCount = debt.remainingAmountUSD <= 50 ? 2 : 4;
      const suggestedAmount = round2(debt.remainingAmountUSD / suggestedCount);

      setPlanStrategy('CUOTAS_IGUALES');
      setPlanFrequency(defaultFreq);
      setPlanCalcMode('BY_AMOUNT');
      setPlanInstallmentAmount(String(suggestedAmount));
      setPlanStartDate(defaultStart);
      setPlanWeekdays(defaultWeekdays);
      setPlanBiweeklyMode('FIXED_DAYS');
      setPlanBiweeklyDay1(String(defaultBiweeklyDays[0]));
      setPlanBiweeklyDay2(String(defaultBiweeklyDays[1]));
      setPlanMonthlyDay(String(defaultMonthlyDay));
      setPlanCurrency('EFECTIVO_USD');
      setPlanRateType('BCV');
      setPlanAppliedRate(String(bcvRate));
      setPlanPreferredAccountId(treasuryAccounts[0]?.id || '');
      setPlanNotes('');

      const built = buildInstallmentsByAmount(
        debt.remainingAmountUSD,
        suggestedAmount,
        defaultStart,
        defaultFreq,
        {
          paymentWeekdays: defaultWeekdays,
          biweeklyMode: 'FIXED_DAYS',
          biweeklyDays: defaultBiweeklyDays,
          monthlyDay: defaultMonthlyDay,
        },
        []
      );
      setPlanCount(String(Math.max(1, built.count)));
      setPlanInstallments(built.installments);
    }
  };

  const handleOpenPlannerFromHeader = () => {
    if (pendingDebtsList.length > 0) {
      openPlannerModal(pendingDebtsList[0]);
    } else {
      showBanner(
        'info',
        'No tienes deudas pendientes por planificar. Registra primero una deuda para diseñar su plan de pagos.'
      );
      openNewDebtModal();
    }
  };

  const handleSwitchPlannerDebt = (debtId: string) => {
    const nextDebt = pendingDebtsList.find((d) => d.id === debtId);
    if (nextDebt) {
      openPlannerModal(nextDebt);
    }
  };

  const recalculatePlanLive = (opts?: {
    freq?: DebtPaymentFrequency;
    calcMode?: 'BY_AMOUNT' | 'BY_COUNT';
    amountPerInstallment?: number;
    count?: number;
    startDate?: string;
    dayOpts?: Partial<ScheduleDayOptions>;
    debt?: TreasuryDebt;
  }) => {
    const targetDebt = opts?.debt || planModalDebt;
    if (!targetDebt) return;
    const freq = opts?.freq ?? planFrequency;
    const mode = freq === 'UNICO' ? 'BY_COUNT' : opts?.calcMode ?? planCalcMode;
    const start = opts?.startDate ?? (planStartDate || todayStr);
    const dayOpts = getCurrentDayOpts(opts?.dayOpts);
    const paidExisting = opts?.debt ? [] : planInstallments.filter((i) => i.status === 'PAGADA');

    if (freq === 'UNICO') {
      const generated = buildInstallmentsByCount(
        targetDebt.remainingAmountUSD,
        1,
        start,
        'UNICO',
        dayOpts,
        paidExisting
      );
      setPlanStrategy('PAGO_UNICO');
      setPlanCount('1');
      setPlanInstallmentAmount(String(round2(targetDebt.remainingAmountUSD)));
      setPlanCappedInfo({ capped: false, rawCount: 1 });
      setPlanInstallments(generated);
      return;
    }

    setPlanStrategy('CUOTAS_IGUALES');

    if (mode === 'BY_AMOUNT') {
      const amountVal =
        opts?.amountPerInstallment !== undefined
          ? opts.amountPerInstallment
          : parseFloat(planInstallmentAmount);
      if (Number.isNaN(amountVal) || amountVal <= 0) {
        return;
      }
      const built = buildInstallmentsByAmount(
        targetDebt.remainingAmountUSD,
        amountVal,
        start,
        freq,
        dayOpts,
        paidExisting
      );
      setPlanCount(String(Math.max(1, built.count)));
      setPlanCappedInfo({ capped: built.capped, rawCount: built.rawCount });
      setPlanInstallments(built.installments);
    } else {
      const countVal =
        opts?.count !== undefined ? opts.count : Math.max(1, parseInt(planCount, 10) || 1);
      const safeCount = Math.max(1, Math.min(MAX_PLAN_INSTALLMENTS, countVal));
      const generated = buildInstallmentsByCount(
        targetDebt.remainingAmountUSD,
        safeCount,
        start,
        freq,
        dayOpts,
        paidExisting
      );
      const firstPending = generated.find((i) => i.status === 'PENDIENTE');
      if (firstPending) {
        setPlanInstallmentAmount(String(round2(firstPending.amountUSD)));
      }
      setPlanCappedInfo({ capped: false, rawCount: safeCount });
      setPlanInstallments(generated);
    }
  };

  const handleSelectPlanFrequency = (freq: DebtPaymentFrequency) => {
    setPlanFrequency(freq);
    if (freq === 'UNICO') {
      recalculatePlanLive({ freq: 'UNICO' });
    } else {
      const nextAmount =
        parseFloat(planInstallmentAmount) > 0
          ? parseFloat(planInstallmentAmount)
          : planModalDebt
          ? round2(planModalDebt.remainingAmountUSD / Math.max(2, parseInt(planCount, 10) || 4))
          : 0;
      if (planFrequency === 'UNICO' && planModalDebt) {
        const autoAmt = round2(planModalDebt.remainingAmountUSD / 4);
        setPlanCalcMode('BY_AMOUNT');
        setPlanInstallmentAmount(String(autoAmt));
        recalculatePlanLive({ freq, calcMode: 'BY_AMOUNT', amountPerInstallment: autoAmt });
      } else {
        recalculatePlanLive({ freq, amountPerInstallment: nextAmount });
      }
    }
  };

  const handleInstallmentAmountChange = (raw: string) => {
    setPlanInstallmentAmount(raw);
    setPlanCalcMode('BY_AMOUNT');
    const parsed = parseFloat(raw);
    if (!Number.isNaN(parsed) && parsed > 0) {
      const effectiveFreq = planFrequency === 'UNICO' ? 'SEMANAL' : planFrequency;
      if (planFrequency === 'UNICO') {
        setPlanFrequency(effectiveFreq);
      }
      recalculatePlanLive({
        freq: effectiveFreq,
        calcMode: 'BY_AMOUNT',
        amountPerInstallment: parsed,
      });
    }
  };

  const handleInstallmentCountChange = (raw: string) => {
    setPlanCount(raw);
    setPlanCalcMode('BY_COUNT');
    const parsed = parseInt(raw, 10);
    if (!Number.isNaN(parsed) && parsed >= 1) {
      const effectiveFreq = planFrequency === 'UNICO' ? 'SEMANAL' : planFrequency;
      if (planFrequency === 'UNICO') {
        setPlanFrequency(effectiveFreq);
      }
      recalculatePlanLive({
        freq: effectiveFreq,
        calcMode: 'BY_COUNT',
        count: parsed,
      });
    }
  };

  const handlePlanStartDateChange = (newStart: string) => {
    setPlanStartDate(newStart);
    if (!newStart) return;
    recalculatePlanLive({ startDate: newStart });
  };

  const handleTogglePlanWeekday = (weekday: number) => {
    const exists = planWeekdays.includes(weekday);
    let next: number[];
    if (exists) {
      if (planWeekdays.length === 1) return; // keep at least 1 weekday active
      next = planWeekdays.filter((w) => w !== weekday);
    } else {
      next = [...planWeekdays, weekday];
    }
    setPlanWeekdays(next);
    recalculatePlanLive({ dayOpts: { paymentWeekdays: next } });
  };

  const handleBiweeklyModeChange = (mode: 'FIXED_DAYS' | 'EVERY_15_DAYS') => {
    setPlanBiweeklyMode(mode);
    recalculatePlanLive({ dayOpts: { biweeklyMode: mode } });
  };

  const handleBiweeklyDaysChange = (d1Str: string, d2Str: string) => {
    setPlanBiweeklyDay1(d1Str);
    setPlanBiweeklyDay2(d2Str);
    const d1 = parseInt(d1Str, 10);
    const d2 = parseInt(d2Str, 10);
    if (!Number.isNaN(d1) && d1 >= 1 && d1 <= 31 && !Number.isNaN(d2) && d2 >= 1 && d2 <= 31) {
      recalculatePlanLive({ dayOpts: { biweeklyMode: 'FIXED_DAYS', biweeklyDays: [d1, d2] } });
    }
  };

  const handleMonthlyDayChange = (dayStr: string) => {
    setPlanMonthlyDay(dayStr);
    const dayNum = parseInt(dayStr, 10);
    if (!Number.isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) {
      recalculatePlanLive({ dayOpts: { monthlyDay: dayNum } });
    }
  };

  const handleSelectPlanRateType = async (rt: TreasuryCommitmentRateType) => {
    setPlanRateType(rt);
    if (rt === 'BCV') {
      setPlanAppliedRate(String(bcvRate));
    } else if (rt === 'EURO') {
      setIsFetchingEuro(true);
      try {
        const res = await fetchOfficialEuroBcvRate();
        if (res.success && res.rate && res.rate > 0) {
          setPlanAppliedRate(String(Math.round(res.rate * 100) / 100));
        }
      } catch {
        // fallback keeps current value
      } finally {
        setIsFetchingEuro(false);
      }
    }
  };

  const handleUpdateInstallmentField = (
    instId: string,
    field: 'dueDate' | 'amountUSD',
    value: string
  ) => {
    setPlanInstallments((prev) =>
      prev.map((inst) => {
        if (inst.id !== instId) return inst;
        if (field === 'dueDate') return { ...inst, dueDate: value };
        const parsed = parseFloat(value);
        return { ...inst, amountUSD: Number.isNaN(parsed) ? 0 : Math.max(0, parsed) };
      })
    );
    setPlanStrategy('FLEXIBLE');
  };

  const handleAddManualInstallment = () => {
    const last = planInstallments[planInstallments.length - 1];
    const nextDate = last
      ? stepDateByFrequency(last.dueDate, 1, planFrequency === 'UNICO' ? 'MENSUAL' : planFrequency)
      : planStartDate || todayStr;
    const pendingSum = planInstallments
      .filter((i) => i.status === 'PENDIENTE')
      .reduce((s, i) => s + (Number(i.amountUSD) || 0), 0);
    const diff = planModalDebt
      ? Math.max(0, round2(planModalDebt.remainingAmountUSD - pendingSum))
      : 0;
    const updated = [
      ...planInstallments,
      {
        id: `inst-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        number: planInstallments.length + 1,
        dueDate: nextDate,
        amountUSD: diff > 0 ? diff : 0,
        status: 'PENDIENTE' as const,
      },
    ];
    setPlanInstallments(updated);
    setPlanCount(String(updated.filter((i) => i.status === 'PENDIENTE').length));
    setPlanStrategy('FLEXIBLE');
  };

  const handleRemoveInstallment = (instId: string) => {
    setPlanInstallments((prev) => {
      const next = prev
        .filter((i) => i.id !== instId)
        .map((inst, idx) => ({ ...inst, number: idx + 1 }));
      setPlanCount(String(Math.max(1, next.filter((i) => i.status === 'PENDIENTE').length)));
      return next;
    });
    setPlanStrategy('FLEXIBLE');
  };

  const handleBalanceLastInstallment = () => {
    if (!planModalDebt) return;
    const pendingIndices: number[] = [];
    planInstallments.forEach((inst, idx) => {
      if (inst.status === 'PENDIENTE') pendingIndices.push(idx);
    });
    if (pendingIndices.length === 0) return;
    const lastPendingIdx = pendingIndices[pendingIndices.length - 1];
    const otherPendingSum = planInstallments.reduce((sum, inst, idx) => {
      if (inst.status === 'PENDIENTE' && idx !== lastPendingIdx) {
        return sum + (Number(inst.amountUSD) || 0);
      }
      return sum;
    }, 0);
    const adjusted = Math.max(0, round2(planModalDebt.remainingAmountUSD - otherPendingSum));
    setPlanInstallments((prev) =>
      prev.map((inst, idx) => (idx === lastPendingIdx ? { ...inst, amountUSD: adjusted } : inst))
    );
  };

  const handleSavePlan = (e: React.FormEvent) => {
    e.preventDefault();
    if (!planModalDebt) return;
    if (planInstallments.length === 0) {
      showBanner('error', 'Agrega o genera al menos una cuota para guardar el plan de pago.');
      return;
    }

    const prefAcc = treasuryAccounts.find((a) => a.id === planPreferredAccountId);
    const rateNum = parseFloat(planAppliedRate);
    const parsedInstAmount = parseFloat(planInstallmentAmount);
    const sortedDates = [...planInstallments]
      .map((i) => i.dueDate)
      .filter(Boolean)
      .sort();
    const estimatedEndDate = sortedDates[sortedDates.length - 1] || planStartDate || todayStr;
    const dayOpts = getCurrentDayOpts();

    const plan: DebtPaymentPlan = {
      strategy: planFrequency === 'UNICO' ? 'PAGO_UNICO' : planStrategy,
      frequency: planFrequency,
      installmentsCount: planInstallments.length,
      installmentAmountUSD:
        !Number.isNaN(parsedInstAmount) && parsedInstAmount > 0
          ? round2(parsedInstAmount)
          : undefined,
      calculationMode: planCalcMode,
      startDate: planStartDate || todayStr,
      estimatedEndDate,
      paymentWeekdays: planFrequency === 'SEMANAL' ? dayOpts.paymentWeekdays : undefined,
      biweeklyMode: planFrequency === 'QUINCENAL' ? dayOpts.biweeklyMode : undefined,
      biweeklyDays:
        planFrequency === 'QUINCENAL' && dayOpts.biweeklyMode === 'FIXED_DAYS'
          ? dayOpts.biweeklyDays
          : undefined,
      monthlyDay: planFrequency === 'MENSUAL' ? dayOpts.monthlyDay : undefined,
      preferredAccountId: prefAcc?.id,
      preferredAccountName: prefAcc?.name,
      paymentCurrency: planCurrency,
      exchangeRateType: planCurrency === 'BS' ? planRateType : undefined,
      appliedExchangeRate:
        planCurrency === 'BS' && !Number.isNaN(rateNum) && rateNum > 0 ? rateNum : undefined,
      installments: planInstallments,
      notes: planNotes.trim() || undefined,
      updatedAt: new Date().toISOString(),
    };

    saveDebtPaymentPlan(planModalDebt.id, plan);
    setExpandedDebtId(planModalDebt.id);
    setPlanModalDebt(null);
    showBanner(
      'success',
      `Plan de pago guardado para "${planModalDebt.title}" (${plan.installments.length} cuota${plan.installments.length === 1 ? '' : 's'} · Terminarías de pagar el ${formatPrettyDateES(estimatedEndDate)}).`
    );
  };

  // --- Handlers: Modal 3 (Record Payment / Abono) ---
  const openPayModal = (debt: TreasuryDebt, specificInstallmentId?: string) => {
    setPayModalDebt(debt);
    const pendingInstallments = (debt.paymentPlan?.installments || []).filter(
      (i) => i.status === 'PENDIENTE'
    );
    const chosenInst = specificInstallmentId
      ? pendingInstallments.find((i) => i.id === specificInstallmentId)
      : pendingInstallments[0];

    setPayInstallmentId(chosenInst?.id || '');
    const defaultAccId =
      debt.paymentPlan?.preferredAccountId &&
      treasuryAccounts.some((a) => a.id === debt.paymentPlan?.preferredAccountId)
        ? debt.paymentPlan.preferredAccountId
        : treasuryAccounts[0]?.id || '';
    const defaultAcc = treasuryAccounts.find((a) => a.id === defaultAccId);
    setPayAccountId(defaultAccId);
    setPayDate(todayStr);

    const effectiveRate =
      debt.paymentPlan?.paymentCurrency === 'BS' && Number(debt.paymentPlan?.appliedExchangeRate) > 0
        ? Number(debt.paymentPlan.appliedExchangeRate)
        : bcvRate;
    setPayRate(String(effectiveRate));

    const targetUSD = chosenInst ? chosenInst.amountUSD : debt.remainingAmountUSD;
    const isBsAcc = defaultAcc?.currency === 'BS' || debt.paymentPlan?.paymentCurrency === 'BS';
    if (defaultAcc?.currency === 'BS') {
      setPayInputCurrency('BS');
      setPayAmountInput(String(Math.round(targetUSD * effectiveRate * 100) / 100));
    } else if (defaultAcc?.currency === 'USDT') {
      setPayInputCurrency('USDT');
      setPayAmountInput(String(targetUSD));
    } else {
      setPayInputCurrency(isBsAcc ? 'BS' : 'USD');
      setPayAmountInput(
        isBsAcc ? String(Math.round(targetUSD * effectiveRate * 100) / 100) : String(targetUSD)
      );
    }

    setPayReference('');
    setPayNotes('');
    setPaySyncToExpense(false);
  };

  const handlePayInstallmentSelect = (instId: string) => {
    setPayInstallmentId(instId);
    if (!payModalDebt) return;
    const inst = payModalDebt.paymentPlan?.installments.find((i) => i.id === instId);
    const targetUSD = inst ? inst.amountUSD : payModalDebt.remainingAmountUSD;
    const rateNum = parseFloat(payRate) || bcvRate;
    if (payInputCurrency === 'BS') {
      setPayAmountInput(String(Math.round(targetUSD * rateNum * 100) / 100));
    } else {
      setPayAmountInput(String(targetUSD));
    }
  };

  const handlePayAccountChange = (newAccId: string) => {
    setPayAccountId(newAccId);
    const acc = treasuryAccounts.find((a) => a.id === newAccId);
    if (!acc || !payModalDebt) return;
    const inst = payModalDebt.paymentPlan?.installments.find((i) => i.id === payInstallmentId);
    const targetUSD = inst ? inst.amountUSD : payModalDebt.remainingAmountUSD;
    const rateNum = parseFloat(payRate) || bcvRate;
    setPayInputCurrency(acc.currency);
    if (acc.currency === 'BS') {
      setPayAmountInput(String(Math.round(targetUSD * rateNum * 100) / 100));
    } else {
      setPayAmountInput(String(targetUSD));
    }
  };

  const handleConfirmDebtPayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payModalDebt) return;
    if (!payAccountId) {
      showBanner('error', 'Selecciona la cuenta de tesorería desde la cual realizarás el pago.');
      return;
    }
    const amt = parseFloat(payAmountInput);
    if (Number.isNaN(amt) || amt <= 0) {
      showBanner('error', 'Ingresa un monto válido mayor a cero.');
      return;
    }
    const rateNum = parseFloat(payRate) || bcvRate;
    const result = recordDebtPayment(payModalDebt.id, {
      date: payDate || todayStr,
      amountInput: amt,
      inputCurrency: payInputCurrency,
      bcvRate: rateNum,
      accountId: payAccountId,
      installmentId: payInstallmentId || undefined,
      reference: payReference.trim() || undefined,
      notes: payNotes.trim() || undefined,
      syncToExpense: paySyncToExpense,
    });

    if (!result) {
      showBanner('error', 'No se pudo registrar el abono. Verifica la cuenta y el monto.');
      return;
    }

    setPayModalDebt(null);
    const paidOffMsg =
      result.debt.status === 'PAGADA'
        ? ` ¡Deuda "${result.debt.title}" liquidada al 100%!`
        : ` Saldo restante: ${formatUSD(result.debt.remainingAmountUSD)}.`;
    showBanner(
      'success',
      `Abono de ${formatUSD(result.payment.amountUSD)} descontado de ${result.account.name}.${paidOffMsg}`
    );
  };

  // --- Handlers: Modal 4 (Category Editor) ---
  const handleAddNewCategory = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const res = addDebtCategory(trimmed);
    setNewCategoryName('');
    if (res.added) {
      showBanner('success', `Categoría "${res.category}" agregada.`);
    } else {
      showBanner('info', `La categoría "${res.category}" ya existe.`);
    }
  };

  const handleConfirmRenameCategory = (oldName: string) => {
    const trimmed = renameValue.trim();
    if (!trimmed || trimmed.toLowerCase() === oldName.toLowerCase()) {
      setRenamingCategory(null);
      return;
    }
    const res = renameDebtCategory(oldName, trimmed);
    setRenamingCategory(null);
    if (res.renamed) {
      if (categoryFilter.toLowerCase() === oldName.toLowerCase() && res.newCategory) {
        setCategoryFilter(res.newCategory);
      }
      showBanner(
        'success',
        `Categoría actualizada a "${res.newCategory}"${
          res.updatedCount > 0 ? ` (${res.updatedCount} deuda${res.updatedCount === 1 ? '' : 's'} actualizada${res.updatedCount === 1 ? '' : 's'}).` : '.'
        }`
      );
    }
  };

  // Computed preview values inside Planner Modal
  const plannerSummary = useMemo(() => {
    if (!planModalDebt) return null;
    const pendingList = planInstallments
      .filter((i) => i.status === 'PENDIENTE')
      .sort((a, b) => a.dueDate.localeCompare(b.dueDate));
    const pendingSum = round2(
      pendingList.reduce((sum, i) => sum + (Number(i.amountUSD) || 0), 0)
    );
    const diff = round2(planModalDebt.remainingAmountUSD - pendingSum);
    const firstPending = pendingList[0];
    const lastPending = pendingList[pendingList.length - 1];
    const avgInstallment =
      pendingList.length > 0 ? round2(pendingSum / pendingList.length) : 0;
    const firstAmount = firstPending ? round2(Number(firstPending.amountUSD) || 0) : 0;
    const lastAmount = lastPending ? round2(Number(lastPending.amountUSD) || 0) : 0;
    const hasPartialLast =
      pendingList.length > 1 && Math.abs(firstAmount - lastAmount) > 0.02;
    const firstDate = firstPending?.dueDate || planStartDate || todayStr;
    const estimatedEndDate = lastPending?.dueDate || firstDate;
    const durationLabel = formatDurationBetweenES(firstDate, estimatedEndDate);
    const fitsFreeBalance = projectedFreeBalanceUSD >= firstAmount && firstAmount > 0;
    const fitsLiquidity = totalLiquidityUSD >= firstAmount && firstAmount > 0;

    return {
      pendingCount: pendingList.length,
      pendingSum,
      diff,
      avgInstallment,
      firstAmount,
      lastAmount,
      hasPartialLast,
      firstDate,
      estimatedEndDate,
      durationLabel,
      fitsFreeBalance,
      fitsLiquidity,
    };
  }, [planModalDebt, planInstallments, planStartDate, todayStr, projectedFreeBalanceUSD, totalLiquidityUSD]);

  // Computed preview values inside Pay Modal
  const payPreview = useMemo(() => {
    const acc = enrichedAccounts.find((a) => a.id === payAccountId);
    const raw = parseFloat(payAmountInput) || 0;
    const rateNum = parseFloat(payRate) || bcvRate;
    const usd =
      payInputCurrency === 'BS'
        ? Math.round((raw / rateNum) * 100) / 100
        : Math.round(raw * 100) / 100;
    const bs =
      payInputCurrency === 'BS'
        ? Math.round(raw * 100) / 100
        : Math.round(usd * rateNum * 100) / 100;
    const afterAccountUSD = acc ? Math.round((acc.liveUSD - usd) * 100) / 100 : 0;
    const afterDebtUSD = payModalDebt
      ? Math.round(Math.max(0, payModalDebt.remainingAmountUSD - usd) * 100) / 100
      : 0;
    return { acc, usd, bs, afterAccountUSD, afterDebtUSD };
  }, [enrichedAccounts, payAccountId, payAmountInput, payInputCurrency, payRate, bcvRate, payModalDebt]);

  return (
    <>
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        {/* Header & Primary Tools */}
        <div className="p-4 sm:p-5 border-b border-slate-200 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div className="min-w-0">
              <h2 className="text-base font-bold text-slate-900">
                Deudas y Planificación de Pago
              </h2>
              <p className="text-xs text-slate-500">
                Controla tus deudas por categoría editable, diseña planes de cuotas y registra abonos conectados a tu liquidez
              </p>
            </div>
            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={handleOpenPlannerFromHeader}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-emerald-200 bg-emerald-50 hover:bg-emerald-100 text-xs font-bold text-emerald-800 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Calculator className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                Planificar Pago
              </button>
              <button
                type="button"
                onClick={() => setCategoryModalOpen(true)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Tag className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                Editar Categorías
              </button>
              <button
                type="button"
                onClick={openNewDebtModal}
                className="inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                Nueva Deuda
              </button>
            </div>
          </div>

          {/* Compact 4-Metric Summary Strip */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Deuda Pendiente Total
              </p>
              <p className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                {formatUSD(totalPendingDebtsUSD)}
              </p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                {formatBs(totalPendingDebtsBs)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Total Abonado
              </p>
              <p className="text-lg font-bold text-emerald-700 font-mono tabular-nums mt-0.5">
                {formatUSD(debtStats.totalPaidUSD)}
              </p>
              <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                {debtStats.paidPct}% amortizado de {formatUSD(debtStats.totalOriginalUSD)}
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Estado de Cartera
              </p>
              <p className="text-lg font-bold text-slate-900 font-mono tabular-nums mt-0.5">
                {debtStats.activeCount + debtStats.plannedCount}{' '}
                <span className="text-xs font-sans font-semibold text-slate-500">activas</span>
              </p>
              <p className="text-[11px] text-slate-500">
                {debtStats.plannedCount} con plan · {debtStats.paidCount} pagadas
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 bg-slate-50/70 px-3.5 py-2.5">
              <p className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider">
                Próximo Pago Planificado
              </p>
              {debtStats.nextDue ? (
                <>
                  <p className="text-lg font-bold text-amber-700 font-mono tabular-nums mt-0.5">
                    {formatUSD(debtStats.nextDue.amountUSD)}
                  </p>
                  <p className="text-[11px] text-slate-600 truncate">
                    {debtStats.nextDue.dueDate} · {debtStats.nextDue.debtTitle}
                  </p>
                </>
              ) : (
                <>
                  <p className="text-sm font-semibold text-slate-500 mt-1.5">Sin cuotas próximas</p>
                  <p className="text-[11px] text-slate-400">Planifica tus deudas activas</p>
                </>
              )}
            </div>
          </div>

          {/* Category Filter + Status Filter + Search */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  categoryFilter === 'ALL'
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todas ({treasuryDebts.length})
              </button>
              {debtCategories.map((cat) => {
                const count = categoryUsageCounts.get(cat.toLowerCase()) || 0;
                const active = categoryFilter.toLowerCase() === cat.toLowerCase();
                if (count === 0 && !active) return null;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setCategoryFilter(cat)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      active
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {cat} ({count})
                  </button>
                );
              })}
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Buscar deuda o acreedor..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 text-xs text-slate-800 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 w-48"
                />
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                {(
                  [
                    { id: 'ALL', label: 'Todas' },
                    { id: 'PENDING', label: 'Pendientes' },
                    { id: 'EN_PLAN', label: 'Con Plan' },
                    { id: 'PAGADA', label: 'Pagadas' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setStatusFilter(st.id)}
                    className={`px-2 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      statusFilter === st.id
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    {st.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {/* Debt Rows List (Zero Horizontal Scroll) */}
        {filteredDebts.length === 0 ? (
          <div className="py-10 px-5 text-center space-y-3">
            <div className="w-10 h-10 rounded-xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <Receipt className="w-5 h-5" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                {treasuryDebts.length === 0
                  ? 'No tienes deudas registradas'
                  : 'No hay deudas que coincidan con los filtros'}
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Registra préstamos, saldos a proveedores, socios o compromisos atrasados, edita sus categorías y diseña un plan de cuotas para pagarlos sin afectar tu flujo de caja.
              </p>
            </div>
            {treasuryDebts.length === 0 && (
              <button
                type="button"
                onClick={openNewDebtModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                Registrar primera deuda
              </button>
            )}
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {filteredDebts.map((debt) => {
              const isPaid = debt.status === 'PAGADA' || debt.remainingAmountUSD <= 0.009;
              const paidPct =
                debt.totalAmountUSD > 0
                  ? Math.min(100, Math.round((debt.paidAmountUSD / debt.totalAmountUSD) * 100))
                  : 0;
              const prio = PRIORITY_META[debt.priority] || PRIORITY_META.MEDIA;
              const plan = debt.paymentPlan;
              const totalInstallments = plan?.installments?.length || 0;
              const paidInstallments =
                plan?.installments?.filter((i) => i.status === 'PAGADA').length || 0;
              const nextInstallment = plan?.installments
                ?.filter((i) => i.status === 'PENDIENTE')
                .sort((a, b) => a.dueDate.localeCompare(b.dueDate))[0];
              const isOverdue =
                !isPaid &&
                Boolean(
                  (nextInstallment && nextInstallment.dueDate < todayStr) ||
                    (!nextInstallment && debt.dueDate && debt.dueDate < todayStr)
                );
              const isExpanded = expandedDebtId === debt.id;

              return (
                <div
                  key={debt.id}
                  className={`p-4 sm:px-5 transition-colors ${
                    isPaid ? 'bg-slate-50/50' : 'hover:bg-slate-50/70'
                  }`}
                >
                  <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-3.5">
                    {/* Left Content */}
                    <div className="min-w-0 flex-1 space-y-2">
                      {/* Title + Code + Status + Priority */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                        <span className="font-mono text-[11px] font-semibold text-slate-400">
                          {debt.debtNumber}
                        </span>
                        <h3
                          className={`text-sm font-bold truncate ${
                            isPaid ? 'text-slate-500 line-through' : 'text-slate-900'
                          }`}
                        >
                          {debt.title}
                        </h3>
                        <span className="text-slate-300">·</span>
                        {isPaid ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700">
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            Pagada
                          </span>
                        ) : isOverdue ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700">
                            <AlertTriangle className="w-3.5 h-3.5" />
                            Cuota vencida
                          </span>
                        ) : plan && totalInstallments > 0 ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-blue-700">
                            <CalendarClock className="w-3.5 h-3.5" />
                            En Plan ({paidInstallments}/{totalInstallments})
                          </span>
                        ) : (
                          <span className="text-[11px] font-semibold text-amber-700">
                            Sin plan de pago
                          </span>
                        )}
                        {!isPaid && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className={`inline-flex items-center gap-1.5 text-[11px] font-semibold ${prio.textClass}`}>
                              <span className={`w-1.5 h-1.5 rounded-full ${prio.dotClass}`} />
                              {prio.label}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Metadata Row: Creditor + Inline Editable Category Selector + Due Date */}
                      <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1.5 text-xs text-slate-600">
                        <span>
                          Acreedor: <strong className="font-semibold text-slate-800">{debt.creditor}</strong>
                        </span>
                        <span className="text-slate-300">·</span>

                        {/* Inline Category Quick-Editor */}
                        <div className="inline-flex items-center gap-1">
                          <Tag className="w-3 h-3 text-slate-400 shrink-0" />
                          <select
                            aria-label={`Categoría de ${debt.title}`}
                            value={debt.category}
                            onChange={(e) => {
                              const nextCat = e.target.value;
                              if (nextCat === '__MANAGE__') {
                                setCategoryModalOpen(true);
                                return;
                              }
                              updateTreasuryDebt(debt.id, { category: nextCat });
                              showBanner('info', `Categoría cambiada a "${nextCat}".`);
                            }}
                            className="bg-slate-100 hover:bg-slate-200/80 text-slate-800 font-semibold text-[11px] rounded-md px-2 py-0.5 border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/10 cursor-pointer"
                            title="Cambiar categoría rápidamente"
                          >
                            {debtCategories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                            <option value="__MANAGE__">✎ Editar / crear categorías...</option>
                          </select>
                        </div>

                        {debt.dueDate && (
                          <>
                            <span className="text-slate-300">·</span>
                            <span className="font-mono text-[11px] text-slate-500">
                              Límite: {debt.dueDate}
                            </span>
                          </>
                        )}
                      </div>

                      {/* Progress Bar */}
                      <div className="max-w-lg space-y-1 pt-0.5">
                        <div className="flex items-center justify-between text-[11px]">
                          <span className="text-slate-500">
                            Abonado:{' '}
                            <strong className="font-mono text-slate-800 tabular-nums">
                              {formatUSD(debt.paidAmountUSD)}
                            </strong>{' '}
                            de{' '}
                            <span className="font-mono tabular-nums">
                              {formatUSD(debt.totalAmountUSD)}
                            </span>
                          </span>
                          <span className="font-mono font-bold text-slate-700 tabular-nums">
                            {paidPct}%
                          </span>
                        </div>
                        <div className="h-1.5 w-full rounded-full bg-slate-100 overflow-hidden">
                          <div
                            style={{ width: `${paidPct}%` }}
                            className={`h-full rounded-full transition-all duration-300 ${
                              isPaid ? 'bg-emerald-600' : 'bg-slate-900'
                            }`}
                          />
                        </div>
                      </div>

                      {/* Active Plan Summary Line */}
                      {plan && totalInstallments > 0 && (
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[11px] text-slate-600 pt-0.5">
                          <span className="font-semibold text-slate-800">
                            Plan {FREQUENCY_LABELS[plan.frequency]} ({totalInstallments} cuota{totalInstallments === 1 ? '' : 's'})
                          </span>
                          {nextInstallment && !isPaid && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span
                                className={
                                  nextInstallment.dueDate < todayStr
                                    ? 'text-rose-700 font-semibold'
                                    : 'text-slate-700'
                                }
                              >
                                Próxima #{nextInstallment.number}:{' '}
                                <strong className="font-mono tabular-nums">
                                  {formatUSD(nextInstallment.amountUSD)}
                                </strong>{' '}
                                el <span className="font-mono">{nextInstallment.dueDate}</span>
                              </span>
                            </>
                          )}
                          {(plan.estimatedEndDate || plan.installments[plan.installments.length - 1]?.dueDate) && !isPaid && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span className="font-semibold text-emerald-700">
                                Terminas el{' '}
                                <span className="font-mono">
                                  {formatPrettyDateES(
                                    plan.estimatedEndDate ||
                                      plan.installments[plan.installments.length - 1]?.dueDate
                                  )}
                                </span>
                              </span>
                            </>
                          )}
                          {plan.preferredAccountName && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span>Cuenta: {plan.preferredAccountName}</span>
                            </>
                          )}
                          {plan.paymentCurrency === 'BS' && (
                            <>
                              <span className="text-slate-300">·</span>
                              <span>
                                En Bs ({plan.exchangeRateType || 'BCV'}
                                {plan.appliedExchangeRate ? ` ${plan.appliedExchangeRate}` : ''})
                              </span>
                            </>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Right Content: Balance + Always-Visible Actions */}
                    <div className="flex flex-col sm:flex-row lg:flex-col items-start sm:items-center lg:items-end justify-between gap-2.5 shrink-0">
                      <div className="text-left lg:text-right">
                        <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                          {isPaid ? 'Saldo Liquidado' : 'Saldo Pendiente'}
                        </p>
                        <p
                          className={`text-base font-bold font-mono tabular-nums ${
                            isPaid ? 'text-emerald-700' : 'text-slate-900'
                          }`}
                        >
                          {formatUSD(debt.remainingAmountUSD)}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {formatBs(debt.remainingAmountUSD * bcvRate)}
                        </p>
                      </div>

                      {/* Compact Action Bar */}
                      <div className="flex flex-wrap items-center gap-1.5">
                        {!isPaid && (
                          <button
                            type="button"
                            onClick={() => openPlannerModal(debt)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <SlidersHorizontal className="w-3.5 h-3.5 text-amber-400" />
                            {plan && totalInstallments > 0 ? 'Editar Plan' : 'Planificar Pago'}
                          </button>
                        )}
                        {!isPaid && (
                          <button
                            type="button"
                            onClick={() => openPayModal(debt)}
                            className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap"
                          >
                            <Wallet className="w-3.5 h-3.5" />
                            Abonar
                          </button>
                        )}

                        {(totalInstallments > 0 || (debt.payments && debt.payments.length > 0)) && (
                          <button
                            type="button"
                            onClick={() => setExpandedDebtId(isExpanded ? null : debt.id)}
                            className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-slate-200 hover:bg-slate-100 text-xs font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
                            title="Ver cronograma de cuotas e historial de abonos"
                          >
                            <History className="w-3.5 h-3.5 text-slate-500" />
                            Detalle
                            {isExpanded ? (
                              <ChevronUp className="w-3.5 h-3.5" />
                            ) : (
                              <ChevronDown className="w-3.5 h-3.5" />
                            )}
                          </button>
                        )}

                        <button
                          type="button"
                          onClick={() => openEditDebtModal(debt)}
                          className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                          title="Editar deuda y categoría"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>

                        {confirmDeleteId === debt.id ? (
                          <div className="inline-flex items-center gap-1 bg-rose-50 border border-rose-200 rounded-lg px-2 py-1">
                            <span className="text-[11px] font-semibold text-rose-700">¿Eliminar?</span>
                            <button
                              type="button"
                              onClick={() => {
                                deleteTreasuryDebt(debt.id);
                                setConfirmDeleteId(null);
                                showBanner('info', `Deuda "${debt.title}" eliminada.`);
                              }}
                              className="px-1.5 py-0.5 rounded bg-rose-600 text-white text-[10px] font-bold hover:bg-rose-700 cursor-pointer"
                            >
                              Sí
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteId(null)}
                              className="px-1.5 py-0.5 rounded bg-white border border-slate-200 text-slate-600 text-[10px] font-semibold hover:bg-slate-50 cursor-pointer"
                            >
                              No
                            </button>
                          </div>
                        ) : (
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteId(debt.id)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-400 hover:text-rose-600 hover:border-rose-200 hover:bg-rose-50 cursor-pointer"
                            title="Eliminar deuda"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </div>
                  </div>

                  {/* Expanded Drawer: Installments Schedule + Payment History */}
                  {isExpanded && (
                    <div className="mt-4 pt-4 border-t border-slate-100 grid grid-cols-1 lg:grid-cols-2 gap-4">
                      {/* Left: Planned Installments */}
                      <div className="space-y-2">
                        <div className="flex items-center justify-between">
                          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                            Cronograma de Cuotas ({paidInstallments}/{totalInstallments})
                          </p>
                          {!isPaid && (
                            <button
                              type="button"
                              onClick={() => openPlannerModal(debt)}
                              className="text-[11px] font-semibold text-slate-700 hover:text-slate-900 underline cursor-pointer"
                            >
                              Ajustar plan
                            </button>
                          )}
                        </div>
                        {totalInstallments === 0 ? (
                          <p className="text-xs text-slate-400 py-2">
                            Aún no has creado un cronograma de cuotas para esta deuda.
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
                            {plan!.installments.map((inst) => {
                              const instPaid = inst.status === 'PAGADA';
                              const instOverdue = !instPaid && inst.dueDate < todayStr;
                              const instRate =
                                plan?.paymentCurrency === 'BS' && plan.appliedExchangeRate
                                  ? plan.appliedExchangeRate
                                  : bcvRate;
                              return (
                                <div
                                  key={inst.id}
                                  className={`px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-xs ${
                                    instPaid ? 'bg-slate-50/70' : ''
                                  }`}
                                >
                                  <div className="flex items-center gap-2 min-w-0">
                                    <span className="font-mono font-bold text-slate-500 text-[11px]">
                                      #{inst.number}
                                    </span>
                                    <span
                                      className={`font-mono text-[11px] ${
                                        instOverdue
                                          ? 'text-rose-700 font-bold'
                                          : instPaid
                                            ? 'text-slate-400 line-through'
                                            : 'text-slate-700'
                                      }`}
                                    >
                                      {inst.dueDate}
                                    </span>
                                    {instPaid ? (
                                      <span className="text-[11px] font-semibold text-emerald-700">
                                        · Pagada
                                      </span>
                                    ) : instOverdue ? (
                                      <span className="text-[11px] font-semibold text-rose-600">
                                        · Vencida
                                      </span>
                                    ) : null}
                                  </div>

                                  <div className="flex items-center gap-2">
                                    <div className="text-right">
                                      <span className="font-mono font-bold text-slate-900 tabular-nums">
                                        {formatUSD(inst.amountUSD)}
                                      </span>
                                      {plan?.paymentCurrency === 'BS' && (
                                        <span className="ml-1.5 font-mono text-[10px] text-slate-500 tabular-nums">
                                          ({formatBs(inst.amountUSD * instRate)})
                                        </span>
                                      )}
                                    </div>

                                    {!instPaid && !isPaid && (
                                      <div className="flex items-center gap-1">
                                        {inst.linkedCommitmentId ? (
                                          <span
                                            className="text-[10px] font-semibold text-blue-700 px-1.5 py-0.5 bg-blue-50 rounded"
                                            title="Ya agendada en Planificación de Pagos y Gastos Fijos"
                                          >
                                            Agendada
                                          </span>
                                        ) : (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              const cm = scheduleDebtInstallmentToCommitments(
                                                debt.id,
                                                inst.id
                                              );
                                              if (cm) {
                                                showBanner(
                                                  'success',
                                                  `Cuota #${inst.number} enviada a Planificación de Pagos y Gastos Fijos.`
                                                );
                                              }
                                            }}
                                            className="p-1 rounded-md border border-slate-200 text-slate-500 hover:text-blue-700 hover:border-blue-200 hover:bg-blue-50 cursor-pointer"
                                            title="Enviar esta cuota a Planificación de Pagos y Gastos Fijos"
                                          >
                                            <CalendarPlus className="w-3.5 h-3.5" />
                                          </button>
                                        )}
                                        <button
                                          type="button"
                                          onClick={() => openPayModal(debt, inst.id)}
                                          className="px-2 py-0.5 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-semibold cursor-pointer"
                                        >
                                          Pagar
                                        </button>
                                      </div>
                                    )}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        )}
                      </div>

                      {/* Right: Payment History */}
                      <div className="space-y-2">
                        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                          Historial de Abonos ({debt.payments?.length || 0})
                        </p>
                        {!debt.payments || debt.payments.length === 0 ? (
                          <p className="text-xs text-slate-400 py-2">
                            Aún no se han registrado abonos para esta deuda.
                          </p>
                        ) : (
                          <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 bg-white overflow-hidden">
                            {debt.payments.map((pay) => (
                              <div
                                key={pay.id}
                                className="px-3 py-2 flex items-center justify-between gap-2 text-xs"
                              >
                                <div className="min-w-0">
                                  <p className="font-semibold text-slate-800 truncate">
                                    {pay.installmentNumber
                                      ? `Cuota #${pay.installmentNumber}`
                                      : 'Abono directo'}{' '}
                                    · <span className="font-normal text-slate-600">{pay.accountName}</span>
                                  </p>
                                  <p className="text-[11px] text-slate-400 font-mono">
                                    {pay.date}
                                    {pay.reference ? ` · Ref: ${pay.reference}` : ''}
                                  </p>
                                </div>
                                <div className="text-right shrink-0">
                                  <p className="font-mono font-bold text-emerald-700 tabular-nums">
                                    {formatUSD(pay.amountUSD)}
                                  </p>
                                  <p className="font-mono text-[10px] text-slate-400 tabular-nums">
                                    {formatBs(pay.amountBs)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                        {debt.notes && (
                          <p className="text-[11px] text-slate-500 pt-1">
                            <strong className="text-slate-700">Notas:</strong> {debt.notes}
                          </p>
                        )}
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* =================================================================== */}
      {/* MODAL 1: NUEVA / EDITAR DEUDA                                       */}
      {/* =================================================================== */}
      {debtModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  {editingDebtId ? 'Editar Deuda' : 'Registrar Nueva Deuda'}
                </h3>
                <p className="text-xs text-slate-500">
                  Asigna una categoría editable y define el monto total a cancelar
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDebtModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveDebt} className="p-5 space-y-4">
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Concepto de la Deuda *
                  </label>
                  <input
                    type="text"
                    required
                    value={debtTitle}
                    onChange={(e) => setDebtTitle(e.target.value)}
                    placeholder="Ej: Préstamo capital de trabajo, Compra lote cauchos..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Acreedor (a quién se debe) *
                  </label>
                  <input
                    type="text"
                    required
                    value={debtCreditor}
                    onChange={(e) => setDebtCreditor(e.target.value)}
                    placeholder="Ej: Banco Banesco, Distribuidora X..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Prioridad
                  </label>
                  <select
                    value={debtPriority}
                    onChange={(e) => setDebtPriority(e.target.value as DebtPriority)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                  >
                    <option value="ALTA">Alta (urgente)</option>
                    <option value="MEDIA">Media (normal)</option>
                    <option value="BAJA">Baja (flexible)</option>
                  </select>
                </div>

                {/* Editable Category Selector */}
                <div className="sm:col-span-2 space-y-1.5">
                  <div className="flex items-center justify-between">
                    <label className="block text-xs font-semibold text-slate-700">
                      Categoría de la Deuda *
                    </label>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setShowInlineNewCat((v) => !v)}
                        className="text-[11px] font-semibold text-blue-600 hover:text-blue-800 cursor-pointer"
                      >
                        {showInlineNewCat ? 'Usar existente' : '+ Nueva categoría'}
                      </button>
                      <span className="text-slate-300">|</span>
                      <button
                        type="button"
                        onClick={() => setCategoryModalOpen(true)}
                        className="text-[11px] font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                      >
                        Editar lista
                      </button>
                    </div>
                  </div>
                  {showInlineNewCat ? (
                    <input
                      type="text"
                      value={debtNewCategoryInline}
                      onChange={(e) => setDebtNewCategoryInline(e.target.value)}
                      placeholder="Escribe el nombre de la nueva categoría..."
                      className="w-full px-3 py-2 rounded-xl border border-blue-300 bg-blue-50/40 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500/20"
                    />
                  ) : (
                    <select
                      value={debtCategory}
                      onChange={(e) => setDebtCategory(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                    >
                      {debtCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  )}
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Monto Total de la Deuda (USD) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={debtTotalUSD}
                    onChange={(e) => setDebtTotalUSD(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                  />
                  {parseFloat(debtTotalUSD) > 0 && (
                    <p className="text-[11px] text-slate-400 font-mono mt-1">
                      ≈ {formatBs(parseFloat(debtTotalUSD) * bcvRate)} (BCV)
                    </p>
                  )}
                </div>

                {!editingDebtId ? (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Ya Abonado Previamente (USD)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={debtInitialPaidUSD}
                      onChange={(e) => setDebtInitialPaidUSD(e.target.value)}
                      placeholder="0.00"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono tabular-nums focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                    />
                  </div>
                ) : (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Fecha Límite Objetivo
                    </label>
                    <input
                      type="date"
                      value={debtDueDate}
                      onChange={(e) => setDebtDueDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                    />
                  </div>
                )}

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha de Registro / Inicio
                  </label>
                  <input
                    type="date"
                    value={debtStartDate}
                    onChange={(e) => setDebtStartDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                  />
                </div>

                {!editingDebtId && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Fecha Límite Estimada (opcional)
                    </label>
                    <input
                      type="date"
                      value={debtDueDate}
                      onChange={(e) => setDebtDueDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400"
                    />
                  </div>
                )}

                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notas / Condiciones acordadas
                  </label>
                  <textarea
                    rows={2}
                    value={debtNotes}
                    onChange={(e) => setDebtNotes(e.target.value)}
                    placeholder="Ej: Sin intereses si se cancela en 3 cuotas quincenales..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm focus:outline-none focus:ring-2 focus:ring-slate-900/10 focus:border-slate-400 resize-none"
                  />
                </div>
              </div>

              {!editingDebtId && (
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={openPlanAfterCreate}
                    onChange={(e) => setOpenPlanAfterCreate(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-xs font-semibold text-slate-700">
                    Abrir el Planificador de Pago inmediatamente después de guardar
                  </span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setDebtModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-amber-400" />
                  {editingDebtId ? 'Guardar Cambios' : 'Registrar Deuda'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 2: PLANIFICADOR DE PAGO DE DEUDA                              */}
      {/* =================================================================== */}
      {planModalDebt && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-2xl max-h-[92vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 truncate">
                  Planificador de Pagos de Deudas
                </h3>
                <p className="text-xs text-slate-500">
                  Elige la deuda, frecuencia, monto por cuota y días de pago para calcular cuántas cuotas son y cuándo terminas
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPlanModalDebt(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSavePlan} className="p-5 space-y-5 overflow-y-auto flex-1">
              {/* Step 1: Debt Selector + Balance Strip */}
              <div className="space-y-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    1. Selecciona la Deuda a Planificar
                  </label>
                  <select
                    value={planModalDebt.id}
                    onChange={(e) => handleSwitchPlannerDebt(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-white text-xs font-semibold text-slate-900 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  >
                    {pendingDebtsList.map((d) => (
                      <option key={d.id} value={d.id}>
                        {d.debtNumber} · {d.title} ({d.creditor}) — Pendiente: {formatUSD(d.remainingAmountUSD)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Saldo Pendiente
                    </p>
                    <p className="text-base font-bold font-mono text-slate-900 tabular-nums">
                      {formatUSD(planModalDebt.remainingAmountUSD)}
                    </p>
                    <p className="text-[10px] text-slate-500 truncate">
                      {planModalDebt.category} · {planModalDebt.creditor}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Liquidez Disponible
                    </p>
                    <p className="text-base font-bold font-mono text-emerald-700 tabular-nums">
                      {formatUSD(totalLiquidityUSD)}
                    </p>
                  </div>
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                      Saldo Libre Proyectado
                    </p>
                    <p
                      className={`text-base font-bold font-mono tabular-nums ${
                        projectedFreeBalanceUSD >= 0 ? 'text-slate-900' : 'text-rose-600'
                      }`}
                    >
                      {formatUSD(projectedFreeBalanceUSD)}
                    </p>
                  </div>
                </div>
              </div>

              {/* Step 2: Frequency */}
              <div className="space-y-2">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  2. Frecuencia de las Cuotas
                </label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                  {(
                    [
                      { id: 'SEMANAL', title: 'Semanal', desc: 'Cada semana' },
                      { id: 'QUINCENAL', title: 'Quincenal', desc: 'Cada quincena' },
                      { id: 'MENSUAL', title: 'Mensual', desc: 'Una vez al mes' },
                      { id: 'UNICO', title: 'Pago Único', desc: 'Saldo completo' },
                    ] as const
                  ).map((opt) => (
                    <button
                      key={opt.id}
                      type="button"
                      onClick={() => handleSelectPlanFrequency(opt.id)}
                      className={`text-left px-3 py-2.5 rounded-xl border transition-colors cursor-pointer ${
                        planFrequency === opt.id
                          ? 'border-slate-900 bg-slate-900 text-white'
                          : 'border-slate-200 bg-white hover:bg-slate-50 text-slate-800'
                      }`}
                    >
                      <p className="text-xs font-bold">{opt.title}</p>
                      <p
                        className={`text-[10px] mt-0.5 ${
                          planFrequency === opt.id ? 'text-slate-300' : 'text-slate-500'
                        }`}
                      >
                        {opt.desc}
                      </p>
                    </button>
                  ))}
                </div>
              </div>

              {/* Step 3: Amount per Installment -> Auto Count */}
              {planFrequency !== 'UNICO' && (
                <div className="space-y-2.5 p-3.5 rounded-xl border border-slate-200 bg-slate-50/70">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                      3. Monto por Cuota y Cálculo Automático
                    </label>
                    <span className="text-[11px] font-medium text-slate-500">
                      {planCalcMode === 'BY_AMOUNT'
                        ? 'Calculando cuotas según tu monto'
                        : 'Calculando monto según N° de cuotas'}
                    </span>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700">
                          Monto por Cuota (USD) *
                        </label>
                        {planCalcMode === 'BY_COUNT' && (
                          <span className="text-[10px] font-semibold text-emerald-700">
                            Auto
                          </span>
                        )}
                      </div>
                      <div className="relative">
                        <span className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 font-mono text-xs">
                          $
                        </span>
                        <input
                          type="number"
                          step="any"
                          min="0.01"
                          value={planInstallmentAmount}
                          onChange={(e) => handleInstallmentAmountChange(e.target.value)}
                          placeholder="Ej: 50"
                          className={`w-full pl-7 pr-3 py-2 rounded-xl border text-sm font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15 ${
                            planCalcMode === 'BY_AMOUNT'
                              ? 'border-slate-900 text-slate-900'
                              : 'border-slate-200 text-slate-700'
                          }`}
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1">
                        <label className="text-xs font-semibold text-slate-700">
                          Número de Cuotas
                        </label>
                        {planCalcMode === 'BY_AMOUNT' && (
                          <span className="text-[10px] font-semibold text-emerald-700">
                            Automático
                          </span>
                        )}
                      </div>
                      <input
                        type="number"
                        min="1"
                        max={MAX_PLAN_INSTALLMENTS}
                        step="1"
                        value={planCount}
                        onChange={(e) => handleInstallmentCountChange(e.target.value)}
                        className={`w-full px-3 py-2 rounded-xl border text-sm font-mono font-bold bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15 ${
                          planCalcMode === 'BY_COUNT'
                            ? 'border-slate-900 text-slate-900'
                            : 'border-slate-200 text-slate-700'
                        }`}
                      />
                    </div>
                  </div>

                  {/* Quick amount buttons */}
                  <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                    <span className="text-[11px] text-slate-500 mr-1">Sugeridos:</span>
                    {[20, 25, 50, 100, 200]
                      .filter((amt) => amt < planModalDebt.remainingAmountUSD - 0.5)
                      .slice(0, 4)
                      .map((amt) => (
                        <button
                          key={amt}
                          type="button"
                          onClick={() => handleInstallmentAmountChange(String(amt))}
                          className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-mono font-semibold text-slate-700 cursor-pointer"
                        >
                          ${amt}/cuota
                        </button>
                      ))}
                    {[2, 4, 6].map((div) => {
                      const part = round2(planModalDebt.remainingAmountUSD / div);
                      return (
                        <button
                          key={div}
                          type="button"
                          onClick={() => handleInstallmentCountChange(String(div))}
                          className="px-2 py-1 rounded-lg border border-slate-200 bg-white hover:bg-slate-100 text-[11px] font-semibold text-slate-700 cursor-pointer"
                        >
                          {div} cuotas ({formatUSD(part)})
                        </button>
                      );
                    })}
                  </div>

                  {plannerSummary && plannerSummary.pendingCount > 0 && (
                    <p className="text-[11px] text-slate-600">
                      {plannerSummary.hasPartialLast ? (
                        <>
                          Resultado:{' '}
                          <strong className="text-slate-900">
                            {plannerSummary.pendingCount - 1} cuota
                            {plannerSummary.pendingCount - 1 === 1 ? '' : 's'} de{' '}
                            <span className="font-mono">{formatUSD(plannerSummary.firstAmount)}</span>
                          </strong>{' '}
                          +{' '}
                          <strong className="text-slate-900">
                            1 última cuota de{' '}
                            <span className="font-mono">{formatUSD(plannerSummary.lastAmount)}</span>
                          </strong>{' '}
                          (Total: {plannerSummary.pendingCount} cuotas).
                        </>
                      ) : (
                        <>
                          Resultado:{' '}
                          <strong className="text-slate-900">
                            {plannerSummary.pendingCount} cuota
                            {plannerSummary.pendingCount === 1 ? '' : 's'} de{' '}
                            <span className="font-mono">{formatUSD(plannerSummary.firstAmount)}</span>
                          </strong>
                          .
                        </>
                      )}
                    </p>
                  )}

                  {planCappedInfo.capped && (
                    <div className="flex items-start gap-1.5 text-[11px] text-amber-800 bg-amber-50 border border-amber-200 rounded-lg px-2.5 py-1.5">
                      <AlertTriangle className="w-3.5 h-3.5 shrink-0 mt-0.5" />
                      <span>
                        Con ese monto serían {planCappedInfo.rawCount} cuotas. El plan se limita a un máximo de {MAX_PLAN_INSTALLMENTS} cuotas (el saldo restante se consolida en la última cuota).
                      </span>
                    </div>
                  )}
                </div>
              )}

              {/* Step 4: Start Date & Specific Payment Days */}
              <div className="space-y-3 p-3.5 rounded-xl border border-slate-200 bg-white">
                <label className="block text-xs font-bold text-slate-700 uppercase tracking-wider">
                  {planFrequency === 'UNICO'
                    ? '3. Fecha del Pago Único'
                    : '4. Fecha de Inicio y Días en que Realizarías los Pagos'}
                </label>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 items-start">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {planFrequency === 'UNICO' ? 'Fecha del pago' : 'Fecha desde cuando inicias'}
                    </label>
                    <input
                      type="date"
                      value={planStartDate}
                      onChange={(e) => handlePlanStartDateChange(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                    />
                  </div>

                  {/* SEMANAL: Weekday Picker */}
                  {planFrequency === 'SEMANAL' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Días de la semana para pagar
                      </label>
                      <div className="grid grid-cols-7 gap-1">
                        {WEEKDAY_OPTIONS.map((wd) => {
                          const active = planWeekdays.includes(wd.value);
                          return (
                            <button
                              key={wd.value}
                              type="button"
                              onClick={() => handleTogglePlanWeekday(wd.value)}
                              title={wd.label}
                              className={`py-2 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                                active
                                  ? 'bg-slate-900 text-white border-slate-900'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {wd.short}
                            </button>
                          );
                        })}
                      </div>
                      <p className="text-[10px] text-slate-500 mt-1">
                        Puedes elegir uno o varios días (ej: todos los viernes, o martes y viernes).
                      </p>
                    </div>
                  )}

                  {/* QUINCENAL: Fixed Days vs Every 15 Days */}
                  {planFrequency === 'QUINCENAL' && (
                    <div className="space-y-2">
                      <label className="block text-xs font-semibold text-slate-700">
                        ¿Qué días realizas los pagos quincenales?
                      </label>
                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleBiweeklyModeChange('FIXED_DAYS')}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                            planBiweeklyMode === 'FIXED_DAYS'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Días fijos del mes
                        </button>
                        <button
                          type="button"
                          onClick={() => handleBiweeklyModeChange('EVERY_15_DAYS')}
                          className={`py-1.5 px-2 rounded-lg text-[11px] font-semibold border cursor-pointer ${
                            planBiweeklyMode === 'EVERY_15_DAYS'
                              ? 'bg-slate-900 text-white border-slate-900'
                              : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-50'
                          }`}
                        >
                          Cada 15 días exactos
                        </button>
                      </div>

                      {planBiweeklyMode === 'FIXED_DAYS' && (
                        <div className="space-y-1.5">
                          <div className="flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => handleBiweeklyDaysChange('15', '30')}
                              className={`px-2 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                                planBiweeklyDay1 === '15' && planBiweeklyDay2 === '30'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              Días 15 y 30
                            </button>
                            <button
                              type="button"
                              onClick={() => handleBiweeklyDaysChange('1', '15')}
                              className={`px-2 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                                planBiweeklyDay1 === '1' && planBiweeklyDay2 === '15'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              Días 1 y 15
                            </button>
                          </div>
                          <div className="grid grid-cols-2 gap-2">
                            <div>
                              <span className="block text-[10px] text-slate-500 mb-0.5">
                                1er día del mes
                              </span>
                              <input
                                type="number"
                                min="1"
                                max="31"
                                value={planBiweeklyDay1}
                                onChange={(e) =>
                                  handleBiweeklyDaysChange(e.target.value, planBiweeklyDay2)
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono"
                              />
                            </div>
                            <div>
                              <span className="block text-[10px] text-slate-500 mb-0.5">
                                2do día del mes
                              </span>
                              <input
                                type="number"
                                min="1"
                                max="31"
                                value={planBiweeklyDay2}
                                onChange={(e) =>
                                  handleBiweeklyDaysChange(planBiweeklyDay1, e.target.value)
                                }
                                className="w-full px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono"
                              />
                            </div>
                          </div>
                        </div>
                      )}
                    </div>
                  )}

                  {/* MENSUAL: Day of Month */}
                  {planFrequency === 'MENSUAL' && (
                    <div className="space-y-1.5">
                      <label className="block text-xs font-semibold text-slate-700">
                        Día del mes para pagar (1–31)
                      </label>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="1"
                          max="31"
                          value={planMonthlyDay}
                          onChange={(e) => handleMonthlyDayChange(e.target.value)}
                          className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-200 text-xs font-mono font-bold"
                        />
                        <div className="flex flex-wrap gap-1">
                          {[
                            { label: 'Día 1', val: '1' },
                            { label: 'Día 15', val: '15' },
                            { label: 'Fin de mes', val: '30' },
                          ].map((p) => (
                            <button
                              key={p.val}
                              type="button"
                              onClick={() => handleMonthlyDayChange(p.val)}
                              className={`px-2 py-1 rounded-md text-[11px] font-semibold border cursor-pointer ${
                                planMonthlyDay === p.val
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-300'
                                  : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                              }`}
                            >
                              {p.label}
                            </button>
                          ))}
                        </div>
                      </div>
                      <p className="text-[10px] text-slate-500">
                        Si el mes tiene menos días (ej. febrero), se ajusta al último día de ese mes.
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Prominent Automatic Payoff Summary Banner */}
              {plannerSummary && plannerSummary.pendingCount > 0 && (
                <div className="rounded-xl bg-slate-900 text-white p-4 grid grid-cols-1 sm:grid-cols-3 gap-3 items-center">
                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Cuotas Calculadas
                    </p>
                    <p className="text-lg font-bold font-mono tabular-nums text-white mt-0.5">
                      {plannerSummary.pendingCount} cuota
                      {plannerSummary.pendingCount === 1 ? '' : 's'}
                    </p>
                    <p className="text-[11px] text-slate-300 font-mono tabular-nums">
                      {plannerSummary.hasPartialLast
                        ? `${formatUSD(plannerSummary.firstAmount)} (últ. ${formatUSD(plannerSummary.lastAmount)})`
                        : `${formatUSD(plannerSummary.firstAmount)} c/u`}
                    </p>
                  </div>

                  <div>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      Primer Pago
                    </p>
                    <p className="text-sm font-bold text-slate-100 mt-0.5">
                      {formatPrettyDateES(plannerSummary.firstDate)}
                    </p>
                    <p className="text-[11px] text-slate-400 font-mono">
                      {plannerSummary.firstDate}
                    </p>
                  </div>

                  <div className="sm:border-l sm:border-slate-700 sm:pl-3">
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-emerald-400 flex items-center gap-1">
                      <Flag className="w-3 h-3" />
                      Terminarías de Pagar el
                    </p>
                    <p className="text-base font-bold text-amber-300 mt-0.5">
                      {formatPrettyDateES(plannerSummary.estimatedEndDate)}
                    </p>
                    <p className="text-[11px] text-slate-300">
                      {plannerSummary.estimatedEndDate}
                      {plannerSummary.durationLabel ? ` · ${plannerSummary.durationLabel}` : ''}
                    </p>
                  </div>
                </div>
              )}

              {/* Step 5: Payment Currency, Rate & Preferred Account */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 p-3.5 rounded-xl bg-slate-50 border border-slate-200">
                <div className="space-y-2">
                  <label className="block text-xs font-semibold text-slate-700">
                    Moneda / Condición del Plan
                  </label>
                  <div className="grid grid-cols-2 gap-1.5">
                    <button
                      type="button"
                      onClick={() => setPlanCurrency('EFECTIVO_USD')}
                      className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        planCurrency === 'EFECTIVO_USD'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      Efectivo USD ($)
                    </button>
                    <button
                      type="button"
                      onClick={() => setPlanCurrency('BS')}
                      className={`py-1.5 px-2.5 rounded-lg text-xs font-semibold border cursor-pointer ${
                        planCurrency === 'BS'
                          ? 'bg-slate-900 text-white border-slate-900'
                          : 'bg-white text-slate-700 border-slate-200 hover:bg-slate-100'
                      }`}
                    >
                      En Bolívares (Bs)
                    </button>
                  </div>

                  {planCurrency === 'BS' && (
                    <div className="flex items-center gap-1.5 pt-1">
                      <select
                        value={planRateType}
                        onChange={(e) =>
                          handleSelectPlanRateType(e.target.value as TreasuryCommitmentRateType)
                        }
                        className="px-2 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-semibold"
                      >
                        <option value="BCV">Tasa BCV</option>
                        <option value="EURO">Tasa Euro</option>
                        <option value="USDT">Tasa USDT</option>
                      </select>
                      <input
                        type="number"
                        step="any"
                        min="0.01"
                        value={planAppliedRate}
                        onChange={(e) => setPlanAppliedRate(e.target.value)}
                        className="flex-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-mono"
                        placeholder="Tasa Bs"
                      />
                      {isFetchingEuro && (
                        <RefreshCw className="w-3.5 h-3.5 text-slate-400 animate-spin shrink-0" />
                      )}
                    </div>
                  )}
                </div>

                <div className="space-y-1.5">
                  <label className="block text-xs font-semibold text-slate-700">
                    Cuenta Sugerida para Pagar
                  </label>
                  <select
                    value={planPreferredAccountId}
                    onChange={(e) => setPlanPreferredAccountId(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white text-xs"
                  >
                    <option value="">Sin cuenta fija (decidir al pagar)</option>
                    {enrichedAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatUSD(acc.liveUSD)})
                      </option>
                    ))}
                  </select>
                  <p className="text-[11px] text-slate-500">
                    Podrás cambiar la cuenta en cualquier momento al registrar cada abono.
                  </p>
                </div>
              </div>

              {/* Step 6: Editable Installments Schedule */}
              <div className="space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Cronograma Detallado de Cuotas ({planInstallments.length})
                  </label>
                  <button
                    type="button"
                    onClick={handleAddManualInstallment}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-slate-200 hover:bg-slate-50 text-[11px] font-semibold text-slate-700 cursor-pointer"
                  >
                    <Plus className="w-3 h-3" />
                    Agregar cuota
                  </button>
                </div>

                <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden max-h-64 overflow-y-auto">
                  {planInstallments.map((inst) => {
                    const isPaidInst = inst.status === 'PAGADA';
                    const effRate = parseFloat(planAppliedRate) || bcvRate;
                    return (
                      <div
                        key={inst.id}
                        className={`px-3 py-2 flex flex-wrap sm:flex-nowrap items-center gap-2 text-xs ${
                          isPaidInst ? 'bg-emerald-50/40' : 'bg-white'
                        }`}
                      >
                        <span className="font-mono font-bold text-slate-500 w-7 shrink-0">
                          #{inst.number}
                        </span>

                        <span className="text-[11px] font-semibold text-slate-500 w-8 shrink-0">
                          {getWeekdayShortES(inst.dueDate)}
                        </span>

                        <input
                          type="date"
                          disabled={isPaidInst}
                          value={inst.dueDate}
                          onChange={(e) =>
                            handleUpdateInstallmentField(inst.id, 'dueDate', e.target.value)
                          }
                          className="px-2 py-1 rounded-lg border border-slate-200 font-mono text-xs disabled:bg-slate-100 disabled:text-slate-400"
                        />

                        <div className="flex items-center gap-1 flex-1 min-w-[100px]">
                          <span className="text-slate-400 font-mono">$</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            disabled={isPaidInst}
                            value={inst.amountUSD}
                            onChange={(e) =>
                              handleUpdateInstallmentField(inst.id, 'amountUSD', e.target.value)
                            }
                            className="w-full px-2 py-1 rounded-lg border border-slate-200 font-mono text-xs tabular-nums disabled:bg-slate-100 disabled:text-slate-400"
                          />
                        </div>

                        {planCurrency === 'BS' && (
                          <span className="font-mono text-[11px] text-slate-500 tabular-nums shrink-0">
                            ≈ {formatBs((Number(inst.amountUSD) || 0) * effRate)}
                          </span>
                        )}

                        {isPaidInst ? (
                          <span className="text-[11px] font-semibold text-emerald-700 shrink-0">
                            Pagada
                          </span>
                        ) : (
                          <button
                            type="button"
                            onClick={() => handleRemoveInstallment(inst.id)}
                            disabled={planInstallments.length <= 1}
                            className="p-1 rounded-md text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 cursor-pointer shrink-0"
                            title="Quitar cuota"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Validation & Feasibility Footer */}
                {plannerSummary && (
                  <div className="space-y-2">
                    <div
                      className={`px-3 py-2 rounded-xl border text-xs flex flex-wrap items-center justify-between gap-2 ${
                        Math.abs(plannerSummary.diff) <= 0.02
                          ? 'bg-emerald-50/70 border-emerald-200 text-emerald-800'
                          : 'bg-amber-50 border-amber-200 text-amber-900'
                      }`}
                    >
                      <span>
                        Suma cuotas pendientes:{' '}
                        <strong className="font-mono tabular-nums">
                          {formatUSD(plannerSummary.pendingSum)}
                        </strong>{' '}
                        / Saldo deuda:{' '}
                        <strong className="font-mono tabular-nums">
                          {formatUSD(planModalDebt.remainingAmountUSD)}
                        </strong>
                        {Math.abs(plannerSummary.diff) > 0.02 && (
                          <span className="ml-1.5 font-semibold">
                            (Diferencia: {plannerSummary.diff > 0 ? '+' : ''}
                            {formatUSD(plannerSummary.diff)})
                          </span>
                        )}
                      </span>
                      {Math.abs(plannerSummary.diff) > 0.02 && (
                        <button
                          type="button"
                          onClick={handleBalanceLastInstallment}
                          className="px-2 py-0.5 rounded-md bg-amber-600 hover:bg-amber-700 text-white text-[11px] font-semibold cursor-pointer"
                        >
                          Ajustar última cuota
                        </button>
                      )}
                    </div>

                    {plannerSummary.firstAmount > 0 && (
                      <p className="text-[11px] text-slate-600 flex items-center gap-1.5">
                        <ArrowRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                        {plannerSummary.fitsFreeBalance ? (
                          <span>
                            Viabilidad: tu saldo libre proyectado ({formatUSD(projectedFreeBalanceUSD)}) cubre cómodamente la primera cuota de{' '}
                            <strong className="font-mono">{formatUSD(plannerSummary.firstAmount)}</strong>.
                          </span>
                        ) : plannerSummary.fitsLiquidity ? (
                          <span>
                            Viabilidad: tu liquidez actual ({formatUSD(totalLiquidityUSD)}) alcanza para la cuota de{' '}
                            <strong className="font-mono">{formatUSD(plannerSummary.firstAmount)}</strong>, pero conviene reservar primero los gastos fijos del mes.
                          </span>
                        ) : (
                          <span>
                            Viabilidad: necesitarás generar o apartar{' '}
                            <strong className="font-mono text-rose-700">
                              {formatUSD(Math.max(0, plannerSummary.firstAmount - totalLiquidityUSD))}
                            </strong>{' '}
                            adicionales para cubrir la primera cuota ({formatUSD(plannerSummary.firstAmount)}).
                          </span>
                        )}
                      </p>
                    )}
                  </div>
                )}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notas del Plan (opcional)
                </label>
                <input
                  type="text"
                  value={planNotes}
                  onChange={(e) => setPlanNotes(e.target.value)}
                  placeholder="Ej: Pagar los viernes después del cierre semanal de caja..."
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPlanModalDebt(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5 text-amber-400" />
                  Guardar Plan de Pago
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 3: REGISTRAR ABONO / PAGO DE DEUDA                            */}
      {/* =================================================================== */}
      {payModalDebt && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-lg max-h-[92vh] overflow-y-auto">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900 truncate">
                  Registrar Abono / Pago de Deuda
                </h3>
                <p className="text-xs text-slate-500 truncate">
                  {payModalDebt.title} · Pendiente: {formatUSD(payModalDebt.remainingAmountUSD)}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setPayModalDebt(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleConfirmDebtPayment} className="p-5 space-y-4">
              {/* Installment selector if plan exists */}
              {payModalDebt.paymentPlan &&
                payModalDebt.paymentPlan.installments.some((i) => i.status === 'PENDIENTE') && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      ¿A cuál cuota planificada corresponde?
                    </label>
                    <select
                      value={payInstallmentId}
                      onChange={(e) => handlePayInstallmentSelect(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                    >
                      <option value="">Abono libre / parcial (sin marcar cuota específica)</option>
                      {payModalDebt.paymentPlan.installments
                        .filter((i) => i.status === 'PENDIENTE')
                        .map((inst) => (
                          <option key={inst.id} value={inst.id}>
                            Cuota #{inst.number} · {formatUSD(inst.amountUSD)} (vence {inst.dueDate})
                          </option>
                        ))}
                    </select>
                  </div>
                )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="sm:col-span-2">
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cuenta de Tesorería (de donde sale el dinero) *
                  </label>
                  <select
                    required
                    value={payAccountId}
                    onChange={(e) => handlePayAccountChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                  >
                    <option value="">Seleccionar cuenta...</option>
                    {enrichedAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} · Disponible: {formatUSD(acc.liveUSD)}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Moneda del Monto
                  </label>
                  <select
                    value={payInputCurrency}
                    onChange={(e) =>
                      setPayInputCurrency(e.target.value as 'USD' | 'BS' | 'USDT')
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs bg-white"
                  >
                    <option value="USD">Dólares (USD)</option>
                    <option value="BS">Bolívares (Bs)</option>
                    <option value="USDT">USDT</option>
                  </select>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Monto a Pagar ({payInputCurrency}) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    required
                    value={payAmountInput}
                    onChange={(e) => setPayAmountInput(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm font-mono tabular-nums"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha del Pago
                  </label>
                  <input
                    type="date"
                    value={payDate}
                    onChange={(e) => setPayDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Tasa de Cambio (Bs/USD)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={payRate}
                    onChange={(e) => setPayRate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Referencia (opcional)
                  </label>
                  <input
                    type="text"
                    value={payReference}
                    onChange={(e) => setPayReference(e.target.value)}
                    placeholder="Ej: 00459821"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Nota (opcional)
                  </label>
                  <input
                    type="text"
                    value={payNotes}
                    onChange={(e) => setPayNotes(e.target.value)}
                    placeholder="Detalle adicional"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs"
                  />
                </div>
              </div>

              {/* Live Impact Preview */}
              {payPreview.usd > 0 && (
                <div className="p-3 rounded-xl bg-slate-50 border border-slate-200 text-xs space-y-1">
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Descuento en Tesorería:</span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatUSD(payPreview.usd)} ({formatBs(payPreview.bs)})
                    </span>
                  </div>
                  {payPreview.acc && (
                    <div className="flex items-center justify-between">
                      <span className="text-slate-600">Saldo restante en {payPreview.acc.name}:</span>
                      <span
                        className={`font-mono font-bold tabular-nums ${
                          payPreview.afterAccountUSD < 0 ? 'text-rose-600' : 'text-emerald-700'
                        }`}
                      >
                        {formatUSD(payPreview.afterAccountUSD)}
                      </span>
                    </div>
                  )}
                  <div className="flex items-center justify-between">
                    <span className="text-slate-600">Nuevo saldo pendiente de la deuda:</span>
                    <span className="font-mono font-bold text-slate-900 tabular-nums">
                      {formatUSD(payPreview.afterDebtUSD)}
                      {payPreview.afterDebtUSD <= 0.009 ? ' (Liquidada)' : ''}
                    </span>
                  </div>
                </div>
              )}

              <label className="flex items-center gap-2.5 p-2.5 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer">
                <input
                  type="checkbox"
                  checked={paySyncToExpense}
                  onChange={(e) => setPaySyncToExpense(e.target.checked)}
                  className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                />
                <span className="text-xs text-slate-700">
                  Registrar también copia en <strong>Gastos del Negocio</strong> (sin descontar doble)
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setPayModalDebt(null)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-semibold text-slate-600 hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold cursor-pointer"
                >
                  <Check className="w-3.5 h-3.5" />
                  Confirmar Abono
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* =================================================================== */}
      {/* MODAL 4: EDITAR Y GESTIONAR CATEGORÍAS DE DEUDAS                    */}
      {/* =================================================================== */}
      {categoryModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 shadow-2xl w-full max-w-md max-h-[88vh] flex flex-col overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <div>
                <h3 className="text-base font-bold text-slate-900">
                  Editar Categorías de Deudas
                </h3>
                <p className="text-xs text-slate-500">
                  Crea, renombra o elimina categorías. Renombrar actualiza tus deudas automáticamente.
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setCategoryModalOpen(false);
                  setRenamingCategory(null);
                }}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-5 space-y-4 overflow-y-auto flex-1">
              <form onSubmit={handleAddNewCategory} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCategoryName}
                  onChange={(e) => setNewCategoryName(e.target.value)}
                  placeholder="Nueva categoría (Ej: Tarjeta Crédito)..."
                  className="flex-1 px-3 py-2 rounded-xl border border-slate-200 text-xs focus:outline-none focus:ring-2 focus:ring-slate-900/10"
                />
                <button
                  type="submit"
                  className="inline-flex items-center gap-1 px-3 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400" />
                  Agregar
                </button>
              </form>

              <div className="divide-y divide-slate-100 rounded-xl border border-slate-200 overflow-hidden">
                {debtCategories.map((cat) => {
                  const count = categoryUsageCounts.get(cat.toLowerCase()) || 0;
                  const isRenaming = renamingCategory === cat;
                  return (
                    <div
                      key={cat}
                      className="px-3 py-2.5 flex items-center justify-between gap-2 bg-white hover:bg-slate-50/70"
                    >
                      {isRenaming ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="text"
                            autoFocus
                            value={renameValue}
                            onChange={(e) => setRenameValue(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleConfirmRenameCategory(cat);
                              } else if (e.key === 'Escape') {
                                setRenamingCategory(null);
                              }
                            }}
                            className="flex-1 px-2.5 py-1 rounded-lg border border-slate-400 text-xs font-semibold text-slate-900 focus:outline-none"
                          />
                          <button
                            type="button"
                            onClick={() => handleConfirmRenameCategory(cat)}
                            className="p-1.5 rounded-lg bg-emerald-600 text-white hover:bg-emerald-700 cursor-pointer"
                            title="Guardar nombre"
                          >
                            <Check className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setRenamingCategory(null)}
                            className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-100 cursor-pointer"
                            title="Cancelar"
                          >
                            <X className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="min-w-0 flex-1">
                            <p className="text-xs font-semibold text-slate-800 truncate">{cat}</p>
                            <p className="text-[11px] text-slate-400">
                              {count === 0
                                ? 'Sin deudas asignadas'
                                : `${count} deuda${count === 1 ? '' : 's'} asignada${count === 1 ? '' : 's'}`}
                            </p>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setRenamingCategory(cat);
                                setRenameValue(cat);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                              title="Renombrar categoría"
                            >
                              <Pencil className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              disabled={count > 0 || debtCategories.length <= 1}
                              onClick={() => {
                                deleteDebtCategory(cat);
                                showBanner('info', `Categoría "${cat}" eliminada.`);
                              }}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 disabled:opacity-30 disabled:cursor-not-allowed cursor-pointer"
                              title={
                                count > 0
                                  ? 'Reasigna o renombra esta categoría primero'
                                  : 'Eliminar categoría'
                              }
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>

            <div className="px-5 py-3 border-t border-slate-100 flex justify-end">
              <button
                type="button"
                onClick={() => {
                  setCategoryModalOpen(false);
                  setRenamingCategory(null);
                }}
                className="px-4 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
