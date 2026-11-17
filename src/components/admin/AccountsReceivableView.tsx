import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Sale, PaymentMethod, Customer } from '../../types';
import {
  formatUSD,
  formatBs,
  buildCreditReminderWhatsAppMessage,
  buildCustomerAccountStatementWhatsAppMessage,
} from '../../utils/whatsapp';
import { downloadInvoicePDF } from '../../utils/pdfInvoice';
import {
  Clock,
  AlertTriangle,
  CheckCircle2,
  Calendar,
  MessageSquare,
  DollarSign,
  Download,
  Search,
  ChevronDown,
  ChevronUp,
  User,
  Phone,
  FileText,
  TrendingUp,
  CreditCard,
  Send,
  X,
  History,
  AlertCircle,
  Bell,
  Check,
  Trash2,
  Ban,
  RotateCcw,
  AlertOctagon,
  Sparkles,
  Edit2,
} from 'lucide-react';

export const AccountsReceivableView: React.FC = () => {
  const {
    sales,
    customers,
    settings,
    updateSale,
    recordCreditPayment,
    deleteSale,
    voidSale,
    reactivateSale,
    deleteCustomerCreditSales,
    voidCustomerCreditSales,
    clearAllTestCreditSales,
    setWhatsappModalData,
    setCurrentView,
  } = useApp();

  const rate = settings.bcvRate;

  // Search & Filtering
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'OVERDUE' | 'NEAR_DUE' | 'PAID' | 'VOIDED'>('ALL');
  const [expandedCustomerId, setExpandedCustomerId] = useState<string | null>(null);

  // Modal para registrar abono
  const [paymentModalSale, setPaymentModalSale] = useState<Sale | null>(null);
  const [paymentAmountUSD, setPaymentAmountUSD] = useState<number | ''>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Pago Móvil');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');

  // Modal para ANULAR cuenta por cobrar
  const [voidModalSale, setVoidModalSale] = useState<Sale | null>(null);
  const [voidReason, setVoidReason] = useState('Cuenta de prueba / no creada por mí');
  const [voidRestoreStock, setVoidRestoreStock] = useState(false);
  const [isVoiding, setIsVoiding] = useState(false);

  // Modal para ELIMINAR definitivamente cuenta por cobrar
  const [deleteModalSale, setDeleteModalSale] = useState<Sale | null>(null);
  const [deleteRestoreStock, setDeleteRestoreStock] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  // Modal para REACTIVAR cuenta anulada
  const [reactivateModalSale, setReactivateModalSale] = useState<Sale | null>(null);
  const [isReactivating, setIsReactivating] = useState(false);

  // Modal para LIMPIAR todas las cuentas no creadas por el usuario / cuentas de prueba
  const [clearTestModalOpen, setClearTestModalOpen] = useState(false);
  const [clearActionType, setClearActionType] = useState<'DELETE' | 'VOID'>('DELETE');
  const [isClearingAll, setIsClearingAll] = useState(false);

  // Modal para acción en lote por cliente (Anular o Eliminar todas las cuentas de un cliente)
  const [customerBatchModal, setCustomerBatchModal] = useState<{
    saleIds: string[];
    customerName: string;
    action: 'VOID' | 'DELETE';
    count: number;
    debtUSD: number;
  } | null>(null);
  const [isProcessingCustomerBatch, setIsProcessingCustomerBatch] = useState(false);

  // Modal para EDITAR cliente o datos de una factura a crédito
  const [editSaleModal, setEditSaleModal] = useState<Sale | null>(null);
  const [editCustomerId, setEditCustomerId] = useState<string>('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerDocument, setEditCustomerDocument] = useState('');
  const [editCreditDueDate, setEditCreditDueDate] = useState('');
  const [editNotes, setEditNotes] = useState('');

  // Notificaciones periódicas
  const [reminderFrequency, setReminderFrequency] = useState<'SEMANAL' | 'QUINCENAL' | 'AL_VENCER'>('SEMANAL');

  // Toast feedback
  const [toastState, setToastState] = useState<{ message: string; type: 'success' | 'error' } | null>(null);
  const showToast = (msg: string, type: 'success' | 'error' = 'success') => {
    setToastState({ message: msg, type });
    setTimeout(() => setToastState(null), 4000);
  };

  // Helper for overdue calculation
  const getDaysDiff = (dueDateStr?: string): { days: number; isOverdue: boolean; label: string } => {
    if (!dueDateStr) return { days: 0, isOverdue: false, label: 'Sin fecha' };
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { days: diffDays, isOverdue: true, label: `⚠️ Vencido hace ${Math.abs(diffDays)} día(s)` };
    } else if (diffDays === 0) {
      return { days: 0, isOverdue: true, label: `⚠️ ¡Vence hoy!` };
    } else {
      return { days: diffDays, isOverdue: false, label: `⏳ Vence en ${diffDays} día(s)` };
    }
  };

  // Filter only pending active credit/apartado sales (excludes fully paid and voided/anuladas)
  const allPendingSales = useMemo(() => {
    return sales.filter((s) => {
      if (s.paymentType !== 'CREDITO' && s.paymentType !== 'APARTADO') return false;
      if (s.creditStatus === 'PAGADO') return false;
      if (s.creditStatus === 'ANULADO' || s.isVoided) return false;
      const pendingUSD = Math.max(0, s.total - (s.creditPaidAmount || 0));
      return pendingUSD > 0.01;
    });
  }, [sales]);

  // All paid credit/apartado sales (history / audit)
  const allPaidCreditSales = useMemo(() => {
    return sales
      .filter(
        (s) =>
          (s.paymentType === 'CREDITO' || s.paymentType === 'APARTADO') &&
          !s.isVoided &&
          s.creditStatus === 'PAGADO'
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [sales]);

  // All voided credit/apartado sales
  const allVoidedSales = useMemo(() => {
    return sales
      .filter(
        (s) =>
          (s.paymentType === 'CREDITO' || s.paymentType === 'APARTADO') &&
          (s.creditStatus === 'ANULADO' || s.isVoided)
      )
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [sales]);

  // Group pending sales by canonical Customer (matching customerId, documentId, phone, or normalized name)
  interface CustomerReceivables {
    customerId: string;
    customerName: string;
    customerPhone: string;
    customerDocument?: string;
    totalDebtUSD: number;
    totalDebtBs: number;
    pendingSales: Sale[];
    hasOverdue: boolean;
    oldestDueDate?: string;
  }

  const customerReceivablesList = useMemo(() => {
    const map = new Map<string, CustomerReceivables>();

    const normalizeName = (name?: string) =>
      (name || 'Cliente Mostrador')
        .trim()
        .toLowerCase()
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/\s+/g, ' ');

    const normalizeDoc = (doc?: string) => {
      const digits = (doc || '').replace(/\D/g, '');
      return digits.length >= 5 && !/^0+$/.test(digits) ? digits : '';
    };

    const normalizePhone = (phone?: string) => {
      const digits = (phone || '').replace(/\D/g, '');
      if (digits.length < 7 || /^0+$/.test(digits)) return '';
      if (digits.length === 12 && digits.startsWith('58')) return digits.slice(2);
      if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
      return digits;
    };

    const customersById = new Map<string, Customer>(customers.map((c) => [c.id, c]));
    const docToKey = new Map<string, string>();
    const phoneToKey = new Map<string, string>();
    const nameToKey = new Map<string, string>();
    const custIdToKey = new Map<string, string>();

    allPendingSales.forEach((sale) => {
      const linkedCustomer = sale.customerId ? customersById.get(sale.customerId) : undefined;
      const canonicalName =
        linkedCustomer && normalizeName(linkedCustomer.name) !== 'cliente mostrador'
          ? linkedCustomer.name
          : sale.customerName;
      const normName = normalizeName(canonicalName);
      const normDoc = normalizeDoc(sale.customerDocument || linkedCustomer?.documentId);
      const normPhone = normalizePhone(sale.customerPhone || linkedCustomer?.phone);

      let key: string | undefined;
      if (sale.customerId && custIdToKey.has(sale.customerId)) {
        key = custIdToKey.get(sale.customerId);
      }
      if (!key && normDoc && docToKey.has(normDoc)) {
        key = docToKey.get(normDoc);
      }
      if (!key && normPhone && phoneToKey.has(normPhone)) {
        key = phoneToKey.get(normPhone);
      }
      if (!key && normName && nameToKey.has(normName)) {
        const candidateKey = nameToKey.get(normName)!;
        const existingEntry = map.get(candidateKey);
        const existingDoc = normalizeDoc(existingEntry?.customerDocument);
        if (!(normDoc && existingDoc && normDoc !== existingDoc)) {
          key = candidateKey;
        }
      }
      if (!key) {
        key = sale.customerId
          ? `id:${sale.customerId}`
          : normDoc
          ? `doc:${normDoc}`
          : normPhone
          ? `ph:${normPhone}`
          : `name:${normName}`;
      }

      if (sale.customerId) custIdToKey.set(sale.customerId, key);
      if (normDoc) docToKey.set(normDoc, key);
      if (normPhone) phoneToKey.set(normPhone, key);
      if (normName && !nameToKey.has(normName)) nameToKey.set(normName, key);

      const pendingUSD = Math.max(0, sale.total - (sale.creditPaidAmount || 0));
      const overdueInfo = getDaysDiff(sale.creditDueDate);

      if (!map.has(key)) {
        map.set(key, {
          customerId: `grp-${key}`,
          customerName: canonicalName || sale.customerName,
          customerPhone:
            sale.customerPhone && sale.customerPhone !== 'N/A'
              ? sale.customerPhone
              : linkedCustomer?.phone || 'N/A',
          customerDocument: sale.customerDocument || linkedCustomer?.documentId,
          totalDebtUSD: 0,
          totalDebtBs: 0,
          pendingSales: [],
          hasOverdue: false,
          oldestDueDate: sale.creditDueDate,
        });
      }

      const entry = map.get(key)!;
      if ((!entry.customerPhone || entry.customerPhone === 'N/A') && sale.customerPhone && sale.customerPhone !== 'N/A') {
        entry.customerPhone = sale.customerPhone;
      }
      if (!entry.customerDocument && sale.customerDocument) {
        entry.customerDocument = sale.customerDocument;
      }
      entry.totalDebtUSD = Math.round((entry.totalDebtUSD + pendingUSD) * 100) / 100;
      entry.totalDebtBs = entry.totalDebtUSD * rate;
      entry.pendingSales.push(sale);
      if (overdueInfo.isOverdue) {
        entry.hasOverdue = true;
      }
      if (sale.creditDueDate && (!entry.oldestDueDate || sale.creditDueDate < entry.oldestDueDate)) {
        entry.oldestDueDate = sale.creditDueDate;
      }
    });

    return Array.from(map.values())
      .map((entry) => ({
        ...entry,
        pendingSales: [...entry.pendingSales].sort((a, b) =>
          (b.createdAt || '').localeCompare(a.createdAt || '')
        ),
      }))
      .sort((a, b) => {
        // Prioritize clients with overdue invoices first, then by highest debt
        if (a.hasOverdue && !b.hasOverdue) return -1;
        if (!a.hasOverdue && b.hasOverdue) return 1;
        return b.totalDebtUSD - a.totalDebtUSD;
      });
  }, [allPendingSales, customers, rate]);

  // Filtered customer list
  const filteredCustomers = useMemo(() => {
    return customerReceivablesList.filter((cr) => {
      if (statusFilter === 'OVERDUE' && !cr.hasOverdue) return false;
      if (statusFilter === 'NEAR_DUE') {
        const hasNear = cr.pendingSales.some((s) => {
          const diff = getDaysDiff(s.creditDueDate);
          return diff.days >= 0 && diff.days <= 5;
        });
        if (!hasNear) return false;
      }

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase().trim();
        const matchesName = cr.customerName.toLowerCase().includes(q);
        const matchesPhone = cr.customerPhone.toLowerCase().includes(q);
        const matchesDoc = (cr.customerDocument || '').toLowerCase().includes(q);
        const matchesInvoice = cr.pendingSales.some((s) => s.invoiceNumber.toLowerCase().includes(q));
        if (!matchesName && !matchesPhone && !matchesDoc && !matchesInvoice) return false;
      }

      return true;
    });
  }, [customerReceivablesList, statusFilter, searchTerm]);

  // Overall Receivables Stats
  const stats = useMemo(() => {
    const totalDebtUSD = customerReceivablesList.reduce((sum, c) => sum + c.totalDebtUSD, 0);
    const totalDebtBs = totalDebtUSD * rate;
    const totalCustomersWithDebt = customerReceivablesList.length;
    const totalPendingInvoices = allPendingSales.length;
    const totalOverdueInvoices = allPendingSales.filter((s) => getDaysDiff(s.creditDueDate).isOverdue).length;

    return {
      totalDebtUSD,
      totalDebtBs,
      totalCustomersWithDebt,
      totalPendingInvoices,
      totalOverdueInvoices,
    };
  }, [customerReceivablesList, allPendingSales, rate]);

  // Handlers
  const handleOpenPaymentModal = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setPaymentModalSale(sale);
    const pending = Math.max(0, sale.total - (sale.creditPaidAmount || 0));
    setPaymentAmountUSD(pending);
    setPaymentMethod('Pago Móvil');
    setPaymentRef('');
    setPaymentNotes('');
  };

  const handleSavePayment = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalSale) return;
    const amount = Number(paymentAmountUSD);
    if (isNaN(amount) || amount <= 0) {
      showToast('Ingresa un monto válido para el abono', 'error');
      return;
    }

    recordCreditPayment(paymentModalSale.id, {
      amountUSD: amount,
      paymentMethod,
      reference: paymentRef.trim() || undefined,
      notes: paymentNotes.trim() || undefined,
    });

    showToast(`¡Abono de ${formatUSD(amount)} registrado con éxito!`);
    setPaymentModalSale(null);
  };

  // Void single sale handler
  const handleOpenVoidModal = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setVoidModalSale(sale);
    setVoidReason('Cuenta de prueba / no creada por mí');
    setVoidRestoreStock(false);
  };

  const handleConfirmVoid = async () => {
    if (!voidModalSale) return;
    setIsVoiding(true);
    try {
      const invoiceNum = voidModalSale.invoiceNumber;
      await voidSale(voidModalSale.id, voidReason, voidRestoreStock);
      showToast(`Factura ${invoiceNum} anulada correctamente`);
      setVoidModalSale(null);
    } catch {
      showToast('Error al anular la factura. Inténtalo de nuevo.', 'error');
    } finally {
      setIsVoiding(false);
    }
  };

  // Delete single sale handler
  const handleOpenDeleteModal = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setDeleteModalSale(sale);
    setDeleteRestoreStock(false);
  };

  const handleConfirmDelete = async () => {
    if (!deleteModalSale) return;
    setIsDeleting(true);
    try {
      const invoiceNum = deleteModalSale.invoiceNumber;
      await deleteSale(deleteModalSale.id, deleteRestoreStock);
      showToast(`Factura ${invoiceNum} eliminada permanentemente`);
      setDeleteModalSale(null);
    } catch {
      showToast('Error al eliminar la factura. Inténtalo de nuevo.', 'error');
    } finally {
      setIsDeleting(false);
    }
  };

  // Reactivate a voided sale
  const handleReactivateSale = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setReactivateModalSale(sale);
  };

  const handleConfirmReactivateSale = async () => {
    if (!reactivateModalSale || isReactivating) return;
    const target = reactivateModalSale;
    setIsReactivating(true);
    try {
      await reactivateSale(target.id);
      showToast(`Factura ${target.invoiceNumber} reactivada como cuenta por cobrar activa`);
      setReactivateModalSale(null);
    } finally {
      setIsReactivating(false);
    }
  };

  // Batch customer action handler (Anular o Eliminar todas las cuentas de un cliente)
  const handleConfirmCustomerBatch = async () => {
    if (!customerBatchModal) return;
    setIsProcessingCustomerBatch(true);
    try {
      if (customerBatchModal.action === 'VOID') {
        const count = await voidCustomerCreditSales(
          customerBatchModal.saleIds,
          'Anulada en lote por usuario / cuenta no reconocida'
        );
        showToast(`${count} factura(s) de ${customerBatchModal.customerName} fueron anuladas con éxito.`);
      } else {
        const count = await deleteCustomerCreditSales(customerBatchModal.saleIds);
        showToast(`${count} factura(s) de ${customerBatchModal.customerName} fueron eliminadas definitivamente.`);
      }
      setCustomerBatchModal(null);
    } catch {
      showToast('Error al procesar las cuentas del cliente.', 'error');
    } finally {
      setIsProcessingCustomerBatch(false);
    }
  };

  // Edit sale customer & metadata handler
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
      showToast('Ingresa el nombre del cliente para guardar los cambios.', 'error');
      return;
    }

    updateSale(editSaleModal.id, {
      customerId: editCustomerId || undefined,
      customerName: cleanName,
      customerPhone: editCustomerPhone.trim() || 'N/A',
      customerDocument: editCustomerDocument.trim() || undefined,
      creditDueDate: editCreditDueDate || undefined,
      notes: editNotes.trim() || undefined,
      reassignCustomer: !editCustomerId,
    });

    showToast(`Factura ${editSaleModal.invoiceNumber} actualizada y asignada a ${cleanName}`);
    setEditSaleModal(null);
  };

  // Clear all test / registered credit sales
  const handleConfirmClearAll = async () => {
    setIsClearingAll(true);
    try {
      if (clearActionType === 'DELETE') {
        const count = await clearAllTestCreditSales();
        showToast(`Se eliminaron definitivamente ${count} cuenta(s) por cobrar de la base de datos.`);
      } else {
        // Void all
        let voidedCount = 0;
        for (const s of allPendingSales) {
          await voidSale(s.id, 'Anulada en lote: cuenta de prueba / no reconocida por el usuario');
          voidedCount++;
        }
        showToast(`Se anularon ${voidedCount} cuenta(s) por cobrar. Tu saldo por cobrar ahora es $0,00.`);
      }
      setClearTestModalOpen(false);
    } catch {
      showToast('Ocurrió un error al procesar las cuentas.', 'error');
    } finally {
      setIsClearingAll(false);
    }
  };

  const handleSendSingleInvoiceReminder = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const { message, url } = buildCreditReminderWhatsAppMessage(sale, settings);
    setWhatsappModalData({
      title: `Recordatorio de Cobro - Factura ${sale.invoiceNumber}`,
      message,
      url,
      phone: sale.customerPhone,
      recipientName: sale.customerName,
      sale,
    });
  };

  const handleSendConsolidatedStatement = (cr: CustomerReceivables, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const { message, url } = buildCustomerAccountStatementWhatsAppMessage(
      cr.customerName,
      cr.customerPhone,
      cr.pendingSales,
      settings
    );
    setWhatsappModalData({
      title: `Estado de Cuenta Consolidado - ${cr.customerName}`,
      message,
      url,
      phone: cr.customerPhone,
      recipientName: cr.customerName,
      sale: cr.pendingSales[0],
    });
  };

  return (
    <div className="space-y-6">
      {/* Toast Notification */}
      {toastState && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-top-2 ${
            toastState.type === 'error'
              ? 'bg-rose-950 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          {toastState.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="font-semibold">{toastState.message}</span>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
            Gestión de Cobranzas & Cartera
          </span>
          <h1 className="text-2xl font-bold font-display text-slate-900 mt-0.5">
            Cuentas por Cobrar & Créditos por Cliente
          </h1>
          <p className="text-xs text-slate-500">
            Control de deudas activas, detalle de facturas pendientes de cada cliente y envío de notificaciones y recordatorios por WhatsApp.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto flex-wrap">
          <button
            type="button"
            onClick={() => setClearTestModalOpen(true)}
            className="px-3.5 py-2 bg-rose-50 hover:bg-rose-100 text-rose-800 border border-rose-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer shadow-2xs"
            title="Anular o eliminar cuentas por cobrar que no hayas creado tú"
          >
            <Trash2 className="w-4 h-4 text-rose-600" />
            <span>Limpiar / Anular Cuentas</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentView('admin_ventas')}
            className="px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
          >
            <FileText className="w-4 h-4 text-slate-600" />
            <span>Ver Base de Datos de Ventas</span>
          </button>

          <button
            type="button"
            onClick={() => setCurrentView('admin_pos')}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-1.5 cursor-pointer"
          >
            <span>+ Nueva Venta a Crédito</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Overview */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total por Cobrar */}
        <div className="bg-white rounded-2xl border border-amber-300 bg-amber-50/30 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-amber-950">
            <span className="flex items-center gap-1">
              <Clock className="w-3.5 h-3.5 text-amber-600" />
              <span>Total Cuentas por Cobrar</span>
            </span>
            <span className="w-6 h-6 rounded-full bg-amber-200 text-amber-950 flex items-center justify-center font-bold text-[11px]">
              $
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-amber-950 tabular-nums">
            {formatUSD(stats.totalDebtUSD)}
          </div>
          <div className="text-xs font-semibold text-amber-800 font-mono">
            {formatBs(stats.totalDebtBs)}
          </div>
          <p className="text-[10px] text-amber-800 pt-1 border-t border-amber-200/80">
            Saldo acumulado por liquidar en divisas o Bs.
          </p>
        </div>

        {/* Clientes con Deuda */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1">
              <User className="w-3.5 h-3.5 text-slate-600" />
              <span>Clientes Deudores</span>
            </span>
            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
              {stats.totalCustomersWithDebt}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {stats.totalCustomersWithDebt}
          </div>
          <p className="text-xs text-slate-500">
            Clientes con al menos 1 factura a crédito
          </p>
          <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
            Control individual de saldos y abonos
          </p>
        </div>

        {/* Facturas Pendientes */}
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-1">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span className="flex items-center gap-1">
              <FileText className="w-3.5 h-3.5 text-slate-600" />
              <span>Facturas Activas</span>
            </span>
            <span className="w-6 h-6 rounded-full bg-slate-100 text-slate-700 flex items-center justify-center font-bold text-xs">
              {stats.totalPendingInvoices}
            </span>
          </div>
          <div className="text-2xl font-bold font-mono text-slate-900 tabular-nums">
            {stats.totalPendingInvoices}
          </div>
          <p className="text-xs text-slate-500">
            Notas de crédito por cobrar en cartera
          </p>
          <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
            Plazos de 7, 15 y 30 días
          </p>
        </div>

        {/* Facturas Vencidas */}
        <div className={`bg-white rounded-2xl border p-4 shadow-2xs space-y-1 ${
          stats.totalOverdueInvoices > 0 ? 'border-rose-300 bg-rose-50/30' : 'border-emerald-200 bg-emerald-50/20'
        }`}>
          <div className="flex items-center justify-between text-xs font-semibold">
            <span className={`flex items-center gap-1 ${stats.totalOverdueInvoices > 0 ? 'text-rose-900 font-bold' : 'text-emerald-900'}`}>
              <AlertTriangle className={`w-3.5 h-3.5 ${stats.totalOverdueInvoices > 0 ? 'text-rose-600' : 'text-emerald-600'}`} />
              <span>Facturas Vencidas</span>
            </span>
            <span className={`w-6 h-6 rounded-full flex items-center justify-center font-bold text-xs ${
              stats.totalOverdueInvoices > 0 ? 'bg-rose-200 text-rose-900' : 'bg-emerald-200 text-emerald-900'
            }`}>
              {stats.totalOverdueInvoices}
            </span>
          </div>
          <div className={`text-2xl font-bold font-mono tabular-nums ${stats.totalOverdueInvoices > 0 ? 'text-rose-700' : 'text-emerald-700'}`}>
            {stats.totalOverdueInvoices}
          </div>
          <p className={`text-xs ${stats.totalOverdueInvoices > 0 ? 'text-rose-700 font-semibold' : 'text-emerald-700'}`}>
            {stats.totalOverdueInvoices > 0 ? 'Requieren recordatorio urgente de cobro' : 'No hay créditos vencidos actualmente'}
          </p>
          <p className="text-[10px] text-slate-400 pt-1 border-t border-slate-100">
            Calculado con fecha de vencimiento pactada
          </p>
        </div>
      </div>

      {/* Panel de Recordatorios Periódicos (Cada semana / al vencer) */}
      <div className="bg-gradient-to-r from-amber-500/10 via-amber-50 to-orange-50 border border-amber-300 rounded-2xl p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 flex items-center justify-center shrink-0 font-bold shadow-xs">
            <Bell className="w-5 h-5" />
          </div>
          <div>
            <h3 className="font-bold text-xs uppercase tracking-wider text-amber-950 flex items-center gap-1.5">
              <span>Recordatorios Periódicos de Cobro por WhatsApp</span>
              <span className="bg-amber-200 text-amber-900 text-[10px] px-2 py-0.5 rounded font-bold">
                1-Click
              </span>
            </h3>
            <p className="text-xs text-amber-900/90 mt-0.5">
              Notifica a tus clientes de sus saldos pendientes directamente a su WhatsApp con el detalle de facturas y cuentas bancarias.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start md:self-auto shrink-0 flex-wrap">
          <span className="text-[11px] font-bold text-amber-950">Frecuencia sugerida:</span>
          {[
            { id: 'SEMANAL', label: 'Cada Semana (7d)' },
            { id: 'QUINCENAL', label: 'Cada 15 días' },
            { id: 'AL_VENCER', label: 'Al Vencer' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => {
                setReminderFrequency(f.id as any);
                showToast(`Frecuencia de cobranza establecida: ${f.label}`);
              }}
              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                reminderFrequency === f.id
                  ? 'bg-amber-600 text-white shadow-2xs'
                  : 'bg-white text-amber-900 border border-amber-300 hover:bg-amber-100'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Search and Status Filters */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          {/* Search Input */}
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre de cliente, teléfono WhatsApp, cédula o N° de factura..."
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

          {/* Quick Filter Buttons */}
          <div className="flex items-center gap-1.5 text-xs flex-wrap">
            <button
              type="button"
              onClick={() => setStatusFilter('ALL')}
              className={`px-3 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === 'ALL'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              Todos con Deuda ({customerReceivablesList.length})
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('OVERDUE')}
              className={`px-3 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === 'OVERDUE'
                  ? 'bg-rose-600 text-white shadow-2xs'
                  : 'bg-rose-50 text-rose-800 border border-rose-200 hover:bg-rose-100'
              }`}
            >
              <AlertTriangle className="w-3.5 h-3.5" />
              <span>Vencidos ({customerReceivablesList.filter((c) => c.hasOverdue).length})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('PAID')}
              className={`px-3 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === 'PAID'
                  ? 'bg-emerald-600 text-white shadow-2xs'
                  : 'bg-emerald-50 text-emerald-800 border border-emerald-200 hover:bg-emerald-100'
              }`}
            >
              <CheckCircle2 className="w-3.5 h-3.5" />
              <span>Cobrados ({allPaidCreditSales.length})</span>
            </button>

            <button
              type="button"
              onClick={() => setStatusFilter('VOIDED')}
              className={`px-3 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                statusFilter === 'VOIDED'
                  ? 'bg-slate-700 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 border border-slate-200 hover:bg-slate-200'
              }`}
            >
              <Ban className="w-3.5 h-3.5 text-slate-500" />
              <span>Cuentas Anuladas ({allVoidedSales.length})</span>
            </button>
          </div>
        </div>
      </div>

      {/* Main Customers List, Paid Accounts, or Voided Accounts View */}
      {statusFilter === 'PAID' ? (
        <div className="space-y-4">
          <div className="bg-emerald-50 rounded-2xl p-4 border border-emerald-200 text-xs text-emerald-900 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 text-emerald-600" />
              <span className="font-bold">Créditos Cobrados / Liquidados ({allPaidCreditSales.length})</span>
              <span className="text-emerald-700">— Historial de facturas a crédito ya pagadas en su totalidad.</span>
            </div>
          </div>

          {(() => {
            const q = searchTerm.toLowerCase().trim();
            const filteredPaid = q
              ? allPaidCreditSales.filter(
                  (s) =>
                    s.customerName.toLowerCase().includes(q) ||
                    (s.customerPhone || '').toLowerCase().includes(q) ||
                    (s.customerDocument || '').toLowerCase().includes(q) ||
                    s.invoiceNumber.toLowerCase().includes(q)
                )
              : allPaidCreditSales;

            if (filteredPaid.length === 0) {
              return (
                <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2 shadow-2xs">
                  <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-500 flex items-center justify-center mx-auto">
                    <CheckCircle2 className="w-6 h-6" />
                  </div>
                  <p className="font-bold text-sm text-slate-800">No hay créditos cobrados para mostrar</p>
                  <p className="text-xs text-slate-400">Cuando un cliente liquide una factura a crédito al 100%, aparecerá aquí para auditoría.</p>
                </div>
              );
            }

            return (
              <div className="grid grid-cols-1 gap-3">
                {filteredPaid.map((sale) => (
                  <div
                    key={sale.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-mono font-bold text-slate-900 text-sm">
                          {sale.invoiceNumber}
                        </span>
                        <span className="bg-emerald-100 text-emerald-800 text-[10px] font-bold px-2 py-0.5 rounded font-mono flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          PAGADA
                        </span>
                        <span className="text-xs text-slate-700 font-semibold">
                          Cliente: <strong>{sale.customerName}</strong>
                        </span>
                        <span className="text-xs text-slate-400 font-mono">
                          {sale.customerPhone}
                        </span>
                      </div>

                      <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                        <span>Total Factura: <strong>{formatUSD(sale.total)}</strong> ({formatBs(sale.total * (sale.bcvRate || rate))})</span>
                        <span>Emitida: {new Date(sale.createdAt).toLocaleDateString('es-VE')}</span>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        onClick={() => downloadInvoicePDF(sale, settings)}
                        className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-xl text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                      >
                        <Download className="w-3.5 h-3.5" />
                        <span>Nota en PDF</span>
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      ) : statusFilter === 'VOIDED' ? (
        <div className="space-y-4">
          <div className="bg-slate-100 rounded-2xl p-4 border border-slate-300 text-xs text-slate-700 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Ban className="w-4 h-4 text-slate-500" />
              <span className="font-bold">Facturas a Crédito Anuladas ({allVoidedSales.length})</span>
              <span className="text-slate-500">— Estas cuentas no suman deuda ni afectan el balance financiero.</span>
            </div>
          </div>

          {allVoidedSales.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-2 shadow-2xs">
              <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Check className="w-6 h-6" />
              </div>
              <p className="font-bold text-sm text-slate-800">No hay facturas a crédito anuladas</p>
              <p className="text-xs text-slate-400">Cuando anules una cuenta por cobrar, aparecerá en esta pestaña para su auditoría o reactivación.</p>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-3">
              {allVoidedSales.map((sale) => (
                <div
                  key={sale.id}
                  className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col md:flex-row md:items-center justify-between gap-4"
                >
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-mono font-bold text-slate-900 text-sm">
                        {sale.invoiceNumber}
                      </span>
                      <span className="bg-rose-100 text-rose-800 text-[10px] font-bold px-2 py-0.5 rounded font-mono flex items-center gap-1">
                        <Ban className="w-3 h-3" />
                        ANULADA
                      </span>
                      <span className="text-xs text-slate-700 font-semibold">
                        Cliente: <strong>{sale.customerName}</strong>
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {sale.customerPhone}
                      </span>
                    </div>

                    <div className="text-xs text-slate-600 flex items-center gap-3 flex-wrap">
                      <span>Monto original: <strong>{formatUSD(sale.total)}</strong> ({formatBs(sale.total * rate)})</span>
                      {sale.voidReason && (
                        <span className="text-slate-600 italic bg-slate-50 px-2 py-0.5 rounded border border-slate-200">
                          Motivo: {sale.voidReason}
                        </span>
                      )}
                    </div>

                    {sale.voidedAt && (
                      <p className="text-[10px] text-slate-400 font-mono">
                        Anulada el {new Date(sale.voidedAt).toLocaleString('es-VE')}
                      </p>
                    )}
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    <button
                      type="button"
                      onClick={(e) => handleReactivateSale(sale, e)}
                      className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Reactivar esta factura como cuenta por cobrar pendiente"
                    >
                      <RotateCcw className="w-3.5 h-3.5" />
                      <span>Reactivar Cuenta</span>
                    </button>

                    <button
                      type="button"
                      onClick={(e) => handleOpenDeleteModal(sale, e)}
                      className="px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-xl text-xs font-bold transition-all flex items-center gap-1.5 cursor-pointer"
                      title="Eliminar permanentemente de la base de datos"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                      <span>Eliminar Definitivamente</span>
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filteredCustomers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3 shadow-2xs">
              <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <div>
                <p className="font-bold text-sm text-slate-800">
                  {searchTerm ? 'No se encontraron clientes con esos datos' : '¡Excelente! No hay cuentas por cobrar pendientes'}
                </p>
                <p className="text-xs text-slate-400 mt-0.5">
                  {searchTerm
                    ? 'Intenta con otro número de teléfono o nombre.'
                    : 'Todas las facturas a crédito han sido canceladas o no hay registros pendientes.'}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setCurrentView('admin_pos')}
                className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                <span>Ir al Punto de Venta</span>
              </button>
            </div>
          ) : (
          filteredCustomers.map((cr) => {
            const isExpanded = expandedCustomerId === cr.customerId;

            return (
              <div
                key={cr.customerId}
                className={`bg-white rounded-2xl border transition-all shadow-2xs overflow-hidden ${
                  cr.hasOverdue ? 'border-rose-300 ring-1 ring-rose-200' : 'border-slate-200 hover:border-amber-300'
                }`}
              >
                {/* Customer Summary Card Header */}
                <div
                  onClick={() => setExpandedCustomerId(isExpanded ? null : cr.customerId)}
                  className="p-5 flex flex-col md:flex-row md:items-center justify-between gap-4 cursor-pointer hover:bg-slate-50/70 transition-colors"
                >
                  <div className="flex items-start gap-3.5">
                    <div
                      className={`w-11 h-11 rounded-2xl flex items-center justify-center shrink-0 font-bold text-sm shadow-2xs ${
                        cr.hasOverdue
                          ? 'bg-rose-100 text-rose-800 border border-rose-300'
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}
                    >
                      <User className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-sm text-slate-900">{cr.customerName}</h3>
                        {cr.hasOverdue ? (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                            <AlertTriangle className="w-3 h-3 text-rose-600" />
                            <span>Factura Vencida</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold bg-amber-100 text-amber-900 border border-amber-200">
                            <Clock className="w-3 h-3 text-amber-700" />
                            <span>Crédito al Día</span>
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-1 flex-wrap">
                        <span className="font-mono text-slate-700 flex items-center gap-1">
                          📱 {cr.customerPhone}
                        </span>
                        {cr.customerDocument && (
                          <span className="font-mono text-slate-500">
                            CI/RIF: {cr.customerDocument}
                          </span>
                        )}
                        <span className="bg-slate-100 text-slate-700 px-2 py-0.5 rounded text-[11px] font-semibold">
                          {cr.pendingSales.length} factura(s) pendiente(s)
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Total Debt Amount & Action Buttons */}
                  <div className="flex items-center justify-between md:justify-end gap-4 self-stretch md:self-auto pt-3 md:pt-0 border-t md:border-t-0 border-slate-100">
                    <div className="text-left md:text-right">
                      <span className="text-[10px] uppercase font-bold text-slate-400 block tracking-wider">
                        Deuda Total Acumulada
                      </span>
                      <span className="text-xl font-bold font-mono text-slate-950 block tabular-nums">
                        {formatUSD(cr.totalDebtUSD)}
                      </span>
                      <span className="text-xs font-semibold text-emerald-700 font-mono block tabular-nums">
                        {formatBs(cr.totalDebtBs)}
                      </span>
                    </div>

                    <div className="flex items-center gap-2" onClick={(e) => e.stopPropagation()}>
                      {/* WhatsApp Statement Button */}
                      <button
                        type="button"
                        onClick={(e) => handleSendConsolidatedStatement(cr, e)}
                        className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl transition-all shadow-2xs flex items-center gap-1.5 cursor-pointer whitespace-nowrap"
                        title="Enviar estado de cuenta consolidado al WhatsApp del cliente"
                      >
                        <MessageSquare className="w-3.5 h-3.5" />
                        <span className="hidden sm:inline">Notificar Estado de Cuenta</span>
                        <span className="sm:hidden">Notificar</span>
                      </button>

                      {/* Anular todas las facturas de este cliente */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCustomerBatchModal({
                            saleIds: cr.pendingSales.map((s) => s.id),
                            customerName: cr.customerName,
                            action: 'VOID',
                            count: cr.pendingSales.length,
                            debtUSD: cr.totalDebtUSD,
                          });
                        }}
                        className="p-2 text-amber-800 hover:bg-amber-100 border border-amber-300 bg-amber-50 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        title={`Anular todas las facturas a crédito de ${cr.customerName}`}
                      >
                        <Ban className="w-3.5 h-3.5" />
                      </button>

                      {/* Eliminar todas las facturas de este cliente */}
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setCustomerBatchModal({
                            saleIds: cr.pendingSales.map((s) => s.id),
                            customerName: cr.customerName,
                            action: 'DELETE',
                            count: cr.pendingSales.length,
                            debtUSD: cr.totalDebtUSD,
                          });
                        }}
                        className="p-2 text-rose-700 hover:bg-rose-100 border border-rose-300 bg-rose-50 rounded-xl text-xs font-bold transition-all cursor-pointer"
                        title={`Eliminar definitivamente todas las facturas a crédito de ${cr.customerName}`}
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>

                      {/* Expand / Collapse Button */}
                      <button
                        type="button"
                        onClick={() => setExpandedCustomerId(isExpanded ? null : cr.customerId)}
                        className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
                        title={isExpanded ? 'Ocultar facturas' : 'Ver detalle de facturas'}
                      >
                        {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Expanded Details: Breakdown of Pending Invoices */}
                {isExpanded && (
                  <div className="bg-slate-50/80 border-t border-slate-200 p-5 space-y-4 animate-in fade-in duration-150">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <FileText className="w-4 h-4 text-slate-700" />
                        <h4 className="font-bold text-xs uppercase tracking-wider text-slate-800">
                          Detalle de Facturas Pendientes de {cr.customerName} ({cr.pendingSales.length})
                        </h4>
                      </div>
                      <span className="text-[11px] text-slate-500 font-mono">
                        Tasa BCV: Bs. {rate.toFixed(2)}
                      </span>
                    </div>

                    <div className="space-y-3">
                      {cr.pendingSales.map((sale) => {
                        const pendingThisUSD = Math.max(0, sale.total - (sale.creditPaidAmount || 0));
                        const pendingThisBs = pendingThisUSD * (sale.bcvRate || rate);
                        const daysInfo = getDaysDiff(sale.creditDueDate);

                        return (
                          <div
                            key={sale.id}
                            className={`bg-white rounded-xl border p-4 shadow-2xs space-y-3 transition-colors ${
                              daysInfo.isOverdue
                                ? 'border-rose-300 bg-rose-50/20'
                                : 'border-slate-200'
                            }`}
                          >
                            {/* Invoice Header */}
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pb-2.5 border-b border-slate-100">
                              <div className="flex items-center gap-2.5 flex-wrap">
                                <span className="font-mono font-bold text-slate-900 text-sm">
                                  {sale.invoiceNumber}
                                </span>
                                {sale.paymentType === 'APARTADO' && (
                                  <span className="bg-indigo-100 text-indigo-800 border border-indigo-200 text-[10px] font-bold px-2 py-0.5 rounded">
                                    Sistema de Apartado
                                  </span>
                                )}
                                <span className="text-[11px] text-slate-500 font-mono">
                                  Emitida: {new Date(sale.createdAt).toLocaleDateString('es-VE')}
                                </span>
                                <span className="bg-slate-100 text-slate-700 text-[10px] font-bold px-2 py-0.5 rounded font-mono">
                                  Plazo: {sale.creditDays || 15} días
                                </span>
                              </div>

                              <div className="flex items-center gap-2">
                                <span
                                  className={`text-xs font-bold px-2 py-0.5 rounded-md font-mono ${
                                    daysInfo.isOverdue
                                      ? 'bg-rose-100 text-rose-800 border border-rose-300'
                                      : 'bg-amber-100 text-amber-900 border border-amber-200'
                                  }`}
                                >
                                  {daysInfo.label}
                                </span>
                              </div>
                            </div>

                            {/* Middle: Items & Breakdown */}
                            <div className="grid grid-cols-1 md:grid-cols-12 gap-4 items-start">
                              {/* Items List (7 cols) */}
                              <div className="md:col-span-7 space-y-1.5">
                                <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                                  Repuestos / Servicios en esta factura:
                                </span>
                                <div className="space-y-1 bg-slate-50 p-2.5 rounded-lg border border-slate-200/80">
                                  {sale.items.map((item, idx) => (
                                    <div
                                      key={idx}
                                      className="flex items-center justify-between text-xs text-slate-700"
                                    >
                                      <div className="flex items-center gap-1.5 truncate">
                                        <span className="font-mono font-bold text-slate-500">
                                          {item.quantity}x
                                        </span>
                                        <span className="truncate">{item.name}</span>
                                      </div>
                                      <span className="font-mono font-bold text-slate-900 shrink-0 ml-2">
                                        {formatUSD(item.total)}
                                      </span>
                                    </div>
                                  ))}
                                </div>

                                {/* Previous partial payments if any */}
                                {sale.creditPayments && sale.creditPayments.length > 0 && (
                                  <div className="pt-1.5">
                                    <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800 flex items-center gap-1">
                                      <History className="w-3 h-3" />
                                      <span>Historial de Abonos Realizados:</span>
                                    </span>
                                    <div className="space-y-0.5 mt-1">
                                      {sale.creditPayments.map((p) => (
                                        <div
                                          key={p.id}
                                          className="text-[11px] text-slate-600 flex justify-between bg-emerald-50/60 px-2 py-1 rounded border border-emerald-100"
                                        >
                                          <span>
                                            {new Date(p.date).toLocaleDateString('es-VE')} · {p.paymentMethod}
                                            {p.reference ? ` (Ref: ${p.reference})` : ''}
                                          </span>
                                          <span className="font-mono font-bold text-emerald-800">
                                            +{formatUSD(p.amountUSD)}
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>

                              {/* Balance & Totals (5 cols) */}
                              <div className="md:col-span-5 bg-amber-50/60 border border-amber-200/90 rounded-xl p-3 space-y-2">
                                <div className="flex justify-between text-xs text-slate-600">
                                  <span>Total Factura:</span>
                                  <span className="font-mono font-bold text-slate-900">
                                    {formatUSD(sale.total)}
                                  </span>
                                </div>

                                <div className="flex justify-between text-xs text-emerald-700">
                                  <span>Monto ya abonado:</span>
                                  <span className="font-mono font-bold">
                                    {formatUSD(sale.creditPaidAmount || 0)}
                                  </span>
                                </div>

                                <div className="pt-1.5 border-t border-amber-300 flex justify-between items-baseline">
                                  <span className="text-xs font-bold text-amber-950">SALDO PENDIENTE:</span>
                                  <div className="text-right">
                                    <span className="text-base font-bold font-mono text-amber-950 block">
                                      {formatUSD(pendingThisUSD)}
                                    </span>
                                    <span className="text-[10px] font-semibold text-amber-800 font-mono block">
                                      {formatBs(pendingThisBs)}
                                    </span>
                                  </div>
                                </div>

                                <div className="text-[10px] text-slate-500 font-mono pt-1 border-t border-amber-200 flex justify-between">
                                  <span>Vencimiento:</span>
                                  <span className="font-bold text-slate-700">
                                    {sale.creditDueDate || 'Sin fecha límite'}
                                  </span>
                                </div>
                              </div>
                            </div>

                            {/* Actions on this invoice */}
                            <div className="pt-2 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100">
                              {/* Left Side: Editar / Anular / Eliminar */}
                              <div className="flex items-center gap-1.5 flex-wrap">
                                {/* Botón Editar Cliente / Factura */}
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenEditSaleModal(sale, e)}
                                  className="px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-300 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Corregir el cliente o datos de esta factura"
                                >
                                  <Edit2 className="w-3.5 h-3.5 text-slate-700" />
                                  <span>Editar Cliente</span>
                                </button>

                                {/* Botón Anular Cuenta */}
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenVoidModal(sale, e)}
                                  className="px-2.5 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Anular esta cuenta por cobrar (el saldo pasa a $0 sin borrarse del historial)"
                                >
                                  <Ban className="w-3.5 h-3.5 text-amber-700" />
                                  <span>Anular Cuenta</span>
                                </button>

                                {/* Botón Eliminar Definitivamente */}
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenDeleteModal(sale, e)}
                                  className="px-2.5 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-300 rounded-lg text-xs font-bold flex items-center gap-1 cursor-pointer transition-colors"
                                  title="Eliminar permanentemente esta factura de la base de datos"
                                >
                                  <Trash2 className="w-3.5 h-3.5 text-rose-600" />
                                  <span>Eliminar</span>
                                </button>
                              </div>

                              {/* Right Side: PDF, WhatsApp, Abono */}
                              <div className="flex items-center gap-2 flex-wrap">
                                {/* Descargar PDF */}
                                <button
                                  type="button"
                                  onClick={() => downloadInvoicePDF(sale, settings)}
                                  className="px-3 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-semibold flex items-center gap-1.5 cursor-pointer transition-colors"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  <span>Nota en PDF</span>
                                </button>

                                {/* WhatsApp Reminder for this specific invoice */}
                                <button
                                  type="button"
                                  onClick={(e) => handleSendSingleInvoiceReminder(sale, e)}
                                  className="px-3 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-300 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer transition-colors"
                                  title="Enviar recordatorio específico para esta factura"
                                >
                                  <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                                  <span>Recordatorio WhatsApp</span>
                                </button>

                                {/* Registrar Abono / Pagar */}
                                <button
                                  type="button"
                                  onClick={(e) => handleOpenPaymentModal(sale, e)}
                                  className="px-3.5 py-1.5 bg-amber-600 hover:bg-amber-700 text-white rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer shadow-2xs transition-colors"
                                >
                                  <DollarSign className="w-3.5 h-3.5" />
                                  <span>Registrar Abono / Pago</span>
                                </button>
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })
        )}
        </div>
      )}

      {/* Modal: Registrar Abono a Factura */}
      {paymentModalSale && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-amber-600 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <DollarSign className="w-5 h-5 text-amber-200" />
                <div>
                  <h3 className="font-bold text-sm">Registrar Abono o Pago</h3>
                  <span className="text-[11px] text-amber-100 font-mono">Factura #{paymentModalSale.invoiceNumber}</span>
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
                  <span>Abono acumulado:</span>
                  <span className="font-mono">{formatUSD(paymentModalSale.creditPaidAmount || 0)}</span>
                </div>
                <div className="flex justify-between pt-1 border-t border-amber-200 font-bold text-amber-900">
                  <span>Saldo Restante Pendiente:</span>
                  <span className="font-mono text-sm">
                    {formatUSD(Math.max(0, paymentModalSale.total - (paymentModalSale.creditPaidAmount || 0)))}
                  </span>
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-xs font-bold text-slate-700">
                    Monto del Abono ($ USD) *
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const full = Math.max(0, paymentModalSale.total - (paymentModalSale.creditPaidAmount || 0));
                      setPaymentAmountUSD(full);
                    }}
                    className="text-[10px] text-amber-700 font-bold hover:underline cursor-pointer"
                  >
                    Pagar Saldo Completo
                  </button>
                </div>
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
                  Equivalente: {paymentAmountUSD ? formatBs(Number(paymentAmountUSD) * rate) : 'Bs. 0,00'} a tasa BCV ({rate.toFixed(2)})
                </span>
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

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1">
                  Notas / Observaciones
                </label>
                <input
                  type="text"
                  value={paymentNotes}
                  onChange={(e) => setPaymentNotes(e.target.value)}
                  placeholder="Ej. Abono 1 de 2 / Recibido en mostrador"
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50"
                />
              </div>

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
                  <span>Registrar Abono</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: ANULAR Cuenta por Cobrar */}
      {voidModalSale && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-amber-600 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Ban className="w-5 h-5 text-amber-200" />
                <div>
                  <h3 className="font-bold text-sm">Anular Cuenta por Cobrar</h3>
                  <span className="text-[11px] text-amber-100 font-mono">Factura #{voidModalSale.invoiceNumber}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setVoidModalSale(null)}
                className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3 text-amber-950 space-y-1">
                <p className="font-bold">
                  ¿Deseas anular esta cuenta por cobrar de {voidModalSale.customerName}?
                </p>
                <p className="text-[11px] text-amber-800">
                  Al anularla, el saldo pendiente pasará a <strong>$0,00</strong> y no sumará en las cuentas por cobrar ni reportes de mora. La factura quedará registrada con estado <span className="font-bold text-rose-700">ANULADA</span>.
                </p>
                <div className="pt-1.5 border-t border-amber-200 flex justify-between font-mono font-bold">
                  <span>Monto de la Factura:</span>
                  <span>{formatUSD(voidModalSale.total)}</span>
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Motivo de la Anulación:
                </label>
                <div className="grid grid-cols-1 gap-1.5 mb-2">
                  {[
                    'Cuenta de prueba / no creada por mí',
                    'Venta registrada por error',
                    'Devolución de repuesto / servicio cancelado',
                    'Acuerdo directo / condonación de saldo',
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setVoidReason(preset)}
                      className={`text-left p-2 rounded-lg text-xs font-medium border transition-colors cursor-pointer ${
                        voidReason === preset
                          ? 'border-amber-500 bg-amber-50 text-amber-950 font-bold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
                <input
                  type="text"
                  value={voidReason}
                  onChange={(e) => setVoidReason(e.target.value)}
                  placeholder="Otro motivo..."
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 text-xs"
                />
              </div>

              <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="voidRestoreStock"
                  checked={voidRestoreStock}
                  onChange={(e) => setVoidRestoreStock(e.target.checked)}
                  className="rounded border-slate-300 text-amber-600 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="voidRestoreStock" className="text-xs text-slate-700 cursor-pointer">
                  Restaurar repuestos vendidos al inventario físico
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isVoiding}
                  onClick={() => setVoidModalSale(null)}
                  className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isVoiding}
                  onClick={handleConfirmVoid}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Ban className="w-4 h-4" />
                  <span>{isVoiding ? 'Anulando...' : 'Confirmar Anulación'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: ELIMINAR Definitivamente Cuenta por Cobrar */}
      {deleteModalSale && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-rose-600 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Trash2 className="w-5 h-5 text-rose-200" />
                <div>
                  <h3 className="font-bold text-sm">Eliminar Cuenta por Cobrar</h3>
                  <span className="text-[11px] text-rose-100 font-mono">Factura #{deleteModalSale.invoiceNumber}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setDeleteModalSale(null)}
                className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="bg-rose-50 border border-rose-200 rounded-xl p-3 text-rose-950 space-y-1">
                <p className="font-bold text-rose-900">
                  ¿Estás seguro de eliminar permanentemente esta cuenta?
                </p>
                <p className="text-[11px] text-rose-800">
                  Esta acción <strong>borrará completamente la venta de la base de datos</strong>. Se removerá del historial de ventas, de las cuentas por cobrar y de los balances.
                </p>
                <div className="pt-1.5 border-t border-rose-200 space-y-0.5 text-slate-700">
                  <div className="flex justify-between">
                    <span>Cliente:</span>
                    <span className="font-bold">{deleteModalSale.customerName}</span>
                  </div>
                  <div className="flex justify-between font-mono">
                    <span>Monto Total:</span>
                    <span className="font-bold text-rose-900">{formatUSD(deleteModalSale.total)}</span>
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 p-2.5 bg-slate-50 rounded-xl border border-slate-200">
                <input
                  type="checkbox"
                  id="deleteRestoreStock"
                  checked={deleteRestoreStock}
                  onChange={(e) => setDeleteRestoreStock(e.target.checked)}
                  className="rounded border-slate-300 text-rose-600 focus:ring-rose-500 cursor-pointer"
                />
                <label htmlFor="deleteRestoreStock" className="text-xs text-slate-700 cursor-pointer">
                  Restaurar repuestos al stock del inventario
                </label>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={() => setDeleteModalSale(null)}
                  className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isDeleting}
                  onClick={handleConfirmDelete}
                  className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Trash2 className="w-4 h-4" />
                  <span>{isDeleting ? 'Eliminando...' : 'Eliminar Permanentemente'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: LIMPIAR Todas las Cuentas No Creadas por el Usuario */}
      {clearTestModalOpen && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Sparkles className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm">Limpiar Cuentas por Cobrar</h3>
                  <span className="text-[11px] text-slate-400">Eliminar o Anular registros no creados por ti</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setClearTestModalOpen(false)}
                className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-700">
                Selecciona cómo deseas procesar las <strong>{allPendingSales.length} cuentas por cobrar activas</strong> actualmente registradas en el sistema:
              </p>

              <div className="space-y-2">
                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                    clearActionType === 'DELETE'
                      ? 'border-rose-500 bg-rose-50/60 text-rose-950 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="clearAction"
                    checked={clearActionType === 'DELETE'}
                    onChange={() => setClearActionType('DELETE')}
                    className="mt-0.5 text-rose-600 focus:ring-rose-500"
                  />
                  <div>
                    <span className="block font-bold">1. Eliminar permanentemente de la base de datos (Recomendado)</span>
                    <span className="block text-[11px] font-normal text-slate-600 mt-0.5">
                      Borra las facturas a crédito registradas por completo del archivo de datos para que tu lista de clientes y cuentas quede completamente limpia en $0,00.
                    </span>
                  </div>
                </label>

                <label
                  className={`flex items-start gap-3 p-3.5 rounded-xl border cursor-pointer transition-colors ${
                    clearActionType === 'VOID'
                      ? 'border-amber-500 bg-amber-50/60 text-amber-950 font-bold'
                      : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                  }`}
                >
                  <input
                    type="radio"
                    name="clearAction"
                    checked={clearActionType === 'VOID'}
                    onChange={() => setClearActionType('VOID')}
                    className="mt-0.5 text-amber-600 focus:ring-amber-500"
                  />
                  <div>
                    <span className="block font-bold">2. Marcar como Anuladas</span>
                    <span className="block text-[11px] font-normal text-slate-600 mt-0.5">
                      Conserva los registros en la pestaña "Cuentas Anuladas" pero reduce su saldo a $0,00 para que no sume en tus cuentas por cobrar.
                    </span>
                  </div>
                </label>
              </div>

              <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 text-slate-600 space-y-1">
                <span className="font-bold block text-slate-800">Cuentas que se procesarán ({allPendingSales.length}):</span>
                <div className="max-h-28 overflow-y-auto space-y-1 text-[11px] font-mono">
                  {allPendingSales.map((s) => (
                    <div key={s.id} className="flex justify-between">
                      <span>{s.invoiceNumber} — {s.customerName}</span>
                      <span className="font-bold">{formatUSD(s.total)}</span>
                    </div>
                  ))}
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isClearingAll}
                  onClick={() => setClearTestModalOpen(false)}
                  className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isClearingAll}
                  onClick={handleConfirmClearAll}
                  className={`px-5 py-2.5 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 ${
                    clearActionType === 'DELETE' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {clearActionType === 'DELETE' ? <Trash2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                  <span>
                    {isClearingAll
                      ? 'Procesando...'
                      : clearActionType === 'DELETE'
                      ? 'Eliminar Cuentas'
                      : 'Anular Cuentas'}
                  </span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Acción en Lote por Cliente (Anular o Eliminar Todo de un Cliente) */}
      {customerBatchModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div
              className={`px-5 py-4 text-white flex items-center justify-between ${
                customerBatchModal.action === 'DELETE' ? 'bg-rose-600' : 'bg-amber-600'
              }`}
            >
              <div className="flex items-center gap-2">
                {customerBatchModal.action === 'DELETE' ? (
                  <Trash2 className="w-5 h-5 text-rose-200" />
                ) : (
                  <Ban className="w-5 h-5 text-amber-200" />
                )}
                <div>
                  <h3 className="font-bold text-sm">
                    {customerBatchModal.action === 'DELETE' ? 'Eliminar Cuentas de Cliente' : 'Anular Cuentas de Cliente'}
                  </h3>
                  <span className="text-[11px] text-white/80">{customerBatchModal.customerName}</span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setCustomerBatchModal(null)}
                className="p-1 text-white/80 hover:text-white rounded-lg cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <p className="text-slate-700">
                ¿Deseas{' '}
                <strong>
                  {customerBatchModal.action === 'DELETE' ? 'eliminar permanentemente' : 'anular'}
                </strong>{' '}
                todas las <strong>{customerBatchModal.count} facturas</strong> a crédito de <strong>{customerBatchModal.customerName}</strong> por un total de <strong>{formatUSD(customerBatchModal.debtUSD)}</strong>?
              </p>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  disabled={isProcessingCustomerBatch}
                  onClick={() => setCustomerBatchModal(null)}
                  className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  disabled={isProcessingCustomerBatch}
                  onClick={handleConfirmCustomerBatch}
                  className={`px-5 py-2.5 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 ${
                    customerBatchModal.action === 'DELETE' ? 'bg-rose-600 hover:bg-rose-700' : 'bg-amber-600 hover:bg-amber-700'
                  }`}
                >
                  {customerBatchModal.action === 'DELETE' ? <Trash2 className="w-4 h-4" /> : <Ban className="w-4 h-4" />}
                  <span>
                    {isProcessingCustomerBatch
                      ? 'Procesando...'
                      : customerBatchModal.action === 'DELETE'
                      ? 'Eliminar Facturas del Cliente'
                      : 'Anular Facturas del Cliente'}
                  </span>
                </button>
              </div>
            </div>
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
              <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 text-slate-700 space-y-1">
                <span className="text-[10px] font-bold uppercase text-slate-400 block">
                  Repuestos / Ítems en esta factura:
                </span>
                {editSaleModal.items.map((it, idx) => (
                  <div key={idx} className="flex justify-between font-medium">
                    <span>{it.quantity}x {it.name}</span>
                    <span className="font-mono font-bold">{formatUSD(it.total)}</span>
                  </div>
                ))}
              </div>

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
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Fecha de Vencimiento
                  </label>
                  <input
                    type="date"
                    value={editCreditDueDate}
                    onChange={(e) => setEditCreditDueDate(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 font-mono"
                  />
                </div>
                <div>
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

      {/* Modal: Reactivar Factura Anulada */}
      {reactivateModalSale && (
        <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-md w-full border border-emerald-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-emerald-600 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <RotateCcw className="w-5 h-5 text-emerald-100" />
                <div>
                  <h3 className="font-bold text-sm">Reactivar Cuenta por Cobrar</h3>
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
                ¿Deseas reactivar la factura <strong className="font-mono">{reactivateModalSale.invoiceNumber}</strong> y volver a colocarla como cuenta por cobrar activa?
              </p>
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setReactivateModalSale(null)}
                  disabled={isReactivating}
                  className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReactivateSale}
                  disabled={isReactivating}
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 disabled:opacity-60"
                >
                  <RotateCcw className="w-4 h-4" />
                  <span>{isReactivating ? 'Reactivando...' : 'Sí, Reactivar'}</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
