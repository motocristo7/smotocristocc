import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  TreasuryAccount,
  TreasuryAccountGroup,
  TreasuryCommitment,
  TreasuryCommitmentCategory,
  TreasuryCommitmentDisplayStatus,
  TreasuryCommitmentPaymentCurrency,
  TreasuryCommitmentRateType,
  TreasuryMovement,
  TreasuryMovementType,
} from '../../types';
import { formatUSD, formatBs } from '../../utils/whatsapp';
import { fetchOfficialEuroBcvRate } from '../../services/bcvService';
import { TreasuryDebtsSection } from './TreasuryDebtsSection';
import {
  Landmark,
  Wallet,
  CalendarClock,
  TrendingUp,
  Users,
  Banknote,
  Building2,
  Coins,
  Plus,
  CheckCircle2,
  Clock,
  AlertTriangle,
  ArrowUpRight,
  ArrowDownRight,
  Search,
  Pencil,
  Trash2,
  X,
  Check,
  ShieldCheck,
  Truck,
  Sparkles,
  PiggyBank,
  RefreshCw,
  UserCheck,
} from 'lucide-react';

const ACCOUNT_GROUP_META: Record<
  TreasuryAccountGroup,
  {
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
    barColor: string;
    badgeBg: string;
    badgeText: string;
    iconBg: string;
  }
> = {
  EFECTIVO: {
    label: 'Efectivo',
    shortLabel: 'Efectivo',
    icon: Banknote,
    barColor: 'bg-emerald-500',
    badgeBg: 'bg-emerald-50 border-emerald-200',
    badgeText: 'text-emerald-700',
    iconBg: 'bg-emerald-50 text-emerald-600',
  },
  BANCO_NACIONAL: {
    label: 'Bancos Nacionales',
    shortLabel: 'Bancos Nacionales',
    icon: Building2,
    barColor: 'bg-blue-500',
    badgeBg: 'bg-blue-50 border-blue-200',
    badgeText: 'text-blue-700',
    iconBg: 'bg-blue-50 text-blue-600',
  },
  BILLETERA_DIVISAS: {
    label: 'Billeteras Digitales / Divisas',
    shortLabel: 'Billeteras / Divisas',
    icon: Coins,
    barColor: 'bg-amber-500',
    badgeBg: 'bg-amber-50 border-amber-200',
    badgeText: 'text-amber-800',
    iconBg: 'bg-amber-50 text-amber-600',
  },
};

const COMMITMENT_CATEGORY_META: Record<
  TreasuryCommitmentCategory,
  { label: string; shortLabel: string; chipClass: string }
> = {
  GASTOS_FIJOS: {
    label: 'Gastos Fijos',
    shortLabel: 'Gastos Fijos',
    chipClass: 'bg-slate-100 text-slate-700 border-slate-200',
  },
  NOMINA_SUELDOS: {
    label: 'Nómina / Sueldos',
    shortLabel: 'Nómina/Sueldos',
    chipClass: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  },
  PROVEEDORES: {
    label: 'Proveedores',
    shortLabel: 'Proveedores',
    chipClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
};

const COMMITMENT_RATE_META: Record<
  TreasuryCommitmentRateType,
  { label: string; shortLabel: string; badgeClass: string }
> = {
  BCV: {
    label: 'Tasa BCV',
    shortLabel: 'BCV',
    badgeClass: 'bg-blue-50 text-blue-700 border-blue-200',
  },
  EURO: {
    label: 'Tasa Euro',
    shortLabel: 'Euro',
    badgeClass: 'bg-violet-50 text-violet-700 border-violet-200',
  },
  USDT: {
    label: 'Tasa USDT',
    shortLabel: 'USDT',
    badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
  },
};

const LAST_EURO_RATE_KEY = 'servimotos_last_euro_rate';
const LAST_USDT_RATE_KEY = 'servimotos_last_usdt_rate';

function getSavedCommitmentRate(
  rateType: TreasuryCommitmentRateType,
  fallbackBcvRate: number
): number | null {
  if (rateType === 'BCV') return fallbackBcvRate;
  try {
    const key = rateType === 'EURO' ? LAST_EURO_RATE_KEY : LAST_USDT_RATE_KEY;
    const raw = localStorage.getItem(key);
    const parsed = raw ? parseFloat(raw) : NaN;
    if (!isNaN(parsed) && parsed > 0) return parsed;
  } catch {
    // ignore storage errors
  }
  return null;
}

function saveCommitmentRatePreference(rateType: TreasuryCommitmentRateType, rate: number): void {
  if (rateType === 'BCV' || !rate || rate <= 0) return;
  try {
    const key = rateType === 'EURO' ? LAST_EURO_RATE_KEY : LAST_USDT_RATE_KEY;
    localStorage.setItem(key, String(rate));
  } catch {
    // ignore storage errors
  }
}

function getEffectiveCommitmentBsRate(cm: TreasuryCommitment, currentBcvRate: number): number {
  const rateType: TreasuryCommitmentRateType = cm.exchangeRateType || 'BCV';
  if (cm.isPaid) {
    return cm.appliedExchangeRate && cm.appliedExchangeRate > 0
      ? cm.appliedExchangeRate
      : cm.bcvRate || currentBcvRate;
  }
  if (rateType === 'BCV') {
    return currentBcvRate;
  }
  return cm.appliedExchangeRate && cm.appliedExchangeRate > 0
    ? cm.appliedExchangeRate
    : cm.bcvRate || currentBcvRate;
}

function formatNativeBalance(currency: 'USD' | 'BS' | 'USDT', amount: number): string {
  const num = Number(amount) || 0;
  if (currency === 'BS') {
    return `Bs. ${num.toLocaleString('es-VE', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  }
  if (currency === 'USDT') {
    return `${num.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
  }
  return formatUSD(num);
}

function getDaysUntilDue(dueDate: string): number {
  if (!dueDate) return 999;
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const parsed = new Date(`${dueDate}T00:00:00`);
  if (isNaN(parsed.getTime())) return 999;
  return Math.round((parsed.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

function getCommitmentDisplayStatus(commitment: TreasuryCommitment): {
  status: TreasuryCommitmentDisplayStatus;
  daysLeft: number;
  label: string;
  shortLabel: string;
  textClass: string;
  badgeClass: string;
} {
  if (commitment.isPaid) {
    return {
      status: 'PAGADO',
      daysLeft: 0,
      label: 'Pagado',
      shortLabel: 'Pagado',
      textClass: 'text-emerald-700',
      badgeClass: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    };
  }
  const daysLeft = getDaysUntilDue(commitment.dueDate);
  if (daysLeft < 0) {
    return {
      status: 'PROXIMO_VENCER',
      daysLeft,
      label: `Vencido (${Math.abs(daysLeft)}d)`,
      shortLabel: `Vencido ${Math.abs(daysLeft)}d`,
      textClass: 'text-rose-700',
      badgeClass: 'bg-rose-50 text-rose-700 border-rose-200',
    };
  }
  if (daysLeft <= 5) {
    return {
      status: 'PROXIMO_VENCER',
      daysLeft,
      label: daysLeft === 0 ? 'Vence hoy' : `Próximo a vencer (${daysLeft}d)`,
      shortLabel: daysLeft === 0 ? 'Vence hoy' : `Vence en ${daysLeft}d`,
      textClass: 'text-amber-700',
      badgeClass: 'bg-amber-50 text-amber-800 border-amber-200',
    };
  }
  return {
    status: 'PENDIENTE',
    daysLeft,
    label: 'Pendiente',
    shortLabel: 'Pendiente',
    textClass: 'text-slate-600',
    badgeClass: 'bg-slate-100 text-slate-700 border-slate-200',
  };
}

export const TreasuryFinanceView: React.FC = () => {
  const {
    settings,
    setCurrentView,
    pendingCreditSales,
    totalAccountsReceivableUSD,
    totalAccountsReceivableBs,
    purchaseOrders,
    technicians,
    expenseCategories,
    treasuryAccounts,
    treasuryCommitments,
    treasuryMovements,
    initializeDefaultTreasuryAccounts,
    addTreasuryAccount,
    updateTreasuryAccount,
    deleteTreasuryAccount,
    addTreasuryCommitment,
    updateTreasuryCommitment,
    deleteTreasuryCommitment,
    markCommitmentPaidFromAccount,
    recordTreasuryMovement,
    deleteTreasuryMovement,
    importUnpaidPurchaseOrdersToCommitments,
    totalLiquidityUSD,
    totalLiquidityBs,
    pendingCommitmentsUSD,
    pendingCommitmentsBs,
    projectedFreeBalanceUSD,
    projectedFreeBalanceBs,
  } = useApp();

  const bcvRate = settings.bcvRate || 1;
  const todayStr = new Date().toISOString().split('T')[0];

  // Notifications / inline feedback
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'info' | 'error';
    message: string;
  } | null>(null);

  const showBanner = (type: 'success' | 'info' | 'error', message: string) => {
    setFeedbackBanner({ type, message });
    setTimeout(() => {
      setFeedbackBanner((prev) => (prev?.message === message ? null : prev));
    }, 4000);
  };

  // Commitment table filters
  const [commitmentCategoryFilter, setCommitmentCategoryFilter] = useState<
    'ALL' | TreasuryCommitmentCategory
  >('ALL');
  const [commitmentStatusFilter, setCommitmentStatusFilter] = useState<
    'ALL' | 'PENDING' | 'PAID'
  >('ALL');

  // Movement table filters
  const [movementTypeFilter, setMovementTypeFilter] = useState<
    'ALL' | TreasuryMovementType
  >('ALL');
  const [movementAccountFilter, setMovementAccountFilter] = useState<string>('ALL');
  const [movementSearch, setMovementSearch] = useState('');

  // Account Form Modal
  const [isAccountModalOpen, setIsAccountModalOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<TreasuryAccount | null>(null);
  const [accName, setAccName] = useState('');
  const [accGroup, setAccGroup] = useState<TreasuryAccountGroup>('EFECTIVO');
  const [accCurrency, setAccCurrency] = useState<'USD' | 'BS' | 'USDT'>('USD');
  const [accNativeBalance, setAccNativeBalance] = useState('');
  const [accInstitution, setAccInstitution] = useState('');
  const [accNumber, setAccNumber] = useState('');
  const [accError, setAccError] = useState('');

  // Commitment Form Modal
  const [isCommitmentModalOpen, setIsCommitmentModalOpen] = useState(false);
  const [editingCommitment, setEditingCommitment] = useState<TreasuryCommitment | null>(null);
  const [cmtTitle, setCmtTitle] = useState('');
  const [cmtWorkerName, setCmtWorkerName] = useState('');
  const [cmtCategory, setCmtCategory] = useState<TreasuryCommitmentCategory>('GASTOS_FIJOS');
  const [cmtDueDate, setCmtDueDate] = useState(todayStr);
  const [cmtAmountUSD, setCmtAmountUSD] = useState('');
  const [cmtReservedUSD, setCmtReservedUSD] = useState('');
  const [cmtPaymentCurrency, setCmtPaymentCurrency] =
    useState<TreasuryCommitmentPaymentCurrency>('EFECTIVO_USD');
  const [cmtRateType, setCmtRateType] = useState<TreasuryCommitmentRateType>('BCV');
  const [cmtAppliedRate, setCmtAppliedRate] = useState('');
  const [isFetchingEuroRate, setIsFetchingEuroRate] = useState(false);
  const [euroFetchHint, setEuroFetchHint] = useState('');
  const [cmtNotes, setCmtNotes] = useState('');
  const [cmtError, setCmtError] = useState('');

  // Pay Commitment Modal (select account to deduct from)
  const [payingCommitment, setPayingCommitment] = useState<TreasuryCommitment | null>(null);
  const [payAccountId, setPayAccountId] = useState('');
  const [payDate, setPayDate] = useState(todayStr);
  const [payReference, setPayReference] = useState('');
  const [paySyncExpense, setPaySyncExpense] = useState(true);
  const [payRateType, setPayRateType] = useState<TreasuryCommitmentRateType>('BCV');
  const [payAppliedRate, setPayAppliedRate] = useState('');
  const [isFetchingPayEuroRate, setIsFetchingPayEuroRate] = useState(false);
  const [payError, setPayError] = useState('');

  // Reserve allocation Modal (Apartar monto para cobertura)
  const [reservingCommitment, setReservingCommitment] = useState<TreasuryCommitment | null>(null);
  const [reserveInput, setReserveInput] = useState('');

  // New Movement Modal (Registrar Nuevo Gasto o Ingreso)
  const [isMovementModalOpen, setIsMovementModalOpen] = useState(false);
  const [movType, setMovType] = useState<'INGRESO' | 'GASTO'>('GASTO');
  const [movAccountId, setMovAccountId] = useState('');
  const [movDate, setMovDate] = useState(todayStr);
  const [movCategory, setMovCategory] = useState('Servicios Básicos');
  const [movDescription, setMovDescription] = useState('');
  const [movBeneficiary, setMovBeneficiary] = useState('');
  const [movInputCurrency, setMovInputCurrency] = useState<'USD' | 'BS' | 'USDT'>('USD');
  const [movAmountInput, setMovAmountInput] = useState('');
  const [movReference, setMovReference] = useState('');
  const [movSyncExpense, setMovSyncExpense] = useState(true);
  const [movIsSalaryAdvance, setMovIsSalaryAdvance] = useState(false);
  const [movLinkedCommitmentId, setMovLinkedCommitmentId] = useState('');
  const [movError, setMovError] = useState('');

  // Live Account Breakdown (grouped into Efectivo, Bancos Nacionales, Billeteras Digitales/Divisas)
  const accountBreakdown = useMemo(() => {
    const computeLiveUSD = (acc: TreasuryAccount) => {
      const nativeBal = Number(acc.nativeBalance) || 0;
      if (acc.currency === 'BS') {
        return Math.round((nativeBal / bcvRate) * 100) / 100;
      }
      return Math.round(nativeBal * 100) / 100;
    };

    const groups: Array<{
      group: TreasuryAccountGroup;
      accounts: Array<TreasuryAccount & { liveUSD: number }>;
      totalUSD: number;
      sharePct: number;
    }> = (['EFECTIVO', 'BANCO_NACIONAL', 'BILLETERA_DIVISAS'] as TreasuryAccountGroup[]).map(
      (grp) => {
        const accs = treasuryAccounts
          .filter((a) => a.group === grp)
          .map((a) => ({ ...a, liveUSD: computeLiveUSD(a) }));
        const totalUSD =
          Math.round(accs.reduce((sum, a) => sum + a.liveUSD, 0) * 100) / 100;
        const positiveLiquidity = treasuryAccounts.reduce(
          (s, a) => s + Math.max(0, computeLiveUSD(a)),
          0
        );
        const sharePct =
          positiveLiquidity > 0
            ? Math.round((Math.max(0, totalUSD) / positiveLiquidity) * 1000) / 10
            : 0;
        return {
          group: grp,
          accounts: accs,
          totalUSD,
          sharePct,
        };
      }
    );

    return groups;
  }, [treasuryAccounts, bcvRate]);

  // Unpaid purchase orders available to import
  const unimportedUnpaidPurchaseCount = useMemo(() => {
    const linked = new Set(
      treasuryCommitments.map((c) => c.linkedPurchaseOrderId).filter(Boolean)
    );
    return purchaseOrders.filter(
      (po) =>
        Math.max(0, po.totalUSD - (po.paidAmountUSD || 0)) > 0.01 &&
        !linked.has(po.id)
    ).length;
  }, [purchaseOrders, treasuryCommitments]);

  // Filtered commitments table
  const filteredCommitments = useMemo(() => {
    return treasuryCommitments.filter((cm) => {
      if (
        commitmentCategoryFilter !== 'ALL' &&
        cm.category !== commitmentCategoryFilter
      ) {
        return false;
      }
      if (commitmentStatusFilter === 'PENDING' && cm.isPaid) return false;
      if (commitmentStatusFilter === 'PAID' && !cm.isPaid) return false;
      return true;
    });
  }, [treasuryCommitments, commitmentCategoryFilter, commitmentStatusFilter]);

  const urgentCommitmentsCount = useMemo(() => {
    return treasuryCommitments.filter(
      (cm) => !cm.isPaid && getDaysUntilDue(cm.dueDate) <= 5
    ).length;
  }, [treasuryCommitments]);

  // Monthly Coverage Progress (Progreso de Cobertura Mensual)
  const coverageStats = useMemo(() => {
    const now = new Date();
    const currentMonthPrefix = `${now.getFullYear()}-${String(
      now.getMonth() + 1
    ).padStart(2, '0')}`;

    // Use commitments of current month + any unpaid commitments carried over
    const monthCommitments = treasuryCommitments.filter(
      (cm) =>
        (cm.dueDate || '').startsWith(currentMonthPrefix) || !cm.isPaid
    );

    const targetList =
      monthCommitments.length > 0 ? monthCommitments : treasuryCommitments;

    const totalMonthlyUSD =
      Math.round(
        targetList.reduce((s, cm) => s + (Number(cm.amountUSD) || 0), 0) * 100
      ) / 100;
    const paidUSD =
      Math.round(
        targetList
          .filter((cm) => cm.isPaid)
          .reduce((s, cm) => s + (Number(cm.amountUSD) || 0), 0) * 100
      ) / 100;
    const explicitlyReservedUSD =
      Math.round(
        targetList
          .filter((cm) => !cm.isPaid)
          .reduce(
            (s, cm) =>
              s + Math.min(cm.amountUSD, Math.max(0, Number(cm.reservedUSD) || 0)),
            0
          ) * 100
      ) / 100;
    const pendingTotalUSD =
      Math.round(
        targetList
          .filter((cm) => !cm.isPaid)
          .reduce((s, cm) => s + (Number(cm.amountUSD) || 0), 0) * 100
      ) / 100;

    // Effective covered amount combines already paid + available liquidity up to total commitments
    const liquidityBackedUSD = Math.min(
      pendingTotalUSD,
      Math.max(0, totalLiquidityUSD)
    );
    const effectiveCoveredUSD =
      Math.round((paidUSD + liquidityBackedUSD) * 100) / 100;
    const uncoveredUSD =
      Math.round(Math.max(0, totalMonthlyUSD - effectiveCoveredUSD) * 100) / 100;

    const coveragePercent =
      totalMonthlyUSD > 0
        ? Math.min(100, Math.round((effectiveCoveredUSD / totalMonthlyUSD) * 100))
        : totalLiquidityUSD > 0
          ? 100
          : 0;
    const paidPercent =
      totalMonthlyUSD > 0
        ? Math.min(100, Math.round((paidUSD / totalMonthlyUSD) * 100))
        : 0;

    const byCategory = (
      ['GASTOS_FIJOS', 'NOMINA_SUELDOS', 'PROVEEDORES'] as TreasuryCommitmentCategory[]
    ).map((cat) => {
      const items = targetList.filter((cm) => cm.category === cat);
      const total =
        Math.round(items.reduce((s, c) => s + (Number(c.amountUSD) || 0), 0) * 100) /
        100;
      const paid =
        Math.round(
          items
            .filter((c) => c.isPaid)
            .reduce((s, c) => s + (Number(c.amountUSD) || 0), 0) * 100
        ) / 100;
      const reserved =
        Math.round(
          items
            .filter((c) => !c.isPaid)
            .reduce(
              (s, c) =>
                s + Math.min(c.amountUSD, Math.max(0, Number(c.reservedUSD) || 0)),
              0
            ) * 100
        ) / 100;
      const pct =
        total > 0 ? Math.min(100, Math.round(((paid + reserved) / total) * 100)) : 0;
      return {
        category: cat,
        label: COMMITMENT_CATEGORY_META[cat].shortLabel,
        totalUSD: total,
        paidUSD: paid,
        reservedUSD: reserved,
        pct,
        count: items.length,
      };
    });

    return {
      totalMonthlyUSD,
      paidUSD,
      explicitlyReservedUSD,
      pendingTotalUSD,
      liquidityBackedUSD,
      effectiveCoveredUSD,
      uncoveredUSD,
      coveragePercent,
      paidPercent,
      byCategory,
    };
  }, [treasuryCommitments, totalLiquidityUSD]);

  // Filtered recent movements
  const filteredMovements = useMemo(() => {
    const q = movementSearch.trim().toLowerCase();
    return treasuryMovements.filter((mv) => {
      if (movementTypeFilter !== 'ALL' && mv.type !== movementTypeFilter) {
        return false;
      }
      if (movementAccountFilter !== 'ALL' && mv.accountId !== movementAccountFilter) {
        return false;
      }
      if (q) {
        const text = [
          mv.movementNumber,
          mv.description,
          mv.category,
          mv.accountName,
          mv.reference || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });
  }, [treasuryMovements, movementTypeFilter, movementAccountFilter, movementSearch]);

  // Handlers
  const openNewAccountModal = (defaultGroup: TreasuryAccountGroup = 'EFECTIVO') => {
    setEditingAccount(null);
    setAccName('');
    setAccGroup(defaultGroup);
    setAccCurrency(
      defaultGroup === 'BANCO_NACIONAL'
        ? 'BS'
        : defaultGroup === 'BILLETERA_DIVISAS'
          ? 'USDT'
          : 'USD'
    );
    setAccNativeBalance('');
    setAccInstitution('');
    setAccNumber('');
    setAccError('');
    setIsAccountModalOpen(true);
  };

  const openEditAccountModal = (account: TreasuryAccount) => {
    setEditingAccount(account);
    setAccName(account.name);
    setAccGroup(account.group);
    setAccCurrency(account.currency);
    setAccNativeBalance(String(account.nativeBalance));
    setAccInstitution(account.institution || '');
    setAccNumber(account.accountNumber || '');
    setAccError('');
    setIsAccountModalOpen(true);
  };

  const handleSaveAccount = (e: React.FormEvent) => {
    e.preventDefault();
    if (!accName.trim()) {
      setAccError('Ingresa un nombre para la cuenta');
      return;
    }
    const parsedBal = parseFloat(accNativeBalance || '0');
    if (isNaN(parsedBal)) {
      setAccError('El saldo debe ser un número válido');
      return;
    }

    if (editingAccount) {
      updateTreasuryAccount(editingAccount.id, {
        name: accName.trim(),
        group: accGroup,
        currency: accCurrency,
        nativeBalance: parsedBal,
        institution: accInstitution.trim() || undefined,
        accountNumber: accNumber.trim() || undefined,
      });
      showBanner('success', `Cuenta "${accName.trim()}" actualizada correctamente.`);
    } else {
      addTreasuryAccount({
        name: accName.trim(),
        group: accGroup,
        currency: accCurrency,
        nativeBalance: parsedBal,
        institution: accInstitution.trim() || undefined,
        accountNumber: accNumber.trim() || undefined,
      });
      showBanner('success', `Cuenta "${accName.trim()}" agregada a Tesorería.`);
    }
    setIsAccountModalOpen(false);
  };

  const fetchEuroRateInto = async (target: 'form' | 'pay') => {
    if (target === 'form') {
      setIsFetchingEuroRate(true);
      setEuroFetchHint('');
    } else {
      setIsFetchingPayEuroRate(true);
    }
    try {
      const result = await fetchOfficialEuroBcvRate();
      if (result.success && result.rate) {
        const formatted = result.rate.toFixed(2);
        saveCommitmentRatePreference('EURO', result.rate);
        if (target === 'form') {
          setCmtAppliedRate(formatted);
          setEuroFetchHint(`Euro BCV actualizado: Bs. ${formatted}`);
        } else {
          setPayAppliedRate(formatted);
        }
      } else if (target === 'form') {
        setEuroFetchHint('No se pudo consultar automáticamente; ingresa la tasa Euro manualmente.');
      }
    } finally {
      if (target === 'form') {
        setIsFetchingEuroRate(false);
      } else {
        setIsFetchingPayEuroRate(false);
      }
    }
  };

  const handleSelectCmtRateType = (nextRateType: TreasuryCommitmentRateType) => {
    setCmtRateType(nextRateType);
    setEuroFetchHint('');
    if (nextRateType === 'BCV') {
      setCmtAppliedRate(bcvRate.toFixed(2));
      return;
    }
    const saved = getSavedCommitmentRate(nextRateType, bcvRate);
    if (saved) {
      setCmtAppliedRate(saved.toFixed(2));
    } else if (nextRateType === 'EURO') {
      setCmtAppliedRate('');
      void fetchEuroRateInto('form');
    } else {
      setCmtAppliedRate('');
    }
  };

  const handleSelectPayRateType = (nextRateType: TreasuryCommitmentRateType) => {
    setPayRateType(nextRateType);
    if (nextRateType === 'BCV') {
      setPayAppliedRate(bcvRate.toFixed(2));
      return;
    }
    const saved = getSavedCommitmentRate(nextRateType, bcvRate);
    if (saved) {
      setPayAppliedRate(saved.toFixed(2));
    } else if (nextRateType === 'EURO') {
      setPayAppliedRate('');
      void fetchEuroRateInto('pay');
    } else {
      setPayAppliedRate('');
    }
  };

  const pendingWorkerCommitments = useMemo(() => {
    return treasuryCommitments
      .filter(
        (cm) => !cm.isPaid && (cm.category === 'NOMINA_SUELDOS' || cm.category === 'GASTOS_FIJOS')
      )
      .sort((a, b) => {
        if (a.category === 'NOMINA_SUELDOS' && b.category !== 'NOMINA_SUELDOS') return -1;
        if (b.category === 'NOMINA_SUELDOS' && a.category !== 'NOMINA_SUELDOS') return 1;
        return (a.dueDate || '').localeCompare(b.dueDate || '');
      });
  }, [treasuryCommitments]);

  const openNewCommitmentModal = () => {
    setEditingCommitment(null);
    setCmtTitle('');
    setCmtWorkerName('');
    setCmtCategory('GASTOS_FIJOS');
    setCmtDueDate(todayStr);
    setCmtAmountUSD('');
    setCmtReservedUSD('');
    setCmtPaymentCurrency('EFECTIVO_USD');
    setCmtRateType('BCV');
    setCmtAppliedRate(bcvRate.toFixed(2));
    setEuroFetchHint('');
    setCmtNotes('');
    setCmtError('');
    setIsCommitmentModalOpen(true);
  };

  const openEditCommitmentModal = (cm: TreasuryCommitment) => {
    const currency: TreasuryCommitmentPaymentCurrency = cm.paymentCurrency || 'EFECTIVO_USD';
    const rateType: TreasuryCommitmentRateType = cm.exchangeRateType || 'BCV';
    const initialRate =
      currency === 'BS'
        ? getEffectiveCommitmentBsRate(cm, bcvRate)
        : bcvRate;

    setEditingCommitment(cm);
    setCmtTitle(cm.title);
    setCmtWorkerName(cm.workerName || '');
    setCmtCategory(cm.category);
    setCmtDueDate(cm.dueDate);
    setCmtAmountUSD(String(cm.amountUSD));
    setCmtReservedUSD(String(cm.reservedUSD || 0));
    setCmtPaymentCurrency(currency);
    setCmtRateType(rateType);
    setCmtAppliedRate(initialRate ? initialRate.toFixed(2) : '');
    setEuroFetchHint('');
    setCmtNotes(cm.notes || '');
    setCmtError('');
    setIsCommitmentModalOpen(true);
  };

  const handleSaveCommitment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!cmtTitle.trim()) {
      setCmtError('Ingresa el concepto o descripción del compromiso');
      return;
    }
    const amount = parseFloat(cmtAmountUSD);
    if (!amount || isNaN(amount) || amount <= 0) {
      setCmtError('Ingresa un monto válido en USD mayor a 0');
      return;
    }

    let finalRateType: TreasuryCommitmentRateType | undefined;
    let finalAppliedRate: number | undefined;

    if (cmtPaymentCurrency === 'BS') {
      const parsedRate = parseFloat(cmtAppliedRate);
      if (!parsedRate || isNaN(parsedRate) || parsedRate <= 0) {
        setCmtError(`Ingresa una tasa válida para ${COMMITMENT_RATE_META[cmtRateType].label}`);
        return;
      }
      finalRateType = cmtRateType;
      finalAppliedRate = Math.round(parsedRate * 100) / 100;
      saveCommitmentRatePreference(cmtRateType, finalAppliedRate);
    }

    const reserved = parseFloat(cmtReservedUSD || '0');
    const cleanReserved = isNaN(reserved) ? 0 : Math.min(amount, Math.max(0, reserved));
    const cleanWorkerName =
      cmtCategory === 'PROVEEDORES' ? undefined : cmtWorkerName.trim() || undefined;

    if (editingCommitment) {
      updateTreasuryCommitment(editingCommitment.id, {
        title: cmtTitle.trim(),
        workerName: cleanWorkerName,
        category: cmtCategory,
        dueDate: cmtDueDate,
        amountUSD: amount,
        reservedUSD: cleanReserved,
        paymentCurrency: cmtPaymentCurrency,
        exchangeRateType: finalRateType,
        appliedExchangeRate: finalAppliedRate,
        notes: cmtNotes.trim() || undefined,
      });
      showBanner('success', `Compromiso "${cmtTitle.trim()}" actualizado.`);
    } else {
      addTreasuryCommitment({
        title: cmtTitle.trim(),
        workerName: cleanWorkerName,
        category: cmtCategory,
        dueDate: cmtDueDate,
        amountUSD: amount,
        reservedUSD: cleanReserved,
        paymentCurrency: cmtPaymentCurrency,
        exchangeRateType: finalRateType,
        appliedExchangeRate: finalAppliedRate,
        notes: cmtNotes.trim() || undefined,
      });
      showBanner('success', `Compromiso "${cmtTitle.trim()}" programado.`);
    }
    setIsCommitmentModalOpen(false);
  };

  const openPayCommitmentModal = (cm: TreasuryCommitment) => {
    const accounts =
      treasuryAccounts.length === 0 ? initializeDefaultTreasuryAccounts() : treasuryAccounts;

    let preferredAccount: TreasuryAccount | undefined;
    if (cm.paymentCurrency === 'BS') {
      preferredAccount =
        accounts.find((a) => a.currency === 'BS' && a.group === 'BANCO_NACIONAL') ||
        accounts.find((a) => a.currency === 'BS');
    } else {
      preferredAccount =
        accounts.find((a) => a.currency === 'USD' && a.group === 'EFECTIVO') ||
        accounts.find((a) => a.currency === 'USD');
    }

    const rateType: TreasuryCommitmentRateType = cm.exchangeRateType || 'BCV';
    const effectiveRate =
      cm.paymentCurrency === 'BS' ? getEffectiveCommitmentBsRate(cm, bcvRate) : bcvRate;

    setPayAccountId(preferredAccount?.id || accounts[0]?.id || '');
    setPayingCommitment(cm);
    setPayDate(todayStr);
    setPayReference('');
    setPaySyncExpense(cm.category !== 'PROVEEDORES');
    setPayRateType(rateType);
    setPayAppliedRate(effectiveRate.toFixed(2));
    setPayError('');
  };

  const handleConfirmPayCommitment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!payingCommitment) return;
    if (!payAccountId) {
      setPayError('Selecciona la cuenta desde la cual se realizará el pago');
      return;
    }

    const isBsCommitment = payingCommitment.paymentCurrency === 'BS';
    let confirmedRate: number | undefined;
    let confirmedRateType: TreasuryCommitmentRateType | undefined;

    if (isBsCommitment) {
      const parsedRate = parseFloat(payAppliedRate);
      if (!parsedRate || isNaN(parsedRate) || parsedRate <= 0) {
        setPayError(`Ingresa una tasa válida para ${COMMITMENT_RATE_META[payRateType].label}`);
        return;
      }
      confirmedRate = Math.round(parsedRate * 100) / 100;
      confirmedRateType = payRateType;
      saveCommitmentRatePreference(payRateType, confirmedRate);
    }

    const result = markCommitmentPaidFromAccount(payingCommitment.id, payAccountId, {
      paymentDate: payDate,
      reference: payReference.trim() || undefined,
      syncToExpense: paySyncExpense,
      appliedExchangeRate: confirmedRate,
      exchangeRateType: confirmedRateType,
    });
    if (result) {
      const paidSummary =
        isBsCommitment && confirmedRate && confirmedRateType
          ? `${formatBs(payingCommitment.amountUSD * confirmedRate)} (${COMMITMENT_RATE_META[confirmedRateType].label}: ${confirmedRate.toFixed(2)})`
          : formatUSD(payingCommitment.amountUSD);
      showBanner(
        'success',
        `Pago de ${paidSummary} descontado de "${result.account.name}".`
      );
      setPayingCommitment(null);
    } else {
      setPayError('No se pudo procesar el pago. Verifica la cuenta seleccionada.');
    }
  };

  const openMovementModal = (defaultType: 'INGRESO' | 'GASTO' = 'GASTO') => {
    let accounts = treasuryAccounts;
    if (accounts.length === 0) {
      accounts = initializeDefaultTreasuryAccounts();
    }
    const firstAcc = accounts[0];
    setMovType(defaultType);
    setMovAccountId(firstAcc?.id || '');
    setMovInputCurrency(firstAcc?.currency || 'USD');
    setMovDate(todayStr);
    setMovCategory(
      defaultType === 'INGRESO'
        ? 'Ingreso de Ventas / Caja'
        : expenseCategories[0] || 'Servicios Básicos'
    );
    setMovDescription('');
    setMovBeneficiary('');
    setMovAmountInput('');
    setMovReference('');
    setMovSyncExpense(defaultType === 'GASTO');
    setMovIsSalaryAdvance(false);
    setMovLinkedCommitmentId('');
    setMovError('');
    setIsMovementModalOpen(true);
  };

  const openValeModalForCommitment = (cm: TreasuryCommitment) => {
    let accounts = treasuryAccounts;
    if (accounts.length === 0) {
      accounts = initializeDefaultTreasuryAccounts();
    }
    const preferredAccount =
      cm.paymentCurrency === 'BS'
        ? accounts.find((a) => a.currency === 'BS' && a.group === 'BANCO_NACIONAL') ||
          accounts.find((a) => a.currency === 'BS') ||
          accounts[0]
        : accounts.find((a) => a.currency === 'USD' && a.group === 'EFECTIVO') ||
          accounts.find((a) => a.currency === 'USD') ||
          accounts[0];

    const workerLabel = cm.workerName?.trim() || cm.title;
    const valeCategory =
      expenseCategories.find((cat) => cat.toLowerCase().includes('vale')) ||
      'Vales / Adelantos de Sueldo';

    setMovType('GASTO');
    setMovAccountId(preferredAccount?.id || '');
    setMovInputCurrency(preferredAccount?.currency || 'USD');
    setMovDate(todayStr);
    setMovCategory(valeCategory);
    setMovDescription(`Vale / adelanto de sueldo - ${workerLabel}`);
    setMovBeneficiary(workerLabel);
    setMovAmountInput('');
    setMovReference('');
    setMovSyncExpense(true);
    setMovIsSalaryAdvance(true);
    setMovLinkedCommitmentId(cm.id);
    setMovError('');
    setIsMovementModalOpen(true);
  };

  const handleSelectMovSalaryCommitment = (commitmentId: string) => {
    setMovLinkedCommitmentId(commitmentId);
    if (movError) setMovError('');
    const cm = treasuryCommitments.find((c) => c.id === commitmentId);
    if (!cm) return;
    const workerLabel = cm.workerName?.trim() || cm.title;
    if (!movBeneficiary.trim()) {
      setMovBeneficiary(workerLabel);
    }
    if (!movDescription.trim()) {
      setMovDescription(`Vale / adelanto de sueldo - ${workerLabel}`);
    }
  };

  const handleMovementAccountChange = (newAccId: string) => {
    setMovAccountId(newAccId);
    const acc = treasuryAccounts.find((a) => a.id === newAccId);
    if (acc) {
      setMovInputCurrency(acc.currency);
    }
  };

  const handleSaveMovement = (e: React.FormEvent) => {
    e.preventDefault();
    if (!movAccountId) {
      setMovError('Selecciona una cuenta afectada');
      return;
    }
    if (!movDescription.trim()) {
      setMovError('Ingresa la descripción del movimiento');
      return;
    }
    const amount = parseFloat(movAmountInput);
    if (!amount || isNaN(amount) || amount <= 0) {
      setMovError('Ingresa un monto válido mayor a 0');
      return;
    }
    if (movType === 'GASTO' && movIsSalaryAdvance && !movLinkedCommitmentId) {
      setMovError('Selecciona el sueldo o gasto fijo del trabajador para descontar este vale');
      return;
    }

    const res = recordTreasuryMovement({
      date: movDate,
      type: movType,
      accountId: movAccountId,
      category: movCategory.trim() || (movType === 'INGRESO' ? 'Ingreso Operativo' : 'Otros Gastos'),
      description: movDescription.trim(),
      beneficiary: movBeneficiary.trim() || undefined,
      amountInput: amount,
      inputCurrency: movInputCurrency,
      bcvRate,
      reference: movReference.trim() || undefined,
      syncToExpense: movType === 'GASTO' && movSyncExpense,
      isSalaryAdvance: movType === 'GASTO' && movIsSalaryAdvance,
      linkedCommitmentId:
        movType === 'GASTO' && movIsSalaryAdvance ? movLinkedCommitmentId : undefined,
    });

    if (res) {
      const advanceFeedback = res.updatedCommitment
        ? ` · Vale descontado de "${res.updatedCommitment.title}" (Restante: ${formatUSD(res.updatedCommitment.amountUSD)}).`
        : '';
      showBanner(
        'success',
        `${movType === 'INGRESO' ? 'Ingreso' : 'Gasto'} registrado (${res.movement.movementNumber}). Saldo actualizado en ${res.account.name}.${advanceFeedback}`
      );
      setIsMovementModalOpen(false);
    } else {
      setMovError('No se pudo registrar el movimiento.');
    }
  };

  const selectedMovementPreviewUSD = useMemo(() => {
    const val = parseFloat(movAmountInput || '0');
    if (isNaN(val) || val <= 0) return 0;
    if (movInputCurrency === 'BS') {
      return Math.round((val / bcvRate) * 100) / 100;
    }
    return Math.round(val * 100) / 100;
  }, [movAmountInput, movInputCurrency, bcvRate]);

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4">
        <div className="space-y-1">
          <div className="flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center shrink-0">
              <Landmark className="w-5 h-5" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900">
                Tesorería y Finanzas
              </h1>
              <p className="text-xs text-slate-500">
                Control operativo de liquidez por cuentas, planificación de compromisos y flujo de caja · Tasa BCV:{' '}
                <span className="font-mono font-semibold text-slate-700 tabular-nums">
                  Bs. {bcvRate.toFixed(2)}
                </span>
              </p>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => openNewAccountModal('EFECTIVO')}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Wallet className="w-3.5 h-3.5 text-slate-500" />
            Nueva Cuenta
          </button>
          <button
            type="button"
            onClick={openNewCommitmentModal}
            className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <CalendarClock className="w-3.5 h-3.5 text-slate-500" />
            Planificar Pago
          </button>
          <button
            type="button"
            onClick={() => openMovementModal('GASTO')}
            className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            Registrar Gasto o Ingreso
          </button>
        </div>
      </div>

      {/* Transient Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`flex items-center justify-between gap-3 px-4 py-3 rounded-xl border text-xs font-semibold ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
              : feedbackBanner.type === 'error'
                ? 'bg-rose-50 border-rose-200 text-rose-800'
                : 'bg-blue-50 border-blue-200 text-blue-800'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedbackBanner.message}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-1 rounded-lg hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* 1. Top 4 KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {/* KPI 1: Liquidez Disponible */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Liquidez Disponible
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <Wallet className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
              {formatUSD(totalLiquidityUSD)}
            </p>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
              {formatBs(totalLiquidityBs)}
            </p>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            <span>Cuentas consolidadas</span>
            <span className="font-semibold text-emerald-700 font-mono tabular-nums">
              {treasuryAccounts.length} {treasuryAccounts.length === 1 ? 'cuenta' : 'cuentas'}
            </span>
          </div>
        </div>

        {/* KPI 2: Compromisos por Pagar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Compromisos por Pagar
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center shrink-0">
              <CalendarClock className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
              {formatUSD(pendingCommitmentsUSD)}
            </p>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
              {formatBs(pendingCommitmentsBs)}
            </p>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            <span>Pendientes de pago</span>
            <span
              className={`font-semibold px-2 py-0.5 rounded-md border ${
                urgentCommitmentsCount > 0
                  ? 'bg-amber-50 text-amber-800 border-amber-200'
                  : 'bg-slate-100 text-slate-700 border-slate-200'
              }`}
            >
              {urgentCommitmentsCount > 0
                ? `${urgentCommitmentsCount} próximos a vencer`
                : 'Al día'}
            </span>
          </div>
        </div>

        {/* KPI 3: Saldo Libre Proyectado (Auto-calculated) */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Saldo Libre Proyectado
            </span>
            <div
              className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                projectedFreeBalanceUSD >= 0
                  ? 'bg-slate-900 text-amber-400'
                  : 'bg-rose-50 text-rose-600'
              }`}
            >
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p
              className={`text-2xl font-bold font-mono tabular-nums tracking-tight ${
                projectedFreeBalanceUSD >= 0 ? 'text-slate-900' : 'text-rose-600'
              }`}
            >
              {projectedFreeBalanceUSD < 0 ? '-' : ''}
              {formatUSD(Math.abs(projectedFreeBalanceUSD))}
            </p>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
              {projectedFreeBalanceBs < 0 ? '-' : ''}
              {formatBs(Math.abs(projectedFreeBalanceBs))}
            </p>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            <span>Liquidez − Compromisos</span>
            <span
              className={`font-semibold px-2 py-0.5 rounded-md border ${
                projectedFreeBalanceUSD >= 0
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                  : 'bg-rose-50 text-rose-700 border-rose-200'
              }`}
            >
              {projectedFreeBalanceUSD >= 0 ? 'Superávit' : 'Déficit'}
            </span>
          </div>
        </div>

        {/* KPI 4: Cuentas por Cobrar */}
        <div className="bg-white rounded-2xl border border-slate-200 p-5 flex flex-col justify-between gap-3">
          <div className="flex items-center justify-between gap-2">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Cuentas por Cobrar
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
              <Users className="w-4 h-4" />
            </div>
          </div>
          <div>
            <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums tracking-tight">
              {formatUSD(totalAccountsReceivableUSD)}
            </p>
            <p className="text-xs text-slate-500 font-mono tabular-nums mt-0.5">
              {formatBs(totalAccountsReceivableBs)}
            </p>
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-slate-100 text-[11px] text-slate-500">
            <span>{pendingCreditSales.length} facturas pendientes</span>
            <button
              type="button"
              onClick={() => setCurrentView('admin_cuentas_cobrar')}
              className="font-semibold text-blue-600 hover:text-blue-700 cursor-pointer whitespace-nowrap"
            >
              Ver cartera →
            </button>
          </div>
        </div>
      </div>

      {/* 2. Visual Breakdown of Balances by Account Group */}
      <section className="bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              Desglose Visual de Saldos por Cuenta
            </h2>
            <p className="text-xs text-slate-500">
              Distribución de efectivo, bancos nacionales y billeteras digitales / divisas
            </p>
          </div>
          <div className="flex items-center gap-2">
            {treasuryAccounts.length === 0 && (
              <button
                type="button"
                onClick={() => {
                  initializeDefaultTreasuryAccounts();
                  showBanner('success', 'Se crearon las cuentas base de Tesorería.');
                }}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-xs font-semibold text-amber-900 transition-colors cursor-pointer whitespace-nowrap"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                Crear cuentas base
              </button>
            )}
            <button
              type="button"
              onClick={() => openNewAccountModal('EFECTIVO')}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-slate-200 hover:bg-slate-50 text-xs font-semibold text-slate-700 transition-colors cursor-pointer whitespace-nowrap"
            >
              <Plus className="w-3.5 h-3.5" />
              Agregar cuenta
            </button>
          </div>
        </div>

        {/* Visual Distribution Bar */}
        <div className="space-y-2">
          <div className="h-3 w-full rounded-full bg-slate-100 overflow-hidden flex">
            {accountBreakdown.map((grp) =>
              grp.sharePct > 0 ? (
                <div
                  key={grp.group}
                  style={{ width: `${grp.sharePct}%` }}
                  className={`${ACCOUNT_GROUP_META[grp.group].barColor} h-full transition-all duration-300`}
                  title={`${ACCOUNT_GROUP_META[grp.group].label}: ${grp.sharePct}%`}
                />
              ) : null
            )}
          </div>
          <div className="flex flex-wrap items-center gap-x-6 gap-y-2 text-xs">
            {accountBreakdown.map((grp) => {
              const meta = ACCOUNT_GROUP_META[grp.group];
              return (
                <div key={grp.group} className="flex items-center gap-2">
                  <span className={`w-2.5 h-2.5 rounded-full ${meta.barColor} shrink-0`} />
                  <span className="text-slate-600 font-medium">{meta.label}:</span>
                  <span className="font-mono font-bold text-slate-900 tabular-nums">
                    {formatUSD(grp.totalUSD)}
                  </span>
                  <span className="font-mono text-slate-400 tabular-nums">
                    ({grp.sharePct.toFixed(1)}%)
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* 3 Account Group Columns */}
        {treasuryAccounts.length === 0 ? (
          <div className="py-8 px-4 text-center rounded-xl bg-slate-50 border border-dashed border-slate-200 space-y-3">
            <Wallet className="w-8 h-8 text-slate-400 mx-auto" />
            <div className="space-y-1">
              <p className="text-sm font-semibold text-slate-800">
                Aún no hay cuentas de tesorería configuradas
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Crea las cuentas iniciales estándar (Efectivo USD/Bs, Banco Nacional y Billetera USDT) o agrega una cuenta personalizada.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={() => {
                  initializeDefaultTreasuryAccounts();
                  showBanner('success', 'Cuentas iniciales de Tesorería creadas.');
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer"
              >
                <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                Inicializar Cuentas Estándar
              </button>
              <button
                type="button"
                onClick={() => openNewAccountModal('EFECTIVO')}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                Cuenta Manual
              </button>
            </div>
          </div>
        ) : (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            {accountBreakdown.map((grp) => {
              const meta = ACCOUNT_GROUP_META[grp.group];
              const GroupIcon = meta.icon;
              return (
                <div
                  key={grp.group}
                  className="rounded-xl bg-slate-50/70 border border-slate-200 p-4 flex flex-col gap-3"
                >
                  <div className="flex items-center justify-between gap-2 pb-2 border-b border-slate-200/80">
                    <div className="flex items-center gap-2 min-w-0">
                      <div className={`w-8 h-8 rounded-lg ${meta.iconBg} flex items-center justify-center shrink-0`}>
                        <GroupIcon className="w-4 h-4" />
                      </div>
                      <div className="min-w-0">
                        <h3 className="text-xs font-bold text-slate-900 truncate">
                          {meta.label}
                        </h3>
                        <span className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {grp.sharePct.toFixed(1)}% de liquidez
                        </span>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <p className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                        {formatUSD(grp.totalUSD)}
                      </p>
                      <button
                        type="button"
                        onClick={() => openNewAccountModal(grp.group)}
                        className="text-[11px] font-semibold text-slate-500 hover:text-slate-900 cursor-pointer"
                      >
                        + Añadir
                      </button>
                    </div>
                  </div>

                  {grp.accounts.length === 0 ? (
                    <div className="py-4 text-center text-xs text-slate-400">
                      Sin cuentas en este grupo
                    </div>
                  ) : (
                    <div className="divide-y divide-slate-200/70">
                      {grp.accounts.map((acc) => (
                        <div
                          key={acc.id}
                          className="py-2.5 first:pt-0 last:pb-0 flex items-center justify-between gap-2 group"
                        >
                          <div className="min-w-0">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-semibold text-slate-800 truncate">
                                {acc.name}
                              </span>
                              <span className="text-[10px] font-mono font-semibold px-1.5 py-0.2 rounded bg-white border border-slate-200 text-slate-600 shrink-0">
                                {acc.currency}
                              </span>
                            </div>
                            {acc.institution && (
                              <p className="text-[11px] text-slate-500 truncate">
                                {acc.institution}
                                {acc.accountNumber ? ` · ${acc.accountNumber}` : ''}
                              </p>
                            )}
                          </div>

                          <div className="flex items-center gap-2 shrink-0">
                            <div className="text-right">
                              <p
                                className={`text-xs font-bold font-mono tabular-nums ${
                                  acc.liveUSD < 0 ? 'text-rose-600' : 'text-slate-900'
                                }`}
                              >
                                {formatNativeBalance(acc.currency, acc.nativeBalance)}
                              </p>
                              {acc.currency === 'BS' ? (
                                <p className="text-[10px] text-slate-500 font-mono tabular-nums">
                                  ≈ {formatUSD(acc.liveUSD)}
                                </p>
                              ) : (
                                <p className="text-[10px] text-slate-500 font-mono tabular-nums">
                                  ≈ {formatBs(acc.liveUSD * bcvRate)}
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-0.5 opacity-80 group-hover:opacity-100">
                              <button
                                type="button"
                                onClick={() => openEditAccountModal(acc)}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-white cursor-pointer"
                                title="Editar cuenta o ajustar saldo"
                              >
                                <Pencil className="w-3.5 h-3.5" />
                              </button>
                              <button
                                type="button"
                                onClick={() => {
                                  deleteTreasuryAccount(acc.id);
                                  showBanner('info', `Cuenta "${acc.name}" eliminada.`);
                                }}
                                className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-white cursor-pointer"
                                title="Eliminar cuenta"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </section>

      {/* 3. Main Split Body: Left (Planificación de Pagos y Gastos Fijos) + Right (Progreso de Cobertura Mensual) */}
      <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
        {/* Left Section: Planificación de Pagos y Gastos Fijos (8 cols on xl, 9 cols on 2xl) */}
        <section className="xl:col-span-8 2xl:col-span-9 bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="p-4 sm:p-5 border-b border-slate-200 space-y-3.5">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div className="min-w-0">
                <h2 className="text-base font-bold text-slate-900">
                  Planificación de Pagos y Gastos Fijos
                </h2>
                <p className="text-xs text-slate-500">
                  Control de Gastos Fijos, Nómina/Sueldos y Proveedores con acciones rápidas sin desplazamiento
                </p>
              </div>
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {unimportedUnpaidPurchaseCount > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      const count = importUnpaidPurchaseOrdersToCommitments();
                      showBanner(
                        'success',
                        `Se importaron ${count} cuentas por pagar de Proveedores.`
                      );
                    }}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-amber-50 hover:bg-amber-100 border border-amber-200 text-xs font-semibold text-amber-900 cursor-pointer whitespace-nowrap shrink-0"
                  >
                    <Truck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    Importar Proveedores ({unimportedUnpaidPurchaseCount})
                  </button>
                )}
                <button
                  type="button"
                  onClick={openNewCommitmentModal}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer whitespace-nowrap shrink-0"
                >
                  <Plus className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                  Nuevo Compromiso
                </button>
              </div>
            </div>

            {/* Category + Status Filters */}
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-1.5">
                {(
                  [
                    { id: 'ALL', label: 'Todos' },
                    { id: 'GASTOS_FIJOS', label: 'Gastos Fijos' },
                    { id: 'NOMINA_SUELDOS', label: 'Nómina/Sueldos' },
                    { id: 'PROVEEDORES', label: 'Proveedores' },
                  ] as const
                ).map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setCommitmentCategoryFilter(tab.id)}
                    className={`px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      commitmentCategoryFilter === tab.id
                        ? 'bg-slate-900 text-white'
                        : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg shrink-0">
                {(
                  [
                    { id: 'ALL', label: 'Todos' },
                    { id: 'PENDING', label: 'Pendientes' },
                    { id: 'PAID', label: 'Pagados' },
                  ] as const
                ).map((st) => (
                  <button
                    key={st.id}
                    type="button"
                    onClick={() => setCommitmentStatusFilter(st.id)}
                    className={`px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      commitmentStatusFilter === st.id
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

          {/* Zero-Horizontal-Scroll Interactive Ledger List */}
          {filteredCommitments.length === 0 ? (
            <div className="py-12 px-6 text-center space-y-3">
              <CalendarClock className="w-9 h-9 text-slate-300 mx-auto" />
              <div className="space-y-1">
                <p className="text-sm font-semibold text-slate-800">
                  Sin pagos planificados en este filtro
                </p>
                <p className="text-xs text-slate-500">
                  Agrega alquileres, sueldos o facturas de proveedores para controlar sus fechas límite y descontarlos de tus cuentas.
                </p>
              </div>
              <button
                type="button"
                onClick={openNewCommitmentModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold cursor-pointer whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5 text-amber-400" />
                Agregar Compromiso
              </button>
            </div>
          ) : (
            <div>
              {/* Compact Column Guide Header (visible on md+) */}
              <div className="hidden md:flex items-center justify-between gap-3 px-4 sm:px-5 py-2.5 border-b border-slate-200 bg-slate-50/70 text-[11px] font-semibold text-slate-500">
                <span>Concepto, detalle y vencimiento</span>
                <div className="flex items-center gap-3 shrink-0">
                  <span className="w-28 text-right">Monto</span>
                  <span className="w-[224px] text-right">Herramientas</span>
                </div>
              </div>

              <div className="divide-y divide-slate-100">
                {filteredCommitments.map((cm) => {
                  const catMeta = COMMITMENT_CATEGORY_META[cm.category];
                  const statusInfo = getCommitmentDisplayStatus(cm);
                  const isBsCommitment = cm.paymentCurrency === 'BS';
                  const rateType: TreasuryCommitmentRateType = cm.exchangeRateType || 'BCV';
                  const rateMeta = COMMITMENT_RATE_META[rateType];
                  const effectiveBsRate = isBsCommitment
                    ? getEffectiveCommitmentBsRate(cm, bcvRate)
                    : null;
                  const canTakeVale = !cm.isPaid && cm.category !== 'PROVEEDORES';

                  return (
                    <div
                      key={cm.id}
                      className="px-4 sm:px-5 py-3.5 hover:bg-slate-50/80 transition-colors flex flex-col md:flex-row md:items-center justify-between gap-3"
                    >
                      {/* Left: Title, Status, and Clean Inline Metadata */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                          <p className="text-[13px] font-semibold text-slate-900 leading-snug break-words">
                            {cm.title}
                          </p>
                          <span
                            className={`inline-flex items-center gap-1 text-[11px] font-semibold whitespace-nowrap shrink-0 ${statusInfo.textClass}`}
                          >
                            {statusInfo.status === 'PAGADO' && (
                              <CheckCircle2 className="w-3.5 h-3.5 shrink-0" />
                            )}
                            {statusInfo.status === 'PROXIMO_VENCER' && (
                              <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            )}
                            {statusInfo.status === 'PENDIENTE' && (
                              <Clock className="w-3.5 h-3.5 shrink-0" />
                            )}
                            {statusInfo.shortLabel}
                          </span>
                        </div>

                        {/* Unboxed Metadata Line with Typographic Separators */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-slate-500">
                          <span className="font-medium text-slate-700">{catMeta.shortLabel}</span>
                          {cm.workerName && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span className="font-medium text-indigo-700">{cm.workerName}</span>
                            </>
                          )}
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="font-mono tabular-nums text-slate-600">
                            Límite {cm.dueDate}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className={isBsCommitment ? 'text-blue-700 font-medium' : 'text-emerald-700 font-medium'}>
                            {isBsCommitment ? `Bs (${rateMeta.shortLabel})` : 'Efectivo $'}
                          </span>
                          {(cm.advancesTotalUSD || 0) > 0 && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span className="font-mono font-semibold text-indigo-700 tabular-nums">
                                Vales: -{formatUSD(cm.advancesTotalUSD || 0)}
                              </span>
                            </>
                          )}
                          {!cm.isPaid && (cm.reservedUSD || 0) > 0 && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span className="font-mono font-semibold text-emerald-700 tabular-nums">
                                Apartado: {formatUSD(cm.reservedUSD || 0)}
                              </span>
                            </>
                          )}
                          {cm.isPaid && cm.paidAccountName && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span className="text-slate-500">Vía {cm.paidAccountName}</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Right: Amount + Complete Toolbar (Always Visible, Zero Overflow) */}
                      <div className="flex flex-wrap sm:flex-nowrap items-center justify-between md:justify-end gap-3 shrink-0 pt-2 md:pt-0 border-t border-slate-100 md:border-t-0">
                        {/* Amount Column */}
                        <div className="text-left md:text-right md:w-28 shrink-0">
                          <p className="text-sm font-bold text-slate-900 font-mono tabular-nums leading-tight">
                            {formatUSD(cm.amountUSD)}
                          </p>
                          {(cm.advancesTotalUSD || 0) > 0 && (
                            <p className="text-[10px] text-indigo-700 font-mono tabular-nums">
                              Base:{' '}
                              {formatUSD(
                                cm.originalAmountUSD ||
                                  cm.amountUSD + (cm.advancesTotalUSD || 0)
                              )}
                            </p>
                          )}
                          {isBsCommitment && effectiveBsRate ? (
                            <p className="text-[10px] text-slate-500 font-mono tabular-nums">
                              {formatBs(cm.amountUSD * effectiveBsRate)}
                            </p>
                          ) : (
                            <p className="text-[10px] text-emerald-700 font-medium">
                              Efectivo $
                            </p>
                          )}
                        </div>

                        {/* All Action Tools — Compact, Accessible, Zero Scroll */}
                        <div className="flex items-center justify-end gap-1 md:w-[224px] shrink-0">
                          {!cm.isPaid ? (
                            <>
                              <button
                                type="button"
                                onClick={() => openPayCommitmentModal(cm)}
                                className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                                title="Marcar compromiso como pagado desde una cuenta"
                              >
                                <Check className="w-3.5 h-3.5 shrink-0" />
                                Pagar
                              </button>
                              {canTakeVale && (
                                <button
                                  type="button"
                                  onClick={() => openValeModalForCommitment(cm)}
                                  className="inline-flex items-center gap-1 px-2 py-1.5 rounded-lg border border-indigo-200 bg-indigo-50 hover:bg-indigo-100 text-indigo-700 text-[11px] font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                                  title="Registrar vale / adelanto a este sueldo o gasto fijo"
                                >
                                  <UserCheck className="w-3.5 h-3.5 shrink-0" />
                                  Vale
                                </button>
                              )}
                              <button
                                type="button"
                                onClick={() => {
                                  setReservingCommitment(cm);
                                  setReserveInput(String(cm.reservedUSD || 0));
                                }}
                                className="p-1.5 rounded-lg border border-slate-200 text-slate-500 hover:text-emerald-700 hover:bg-emerald-50 transition-colors cursor-pointer shrink-0"
                                title="Apartar monto para cobertura"
                                aria-label="Apartar monto para cobertura"
                              >
                                <PiggyBank className="w-3.5 h-3.5" />
                              </button>
                            </>
                          ) : (
                            <span className="text-[11px] text-emerald-700 font-semibold px-2 whitespace-nowrap">
                              Liquidado
                            </span>
                          )}
                          <button
                            type="button"
                            onClick={() => openEditCommitmentModal(cm)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer shrink-0"
                            title="Editar compromiso"
                            aria-label="Editar compromiso"
                          >
                            <Pencil className="w-3.5 h-3.5" />
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              deleteTreasuryCommitment(cm.id);
                              showBanner('info', `Compromiso "${cm.title}" eliminado.`);
                            }}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer shrink-0"
                            title="Eliminar compromiso"
                            aria-label="Eliminar compromiso"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* Right Section: Progreso de Cobertura Mensual (4 cols on xl, 3 cols on 2xl) */}
        <section className="xl:col-span-4 2xl:col-span-3 bg-white rounded-2xl border border-slate-200 p-5 space-y-5">
          <div className="flex items-start justify-between gap-2">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Progreso de Cobertura Mensual
              </h2>
              <p className="text-xs text-slate-500">
                Dinero disponible / apartado frente al total de gastos fijos del mes
              </p>
            </div>
            <div className="w-9 h-9 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
          </div>

          {/* Main Coverage Percentage & Progress Bar */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-4 space-y-3">
            <div className="flex items-baseline justify-between">
              <span className="text-xs font-semibold text-slate-600">
                Cobertura Total del Mes
              </span>
              <span className="text-2xl font-bold text-slate-900 font-mono tabular-nums">
                {coverageStats.coveragePercent}%
              </span>
            </div>

            {/* Stacked Progress Bar: Paid (emerald-600) + Liquidity-backed/Reserved (amber-400) */}
            <div className="h-3.5 w-full rounded-full bg-slate-200 overflow-hidden flex">
              <div
                style={{ width: `${coverageStats.paidPercent}%` }}
                className="bg-emerald-600 h-full transition-all duration-300"
                title={`Pagado: ${formatUSD(coverageStats.paidUSD)}`}
              />
              <div
                style={{
                  width: `${Math.max(
                    0,
                    coverageStats.coveragePercent - coverageStats.paidPercent
                  )}%`,
                }}
                className="bg-amber-400 h-full transition-all duration-300"
                title={`Disponible / Apartado para cubrir pendientes: ${formatUSD(
                  coverageStats.liquidityBackedUSD
                )}`}
              />
            </div>

            <div className="grid grid-cols-2 gap-3 pt-1 text-xs">
              <div>
                <p className="text-[11px] text-slate-500">Cubierto / Disponible</p>
                <p className="font-bold text-emerald-700 font-mono tabular-nums">
                  {formatUSD(coverageStats.effectiveCoveredUSD)}
                </p>
              </div>
              <div className="text-right">
                <p className="text-[11px] text-slate-500">Total Compromisos Mes</p>
                <p className="font-bold text-slate-900 font-mono tabular-nums">
                  {formatUSD(coverageStats.totalMonthlyUSD)}
                </p>
              </div>
            </div>
          </div>

          {/* Key Coverage Breakdown Rows */}
          <div className="divide-y divide-slate-100 text-xs">
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-600 shrink-0" />
                <span className="text-slate-600">Ya pagado este mes</span>
              </div>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {formatUSD(coverageStats.paidUSD)}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-400 shrink-0" />
                <span className="text-slate-600">Apartado manualmente</span>
              </div>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {formatUSD(coverageStats.explicitlyReservedUSD)}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600">Pendiente total por pagar</span>
              <span className="font-mono font-bold text-slate-900 tabular-nums">
                {formatUSD(coverageStats.pendingTotalUSD)}
              </span>
            </div>
            <div className="py-2.5 flex items-center justify-between">
              <span className="text-slate-600">Faltante por cubrir</span>
              <span
                className={`font-mono font-bold tabular-nums ${
                  coverageStats.uncoveredUSD > 0
                    ? 'text-rose-600'
                    : 'text-emerald-700'
                }`}
              >
                {coverageStats.uncoveredUSD > 0
                  ? formatUSD(coverageStats.uncoveredUSD)
                  : '$0.00 (100% cubierto)'}
              </span>
            </div>
          </div>

          {/* Per-Category Coverage Progress */}
          <div className="pt-2 border-t border-slate-100 space-y-3">
            <p className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">
              Avance por Categoría
            </p>
            {coverageStats.byCategory.map((cat) => (
              <div key={cat.category} className="space-y-1.5">
                <div className="flex items-center justify-between text-xs">
                  <span className="font-semibold text-slate-700">
                    {cat.label}{' '}
                    <span className="text-slate-400 font-normal">({cat.count})</span>
                  </span>
                  <span className="font-mono text-slate-800 tabular-nums font-semibold">
                    {formatUSD(cat.paidUSD + cat.reservedUSD)} / {formatUSD(cat.totalUSD)}
                  </span>
                </div>
                <div className="h-2 w-full rounded-full bg-slate-100 overflow-hidden">
                  <div
                    style={{ width: `${cat.pct}%` }}
                    className="h-full bg-slate-900 rounded-full transition-all duration-300"
                  />
                </div>
              </div>
            ))}
          </div>
        </section>
      </div>

      {/* 3.5. Deudas y Planificación de Pago */}
      <TreasuryDebtsSection showBanner={showBanner} />

      {/* 4. Bottom Section: Movimientos Recientes + Primary Action Button */}
      <section className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
        <div className="p-5 border-b border-slate-200 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
            <div>
              <h2 className="text-base font-bold text-slate-900">
                Movimientos Recientes de Tesorería
              </h2>
              <p className="text-xs text-slate-500">
                Historial unificado de ingresos, gastos operativos y pagos planificados
              </p>
            </div>
            <button
              type="button"
              onClick={() => openMovementModal('GASTO')}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer whitespace-nowrap shrink-0"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              Registrar Nuevo Gasto o Ingreso
            </button>
          </div>

          {/* Type Filters, Account Filter & Search */}
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              {(
                [
                  { id: 'ALL', label: 'Todos' },
                  { id: 'INGRESO', label: 'Ingresos' },
                  { id: 'GASTO', label: 'Gastos' },
                  { id: 'PAGO_PLANIFICADO', label: 'Pagos Planificados' },
                ] as const
              ).map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setMovementTypeFilter(f.id)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer ${
                    movementTypeFilter === f.id
                      ? 'bg-slate-900 text-white'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <select
                value={movementAccountFilter}
                onChange={(e) => setMovementAccountFilter(e.target.value)}
                className="px-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
              >
                <option value="ALL">Todas las cuentas</option>
                {treasuryAccounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name}
                  </option>
                ))}
              </select>

              <div className="relative">
                <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={movementSearch}
                  onChange={(e) => setMovementSearch(e.target.value)}
                  placeholder="Buscar movimiento..."
                  className="pl-8 pr-3 py-1.5 rounded-lg border border-slate-200 bg-white text-xs text-slate-800 w-full sm:w-56 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                />
              </div>
            </div>
          </div>
        </div>

        {filteredMovements.length === 0 ? (
          <div className="py-10 px-6 text-center space-y-2.5">
            <p className="text-sm font-semibold text-slate-800">
              No hay movimientos registrados con este filtro
            </p>
            <p className="text-xs text-slate-500">
              Registra un ingreso o gasto desde el botón principal para actualizar tus saldos en tiempo real.
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50/70 text-[11px] font-bold text-slate-500 uppercase tracking-wider">
                  <th className="py-3 px-4 whitespace-nowrap">Fecha / Folio</th>
                  <th className="py-3 px-3 whitespace-nowrap">Tipo</th>
                  <th className="py-3 px-3">Concepto y Categoría</th>
                  <th className="py-3 px-3 whitespace-nowrap">Cuenta</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Monto</th>
                  <th className="py-3 px-3 text-right whitespace-nowrap"></th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredMovements.map((mv) => {
                  const isIngreso = mv.type === 'INGRESO';
                  return (
                    <tr key={mv.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 whitespace-nowrap">
                        <p className="font-mono font-semibold text-slate-800 tabular-nums">
                          {mv.date}
                        </p>
                        <p className="text-[11px] font-mono text-slate-400">
                          {mv.movementNumber}
                        </p>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span
                          className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[11px] font-semibold border ${
                            isIngreso
                              ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                              : mv.type === 'PAGO_PLANIFICADO'
                                ? 'bg-blue-50 text-blue-700 border-blue-200'
                                : 'bg-rose-50 text-rose-700 border-rose-200'
                          }`}
                        >
                          {isIngreso ? (
                            <ArrowUpRight className="w-3 h-3" />
                          ) : (
                            <ArrowDownRight className="w-3 h-3" />
                          )}
                          {isIngreso
                            ? 'Ingreso'
                            : mv.type === 'PAGO_PLANIFICADO'
                              ? 'Pago Planificado'
                              : 'Gasto'}
                        </span>
                      </td>

                      <td className="py-3 px-3">
                        <p className="font-semibold text-slate-900">{mv.description}</p>
                        <p className="text-[11px] text-slate-500">
                          {mv.category}
                          {mv.reference ? ` · Ref: ${mv.reference}` : ''}
                        </p>
                      </td>

                      <td className="py-3 px-3 whitespace-nowrap">
                        <span className="text-xs font-medium text-slate-700">
                          {mv.accountName}
                        </span>
                      </td>

                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <p
                          className={`font-bold font-mono tabular-nums ${
                            isIngreso ? 'text-emerald-700' : 'text-rose-700'
                          }`}
                        >
                          {isIngreso ? '+' : '-'}
                          {formatUSD(mv.amountUSD)}
                        </p>
                        <p className="text-[11px] text-slate-500 font-mono tabular-nums">
                          {formatBs(mv.amountBs)}
                        </p>
                      </td>

                      <td className="py-3 px-3 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            deleteTreasuryMovement(mv.id, true);
                            showBanner(
                              'info',
                              `Movimiento ${mv.movementNumber} eliminado y saldo revertido.`
                            );
                          }}
                          className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                          title="Eliminar movimiento y revertir saldo de cuenta"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>

      {/* Modal: Create / Edit Treasury Account */}
      {isAccountModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {editingAccount ? 'Editar Cuenta de Tesorería' : 'Nueva Cuenta de Tesorería'}
              </h3>
              <button
                type="button"
                onClick={() => setIsAccountModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveAccount} className="p-5 space-y-4 text-xs">
              {accError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                  {accError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nombre de la Cuenta *
                </label>
                <input
                  type="text"
                  value={accName}
                  onChange={(e) => setAccName(e.target.value)}
                  placeholder="Ej: Banco Mercantil Bs, Caja USD, Binance USDT"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Tipo / Grupo
                  </label>
                  <select
                    value={accGroup}
                    onChange={(e) => setAccGroup(e.target.value as TreasuryAccountGroup)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  >
                    <option value="EFECTIVO">Efectivo</option>
                    <option value="BANCO_NACIONAL">Bancos Nacionales</option>
                    <option value="BILLETERA_DIVISAS">Billeteras / Divisas</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Moneda de la Cuenta
                  </label>
                  <select
                    value={accCurrency}
                    onChange={(e) =>
                      setAccCurrency(e.target.value as 'USD' | 'BS' | 'USDT')
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  >
                    <option value="USD">Dólares ($ USD)</option>
                    <option value="BS">Bolívares (Bs.)</option>
                    <option value="USDT">USDT (Cripto)</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Saldo Actual en {accCurrency} *
                </label>
                <input
                  type="number"
                  step="0.01"
                  value={accNativeBalance}
                  onChange={(e) => setAccNativeBalance(e.target.value)}
                  placeholder="0.00"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                />
                {accCurrency === 'BS' && Number(accNativeBalance) > 0 && (
                  <p className="text-[11px] text-slate-500 mt-1 font-mono tabular-nums">
                    Equivalente BCV: {formatUSD((Number(accNativeBalance) || 0) / bcvRate)}
                  </p>
                )}
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Banco / Plataforma
                  </label>
                  <input
                    type="text"
                    value={accInstitution}
                    onChange={(e) => setAccInstitution(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Últimos dígitos / Ref
                  </label>
                  <input
                    type="text"
                    value={accNumber}
                    onChange={(e) => setAccNumber(e.target.value)}
                    placeholder="Ej: *4512"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAccountModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                >
                  {editingAccount ? 'Guardar Cambios' : 'Crear Cuenta'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Create / Edit Commitment */}
      {isCommitmentModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
              <h3 className="text-base font-bold text-slate-900">
                {editingCommitment ? 'Editar Compromiso de Pago' : 'Planificar Pago o Gasto Fijo'}
              </h3>
              <button
                type="button"
                onClick={() => setIsCommitmentModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={handleSaveCommitment}
              className="p-5 space-y-4 text-xs overflow-y-auto"
            >
              {cmtError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                  {cmtError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Concepto / Descripción *
                </label>
                <input
                  type="text"
                  value={cmtTitle}
                  onChange={(e) => setCmtTitle(e.target.value)}
                  placeholder="Ej: Alquiler local, Quincena mecánico, Factura repuestos"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Categoría
                  </label>
                  <select
                    value={cmtCategory}
                    onChange={(e) =>
                      setCmtCategory(e.target.value as TreasuryCommitmentCategory)
                    }
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  >
                    <option value="GASTOS_FIJOS">Gastos Fijos</option>
                    <option value="NOMINA_SUELDOS">Nómina / Sueldos</option>
                    <option value="PROVEEDORES">Proveedores</option>
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Fecha Límite *
                  </label>
                  <input
                    type="date"
                    value={cmtDueDate}
                    onChange={(e) => setCmtDueDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                </div>
              </div>

              {cmtCategory !== 'PROVEEDORES' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Trabajador asignado{' '}
                    <span className="text-slate-400 font-normal">
                      (opcional — permite descontar vales a su sueldo)
                    </span>
                  </label>
                  <input
                    type="text"
                    list="treasury-workers-list"
                    value={cmtWorkerName}
                    onChange={(e) => setCmtWorkerName(e.target.value)}
                    placeholder="Ej: Carlos Pérez, Mecánico, Cajero..."
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                  {technicians.length > 0 && (
                    <datalist id="treasury-workers-list">
                      {technicians.map((tech) => (
                        <option key={tech.id} value={tech.name} />
                      ))}
                    </datalist>
                  )}
                </div>
              )}

              {/* Moneda del Compromiso: Efectivo Dólares vs Bolívares */}
              <div>
                <label className="block font-semibold text-slate-700 mb-1.5">
                  Moneda de Pago del Compromiso *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setCmtPaymentCurrency('EFECTIVO_USD');
                      setCmtError('');
                    }}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border font-bold transition-all cursor-pointer ${
                      cmtPaymentCurrency === 'EFECTIVO_USD'
                        ? 'bg-emerald-50 border-emerald-500 text-emerald-800 ring-1 ring-emerald-500/30'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Banknote className="w-4 h-4 shrink-0" />
                    Efectivo Dólares ($)
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setCmtPaymentCurrency('BS');
                      setCmtError('');
                      if (!cmtAppliedRate) {
                        handleSelectCmtRateType(cmtRateType);
                      }
                    }}
                    className={`flex items-center justify-center gap-2 px-3 py-2.5 rounded-xl border font-bold transition-all cursor-pointer ${
                      cmtPaymentCurrency === 'BS'
                        ? 'bg-blue-50 border-blue-500 text-blue-800 ring-1 ring-blue-500/30'
                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    <Building2 className="w-4 h-4 shrink-0" />
                    En Bolívares (Bs)
                  </button>
                </div>
              </div>

              {/* Selector de Tasa cuando el compromiso es en Bolívares */}
              {cmtPaymentCurrency === 'BS' && (
                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1.5">
                      ¿A qué tasa se calcula el pago en Bs? *
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                      {(['BCV', 'EURO', 'USDT'] as TreasuryCommitmentRateType[]).map((rt) => {
                        const meta = COMMITMENT_RATE_META[rt];
                        const isSelected = cmtRateType === rt;
                        return (
                          <button
                            key={rt}
                            type="button"
                            onClick={() => handleSelectCmtRateType(rt)}
                            className={`px-2.5 py-2 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                              isSelected
                                ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                                : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                            }`}
                          >
                            {meta.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <div className="flex items-center justify-between gap-2 mb-1">
                      <label className="font-semibold text-slate-700">
                        Valor {COMMITMENT_RATE_META[cmtRateType].label} (Bs / $) *
                      </label>
                      {cmtRateType === 'EURO' && (
                        <button
                          type="button"
                          onClick={() => void fetchEuroRateInto('form')}
                          disabled={isFetchingEuroRate}
                          className="inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 hover:text-violet-900 cursor-pointer disabled:opacity-50"
                        >
                          <RefreshCw
                            className={`w-3 h-3 ${isFetchingEuroRate ? 'animate-spin' : ''}`}
                          />
                          {isFetchingEuroRate ? 'Consultando...' : 'Consultar Euro BCV'}
                        </button>
                      )}
                      {cmtRateType === 'BCV' && (
                        <button
                          type="button"
                          onClick={() => setCmtAppliedRate(bcvRate.toFixed(2))}
                          className="text-[11px] font-semibold text-blue-700 hover:text-blue-900 cursor-pointer"
                        >
                          BCV actual: {bcvRate.toFixed(2)}
                        </button>
                      )}
                    </div>
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={cmtAppliedRate}
                      onChange={(e) => setCmtAppliedRate(e.target.value)}
                      placeholder={
                        cmtRateType === 'USDT'
                          ? 'Ej: 95.50'
                          : cmtRateType === 'EURO'
                            ? 'Ej: 88.20'
                            : bcvRate.toFixed(2)
                      }
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                    />
                    {euroFetchHint && cmtRateType === 'EURO' && (
                      <p className="text-[10px] text-violet-700 mt-1">{euroFetchHint}</p>
                    )}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Monto a Pagar (USD) *
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0.01"
                    value={cmtAmountUSD}
                    onChange={(e) => setCmtAmountUSD(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                  {cmtPaymentCurrency === 'EFECTIVO_USD' ? (
                    <p className="text-[10px] text-emerald-700 mt-1 font-medium">
                      Se paga en efectivo dólares ($)
                    </p>
                  ) : Number(cmtAmountUSD) > 0 && Number(cmtAppliedRate) > 0 ? (
                    <p className="text-[11px] text-blue-700 mt-1 font-mono font-bold tabular-nums">
                      {formatBs((Number(cmtAmountUSD) || 0) * (Number(cmtAppliedRate) || 0))}
                    </p>
                  ) : (
                    <p className="text-[10px] text-slate-400 mt-1">
                      Ingresa monto y tasa para calcular en Bs
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Monto Apartado (USD)
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={cmtReservedUSD}
                    onChange={(e) => setCmtReservedUSD(e.target.value)}
                    placeholder="0.00"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Notas adicionales
                </label>
                <input
                  type="text"
                  value={cmtNotes}
                  onChange={(e) => setCmtNotes(e.target.value)}
                  placeholder="Opcional"
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                />
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCommitmentModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                >
                  {editingCommitment ? 'Guardar Cambios' : 'Guardar Planificación'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Mark Commitment as Paid (deducting from a specific account) */}
      {payingCommitment && (() => {
        const isBsPay = payingCommitment.paymentCurrency === 'BS';
        const parsedPayRate = parseFloat(payAppliedRate) || 0;
        const payRateMeta = COMMITMENT_RATE_META[payRateType];
        return (
          <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
            <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-md shadow-2xl overflow-hidden flex flex-col max-h-[92vh]">
              <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between shrink-0">
                <h3 className="text-base font-bold text-slate-900">
                  Confirmar Pago desde Cuenta
                </h3>
                <button
                  type="button"
                  onClick={() => setPayingCommitment(null)}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              <form
                onSubmit={handleConfirmPayCommitment}
                className="p-5 space-y-4 text-xs overflow-y-auto"
              >
                {payError && (
                  <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                    {payError}
                  </div>
                )}

                <div className="rounded-xl bg-slate-50 border border-slate-200 p-3.5 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <p className="font-bold text-slate-900">{payingCommitment.title}</p>
                    {isBsPay ? (
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border shrink-0 ${payRateMeta.badgeClass}`}
                      >
                        Bs · {payRateMeta.label}
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-0.5 rounded-md text-[10px] font-semibold border bg-emerald-50 text-emerald-700 border-emerald-200 shrink-0">
                        Efectivo USD ($)
                      </span>
                    )}
                  </div>
                  <div className="flex items-center justify-between pt-1 border-t border-slate-200/70">
                    <span className="text-slate-500">Monto a descontar:</span>
                    <div className="text-right">
                      <span className="text-sm font-bold text-slate-900 font-mono tabular-nums block">
                        {formatUSD(payingCommitment.amountUSD)}
                      </span>
                      {isBsPay ? (
                        <span className="text-[11px] text-blue-700 font-mono font-bold tabular-nums">
                          {parsedPayRate > 0
                            ? `${formatBs(payingCommitment.amountUSD * parsedPayRate)} (${payRateMeta.shortLabel} ${parsedPayRate.toFixed(2)})`
                            : 'Define la tasa para ver en Bs'}
                        </span>
                      ) : (
                        <span className="text-[11px] text-emerald-700 font-medium">
                          Pago en Efectivo Dólares ($)
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {isBsPay && (
                  <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2.5">
                    <label className="block font-semibold text-slate-700">
                      Tasa aplicada al momento del pago
                    </label>
                    <div className="grid grid-cols-3 gap-1.5">
                      {(['BCV', 'EURO', 'USDT'] as TreasuryCommitmentRateType[]).map((rt) => (
                        <button
                          key={rt}
                          type="button"
                          onClick={() => handleSelectPayRateType(rt)}
                          className={`px-2 py-1.5 rounded-lg border text-[11px] font-bold transition-all cursor-pointer ${
                            payRateType === rt
                              ? 'bg-slate-900 border-slate-900 text-white'
                              : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-100'
                          }`}
                        >
                          {COMMITMENT_RATE_META[rt].label}
                        </button>
                      ))}
                    </div>
                    <div className="flex items-center gap-2">
                      <input
                        type="number"
                        step="0.01"
                        min="0.01"
                        value={payAppliedRate}
                        onChange={(e) => setPayAppliedRate(e.target.value)}
                        placeholder="Tasa Bs / $"
                        className="flex-1 px-3 py-2 rounded-xl border border-slate-200 bg-white font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                      />
                      {payRateType === 'EURO' && (
                        <button
                          type="button"
                          onClick={() => void fetchEuroRateInto('pay')}
                          disabled={isFetchingPayEuroRate}
                          className="inline-flex items-center gap-1 px-2.5 py-2 rounded-xl border border-violet-200 bg-violet-50 text-violet-700 font-semibold hover:bg-violet-100 cursor-pointer disabled:opacity-50 whitespace-nowrap"
                        >
                          <RefreshCw
                            className={`w-3.5 h-3.5 ${isFetchingPayEuroRate ? 'animate-spin' : ''}`}
                          />
                          Euro BCV
                        </button>
                      )}
                      {payRateType === 'BCV' && (
                        <button
                          type="button"
                          onClick={() => setPayAppliedRate(bcvRate.toFixed(2))}
                          className="px-2.5 py-2 rounded-xl border border-blue-200 bg-blue-50 text-blue-700 font-semibold hover:bg-blue-100 cursor-pointer whitespace-nowrap"
                        >
                          BCV: {bcvRate.toFixed(2)}
                        </button>
                      )}
                    </div>
                  </div>
                )}

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Cuenta de origen del pago *
                  </label>
                  <select
                    value={payAccountId}
                    onChange={(e) => setPayAccountId(e.target.value)}
                    className="w-full px-3 py-2.5 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  >
                    {treasuryAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} — Saldo: {formatNativeBalance(acc.currency, acc.nativeBalance)}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Fecha de pago
                    </label>
                    <input
                      type="date"
                      value={payDate}
                      onChange={(e) => setPayDate(e.target.value)}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      Referencia / Recibo
                    </label>
                    <input
                      type="text"
                      value={payReference}
                      onChange={(e) => setPayReference(e.target.value)}
                      placeholder="Ej: 882190"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                    />
                  </div>
                </div>

                {payingCommitment.category !== 'PROVEEDORES' && (
                  <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                    <input
                      type="checkbox"
                      checked={paySyncExpense}
                      onChange={(e) => setPaySyncExpense(e.target.checked)}
                      className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                    />
                    <span className="text-slate-700 font-medium">
                      Registrar también en Gastos del Negocio
                    </span>
                  </label>
                )}

                <div className="flex justify-end gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => setPayingCommitment(null)}
                    className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-bold cursor-pointer"
                  >
                    Confirmar y Descontar
                  </button>
                </div>
              </form>
            </div>
          </div>
        );
      })()}

      {/* Modal: Allocate Reserve Amount for Monthly Coverage */}
      {reservingCommitment && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-sm shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Apartar para Cobertura
              </h3>
              <button
                type="button"
                onClick={() => setReservingCommitment(null)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                const val = parseFloat(reserveInput || '0');
                const clean = isNaN(val)
                  ? 0
                  : Math.min(reservingCommitment.amountUSD, Math.max(0, val));
                updateTreasuryCommitment(reservingCommitment.id, {
                  reservedUSD: Math.round(clean * 100) / 100,
                });
                showBanner(
                  'success',
                  `Reserva actualizada a ${formatUSD(clean)} para "${reservingCommitment.title}".`
                );
                setReservingCommitment(null);
              }}
              className="p-5 space-y-4 text-xs"
            >
              <p className="text-slate-600">
                Compromiso: <span className="font-bold text-slate-900">{reservingCommitment.title}</span>{' '}
                ({formatUSD(reservingCommitment.amountUSD)})
              </p>
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Monto ya apartado (USD)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  max={reservingCommitment.amountUSD}
                  value={reserveInput}
                  onChange={(e) => setReserveInput(e.target.value)}
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                />
              </div>
              <div className="flex items-center justify-between gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setReserveInput(String(reservingCommitment.amountUSD))}
                  className="text-emerald-700 font-semibold hover:underline cursor-pointer"
                >
                  Apartar 100%
                </button>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setReservingCommitment(null)}
                    className="px-3 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-4 py-2 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                  >
                    Guardar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Register New Expense or Income */}
      {isMovementModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl border border-slate-200 w-full max-w-lg shadow-2xl overflow-hidden">
            <div className="px-5 py-4 border-b border-slate-200 flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">
                Registrar Nuevo Gasto o Ingreso
              </h3>
              <button
                type="button"
                onClick={() => setIsMovementModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <form onSubmit={handleSaveMovement} className="p-5 space-y-4 text-xs max-h-[82vh] overflow-y-auto">
              {movError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 font-semibold">
                  {movError}
                </div>
              )}

              {/* Toggle Type: GASTO vs INGRESO */}
              <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-slate-100">
                <button
                  type="button"
                  onClick={() => {
                    setMovType('GASTO');
                    setMovCategory(expenseCategories[0] || 'Servicios Básicos');
                  }}
                  className={`py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    movType === 'GASTO'
                      ? 'bg-rose-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowDownRight className="w-4 h-4" />
                  Registrar Gasto
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setMovType('INGRESO');
                    setMovCategory('Ingreso de Ventas / Caja');
                    setMovIsSalaryAdvance(false);
                    setMovLinkedCommitmentId('');
                  }}
                  className={`py-2 rounded-lg font-bold flex items-center justify-center gap-1.5 transition-colors cursor-pointer ${
                    movType === 'INGRESO'
                      ? 'bg-emerald-600 text-white shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  <ArrowUpRight className="w-4 h-4" />
                  Registrar Ingreso
                </button>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Cuenta afectada *
                  </label>
                  <select
                    value={movAccountId}
                    onChange={(e) => handleMovementAccountChange(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white font-medium focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  >
                    {treasuryAccounts.map((acc) => (
                      <option key={acc.id} value={acc.id}>
                        {acc.name} ({formatNativeBalance(acc.currency, acc.nativeBalance)})
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Fecha *
                  </label>
                  <input
                    type="date"
                    value={movDate}
                    onChange={(e) => setMovDate(e.target.value)}
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Categoría
                  </label>
                  {movType === 'GASTO' ? (
                    <select
                      value={movCategory}
                      onChange={(e) => {
                        const nextCat = e.target.value;
                        setMovCategory(nextCat);
                        const low = nextCat.toLowerCase();
                        if ((low.includes('vale') || low.includes('adelanto')) && !movIsSalaryAdvance) {
                          setMovIsSalaryAdvance(true);
                          if (!movLinkedCommitmentId && pendingWorkerCommitments.length > 0) {
                            handleSelectMovSalaryCommitment(pendingWorkerCommitments[0].id);
                          }
                        }
                      }}
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                    >
                      {expenseCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <input
                      type="text"
                      value={movCategory}
                      onChange={(e) => setMovCategory(e.target.value)}
                      placeholder="Ej: Ventas del día, Abono cliente, Aporte"
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                    />
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Monto ({movInputCurrency}) *
                  </label>
                  <div className="flex gap-1.5">
                    <input
                      type="number"
                      step="any"
                      min="0.01"
                      value={movAmountInput}
                      onChange={(e) => setMovAmountInput(e.target.value)}
                      placeholder="0.00"
                      className="flex-1 min-w-0 px-3 py-2 rounded-xl border border-slate-200 font-mono text-sm font-bold focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                    />
                    <select
                      value={movInputCurrency}
                      onChange={(e) =>
                        setMovInputCurrency(e.target.value as 'USD' | 'BS' | 'USDT')
                      }
                      className="px-2.5 py-2 rounded-xl border border-slate-200 bg-white font-mono font-semibold"
                    >
                      <option value="USD">USD</option>
                      <option value="BS">BS</option>
                      <option value="USDT">USDT</option>
                    </select>
                  </div>
                  {selectedMovementPreviewUSD > 0 && (
                    <p className="text-[10px] text-slate-500 mt-1 font-mono tabular-nums">
                      Equivalente: {formatUSD(selectedMovementPreviewUSD)} ·{' '}
                      {formatBs(selectedMovementPreviewUSD * bcvRate)}
                    </p>
                  )}
                </div>
              </div>

              {movType === 'GASTO' && (() => {
                const selectedCmt = treasuryCommitments.find(
                  (c) => c.id === movLinkedCommitmentId
                );
                const deductionUSD = selectedCmt
                  ? Math.min(selectedCmt.amountUSD, selectedMovementPreviewUSD)
                  : 0;
                const remainingAfter = selectedCmt
                  ? Math.max(0, Math.round((selectedCmt.amountUSD - deductionUSD) * 100) / 100)
                  : 0;

                return (
                  <div className="p-3.5 rounded-xl bg-indigo-50/70 border border-indigo-200 space-y-2.5">
                    <label className="flex items-start gap-2 cursor-pointer select-none">
                      <input
                        type="checkbox"
                        checked={movIsSalaryAdvance}
                        onChange={(e) => {
                          const checked = e.target.checked;
                          setMovIsSalaryAdvance(checked);
                          if (movError) setMovError('');
                          if (checked) {
                            if (!movLinkedCommitmentId && pendingWorkerCommitments.length > 0) {
                              handleSelectMovSalaryCommitment(pendingWorkerCommitments[0].id);
                            }
                          } else {
                            setMovLinkedCommitmentId('');
                          }
                        }}
                        className="mt-0.5 rounded border-indigo-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      <div className="min-w-0">
                        <span className="font-bold text-slate-900 flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5 text-indigo-700 shrink-0" />
                          <span>Descontar como vale al sueldo de un trabajador</span>
                        </span>
                        <span className="text-[11px] text-slate-600 block">
                          Resta este monto de los gastos fijos / nómina por pagar asignados al trabajador.
                        </span>
                      </div>
                    </label>

                    {movIsSalaryAdvance && (
                      <div className="pl-5 space-y-2">
                        {pendingWorkerCommitments.length === 0 ? (
                          <p className="text-[11px] text-slate-600 bg-white border border-indigo-200 rounded-lg p-2.5">
                            No hay sueldos ni gastos fijos pendientes en Planificación de Pagos. Agrega primero el sueldo del trabajador.
                          </p>
                        ) : (
                          <>
                            <select
                              value={movLinkedCommitmentId}
                              onChange={(e) => handleSelectMovSalaryCommitment(e.target.value)}
                              className="w-full px-3 py-2 rounded-xl border border-indigo-300 bg-white font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                            >
                              <option value="">-- Selecciona el sueldo / trabajador --</option>
                              {pendingWorkerCommitments.map((cm) => (
                                <option key={cm.id} value={cm.id}>
                                  [{cm.category === 'NOMINA_SUELDOS' ? 'Nómina/Sueldo' : 'Gasto Fijo'}]{' '}
                                  {cm.workerName ? `${cm.workerName} · ` : ''}
                                  {cm.title} — Por pagar: {formatUSD(cm.amountUSD)}
                                </option>
                              ))}
                            </select>

                            {selectedCmt && (
                              <div className="bg-white border border-indigo-200 rounded-lg px-3 py-2 flex flex-wrap items-center justify-between gap-2 text-[11px]">
                                <span className="text-slate-600">
                                  Saldo restante del trabajador tras el vale:
                                </span>
                                <span
                                  className={`font-mono font-bold tabular-nums ${
                                    remainingAfter <= 0.009
                                      ? 'text-emerald-700'
                                      : 'text-indigo-800'
                                  }`}
                                >
                                  {formatUSD(remainingAfter)}
                                  {remainingAfter <= 0.009 && selectedMovementPreviewUSD > 0
                                    ? ' (Liquidado)'
                                    : ''}
                                </span>
                              </div>
                            )}
                          </>
                        )}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Descripción / Concepto *
                </label>
                <input
                  type="text"
                  value={movDescription}
                  onChange={(e) => setMovDescription(e.target.value)}
                  placeholder={
                    movType === 'INGRESO'
                      ? 'Ej: Depósito de ventas en efectivo del día'
                      : 'Ej: Pago servicio eléctrico / Vale de sueldo'
                  }
                  className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Referencia
                  </label>
                  <input
                    type="text"
                    value={movReference}
                    onChange={(e) => setMovReference(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 font-mono focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    {movType === 'INGRESO' ? 'Origen / Cliente' : 'Beneficiario'}
                  </label>
                  <input
                    type="text"
                    value={movBeneficiary}
                    onChange={(e) => setMovBeneficiary(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 rounded-xl border border-slate-200 focus:outline-none focus:ring-2 focus:ring-slate-900/15"
                  />
                </div>
              </div>

              {movType === 'GASTO' && (
                <label className="flex items-center gap-2 cursor-pointer select-none pt-1">
                  <input
                    type="checkbox"
                    checked={movSyncExpense}
                    onChange={(e) => setMovSyncExpense(e.target.checked)}
                    className="rounded border-slate-300 text-slate-900 focus:ring-slate-900"
                  />
                  <span className="text-slate-700 font-medium">
                    Sincronizar también con la vista Gastos del Negocio
                  </span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsMovementModalOpen(false)}
                  className="px-4 py-2 rounded-xl border border-slate-200 text-slate-600 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className={`px-4 py-2 rounded-xl text-white font-bold cursor-pointer ${
                    movType === 'INGRESO'
                      ? 'bg-emerald-600 hover:bg-emerald-700'
                      : 'bg-slate-900 hover:bg-slate-800'
                  }`}
                >
                  {movType === 'INGRESO' ? 'Guardar Ingreso' : 'Guardar Gasto'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
