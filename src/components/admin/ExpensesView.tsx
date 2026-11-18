import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  BusinessExpense,
  DEFAULT_EXPENSE_CATEGORIES,
  ExpensePaymentCurrency,
  ExpensePaymentMethod,
} from '../../types';
import { formatUSD, formatBs } from '../../utils/whatsapp';
import {
  Receipt,
  Plus,
  Search,
  Tag,
  Wallet,
  Calendar,
  Pencil,
  Trash2,
  X,
  Check,
  Filter,
  Banknote,
  Coins,
  Smartphone,
  DollarSign,
  FolderPlus,
  AlertCircle,
} from 'lucide-react';

interface PaymentOptionConfig {
  type: ExpensePaymentCurrency;
  shortLabel: string;
  method: ExpensePaymentMethod;
  helper: string;
  primaryInput: 'BS' | 'USD';
  icon: React.ComponentType<{ className?: string }>;
}

const EXPENSE_PAYMENT_OPTIONS: PaymentOptionConfig[] = [
  {
    type: 'BS',
    shortLabel: 'Bs (Transf. / Pago Móvil)',
    method: 'Bolívares (Transferencia / Pago Móvil)',
    helper: 'Transferencia bancaria o Pago Móvil en Bs',
    primaryInput: 'BS',
    icon: Smartphone,
  },
  {
    type: 'USDT',
    shortLabel: 'USDT',
    method: 'USDT (Binance Pay)',
    helper: 'Cripto / Binance Pay en USDT',
    primaryInput: 'USD',
    icon: Coins,
  },
  {
    type: 'EFECTIVO_BS',
    shortLabel: 'Efectivo Bs',
    method: 'Efectivo Bs',
    helper: 'Pago en billetes de Bolívares',
    primaryInput: 'BS',
    icon: Banknote,
  },
  {
    type: 'EFECTIVO_USD',
    shortLabel: 'Efectivo en Dólares',
    method: 'Efectivo en Dólares ($)',
    helper: 'Pago en divisas en efectivo ($)',
    primaryInput: 'USD',
    icon: DollarSign,
  },
];

type PeriodFilter = 'ALL' | 'TODAY' | 'THIS_MONTH' | 'LAST_MONTH';

export const ExpensesView: React.FC = () => {
  const {
    expenses,
    expenseCategories,
    addExpenseCategory,
    deleteExpenseCategory,
    addExpense,
    updateExpense,
    deleteExpense,
    settings,
    currentMonthExpensesUSD,
    currentMonthExpensesBs,
    totalExpensesUSD,
    totalExpensesBs,
  } = useApp();

  const bcvRate = settings.bcvRate || 1;
  const todayStr = new Date().toISOString().split('T')[0];

  // Filters
  const [searchTerm, setSearchTerm] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [paymentFilter, setPaymentFilter] = useState<'ALL' | ExpensePaymentCurrency>('ALL');
  const [periodFilter, setPeriodFilter] = useState<PeriodFilter>('ALL');

  // Create / Edit Expense Modal
  const [isFormOpen, setIsFormOpen] = useState(false);
  const [editingExpense, setEditingExpense] = useState<BusinessExpense | null>(null);

  const [formDate, setFormDate] = useState(todayStr);
  const [formCategory, setFormCategory] = useState<string>(DEFAULT_EXPENSE_CATEGORIES[0]);
  const [formDescription, setFormDescription] = useState('');
  const [formBeneficiary, setFormBeneficiary] = useState('');
  const [formPaymentType, setFormPaymentType] = useState<ExpensePaymentCurrency>('EFECTIVO_USD');
  const [formRate, setFormRate] = useState<string>(bcvRate.toFixed(2));
  const [formAmountUSD, setFormAmountUSD] = useState<string>('');
  const [formAmountBs, setFormAmountBs] = useState<string>('');
  const [formReference, setFormReference] = useState('');
  const [formNotes, setFormNotes] = useState('');
  const [formError, setFormError] = useState('');

  // Inline new category inside Expense Form
  const [showInlineNewCat, setShowInlineNewCat] = useState(false);
  const [inlineNewCatName, setInlineNewCatName] = useState('');

  // Manage Categories Modal
  const [isCatModalOpen, setIsCatModalOpen] = useState(false);
  const [newCatInput, setNewCatInput] = useState('');
  const [catFeedback, setCatFeedback] = useState<string | null>(null);

  // Delete Confirmation Modal
  const [expenseToDelete, setExpenseToDelete] = useState<BusinessExpense | null>(null);

  const customCategorySet = useMemo(() => {
    const defaultsLower = new Set(DEFAULT_EXPENSE_CATEGORIES.map((c) => c.toLowerCase()));
    return new Set(
      expenseCategories.filter((c) => !defaultsLower.has(c.toLowerCase())).map((c) => c.toLowerCase())
    );
  }, [expenseCategories]);

  // Filtered expenses
  const filteredExpenses = useMemo(() => {
    const now = new Date();
    const thisMonthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    const prevMonthDate = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const lastMonthPrefix = `${prevMonthDate.getFullYear()}-${String(
      prevMonthDate.getMonth() + 1
    ).padStart(2, '0')}`;

    const q = searchTerm.trim().toLowerCase();

    return expenses.filter((ex) => {
      if (categoryFilter !== 'ALL' && ex.category.toLowerCase() !== categoryFilter.toLowerCase()) {
        return false;
      }
      if (paymentFilter !== 'ALL' && ex.paymentCurrencyType !== paymentFilter) {
        return false;
      }
      const exDate = ex.date || ex.createdAt.split('T')[0];
      if (periodFilter === 'TODAY' && exDate !== todayStr) return false;
      if (periodFilter === 'THIS_MONTH' && !exDate.startsWith(thisMonthPrefix)) return false;
      if (periodFilter === 'LAST_MONTH' && !exDate.startsWith(lastMonthPrefix)) return false;

      if (q) {
        const haystack = [
          ex.expenseNumber,
          ex.category,
          ex.description,
          ex.beneficiary || '',
          ex.paymentMethod,
          ex.reference || '',
          ex.notes || '',
        ]
          .join(' ')
          .toLowerCase();
        if (!haystack.includes(q)) return false;
      }

      return true;
    });
  }, [expenses, categoryFilter, paymentFilter, periodFilter, searchTerm, todayStr]);

  // Summary metrics on filtered view & current month
  const filteredTotalUSD = useMemo(
    () =>
      Math.round(
        filteredExpenses.reduce((sum, ex) => sum + (Number(ex.amountUSD) || 0), 0) * 100
      ) / 100,
    [filteredExpenses]
  );
  const filteredTotalBs = useMemo(
    () =>
      Math.round(
        filteredExpenses.reduce((sum, ex) => sum + (Number(ex.amountBs) || 0), 0) * 100
      ) / 100,
    [filteredExpenses]
  );

  // Payment breakdown across filtered or all expenses
  const paymentBreakdown = useMemo(() => {
    const sums: Record<ExpensePaymentCurrency, { usd: number; bs: number; count: number }> = {
      BS: { usd: 0, bs: 0, count: 0 },
      USDT: { usd: 0, bs: 0, count: 0 },
      EFECTIVO_BS: { usd: 0, bs: 0, count: 0 },
      EFECTIVO_USD: { usd: 0, bs: 0, count: 0 },
    };
    filteredExpenses.forEach((ex) => {
      const bucket = sums[ex.paymentCurrencyType] || sums.EFECTIVO_USD;
      bucket.usd += Number(ex.amountUSD) || 0;
      bucket.bs += Number(ex.amountBs) || 0;
      bucket.count += 1;
    });
    return sums;
  }, [filteredExpenses]);

  // Top expense category in filtered results
  const categoryBreakdown = useMemo(() => {
    const map = new Map<string, { category: string; usd: number; count: number }>();
    filteredExpenses.forEach((ex) => {
      const prev = map.get(ex.category) || { category: ex.category, usd: 0, count: 0 };
      prev.usd += Number(ex.amountUSD) || 0;
      prev.count += 1;
      map.set(ex.category, prev);
    });
    return Array.from(map.values()).sort((a, b) => b.usd - a.usd);
  }, [filteredExpenses]);

  const topCategory = categoryBreakdown[0] || null;

  const openNewExpenseModal = () => {
    setEditingExpense(null);
    setFormDate(todayStr);
    setFormCategory(expenseCategories[0] || DEFAULT_EXPENSE_CATEGORIES[0]);
    setFormDescription('');
    setFormBeneficiary('');
    setFormPaymentType('EFECTIVO_USD');
    setFormRate(bcvRate.toFixed(2));
    setFormAmountUSD('');
    setFormAmountBs('');
    setFormReference('');
    setFormNotes('');
    setFormError('');
    setShowInlineNewCat(false);
    setInlineNewCatName('');
    setIsFormOpen(true);
  };

  const openEditExpenseModal = (expense: BusinessExpense) => {
    setEditingExpense(expense);
    setFormDate(expense.date || todayStr);
    setFormCategory(expense.category);
    setFormDescription(expense.description);
    setFormBeneficiary(expense.beneficiary || '');
    setFormPaymentType(expense.paymentCurrencyType || 'EFECTIVO_USD');
    const r = expense.bcvRate || bcvRate;
    setFormRate(r.toFixed(2));
    setFormAmountUSD((Number(expense.amountUSD) || 0).toFixed(2));
    setFormAmountBs((Number(expense.amountBs) || 0).toFixed(2));
    setFormReference(expense.reference || '');
    setFormNotes(expense.notes || '');
    setFormError('');
    setShowInlineNewCat(false);
    setInlineNewCatName('');
    setIsFormOpen(true);
  };

  const handleAmountUSDChange = (val: string) => {
    setFormAmountUSD(val);
    if (formError) setFormError('');
    const numUSD = parseFloat(val);
    const rate = parseFloat(formRate) || bcvRate || 1;
    if (!isNaN(numUSD) && numUSD >= 0) {
      setFormAmountBs((numUSD * rate).toFixed(2));
    } else if (val === '') {
      setFormAmountBs('');
    }
  };

  const handleAmountBsChange = (val: string) => {
    setFormAmountBs(val);
    if (formError) setFormError('');
    const numBs = parseFloat(val);
    const rate = parseFloat(formRate) || bcvRate || 1;
    if (!isNaN(numBs) && numBs >= 0 && rate > 0) {
      setFormAmountUSD((numBs / rate).toFixed(2));
    } else if (val === '') {
      setFormAmountUSD('');
    }
  };

  const handleRateChange = (val: string) => {
    setFormRate(val);
    const rate = parseFloat(val);
    if (!isNaN(rate) && rate > 0) {
      const selectedCfg = EXPENSE_PAYMENT_OPTIONS.find((o) => o.type === formPaymentType);
      if (selectedCfg?.primaryInput === 'BS' && formAmountBs !== '') {
        const numBs = parseFloat(formAmountBs);
        if (!isNaN(numBs)) setFormAmountUSD((numBs / rate).toFixed(2));
      } else if (formAmountUSD !== '') {
        const numUSD = parseFloat(formAmountUSD);
        if (!isNaN(numUSD)) setFormAmountBs((numUSD * rate).toFixed(2));
      }
    }
  };

  const handleInlineAddCategory = () => {
    const trimmed = inlineNewCatName.trim();
    if (!trimmed) return;
    const res = addExpenseCategory(trimmed);
    setFormCategory(res.category);
    setInlineNewCatName('');
    setShowInlineNewCat(false);
  };

  const handleSaveExpense = (e: React.FormEvent) => {
    e.preventDefault();
    if (!formCategory.trim()) {
      setFormError('Selecciona una categoría para el gasto.');
      return;
    }
    if (!formDescription.trim()) {
      setFormError('Ingresa una descripción o concepto del gasto.');
      return;
    }

    const rate = Math.max(0.01, parseFloat(formRate) || bcvRate || 1);
    let parsedUSD = parseFloat(formAmountUSD);
    let parsedBs = parseFloat(formAmountBs);

    if ((isNaN(parsedUSD) || parsedUSD <= 0) && !isNaN(parsedBs) && parsedBs > 0) {
      parsedUSD = parsedBs / rate;
    }
    if ((isNaN(parsedBs) || parsedBs <= 0) && !isNaN(parsedUSD) && parsedUSD > 0) {
      parsedBs = parsedUSD * rate;
    }

    if (isNaN(parsedUSD) || parsedUSD <= 0) {
      setFormError('Ingresa un monto válido mayor a 0 en USD o Bolívares.');
      return;
    }

    const opt =
      EXPENSE_PAYMENT_OPTIONS.find((o) => o.type === formPaymentType) ||
      EXPENSE_PAYMENT_OPTIONS[3];

    if (editingExpense) {
      updateExpense(editingExpense.id, {
        date: formDate || todayStr,
        category: formCategory.trim(),
        description: formDescription.trim(),
        beneficiary: formBeneficiary.trim() || undefined,
        amountUSD: Math.round(parsedUSD * 100) / 100,
        amountBs: Math.round(parsedBs * 100) / 100,
        bcvRate: rate,
        paymentCurrencyType: opt.type,
        paymentMethod: opt.method,
        reference: formReference.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });
    } else {
      addExpense({
        date: formDate || todayStr,
        category: formCategory.trim(),
        description: formDescription.trim(),
        beneficiary: formBeneficiary.trim() || undefined,
        amountUSD: Math.round(parsedUSD * 100) / 100,
        amountBs: Math.round(parsedBs * 100) / 100,
        bcvRate: rate,
        paymentCurrencyType: opt.type,
        paymentMethod: opt.method,
        reference: formReference.trim() || undefined,
        notes: formNotes.trim() || undefined,
      });
    }

    setIsFormOpen(false);
    setEditingExpense(null);
  };

  const handleAddCategoryModal = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = newCatInput.trim();
    if (!trimmed) return;
    const res = addExpenseCategory(trimmed);
    setNewCatInput('');
    setCatFeedback(
      res.added
        ? `Categoría "${res.category}" agregada correctamente.`
        : `La categoría "${res.category}" ya existía.`
    );
    setTimeout(() => setCatFeedback(null), 3000);
  };

  const getPaymentOptionBadgeStyle = (type: ExpensePaymentCurrency) => {
    switch (type) {
      case 'BS':
        return 'bg-blue-50 text-blue-800 border-blue-200';
      case 'USDT':
        return 'bg-teal-50 text-teal-800 border-teal-200';
      case 'EFECTIVO_BS':
        return 'bg-amber-50 text-amber-800 border-amber-200';
      case 'EFECTIVO_USD':
      default:
        return 'bg-emerald-50 text-emerald-800 border-emerald-200';
    }
  };

  const getPaymentShortLabel = (type: ExpensePaymentCurrency) => {
    const found = EXPENSE_PAYMENT_OPTIONS.find((o) => o.type === type);
    return found ? found.shortLabel : type;
  };

  const selectedPaymentOption =
    EXPENSE_PAYMENT_OPTIONS.find((o) => o.type === formPaymentType) || EXPENSE_PAYMENT_OPTIONS[3];

  return (
    <div className="space-y-6">
      {/* Header Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-semibold text-amber-700 tracking-wide">
            Administración Financiera
          </span>
          <h1 className="text-2xl font-bold font-display text-slate-900 mt-0.5 flex items-center gap-2.5">
            <Receipt className="w-6 h-6 text-amber-600 shrink-0" />
            <span>Gastos del Negocio</span>
          </h1>
          <p className="text-xs text-slate-500 mt-1">
            Control de sueldos, papelería, limpieza, servicios y egresos en Bs, USDT, Efectivo Bs o Efectivo en Dólares. Tasa BCV activa:{' '}
            <strong className="font-mono text-slate-800">Bs. {bcvRate.toFixed(2)}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <button
            type="button"
            onClick={() => {
              setCatFeedback(null);
              setIsCatModalOpen(true);
            }}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <FolderPlus className="w-4 h-4 text-amber-600" />
            <span>Categorías ({expenseCategories.length})</span>
          </button>

          <button
            type="button"
            onClick={openNewExpenseModal}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4" />
            <span>Registrar Gasto</span>
          </button>
        </div>
      </div>

      {/* KPI Strip (Single elevation, tabular-nums) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Gastos del Mes Actual</span>
            <Calendar className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-2">
            {formatUSD(currentMonthExpensesUSD)}
          </p>
          <p className="text-xs font-mono tabular-nums text-emerald-700 font-semibold mt-1">
            {formatBs(currentMonthExpensesBs)} BCV
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Total Filtrado ({filteredExpenses.length})</span>
            <Receipt className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-2xl font-bold font-mono tabular-nums text-slate-950 mt-2">
            {formatUSD(filteredTotalUSD)}
          </p>
          <p className="text-xs font-mono tabular-nums text-slate-600 font-medium mt-1">
            {formatBs(filteredTotalBs)} · Histórico: {formatUSD(totalExpensesUSD)}
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Mayor Categoría</span>
            <Tag className="w-4 h-4 text-blue-600" />
          </div>
          {topCategory ? (
            <>
              <p className="text-base font-bold text-slate-900 mt-2 truncate" title={topCategory.category}>
                {topCategory.category}
              </p>
              <p className="text-xs font-mono tabular-nums text-slate-600 mt-1">
                {formatUSD(topCategory.usd)} · {topCategory.count}{' '}
                {topCategory.count === 1 ? 'registro' : 'registros'}
              </p>
            </>
          ) : (
            <>
              <p className="text-base font-semibold text-slate-400 mt-2">Sin registros</p>
              <p className="text-xs text-slate-400 mt-1">Registra gastos para ver resumen</p>
            </>
          )}
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-5">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500">Desglose por Pago</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] font-mono tabular-nums">
            <div className="flex items-center justify-between text-slate-700">
              <span>Efec. $:</span>
              <span className="font-bold text-emerald-700">
                {formatUSD(paymentBreakdown.EFECTIVO_USD.usd)}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-700">
              <span>USDT:</span>
              <span className="font-bold text-teal-700">
                {formatUSD(paymentBreakdown.USDT.usd)}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-700">
              <span>Bs:</span>
              <span className="font-bold text-blue-700">
                {formatUSD(paymentBreakdown.BS.usd)}
              </span>
            </div>
            <div className="flex items-center justify-between text-slate-700">
              <span>Efec. Bs:</span>
              <span className="font-bold text-amber-700">
                {formatUSD(paymentBreakdown.EFECTIVO_BS.usd)}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Interactive Category Summary Bar (when categories have expenses) */}
      {categoryBreakdown.length > 0 && (
        <div className="bg-white rounded-xl border border-slate-200 p-4">
          <div className="flex items-center justify-between mb-3">
            <span className="text-xs font-bold text-slate-800">Resumen por Categoría</span>
            {categoryFilter !== 'ALL' && (
              <button
                type="button"
                onClick={() => setCategoryFilter('ALL')}
                className="text-xs font-semibold text-amber-700 hover:underline cursor-pointer"
              >
                Ver todas las categorías
              </button>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            {categoryBreakdown.map((item) => {
              const isSelected = categoryFilter.toLowerCase() === item.category.toLowerCase();
              return (
                <button
                  key={item.category}
                  type="button"
                  onClick={() =>
                    setCategoryFilter(isSelected ? 'ALL' : item.category)
                  }
                  className={`px-3 py-1.5 rounded-lg border text-xs transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0 ${
                    isSelected
                      ? 'bg-slate-900 text-white border-slate-900 font-semibold'
                      : 'bg-slate-50 hover:bg-slate-100 text-slate-700 border-slate-200'
                  }`}
                >
                  <span>{item.category}</span>
                  <span aria-hidden="true" className="opacity-50">·</span>
                  <span className="font-mono tabular-nums font-bold">
                    {formatUSD(item.usd)}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* Search & Filters Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3">
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          {/* Search Input */}
          <div className="md:col-span-5 relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por descripción, categoría, beneficiario o nro..."
              className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            />
          </div>

          {/* Category Select */}
          <div className="md:col-span-4 relative">
            <Tag className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value)}
              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">Todas las categorías ({expenseCategories.length})</option>
              {expenseCategories.map((cat) => (
                <option key={cat} value={cat}>
                  {cat}
                </option>
              ))}
            </select>
          </div>

          {/* Payment Method Select */}
          <div className="md:col-span-3 relative">
            <Filter className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <select
              value={paymentFilter}
              onChange={(e) => setPaymentFilter(e.target.value as 'ALL' | ExpensePaymentCurrency)}
              className="w-full pl-8 pr-3 py-2 border border-slate-300 rounded-lg text-xs text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
            >
              <option value="ALL">Todas las formas de pago</option>
              {EXPENSE_PAYMENT_OPTIONS.map((opt) => (
                <option key={opt.type} value={opt.type}>
                  {opt.shortLabel}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Period Filter Segmented Control */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-100">
          <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-lg">
            {(
              [
                { id: 'ALL', label: 'Todos' },
                { id: 'TODAY', label: 'Hoy' },
                { id: 'THIS_MONTH', label: 'Este Mes' },
                { id: 'LAST_MONTH', label: 'Mes Anterior' },
              ] as { id: PeriodFilter; label: string }[]
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setPeriodFilter(tab.id)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  periodFilter === tab.id
                    ? 'bg-white text-slate-900 font-semibold shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {(searchTerm || categoryFilter !== 'ALL' || paymentFilter !== 'ALL' || periodFilter !== 'ALL') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setCategoryFilter('ALL');
                setPaymentFilter('ALL');
                setPeriodFilter('ALL');
              }}
              className="text-xs text-slate-500 hover:text-slate-900 font-medium cursor-pointer"
            >
              Limpiar filtros
            </button>
          )}
        </div>
      </div>

      {/* Expenses Data Table */}
      <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
        {filteredExpenses.length === 0 ? (
          <div className="p-12 text-center">
            <div className="w-12 h-12 rounded-xl bg-slate-100 text-slate-500 flex items-center justify-center mx-auto mb-3">
              <Receipt className="w-6 h-6" />
            </div>
            <h3 className="text-sm font-bold text-slate-900">
              {expenses.length === 0
                ? 'Aún no hay gastos registrados'
                : 'No se encontraron gastos con estos filtros'}
            </h3>
            <p className="text-xs text-slate-500 mt-1 max-w-md mx-auto">
              {expenses.length === 0
                ? 'Registra los egresos operativos del taller y tienda (sueldos, papelería, limpieza, servicios) indicando la categoría y cómo se pagó.'
                : 'Prueba limpiando los filtros o registrando un nuevo gasto.'}
            </p>
            <button
              type="button"
              onClick={openNewExpenseModal}
              className="mt-4 px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>{expenses.length === 0 ? 'Registrar Primer Gasto' : 'Registrar Nuevo Gasto'}</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-[11px] font-semibold text-slate-600">
                  <th className="py-3 px-4 whitespace-nowrap">Comprobante</th>
                  <th className="py-3 px-4 whitespace-nowrap">Fecha</th>
                  <th className="py-3 px-4 whitespace-nowrap">Categoría</th>
                  <th className="py-3 px-4">Descripción y Beneficiario</th>
                  <th className="py-3 px-4 whitespace-nowrap">Forma de Pago</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Monto USD ($)</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Equivalente Bs</th>
                  <th className="py-3 px-4 text-right whitespace-nowrap">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredExpenses.map((expense) => (
                  <tr key={expense.id} className="hover:bg-slate-50/80 transition-colors">
                    <td className="py-3 px-4 font-mono tabular-nums font-semibold text-slate-900 whitespace-nowrap">
                      {expense.expenseNumber}
                    </td>
                    <td className="py-3 px-4 font-mono tabular-nums text-slate-600 whitespace-nowrap">
                      {expense.date || expense.createdAt.split('T')[0]}
                    </td>
                    <td className="py-3 px-4 font-medium text-slate-800 whitespace-nowrap">
                      {expense.category}
                    </td>
                    <td className="py-3 px-4 min-w-[200px] max-w-md">
                      <p className="font-semibold text-slate-900">{expense.description}</p>
                      {(expense.beneficiary || expense.reference || expense.notes) && (
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          {[
                            expense.beneficiary ? `Pagado a: ${expense.beneficiary}` : null,
                            expense.reference ? `Ref: ${expense.reference}` : null,
                            expense.notes || null,
                          ]
                            .filter(Boolean)
                            .join(' · ')}
                        </p>
                      )}
                    </td>
                    <td className="py-3 px-4 whitespace-nowrap">
                      <span
                        className={`inline-flex items-center px-2 py-0.5 rounded border text-[11px] font-semibold ${getPaymentOptionBadgeStyle(
                          expense.paymentCurrencyType
                        )}`}
                      >
                        {getPaymentShortLabel(expense.paymentCurrencyType)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-950 whitespace-nowrap">
                      {formatUSD(expense.amountUSD)}
                    </td>
                    <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-700 whitespace-nowrap">
                      <span>{formatBs(expense.amountBs)}</span>
                      <span className="block text-[10px] text-slate-400">
                        Tasa {Number(expense.bcvRate || bcvRate).toFixed(2)}
                      </span>
                    </td>
                    <td className="py-3 px-4 text-right whitespace-nowrap">
                      <div className="inline-flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => openEditExpenseModal(expense)}
                          className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
                          title="Editar gasto"
                        >
                          <Pencil className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setExpenseToDelete(expense)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                          title="Eliminar gasto"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Modal: Registrar / Editar Gasto */}
      {isFormOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-8">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div>
                <h2 className="text-base font-bold text-slate-900">
                  {editingExpense ? `Editar Gasto ${editingExpense.expenseNumber}` : 'Registrar Gasto del Negocio'}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  Indica la categoría, el concepto y el método exacto con el que se realizó el pago.
                </p>
              </div>
              <button
                type="button"
                onClick={() => setIsFormOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveExpense} className="p-6 space-y-5 max-h-[80vh] overflow-y-auto">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-700 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Row 1: Fecha y Categoría (con creación rápida de categoría) */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-4">
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Fecha del Gasto
                  </label>
                  <input
                    type="date"
                    value={formDate}
                    onChange={(e) => setFormDate(e.target.value)}
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="sm:col-span-8">
                  <div className="flex items-center justify-between mb-1.5">
                    <label className="block text-xs font-bold text-slate-800">
                      Categoría del Gasto
                    </label>
                    <button
                      type="button"
                      onClick={() => setShowInlineNewCat((prev) => !prev)}
                      className="text-[11px] font-bold text-amber-700 hover:text-amber-800 flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>{showInlineNewCat ? 'Cancelar' : 'Agregar nueva categoría'}</span>
                    </button>
                  </div>

                  {!showInlineNewCat ? (
                    <select
                      value={formCategory}
                      onChange={(e) => setFormCategory(e.target.value)}
                      className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                    >
                      {expenseCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                    </select>
                  ) : (
                    <div className="flex items-center gap-2">
                      <input
                        type="text"
                        value={inlineNewCatName}
                        onChange={(e) => setInlineNewCatName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleInlineAddCategory();
                          }
                        }}
                        placeholder="Ej: Seguridad, Comida personal, Herramientas..."
                        autoFocus
                        className="flex-1 px-3 py-2 border border-amber-400 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                      />
                      <button
                        type="button"
                        onClick={handleInlineAddCategory}
                        className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer flex items-center gap-1 shrink-0"
                      >
                        <Check className="w-3.5 h-3.5" />
                        <span>Crear</span>
                      </button>
                    </div>
                  )}
                </div>
              </div>

              {/* Row 2: Descripción y Beneficiario */}
              <div className="grid grid-cols-1 sm:grid-cols-12 gap-4">
                <div className="sm:col-span-7">
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Descripción / Concepto del Gasto *
                  </label>
                  <input
                    type="text"
                    value={formDescription}
                    onChange={(e) => {
                      setFormDescription(e.target.value);
                      if (formError) setFormError('');
                    }}
                    placeholder="Ej: Pago de sueldo semanal, resma de papel, cloro y desinfectante..."
                    required
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>

                <div className="sm:col-span-5">
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Beneficiario / Comercio (opcional)
                  </label>
                  <input
                    type="text"
                    value={formBeneficiary}
                    onChange={(e) => setFormBeneficiary(e.target.value)}
                    placeholder="Ej: Empleado, Papelería, Corpoelec..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              {/* Row 3: Cómo se pagó (4 botones claros) */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-2">
                  ¿Cómo se pagó el gasto? *
                </label>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  {EXPENSE_PAYMENT_OPTIONS.map((opt) => {
                    const Icon = opt.icon;
                    const active = formPaymentType === opt.type;
                    return (
                      <button
                        key={opt.type}
                        type="button"
                        onClick={() => setFormPaymentType(opt.type)}
                        className={`p-3 rounded-xl border text-left transition-all flex items-start gap-3 cursor-pointer ${
                          active
                            ? 'bg-slate-900 text-white border-slate-900'
                            : 'bg-white hover:bg-slate-50 text-slate-800 border-slate-200'
                        }`}
                      >
                        <div
                          className={`w-8 h-8 rounded-lg flex items-center justify-center shrink-0 ${
                            active ? 'bg-amber-500 text-slate-950' : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          <Icon className="w-4 h-4" />
                        </div>
                        <div className="min-w-0">
                          <span className="text-xs font-bold block truncate">{opt.shortLabel}</span>
                          <span
                            className={`text-[11px] block mt-0.5 ${
                              active ? 'text-slate-300' : 'text-slate-500'
                            }`}
                          >
                            {opt.helper}
                          </span>
                        </div>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Row 4: Montos (USD <-> Bs) + Tasa BCV */}
              <div className="p-4 bg-slate-50 rounded-xl border border-slate-200 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="text-xs font-bold text-slate-800">
                    Monto del Gasto ({selectedPaymentOption.shortLabel})
                  </span>
                  <div className="flex items-center gap-2">
                    <label className="text-[11px] text-slate-600 font-medium">Tasa BCV:</label>
                    <input
                      type="number"
                      step="0.01"
                      min="0.01"
                      value={formRate}
                      onChange={(e) => handleRateChange(e.target.value)}
                      className="w-24 px-2 py-1 border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900 bg-white text-right"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div
                    className={
                      selectedPaymentOption.primaryInput === 'USD' ? 'order-1' : 'order-2'
                    }
                  >
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Monto en Dólares ($ / USDT)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        $
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formAmountUSD}
                        onChange={(e) => handleAmountUSDChange(e.target.value)}
                        placeholder="0.00"
                        className={`w-full pl-7 pr-12 py-2.5 border rounded-xl text-sm font-mono font-bold text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 ${
                          selectedPaymentOption.primaryInput === 'USD'
                            ? 'border-amber-400'
                            : 'border-slate-300'
                        }`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                        USD
                      </span>
                    </div>
                  </div>

                  <div
                    className={
                      selectedPaymentOption.primaryInput === 'BS' ? 'order-1' : 'order-2'
                    }
                  >
                    <label className="block text-[11px] font-bold text-slate-700 mb-1">
                      Monto en Bolívares (Bs)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">
                        Bs.
                      </span>
                      <input
                        type="number"
                        step="0.01"
                        min="0"
                        value={formAmountBs}
                        onChange={(e) => handleAmountBsChange(e.target.value)}
                        placeholder="0.00"
                        className={`w-full pl-9 pr-10 py-2.5 border rounded-xl text-sm font-mono font-bold text-slate-900 bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 ${
                          selectedPaymentOption.primaryInput === 'BS'
                            ? 'border-amber-400'
                            : 'border-slate-300'
                        }`}
                      />
                      <span className="absolute right-3 top-1/2 -translate-y-1/2 text-[11px] font-bold text-slate-400">
                        VES
                      </span>
                    </div>
                  </div>
                </div>
              </div>

              {/* Row 5: Referencia y Notas */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Nro. Referencia / Factura (opcional)
                  </label>
                  <input
                    type="text"
                    value={formReference}
                    onChange={(e) => setFormReference(e.target.value)}
                    placeholder="Ej: 482910 o recibo #12"
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-800 mb-1.5">
                    Observaciones (opcional)
                  </label>
                  <input
                    type="text"
                    value={formNotes}
                    onChange={(e) => setFormNotes(e.target.value)}
                    placeholder="Detalles adicionales del gasto..."
                    className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2.5">
                <button
                  type="button"
                  onClick={() => setIsFormOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-xl cursor-pointer transition-colors"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-xl cursor-pointer transition-colors flex items-center gap-1.5"
                >
                  <Check className="w-4 h-4" />
                  <span>{editingExpense ? 'Guardar Cambios' : 'Guardar Gasto'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Gestionar y Agregar Nuevas Categorías */}
      {isCatModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50">
              <div className="flex items-center gap-2">
                <FolderPlus className="w-5 h-5 text-amber-600" />
                <h3 className="text-base font-bold text-slate-900">Categorías de Gastos</h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCatModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/70 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              <form onSubmit={handleAddCategoryModal} className="flex items-center gap-2">
                <input
                  type="text"
                  value={newCatInput}
                  onChange={(e) => setNewCatInput(e.target.value)}
                  placeholder="Nueva categoría (ej: Almuerzos, Fletes...)"
                  className="flex-1 px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-500"
                />
                <button
                  type="submit"
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl cursor-pointer flex items-center gap-1 shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar</span>
                </button>
              </form>

              {catFeedback && (
                <p className="text-xs font-medium text-emerald-700 bg-emerald-50 border border-emerald-200 rounded-lg px-3 py-2">
                  {catFeedback}
                </p>
              )}

              <div className="max-h-72 overflow-y-auto divide-y divide-slate-100 border border-slate-200 rounded-xl">
                {expenseCategories.map((cat) => {
                  const isCustom = customCategorySet.has(cat.toLowerCase());
                  return (
                    <div
                      key={cat}
                      className="px-3.5 py-2.5 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <span className="font-semibold text-slate-800 block truncate">{cat}</span>
                        <span className="text-[10px] text-slate-400">
                          {isCustom ? 'Categoría personalizada' : 'Predeterminada'}
                        </span>
                      </div>
                      {isCustom && (
                        <button
                          type="button"
                          onClick={() => deleteExpenseCategory(cat)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="Eliminar categoría personalizada"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>

              <div className="flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsCatModalOpen(false)}
                  className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Listo
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Confirmar Eliminación de Gasto */}
      {expenseToDelete && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full border border-slate-200 shadow-2xl p-6 space-y-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-rose-100 text-rose-600 flex items-center justify-center shrink-0">
                <Trash2 className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-base font-bold text-slate-900">¿Eliminar este gasto?</h3>
                <p className="text-xs text-slate-600 mt-1">
                  Se eliminará el comprobante{' '}
                  <strong className="font-mono">{expenseToDelete.expenseNumber}</strong> ({expenseToDelete.description}) por{' '}
                  <strong className="font-mono">{formatUSD(expenseToDelete.amountUSD)}</strong>.
                </p>
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setExpenseToDelete(null)}
                className="px-4 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteExpense(expenseToDelete.id);
                  setExpenseToDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
