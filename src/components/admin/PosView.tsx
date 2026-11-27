import React, { useState, useMemo, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Product,
  productTracksInventory,
  DEFAULT_PRODUCTION_TIME_LABEL,
  getProductUnitInfo,
  PaymentMethod,
  PagoMovilAccountOption,
  SaleItem,
  SalePaymentType,
  SalePaymentSplit,
  SaleSplitCondition,
  PaymentCurrencyMode,
  ProductCategory,
  OpenAccount,
} from '../../types';
import { formatUSD, formatBs, buildInvoiceWhatsAppMessage, buildMercadoLibreDebtWhatsAppMessage } from '../../utils/whatsapp';
import {
  OpenAccountsPanel,
  OpenAccountDetailModal,
  SettleOpenAccountModal,
  buildOpenAccountWhatsAppMessage,
} from './OpenAccountsModals';
import {
  Search,
  ShoppingCart,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  Printer,
  MessageSquare,
  User,
  Phone,
  CreditCard,
  Percent,
  FileText,
  Boxes,
  TrendingUp,
  Barcode,
  Banknote,
  Building2,
  Calendar,
  Clock,
  Package,
  PackagePlus,
  ExternalLink,
  Bell,
  DollarSign,
  Edit3,
  RotateCcw,
  X,
  Save,
  Tag,
  AlertCircle,
  MapPin,
  BookmarkCheck,
  Layers,
  ArrowLeftRight,
  Truck,
  ClipboardList,
  Wrench,
  Bike,
} from 'lucide-react';

const OTHER_VENEZUELAN_STATES = [
  'Distrito Capital',
  'Miranda',
  'Carabobo',
  'Zulia',
  'Lara',
  'Aragua',
  'Táchira',
  'Trujillo',
  'Barinas',
  'Anzoátegui',
  'Bolívar',
  'Falcón',
  'Portuguesa',
  'Yaracuy',
  'Sucre',
  'Monagas',
  'Nueva Esparta',
  'Guárico',
  'Cojedes',
  'Apure',
  'La Guaira',
  'Amazonas',
  'Delta Amacuro',
  'Otro Estado (Fuera de Mérida)',
];

const SHIPPING_AGENCY_OPTIONS = ['MRW', 'ZOOM', 'TEALCA', 'DOMESA', 'Liberty Express', 'Otro'];

export interface PosCartItem {
  product: Product;
  quantity: number;
  customPrice?: number | string;
}

export const PosView: React.FC = () => {
  const {
    products,
    categories: productCategories,
    addCategory,
    customers,
    createSale,
    addProduct,
    updateProduct,
    settings,
    setWhatsappModalData,
    setSelectedInvoice,
    pendingMercadoLibreSales,
    mercadolibreDebtUSD,
    openAccounts,
    openCustomerAccount,
    addItemsToOpenAccount,
    updateOpenAccountItem,
    removeOpenAccountItem,
    updateOpenAccountMeta,
    cancelOpenAccount,
    settleOpenAccount,
  } = useApp();

  const [productSearch, setProductSearch] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [posCart, setPosCart] = useState<PosCartItem[]>([]);

  // Customer form (Venezuela)
  const [selectedCustomerId, setSelectedCustomerId] = useState<string>('');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [customerDocument, setCustomerDocument] = useState('');

  // Customer autocomplete search state
  const [customerSearchQuery, setCustomerSearchQuery] = useState('');
  const [activeSuggestionSource, setActiveSuggestionSource] = useState<'search' | 'name' | 'document' | null>(null);
  const [highlightedCustomerIdx, setHighlightedCustomerIdx] = useState<number>(0);
  const customerBoxRef = useRef<HTMLDivElement | null>(null);
  const customerSearchInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (customerBoxRef.current && !customerBoxRef.current.contains(e.target as Node)) {
        setActiveSuggestionSource(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // Helper for effective unit price in cart (permite modificar el precio de venta)
  const getItemEffectivePrice = (item: PosCartItem): number => {
    if (item.customPrice !== undefined && item.customPrice !== '') {
      const val = Number(item.customPrice);
      return isNaN(val) || val < 0 ? 0 : val;
    }
    return item.product.salePrice;
  };

  const handleUpdateUnitPrice = (productId: string, val: string) => {
    setPosCart((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          return { ...item, customPrice: val };
        }
        return item;
      })
    );
  };

  const handleResetUnitPrice = (productId: string) => {
    setPosCart((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          return { ...item, customPrice: undefined };
        }
        return item;
      })
    );
  };

  // Helper for credit due date
  const getDefaultDueDate = (days: number = 15) => {
    const d = new Date();
    d.setDate(d.getDate() + days);
    return d.toISOString().split('T')[0];
  };

  // Sale metadata
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Pago Móvil');
  const [pagoMovilAccount, setPagoMovilAccount] =
    useState<PagoMovilAccountOption>('BANESCO_PERSONAL');
  const [discountUSD, setDiscountUSD] = useState<number>(0);
  const [saleNotes, setSaleNotes] = useState('');

  // Gastos de Envío Nacional (Ventas a otros estados distintos a Mérida)
  const [hasShipping, setHasShipping] = useState<boolean>(false);
  const [shippingCurrencyMode, setShippingCurrencyMode] = useState<PaymentCurrencyMode>('USD');
  const [shippingCostUSDInput, setShippingCostUSDInput] = useState<string>('');
  const [shippingCostBsInput, setShippingCostBsInput] = useState<string>('');
  const [shippingState, setShippingState] = useState<string>('Distrito Capital');
  const [shippingAgency, setShippingAgency] = useState<string>('MRW');
  const [shippingNotes, setShippingNotes] = useState<string>('');

  // Condición de Venta: De Contado, Pago Mixto, A Crédito, Apartado, MercadoLibre o Abrir Cuenta del Día
  const [paymentType, setPaymentType] = useState<SalePaymentType>('CONTADO');
  const [isOpenAccountMode, setIsOpenAccountMode] = useState<boolean>(false);
  const [openAccountSubMode, setOpenAccountSubMode] = useState<'NUEVA' | 'SUMAR'>('NUEVA');
  const [targetOpenAccountId, setTargetOpenAccountId] = useState<string | null>(null);
  const [openAccountWorkshop, setOpenAccountWorkshop] = useState<string>('');
  const [openAccountMoto, setOpenAccountMoto] = useState<string>('');
  const [openAccountPickupNote, setOpenAccountPickupNote] = useState<string>('');
  const [inspectingAccountId, setInspectingAccountId] = useState<string | null>(null);
  const [settlingAccountId, setSettlingAccountId] = useState<string | null>(null);

  const activeOpenAccounts = useMemo(
    () => openAccounts.filter((a) => a.status === 'ABIERTA'),
    [openAccounts]
  );
  const targetOpenAccount = useMemo(
    () => activeOpenAccounts.find((a) => a.id === targetOpenAccountId) || null,
    [activeOpenAccounts, targetOpenAccountId]
  );
  const inspectingAccount = useMemo(
    () => openAccounts.find((a) => a.id === inspectingAccountId) || null,
    [openAccounts, inspectingAccountId]
  );
  const settlingAccount = useMemo(
    () => activeOpenAccounts.find((a) => a.id === settlingAccountId) || null,
    [activeOpenAccounts, settlingAccountId]
  );
  const [creditDays, setCreditDays] = useState<number>(15);
  const [creditDueDate, setCreditDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 15);
    return d.toISOString().split('T')[0];
  });
  const [creditPaidAmount, setCreditPaidAmount] = useState<string>('');
  const [creditPaidAmountBs, setCreditPaidAmountBs] = useState<string>('');
  const [creditPaidCurrencyMode, setCreditPaidCurrencyMode] = useState<PaymentCurrencyMode>('BS');

  // Estado de Desglose para Pago Mixto (2 o más formas de pago simultáneas, Contado y/o Crédito)
  type MixtoCurrencyMode = 'BS' | 'USD';
  const isBsPaymentMethod = (method: PaymentMethod): boolean =>
    method === 'Pago Móvil' ||
    method === 'Efectivo Bs' ||
    method === 'Punto de Venta (Bs)' ||
    method === 'Transferencia Bancaria Bs';

  interface MixtoSplitDraft {
    id: string;
    splitType: SaleSplitCondition;
    currencyMode: MixtoCurrencyMode;
    paymentMethod: PaymentMethod;
    pagoMovilAccount: PagoMovilAccountOption;
    amountUSD: string;
    amountBs: string;
    reference: string;
  }
  const createDefaultMixtoSplits = (): MixtoSplitDraft[] => [
    {
      id: `mix-1-${Date.now()}`,
      splitType: 'CONTADO',
      currencyMode: 'BS',
      paymentMethod: 'Pago Móvil',
      pagoMovilAccount: 'BANESCO_PERSONAL',
      amountUSD: '',
      amountBs: '',
      reference: '',
    },
    {
      id: `mix-2-${Date.now()}`,
      splitType: 'CONTADO',
      currencyMode: 'USD',
      paymentMethod: 'Dólares Efectivo (USD)',
      pagoMovilAccount: 'BANESCO_PERSONAL',
      amountUSD: '',
      amountBs: '',
      reference: '',
    },
  ];
  const [mixtoSplits, setMixtoSplits] = useState<MixtoSplitDraft[]>(() => createDefaultMixtoSplits());

  // MercadoLibre Commission State
  const [mlCommissionMode, setMlCommissionMode] = useState<'PERCENT' | 'FIXED'>('PERCENT');
  const [mlCommissionRate, setMlCommissionRate] = useState<number | ''>(11);
  const [mlCommissionUSD, setMlCommissionUSD] = useState<number | ''>('');
  const [lastMlNotification, setLastMlNotification] = useState<{ message: string; url: string; debtUSD: number } | null>(null);

  // Manual service/labor entry (in USD)
  const [customServiceName, setCustomServiceName] = useState('');
  const [customServicePriceUSD, setCustomServicePriceUSD] = useState<number | ''>('');
  const [showCustomService, setShowCustomService] = useState(false);

  // Estado para registro de repuesto NO registrado sobre la marcha
  const [showQuickRegisterModal, setShowQuickRegisterModal] = useState(false);
  const [quickName, setQuickName] = useState('');
  const [quickCategory, setQuickCategory] = useState<ProductCategory>('Motor');
  const [isAddingQuickCategory, setIsAddingQuickCategory] = useState(false);
  const [newQuickCategoryName, setNewQuickCategoryName] = useState('');
  const [quickPriceUSD, setQuickPriceUSD] = useState<number | ''>('');
  const [quickCostUSD, setQuickCostUSD] = useState<number | ''>('');
  const [quickQuantityToSell, setQuickQuantityToSell] = useState<number>(1);
  const [quickStock, setQuickStock] = useState<number | ''>(1);
  const [quickBrand, setQuickBrand] = useState('');
  const [quickCompatibility, setQuickCompatibility] = useState('');
  const [quickLocation, setQuickLocation] = useState('');
  const [quickSku, setQuickSku] = useState('');
  const [quickBarcode, setQuickBarcode] = useState('');
  const [quickSaveToCatalog, setQuickSaveToCatalog] = useState(true);
  const [quickFormError, setQuickFormError] = useState<string | null>(null);

  // Estado para edición rápida de repuesto (desde el carrito o catálogo en POS)
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<ProductCategory>('Motor');
  const [isAddingEditCategory, setIsAddingEditCategory] = useState(false);
  const [newEditCategoryName, setNewEditCategoryName] = useState('');
  const [editPriceUSD, setEditPriceUSD] = useState<number | ''>('');
  const [editCostUSD, setEditCostUSD] = useState<number | ''>('');
  const [editStock, setEditStock] = useState<number | ''>(1);
  const [editBrand, setEditBrand] = useState('');
  const [editCompatibility, setEditCompatibility] = useState('');
  const [editLocation, setEditLocation] = useState('');
  const [editSku, setEditSku] = useState('');
  const [editBarcode, setEditBarcode] = useState('');
  const [editFormError, setEditFormError] = useState<string | null>(null);

  const duplicateQuickSkuProduct = useMemo(() => {
    const q = quickSku.trim().toLowerCase();
    if (!q) return null;
    return products.find((p) => (p.sku || '').trim().toLowerCase() === q) || null;
  }, [products, quickSku]);

  const duplicateEditSkuProduct = useMemo(() => {
    const q = editSku.trim().toLowerCase();
    if (!q || !editingProduct) return null;
    return (
      products.find((p) => p.id !== editingProduct.id && (p.sku || '').trim().toLowerCase() === q) ||
      null
    );
  }, [products, editSku, editingProduct]);

  // Toast de notificación y error de validación en POS
  const [posToast, setPosToast] = useState<{ message: string; type: 'success' | 'info' | 'error' } | null>(null);
  const [posFormError, setPosFormError] = useState<string | null>(null);
  const [isSubmittingSale, setIsSubmittingSale] = useState(false);
  const isSubmittingSaleRef = useRef(false);

  const showToast = (message: string, type: 'success' | 'info' | 'error' = 'success') => {
    setPosToast({ message, type });
    setTimeout(() => setPosToast(null), 4500);
  };

  const handleOpenQuickRegister = (initialName: string = '') => {
    let generatedSku = `REP-${Math.floor(1000 + Math.random() * 9000)}`;
    while (products.some((p) => (p.sku || '').trim().toLowerCase() === generatedSku.toLowerCase())) {
      generatedSku = `REP-${Math.floor(1000 + Math.random() * 9000)}`;
    }
    setQuickName(initialName || productSearch || '');
    setQuickCategory('Motor');
    setIsAddingQuickCategory(false);
    setNewQuickCategoryName('');
    setQuickPriceUSD('');
    setQuickCostUSD('');
    setQuickQuantityToSell(1);
    setQuickStock(1);
    setQuickBrand('');
    setQuickCompatibility('');
    setQuickLocation('');
    setQuickSku(generatedSku);
    setQuickBarcode('');
    setQuickSaveToCatalog(true);
    setQuickFormError(null);
    setShowQuickRegisterModal(true);
  };

  const handleCreateQuickCategory = () => {
    const trimmed = newQuickCategoryName.trim();
    if (!trimmed) return;
    const res = addCategory(trimmed);
    setQuickCategory(res.category);
    setIsAddingQuickCategory(false);
    setNewQuickCategoryName('');
    showToast(`Categoría "${res.category}" seleccionada.`);
  };

  const handleCreateEditCategory = () => {
    const trimmed = newEditCategoryName.trim();
    if (!trimmed) return;
    const res = addCategory(trimmed);
    setEditCategory(res.category);
    setIsAddingEditCategory(false);
    setNewEditCategoryName('');
    showToast(`Categoría "${res.category}" seleccionada.`);
  };

  const handleSaveQuickProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!quickName.trim()) {
      setQuickFormError('Ingresa el nombre del repuesto.');
      return;
    }
    const priceNum = Number(quickPriceUSD);
    if (isNaN(priceNum) || priceNum <= 0) {
      setQuickFormError('Ingresa un precio de venta válido en dólares ($ USD).');
      return;
    }

    const qtyToSell = Math.max(1, Number(quickQuantityToSell) || 1);
    const initialStock = Math.max(qtyToSell, Number(quickStock || qtyToSell));
    const finalSku = quickSku.trim() || `REP-${Math.floor(1000 + Math.random() * 9000)}`;

    const existingDup = products.find(
      (p) => (p.sku || '').trim().toLowerCase() === finalSku.toLowerCase()
    );
    if (existingDup) {
      setQuickFormError(
        `⚠️ El código SKU "${finalSku}" ya está registrado en el inventario (${existingDup.name} • Stock: ${existingDup.stock}). No se permiten códigos repetidos.`
      );
      return;
    }
    setQuickFormError(null);

    let finalQuickCategory = quickCategory;
    if (isAddingQuickCategory && newQuickCategoryName.trim()) {
      finalQuickCategory = addCategory(newQuickCategoryName).category;
    }

    let targetProduct: Product;

    if (quickSaveToCatalog) {
      targetProduct = addProduct({
        sku: finalSku,
        name: quickName.trim(),
        category: finalQuickCategory,
        description: quickCompatibility.trim() ? `Compatibilidad: ${quickCompatibility.trim()}` : '',
        costPrice: quickCostUSD !== '' ? Number(quickCostUSD) : 0,
        salePrice: priceNum,
        stock: initialStock,
        minStock: 2,
        brand: quickBrand.trim() || 'Genérico',
        compatibility: quickCompatibility.trim() || 'Universal',
        warehouseLocation: quickLocation.trim() || undefined,
        imageUrl: '',
        barcode: quickBarcode.trim() || undefined,
      });
      showToast(`¡Repuesto "${targetProduct.name}" registrado en inventario y agregado al ticket!`);
    } else {
      targetProduct = {
        id: `temp-prod-${Date.now()}`,
        sku: finalSku,
        name: quickName.trim(),
        category: finalQuickCategory,
        description: quickCompatibility.trim() ? `Compatibilidad: ${quickCompatibility.trim()}` : '',
        costPrice: quickCostUSD !== '' ? Number(quickCostUSD) : 0,
        salePrice: priceNum,
        stock: qtyToSell,
        minStock: 0,
        brand: quickBrand.trim() || 'Genérico',
        compatibility: quickCompatibility.trim() || 'Universal',
        warehouseLocation: quickLocation.trim() || undefined,
        imageUrl: '',
        barcode: quickBarcode.trim() || undefined,
      };
      showToast(`¡Repuesto puntual "${targetProduct.name}" agregado al ticket de venta!`);
    }

    // Agregar directamente al carrito del POS
    setPosCart((prev) => {
      const existing = prev.find((item) => item.product.id === targetProduct.id);
      if (existing) {
        return prev.map((item) =>
          item.product.id === targetProduct.id
            ? { ...item, quantity: item.quantity + qtyToSell, customPrice: priceNum }
            : item
        );
      }
      return [...prev, { product: targetProduct, quantity: qtyToSell, customPrice: priceNum }];
    });

    setShowQuickRegisterModal(false);
  };

  const handleOpenEditProduct = (product: Product, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setEditingProduct(product);
    setEditFormError(null);
    setEditName(product.name);
    setEditCategory(product.category);
    setIsAddingEditCategory(false);
    setNewEditCategoryName('');
    // Verificar si el carrito tiene un precio unitario modificado
    const cartItem = posCart.find((i) => i.product.id === product.id);
    const effectivePrice =
      cartItem?.customPrice !== undefined && cartItem?.customPrice !== ''
        ? Number(cartItem.customPrice)
        : product.salePrice;
    setEditPriceUSD(effectivePrice);
    setEditCostUSD(product.costPrice || '');
    setEditStock(product.stock ?? 1);
    setEditBrand(product.brand || '');
    setEditCompatibility(product.compatibility || '');
    setEditLocation(product.warehouseLocation || '');
    setEditSku(product.sku || '');
    setEditBarcode(product.barcode || '');
  };

  const handleSaveEditProduct = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingProduct) return;
    if (!editName.trim()) {
      setEditFormError('Ingresa el nombre del repuesto.');
      return;
    }
    const newPrice = Number(editPriceUSD);
    if (isNaN(newPrice) || newPrice < 0) {
      setEditFormError('Ingresa un precio de venta válido.');
      return;
    }
    const finalSku = editSku.trim() || editingProduct.sku;
    const existingDup = products.find(
      (p) =>
        p.id !== editingProduct.id &&
        (p.sku || '').trim().toLowerCase() === finalSku.toLowerCase()
    );
    if (existingDup) {
      setEditFormError(
        `⚠️ El código SKU "${finalSku}" ya está registrado en otro repuesto (${existingDup.name}). No se permiten códigos repetidos.`
      );
      return;
    }
    setEditFormError(null);

    let finalEditCategory = editCategory;
    if (isAddingEditCategory && newEditCategoryName.trim()) {
      finalEditCategory = addCategory(newEditCategoryName).category;
    }

    const updates: Partial<Product> = {
      name: editName.trim(),
      category: finalEditCategory,
      salePrice: newPrice,
      costPrice: editCostUSD !== '' ? Number(editCostUSD) : 0,
      stock: editStock !== '' ? Number(editStock) : editingProduct.stock,
      brand: editBrand.trim() || 'Genérico',
      compatibility: editCompatibility.trim() || 'Universal',
      warehouseLocation: editLocation.trim() || undefined,
      sku: finalSku,
      barcode: editBarcode.trim() || undefined,
    };

    // Si el repuesto está registrado en el catálogo permanente de inventario, actualizarlo
    const isInCatalog = products.some((p) => p.id === editingProduct.id);
    if (isInCatalog) {
      updateProduct(editingProduct.id, updates);
    }

    // Actualizar también en el carrito del POS
    setPosCart((prev) =>
      prev.map((item) => {
        if (item.product.id === editingProduct.id) {
          return {
            ...item,
            product: {
              ...item.product,
              ...updates,
            },
            customPrice: newPrice,
          };
        }
        return item;
      })
    );

    showToast(`¡Repuesto "${editName}" actualizado con éxito!`);
    setEditingProduct(null);
  };

  const rate = settings.bcvRate;

  // Filter products for POS (sorted alphabetically A-Z)
  const filteredProducts = useMemo(() => {
    const filtered = products.filter((prod) => {
      if (selectedCategory !== 'all' && prod.category !== selectedCategory) return false;
      if (!productSearch.trim()) return true;
      const q = productSearch.toLowerCase();
      return (
        prod.name.toLowerCase().includes(q) ||
        (prod.description && prod.description.toLowerCase().includes(q)) ||
        prod.sku.toLowerCase().includes(q) ||
        (prod.barcode && prod.barcode.toLowerCase().includes(q)) ||
        (prod.warehouseLocation && prod.warehouseLocation.toLowerCase().includes(q)) ||
        prod.brand.toLowerCase().includes(q) ||
        prod.compatibility.toLowerCase().includes(q)
      );
    });

    return [...filtered].sort((a, b) =>
      a.name.trim().localeCompare(b.name.trim(), 'es', { sensitivity: 'base', numeric: true })
    );
  }, [products, selectedCategory, productSearch]);

  const normalizeText = (val?: string) =>
    (val || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '');

  const normalizeDocDigits = (val?: string) => (val || '').replace(/[^a-zA-Z0-9]/g, '').toLowerCase();

  const filterCustomerSuggestions = (query: string) => {
    const qText = normalizeText(query);
    const qDigits = normalizeDocDigits(query);
    if (!qText && !qDigits) {
      return [...customers].sort((a, b) => a.name.localeCompare(b.name, 'es')).slice(0, 8);
    }

    const scored = customers
      .map((c) => {
        const nameNorm = normalizeText(c.name);
        const docNorm = normalizeText(c.documentId);
        const docDigits = normalizeDocDigits(c.documentId);
        const phoneDigits = normalizeDocDigits(c.phone);

        let score = 0;
        if (qDigits && docDigits) {
          if (docDigits === qDigits) score = 100;
          else if (docDigits.startsWith(qDigits)) score = 90;
          else if (docDigits.includes(qDigits)) score = 70;
        }
        if (score === 0 && qText && docNorm.includes(qText)) {
          score = 65;
        }
        if (qText && nameNorm) {
          if (nameNorm === qText) score = Math.max(score, 100);
          else if (nameNorm.startsWith(qText)) score = Math.max(score, 85);
          else if (nameNorm.split(/\s+/).some((w) => w.startsWith(qText))) score = Math.max(score, 75);
          else if (nameNorm.includes(qText)) score = Math.max(score, 60);
        }
        if (score === 0 && qDigits && phoneDigits.includes(qDigits)) {
          score = 50;
        }
        return { customer: c, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.customer.name.localeCompare(b.customer.name, 'es'));

    return scored.slice(0, 8).map((entry) => entry.customer);
  };

  const activeCustomerQuery =
    activeSuggestionSource === 'search'
      ? customerSearchQuery
      : activeSuggestionSource === 'name'
      ? customerName
      : activeSuggestionSource === 'document'
      ? customerDocument
      : '';

  const customerSuggestions = useMemo(
    () => filterCustomerSuggestions(activeCustomerQuery),
    [customers, activeCustomerQuery]
  );

  useEffect(() => {
    setHighlightedCustomerIdx(0);
  }, [activeCustomerQuery, activeSuggestionSource]);

  const handleSelectCustomer = (id: string) => {
    setSelectedCustomerId(id);
    if (!id) {
      setCustomerName('');
      setCustomerPhone('');
      setCustomerDocument('');
      setCustomerSearchQuery('');
      setActiveSuggestionSource(null);
      return;
    }
    const found = customers.find((c) => c.id === id);
    if (found) {
      setCustomerName(found.name);
      setCustomerPhone(found.phone || '');
      setCustomerDocument(found.documentId || '');
      setCustomerSearchQuery('');
      setActiveSuggestionSource(null);
      if (found.state) {
        const normalizedCustomerState = found.state
          .trim()
          .toLowerCase()
          .normalize('NFD')
          .replace(/[\u0300-\u036f]/g, '');
        if (normalizedCustomerState && normalizedCustomerState !== 'merida') {
          const matchedState = OTHER_VENEZUELAN_STATES.find(
            (st) =>
              st
                .toLowerCase()
                .normalize('NFD')
                .replace(/[\u0300-\u036f]/g, '') === normalizedCustomerState
          );
          if (matchedState) {
            setShippingState(matchedState);
          }
        }
      }
    }
  };

  const handleCustomerInputKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!activeSuggestionSource || customerSuggestions.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedCustomerIdx((prev) => (prev + 1) % customerSuggestions.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedCustomerIdx((prev) => (prev - 1 + customerSuggestions.length) % customerSuggestions.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = customerSuggestions[highlightedCustomerIdx] || customerSuggestions[0];
      if (target) {
        handleSelectCustomer(target.id);
      }
    } else if (e.key === 'Escape') {
      setActiveSuggestionSource(null);
    }
  };

  const handleSetQuickWalkInCustomer = () => {
    setSelectedCustomerId('');
    setCustomerName('Cliente Mostrador');
    setCustomerPhone('');
    setCustomerDocument('V-00000000');
    setCustomerSearchQuery('');
    setActiveSuggestionSource(null);
  };

  const handleClearCustomer = () => {
    setSelectedCustomerId('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerDocument('');
    setCustomerSearchQuery('');
    setActiveSuggestionSource(null);
  };

  const handleAddToCart = (product: Product) => {
    setPosFormError(null);
    const tracksInv = productTracksInventory(product);
    if (tracksInv && product.stock <= 0) {
      showToast(`El repuesto ${product.name} no cuenta con stock disponible.`, 'error');
      return;
    }

    setPosCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        if (tracksInv && existing.quantity >= product.stock) {
          showToast(`Stock máximo disponible alcanzado: ${product.stock}`, 'error');
          return prev;
        }
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: item.quantity + 1 } : item
        );
      }
      return [...prev, { product, quantity: 1 }];
    });
  };

  const handleUpdateQty = (productId: string, delta: number) => {
    setPosCart((prev) => {
      return prev
        .map((item) => {
          if (item.product.id === productId) {
            const newQty = item.quantity + delta;
            if (newQty <= 0) return null;
            if (productTracksInventory(item.product) && newQty > item.product.stock) {
              showToast(`Stock máximo disponible alcanzado: ${item.product.stock}`, 'error');
              return item;
            }
            return { ...item, quantity: newQty };
          }
          return item;
        })
        .filter(Boolean) as PosCartItem[];
    });
  };

  const handleRemoveFromCart = (productId: string) => {
    setPosCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const handleAddCustomService = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customServiceName || !customServicePriceUSD || Number(customServicePriceUSD) <= 0) return;

    const pseudoProduct: Product = {
      id: `custom-srv-${Date.now()}`,
      sku: 'MAN-OBRA',
      name: customServiceName,
      category: 'Motor',
      description: 'Mano de obra o servicio de taller en Venezuela',
      costPrice: 0,
      salePrice: Number(customServicePriceUSD),
      stock: 9999,
      minStock: 0,
      brand: 'Servimotos Taller',
      compatibility: 'Mano de obra',
      imageUrl: '',
    };

    setPosCart((prev) => [...prev, { product: pseudoProduct, quantity: 1, customPrice: Number(customServicePriceUSD) }]);
    setCustomServiceName('');
    setCustomServicePriceUSD('');
    setShowCustomService(false);
  };

  // Cálculos de Gastos de Envío Nacional (USD o Bs exacto a tasa BCV)
  const handleChangeShippingUSD = (rawVal: string) => {
    setShippingCostUSDInput(rawVal);
    const parsed = parseFloat(rawVal);
    if (rawVal === '' || Number.isNaN(parsed) || parsed < 0) {
      setShippingCostBsInput('');
      return;
    }
    const equivBs = Math.round(parsed * rate * 100) / 100;
    setShippingCostBsInput(equivBs > 0 ? equivBs.toFixed(2) : '');
  };

  const handleChangeShippingBs = (rawVal: string) => {
    setShippingCostBsInput(rawVal);
    const parsed = parseFloat(rawVal);
    if (rawVal === '' || Number.isNaN(parsed) || parsed < 0) {
      setShippingCostUSDInput('');
      return;
    }
    const equivUSD = rate > 0 ? Math.round((parsed / rate) * 100) / 100 : 0;
    setShippingCostUSDInput(equivUSD > 0 ? equivUSD.toFixed(2) : '');
  };

  const handleSelectShippingCurrencyMode = (nextMode: PaymentCurrencyMode) => {
    setShippingCurrencyMode(nextMode);
    if (nextMode === 'BS') {
      const curUSD = parseFloat(shippingCostUSDInput);
      const curBs = parseFloat(shippingCostBsInput);
      if ((Number.isNaN(curBs) || curBs <= 0) && !Number.isNaN(curUSD) && curUSD > 0) {
        setShippingCostBsInput((Math.round(curUSD * rate * 100) / 100).toFixed(2));
      }
    } else {
      const curBs = parseFloat(shippingCostBsInput);
      const curUSD = parseFloat(shippingCostUSDInput);
      if ((Number.isNaN(curUSD) || curUSD <= 0) && !Number.isNaN(curBs) && curBs > 0 && rate > 0) {
        setShippingCostUSDInput((Math.round((curBs / rate) * 100) / 100).toFixed(2));
      }
    }
  };

  const shippingCostUSD = useMemo(() => {
    if (!hasShipping) return 0;
    const parsedUSD = parseFloat(shippingCostUSDInput);
    if (!Number.isNaN(parsedUSD) && parsedUSD > 0) {
      return Math.round(parsedUSD * 100) / 100;
    }
    const parsedBs = parseFloat(shippingCostBsInput);
    if (!Number.isNaN(parsedBs) && parsedBs > 0 && rate > 0) {
      return Math.round((parsedBs / rate) * 100) / 100;
    }
    return 0;
  }, [hasShipping, shippingCostUSDInput, shippingCostBsInput, rate]);

  const shippingCostBs = useMemo(() => {
    if (!hasShipping) return 0;
    const parsedBs = parseFloat(shippingCostBsInput);
    if (shippingCurrencyMode === 'BS' && !Number.isNaN(parsedBs) && parsedBs > 0) {
      return Math.round(parsedBs * 100) / 100;
    }
    return Math.round(shippingCostUSD * rate * 100) / 100;
  }, [hasShipping, shippingCurrencyMode, shippingCostBsInput, shippingCostUSD, rate]);

  // Totals calculations (El precio de los repuestos en el carrito, considerando precio modificado si aplica)
  const subtotalUSD = posCart.reduce((sum, item) => sum + getItemEffectivePrice(item) * item.quantity, 0);
  const baseTotalUSD = Math.max(0, subtotalUSD - discountUSD);

  const computedMlCommissionUSD = useMemo(() => {
    if (paymentType !== 'MERCADOLIBRE') return 0;
    if (mlCommissionMode === 'PERCENT') {
      const rateVal = Number(mlCommissionRate || 0);
      return Math.round(((baseTotalUSD * rateVal) / 100) * 100) / 100;
    }
    return Math.round(Number(mlCommissionUSD || 0) * 100) / 100;
  }, [paymentType, mlCommissionMode, mlCommissionRate, mlCommissionUSD, baseTotalUSD]);

  // Si la condición es MercadoLibre, el monto que cobra MercadoLibre se agrega ADICIONAL al precio registrado.
  // Si se activan Gastos de Envío a otro estado, también se suman al total de la venta.
  const preShippingTotalUSD =
    paymentType === 'MERCADOLIBRE' ? baseTotalUSD + computedMlCommissionUSD : baseTotalUSD;
  const totalUSD = Math.round((preShippingTotalUSD + shippingCostUSD) * 100) / 100;

  const subtotalBs = subtotalUSD * rate;
  const totalBs = Math.round((preShippingTotalUSD * rate + shippingCostBs) * 100) / 100;
  const totalCartUnits = posCart.reduce((sum, item) => sum + item.quantity, 0);

  const hasMixtoCreditSplit =
    paymentType === 'MIXTO' && mixtoSplits.some((sp) => sp.splitType === 'CREDITO');
  const mixtoCashTotalUSD = useMemo(() => {
    if (paymentType !== 'MIXTO') return 0;
    return (
      Math.round(
        mixtoSplits
          .filter((sp) => sp.splitType !== 'CREDITO')
          .reduce((sum, sp) => sum + (parseFloat(sp.amountUSD) || 0), 0) * 100
      ) / 100
    );
  }, [paymentType, mixtoSplits]);
  const mixtoCreditTotalUSD = useMemo(() => {
    if (paymentType !== 'MIXTO') return 0;
    return (
      Math.round(
        mixtoSplits
          .filter((sp) => sp.splitType === 'CREDITO')
          .reduce((sum, sp) => sum + (parseFloat(sp.amountUSD) || 0), 0) * 100
      ) / 100
    );
  }, [paymentType, mixtoSplits]);
  const mixtoCashBsUSD = useMemo(() => {
    if (paymentType !== 'MIXTO') return 0;
    return (
      Math.round(
        mixtoSplits
          .filter(
            (sp) =>
              sp.splitType !== 'CREDITO' &&
              (sp.currencyMode ? sp.currencyMode === 'BS' : isBsPaymentMethod(sp.paymentMethod))
          )
          .reduce((sum, sp) => sum + (parseFloat(sp.amountUSD) || 0), 0) * 100
      ) / 100
    );
  }, [paymentType, mixtoSplits]);
  const mixtoCashBsTotalBs = useMemo(() => {
    if (paymentType !== 'MIXTO') return 0;
    return (
      Math.round(
        mixtoSplits
          .filter(
            (sp) =>
              sp.splitType !== 'CREDITO' &&
              (sp.currencyMode ? sp.currencyMode === 'BS' : isBsPaymentMethod(sp.paymentMethod))
          )
          .reduce((sum, sp) => {
            const bsVal = parseFloat(sp.amountBs);
            if (!Number.isNaN(bsVal) && bsVal > 0) return sum + bsVal;
            return sum + (parseFloat(sp.amountUSD) || 0) * rate;
          }, 0) * 100
      ) / 100
    );
  }, [paymentType, mixtoSplits, rate]);
  const mixtoCashDivisasUSD = useMemo(() => {
    if (paymentType !== 'MIXTO') return 0;
    return (
      Math.round(
        mixtoSplits
          .filter(
            (sp) =>
              sp.splitType !== 'CREDITO' &&
              !(sp.currencyMode ? sp.currencyMode === 'BS' : isBsPaymentMethod(sp.paymentMethod))
          )
          .reduce((sum, sp) => sum + (parseFloat(sp.amountUSD) || 0), 0) * 100
      ) / 100
    );
  }, [paymentType, mixtoSplits]);

  const handleSelectCreditDays = (days: number) => {
    setCreditDays(days);
    setCreditDueDate(getDefaultDueDate(days));
  };

  const handleSelectDeferredCurrencyMode = (nextMode: PaymentCurrencyMode) => {
    setCreditPaidCurrencyMode(nextMode);
    if (nextMode === 'BS' && !isBsPaymentMethod(paymentMethod)) {
      setPaymentMethod('Pago Móvil');
    } else if (nextMode === 'USD' && isBsPaymentMethod(paymentMethod)) {
      setPaymentMethod('Dólares Efectivo (USD)');
    }
  };

  const handleChangeCreditPaidBs = (rawVal: string) => {
    setCreditPaidAmountBs(rawVal);
    const parsed = parseFloat(rawVal);
    if (rawVal === '' || Number.isNaN(parsed) || parsed < 0) {
      setCreditPaidAmount('');
      return;
    }
    const equivUSD = rate > 0 ? Math.round((parsed / rate) * 100) / 100 : 0;
    setCreditPaidAmount(equivUSD > 0 ? equivUSD.toFixed(2) : '');
  };

  const handleChangeCreditPaidUSD = (rawVal: string) => {
    setCreditPaidAmount(rawVal);
    const parsed = parseFloat(rawVal);
    if (rawVal === '' || Number.isNaN(parsed) || parsed < 0) {
      setCreditPaidAmountBs('');
      return;
    }
    const equivBs = Math.round(parsed * rate * 100) / 100;
    setCreditPaidAmountBs(equivBs > 0 ? equivBs.toFixed(2) : '');
  };

  const handleSetDeferredFraction = (fraction: number) => {
    if (fraction <= 0 || totalUSD <= 0) {
      setCreditPaidAmount('');
      setCreditPaidAmountBs('');
      return;
    }
    const targetUSD = Math.round(totalUSD * fraction * 100) / 100;
    const targetBs = Math.round(targetUSD * rate * 100) / 100;
    setCreditPaidAmount(targetUSD.toFixed(2));
    setCreditPaidAmountBs(targetBs.toFixed(2));
  };

  const deferredPaidUSD = useMemo(() => {
    const parsedUSD = parseFloat(creditPaidAmount);
    if (!Number.isNaN(parsedUSD) && parsedUSD > 0) {
      return Math.round(parsedUSD * 100) / 100;
    }
    const parsedBs = parseFloat(creditPaidAmountBs);
    if (!Number.isNaN(parsedBs) && parsedBs > 0 && rate > 0) {
      return Math.round((parsedBs / rate) * 100) / 100;
    }
    return 0;
  }, [creditPaidAmount, creditPaidAmountBs, rate]);

  const deferredPaidBs = useMemo(() => {
    const parsedBs = parseFloat(creditPaidAmountBs);
    if (creditPaidCurrencyMode === 'BS' && !Number.isNaN(parsedBs) && parsedBs > 0) {
      return Math.round(parsedBs * 100) / 100;
    }
    return Math.round(deferredPaidUSD * rate * 100) / 100;
  }, [creditPaidCurrencyMode, creditPaidAmountBs, deferredPaidUSD, rate]);

  const handleFinalizeSale = () => {
    if (isSubmittingSaleRef.current) return;
    setPosFormError(null);

    if (posCart.length === 0) {
      const msg = 'Agrega al menos un repuesto o servicio para generar la factura.';
      setPosFormError(msg);
      showToast(msg, 'error');
      return;
    }

    if (hasShipping && shippingCostUSD <= 0) {
      const msg = 'Ingresa el monto de los gastos de envío (en $ o Bs.) o desactiva la opción de envío.';
      setPosFormError(msg);
      showToast(msg, 'error');
      return;
    }

    // Permitir ventas sin registrar el cliente (excepto Crédito, Apartado o Pago Mixto con parte a Crédito)
    const isCredit = paymentType === 'CREDITO';
    const isApartado = paymentType === 'APARTADO';
    const isDeferred = isCredit || isApartado;
    const isMixto = paymentType === 'MIXTO';
    let finalCustomerName = customerName.trim();
    let finalCustomerPhone = customerPhone.trim();
    const finalCustomerDoc = customerDocument.trim();

    // Validación específica para Pago Mixto (soporta partes De Contado y/o A Crédito)
    let finalizedPaymentSplits: SalePaymentSplit[] | undefined;
    let mixtoHasCredit = false;
    let mixtoCashUSD = 0;

    if (isMixto) {
      const parsedDrafts = mixtoSplits
        .map((sp, idx) => {
          const isCreditLeg = sp.splitType === 'CREDITO';
          const isBsLeg = sp.currencyMode
            ? sp.currencyMode === 'BS'
            : isBsPaymentMethod(sp.paymentMethod);
          const rawBs = parseFloat(sp.amountBs);
          const rawUsd = parseFloat(sp.amountUSD);
          const hasExplicitBs = !Number.isNaN(rawBs) && rawBs > 0;
          const hasExplicitUsd = !Number.isNaN(rawUsd) && rawUsd > 0;

          // Preservar el monto EXACTO en Bs cuando se ingresó en Bs (sin recalcular desde el USD redondeado)
          const bs = hasExplicitBs
            ? Math.round(rawBs * 100) / 100
            : Math.round((hasExplicitUsd ? rawUsd : 0) * rate * 100) / 100;
          const usd = hasExplicitUsd
            ? Math.round(rawUsd * 100) / 100
            : rate > 0
              ? Math.round((bs / rate) * 100) / 100
              : 0;

          const leg: SalePaymentSplit = {
            id: sp.id || `split-${Date.now()}-${idx}`,
            splitType: isCreditLeg ? ('CREDITO' as SaleSplitCondition) : ('CONTADO' as SaleSplitCondition),
            paymentMethod: isCreditLeg ? 'Pago Móvil' : sp.paymentMethod,
            amountUSD: usd,
            amountBs: bs,
            pagoMovilAccount: !isCreditLeg && sp.paymentMethod === 'Pago Móvil' ? sp.pagoMovilAccount : undefined,
            reference: sp.reference.trim() || undefined,
          };
          return { leg, isBsLeg, hasExplicitBs };
        })
        .filter((entry) => entry.leg.amountUSD > 0 || entry.leg.amountBs > 0);

      const parsedLegs: SalePaymentSplit[] = parsedDrafts.map((entry) => entry.leg);

      if (parsedLegs.length < 2) {
        const msg = 'Para Pago Mixto debes ingresar montos mayores a $0 en al menos 2 partes de pago.';
        setPosFormError(msg);
        showToast(msg, 'error');
        return;
      }

      const assignedSumUSD = Math.round(parsedLegs.reduce((sum, leg) => sum + leg.amountUSD, 0) * 100) / 100;
      const targetTotalUSD = Math.round(totalUSD * 100) / 100;
      const diffUSD = Math.round((targetTotalUSD - assignedSumUSD) * 100) / 100;

      if (Math.abs(diffUSD) > 0.02) {
        const msg =
          diffUSD > 0
            ? `Faltan ${formatUSD(diffUSD)} (${formatBs(diffUSD * rate)}) por asignar en el Pago Mixto para cubrir el total de ${formatUSD(targetTotalUSD)}.`
            : `El Pago Mixto excede el total de la venta por ${formatUSD(Math.abs(diffUSD))}. Ajusta los montos para que sumen ${formatUSD(targetTotalUSD)}.`;
        setPosFormError(msg);
        showToast(msg, 'error');
        return;
      }

      // Ajuste fino de 1-2 centavos por redondeo en USD sin alterar un monto exacto ingresado en Bs
      if (diffUSD !== 0 && parsedLegs.length > 0) {
        let adjustIdx = parsedLegs.length - 1;
        for (let i = parsedDrafts.length - 1; i >= 0; i -= 1) {
          if (!parsedDrafts[i].isBsLeg) {
            adjustIdx = i;
            break;
          }
        }
        const adjustedUSD = Math.max(0.01, Math.round((parsedLegs[adjustIdx].amountUSD + diffUSD) * 100) / 100);
        const keepExactBs = parsedDrafts[adjustIdx].isBsLeg && parsedDrafts[adjustIdx].hasExplicitBs;
        parsedLegs[adjustIdx] = {
          ...parsedLegs[adjustIdx],
          amountUSD: adjustedUSD,
          amountBs: keepExactBs
            ? parsedLegs[adjustIdx].amountBs
            : Math.round(adjustedUSD * rate * 100) / 100,
        };
      }

      finalizedPaymentSplits = parsedLegs;
      mixtoHasCredit = parsedLegs.some((leg) => leg.splitType === 'CREDITO');
      mixtoCashUSD =
        Math.round(
          parsedLegs
            .filter((leg) => leg.splitType !== 'CREDITO')
            .reduce((sum, leg) => sum + leg.amountUSD, 0) * 100
        ) / 100;
    }

    if (!finalCustomerName) {
      if (isDeferred || mixtoHasCredit) {
        const msg = isApartado
          ? 'Para el Sistema de Apartado, ingresa el nombre del cliente para registrar su reserva y saldo.'
          : mixtoHasCredit
            ? 'Para Pago Mixto con parte a Crédito, ingresa el nombre del cliente para registrar su cuenta por cobrar.'
            : 'Para ventas a crédito, ingresa el nombre del cliente para registrar su cuenta por cobrar.';
        setPosFormError(msg);
        showToast(msg, 'error');
        return;
      }
      finalCustomerName = 'Cliente Mostrador';
    }

    if (!finalCustomerPhone) {
      finalCustomerPhone = 'N/A';
    }

    isSubmittingSaleRef.current = true;
    setIsSubmittingSale(true);

    try {
      const saleItems: SaleItem[] = posCart.map((item) => {
        const price = getItemEffectivePrice(item);
        return {
          productId: item.product.id,
          sku: item.product.sku,
          name: item.product.name,
          category: item.product.category,
          quantity: item.quantity,
          unitPrice: price,
          total: price * item.quantity,
          isService: item.product.sku === 'MAN-OBRA',
          imageUrl: item.product.imageUrl || undefined,
        };
      });

      if (isDeferred && deferredPaidUSD > totalUSD + 0.05) {
        const msg = `El abono inicial (${formatUSD(deferredPaidUSD)}) excede el total de la venta (${formatUSD(totalUSD)}).`;
        setPosFormError(msg);
        showToast(msg, 'error');
        return;
      }

      const rawPaidNum = isDeferred ? deferredPaidUSD : mixtoHasCredit ? mixtoCashUSD : totalUSD;
      const paidNum =
        isDeferred && Math.abs(totalUSD - rawPaidNum) <= 0.02
          ? Math.round(totalUSD * 100) / 100
          : rawPaidNum;
      const paidBsNum = isDeferred && paidNum > 0 ? deferredPaidBs : undefined;
      const isFullyPaid = paidNum >= totalUSD - 0.02;
      const isMercadoLibre = paymentType === 'MERCADOLIBRE';
      const mlCommissionToRecord = isMercadoLibre ? computedMlCommissionUSD : undefined;

      const mixtoCashLegs =
        isMixto && finalizedPaymentSplits
          ? finalizedPaymentSplits.filter((leg) => leg.splitType !== 'CREDITO')
          : [];
      const primaryMixtoCandidates =
        mixtoCashLegs.length > 0 ? mixtoCashLegs : finalizedPaymentSplits || [];
      const primaryMixtoLeg =
        isMixto && primaryMixtoCandidates.length > 0
          ? primaryMixtoCandidates.reduce(
              (best, cur) => (cur.amountUSD > best.amountUSD ? cur : best),
              primaryMixtoCandidates[0]
            )
          : undefined;

      const hasCreditComponent = isDeferred || mixtoHasCredit;

      const newSale = createSale({
        customerId: selectedCustomerId || undefined,
        customerName: finalCustomerName,
        customerPhone: finalCustomerPhone,
        customerDocument: finalCustomerDoc || undefined,
        items: saleItems,
        subtotal: subtotalUSD,
        discount: discountUSD,
        tax: 0,
        total: totalUSD,
        paymentMethod: primaryMixtoLeg ? primaryMixtoLeg.paymentMethod : paymentMethod,
        pagoMovilAccount: primaryMixtoLeg
          ? primaryMixtoLeg.paymentMethod === 'Pago Móvil'
            ? primaryMixtoLeg.pagoMovilAccount
            : undefined
          : paymentMethod === 'Pago Móvil'
            ? pagoMovilAccount
            : undefined,
        paymentSplits: finalizedPaymentSplits,
        notes: saleNotes.trim() || undefined,
        source: 'POS',
        paymentType,
        creditDays: hasCreditComponent ? creditDays : undefined,
        creditDueDate: hasCreditComponent ? creditDueDate : undefined,
        creditPaidAmount: hasCreditComponent ? paidNum : undefined,
        creditPaidAmountBs: isDeferred && paidNum > 0 ? paidBsNum : undefined,
        creditInitialPaymentCurrency: isDeferred && paidNum > 0 ? creditPaidCurrencyMode : undefined,
        creditStatus: hasCreditComponent ? (isFullyPaid ? 'PAGADO' : 'PENDIENTE') : undefined,
        mercadolibreCommissionUSD: mlCommissionToRecord,
        mercadolibreCommissionRate: isMercadoLibre && mlCommissionMode === 'PERCENT' ? Number(mlCommissionRate || 0) : undefined,
        mercadolibreFeeStatus: isMercadoLibre ? 'PENDIENTE' : undefined,
        hasShipping: hasShipping && shippingCostUSD > 0 ? true : undefined,
        shippingCostUSD: hasShipping && shippingCostUSD > 0 ? shippingCostUSD : undefined,
        shippingCostBs: hasShipping && shippingCostUSD > 0 ? shippingCostBs : undefined,
        shippingCurrencyMode: hasShipping && shippingCostUSD > 0 ? shippingCurrencyMode : undefined,
        shippingState: hasShipping && shippingCostUSD > 0 ? shippingState : undefined,
        shippingAgency: hasShipping && shippingCostUSD > 0 ? shippingAgency : undefined,
        shippingNotes: hasShipping && shippingCostUSD > 0 && shippingNotes.trim() ? shippingNotes.trim() : undefined,
      });

      // If MercadoLibre, prepare notification of accumulated debt for the owner
      if (isMercadoLibre && mlCommissionToRecord && mlCommissionToRecord > 0) {
        const updatedTotalDebt = mercadolibreDebtUSD + mlCommissionToRecord;
        const updatedPending = [newSale, ...pendingMercadoLibreSales];
        const mlNotify = buildMercadoLibreDebtWhatsAppMessage(updatedPending, updatedTotalDebt, settings, newSale);
        setLastMlNotification({
          message: mlNotify.message,
          url: mlNotify.url,
          debtUSD: updatedTotalDebt,
        });
      }

      // Reset POS form
      setPosCart([]);
      setSelectedCustomerId('');
      setCustomerName('');
      setCustomerPhone('');
      setCustomerDocument('');
      setCustomerSearchQuery('');
      setActiveSuggestionSource(null);
      setDiscountUSD(0);
      setSaleNotes('');
      setHasShipping(false);
      setShippingCurrencyMode('USD');
      setShippingCostUSDInput('');
      setShippingCostBsInput('');
      setShippingState('Distrito Capital');
      setShippingAgency('MRW');
      setShippingNotes('');
      setPaymentType('CONTADO');
      setMixtoSplits(createDefaultMixtoSplits());
      setCreditDays(15);
      setCreditDueDate(getDefaultDueDate(15));
      setCreditPaidAmount('');
      setCreditPaidAmountBs('');
      setCreditPaidCurrencyMode('BS');
      setPosFormError(null);

      // Open Invoice Preview Modal (PDF downloads only when user clicks Descargar PDF / Enviar a WhatsApp)
      setSelectedInvoice(newSale);

      const conditionTitle = isMercadoLibre
        ? 'MercadoLibre'
        : isMixto
        ? mixtoHasCredit
          ? 'Pago Mixto (Contado + Crédito)'
          : 'Pago Mixto'
        : isApartado
        ? 'Sistema de Apartado'
        : isCredit
        ? 'A Crédito'
        : 'De Contado';

      const hasValidPhone = Boolean(
        newSale.customerPhone &&
        newSale.customerPhone !== 'N/A' &&
        newSale.customerPhone.replace(/\D/g, '').length >= 7
      );

      if (hasValidPhone) {
        const { message, url } = buildInvoiceWhatsAppMessage(newSale, settings);
        setWhatsappModalData({
          title: `Factura ${newSale.invoiceNumber} Emitida (${conditionTitle})`,
          message,
          url,
          phone: newSale.customerPhone,
          recipientName: newSale.customerName,
          sale: newSale,
        });
      } else {
        showToast(`¡Factura ${newSale.invoiceNumber} registrada con éxito (${newSale.customerName})!`, 'success');
      }
    } finally {
      isSubmittingSaleRef.current = false;
      setIsSubmittingSale(false);
    }
  };

  // =========================================================================
  // Handlers para Modalidad "Abrir Cuenta" (Talleres Vecinos · Pago al Final del Día)
  // =========================================================================
  const handleStartNewOpenAccount = () => {
    setIsOpenAccountMode(true);
    setOpenAccountSubMode('NUEVA');
    setTargetOpenAccountId(null);
    setPosFormError(null);
    setTimeout(() => {
      customerSearchInputRef.current?.focus();
      customerSearchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }, 60);
  };

  const handleStartAddItemsToOpenAccount = (acc: OpenAccount) => {
    setIsOpenAccountMode(true);
    setOpenAccountSubMode('SUMAR');
    setTargetOpenAccountId(acc.id);
    setSelectedCustomerId(acc.customerId || '');
    setCustomerName(acc.customerName);
    setCustomerPhone(acc.customerPhone === 'N/A' ? '' : acc.customerPhone);
    setCustomerDocument(acc.customerDocument || '');
    setPosFormError(null);
    showToast(
      `Modo activo: agrega repuestos del catálogo y pulsa "Sumar a Cuenta de ${acc.customerName}".`,
      'info'
    );
  };

  const handleExitOpenAccountMode = () => {
    setIsOpenAccountMode(false);
    setTargetOpenAccountId(null);
    setOpenAccountPickupNote('');
    setPosFormError(null);
  };

  const handleSendOpenAccountWhatsApp = (acc: OpenAccount) => {
    const { message, url } = buildOpenAccountWhatsAppMessage(acc, settings);
    setWhatsappModalData({
      title: `Estado de Cuenta Abierta ${acc.accountNumber}`,
      message,
      url,
      phone: acc.customerPhone,
      recipientName: acc.customerName,
    });
  };

  const handleSubmitOpenAccount = () => {
    setPosFormError(null);

    const cartSaleItems: SaleItem[] = posCart.map((item) => {
      const price = getItemEffectivePrice(item);
      return {
        productId: item.product.id,
        sku: item.product.sku,
        name: item.product.name,
        category: item.product.category,
        quantity: item.quantity,
        unitPrice: price,
        total: Math.round(price * item.quantity * 100) / 100,
        isService: item.product.sku === 'MAN-OBRA',
        imageUrl: item.product.imageUrl || undefined,
      };
    });

    if (openAccountSubMode === 'SUMAR') {
      if (!targetOpenAccount) {
        const msg = 'Selecciona la cuenta abierta a la cual deseas sumar los repuestos.';
        setPosFormError(msg);
        showToast(msg, 'error');
        return;
      }
      if (cartSaleItems.length === 0) {
        const msg = 'Agrega al menos un repuesto del catálogo para sumarlo a la cuenta abierta.';
        setPosFormError(msg);
        showToast(msg, 'error');
        return;
      }

      const updated = addItemsToOpenAccount(
        targetOpenAccount.id,
        cartSaleItems,
        openAccountPickupNote
      );
      if (updated) {
        setPosCart([]);
        setOpenAccountPickupNote('');
        setPosFormError(null);
        showToast(
          `¡Se sumaron ${cartSaleItems.length} ítem(s) a ${updated.accountNumber} (${updated.customerName})! Nuevo acumulado: ${formatUSD(updated.subtotal)}.`,
          'success'
        );
      }
      return;
    }

    // Sub-modo NUEVA CUENTA: exigir datos personales del cliente
    const cleanName = customerName.trim();
    const cleanDoc = customerDocument.trim();
    const cleanPhone = customerPhone.trim();

    if (!cleanName || cleanName.toLowerCase() === 'cliente mostrador') {
      const msg =
        'Para abrir una cuenta diaria debes ingresar el nombre completo real del cliente (no Cliente Mostrador).';
      setPosFormError(msg);
      showToast(msg, 'error');
      return;
    }

    if (!cleanDoc && !cleanPhone) {
      const msg =
        'Para abrir una cuenta ingresa al menos la Cédula/RIF o el Teléfono/WhatsApp del cliente.';
      setPosFormError(msg);
      showToast(msg, 'error');
      return;
    }

    const created = openCustomerAccount({
      customerId: selectedCustomerId || undefined,
      customerName: cleanName,
      customerPhone: cleanPhone || 'N/A',
      customerDocument: cleanDoc || undefined,
      workshopName: openAccountWorkshop.trim() || undefined,
      motorcycleInfo: openAccountMoto.trim() || undefined,
      notes: saleNotes.trim() || undefined,
      items: cartSaleItems,
    });

    setPosCart([]);
    setSelectedCustomerId('');
    setCustomerName('');
    setCustomerPhone('');
    setCustomerDocument('');
    setCustomerSearchQuery('');
    setActiveSuggestionSource(null);
    setOpenAccountWorkshop('');
    setOpenAccountMoto('');
    setOpenAccountPickupNote('');
    setSaleNotes('');
    setIsOpenAccountMode(false);
    setTargetOpenAccountId(null);
    setPosFormError(null);

    showToast(
      `¡Cuenta Abierta ${created.accountNumber} creada para ${created.customerName}${
        created.items.length > 0 ? ` con ${formatUSD(created.subtotal)} acumulados` : ''
      }!`,
      'success'
    );
  };

  const handleConfirmSettleOpenAccount = (
    accountId: string,
    settlement: Parameters<typeof settleOpenAccount>[1]
  ) => {
    const newSale = settleOpenAccount(accountId, settlement);
    if (!newSale) return null;

    if (targetOpenAccountId === accountId) {
      setTargetOpenAccountId(null);
      setIsOpenAccountMode(false);
    }

    setSelectedInvoice(newSale);

    const hasValidPhone = Boolean(
      newSale.customerPhone &&
        newSale.customerPhone !== 'N/A' &&
        newSale.customerPhone.replace(/\D/g, '').length >= 7
    );

    if (hasValidPhone) {
      const { message, url } = buildInvoiceWhatsAppMessage(newSale, settings);
      setWhatsappModalData({
        title: `Cuenta Cerrada · Factura ${newSale.invoiceNumber}`,
        message,
        url,
        phone: newSale.customerPhone,
        recipientName: newSale.customerName,
        sale: newSale,
      });
    } else {
      showToast(
        `¡Cuenta cerrada y Factura ${newSale.invoiceNumber} emitida (${newSale.customerName})!`,
        'success'
      );
    }

    return newSale;
  };

  return (
    <div className="space-y-4">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div>
          <span className="text-[11px] font-bold text-amber-600 uppercase tracking-wider">
            Punto de Venta Mostrador & Taller
          </span>
          <h1 className="text-xl sm:text-2xl font-bold font-display text-slate-900">
            Registro de Ventas y Facturación (Venezuela)
          </h1>
        </div>

        <div className="flex items-center gap-2 bg-emerald-50 text-emerald-900 px-3 py-1.5 rounded-xl border border-emerald-200 text-xs font-bold self-start sm:self-auto shrink-0 tabular-nums">
          <TrendingUp className="w-4 h-4 text-emerald-600" />
          <span>Tasa Oficial BCV: Bs. {rate.toFixed(2)} / USD</span>
        </div>
      </div>

      {/* Primer Plano: Cliente, Repuestos Agregados y Monto Total en Grande ($ USD y Bs.) */}
      <section
        aria-label="Resumen en primer plano de la venta actual"
        className="bg-slate-950 text-white rounded-2xl border border-slate-800 shadow-md overflow-hidden"
      >
        <div className="grid grid-cols-1 lg:grid-cols-12 divide-y lg:divide-y-0 lg:divide-x divide-slate-800">
          {/* 1. Cliente Seleccionado en Primer Plano */}
          <div className="lg:col-span-3 p-3.5 sm:p-4 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <User className="w-3.5 h-3.5 text-amber-400" />
                <span>Cliente</span>
              </span>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={handleSetQuickWalkInCustomer}
                  className="px-2 py-0.5 text-[10px] font-bold bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  title="Usar Cliente Mostrador"
                >
                  ⚡ Mostrador
                </button>
                <button
                  type="button"
                  onClick={() => {
                    customerSearchInputRef.current?.focus();
                    customerSearchInputRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
                  }}
                  className="px-2 py-0.5 text-[10px] font-semibold bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 rounded-md transition-colors cursor-pointer whitespace-nowrap"
                  title="Buscar o cambiar cliente"
                >
                  Cambiar
                </button>
              </div>
            </div>

            <div className="min-w-0">
              <p className="text-base sm:text-lg font-extrabold text-white leading-snug whitespace-normal break-words">
                {customerName.trim() || 'Cliente Mostrador'}
              </p>
              <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-0.5 text-xs text-slate-300 font-mono">
                {customerDocument.trim() ? (
                  <span>C.I./RIF: {customerDocument}</span>
                ) : (
                  <span className="text-slate-400 font-sans text-[11px]">
                    {!customerName.trim() || customerName === 'Cliente Mostrador'
                      ? 'Venta rápida de mostrador'
                      : 'Sin cédula registrada'}
                  </span>
                )}
                {customerPhone.trim() && <span>Tel: {customerPhone}</span>}
              </div>
            </div>
          </div>

          {/* 2. Repuestos Agregados a la Compra en Primer Plano */}
          <div className="lg:col-span-5 p-3.5 sm:p-4 flex flex-col justify-between">
            <div className="flex items-center justify-between gap-2 mb-1.5">
              <span className="text-[11px] font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
                <ShoppingCart className="w-3.5 h-3.5 text-amber-400" />
                <span>Repuestos en la Compra</span>
              </span>
              <div className="flex items-center gap-2">
                <span className="text-[11px] font-bold text-amber-300 font-mono tabular-nums">
                  {posCart.length} {posCart.length === 1 ? 'ítem' : 'ítems'} · {totalCartUnits} unds
                </span>
                {posCart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPosCart([])}
                    className="text-[10px] font-semibold text-rose-400 hover:text-rose-300 cursor-pointer"
                  >
                    Vaciar
                  </button>
                )}
              </div>
            </div>

            {posCart.length === 0 ? (
              <div className="py-2 text-xs text-slate-400">
                No hay repuestos agregados todavía. Haz clic en un artículo del catálogo para sumarlo.
              </div>
            ) : (
              <div className="max-h-32 overflow-y-auto divide-y divide-slate-800/80 pr-1">
                {posCart.map((item) => {
                  const effectivePrice = getItemEffectivePrice(item);
                  return (
                    <div
                      key={item.product.id}
                      className="py-1.5 flex items-start justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0 flex-1 flex items-start gap-1.5">
                        <span className="font-mono font-extrabold text-amber-400 shrink-0 tabular-nums">
                          {item.quantity}x
                        </span>
                        <span className="font-semibold text-white whitespace-normal break-words leading-snug">
                          {item.product.name}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <div className="flex items-center border border-slate-700 rounded bg-slate-900">
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(item.product.id, -1)}
                            className="px-1.5 py-0.5 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer"
                            title="Restar 1"
                          >
                            -
                          </button>
                          <button
                            type="button"
                            onClick={() => handleUpdateQty(item.product.id, 1)}
                            className="px-1.5 py-0.5 text-slate-300 hover:text-white hover:bg-slate-800 cursor-pointer border-l border-slate-700"
                            title="Sumar 1"
                          >
                            +
                          </button>
                        </div>
                        <span className="font-mono font-bold text-slate-100 tabular-nums min-w-[60px] text-right">
                          {formatUSD(effectivePrice * item.quantity)}
                        </span>
                        <button
                          type="button"
                          onClick={() => handleRemoveFromCart(item.product.id)}
                          className="text-slate-500 hover:text-rose-400 p-0.5 cursor-pointer"
                          title="Quitar repuesto"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* 3. Monto Total a Cobrar en Letra Grande y Legible ($ USD y Bs.) */}
          <div className="lg:col-span-4 p-3.5 sm:p-4 bg-slate-900/90 flex flex-col justify-between gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-[11px] font-bold text-slate-300 uppercase tracking-wider">
                Total a Cobrar
              </span>
              <span
                className={`font-bold px-2 py-0.5 rounded text-[10px] tracking-wide ${
                  isOpenAccountMode
                    ? 'bg-violet-500/25 text-violet-200 border border-violet-400/50'
                    : paymentType === 'APARTADO'
                    ? 'bg-indigo-500/20 text-indigo-300 border border-indigo-400/40'
                    : paymentType === 'CREDITO'
                    ? 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                    : paymentType === 'MERCADOLIBRE'
                    ? 'bg-yellow-500/20 text-yellow-300 border border-yellow-400/40'
                    : paymentType === 'MIXTO'
                    ? 'bg-teal-500/20 text-teal-300 border border-teal-400/40'
                    : 'bg-emerald-500/20 text-emerald-300 border border-emerald-400/40'
                }`}
              >
                {isOpenAccountMode
                  ? openAccountSubMode === 'SUMAR' && targetOpenAccount
                    ? `SUMAR A ${targetOpenAccount.accountNumber}`
                    : 'ABRIR CUENTA (HOY)'
                  : paymentType === 'APARTADO'
                  ? `APARTADO (${creditDays}D)`
                  : paymentType === 'CREDITO'
                  ? `CRÉDITO (${creditDays}D)`
                  : paymentType === 'MERCADOLIBRE'
                  ? 'MERCADOLIBRE'
                  : paymentType === 'MIXTO'
                  ? hasMixtoCreditSplit
                    ? `MIXTO (CONTADO + CRÉDITO)`
                    : 'PAGO MIXTO'
                  : 'CONTADO'}
              </span>
            </div>

            <div className="space-y-2">
              <div className="flex items-baseline justify-between gap-3">
                <span className="text-xs font-bold text-amber-300 uppercase shrink-0">
                  Dólares ($ USD)
                </span>
                <span className="text-3xl sm:text-4xl font-extrabold font-mono text-amber-400 tabular-nums tracking-tight leading-none">
                  {formatUSD(totalUSD)}
                </span>
              </div>

              <div className="flex items-baseline justify-between gap-3 pt-2 border-t border-slate-800">
                <span className="text-xs font-bold text-emerald-300 uppercase shrink-0">
                  Bolívares (Bs.)
                </span>
                <span className="text-2xl sm:text-3xl font-extrabold font-mono text-emerald-400 tabular-nums tracking-tight leading-none">
                  {formatBs(totalBs)}
                </span>
              </div>
            </div>

            <div className="flex items-center justify-between text-[11px] text-slate-400 pt-1 tabular-nums">
              <span>Tasa BCV: Bs. {rate.toFixed(2)}</span>
              {discountUSD > 0 && (
                <span className="text-emerald-400 font-semibold">Desc: -{formatUSD(discountUSD)}</span>
              )}
            </div>
          </div>
        </div>
      </section>

      {/* MercadoLibre Debt Notification Alert (Direct to Owner WhatsApp) */}
      {lastMlNotification && (
        <div className="p-3.5 bg-yellow-50 border border-yellow-300 text-yellow-950 rounded-xl flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs shadow-xs">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-yellow-400 text-yellow-950 flex items-center justify-center shrink-0 font-bold">
              <Package className="w-4 h-4" />
            </div>
            <div>
              <p className="font-bold text-yellow-950 flex items-center gap-1.5">
                <span>¡Venta de MercadoLibre Registrada!</span>
                <span className="bg-yellow-200/80 text-yellow-900 text-[10px] px-1.5 py-0.5 rounded font-mono">
                  +Comisión acumulada
                </span>
              </p>
              <p className="text-[11px] text-yellow-800">
                Tu deuda acumulada con MercadoLibre es de <strong>{formatUSD(lastMlNotification.debtUSD)}</strong> ({formatBs(lastMlNotification.debtUSD * rate)} BCV).
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0">
            <a
              href={lastMlNotification.url}
              target="_blank"
              rel="noopener noreferrer"
              className="px-3.5 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-lg flex items-center gap-1.5 text-xs shadow-xs transition-colors"
            >
              <MessageSquare className="w-3.5 h-3.5" />
              <span>Notificar Deuda a mi WhatsApp</span>
            </a>
            <button
              onClick={() => setLastMlNotification(null)}
              className="p-1.5 text-yellow-700 hover:text-yellow-900 text-xs rounded hover:bg-yellow-200/60"
              title="Cerrar aviso"
            >
              ✕
            </button>
          </div>
        </div>
      )}

      {/* Banner Activo: Sumando Repuestos a Cuenta Abierta */}
      {isOpenAccountMode && openAccountSubMode === 'SUMAR' && targetOpenAccount && (
        <div className="p-3.5 bg-violet-700 text-white rounded-2xl border border-violet-500 shadow-md flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-start sm:items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-white/20 flex items-center justify-center shrink-0">
              <ClipboardList className="w-5 h-5 text-white" />
            </div>
            <div className="min-w-0">
              <p className="text-xs sm:text-sm font-extrabold leading-snug whitespace-normal break-words">
                Sumando repuestos a Cuenta Abierta {targetOpenAccount.accountNumber} ·{' '}
                {targetOpenAccount.customerName}
              </p>
              <p className="text-[11px] text-violet-100">
                Acumulado actual: <strong className="font-mono">{formatUSD(targetOpenAccount.subtotal)}</strong> (
                {formatBs(targetOpenAccount.subtotal * rate)})
                {targetOpenAccount.workshopName ? ` · Taller: ${targetOpenAccount.workshopName}` : ''}
                {' · '}Selecciona repuestos del catálogo y pulsa <strong>"Sumar a Cuenta Abierta"</strong>.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleExitOpenAccountMode}
            className="px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 text-white text-xs font-bold shrink-0 self-end sm:self-auto cursor-pointer"
          >
            Salir de Cuenta Abierta
          </button>
        </div>
      )}

      {/* Panel de Cuentas Abiertas del Día (Talleres Vecinos) */}
      <OpenAccountsPanel
        openAccounts={openAccounts}
        rate={rate}
        activeTargetAccountId={
          isOpenAccountMode && openAccountSubMode === 'SUMAR' ? targetOpenAccountId : null
        }
        onStartAddItems={handleStartAddItemsToOpenAccount}
        onStartNewAccount={handleStartNewOpenAccount}
        onInspectAccount={(acc) => setInspectingAccountId(acc.id)}
        onSettleAccount={(acc) => setSettlingAccountId(acc.id)}
        onSendWhatsAppStatement={handleSendOpenAccountWhatsApp}
      />

      {/* 2-Column POS Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* Left: Product Catalog & Search (7 Cols) */}
        <div className="lg:col-span-7 space-y-4">
          <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
            {/* Search Input and Action Buttons */}
            <div className="flex flex-wrap sm:flex-nowrap gap-2">
              <div className="relative flex-1 min-w-[200px]">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={productSearch}
                  onChange={(e) => setProductSearch(e.target.value)}
                  placeholder="Buscar repuesto por nombre, SKU, código de barra o moto (o escanear lector)..."
                  className="w-full pl-10 pr-8 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
                />
                {productSearch && (
                  <button
                    type="button"
                    onClick={() => setProductSearch('')}
                    className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-xs p-1 cursor-pointer"
                    title="Limpiar búsqueda"
                  >
                    ✕
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => handleOpenQuickRegister()}
                className="px-3 py-2 bg-amber-600 hover:bg-amber-700 text-white text-xs font-bold rounded-lg transition-all shadow-xs cursor-pointer flex items-center gap-1.5 whitespace-nowrap"
                title="Registrar un repuesto nuevo sobre la marcha para agregarlo a esta venta"
              >
                <PackagePlus className="w-4 h-4" />
                <span>+ Repuesto no registrado</span>
              </button>
              <button
                type="button"
                onClick={() => setShowCustomService(!showCustomService)}
                className="px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors whitespace-nowrap cursor-pointer flex items-center gap-1"
                title="Agregar mano de obra o servicio de taller"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>+ Mano de Obra ($)</span>
              </button>
            </div>

            {/* Custom service collapsible input */}
            {showCustomService && (
              <form onSubmit={handleAddCustomService} className="p-3 bg-amber-50/70 border border-amber-200 rounded-lg flex flex-wrap gap-2 items-center">
                <input
                  type="text"
                  required
                  value={customServiceName}
                  onChange={(e) => setCustomServiceName(e.target.value)}
                  placeholder="Concepto (ej. Mano de obra cambio de rodamientos)"
                  className="text-xs p-2 rounded border border-amber-300 bg-white flex-1 min-w-[200px]"
                />
                <input
                  type="number"
                  step="any"
                  min="0"
                  required
                  value={customServicePriceUSD}
                  onChange={(e) => setCustomServicePriceUSD(Number(e.target.value))}
                  placeholder="Precio ($ USD)"
                  className="text-xs p-2 rounded border border-amber-300 bg-white w-28 font-mono"
                />
                <button
                  type="submit"
                  className="px-3 py-2 bg-amber-600 text-white rounded text-xs font-bold hover:bg-amber-700"
                >
                  Agregar Ítem
                </button>
              </form>
            )}

            {/* Categories filter */}
            <div className="flex items-center gap-1 overflow-x-auto pb-1 scrollbar-none text-[11px]">
              <button
                onClick={() => setSelectedCategory('all')}
                className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                  selectedCategory === 'all'
                    ? 'bg-slate-900 text-white font-bold'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                }`}
              >
                Todos ({products.length})
              </button>
              {productCategories.map((cat) => (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-2.5 py-1 rounded-md transition-colors whitespace-nowrap cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white font-bold'
                      : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                  }`}
                >
                  {cat}
                </button>
              ))}
            </div>
          </div>

          {/* Product Items List */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 max-h-[620px] overflow-y-auto pr-1">
            {filteredProducts.map((product) => {
              const tracksInv = productTracksInventory(product);
              const inStock = !tracksInv || product.stock > 0;
              const cartItem = posCart.find((i) => i.product.id === product.id);
              const priceBs = product.salePrice * rate;

              return (
                <div
                  key={product.id}
                  onClick={() => inStock && handleAddToCart(product)}
                  className={`bg-white rounded-xl border p-3 flex flex-col justify-between transition-all cursor-pointer ${
                    inStock
                      ? 'border-slate-200 hover:border-amber-400 hover:shadow-xs'
                      : 'border-slate-100 opacity-60 bg-slate-50 cursor-not-allowed'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between text-[10px] text-slate-400 font-mono mb-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span>{product.sku}</span>
                        {product.barcode && (
                          <span className="text-indigo-700 bg-indigo-50 border border-indigo-200/50 px-1 py-0.2 rounded flex items-center gap-0.5" title="Código de barra">
                            <Barcode className="w-2.5 h-2.5 text-indigo-500" />
                            <span>{product.barcode}</span>
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={(e) => handleOpenEditProduct(product, e)}
                          className="p-1 text-slate-400 hover:text-amber-800 hover:bg-amber-100/70 rounded transition-colors cursor-pointer"
                          title="Editar datos de este repuesto (nombre, precio, stock, etc.)"
                        >
                          <Edit3 className="w-3 h-3" />
                        </button>
                        <span
                          className={`font-semibold ${
                            !tracksInv
                              ? 'text-indigo-700'
                              : inStock
                              ? 'text-emerald-700'
                              : 'text-rose-600'
                          }`}
                        >
                          {!tracksInv
                            ? `Bajo pedido · ${product.productionTimeLabel || DEFAULT_PRODUCTION_TIME_LABEL}`
                            : inStock
                            ? `${product.stock} en stock`
                            : 'Agotado'}
                        </span>
                      </div>
                    </div>

                    <h4 className="text-xs font-bold text-slate-900 whitespace-normal break-words leading-snug">{product.name}</h4>
                    {product.description && (
                      <p className="text-[10px] text-slate-500 whitespace-normal break-words leading-snug mt-0.5">
                        {product.description}
                      </p>
                    )}
                    <p className="text-[11px] text-slate-500 whitespace-normal break-words leading-snug mt-0.5">{product.compatibility}</p>
                    {product.warehouseLocation && (
                      <span
                        className="mt-1 inline-flex items-center gap-1 text-[10px] font-mono font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-1.5 py-0.5 rounded"
                        title={`Ubicación en almacén: ${product.warehouseLocation}`}
                      >
                        <MapPin className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                        <span>{product.warehouseLocation}</span>
                      </span>
                    )}
                  </div>

                  <div className="mt-3 pt-2 border-t border-slate-100 flex items-center justify-between">
                    <div>
                      <div className="flex items-baseline gap-1 flex-wrap">
                        <span className="text-sm font-bold font-mono text-slate-950 tabular-nums">
                          {formatUSD(product.salePrice)}
                        </span>
                        <span className="text-[10px] font-semibold text-slate-500">
                          {getProductUnitInfo(product).priceSuffix}
                        </span>
                      </div>
                      <span className="text-[10px] font-semibold text-emerald-700 font-mono tabular-nums block">
                        {formatBs(priceBs)}
                      </span>
                    </div>

                    <button
                      type="button"
                      disabled={!inStock}
                      className="px-2.5 py-1 bg-slate-900 hover:bg-amber-600 hover:text-slate-950 text-white rounded text-[11px] font-semibold transition-colors disabled:opacity-40"
                    >
                      {cartItem ? `En lista (${cartItem.quantity})` : '+ Agregar'}
                    </button>
                  </div>
                </div>
              );
            })}

            {filteredProducts.length === 0 && (
              <div className="col-span-full p-6 text-center border-2 border-dashed border-slate-200 rounded-xl bg-slate-50/70 space-y-3">
                <div className="w-10 h-10 rounded-full bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                  <PackagePlus className="w-5 h-5" />
                </div>
                <div>
                  <p className="text-xs font-bold text-slate-800">
                    {productSearch ? `No se encontró "${productSearch}" en el catálogo` : 'No hay repuestos registrados en esta categoría'}
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    ¿Es un repuesto que no está registrado? Puedes registrarlo en este instante para cobrarlo en esta venta y editarlo cuando quieras.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => handleOpenQuickRegister(productSearch)}
                  className="inline-flex items-center gap-1.5 px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white font-bold rounded-lg text-xs shadow-xs transition-colors cursor-pointer"
                >
                  <PackagePlus className="w-4 h-4" />
                  <span>Registrar "{productSearch || 'Repuesto nuevo'}" para esta venta</span>
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Right: Customer Search (aligned with Parts Search) + Sale Ticket (5 Cols) */}
        <div className="lg:col-span-5 space-y-4">
          {/* 1. Buscador de Clientes (A la misma altura que el Buscador de Repuestos) */}
          <div ref={customerBoxRef} className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-2.5">
            {/* Search row aligned horizontally with Left Catalog Search */}
            <div className="flex flex-wrap sm:flex-nowrap items-center gap-2">
              <div className="relative flex-1 min-w-[180px]">
                <Search className="w-4 h-4 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={customerSearchInputRef}
                  type="text"
                  value={customerSearchQuery}
                  onFocus={() => setActiveSuggestionSource('search')}
                  onChange={(e) => {
                    setCustomerSearchQuery(e.target.value);
                    setActiveSuggestionSource('search');
                  }}
                  onKeyDown={handleCustomerInputKeyDown}
                  placeholder={`Buscar cliente por cédula o nombre (${customers.length})...`}
                  className="w-full pl-9 pr-7 py-2 text-xs rounded-lg border border-amber-300/90 bg-amber-50/40 focus:bg-white focus:outline-hidden focus:border-amber-500 text-slate-900 placeholder:text-slate-500"
                />
                {customerSearchQuery && (
                  <button
                    type="button"
                    onClick={() => {
                      setCustomerSearchQuery('');
                      setActiveSuggestionSource('search');
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                    title="Limpiar búsqueda de cliente"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}

                {activeSuggestionSource && (activeSuggestionSource === 'search' || customerSuggestions.length > 0) && (
                  <div className="absolute left-0 right-0 z-30 mt-1 bg-white border border-slate-200 rounded-xl shadow-lg max-h-60 overflow-y-auto divide-y divide-slate-100">
                    {customerSuggestions.length > 0 ? (
                      <>
                        <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-semibold text-slate-500 flex items-center justify-between">
                          <span>
                            {activeCustomerQuery.trim()
                              ? `Sugerencias (${customerSuggestions.length})`
                              : `Clientes registrados (${customers.length})`}
                          </span>
                          <span>Clic o Enter para seleccionar</span>
                        </div>
                        {customerSuggestions.map((c, idx) => {
                          const isHighlighted = idx === highlightedCustomerIdx;
                          const isSelected = selectedCustomerId === c.id;
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onMouseDown={(e) => {
                                e.preventDefault();
                                handleSelectCustomer(c.id);
                              }}
                              onMouseEnter={() => setHighlightedCustomerIdx(idx)}
                              className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                                isHighlighted
                                  ? 'bg-amber-50 text-slate-950'
                                  : isSelected
                                  ? 'bg-emerald-50/60 text-slate-900'
                                  : 'hover:bg-slate-50 text-slate-800'
                              }`}
                            >
                              <div className="min-w-0 flex-1">
                                <div className="flex items-start gap-1.5">
                                  <span className="text-xs font-bold whitespace-normal break-words leading-snug">
                                    {c.name}
                                  </span>
                                  {isSelected && (
                                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0 mt-0.5" />
                                  )}
                                </div>
                                <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5 flex-wrap">
                                  {c.documentId ? (
                                    <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                                      C.I./RIF: {c.documentId}
                                    </span>
                                  ) : (
                                    <span className="text-slate-400">Sin cédula</span>
                                  )}
                                  {c.phone && (
                                    <span className="flex items-center gap-0.5">
                                      <Phone className="w-2.5 h-2.5 text-slate-400" />
                                      {c.phone}
                                    </span>
                                  )}
                                </div>
                              </div>
                              <span className="text-[10px] font-bold text-amber-700 shrink-0">
                                Elegir
                              </span>
                            </button>
                          );
                        })}
                      </>
                    ) : (
                      <div className="px-3 py-3 text-center text-[11px] text-slate-500">
                        No hay clientes registrados que coincidan con{' '}
                        <strong className="text-slate-700">"{activeCustomerQuery}"</strong>.
                        <span className="block text-[10px] text-slate-400 mt-0.5">
                          Puedes llenar los campos de abajo para facturar y registrarlo automáticamente.
                        </span>
                      </div>
                    )}
                  </div>
                )}
              </div>

              <button
                type="button"
                onClick={handleSetQuickWalkInCustomer}
                className="inline-flex items-center gap-1 px-2.5 py-2 text-xs font-bold bg-amber-100 hover:bg-amber-200 text-amber-950 border border-amber-300 rounded-lg transition-colors cursor-pointer shadow-2xs whitespace-nowrap shrink-0"
                title="Venta rápida: no requiere registrar cliente"
              >
                <span>⚡ Mostrador</span>
              </button>

              {(customerName || customerPhone || customerDocument || selectedCustomerId || customerSearchQuery) && (
                <button
                  type="button"
                  onClick={handleClearCustomer}
                  className="text-xs text-slate-500 hover:text-slate-800 px-2 py-2 rounded-lg hover:bg-slate-100 cursor-pointer whitespace-nowrap shrink-0"
                  title="Limpiar datos de cliente"
                >
                  Limpiar
                </button>
              )}
            </div>

            {selectedCustomerId && (
              <div className="flex items-start justify-between gap-2.5 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-emerald-950">
                <div className="flex items-start gap-2 min-w-0 flex-1">
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-extrabold text-emerald-950 whitespace-normal break-words leading-snug">
                      {customerName}
                    </div>
                    {(customerDocument || customerPhone) && (
                      <div className="mt-1 flex flex-wrap items-center gap-1.5">
                        {customerDocument && (
                          <span className="font-mono text-[11px] font-semibold bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-800">
                            C.I. {customerDocument}
                          </span>
                        )}
                        {customerPhone && (
                          <span className="font-mono text-[11px] bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-800">
                            Tel: {customerPhone}
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearCustomer}
                  className="text-xs font-bold text-emerald-700 hover:text-emerald-950 underline shrink-0 cursor-pointer mt-0.5"
                >
                  Cambiar
                </button>
              </div>
            )}

            {/* Full-width Name input + 2-column Document / Phone inputs */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <div className="sm:col-span-2">
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Nombre Completo del Cliente
                </label>
                <input
                  type="text"
                  value={customerName}
                  title={customerName}
                  onFocus={() => {
                    if (!selectedCustomerId && customerName.trim() && customerName !== 'Cliente Mostrador') {
                      setActiveSuggestionSource('name');
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomerName(val);
                    if (selectedCustomerId) setSelectedCustomerId('');
                    if (val.trim() && val !== 'Cliente Mostrador') {
                      setActiveSuggestionSource('name');
                    } else if (activeSuggestionSource === 'name') {
                      setActiveSuggestionSource(null);
                    }
                  }}
                  onKeyDown={handleCustomerInputKeyDown}
                  placeholder="Cliente Mostrador"
                  className="w-full text-sm font-semibold px-2.5 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white text-slate-900"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Cédula / RIF
                </label>
                <input
                  type="text"
                  value={customerDocument}
                  onFocus={() => {
                    if (!selectedCustomerId && customerDocument.trim() && customerDocument !== 'V-00000000') {
                      setActiveSuggestionSource('document');
                    }
                  }}
                  onChange={(e) => {
                    const val = e.target.value;
                    setCustomerDocument(val);
                    if (selectedCustomerId) setSelectedCustomerId('');
                    if (val.trim() && val !== 'V-00000000') {
                      setActiveSuggestionSource('document');
                    } else if (activeSuggestionSource === 'document') {
                      setActiveSuggestionSource(null);
                    }
                  }}
                  onKeyDown={handleCustomerInputKeyDown}
                  placeholder="V-00000000 (opc.)"
                  className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono"
                />
              </div>
              <div>
                <label className="block text-[11px] font-semibold text-slate-600 mb-0.5">
                  Celular / WhatsApp
                </label>
                <input
                  type="tel"
                  value={customerPhone}
                  onChange={(e) => {
                    setCustomerPhone(e.target.value);
                    if (selectedCustomerId) setSelectedCustomerId('');
                  }}
                  placeholder="0414... (opc.)"
                  className="w-full text-xs px-2 py-1.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono"
                />
              </div>
            </div>
          </div>

          {/* 2. Sale Items & Payment Card */}
          <div className="bg-white rounded-xl border border-slate-200 p-4 sm:p-5 shadow-2xs space-y-4">
            {/* Sale Items Table */}
            <div className="pb-3 border-b border-slate-200">
              <div className="flex items-center justify-between mb-2">
                <div>
                  <span className="text-xs font-bold text-slate-900 uppercase tracking-wider block">
                    Ítems a Facturar ({posCart.length})
                  </span>
                  <span className="text-[10px] text-slate-500 font-normal">
                    Puedes editar la cantidad o el precio de venta unitario directamente aquí.
                  </span>
                </div>
                {posCart.length > 0 && (
                  <button
                    type="button"
                    onClick={() => setPosCart([])}
                    className="text-[11px] text-rose-600 hover:underline cursor-pointer"
                  >
                    Limpiar lista
                  </button>
                )}
              </div>

              {posCart.length === 0 ? (
                <div className="p-5 text-center border border-dashed border-slate-200 rounded-lg text-slate-400 text-xs space-y-2.5">
                  <p>Haz clic en un repuesto del catálogo o agrega mano de obra para iniciar la venta.</p>
                  <button
                    type="button"
                    onClick={() => handleOpenQuickRegister()}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-50 hover:bg-amber-100 text-amber-800 border border-amber-200 rounded-lg text-xs font-bold transition-colors cursor-pointer"
                  >
                    <PackagePlus className="w-3.5 h-3.5 text-amber-600" />
                    <span>+ Registrar repuesto no registrado</span>
                  </button>
                </div>
              ) : (
                <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                  {posCart.map((item) => {
                    const effectivePrice = getItemEffectivePrice(item);
                    const isPriceModified =
                      item.customPrice !== undefined &&
                      item.customPrice !== '' &&
                      Number(item.customPrice) !== item.product.salePrice;

                    return (
                      <div
                        key={item.product.id}
                        className={`p-2.5 rounded-xl border text-xs space-y-2 transition-colors ${
                          isPriceModified ? 'bg-amber-50/40 border-amber-300' : 'bg-slate-50/60 border-slate-200'
                        }`}
                      >
                        {/* Top: Product Name, SKU, Edit, and Delete */}
                        <div className="flex items-start justify-between gap-2">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <p className="font-bold text-slate-900 whitespace-normal break-words">{item.product.name}</p>
                              {isPriceModified && (
                                <span className="text-[9px] font-bold bg-amber-200 text-amber-950 px-1.5 py-0.2 rounded border border-amber-300 flex items-center gap-0.5">
                                  <Edit3 className="w-2.5 h-2.5 text-amber-800" />
                                  <span>Precio editado</span>
                                </span>
                              )}
                            </div>
                            <span className="text-[10px] text-slate-400 font-mono">
                              SKU: {item.product.sku}
                            </span>
                          </div>

                          <div className="flex items-center gap-0.5">
                            <button
                              type="button"
                              onClick={() => handleOpenEditProduct(item.product)}
                              className="text-slate-400 hover:text-amber-800 p-1 rounded hover:bg-white cursor-pointer"
                              title="Editar datos de este repuesto (nombre, categoría, precio, stock)"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleRemoveFromCart(item.product.id)}
                              className="text-slate-400 hover:text-rose-600 p-1 rounded hover:bg-white cursor-pointer"
                              title="Eliminar este repuesto del ticket"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>

                        {/* Bottom: Quantity, Editable Price, and Subtotal */}
                        <div className="flex flex-wrap items-center justify-between gap-2 pt-1 border-t border-slate-200/80">
                          {/* Qty +/- */}
                          <div className="flex items-center border border-slate-200 rounded-lg bg-white shrink-0">
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.product.id, -1)}
                              className="p-1 hover:bg-slate-100 text-slate-700 cursor-pointer rounded-l-lg"
                              title="Restar cantidad"
                            >
                              <Minus className="w-2.5 h-2.5" />
                            </button>
                            <span className="px-2 font-mono font-bold text-xs min-w-[20px] text-center">
                              {item.quantity}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleUpdateQty(item.product.id, 1)}
                              className="p-1 hover:bg-slate-100 text-slate-700 cursor-pointer rounded-r-lg"
                              title="Sumar cantidad"
                            >
                              <Plus className="w-2.5 h-2.5" />
                            </button>
                          </div>

                          {/* Editable Price Input */}
                          <div className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-lg border border-slate-200 shadow-2xs">
                            <span className="text-[10px] font-semibold text-slate-500 flex items-center gap-0.5">
                              <Edit3 className="w-2.5 h-2.5 text-amber-600" />
                              <span>Precio:</span>
                            </span>
                            <div className="flex items-center">
                              <span className="text-[11px] font-bold text-slate-400 mr-0.5">$</span>
                              <input
                                type="number"
                                step="any"
                                min="0"
                                value={item.customPrice !== undefined ? item.customPrice : item.product.salePrice}
                                onChange={(e) => handleUpdateUnitPrice(item.product.id, e.target.value)}
                                className={`w-16 font-mono font-bold text-xs outline-none text-right ${
                                  isPriceModified ? 'text-amber-950 bg-amber-100/60 rounded px-1' : 'text-slate-900'
                                }`}
                                title="Modifica aquí el precio de venta unitario para este ticket"
                              />
                            </div>
                            {isPriceModified && (
                              <button
                                type="button"
                                onClick={() => handleResetUnitPrice(item.product.id)}
                                className="text-slate-400 hover:text-amber-800 p-0.5 rounded cursor-pointer"
                                title={`Restaurar precio original de catálogo: ${formatUSD(item.product.salePrice)}`}
                              >
                                <RotateCcw className="w-3 h-3" />
                              </button>
                            )}
                          </div>

                          {/* Subtotal */}
                          <div className="text-right ml-auto shrink-0">
                            <span className="font-mono font-bold text-slate-900 block tabular-nums text-xs">
                              {formatUSD(effectivePrice * item.quantity)}
                            </span>
                            <span className="font-mono text-[10px] text-emerald-700 block tabular-nums">
                              {formatBs(effectivePrice * item.quantity * rate)}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Payment Method & Dual Totals */}
            <div className="space-y-3">
              {/* Opción de Gastos de Envío Nacional (Ventas a Otros Estados distintos a Mérida) */}
              <div
                className={`rounded-xl border transition-all ${
                  hasShipping
                    ? 'bg-sky-50/70 border-sky-300 shadow-2xs'
                    : 'bg-slate-50/80 border-slate-200 hover:border-sky-300'
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    setHasShipping((prev) => !prev);
                    setPosFormError(null);
                  }}
                  className="w-full px-3 py-2.5 flex items-center justify-between gap-2 text-left cursor-pointer"
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <div
                      className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                        hasShipping
                          ? 'bg-sky-600 text-white'
                          : 'bg-white border border-slate-200 text-slate-600'
                      }`}
                    >
                      <Truck className="w-4 h-4" />
                    </div>
                    <div className="min-w-0">
                      <span className="text-xs font-bold text-slate-900 block leading-tight">
                        Agregar Gastos de Envío (Otros Estados)
                      </span>
                      <span className="text-[10px] text-slate-500 block leading-snug">
                        {hasShipping
                          ? `${shippingAgency} · Destino: ${shippingState}`
                          : 'Para envíos fuera de Mérida (MRW, Zoom, Tealca, Domesa...)'}
                      </span>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    {hasShipping && shippingCostUSD > 0 && (
                      <span className="px-2 py-0.5 rounded-md bg-sky-600 text-white font-mono text-[11px] font-bold">
                        +{formatUSD(shippingCostUSD)}
                      </span>
                    )}
                    <div
                      className={`w-9 h-5 rounded-full transition-colors p-0.5 flex items-center ${
                        hasShipping ? 'bg-sky-600 justify-end' : 'bg-slate-300 justify-start'
                      }`}
                    >
                      <span className="w-4 h-4 rounded-full bg-white shadow-xs block" />
                    </div>
                  </div>
                </button>

                {hasShipping && (
                  <div className="px-3 pb-3 pt-1.5 border-t border-sky-200/80 space-y-2.5">
                    {/* Estado de destino (fuera de Mérida) */}
                    <div>
                      <label className="block text-[10px] font-bold text-sky-950 uppercase tracking-wider mb-1">
                        Estado de Destino (Distinto a Mérida):
                      </label>
                      <select
                        value={shippingState}
                        onChange={(e) => setShippingState(e.target.value)}
                        className="w-full px-2.5 py-1.5 text-xs font-semibold rounded-lg border border-sky-300 bg-white text-slate-900 focus:outline-hidden focus:border-sky-500"
                      >
                        {OTHER_VENEZUELAN_STATES.map((st) => (
                          <option key={st} value={st}>
                            {st}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Agencia de Encomienda */}
                    <div>
                      <label className="block text-[10px] font-bold text-sky-950 uppercase tracking-wider mb-1">
                        Agencia de Envío:
                      </label>
                      <div className="flex flex-wrap gap-1.5">
                        {SHIPPING_AGENCY_OPTIONS.map((agency) => (
                          <button
                            key={agency}
                            type="button"
                            onClick={() => setShippingAgency(agency)}
                            className={`px-2.5 py-1 rounded-lg text-[11px] font-bold border transition-colors cursor-pointer ${
                              shippingAgency === agency
                                ? 'bg-sky-600 border-sky-600 text-white shadow-2xs'
                                : 'bg-white border-sky-200 text-sky-900 hover:bg-sky-100'
                            }`}
                          >
                            {agency}
                          </button>
                        ))}
                      </div>
                    </div>

                    {/* Monto del Envío en USD ($) o Bolívares (Bs.) */}
                    <div>
                      <div className="flex items-center justify-between gap-2 mb-1">
                        <label className="text-[10px] font-bold text-sky-950 uppercase tracking-wider">
                          Costo de Envío:
                        </label>
                        <div className="inline-flex rounded-lg border border-sky-300 bg-white p-0.5">
                          <button
                            type="button"
                            onClick={() => handleSelectShippingCurrencyMode('USD')}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${
                              shippingCurrencyMode === 'USD'
                                ? 'bg-sky-600 text-white'
                                : 'text-sky-900 hover:bg-sky-50'
                            }`}
                          >
                            $ Divisas
                          </button>
                          <button
                            type="button"
                            onClick={() => handleSelectShippingCurrencyMode('BS')}
                            className={`px-2 py-0.5 rounded-md text-[10px] font-bold cursor-pointer transition-colors ${
                              shippingCurrencyMode === 'BS'
                                ? 'bg-sky-600 text-white'
                                : 'text-sky-900 hover:bg-sky-50'
                            }`}
                          >
                            Bs. BCV
                          </button>
                        </div>
                      </div>

                      {shippingCurrencyMode === 'USD' ? (
                        <div className="space-y-1.5">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-sky-700">
                              $
                            </span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={shippingCostUSDInput}
                              onChange={(e) => handleChangeShippingUSD(e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-6 pr-3 py-1.5 text-sm font-mono font-bold rounded-lg border border-sky-300 bg-white text-slate-900 focus:outline-hidden focus:border-sky-500"
                            />
                          </div>
                          <div className="flex items-center justify-between gap-1.5 flex-wrap">
                            <div className="flex items-center gap-1">
                              {[3, 5, 8, 10].map((preset) => (
                                <button
                                  key={preset}
                                  type="button"
                                  onClick={() => handleChangeShippingUSD(String(preset))}
                                  className="px-2 py-0.5 rounded bg-white hover:bg-sky-100 border border-sky-200 text-[10px] font-mono font-bold text-sky-900 cursor-pointer"
                                >
                                  +${preset}
                                </button>
                              ))}
                            </div>
                            {shippingCostUSD > 0 && (
                              <span className="text-[11px] font-mono font-semibold text-emerald-800">
                                ≈ {formatBs(shippingCostBs)} (BCV)
                              </span>
                            )}
                          </div>
                        </div>
                      ) : (
                        <div className="space-y-1">
                          <div className="relative">
                            <span className="absolute left-2.5 top-1/2 -translate-y-1/2 text-xs font-extrabold text-sky-700">
                              Bs.
                            </span>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={shippingCostBsInput}
                              onChange={(e) => handleChangeShippingBs(e.target.value)}
                              placeholder="0.00"
                              className="w-full pl-9 pr-3 py-1.5 text-sm font-mono font-bold rounded-lg border border-sky-300 bg-white text-slate-900 focus:outline-hidden focus:border-sky-500"
                            />
                          </div>
                          {shippingCostBs > 0 && (
                            <div className="text-right text-[11px] font-mono font-semibold text-sky-900">
                              Equiv. {formatUSD(shippingCostUSD)} (Tasa BCV: Bs. {rate.toFixed(2)})
                            </div>
                          )}
                        </div>
                      )}
                    </div>

                    {/* Ciudad / Oficina destino opcional */}
                    <div>
                      <input
                        type="text"
                        value={shippingNotes}
                        onChange={(e) => setShippingNotes(e.target.value)}
                        placeholder={`Ciudad o agencia ${shippingAgency} de destino (opcional)...`}
                        className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-sky-200 bg-white text-slate-800 placeholder:text-slate-400 focus:outline-hidden focus:border-sky-500"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Condición de Venta: De Contado, A Crédito, Sistema de Apartado, MercadoLibre, Pago Mixto o Abrir Cuenta */}
              <div>
                <label className="block text-[10px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                  Condición de la Venta:
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpenAccountMode(false);
                      setTargetOpenAccountId(null);
                      setPaymentType('CONTADO');
                    }}
                    className={`p-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      !isOpenAccountMode && paymentType === 'CONTADO'
                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Banknote className="w-3.5 h-3.5" />
                    <span>Contado</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpenAccountMode(false);
                      setTargetOpenAccountId(null);
                      setPaymentType('CREDITO');
                    }}
                    className={`p-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      !isOpenAccountMode && paymentType === 'CREDITO'
                        ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Clock className="w-3.5 h-3.5" />
                    <span>Crédito</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpenAccountMode(false);
                      setTargetOpenAccountId(null);
                      setPaymentType('APARTADO');
                    }}
                    className={`p-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      !isOpenAccountMode && paymentType === 'APARTADO'
                        ? 'bg-indigo-600 border-indigo-600 text-white shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <BookmarkCheck className="w-3.5 h-3.5" />
                    <span>Sistema de Apartado</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpenAccountMode(false);
                      setTargetOpenAccountId(null);
                      setPaymentType('MERCADOLIBRE');
                    }}
                    className={`p-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      !isOpenAccountMode && paymentType === 'MERCADOLIBRE'
                        ? 'bg-yellow-500 border-yellow-500 text-slate-950 font-extrabold shadow-xs'
                        : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <Package className="w-3.5 h-3.5 text-yellow-700" />
                    <span>MercadoLibre</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpenAccountMode(false);
                      setTargetOpenAccountId(null);
                      setPaymentType('MIXTO');
                      setPosFormError(null);
                      if (mixtoSplits.length < 2) {
                        setMixtoSplits(createDefaultMixtoSplits());
                      }
                    }}
                    className={`col-span-2 p-2 rounded-lg border text-xs font-bold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      !isOpenAccountMode && paymentType === 'MIXTO'
                        ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                        : 'bg-teal-50/60 border-teal-200 text-teal-900 hover:bg-teal-100/70'
                    }`}
                  >
                    <Layers className="w-3.5 h-3.5" />
                    <span>Pago Mixto (Combinar 2 o más formas de pago)</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setIsOpenAccountMode(true);
                      setPosFormError(null);
                      if (activeOpenAccounts.length === 0) {
                        setOpenAccountSubMode('NUEVA');
                        setTargetOpenAccountId(null);
                      }
                    }}
                    className={`col-span-2 p-2.5 rounded-lg border text-xs font-extrabold flex items-center justify-center gap-1.5 transition-all cursor-pointer ${
                      isOpenAccountMode
                        ? 'bg-violet-600 border-violet-600 text-white shadow-sm'
                        : 'bg-violet-50/80 border-violet-300 text-violet-950 hover:bg-violet-100'
                    }`}
                  >
                    <ClipboardList className="w-4 h-4 shrink-0" />
                    <span>Abrir Cuenta (Talleres Vecinos · Pago al Final del Día)</span>
                  </button>
                </div>
              </div>

              {/* Panel de Configuración para Modalidad Abrir Cuenta */}
              {isOpenAccountMode && (
                <div className="p-3 bg-violet-50/90 border-2 border-violet-300 rounded-xl space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-extrabold text-violet-950 flex items-center gap-1.5">
                      <ClipboardList className="w-4 h-4 text-violet-700" />
                      Modalidad Cuenta Abierta del Día
                    </span>
                    <button
                      type="button"
                      onClick={handleExitOpenAccountMode}
                      className="text-[11px] font-bold text-violet-700 hover:text-violet-950 cursor-pointer"
                    >
                      Cambiar
                    </button>
                  </div>

                  {/* Toggle Nueva Cuenta vs Sumar a Existente */}
                  <div className="grid grid-cols-2 gap-1.5 bg-violet-100/80 p-1 rounded-lg border border-violet-200">
                    <button
                      type="button"
                      onClick={() => {
                        setOpenAccountSubMode('NUEVA');
                        setTargetOpenAccountId(null);
                        setPosFormError(null);
                      }}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                        openAccountSubMode === 'NUEVA'
                          ? 'bg-violet-700 text-white shadow-2xs'
                          : 'text-violet-900 hover:bg-white/70'
                      }`}
                    >
                      + Nueva Cuenta
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setOpenAccountSubMode('SUMAR');
                        setPosFormError(null);
                        if (!targetOpenAccountId && activeOpenAccounts.length > 0) {
                          setTargetOpenAccountId(activeOpenAccounts[0].id);
                        }
                      }}
                      className={`py-1.5 px-2 rounded-md text-[11px] font-bold cursor-pointer transition-colors ${
                        openAccountSubMode === 'SUMAR'
                          ? 'bg-violet-700 text-white shadow-2xs'
                          : 'text-violet-900 hover:bg-white/70'
                      }`}
                    >
                      + Sumar a Existente ({activeOpenAccounts.length})
                    </button>
                  </div>

                  {openAccountSubMode === 'NUEVA' ? (
                    <div className="space-y-2.5">
                      <div className="p-2 rounded-lg bg-white border border-violet-200 text-[11px] text-violet-950 leading-snug">
                        <strong>Datos personales requeridos arriba:</strong> Nombre completo del cliente + Cédula/RIF o Teléfono/WhatsApp. Puedes abrir la cuenta con repuestos ya cargados o en $0 para ir sumando durante el día.
                      </div>

                      <div className="grid grid-cols-1 gap-2">
                        <div>
                          <label className="block text-[10px] font-bold text-violet-950 uppercase mb-1 flex items-center gap-1">
                            <Wrench className="w-3 h-3 text-violet-600" />
                            <span>Taller Vecino / Mecánico (Opcional):</span>
                          </label>
                          <input
                            type="text"
                            value={openAccountWorkshop}
                            onChange={(e) => setOpenAccountWorkshop(e.target.value)}
                            placeholder="Ej. Taller El Chino, Mecánico Luis..."
                            className="w-full px-2.5 py-1.5 text-xs font-medium rounded-lg border border-violet-300 bg-white text-slate-900 focus:outline-hidden focus:border-violet-600"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-bold text-violet-950 uppercase mb-1 flex items-center gap-1">
                            <Bike className="w-3 h-3 text-violet-600" />
                            <span>Moto / Placa (Opcional):</span>
                          </label>
                          <input
                            type="text"
                            value={openAccountMoto}
                            onChange={(e) => setOpenAccountMoto(e.target.value)}
                            placeholder="Ej. Bera SBR Negra · Placa AB1C23D"
                            className="w-full px-2.5 py-1.5 text-xs font-medium rounded-lg border border-violet-300 bg-white text-slate-900 focus:outline-hidden focus:border-violet-600"
                          />
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="space-y-2.5">
                      {activeOpenAccounts.length === 0 ? (
                        <div className="p-3 rounded-lg bg-white border border-violet-200 text-xs text-slate-600 text-center">
                          No hay cuentas abiertas todavía. Cambia a <strong>"+ Nueva Cuenta"</strong> para crear una.
                        </div>
                      ) : (
                        <>
                          <div>
                            <label className="block text-[10px] font-bold text-violet-950 uppercase mb-1">
                              Selecciona la Cuenta Abierta:
                            </label>
                            <div className="space-y-1.5 max-h-40 overflow-y-auto pr-0.5">
                              {activeOpenAccounts.map((acc) => {
                                const isSelected = targetOpenAccountId === acc.id;
                                return (
                                  <button
                                    key={acc.id}
                                    type="button"
                                    onClick={() => handleStartAddItemsToOpenAccount(acc)}
                                    className={`w-full text-left p-2 rounded-lg border transition-all cursor-pointer flex items-center justify-between gap-2 ${
                                      isSelected
                                        ? 'bg-violet-700 border-violet-700 text-white shadow-xs'
                                        : 'bg-white border-violet-200 text-slate-900 hover:bg-violet-100/70'
                                    }`}
                                  >
                                    <div className="min-w-0">
                                      <p className="text-xs font-extrabold whitespace-normal break-words leading-snug">
                                        {acc.customerName}
                                      </p>
                                      <p
                                        className={`text-[10px] ${
                                          isSelected ? 'text-violet-200' : 'text-slate-500'
                                        }`}
                                      >
                                        {acc.accountNumber}
                                        {acc.workshopName ? ` · ${acc.workshopName}` : ''}
                                      </p>
                                    </div>
                                    <div className="text-right font-mono shrink-0 tabular-nums">
                                      <span className="text-xs font-extrabold block">
                                        {formatUSD(acc.subtotal)}
                                      </span>
                                      <span
                                        className={`text-[10px] block ${
                                          isSelected ? 'text-emerald-300' : 'text-emerald-700'
                                        }`}
                                      >
                                        {acc.items.length} ítems
                                      </span>
                                    </div>
                                  </button>
                                );
                              })}
                            </div>
                          </div>

                          <div>
                            <label className="block text-[10px] font-bold text-violet-950 uppercase mb-1">
                              Quién retira / Nota de este pedido (Opcional):
                            </label>
                            <input
                              type="text"
                              value={openAccountPickupNote}
                              onChange={(e) => setOpenAccountPickupNote(e.target.value)}
                              placeholder="Ej. Retiró el mecánico, 2da vuelta..."
                              className="w-full px-2.5 py-1.5 text-xs rounded-lg border border-violet-300 bg-white text-slate-900"
                            />
                          </div>
                        </>
                      )}
                    </div>
                  )}
                </div>
              )}

              {/* Si es Pago Mixto: Panel de Desglose por Formas de Pago */}
              {!isOpenAccountMode && paymentType === 'MIXTO' && (() => {
                const assignedUSD = Math.round(
                  mixtoSplits.reduce((sum, sp) => sum + (parseFloat(sp.amountUSD) || 0), 0) * 100
                ) / 100;
                const remainingUSD = Math.round((totalUSD - assignedUSD) * 100) / 100;
                const isExact = totalUSD > 0 && Math.abs(remainingUSD) <= 0.01;

                const updateMixtoLegUSD = (legId: string, rawVal: string) => {
                  const cleanVal = rawVal;
                  const numUSD = parseFloat(cleanVal);
                  const validNum = !Number.isNaN(numUSD) && numUSD >= 0 ? numUSD : 0;
                  setMixtoSplits((prev) => {
                    const updated = prev.map((leg) =>
                      leg.id === legId
                        ? {
                            ...leg,
                            amountUSD: cleanVal,
                            amountBs: cleanVal === '' ? '' : (validNum * rate).toFixed(2),
                          }
                        : leg
                    );
                    // Si hay exactamente 2 formas de pago y el usuario editó la primera, autocompletar el restante en la segunda
                    if (updated.length === 2 && updated[0].id === legId && totalUSD > 0) {
                      const rem = Math.max(0, Math.round((totalUSD - validNum) * 100) / 100);
                      updated[1] = {
                        ...updated[1],
                        amountUSD: cleanVal === '' ? '' : rem.toFixed(2),
                        amountBs: cleanVal === '' ? '' : (rem * rate).toFixed(2),
                      };
                    }
                    return updated;
                  });
                };

                const updateMixtoLegBs = (legId: string, rawVal: string) => {
                  const cleanVal = rawVal;
                  const numBs = parseFloat(cleanVal);
                  const validBs = !Number.isNaN(numBs) && numBs >= 0 ? numBs : 0;
                  const equivUSD = rate > 0 ? Math.round((validBs / rate) * 100) / 100 : 0;
                  setMixtoSplits((prev) => {
                    const updated = prev.map((leg) =>
                      leg.id === legId
                        ? {
                            ...leg,
                            amountBs: cleanVal,
                            amountUSD: cleanVal === '' ? '' : equivUSD.toFixed(2),
                          }
                        : leg
                    );
                    if (updated.length === 2 && updated[0].id === legId && totalUSD > 0) {
                      const rem = Math.max(0, Math.round((totalUSD - equivUSD) * 100) / 100);
                      const secondIsBs = updated[1].currencyMode
                        ? updated[1].currencyMode === 'BS'
                        : isBsPaymentMethod(updated[1].paymentMethod);
                      const remBs = secondIsBs
                        ? Math.max(0, Math.round((totalUSD * rate - validBs) * 100) / 100)
                        : Math.round(rem * rate * 100) / 100;
                      updated[1] = {
                        ...updated[1],
                        amountUSD: cleanVal === '' ? '' : rem.toFixed(2),
                        amountBs: cleanVal === '' ? '' : remBs.toFixed(2),
                      };
                    }
                    return updated;
                  });
                };

                const fillRemainingOnLeg = (legId: string) => {
                  const othersSum = mixtoSplits
                    .filter((sp) => sp.id !== legId)
                    .reduce((sum, sp) => sum + (parseFloat(sp.amountUSD) || 0), 0);
                  const rem = Math.max(0, Math.round((totalUSD - othersSum) * 100) / 100);
                  setMixtoSplits((prev) =>
                    prev.map((leg) =>
                      leg.id === legId
                        ? {
                            ...leg,
                            amountUSD: rem.toFixed(2),
                            amountBs: (rem * rate).toFixed(2),
                          }
                        : leg
                    )
                  );
                };

                const splitEqually = () => {
                  if (totalUSD <= 0 || mixtoSplits.length === 0) return;
                  const n = mixtoSplits.length;
                  const basePart = Math.floor((totalUSD / n) * 100) / 100;
                  let acc = 0;
                  setMixtoSplits((prev) =>
                    prev.map((leg, idx) => {
                      const part =
                        idx === n - 1
                          ? Math.round((totalUSD - acc) * 100) / 100
                          : basePart;
                      acc += part;
                      return {
                        ...leg,
                        amountUSD: part.toFixed(2),
                        amountBs: (part * rate).toFixed(2),
                      };
                    })
                  );
                };

                return (
                  <div className="p-3 bg-teal-50/90 border border-teal-300 rounded-xl space-y-2.5">
                    <div className="flex items-center justify-between gap-2 flex-wrap">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-teal-950 flex items-center gap-1.5">
                          <Layers className="w-3.5 h-3.5 text-teal-700" />
                          Desglose de Pago Mixto
                        </span>
                        <span className="px-1.5 py-0.5 rounded bg-white border border-teal-300 text-[10px] font-mono font-bold text-teal-900">
                          Tasa BCV: {formatBs(rate)}
                        </span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={splitEqually}
                          disabled={totalUSD <= 0}
                          className="px-2 py-0.5 text-[10px] font-bold rounded bg-white border border-teal-300 text-teal-900 hover:bg-teal-100 cursor-pointer disabled:opacity-40"
                          title="Dividir el total en partes iguales"
                        >
                          Dividir 50/50
                        </button>
                        <button
                          type="button"
                          onClick={() =>
                            setMixtoSplits((prev) => [
                              ...prev,
                              {
                                id: `mix-${Date.now()}-${prev.length + 1}`,
                                splitType: 'CONTADO',
                                currencyMode: 'BS',
                                paymentMethod: 'Punto de Venta (Bs)',
                                pagoMovilAccount: 'BANESCO_PERSONAL',
                                amountUSD: '',
                                amountBs: '',
                                reference: '',
                              },
                            ])
                          }
                          className="px-2 py-0.5 text-[10px] font-bold rounded bg-teal-600 hover:bg-teal-700 text-white flex items-center gap-0.5 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                          <span>Agregar pago</span>
                        </button>
                      </div>
                    </div>

                    {/* Acceso rápido: Todo de Contado vs Parte Contado + Parte Crédito */}
                    <div className="grid grid-cols-2 gap-1.5 bg-teal-100/70 p-1 rounded-lg border border-teal-200/80">
                      <button
                        type="button"
                        onClick={() =>
                          setMixtoSplits((prev) =>
                            prev.map((leg) => ({ ...leg, splitType: 'CONTADO' as SaleSplitCondition }))
                          )
                        }
                        className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                          !hasMixtoCreditSplit
                            ? 'bg-emerald-700 text-white shadow-2xs'
                            : 'text-teal-900 hover:bg-white/70'
                        }`}
                      >
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Todo de Contado</span>
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMixtoSplits((prev) => {
                            if (prev.length < 2) return prev;
                            return prev.map((leg, i) => ({
                              ...leg,
                              splitType:
                                i === prev.length - 1
                                  ? ('CREDITO' as SaleSplitCondition)
                                  : ('CONTADO' as SaleSplitCondition),
                            }));
                          })
                        }
                        className={`py-1.5 px-2 rounded-md text-[11px] font-bold transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                          hasMixtoCreditSplit
                            ? 'bg-amber-600 text-white shadow-2xs'
                            : 'text-amber-900 hover:bg-amber-100/80'
                        }`}
                      >
                        <Clock className="w-3.5 h-3.5" />
                        <span>Contado + Crédito</span>
                      </button>
                    </div>

                    <div className="space-y-2.5">
                      {mixtoSplits.map((leg, idx) => {
                        const isCreditLeg = leg.splitType === 'CREDITO';
                        const isBsLeg = leg.currencyMode
                          ? leg.currencyMode === 'BS'
                          : isBsPaymentMethod(leg.paymentMethod);
                        const numUSD = parseFloat(leg.amountUSD) || 0;
                        const parsedBs = parseFloat(leg.amountBs);
                        const numBs = !Number.isNaN(parsedBs) && parsedBs > 0 ? parsedBs : numUSD * rate;
                        const destLabel = isCreditLeg
                          ? 'Cuenta por Cobrar (A Crédito)'
                          : leg.paymentMethod === 'Pago Móvil'
                            ? leg.pagoMovilAccount === 'PROVINCIAL'
                              ? 'Provincial (Bs.)'
                              : 'Banesco Personal (Bs.)'
                            : leg.paymentMethod === 'Efectivo Bs'
                              ? 'Caja Efectivo Bs'
                              : leg.paymentMethod === 'Dólares Efectivo (USD)'
                                ? 'Caja Efectivo USD ($)'
                                : leg.paymentMethod === 'Binance Pay (USDT)'
                                  ? 'Billetera USDT (Binance)'
                                  : 'Banesco SMCC (Bs.)';

                        const handleSelectCurrencyMode = (nextMode: MixtoCurrencyMode) => {
                          setMixtoSplits((prev) =>
                            prev.map((item) => {
                              if (item.id !== leg.id) return item;
                              let nextMethod = item.paymentMethod;
                              if (nextMode === 'BS' && !isBsPaymentMethod(item.paymentMethod)) {
                                nextMethod = 'Pago Móvil';
                              } else if (nextMode === 'USD' && isBsPaymentMethod(item.paymentMethod)) {
                                nextMethod = 'Dólares Efectivo (USD)';
                              }
                              return {
                                ...item,
                                currencyMode: nextMode,
                                paymentMethod: nextMethod,
                              };
                            })
                          );
                        };

                        return (
                          <div
                            key={leg.id}
                            className={`p-2.5 rounded-lg border border-l-4 space-y-2 shadow-2xs transition-colors ${
                              isCreditLeg
                                ? 'bg-amber-50/80 border-amber-300 border-l-amber-500'
                                : 'bg-white border-teal-200 border-l-emerald-500'
                            }`}
                          >
                            {/* Encabezado visual con badges claros: #Parte + Condición + Moneda */}
                            <div className="flex items-start justify-between gap-2">
                              <div className="space-y-1 min-w-0">
                                <div className="flex items-center gap-1.5 flex-wrap">
                                  <span className="text-[10px] font-black text-slate-700 bg-slate-100 border border-slate-200 px-1.5 py-0.5 rounded">
                                    Parte #{idx + 1}
                                  </span>
                                  <span
                                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-extrabold uppercase tracking-wide ${
                                      isCreditLeg
                                        ? 'bg-amber-600 text-white'
                                        : 'bg-emerald-600 text-white'
                                    }`}
                                  >
                                    {isCreditLeg ? (
                                      <>
                                        <Clock className="w-2.5 h-2.5" />
                                        A CRÉDITO
                                      </>
                                    ) : (
                                      <>
                                        <CheckCircle2 className="w-2.5 h-2.5" />
                                        DE CONTADO
                                      </>
                                    )}
                                  </span>
                                  <span
                                    className={`inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[10px] font-extrabold border ${
                                      isBsLeg
                                        ? 'bg-sky-100 text-sky-900 border-sky-300'
                                        : 'bg-emerald-50 text-emerald-900 border-emerald-300'
                                    }`}
                                  >
                                    {isBsLeg ? 'Bs. BOLÍVARES' : '$ DIVISAS'}
                                  </span>
                                </div>
                                <div className="text-[10px] text-slate-600 font-medium truncate">
                                  Destino: <strong className="text-slate-800">{destLabel}</strong>
                                </div>
                              </div>

                              <div className="flex items-center gap-1 shrink-0">
                                {totalUSD > 0 && !isExact && (
                                  <button
                                    type="button"
                                    onClick={() => fillRemainingOnLeg(leg.id)}
                                    className={`px-1.5 py-0.5 text-[10px] font-bold rounded border cursor-pointer ${
                                      isCreditLeg
                                        ? 'bg-amber-100 text-amber-900 border-amber-300 hover:bg-amber-200'
                                        : 'bg-teal-50 text-teal-800 border-teal-200 hover:bg-teal-100'
                                    }`}
                                  >
                                    Completar restante
                                  </button>
                                )}
                                {mixtoSplits.length > 2 && (
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMixtoSplits((prev) => prev.filter((item) => item.id !== leg.id))
                                    }
                                    className="p-0.5 text-rose-500 hover:text-rose-700 cursor-pointer"
                                    title="Quitar esta parte del pago"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                )}
                              </div>
                            </div>

                            {/* Controles claros: 1) Condición (Contado vs Crédito) y 2) Moneda (Bolívares vs Divisas) */}
                            <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5">
                              <div>
                                <span className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">
                                  1. Condición del pago
                                </span>
                                <div className="grid grid-cols-2 gap-1">
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMixtoSplits((prev) =>
                                        prev.map((item) =>
                                          item.id === leg.id
                                            ? { ...item, splitType: 'CONTADO' as SaleSplitCondition }
                                            : item
                                        )
                                      )
                                    }
                                    className={`py-1 px-1.5 rounded-md border text-[10px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                                      !isCreditLeg
                                        ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                                        : 'bg-white border-slate-200 text-slate-600 hover:bg-slate-50'
                                    }`}
                                  >
                                    <CheckCircle2 className="w-3 h-3 shrink-0" />
                                    <span>Contado</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setMixtoSplits((prev) =>
                                        prev.map((item) =>
                                          item.id === leg.id
                                            ? { ...item, splitType: 'CREDITO' as SaleSplitCondition }
                                            : item
                                        )
                                      )
                                    }
                                    className={`py-1 px-1.5 rounded-md border text-[10px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                                      isCreditLeg
                                        ? 'bg-amber-600 border-amber-600 text-white shadow-2xs'
                                        : 'bg-white border-slate-200 text-amber-800 hover:bg-amber-50'
                                    }`}
                                  >
                                    <Clock className="w-3 h-3 shrink-0" />
                                    <span>Crédito</span>
                                  </button>
                                </div>
                              </div>

                              <div>
                                <span className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">
                                  2. {isCreditLeg ? 'Moneda de referencia' : 'Se paga en'}
                                </span>
                                <div className="grid grid-cols-2 gap-1">
                                  <button
                                    type="button"
                                    onClick={() => handleSelectCurrencyMode('BS')}
                                    className={`py-1 px-1.5 rounded-md border text-[10px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                                      isBsLeg
                                        ? 'bg-sky-600 border-sky-600 text-white shadow-2xs'
                                        : 'bg-white border-slate-200 text-sky-900 hover:bg-sky-50'
                                    }`}
                                  >
                                    <Banknote className="w-3 h-3 shrink-0" />
                                    <span>Bs.</span>
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => handleSelectCurrencyMode('USD')}
                                    className={`py-1 px-1.5 rounded-md border text-[10px] font-bold cursor-pointer transition-colors flex items-center justify-center gap-1 ${
                                      !isBsLeg
                                        ? 'bg-emerald-700 border-emerald-700 text-white shadow-2xs'
                                        : 'bg-white border-slate-200 text-emerald-900 hover:bg-emerald-50'
                                    }`}
                                  >
                                    <DollarSign className="w-3 h-3 shrink-0" />
                                    <span>Divisas</span>
                                  </button>
                                </div>
                              </div>
                            </div>

                            <div className="grid grid-cols-1 gap-1.5">
                              {isCreditLeg ? (
                                <div className="px-2 py-1.5 rounded-md bg-amber-100/80 border border-amber-200 text-[10px] text-amber-950 font-medium">
                                  Quedará registrado como <strong>saldo pendiente a crédito</strong> del cliente (no ingresa hoy a caja/bancos).
                                </div>
                              ) : (
                                <>
                                  <select
                                    value={leg.paymentMethod}
                                    onChange={(e) => {
                                      const nextM = e.target.value as PaymentMethod;
                                      const nextCurrency: MixtoCurrencyMode = isBsPaymentMethod(nextM)
                                        ? 'BS'
                                        : 'USD';
                                      setMixtoSplits((prev) =>
                                        prev.map((item) =>
                                          item.id === leg.id
                                            ? { ...item, paymentMethod: nextM, currencyMode: nextCurrency }
                                            : item
                                        )
                                      );
                                    }}
                                    className={`w-full p-1.5 border rounded-lg text-xs font-semibold text-slate-800 ${
                                      isBsLeg
                                        ? 'border-sky-200 bg-sky-50/60'
                                        : 'border-emerald-200 bg-emerald-50/60'
                                    }`}
                                  >
                                    {isBsLeg ? (
                                      <>
                                        <option value="Pago Móvil">Pago Móvil (Bs.)</option>
                                        <option value="Efectivo Bs">Efectivo en Bolívares (Bs.)</option>
                                        <option value="Punto de Venta (Bs)">Punto de Venta (Bs.)</option>
                                        <option value="Transferencia Bancaria Bs">Transferencia Bancaria (Bs.)</option>
                                      </>
                                    ) : (
                                      <>
                                        <option value="Dólares Efectivo (USD)">Dólares Efectivo ($ USD)</option>
                                        <option value="Binance Pay (USDT)">Binance Pay (USDT)</option>
                                      </>
                                    )}
                                  </select>

                                  {isBsLeg && leg.paymentMethod === 'Pago Móvil' && (
                                    <div className="grid grid-cols-2 gap-1.5">
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setMixtoSplits((prev) =>
                                            prev.map((item) =>
                                              item.id === leg.id
                                                ? { ...item, pagoMovilAccount: 'BANESCO_PERSONAL' }
                                                : item
                                            )
                                          )
                                        }
                                        className={`py-1 px-2 rounded-md border text-[10px] font-bold cursor-pointer transition-colors ${
                                          leg.pagoMovilAccount === 'BANESCO_PERSONAL'
                                            ? 'bg-slate-900 border-slate-900 text-white'
                                            : 'bg-sky-50/70 border-sky-200 text-slate-700 hover:bg-sky-100'
                                        }`}
                                      >
                                        Banesco Personal
                                      </button>
                                      <button
                                        type="button"
                                        onClick={() =>
                                          setMixtoSplits((prev) =>
                                            prev.map((item) =>
                                              item.id === leg.id
                                                ? { ...item, pagoMovilAccount: 'PROVINCIAL' }
                                                : item
                                            )
                                          )
                                        }
                                        className={`py-1 px-2 rounded-md border text-[10px] font-bold cursor-pointer transition-colors ${
                                          leg.pagoMovilAccount === 'PROVINCIAL'
                                            ? 'bg-slate-900 border-slate-900 text-white'
                                            : 'bg-sky-50/70 border-sky-200 text-slate-700 hover:bg-sky-100'
                                        }`}
                                      >
                                        Provincial
                                      </button>
                                    </div>
                                  )}
                                </>
                              )}

                              {/* Monto Principal en la moneda seleccionada + Equivalente BCV en vivo */}
                              <div className="grid grid-cols-2 gap-1.5">
                                {isBsLeg ? (
                                  <>
                                    <div>
                                      <label className="block text-[9px] font-extrabold text-sky-800 uppercase mb-0.5">
                                        {isCreditLeg ? 'Crédito en Bs.' : 'Paga en Bs.'}
                                      </label>
                                      <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={leg.amountBs}
                                        onChange={(e) => updateMixtoLegBs(leg.id, e.target.value)}
                                        placeholder="0.00"
                                        className={`w-full p-1.5 border-2 rounded-lg text-xs font-mono font-extrabold text-sky-950 bg-sky-50/40 focus:outline-none focus:ring-2 focus:ring-sky-400/50 ${
                                          isCreditLeg ? 'border-amber-400' : 'border-sky-400'
                                        }`}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">
                                        Equiv. $ USD (BCV)
                                      </label>
                                      <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={leg.amountUSD}
                                        onChange={(e) => updateMixtoLegUSD(leg.id, e.target.value)}
                                        placeholder="0.00"
                                        className="w-full p-1.5 border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                                      />
                                    </div>
                                  </>
                                ) : (
                                  <>
                                    <div>
                                      <label className="block text-[9px] font-extrabold text-emerald-800 uppercase mb-0.5">
                                        {isCreditLeg ? 'Crédito en $ USD' : 'Paga en Divisas ($)'}
                                      </label>
                                      <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={leg.amountUSD}
                                        onChange={(e) => updateMixtoLegUSD(leg.id, e.target.value)}
                                        placeholder="0.00"
                                        className={`w-full p-1.5 border-2 rounded-lg text-xs font-mono font-extrabold text-slate-950 focus:outline-none focus:ring-2 ${
                                          isCreditLeg
                                            ? 'border-amber-400 bg-amber-50/40 focus:ring-amber-400/50'
                                            : 'border-emerald-400 bg-emerald-50/40 focus:ring-emerald-400/50'
                                        }`}
                                      />
                                    </div>
                                    <div>
                                      <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">
                                        Equiv. Bs. (BCV)
                                      </label>
                                      <input
                                        type="number"
                                        step="any"
                                        min="0"
                                        value={leg.amountBs}
                                        onChange={(e) => updateMixtoLegBs(leg.id, e.target.value)}
                                        placeholder="0.00"
                                        className="w-full p-1.5 border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-teal-400/40"
                                      />
                                    </div>
                                  </>
                                )}
                              </div>

                              {/* Franja resumen de equivalencia BCV en vivo por cada parte */}
                              {(numUSD > 0 || numBs > 0) && (
                                <div
                                  className={`px-2 py-1.5 rounded-md border flex items-center justify-between gap-2 text-[10px] ${
                                    isCreditLeg
                                      ? 'bg-amber-100/70 border-amber-300 text-amber-950'
                                      : isBsLeg
                                        ? 'bg-sky-50 border-sky-200 text-sky-950'
                                        : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                                  }`}
                                >
                                  <span className="font-bold flex items-center gap-1 min-w-0">
                                    <ArrowLeftRight className="w-3 h-3 shrink-0 opacity-75" />
                                    {isBsLeg ? (
                                      <span className="truncate">
                                        {isCreditLeg ? 'Crédito:' : 'Paga:'}{' '}
                                        <span className="font-mono font-extrabold">{formatBs(numBs)}</span>
                                      </span>
                                    ) : (
                                      <span className="truncate">
                                        {isCreditLeg ? 'Crédito:' : 'Paga:'}{' '}
                                        <span className="font-mono font-extrabold">{formatUSD(numUSD)}</span>
                                      </span>
                                    )}
                                  </span>
                                  <span className="font-mono font-bold shrink-0">
                                    {isBsLeg
                                      ? `⇄ ${formatUSD(numUSD)} BCV`
                                      : `⇄ ${formatBs(numBs)} BCV`}
                                  </span>
                                </div>
                              )}

                              <input
                                type="text"
                                value={leg.reference}
                                onChange={(e) => {
                                  const refVal = e.target.value;
                                  setMixtoSplits((prev) =>
                                    prev.map((item) =>
                                      item.id === leg.id ? { ...item, reference: refVal } : item
                                    )
                                  );
                                }}
                                placeholder={
                                  isCreditLeg
                                    ? 'Nota del crédito (ej. paga el viernes, acuerdo)...'
                                    : 'Ref. / Últimos 4 dígitos (opcional)...'
                                }
                                className="w-full px-2 py-1 border border-slate-200 rounded-md text-[11px] bg-slate-50 text-slate-700"
                              />
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    {/* Condiciones de la parte a Crédito cuando existe al menos una parte a Crédito */}
                    {hasMixtoCreditSplit && (
                      <div className="p-2.5 bg-amber-50 border border-amber-300 rounded-lg space-y-2">
                        <div className="flex items-center justify-between text-[11px] font-bold text-amber-950">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3.5 h-3.5 text-amber-600" />
                            Plazo de la parte a Crédito:
                          </span>
                          <span className="text-[10px] bg-amber-200/80 text-amber-950 px-1.5 py-0.5 rounded">
                            {creditDays} días
                          </span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          {[7, 15, 30].map((days) => (
                            <button
                              key={days}
                              type="button"
                              onClick={() => handleSelectCreditDays(days)}
                              className={`flex-1 py-1 px-2 text-[10px] font-bold rounded-md border transition-colors cursor-pointer ${
                                creditDays === days
                                  ? 'bg-amber-600 border-amber-600 text-white'
                                  : 'bg-white border-amber-200 text-amber-800 hover:bg-amber-100/60'
                              }`}
                            >
                              {days} Días
                            </button>
                          ))}
                        </div>
                        <div className="flex items-center justify-between gap-2 text-[11px]">
                          <label className="font-semibold text-amber-900 shrink-0">
                            Fecha Vencimiento:
                          </label>
                          <input
                            type="date"
                            value={creditDueDate}
                            onChange={(e) => setCreditDueDate(e.target.value)}
                            className="p-1 border border-amber-300 rounded-md text-xs bg-white text-slate-800 font-mono"
                          />
                        </div>
                      </div>
                    )}

                    {/* Resumen desglosado por Condición (Contado vs Crédito) y Moneda (Bs. vs Divisas) */}
                    <div className="p-2.5 bg-white/90 border border-teal-200 rounded-lg text-[11px] space-y-1.5">
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-emerald-900 font-bold">
                          <span className="flex items-center gap-1">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            De Contado (Hoy):
                          </span>
                          <span className="font-mono text-right">
                            {formatUSD(mixtoCashTotalUSD)}{' '}
                            <span className="text-[10px] font-semibold text-slate-500">
                              ({formatBs(mixtoCashTotalUSD * rate)})
                            </span>
                          </span>
                        </div>

                        {(mixtoCashBsUSD > 0 || mixtoCashDivisasUSD > 0) && (
                          <div className="pl-4 space-y-0.5 text-[10px]">
                            {mixtoCashBsUSD > 0 && (
                              <div className="flex items-center justify-between text-sky-900">
                                <span className="font-semibold">• En Bolívares (Bs.):</span>
                                <span className="font-mono font-bold">
                                  {formatBs(mixtoCashBsTotalBs)}{' '}
                                  <span className="text-slate-500 font-normal">
                                    (Equiv. {formatUSD(mixtoCashBsUSD)} BCV)
                                  </span>
                                </span>
                              </div>
                            )}
                            {mixtoCashDivisasUSD > 0 && (
                              <div className="flex items-center justify-between text-emerald-900">
                                <span className="font-semibold">• En Divisas ($ USD):</span>
                                <span className="font-mono font-bold">
                                  {formatUSD(mixtoCashDivisasUSD)}{' '}
                                  <span className="text-slate-500 font-normal">
                                    (Equiv. {formatBs(mixtoCashDivisasUSD * rate)} BCV)
                                  </span>
                                </span>
                              </div>
                            )}
                          </div>
                        )}

                        {hasMixtoCreditSplit && (
                          <div className="flex items-center justify-between text-amber-900 font-bold pt-1 border-t border-amber-100">
                            <span className="flex items-center gap-1">
                              <Clock className="w-3.5 h-3.5 text-amber-600" />
                              A Crédito ({creditDays}D):
                            </span>
                            <span className="font-mono text-right">
                              {formatUSD(mixtoCreditTotalUSD)}{' '}
                              <span className="text-[10px] font-semibold text-amber-700">
                                ({formatBs(mixtoCreditTotalUSD * rate)})
                              </span>
                            </span>
                          </div>
                        )}
                      </div>

                      {/* Barra de cuadre en tiempo real */}
                      <div className="pt-1.5 border-t border-teal-200/90 space-y-1">
                        <div className="flex items-center justify-between text-teal-950">
                          <span className="font-semibold">Total asignado:</span>
                          <span className="font-mono font-bold">
                            {formatUSD(assignedUSD)}{' '}
                            <span className="text-[10px] font-normal text-slate-600">
                              ({formatBs(assignedUSD * rate)})
                            </span>
                          </span>
                        </div>
                        <div className="flex items-center justify-between font-bold gap-2">
                          <span>Estado de cuadre:</span>
                          {isExact ? (
                            <span className="text-emerald-800 bg-emerald-100 border border-emerald-300 px-2 py-0.5 rounded font-mono text-[10px]">
                              ✓ Cuadrado exacto ({formatUSD(totalUSD)})
                            </span>
                          ) : remainingUSD > 0.01 ? (
                            <span className="text-amber-950 bg-amber-100 border border-amber-300 px-2 py-0.5 rounded font-mono text-[10px]">
                              Faltan {formatUSD(remainingUSD)} ({formatBs(remainingUSD * rate)})
                            </span>
                          ) : remainingUSD < -0.01 ? (
                            <span className="text-rose-800 bg-rose-100 border border-rose-300 px-2 py-0.5 rounded font-mono text-[10px]">
                              Excede por {formatUSD(Math.abs(remainingUSD))} ({formatBs(Math.abs(remainingUSD) * rate)})
                            </span>
                          ) : (
                            <span className="text-slate-500 text-[10px]">Agrega productos para cuadrar</span>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {/* Si es MercadoLibre: Panel de Configuración de Comisión */}
              {!isOpenAccountMode && paymentType === 'MERCADOLIBRE' && (
                <div className="p-3 bg-yellow-50/90 border border-yellow-300 rounded-xl space-y-2.5">
                  <div className="flex items-center justify-between text-xs font-bold text-yellow-950">
                    <span className="flex items-center gap-1.5">
                      <Package className="w-3.5 h-3.5 text-yellow-700" />
                      Monto que cobra MercadoLibre (Se agrega adicional):
                    </span>
                    <span className="text-[10px] font-semibold bg-yellow-200 text-yellow-900 px-2 py-0.5 rounded">
                      {mlCommissionMode === 'PERCENT' ? `${mlCommissionRate}% sobre precio base` : 'Monto Manual en $'}
                    </span>
                  </div>

                  <p className="text-[11px] text-yellow-950 bg-yellow-100/70 p-2 rounded-lg border border-yellow-200">
                    💡 <strong>Este monto se suma adicional al precio registrado</strong> del repuesto para que el cliente cubra la comisión y tu taller conserve el 100% del precio de venta registrado.
                  </p>

                  {/* Selector de modo: Monto Manual ($ USD) vs Porcentaje (%) */}
                  <div className="grid grid-cols-2 gap-1.5 bg-yellow-100/70 p-1 rounded-lg">
                    <button
                      type="button"
                      onClick={() => setMlCommissionMode('FIXED')}
                      className={`py-1 px-2 text-xs font-bold rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                        mlCommissionMode === 'FIXED'
                          ? 'bg-yellow-600 text-white shadow-2xs'
                          : 'text-yellow-950 hover:bg-yellow-200/60'
                      }`}
                    >
                      <DollarSign className="w-3.5 h-3.5" />
                      <span>Ingresar Monto ($)</span>
                    </button>
                    <button
                      type="button"
                      onClick={() => setMlCommissionMode('PERCENT')}
                      className={`py-1 px-2 text-xs font-bold rounded-md transition-colors cursor-pointer flex items-center justify-center gap-1 ${
                        mlCommissionMode === 'PERCENT'
                          ? 'bg-yellow-600 text-white shadow-2xs'
                          : 'text-yellow-950 hover:bg-yellow-200/60'
                      }`}
                    >
                      <span>% Porcentaje</span>
                    </button>
                  </div>

                  {/* Chips de ayuda rápida */}
                  <div className="flex items-center gap-1">
                    <span className="text-[10px] font-bold text-yellow-900 uppercase">Calcular:</span>
                    {[11, 13, 15].map((pct) => (
                      <button
                        key={pct}
                        type="button"
                        onClick={() => {
                          if (mlCommissionMode === 'FIXED') {
                            const calculated = Math.round(((baseTotalUSD * pct) / 100) * 100) / 100;
                            setMlCommissionUSD(calculated);
                          } else {
                            setMlCommissionRate(pct);
                          }
                        }}
                        className="flex-1 py-1 px-1.5 text-[11px] font-bold rounded-md border border-yellow-300 bg-white hover:bg-yellow-100 text-yellow-900 transition-colors cursor-pointer text-center"
                      >
                        {pct}%
                      </button>
                    ))}
                    {mlCommissionMode === 'FIXED' && (
                      <>
                        {[2, 5, 10, 15].map((quickD) => (
                          <button
                            key={quickD}
                            type="button"
                            onClick={() => setMlCommissionUSD(quickD)}
                            className="py-1 px-2 text-[11px] font-bold rounded-md border border-yellow-300 bg-white hover:bg-yellow-100 text-yellow-900 transition-colors cursor-pointer"
                          >
                            ${quickD}
                          </button>
                        ))}
                      </>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2 text-xs">
                    {mlCommissionMode === 'PERCENT' ? (
                      <div>
                        <label className="block text-[10px] font-semibold text-yellow-950 mb-1">
                          Porcentaje Comisión (%):
                        </label>
                        <div className="relative">
                          <input
                            type="number"
                            step="any"
                            min="0"
                            max="100"
                            value={mlCommissionRate}
                            onChange={(e) => setMlCommissionRate(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="11.0"
                            className="w-full p-1.5 pr-6 border border-yellow-300 rounded-lg text-xs bg-white text-slate-900 font-mono"
                          />
                          <span className="absolute right-2 top-1.5 text-xs text-slate-400 font-bold">%</span>
                        </div>
                      </div>
                    ) : (
                      <div>
                        <label className="block text-[10px] font-semibold text-yellow-950 mb-1">
                          Monto Adicional a Sumar ($ USD):
                        </label>
                        <div className="relative">
                          <span className="absolute left-2 top-1.5 text-xs text-slate-400 font-bold">$</span>
                          <input
                            type="number"
                            step="any"
                            min="0"
                            value={mlCommissionUSD}
                            onChange={(e) => setMlCommissionUSD(e.target.value === '' ? '' : Number(e.target.value))}
                            placeholder="0.00"
                            className="w-full p-1.5 pl-5 border border-yellow-300 rounded-lg text-xs bg-white text-slate-900 font-mono font-bold"
                          />
                        </div>
                      </div>
                    )}

                    <div>
                      <label className="block text-[10px] font-semibold text-yellow-950 mb-1">
                        Recargo Adicional ML:
                      </label>
                      <div className="p-1.5 bg-yellow-100/90 border border-yellow-300 rounded-lg text-xs font-mono font-bold text-yellow-950">
                        +{formatUSD(computedMlCommissionUSD)}
                        <span className="text-[10px] block font-normal text-yellow-800">
                          +{formatBs(computedMlCommissionUSD * rate)}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Resumen neto taller y aviso de deuda */}
                  <div className="pt-2 border-t border-yellow-200/90 text-xs space-y-1">
                    <div className="flex justify-between items-center text-yellow-900">
                      <span>Precio registrado de repuestos:</span>
                      <span className="font-mono font-bold text-slate-800">
                        {formatUSD(baseTotalUSD)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-yellow-950 font-bold">
                      <span>Monto ML adicional al precio:</span>
                      <span className="font-mono font-extrabold text-amber-900">
                        +{formatUSD(computedMlCommissionUSD)}
                      </span>
                    </div>
                    <div className="flex justify-between items-center text-slate-950 font-bold pt-1 border-t border-yellow-300">
                      <span>Total a cobrar al cliente:</span>
                      <span className="font-mono font-extrabold text-base text-slate-950">
                        {formatUSD(totalUSD)}
                      </span>
                    </div>
                    <p className="text-[10px] text-yellow-800">
                      🔔 La comisión de <strong>{formatUSD(computedMlCommissionUSD)}</strong> se sumará a tu <strong>Deuda a MercadoLibre</strong> para notificarte por WhatsApp.
                    </p>
                  </div>
                </div>
              )}

              {/* Si es A Crédito o Sistema de Apartado: Panel de Plazo, Vencimiento y Abono */}
              {!isOpenAccountMode && (paymentType === 'CREDITO' || paymentType === 'APARTADO') && (
                <div
                  className={`p-3 rounded-xl space-y-2.5 border ${
                    paymentType === 'APARTADO'
                      ? 'bg-indigo-50/90 border-indigo-200'
                      : 'bg-amber-50/90 border-amber-200'
                  }`}
                >
                  <div
                    className={`flex items-center justify-between text-xs font-bold ${
                      paymentType === 'APARTADO' ? 'text-indigo-900' : 'text-amber-900'
                    }`}
                  >
                    <span className="flex items-center gap-1">
                      {paymentType === 'APARTADO' ? (
                        <BookmarkCheck className="w-3.5 h-3.5 text-indigo-600" />
                      ) : (
                        <Calendar className="w-3.5 h-3.5 text-amber-600" />
                      )}
                      {paymentType === 'APARTADO'
                        ? 'Condiciones del Sistema de Apartado:'
                        : 'Condiciones del Crédito:'}
                    </span>
                    <span
                      className={`text-[10px] font-semibold px-2 py-0.5 rounded ${
                        paymentType === 'APARTADO'
                          ? 'bg-indigo-200/80 text-indigo-900'
                          : 'bg-amber-200/80 text-amber-900'
                      }`}
                    >
                      {paymentType === 'APARTADO'
                        ? `${creditDays} días para retirar`
                        : `${creditDays} días de plazo`}
                    </span>
                  </div>

                  {paymentType === 'APARTADO' && (
                    <p className="text-[11px] text-indigo-900 bg-indigo-100/70 p-2 rounded-lg border border-indigo-200">
                      El repuesto queda reservado para el cliente hasta completar el pago y retirar antes de la fecha límite.
                    </p>
                  )}

                  {/* Chips de Plazo */}
                  <div className="flex items-center gap-1.5">
                    {[7, 15, 30].map((days) => (
                      <button
                        key={days}
                        type="button"
                        onClick={() => handleSelectCreditDays(days)}
                        className={`flex-1 py-1 px-2 text-[11px] font-bold rounded-md border transition-colors cursor-pointer ${
                          creditDays === days
                            ? paymentType === 'APARTADO'
                              ? 'bg-indigo-600 border-indigo-600 text-white'
                              : 'bg-amber-600 border-amber-600 text-white'
                            : paymentType === 'APARTADO'
                            ? 'bg-white border-indigo-200 text-indigo-800 hover:bg-indigo-100/50'
                            : 'bg-white border-amber-200 text-amber-800 hover:bg-amber-100/50'
                        }`}
                      >
                        {days} Días
                      </button>
                    ))}
                  </div>

                  <div className="text-xs">
                    <label
                      className={`block text-[10px] font-semibold mb-1 ${
                        paymentType === 'APARTADO' ? 'text-indigo-900' : 'text-amber-900'
                      }`}
                    >
                      {paymentType === 'APARTADO' ? 'Fecha Límite de Retiro:' : 'Fecha Vencimiento:'}
                    </label>
                    <input
                      type="date"
                      value={creditDueDate}
                      onChange={(e) => setCreditDueDate(e.target.value)}
                      className={`w-full p-1.5 border rounded-lg text-xs bg-white text-slate-800 font-mono ${
                        paymentType === 'APARTADO' ? 'border-indigo-300' : 'border-amber-300'
                      }`}
                    />
                  </div>

                  {/* Abono Inicial en Bolívares o Divisas con equivalente BCV en vivo */}
                  <div
                    className={`p-2.5 rounded-xl bg-white border space-y-2 ${
                      paymentType === 'APARTADO' ? 'border-indigo-200' : 'border-amber-200'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-1.5 flex-wrap">
                      <span
                        className={`text-[10px] font-extrabold uppercase tracking-wide ${
                          paymentType === 'APARTADO' ? 'text-indigo-900' : 'text-amber-900'
                        }`}
                      >
                        {paymentType === 'APARTADO'
                          ? 'Abono Inicial / Reserva:'
                          : 'Abono Inicial:'}
                      </span>
                      <div className="flex items-center gap-1">
                        <button
                          type="button"
                          onClick={() => handleSetDeferredFraction(0)}
                          className="px-1.5 py-0.5 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-600 rounded border border-slate-200 cursor-pointer"
                        >
                          Sin abono
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetDeferredFraction(0.3)}
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded border cursor-pointer ${
                            paymentType === 'APARTADO'
                              ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
                              : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                          }`}
                        >
                          30%
                        </button>
                        <button
                          type="button"
                          onClick={() => handleSetDeferredFraction(0.5)}
                          className={`px-1.5 py-0.5 text-[10px] font-bold rounded border cursor-pointer ${
                            paymentType === 'APARTADO'
                              ? 'bg-indigo-50 hover:bg-indigo-100 text-indigo-800 border-indigo-200'
                              : 'bg-amber-50 hover:bg-amber-100 text-amber-800 border-amber-200'
                          }`}
                        >
                          50%
                        </button>
                      </div>
                    </div>

                    {/* Selector de moneda del abono inicial */}
                    <div className="grid grid-cols-2 gap-1.5">
                      <button
                        type="button"
                        onClick={() => handleSelectDeferredCurrencyMode('BS')}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                          creditPaidCurrencyMode === 'BS'
                            ? 'bg-sky-600 border-sky-600 text-white shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-sky-900 hover:bg-sky-50'
                        }`}
                      >
                        <Banknote className="w-3.5 h-3.5 shrink-0" />
                        <span>Bs. Bolívares</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleSelectDeferredCurrencyMode('USD')}
                        className={`py-1.5 px-2 rounded-lg border text-[11px] font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1 ${
                          creditPaidCurrencyMode === 'USD'
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                            : 'bg-slate-50 border-slate-200 text-emerald-900 hover:bg-emerald-50'
                        }`}
                      >
                        <DollarSign className="w-3.5 h-3.5 shrink-0" />
                        <span>$ Divisas (USD)</span>
                      </button>
                    </div>

                    {/* Inputs sincronizados Bs y $ USD */}
                    <div className="grid grid-cols-2 gap-2">
                      {creditPaidCurrencyMode === 'BS' ? (
                        <>
                          <div>
                            <label className="block text-[9px] font-extrabold text-sky-800 uppercase mb-0.5">
                              Abono en Bs.
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={creditPaidAmountBs}
                              onChange={(e) => handleChangeCreditPaidBs(e.target.value)}
                              placeholder="0.00"
                              className="w-full p-1.5 border-2 border-sky-400 rounded-lg text-xs font-mono font-extrabold text-sky-950 bg-sky-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">
                              Equiv. $ USD (BCV)
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={creditPaidAmount}
                              onChange={(e) => handleChangeCreditPaidUSD(e.target.value)}
                              placeholder="0.00"
                              className="w-full p-1.5 border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:outline-none"
                            />
                          </div>
                        </>
                      ) : (
                        <>
                          <div>
                            <label className="block text-[9px] font-extrabold text-emerald-800 uppercase mb-0.5">
                              Abono en Divisas ($)
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={creditPaidAmount}
                              onChange={(e) => handleChangeCreditPaidUSD(e.target.value)}
                              placeholder="0.00"
                              className="w-full p-1.5 border-2 border-emerald-500 rounded-lg text-xs font-mono font-extrabold text-emerald-950 bg-emerald-50/40 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-500 uppercase mb-0.5">
                              Equiv. Bs. (BCV)
                            </label>
                            <input
                              type="number"
                              step="any"
                              min="0"
                              value={creditPaidAmountBs}
                              onChange={(e) => handleChangeCreditPaidBs(e.target.value)}
                              placeholder="0.00"
                              className="w-full p-1.5 border border-slate-200 rounded-lg text-xs font-mono font-semibold text-slate-700 bg-slate-50 focus:bg-white focus:outline-none"
                            />
                          </div>
                        </>
                      )}
                    </div>

                    {deferredPaidUSD > 0 && (
                      <div
                        className={`px-2 py-1.5 rounded-lg border flex items-center justify-between gap-2 text-[10px] ${
                          creditPaidCurrencyMode === 'BS'
                            ? 'bg-sky-50 border-sky-200 text-sky-950'
                            : 'bg-emerald-50 border-emerald-200 text-emerald-950'
                        }`}
                      >
                        <span className="flex items-center gap-1 font-bold">
                          <ArrowLeftRight className="w-3 h-3 shrink-0" />
                          <span>Abono recibido:</span>
                        </span>
                        <span className="font-mono font-extrabold text-right">
                          {creditPaidCurrencyMode === 'BS'
                            ? `${formatBs(deferredPaidBs)} (Equiv. ${formatUSD(deferredPaidUSD)})`
                            : `${formatUSD(deferredPaidUSD)} (Equiv. ${formatBs(deferredPaidBs)})`}
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Saldo Restante */}
                  <div
                    className={`flex items-center justify-between text-xs pt-1.5 border-t ${
                      paymentType === 'APARTADO' ? 'border-indigo-200/80' : 'border-amber-200/80'
                    }`}
                  >
                    <span
                      className={`font-medium ${
                        paymentType === 'APARTADO' ? 'text-indigo-800' : 'text-amber-800'
                      }`}
                    >
                      {paymentType === 'APARTADO' ? 'Saldo restante para retirar:' : 'Saldo por cobrar:'}
                    </span>
                    <div className="text-right font-mono font-bold">
                      <span className={paymentType === 'APARTADO' ? 'text-indigo-950' : 'text-amber-950'}>
                        {formatUSD(Math.max(0, totalUSD - deferredPaidUSD))}
                      </span>
                      <span
                        className={`text-[10px] ml-1 ${
                          paymentType === 'APARTADO' ? 'text-indigo-800' : 'text-amber-800'
                        }`}
                      >
                        ({formatBs(Math.max(0, totalUSD - deferredPaidUSD) * rate)})
                      </span>
                    </div>
                  </div>
                </div>
              )}

              {!isOpenAccountMode && (paymentType === 'MIXTO' ? (
                <div className="text-xs">
                  <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                    Descuento ($ USD):
                  </label>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={discountUSD || ''}
                    onChange={(e) => setDiscountUSD(Number(e.target.value))}
                    placeholder="0.00"
                    className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50 font-mono"
                  />
                </div>
              ) : (
                <>
                  <div className="grid grid-cols-2 gap-2 text-xs">
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                        {paymentType === 'APARTADO'
                          ? 'Método del Abono / Reserva:'
                          : paymentType === 'CREDITO'
                          ? 'Método del Abono/Liquidación:'
                          : paymentType === 'MERCADOLIBRE'
                          ? 'Canal de Cobro MercadoLibre:'
                          : 'Método de Pago:'}
                      </label>
                      <select
                        value={paymentMethod}
                        onChange={(e) => {
                          const nextMethod = e.target.value as PaymentMethod;
                          setPaymentMethod(nextMethod);
                          if (paymentType === 'APARTADO' || paymentType === 'CREDITO') {
                            setCreditPaidCurrencyMode(isBsPaymentMethod(nextMethod) ? 'BS' : 'USD');
                          }
                        }}
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50 font-medium"
                      >
                        <option value="Pago Móvil">Pago Móvil (Bs.)</option>
                        <option value="Efectivo Bs">Efectivo en Bolívares (Bs.)</option>
                        <option value="Dólares Efectivo (USD)">Dólares Efectivo ($ USD)</option>
                        <option value="Transferencia Bancaria Bs">Transferencia Bs</option>
                        <option value="Punto de Venta (Bs)">Punto de Venta (Bs.)</option>
                        <option value="Binance Pay (USDT)">Binance Pay (USDT)</option>
                      </select>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">Descuento ($ USD):</label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={discountUSD || ''}
                        onChange={(e) => setDiscountUSD(Number(e.target.value))}
                        placeholder="0.00"
                        className="w-full p-2 border border-slate-200 rounded-lg text-xs bg-slate-50 font-mono"
                      />
                    </div>
                  </div>

                  {/* Cuenta destino del cobro + registro automático en Tesorería */}
                  {paymentMethod === 'Pago Móvil' ? (
                    <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 space-y-2">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-blue-950 flex items-center gap-1.5">
                          <Building2 className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                          ¿A qué cuenta cae el Pago Móvil?
                        </span>
                        <span className="text-[10px] font-semibold text-blue-700">
                          Ingreso a Tesorería
                        </span>
                      </div>
                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => setPagoMovilAccount('BANESCO_PERSONAL')}
                          className={`px-2.5 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                            pagoMovilAccount === 'BANESCO_PERSONAL'
                              ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                              : 'bg-white border-blue-200 text-slate-700 hover:bg-blue-100/60'
                          }`}
                        >
                          Banesco Personal
                        </button>
                        <button
                          type="button"
                          onClick={() => setPagoMovilAccount('PROVINCIAL')}
                          className={`px-2.5 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                            pagoMovilAccount === 'PROVINCIAL'
                              ? 'bg-slate-900 border-slate-900 text-white shadow-xs'
                              : 'bg-white border-blue-200 text-slate-700 hover:bg-blue-100/60'
                          }`}
                        >
                          Provincial
                        </button>
                      </div>
                      <p className="text-[10px] text-blue-800 leading-snug">
                        Se registrará automáticamente como ingreso en{' '}
                        <strong>
                          {pagoMovilAccount === 'PROVINCIAL'
                            ? 'Provincial (Bs)'
                            : 'Banesco Personal (Bs)'}
                        </strong>{' '}
                        y se sumará a la Liquidez Disponible.
                      </p>
                    </div>
                  ) : paymentMethod === 'Punto de Venta (Bs)' ? (
                    <div className="px-3 py-2 rounded-xl bg-emerald-50 border border-emerald-200 flex items-center gap-2 text-[11px] text-emerald-900">
                      <Building2 className="w-4 h-4 text-emerald-600 shrink-0" />
                      <span>
                        Ingreso automático en <strong>Banesco SMCC (Bs)</strong> · Se sumará a Tesorería y Liquidez Disponible.
                      </span>
                    </div>
                  ) : (
                    <div className="px-3 py-1.5 rounded-lg bg-slate-50 border border-slate-200 flex items-center gap-2 text-[10px] text-slate-600">
                      <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>
                        Ingreso automático en Tesorería:{' '}
                        <strong className="text-slate-800">
                          {paymentMethod === 'Efectivo Bs'
                            ? 'Caja Efectivo Bs'
                            : paymentMethod === 'Dólares Efectivo (USD)'
                              ? 'Caja Efectivo USD ($)'
                              : paymentMethod === 'Binance Pay (USDT)'
                                ? 'Billetera USDT (Binance)'
                                : 'Banesco SMCC (Bs)'}
                        </strong>
                      </span>
                    </div>
                  )}
                </>
              ))}

              <div>
                <input
                  type="text"
                  value={saleNotes}
                  onChange={(e) => setSaleNotes(e.target.value)}
                  placeholder="Observaciones de venta (ej. garantía, moto del cliente)..."
                  className="w-full p-2 text-xs border border-slate-200 rounded-lg bg-slate-50"
                />
              </div>

              {/* Total Calculation (Dual USD and Bs) */}
              <div className="bg-slate-950 text-white p-4 rounded-xl space-y-2">
                <div className="flex justify-between items-center text-xs pb-1 border-b border-slate-800/80">
                  <span className="text-slate-400">Condición:</span>
                  <span
                    className={`font-bold px-2 py-0.5 rounded text-[11px] ${
                      isOpenAccountMode
                        ? 'bg-violet-500/25 text-violet-200 border border-violet-400/50'
                        : paymentType === 'APARTADO'
                        ? 'bg-indigo-400/20 text-indigo-300 border border-indigo-400/40'
                        : paymentType === 'CREDITO'
                        ? 'bg-amber-400/20 text-amber-300 border border-amber-400/30'
                        : paymentType === 'MERCADOLIBRE'
                        ? 'bg-yellow-400/20 text-yellow-300 border border-yellow-400/40'
                        : paymentType === 'MIXTO'
                        ? 'bg-teal-400/20 text-teal-300 border border-teal-400/40'
                        : 'bg-emerald-400/20 text-emerald-300 border border-emerald-400/30'
                    }`}
                  >
                    {isOpenAccountMode
                      ? openAccountSubMode === 'SUMAR' && targetOpenAccount
                        ? `SUMAR A CUENTA ${targetOpenAccount.accountNumber}`
                        : 'CUENTA ABIERTA DEL DÍA'
                      : paymentType === 'APARTADO'
                      ? `SISTEMA DE APARTADO (${creditDays} DÍAS)`
                      : paymentType === 'CREDITO'
                      ? `A CRÉDITO (${creditDays} DÍAS)`
                      : paymentType === 'MERCADOLIBRE'
                      ? 'MERCADOLIBRE'
                      : paymentType === 'MIXTO'
                      ? hasMixtoCreditSplit
                        ? `PAGO MIXTO (CONTADO + CRÉDITO ${creditDays}D)`
                        : 'PAGO MIXTO'
                      : 'DE CONTADO'}
                  </span>
                </div>

                <div className="flex justify-between text-xs text-slate-400">
                  <span>{paymentType === 'MERCADOLIBRE' ? 'Subtotal (Precio Registrado):' : 'Subtotal en Dólares:'}</span>
                  <span className="font-mono">{formatUSD(subtotalUSD)}</span>
                </div>
                {discountUSD > 0 && (
                  <div className="flex justify-between text-xs text-emerald-400">
                    <span>Descuento:</span>
                    <span className="font-mono">-{formatUSD(discountUSD)}</span>
                  </div>
                )}
                {!isOpenAccountMode && paymentType === 'MERCADOLIBRE' && computedMlCommissionUSD > 0 && (
                  <div className="flex justify-between text-xs text-yellow-300 font-semibold">
                    <span>+ Recargo MercadoLibre (Adicional):</span>
                    <span className="font-mono">+{formatUSD(computedMlCommissionUSD)}</span>
                  </div>
                )}
                {!isOpenAccountMode && hasShipping && shippingCostUSD > 0 && (
                  <div className="flex justify-between items-baseline text-xs text-sky-300 font-semibold">
                    <span>
                      + Gastos de Envío ({shippingAgency} · {shippingState}):
                    </span>
                    <div className="text-right font-mono">
                      <span>+{formatUSD(shippingCostUSD)}</span>
                      <span className="text-[10px] text-sky-200/80 block font-normal">
                        {formatBs(shippingCostBs)}
                      </span>
                    </div>
                  </div>
                )}
                <div className="flex justify-between items-baseline pt-2 border-t border-slate-800">
                  <span className="text-xs sm:text-sm font-bold text-amber-300 uppercase">
                    {isOpenAccountMode
                      ? openAccountSubMode === 'SUMAR'
                        ? 'A SUMAR AHORA ($):'
                        : 'CARGO INICIAL ($):'
                      : 'TOTAL ($ USD):'}
                  </span>
                  <span className="text-2xl sm:text-3xl font-mono text-amber-400 font-extrabold tabular-nums leading-none">
                    {formatUSD(isOpenAccountMode ? subtotalUSD : totalUSD)}
                  </span>
                </div>

                <div className="pt-2 border-t border-slate-800/80 flex justify-between items-baseline">
                  <div>
                    <span className="text-xs sm:text-sm font-bold text-emerald-300 uppercase block">
                      {isOpenAccountMode ? 'EQUIV. EN Bs.:' : 'TOTAL (Bs.):'}
                    </span>
                    <span className="text-[11px] text-slate-400">Tasa BCV: Bs. {rate.toFixed(2)}</span>
                  </div>
                  <span className="text-xl sm:text-2xl font-mono text-emerald-300 font-extrabold tabular-nums leading-none">
                    {formatBs(isOpenAccountMode ? subtotalBs : totalBs)}
                  </span>
                </div>

                {isOpenAccountMode && openAccountSubMode === 'SUMAR' && targetOpenAccount && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1 text-xs">
                    <div className="flex justify-between text-violet-300">
                      <span>Acumulado anterior ({targetOpenAccount.accountNumber}):</span>
                      <span className="font-mono font-bold">{formatUSD(targetOpenAccount.subtotal)}</span>
                    </div>
                    <div className="flex justify-between items-baseline text-amber-300 font-bold">
                      <span>Nuevo Acumulado Total del Día:</span>
                      <div className="text-right font-mono">
                        <span>{formatUSD(targetOpenAccount.subtotal + subtotalUSD)}</span>
                        <span className="text-[10px] text-emerald-300 block font-normal">
                          {formatBs((targetOpenAccount.subtotal + subtotalUSD) * rate)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {!isOpenAccountMode && (paymentType === 'CREDITO' || paymentType === 'APARTADO') && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1 text-xs">
                    {deferredPaidUSD > 0 && (
                      <div className="flex justify-between items-baseline text-emerald-300">
                        <span>
                          {paymentType === 'APARTADO' ? 'Abono Inicial / Reserva:' : 'Abono Inicial:'}
                        </span>
                        <div className="text-right font-mono font-bold">
                          {creditPaidCurrencyMode === 'BS' ? (
                            <>
                              <span>{formatBs(deferredPaidBs)}</span>
                              <span className="text-[10px] text-emerald-200/80 block font-normal">
                                Equiv. {formatUSD(deferredPaidUSD)} (BCV)
                              </span>
                            </>
                          ) : (
                            <>
                              <span>{formatUSD(deferredPaidUSD)}</span>
                              <span className="text-[10px] text-emerald-200/80 block font-normal">
                                Equiv. {formatBs(deferredPaidBs)} (BCV)
                              </span>
                            </>
                          )}
                        </div>
                      </div>
                    )}
                    <div
                      className={`flex justify-between items-baseline ${
                        paymentType === 'APARTADO' ? 'text-indigo-300' : 'text-amber-300'
                      }`}
                    >
                      <span>
                        {paymentType === 'APARTADO' ? 'Saldo Restante para Retirar:' : 'Saldo Restante por Cobrar:'}
                      </span>
                      <div className="text-right font-mono font-bold">
                        <span>{formatUSD(Math.max(0, totalUSD - deferredPaidUSD))}</span>
                        <span className="text-[10px] opacity-80 block font-normal">
                          {formatBs(Math.max(0, totalUSD - deferredPaidUSD) * rate)}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {!isOpenAccountMode && paymentType === 'MERCADOLIBRE' && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1 text-xs">
                    <div className="flex justify-between items-baseline text-emerald-300 font-medium">
                      <span>Tu ingreso neto (Precio registrado):</span>
                      <span className="font-mono font-bold">
                        {formatUSD(baseTotalUSD)}
                      </span>
                    </div>
                    <div className="flex justify-between items-baseline text-yellow-300">
                      <span>Deuda a liquidar con MercadoLibre:</span>
                      <span className="font-mono font-bold">
                        {formatUSD(computedMlCommissionUSD)}
                      </span>
                    </div>
                  </div>
                )}
                {!isOpenAccountMode && paymentType === 'MIXTO' && (
                  <div className="pt-2 border-t border-slate-800/80 space-y-1.5 text-[11px]">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-teal-300 font-bold">Resumen de Pago Mixto:</span>
                      <span className="text-[10px] font-mono text-slate-400">
                        BCV: {formatBs(rate)}
                      </span>
                    </div>
                    <div className="space-y-1.5">
                      {mixtoSplits.map((sp, i) => {
                        const amtUSD = parseFloat(sp.amountUSD) || 0;
                        const parsedBs = parseFloat(sp.amountBs);
                        const amtBs = !Number.isNaN(parsedBs) && parsedBs > 0 ? parsedBs : amtUSD * rate;
                        const isCreditLeg = sp.splitType === 'CREDITO';
                        const isBsLeg = sp.currencyMode
                          ? sp.currencyMode === 'BS'
                          : isBsPaymentMethod(sp.paymentMethod);

                        return (
                          <div
                            key={sp.id || i}
                            className="flex items-start justify-between gap-2 text-slate-200 bg-slate-800/60 px-2 py-1.5 rounded-lg border border-slate-700/60"
                          >
                            <div className="min-w-0 space-y-0.5">
                              <div className="flex items-center gap-1 flex-wrap">
                                <span
                                  className={`px-1 py-0.5 rounded text-[9px] font-extrabold uppercase ${
                                    isCreditLeg
                                      ? 'bg-amber-500/20 text-amber-300 border border-amber-500/40'
                                      : 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                                  }`}
                                >
                                  {isCreditLeg ? 'CRÉDITO' : 'CONTADO'}
                                </span>
                                <span
                                  className={`px-1 py-0.5 rounded text-[9px] font-extrabold ${
                                    isBsLeg
                                      ? 'bg-sky-500/20 text-sky-300 border border-sky-500/40'
                                      : 'bg-teal-500/20 text-teal-200 border border-teal-500/40'
                                  }`}
                                >
                                  {isBsLeg ? 'Bs.' : '$ Divisas'}
                                </span>
                              </div>
                              <div className="text-[10px] text-slate-300 truncate">
                                {i + 1}.{' '}
                                {isCreditLeg ? (
                                  <span className="text-amber-200 font-semibold">Cuenta por Cobrar</span>
                                ) : (
                                  <>
                                    {sp.paymentMethod}
                                    {sp.paymentMethod === 'Pago Móvil'
                                      ? ` (${sp.pagoMovilAccount === 'PROVINCIAL' ? 'Provincial' : 'Banesco'})`
                                      : ''}
                                  </>
                                )}
                              </div>
                            </div>
                            <div className="text-right shrink-0">
                              <div
                                className={`font-mono font-bold text-[11px] ${
                                  isCreditLeg
                                    ? 'text-amber-300'
                                    : isBsLeg
                                      ? 'text-sky-300'
                                      : 'text-emerald-300'
                                }`}
                              >
                                {isBsLeg ? formatBs(amtBs) : formatUSD(amtUSD)}
                              </div>
                              <div className="font-mono text-[9px] text-slate-400">
                                {isBsLeg
                                  ? `≈ ${formatUSD(amtUSD)} BCV`
                                  : `≈ ${formatBs(amtBs)} BCV`}
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>

                    <div className="pt-1.5 mt-1 border-t border-slate-800 space-y-1 text-[10px]">
                      <div className="flex justify-between text-emerald-300 font-semibold">
                        <span>Cobrado hoy (Contado):</span>
                        <span className="font-mono font-bold">
                          {formatUSD(mixtoCashTotalUSD)} ({formatBs(mixtoCashTotalUSD * rate)})
                        </span>
                      </div>
                      {mixtoCashBsUSD > 0 && (
                        <div className="flex justify-between text-sky-300 pl-2">
                          <span>• En Bolívares:</span>
                          <span className="font-mono">
                            {formatBs(mixtoCashBsTotalBs)} (≈ {formatUSD(mixtoCashBsUSD)})
                          </span>
                        </div>
                      )}
                      {mixtoCashDivisasUSD > 0 && (
                        <div className="flex justify-between text-teal-200 pl-2">
                          <span>• En Divisas:</span>
                          <span className="font-mono">
                            {formatUSD(mixtoCashDivisasUSD)} (≈ {formatBs(mixtoCashDivisasUSD * rate)})
                          </span>
                        </div>
                      )}
                      {hasMixtoCreditSplit && (
                        <div className="flex justify-between text-amber-300 font-semibold pt-0.5">
                          <span>Saldo a Crédito ({creditDays}D):</span>
                          <span className="font-mono font-bold">
                            {formatUSD(mixtoCreditTotalUSD)} ({formatBs(mixtoCreditTotalUSD * rate)})
                          </span>
                        </div>
                      )}
                    </div>
                  </div>
                )}
              </div>

              {posFormError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-800 rounded-xl flex items-start gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <span className="font-semibold">{posFormError}</span>
                </div>
              )}

              {/* Finalize Button */}
              {isOpenAccountMode ? (
                <button
                  type="button"
                  onClick={handleSubmitOpenAccount}
                  disabled={
                    openAccountSubMode === 'SUMAR'
                      ? posCart.length === 0 || !targetOpenAccount
                      : false
                  }
                  className="w-full py-3 bg-violet-600 hover:bg-violet-700 text-white font-extrabold text-xs sm:text-sm rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  <ClipboardList className="w-4 h-4 shrink-0" />
                  <span>
                    {openAccountSubMode === 'SUMAR' && targetOpenAccount
                      ? `Sumar ${posCart.length > 0 ? `${formatUSD(subtotalUSD)} ` : ''}a Cuenta de ${targetOpenAccount.customerName}`
                      : posCart.length > 0
                      ? `Abrir Cuenta del Día (${formatUSD(subtotalUSD)})`
                      : 'Abrir Cuenta del Día (Sin repuestos iniciales)'}
                  </span>
                </button>
              ) : (
                <button
                  type="button"
                  onClick={handleFinalizeSale}
                  disabled={posCart.length === 0 || isSubmittingSale}
                  className={`w-full py-3 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50 ${
                    paymentType === 'APARTADO'
                      ? 'bg-indigo-600 hover:bg-indigo-700'
                      : paymentType === 'CREDITO'
                      ? 'bg-amber-600 hover:bg-amber-700'
                      : paymentType === 'MERCADOLIBRE'
                      ? 'bg-yellow-600 hover:bg-yellow-700 text-slate-950 font-extrabold'
                      : paymentType === 'MIXTO'
                      ? 'bg-teal-600 hover:bg-teal-700'
                      : 'bg-emerald-600 hover:bg-emerald-700'
                  }`}
                >
                  {customerPhone && customerPhone !== 'N/A' && customerPhone.replace(/\D/g, '').length >= 7 ? (
                    <MessageSquare className="w-4 h-4" />
                  ) : (
                    <Printer className="w-4 h-4" />
                  )}
                  <span>
                    {isSubmittingSale
                      ? 'Registrando Venta...'
                      : paymentType === 'APARTADO'
                      ? 'Registrar Apartado y Emitir Comprobante'
                      : paymentType === 'CREDITO'
                      ? 'Registrar Venta a Crédito y Emitir Factura'
                      : paymentType === 'MERCADOLIBRE'
                      ? 'Registrar Venta MercadoLibre y Factura'
                      : paymentType === 'MIXTO'
                      ? hasMixtoCreditSplit
                        ? 'Registrar Pago Mixto (Contado + Crédito)'
                        : 'Cobrar Pago Mixto y Emitir Factura'
                      : customerPhone && customerPhone !== 'N/A' && customerPhone.replace(/\D/g, '').length >= 7
                      ? 'Cobrar y Enviar Factura ($ y Bs) al WhatsApp'
                      : 'Cobrar y Emitir Factura ($ y Bs)'}
                  </span>
                </button>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Toast Notification */}
      {posToast && (
        <div
          className={`fixed top-5 right-5 z-50 px-4 py-3 rounded-xl shadow-2xl border flex items-center gap-2.5 text-xs animate-in fade-in slide-in-from-top-2 ${
            posToast.type === 'error'
              ? 'bg-rose-950 text-white border-rose-700'
              : 'bg-slate-900 text-white border-slate-700'
          }`}
        >
          {posToast.type === 'error' ? (
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
          ) : (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          )}
          <span className="font-semibold">{posToast.message}</span>
        </div>
      )}

      {/* Modal: Registrar Repuesto No Registrado en el Momento de la Venta */}
      {showQuickRegisterModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-gradient-to-r from-amber-600 to-amber-700 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-white/20 flex items-center justify-center">
                  <PackagePlus className="w-4 h-4 text-white" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Registrar Repuesto Nuevo</h3>
                  <p className="text-[11px] text-amber-100">
                    Agrégalo a la venta actual y guárdalo en inventario
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShowQuickRegisterModal(false)}
                className="p-1 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Form */}
            <form onSubmit={handleSaveQuickProduct} className="p-5 space-y-4">
              {quickFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-start gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <span className="font-medium">{quickFormError}</span>
                </div>
              )}
              {/* Product Name */}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre del Repuesto *
                </label>
                <input
                  type="text"
                  required
                  value={quickName}
                  onChange={(e) => setQuickName(e.target.value)}
                  placeholder="Ej. Pastillas de Freno Traseras Bera SBR 150"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 font-medium"
                  autoFocus
                />
              </div>

              {/* Category & Brand */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Categoría *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingQuickCategory((prev) => !prev);
                        setNewQuickCategoryName('');
                      }}
                      className="text-[11px] font-bold text-amber-700 hover:text-amber-800 inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      {isAddingQuickCategory ? (
                        <>
                          <X className="w-3 h-3" />
                          <span>Cancelar</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>Nueva</span>
                        </>
                      )}
                    </button>
                  </div>
                  {isAddingQuickCategory ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={newQuickCategoryName}
                        onChange={(e) => setNewQuickCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateQuickCategory();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setIsAddingQuickCategory(false);
                            setNewQuickCategoryName('');
                          }
                        }}
                        placeholder="Ej. Cascos, Filtros..."
                        className="w-full text-xs p-2.5 rounded-lg border border-amber-400 bg-amber-50/50 focus:bg-white focus:outline-hidden font-medium"
                      />
                      <button
                        type="button"
                        onClick={handleCreateQuickCategory}
                        disabled={!newQuickCategoryName.trim()}
                        className="px-2.5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs shrink-0 cursor-pointer"
                      >
                        Agregar
                      </button>
                    </div>
                  ) : (
                    <select
                      value={quickCategory}
                      onChange={(e) => {
                        if (e.target.value === '__ADD_NEW__') {
                          setIsAddingQuickCategory(true);
                          setNewQuickCategoryName('');
                        } else {
                          setQuickCategory(e.target.value as ProductCategory);
                        }
                      }}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50 font-medium"
                    >
                      {productCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__ADD_NEW__">+ Agregar nueva categoría...</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Marca (Opcional)
                  </label>
                  <input
                    type="text"
                    value={quickBrand}
                    onChange={(e) => setQuickBrand(e.target.value)}
                    placeholder="Ej. Bera, Empire, Genérico"
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              {/* Pricing ($ USD & Live BCV) */}
              <div className="p-3 bg-amber-50/70 border border-amber-200 rounded-xl space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-amber-950 mb-1">
                      Precio de Venta ($ USD) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        value={quickPriceUSD}
                        onChange={(e) => setQuickPriceUSD(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 text-xs rounded-lg border border-amber-300 bg-white font-mono font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Precio de Costo ($ USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={quickCostUSD}
                        onChange={(e) => setQuickCostUSD(e.target.value === '' ? '' : Number(e.target.value))}
                        placeholder="0.00"
                        className="w-full pl-7 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-mono text-slate-700"
                      />
                    </div>
                  </div>
                </div>

                {/* Live BCV preview */}
                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-amber-200 text-amber-900">
                  <span className="flex items-center gap-1 font-medium">
                    <TrendingUp className="w-3.5 h-3.5 text-amber-700" />
                    <span>Equivalente Tasa Oficial BCV ({rate.toFixed(2)}):</span>
                  </span>
                  <span className="font-mono font-bold text-emerald-800">
                    {quickPriceUSD !== '' ? formatBs(Number(quickPriceUSD) * rate) : 'Bs. 0,00'}
                  </span>
                </div>
              </div>

              {/* Quantity to Sell & Initial Stock */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cantidad a Vender Ahora *
                  </label>
                  <input
                    type="number"
                    min="1"
                    required
                    value={quickQuantityToSell}
                    onChange={(e) => {
                      const val = Math.max(1, Number(e.target.value) || 1);
                      setQuickQuantityToSell(val);
                      if (quickStock === '' || Number(quickStock) < val) {
                        setQuickStock(val);
                      }
                    }}
                    className="w-full p-2.5 text-xs rounded-lg border border-slate-300 bg-slate-50 font-mono font-bold"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">Se agregará al ticket actual</span>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Stock Total Disponible *
                  </label>
                  <input
                    type="number"
                    min={quickQuantityToSell}
                    required
                    value={quickStock}
                    onChange={(e) => setQuickStock(e.target.value === '' ? '' : Number(e.target.value))}
                    placeholder="1"
                    className="w-full p-2.5 text-xs rounded-lg border border-slate-300 bg-slate-50 font-mono"
                  />
                  <span className="text-[10px] text-slate-400 block mt-0.5">
                    Quedarán {Math.max(0, Number(quickStock || quickQuantityToSell) - quickQuantityToSell)} tras la venta
                  </span>
                </div>
              </div>

              {/* Compatibility & SKU */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Compatibilidad (Motos)
                  </label>
                  <input
                    type="text"
                    value={quickCompatibility}
                    onChange={(e) => setQuickCompatibility(e.target.value)}
                    placeholder="Ej. Bera SBR, Horse 150, Universal"
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Código SKU / Referencia
                  </label>
                  <input
                    type="text"
                    value={quickSku}
                    onChange={(e) => {
                      setQuickSku(e.target.value);
                      if (quickFormError) setQuickFormError(null);
                    }}
                    placeholder="Ej. REP-1024"
                    className={`w-full text-xs p-2.5 rounded-lg border font-mono ${
                      duplicateQuickSkuProduct
                        ? 'border-rose-400 bg-rose-50 text-rose-900 focus:outline-hidden focus:border-rose-500'
                        : 'border-slate-300 bg-slate-50'
                    }`}
                  />
                  {duplicateQuickSkuProduct && (
                    <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>Ya registrado: {duplicateQuickSkuProduct.name} (Stock: {duplicateQuickSkuProduct.stock})</span>
                    </p>
                  )}
                </div>
              </div>

              {/* Ubicación en Almacén */}
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                  <MapPin className="w-3.5 h-3.5 text-amber-600" />
                  <span>Ubicación en Almacén (Opcional)</span>
                </label>
                <input
                  type="text"
                  value={quickLocation}
                  onChange={(e) => setQuickLocation(e.target.value)}
                  placeholder="Ej. Estante A-3, Pasillo 2, Vitrina 1"
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500"
                />
              </div>

              {/* Save to Catalog Checkbox */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-start gap-2.5">
                <input
                  type="checkbox"
                  id="quickSaveToCatalog"
                  checked={quickSaveToCatalog}
                  onChange={(e) => setQuickSaveToCatalog(e.target.checked)}
                  className="mt-0.5 w-4 h-4 text-amber-600 rounded border-slate-300 focus:ring-amber-500 cursor-pointer"
                />
                <label htmlFor="quickSaveToCatalog" className="text-xs text-slate-700 cursor-pointer select-none">
                  <span className="font-bold text-slate-900 block">
                    Guardar permanentemente en el catálogo de inventario
                  </span>
                  <span className="text-[11px] text-slate-500">
                    Permitirá consultarlo, venderlo en futuras ocasiones y editarlo desde el módulo de Inventario.
                  </span>
                </label>
              </div>

              {/* Modal Actions */}
              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setShowQuickRegisterModal(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-700 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Registrar e Ingresar al Ticket</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Datos del Repuesto (desde el Ticket o Catálogo de POS) */}
      {editingProduct && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-200">
            {/* Modal Header */}
            <div className="bg-slate-900 px-5 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <div className="w-8 h-8 rounded-lg bg-amber-500/20 text-amber-400 flex items-center justify-center">
                  <Edit3 className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-bold text-sm">Editar Repuesto</h3>
                  <p className="text-[11px] text-slate-400">
                    Modifica los datos del repuesto registrado (SKU: {editingProduct.sku})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setEditingProduct(null)}
                className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Form */}
            <form onSubmit={handleSaveEditProduct} className="p-5 space-y-4">
              {editFormError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-start gap-2 text-xs">
                  <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                  <span className="font-medium">{editFormError}</span>
                </div>
              )}
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre del Repuesto *
                </label>
                <input
                  type="text"
                  required
                  value={editName}
                  onChange={(e) => setEditName(e.target.value)}
                  className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white font-medium"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block text-xs font-bold text-slate-700">
                      Categoría *
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingEditCategory((prev) => !prev);
                        setNewEditCategoryName('');
                      }}
                      className="text-[11px] font-bold text-amber-700 hover:text-amber-800 inline-flex items-center gap-0.5 cursor-pointer"
                    >
                      {isAddingEditCategory ? (
                        <>
                          <X className="w-3 h-3" />
                          <span>Cancelar</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>Nueva</span>
                        </>
                      )}
                    </button>
                  </div>
                  {isAddingEditCategory ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={newEditCategoryName}
                        onChange={(e) => setNewEditCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateEditCategory();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setIsAddingEditCategory(false);
                            setNewEditCategoryName('');
                          }
                        }}
                        placeholder="Ej. Cascos, Filtros..."
                        className="w-full text-xs p-2.5 rounded-lg border border-amber-400 bg-amber-50/50 focus:bg-white focus:outline-hidden font-medium"
                      />
                      <button
                        type="button"
                        onClick={handleCreateEditCategory}
                        disabled={!newEditCategoryName.trim()}
                        className="px-2.5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs shrink-0 cursor-pointer"
                      >
                        Agregar
                      </button>
                    </div>
                  ) : (
                    <select
                      value={editCategory}
                      onChange={(e) => {
                        if (e.target.value === '__ADD_NEW__') {
                          setIsAddingEditCategory(true);
                          setNewEditCategoryName('');
                        } else {
                          setEditCategory(e.target.value as ProductCategory);
                        }
                      }}
                      className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50 font-medium"
                    >
                      {productCategories.map((cat) => (
                        <option key={cat} value={cat}>
                          {cat}
                        </option>
                      ))}
                      <option value="__ADD_NEW__">+ Agregar nueva categoría...</option>
                    </select>
                  )}
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Marca
                  </label>
                  <input
                    type="text"
                    value={editBrand}
                    onChange={(e) => setEditBrand(e.target.value)}
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              {/* Pricing */}
              <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl space-y-2">
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-xs font-bold text-slate-900 mb-1">
                      Precio de Venta ($ USD) *
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        required
                        value={editPriceUSD}
                        onChange={(e) => setEditPriceUSD(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full pl-7 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-mono font-bold text-slate-900"
                      />
                    </div>
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-600 mb-1">
                      Precio de Costo ($ USD)
                    </label>
                    <div className="relative">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">$</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={editCostUSD}
                        onChange={(e) => setEditCostUSD(e.target.value === '' ? '' : Number(e.target.value))}
                        className="w-full pl-7 pr-3 py-2 text-xs rounded-lg border border-slate-300 bg-white font-mono text-slate-700"
                      />
                    </div>
                  </div>
                </div>

                <div className="flex items-center justify-between text-[11px] pt-1 border-t border-slate-200 text-slate-600">
                  <span>Equivalente en Bolívares (Tasa BCV):</span>
                  <span className="font-mono font-bold text-emerald-700">
                    {editPriceUSD !== '' ? formatBs(Number(editPriceUSD) * rate) : 'Bs. 0,00'}
                  </span>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Stock en Inventario *
                  </label>
                  <input
                    type="number"
                    min="0"
                    required
                    value={editStock}
                    onChange={(e) => setEditStock(e.target.value === '' ? '' : Number(e.target.value))}
                    className="w-full p-2.5 text-xs rounded-lg border border-slate-300 bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Código SKU
                  </label>
                  <input
                    type="text"
                    value={editSku}
                    onChange={(e) => {
                      setEditSku(e.target.value);
                      if (editFormError) setEditFormError(null);
                    }}
                    className={`w-full text-xs p-2.5 rounded-lg border font-mono ${
                      duplicateEditSkuProduct
                        ? 'border-rose-400 bg-rose-50 text-rose-900 focus:outline-hidden focus:border-rose-500'
                        : 'border-slate-300 bg-slate-50'
                    }`}
                  />
                  {duplicateEditSkuProduct && (
                    <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3 shrink-0" />
                      <span>Ya registrado: {duplicateEditSkuProduct.name}</span>
                    </p>
                  )}
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1">
                    Compatibilidad de Motos
                  </label>
                  <input
                    type="text"
                    value={editCompatibility}
                    onChange={(e) => setEditCompatibility(e.target.value)}
                    placeholder="Ej. Bera, Empire, Universal"
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block text-xs font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-600" />
                    <span>Ubicación en Almacén</span>
                  </label>
                  <input
                    type="text"
                    value={editLocation}
                    onChange={(e) => setEditLocation(e.target.value)}
                    placeholder="Ej. Estante A-3, Gaveta 2"
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500"
                  />
                </div>
              </div>

              <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
                <button
                  type="button"
                  onClick={() => setEditingProduct(null)}
                  className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-lg shadow-sm flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4 text-amber-400" />
                  <span>Guardar Cambios</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Detalle / Gestión de Cuenta Abierta */}
      {inspectingAccount && (
        <OpenAccountDetailModal
          account={inspectingAccount}
          rate={rate}
          settings={settings}
          onClose={() => setInspectingAccountId(null)}
          onUpdateItem={updateOpenAccountItem}
          onRemoveItem={removeOpenAccountItem}
          onUpdateMeta={updateOpenAccountMeta}
          onCancelAccount={(id) => {
            cancelOpenAccount(id);
            if (targetOpenAccountId === id) {
              setTargetOpenAccountId(null);
              setIsOpenAccountMode(false);
            }
            showToast('Cuenta abierta anulada y repuestos devueltos al inventario.', 'info');
          }}
          onStartAddItems={handleStartAddItemsToOpenAccount}
          onProceedToSettle={(acc) => setSettlingAccountId(acc.id)}
          onSendWhatsAppStatement={handleSendOpenAccountWhatsApp}
        />
      )}

      {/* Modal: Cobrar y Cerrar Cuenta Abierta al Final del Día */}
      {settlingAccount && (
        <SettleOpenAccountModal
          account={settlingAccount}
          rate={rate}
          onClose={() => setSettlingAccountId(null)}
          onConfirmSettle={handleConfirmSettleOpenAccount}
        />
      )}
    </div>
  );
};
