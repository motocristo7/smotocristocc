import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchasePaymentRecord,
  PurchasePaymentCurrency,
  PurchaseOrderCurrencyCondition,
  ProductCostOrigin,
} from '../../types';
import {
  formatUSD,
  formatBs,
  buildPurchaseOrderDebtWhatsAppMessage,
  buildPurchaseOrderPaymentWhatsAppMessage,
} from '../../utils/whatsapp';
import {
  calculateProductPricing,
  calculateReferenceCostUSD,
  suggestPriceFromTargetProfit,
  round2,
  round4,
} from '../../utils/pricing';
import { downloadPurchaseOrderPDF } from '../../utils/pdfInvoice';
import { compressImageFileToDataUrl, normalizeImageUrl } from '../../utils/imageUrl';
import {
  downloadPurchaseOrderTemplate,
  ParsedPOExcelItem,
  ParsedPOHeaderMetadata,
} from '../../utils/excelPurchaseOrder';
import { ImportPurchaseOrderExcelModal } from './ImportPurchaseOrderExcelModal';
import {
  Truck,
  Plus,
  Search,
  PackageCheck,
  Clock,
  DollarSign,
  Coins,
  Building2,
  UserCheck,
  Phone,
  MessageSquare,
  FileDown,
  FileSpreadsheet,
  Download,
  UploadCloud,
  Edit3,
  Trash2,
  X,
  CheckCircle2,
  AlertTriangle,
  Calendar,
  CreditCard,
  Banknote,
  Wallet,
  Receipt,
  PackagePlus,
  Eye,
  Check,
  Boxes,
  MapPin,
  Barcode,
  Upload,
  Image as ImageIcon,
  ChevronDown,
  ChevronUp,
  Lock,
  Info,
  Calculator,
} from 'lucide-react';

type ActiveTab = 'ordenes' | 'proveedores';
type OrderFilterMode =
  | 'TODAS'
  | 'POR_PAGAR'
  | 'PAGADAS'
  | 'POR_RECIBIR'
  | 'RECIBIDAS'
  | 'CREDITO'
  | 'CONTADO'
  | 'DIVISAS'
  | 'BS_BCV';

const PAYMENT_CURRENCY_OPTIONS: Array<{
  currency: PurchasePaymentCurrency;
  label: string;
  sublabel: string;
  defaultMethod: string;
  subMethods?: string[];
}> = [
  {
    currency: 'DIVISAS',
    label: 'Divisas ($)',
    sublabel: 'Efectivo USD',
    defaultMethod: 'Divisas ($ Efectivo)',
  },
  {
    currency: 'USDT',
    label: 'USDT',
    sublabel: 'Binance Pay / Cripto',
    defaultMethod: 'USDT (Binance Pay)',
  },
  {
    currency: 'BS',
    label: 'Bolívares (Bs)',
    sublabel: 'Pago Móvil / Transf.',
    defaultMethod: 'Bolívares (Pago Móvil)',
    subMethods: [
      'Bolívares (Pago Móvil)',
      'Bolívares (Transferencia Bancaria)',
      'Bolívares (Punto de Venta)',
    ],
  },
];

export const PurchaseOrdersView: React.FC = () => {
  const {
    settings,
    products,
    categories,
    addCategory,
    suppliers,
    addSupplier,
    updateSupplier,
    deleteSupplier,
    purchaseOrders,
    createPurchaseOrder,
    updatePurchaseOrder,
    deletePurchaseOrder,
    markPurchaseOrderReceived,
    recordPurchaseOrderPayment,
    totalSupplierDebtUSD,
    pendingReceptionOrdersCount,
    setWhatsappModalData,
    exchangeGap,
  } = useApp();

  const bcvRate = settings.bcvRate || 1;
  const usdtRate = exchangeGap.usdtRate;

  const [activeTab, setActiveTab] = useState<ActiveTab>('ordenes');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterMode, setFilterMode] = useState<OrderFilterMode>('TODAS');
  const [supplierFilterId, setSupplierFilterId] = useState<string>('ALL');
  const [supplierSearchTerm, setSupplierSearchTerm] = useState('');

  // Supplier Modal State
  const [isSupplierModalOpen, setIsSupplierModalOpen] = useState(false);
  const [editingSupplier, setEditingSupplier] = useState<Supplier | null>(null);
  const [supCode, setSupCode] = useState('');
  const [supName, setSupName] = useState('');
  const [supRif, setSupRif] = useState('');
  const [supVendorName, setSupVendorName] = useState('');
  const [supVendorPhone, setSupVendorPhone] = useState('');
  const [supEmail, setSupEmail] = useState('');
  const [supAddress, setSupAddress] = useState('');
  const [supNotes, setSupNotes] = useState('');
  const [supError, setSupError] = useState<string | null>(null);

  // Order Create / Edit Modal State
  const [isOrderModalOpen, setIsOrderModalOpen] = useState(false);
  const [editingOrder, setEditingOrder] = useState<PurchaseOrder | null>(null);
  const [ordOrderNumber, setOrdOrderNumber] = useState('');
  const [ordCreatedDate, setOrdCreatedDate] = useState(new Date().toISOString().split('T')[0]);
  const [ordBcvRate, setOrdBcvRate] = useState<string>(String(settings.bcvRate || 1));
  const [ordSupplierId, setOrdSupplierId] = useState('');
  const [ordSupplierInvoice, setOrdSupplierInvoice] = useState('');
  const [ordItems, setOrdItems] = useState<PurchaseOrderItem[]>([]);
  const [ordPaymentType, setOrdPaymentType] = useState<'CONTADO' | 'CREDITO'>('CREDITO');
  const [ordCurrencyCondition, setOrdCurrencyCondition] = useState<PurchaseOrderCurrencyCondition>('DIVISAS');
  const [ordCreditDays, setOrdCreditDays] = useState<number>(15);
  const [ordCreditDueDate, setOrdCreditDueDate] = useState<string>('');
  const [ordReceivedStatus, setOrdReceivedStatus] = useState<'PENDIENTE' | 'RECIBIDA'>('PENDIENTE');
  const [ordReceivedDate, setOrdReceivedDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [ordApplyStock, setOrdApplyStock] = useState<boolean>(true);
  const [ordSyncInventoryDelta, setOrdSyncInventoryDelta] = useState<boolean>(true);
  const [ordPaymentOption, setOrdPaymentOption] = useState<'PENDIENTE' | 'ABONO' | 'PAGADO'>('PENDIENTE');
  const [ordInitialPaidUSD, setOrdInitialPaidUSD] = useState<string>('');
  const [ordPayCurrency, setOrdPayCurrency] = useState<PurchasePaymentCurrency>('DIVISAS');
  const [ordPayMethod, setOrdPayMethod] = useState<string>('Divisas ($ Efectivo)');
  const [ordPayReference, setOrdPayReference] = useState<string>('');
  const [ordPayments, setOrdPayments] = useState<PurchasePaymentRecord[]>([]);
  const [ordNotes, setOrdNotes] = useState<string>('');
  const [ordNotifyVendorOnSave, setOrdNotifyVendorOnSave] = useState<boolean>(false);
  const [ordError, setOrdError] = useState<string | null>(null);
  const [saveFeedback, setSaveFeedback] = useState<string | null>(null);

  // Product picker inside Order Modal
  const [partSearch, setPartSearch] = useState('');
  const [showCustomPartForm, setShowCustomPartForm] = useState(false);
  const [customPartName, setCustomPartName] = useState('');
  const [customPartSku, setCustomPartSku] = useState('');
  const [customPartBarcode, setCustomPartBarcode] = useState('');
  const [customPartCategory, setCustomPartCategory] = useState<string>('Frenos');
  const [isAddingCustomCategory, setIsAddingCustomCategory] = useState(false);
  const [newCustomCategoryName, setNewCustomCategoryName] = useState('');
  const [customPartBrand, setCustomPartBrand] = useState('');
  const [customPartCompatibility, setCustomPartCompatibility] = useState('');
  const [customPartLocation, setCustomPartLocation] = useState('');
  const [customPartQty, setCustomPartQty] = useState('1');
  const [customPartCostOrigin, setCustomPartCostOrigin] = useState<ProductCostOrigin>('DIVISAS');
  const [customPartCost, setCustomPartCost] = useState('');
  const [customPartCostBs, setCustomPartCostBs] = useState('');
  const [customPartSalePrice, setCustomPartSalePrice] = useState('');
  const [customPartSalePriceRefUSD, setCustomPartSalePriceRefUSD] = useState('');
  const [customPartSalePriceBs, setCustomPartSalePriceBs] = useState('');
  const [customPartTargetPct, setCustomPartTargetPct] = useState('30');
  const [customPartMinStock, setCustomPartMinStock] = useState('2');
  const [customPartDescription, setCustomPartDescription] = useState('');
  const [customPartImageUrl, setCustomPartImageUrl] = useState('');
  const [customPartError, setCustomPartError] = useState<string | null>(null);
  const [expandedItemIdx, setExpandedItemIdx] = useState<number | null>(null);
  const [isImportExcelModalOpen, setIsImportExcelModalOpen] = useState(false);

  // Inline quick supplier creation inside Order Modal
  const [showQuickSupplierForm, setShowQuickSupplierForm] = useState(false);
  const [qSupCode, setQSupCode] = useState('');
  const [qSupName, setQSupName] = useState('');
  const [qSupVendorName, setQSupVendorName] = useState('');
  const [qSupVendorPhone, setQSupVendorPhone] = useState('');

  // Abono / Payment Modal State
  const [paymentModalOrder, setPaymentModalOrder] = useState<PurchaseOrder | null>(null);
  const [abonoAmountUSD, setAbonoAmountUSD] = useState<string>('');
  const [abonoCurrency, setAbonoCurrency] = useState<PurchasePaymentCurrency>('DIVISAS');
  const [abonoMethod, setAbonoMethod] = useState<string>('Divisas ($ Efectivo)');
  const [abonoReference, setAbonoReference] = useState<string>('');
  const [abonoNotes, setAbonoNotes] = useState<string>('');
  const [abonoNotifyVendor, setAbonoNotifyVendor] = useState<boolean>(true);
  const [abonoError, setAbonoError] = useState<string | null>(null);

  // Mark Received Modal State
  const [receiveModalOrder, setReceiveModalOrder] = useState<PurchaseOrder | null>(null);
  const [receiveModalDate, setReceiveModalDate] = useState<string>(
    new Date().toISOString().split('T')[0]
  );
  const [receiveModalApplyStock, setReceiveModalApplyStock] = useState<boolean>(true);

  // Detail / Payment History Modal State
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null);

  // Confirm Delete Modal
  const [confirmDelete, setConfirmDelete] = useState<
    | { type: 'order'; id: string; label: string }
    | { type: 'supplier'; id: string; label: string }
    | null
  >(null);

  // KPI Metrics
  const kpiStats = useMemo(() => {
    const totalOrderedUSD = purchaseOrders.reduce((s, o) => s + (o.totalUSD || 0), 0);
    const totalPaidUSD = purchaseOrders.reduce((s, o) => s + (o.paidAmountUSD || 0), 0);
    const creditPendingCount = purchaseOrders.filter(
      (o) => Math.max(0, o.totalUSD - (o.paidAmountUSD || 0)) > 0.01
    ).length;

    const todayStr = new Date().toISOString().split('T')[0];
    const overdueCount = purchaseOrders.filter((o) => {
      const rem = Math.max(0, o.totalUSD - (o.paidAmountUSD || 0));
      return rem > 0.01 && o.paymentType === 'CREDITO' && o.creditDueDate && o.creditDueDate < todayStr;
    }).length;

    return {
      totalOrderedUSD,
      totalPaidUSD,
      creditPendingCount,
      overdueCount,
    };
  }, [purchaseOrders]);

  // Alphabetical inventory list for adding parts to purchase order
  const filteredInventoryProducts = useMemo(() => {
    const q = partSearch.trim().toLowerCase();
    const sorted = [...products].sort((a, b) =>
      a.name.localeCompare(b.name, 'es', { sensitivity: 'base', numeric: true })
    );
    if (!q) return sorted.slice(0, 12);
    return sorted
      .filter(
        (p) =>
          p.name.toLowerCase().includes(q) ||
          (p.sku || '').toLowerCase().includes(q) ||
          (p.brand || '').toLowerCase().includes(q) ||
          (p.category || '').toLowerCase().includes(q)
      )
      .slice(0, 20);
  }, [products, partSearch]);

  // Filtered purchase orders
  const filteredOrders = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return purchaseOrders.filter((po) => {
      if (supplierFilterId !== 'ALL' && po.supplierId !== supplierFilterId) return false;

      const remaining = Math.max(0, po.totalUSD - (po.paidAmountUSD || 0));
      if (filterMode === 'POR_PAGAR' && remaining <= 0.01) return false;
      if (filterMode === 'PAGADAS' && remaining > 0.01) return false;
      if (filterMode === 'POR_RECIBIR' && po.receivedStatus !== 'PENDIENTE') return false;
      if (filterMode === 'RECIBIDAS' && po.receivedStatus !== 'RECIBIDA') return false;
      if (filterMode === 'CREDITO' && po.paymentType !== 'CREDITO') return false;
      if (filterMode === 'CONTADO' && po.paymentType !== 'CONTADO') return false;
      if (filterMode === 'DIVISAS' && (po.paymentCurrencyCondition || 'DIVISAS') !== 'DIVISAS') return false;
      if (filterMode === 'BS_BCV' && po.paymentCurrencyCondition !== 'BS_BCV') return false;

      if (!q) return true;
      const inItems = po.items.some(
        (it) =>
          it.name.toLowerCase().includes(q) || (it.sku || '').toLowerCase().includes(q)
      );
      return (
        po.orderNumber.toLowerCase().includes(q) ||
        (po.supplierInvoiceNumber || '').toLowerCase().includes(q) ||
        po.supplierCode.toLowerCase().includes(q) ||
        po.supplierName.toLowerCase().includes(q) ||
        po.vendorName.toLowerCase().includes(q) ||
        po.vendorPhone.toLowerCase().includes(q) ||
        inItems
      );
    });
  }, [purchaseOrders, searchTerm, filterMode, supplierFilterId]);

  // Filtered suppliers
  const filteredSuppliers = useMemo(() => {
    const q = supplierSearchTerm.trim().toLowerCase();
    if (!q) return suppliers;
    return suppliers.filter(
      (s) =>
        s.code.toLowerCase().includes(q) ||
        s.name.toLowerCase().includes(q) ||
        s.vendorName.toLowerCase().includes(q) ||
        s.vendorPhone.toLowerCase().includes(q) ||
        (s.rif || '').toLowerCase().includes(q)
    );
  }, [suppliers, supplierSearchTerm]);

  const computeSuggestedDueDate = (days: number): string => {
    const d = new Date();
    d.setDate(d.getDate() + Math.max(1, days || 15));
    return d.toISOString().split('T')[0];
  };

  const suggestNextSupplierCode = (): string => {
    let maxNum = suppliers.length;
    suppliers.forEach((s) => {
      const m = (s.code || '').match(/(\d+)$/);
      if (m) {
        const parsed = parseInt(m[1], 10);
        if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
      }
    });
    return `PROV-${String(maxNum + 1).padStart(3, '0')}`;
  };

  // --- SUPPLIER MODAL HANDLERS ---
  const openNewSupplierModal = () => {
    setEditingSupplier(null);
    setSupCode(suggestNextSupplierCode());
    setSupName('');
    setSupRif('');
    setSupVendorName('');
    setSupVendorPhone('');
    setSupEmail('');
    setSupAddress('');
    setSupNotes('');
    setSupError(null);
    setIsSupplierModalOpen(true);
  };

  const openEditSupplierModal = (sup: Supplier) => {
    setEditingSupplier(sup);
    setSupCode(sup.code);
    setSupName(sup.name);
    setSupRif(sup.rif || '');
    setSupVendorName(sup.vendorName);
    setSupVendorPhone(sup.vendorPhone);
    setSupEmail(sup.email || '');
    setSupAddress(sup.address || '');
    setSupNotes(sup.notes || '');
    setSupError(null);
    setIsSupplierModalOpen(true);
  };

  const handleSaveSupplier = (e: React.FormEvent) => {
    e.preventDefault();
    setSupError(null);
    const trimmedCode = supCode.trim().toUpperCase();
    const trimmedName = supName.trim();
    const trimmedVendor = supVendorName.trim();
    const trimmedPhone = supVendorPhone.trim();

    if (!trimmedCode || !trimmedName || !trimmedVendor || !trimmedPhone) {
      setSupError('Código, Nombre del proveedor, Vendedor y Teléfono del vendedor son obligatorios.');
      return;
    }

    const duplicateCode = suppliers.find(
      (s) => s.code.trim().toUpperCase() === trimmedCode && s.id !== editingSupplier?.id
    );
    if (duplicateCode) {
      setSupError(`Ya existe un proveedor con el código ${trimmedCode} (${duplicateCode.name}).`);
      return;
    }

    if (editingSupplier) {
      updateSupplier(editingSupplier.id, {
        code: trimmedCode,
        name: trimmedName,
        rif: supRif.trim() || undefined,
        vendorName: trimmedVendor,
        vendorPhone: trimmedPhone,
        email: supEmail.trim() || undefined,
        address: supAddress.trim() || undefined,
        notes: supNotes.trim() || undefined,
      });
    } else {
      addSupplier({
        code: trimmedCode,
        name: trimmedName,
        rif: supRif.trim() || undefined,
        vendorName: trimmedVendor,
        vendorPhone: trimmedPhone,
        email: supEmail.trim() || undefined,
        address: supAddress.trim() || undefined,
        notes: supNotes.trim() || undefined,
      });
    }
    setIsSupplierModalOpen(false);
  };

  // --- ORDER MODAL HANDLERS ---
  const openNewOrderModal = (preselectedSupplierId?: string) => {
    setEditingOrder(null);
    setOrdOrderNumber('');
    setOrdCreatedDate(new Date().toISOString().split('T')[0]);
    setOrdBcvRate(String(settings.bcvRate || 1));
    setOrdSupplierId(preselectedSupplierId || suppliers[0]?.id || '');
    setOrdSupplierInvoice('');
    setOrdItems([]);
    setOrdPaymentType('CREDITO');
    setOrdCurrencyCondition('DIVISAS');
    setOrdCreditDays(15);
    setOrdCreditDueDate(computeSuggestedDueDate(15));
    setOrdReceivedStatus('PENDIENTE');
    setOrdReceivedDate(new Date().toISOString().split('T')[0]);
    setOrdApplyStock(true);
    setOrdSyncInventoryDelta(true);
    setOrdPaymentOption('PENDIENTE');
    setOrdInitialPaidUSD('');
    setOrdPayCurrency('DIVISAS');
    setOrdPayMethod('Divisas ($ Efectivo)');
    setOrdPayReference('');
    setOrdPayments([]);
    setOrdNotes('');
    setOrdNotifyVendorOnSave(true);
    setOrdError(null);
    setPartSearch('');
    setShowCustomPartForm(false);
    setCustomPartError(null);
    setExpandedItemIdx(null);
    setIsAddingCustomCategory(false);
    setNewCustomCategoryName('');
    setIsImportExcelModalOpen(false);
    setShowQuickSupplierForm(suppliers.length === 0);
    setQSupCode(suggestNextSupplierCode());
    setQSupName('');
    setQSupVendorName('');
    setQSupVendorPhone('');
    setIsOrderModalOpen(true);
  };

  const openEditOrderModal = (po: PurchaseOrder) => {
    setEditingOrder(po);
    setOrdOrderNumber(po.orderNumber || '');
    setOrdCreatedDate(
      po.createdAt ? po.createdAt.split('T')[0] : new Date().toISOString().split('T')[0]
    );
    setOrdBcvRate(String(po.bcvRate || settings.bcvRate || 1));
    setOrdSupplierId(po.supplierId);
    setOrdSupplierInvoice(po.supplierInvoiceNumber || '');
    setOrdItems(po.items.map((it) => ({ ...it })));
    setOrdPaymentType(po.paymentType);
    setOrdCurrencyCondition(po.paymentCurrencyCondition || 'DIVISAS');
    setOrdCreditDays(po.creditDays || 15);
    setOrdCreditDueDate(po.creditDueDate || computeSuggestedDueDate(po.creditDays || 15));
    setOrdReceivedStatus(po.receivedStatus);
    setOrdReceivedDate(po.receivedDate || new Date().toISOString().split('T')[0]);
    setOrdApplyStock(!po.stockApplied);
    setOrdSyncInventoryDelta(true);
    setOrdPaymentOption(
      po.paymentStatus === 'PAGADO'
        ? 'PAGADO'
        : po.paymentStatus === 'PARCIAL'
        ? 'ABONO'
        : 'PENDIENTE'
    );
    setOrdInitialPaidUSD(po.paidAmountUSD ? String(po.paidAmountUSD) : '');
    setOrdPayCurrency(po.initialPaymentCurrency || 'DIVISAS');
    setOrdPayMethod(po.initialPaymentMethod || 'Divisas ($ Efectivo)');
    setOrdPayReference('');
    setOrdPayments((po.payments || []).map((p) => ({ ...p })));
    setOrdNotes(po.notes || '');
    setOrdNotifyVendorOnSave(false);
    setOrdError(null);
    setPartSearch('');
    setShowCustomPartForm(false);
    setCustomPartError(null);
    setExpandedItemIdx(null);
    setIsAddingCustomCategory(false);
    setNewCustomCategoryName('');
    setIsImportExcelModalOpen(false);
    setShowQuickSupplierForm(false);
    setIsOrderModalOpen(true);
  };

  const handleAddEditPayment = (prefillAmountUSD?: number) => {
    const rateNum = Math.max(0.01, parseFloat(ordBcvRate) || bcvRate || 1);
    const currentPaid = ordPayments.reduce((s, p) => s + (Number(p.amountUSD) || 0), 0);
    const remaining = Math.max(0, Math.round((ordTotalUSD - currentPaid) * 100) / 100);
    const amount =
      prefillAmountUSD !== undefined
        ? Math.round(Math.max(0, prefillAmountUSD) * 100) / 100
        : remaining > 0
        ? remaining
        : 0;
    const defaultIsBs = ordCurrencyCondition === 'BS_BCV';
    const currencyCategory: PurchasePaymentCurrency = defaultIsBs ? 'BS' : 'DIVISAS';
    const paymentMethod = defaultIsBs ? 'Bolívares (Pago Móvil)' : 'Divisas ($ Efectivo)';
    setOrdPayments((prev) => [
      ...prev,
      {
        id: `popay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        date: new Date().toISOString(),
        amountUSD: amount,
        amountBs: Math.round(amount * rateNum * 100) / 100,
        bcvRate: rateNum,
        currencyCategory,
        paymentMethod,
        reference: '',
        notes: amount >= remaining - 0.01 && remaining > 0 ? 'Pago total de orden' : 'Abono editado',
      },
    ]);
  };

  const handleUpdateEditPayment = (
    idx: number,
    patch: Partial<PurchasePaymentRecord>
  ) => {
    const fallbackRate = Math.max(0.01, parseFloat(ordBcvRate) || bcvRate || 1);
    setOrdPayments((prev) =>
      prev.map((p, i) => {
        if (i !== idx) return p;
        const next: PurchasePaymentRecord = { ...p, ...patch };
        const nextAmount = Math.max(0, Number(next.amountUSD) || 0);
        const nextRate = Number(next.bcvRate) > 0 ? Number(next.bcvRate) : fallbackRate;
        next.amountUSD = nextAmount;
        next.bcvRate = nextRate;
        next.amountBs = Math.round(nextAmount * nextRate * 100) / 100;
        return next;
      })
    );
  };

  const handleRemoveEditPayment = (idx: number) => {
    setOrdPayments((prev) => prev.filter((_, i) => i !== idx));
  };

  const handleExcelOrderImported = ({
    items,
    headerMetadata,
    applyHeaderMetadata,
    mode,
  }: {
    items: ParsedPOExcelItem[];
    headerMetadata: ParsedPOHeaderMetadata | null;
    applyHeaderMetadata: boolean;
    mode: 'append' | 'replace';
  }) => {
    // Register any custom categories brought from Excel so dropdowns reflect them immediately
    items.forEach((it) => {
      if (it.category && it.category.trim()) {
        addCategory(it.category.trim());
      }
    });

    const cleanItems: PurchaseOrderItem[] = items.map(
      ({ rowNumber: _rowNumber, matchStatus: _matchStatus, ...item }) => ({
        ...item,
      })
    );

    if (mode === 'replace') {
      setOrdItems(cleanItems);
    } else {
      setOrdItems((prev) => {
        const next = [...prev];
        cleanItems.forEach((incoming) => {
          const matchIdx = next.findIndex(
            (existing) =>
              (incoming.productId && existing.productId === incoming.productId) ||
              (incoming.sku &&
                existing.sku &&
                existing.sku.trim().toUpperCase() === incoming.sku.trim().toUpperCase())
          );
          if (matchIdx >= 0) {
            const existing = next[matchIdx];
            const nextQty = existing.quantity + incoming.quantity;
            const nextCost =
              incoming.unitCostUSD >= 0 ? incoming.unitCostUSD : existing.unitCostUSD;
            next[matchIdx] = {
              ...existing,
              quantity: nextQty,
              unitCostUSD: nextCost,
              salePriceUSD:
                incoming.salePriceUSD && incoming.salePriceUSD > 0
                  ? incoming.salePriceUSD
                  : existing.salePriceUSD,
              totalCostUSD: Math.round(nextQty * nextCost * 100) / 100,
            };
          } else {
            next.push(incoming);
          }
        });
        return next;
      });
    }

    if (applyHeaderMetadata && headerMetadata) {
      if (headerMetadata.supplierId) {
        setOrdSupplierId(headerMetadata.supplierId);
      }
      if (headerMetadata.supplierInvoiceNumber) {
        setOrdSupplierInvoice(headerMetadata.supplierInvoiceNumber);
      }
      if (headerMetadata.paymentType) {
        setOrdPaymentType(headerMetadata.paymentType);
        if (!editingOrder) {
          setOrdPaymentOption(headerMetadata.paymentType === 'CONTADO' ? 'PAGADO' : 'PENDIENTE');
        }
      }
      if (headerMetadata.paymentCurrencyCondition) {
        setOrdCurrencyCondition(headerMetadata.paymentCurrencyCondition);
        if (!editingOrder) {
          if (headerMetadata.paymentCurrencyCondition === 'BS_BCV') {
            setOrdPayCurrency('BS');
            setOrdPayMethod('Bolívares (Pago Móvil)');
          } else {
            setOrdPayCurrency('DIVISAS');
            setOrdPayMethod('Divisas ($ Efectivo)');
          }
        }
      }
      if (headerMetadata.creditDays && headerMetadata.creditDays > 0) {
        setOrdCreditDays(headerMetadata.creditDays);
        setOrdCreditDueDate(computeSuggestedDueDate(headerMetadata.creditDays));
      }
      if (headerMetadata.receivedStatus) {
        setOrdReceivedStatus(headerMetadata.receivedStatus);
      }
      if (headerMetadata.receivedDate) {
        setOrdReceivedDate(headerMetadata.receivedDate);
      }
      if (headerMetadata.notes) {
        setOrdNotes(headerMetadata.notes);
      }
    }

    setOrdError(null);
    setExpandedItemIdx(null);
  };

  const handleAddInventoryProductToOrder = (prod: (typeof products)[number]) => {
    setOrdItems((prev) => {
      const idx = prev.findIndex((it) => it.productId === prod.id);
      if (idx >= 0) {
        return prev.map((it, i) => {
          if (i !== idx) return it;
          const nextQty = it.quantity + 1;
          return {
            ...it,
            quantity: nextQty,
            totalCostUSD: Math.round(nextQty * it.unitCostUSD * 100) / 100,
          };
        });
      }
      const pricing = calculateProductPricing(prod, bcvRate, usdtRate);
      const unitCost = Number(prod.costPrice) || 0;
      return [
        ...prev,
        {
          id: `poi-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
          productId: prod.id,
          sku: prod.sku,
          barcode: prod.barcode || '',
          name: prod.name,
          category: String(prod.category),
          description: prod.description || '',
          brand: prod.brand || '',
          compatibility: prod.compatibility || '',
          warehouseLocation: prod.warehouseLocation || '',
          imageUrl: prod.imageUrl || '',
          quantity: 1,
          unitCostUSD: unitCost,
          costCurrencyOrigin: pricing.costOrigin,
          costPriceBs: pricing.costBs,
          referenceCostUSD: pricing.referenceCostUSD,
          salePriceUSD: Number(prod.salePrice) || 0,
          salePriceRefUSD: pricing.salePriceRefUSD,
          salePriceBsBcv: pricing.salePriceBsBcv,
          minStock: prod.minStock ?? 2,
          totalCostUSD: unitCost,
          isNewProduct: false,
        },
      ];
    });
  };

  const resetCustomPartForm = () => {
    setCustomPartName('');
    setCustomPartSku('');
    setCustomPartBarcode('');
    setCustomPartCategory(categories[0] || 'Frenos');
    setIsAddingCustomCategory(false);
    setNewCustomCategoryName('');
    setCustomPartBrand('');
    setCustomPartCompatibility('');
    setCustomPartLocation('');
    setCustomPartQty('1');
    setCustomPartCostOrigin(ordCurrencyCondition === 'BS_BCV' ? 'BS_BCV' : 'DIVISAS');
    setCustomPartCost('');
    setCustomPartCostBs('');
    setCustomPartSalePrice('');
    setCustomPartSalePriceRefUSD('');
    setCustomPartSalePriceBs('');
    setCustomPartTargetPct('30');
    setCustomPartMinStock('2');
    setCustomPartDescription('');
    setCustomPartImageUrl('');
    setCustomPartError(null);
  };

  const handleCustomPartImageUpload = async (
    e: React.ChangeEvent<HTMLInputElement>,
    targetItemIdx?: number
  ) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    try {
      const compressed = await compressImageFileToDataUrl(file, 720, 0.82);
      if (targetItemIdx !== undefined) {
        setOrdItems((prev) =>
          prev.map((it, i) => (i === targetItemIdx ? { ...it, imageUrl: compressed } : it))
        );
      } else {
        setCustomPartImageUrl(compressed);
      }
    } catch {
      // Ignore upload error silently
    }
  };

  const customPartPricing = useMemo(() => {
    const activeBcv = parseFloat(ordBcvRate) > 0 ? parseFloat(ordBcvRate) : bcvRate;
    const costNum = Math.max(0, parseFloat(customPartCost) || 0);
    const costBsNum = Math.max(0, parseFloat(customPartCostBs) || 0);
    const costCalc = calculateReferenceCostUSD({
      origin: customPartCostOrigin,
      costUSD: costNum,
      costBs: customPartCostOrigin === 'BS_BCV' && costBsNum > 0 ? costBsNum : undefined,
      bcvRate: activeBcv,
      usdtRate,
    });
    const saleUsdBcv = Math.max(0, parseFloat(customPartSalePrice) || 0);
    const saleRefUsd = Math.max(0, parseFloat(customPartSalePriceRefUSD) || 0);
    const saleBsBcv =
      Math.max(0, parseFloat(customPartSalePriceBs) || 0) || round2(saleUsdBcv * activeBcv);

    const analysis = calculateProductPricing(
      {
        costPrice: costCalc.costOrigin === 'BS_BCV' ? costCalc.costUsdAtBcv : costCalc.referenceCostUSD,
        costCurrencyOrigin: customPartCostOrigin,
        costPriceBs: costCalc.costBs,
        referenceCostUSD: costCalc.referenceCostUSD,
        salePrice: saleUsdBcv,
        salePriceRefUSD: saleRefUsd > 0 ? saleRefUsd : undefined,
        salePriceBsBcv: saleBsBcv,
      },
      activeBcv,
      usdtRate
    );
    return { activeBcv, costCalc, analysis };
  }, [
    ordBcvRate,
    bcvRate,
    usdtRate,
    customPartCostOrigin,
    customPartCost,
    customPartCostBs,
    customPartSalePrice,
    customPartSalePriceRefUSD,
    customPartSalePriceBs,
  ]);

  const handleApplyCustomPartTargetProfit = () => {
    const pct = parseFloat(customPartTargetPct);
    if (isNaN(pct) || pct < 0 || customPartPricing.costCalc.referenceCostUSD <= 0) return;
    const suggested = suggestPriceFromTargetProfit({
      referenceCostUSD: customPartPricing.costCalc.referenceCostUSD,
      targetPct: pct,
      mode: 'margin',
      bcvRate: customPartPricing.activeBcv,
      usdtRate,
    });
    setCustomPartSalePriceRefUSD(suggested.salePriceRefUSD.toFixed(2));
    setCustomPartSalePriceBs(suggested.salePriceBsBcv.toFixed(2));
    setCustomPartSalePrice(suggested.salePriceUsdBcv.toFixed(2));
  };

  const handleAddCustomPartToOrder = () => {
    setCustomPartError(null);
    const name = customPartName.trim();
    if (!name) {
      setCustomPartError('Ingresa el nombre del repuesto.');
      return;
    }
    const qty = Math.max(1, parseInt(customPartQty, 10) || 1);
    const activeBcv = customPartPricing.activeBcv;
    const costCalc = customPartPricing.costCalc;
    const cost =
      customPartCostOrigin === 'BS_BCV' ? costCalc.costUsdAtBcv : costCalc.referenceCostUSD;
    const salePrice = parseFloat(customPartSalePrice);
    if (isNaN(salePrice) || salePrice <= 0) {
      setCustomPartError('Ingresa el Precio de Venta (Bs BCV o $ BCV) para registrarlo en el inventario.');
      return;
    }

    let finalCategory = customPartCategory || categories[0] || 'Accesorios';
    if (isAddingCustomCategory && newCustomCategoryName.trim()) {
      const res = addCategory(newCustomCategoryName.trim());
      finalCategory = res.category;
    }

    const rawSku = customPartSku.trim().toUpperCase();
    const finalSku =
      rawSku || `REP-${String(Date.now()).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`;

    const minStockNum = Math.max(0, parseInt(customPartMinStock, 10) || 2);
    const saleBsBcv = round2(salePrice * activeBcv);
    const parsedRefUsd = parseFloat(customPartSalePriceRefUSD);
    const finalSaleRefUsd =
      !isNaN(parsedRefUsd) && parsedRefUsd > 0
        ? round2(parsedRefUsd)
        : usdtRate > 0
        ? round2(saleBsBcv / usdtRate)
        : round2(salePrice);

    setOrdItems((prev) => [
      ...prev,
      {
        id: `poi-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        sku: finalSku,
        barcode: customPartBarcode.trim() || undefined,
        name,
        category: finalCategory,
        description: customPartDescription.trim() || '',
        brand: customPartBrand.trim() || 'Genérico',
        compatibility: customPartCompatibility.trim() || 'Universal',
        warehouseLocation: customPartLocation.trim() || undefined,
        imageUrl: normalizeImageUrl(customPartImageUrl) || undefined,
        quantity: qty,
        unitCostUSD: round2(cost),
        costCurrencyOrigin: customPartCostOrigin,
        costPriceBs: costCalc.costBs,
        referenceCostUSD: costCalc.referenceCostUSD,
        salePriceUSD: round4(salePrice),
        salePriceRefUSD: finalSaleRefUsd,
        salePriceBsBcv: saleBsBcv,
        minStock: minStockNum,
        totalCostUSD: round2(qty * cost),
        isNewProduct: true,
      },
    ]);
    resetCustomPartForm();
    setShowCustomPartForm(false);
  };

  const handleUpdateOrderItem = (
    idx: number,
    field:
      | 'quantity'
      | 'unitCostUSD'
      | 'costCurrencyOrigin'
      | 'costPriceBs'
      | 'salePriceUSD'
      | 'salePriceRefUSD'
      | 'salePriceBsBcv'
      | 'name'
      | 'sku'
      | 'barcode'
      | 'category'
      | 'brand'
      | 'compatibility'
      | 'warehouseLocation'
      | 'minStock'
      | 'description',
    rawValue: string
  ) => {
    const activeBcv = parseFloat(ordBcvRate) > 0 ? parseFloat(ordBcvRate) : bcvRate;
    setOrdItems((prev) =>
      prev.map((it, i) => {
        if (i !== idx) return it;
        const currentOrigin: ProductCostOrigin =
          it.costCurrencyOrigin === 'BS_BCV' ? 'BS_BCV' : 'DIVISAS';

        if (field === 'costCurrencyOrigin') {
          const nextOrigin: ProductCostOrigin = rawValue === 'BS_BCV' ? 'BS_BCV' : 'DIVISAS';
          const costCalc = calculateReferenceCostUSD({
            origin: nextOrigin,
            costUSD: it.unitCostUSD,
            costBs: nextOrigin === 'BS_BCV' ? round2((it.unitCostUSD || 0) * activeBcv) : undefined,
            bcvRate: activeBcv,
            usdtRate,
          });
          return {
            ...it,
            costCurrencyOrigin: nextOrigin,
            costPriceBs: costCalc.costBs,
            referenceCostUSD: costCalc.referenceCostUSD,
          };
        }

        if (field === 'costPriceBs') {
          const bsVal = Math.max(0, parseFloat(rawValue) || 0);
          const costCalc = calculateReferenceCostUSD({
            origin: 'BS_BCV',
            costBs: bsVal,
            bcvRate: activeBcv,
            usdtRate,
          });
          return {
            ...it,
            costCurrencyOrigin: 'BS_BCV',
            costPriceBs: bsVal,
            unitCostUSD: costCalc.costUsdAtBcv,
            referenceCostUSD: costCalc.referenceCostUSD,
            totalCostUSD: round2(it.quantity * costCalc.costUsdAtBcv),
          };
        }

        if (field === 'quantity' || field === 'unitCostUSD') {
          const num = parseFloat(rawValue);
          const qty = field === 'quantity' ? Math.max(1, Math.round(num || 1)) : it.quantity;
          const cost = field === 'unitCostUSD' ? Math.max(0, num || 0) : it.unitCostUSD;
          const costCalc = calculateReferenceCostUSD({
            origin: currentOrigin,
            costUSD: cost,
            bcvRate: activeBcv,
            usdtRate,
          });
          return {
            ...it,
            quantity: qty,
            unitCostUSD: cost,
            costPriceBs: costCalc.costBs,
            referenceCostUSD: costCalc.referenceCostUSD,
            totalCostUSD: round2(qty * cost),
          };
        }

        if (field === 'salePriceRefUSD') {
          const refUsd = Math.max(0, parseFloat(rawValue) || 0);
          const nextBs = round2(refUsd * usdtRate);
          const nextUsdBcv = activeBcv > 0 ? round4(nextBs / activeBcv) : refUsd;
          return {
            ...it,
            salePriceRefUSD: refUsd,
            salePriceBsBcv: nextBs,
            salePriceUSD: nextUsdBcv,
          };
        }

        if (field === 'salePriceBsBcv') {
          const bsVal = Math.max(0, parseFloat(rawValue) || 0);
          const nextUsdBcv = activeBcv > 0 ? round4(bsVal / activeBcv) : 0;
          const nextRefUsd = usdtRate > 0 ? round2(bsVal / usdtRate) : nextUsdBcv;
          return {
            ...it,
            salePriceBsBcv: bsVal,
            salePriceUSD: nextUsdBcv,
            salePriceRefUSD: nextRefUsd,
          };
        }

        if (field === 'salePriceUSD') {
          const num = parseFloat(rawValue);
          const usdBcv = isNaN(num) ? 0 : Math.max(0, num);
          const nextBs = round2(usdBcv * activeBcv);
          const nextRefUsd = usdtRate > 0 ? round2(nextBs / usdtRate) : usdBcv;
          return {
            ...it,
            salePriceUSD: usdBcv,
            salePriceBsBcv: nextBs,
            salePriceRefUSD: nextRefUsd,
          };
        }
        if (field === 'minStock') {
          const num = parseInt(rawValue, 10);
          return {
            ...it,
            minStock: isNaN(num) ? 0 : Math.max(0, num),
          };
        }
        return {
          ...it,
          [field]: rawValue,
        };
      })
    );
  };

  const handleQuickCreateSupplier = () => {
    const code = qSupCode.trim().toUpperCase() || suggestNextSupplierCode();
    const name = qSupName.trim();
    const vendorName = qSupVendorName.trim();
    const vendorPhone = qSupVendorPhone.trim();
    if (!name || !vendorName || !vendorPhone) {
      setOrdError('Para guardar el proveedor rápido ingresa Empresa, Vendedor y Teléfono.');
      return;
    }
    const created = addSupplier({ code, name, vendorName, vendorPhone });
    setOrdSupplierId(created.id);
    setShowQuickSupplierForm(false);
    setOrdError(null);
  };

  const ordTotalUSD = useMemo(
    () =>
      Math.round(
        ordItems.reduce((sum, it) => sum + (Number(it.totalCostUSD) || 0), 0) * 100
      ) / 100,
    [ordItems]
  );

  const handleSaveOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setOrdError(null);

    if (!ordSupplierId) {
      setOrdError('Debes seleccionar o agregar un proveedor.');
      return;
    }
    if (ordItems.length === 0) {
      setOrdError('Agrega al menos un repuesto a la orden de compra.');
      return;
    }
    if (ordApplyStock && (!editingOrder || !editingOrder.stockApplied)) {
      const missingSalePrice = ordItems.find(
        (it) => it.salePriceUSD === undefined || Number(it.salePriceUSD) <= 0
      );
      if (missingSalePrice) {
        setOrdError(
          `Ingresa un Precio de Venta ($ USD) mayor a $0.00 para "${missingSalePrice.name}" antes de ingresarlo al inventario.`
        );
        return;
      }
    }

    const paidAmount =
      ordPaymentOption === 'PAGADO'
        ? ordTotalUSD
        : ordPaymentOption === 'ABONO'
        ? Math.min(ordTotalUSD, Math.max(0, parseFloat(ordInitialPaidUSD) || 0))
        : 0;

    if (editingOrder) {
      const parsedBcv = parseFloat(ordBcvRate);
      const nextBcvRate = !isNaN(parsedBcv) && parsedBcv > 0 ? parsedBcv : editingOrder.bcvRate || bcvRate;
      const originalDatePart = editingOrder.createdAt ? editingOrder.createdAt.split('T')[0] : '';
      const nextCreatedAt =
        ordCreatedDate && ordCreatedDate !== originalDatePart
          ? `${ordCreatedDate}T12:00:00.000Z`
          : editingOrder.createdAt;

      const updated = updatePurchaseOrder(editingOrder.id, {
        orderNumber: ordOrderNumber.trim() || editingOrder.orderNumber,
        createdAt: nextCreatedAt,
        bcvRate: nextBcvRate,
        supplierId: ordSupplierId,
        supplierInvoiceNumber: ordSupplierInvoice.trim() || undefined,
        items: ordItems,
        paymentType: ordPaymentType,
        paymentCurrencyCondition: ordCurrencyCondition,
        creditDays: ordPaymentType === 'CREDITO' ? ordCreditDays : undefined,
        creditDueDate: ordPaymentType === 'CREDITO' ? ordCreditDueDate : undefined,
        receivedStatus: ordReceivedStatus,
        receivedDate: ordReceivedStatus === 'RECIBIDA' ? ordReceivedDate : undefined,
        applyStockToInventory: ordApplyStock,
        syncInventoryDelta: ordSyncInventoryDelta,
        payments: ordPayments,
        initialPaymentCurrency: ordPayCurrency,
        initialPaymentMethod: ordPayMethod,
        notes: ordNotes.trim() || undefined,
      });
      setIsOrderModalOpen(false);
      if (updated) {
        if (detailOrder?.id === updated.id) {
          setDetailOrder(updated);
        }
        setSaveFeedback(
          `Orden #${updated.orderNumber} actualizada correctamente${
            editingOrder.stockApplied && ordSyncInventoryDelta
              ? ' (inventario sincronizado)'
              : ''
          }.`
        );
        window.setTimeout(() => setSaveFeedback(null), 4500);
        if (ordNotifyVendorOnSave) {
          triggerWhatsAppDebtNotification(updated);
        }
      }
      return;
    }

    const created = createPurchaseOrder({
      supplierId: ordSupplierId,
      supplierInvoiceNumber: ordSupplierInvoice.trim() || undefined,
      items: ordItems,
      paymentType: ordPaymentType,
      paymentCurrencyCondition: ordCurrencyCondition,
      creditDays: ordPaymentType === 'CREDITO' ? ordCreditDays : undefined,
      creditDueDate: ordPaymentType === 'CREDITO' ? ordCreditDueDate : undefined,
      isPaidImmediately: ordPaymentOption === 'PAGADO',
      initialPaidUSD: paidAmount,
      initialPaymentCurrency: ordPayCurrency,
      initialPaymentMethod: ordPayMethod,
      initialPaymentReference: ordPayReference.trim() || undefined,
      receivedStatus: ordReceivedStatus,
      receivedDate: ordReceivedStatus === 'RECIBIDA' ? ordReceivedDate : undefined,
      applyStockToInventory: ordApplyStock,
      notes: ordNotes.trim() || undefined,
    });

    setIsOrderModalOpen(false);
    if (created && ordNotifyVendorOnSave) {
      triggerWhatsAppDebtNotification(created);
    }
  };

  // --- WHATSAPP TRIGGERS ---
  const triggerWhatsAppDebtNotification = (order: PurchaseOrder) => {
    const { message, url } = buildPurchaseOrderDebtWhatsAppMessage(order, settings);
    const remaining = Math.max(0, order.totalUSD - (order.paidAmountUSD || 0));
    setWhatsappModalData({
      title:
        remaining > 0.01
          ? `Enviar Factura / Deuda PDF al Vendedor (#${order.orderNumber})`
          : `Enviar Comprobante de Orden PDF al Vendedor (#${order.orderNumber})`,
      message,
      url,
      phone: order.vendorPhone,
      recipientName: `${order.vendorName} (${order.supplierName})`,
      isSupplier: true,
      purchaseOrder: order,
    });
  };

  // --- ABONO MODAL HANDLERS ---
  const openPaymentModal = (order: PurchaseOrder) => {
    const remaining = Math.max(0, Math.round((order.totalUSD - (order.paidAmountUSD || 0)) * 100) / 100);
    const defaultIsBs = order.paymentCurrencyCondition === 'BS_BCV';
    setPaymentModalOrder(order);
    setAbonoAmountUSD(remaining > 0 ? remaining.toFixed(2) : '');
    setAbonoCurrency(defaultIsBs ? 'BS' : 'DIVISAS');
    setAbonoMethod(defaultIsBs ? 'Bolívares (Pago Móvil)' : 'Divisas ($ Efectivo)');
    setAbonoReference('');
    setAbonoNotes('');
    setAbonoNotifyVendor(true);
    setAbonoError(null);
  };

  const handleConfirmAbono = (e: React.FormEvent) => {
    e.preventDefault();
    if (!paymentModalOrder) return;
    setAbonoError(null);

    const amount = parseFloat(abonoAmountUSD);
    if (isNaN(amount) || amount <= 0) {
      setAbonoError('Ingresa un monto de abono válido mayor a $0.00.');
      return;
    }

    const res = recordPurchaseOrderPayment(paymentModalOrder.id, {
      amountUSD: amount,
      currencyCategory: abonoCurrency,
      paymentMethod: abonoMethod,
      reference: abonoReference.trim() || undefined,
      notes: abonoNotes.trim() || undefined,
    });

    if (!res) {
      setAbonoError('No se pudo registrar el abono.');
      return;
    }

    setPaymentModalOrder(null);
    if (detailOrder?.id === res.updatedOrder.id) {
      setDetailOrder(res.updatedOrder);
    }

    if (abonoNotifyVendor) {
      const { message, url } = buildPurchaseOrderPaymentWhatsAppMessage(
        res.updatedOrder,
        res.paymentRecord,
        settings,
        res.totalSupplierDebtAfterUSD
      );
      setWhatsappModalData({
        title: `Notificar Abono al Vendedor (#${res.updatedOrder.orderNumber})`,
        message,
        url,
        phone: res.updatedOrder.vendorPhone,
        recipientName: `${res.updatedOrder.vendorName} (${res.updatedOrder.supplierName})`,
        isSupplier: true,
        purchaseOrder: res.updatedOrder,
      });
    }
  };

  // --- RECEIVE MERCHANDISE HANDLER ---
  const openReceiveModal = (order: PurchaseOrder) => {
    setReceiveModalOrder(order);
    setReceiveModalDate(new Date().toISOString().split('T')[0]);
    setReceiveModalApplyStock(!order.stockApplied);
  };

  const handleConfirmReceive = () => {
    if (!receiveModalOrder) return;
    const updated = markPurchaseOrderReceived(
      receiveModalOrder.id,
      receiveModalDate,
      receiveModalApplyStock
    );
    setReceiveModalOrder(null);
    if (updated && detailOrder?.id === updated.id) {
      setDetailOrder(updated);
    }
  };

  const renderCurrencyIcon = (cat: PurchasePaymentCurrency) => {
    if (cat === 'DIVISAS') return <Banknote className="w-3.5 h-3.5 text-emerald-600" />;
    if (cat === 'USDT') return <Coins className="w-3.5 h-3.5 text-amber-500" />;
    return <CreditCard className="w-3.5 h-3.5 text-blue-600" />;
  };

  const getDaysUntilDue = (dueDate?: string): { label: string; tone: 'danger' | 'warn' | 'ok' } | null => {
    if (!dueDate) return null;
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(`${dueDate}T00:00:00`);
    const diffDays = Math.round((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
    if (diffDays < 0) return { label: `Vencida hace ${Math.abs(diffDays)}d`, tone: 'danger' };
    if (diffDays === 0) return { label: 'Vence HOY', tone: 'danger' };
    if (diffDays <= 5) return { label: `Vence en ${diffDays}d`, tone: 'warn' };
    return { label: `Vence ${dueDate}`, tone: 'ok' };
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 font-display flex items-center gap-2.5">
            <div className="w-10 h-10 rounded-xl bg-slate-900 text-amber-400 flex items-center justify-center shadow-xs">
              <Truck className="w-5 h-5" />
            </div>
            <span>Órdenes de Compra &amp; Proveedores</span>
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            Registra compras a crédito o de contado, recepción de mercancía, abonos en Divisas / USDT / Bolívares y notifica al vendedor por WhatsApp con PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openNewSupplierModal}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-xs rounded-xl shadow-2xs transition-colors cursor-pointer"
          >
            <Building2 className="w-4 h-4 text-amber-600" />
            <span>+ Nuevo Proveedor</span>
          </button>

          <button
            type="button"
            onClick={() => openNewOrderModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-sm transition-colors cursor-pointer"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Nueva Orden de Compra</span>
          </button>
        </div>
      </div>

      {/* Save confirmation toast banner */}
      {saveFeedback && (
        <div className="bg-emerald-50 border border-emerald-300 text-emerald-900 rounded-xl px-4 py-3 text-xs font-semibold flex items-center justify-between gap-2 shadow-2xs">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span>{saveFeedback}</span>
          </div>
          <button
            type="button"
            onClick={() => setSaveFeedback(null)}
            className="p-1 text-emerald-700 hover:bg-emerald-100 rounded-lg cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Row */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Deuda Total Proveedores</span>
            <DollarSign className="w-4 h-4 text-amber-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {formatUSD(totalSupplierDebtUSD)}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Saldo pendiente en órdenes activas
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Órdenes por Pagar</span>
            <Clock className="w-4 h-4 text-rose-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {kpiStats.creditPendingCount}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            {kpiStats.overdueCount > 0 ? (
              <span className="text-rose-600 font-semibold">
                {kpiStats.overdueCount} vencida(s) por cobrar
              </span>
            ) : (
              <span>Créditos y pagos pendientes</span>
            )}
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Mercancía por Recibir</span>
            <PackageCheck className="w-4 h-4 text-indigo-500" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {pendingReceptionOrdersCount}
          </p>
          <p className="text-xs text-slate-500 mt-0.5">
            Órdenes esperando llegada a taller
          </p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500 uppercase tracking-wider">
            <span>Total Comprado / Pagado</span>
            <Wallet className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold font-mono text-slate-900 mt-2">
            {formatUSD(kpiStats.totalOrderedUSD)}
          </p>
          <p className="text-xs font-mono text-emerald-700 font-semibold mt-0.5">
            Abonado: {formatUSD(kpiStats.totalPaidUSD)}
          </p>
        </div>
      </div>

      {/* Tabs Switcher */}
      <div className="flex items-center gap-2 border-b border-slate-200">
        <button
          type="button"
          onClick={() => setActiveTab('ordenes')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'ordenes'
              ? 'border-amber-500 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Receipt className="w-4 h-4" />
          <span>Órdenes de Compra</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold">
            {purchaseOrders.length}
          </span>
        </button>

        <button
          type="button"
          onClick={() => setActiveTab('proveedores')}
          className={`px-4 py-2.5 text-sm font-semibold border-b-2 transition-colors flex items-center gap-2 cursor-pointer ${
            activeTab === 'proveedores'
              ? 'border-amber-500 text-slate-900'
              : 'border-transparent text-slate-500 hover:text-slate-800'
          }`}
        >
          <Building2 className="w-4 h-4" />
          <span>Proveedores y Vendedores</span>
          <span className="px-2 py-0.5 rounded-full bg-slate-100 text-slate-700 text-xs font-mono font-bold">
            {suppliers.length}
          </span>
        </button>
      </div>

      {/* TAB 1: ÓRDENES DE COMPRA */}
      {activeTab === 'ordenes' && (
        <div className="space-y-4">
          {/* Filters Toolbar */}
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col lg:flex-row gap-3 items-stretch lg:items-center justify-between">
            <div className="relative flex-1 min-w-60">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por Nº orden, factura, código proveedor, vendedor o repuesto..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900"
              />
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <select
                value={supplierFilterId}
                onChange={(e) => setSupplierFilterId(e.target.value)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="ALL">Todos los proveedores</option>
                {suppliers.map((s) => (
                  <option key={s.id} value={s.id}>
                    [{s.code}] {s.name}
                  </option>
                ))}
              </select>

              <select
                value={filterMode}
                onChange={(e) => setFilterMode(e.target.value as OrderFilterMode)}
                className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-amber-500"
              >
                <option value="TODAS">Estado: Todas</option>
                <option value="POR_PAGAR">Por Pagar (Con Deuda)</option>
                <option value="PAGADAS">Pagadas 100%</option>
                <option value="POR_RECIBIR">Mercancía por Recibir</option>
                <option value="RECIBIDAS">Mercancía Recibida</option>
                <option value="CREDITO">Solo A Crédito</option>
                <option value="CONTADO">Solo De Contado</option>
                <option value="DIVISAS">Pago en Divisas ($)</option>
                <option value="BS_BCV">Pago en Bs a BCV</option>
              </select>
            </div>
          </div>

          {/* Orders List */}
          {filteredOrders.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Truck className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                {purchaseOrders.length === 0
                  ? 'Aún no hay órdenes de compra registradas'
                  : 'No hay órdenes que coincidan con el filtro'}
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Registra proveedores con su código y vendedor, y luego crea órdenes de compra para controlar crédito, llegada de mercancía y abonos en Divisas, USDT o Bolívares.
              </p>
              {purchaseOrders.length === 0 && (
                <button
                  type="button"
                  onClick={() => openNewOrderModal()}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  <Plus className="w-4 h-4 text-amber-400" />
                  <span>Crear primera orden de compra</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-3">
              {filteredOrders.map((po) => {
                const remainingUSD = Math.max(
                  0,
                  Math.round((po.totalUSD - (po.paidAmountUSD || 0)) * 100) / 100
                );
                const isBsBcv = po.paymentCurrencyCondition === 'BS_BCV';
                const dueInfo =
                  po.paymentType === 'CREDITO' && remainingUSD > 0.01
                    ? getDaysUntilDue(po.creditDueDate)
                    : null;

                return (
                  <div
                    key={po.id}
                    className="bg-white rounded-2xl border border-slate-200 p-4 sm:p-5 shadow-2xs hover:border-slate-300 transition-colors"
                  >
                    <div className="flex flex-col xl:flex-row xl:items-start justify-between gap-4">
                      {/* Left Column: Header, Supplier, Parts */}
                      <div className="space-y-3 flex-1 min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <span className="font-mono font-bold text-sm text-slate-900 bg-slate-100 px-2.5 py-1 rounded-lg">
                            #{po.orderNumber}
                          </span>
                          {po.supplierInvoiceNumber && (
                            <span className="font-mono text-xs font-semibold text-slate-700 bg-slate-50 border border-slate-200 px-2 py-0.5 rounded-md">
                              Fact. Prov: #{po.supplierInvoiceNumber}
                            </span>
                          )}
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md ${
                              po.paymentType === 'CREDITO'
                                ? 'bg-amber-100 text-amber-800'
                                : 'bg-slate-900 text-amber-400'
                            }`}
                          >
                            {po.paymentType === 'CREDITO'
                              ? `A CRÉDITO (${po.creditDays || 15} días)`
                              : 'DE CONTADO'}
                          </span>
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md ${
                              isBsBcv
                                ? 'bg-blue-100 text-blue-800'
                                : 'bg-emerald-100 text-emerald-800'
                            }`}
                          >
                            {isBsBcv ? 'Pago: Bs a BCV' : 'Pago: Divisas ($)'}
                          </span>
                          {dueInfo && (
                            <span
                              className={`text-[11px] font-bold px-2 py-0.5 rounded-md ${
                                dueInfo.tone === 'danger'
                                  ? 'bg-rose-100 text-rose-700'
                                  : dueInfo.tone === 'warn'
                                  ? 'bg-amber-100 text-amber-800'
                                  : 'bg-slate-100 text-slate-600'
                              }`}
                            >
                              {dueInfo.label}
                            </span>
                          )}
                          <span
                            className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md inline-flex items-center gap-1 ${
                              po.receivedStatus === 'RECIBIDA'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-indigo-100 text-indigo-800'
                            }`}
                          >
                            {po.receivedStatus === 'RECIBIDA' ? (
                              <>
                                <PackageCheck className="w-3.5 h-3.5" />
                                <span>
                                  Recibida{po.receivedDate ? ` · Llegó: ${po.receivedDate}` : ''}
                                </span>
                              </>
                            ) : (
                              <>
                                <Clock className="w-3.5 h-3.5" />
                                <span>Pendiente por llegar</span>
                              </>
                            )}
                          </span>
                          {po.stockApplied && (
                            <span className="text-[10px] font-semibold px-2 py-0.5 rounded-md bg-emerald-50 text-emerald-700 border border-emerald-200">
                              ✓ Stock sumado
                            </span>
                          )}
                        </div>

                        {/* Supplier & Vendor Details */}
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-slate-700">
                          <div className="flex items-center gap-1.5 font-semibold text-slate-900">
                            <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-mono text-[11px]">
                              {po.supplierCode}
                            </span>
                            <span>{po.supplierName}</span>
                          </div>
                          <div className="flex items-center gap-1 text-slate-600">
                            <UserCheck className="w-3.5 h-3.5 text-slate-400" />
                            <span>Vendedor: <strong>{po.vendorName}</strong></span>
                          </div>
                          <div className="flex items-center gap-1 font-mono text-slate-600">
                            <Phone className="w-3.5 h-3.5 text-emerald-600" />
                            <span>{po.vendorPhone}</span>
                          </div>
                          <span className="text-slate-400">
                            Emitida: {new Date(po.createdAt).toLocaleDateString('es-VE')}
                          </span>
                        </div>

                        {/* Repuestos List (Full names, zero truncation) */}
                        <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-3">
                          <div className="text-[11px] font-bold uppercase tracking-wider text-slate-500 mb-1.5">
                            Repuestos comprados ({po.items.length}):
                          </div>
                          <div className="space-y-1">
                            {po.items.map((item, idx) => (
                              <div
                                key={`${po.id}-it-${idx}`}
                                className="flex flex-wrap items-baseline justify-between gap-2 text-xs text-slate-800 border-b border-slate-200/60 last:border-none pb-1 last:pb-0"
                              >
                                <div className="flex-1 min-w-45">
                                  <span className="font-mono font-bold text-slate-900 mr-1.5">
                                    {item.quantity}x
                                  </span>
                                  <span className="font-medium break-words">{item.name}</span>
                                  {item.sku && (
                                    <span className="ml-1.5 font-mono text-[10px] text-slate-500">
                                      ({item.sku})
                                    </span>
                                  )}
                                </div>
                                <div className="font-mono text-slate-600 shrink-0">
                                  {formatUSD(item.unitCostUSD)} c/u →{' '}
                                  <strong className="text-slate-900">
                                    {formatUSD(item.totalCostUSD)}
                                  </strong>
                                </div>
                              </div>
                            ))}
                          </div>
                        </div>

                        {/* Payment Methods Used */}
                        {po.payments && po.payments.length > 0 && (
                          <div className="flex flex-wrap items-center gap-1.5 text-[11px]">
                            <span className="text-slate-500 font-semibold">Pagos aplicados:</span>
                            {po.payments.map((pay) => (
                              <span
                                key={pay.id}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-900 font-medium"
                              >
                                {renderCurrencyIcon(pay.currencyCategory)}
                                <span>{pay.paymentMethod}:</span>
                                <strong className="font-mono">{formatUSD(pay.amountUSD)}</strong>
                              </span>
                            ))}
                          </div>
                        )}
                      </div>

                      {/* Right Column: Financials & Actions */}
                      <div className="xl:w-80 shrink-0 flex flex-col justify-between gap-3 bg-slate-50/70 rounded-xl border border-slate-200 p-3.5">
                        <div className="space-y-1.5">
                          <div className="flex items-center justify-between text-xs text-slate-600">
                            <span>Total Compra:</span>
                            <span className="font-mono font-bold text-slate-900">
                              {formatUSD(po.totalUSD)}
                            </span>
                          </div>
                          <div className="flex items-center justify-between text-xs text-emerald-700">
                            <span>Abonado / Pagado:</span>
                            <span className="font-mono font-bold">
                              {formatUSD(po.paidAmountUSD || 0)}
                            </span>
                          </div>
                          <div className="pt-1.5 border-t border-slate-200 flex items-baseline justify-between">
                            <span className="text-xs font-bold text-slate-700">
                              {remainingUSD > 0.01 ? 'Saldo que se debe:' : 'Estado de Pago:'}
                            </span>
                            {remainingUSD > 0.01 ? (
                              <div className="text-right">
                                <span className="font-mono font-extrabold text-base text-amber-700 block">
                                  {formatUSD(remainingUSD)}
                                </span>
                                {isBsBcv && (
                                  <span className="text-[10px] font-semibold text-blue-700 block">
                                    Bs a BCV del día de pago
                                  </span>
                                )}
                              </div>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-emerald-100 text-emerald-800 text-xs font-bold">
                                <CheckCircle2 className="w-3.5 h-3.5" />
                                PAGADO
                              </span>
                            )}
                          </div>
                        </div>

                        {/* Action Buttons */}
                        <div className="grid grid-cols-2 gap-1.5 pt-2 border-t border-slate-200">
                          {remainingUSD > 0.01 && (
                            <button
                              type="button"
                              onClick={() => openPaymentModal(po)}
                              className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-2xs"
                            >
                              <DollarSign className="w-3.5 h-3.5" />
                              <span>Registrar Abono / Pago</span>
                            </button>
                          )}

                          {po.receivedStatus === 'PENDIENTE' && (
                            <button
                              type="button"
                              onClick={() => openReceiveModal(po)}
                              className="col-span-2 inline-flex items-center justify-center gap-1.5 px-3 py-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                              <PackageCheck className="w-3.5 h-3.5" />
                              <span>Marcar Mercancía Recibida</span>
                            </button>
                          )}

                          <button
                            type="button"
                            onClick={() => triggerWhatsAppDebtNotification(po)}
                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                            title="Enviar factura / saldo por WhatsApp con PDF al vendedor"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                            <span>WhatsApp PDF</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => downloadPurchaseOrderPDF(po, settings)}
                            className="inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
                            title="Descargar PDF de la orden de compra"
                          >
                            <FileDown className="w-3.5 h-3.5" />
                            <span>PDF</span>
                          </button>

                          <button
                            type="button"
                            onClick={() => setDetailOrder(po)}
                            className="inline-flex items-center justify-center gap-1 px-2.5 py-1.5 bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 text-[11px] font-semibold rounded-lg transition-colors cursor-pointer"
                          >
                            <Eye className="w-3.5 h-3.5" />
                            <span>Detalle</span>
                          </button>

                          <div className="flex items-center gap-1">
                            <button
                              type="button"
                              onClick={() => openEditOrderModal(po)}
                              className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-300 text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                              title="Editar orden de compra (repuestos, montos, proveedor, fechas y pagos)"
                            >
                              <Edit3 className="w-3.5 h-3.5 text-amber-700" />
                              <span>Editar</span>
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setConfirmDelete({
                                  type: 'order',
                                  id: po.id,
                                  label: `${po.orderNumber} (${po.supplierName})`,
                                })
                              }
                              className="p-1.5 bg-white hover:bg-rose-50 text-rose-600 border border-slate-200 hover:border-rose-200 rounded-lg transition-colors cursor-pointer"
                              title="Eliminar orden"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: PROVEEDORES Y VENDEDORES */}
      {activeTab === 'proveedores' && (
        <div className="space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-2xs flex flex-col sm:flex-row gap-3 items-stretch sm:items-center justify-between">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={supplierSearchTerm}
                onChange={(e) => setSupplierSearchTerm(e.target.value)}
                placeholder="Buscar proveedor por código, nombre, vendedor o teléfono..."
                className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500 text-slate-900"
              />
            </div>

            <button
              type="button"
              onClick={openNewSupplierModal}
              className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer shrink-0"
            >
              <Plus className="w-4 h-4 text-amber-400" />
              <span>Agregar Proveedor</span>
            </button>
          </div>

          {filteredSuppliers.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <div className="w-12 h-12 rounded-2xl bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
                <Building2 className="w-6 h-6" />
              </div>
              <h3 className="text-base font-bold text-slate-800">
                No hay proveedores registrados
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Guarda cada proveedor con su código, nombre del vendedor y teléfono WhatsApp para generar órdenes de compra en segundos.
              </p>
              <button
                type="button"
                onClick={openNewSupplierModal}
                className="inline-flex items-center gap-2 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Registrar Primer Proveedor</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
              {filteredSuppliers.map((sup) => {
                const supOrders = purchaseOrders.filter((po) => po.supplierId === sup.id);
                const supDebtUSD = supOrders.reduce(
                  (sum, po) => sum + Math.max(0, po.totalUSD - (po.paidAmountUSD || 0)),
                  0
                );
                const latestPendingOrder = supOrders.find(
                  (po) => po.totalUSD - (po.paidAmountUSD || 0) > 0.01
                );

                return (
                  <div
                    key={sup.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between gap-4"
                  >
                    <div className="space-y-2.5">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <span className="inline-block px-2 py-0.5 rounded-md bg-amber-100 text-amber-900 font-mono font-bold text-xs">
                            {sup.code}
                          </span>
                          <h3 className="text-base font-bold text-slate-900 mt-1.5">
                            {sup.name}
                          </h3>
                          {sup.rif && (
                            <p className="text-xs text-slate-500 font-mono">RIF: {sup.rif}</p>
                          )}
                        </div>
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditSupplierModal(sup)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded-lg cursor-pointer"
                            title="Editar proveedor"
                          >
                            <Edit3 className="w-4 h-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() =>
                              setConfirmDelete({
                                type: 'supplier',
                                id: sup.id,
                                label: `[${sup.code}] ${sup.name}`,
                              })
                            }
                            className="p-1.5 text-rose-500 hover:text-rose-700 hover:bg-rose-50 rounded-lg cursor-pointer"
                            title="Eliminar proveedor"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </div>

                      <div className="bg-slate-50 rounded-xl border border-slate-200/80 p-3 space-y-1.5 text-xs">
                        <div className="flex items-center gap-2 text-slate-700">
                          <UserCheck className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          <span>
                            Vendedor: <strong className="text-slate-900">{sup.vendorName}</strong>
                          </span>
                        </div>
                        <div className="flex items-center gap-2 text-slate-700">
                          <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                          <span className="font-mono font-semibold text-slate-900">
                            {sup.vendorPhone}
                          </span>
                        </div>
                        {sup.address && (
                          <p className="text-[11px] text-slate-500 pt-1 border-t border-slate-200/70">
                            {sup.address}
                          </p>
                        )}
                      </div>

                      <div className="flex items-center justify-between pt-1 text-xs">
                        <span className="text-slate-500">
                          Órdenes: <strong className="text-slate-800">{supOrders.length}</strong>
                        </span>
                        <div className="text-right">
                          <span className="text-slate-500 block text-[10px] uppercase font-semibold">
                            Deuda Pendiente
                          </span>
                          <span
                            className={`font-mono font-bold text-sm ${
                              supDebtUSD > 0.01 ? 'text-amber-700' : 'text-emerald-700'
                            }`}
                          >
                            {formatUSD(supDebtUSD)}
                          </span>
                        </div>
                      </div>
                    </div>

                    <div className="flex items-center gap-2 pt-3 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => openNewOrderModal(sup.id)}
                        className="flex-1 inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5 text-amber-400" />
                        <span>Nueva Orden</span>
                      </button>

                      {latestPendingOrder && (
                        <button
                          type="button"
                          onClick={() => triggerWhatsAppDebtNotification(latestPendingOrder)}
                          className="inline-flex items-center justify-center gap-1.5 px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 text-xs font-bold rounded-xl transition-colors cursor-pointer"
                          title="Enviar deuda pendiente en PDF por WhatsApp al vendedor"
                        >
                          <MessageSquare className="w-3.5 h-3.5" />
                          <span>Cobro PDF</span>
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* MODAL 1: CREAR / EDITAR PROVEEDOR */}
      {isSupplierModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <Building2 className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base">
                  {editingSupplier ? 'Editar Proveedor' : 'Registrar Nuevo Proveedor'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsSupplierModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveSupplier} className="p-6 overflow-y-auto space-y-4">
              {supError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{supError}</span>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Código Proveedor *
                  </label>
                  <input
                    type="text"
                    required
                    value={supCode}
                    onChange={(e) => setSupCode(e.target.value.toUpperCase())}
                    placeholder="Ej: PROV-001"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nombre / Empresa del Proveedor *
                  </label>
                  <input
                    type="text"
                    required
                    value={supName}
                    onChange={(e) => setSupName(e.target.value)}
                    placeholder="Ej: Importadora MotoPartes C.A."
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nombre del Vendedor *
                  </label>
                  <input
                    type="text"
                    required
                    value={supVendorName}
                    onChange={(e) => setSupVendorName(e.target.value)}
                    placeholder="Ej: Carlos Pérez"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfono / WhatsApp Vendedor *
                  </label>
                  <input
                    type="tel"
                    required
                    value={supVendorPhone}
                    onChange={(e) => setSupVendorPhone(e.target.value)}
                    placeholder="Ej: 0414-1234567"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    RIF / Cédula (Opcional)
                  </label>
                  <input
                    type="text"
                    value={supRif}
                    onChange={(e) => setSupRif(e.target.value.toUpperCase())}
                    placeholder="Ej: J-40123456-7"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Correo (Opcional)
                  </label>
                  <input
                    type="email"
                    value={supEmail}
                    onChange={(e) => setSupEmail(e.target.value)}
                    placeholder="ventas@proveedor.com"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Dirección (Opcional)
                </label>
                <input
                  type="text"
                  value={supAddress}
                  onChange={(e) => setSupAddress(e.target.value)}
                  placeholder="Ciudad, zona o dirección"
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Notas / Observaciones
                </label>
                <textarea
                  rows={2}
                  value={supNotes}
                  onChange={(e) => setSupNotes(e.target.value)}
                  placeholder="Condiciones especiales, días de despacho, etc."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsSupplierModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm"
                >
                  {editingSupplier ? 'Guardar Cambios' : 'Guardar Proveedor'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 2: CREAR / EDITAR ORDEN DE COMPRA */}
      {isOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[94vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between shrink-0">
              <div className="flex items-center gap-2.5">
                <Truck className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base">
                  {editingOrder
                    ? `Editar Orden de Compra #${editingOrder.orderNumber}`
                    : 'Nueva Orden de Compra a Proveedor'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsOrderModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveOrder} className="p-6 overflow-y-auto space-y-5 flex-1">
              {ordError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{ordError}</span>
                </div>
              )}

              {/* Carga Rápida con Plantilla Excel */}
              <div className="bg-emerald-50/70 rounded-2xl border border-emerald-200 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-8 h-8 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0">
                    <FileSpreadsheet className="w-4 h-4" />
                  </div>
                  <div>
                    <h4 className="text-xs font-bold text-slate-900">
                      Carga Masiva de Orden desde Excel
                    </h4>
                    <p className="text-[11px] text-slate-600">
                      Descarga la plantilla oficial, llénala con los repuestos, costos y precios de venta, e impórtala aquí directamente.
                    </p>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 shrink-0">
                  <button
                    type="button"
                    onClick={downloadPurchaseOrderTemplate}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white hover:bg-amber-50 text-slate-800 border border-amber-300 rounded-xl text-xs font-bold transition-colors cursor-pointer"
                  >
                    <Download className="w-3.5 h-3.5 text-amber-600" />
                    <span>Descargar Plantilla</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setIsImportExcelModalOpen(true)}
                    className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-2xs transition-colors cursor-pointer"
                  >
                    <UploadCloud className="w-3.5 h-3.5" />
                    <span>Importar Excel</span>
                  </button>
                </div>
              </div>

              {/* Section 1: Proveedor & Factura Proveedor */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Building2 className="w-4 h-4 text-amber-600" />
                    <span>1. Proveedor y Vendedor</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowQuickSupplierForm((prev) => !prev)}
                    className="text-xs font-bold text-amber-700 hover:text-amber-800 bg-amber-100/70 hover:bg-amber-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                  >
                    {showQuickSupplierForm ? 'Ocultar Nuevo Proveedor' : '+ Nuevo Proveedor Rápido'}
                  </button>
                </div>

                {showQuickSupplierForm && (
                  <div className="bg-white rounded-xl border border-amber-300 p-3.5 space-y-3">
                    <p className="text-xs font-bold text-slate-800">
                      Agregar Proveedor y guardarlo con su código:
                    </p>
                    <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                      <input
                        type="text"
                        value={qSupCode}
                        onChange={(e) => setQSupCode(e.target.value.toUpperCase())}
                        placeholder="Código (PROV-001)"
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                      />
                      <input
                        type="text"
                        value={qSupName}
                        onChange={(e) => setQSupName(e.target.value)}
                        placeholder="Nombre Proveedor *"
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      <input
                        type="text"
                        value={qSupVendorName}
                        onChange={(e) => setQSupVendorName(e.target.value)}
                        placeholder="Vendedor *"
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                      />
                      <input
                        type="tel"
                        value={qSupVendorPhone}
                        onChange={(e) => setQSupVendorPhone(e.target.value)}
                        placeholder="Tel. Vendedor *"
                        className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                      />
                    </div>
                    <div className="flex justify-end">
                      <button
                        type="button"
                        onClick={handleQuickCreateSupplier}
                        className="px-3.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer"
                      >
                        Guardar y Seleccionar Proveedor
                      </button>
                    </div>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div className="sm:col-span-2">
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Seleccionar Proveedor *
                    </label>
                    <select
                      required
                      value={ordSupplierId}
                      onChange={(e) => setOrdSupplierId(e.target.value)}
                      className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-medium text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    >
                      <option value="">-- Selecciona un proveedor --</option>
                      {suppliers.map((s) => (
                        <option key={s.id} value={s.id}>
                          [{s.code}] {s.name} — Vend: {s.vendorName} ({s.vendorPhone})
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1">
                      Nº Factura Proveedor (Opcional)
                    </label>
                    <input
                      type="text"
                      value={ordSupplierInvoice}
                      onChange={(e) => setOrdSupplierInvoice(e.target.value)}
                      placeholder="Ej: FAC-00948"
                      className="w-full px-3 py-2.5 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>
                </div>

                {editingOrder && (
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-slate-200/80">
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Nº Orden de Compra
                      </label>
                      <input
                        type="text"
                        value={ordOrderNumber}
                        onChange={(e) => setOrdOrderNumber(e.target.value.toUpperCase())}
                        placeholder="OC-2026-0001"
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Fecha de Emisión
                      </label>
                      <input
                        type="date"
                        value={ordCreatedDate}
                        onChange={(e) => setOrdCreatedDate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-semibold text-slate-700 mb-1">
                        Tasa BCV Referencia (Bs/$)
                      </label>
                      <input
                        type="number"
                        step="any"
                        min={0.01}
                        value={ordBcvRate}
                        onChange={(e) => setOrdBcvRate(e.target.value)}
                        className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-mono text-slate-900 focus:outline-none focus:ring-2 focus:ring-amber-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Section 2: Repuestos que se están comprando */}
              <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Boxes className="w-4 h-4 text-amber-600" />
                    <span>2. Repuestos que se están comprando</span>
                  </h4>
                  <button
                    type="button"
                    onClick={() => setShowCustomPartForm((prev) => !prev)}
                    className="text-xs font-bold text-slate-800 bg-white hover:bg-slate-100 border border-slate-300 px-2.5 py-1 rounded-lg cursor-pointer inline-flex items-center gap-1"
                  >
                    <PackagePlus className="w-3.5 h-3.5 text-amber-600" />
                    <span>+ Repuesto Nuevo / Manual</span>
                  </button>
                </div>

                {/* Search Existing Inventory */}
                <div className="space-y-2">
                  <div className="relative">
                    <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={partSearch}
                      onChange={(e) => setPartSearch(e.target.value)}
                      placeholder="Buscar repuesto en inventario por nombre, SKU o marca para agregarlo..."
                      className="w-full pl-9 pr-4 py-2 bg-white border border-slate-300 rounded-xl text-xs focus:outline-none focus:ring-2 focus:ring-amber-500"
                    />
                  </div>

                  <div className="max-h-40 overflow-y-auto grid grid-cols-1 sm:grid-cols-2 gap-1.5 bg-white p-2 rounded-xl border border-slate-200">
                    {filteredInventoryProducts.map((p) => (
                      <button
                        key={p.id}
                        type="button"
                        onClick={() => handleAddInventoryProductToOrder(p)}
                        className="text-left px-2.5 py-1.5 rounded-lg hover:bg-amber-50 border border-transparent hover:border-amber-200 transition-colors flex items-center justify-between gap-2 cursor-pointer"
                      >
                        <div className="min-w-0 flex-1">
                          <span className="text-xs font-semibold text-slate-900 block break-words">
                            {p.name}
                          </span>
                          <span className="text-[10px] text-slate-500 font-mono">
                            SKU: {p.sku} · Stock: {p.stock} · Costo: {formatUSD(p.costPrice)}
                          </span>
                        </div>
                        <Plus className="w-4 h-4 text-amber-600 shrink-0" />
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom / New Part Full Inventory Form */}
                {showCustomPartForm && (
                  <div className="bg-white rounded-xl border-2 border-amber-300 p-4 space-y-3 shadow-2xs">
                    <div className="flex items-center justify-between border-b border-slate-100 pb-2">
                      <div>
                        <h5 className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                          <PackagePlus className="w-4 h-4 text-amber-600" />
                          <span>Ficha Completa de Repuesto Nuevo para Inventario y Orden</span>
                        </h5>
                        <p className="text-[11px] text-slate-500">
                          Se agregará a esta orden por su <strong>Costo ($)</strong> y se creará directamente en el Inventario con su <strong>Precio de Venta ($)</strong> y datos completos.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          setShowCustomPartForm(false);
                          setCustomPartError(null);
                        }}
                        className="p-1 text-slate-400 hover:text-slate-700 cursor-pointer"
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>

                    {customPartError && (
                      <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-700 text-[11px] font-semibold flex items-center gap-1.5">
                        <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                        <span>{customPartError}</span>
                      </div>
                    )}

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[10px] font-bold text-slate-600">
                            Código SKU
                          </label>
                          <button
                            type="button"
                            onClick={() =>
                              setCustomPartSku(`REP-${String(Date.now()).slice(-5)}`)
                            }
                            className="text-[10px] font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
                          >
                            Auto
                          </button>
                        </div>
                        <input
                          type="text"
                          value={customPartSku}
                          onChange={(e) => setCustomPartSku(e.target.value.toUpperCase())}
                          placeholder="Ej: KIT-1542 (o Auto)"
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono font-bold"
                        />
                      </div>

                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                          <Barcode className="w-3 h-3 text-slate-400" />
                          <span>Código de Barras (Opcional)</span>
                        </label>
                        <input
                          type="text"
                          value={customPartBarcode}
                          onChange={(e) => setCustomPartBarcode(e.target.value)}
                          placeholder="EAN / UPC"
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                        />
                      </div>

                      <div>
                        <div className="flex items-center justify-between mb-1">
                          <label className="block text-[10px] font-bold text-slate-600">
                            Categoría *
                          </label>
                          <button
                            type="button"
                            onClick={() => {
                              setIsAddingCustomCategory((prev) => !prev);
                              setNewCustomCategoryName('');
                            }}
                            className="text-[10px] font-bold text-amber-700 hover:text-amber-800 cursor-pointer"
                          >
                            {isAddingCustomCategory ? 'Lista' : '+ Nueva'}
                          </button>
                        </div>
                        {isAddingCustomCategory ? (
                          <input
                            type="text"
                            value={newCustomCategoryName}
                            onChange={(e) => setNewCustomCategoryName(e.target.value)}
                            placeholder="Nombre nueva categoría..."
                            className="w-full px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-xs"
                          />
                        ) : (
                          <select
                            value={customPartCategory}
                            onChange={(e) => setCustomPartCategory(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                          >
                            {categories.map((cat) => (
                              <option key={cat} value={cat}>
                                {cat}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Nombre del Repuesto *
                      </label>
                      <input
                        type="text"
                        value={customPartName}
                        onChange={(e) => setCustomPartName(e.target.value)}
                        placeholder="Ej: Kit de arrastre reforzado 15/42 Bera SBR"
                        className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                          Marca
                        </label>
                        <input
                          type="text"
                          value={customPartBrand}
                          onChange={(e) => setCustomPartBrand(e.target.value)}
                          placeholder="Ej: Empire, Bera, Brembo"
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                          Motos Compatibles
                        </label>
                        <input
                          type="text"
                          value={customPartCompatibility}
                          onChange={(e) => setCustomPartCompatibility(e.target.value)}
                          placeholder="Ej: Bera SBR 150, Horse, Universal"
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1 flex items-center gap-1">
                          <MapPin className="w-3 h-3 text-amber-600" />
                          <span>Ubicación en Almacén</span>
                        </label>
                        <input
                          type="text"
                          value={customPartLocation}
                          onChange={(e) => setCustomPartLocation(e.target.value)}
                          placeholder="Ej: Estante A-3, Gaveta 2"
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                    </div>

                    {/* Bloque Financiero de Costo (BCV / Divisas) y Precios Duales */}
                    <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 space-y-2.5">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5">
                          <Calculator className="w-3.5 h-3.5 text-amber-600" />
                          <span className="text-[10px] font-bold uppercase text-slate-700">
                            Origen del Costo &amp; Precios Duales (Brecha{' '}
                            {exchangeGap.gapPct >= 0 ? '+' : ''}
                            {exchangeGap.gapPct.toFixed(1)}%)
                          </span>
                        </div>
                        <div className="inline-flex rounded-lg border border-slate-300 bg-white p-0.5">
                          <button
                            type="button"
                            onClick={() => {
                              setCustomPartCostOrigin('DIVISAS');
                              if (parseFloat(customPartCostBs) > 0 && usdtRate > 0) {
                                setCustomPartCost(
                                  round2(parseFloat(customPartCostBs) / usdtRate).toFixed(2)
                                );
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              customPartCostOrigin === 'DIVISAS'
                                ? 'bg-slate-900 text-amber-400'
                                : 'text-slate-600'
                            }`}
                          >
                            Divisas / USDT ($)
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setCustomPartCostOrigin('BS_BCV');
                              const activeBcv = customPartPricing.activeBcv;
                              if (parseFloat(customPartCost) > 0 && !customPartCostBs) {
                                setCustomPartCostBs(
                                  round2(parseFloat(customPartCost) * activeBcv).toFixed(2)
                                );
                              }
                            }}
                            className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                              customPartCostOrigin === 'BS_BCV'
                                ? 'bg-blue-700 text-white'
                                : 'text-slate-600'
                            }`}
                          >
                            Tasa BCV (Bs)
                          </button>
                        </div>
                      </div>

                      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Cantidad Comprada *
                          </label>
                          <input
                            type="number"
                            min={1}
                            value={customPartQty}
                            onChange={(e) => setCustomPartQty(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono font-bold"
                          />
                        </div>

                        {customPartCostOrigin === 'BS_BCV' ? (
                          <div>
                            <label className="block text-[10px] font-bold text-blue-800 mb-1">
                              Costo Unit. Bs (BCV) *
                            </label>
                            <input
                              type="number"
                              step="any"
                              min={0}
                              value={customPartCostBs}
                              onChange={(e) => {
                                setCustomPartCostBs(e.target.value);
                                const bsNum = parseFloat(e.target.value) || 0;
                                setCustomPartCost(
                                  customPartPricing.activeBcv > 0
                                    ? round2(bsNum / customPartPricing.activeBcv).toFixed(2)
                                    : ''
                                );
                              }}
                              placeholder="0.00"
                              className="w-full px-2.5 py-1.5 bg-white border border-blue-300 rounded-lg text-xs font-mono font-bold text-blue-950"
                            />
                            <span className="text-[9px] font-mono text-slate-500 block mt-0.5">
                              Nominal: {formatUSD(customPartPricing.costCalc.costUsdAtBcv)} BCV
                            </span>
                          </div>
                        ) : (
                          <div>
                            <label className="block text-[10px] font-bold text-slate-600 mb-1">
                              Costo Unit. Divisas ($) *
                            </label>
                            <input
                              type="number"
                              step="any"
                              min={0}
                              value={customPartCost}
                              onChange={(e) => {
                                setCustomPartCost(e.target.value);
                                const usdNum = parseFloat(e.target.value) || 0;
                                setCustomPartCostBs(round2(usdNum * usdtRate).toFixed(2));
                              }}
                              placeholder="0.00"
                              className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold"
                            />
                          </div>
                        )}

                        <div
                          className="rounded-lg bg-amber-50 border border-amber-300 px-2.5 py-1.5 flex flex-col justify-center"
                          title="Costo de referencia en divisas ajustado por brecha BCV/USDT: (Costo Bs ÷ Tasa BCV) ÷ (1 + Brecha%) = Costo Bs ÷ Tasa USDT"
                        >
                          <span className="text-[9px] font-bold text-amber-900 flex items-center gap-1">
                            <Info className="w-2.5 h-2.5 shrink-0" />
                            <span>Costo Ref. Divisas</span>
                          </span>
                          <span className="font-mono font-black text-amber-950 text-xs">
                            {formatUSD(customPartPricing.costCalc.referenceCostUSD)}
                          </span>
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Stock Mínimo
                          </label>
                          <input
                            type="number"
                            min={0}
                            value={customPartMinStock}
                            onChange={(e) => setCustomPartMinStock(e.target.value)}
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-mono"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 items-end">
                        <div>
                          <label className="flex items-center justify-between text-[10px] font-bold text-amber-900 mb-1">
                            <span className="inline-flex items-center gap-1">
                              <Lock className="w-2.5 h-2.5" />
                              <span>P. Venta Ref. Divisas</span>
                            </span>
                            <span className="text-[8px] bg-amber-200 px-1 rounded uppercase">Admin</span>
                          </label>
                          <input
                            type="number"
                            step="any"
                            min={0}
                            value={customPartSalePriceRefUSD}
                            onChange={(e) => {
                              setCustomPartSalePriceRefUSD(e.target.value);
                              const refVal = parseFloat(e.target.value) || 0;
                              const nextBs = round2(refVal * usdtRate);
                              const nextUsdBcv =
                                customPartPricing.activeBcv > 0
                                  ? round2(nextBs / customPartPricing.activeBcv)
                                  : refVal;
                              setCustomPartSalePriceBs(nextBs > 0 ? nextBs.toFixed(2) : '');
                              setCustomPartSalePrice(nextUsdBcv > 0 ? nextUsdBcv.toFixed(2) : '');
                            }}
                            placeholder="0.00"
                            className="w-full px-2.5 py-1.5 bg-amber-50 border border-amber-300 rounded-lg text-xs font-mono font-bold text-amber-950"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-emerald-800 mb-1">
                            P. Venta Bs (Tasa BCV) *
                          </label>
                          <input
                            type="number"
                            step="any"
                            min={0}
                            value={customPartSalePriceBs}
                            onChange={(e) => {
                              setCustomPartSalePriceBs(e.target.value);
                              const bsVal = parseFloat(e.target.value) || 0;
                              const nextUsdBcv =
                                customPartPricing.activeBcv > 0
                                  ? round4(bsVal / customPartPricing.activeBcv)
                                  : 0;
                              const nextRefUsd = usdtRate > 0 ? round2(bsVal / usdtRate) : nextUsdBcv;
                              setCustomPartSalePrice(nextUsdBcv > 0 ? String(round2(nextUsdBcv)) : '');
                              setCustomPartSalePriceRefUSD(nextRefUsd > 0 ? nextRefUsd.toFixed(2) : '');
                            }}
                            placeholder="0.00"
                            className="w-full px-2.5 py-1.5 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-mono font-bold text-emerald-950"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-700 mb-1">
                            Equiv. $ BCV (Tienda) *
                          </label>
                          <input
                            type="number"
                            step="any"
                            min={0}
                            value={customPartSalePrice}
                            onChange={(e) => {
                              setCustomPartSalePrice(e.target.value);
                              const usdBcv = parseFloat(e.target.value) || 0;
                              const nextBs = round2(usdBcv * customPartPricing.activeBcv);
                              const nextRefUsd = usdtRate > 0 ? round2(nextBs / usdtRate) : usdBcv;
                              setCustomPartSalePriceBs(nextBs > 0 ? nextBs.toFixed(2) : '');
                              setCustomPartSalePriceRefUSD(nextRefUsd > 0 ? nextRefUsd.toFixed(2) : '');
                            }}
                            placeholder="0.00"
                            className="w-full px-2.5 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono font-bold text-slate-900"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-slate-600 mb-1">
                            Sugerir por Margen %
                          </label>
                          <div className="flex items-center gap-1">
                            <input
                              type="number"
                              min={0}
                              max={95}
                              value={customPartTargetPct}
                              onChange={(e) => setCustomPartTargetPct(e.target.value)}
                              className="w-14 px-2 py-1.5 bg-white border border-slate-300 rounded-lg text-xs font-mono text-center"
                            />
                            <button
                              type="button"
                              onClick={handleApplyCustomPartTargetProfit}
                              disabled={customPartPricing.costCalc.referenceCostUSD <= 0}
                              className="flex-1 px-2 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-[10px] rounded-lg cursor-pointer"
                            >
                              Aplicar
                            </button>
                          </div>
                        </div>
                      </div>

                      {customPartPricing.analysis.realProfitMarginPct !== null && (
                        <div
                          className={`px-2.5 py-1.5 rounded-lg border text-[10px] font-mono font-bold flex flex-wrap items-center justify-between gap-2 ${
                            customPartPricing.analysis.status === 'healthy'
                              ? 'bg-emerald-50 border-emerald-300 text-emerald-900'
                              : customPartPricing.analysis.status === 'low'
                              ? 'bg-amber-50 border-amber-300 text-amber-900'
                              : 'bg-rose-50 border-rose-300 text-rose-800'
                          }`}
                        >
                          <span>
                            Utilidad (Solo Admin): Margen{' '}
                            {customPartPricing.analysis.realProfitMarginPct.toFixed(1)}% · s/Costo:{' '}
                            {customPartPricing.analysis.realProfitMarkupPct !== null
                              ? `${customPartPricing.analysis.realProfitMarkupPct >= 0 ? '+' : ''}${customPartPricing.analysis.realProfitMarkupPct.toFixed(1)}%`
                              : '—'}
                          </span>
                          <span>
                            Ganancia: {customPartPricing.analysis.realProfitAmountUSD >= 0 ? '+' : ''}
                            {formatUSD(customPartPricing.analysis.realProfitAmountUSD)}/u
                          </span>
                        </div>
                      )}
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 items-center">
                      <div className="sm:col-span-2">
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                          Descripción / Detalles (Opcional)
                        </label>
                        <input
                          type="text"
                          value={customPartDescription}
                          onChange={(e) => setCustomPartDescription(e.target.value)}
                          placeholder="Especificaciones, medidas o detalles para la tienda..."
                          className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-600 mb-1">
                          Foto (Opcional)
                        </label>
                        <div className="flex items-center gap-2">
                          {customPartImageUrl && (
                            <img
                              src={customPartImageUrl}
                              alt="Vista previa"
                              className="w-8 h-8 rounded object-cover border border-slate-200 shrink-0"
                            />
                          )}
                          <label className="flex-1 inline-flex items-center justify-center gap-1.5 px-2.5 py-1.5 bg-slate-100 hover:bg-slate-200 text-slate-700 border border-slate-300 rounded-lg text-[11px] font-semibold cursor-pointer">
                            <Upload className="w-3.5 h-3.5" />
                            <span>{customPartImageUrl ? 'Cambiar' : 'Subir foto'}</span>
                            <input
                              type="file"
                              accept="image/*"
                              onChange={(e) => void handleCustomPartImageUpload(e)}
                              className="hidden"
                            />
                          </label>
                        </div>
                      </div>
                    </div>

                    <div className="flex justify-end gap-2 pt-2 border-t border-slate-100">
                      <button
                        type="button"
                        onClick={() => {
                          resetCustomPartForm();
                          setShowCustomPartForm(false);
                        }}
                        className="px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                      >
                        Cancelar
                      </button>
                      <button
                        type="button"
                        onClick={handleAddCustomPartToOrder}
                        className="px-4 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer inline-flex items-center gap-1.5"
                      >
                        <Plus className="w-3.5 h-3.5 text-amber-400" />
                        <span>Agregar a Orden e Inventario</span>
                      </button>
                    </div>
                  </div>
                )}

                {/* Selected Items List */}
                {ordItems.length > 0 && (
                  <div className="bg-white rounded-xl border border-slate-200 overflow-hidden">
                    <div className="divide-y divide-slate-200">
                      {ordItems.map((it, idx) => {
                        const isExpanded = expandedItemIdx === idx;
                        const activeBcv = parseFloat(ordBcvRate) > 0 ? parseFloat(ordBcvRate) : bcvRate;
                        const itemPricing = calculateProductPricing(
                          {
                            costPrice: it.unitCostUSD,
                            costCurrencyOrigin: it.costCurrencyOrigin || 'DIVISAS',
                            costPriceBs: it.costPriceBs,
                            referenceCostUSD: it.referenceCostUSD,
                            salePrice: it.salePriceUSD ?? 0,
                            salePriceRefUSD: it.salePriceRefUSD,
                            salePriceBsBcv: it.salePriceBsBcv,
                          },
                          activeBcv,
                          usdtRate
                        );
                        return (
                          <div key={it.id || idx} className="p-3 space-y-2.5 text-xs">
                            <div className="flex flex-wrap lg:flex-nowrap items-center justify-between gap-2.5">
                              <div className="flex-1 min-w-44">
                                <div className="flex flex-wrap items-center gap-1.5">
                                  <span className="font-semibold text-slate-900 break-words">
                                    {it.name}
                                  </span>
                                  {!it.productId && (
                                    <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 text-[10px] font-bold">
                                      Nuevo
                                    </span>
                                  )}
                                  {it.category && (
                                    <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-medium">
                                      {it.category}
                                    </span>
                                  )}
                                  <button
                                    type="button"
                                    onClick={() =>
                                      handleUpdateOrderItem(
                                        idx,
                                        'costCurrencyOrigin',
                                        itemPricing.costOrigin === 'BS_BCV' ? 'DIVISAS' : 'BS_BCV'
                                      )
                                    }
                                    className={`px-1.5 py-0.5 rounded text-[9px] font-bold uppercase cursor-pointer ${
                                      itemPricing.costOrigin === 'BS_BCV'
                                        ? 'bg-blue-100 text-blue-800 border border-blue-300'
                                        : 'bg-slate-200 text-slate-700 border border-slate-300'
                                    }`}
                                    title="Clic para alternar origen de costo entre Divisas/USDT y Tasa BCV"
                                  >
                                    Costo: {itemPricing.costOrigin === 'BS_BCV' ? 'BCV' : 'Divisas'}
                                  </button>
                                </div>
                                <div className="flex flex-wrap items-center gap-2 text-[10px] font-mono text-slate-500 mt-0.5">
                                  <span>SKU: {it.sku || 'AUTO'}</span>
                                  <span
                                    className="text-amber-800 font-bold"
                                    title="Costo de referencia en divisas ajustado por brecha BCV/USDT"
                                  >
                                    Ref. Div: {formatUSD(itemPricing.referenceCostUSD)}
                                  </span>
                                  {itemPricing.realProfitMarginPct !== null && (
                                    <span
                                      className={`px-1.5 py-0.2 rounded font-bold ${
                                        itemPricing.status === 'healthy'
                                          ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                                          : itemPricing.status === 'low'
                                          ? 'bg-amber-50 text-amber-800 border border-amber-200'
                                          : 'bg-rose-50 text-rose-700 border border-rose-200'
                                      }`}
                                      title="Utilidad Solo Admin (Margen s/Venta y Markup s/Costo)"
                                    >
                                      Margen {itemPricing.realProfitMarginPct.toFixed(1)}%
                                      {itemPricing.realProfitMarkupPct !== null
                                        ? ` (s/C +${itemPricing.realProfitMarkupPct.toFixed(0)}%)`
                                        : ''}
                                    </span>
                                  )}
                                </div>
                              </div>

                              <div className="flex flex-wrap items-center gap-2 shrink-0">
                                <div>
                                  <span className="text-[10px] text-slate-400 block">Cant.</span>
                                  <input
                                    type="number"
                                    min={1}
                                    value={it.quantity}
                                    onChange={(e) =>
                                      handleUpdateOrderItem(idx, 'quantity', e.target.value)
                                    }
                                    className="w-14 px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs text-center"
                                  />
                                </div>
                                <div>
                                  <span className="text-[10px] text-slate-500 font-semibold block">
                                    {itemPricing.costOrigin === 'BS_BCV'
                                      ? 'Costo Bs BCV'
                                      : 'Costo Div $'}
                                  </span>
                                  {itemPricing.costOrigin === 'BS_BCV' ? (
                                    <input
                                      type="number"
                                      step="any"
                                      min={0}
                                      value={it.costPriceBs ?? round2(it.unitCostUSD * activeBcv)}
                                      onChange={(e) =>
                                        handleUpdateOrderItem(idx, 'costPriceBs', e.target.value)
                                      }
                                      className="w-24 px-2 py-1 bg-blue-50 border border-blue-300 rounded-lg font-mono text-xs text-right text-blue-950"
                                    />
                                  ) : (
                                    <input
                                      type="number"
                                      step="any"
                                      min={0}
                                      value={it.unitCostUSD}
                                      onChange={(e) =>
                                        handleUpdateOrderItem(idx, 'unitCostUSD', e.target.value)
                                      }
                                      className="w-22 px-2 py-1 bg-slate-50 border border-slate-300 rounded-lg font-mono text-xs text-right"
                                    />
                                  )}
                                </div>
                                <div>
                                  <span className="text-[10px] text-amber-800 font-bold flex items-center gap-0.5">
                                    <Lock className="w-2.5 h-2.5" />
                                    <span>Ref. Div $</span>
                                  </span>
                                  <input
                                    type="number"
                                    step="any"
                                    min={0}
                                    value={it.salePriceRefUSD ?? itemPricing.salePriceRefUSD}
                                    onChange={(e) =>
                                      handleUpdateOrderItem(idx, 'salePriceRefUSD', e.target.value)
                                    }
                                    placeholder="0.00"
                                    className="w-22 px-2 py-1 bg-amber-50 border border-amber-300 rounded-lg font-mono font-bold text-xs text-right text-amber-950"
                                  />
                                </div>
                                <div>
                                  <span className="text-[10px] text-emerald-700 font-bold block">
                                    P. Venta $ BCV
                                  </span>
                                  <input
                                    type="number"
                                    step="any"
                                    min={0}
                                    value={it.salePriceUSD ?? ''}
                                    onChange={(e) =>
                                      handleUpdateOrderItem(idx, 'salePriceUSD', e.target.value)
                                    }
                                    placeholder="0.00"
                                    className="w-22 px-2 py-1 bg-emerald-50 border border-emerald-300 rounded-lg font-mono font-bold text-xs text-right text-emerald-950"
                                  />
                                  <span className="text-[9px] font-mono text-emerald-700 block text-right">
                                    {formatBs(itemPricing.salePriceBsBcv)}
                                  </span>
                                </div>
                                <div className="w-20 text-right">
                                  <span className="text-[10px] text-slate-400 block">
                                    Subt. Costo
                                  </span>
                                  <span className="font-mono font-bold text-slate-900">
                                    {formatUSD(it.totalCostUSD)}
                                  </span>
                                </div>
                                <button
                                  type="button"
                                  onClick={() =>
                                    setExpandedItemIdx(isExpanded ? null : idx)
                                  }
                                  className="px-2 py-1 mt-2 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-[10px] font-bold inline-flex items-center gap-0.5 cursor-pointer"
                                  title="Editar ficha completa para inventario"
                                >
                                  <span>Ficha</span>
                                  {isExpanded ? (
                                    <ChevronUp className="w-3 h-3" />
                                  ) : (
                                    <ChevronDown className="w-3 h-3" />
                                  )}
                                </button>
                                <button
                                  type="button"
                                  onClick={() => {
                                    setOrdItems((prev) => prev.filter((_, i) => i !== idx));
                                    if (expandedItemIdx === idx) setExpandedItemIdx(null);
                                  }}
                                  className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg cursor-pointer mt-2"
                                >
                                  <X className="w-4 h-4" />
                                </button>
                              </div>
                            </div>

                            {/* Expandable full inventory details per item */}
                            {isExpanded && (
                              <div className="bg-slate-50 rounded-xl border border-slate-200 p-3 space-y-2.5">
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                  <div className="sm:col-span-2">
                                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                      Nombre en Inventario
                                    </label>
                                    <input
                                      type="text"
                                      value={it.name}
                                      onChange={(e) =>
                                        handleUpdateOrderItem(idx, 'name', e.target.value)
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                      SKU / Código
                                    </label>
                                    <input
                                      type="text"
                                      value={it.sku || ''}
                                      onChange={(e) =>
                                        handleUpdateOrderItem(idx, 'sku', e.target.value.toUpperCase())
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                      Categoría
                                    </label>
                                    <select
                                      value={it.category || categories[0] || 'Accesorios'}
                                      onChange={(e) =>
                                        handleUpdateOrderItem(idx, 'category', e.target.value)
                                      }
                                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                                    >
                                      {categories.map((cat) => (
                                        <option key={cat} value={cat}>
                                          {cat}
                                        </option>
                                      ))}
                                    </select>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2">
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                      Marca
                                    </label>
                                    <input
                                      type="text"
                                      value={it.brand || ''}
                                      onChange={(e) =>
                                        handleUpdateOrderItem(idx, 'brand', e.target.value)
                                      }
                                      placeholder="Ej: Bera, Empire"
                                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                      Compatibilidad
                                    </label>
                                    <input
                                      type="text"
                                      value={it.compatibility || ''}
                                      onChange={(e) =>
                                        handleUpdateOrderItem(idx, 'compatibility', e.target.value)
                                      }
                                      placeholder="Motos compatibles"
                                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                      Ubicación Almacén
                                    </label>
                                    <input
                                      type="text"
                                      value={it.warehouseLocation || ''}
                                      onChange={(e) =>
                                        handleUpdateOrderItem(idx, 'warehouseLocation', e.target.value)
                                      }
                                      placeholder="Ej: Estante A-3"
                                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                                    />
                                  </div>
                                  <div>
                                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                      Stock Mín. / Barras
                                    </label>
                                    <div className="flex gap-1">
                                      <input
                                        type="number"
                                        min={0}
                                        value={it.minStock ?? 2}
                                        onChange={(e) =>
                                          handleUpdateOrderItem(idx, 'minStock', e.target.value)
                                        }
                                        className="w-14 px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                                        title="Stock mínimo"
                                      />
                                      <input
                                        type="text"
                                        value={it.barcode || ''}
                                        onChange={(e) =>
                                          handleUpdateOrderItem(idx, 'barcode', e.target.value)
                                        }
                                        placeholder="Cód. Barras"
                                        className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs font-mono"
                                      />
                                    </div>
                                  </div>
                                </div>

                                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 items-center">
                                  <div className="sm:col-span-2">
                                    <input
                                      type="text"
                                      value={it.description || ''}
                                      onChange={(e) =>
                                        handleUpdateOrderItem(idx, 'description', e.target.value)
                                      }
                                      placeholder="Descripción técnica para inventario / tienda..."
                                      className="w-full px-2 py-1 bg-white border border-slate-200 rounded text-xs"
                                    />
                                  </div>
                                  <div className="flex items-center gap-2">
                                    {it.imageUrl ? (
                                      <img
                                        src={it.imageUrl}
                                        alt={it.name}
                                        className="w-7 h-7 rounded object-cover border border-slate-200 shrink-0"
                                      />
                                    ) : (
                                      <ImageIcon className="w-5 h-5 text-slate-400 shrink-0" />
                                    )}
                                    <label className="flex-1 inline-flex items-center justify-center gap-1 px-2 py-1 bg-white hover:bg-slate-100 border border-slate-200 rounded text-[11px] font-semibold cursor-pointer">
                                      <Upload className="w-3 h-3" />
                                      <span>{it.imageUrl ? 'Cambiar foto' : 'Subir foto'}</span>
                                      <input
                                        type="file"
                                        accept="image/*"
                                        onChange={(e) => void handleCustomPartImageUpload(e, idx)}
                                        className="hidden"
                                      />
                                    </label>
                                  </div>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                    <div className="px-4 py-2.5 bg-slate-900 text-white flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div>
                        <span className="font-semibold text-slate-300 block">
                          TOTAL FACTURA DE COMPRA (SOLO COSTOS):
                        </span>
                        <span className="text-[10px] text-slate-400">
                          El precio de venta solo se aplica al inventario y no altera el total de compra.
                        </span>
                      </div>
                      <div className="text-right font-mono">
                        <span className="text-base font-extrabold text-amber-400">
                          {formatUSD(ordTotalUSD)}
                        </span>
                        {ordCurrencyCondition === 'BS_BCV' && (
                          <span className="ml-2 text-[11px] font-sans text-blue-300">
                            (En Bs a tasa BCV del día de pago)
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                )}

                {(!editingOrder || !editingOrder.stockApplied) && (
                  <label className="flex items-start gap-2.5 text-xs text-slate-800 cursor-pointer bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                    <input
                      type="checkbox"
                      checked={ordApplyStock}
                      onChange={(e) => setOrdApplyStock(e.target.checked)}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>
                      <strong>Ingresar directamente al Inventario al guardar:</strong> crea los repuestos nuevos con su precio de venta, categoría y ubicación, suma las cantidades compradas al stock y actualiza costo y precio de venta.
                    </span>
                  </label>
                )}
                {editingOrder?.stockApplied && (
                  <label className="flex items-start gap-2.5 text-xs text-emerald-950 cursor-pointer bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                    <input
                      type="checkbox"
                      checked={ordSyncInventoryDelta}
                      onChange={(e) => setOrdSyncInventoryDelta(e.target.checked)}
                      className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>
                      <strong>Sincronizar cambios con el Inventario automáticamente:</strong> esta orden ya sumó stock antes. Al guardar, se ajustarán las diferencias de cantidad (si agregas, quitas o cambias unidades) y se actualizarán costos, precios de venta y fichas en el inventario.
                    </span>
                  </label>
                )}
              </div>

              {/* Section 3: Condición (Crédito / Contado) & Recepción de Mercancía */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Condición */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Calendar className="w-4 h-4 text-amber-600" />
                    <span>3. Condición de Compra</span>
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setOrdPaymentType('CREDITO');
                        if (!editingOrder) setOrdPaymentOption('PENDIENTE');
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        ordPaymentType === 'CREDITO'
                          ? 'bg-amber-500 border-amber-600 text-slate-950 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      A Crédito
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOrdPaymentType('CONTADO');
                        if (!editingOrder) setOrdPaymentOption('PAGADO');
                      }}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        ordPaymentType === 'CONTADO'
                          ? 'bg-slate-900 border-slate-900 text-amber-400 shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      De Contado
                    </button>
                  </div>

                  {/* Condición de Pago: Divisas vs Bs a BCV */}
                  <div className="pt-2 border-t border-slate-200/80 space-y-2">
                    <label className="block text-[11px] font-bold uppercase tracking-wider text-slate-700">
                      Moneda / Condición de Pago:
                    </label>
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setOrdCurrencyCondition('DIVISAS');
                          if (!editingOrder) {
                            setOrdPayCurrency('DIVISAS');
                            setOrdPayMethod('Divisas ($ Efectivo)');
                          }
                        }}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          ordCurrencyCondition === 'DIVISAS'
                            ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <Banknote className="w-3.5 h-3.5" />
                        <span>En Divisas ($)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setOrdCurrencyCondition('BS_BCV');
                          if (!editingOrder) {
                            setOrdPayCurrency('BS');
                            setOrdPayMethod('Bolívares (Pago Móvil)');
                          }
                        }}
                        className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                          ordCurrencyCondition === 'BS_BCV'
                            ? 'bg-blue-600 border-blue-700 text-white shadow-xs'
                            : 'bg-white border-slate-200 text-slate-600'
                        }`}
                      >
                        <CreditCard className="w-3.5 h-3.5" />
                        <span>En Bs a BCV</span>
                      </button>
                    </div>
                    <p className="text-[11px] text-slate-500 leading-snug">
                      {ordCurrencyCondition === 'BS_BCV'
                        ? 'No se fija monto en Bs en la orden; el total en bolívares se calculará a la tasa BCV del día en que se realice el pago.'
                        : 'La orden se liquida en Divisas ($ USD / USDT).'}
                    </p>
                  </div>

                  {ordPaymentType === 'CREDITO' && (
                    <div className="space-y-2.5 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Días de crédito:
                        </label>
                        <div className="flex flex-wrap items-center gap-1.5">
                          {[7, 15, 30, 45].map((days) => (
                            <button
                              key={days}
                              type="button"
                              onClick={() => {
                                setOrdCreditDays(days);
                                setOrdCreditDueDate(computeSuggestedDueDate(days));
                              }}
                              className={`px-2.5 py-1 rounded-lg text-xs font-mono font-bold cursor-pointer border ${
                                ordCreditDays === days
                                  ? 'bg-slate-900 text-amber-400 border-slate-900'
                                  : 'bg-white text-slate-700 border-slate-200'
                              }`}
                            >
                              {days}d
                            </button>
                          ))}
                          <input
                            type="number"
                            min={1}
                            value={ordCreditDays}
                            onChange={(e) => {
                              const d = Math.max(1, parseInt(e.target.value, 10) || 1);
                              setOrdCreditDays(d);
                              setOrdCreditDueDate(computeSuggestedDueDate(d));
                            }}
                            className="w-16 px-2 py-1 bg-white border border-slate-300 rounded-lg text-xs font-mono text-center"
                          />
                        </div>
                      </div>
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          Fecha límite de vencimiento:
                        </label>
                        <input
                          type="date"
                          value={ordCreditDueDate}
                          onChange={(e) => setOrdCreditDueDate(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>

                {/* Recepción */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <PackageCheck className="w-4 h-4 text-emerald-600" />
                    <span>4. Recepción de Mercancía</span>
                  </h4>

                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrdReceivedStatus('PENDIENTE')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        ordReceivedStatus === 'PENDIENTE'
                          ? 'bg-indigo-600 border-indigo-700 text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      Por Llegar
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrdReceivedStatus('RECIBIDA')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        ordReceivedStatus === 'RECIBIDA'
                          ? 'bg-emerald-600 border-emerald-700 text-white shadow-xs'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      Ya se Recibió
                    </button>
                  </div>

                      {ordReceivedStatus === 'RECIBIDA' && (
                    <div className="space-y-2.5 pt-1">
                      <div>
                        <label className="block text-[11px] font-bold text-slate-700 mb-1">
                          ¿Cuándo llegó la mercancía? *
                        </label>
                        <input
                          type="date"
                          required
                          value={ordReceivedDate}
                          onChange={(e) => setOrdReceivedDate(e.target.value)}
                          className="w-full px-3 py-1.5 bg-white border border-slate-300 rounded-xl text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}
                  <p className="text-[11px] text-slate-500 leading-snug">
                    {editingOrder?.stockApplied
                      ? '✓ El stock de esta orden ya fue ingresado al inventario.'
                      : ordApplyStock
                      ? '✓ Los repuestos se ingresarán al inventario inmediatamente al guardar.'
                      : 'Si no activas el ingreso directo arriba, el stock se sumará cuando marques la mercancía como recibida.'}
                  </p>
                </div>
              </div>

              {/* Section 5: Pago y Forma de Pago (Divisas / USDT / Bolívares) */}
              {!editingOrder && (
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                    <Wallet className="w-4 h-4 text-emerald-600" />
                    <span>5. Estado del Pago y Forma de Pago (Divisas / USDT / Bs)</span>
                  </h4>

                  <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setOrdPaymentOption('PENDIENTE')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                        ordPaymentOption === 'PENDIENTE'
                          ? 'bg-amber-100 border-amber-400 text-amber-900'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      Pendiente (Debe 100%)
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrdPaymentOption('ABONO')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                        ordPaymentOption === 'ABONO'
                          ? 'bg-indigo-100 border-indigo-400 text-indigo-900'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      Abono Inicial
                    </button>
                    <button
                      type="button"
                      onClick={() => setOrdPaymentOption('PAGADO')}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold cursor-pointer ${
                        ordPaymentOption === 'PAGADO'
                          ? 'bg-emerald-600 border-emerald-700 text-white'
                          : 'bg-white border-slate-200 text-slate-600'
                      }`}
                    >
                      Ya se Pagó (100%)
                    </button>
                  </div>

                  {ordPaymentOption !== 'PENDIENTE' && (
                    <div className="bg-white rounded-xl border border-slate-200 p-3.5 space-y-3">
                      {ordPaymentOption === 'ABONO' && (
                        <div>
                          <label className="block text-xs font-bold text-slate-700 mb-1">
                            Monto del Abono Inicial ($ USD):
                          </label>
                          <div className="flex items-center gap-3">
                            <input
                              type="number"
                              step="any"
                              min={0}
                              max={ordTotalUSD || undefined}
                              value={ordInitialPaidUSD}
                              onChange={(e) => setOrdInitialPaidUSD(e.target.value)}
                              placeholder="0.00"
                              className="w-40 px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-sm font-mono font-bold text-slate-900"
                            />
                            <span className="text-xs text-slate-500">
                              {ordCurrencyCondition === 'BS_BCV'
                                ? 'Referencia USD (pago en Bs según tasa BCV del día)'
                                : 'Monto en USD ($)'}
                            </span>
                          </div>
                        </div>
                      )}

                      <div>
                        <label className="block text-xs font-bold text-slate-700 mb-1.5">
                          ¿Cómo se pagó?
                        </label>
                        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                          {PAYMENT_CURRENCY_OPTIONS.map((opt) => (
                            <button
                              key={opt.currency}
                              type="button"
                              onClick={() => {
                                setOrdPayCurrency(opt.currency);
                                setOrdPayMethod(opt.defaultMethod);
                              }}
                              className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer flex items-center gap-2.5 ${
                                ordPayCurrency === opt.currency
                                  ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500/30'
                                  : 'bg-slate-50 border-slate-200 hover:bg-white'
                              }`}
                            >
                              {renderCurrencyIcon(opt.currency)}
                              <div>
                                <span className="text-xs font-bold text-slate-900 block">
                                  {opt.label}
                                </span>
                                <span className="text-[10px] text-slate-500">{opt.sublabel}</span>
                              </div>
                            </button>
                          ))}
                        </div>
                      </div>

                      {ordPayCurrency === 'BS' && (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Modalidad en Bolívares:
                          </label>
                          <select
                            value={ordPayMethod}
                            onChange={(e) => setOrdPayMethod(e.target.value)}
                            className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                          >
                            {PAYMENT_CURRENCY_OPTIONS.find((o) => o.currency === 'BS')?.subMethods?.map(
                              (m) => (
                                <option key={m} value={m}>
                                  {m}
                                </option>
                              )
                            )}
                          </select>
                        </div>
                      )}

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Número de Referencia / Comprobante (Opcional)
                        </label>
                        <input
                          type="text"
                          value={ordPayReference}
                          onChange={(e) => setOrdPayReference(e.target.value)}
                          placeholder="Ej: Ref 849302 / Hash USDT"
                          className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                        />
                      </div>
                    </div>
                  )}
                </div>
              )}

              {/* Section 5 (EDIT MODE): Editar, Agregar o Eliminar Pagos y Abonos */}
              {editingOrder && (() => {
                const editedPaidUSD =
                  Math.round(
                    ordPayments.reduce((sum, p) => sum + (Number(p.amountUSD) || 0), 0) * 100
                  ) / 100;
                const editedRemainingUSD = Math.max(
                  0,
                  Math.round((ordTotalUSD - editedPaidUSD) * 100) / 100
                );
                const resultingStatus =
                  editedPaidUSD >= ordTotalUSD - 0.01 && ordTotalUSD > 0
                    ? 'PAGADO'
                    : editedPaidUSD > 0.01
                    ? 'PARCIAL'
                    : 'PENDIENTE';

                return (
                  <div className="bg-slate-50 rounded-2xl border border-slate-200 p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-slate-700 flex items-center gap-1.5">
                        <Wallet className="w-4 h-4 text-emerald-600" />
                        <span>5. Pagos y Abonos Registrados ({ordPayments.length})</span>
                      </h4>
                      <div className="flex flex-wrap items-center gap-1.5">
                        {editedRemainingUSD > 0.01 && (
                          <button
                            type="button"
                            onClick={() => handleAddEditPayment(editedRemainingUSD)}
                            className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                          >
                            <CheckCircle2 className="w-3.5 h-3.5" />
                            <span>Saldar Restante ({formatUSD(editedRemainingUSD)})</span>
                          </button>
                        )}
                        <button
                          type="button"
                          onClick={() => handleAddEditPayment()}
                          className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 text-[11px] font-bold rounded-lg transition-colors cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5 text-emerald-600" />
                          <span>+ Agregar Pago / Abono</span>
                        </button>
                      </div>
                    </div>

                    {/* Live payment balance summary */}
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 text-xs">
                      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Total Orden
                        </span>
                        <span className="font-mono font-bold text-slate-900">
                          {formatUSD(ordTotalUSD)}
                        </span>
                      </div>
                      <div className="bg-emerald-50 border border-emerald-200 rounded-xl px-3 py-2">
                        <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                          Total Abonado
                        </span>
                        <span className="font-mono font-bold text-emerald-800">
                          {formatUSD(editedPaidUSD)}
                        </span>
                      </div>
                      <div className="bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
                        <span className="text-[10px] font-bold uppercase text-amber-800 block">
                          Saldo Pendiente
                        </span>
                        <span className="font-mono font-bold text-amber-900">
                          {formatUSD(editedRemainingUSD)}
                        </span>
                      </div>
                      <div className="bg-white border border-slate-200 rounded-xl px-3 py-2">
                        <span className="text-[10px] font-bold uppercase text-slate-400 block">
                          Estado Resultante
                        </span>
                        <span
                          className={`font-bold text-xs ${
                            resultingStatus === 'PAGADO'
                              ? 'text-emerald-700'
                              : resultingStatus === 'PARCIAL'
                              ? 'text-indigo-700'
                              : 'text-amber-700'
                          }`}
                        >
                          {resultingStatus}
                        </span>
                      </div>
                    </div>

                    {ordPayments.length === 0 ? (
                      <div className="bg-white border border-dashed border-slate-300 rounded-xl p-3 text-center text-xs text-slate-500">
                        Sin pagos registrados (la orden quedará como <strong>PENDIENTE</strong>). Usa <strong>+ Agregar Pago / Abono</strong> si deseas registrar un pago.
                      </div>
                    ) : (
                      <div className="space-y-2">
                        {ordPayments.map((pay, idx) => {
                          const dateVal = pay.date
                            ? pay.date.split('T')[0]
                            : new Date().toISOString().split('T')[0];
                          const bsSubMethods =
                            PAYMENT_CURRENCY_OPTIONS.find((o) => o.currency === 'BS')
                              ?.subMethods || [];

                          return (
                            <div
                              key={pay.id || idx}
                              className="bg-white rounded-xl border border-slate-200 p-3 space-y-2.5"
                            >
                              <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-end">
                                <div className="sm:col-span-3">
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Fecha del Pago
                                  </label>
                                  <input
                                    type="date"
                                    value={dateVal}
                                    onChange={(e) =>
                                      handleUpdateEditPayment(idx, {
                                        date: e.target.value
                                          ? `${e.target.value}T12:00:00.000Z`
                                          : pay.date,
                                      })
                                    }
                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                                  />
                                </div>
                                <div className="sm:col-span-2">
                                  <label className="block text-[10px] font-bold text-emerald-700 mb-0.5">
                                    Monto ($ USD)
                                  </label>
                                  <input
                                    type="number"
                                    step="any"
                                    min={0}
                                    value={pay.amountUSD}
                                    onChange={(e) =>
                                      handleUpdateEditPayment(idx, {
                                        amountUSD: parseFloat(e.target.value) || 0,
                                      })
                                    }
                                    className="w-full px-2 py-1.5 bg-emerald-50 border border-emerald-300 rounded-lg text-xs font-mono font-bold text-emerald-950"
                                  />
                                </div>
                                <div className="sm:col-span-3">
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Moneda
                                  </label>
                                  <select
                                    value={pay.currencyCategory}
                                    onChange={(e) => {
                                      const nextCurr = e.target.value as PurchasePaymentCurrency;
                                      const opt = PAYMENT_CURRENCY_OPTIONS.find(
                                        (o) => o.currency === nextCurr
                                      );
                                      handleUpdateEditPayment(idx, {
                                        currencyCategory: nextCurr,
                                        paymentMethod: opt?.defaultMethod || pay.paymentMethod,
                                      });
                                    }}
                                    className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-medium"
                                  >
                                    {PAYMENT_CURRENCY_OPTIONS.map((opt) => (
                                      <option key={opt.currency} value={opt.currency}>
                                        {opt.label}
                                      </option>
                                    ))}
                                  </select>
                                </div>
                                <div className="sm:col-span-3">
                                  <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                                    Método / Canal
                                  </label>
                                  {pay.currencyCategory === 'BS' ? (
                                    <select
                                      value={pay.paymentMethod}
                                      onChange={(e) =>
                                        handleUpdateEditPayment(idx, {
                                          paymentMethod: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                                    >
                                      {bsSubMethods.map((m) => (
                                        <option key={m} value={m}>
                                          {m}
                                        </option>
                                      ))}
                                      {!bsSubMethods.includes(pay.paymentMethod) && (
                                        <option value={pay.paymentMethod}>
                                          {pay.paymentMethod}
                                        </option>
                                      )}
                                    </select>
                                  ) : (
                                    <input
                                      type="text"
                                      value={pay.paymentMethod}
                                      onChange={(e) =>
                                        handleUpdateEditPayment(idx, {
                                          paymentMethod: e.target.value,
                                        })
                                      }
                                      className="w-full px-2 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                                    />
                                  )}
                                </div>
                                <div className="sm:col-span-1 flex justify-end">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveEditPayment(idx)}
                                    className="p-1.5 text-rose-600 hover:bg-rose-50 border border-transparent hover:border-rose-200 rounded-lg cursor-pointer"
                                    title="Eliminar este pago"
                                  >
                                    <Trash2 className="w-4 h-4" />
                                  </button>
                                </div>
                              </div>

                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                <input
                                  type="text"
                                  value={pay.reference || ''}
                                  onChange={(e) =>
                                    handleUpdateEditPayment(idx, { reference: e.target.value })
                                  }
                                  placeholder="Referencia / Comprobante (opcional)"
                                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono"
                                />
                                <input
                                  type="text"
                                  value={pay.notes || ''}
                                  onChange={(e) =>
                                    handleUpdateEditPayment(idx, { notes: e.target.value })
                                  }
                                  placeholder="Nota del pago (opcional)"
                                  className="w-full px-2.5 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs"
                                />
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                );
              })()}

              <div>
                <label className="block text-xs font-semibold text-slate-600 mb-1">
                  Observaciones de la orden (Opcional)
                </label>
                <textarea
                  rows={2}
                  value={ordNotes}
                  onChange={(e) => setOrdNotes(e.target.value)}
                  placeholder="Notas sobre entrega, garantía o acuerdo con el vendedor..."
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                />
              </div>

              <label className="flex items-center gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-900 cursor-pointer">
                <input
                  type="checkbox"
                  checked={ordNotifyVendorOnSave}
                  onChange={(e) => setOrdNotifyVendorOnSave(e.target.checked)}
                  className="rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>
                  Al guardar, abrir WhatsApp para enviar la factura / orden en PDF al vendedor
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setIsOrderModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm inline-flex items-center gap-2"
                >
                  <Check className="w-4 h-4 text-amber-400" />
                  <span>{editingOrder ? 'Actualizar Orden' : 'Guardar Orden de Compra'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 3: REGISTRAR ABONO / PAGO A PROVEEDOR */}
      {paymentModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]">
            <div className="px-6 py-4 bg-emerald-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <DollarSign className="w-5 h-5" />
                <div>
                  <h3 className="font-bold text-base">
                    Registrar Abono · #{paymentModalOrder.orderNumber}
                  </h3>
                  <p className="text-xs text-emerald-100">
                    {paymentModalOrder.supplierName} ({paymentModalOrder.supplierCode}) · Vendedor:{' '}
                    {paymentModalOrder.vendorName}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPaymentModalOrder(null)}
                className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleConfirmAbono} className="p-6 overflow-y-auto space-y-4">
              {abonoError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs font-medium flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0" />
                  <span>{abonoError}</span>
                </div>
              )}

              {(() => {
                const rem = Math.max(
                  0,
                  Math.round((paymentModalOrder.totalUSD - (paymentModalOrder.paidAmountUSD || 0)) * 100) / 100
                );
                return (
                  <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center justify-between">
                    <div>
                      <span className="text-[11px] font-bold uppercase text-amber-800 block">
                        Saldo Pendiente que se debe
                      </span>
                      <span className="text-xs text-amber-900">
                        Total: {formatUSD(paymentModalOrder.totalUSD)} · Abonado:{' '}
                        {formatUSD(paymentModalOrder.paidAmountUSD || 0)}
                      </span>
                    </div>
                    <div className="text-right">
                      <span className="font-mono font-extrabold text-lg text-amber-900 block">
                        {formatUSD(rem)}
                      </span>
                      <span className="text-[11px] font-semibold text-amber-800">
                        {paymentModalOrder.paymentCurrencyCondition === 'BS_BCV'
                          ? 'Condición: Bs a Tasa BCV (día de pago)'
                          : 'Condición: Divisas ($)'}
                      </span>
                    </div>
                  </div>
                );
              })()}

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">
                    Monto del Abono ($ USD) *
                  </label>
                  <div className="flex items-center gap-1">
                    {[0.25, 0.5, 1].map((pct) => {
                      const rem = Math.max(
                        0,
                        paymentModalOrder.totalUSD - (paymentModalOrder.paidAmountUSD || 0)
                      );
                      return (
                        <button
                          key={pct}
                          type="button"
                          onClick={() => setAbonoAmountUSD((rem * pct).toFixed(2))}
                          className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded cursor-pointer"
                        >
                          {pct === 1 ? 'Todo (100%)' : `${pct * 100}%`}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <input
                  type="number"
                  step="any"
                  min={0}
                  required
                  value={abonoAmountUSD}
                  onChange={(e) => setAbonoAmountUSD(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-base font-mono font-bold text-slate-900 focus:outline-none focus:ring-2 focus:ring-emerald-500"
                />
                {abonoCurrency === 'BS' && (
                  <p className="text-xs font-mono text-emerald-700 font-semibold mt-1">
                    Monto a transferir hoy en Bs (BCV {bcvRate.toFixed(2)}):{' '}
                    {formatBs((parseFloat(abonoAmountUSD) || 0) * bcvRate)}
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1.5">
                  Forma de Pago (Divisas / USDT / Bolívares) *
                </label>
                <div className="grid grid-cols-3 gap-2">
                  {PAYMENT_CURRENCY_OPTIONS.map((opt) => (
                    <button
                      key={opt.currency}
                      type="button"
                      onClick={() => {
                        setAbonoCurrency(opt.currency);
                        setAbonoMethod(opt.defaultMethod);
                      }}
                      className={`p-2.5 rounded-xl border text-left transition-all cursor-pointer ${
                        abonoCurrency === opt.currency
                          ? 'bg-emerald-50 border-emerald-500 ring-1 ring-emerald-500/30'
                          : 'bg-slate-50 border-slate-200 hover:bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-1.5 mb-0.5">
                        {renderCurrencyIcon(opt.currency)}
                        <span className="text-xs font-bold text-slate-900">{opt.label}</span>
                      </div>
                      <span className="text-[10px] text-slate-500 block">{opt.sublabel}</span>
                    </button>
                  ))}
                </div>
              </div>

              {abonoCurrency === 'BS' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Canal en Bolívares:
                  </label>
                  <select
                    value={abonoMethod}
                    onChange={(e) => setAbonoMethod(e.target.value)}
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  >
                    {PAYMENT_CURRENCY_OPTIONS.find((o) => o.currency === 'BS')?.subMethods?.map(
                      (m) => (
                        <option key={m} value={m}>
                          {m}
                        </option>
                      )
                    )}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Referencia / Comprobante
                  </label>
                  <input
                    type="text"
                    value={abonoReference}
                    onChange={(e) => setAbonoReference(e.target.value)}
                    placeholder="Ej: Ref 123456 / Hash"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Nota del abono
                  </label>
                  <input
                    type="text"
                    value={abonoNotes}
                    onChange={(e) => setAbonoNotes(e.target.value)}
                    placeholder="Opcional"
                    className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs"
                  />
                </div>
              </div>

              <label className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs font-semibold text-emerald-950 cursor-pointer">
                <input
                  type="checkbox"
                  checked={abonoNotifyVendor}
                  onChange={(e) => setAbonoNotifyVendor(e.target.checked)}
                  className="mt-0.5 rounded text-emerald-600 focus:ring-emerald-500"
                />
                <span>
                  Notificar inmediatamente al vendedor por WhatsApp ({paymentModalOrder.vendorPhone}) con el abono aplicado, el saldo restante y PDF actualizado.
                </span>
              </label>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setPaymentModalOrder(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl cursor-pointer shadow-sm"
                >
                  Confirmar Abono y Notificar
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL 4: MARCAR MERCANCÍA RECIBIDA */}
      {receiveModalOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="px-5 py-4 bg-indigo-600 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <PackageCheck className="w-5 h-5" />
                <h3 className="font-bold text-sm">
                  Recepción de Mercancía · #{receiveModalOrder.orderNumber}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setReceiveModalOrder(null)}
                className="p-1 text-white/80 hover:text-white cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Fecha de llegada de la mercancía:
                </label>
                <input
                  type="date"
                  value={receiveModalDate}
                  onChange={(e) => setReceiveModalDate(e.target.value)}
                  className="w-full px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs font-mono"
                />
              </div>

              {!receiveModalOrder.stockApplied && (
                <label className="flex items-start gap-2.5 p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-xs text-emerald-950 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={receiveModalApplyStock}
                    onChange={(e) => setReceiveModalApplyStock(e.target.checked)}
                    className="mt-0.5 rounded text-emerald-600"
                  />
                  <span>
                    Sumar automáticamente al <strong>Inventario</strong> los repuestos vinculados de esta orden ({receiveModalOrder.items.length} ítems) y actualizar su precio de costo ($).
                  </span>
                </label>
              )}

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setReceiveModalOrder(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="button"
                  onClick={handleConfirmReceive}
                  className="px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl cursor-pointer"
                >
                  Confirmar Recepción
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 5: DETALLE E HISTORIAL DE ABONOS */}
      {detailOrder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="px-6 py-4 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <h3 className="font-bold text-base">
                  Detalle de Orden #{detailOrder.orderNumber}
                </h3>
                <p className="text-xs text-slate-300">
                  [{detailOrder.supplierCode}] {detailOrder.supplierName} · Vendedor:{' '}
                  {detailOrder.vendorName} ({detailOrder.vendorPhone})
                </p>
              </div>
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="p-1.5 text-slate-300 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 overflow-y-auto space-y-4 text-xs">
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">
                    Total Orden
                  </span>
                  <span className="font-mono font-bold text-sm text-slate-900">
                    {formatUSD(detailOrder.totalUSD)}
                  </span>
                </div>
                <div className="bg-emerald-50 p-3 rounded-xl border border-emerald-200">
                  <span className="text-[10px] text-emerald-700 font-bold uppercase block">
                    Total Pagado
                  </span>
                  <span className="font-mono font-bold text-sm text-emerald-800">
                    {formatUSD(detailOrder.paidAmountUSD || 0)}
                  </span>
                </div>
                <div className="bg-amber-50 p-3 rounded-xl border border-amber-200">
                  <span className="text-[10px] text-amber-800 font-bold uppercase block">
                    Saldo Pendiente
                  </span>
                  <span className="font-mono font-bold text-sm text-amber-900">
                    {formatUSD(Math.max(0, detailOrder.totalUSD - (detailOrder.paidAmountUSD || 0)))}
                  </span>
                </div>
                <div className="bg-slate-50 p-3 rounded-xl border border-slate-200">
                  <span className="text-[10px] text-slate-500 font-bold uppercase block">
                    Recepción
                  </span>
                  <span className="font-bold text-slate-900">
                    {detailOrder.receivedStatus === 'RECIBIDA'
                      ? `Recibida (${detailOrder.receivedDate || 'Sí'})`
                      : 'Pendiente'}
                  </span>
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 px-3.5 py-2.5 rounded-xl border border-slate-200">
                <span className="text-slate-600 font-semibold">
                  Condición: <strong className="text-slate-900">{detailOrder.paymentType === 'CREDITO' ? `A Crédito (${detailOrder.creditDays || 15} días)` : 'De Contado'}</strong>
                </span>
                <span
                  className={`font-bold px-2.5 py-0.5 rounded-md ${
                    detailOrder.paymentCurrencyCondition === 'BS_BCV'
                      ? 'bg-blue-100 text-blue-800'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {detailOrder.paymentCurrencyCondition === 'BS_BCV'
                    ? 'Moneda de Pago: Bs a Tasa BCV (según día de pago)'
                    : 'Moneda de Pago: Divisas ($ USD)'}
                </span>
              </div>

              <div>
                <h4 className="font-bold text-slate-800 mb-2">
                  Historial de Pagos y Abonos ({detailOrder.payments?.length || 0})
                </h4>
                {!detailOrder.payments || detailOrder.payments.length === 0 ? (
                  <p className="text-slate-500 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    No se han registrado abonos todavía en esta orden.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {detailOrder.payments.map((pay) => (
                      <div
                        key={pay.id}
                        className="flex items-center justify-between gap-3 bg-slate-50 p-3 rounded-xl border border-slate-200"
                      >
                        <div>
                          <div className="flex items-center gap-1.5 font-bold text-slate-900">
                            {renderCurrencyIcon(pay.currencyCategory)}
                            <span>{pay.paymentMethod}</span>
                            {pay.reference && (
                              <span className="font-mono text-[11px] text-slate-500">
                                · Ref: {pay.reference}
                              </span>
                            )}
                          </div>
                          <span className="text-[11px] text-slate-500">
                            {new Date(pay.date).toLocaleString('es-VE')}
                            {pay.notes ? ` · ${pay.notes}` : ''}
                          </span>
                        </div>
                        <div className="text-right font-mono">
                          <span className="font-bold text-emerald-700 block">
                            {formatUSD(pay.amountUSD)}
                          </span>
                          {pay.currencyCategory === 'BS' && pay.amountBs > 0 && (
                            <span className="text-[10px] text-slate-500">
                              {formatBs(pay.amountBs)}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>

            <div className="px-6 py-3 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => downloadPurchaseOrderPDF(detailOrder, settings)}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-white hover:bg-slate-100 border border-slate-300 text-slate-800 font-semibold text-xs rounded-xl cursor-pointer"
                >
                  <FileDown className="w-4 h-4" />
                  <span>Descargar PDF</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    const target = detailOrder;
                    setDetailOrder(null);
                    openEditOrderModal(target);
                  }}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-50 hover:bg-amber-100 border border-amber-300 text-amber-900 font-bold text-xs rounded-xl cursor-pointer"
                >
                  <Edit3 className="w-4 h-4 text-amber-700" />
                  <span>Editar Orden</span>
                </button>
              </div>
              <button
                type="button"
                onClick={() => setDetailOrder(null)}
                className="px-4 py-2 bg-slate-900 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Cerrar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 6: CONFIRMAR ELIMINACIÓN */}
      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-sm p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-600">
              <AlertTriangle className="w-6 h-6 shrink-0" />
              <h3 className="font-bold text-base text-slate-900">
                ¿Eliminar {confirmDelete.type === 'order' ? 'Orden de Compra' : 'Proveedor'}?
              </h3>
            </div>
            <p className="text-xs text-slate-600">
              Estás por eliminar permanentemente <strong>{confirmDelete.label}</strong>. Esta acción no se puede deshacer.
            </p>
            <div className="flex justify-end gap-2 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  if (confirmDelete.type === 'order') {
                    deletePurchaseOrder(confirmDelete.id);
                  } else {
                    deleteSupplier(confirmDelete.id);
                  }
                  setConfirmDelete(null);
                }}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-xl cursor-pointer"
              >
                Sí, Eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL 7: IMPORTAR ORDEN DE COMPRA DESDE EXCEL */}
      <ImportPurchaseOrderExcelModal
        isOpen={isImportExcelModalOpen}
        onClose={() => setIsImportExcelModalOpen(false)}
        existingProducts={products}
        suppliers={suppliers}
        hasExistingOrderItems={ordItems.length > 0}
        onImportConfirmed={handleExcelOrderImported}
      />
    </div>
  );
};
