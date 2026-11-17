import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Sale, PaymentMethod, SalePaymentType, SaleCreditStatus } from '../../types';
import {
  formatUSD,
  formatBs,
  buildInvoiceWhatsAppMessage,
  buildCreditReminderWhatsAppMessage,
  buildCreditPaymentReceiptWhatsAppMessage,
} from '../../utils/whatsapp';
import { downloadInvoicePDF } from '../../utils/pdfInvoice';
import {
  FileText,
  Search,
  Filter,
  Calendar,
  Clock,
  Banknote,
  TrendingUp,
  Download,
  MessageSquare,
  DollarSign,
  AlertCircle,
  CheckCircle2,
  Package,
  Trash2,
  Eye,
  User,
  Phone,
  ArrowUpDown,
  CreditCard,
  Plus,
  RefreshCw,
  X,
  ExternalLink,
  Ban,
  RotateCcw,
  Edit2,
  BookmarkCheck,
} from 'lucide-react';

export const SalesDatabaseView: React.FC = () => {
  const {
    sales,
    customers,
    settings,
    setCurrentView,
    updateSale,
    updateSaleCreditStatus,
    recordCreditPayment,
    deleteSale,
    voidSale,
    reactivateSale,
    setSelectedInvoice,
    setWhatsappModalData,
  } = useApp();

  const rate = settings.bcvRate;

  // Search & Filter State
  const [searchTerm, setSearchTerm] = useState('');
  const [conditionFilter, setConditionFilter] = useState<'ALL' | SalePaymentType>('ALL');
  const [creditStatusFilter, setCreditStatusFilter] = useState<'ALL' | SaleCreditStatus | 'OVERDUE'>('ALL');
  const [dateFilter, setDateFilter] = useState<'ALL' | 'TODAY' | 'WEEK' | 'MONTH'>('ALL');
  const [selectedSaleDetail, setSelectedSaleDetail] = useState<Sale | null>(null);

  // Modal para registrar abono
  const [paymentModalSale, setPaymentModalSale] = useState<Sale | null>(null);
  const [paymentAmountUSD, setPaymentAmountUSD] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Pago Móvil');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [sendWhatsAppOnPayment, setSendWhatsAppOnPayment] = useState(true);

  // Modal para editar cliente / datos de factura
  const [editSaleModal, setEditSaleModal] = useState<Sale | null>(null);
  const [editCustomerId, setEditCustomerId] = useState<string>('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerDocument, setEditCustomerDocument] = useState('');
  const [editCreditDueDate, setEditCreditDueDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Modales de confirmación (reemplazan window.prompt / window.confirm bloqueados en iframes)
  const [voidModalSale, setVoidModalSale] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('Venta de prueba / no creada por mí');
  const [voidRestoreStock, setVoidRestoreStock] = useState(false);
  const [isProcessingVoid, setIsProcessingVoid] = useState(false);

  const [deleteModalSale, setDeleteModalSale] = useState<Sale | null>(null);
  const [deleteRestoreStock, setDeleteRestoreStock] = useState(false);
  const [isProcessingDelete, setIsProcessingDelete] = useState(false);

  const [reactivateModalSale, setReactivateModalSale] = useState<Sale | null>(null);
  const [isProcessingReactivate, setIsProcessingReactivate] = useState(false);

  // Toast feedback
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => setToastMessage(null), 3500);
  };

  // Helper for overdue calculation
  const isSaleOverdue = (sale: Sale): boolean => {
    const isDeferred = sale.paymentType === 'CREDITO' || sale.paymentType === 'APARTADO';
    if (!isDeferred || sale.creditStatus === 'PAGADO' || !sale.creditDueDate) {
      return false;
    }
    const today = new Date().toISOString().split('T')[0];
    return sale.creditDueDate < today;
  };

  const getDaysOverdueOrRemaining = (sale: Sale): { text: string; isOverdue: boolean; days: number } => {
    if (!sale.creditDueDate) return { text: 'Sin fecha', isOverdue: false, days: 0 };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(sale.creditDueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { text: `Vencido hace ${Math.abs(diffDays)} d`, isOverdue: true, days: diffDays };
    } else if (diffDays === 0) {
      return { text: '¡Vence hoy!', isOverdue: true, days: 0 };
    } else {
      return { text: `Quedan ${diffDays} d`, isOverdue: false, days: diffDays };
    }
  };

  // Filtered sales
  const filteredSales = useMemo(() => {
    const today = new Date();
    const todayStr = today.toISOString().split('T')[0];

    const weekAgo = new Date();
    weekAgo.setDate(today.getDate() - 7);
    const weekAgoStr = weekAgo.toISOString();

    const monthAgo = new Date();
    monthAgo.setDate(today.getDate() - 30);
    const monthAgoStr = monthAgo.toISOString();

    return sales.filter((sale) => {
      // Condition filter
      if (conditionFilter !== 'ALL') {
        const type = sale.paymentType || 'CONTADO';
        if (type !== conditionFilter) return false;
      }

      // Credit / Apartado status filter
      if (
        conditionFilter === 'CREDITO' ||
        conditionFilter === 'APARTADO' ||
        !sale.paymentType ||
        sale.paymentType === 'CREDITO' ||
        sale.paymentType === 'APARTADO'
      ) {
        if (creditStatusFilter === 'PENDIENTE' && sale.creditStatus === 'PAGADO') return false;
        if (creditStatusFilter === 'PAGADO' && sale.creditStatus !== 'PAGADO') return false;
        if (creditStatusFilter === 'OVERDUE' && !isSaleOverdue(sale)) return false;
      }

      // Date filter
      if (dateFilter === 'TODAY') {
        const saleDateStr = sale.createdAt ? sale.createdAt.split('T')[0] : '';
        if (saleDateStr !== todayStr) return false;
      } else if (dateFilter === 'WEEK') {
        if (!sale.createdAt || sale.createdAt < weekAgoStr) return false;
      } else if (dateFilter === 'MONTH') {
        if (!sale.createdAt || sale.createdAt < monthAgoStr) return false;
      }

      // Search term
      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesInvoice = sale.invoiceNumber.toLowerCase().includes(q);
        const matchesCustomer = sale.customerName.toLowerCase().includes(q);
        const matchesPhone = sale.customerPhone.toLowerCase().includes(q);
        const matchesDoc = (sale.customerDocument || '').toLowerCase().includes(q);
        const matchesItem = sale.items.some((i) => i.name.toLowerCase().includes(q) || (i.sku || '').toLowerCase().includes(q));
        if (!matchesInvoice && !matchesCustomer && !matchesPhone && !matchesDoc && !matchesItem) {
          return false;
        }
      }

      return true;
    });
  }, [sales, conditionFilter, creditStatusFilter, dateFilter, searchTerm]);

  // Overall statistics
  const stats = useMemo(() => {
    const totalUSD = sales.reduce((sum, s) => sum + s.total, 0);
    const contadoSales = sales.filter((s) => !s.paymentType || s.paymentType === 'CONTADO');
    const contadoTotalUSD = contadoSales.reduce((sum, s) => sum + s.total, 0);

    const creditSales = sales.filter((s) => s.paymentType === 'CREDITO');
    const creditTotalUSD = creditSales.reduce((sum, s) => sum + s.total, 0);
    const creditPaidTotalUSD = creditSales.reduce((sum, s) => sum + (s.creditPaidAmount || 0), 0);
    const creditPendingUSD = Math.max(0, creditTotalUSD - creditPaidTotalUSD);

    const apartadoSales = sales.filter((s) => s.paymentType === 'APARTADO');
    const apartadoTotalUSD = apartadoSales.reduce((sum, s) => sum + s.total, 0);
    const apartadoPaidTotalUSD = apartadoSales.reduce((sum, s) => sum + (s.creditPaidAmount || 0), 0);
    const apartadoPendingUSD = Math.max(0, apartadoTotalUSD - apartadoPaidTotalUSD);

    const mlSales = sales.filter((s) => s.paymentType === 'MERCADOLIBRE');
    const mlTotalUSD = mlSales.reduce((sum, s) => sum + s.total, 0);
    const mlCommissionsUSD = mlSales.reduce((sum, s) => sum + (s.mercadolibreCommissionUSD || 0), 0);

    const overdueCount = [...creditSales, ...apartadoSales].filter((s) => isSaleOverdue(s)).length;

    return {
      totalUSD,
      totalBs: totalUSD * rate,
      contadoCount: contadoSales.length,
      contadoTotalUSD,
      creditCount: creditSales.length,
      creditTotalUSD,
      creditPaidTotalUSD,
      creditPendingUSD,
      creditPendingBs: creditPendingUSD * rate,
      apartadoCount: apartadoSales.length,
      apartadoTotalUSD,
      apartadoPaidTotalUSD,
      apartadoPendingUSD,
      apartadoPendingBs: apartadoPendingUSD * rate,
      mlCount: mlSales.length,
      mlTotalUSD,
      mlCommissionsUSD,
      overdueCount,
    };
  }, [sales, rate]);

  const handleOpenPaymentModal = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPaymentModalSale(sale);
    const pending = Math.max(0, sale.total - (sale.creditPaidAmount || 0));
    setPaymentAmountUSD(pending);
    setPaymentMethod('Pago Móvil');
    setPaymentRef('');
    setPaymentNotes('');
    setSendWhatsAppOnPayment(true);
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalSale) return;
    const amount = Number(paymentAmountUSD);
    if (isNaN(amount) || amount <= 0) {
      showToast('Ingresa un monto válido para el abono');
      return;
    }

    const result = recordCreditPayment(paymentModalSale.id, {
      amountUSD: amount,
      paymentMethod,
      reference: paymentRef.trim() || undefined,
      notes: paymentNotes.trim() || undefined,
    });

    showToast(`¡Abono de ${formatUSD(amount)} registrado con éxito!`);
    setPaymentModalSale(null);

    if (result && sendWhatsAppOnPayment) {
      const { message, url } = buildCreditPaymentReceiptWhatsAppMessage(
        result.updatedSale,
        result.paymentRecord,
        settings,
        result.totalCustomerDebtAfterUSD
      );
      setWhatsappModalData({
        title: `Comprobante de Abono - Factura ${result.updatedSale.invoiceNumber}`,
        message,
        url,
        phone: result.updatedSale.customerPhone,
        recipientName: result.updatedSale.customerName,
        sale: result.updatedSale,
      });
    }
  };

  const handleOpenEditSaleModal = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditSaleModal(sale);
    setEditCustomerId('');
    setEditCustomerName(sale.customerName || '');
    setEditCustomerPhone(sale.customerPhone === 'N/A' ? '' : sale.customerPhone || '');
    setEditCustomerDocument(sale.customerDocument || '');
    setEditCreditDueDate(sale.creditDueDate || '');
    setEditNotes(sale.notes || '');
  };

  const handleSaveEditedSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSaleModal) return;
    const cleanName = editCustomerName.trim();
    if (!cleanName) {
      showToast('Ingresa el nombre del cliente para guardar los cambios.');
      return;
    }

    const updated = updateSale(editSaleModal.id, {
      customerId: editCustomerId || undefined,
      customerName: cleanName,
      customerPhone: editCustomerPhone.trim() || 'N/A',
      customerDocument: editCustomerDocument.trim() || undefined,
      creditDueDate: editCreditDueDate || undefined,
      notes: editNotes.trim() || undefined,
      reassignCustomer: !editCustomerId,
    });

    if (updated && selectedSaleDetail?.id === updated.id) {
      setSelectedSaleDetail(updated);
    }

    showToast(`Factura ${editSaleModal.invoiceNumber} actualizada y asignada a ${cleanName}`);
    setEditSaleModal(null);
  };

  const handleSendReminder = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const { message, url } = buildCreditReminderWhatsAppMessage(sale, settings);
    setWhatsappModalData({
      title: `Recordatorio de Saldo - Factura ${sale.invoiceNumber}`,
      message,
      url,
      phone: sale.customerPhone,
      recipientName: sale.customerName,
      sale,
    });
  };

  const handleSendInvoice = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const { message, url } = buildInvoiceWhatsAppMessage(sale, settings);
    setWhatsappModalData({
      title: `Factura ${sale.invoiceNumber} - ${sale.customerName}`,
      message,
      url,
      phone: sale.customerPhone,
      recipientName: sale.customerName,
      sale,
    });
  };

  const handleVoidSale = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setVoidReason('Venta de prueba / no creada por mí');
    setVoidRestoreStock(false);
    setVoidModalSale(sale);
  };

  const handleConfirmVoidSale = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!voidModalSale || isProcessingVoid) return;
    const target = voidModalSale;
    const cleanReason = voidReason.trim() || 'Anulada por administración / no reconocida';
    setIsProcessingVoid(true);
    try {
      await voidSale(target.id, cleanReason, voidRestoreStock);
      showToast(`Factura ${target.invoiceNumber} anulada con éxito`);
      if (selectedSaleDetail?.id === target.id) {
        setSelectedSaleDetail((prev) =>
          prev
            ? {
                ...prev,
                isVoided: true,
                creditStatus: 'ANULADO',
                voidReason: cleanReason,
                voidedAt: new Date().toISOString(),
              }
            : null
        );
      }
      setVoidModalSale(null);
    } finally {
      setIsProcessingVoid(false);
    }
  };

  const handleReactivateSale = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setReactivateModalSale(sale);
  };

  const handleConfirmReactivateSale = async () => {
    if (!reactivateModalSale || isProcessingReactivate) return;
    const target = reactivateModalSale;
    setIsProcessingReactivate(true);
    try {
      await reactivateSale(target.id);
      const isPaid =
        target.paymentType !== 'CREDITO' || (target.creditPaidAmount || 0) >= target.total;
      showToast(`Factura ${target.invoiceNumber} reactivada con éxito`);
      if (selectedSaleDetail?.id === target.id) {
        setSelectedSaleDetail((prev) =>
          prev
            ? {
                ...prev,
                isVoided: false,
                creditStatus: isPaid ? 'PAGADO' : 'PENDIENTE',
                voidReason: undefined,
                voidedAt: undefined,
              }
            : null
        );
      }
      setReactivateModalSale(null);
    } finally {
      setIsProcessingReactivate(false);
    }
  };

  const handleDelete = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteRestoreStock(false);
    setDeleteModalSale(sale);
  };

  const handleConfirmDeleteSale = async () => {
    if (!deleteModalSale || isProcessingDelete) return;
    const target = deleteModalSale;
    setIsProcessingDelete(true);
    try {
      await deleteSale(target.id, deleteRestoreStock);
      showToast(`Factura ${target.invoiceNumber} eliminada definitivamente de la base de datos`);
      if (selectedSaleDetail?.id === target.id) {
        setSelectedSaleDetail(null);
      }
      setDeleteModalSale(null);
    } finally {
      setIsProcessingDelete(false);
    }
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastMessage && (
        <div className="fixed top-5 right-5 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl border border-slate-700 flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-top-2">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-semibold">{toastMessage}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
            Control de Ventas & Facturación
          </span>
          <h1 className="text-2xl font-bold font-display text-slate-900 mt-0.5">
            Base de Datos & Historial de Ventas
          </h1>
          <p className="text-xs text-slate-500">
            Registro permanente de todas las facturas emitidas (Contado, Crédito, Apartado y MercadoLibre) con montos en USD y Bolívares al BCV.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setCurrentView('admin_cuentas_cobrar')}
            className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-xl text-xs font-bold transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer"
          >
            <Clock className="w-4 h-4 text-amber-600" />
            <span>Ver Cuentas por Cobrar ({(stats.creditPendingUSD + stats.apartadoPendingUSD) > 0 ? formatUSD(stats.creditPendingUSD + stats.apartadoPendingUSD) : 'Al día'})</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentView('admin_pos')}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>+ Nueva Venta (POS)</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Facturado */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Facturado</span>
            <span className="w-7 h-7 rounded-lg bg-slate-100 text-slate-700 flex items-center justify-center font-bold">
              {sales.length}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-slate-900 tabular-nums">
            {formatUSD(stats.totalUSD)}
          </div>
          <div className="text-xs font-semibold text-emerald-700 font-mono">
            {formatBs(stats.totalBs)}
          </div>
          <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
            Ventas acumuladas registradas
          </p>
        </div>

        {/* Ventas de Contado */}
        <div className="bg-white rounded-2xl border border-emerald-200 bg-emerald-50/20 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-emerald-900">
            <span className="flex items-center gap-1">
              <Banknote className="w-3.5 h-3.5 text-emerald-600" />
              <span>De Contado (Cobrado)</span>
            </span>
            <span className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-800 flex items-center justify-center font-bold text-xs">
              {stats.contadoCount}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-emerald-900 tabular-nums">
            {formatUSD(stats.contadoTotalUSD)}
          </div>
          <div className="text-xs font-semibold text-emerald-700 font-mono">
            {formatBs(stats.contadoTotalUSD * rate)}
          </div>
          <p className="text-[10px] text-emerald-700 pt-1 border-t border-emerald-100">
            Cobrado inmediatamente al entregar
          </p>
        </div>

        {/* Ventas a Crédito & Saldo Pendiente */}
        <div className="bg-white rounded-2xl border border-amber-200 bg-amber-50/20 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-950">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Créditos (Por Cobrar)</span>
            </span>
            <span className="w-7 h-7 rounded-lg bg-amber-100 text-amber-900 flex items-center justify-center font-bold text-xs">
              {stats.creditCount}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-amber-950 tabular-nums">
            {formatUSD(stats.creditPendingUSD)}
          </div>
          <div className="text-xs font-semibold text-amber-800 font-mono">
            {formatBs(stats.creditPendingBs)}
          </div>
          <div className="flex items-center justify-between text-[10px] text-amber-900 pt-1 border-t border-amber-200/60">
            <span>Cobrado: {formatUSD(stats.creditPaidTotalUSD)}</span>
            {stats.overdueCount > 0 && (
              <span className="font-bold text-rose-700 bg-rose-100 px-1.5 py-0.2 rounded">
                {stats.overdueCount} vencida(s)
              </span>
            )}
          </div>
        </div>

        {/* MercadoLibre */}
        <div className="bg-white rounded-2xl border border-yellow-300 bg-yellow-50/30 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-yellow-950">
            <span className="flex items-center gap-1">
              <Package className="w-3.5 h-3.5 text-yellow-700" />
              <span>MercadoLibre</span>
            </span>
            <span className="w-7 h-7 rounded-lg bg-yellow-100 text-yellow-900 flex items-center justify-center font-bold text-xs">
              {stats.mlCount}
            </span>
          </div>
          <div className="text-xl font-bold font-mono text-yellow-950 tabular-nums">
            {formatUSD(stats.mlTotalUSD)}
          </div>
          <div className="text-xs font-semibold text-yellow-800 font-mono">
            Comisiones ML: {formatUSD(stats.mlCommissionsUSD)}
          </div>
          <p className="text-[10px] text-yellow-800 pt-1 border-t border-yellow-200/80">
            Ventas registradas con recargo ML
          </p>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col md:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por N° factura (ej. FACT-2026-0101), cliente, teléfono, cédula o repuesto..."
              className="w-full pl-10 pr-8 py-2 text-xs rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 font-medium"
            />
            {searchTerm && (
              <button
                type="button"
                onClick={() => setSearchTerm('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1 cursor-pointer"
              >
                ✕
              </button>
            )}
          </div>

          {/* Condition Filter */}
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 sm:pb-0 scrollbar-none text-xs">
            <button
              type="button"
              onClick={() => {
                setConditionFilter('ALL');
                setCreditStatusFilter('ALL');
              }}
              className={`px-3 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
                conditionFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todas ({sales.length})
            </button>

            <button
              type="button"
              onClick={() => setConditionFilter('CONTADO')}
              className={`px-3 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                conditionFilter === 'CONTADO'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Banknote className="w-3.5 h-3.5" />
              <span>Contado ({stats.contadoCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setConditionFilter('CREDITO')}
              className={`px-3 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                conditionFilter === 'CREDITO'
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Clock className="w-3.5 h-3.5" />
              <span>Créditos ({stats.creditCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setConditionFilter('APARTADO')}
              className={`px-3 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                conditionFilter === 'APARTADO'
                  ? 'bg-indigo-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <BookmarkCheck className="w-3.5 h-3.5" />
              <span>Apartado ({stats.apartadoCount})</span>
            </button>

            <button
              type="button"
              onClick={() => setConditionFilter('MERCADOLIBRE')}
              className={`px-3 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                conditionFilter === 'MERCADOLIBRE'
                  ? 'bg-yellow-500 text-slate-950 font-extrabold shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Package className="w-3.5 h-3.5" />
              <span>MercadoLibre ({stats.mlCount})</span>
            </button>
          </div>
        </div>

        {/* Sub-filters (Date & Credit Status) */}
        <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-1.5 flex-wrap">
            <span className="text-[11px] font-semibold text-slate-500">Período:</span>
            {[
              { id: 'ALL', label: 'Todo' },
              { id: 'TODAY', label: 'Hoy' },
              { id: 'WEEK', label: 'Últimos 7 días' },
              { id: 'MONTH', label: 'Este mes' },
            ].map((d) => (
              <button
                key={d.id}
                type="button"
                onClick={() => setDateFilter(d.id as any)}
                className={`px-2.5 py-1 rounded-lg text-[11px] font-semibold cursor-pointer ${
                  dateFilter === d.id
                    ? 'bg-slate-800 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                {d.label}
              </button>
            ))}
          </div>

          {(conditionFilter === 'CREDITO' || conditionFilter === 'APARTADO') && (
            <div className="flex items-center gap-1.5 flex-wrap">
              <span className={`text-[11px] font-semibold ${conditionFilter === 'APARTADO' ? 'text-indigo-900' : 'text-amber-900'}`}>
                {conditionFilter === 'APARTADO' ? 'Estado Apartado:' : 'Estado Crédito:'}
              </span>
              {[
                { id: 'ALL', label: 'Todos' },
                { id: 'PENDIENTE', label: 'Pendientes' },
                { id: 'PAGADO', label: 'Cobrados' },
                { id: 'OVERDUE', label: '⚠️ Vencidos' },
              ].map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setCreditStatusFilter(c.id as any)}
                  className={`px-2.5 py-1 rounded-lg text-[11px] font-bold cursor-pointer ${
                    creditStatusFilter === c.id
                      ? 'bg-amber-600 text-white'
                      : 'bg-amber-50 text-amber-800 hover:bg-amber-100 border border-amber-200'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Sales List Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-2xs">
        <div className="p-4 bg-slate-50 border-b border-slate-200 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="w-4 h-4 text-slate-700" />
            <h3 className="font-bold text-xs uppercase tracking-wider text-slate-900">
              Listado de Ventas Registradas ({filteredSales.length})
            </h3>
          </div>
          <span className="text-[11px] text-slate-500 font-mono">
            Tasa BCV aplicable: Bs. {rate.toFixed(2)}
          </span>
        </div>

        {filteredSales.length === 0 ? (
          <div className="p-12 text-center space-y-3">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
              <FileText className="w-6 h-6" />
            </div>
            <div>
              <p className="font-bold text-sm text-slate-700">No se encontraron ventas con estos filtros</p>
              <p className="text-xs text-slate-400 mt-0.5">
                {searchTerm ? 'Prueba con otro término de búsqueda o limpia los filtros.' : 'Comienza registrando una venta en el Punto de Venta.'}
              </p>
            </div>
            <button
              type="button"
              onClick={() => setCurrentView('admin_pos')}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
            >
              <Plus className="w-4 h-4" />
              <span>Ir al Punto de Venta</span>
            </button>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-100/70 text-[11px] font-bold text-slate-600 uppercase tracking-wider">
                  <th className="py-3 px-4">Factura & Fecha</th>
                  <th className="py-3 px-4">Cliente (WhatsApp / CI)</th>
                  <th className="py-3 px-4">Condición</th>
                  <th className="py-3 px-4">Repuestos / Servicios</th>
                  <th className="py-3 px-4 text-right">Monto Total</th>
                  <th className="py-3 px-4 text-center">Estado de Cobro</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSales.map((sale) => {
                  const saleType = sale.paymentType || 'CONTADO';
                  const isCredit = saleType === 'CREDITO';
                  const isApartado = saleType === 'APARTADO';
                  const isDeferred = isCredit || isApartado;
                  const isML = saleType === 'MERCADOLIBRE';
                  const isFullyPaid = isDeferred ? (sale.creditStatus === 'PAGADO' || (sale.creditPaidAmount || 0) >= sale.total) : true;
                  const pendingBalanceUSD = isDeferred ? Math.max(0, sale.total - (sale.creditPaidAmount || 0)) : 0;
                  const overdueInfo = isDeferred ? getDaysOverdueOrRemaining(sale) : null;
                  const saleRate = sale.bcvRate || rate;

                  return (
                    <tr
                      key={sale.id}
                      onClick={() => setSelectedSaleDetail(sale)}
                      className="hover:bg-slate-50/80 transition-colors cursor-pointer group"
                    >
                      {/* Factura & Fecha */}
                      <td className="py-3.5 px-4 align-top">
                        <span className="font-mono font-bold text-slate-900 block group-hover:text-amber-600 transition-colors">
                          {sale.invoiceNumber}
                        </span>
                        <span className="text-[10px] text-slate-500 block font-mono">
                          {new Date(sale.createdAt).toLocaleDateString('es-VE', {
                            day: '2-digit',
                            month: 'short',
                            year: 'numeric',
                          })} · {new Date(sale.createdAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </td>

                      {/* Cliente */}
                      <td className="py-3.5 px-4 align-top">
                        <span className="font-bold text-slate-900 block">{sale.customerName}</span>
                        <span className="text-[10px] text-slate-500 block font-mono">
                          📱 {sale.customerPhone}
                        </span>
                        {sale.customerDocument && (
                          <span className="text-[10px] text-slate-400 block font-mono">
                            CI: {sale.customerDocument}
                          </span>
                        )}
                      </td>

                      {/* Condición */}
                      <td className="py-3.5 px-4 align-top">
                        {saleType === 'CONTADO' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <Banknote className="w-3 h-3 text-emerald-600" />
                            <span>Contado</span>
                          </span>
                        )}
                        {saleType === 'CREDITO' && (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-300">
                              <Clock className="w-3 h-3 text-amber-600" />
                              <span>A Crédito ({sale.creditDays || 15} d)</span>
                            </span>
                            {overdueInfo && (
                              <span
                                className={`text-[10px] font-semibold block ${
                                  overdueInfo.isOverdue ? 'text-rose-600 font-bold' : 'text-amber-700'
                                }`}
                              >
                                {overdueInfo.text}
                              </span>
                            )}
                          </div>
                        )}
                        {saleType === 'APARTADO' && (
                          <div className="space-y-1">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-indigo-100 text-indigo-900 border border-indigo-300">
                              <BookmarkCheck className="w-3 h-3 text-indigo-600" />
                              <span>Apartado ({sale.creditDays || 15} d)</span>
                            </span>
                            {overdueInfo && (
                              <span
                                className={`text-[10px] font-semibold block ${
                                  overdueInfo.isOverdue ? 'text-rose-600 font-bold' : 'text-indigo-700'
                                }`}
                              >
                                {overdueInfo.text}
                              </span>
                            )}
                          </div>
                        )}
                        {saleType === 'MERCADOLIBRE' && (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-yellow-200 text-yellow-950 border border-yellow-300">
                            <Package className="w-3 h-3 text-yellow-800" />
                            <span>MercadoLibre</span>
                          </span>
                        )}
                      </td>

                      {/* Repuestos / Servicios */}
                      <td className="py-3.5 px-4 align-top max-w-[240px]">
                        <div className="space-y-0.5">
                          {sale.items.slice(0, 2).map((item, idx) => (
                            <div key={idx} className="text-[11px] truncate text-slate-700 flex items-center gap-1">
                              <span className="font-mono font-bold text-slate-500">{item.quantity}x</span>
                              <span className="truncate">{item.name}</span>
                            </div>
                          ))}
                          {sale.items.length > 2 && (
                            <span className="text-[10px] text-amber-700 font-bold block">
                              +{sale.items.length - 2} ítem(s) más...
                            </span>
                          )}
                        </div>
                      </td>

                      {/* Monto Total */}
                      <td className="py-3.5 px-4 align-top text-right font-mono">
                        <span className="font-bold text-slate-900 block text-sm tabular-nums">
                          {formatUSD(sale.total)}
                        </span>
                        <span className="text-[10px] text-emerald-700 font-semibold block tabular-nums">
                          {formatBs(sale.total * saleRate)}
                        </span>
                      </td>

                      {/* Estado de Cobro */}
                      <td className="py-3.5 px-4 align-top text-center">
                        {sale.isVoided || sale.creditStatus === 'ANULADO' ? (
                          <div className="space-y-0.5">
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300">
                              <Ban className="w-3 h-3 text-rose-700" />
                              <span>ANULADA</span>
                            </span>
                            {sale.voidReason && (
                              <span className="text-[10px] text-slate-400 block truncate max-w-[120px]" title={sale.voidReason}>
                                {sale.voidReason}
                              </span>
                            )}
                          </div>
                        ) : isDeferred ? (
                          isFullyPaid ? (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              <span>{isApartado ? 'Apartado Retirado' : 'Cobrado 100%'}</span>
                            </span>
                          ) : (
                            <div className="space-y-0.5">
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-200">
                                <AlertCircle className="w-3 h-3 text-rose-600" />
                                <span>Resta {formatUSD(pendingBalanceUSD)}</span>
                              </span>
                              {(sale.creditPaidAmount || 0) > 0 && (
                                <span className="text-[10px] text-slate-400 block font-mono">
                                  Abonado: {formatUSD(sale.creditPaidAmount || 0)}
                                </span>
                              )}
                            </div>
                          )
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-emerald-100 text-emerald-800 border border-emerald-200">
                            <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                            <span>Pagado</span>
                          </span>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="py-3.5 px-4 align-top text-center" onClick={(e) => e.stopPropagation()}>
                        <div className="flex items-center justify-center gap-1">
                          {/* PDF */}
                          <button
                            type="button"
                            onClick={() => downloadInvoicePDF(sale, settings)}
                            className="p-1.5 text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer transition-colors"
                            title="Descargar PDF de la factura"
                          >
                            <Download className="w-3.5 h-3.5" />
                          </button>

                          {/* WhatsApp */}
                          <button
                            type="button"
                            onClick={(e) => handleSendInvoice(sale, e)}
                            className="p-1.5 text-emerald-600 hover:text-emerald-700 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                            title="Enviar Factura a WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          {/* Si es crédito o apartado pendiente no anulado: Registrar Abono & Notificar Cobro */}
                          {isDeferred && !isFullyPaid && !sale.isVoided && sale.creditStatus !== 'ANULADO' && (
                            <>
                              <button
                                type="button"
                                onClick={(e) => handleOpenPaymentModal(sale, e)}
                                className="p-1.5 text-amber-700 hover:text-amber-900 hover:bg-amber-100 rounded-lg cursor-pointer transition-colors font-bold text-[10px] flex items-center gap-0.5"
                                title="Registrar abono o pago"
                              >
                                <DollarSign className="w-3.5 h-3.5" />
                              </button>

                              <button
                                type="button"
                                onClick={(e) => handleSendReminder(sale, e)}
                                className="p-1.5 text-rose-600 hover:text-rose-800 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                                title="Enviar recordatorio de cobro por WhatsApp"
                              >
                                🔔
                              </button>
                            </>
                          )}

                          {/* Anular o Reactivar */}
                          {sale.isVoided || sale.creditStatus === 'ANULADO' ? (
                            <button
                              type="button"
                              onClick={(e) => handleReactivateSale(sale, e)}
                              className="p-1.5 text-emerald-600 hover:text-emerald-800 hover:bg-emerald-50 rounded-lg cursor-pointer transition-colors"
                              title="Reactivar factura anulada"
                            >
                              <RotateCcw className="w-3.5 h-3.5" />
                            </button>
                          ) : (
                            <button
                              type="button"
                              onClick={(e) => handleVoidSale(sale, e)}
                              className="p-1.5 text-amber-700 hover:text-amber-900 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                              title="Anular factura (su saldo pasa a $0 sin borrarse de la base de datos)"
                            >
                              <Ban className="w-3.5 h-3.5" />
                            </button>
                          )}

                          {/* Editar Cliente / Factura */}
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditSaleModal(sale, e)}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                            title="Editar cliente o datos de esta factura"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>

                          {/* Eliminar Definitivamente */}
                          <button
                            type="button"
                            onClick={(e) => handleDelete(sale, e)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer transition-colors"
                            title="Eliminar permanentemente de la base de datos"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
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

      {/* Modal: Detalle Completo de Factura */}
      {selectedSaleDetail && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
                  <FileText className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Detalle de Factura {selectedSaleDetail.invoiceNumber}</h3>
                  <span className="text-[11px] text-slate-400 font-mono">
                    {new Date(selectedSaleDetail.createdAt).toLocaleString('es-VE')}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setSelectedSaleDetail(null)}
                className="p-1 text-slate-400 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs max-h-[80vh] overflow-y-auto">
              {/* Cliente y Condición */}
              <div className="grid grid-cols-2 gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">Cliente</span>
                  <span className="font-bold text-slate-900 block">{selectedSaleDetail.customerName}</span>
                  <span className="text-slate-600 font-mono block">📱 {selectedSaleDetail.customerPhone}</span>
                  {selectedSaleDetail.customerDocument && (
                    <span className="text-slate-500 font-mono block">CI: {selectedSaleDetail.customerDocument}</span>
                  )}
                </div>

                <div>
                  <span className="text-[10px] text-slate-400 font-semibold block uppercase">Condición de Venta</span>
                  <span className="font-bold text-slate-900 block">
                    {selectedSaleDetail.paymentType === 'APARTADO'
                      ? `Sistema de Apartado (${selectedSaleDetail.creditDays || 15} días)`
                      : selectedSaleDetail.paymentType === 'CREDITO'
                      ? `A Crédito (${selectedSaleDetail.creditDays || 15} días)`
                      : selectedSaleDetail.paymentType === 'MERCADOLIBRE'
                      ? 'MercadoLibre'
                      : 'De Contado'}
                  </span>
                  {(selectedSaleDetail.paymentType === 'CREDITO' || selectedSaleDetail.paymentType === 'APARTADO') && (
                    <span className="text-amber-800 font-mono block">
                      {selectedSaleDetail.paymentType === 'APARTADO' ? 'Límite retiro:' : 'Vence:'}{' '}
                      {selectedSaleDetail.creditDueDate || 'Sin definir'}
                    </span>
                  )}
                  <span className="text-slate-500 block">Método: {selectedSaleDetail.paymentMethod}</span>
                </div>
              </div>

              {/* Ítems comprados */}
              <div>
                <span className="font-bold text-slate-900 text-xs block mb-2 uppercase tracking-wider">
                  Repuestos & Servicios ({selectedSaleDetail.items.length})
                </span>
                <div className="border border-slate-200 rounded-xl divide-y divide-slate-100 overflow-hidden">
                  {selectedSaleDetail.items.map((item, idx) => (
                    <div key={idx} className="p-2.5 flex items-center justify-between text-xs">
                      <div>
                        <span className="font-bold text-slate-900 block">{item.name}</span>
                        <span className="text-[10px] text-slate-400 font-mono">
                          {item.quantity} x {formatUSD(item.unitPrice)}
                        </span>
                      </div>
                      <span className="font-mono font-bold text-slate-900">
                        {formatUSD(item.total)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Totales */}
              <div className="bg-slate-950 text-white p-4 rounded-xl space-y-1.5 font-mono">
                <div className="flex justify-between text-xs text-slate-400">
                  <span>Subtotal:</span>
                  <span>{formatUSD(selectedSaleDetail.subtotal)}</span>
                </div>
                {selectedSaleDetail.discount > 0 && (
                  <div className="flex justify-between text-xs text-emerald-400">
                    <span>Descuento:</span>
                    <span>-{formatUSD(selectedSaleDetail.discount)}</span>
                  </div>
                )}
                <div className="flex justify-between text-sm font-bold pt-1 border-t border-slate-800 text-amber-400">
                  <span>TOTAL FACTURA ($):</span>
                  <span>{formatUSD(selectedSaleDetail.total)}</span>
                </div>
                <div className="flex justify-between text-xs text-emerald-400">
                  <span>Total en Bolívares (Tasa BCV):</span>
                  <span>{formatBs(selectedSaleDetail.total * (selectedSaleDetail.bcvRate || rate))}</span>
                </div>

                {(selectedSaleDetail.paymentType === 'CREDITO' || selectedSaleDetail.paymentType === 'APARTADO') && (
                  <div className="pt-2 border-t border-slate-800 text-xs flex justify-between text-amber-300">
                    <span>
                      {selectedSaleDetail.paymentType === 'APARTADO'
                        ? 'Saldo Restante para Retirar:'
                        : 'Saldo Pendiente de Cobro:'}
                    </span>
                    <span className="font-bold">
                      {formatUSD(Math.max(0, selectedSaleDetail.total - (selectedSaleDetail.creditPaidAmount || 0)))}
                    </span>
                  </div>
                )}
              </div>

              {/* Botones de acción modal */}
              <div className="pt-2 flex items-center justify-between gap-2 border-t border-slate-200 flex-wrap">
                <div className="flex items-center gap-2">
                  {selectedSaleDetail.isVoided || selectedSaleDetail.creditStatus === 'ANULADO' ? (
                    <button
                      type="button"
                      onClick={() => handleReactivateSale(selectedSaleDetail)}
                      className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <RotateCcw className="w-4 h-4" />
                      <span>Reactivar</span>
                    </button>
                  ) : (
                    <button
                      type="button"
                      onClick={() => handleVoidSale(selectedSaleDetail)}
                      className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-300 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                    >
                      <Ban className="w-4 h-4" />
                      <span>Anular Factura</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleDelete(selectedSaleDetail)}
                    className="px-3 py-2 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Trash2 className="w-4 h-4" />
                    <span>Eliminar</span>
                  </button>
                </div>

                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => handleOpenEditSaleModal(selectedSaleDetail)}
                    className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Editar Cliente</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => downloadInvoicePDF(selectedSaleDetail, settings)}
                    className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Download className="w-4 h-4" />
                    <span>Descargar PDF</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSendInvoice(selectedSaleDetail)}
                    className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <MessageSquare className="w-4 h-4" />
                    <span>Enviar por WhatsApp</span>
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Registrar Abono a Crédito */}
      {paymentModalSale && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-amber-600 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-200" />
                <div>
                  <h3 className="font-bold text-sm">Registrar Abono a Factura</h3>
                  <span className="text-[11px] text-amber-100 font-mono">{paymentModalSale.invoiceNumber}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalSale(null)}
                className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSavePayment} className="p-5 space-y-4 text-xs">
              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-950 space-y-1">
                <div className="flex justify-between">
                  <span>Cliente:</span>
                  <span className="font-bold">{paymentModalSale.customerName}</span>
                </div>
                <div className="flex justify-between">
                  <span>Total Factura:</span>
                  <span className="font-mono">{formatUSD(paymentModalSale.total)}</span>
                </div>
                <div className="flex justify-between">
                  <span>Abono anterior:</span>
                  <span className="font-mono">{formatUSD(paymentModalSale.creditPaidAmount || 0)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-amber-200 font-bold text-amber-900">
                  <span>Saldo Pendiente Actual:</span>
                  <span className="font-mono text-sm">
                    {formatUSD(Math.max(0, paymentModalSale.total - (paymentModalSale.creditPaidAmount || 0)))}
                  </span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Monto del Abono ($ USD) *
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  max={Math.max(0, paymentModalSale.total - (paymentModalSale.creditPaidAmount || 0))}
                  required
                  value={paymentAmountUSD}
                  onChange={(e) => setPaymentAmountUSD(e.target.value === '' ? '' : Number(e.target.value))}
                  className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-sm bg-slate-50 focus:bg-white"
                  autoFocus
                />
                <span className="text-[10px] text-emerald-700 font-mono block mt-1">
                  Equivalente: {paymentAmountUSD ? formatBs(Number(paymentAmountUSD) * rate) : 'Bs. 0,00'} al BCV
                </span>
                {(() => {
                  const currentPending = Math.max(
                    0,
                    paymentModalSale.total - (paymentModalSale.creditPaidAmount || 0)
                  );
                  const abono = Number(paymentAmountUSD) || 0;
                  const newRemaining = Math.max(0, Math.round((currentPending - abono) * 100) / 100);
                  return (
                    <div className="mt-2 p-2.5 rounded-xl bg-slate-900 text-white flex items-center justify-between text-[11px]">
                      <span className="text-slate-300 font-medium">
                        Saldo restante tras aplicar abono:
                      </span>
                      <div className="text-right font-mono font-bold">
                        <span className={newRemaining <= 0.01 ? 'text-emerald-400' : 'text-amber-400'}>
                          {formatUSD(newRemaining)}
                        </span>
                        <span className="text-[10px] text-slate-300 block font-normal">
                          {formatBs(newRemaining * rate)}
                        </span>
                      </div>
                    </div>
                  );
                })()}
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Método de Pago *
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 font-medium"
                >
                  <option value="Pago Móvil">Pago Móvil</option>
                  <option value="Dólares Efectivo (USD)">Dólares Efectivo (USD)</option>
                  <option value="Transferencia Bancaria Bs">Transferencia Bs</option>
                  <option value="Punto de Venta (Bs)">Punto de Venta (Bs)</option>
                  <option value="Binance Pay (USDT)">Binance Pay (USDT)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  N° de Referencia / Comprobante (Opcional)
                </label>
                <input
                  type="text"
                  value={paymentRef}
                  onChange={(e) => setPaymentRef(e.target.value)}
                  placeholder="Ej. 12948271"
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 font-mono"
                />
              </div>

              <label className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl cursor-pointer">
                <input
                  type="checkbox"
                  checked={sendWhatsAppOnPayment}
                  onChange={(e) => setSendWhatsAppOnPayment(e.target.checked)}
                  className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4"
                />
                <span className="text-[11px] font-semibold text-emerald-950 flex items-center gap-1.5">
                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  <span>Enviar comprobante del abono y saldo actual al WhatsApp del cliente</span>
                </span>
              </label>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPaymentModalSale(null)}
                  className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Guardar Abono y Notificar</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: EDITAR Cliente / Datos de Factura */}
      {editSaleModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm">Editar Cliente / Factura</h3>
                  <span className="text-[11px] text-slate-300 font-mono">
                    {editSaleModal.invoiceNumber} · {formatUSD(editSaleModal.total)}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditSaleModal(null)}
                className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveEditedSale} className="p-5 space-y-4 text-xs">
              {customers.length > 0 && (
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Seleccionar Cliente Existente (Opcional)
                  </label>
                  <select
                    value={editCustomerId}
                    onChange={(e) => {
                      const cid = e.target.value;
                      setEditCustomerId(cid);
                      if (cid) {
                        const chosen = customers.find((c) => c.id === cid);
                        if (chosen) {
                          setEditCustomerName(chosen.name);
                          setEditCustomerPhone(chosen.phone === 'N/A' ? '' : chosen.phone || '');
                          setEditCustomerDocument(chosen.documentId || '');
                        }
                      }
                    }}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 font-medium"
                  >
                    <option value="">-- Usar / Crear cliente con los campos de abajo --</option>
                    {customers.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name} {c.phone && c.phone !== 'N/A' ? `(${c.phone})` : ''} {c.documentId ? `- ${c.documentId}` : ''}
                      </option>
                    ))}
                  </select>
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre Completo del Cliente *
                </label>
                <input
                  type="text"
                  required
                  value={editCustomerName}
                  onChange={(e) => {
                    setEditCustomerName(e.target.value);
                    setEditCustomerId('');
                  }}
                  placeholder="Ej. Edithson Ricardo Rondon Mendoza"
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white font-semibold"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="tel"
                    value={editCustomerPhone}
                    onChange={(e) => {
                      setEditCustomerPhone(e.target.value);
                      setEditCustomerId('');
                    }}
                    placeholder="Ej. 04141234567"
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Cédula / RIF
                  </label>
                  <input
                    type="text"
                    value={editCustomerDocument}
                    onChange={(e) => {
                      setEditCustomerDocument(e.target.value);
                      setEditCustomerId('');
                    }}
                    placeholder="Ej. V-12345678"
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {(editSaleModal.paymentType === 'CREDITO' || editSaleModal.paymentType === 'APARTADO') && (
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      {editSaleModal.paymentType === 'APARTADO' ? 'Fecha Límite de Retiro' : 'Fecha de Vencimiento'}
                    </label>
                    <input
                      type="date"
                      value={editCreditDueDate}
                      onChange={(e) => setEditCreditDueDate(e.target.value)}
                      className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 font-mono"
                    />
                  </div>
                )}
                <div
                  className={
                    editSaleModal.paymentType === 'CREDITO' || editSaleModal.paymentType === 'APARTADO'
                      ? ''
                      : 'col-span-2'
                  }
                >
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Notas
                  </label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Observación opcional..."
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditSaleModal(null)}
                  className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                  <span>Guardar Cambios</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Anular Factura */}
      {voidModalSale && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-[60] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full border border-amber-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-amber-600 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-amber-100" />
                <div>
                  <h3 className="font-bold text-sm">Anular Factura</h3>
                  <span className="text-[11px] text-amber-100 font-mono">
                    {voidModalSale.invoiceNumber} · {voidModalSale.customerName}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVoidModalSale(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmVoidSale} className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 space-y-1">
                <p className="font-bold">
                  Monto: {formatUSD(voidModalSale.total)} ({formatBs(voidModalSale.total * (voidModalSale.bcvRate || rate))})
                </p>
                <p className="text-[11px] text-amber-800">
                  La factura quedará marcada como <strong>ANULADA</strong> y no sumará en los ingresos ni cuentas pendientes por cobrar.
                </p>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Motivo de anulación
                </label>
                <input
                  type="text"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Ej. Venta de prueba / no creada por mí"
                  autoFocus
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={voidRestoreStock}
                  onChange={(e) => setVoidRestoreStock(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-slate-900 block">
                    Restaurar repuestos al inventario físico
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Marca esta opción si deseas devolver las cantidades de esta factura al stock del almacén.
                  </span>
                </div>
              </label>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setVoidModalSale(null)}
                  disabled={isProcessingVoid}
                  className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  disabled={isProcessingVoid}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Ban className="w-4 h-4" />
                  <span>{isProcessingVoid ? 'Anulando...' : 'Confirmar Anulación'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Eliminar Factura Definitivamente */}
      {deleteModalSale && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-[60] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full border border-rose-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-rose-600 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-100" />
                <div>
                  <h3 className="font-bold text-sm">Eliminar Factura Permanentemente</h3>
                  <span className="text-[11px] text-rose-100 font-mono">
                    {deleteModalSale.invoiceNumber} · {deleteModalSale.customerName}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalSale(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-950 space-y-1">
                <p className="font-bold">
                  ¿Eliminar definitivamente la factura {deleteModalSale.invoiceNumber}?
                </p>
                <p className="text-[11px] text-rose-800">
                  Monto: <strong className="font-mono">{formatUSD(deleteModalSale.total)}</strong> · Se borrará por completo de la base de datos local y en la nube. Esta acción no se puede deshacer.
                </p>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-slate-50 border border-slate-200 cursor-pointer hover:bg-slate-100 transition-colors">
                <input
                  type="checkbox"
                  checked={deleteRestoreStock}
                  onChange={(e) => setDeleteRestoreStock(e.target.checked)}
                  className="mt-0.5 rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                />
                <div>
                  <span className="font-bold text-slate-900 block">
                    Restaurar repuestos al inventario físico
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Si la factura no fue real o no descontó mercancía tuya, déjalo desmarcado.
                  </span>
                </div>
              </label>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setDeleteModalSale(null)}
                  disabled={isProcessingDelete}
                  className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteSale}
                  disabled={isProcessingDelete}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isProcessingDelete ? 'Eliminando...' : 'Eliminar Definitivamente'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Reactivar Factura Anulada */}
      {reactivateModalSale && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-[60] flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full border border-emerald-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-emerald-600 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-emerald-100" />
                <div>
                  <h3 className="font-bold text-sm">Reactivar Factura</h3>
                  <span className="text-[11px] text-emerald-100 font-mono">
                    {reactivateModalSale.invoiceNumber} · {reactivateModalSale.customerName}
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setReactivateModalSale(null)}
                className="text-white/80 hover:text-white p-1 rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-700">
                ¿Deseas reactivar la factura <strong className="font-mono">{reactivateModalSale.invoiceNumber}</strong> por{' '}
                <strong className="font-mono">{formatUSD(reactivateModalSale.total)}</strong> y restaurar su estado anterior en el sistema?
              </p>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReactivateModalSale(null)}
                  disabled={isProcessingReactivate}
                  className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReactivateSale}
                  disabled={isProcessingReactivate}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isProcessingReactivate ? 'Reactivando...' : 'Sí, Reactivar'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
