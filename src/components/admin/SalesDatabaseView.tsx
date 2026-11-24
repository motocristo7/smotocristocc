import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Sale,
  PaymentMethod,
  PagoMovilAccountOption,
  SalePaymentType,
  SalePaymentSplit,
  SaleSplitCondition,
  SaleCreditStatus,
  isSaleWithCredit,
} from '../../types';
import {
  formatUSD,
  formatBs,
  buildInvoiceWhatsAppMessage,
  buildCreditReminderWhatsAppMessage,
  buildCreditPaymentReceiptWhatsAppMessage,
} from '../../utils/whatsapp';
import { downloadInvoicePDF } from '../../utils/pdfInvoice';
import { RecordCreditPaymentModal } from '../modals/RecordCreditPaymentModal';
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
  Layers,
} from 'lucide-react';

export const SalesDatabaseView: React.FC = () => {
  const {
    sales,
    customers,
    settings,
    treasuryAccounts,
    treasuryMovements,
    setCurrentView,
    updateSale,
    updateSaleCreditStatus,
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

  // Modal para registrar abono (en Bolívares o Divisas)
  const [paymentModalSale, setPaymentModalSale] = useState<Sale | null>(null);

  // Modal para editar cliente / tipo de venta / cuenta destino
  const [editSaleModal, setEditSaleModal] = useState<Sale | null>(null);
  const [editCustomerId, setEditCustomerId] = useState<string>('');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerDocument, setEditCustomerDocument] = useState('');
  const [editCreditDueDate, setEditCreditDueDate] = useState('');
  const [editNotes, setEditNotes] = useState('');
  const [editPaymentMethod, setEditPaymentMethod] = useState<PaymentMethod>('Pago Móvil');
  const [editPagoMovilAccount, setEditPagoMovilAccount] =
    useState<PagoMovilAccountOption>('BANESCO_PERSONAL');
  const [editTreasuryAccountId, setEditTreasuryAccountId] = useState<string>('');
  const [editPaymentTouched, setEditPaymentTouched] = useState<boolean>(false);
  const [editIsMixto, setEditIsMixto] = useState<boolean>(false);
  interface EditSplitDraft {
    id: string;
    splitType: SaleSplitCondition;
    paymentMethod: PaymentMethod;
    pagoMovilAccount: PagoMovilAccountOption;
    treasuryAccountId: string;
    amountUSD: string;
    reference: string;
  }
  const [editSplits, setEditSplits] = useState<EditSplitDraft[]>([]);

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
    const isDeferred = isSaleWithCredit(sale);
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

      // Credit / Apartado / Mixto-con-Crédito status filter
      if (
        conditionFilter === 'CREDITO' ||
        conditionFilter === 'APARTADO' ||
        !sale.paymentType ||
        isSaleWithCredit(sale)
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

    const mixtoSales = sales.filter((s) => s.paymentType === 'MIXTO');
    const mixtoTotalUSD = mixtoSales.reduce((sum, s) => sum + s.total, 0);

    const overdueCount = sales.filter((s) => isSaleWithCredit(s) && isSaleOverdue(s)).length;

    return {
      totalUSD,
      totalBs: totalUSD * rate,
      contadoCount: contadoSales.length,
      contadoTotalUSD,
      mixtoCount: mixtoSales.length,
      mixtoTotalUSD,
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
  };

  const findMatchingTreasuryAccountId = (
    method: PaymentMethod,
    pmAccount?: PagoMovilAccountOption
  ): string => {
    if (method === 'Pago Móvil') {
      if (pmAccount === 'PROVINCIAL') {
        return (
          treasuryAccounts.find((a) => a.id === 'acc-provincial')?.id ||
          treasuryAccounts.find((a) => /provincial/i.test(a.name))?.id ||
          ''
        );
      }
      return (
        treasuryAccounts.find((a) => a.id === 'acc-banesco-personal')?.id ||
        treasuryAccounts.find((a) => /banesco\s*personal/i.test(a.name))?.id ||
        ''
      );
    }
    if (method === 'Punto de Venta (Bs)') {
      return (
        treasuryAccounts.find((a) => a.id === 'acc-banesco-smcc')?.id ||
        treasuryAccounts.find((a) => /banesco\s*smcc|\bsmcc\b/i.test(a.name))?.id ||
        ''
      );
    }
    if (method === 'Dólares Efectivo (USD)') {
      return (
        treasuryAccounts.find((a) => a.id === 'acc-efectivo-usd')?.id ||
        treasuryAccounts.find((a) => a.currency === 'USD' && a.group === 'EFECTIVO')?.id ||
        treasuryAccounts.find((a) => a.currency === 'USD')?.id ||
        ''
      );
    }
    if (method === 'Efectivo Bs') {
      return (
        treasuryAccounts.find((a) => a.id === 'acc-efectivo-bs')?.id ||
        treasuryAccounts.find((a) => /caja\s*efectivo\s*bs/i.test(a.name))?.id ||
        treasuryAccounts.find((a) => a.currency === 'BS' && a.group === 'EFECTIVO')?.id ||
        ''
      );
    }
    if (method === 'Binance Pay (USDT)') {
      return (
        treasuryAccounts.find((a) => a.id === 'acc-billetera-usdt')?.id ||
        treasuryAccounts.find((a) => a.currency === 'USDT')?.id ||
        treasuryAccounts.find((a) => a.group === 'BILLETERA_DIVISAS')?.id ||
        ''
      );
    }
    return (
      treasuryAccounts.find((a) => a.id === 'acc-banesco-smcc')?.id ||
      treasuryAccounts.find((a) => /banesco\s*smcc|\bsmcc\b/i.test(a.name))?.id ||
      treasuryAccounts.find((a) => a.group === 'BANCO_NACIONAL' && a.currency === 'BS')?.id ||
      ''
    );
  };

  const getDefaultAccountLabelForMethod = (
    method: PaymentMethod,
    pmAccount?: PagoMovilAccountOption
  ): string => {
    if (method === 'Pago Móvil') {
      return pmAccount === 'PROVINCIAL' ? 'Provincial (Bs)' : 'Banesco Personal (Bs)';
    }
    if (method === 'Efectivo Bs') return 'Caja Efectivo Bs';
    if (method === 'Punto de Venta (Bs)') return 'Banesco SMCC (Bs)';
    if (method === 'Dólares Efectivo (USD)') return 'Caja Efectivo USD ($)';
    if (method === 'Binance Pay (USDT)') return 'Billetera USDT (Binance)';
    return 'Banesco SMCC (Bs)';
  };

  const handleOpenEditSaleModal = (sale: Sale, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    const initialMethod: PaymentMethod = sale.paymentMethod || 'Pago Móvil';
    const inferredPmAccount: PagoMovilAccountOption =
      sale.pagoMovilAccount ||
      (/provincial/i.test(sale.treasuryAccountName || '') ? 'PROVINCIAL' : 'BANESCO_PERSONAL');
    const linkedMov =
      (sale.treasuryMovementId
        ? treasuryMovements.find((m) => m.id === sale.treasuryMovementId)
        : undefined) ||
      treasuryMovements.find(
        (m) =>
          m.saleId === sale.id &&
          m.type === 'INGRESO' &&
          m.category !== 'Cobro Cuentas por Cobrar'
      );
    const existingAccId = linkedMov?.accountId || sale.treasuryAccountId || '';
    const matchedAccId =
      (existingAccId && treasuryAccounts.some((a) => a.id === existingAccId) && existingAccId) ||
      findMatchingTreasuryAccountId(initialMethod, inferredPmAccount);

    const saleIsMixto =
      sale.paymentType === 'MIXTO' && Array.isArray(sale.paymentSplits) && sale.paymentSplits.length > 0;
    const initialSplits: EditSplitDraft[] = saleIsMixto
      ? (sale.paymentSplits || []).map((sp, i) => {
          const spPm: PagoMovilAccountOption =
            sp.pagoMovilAccount ||
            (/provincial/i.test(sp.treasuryAccountName || '') ? 'PROVINCIAL' : 'BANESCO_PERSONAL');
          const spAccId =
            (sp.treasuryAccountId &&
              treasuryAccounts.some((a) => a.id === sp.treasuryAccountId) &&
              sp.treasuryAccountId) ||
            findMatchingTreasuryAccountId(sp.paymentMethod, spPm);
          return {
            id: sp.id || `edit-sp-${Date.now()}-${i}`,
            splitType: sp.splitType || 'CONTADO',
            paymentMethod: sp.paymentMethod,
            pagoMovilAccount: spPm,
            treasuryAccountId: spAccId,
            amountUSD: String(Math.round((Number(sp.amountUSD) || 0) * 100) / 100),
            reference: sp.reference || '',
          };
        })
      : [
          {
            id: `edit-sp-1-${Date.now()}`,
            splitType: 'CONTADO',
            paymentMethod: initialMethod,
            pagoMovilAccount: inferredPmAccount,
            treasuryAccountId: matchedAccId,
            amountUSD: (Math.round((sale.total / 2) * 100) / 100).toFixed(2),
            reference: '',
          },
          {
            id: `edit-sp-2-${Date.now()}`,
            splitType: 'CONTADO',
            paymentMethod:
              initialMethod === 'Dólares Efectivo (USD)' ? 'Pago Móvil' : 'Dólares Efectivo (USD)',
            pagoMovilAccount: 'BANESCO_PERSONAL',
            treasuryAccountId: findMatchingTreasuryAccountId(
              initialMethod === 'Dólares Efectivo (USD)' ? 'Pago Móvil' : 'Dólares Efectivo (USD)',
              'BANESCO_PERSONAL'
            ),
            amountUSD: (
              Math.round((sale.total - Math.round((sale.total / 2) * 100) / 100) * 100) / 100
            ).toFixed(2),
            reference: '',
          },
        ];

    setEditSaleModal(sale);
    setEditCustomerId('');
    setEditCustomerName(sale.customerName || '');
    setEditCustomerPhone(sale.customerPhone === 'N/A' ? '' : sale.customerPhone || '');
    setEditCustomerDocument(sale.customerDocument || '');
    setEditCreditDueDate(sale.creditDueDate || '');
    setEditNotes(sale.notes || '');
    setEditPaymentMethod(initialMethod);
    setEditPagoMovilAccount(inferredPmAccount);
    setEditTreasuryAccountId(matchedAccId);
    setEditIsMixto(saleIsMixto);
    setEditSplits(initialSplits);
    setEditPaymentTouched(false);
  };

  const handleEditPaymentMethodChange = (nextMethod: PaymentMethod) => {
    setEditPaymentMethod(nextMethod);
    const matched = findMatchingTreasuryAccountId(nextMethod, editPagoMovilAccount);
    setEditTreasuryAccountId(matched);
    setEditPaymentTouched(true);
  };

  const handleEditPagoMovilAccountChange = (nextPm: PagoMovilAccountOption) => {
    setEditPagoMovilAccount(nextPm);
    const matched = findMatchingTreasuryAccountId('Pago Móvil', nextPm);
    setEditTreasuryAccountId(matched);
    setEditPaymentTouched(true);
  };

  const handleSaveEditedSale = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editSaleModal) return;
    const cleanName = editCustomerName.trim();
    if (!cleanName) {
      showToast('Ingresa el nombre del cliente para guardar los cambios.');
      return;
    }

    const saleRate = editSaleModal.bcvRate || rate;
    let resolvedSplitsPayload: SalePaymentSplit[] | undefined;

    if (editPaymentTouched && editIsMixto) {
      const parsed: SalePaymentSplit[] = editSplits
        .map((sp, idx) => {
          const usd = Math.round((parseFloat(sp.amountUSD) || 0) * 100) / 100;
          const isCreditLeg = sp.splitType === 'CREDITO';
          const accObj = !isCreditLeg
            ? treasuryAccounts.find((a) => a.id === sp.treasuryAccountId)
            : undefined;
          return {
            id: sp.id || `split-${Date.now()}-${idx}`,
            splitType: isCreditLeg ? ('CREDITO' as SaleSplitCondition) : ('CONTADO' as SaleSplitCondition),
            paymentMethod: isCreditLeg ? 'Pago Móvil' : sp.paymentMethod,
            amountUSD: usd,
            amountBs: Math.round(usd * saleRate * 100) / 100,
            pagoMovilAccount: !isCreditLeg && sp.paymentMethod === 'Pago Móvil' ? sp.pagoMovilAccount : undefined,
            treasuryAccountId: !isCreditLeg ? sp.treasuryAccountId || undefined : undefined,
            treasuryAccountName: isCreditLeg ? 'Cuenta por Cobrar (Crédito)' : accObj?.name,
            reference: sp.reference.trim() || undefined,
          };
        })
        .filter((sp) => sp.amountUSD > 0);

      if (parsed.length < 2) {
        showToast('Para Pago Mixto ingresa montos mayores a $0 en al menos 2 partes de pago.');
        return;
      }

      const sumUSD = Math.round(parsed.reduce((acc, s) => acc + s.amountUSD, 0) * 100) / 100;
      const targetUSD = Math.round(editSaleModal.total * 100) / 100;
      const diffUSD = Math.round((targetUSD - sumUSD) * 100) / 100;
      if (Math.abs(diffUSD) > 0.02) {
        showToast(
          `La suma del Pago Mixto (${formatUSD(sumUSD)}) debe coincidir con el total (${formatUSD(targetUSD)}).`
        );
        return;
      }
      if (diffUSD !== 0) {
        const last = parsed.length - 1;
        const adj = Math.max(0.01, Math.round((parsed[last].amountUSD + diffUSD) * 100) / 100);
        parsed[last] = { ...parsed[last], amountUSD: adj, amountBs: Math.round(adj * saleRate * 100) / 100 };
      }
      resolvedSplitsPayload = parsed;
    }

    const canChangePaymentType =
      editSaleModal.paymentType !== 'CREDITO' && editSaleModal.paymentType !== 'APARTADO';
    const nextPaymentTypeForEdit: SalePaymentType | undefined =
      editPaymentTouched && canChangePaymentType
        ? editIsMixto
          ? 'MIXTO'
          : editSaleModal.paymentType === 'MIXTO'
            ? 'CONTADO'
            : editSaleModal.paymentType || 'CONTADO'
        : undefined;

    const firstCashEditSplit =
      resolvedSplitsPayload?.find((sp) => sp.splitType !== 'CREDITO') || resolvedSplitsPayload?.[0];

    const updated = updateSale(editSaleModal.id, {
      customerId: editCustomerId || undefined,
      customerName: cleanName,
      customerPhone: editCustomerPhone.trim() || 'N/A',
      customerDocument: editCustomerDocument.trim() || undefined,
      creditDueDate: editCreditDueDate || undefined,
      notes: editNotes.trim() || undefined,
      ...(editPaymentTouched
        ? editIsMixto && resolvedSplitsPayload
          ? {
              paymentType: nextPaymentTypeForEdit,
              paymentSplits: resolvedSplitsPayload,
              paymentMethod: firstCashEditSplit ? firstCashEditSplit.paymentMethod : editPaymentMethod,
              syncTreasuryPayment: true,
            }
          : {
              paymentType: nextPaymentTypeForEdit,
              paymentSplits: undefined,
              paymentMethod: editPaymentMethod,
              pagoMovilAccount: editPaymentMethod === 'Pago Móvil' ? editPagoMovilAccount : undefined,
              treasuryAccountId: editTreasuryAccountId || undefined,
              syncTreasuryPayment: true,
            }
        : {}),
      reassignCustomer: !editCustomerId,
    });

    if (updated && selectedSaleDetail?.id === updated.id) {
      setSelectedSaleDetail(updated);
    }

    if (editPaymentTouched) {
      if (editIsMixto && resolvedSplitsPayload) {
        showToast(
          `Factura ${editSaleModal.invoiceNumber} actualizada a Pago Mixto (${resolvedSplitsPayload.length} formas · Tesorería sincronizada)`
        );
      } else {
        const destAccountLabel =
          updated?.treasuryAccountName ||
          treasuryAccounts.find((a) => a.id === editTreasuryAccountId)?.name ||
          getDefaultAccountLabelForMethod(editPaymentMethod, editPagoMovilAccount);
        showToast(
          `Factura ${editSaleModal.invoiceNumber} actualizada: ${editPaymentMethod} → ${destAccountLabel} (Tesorería sincronizada)`
        );
      }
    } else {
      showToast(`Factura ${editSaleModal.invoiceNumber} actualizada y asignada a ${cleanName}`);
    }
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
        !isSaleWithCredit(target) || (target.creditPaidAmount || 0) >= target.total;
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
              onClick={() => setConditionFilter('MIXTO')}
              className={`px-3 py-2 rounded-xl font-bold transition-all cursor-pointer whitespace-nowrap flex items-center gap-1.5 ${
                conditionFilter === 'MIXTO'
                  ? 'bg-teal-600 text-white shadow-2xs'
                  : 'bg-slate-100 text-slate-700 hover:bg-slate-200'
              }`}
            >
              <Layers className="w-3.5 h-3.5" />
              <span>Pago Mixto ({stats.mixtoCount})</span>
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
                  <th className="py-3 px-4">Condición & Pago</th>
                  <th className="py-3 px-4">Repuestos / Servicios</th>
                  <th className="py-3 px-4 text-right">Monto Total</th>
                  <th className="py-3 px-4 text-center">Estado de Cobro</th>
                  <th className="py-3 px-4 text-center">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {filteredSales.map((sale) => {
                  const saleType = sale.paymentType || 'CONTADO';
                  const isApartado = saleType === 'APARTADO';
                  const isMixtoWithCredit = saleType === 'MIXTO' && isSaleWithCredit(sale);
                  const isDeferred = isSaleWithCredit(sale);
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

                      {/* Condición & Pago */}
                      <td className="py-3.5 px-4 align-top space-y-1.5">
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
                        {saleType === 'MIXTO' && (
                          <div className="space-y-1">
                            <span
                              className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-bold border ${
                                isMixtoWithCredit
                                  ? 'bg-amber-100 text-amber-900 border-amber-300'
                                  : 'bg-teal-100 text-teal-900 border-teal-300'
                              }`}
                            >
                              <Layers
                                className={`w-3 h-3 ${isMixtoWithCredit ? 'text-amber-700' : 'text-teal-700'}`}
                              />
                              <span>
                                {isMixtoWithCredit
                                  ? `Mixto (Contado + Crédito)`
                                  : `Pago Mixto (${sale.paymentSplits?.length || 2})`}
                              </span>
                            </span>
                            {isMixtoWithCredit && overdueInfo && !isFullyPaid && (
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

                        {/* Método de pago y cuenta destino */}
                        {saleType === 'MIXTO' && sale.paymentSplits && sale.paymentSplits.length > 0 ? (
                          <div className="space-y-0.5 text-[10px] leading-tight">
                            {sale.paymentSplits.map((sp, idx) => {
                              const isCreditLeg = sp.splitType === 'CREDITO';
                              return (
                                <div key={sp.id || idx} className="text-slate-700">
                                  <span
                                    className={`font-semibold ${
                                      isCreditLeg ? 'text-amber-800' : 'text-slate-700'
                                    }`}
                                  >
                                    {isCreditLeg ? 'A Crédito' : sp.paymentMethod}
                                  </span>
                                  <span
                                    className={`font-mono font-bold ml-1 ${
                                      isCreditLeg ? 'text-amber-800' : 'text-teal-800'
                                    }`}
                                  >
                                    ({formatUSD(sp.amountUSD)})
                                  </span>
                                  {(isCreditLeg || sp.treasuryAccountName) && (
                                    <span className="text-slate-400 block pl-1">
                                      → {isCreditLeg ? 'Cuenta por Cobrar' : sp.treasuryAccountName}
                                    </span>
                                  )}
                                </div>
                              );
                            })}
                          </div>
                        ) : (
                          <div className="text-[10px] leading-tight">
                            <span className="font-semibold text-slate-700 block">
                              {sale.paymentMethod || 'Sin método'}
                            </span>
                            {(sale.treasuryAccountName ||
                              (sale.paymentMethod === 'Pago Móvil' && sale.pagoMovilAccount) ||
                              sale.paymentMethod === 'Efectivo Bs' ||
                              sale.paymentMethod === 'Punto de Venta (Bs)') && (
                              <span className="text-slate-500 block">
                                →{' '}
                                {sale.treasuryAccountName ||
                                  (sale.paymentMethod === 'Pago Móvil'
                                    ? sale.pagoMovilAccount === 'PROVINCIAL'
                                      ? 'Provincial (Bs)'
                                      : 'Banesco Personal (Bs)'
                                    : sale.paymentMethod === 'Efectivo Bs'
                                      ? 'Caja Efectivo Bs'
                                      : 'Banesco SMCC (Bs)')}
                              </span>
                            )}
                          </div>
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

                          {/* Editar Tipo de Pago / Cuenta / Cliente */}
                          <button
                            type="button"
                            onClick={(e) => handleOpenEditSaleModal(sale, e)}
                            className="p-1.5 text-slate-600 hover:text-amber-700 hover:bg-amber-50 rounded-lg cursor-pointer transition-colors"
                            title="Editar tipo de venta, cuenta destino y datos de la factura"
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
                      : selectedSaleDetail.paymentType === 'MIXTO'
                      ? isSaleWithCredit(selectedSaleDetail)
                        ? `Pago Mixto (Contado + Crédito ${selectedSaleDetail.creditDays || 15}d)`
                        : 'Pago Mixto'
                      : 'De Contado'}
                  </span>
                  {isSaleWithCredit(selectedSaleDetail) && (
                    <span className="text-amber-800 font-mono block">
                      {selectedSaleDetail.paymentType === 'APARTADO' ? 'Límite retiro:' : 'Vence:'}{' '}
                      {selectedSaleDetail.creditDueDate || 'Sin definir'}
                    </span>
                  )}
                  <span className="text-slate-500 block">
                    {selectedSaleDetail.paymentType === 'MIXTO' &&
                    selectedSaleDetail.paymentSplits &&
                    selectedSaleDetail.paymentSplits.length > 0
                      ? `${selectedSaleDetail.paymentSplits.length} partes combinadas`
                      : `Método: ${selectedSaleDetail.paymentMethod}${
                          selectedSaleDetail.treasuryAccountName
                            ? ` · ${selectedSaleDetail.treasuryAccountName}`
                            : ''
                        }`}
                  </span>
                </div>
              </div>

              {/* Desglose de Pago Mixto en modal de detalle */}
              {selectedSaleDetail.paymentType === 'MIXTO' &&
                selectedSaleDetail.paymentSplits &&
                selectedSaleDetail.paymentSplits.length > 0 && (
                  <div className="p-3 bg-teal-50/90 border border-teal-200 rounded-xl space-y-2">
                    <span className="font-bold text-teal-950 text-[11px] uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-teal-700" />
                      Desglose de Pago Mixto ({selectedSaleDetail.paymentSplits.length} partes)
                    </span>
                    <div className="space-y-1.5">
                      {selectedSaleDetail.paymentSplits.map((sp, idx) => {
                        const isCreditLeg = sp.splitType === 'CREDITO';
                        const isBsMethod =
                          !isCreditLeg &&
                          (sp.paymentMethod === 'Pago Móvil' ||
                            sp.paymentMethod === 'Efectivo Bs' ||
                            sp.paymentMethod === 'Punto de Venta (Bs)' ||
                            sp.paymentMethod === 'Transferencia Bancaria Bs');
                        const exactBs = sp.amountBs || sp.amountUSD * (selectedSaleDetail.bcvRate || rate);
                        return (
                          <div
                            key={sp.id || idx}
                            className={`p-2 rounded-lg border flex items-center justify-between gap-2 ${
                              isCreditLeg
                                ? 'bg-amber-50 border-amber-300'
                                : 'bg-white border-teal-200/80'
                            }`}
                          >
                            <div>
                              <span
                                className={`font-bold block ${
                                  isCreditLeg ? 'text-amber-950' : 'text-slate-900'
                                }`}
                              >
                                {idx + 1}. {isCreditLeg ? 'A Crédito' : `De Contado · ${sp.paymentMethod}`}
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                {isCreditLeg
                                  ? 'Destino: Cuenta por Cobrar (Crédito)'
                                  : `Cuenta Tesorería: ${sp.treasuryAccountName || 'Automática'}`}
                                {sp.reference ? ` · Ref: ${sp.reference}` : ''}
                              </span>
                            </div>
                            <div className="text-right font-mono shrink-0">
                              <span
                                className={`font-bold block ${
                                  isCreditLeg ? 'text-amber-900' : isBsMethod ? 'text-sky-900' : 'text-teal-900'
                                }`}
                              >
                                {isBsMethod ? formatBs(exactBs) : formatUSD(sp.amountUSD)}
                              </span>
                              <span className="text-[10px] text-slate-500 block">
                                {isBsMethod
                                  ? `Equiv. ${formatUSD(sp.amountUSD)} BCV`
                                  : formatBs(exactBs)}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}

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

                {isSaleWithCredit(selectedSaleDetail) && (
                  <div className="pt-2 border-t border-slate-800 space-y-1 text-xs">
                    {(selectedSaleDetail.creditPaidAmount || 0) > 0 && (
                      <div className="flex justify-between text-emerald-300">
                        <span>Abonado acumulado:</span>
                        <div className="text-right">
                          <span className="font-bold block">
                            {formatUSD(selectedSaleDetail.creditPaidAmount || 0)}
                          </span>
                          <span className="text-[10px] text-emerald-200/80 block">
                            {formatBs(
                              selectedSaleDetail.creditPayments && selectedSaleDetail.creditPayments.length > 0
                                ? (selectedSaleDetail.creditPaidAmount || 0) * rate
                                : selectedSaleDetail.creditPaidAmountBs ||
                                  (selectedSaleDetail.creditPaidAmount || 0) * (selectedSaleDetail.bcvRate || rate)
                            )}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="flex justify-between text-amber-300">
                      <span>
                        {selectedSaleDetail.paymentType === 'APARTADO'
                          ? 'Saldo Restante para Retirar:'
                          : 'Saldo Pendiente de Cobro:'}
                      </span>
                      <div className="text-right">
                        <span className="font-bold block">
                          {formatUSD(Math.max(0, selectedSaleDetail.total - (selectedSaleDetail.creditPaidAmount || 0)))}
                        </span>
                        <span className="text-[10px] text-amber-200/80 block">
                          {formatBs(
                            Math.max(0, selectedSaleDetail.total - (selectedSaleDetail.creditPaidAmount || 0)) * rate
                          )}
                        </span>
                      </div>
                    </div>
                  </div>
                )}
              </div>

              {/* Historial de Abonos Realizados (si aplica) */}
              {selectedSaleDetail.creditPayments && selectedSaleDetail.creditPayments.length > 0 && (
                <div className="space-y-1.5">
                  <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                    Historial de Abonos ({selectedSaleDetail.creditPayments.length})
                  </h4>
                  <div className="space-y-1.5 bg-emerald-50/70 p-3 rounded-xl border border-emerald-200">
                    {selectedSaleDetail.creditPayments.map((p) => {
                      const pBs = p.amountBs || p.amountUSD * (p.bcvRate || selectedSaleDetail.bcvRate || rate);
                      const isBsPaid =
                        p.currencyMode === 'BS' ||
                        (!p.currencyMode &&
                          (p.paymentMethod === 'Pago Móvil' ||
                            p.paymentMethod === 'Efectivo Bs' ||
                            p.paymentMethod === 'Punto de Venta (Bs)' ||
                            p.paymentMethod === 'Transferencia Bancaria Bs'));
                      return (
                        <div
                          key={p.id}
                          className="flex items-center justify-between gap-2 text-xs text-slate-700 border-b border-emerald-200/70 pb-1.5 last:border-b-0 last:pb-0"
                        >
                          <div className="min-w-0">
                            <span className="font-semibold text-slate-900 block truncate">
                              {new Date(p.date).toLocaleDateString('es-VE')} · {p.paymentMethod}
                            </span>
                            {(p.reference || p.notes) && (
                              <span className="text-[10px] text-slate-500 block truncate">
                                {p.reference ? `Ref: ${p.reference}` : ''}
                                {p.reference && p.notes ? ' · ' : ''}
                                {p.notes || ''}
                              </span>
                            )}
                          </div>
                          <div className="text-right font-mono shrink-0">
                            <span className="font-bold text-emerald-800 block">
                              {isBsPaid ? `+${formatBs(pBs)}` : `+${formatUSD(p.amountUSD)}`}
                            </span>
                            <span className="text-[10px] text-slate-500 block">
                              {isBsPaid ? `Equiv. ${formatUSD(p.amountUSD)}` : formatBs(pBs)}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}

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
                  {isSaleWithCredit(selectedSaleDetail) &&
                    !selectedSaleDetail.isVoided &&
                    selectedSaleDetail.creditStatus !== 'PAGADO' &&
                    selectedSaleDetail.creditStatus !== 'ANULADO' &&
                    Math.max(0, selectedSaleDetail.total - (selectedSaleDetail.creditPaidAmount || 0)) > 0.01 && (
                      <button
                        type="button"
                        onClick={() => handleOpenPaymentModal(selectedSaleDetail)}
                        className={`px-3.5 py-2 text-white font-bold rounded-xl flex items-center gap-1.5 cursor-pointer ${
                          selectedSaleDetail.paymentType === 'APARTADO'
                            ? 'bg-indigo-600 hover:bg-indigo-700'
                            : 'bg-amber-600 hover:bg-amber-700'
                        }`}
                      >
                        <DollarSign className="w-4 h-4" />
                        <span>Registrar Abono (Bs / $)</span>
                      </button>
                    )}
                  <button
                    type="button"
                    onClick={() => handleOpenEditSaleModal(selectedSaleDetail)}
                    className="px-3.5 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 font-bold rounded-xl flex items-center gap-1.5 cursor-pointer"
                  >
                    <Edit2 className="w-4 h-4" />
                    <span>Editar Pago / Cliente</span>
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

      {/* Modal: Registrar Abono a Crédito / Apartado (Bolívares o Divisas) */}
      {paymentModalSale && (
        <RecordCreditPaymentModal
          sale={paymentModalSale}
          onClose={() => setPaymentModalSale(null)}
          onSuccess={(result, sendWhatsApp) => {
            const p = result.paymentRecord;
            const summary =
              p.currencyMode === 'BS'
                ? `${formatBs(p.amountBs)} (Equiv. ${formatUSD(p.amountUSD)})`
                : `${formatUSD(p.amountUSD)} (${formatBs(p.amountBs)})`;
            showToast(`¡Abono de ${summary} registrado con éxito!`);
            if (selectedSaleDetail && selectedSaleDetail.id === result.updatedSale.id) {
              setSelectedSaleDetail(result.updatedSale);
            }
            if (sendWhatsApp) {
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
          }}
        />
      )}

      {/* Modal: EDITAR Tipo de Pago, Cuenta Destino y Datos de Factura */}
      {editSaleModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full max-h-[92vh] flex flex-col border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95">
            <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2">
                <Edit2 className="w-5 h-5 text-amber-400" />
                <div>
                  <h3 className="font-bold text-sm">Editar Venta, Tipo de Pago y Cuenta</h3>
                  <span className="text-[11px] text-slate-300 font-mono">
                    {editSaleModal.invoiceNumber} · {formatUSD(editSaleModal.total)} ({formatBs(editSaleModal.total * (editSaleModal.bcvRate || rate))})
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

            <form onSubmit={handleSaveEditedSale} className="p-5 space-y-4 text-xs overflow-y-auto flex-1">
              {/* Sección 1: Tipo de Venta / Método de Pago y Cuenta Destino en Tesorería */}
              <div className="p-3.5 rounded-xl bg-slate-50 border border-slate-200 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-slate-800 flex items-center gap-1.5">
                    <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                    <span>Tipo de Venta y Cuenta en Tesorería</span>
                  </span>
                  {editSaleModal.treasuryAccountName && (
                    <span className="text-[10px] font-semibold text-slate-500">
                      Actual: {editSaleModal.treasuryAccountName}
                    </span>
                  )}
                </div>

                {/* Selector Pago Único vs Pago Mixto (para ventas que no son Crédito/Apartado) */}
                {editSaleModal.paymentType !== 'CREDITO' && editSaleModal.paymentType !== 'APARTADO' && (
                  <div className="grid grid-cols-2 gap-1.5 bg-slate-200/70 p-1 rounded-xl">
                    <button
                      type="button"
                      onClick={() => {
                        setEditIsMixto(false);
                        setEditPaymentTouched(true);
                      }}
                      className={`py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        !editIsMixto
                          ? 'bg-slate-900 text-white shadow-2xs'
                          : 'text-slate-700 hover:bg-white/70'
                      }`}
                    >
                      <CreditCard className="w-3.5 h-3.5" />
                      <span>Pago Único</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setEditIsMixto(true);
                        setEditPaymentTouched(true);
                      }}
                      className={`py-1.5 px-2.5 rounded-lg text-[11px] font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                        editIsMixto
                          ? 'bg-teal-600 text-white shadow-2xs'
                          : 'text-slate-700 hover:bg-white/70'
                      }`}
                    >
                      <Layers className="w-3.5 h-3.5" />
                      <span>Pago Mixto (2+ formas)</span>
                    </button>
                  </div>
                )}

                {editIsMixto ? (
                  (() => {
                    const editAssignedUSD =
                      Math.round(
                        editSplits.reduce((sum, s) => sum + (parseFloat(s.amountUSD) || 0), 0) * 100
                      ) / 100;
                    const editRemainingUSD =
                      Math.round((editSaleModal.total - editAssignedUSD) * 100) / 100;
                    const editSaleRate = editSaleModal.bcvRate || rate;

                    return (
                      <div className="space-y-2.5">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-teal-900">
                            Desglose de Pago Mixto (Total: {formatUSD(editSaleModal.total)})
                          </span>
                          <button
                            type="button"
                            onClick={() => {
                              setEditSplits((prev) => [
                                ...prev,
                                {
                                  id: `edit-sp-${Date.now()}-${prev.length + 1}`,
                                  splitType: 'CONTADO',
                                  paymentMethod: 'Punto de Venta (Bs)',
                                  pagoMovilAccount: 'BANESCO_PERSONAL',
                                  treasuryAccountId: findMatchingTreasuryAccountId(
                                    'Punto de Venta (Bs)',
                                    'BANESCO_PERSONAL'
                                  ),
                                  amountUSD: '',
                                  reference: '',
                                },
                              ]);
                              setEditPaymentTouched(true);
                            }}
                            className="px-2 py-1 text-[10px] font-bold rounded-lg bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-1 cursor-pointer"
                          >
                            <Plus className="w-3 h-3" />
                            <span>Agregar pago</span>
                          </button>
                        </div>

                        {editSplits.map((sp, idx) => {
                          const isCreditLeg = sp.splitType === 'CREDITO';
                          return (
                            <div
                              key={sp.id}
                              className={`p-2.5 rounded-xl border space-y-2 ${
                                isCreditLeg
                                  ? 'bg-amber-50/70 border-amber-300'
                                  : 'bg-white border-teal-200'
                              }`}
                            >
                              <div className="flex items-center justify-between gap-2">
                                <span
                                  className={`text-[10px] font-extrabold uppercase ${
                                    isCreditLeg ? 'text-amber-900' : 'text-teal-800'
                                  }`}
                                >
                                  Parte #{idx + 1} · {isCreditLeg ? 'A Crédito' : 'De Contado'}
                                </span>
                                <div className="flex items-center gap-1.5">
                                  {Math.abs(editRemainingUSD) > 0.01 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        const others = editSplits
                                          .filter((x) => x.id !== sp.id)
                                          .reduce((sum, x) => sum + (parseFloat(x.amountUSD) || 0), 0);
                                        const rem = Math.max(
                                          0,
                                          Math.round((editSaleModal.total - others) * 100) / 100
                                        );
                                        setEditSplits((prev) =>
                                          prev.map((x) =>
                                            x.id === sp.id ? { ...x, amountUSD: rem.toFixed(2) } : x
                                          )
                                        );
                                        setEditPaymentTouched(true);
                                      }}
                                      className="px-1.5 py-0.5 text-[10px] font-bold rounded bg-teal-50 text-teal-800 border border-teal-200 hover:bg-teal-100 cursor-pointer"
                                    >
                                      Completar restante
                                    </button>
                                  )}
                                  {editSplits.length > 2 && (
                                    <button
                                      type="button"
                                      onClick={() => {
                                        setEditSplits((prev) => prev.filter((x) => x.id !== sp.id));
                                        setEditPaymentTouched(true);
                                      }}
                                      className="p-0.5 text-rose-500 hover:text-rose-700 cursor-pointer"
                                    >
                                      <Trash2 className="w-3.5 h-3.5" />
                                    </button>
                                  )}
                                </div>
                              </div>

                              {/* Selector por parte: De Contado vs A Crédito */}
                              <div className="grid grid-cols-2 gap-1.5">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditSplits((prev) =>
                                      prev.map((x) =>
                                        x.id === sp.id
                                          ? { ...x, splitType: 'CONTADO' as SaleSplitCondition }
                                          : x
                                      )
                                    );
                                    setEditPaymentTouched(true);
                                  }}
                                  className={`py-1 px-2 rounded-md border text-[10px] font-bold cursor-pointer transition-colors ${
                                    !isCreditLeg
                                      ? 'bg-emerald-600 border-emerald-600 text-white'
                                      : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                  }`}
                                >
                                  De Contado
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setEditSplits((prev) =>
                                      prev.map((x) =>
                                        x.id === sp.id
                                          ? { ...x, splitType: 'CREDITO' as SaleSplitCondition }
                                          : x
                                      )
                                    );
                                    setEditPaymentTouched(true);
                                  }}
                                  className={`py-1 px-2 rounded-md border text-[10px] font-bold cursor-pointer transition-colors ${
                                    isCreditLeg
                                      ? 'bg-amber-600 border-amber-600 text-white'
                                      : 'bg-white border-slate-200 text-amber-800 hover:bg-amber-50'
                                  }`}
                                >
                                  A Crédito
                                </button>
                              </div>

                              <div className="grid grid-cols-2 gap-2">
                                {isCreditLeg ? (
                                  <div className="flex items-center px-2.5 py-2 rounded-lg bg-amber-100/80 border border-amber-200 text-[10px] font-semibold text-amber-950">
                                    Cuenta por Cobrar (no ingresa hoy a Tesorería)
                                  </div>
                                ) : (
                                  <div>
                                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                                      Método de Pago
                                    </label>
                                    <select
                                      value={sp.paymentMethod}
                                      onChange={(e) => {
                                        const nextM = e.target.value as PaymentMethod;
                                        const matched = findMatchingTreasuryAccountId(
                                          nextM,
                                          sp.pagoMovilAccount
                                        );
                                        setEditSplits((prev) =>
                                          prev.map((x) =>
                                            x.id === sp.id
                                              ? { ...x, paymentMethod: nextM, treasuryAccountId: matched }
                                              : x
                                          )
                                        );
                                        setEditPaymentTouched(true);
                                      }}
                                      className="w-full p-2 rounded-lg border border-slate-300 bg-slate-50 font-semibold text-slate-900"
                                    >
                                      <option value="Pago Móvil">Pago Móvil</option>
                                      <option value="Efectivo Bs">Efectivo Bs</option>
                                      <option value="Punto de Venta (Bs)">Punto de Venta (Bs)</option>
                                      <option value="Dólares Efectivo (USD)">Dólares Efectivo (USD)</option>
                                      <option value="Transferencia Bancaria Bs">Transferencia Bs</option>
                                      <option value="Binance Pay (USDT)">Binance Pay (USDT)</option>
                                    </select>
                                  </div>
                                )}

                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                                    Monto ($ USD) · {formatBs((parseFloat(sp.amountUSD) || 0) * editSaleRate)}
                                  </label>
                                  <input
                                    type="number"
                                    step="any"
                                    min="0"
                                    value={sp.amountUSD}
                                    onChange={(e) => {
                                      const val = e.target.value;
                                      const num = parseFloat(val);
                                      const validNum = !Number.isNaN(num) && num >= 0 ? num : 0;
                                      setEditSplits((prev) => {
                                        const next = prev.map((x) =>
                                          x.id === sp.id ? { ...x, amountUSD: val } : x
                                        );
                                        if (next.length === 2 && next[0].id === sp.id) {
                                          const rem = Math.max(
                                            0,
                                            Math.round((editSaleModal.total - validNum) * 100) / 100
                                          );
                                          next[1] = {
                                            ...next[1],
                                            amountUSD: val === '' ? '' : rem.toFixed(2),
                                          };
                                        }
                                        return next;
                                      });
                                      setEditPaymentTouched(true);
                                    }}
                                    placeholder="0.00"
                                    className={`w-full p-2 rounded-lg border bg-white font-mono font-bold text-slate-900 ${
                                      isCreditLeg ? 'border-amber-400' : 'border-teal-300'
                                    }`}
                                  />
                                </div>
                              </div>

                              {!isCreditLeg && (
                                <div>
                                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                                    Cuenta de Tesorería destino
                                  </label>
                                  <select
                                    value={sp.treasuryAccountId}
                                    onChange={(e) => {
                                      const accId = e.target.value;
                                      const picked = treasuryAccounts.find((a) => a.id === accId);
                                      let nextPm = sp.pagoMovilAccount;
                                      if (sp.paymentMethod === 'Pago Móvil' && picked) {
                                        if (
                                          picked.id === 'acc-provincial' ||
                                          /provincial/i.test(picked.name)
                                        ) {
                                          nextPm = 'PROVINCIAL';
                                        } else if (
                                          picked.id === 'acc-banesco-personal' ||
                                          /banesco\s*personal/i.test(picked.name)
                                        ) {
                                          nextPm = 'BANESCO_PERSONAL';
                                        }
                                      }
                                      setEditSplits((prev) =>
                                        prev.map((x) =>
                                          x.id === sp.id
                                            ? { ...x, treasuryAccountId: accId, pagoMovilAccount: nextPm }
                                            : x
                                        )
                                      );
                                      setEditPaymentTouched(true);
                                    }}
                                    className="w-full p-2 rounded-lg border border-slate-300 bg-white font-medium text-slate-900"
                                  >
                                    <option value="">
                                      Automática ({getDefaultAccountLabelForMethod(sp.paymentMethod, sp.pagoMovilAccount)})
                                    </option>
                                    {treasuryAccounts.map((acc) => (
                                      <option key={acc.id} value={acc.id}>
                                        {acc.name}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                              )}
                            </div>
                          );
                        })}

                        <div
                          className={`px-3 py-2 rounded-lg border text-[11px] flex items-center justify-between font-bold ${
                            Math.abs(editRemainingUSD) <= 0.01
                              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
                              : 'bg-amber-50 border-amber-200 text-amber-900'
                          }`}
                        >
                          <span>
                            Asignado: {formatUSD(editAssignedUSD)} / {formatUSD(editSaleModal.total)}
                          </span>
                          <span>
                            {Math.abs(editRemainingUSD) <= 0.01
                              ? '✓ Cuadrado · Tesorería y CxC se sincronizarán'
                              : editRemainingUSD > 0
                                ? `Faltan ${formatUSD(editRemainingUSD)}`
                                : `Excede por ${formatUSD(Math.abs(editRemainingUSD))}`}
                          </span>
                        </div>
                      </div>
                    );
                  })()
                ) : (
                  <>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                        Método / Tipo de Venta *
                      </label>
                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                        {(
                          [
                            { id: 'Pago Móvil', label: 'Pago Móvil' },
                            { id: 'Efectivo Bs', label: 'Efectivo Bs' },
                            { id: 'Punto de Venta (Bs)', label: 'Punto de Venta (Bs)' },
                            { id: 'Dólares Efectivo (USD)', label: 'Efectivo USD ($)' },
                            { id: 'Transferencia Bancaria Bs', label: 'Transferencia Bs' },
                            { id: 'Binance Pay (USDT)', label: 'Binance (USDT)' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleEditPaymentMethodChange(opt.id)}
                            className={`px-2.5 py-2 rounded-lg border text-[11px] font-bold transition-all cursor-pointer text-left ${
                              editPaymentMethod === opt.id
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        ))}
                      </div>
                    </div>

                    {editPaymentMethod === 'Pago Móvil' && (
                      <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 space-y-2">
                        <label className="block text-[11px] font-bold text-blue-950">
                          ¿A qué cuenta cayó el Pago Móvil?
                        </label>
                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleEditPagoMovilAccountChange('BANESCO_PERSONAL')}
                            className={`px-2.5 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                              editPagoMovilAccount === 'BANESCO_PERSONAL'
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : 'bg-white border-blue-200 text-slate-700 hover:bg-blue-100/60'
                            }`}
                          >
                            Banesco Personal
                          </button>
                          <button
                            type="button"
                            onClick={() => handleEditPagoMovilAccountChange('PROVINCIAL')}
                            className={`px-2.5 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                              editPagoMovilAccount === 'PROVINCIAL'
                                ? 'bg-slate-900 border-slate-900 text-white'
                                : 'bg-white border-blue-200 text-slate-700 hover:bg-blue-100/60'
                            }`}
                          >
                            Provincial
                          </button>
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Cuenta de Tesorería donde cayó el pago *
                      </label>
                      <select
                        value={editTreasuryAccountId}
                        onChange={(e) => {
                          const accId = e.target.value;
                          setEditTreasuryAccountId(accId);
                          setEditPaymentTouched(true);
                          const picked = treasuryAccounts.find((a) => a.id === accId);
                          if (editPaymentMethod === 'Pago Móvil' && picked) {
                            if (picked.id === 'acc-provincial' || /provincial/i.test(picked.name)) {
                              setEditPagoMovilAccount('PROVINCIAL');
                            } else if (
                              picked.id === 'acc-banesco-personal' ||
                              /banesco\s*personal/i.test(picked.name)
                            ) {
                              setEditPagoMovilAccount('BANESCO_PERSONAL');
                            }
                          }
                        }}
                        className="w-full p-2.5 rounded-xl border border-slate-300 bg-white font-semibold text-slate-900"
                      >
                        <option value="">
                          Automática ({getDefaultAccountLabelForMethod(editPaymentMethod, editPagoMovilAccount)})
                        </option>
                        {treasuryAccounts.map((acc) => (
                          <option key={acc.id} value={acc.id}>
                            {acc.name} ·{' '}
                            {acc.currency === 'BS'
                              ? formatBs(acc.nativeBalance)
                              : formatUSD(acc.nativeBalance)}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Aviso en tiempo real del ajuste automático en Tesorería y Finanzas */}
                    {(() => {
                      const isVoided = Boolean(
                        editSaleModal.isVoided || editSaleModal.creditStatus === 'ANULADO'
                      );
                      const linkedMov =
                        (editSaleModal.treasuryMovementId
                          ? treasuryMovements.find((m) => m.id === editSaleModal.treasuryMovementId)
                          : undefined) ||
                        treasuryMovements.find(
                          (m) =>
                            m.saleId === editSaleModal.id &&
                            m.type === 'INGRESO' &&
                            m.category !== 'Cobro Cuentas por Cobrar'
                        );
                      const chosenAcc = treasuryAccounts.find((a) => a.id === editTreasuryAccountId);
                      const newAccName =
                        chosenAcc?.name ||
                        getDefaultAccountLabelForMethod(editPaymentMethod, editPagoMovilAccount);
                      const oldAccName =
                        linkedMov?.accountName || editSaleModal.treasuryAccountName || '';
                      const isDeferred =
                        editSaleModal.paymentType === 'CREDITO' ||
                        editSaleModal.paymentType === 'APARTADO';
                      const subsequentSum = (editSaleModal.creditPayments || []).reduce(
                        (s, p) => s + (Number(p.amountUSD) || 0),
                        0
                      );
                      const movUSD = linkedMov
                        ? Number(linkedMov.amountUSD) || 0
                        : isDeferred
                          ? Math.max(0, (editSaleModal.creditPaidAmount || 0) - subsequentSum)
                          : editSaleModal.total;

                      if (isVoided) {
                        return (
                          <div className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-600">
                            Factura anulada: se actualizarán los datos informativos sin alterar los saldos de Tesorería.
                          </div>
                        );
                      }

                      if (editSaleModal.paymentType === 'MIXTO') {
                        return (
                          <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900">
                            <strong>Cambio de Pago Mixto a Pago Único:</strong> se revertirán los ingresos divididos anteriores y se acreditará el total de{' '}
                            <strong className="font-mono">{formatUSD(editSaleModal.total)}</strong> en{' '}
                            <strong>{newAccName}</strong>.
                          </div>
                        );
                      }

                      if (linkedMov && oldAccName && oldAccName !== newAccName) {
                        return (
                          <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900">
                            <strong>Ajuste automático en Tesorería:</strong> se descontarán{' '}
                            <strong className="font-mono">{formatUSD(movUSD)}</strong> de{' '}
                            <strong>{oldAccName}</strong> y se acreditarán en{' '}
                            <strong>{newAccName}</strong>, actualizando el movimiento y la liquidez.
                          </div>
                        );
                      }

                      if (linkedMov) {
                        return (
                          <div className="px-3 py-2 rounded-lg bg-blue-50/70 border border-blue-200 text-[11px] text-blue-900">
                            Se actualizará el método de pago en la factura y en el ingreso registrado en{' '}
                            <strong>{newAccName}</strong> en Tesorería.
                          </div>
                        );
                      }

                      if (movUSD > 0) {
                        return (
                          <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-900">
                            <strong>Sincronización con Tesorería:</strong> esta venta no tenía ingreso vinculado aún; al cambiar el pago se registrarán{' '}
                            <strong className="font-mono">{formatUSD(movUSD)}</strong> en{' '}
                            <strong>{newAccName}</strong>.
                          </div>
                        );
                      }

                      return (
                        <div className="px-3 py-2 rounded-lg bg-slate-100 border border-slate-200 text-[11px] text-slate-600">
                          Se guardará el método y cuenta preferida ({newAccName}). Al registrar abonos se acreditarán en Tesorería.
                        </div>
                      );
                    })()}
                  </>
                )}
              </div>

              {/* Sección 2: Datos del Cliente y Factura */}
              <div className="space-y-3 pt-1">
                <span className="text-[11px] font-bold uppercase tracking-wider text-slate-600 block">
                  Datos del Cliente y Factura
                </span>

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
                  {(editSaleModal.paymentType === 'CREDITO' ||
                    editSaleModal.paymentType === 'APARTADO' ||
                    (editIsMixto && editSplits.some((s) => s.splitType === 'CREDITO'))) && (
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
                      editSaleModal.paymentType === 'CREDITO' ||
                      editSaleModal.paymentType === 'APARTADO' ||
                      (editIsMixto && editSplits.some((s) => s.splitType === 'CREDITO'))
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
                  <span>Guardar y Actualizar Tesorería</span>
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
