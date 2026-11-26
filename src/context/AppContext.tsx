import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import {
  Product,
  productTracksInventory,
  Customer,
  Sale,
  ServiceOrder,
  ServiceOrderPaymentStatus,
  ServiceOrderPaymentRecord,
  getServiceOrderPaymentSummary,
  OnlineOrder,
  BusinessSettings,
  SaleItem,
  ServiceOrderStatus,
  OnlineOrderStatus,
  MercadoLibreEntry,
  SaleCreditStatus,
  AppUser,
  UserRole,
  ProductCategory,
  DEFAULT_PRODUCT_CATEGORIES,
  DEFAULT_MOTORCYCLE_MODEL_CATEGORIES,
  Technician,
  ServiceCommission,
  ServiceCommissionStatus,
  TechnicianPayout,
  TechnicianPayoutItem,
  PaymentMethod,
  PagoMovilAccountOption,
  SalePaymentType,
  SalePaymentSplit,
  isSaleWithCredit,
  PaymentCurrencyMode,
  CreditPaymentRecord,
  Supplier,
  PurchaseOrder,
  PurchaseOrderItem,
  PurchasePaymentCurrency,
  PurchasePaymentRecord,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  DEFAULT_COMMITMENT_CATEGORIES,
  DEFAULT_EXPENSE_POS_BANKS,
  ExpensePaymentCurrency,
  ExpensePaymentMethod,
  BusinessExpense,
  TreasuryAccountGroup,
  TreasuryAccount,
  TreasuryCommitmentCategory,
  TreasuryCommitmentPaymentCurrency,
  TreasuryCommitmentRateType,
  TreasuryCommitmentRecurrence,
  TreasuryCommitmentRecurrenceMode,
  TreasuryCommitment,
  TreasuryMovementType,
  TreasuryMovement,
  DEFAULT_DEBT_CATEGORIES,
  DebtPriority,
  DebtStatus,
  DebtPaymentPlan,
  DebtPaymentRecord,
  TreasuryDebt,
  OpenAccount,
  OpenAccountItem,
} from '../types';
import {
  INITIAL_SETTINGS,
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_SALES,
  INITIAL_SERVICE_ORDERS,
  INITIAL_ONLINE_ORDERS,
} from '../data/mockData';
import { fetchOfficialBcvRate, fetchBinanceUsdtRate, BcvSyncResult } from '../services/bcvService';
import { normalizeImageUrl, PRESET_PRODUCT_IMAGES } from '../utils/imageUrl';
import {
  calculateExchangeGap,
  ExchangeGapInfo,
  sanitizeProductForPublic,
} from '../utils/pricing';
import {
  calculateCartWholesaleSummary,
  CartWholesaleSummary,
} from '../utils/wholesalePricing';
import { getPublicAppOrigin, PUBLIC_APP_ORIGIN } from '../utils/whatsapp';
import firebaseConfig from '../../firebase-applet-config.json';
import {
  subscribeToProducts,
  subscribeToSettings,
  subscribeToCustomers,
  subscribeToSales,
  subscribeToServiceOrders,
  subscribeToOnlineOrders,
  subscribeToTechnicians,
  subscribeToServiceCommissions,
  subscribeToTechnicianPayouts,
  subscribeToSuppliers,
  subscribeToPurchaseOrders,
  subscribeToExpenses,
  subscribeToTreasuryAccounts,
  subscribeToTreasuryCommitments,
  subscribeToTreasuryMovements,
  subscribeToTreasuryDebts,
  subscribeToOpenAccounts,
  subscribeToDeletedIds,
  fetchDeletedIdsFromFirestore,
  syncProductToFirestore,
  removeProductFromFirestore,
  syncSettingsToFirestore,
  syncCustomerToFirestore,
  removeCustomerFromFirestore,
  syncSaleToFirestore,
  removeSaleFromFirestore,
  syncServiceOrderToFirestore,
  removeServiceOrderFromFirestore,
  syncOnlineOrderToFirestore,
  removeOnlineOrderFromFirestore,
  syncTechnicianToFirestore,
  removeTechnicianFromFirestore,
  syncServiceCommissionToFirestore,
  removeServiceCommissionFromFirestore,
  syncTechnicianPayoutToFirestore,
  removeTechnicianPayoutFromFirestore,
  syncSupplierToFirestore,
  removeSupplierFromFirestore,
  syncPurchaseOrderToFirestore,
  removePurchaseOrderFromFirestore,
  syncExpenseToFirestore,
  removeExpenseFromFirestore,
  syncTreasuryAccountToFirestore,
  removeTreasuryAccountFromFirestore,
  syncTreasuryCommitmentToFirestore,
  removeTreasuryCommitmentFromFirestore,
  syncTreasuryMovementToFirestore,
  removeTreasuryMovementFromFirestore,
  syncTreasuryDebtToFirestore,
  removeTreasuryDebtFromFirestore,
  syncOpenAccountToFirestore,
  removeOpenAccountFromFirestore,
  recordDeletedIdsInFirestore,
  clearDeletedIdsInFirestore,
  uploadAllToFirestore,
  syncUserToFirestore,
  fetchAdminUserFromFirestore,
  DeletedIdsMap,
  EMPTY_DELETED_IDS,
} from '../services/firestoreSync';
import { testFirestoreConnection } from '../firebase';
import {
  DEFAULT_ADMIN_PROFILE,
  DEFAULT_ADMIN_FALLBACK_PASSWORDS,
  hashPasswordClient,
  isOwnerAdminIdentifier,
  verifyOwnerRecoveryIdentity,
  verifyPasswordClient,
} from '../utils/authCrypto';

function normalizePhoneKey(phone?: string): string {
  if (!phone) return '';
  const digits = phone.replace(/\D/g, '');
  if (digits.length < 7 || /^0+$/.test(digits)) return '';
  if (digits.length === 12 && digits.startsWith('58')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

function normalizeDocumentKey(doc?: string): string {
  if (!doc) return '';
  const digits = doc.replace(/\D/g, '');
  if (digits.length < 5 || /^0+$/.test(digits)) return '';
  return digits;
}

function normalizeNameKey(name?: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function isGenericWalkInName(name?: string): boolean {
  const n = normalizeNameKey(name);
  return !n || n === 'cliente mostrador' || n === 'consumidor final' || n === 'mostrador';
}

function areNamesCompatible(nameA?: string, nameB?: string): boolean {
  const a = normalizeNameKey(nameA);
  const b = normalizeNameKey(nameB);
  if (!a || !b) return true;
  if (isGenericWalkInName(a) || isGenericWalkInName(b)) return false;
  if (a === b || a.includes(b) || b.includes(a)) return true;
  const tokensA = a.split(' ').filter((t) => t.length >= 3);
  const tokensB = new Set(b.split(' ').filter((t) => t.length >= 3));
  return tokensA.some((t) => tokensB.has(t));
}

function mergeDeletedMaps(a?: Partial<DeletedIdsMap>, b?: Partial<DeletedIdsMap>): DeletedIdsMap {
  return {
    sales: Array.from(new Set([...(a?.sales || []), ...(b?.sales || [])])),
    products: Array.from(new Set([...(a?.products || []), ...(b?.products || [])])),
    customers: Array.from(new Set([...(a?.customers || []), ...(b?.customers || [])])),
    serviceOrders: Array.from(new Set([...(a?.serviceOrders || []), ...(b?.serviceOrders || [])])),
    onlineOrders: Array.from(new Set([...(a?.onlineOrders || []), ...(b?.onlineOrders || [])])),
    technicians: Array.from(new Set([...(a?.technicians || []), ...(b?.technicians || [])])),
    serviceCommissions: Array.from(new Set([...(a?.serviceCommissions || []), ...(b?.serviceCommissions || [])])),
    technicianPayouts: Array.from(new Set([...(a?.technicianPayouts || []), ...(b?.technicianPayouts || [])])),
    suppliers: Array.from(new Set([...(a?.suppliers || []), ...(b?.suppliers || [])])),
    purchaseOrders: Array.from(new Set([...(a?.purchaseOrders || []), ...(b?.purchaseOrders || [])])),
    expenses: Array.from(new Set([...(a?.expenses || []), ...(b?.expenses || [])])),
    treasuryAccounts: Array.from(new Set([...(a?.treasuryAccounts || []), ...(b?.treasuryAccounts || [])])),
    treasuryCommitments: Array.from(new Set([...(a?.treasuryCommitments || []), ...(b?.treasuryCommitments || [])])),
    treasuryMovements: Array.from(new Set([...(a?.treasuryMovements || []), ...(b?.treasuryMovements || [])])),
    treasuryDebts: Array.from(new Set([...(a?.treasuryDebts || []), ...(b?.treasuryDebts || [])])),
    openAccounts: Array.from(new Set([...(a?.openAccounts || []), ...(b?.openAccounts || [])])),
  };
}

export type AppView =
  | 'tienda'
  | 'consulta_cliente'
  | 'admin_dashboard'
  | 'admin_pos'
  | 'admin_ventas'
  | 'admin_cuentas_cobrar'
  | 'admin_compras'
  | 'admin_gastos'
  | 'admin_tesoreria'
  | 'admin_inventario'
  | 'admin_mayorista'
  | 'admin_taller'
  | 'admin_comisiones'
  | 'admin_pedidos'
  | 'admin_clientes'
  | 'admin_ajustes';

export interface CartItem {
  product: Product;
  quantity: number;
}

interface AppContextType {
  // Navigation & View
  currentView: AppView;
  setCurrentView: (view: AppView) => void;
  trackedPhone: string;
  setTrackedPhone: (phone: string) => void;

  // Standalone Public Store for Customers (Mercado Moto CC)
  isPublicClientMode: boolean;
  setIsPublicClientMode: (mode: boolean) => void;
  enterPublicStore: () => void;
  enterAdminMode: () => void;
  publicStoreUrl: string;
  onlineStoreBrand: string;

  // Settings, BCV & USDT Exchange Rates
  settings: BusinessSettings;
  updateSettings: (newSettings: Partial<BusinessSettings>) => Promise<void>;
  updateBcvRate: (newRate: number) => void;
  updateUsdtRate: (newRate: number) => void;
  isSyncingBcv: boolean;
  bcvSyncMessage: string | null;
  syncBcvRate: (force?: boolean) => Promise<BcvSyncResult>;
  isSyncingUsdt: boolean;
  usdtSyncMessage: string | null;
  syncUsdtRate: () => Promise<BcvSyncResult>;
  exchangeGap: ExchangeGapInfo;

  // Inventory / Products (in USD)
  products: Product[];
  onlineProducts: Product[]; // ONLY products with stock > 0
  categories: ProductCategory[];
  addCategory: (categoryName: string) => { added: boolean; category: ProductCategory };
  modelCategories: string[];
  addModelCategory: (modelName: string) => { added: boolean; modelCategory: string };
  renameModelCategory: (oldName: string, newName: string) => { updated: boolean; modelCategory: string };
  deleteModelCategory: (modelName: string) => void;
  assignModelCategoryToProducts: (
    productIds: string[],
    modelCategory: string,
    mode?: 'add' | 'remove'
  ) => void;
  addProduct: (product: Omit<Product, 'id'>) => Product;
  updateProduct: (id: string, updates: Partial<Product>) => void;
  deleteProduct: (id: string) => void;
  deleteProducts: (ids: string[]) => void;
  adjustStock: (id: string, delta: number) => void;
  bulkImportProducts: (products: Array<Omit<Product, 'id'> & { id?: string }>) => { added: number; updated: number };

  // Customers (Venezuela)
  customers: Customer[];
  addCustomer: (customer: Omit<Customer, 'id' | 'createdAt'>) => Customer;
  updateCustomer: (id: string, updates: Partial<Customer>) => void;
  deleteCustomer: (id: string) => void;
  getCustomerByPhone: (phone: string) => Customer | undefined;

  // Sales (POS & Invoicing with USD + Bs at Tasa BCV)
  sales: Sale[];
  createSale: (saleData: {
    customerId?: string;
    customerName: string;
    customerPhone: string;
    customerDocument?: string;
    items: SaleItem[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paymentMethod: any;
    pagoMovilAccount?: PagoMovilAccountOption;
    paymentSplits?: SalePaymentSplit[];
    notes?: string;
    source?: 'POS' | 'TIENDA_ONLINE';
    paymentType?: SalePaymentType;
    creditDays?: number;
    creditDueDate?: string;
    creditPaidAmount?: number;
    creditPaidAmountBs?: number;
    creditInitialPaymentCurrency?: PaymentCurrencyMode;
    creditStatus?: 'PENDIENTE' | 'PAGADO';
    mercadolibreCommissionUSD?: number;
    mercadolibreCommissionRate?: number;
    mercadolibreFeeStatus?: 'PENDIENTE' | 'PAGADO';
    hasShipping?: boolean;
    shippingCostUSD?: number;
    shippingCostBs?: number;
    shippingCurrencyMode?: PaymentCurrencyMode;
    shippingState?: string;
    shippingAgency?: string;
    shippingNotes?: string;
    skipInventoryDeduction?: boolean;
  }) => Sale;
  updateSale: (
    saleId: string,
    updates: Partial<Sale> & {
      reassignCustomer?: boolean;
      syncTreasuryPayment?: boolean;
      syncInventoryOnItemsChange?: boolean;
    }
  ) => Sale | null;
  updateSaleCreditStatus: (saleId: string, status: 'PENDIENTE' | 'PAGADO', paidAmount?: number) => void;
  recordCreditPayment: (
    saleId: string,
    payment: {
      amountUSD: number;
      amountBs?: number;
      currencyMode?: PaymentCurrencyMode;
      paymentMethod: any;
      pagoMovilAccount?: PagoMovilAccountOption;
      reference?: string;
      notes?: string;
    }
  ) => {
    updatedSale: Sale;
    paymentRecord: CreditPaymentRecord;
    totalCustomerDebtAfterUSD: number;
  } | null;
  deleteSale: (saleId: string, restoreStock?: boolean) => Promise<boolean>;
  voidSale: (saleId: string, reason?: string, restoreStock?: boolean) => Promise<boolean>;
  reactivateSale: (saleId: string) => Promise<boolean>;
  deleteCustomerCreditSales: (customerIdOrPhoneOrIds: string | string[], restoreStock?: boolean) => Promise<number>;
  voidCustomerCreditSales: (customerIdOrPhoneOrIds: string | string[], reason?: string, restoreStock?: boolean) => Promise<number>;
  clearAllTestCreditSales: () => Promise<number>;

  // Cuentas por Cobrar & Créditos
  pendingCreditSales: Sale[];
  overdueCreditSales: Sale[];
  totalAccountsReceivableUSD: number;
  totalAccountsReceivableBs: number;

  updateMercadoLibreCommission: (saleId: string, status: 'PENDIENTE' | 'PAGADO', commissionUSD?: number) => void;
  settleAllMercadoLibreCommissions: () => void;
  mercadolibreDebtUSD: number;
  mercadolibreDebtBs: number;
  pendingMercadoLibreSales: Sale[];
  mlEntries: MercadoLibreEntry[];
  addMercadoLibreManualEntry: (amountUSD: number, description: string, isPayment?: boolean) => MercadoLibreEntry;
  deleteMercadoLibreEntry: (id: string) => void;

  // Workshop Service Orders (Mecánica y Tapicería)
  serviceOrders: ServiceOrder[];
  createServiceOrder: (
    orderData: Omit<ServiceOrder, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'> & {
      customerCity?: string;
      customerAddress?: string;
      initialPayment?: {
        mode: 'PENDIENTE' | 'ABONO' | 'PAGADO';
        amountUSD?: number;
        amountBs?: number;
        currencyMode?: PaymentCurrencyMode;
        paymentMethod: PaymentMethod;
        pagoMovilAccount?: PagoMovilAccountOption;
        reference?: string;
        notes?: string;
        syncToTreasury?: boolean;
      };
    }
  ) => ServiceOrder;
  updateServiceOrderStatus: (id: string, newStatus: ServiceOrderStatus, notes?: string) => ServiceOrder | undefined;
  updateServiceOrder: (
    id: string,
    updates: Partial<ServiceOrder> & { customerCity?: string; customerAddress?: string }
  ) => ServiceOrder | undefined;
  recordServiceOrderPayment: (
    orderId: string,
    payment: {
      amountUSD: number;
      amountBs?: number;
      currencyMode?: PaymentCurrencyMode;
      paymentMethod: PaymentMethod;
      pagoMovilAccount?: PagoMovilAccountOption;
      reference?: string;
      notes?: string;
      syncToTreasury?: boolean;
      markAsFullPayment?: boolean;
    }
  ) => { updatedOrder: ServiceOrder; paymentRecord: ServiceOrderPaymentRecord } | null;
  deleteServiceOrderPayment: (orderId: string, paymentId: string) => ServiceOrder | undefined;
  deleteServiceOrder: (id: string, restoreStock?: boolean) => void;

  // Online Store Orders
  onlineOrders: OnlineOrder[];
  placeOnlineOrder: (orderData: Omit<OnlineOrder, 'id' | 'orderCode' | 'createdAt' | 'status' | 'bcvRate' | 'totalBs'>) => OnlineOrder;
  updateOrderStatus: (id: string, status: OnlineOrderStatus) => void;

  // Cart (USD)
  cart: CartItem[];
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  cartTotal: number;
  cartTotalBs: number;
  cartSubtotalBeforeDiscount: number;
  cartWholesaleDiscount: number;
  cartWholesaleSummary: CartWholesaleSummary;
  cartItemCount: number;

  // Workshop Technician Commissions & Payouts
  technicians: Technician[];
  addTechnician: (techData: Omit<Technician, 'id' | 'createdAt'>) => Technician;
  updateTechnician: (id: string, updates: Partial<Technician>, applyRateToPending?: boolean) => void;
  deleteTechnician: (id: string) => void;

  serviceCommissions: ServiceCommission[];
  addServiceCommission: (
    data: Omit<ServiceCommission, 'id' | 'createdAt' | 'commissionAmountUSD' | 'status' | 'paidAmountUSD'> & {
      paidAmountUSD?: number;
    }
  ) => ServiceCommission;
  updateServiceCommission: (id: string, updates: Partial<ServiceCommission>) => void;
  deleteServiceCommission: (id: string) => void;
  syncServiceOrderToCommission: (
    order: ServiceOrder,
    options?: {
      technicianId?: string;
      technicianName?: string;
      commissionRate?: number;
      baseAmountUSD?: number;
    }
  ) => ServiceCommission | null;
  syncAllPendingServiceOrdersToCommissions: (defaultRate?: number) => {
    created: number;
    createdTechnicians: number;
  };

  technicianPayouts: TechnicianPayout[];
  payTechnicianCommissions: (params: {
    technicianId: string;
    commissionIds?: string[];
    amountUSD?: number;
    paymentMethod: PaymentMethod;
    reference?: string;
    notes?: string;
    customPayoutNumber?: string;
    technicianPhoneOverride?: string;
  }) => TechnicianPayout | null;
  deleteTechnicianPayout: (payoutId: string, revertPaidAmounts?: boolean) => void;
  pendingTechniciansCommissionUSD: number;
  pendingTechniciansCommissionBs: number;

  // Suppliers & Purchase Orders (Proveedores y Órdenes de Compra)
  suppliers: Supplier[];
  addSupplier: (supplierData: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>) => Supplier;
  updateSupplier: (id: string, updates: Partial<Supplier>) => void;
  deleteSupplier: (id: string) => void;

  purchaseOrders: PurchaseOrder[];
  createPurchaseOrder: (orderData: {
    supplierId: string;
    supplierInvoiceNumber?: string;
    items: PurchaseOrderItem[];
    paymentType: 'CONTADO' | 'CREDITO';
    paymentCurrencyCondition?: 'DIVISAS' | 'BS_BCV';
    creditDays?: number;
    creditDueDate?: string;
    isPaidImmediately?: boolean;
    initialPaidUSD?: number;
    initialPaymentCurrency?: PurchasePaymentCurrency;
    initialPaymentMethod?: string;
    initialPaymentReference?: string;
    receivedStatus: 'PENDIENTE' | 'RECIBIDA';
    receivedDate?: string;
    applyStockToInventory?: boolean;
    notes?: string;
  }) => PurchaseOrder | null;
  updatePurchaseOrder: (
    id: string,
    updates: Partial<PurchaseOrder> & {
      applyStockToInventory?: boolean;
      syncInventoryDelta?: boolean;
    }
  ) => PurchaseOrder | null;
  deletePurchaseOrder: (id: string) => void;
  markPurchaseOrderReceived: (
    id: string,
    receivedDate?: string,
    applyStockToInventory?: boolean
  ) => PurchaseOrder | null;
  recordPurchaseOrderPayment: (
    orderId: string,
    payment: {
      amountUSD: number;
      currencyCategory: PurchasePaymentCurrency;
      paymentMethod: string;
      reference?: string;
      notes?: string;
    }
  ) => {
    updatedOrder: PurchaseOrder;
    paymentRecord: PurchasePaymentRecord;
    totalSupplierDebtAfterUSD: number;
  } | null;
  totalSupplierDebtUSD: number;
  totalSupplierDebtBs: number;
  pendingReceptionOrdersCount: number;

  // Business Expenses (Gastos del Negocio)
  expenses: BusinessExpense[];
  expenseCategories: string[];
  addExpenseCategory: (categoryName: string) => { added: boolean; category: string };
  deleteExpenseCategory: (categoryName: string) => void;
  incomeCategories: string[];
  addIncomeCategory: (categoryName: string) => { added: boolean; category: string };
  deleteIncomeCategory: (categoryName: string) => void;
  commitmentCategories: Array<{ id: string; label: string; isCustom: boolean }>;
  addCommitmentCategory: (categoryName: string) => { added: boolean; id: string; label: string };
  deleteCommitmentCategory: (categoryIdOrLabel: string) => void;
  expensePosBanks: string[];
  addExpensePosBank: (bankName: string) => { added: boolean; bank: string };
  deleteExpensePosBank: (bankName: string) => void;
  addExpense: (expenseData: {
    date: string;
    category: string;
    description: string;
    beneficiary?: string;
    amountUSD: number;
    amountBs?: number;
    bcvRate?: number;
    paymentCurrencyType: ExpensePaymentCurrency;
    paymentMethod: ExpensePaymentMethod;
    cardBank?: string;
    reference?: string;
    notes?: string;
    treasuryAccountId?: string;
    treasuryAccountName?: string;
    treasuryMovementId?: string;
    deductFromTreasury?: boolean;
    skipTreasuryDeduction?: boolean;
    isSalaryAdvance?: boolean;
    linkedCommitmentId?: string;
    linkedCommitmentTitle?: string;
    salaryAdvanceAppliedUSD?: number;
    skipCommitmentDeduction?: boolean;
  }) => BusinessExpense;
  updateExpense: (id: string, updates: Partial<BusinessExpense>) => BusinessExpense | null;
  deleteExpense: (id: string) => void;
  totalExpensesUSD: number;
  totalExpensesBs: number;
  currentMonthExpensesUSD: number;
  currentMonthExpensesBs: number;

  // Treasury & Finance (Tesorería y Finanzas)
  treasuryAccounts: TreasuryAccount[];
  treasuryCommitments: TreasuryCommitment[];
  treasuryMovements: TreasuryMovement[];
  initializeDefaultTreasuryAccounts: () => TreasuryAccount[];
  addTreasuryAccount: (data: {
    name: string;
    group: TreasuryAccountGroup;
    currency: 'USD' | 'BS' | 'USDT';
    nativeBalance: number;
    institution?: string;
    accountNumber?: string;
    notes?: string;
  }) => TreasuryAccount;
  updateTreasuryAccount: (id: string, updates: Partial<TreasuryAccount>) => TreasuryAccount | null;
  deleteTreasuryAccount: (id: string) => void;
  addTreasuryCommitment: (data: {
    title: string;
    workerName?: string;
    category: TreasuryCommitmentCategory;
    dueDate: string;
    amountUSD: number;
    bcvRate?: number;
    paymentCurrency?: TreasuryCommitmentPaymentCurrency;
    exchangeRateType?: TreasuryCommitmentRateType;
    appliedExchangeRate?: number;
    reservedUSD?: number;
    linkedPurchaseOrderId?: string;
    isRecurringMonthly?: boolean;
    recurrenceFrequency?: TreasuryCommitmentRecurrence;
    recurrenceMode?: TreasuryCommitmentRecurrenceMode;
    recurrenceDayOfWeek?: number;
    recurrenceActive?: boolean;
    notes?: string;
  }) => TreasuryCommitment;
  updateTreasuryCommitment: (id: string, updates: Partial<TreasuryCommitment>) => TreasuryCommitment | null;
  deleteTreasuryCommitment: (id: string) => void;
  syncRecurringCommitments: (options?: {
    targetGroupId?: string;
    forceFillCurrentMonth?: boolean;
  }) => TreasuryCommitment[];
  markCommitmentPaidFromAccount: (
    commitmentId: string,
    accountId: string,
    options?: {
      paymentDate?: string;
      reference?: string;
      notes?: string;
      syncToExpense?: boolean;
      appliedExchangeRate?: number;
      exchangeRateType?: TreasuryCommitmentRateType;
    }
  ) => {
    commitment: TreasuryCommitment;
    movement: TreasuryMovement;
    account: TreasuryAccount;
    generatedNextCommitments?: TreasuryCommitment[];
  } | null;
  recordTreasuryMovement: (data: {
    date: string;
    type: TreasuryMovementType;
    accountId: string;
    category: string;
    description: string;
    amountInput: number;
    inputCurrency?: 'USD' | 'BS' | 'USDT';
    bcvRate?: number;
    reference?: string;
    notes?: string;
    syncToExpense?: boolean;
    beneficiary?: string;
    isSalaryAdvance?: boolean;
    linkedCommitmentId?: string;
  }) => {
    movement: TreasuryMovement;
    account: TreasuryAccount;
    expense?: BusinessExpense;
    updatedCommitment?: TreasuryCommitment;
  } | null;
  recordUsdtPurchase: (data: {
    date: string;
    sourceAccountId: string;
    targetAccountId: string;
    spentBs: number;
    purchasedUsdt: number;
    bcvRate?: number;
    reference?: string;
    notes?: string;
  }) => {
    expenseMovement: TreasuryMovement;
    incomeMovement: TreasuryMovement;
    sourceAccount: TreasuryAccount;
    targetAccount: TreasuryAccount;
    effectiveUsdtRate: number;
  } | null;
  deleteTreasuryMovement: (id: string, revertAccountBalance?: boolean) => void;
  importUnpaidPurchaseOrdersToCommitments: () => number;
  totalLiquidityUSD: number;
  totalLiquidityBs: number;
  pendingCommitmentsUSD: number;
  pendingCommitmentsBs: number;
  projectedFreeBalanceUSD: number;
  projectedFreeBalanceBs: number;

  // Treasury Debts & Debt Payment Planning
  treasuryDebts: TreasuryDebt[];
  debtCategories: string[];
  addDebtCategory: (name: string) => { added: boolean; category: string };
  renameDebtCategory: (
    oldName: string,
    newName: string
  ) => { renamed: boolean; updatedCount: number; newCategory?: string };
  deleteDebtCategory: (name: string) => void;
  addTreasuryDebt: (data: {
    title: string;
    creditor: string;
    category: string;
    priority?: DebtPriority;
    totalAmountUSD: number;
    initialPaidUSD?: number;
    startDate?: string;
    dueDate?: string;
    notes?: string;
    paymentPlan?: DebtPaymentPlan;
  }) => TreasuryDebt;
  updateTreasuryDebt: (
    id: string,
    updates: Partial<Omit<TreasuryDebt, 'id' | 'debtNumber' | 'createdAt'>>
  ) => TreasuryDebt | null;
  deleteTreasuryDebt: (id: string) => void;
  saveDebtPaymentPlan: (debtId: string, plan: DebtPaymentPlan) => TreasuryDebt | null;
  recordDebtPayment: (
    debtId: string,
    data: {
      date: string;
      amountInput: number;
      inputCurrency?: 'USD' | 'BS' | 'USDT';
      bcvRate?: number;
      accountId: string;
      installmentId?: string;
      reference?: string;
      notes?: string;
      syncToExpense?: boolean;
    }
  ) => {
    debt: TreasuryDebt;
    payment: DebtPaymentRecord;
    movement: TreasuryMovement;
    account: TreasuryAccount;
    expense?: BusinessExpense;
  } | null;
  scheduleDebtInstallmentToCommitments: (
    debtId: string,
    installmentId: string
  ) => TreasuryCommitment | null;
  totalPendingDebtsUSD: number;
  totalPendingDebtsBs: number;

  // POS Daily Open Accounts ("Abrir Cuenta" para talleres vecinos)
  openAccounts: OpenAccount[];
  openCustomerAccount: (data: {
    customerId?: string;
    customerName: string;
    customerPhone: string;
    customerDocument?: string;
    workshopName?: string;
    motorcycleInfo?: string;
    notes?: string;
    items: SaleItem[];
  }) => OpenAccount;
  addItemsToOpenAccount: (
    accountId: string,
    items: SaleItem[],
    note?: string
  ) => OpenAccount | null;
  updateOpenAccountItem: (
    accountId: string,
    entryId: string,
    updates: { quantity?: number; unitPrice?: number }
  ) => OpenAccount | null;
  removeOpenAccountItem: (accountId: string, entryId: string) => OpenAccount | null;
  updateOpenAccountMeta: (
    accountId: string,
    updates: {
      customerName?: string;
      customerPhone?: string;
      customerDocument?: string;
      workshopName?: string;
      motorcycleInfo?: string;
      notes?: string;
    }
  ) => OpenAccount | null;
  cancelOpenAccount: (accountId: string) => boolean;
  settleOpenAccount: (
    accountId: string,
    settlement: {
      paymentType: SalePaymentType;
      paymentMethod: PaymentMethod;
      pagoMovilAccount?: PagoMovilAccountOption;
      paymentSplits?: SalePaymentSplit[];
      discount?: number;
      notes?: string;
      creditDays?: number;
      creditDueDate?: string;
      creditPaidAmount?: number;
      creditPaidAmountBs?: number;
      creditInitialPaymentCurrency?: PaymentCurrencyMode;
      hasShipping?: boolean;
      shippingCostUSD?: number;
      shippingCostBs?: number;
      shippingCurrencyMode?: PaymentCurrencyMode;
      shippingState?: string;
      shippingAgency?: string;
      shippingNotes?: string;
    }
  ) => Sale | null;

  // Modals & UI triggers
  selectedInvoice: Sale | null;
  setSelectedInvoice: (sale: Sale | null) => void;
  whatsappModalData: {
    title: string;
    message: string;
    url: string;
    phone: string;
    recipientName: string;
    primaryLabel?: string;
    isTechnician?: boolean;
    isSupplier?: boolean;
    sale?: Sale;
    serviceOrder?: ServiceOrder;
    technicianPayout?: TechnicianPayout;
    purchaseOrder?: PurchaseOrder;
    pdfFileName?: string;
    secondaryNotification?: {
      label: string;
      title: string;
      message: string;
      url: string;
      phone: string;
      recipientName: string;
      isTechnician?: boolean;
    };
  } | null;
  setWhatsappModalData: (data: {
    title: string;
    message: string;
    url: string;
    phone: string;
    recipientName: string;
    primaryLabel?: string;
    isTechnician?: boolean;
    isSupplier?: boolean;
    sale?: Sale;
    serviceOrder?: ServiceOrder;
    technicianPayout?: TechnicianPayout;
    purchaseOrder?: PurchaseOrder;
    pdfFileName?: string;
    secondaryNotification?: {
      label: string;
      title: string;
      message: string;
      url: string;
      phone: string;
      recipientName: string;
      isTechnician?: boolean;
    };
  } | null) => void;

  // Admin Sidebar Collapsible State
  isAdminSidebarCollapsed: boolean;
  setIsAdminSidebarCollapsed: (collapsed: boolean) => void;
  toggleAdminSidebar: () => void;
  isAdminMobileMenuOpen: boolean;
  setIsAdminMobileMenuOpen: (open: boolean) => void;

  // User Authentication & Roles (ADMIN / CLIENTE)
  currentUser: AppUser | null;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isAuthModalOpen: boolean;
  authModalTab: 'login' | 'register';
  openAuthModal: (tab?: 'login' | 'register') => void;
  closeAuthModal: () => void;
  login: (identifier: string, password: string) => Promise<{ success: boolean; user?: AppUser; error?: string }>;
  register: (userData: { name: string; documentId: string; phone: string; email?: string; password: string }) => Promise<{ success: boolean; user?: AppUser; error?: string }>;
  changeAdminPassword: (currentPassword: string, newPassword: string, confirmPassword: string) => Promise<{ success: boolean; error?: string; user?: AppUser }>;
  resetAdminPassword: (params: {
    email: string;
    documentId: string;
    phone: string;
    newPassword: string;
    confirmPassword: string;
  }) => Promise<{ success: boolean; error?: string; user?: AppUser }>;
  isChangePasswordModalOpen: boolean;
  setIsChangePasswordModalOpen: (open: boolean) => void;
  logout: () => void;

  // Firebase Real-time Synchronization
  isFirebaseConnected: boolean;
  firebaseSyncStatus: 'synced' | 'syncing' | 'error' | 'idle';
  syncAllToFirebase: () => Promise<{ success: boolean; count: number }>;
  firebaseConfigData: any;

  // Reset to demo data
  resetAllData: () => void;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

const STORAGE_KEYS = {
  SETTINGS: 'servimotos_settings_ve_v2',
  PRODUCTS: 'servimotos_products_ve_v2',
  CUSTOMERS: 'servimotos_customers_ve_v2',
  SALES: 'servimotos_sales_ve_v2',
  SERVICE_ORDERS: 'servimotos_service_orders_ve_v2',
  ONLINE_ORDERS: 'servimotos_online_orders_ve_v2',
  TECHNICIANS: 'servimotos_technicians_ve_v1',
  SERVICE_COMMISSIONS: 'servimotos_service_commissions_ve_v1',
  TECH_PAYOUTS: 'servimotos_tech_payouts_ve_v1',
  SUPPLIERS: 'servimotos_suppliers_ve_v1',
  PURCHASE_ORDERS: 'servimotos_purchase_orders_ve_v1',
  EXPENSES: 'servimotos_expenses_ve_v1',
  TREASURY_ACCOUNTS: 'servimotos_treasury_accounts_ve_v1',
  TREASURY_COMMITMENTS: 'servimotos_treasury_commitments_ve_v1',
  TREASURY_MOVEMENTS: 'servimotos_treasury_movements_ve_v1',
  TREASURY_DEBTS: 'servimotos_treasury_debts_ve_v1',
  OPEN_ACCOUNTS: 'servimotos_open_accounts_ve_v1',
  DEBT_CATEGORIES: 'servimotos_debt_categories_ve_v1',
  CART: 'servimotos_cart_ve_v2',
  ML_ENTRIES: 'servimotos_ml_entries_ve_v2',
  DELETED_IDS: 'servimotos_deleted_ids_v1',
  PENDING_SYNC_SALES: 'servimotos_pending_sync_sales_v1',
};

export const AppProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const getInitialTrackedPhone = (): string => {
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      return params.get('trackPhone') || '';
    }
    return '';
  };

  const getInitialPublicClientMode = (): boolean => {
    if (typeof window === 'undefined') return false;
    const path = window.location.pathname.toLowerCase();
    const search = window.location.search.toLowerCase();
    const hash = window.location.hash.toLowerCase();

    // If explicit admin route is requested in path, query, or hash
    if (
      path.includes('/admin') ||
      search.includes('admin=true') ||
      search.includes('admin=1') ||
      search.includes('vista=admin') ||
      hash.includes('admin')
    ) {
      return false;
    }

    // Direct store routes or product deep links explicitly requested
    if (
      path.includes('mercadomotocc') ||
      path.includes('/tienda') ||
      path.includes('/catalogo') ||
      path.includes('/repuestos') ||
      path.includes('/repuesto/') ||
      path.includes('/producto/') ||
      search.includes('mercadomotocc') ||
      search.includes('tienda=mercadomotocc') ||
      search.includes('repuesto=') ||
      search.includes('producto=') ||
      hash.includes('mercadomotocc')
    ) {
      return true;
    }

    // Check stored preference
    try {
      const stored = sessionStorage.getItem('servimotos_client_mode');
      if (stored === 'true') return true;
      if (stored === 'false') return false;
    } catch {}

    // Public shared preview URL (ais-pre-, vercel.app or custom domain motocristoc.com) opens store if no admin route
    if (
      window.location.hostname.includes('ais-pre-') ||
      window.location.hostname.includes('vercel.app') ||
      window.location.hostname.includes('motocristoc.com')
    ) {
      return true;
    }

    // Default for developer / admin workspace: false (Admin Mode)
    return false;
  };

  // User Authentication & Roles (ADMIN / CLIENTE)
  const [currentUser, setCurrentUser] = useState<AppUser | null>(() => {
    try {
      const stored = localStorage.getItem('servimotos_auth_user_v1');
      if (stored) {
        return JSON.parse(stored);
      }
    } catch {}
    return null;
  });

  const isAuthenticated = Boolean(currentUser);
  const isAdmin = currentUser?.role === 'ADMIN';

  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [authModalTab, setAuthModalTab] = useState<'login' | 'register'>('login');
  const [isChangePasswordModalOpen, setIsChangePasswordModalOpen] = useState(false);

  const openAuthModal = (tab: 'login' | 'register' = 'login') => {
    setAuthModalTab(tab);
    setIsAuthModalOpen(true);
  };

  const closeAuthModal = () => {
    setIsAuthModalOpen(false);
  };

  const applyAuthenticatedUser = (user: AppUser) => {
    const cleanUser: AppUser = {
      id: user.id,
      name: user.name,
      documentId: user.documentId,
      phone: user.phone,
      email: user.email,
      role: user.role,
      createdAt: user.createdAt,
      hasCustomPassword: Boolean(user.hasCustomPassword),
      passwordUpdatedAt: user.passwordUpdatedAt,
    };
    setCurrentUser(cleanUser);
    try {
      localStorage.setItem('servimotos_auth_user_v1', JSON.stringify(cleanUser));
    } catch {}

    if (cleanUser.role === 'ADMIN') {
      setIsPublicClientMode(false);
      _setCurrentView('admin_dashboard');
      if (typeof window !== 'undefined') {
        try {
          window.history.pushState(null, '', '/admin');
        } catch {}
      }
    } else {
      setIsPublicClientMode(true);
      if (cleanUser.phone) {
        setTrackedPhone(cleanUser.phone);
      }
    }
    return cleanUser;
  };

  const login = async (identifier: string, password: string) => {
    const trimmedId = identifier.trim();
    const isAdminAttempt = isOwnerAdminIdentifier(trimmedId);

    // Fetch latest shared admin credential record from Firestore so Dev and Published apps share the same password
    let cloudAdminUser: AppUser | null = null;
    try {
      cloudAdminUser = await fetchAdminUserFromFirestore();
    } catch {
      cloudAdminUser = null;
    }

    let serverError: string | null = null;
    let serverUnavailable = false;

    try {
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          identifier: trimmedId,
          password,
          cloudAdminUser: isAdminAttempt ? cloudAdminUser : undefined,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        serverUnavailable = true;
      } else {
        const data = await res.json();
        if (res.ok && data.success && data.user) {
          const cleanUser = applyAuthenticatedUser(data.user);

          // Ensure Firestore holds the latest custom PBKDF2 admin hash across environments
          if (
            cleanUser.role === 'ADMIN' &&
            data.cloudSyncHash &&
            (!cloudAdminUser?.passwordHash || cloudAdminUser.passwordHash !== data.cloudSyncHash)
          ) {
            syncUserToFirestore({
              ...cleanUser,
              passwordHash: data.cloudSyncHash,
            }).catch(() => {});
          }

          return { success: true, user: cleanUser };
        }
        if (res.status >= 500 || res.status === 404) {
          serverUnavailable = true;
        }
        serverError = data?.error || 'Credenciales inválidas';
      }
    } catch {
      serverUnavailable = true;
    }

    // Fallback: verify owner admin credentials directly against shared Firestore + Web Crypto PBKDF2
    if (isAdminAttempt) {
      const targetAdmin = cloudAdminUser || DEFAULT_ADMIN_PROFILE;
      let validInCloud = false;

      if (targetAdmin.hasCustomPassword && targetAdmin.passwordHash) {
        validInCloud = await verifyPasswordClient(password, targetAdmin.passwordHash);
      } else if (!targetAdmin.hasCustomPassword) {
        validInCloud = DEFAULT_ADMIN_FALLBACK_PASSWORDS.includes(password);
      }

      if (validInCloud && (serverUnavailable || cloudAdminUser?.hasCustomPassword)) {
        const cleanUser = applyAuthenticatedUser(targetAdmin);
        return { success: true, user: cleanUser };
      }

      if (serverUnavailable) {
        return {
          success: false,
          error: targetAdmin.hasCustomPassword
            ? 'Contraseña incorrecta. Verifica mayúsculas/minúsculas o usa "Restablecer clave de Administrador".'
            : 'Contraseña incorrecta. En este dominio aún no hay clave personalizada sincronizada: prueba con "admin" o usa "Restablecer clave de Administrador".',
        };
      }
    }

    return {
      success: false,
      error: serverError || 'No se pudo conectar con el servidor de autenticación.',
    };
  };

  const register = async (userData: {
    name: string;
    documentId: string;
    phone: string;
    email?: string;
    password: string;
  }) => {
    try {
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(userData),
      });
      const data = await res.json();
      if (res.ok && data.success && data.user) {
        setCurrentUser(data.user);
        try {
          localStorage.setItem('servimotos_auth_user_v1', JSON.stringify(data.user));
        } catch {}

        setIsPublicClientMode(true);
        if (data.user.phone) {
          setTrackedPhone(data.user.phone);
        }
        return { success: true, user: data.user };
      }
      return { success: false, error: data.error || 'No se pudo crear la cuenta' };
    } catch (err: any) {
      return { success: false, error: err.message || 'Error de conexión' };
    }
  };

  const changeAdminPassword = async (
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<{ success: boolean; error?: string; user?: AppUser }> => {
    if (!currentPassword) {
      return { success: false, error: 'Ingresa tu clave administrativa actual.' };
    }
    if (!newPassword || newPassword.trim().length < 4) {
      return { success: false, error: 'La nueva clave debe tener al menos 4 caracteres.' };
    }
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return { success: false, error: 'La nueva clave y su confirmación no coinciden.' };
    }

    let cloudAdminUser: AppUser | null = null;
    try {
      cloudAdminUser = await fetchAdminUserFromFirestore();
    } catch {
      cloudAdminUser = null;
    }

    let serverUnavailable = false;
    let serverError: string | null = null;

    try {
      const res = await fetch('/api/auth/change-admin-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
          cloudAdminUser,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        serverUnavailable = true;
      } else {
        const data = await res.json();
        if (res.ok && data.success && data.user) {
          const cleanUser = applyAuthenticatedUser(data.user);
          // Persist PBKDF2 hash in Firestore so Dev and Published URLs update immediately
          const hashToStore = data.passwordHash || (await hashPasswordClient(newPassword));
          await syncUserToFirestore({
            ...cleanUser,
            passwordHash: hashToStore,
          }).catch(() => {});
          return { success: true, user: cleanUser };
        }
        if (res.status >= 500 || res.status === 404) {
          serverUnavailable = true;
        }
        serverError = data?.error || 'No se pudo cambiar la clave administrativa.';
      }
    } catch {
      serverUnavailable = true;
    }

    // Fallback when API endpoint is unavailable (e.g. static published environment)
    if (serverUnavailable) {
      const targetAdmin = cloudAdminUser || DEFAULT_ADMIN_PROFILE;
      const isCurrentValid =
        targetAdmin.hasCustomPassword && targetAdmin.passwordHash
          ? await verifyPasswordClient(currentPassword, targetAdmin.passwordHash)
          : DEFAULT_ADMIN_FALLBACK_PASSWORDS.includes(currentPassword);

      if (!isCurrentValid) {
        return {
          success: false,
          error: 'La clave actual es incorrecta. Verifícala e intenta de nuevo.',
        };
      }

      const nowIso = new Date().toISOString();
      const newHash = await hashPasswordClient(newPassword);
      const updatedUser: AppUser = {
        ...DEFAULT_ADMIN_PROFILE,
        ...(cloudAdminUser || {}),
        id: 'usr-admin-1',
        role: 'ADMIN',
        hasCustomPassword: true,
        passwordUpdatedAt: nowIso,
      };
      await syncUserToFirestore({
        ...updatedUser,
        passwordHash: newHash,
      });
      const cleanUser = applyAuthenticatedUser(updatedUser);
      return { success: true, user: cleanUser };
    }

    return {
      success: false,
      error: serverError || 'No se pudo cambiar la clave administrativa.',
    };
  };

  const resetAdminPassword: AppContextType['resetAdminPassword'] = async ({
    email,
    documentId,
    phone,
    newPassword,
    confirmPassword,
  }) => {
    if (!newPassword || newPassword.trim().length < 4) {
      return { success: false, error: 'La nueva clave debe tener al menos 4 caracteres.' };
    }
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return { success: false, error: 'La nueva clave y su confirmación no coinciden.' };
    }

    const identityCheck = verifyOwnerRecoveryIdentity(
      email,
      documentId,
      phone,
      settingsRef.current
    );
    if (!identityCheck.valid) {
      return {
        success: false,
        error: identityCheck.reason || 'Los datos de verificación del propietario no coinciden.',
      };
    }

    let cloudAdminUser: AppUser | null = null;
    try {
      cloudAdminUser = await fetchAdminUserFromFirestore();
    } catch {
      cloudAdminUser = null;
    }

    let serverHash: string | undefined;
    let serverUser: AppUser | undefined;

    try {
      const res = await fetch('/api/auth/reset-admin-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          email,
          documentId,
          phone,
          newPassword,
          confirmPassword,
        }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (contentType.includes('application/json')) {
        const data = await res.json();
        if (res.ok && data.success && data.user) {
          serverHash = data.passwordHash;
          serverUser = data.user;
        }
      }
    } catch {
      // Static deployments (e.g. Vercel / custom domain) do not host /api/auth/* — handled directly via Firestore below
    }

    const nowIso = new Date().toISOString();
    const hashToStore = serverHash || (await hashPasswordClient(newPassword));
    const updatedUser: AppUser = {
      ...DEFAULT_ADMIN_PROFILE,
      ...(cloudAdminUser || {}),
      ...(serverUser || {}),
      id: 'usr-admin-1',
      role: 'ADMIN',
      hasCustomPassword: true,
      passwordUpdatedAt: nowIso,
    };

    try {
      await syncUserToFirestore({
        ...updatedUser,
        passwordHash: hashToStore,
      });
    } catch {
      // Even if offline briefly, local session will still authenticate and retry on next sync
    }

    const cleanUser = applyAuthenticatedUser(updatedUser);
    return { success: true, user: cleanUser };
  };

  const logout = () => {
    setCurrentUser(null);
    try {
      localStorage.removeItem('servimotos_auth_user_v1');
    } catch {}
    setIsPublicClientMode(true);
    _setCurrentView('tienda');
  };

  const initialPhone = getInitialTrackedPhone();
  const initialClientMode = getInitialPublicClientMode();
  const [isPublicClientMode, _setIsPublicClientMode] = useState<boolean>(() => {
    if (currentUser?.role === 'ADMIN') return initialClientMode;
    return true; // Non-admin and guest always start in public client mode
  });

  const [currentView, _setCurrentView] = useState<AppView>(() => {
    if (initialPhone) return 'consulta_cliente';
    if (typeof window !== 'undefined') {
      const path = window.location.pathname.toLowerCase();
      const search = window.location.search.toLowerCase();
      const hash = window.location.hash.toLowerCase();

      // Explicit store routes or direct product links
      if (
        path.includes('mercadomotocc') ||
        path.includes('/tienda') ||
        path.includes('/catalogo') ||
        path.includes('/repuesto/') ||
        path.includes('/producto/') ||
        search.includes('mercadomotocc') ||
        search.includes('tienda=mercadomotocc') ||
        search.includes('repuesto=') ||
        search.includes('producto=') ||
        hash.includes('mercadomotocc')
      ) {
        return 'tienda';
      }

      if (path.includes('consulta') || search.includes('consulta')) {
        return 'consulta_cliente';
      }

      // If logged in as admin and explicitly on admin route
      if (currentUser?.role === 'ADMIN' && (path.includes('admin') || !initialClientMode)) {
        return 'admin_dashboard';
      }

      // Default for everyone else is public store
      return 'tienda';
    }
    return 'tienda';
  });

  const [trackedPhone, setTrackedPhone] = useState<string>(() => {
    return initialPhone || currentUser?.phone || currentUser?.documentId || '';
  });

  const setIsPublicClientMode = (mode: boolean) => {
    _setIsPublicClientMode(mode);
    try {
      sessionStorage.setItem('servimotos_client_mode', mode ? 'true' : 'false');
    } catch {}
  };

  const enterPublicStore = () => {
    setIsPublicClientMode(true);
    _setCurrentView('tienda');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
      try {
        window.history.pushState(null, '', '/mercadomotocc');
      } catch {}
    }
  };

  const enterAdminMode = () => {
    if (!isAdmin) {
      openAuthModal('login');
      return;
    }
    setIsPublicClientMode(false);
    _setCurrentView('admin_dashboard');
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
      try {
        window.history.pushState(null, '', '/admin');
      } catch {}
    }
  };

  // Sync popstate (browser Back/Forward)
  useEffect(() => {
    const handlePopState = () => {
      const path = window.location.pathname.toLowerCase();
      const search = window.location.search.toLowerCase();
      const hash = window.location.hash.toLowerCase();

      const isClientPath =
        path.includes('mercadomotocc') ||
        path.includes('/tienda') ||
        path.includes('/repuesto/') ||
        path.includes('/producto/') ||
        search.includes('mercadomotocc') ||
        search.includes('repuesto=') ||
        search.includes('producto=') ||
        hash.includes('mercadomotocc');
      const isAdminPath =
        path.includes('admin') ||
        search.includes('admin') ||
        hash.includes('admin');

      if (isClientPath) {
        setIsPublicClientMode(true);
        _setCurrentView('tienda');
      } else if (isAdminPath) {
        if (isAdmin) {
          setIsPublicClientMode(false);
          _setCurrentView('admin_dashboard');
        } else {
          openAuthModal('login');
          _setCurrentView('tienda');
        }
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [isAdmin]);

  const setCurrentView = (view: AppView) => {
    // Non-admin users cannot access admin views
    if (view.startsWith('admin_') && !isAdmin) {
      openAuthModal('login');
      return;
    }

    if (view.startsWith('admin_')) {
      setIsPublicClientMode(false);
    }
    _setCurrentView(view);
    if (typeof window !== 'undefined') {
      window.scrollTo({ top: 0, behavior: 'instant' });
    }
  };

  const publicStoreUrl = useMemo(() => {
    const origin = getPublicAppOrigin().replace(/\/+$/, '');
    return `${origin}/`;
  }, []);

  // Admin Sidebar State (Collapsible)
  const [isAdminSidebarCollapsed, setIsAdminSidebarCollapsed] = useState<boolean>(() => {
    try {
      const stored = localStorage.getItem('servimotos_sidebar_collapsed');
      return stored !== null ? JSON.parse(stored) : false;
    } catch {
      return false;
    }
  });
  const [isAdminMobileMenuOpen, setIsAdminMobileMenuOpen] = useState(false);

  const toggleAdminSidebar = () => {
    setIsAdminSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('servimotos_sidebar_collapsed', JSON.stringify(next));
      } catch {}
      return next;
    });
  };

  // Settings
  const [settings, setSettings] = useState<BusinessSettings>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SETTINGS);
      if (stored) {
        return JSON.parse(stored);
      }
      return INITIAL_SETTINGS;
    } catch {
      return INITIAL_SETTINGS;
    }
  });

  // Track latest verified live BCV sync in this session so stale server/Firestore snapshots never overwrite it
  const latestLiveBcvRef = useRef<{
    rate: number;
    date?: string;
    source: string;
    lastUpdated: string;
    syncedAtISO: string;
  } | null>(null);
  const lastBcvCheckAtRef = useRef<number>(0);

  const applyFreshBcvIfNewer = (
    incoming: BusinessSettings,
    prev: BusinessSettings
  ): { merged: BusinessSettings; shouldPushLiveToCloud: boolean } => {
    const live = latestLiveBcvRef.current;
    const incomingTs = incoming.bcvSyncedAtISO ? Date.parse(incoming.bcvSyncedAtISO) : 0;
    const prevTs = prev.bcvSyncedAtISO ? Date.parse(prev.bcvSyncedAtISO) : 0;
    const liveTs = live?.syncedAtISO ? Date.parse(live.syncedAtISO) : 0;

    if (live && live.rate > 0 && liveTs > incomingTs) {
      const differsFromIncoming =
        Math.abs((Number(incoming.bcvRate) || 0) - live.rate) >= 0.005 ||
        (live.date && incoming.bcvOfficialDate !== live.date);
      return {
        merged: {
          ...incoming,
          bcvRate: live.rate,
          bcvOfficialDate: live.date || incoming.bcvOfficialDate,
          bcvSource: live.source,
          bcvLastUpdated: live.lastUpdated,
          bcvSyncedAtISO: live.syncedAtISO,
        },
        shouldPushLiveToCloud: Boolean(differsFromIncoming),
      };
    }

    if (prevTs > incomingTs && Number(prev.bcvRate) > 0) {
      return {
        merged: {
          ...incoming,
          bcvRate: prev.bcvRate,
          bcvOfficialDate: prev.bcvOfficialDate || incoming.bcvOfficialDate,
          bcvSource: prev.bcvSource || incoming.bcvSource,
          bcvLastUpdated: prev.bcvLastUpdated || incoming.bcvLastUpdated,
          bcvSyncedAtISO: prev.bcvSyncedAtISO,
        },
        shouldPushLiveToCloud: false,
      };
    }

    return { merged: incoming, shouldPushLiveToCloud: false };
  };

const DEMO_PRODUCT_IDS = new Set([
  'prod-1', 'prod-2', 'prod-3', 'prod-4', 'prod-5', 'prod-6',
  'prod-7', 'prod-8', 'prod-9', 'prod-10', 'prod-11', 'prod-12'
]);
const DEMO_CUSTOMER_IDS = new Set(['cust-1', 'cust-2', 'cust-3']);
const DEMO_CUSTOMER_NAMES = new Set([
  'carlos andrés rodríguez',
  'carlos andres rodriguez',
  'valentina gómez pineda',
  'valentina gomez pineda',
  'javier mantilla silva'
]);
const DEMO_SALE_IDS = new Set<string>(['sale-102', 'sale-103']);
const DEMO_SERVICE_ORDER_IDS = new Set(['ord-1', 'ord-2', 'ord-3']);
const DEMO_ONLINE_ORDER_IDS = new Set(['ord-onl-1', 'ord-onl-2']);

  // Tombstones for permanently deleted records across devices & refreshes
  const [deletedIds, setDeletedIds] = useState<DeletedIdsMap>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.DELETED_IDS);
      if (stored) {
        return mergeDeletedMaps(JSON.parse(stored), { sales: ['sale-102', 'sale-103'] });
      }
    } catch {}
    return { ...EMPTY_DELETED_IDS, sales: ['sale-102', 'sale-103'] };
  });
  const deletedIdsRef = useRef<DeletedIdsMap>(deletedIds);
  useEffect(() => {
    deletedIdsRef.current = deletedIds;
    try {
      localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(deletedIds));
    } catch {}
  }, [deletedIds]);

  const recordDeleted = (category: keyof DeletedIdsMap, ids: string[]) => {
    const cleanIds = ids.filter(Boolean);
    if (cleanIds.length === 0) return;
    const next = mergeDeletedMaps(deletedIdsRef.current, { [category]: cleanIds });
    deletedIdsRef.current = next;
    setDeletedIds(next);
    try {
      localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(next));
    } catch {}
    recordDeletedIdsInFirestore(category, cleanIds).catch((err) =>
      console.warn('Firestore tombstone sync error:', err)
    );
  };

  // Products
  const [products, setProducts] = useState<Product[]>(() => {
    try {
      const deletedSet = new Set(deletedIdsRef.current.products);
      const stored = localStorage.getItem(STORAGE_KEYS.PRODUCTS);
      if (stored !== null) {
        const parsed: Product[] = JSON.parse(stored);
        const filtered = parsed.filter((p) => !DEMO_PRODUCT_IDS.has(p.id) && !deletedSet.has(p.id));
        const normalized = filtered.map((p) => {
          let updatedImg = normalizeImageUrl(p.imageUrl);
          if (p.name.toLowerCase().includes('maleta') && (!updatedImg || updatedImg.includes('brake_kit'))) {
            updatedImg = PRESET_PRODUCT_IMAGES.maletaParaMoto;
          }
          return {
            ...p,
            imageUrl: updatedImg || p.imageUrl || PRESET_PRODUCT_IMAGES.brakeKit,
          };
        });

        localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(normalized.length > 0 ? normalized : INITIAL_PRODUCTS));
        return normalized.length > 0 ? normalized : INITIAL_PRODUCTS;
      }
      return INITIAL_PRODUCTS;
    } catch {
      return INITIAL_PRODUCTS;
    }
  });

  // Customers
  const [customers, setCustomers] = useState<Customer[]>(() => {
    try {
      const deletedSet = new Set(deletedIdsRef.current.customers);
      const stored = localStorage.getItem(STORAGE_KEYS.CUSTOMERS);
      if (stored) {
        const parsed: Customer[] = JSON.parse(stored);
        const filtered = parsed.filter(
          (c) =>
            !DEMO_CUSTOMER_IDS.has(c.id) &&
            !deletedSet.has(c.id) &&
            !DEMO_CUSTOMER_NAMES.has((c.name || '').trim().toLowerCase())
        );
        localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(filtered.length > 0 ? filtered : INITIAL_CUSTOMERS));
        return filtered.length > 0 ? filtered : INITIAL_CUSTOMERS;
      }
      return INITIAL_CUSTOMERS;
    } catch {
      return INITIAL_CUSTOMERS;
    }
  });

  // Sales
  const [sales, setSales] = useState<Sale[]>(() => {
    try {
      const deletedSet = new Set(deletedIdsRef.current.sales);
      const stored = localStorage.getItem(STORAGE_KEYS.SALES);
      if (stored) {
        const parsed: Sale[] = JSON.parse(stored);
        const filtered = parsed.filter((s) => !DEMO_SALE_IDS.has(s.id) && !deletedSet.has(s.id));
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(filtered));
        return filtered;
      }
      return INITIAL_SALES;
    } catch {
      return INITIAL_SALES;
    }
  });

  // Service Orders
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.SERVICE_ORDERS);
      if (stored) {
        const parsed: ServiceOrder[] = JSON.parse(stored);
        return Array.isArray(parsed)
          ? parsed.filter((o) => !DEMO_SERVICE_ORDER_IDS.has(o.id))
          : [];
      }
      return [];
    } catch {
      return [];
    }
  });

  // Online Orders
  const [onlineOrders, setOnlineOrders] = useState<OnlineOrder[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ONLINE_ORDERS);
      if (stored) {
        const parsed: OnlineOrder[] = JSON.parse(stored);
        const filtered = parsed.filter((o) => !DEMO_ONLINE_ORDER_IDS.has(o.id));
        localStorage.setItem(STORAGE_KEYS.ONLINE_ORDERS, JSON.stringify(filtered));
        return filtered;
      }
      return INITIAL_ONLINE_ORDERS;
    } catch {
      return INITIAL_ONLINE_ORDERS;
    }
  });

  // Cart
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.CART);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // MercadoLibre manual charges and payments ledger
  const [mlEntries, setMlEntries] = useState<MercadoLibreEntry[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.ML_ENTRIES);
      return stored ? JSON.parse(stored) : [];
    } catch {
      return [];
    }
  });

  // Modals state
  const [selectedInvoice, setSelectedInvoice] = useState<Sale | null>(null);
  const [whatsappModalData, setWhatsappModalData] = useState<{
    title: string;
    message: string;
    url: string;
    phone: string;
    recipientName: string;
    primaryLabel?: string;
    isTechnician?: boolean;
    isSupplier?: boolean;
    sale?: Sale;
    serviceOrder?: ServiceOrder;
    technicianPayout?: TechnicianPayout;
    purchaseOrder?: PurchaseOrder;
    pdfFileName?: string;
    secondaryNotification?: {
      label: string;
      title: string;
      message: string;
      url: string;
      phone: string;
      recipientName: string;
      isTechnician?: boolean;
    };
  } | null>(null);

  // Technicians, Service Commissions & Technician Payouts
  const [technicians, setTechnicians] = useState<Technician[]>(() => {
    try {
      const delSet = new Set(deletedIdsRef.current.technicians);
      const stored = localStorage.getItem(STORAGE_KEYS.TECHNICIANS);
      if (stored) {
        const parsed: Technician[] = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((t) => !delSet.has(t.id)) : [];
      }
    } catch {}
    return [];
  });

  const [serviceCommissions, setServiceCommissions] = useState<ServiceCommission[]>(() => {
    try {
      const delSet = new Set(deletedIdsRef.current.serviceCommissions);
      const stored = localStorage.getItem(STORAGE_KEYS.SERVICE_COMMISSIONS);
      if (stored) {
        const parsed: ServiceCommission[] = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((c) => !delSet.has(c.id)) : [];
      }
    } catch {}
    return [];
  });

  const [technicianPayouts, setTechnicianPayouts] = useState<TechnicianPayout[]>(() => {
    try {
      const delSet = new Set(deletedIdsRef.current.technicianPayouts);
      const stored = localStorage.getItem(STORAGE_KEYS.TECH_PAYOUTS);
      if (stored) {
        const parsed: TechnicianPayout[] = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((p) => !delSet.has(p.id)) : [];
      }
    } catch {}
    return [];
  });

  // Suppliers & Purchase Orders
  const [suppliers, setSuppliers] = useState<Supplier[]>(() => {
    try {
      const delSet = new Set(deletedIdsRef.current.suppliers);
      const stored = localStorage.getItem(STORAGE_KEYS.SUPPLIERS);
      if (stored) {
        const parsed: Supplier[] = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((s) => !delSet.has(s.id)) : [];
      }
    } catch {}
    return [];
  });

  const [purchaseOrders, setPurchaseOrders] = useState<PurchaseOrder[]>(() => {
    try {
      const delSet = new Set(deletedIdsRef.current.purchaseOrders);
      const stored = localStorage.getItem(STORAGE_KEYS.PURCHASE_ORDERS);
      if (stored) {
        const parsed: PurchaseOrder[] = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((po) => !delSet.has(po.id)) : [];
      }
    } catch {}
    return [];
  });

  // Business Expenses
  const [expenses, setExpenses] = useState<BusinessExpense[]>(() => {
    try {
      const delSet = new Set(deletedIdsRef.current.expenses);
      const stored = localStorage.getItem(STORAGE_KEYS.EXPENSES);
      if (stored) {
        const parsed: BusinessExpense[] = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((ex) => !delSet.has(ex.id)) : [];
      }
    } catch {}
    return [];
  });

  // Treasury Accounts, Commitments & Movements
  const [treasuryAccounts, setTreasuryAccounts] = useState<TreasuryAccount[]>(() => {
    try {
      const delSet = new Set(deletedIdsRef.current.treasuryAccounts);
      const stored = localStorage.getItem(STORAGE_KEYS.TREASURY_ACCOUNTS);
      if (stored) {
        const parsed: TreasuryAccount[] = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((acc) => !delSet.has(acc.id)) : [];
      }
    } catch {}
    return [];
  });

  const [treasuryCommitments, setTreasuryCommitments] = useState<TreasuryCommitment[]>(() => {
    try {
      const delSet = new Set(deletedIdsRef.current.treasuryCommitments);
      const stored = localStorage.getItem(STORAGE_KEYS.TREASURY_COMMITMENTS);
      if (stored) {
        const parsed: TreasuryCommitment[] = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((cm) => !delSet.has(cm.id)) : [];
      }
    } catch {}
    return [];
  });

  const [treasuryMovements, setTreasuryMovements] = useState<TreasuryMovement[]>(() => {
    try {
      const delSet = new Set(deletedIdsRef.current.treasuryMovements);
      const stored = localStorage.getItem(STORAGE_KEYS.TREASURY_MOVEMENTS);
      if (stored) {
        const parsed: TreasuryMovement[] = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((mv) => !delSet.has(mv.id)) : [];
      }
    } catch {}
    return [];
  });

  const [treasuryDebts, setTreasuryDebts] = useState<TreasuryDebt[]>(() => {
    try {
      const delSet = new Set(deletedIdsRef.current.treasuryDebts);
      const stored = localStorage.getItem(STORAGE_KEYS.TREASURY_DEBTS);
      if (stored) {
        const parsed: TreasuryDebt[] = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((d) => !delSet.has(d.id)) : [];
      }
    } catch {}
    return [];
  });

  const [openAccounts, setOpenAccounts] = useState<OpenAccount[]>(() => {
    try {
      const delSet = new Set(deletedIdsRef.current.openAccounts);
      const stored = localStorage.getItem(STORAGE_KEYS.OPEN_ACCOUNTS);
      if (stored) {
        const parsed: OpenAccount[] = JSON.parse(stored);
        return Array.isArray(parsed) ? parsed.filter((a) => !delSet.has(a.id)) : [];
      }
    } catch {}
    return [];
  });

  const [customDebtCategories, setCustomDebtCategories] = useState<string[]>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEYS.DEBT_CATEGORIES);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed.filter((c) => typeof c === 'string' && c.trim().length > 0);
        }
      }
    } catch {}
    return [...DEFAULT_DEBT_CATEGORIES];
  });

  const isInitialLoaded = useRef(false);
  const saveTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Persistent pending-sync queue for sales not yet confirmed in Firestore
  const pendingSyncSaleIdsRef = useRef<Set<string>>(
    (() => {
      try {
        const stored = localStorage.getItem(STORAGE_KEYS.PENDING_SYNC_SALES);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) return new Set<string>(parsed);
        }
      } catch {}
      return new Set<string>();
    })()
  );

  const persistPendingSyncSaleIds = () => {
    try {
      localStorage.setItem(
        STORAGE_KEYS.PENDING_SYNC_SALES,
        JSON.stringify(Array.from(pendingSyncSaleIdsRef.current))
      );
    } catch {}
  };

  const markSalePendingSync = (saleId: string) => {
    if (!saleId) return;
    pendingSyncSaleIdsRef.current.add(saleId);
    persistPendingSyncSaleIds();
  };

  const clearSalePendingSync = (saleId: string) => {
    if (!saleId) return;
    if (pendingSyncSaleIdsRef.current.delete(saleId)) {
      persistPendingSyncSaleIds();
    }
  };

  const syncSaleWithRetry = (sale: Sale) => {
    markSalePendingSync(sale.id);
    syncSaleToFirestore(sale)
      .then(() => {
        clearSalePendingSync(sale.id);
      })
      .catch((err) => {
        console.warn(`Firestore sale sync error (${sale.invoiceNumber}, se reintentará automáticamente):`, err);
      });
  };

  // Pending-sync set for modified/newly paid service commissions & purchase orders so Firestore snapshots never overwrite local payouts in flight
  const pendingSyncCommissionIdsRef = useRef<Set<string>>(new Set());
  const pendingSyncPurchaseOrderIdsRef = useRef<Set<string>>(new Set());
  const pendingSyncExpenseIdsRef = useRef<Set<string>>(new Set());
  const pendingSyncTreasuryAccountIdsRef = useRef<Set<string>>(new Set());
  const pendingSyncTreasuryCommitmentIdsRef = useRef<Set<string>>(new Set());
  const pendingSyncTreasuryMovementIdsRef = useRef<Set<string>>(new Set());
  const pendingSyncTreasuryDebtIdsRef = useRef<Set<string>>(new Set());
  const pendingSyncOpenAccountIdsRef = useRef<Set<string>>(new Set());

  // Live refs so concurrent callbacks never read stale closures
  const salesRef = useRef<Sale[]>(sales);
  const customersRef = useRef<Customer[]>(customers);
  const productsRef = useRef<Product[]>(products);
  const serviceOrdersRef = useRef<ServiceOrder[]>(serviceOrders);
  const onlineOrdersRef = useRef<OnlineOrder[]>(onlineOrders);
  const techniciansRef = useRef<Technician[]>(technicians);
  const serviceCommissionsRef = useRef<ServiceCommission[]>(serviceCommissions);
  const technicianPayoutsRef = useRef<TechnicianPayout[]>(technicianPayouts);
  const suppliersRef = useRef<Supplier[]>(suppliers);
  const purchaseOrdersRef = useRef<PurchaseOrder[]>(purchaseOrders);
  const expensesRef = useRef<BusinessExpense[]>(expenses);
  const treasuryAccountsRef = useRef<TreasuryAccount[]>(treasuryAccounts);
  const treasuryCommitmentsRef = useRef<TreasuryCommitment[]>(treasuryCommitments);
  const treasuryMovementsRef = useRef<TreasuryMovement[]>(treasuryMovements);
  const treasuryDebtsRef = useRef<TreasuryDebt[]>(treasuryDebts);
  const openAccountsRef = useRef<OpenAccount[]>(openAccounts);
  const settingsRef = useRef<BusinessSettings>(settings);

  // Sync to LocalStorage and live refs immediately on any state change
  useEffect(() => {
    settingsRef.current = settings;
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
  }, [settings]);

  useEffect(() => {
    productsRef.current = products;
    localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(products));
  }, [products]);

  useEffect(() => {
    customersRef.current = customers;
    localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(customers));
  }, [customers]);

  useEffect(() => {
    salesRef.current = sales;
    localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(sales));
  }, [sales]);

  useEffect(() => {
    serviceOrdersRef.current = serviceOrders;
    localStorage.setItem(STORAGE_KEYS.SERVICE_ORDERS, JSON.stringify(serviceOrders));
  }, [serviceOrders]);

  useEffect(() => {
    onlineOrdersRef.current = onlineOrders;
    localStorage.setItem(STORAGE_KEYS.ONLINE_ORDERS, JSON.stringify(onlineOrders));
  }, [onlineOrders]);

  useEffect(() => {
    techniciansRef.current = technicians;
    localStorage.setItem(STORAGE_KEYS.TECHNICIANS, JSON.stringify(technicians));
  }, [technicians]);

  useEffect(() => {
    serviceCommissionsRef.current = serviceCommissions;
    localStorage.setItem(STORAGE_KEYS.SERVICE_COMMISSIONS, JSON.stringify(serviceCommissions));
  }, [serviceCommissions]);

  useEffect(() => {
    technicianPayoutsRef.current = technicianPayouts;
    localStorage.setItem(STORAGE_KEYS.TECH_PAYOUTS, JSON.stringify(technicianPayouts));
  }, [technicianPayouts]);

  useEffect(() => {
    suppliersRef.current = suppliers;
    localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(suppliers));
  }, [suppliers]);

  useEffect(() => {
    purchaseOrdersRef.current = purchaseOrders;
    localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(purchaseOrders));
  }, [purchaseOrders]);

  useEffect(() => {
    expensesRef.current = expenses;
    localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(expenses));
  }, [expenses]);

  useEffect(() => {
    treasuryAccountsRef.current = treasuryAccounts;
    localStorage.setItem(STORAGE_KEYS.TREASURY_ACCOUNTS, JSON.stringify(treasuryAccounts));
  }, [treasuryAccounts]);

  useEffect(() => {
    treasuryCommitmentsRef.current = treasuryCommitments;
    localStorage.setItem(STORAGE_KEYS.TREASURY_COMMITMENTS, JSON.stringify(treasuryCommitments));
  }, [treasuryCommitments]);

  useEffect(() => {
    treasuryMovementsRef.current = treasuryMovements;
    localStorage.setItem(STORAGE_KEYS.TREASURY_MOVEMENTS, JSON.stringify(treasuryMovements));
  }, [treasuryMovements]);

  useEffect(() => {
    treasuryDebtsRef.current = treasuryDebts;
    localStorage.setItem(STORAGE_KEYS.TREASURY_DEBTS, JSON.stringify(treasuryDebts));
  }, [treasuryDebts]);

  useEffect(() => {
    openAccountsRef.current = openAccounts;
    localStorage.setItem(STORAGE_KEYS.OPEN_ACCOUNTS, JSON.stringify(openAccounts));
  }, [openAccounts]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.DEBT_CATEGORIES, JSON.stringify(customDebtCategories));
  }, [customDebtCategories]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.CART, JSON.stringify(cart));
  }, [cart]);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEYS.ML_ENTRIES, JSON.stringify(mlEntries));
  }, [mlEntries]);

  // Auto-repair any legacy sales where two distinct customer names accidentally received the same customerId
  useEffect(() => {
    if (sales.length === 0) return;

    const currentCustomers = customersRef.current;
    const customerById = new Map<string, Customer>(currentCustomers.map((c) => [c.id, c]));

    setSales((prevSales) => {
      if (prevSales.length === 0) return prevSales;
      const customerIdNames = new Map<string, string>();
      const repairedToSync: Sale[] = [];
      let needsRepair = false;

      const repairedSales = prevSales.map((sale) => {
        if (isGenericWalkInName(sale.customerName)) return sale;

        const linkedCust = sale.customerId ? customerById.get(sale.customerId) : undefined;
        const firstSeenNameForId = sale.customerId ? customerIdNames.get(sale.customerId) : undefined;

        const linkedMismatch =
          linkedCust &&
          (isGenericWalkInName(linkedCust.name) || !areNamesCompatible(linkedCust.name, sale.customerName));

        const sharedIdMismatch =
          firstSeenNameForId && !areNamesCompatible(firstSeenNameForId, sale.customerName);

        if (!sale.customerId || linkedMismatch || sharedIdMismatch) {
          needsRepair = true;
          const nameSlug =
            normalizeNameKey(sale.customerName)
              .replace(/[^a-z0-9]/g, '-')
              .replace(/-+/g, '-')
              .slice(0, 24) || 'cliente';
          const matchingCust = currentCustomers.find(
            (c) => !isGenericWalkInName(c.name) && areNamesCompatible(c.name, sale.customerName)
          );
          const fixedCustomerId = matchingCust
            ? matchingCust.id
            : `cust-${nameSlug}-${sale.id.slice(-6)}`;
          const fixedSale = { ...sale, customerId: fixedCustomerId };
          repairedToSync.push(fixedSale);
          return fixedSale;
        }

        if (sale.customerId && !firstSeenNameForId) {
          customerIdNames.set(sale.customerId, sale.customerName);
        }
        return sale;
      });

      if (!needsRepair) return prevSales;

      salesRef.current = repairedSales;
      queueMicrotask(() => {
        repairedToSync.forEach((s) => syncSaleWithRetry(s));
      });
      return repairedSales;
    });
  }, [sales.length, customers]);

  // Load persistent data from server on startup and merge with local items (strictly respecting deletedIds)
  useEffect(() => {
    let isMounted = true;

    async function loadServerData() {
      try {
        const response = await fetch('/api/data');
        if (!response.ok) {
          throw new Error(`Server returned HTTP ${response.status}`);
        }
        const json = await response.json();
        if (json?.success && json.data && isMounted) {
          const serverDb = json.data;

          // Merge deletedIds tombstones first so deleted items NEVER resurrect
          const mergedDeleted = mergeDeletedMaps(deletedIdsRef.current, serverDb.deletedIds);
          deletedIdsRef.current = mergedDeleted;
          setDeletedIds(mergedDeleted);
          try {
            localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(mergedDeleted));
          } catch {}

          const deletedProdsSet = new Set(mergedDeleted.products);
          const deletedCustsSet = new Set(mergedDeleted.customers);
          const deletedSalesSet = new Set([...DEMO_SALE_IDS, ...mergedDeleted.sales]);
          const deletedServiceSet = new Set(mergedDeleted.serviceOrders);
          const deletedOnlineSet = new Set(mergedDeleted.onlineOrders);
          const deletedTechSet = new Set(mergedDeleted.technicians);
          const deletedCommSet = new Set(mergedDeleted.serviceCommissions);
          const deletedPayoutSet = new Set(mergedDeleted.technicianPayouts);
          const deletedSupplierSet = new Set(mergedDeleted.suppliers);
          const deletedPurchaseOrderSet = new Set(mergedDeleted.purchaseOrders);
          const deletedExpenseSet = new Set(mergedDeleted.expenses);
          const deletedTreasuryAccountSet = new Set(mergedDeleted.treasuryAccounts);
          const deletedTreasuryCommitmentSet = new Set(mergedDeleted.treasuryCommitments);
          const deletedTreasuryMovementSet = new Set(mergedDeleted.treasuryMovements);
          const deletedTreasuryDebtSet = new Set(mergedDeleted.treasuryDebts);
          const deletedOpenAccountSet = new Set(mergedDeleted.openAccounts);

          // Merge products (excluding demo & deleted products)
          if (Array.isArray(serverDb.products)) {
            const cleanServerProds: Product[] = serverDb.products.filter(
              (p: Product) => !DEMO_PRODUCT_IDS.has(p.id) && !deletedProdsSet.has(p.id)
            );

            setProducts((currentLocalProds) => {
              const serverIdSet = new Set(cleanServerProds.map((p: Product) => p.id));
              const serverSkuSet = new Set(cleanServerProds.map((p: Product) => (p.sku || '').trim().toLowerCase()));

              const localAdditions = currentLocalProds.filter(
                (p) =>
                  !DEMO_PRODUCT_IDS.has(p.id) &&
                  !deletedProdsSet.has(p.id) &&
                  !serverIdSet.has(p.id) &&
                  !serverSkuSet.has((p.sku || '').trim().toLowerCase())
              );

              const merged = [...cleanServerProds, ...localAdditions].map((p) => {
                let updatedImg = normalizeImageUrl(p.imageUrl);
                if (p.name.toLowerCase().includes('maleta') && (!updatedImg || updatedImg.includes('brake_kit'))) {
                  updatedImg = PRESET_PRODUCT_IMAGES.maletaParaMoto;
                }
                return { ...p, imageUrl: updatedImg || p.imageUrl || PRESET_PRODUCT_IMAGES.brakeKit };
              });

              localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(merged));
              return merged;
            });
          }

          // Merge customers (excluding demo & deleted customers)
          if (Array.isArray(serverDb.customers)) {
            const cleanServerCusts: Customer[] = serverDb.customers.filter(
              (c: Customer) =>
                !DEMO_CUSTOMER_IDS.has(c.id) &&
                !deletedCustsSet.has(c.id) &&
                !DEMO_CUSTOMER_NAMES.has((c.name || '').trim().toLowerCase())
            );

            setCustomers((currentLocalCusts) => {
              const serverIdSet = new Set(cleanServerCusts.map((c: Customer) => c.id));
              const serverPhoneSet = new Set(
                cleanServerCusts.map((c: Customer) => normalizePhoneKey(c.phone)).filter(Boolean)
              );

              const localAdditions = currentLocalCusts.filter((c) => {
                if (DEMO_CUSTOMER_IDS.has(c.id) || deletedCustsSet.has(c.id)) return false;
                if (DEMO_CUSTOMER_NAMES.has((c.name || '').trim().toLowerCase())) return false;
                if (serverIdSet.has(c.id)) return false;
                const normP = normalizePhoneKey(c.phone);
                if (normP && serverPhoneSet.has(normP)) return false;
                return true;
              });

              const merged = [...cleanServerCusts, ...localAdditions];
              localStorage.setItem(STORAGE_KEYS.CUSTOMERS, JSON.stringify(merged));
              return merged;
            });
          }

          // Settings (merge customCategories & customExpenseCategories from both server & local)
          if (serverDb.settings) {
            setSettings((prev) => {
              const mergedCustom = Array.from(
                new Set([
                  ...(Array.isArray(serverDb.settings.customCategories) ? serverDb.settings.customCategories : []),
                  ...(Array.isArray(prev.customCategories) ? prev.customCategories : []),
                ])
              );
              const mergedCustomModels = Array.from(
                new Set([
                  ...(Array.isArray(serverDb.settings.customModelCategories) ? serverDb.settings.customModelCategories : []),
                  ...(Array.isArray(prev.customModelCategories) ? prev.customModelCategories : []),
                ])
              );
              const mergedHiddenDefaultModels = Array.from(
                new Set([
                  ...(Array.isArray(serverDb.settings.hiddenDefaultModelCategories) ? serverDb.settings.hiddenDefaultModelCategories : []),
                  ...(Array.isArray(prev.hiddenDefaultModelCategories) ? prev.hiddenDefaultModelCategories : []),
                ])
              );
              const mergedCustomExpenses = Array.from(
                new Set([
                  ...(Array.isArray(serverDb.settings.customExpenseCategories) ? serverDb.settings.customExpenseCategories : []),
                  ...(Array.isArray(prev.customExpenseCategories) ? prev.customExpenseCategories : []),
                ])
              );
              const mergedCustomIncomes = Array.from(
                new Set([
                  ...(Array.isArray(serverDb.settings.customIncomeCategories) ? serverDb.settings.customIncomeCategories : []),
                  ...(Array.isArray(prev.customIncomeCategories) ? prev.customIncomeCategories : []),
                ])
              );
              const mergedCustomCommitments = Array.from(
                new Set([
                  ...(Array.isArray(serverDb.settings.customCommitmentCategories) ? serverDb.settings.customCommitmentCategories : []),
                  ...(Array.isArray(prev.customCommitmentCategories) ? prev.customCommitmentCategories : []),
                ])
              );
              const mergedCustomPosBanks = Array.from(
                new Set([
                  ...(Array.isArray(serverDb.settings.customExpensePosBanks) ? serverDb.settings.customExpensePosBanks : []),
                  ...(Array.isArray(prev.customExpensePosBanks) ? prev.customExpensePosBanks : []),
                ])
              );
              const baseNextSettings: BusinessSettings = {
                ...serverDb.settings,
                ...(mergedCustom.length > 0 ? { customCategories: mergedCustom } : {}),
                ...(mergedCustomModels.length > 0 ? { customModelCategories: mergedCustomModels } : {}),
                ...(mergedHiddenDefaultModels.length > 0 ? { hiddenDefaultModelCategories: mergedHiddenDefaultModels } : {}),
                ...(mergedCustomExpenses.length > 0 ? { customExpenseCategories: mergedCustomExpenses } : {}),
                ...(mergedCustomIncomes.length > 0 ? { customIncomeCategories: mergedCustomIncomes } : {}),
                ...(mergedCustomCommitments.length > 0 ? { customCommitmentCategories: mergedCustomCommitments } : {}),
                ...(mergedCustomPosBanks.length > 0 ? { customExpensePosBanks: mergedCustomPosBanks } : {}),
              };
              const { merged: nextSettings } = applyFreshBcvIfNewer(baseNextSettings, prev);
              settingsRef.current = nextSettings;
              try {
                localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(nextSettings));
              } catch {}
              return nextSettings;
            });
          }

          // Sales (excluding demo & deleted sales, preserving newest first)
          if (Array.isArray(serverDb.sales)) {
            const cleanServerSales: Sale[] = serverDb.sales.filter(
              (s: Sale) => !deletedSalesSet.has(s.id)
            );
            setSales((currentLocalSales) => {
              const serverById = new Map<string, Sale>(cleanServerSales.map((s: Sale) => [s.id, s]));
              const mergedList: Sale[] = [];
              const seenIds = new Set<string>();

              for (const localSale of currentLocalSales) {
                if (deletedSalesSet.has(localSale.id)) continue;
                seenIds.add(localSale.id);
                const serverSale = serverById.get(localSale.id);
                if (!serverSale) {
                  mergedList.push(localSale);
                } else if (pendingSyncSaleIdsRef.current.has(localSale.id)) {
                  mergedList.push(localSale);
                } else {
                  mergedList.push(serverSale);
                }
              }

              for (const serverSale of cleanServerSales) {
                if (!seenIds.has(serverSale.id) && !deletedSalesSet.has(serverSale.id)) {
                  mergedList.push(serverSale);
                }
              }

              mergedList.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
              salesRef.current = mergedList;
              localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(mergedList));
              return mergedList;
            });
          }

          // Service Orders (excluding demo & deleted orders)
          if (Array.isArray(serverDb.serviceOrders)) {
            const validServerOrders = serverDb.serviceOrders.filter(
              (o: ServiceOrder) => !DEMO_SERVICE_ORDER_IDS.has(o.id) && !deletedServiceSet.has(o.id)
            );
            setServiceOrders((currentOrders) => {
              const serverIdSet = new Set(validServerOrders.map((o: ServiceOrder) => o.id));
              const localAdditions = currentOrders.filter(
                (o) => !DEMO_SERVICE_ORDER_IDS.has(o.id) && !deletedServiceSet.has(o.id) && !serverIdSet.has(o.id)
              );
              const merged = [...validServerOrders, ...localAdditions];
              localStorage.setItem(STORAGE_KEYS.SERVICE_ORDERS, JSON.stringify(merged));
              return merged;
            });
          }

          // Online Orders (excluding demo & deleted orders)
          if (Array.isArray(serverDb.onlineOrders)) {
            const validServerOnline = serverDb.onlineOrders.filter(
              (o: OnlineOrder) => !DEMO_ONLINE_ORDER_IDS.has(o.id) && !deletedOnlineSet.has(o.id)
            );
            setOnlineOrders((currentOrders) => {
              const serverIdSet = new Set(validServerOnline.map((o: OnlineOrder) => o.id));
              const localAdditions = currentOrders.filter(
                (o) => !DEMO_ONLINE_ORDER_IDS.has(o.id) && !deletedOnlineSet.has(o.id) && !serverIdSet.has(o.id)
              );
              const merged = [...validServerOnline, ...localAdditions];
              localStorage.setItem(STORAGE_KEYS.ONLINE_ORDERS, JSON.stringify(merged));
              return merged;
            });
          }

          // Technicians (excluding deleted)
          if (Array.isArray(serverDb.technicians)) {
            const validServerTechs = serverDb.technicians.filter(
              (t: Technician) => !deletedTechSet.has(t.id)
            );
            setTechnicians((current) => {
              const serverIdSet = new Set(validServerTechs.map((t: Technician) => t.id));
              const localAdditions = current.filter((t) => !deletedTechSet.has(t.id) && !serverIdSet.has(t.id));
              const merged = [...validServerTechs, ...localAdditions];
              localStorage.setItem(STORAGE_KEYS.TECHNICIANS, JSON.stringify(merged));
              return merged;
            });
          }

          // Service Commissions (excluding deleted)
          if (Array.isArray(serverDb.serviceCommissions)) {
            const validServerComms = serverDb.serviceCommissions.filter(
              (c: ServiceCommission) => !deletedCommSet.has(c.id)
            );
            setServiceCommissions((current) => {
              const serverIdSet = new Set(validServerComms.map((c: ServiceCommission) => c.id));
              const localAdditions = current.filter((c) => !deletedCommSet.has(c.id) && !serverIdSet.has(c.id));
              const merged = [...validServerComms, ...localAdditions].sort((a, b) =>
                (b.createdAt || '').localeCompare(a.createdAt || '')
              );
              localStorage.setItem(STORAGE_KEYS.SERVICE_COMMISSIONS, JSON.stringify(merged));
              return merged;
            });
          }

          // Technician Payouts (excluding deleted)
          if (Array.isArray(serverDb.technicianPayouts)) {
            const validServerPayouts = serverDb.technicianPayouts.filter(
              (p: TechnicianPayout) => !deletedPayoutSet.has(p.id)
            );
            setTechnicianPayouts((current) => {
              const serverIdSet = new Set(validServerPayouts.map((p: TechnicianPayout) => p.id));
              const localAdditions = current.filter((p) => !deletedPayoutSet.has(p.id) && !serverIdSet.has(p.id));
              const merged = [...validServerPayouts, ...localAdditions].sort((a, b) =>
                (b.createdAt || '').localeCompare(a.createdAt || '')
              );
              localStorage.setItem(STORAGE_KEYS.TECH_PAYOUTS, JSON.stringify(merged));
              return merged;
            });
          }

          // Suppliers (excluding deleted)
          if (Array.isArray(serverDb.suppliers)) {
            const validServerSuppliers = serverDb.suppliers.filter(
              (s: Supplier) => !deletedSupplierSet.has(s.id)
            );
            setSuppliers((current) => {
              const serverIdSet = new Set(validServerSuppliers.map((s: Supplier) => s.id));
              const localAdditions = current.filter((s) => !deletedSupplierSet.has(s.id) && !serverIdSet.has(s.id));
              const merged = [...validServerSuppliers, ...localAdditions].sort((a, b) =>
                (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
              );
              suppliersRef.current = merged;
              localStorage.setItem(STORAGE_KEYS.SUPPLIERS, JSON.stringify(merged));
              return merged;
            });
          }

          // Purchase Orders (excluding deleted)
          if (Array.isArray(serverDb.purchaseOrders)) {
            const validServerPurchaseOrders = serverDb.purchaseOrders.filter(
              (po: PurchaseOrder) => !deletedPurchaseOrderSet.has(po.id)
            );
            setPurchaseOrders((current) => {
              const serverById = new Map<string, PurchaseOrder>(
                validServerPurchaseOrders.map((po: PurchaseOrder) => [po.id, po])
              );
              const mergedList: PurchaseOrder[] = [];
              const seenIds = new Set<string>();
              for (const localPo of current) {
                if (deletedPurchaseOrderSet.has(localPo.id)) continue;
                seenIds.add(localPo.id);
                const serverPo = serverById.get(localPo.id);
                if (!serverPo || pendingSyncPurchaseOrderIdsRef.current.has(localPo.id)) {
                  mergedList.push(localPo);
                } else {
                  mergedList.push(serverPo);
                }
              }
              for (const serverPo of validServerPurchaseOrders) {
                if (!seenIds.has(serverPo.id) && !deletedPurchaseOrderSet.has(serverPo.id)) {
                  mergedList.push(serverPo);
                }
              }
              mergedList.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
              purchaseOrdersRef.current = mergedList;
              localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(mergedList));
              return mergedList;
            });
          }

          // Business Expenses (excluding deleted)
          if (Array.isArray(serverDb.expenses)) {
            const validServerExpenses = serverDb.expenses.filter(
              (ex: BusinessExpense) => !deletedExpenseSet.has(ex.id)
            );
            setExpenses((current) => {
              const serverById = new Map<string, BusinessExpense>(
                validServerExpenses.map((ex: BusinessExpense) => [ex.id, ex])
              );
              const mergedList: BusinessExpense[] = [];
              const seenIds = new Set<string>();
              for (const localEx of current) {
                if (deletedExpenseSet.has(localEx.id)) continue;
                seenIds.add(localEx.id);
                const serverEx = serverById.get(localEx.id);
                if (!serverEx || pendingSyncExpenseIdsRef.current.has(localEx.id)) {
                  mergedList.push(localEx);
                } else {
                  mergedList.push(serverEx);
                }
              }
              for (const serverEx of validServerExpenses) {
                if (!seenIds.has(serverEx.id) && !deletedExpenseSet.has(serverEx.id)) {
                  mergedList.push(serverEx);
                }
              }
              mergedList.sort((a, b) => (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') || (b.createdAt || '').localeCompare(a.createdAt || ''));
              expensesRef.current = mergedList;
              localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(mergedList));
              return mergedList;
            });
          }

          // Treasury Accounts (excluding deleted)
          if (Array.isArray(serverDb.treasuryAccounts)) {
            const validServerAccounts = serverDb.treasuryAccounts.filter(
              (acc: TreasuryAccount) => !deletedTreasuryAccountSet.has(acc.id)
            );
            setTreasuryAccounts((current) => {
              const serverById = new Map<string, TreasuryAccount>(
                validServerAccounts.map((acc: TreasuryAccount) => [acc.id, acc])
              );
              const mergedList: TreasuryAccount[] = [];
              const seenIds = new Set<string>();
              for (const localAcc of current) {
                if (deletedTreasuryAccountSet.has(localAcc.id)) continue;
                seenIds.add(localAcc.id);
                const serverAcc = serverById.get(localAcc.id);
                if (!serverAcc || pendingSyncTreasuryAccountIdsRef.current.has(localAcc.id)) {
                  mergedList.push(localAcc);
                } else {
                  mergedList.push(serverAcc);
                }
              }
              for (const serverAcc of validServerAccounts) {
                if (!seenIds.has(serverAcc.id) && !deletedTreasuryAccountSet.has(serverAcc.id)) {
                  mergedList.push(serverAcc);
                }
              }
              treasuryAccountsRef.current = mergedList;
              localStorage.setItem(STORAGE_KEYS.TREASURY_ACCOUNTS, JSON.stringify(mergedList));
              return mergedList;
            });
          }

          // Treasury Commitments (excluding deleted)
          if (Array.isArray(serverDb.treasuryCommitments)) {
            const validServerCommitments = serverDb.treasuryCommitments.filter(
              (cm: TreasuryCommitment) => !deletedTreasuryCommitmentSet.has(cm.id)
            );
            setTreasuryCommitments((current) => {
              const serverById = new Map<string, TreasuryCommitment>(
                validServerCommitments.map((cm: TreasuryCommitment) => [cm.id, cm])
              );
              const mergedList: TreasuryCommitment[] = [];
              const seenIds = new Set<string>();
              for (const localCm of current) {
                if (deletedTreasuryCommitmentSet.has(localCm.id)) continue;
                seenIds.add(localCm.id);
                const serverCm = serverById.get(localCm.id);
                if (!serverCm || pendingSyncTreasuryCommitmentIdsRef.current.has(localCm.id)) {
                  mergedList.push(localCm);
                } else {
                  mergedList.push(serverCm);
                }
              }
              for (const serverCm of validServerCommitments) {
                if (!seenIds.has(serverCm.id) && !deletedTreasuryCommitmentSet.has(serverCm.id)) {
                  mergedList.push(serverCm);
                }
              }
              mergedList.sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
              treasuryCommitmentsRef.current = mergedList;
              localStorage.setItem(STORAGE_KEYS.TREASURY_COMMITMENTS, JSON.stringify(mergedList));
              return mergedList;
            });
          }

          // Treasury Movements (excluding deleted)
          if (Array.isArray(serverDb.treasuryMovements)) {
            const validServerMovements = serverDb.treasuryMovements.filter(
              (mv: TreasuryMovement) => !deletedTreasuryMovementSet.has(mv.id)
            );
            setTreasuryMovements((current) => {
              const serverById = new Map<string, TreasuryMovement>(
                validServerMovements.map((mv: TreasuryMovement) => [mv.id, mv])
              );
              const mergedList: TreasuryMovement[] = [];
              const seenIds = new Set<string>();
              for (const localMv of current) {
                if (deletedTreasuryMovementSet.has(localMv.id)) continue;
                seenIds.add(localMv.id);
                const serverMv = serverById.get(localMv.id);
                if (!serverMv || pendingSyncTreasuryMovementIdsRef.current.has(localMv.id)) {
                  mergedList.push(localMv);
                } else {
                  mergedList.push(serverMv);
                }
              }
              for (const serverMv of validServerMovements) {
                if (!seenIds.has(serverMv.id) && !deletedTreasuryMovementSet.has(serverMv.id)) {
                  mergedList.push(serverMv);
                }
              }
              mergedList.sort(
                (a, b) =>
                  (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
                  (b.createdAt || '').localeCompare(a.createdAt || '')
              );
              treasuryMovementsRef.current = mergedList;
              localStorage.setItem(STORAGE_KEYS.TREASURY_MOVEMENTS, JSON.stringify(mergedList));
              return mergedList;
            });
          }

          // Treasury Debts (excluding deleted)
          if (Array.isArray(serverDb.treasuryDebts)) {
            const validServerDebts = serverDb.treasuryDebts.filter(
              (d: TreasuryDebt) => !deletedTreasuryDebtSet.has(d.id)
            );
            setTreasuryDebts((current) => {
              const serverById = new Map<string, TreasuryDebt>(
                validServerDebts.map((d: TreasuryDebt) => [d.id, d])
              );
              const mergedList: TreasuryDebt[] = [];
              const seenIds = new Set<string>();
              for (const localDebt of current) {
                if (deletedTreasuryDebtSet.has(localDebt.id)) continue;
                seenIds.add(localDebt.id);
                const serverDebt = serverById.get(localDebt.id);
                if (!serverDebt || pendingSyncTreasuryDebtIdsRef.current.has(localDebt.id)) {
                  mergedList.push(localDebt);
                } else {
                  mergedList.push(serverDebt);
                }
              }
              for (const serverDebt of validServerDebts) {
                if (!seenIds.has(serverDebt.id) && !deletedTreasuryDebtSet.has(serverDebt.id)) {
                  mergedList.push(serverDebt);
                }
              }
              mergedList.sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
              treasuryDebtsRef.current = mergedList;
              localStorage.setItem(STORAGE_KEYS.TREASURY_DEBTS, JSON.stringify(mergedList));
              return mergedList;
            });
          }

          // POS Open Accounts (excluding deleted)
          if (Array.isArray(serverDb.openAccounts)) {
            const validServerAccounts = serverDb.openAccounts.filter(
              (a: OpenAccount) => !deletedOpenAccountSet.has(a.id)
            );
            setOpenAccounts((current) => {
              const serverById = new Map<string, OpenAccount>(
                validServerAccounts.map((a: OpenAccount) => [a.id, a])
              );
              const mergedList: OpenAccount[] = [];
              const seenIds = new Set<string>();
              for (const localAcc of current) {
                if (deletedOpenAccountSet.has(localAcc.id)) continue;
                seenIds.add(localAcc.id);
                const serverAcc = serverById.get(localAcc.id);
                if (!serverAcc || pendingSyncOpenAccountIdsRef.current.has(localAcc.id)) {
                  mergedList.push(localAcc);
                } else {
                  mergedList.push(serverAcc);
                }
              }
              for (const serverAcc of validServerAccounts) {
                if (!seenIds.has(serverAcc.id) && !deletedOpenAccountSet.has(serverAcc.id)) {
                  mergedList.push(serverAcc);
                }
              }
              mergedList.sort((a, b) => (b.updatedAt || b.openedAt || '').localeCompare(a.updatedAt || a.openedAt || ''));
              openAccountsRef.current = mergedList;
              localStorage.setItem(STORAGE_KEYS.OPEN_ACCOUNTS, JSON.stringify(mergedList));
              return mergedList;
            });
          }
        }
      } catch (err) {
        console.warn('Servidor de datos no respondió, usando datos locales:', err);
      } finally {
        if (isMounted) {
          isInitialLoaded.current = true;
          // Flush merged state back to /api/data if Firestore hydrated ahead of /api/data
          queueMicrotask(() => {
            fetch('/api/data', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                settings: settingsRef.current,
                products: productsRef.current,
                customers: customersRef.current,
                sales: salesRef.current,
                serviceOrders: serviceOrdersRef.current,
                onlineOrders: onlineOrdersRef.current,
                technicians: techniciansRef.current,
                serviceCommissions: serviceCommissionsRef.current,
                technicianPayouts: technicianPayoutsRef.current,
                suppliers: suppliersRef.current,
                purchaseOrders: purchaseOrdersRef.current,
                expenses: expensesRef.current,
                treasuryAccounts: treasuryAccountsRef.current,
                treasuryCommitments: treasuryCommitmentsRef.current,
                treasuryMovements: treasuryMovementsRef.current,
                treasuryDebts: treasuryDebtsRef.current,
                openAccounts: openAccountsRef.current,
                deletedIds: deletedIdsRef.current,
              }),
            }).catch(() => {});
          });
        }
      }
    }

    loadServerData();

    return () => {
      isMounted = false;
    };
  }, []);

  // Firebase Real-Time Firestore Synchronization
  const [isFirebaseConnected, setIsFirebaseConnected] = useState<boolean>(true);
  const [firebaseSyncStatus, setFirebaseSyncStatus] = useState<'synced' | 'syncing' | 'error' | 'idle'>('synced');
  const firestoreSyncedFlags = useRef({
    products: false,
    customers: false,
    sales: false,
    serviceOrders: false,
    onlineOrders: false,
    technicians: false,
    serviceCommissions: false,
    technicianPayouts: false,
    suppliers: false,
    purchaseOrders: false,
    expenses: false,
    treasuryAccounts: false,
    treasuryCommitments: false,
    treasuryMovements: false,
    treasuryDebts: false,
    openAccounts: false,
  });
  const seenFirestoreIdsRef = useRef<{
    products: Set<string>;
    customers: Set<string>;
    sales: Set<string>;
    serviceOrders: Set<string>;
    onlineOrders: Set<string>;
    technicians: Set<string>;
    serviceCommissions: Set<string>;
    technicianPayouts: Set<string>;
    suppliers: Set<string>;
    purchaseOrders: Set<string>;
    expenses: Set<string>;
    treasuryAccounts: Set<string>;
    treasuryCommitments: Set<string>;
    treasuryMovements: Set<string>;
    treasuryDebts: Set<string>;
    openAccounts: Set<string>;
  }>({
    products: new Set(),
    customers: new Set(),
    sales: new Set(),
    serviceOrders: new Set(),
    onlineOrders: new Set(),
    technicians: new Set(),
    serviceCommissions: new Set(),
    technicianPayouts: new Set(),
    suppliers: new Set(),
    purchaseOrders: new Set(),
    expenses: new Set(),
    treasuryAccounts: new Set(),
    treasuryCommitments: new Set(),
    treasuryMovements: new Set(),
    treasuryDebts: new Set(),
    openAccounts: new Set(),
  });

  useEffect(() => {
    let unsubs: Array<() => void> = [];
    let isCancelled = false;

    const applyTombstonesToState = (merged: DeletedIdsMap) => {
      const delSales = new Set([...DEMO_SALE_IDS, ...merged.sales]);
      const delProds = new Set(merged.products);
      const delCusts = new Set(merged.customers);
      const delServ = new Set(merged.serviceOrders);
      const delOnl = new Set(merged.onlineOrders);
      const delTechs = new Set(merged.technicians);
      const delComms = new Set(merged.serviceCommissions);
      const delPayouts = new Set(merged.technicianPayouts);
      const delSuppliers = new Set(merged.suppliers);
      const delPurchaseOrders = new Set(merged.purchaseOrders);
      const delExpenses = new Set(merged.expenses);
      const delTreasuryAccounts = new Set(merged.treasuryAccounts);
      const delTreasuryCommitments = new Set(merged.treasuryCommitments);
      const delTreasuryMovements = new Set(merged.treasuryMovements);
      const delTreasuryDebts = new Set(merged.treasuryDebts);
      const delOpenAccounts = new Set(merged.openAccounts);

      setSales((prev) => prev.filter((s) => !delSales.has(s.id)));
      setProducts((prev) => prev.filter((p) => !delProds.has(p.id)));
      setCustomers((prev) => prev.filter((c) => !delCusts.has(c.id)));
      setServiceOrders((prev) => prev.filter((o) => !delServ.has(o.id)));
      setOnlineOrders((prev) => prev.filter((o) => !delOnl.has(o.id)));
      setTechnicians((prev) => prev.filter((t) => !delTechs.has(t.id)));
      setServiceCommissions((prev) => prev.filter((c) => !delComms.has(c.id)));
      setTechnicianPayouts((prev) => prev.filter((p) => !delPayouts.has(p.id)));
      setSuppliers((prev) => prev.filter((s) => !delSuppliers.has(s.id)));
      setPurchaseOrders((prev) => prev.filter((po) => !delPurchaseOrders.has(po.id)));
      setExpenses((prev) => prev.filter((ex) => !delExpenses.has(ex.id)));
      setTreasuryAccounts((prev) => prev.filter((acc) => !delTreasuryAccounts.has(acc.id)));
      setTreasuryCommitments((prev) => prev.filter((cm) => !delTreasuryCommitments.has(cm.id)));
      setTreasuryMovements((prev) => prev.filter((mv) => !delTreasuryMovements.has(mv.id)));
      setTreasuryDebts((prev) => prev.filter((d) => !delTreasuryDebts.has(d.id)));
      setOpenAccounts((prev) => prev.filter((a) => !delOpenAccounts.has(a.id)));
    };

    async function initFirestore() {
      try {
        const connected = await testFirestoreConnection();
        if (isCancelled) return;
        setIsFirebaseConnected(connected);

        // 0A. Fetch deletedIds registry FIRST before starting collection listeners so tombstones are fresh
        const initialDeleted = await fetchDeletedIdsFromFirestore();
        if (isCancelled) return;
        if (initialDeleted) {
          const mergedInit = mergeDeletedMaps(deletedIdsRef.current, initialDeleted);
          deletedIdsRef.current = mergedInit;
          setDeletedIds(mergedInit);
          try {
            localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(mergedInit));
          } catch {}
          applyTombstonesToState(mergedInit);
        }

        // 0B. Real-time tombstones listener (ensures deletions persist across devices/sessions)
        const unsubDeleted = subscribeToDeletedIds((remoteDeleted) => {
          const merged = mergeDeletedMaps(deletedIdsRef.current, remoteDeleted);
          deletedIdsRef.current = merged;
          setDeletedIds(merged);
          try {
            localStorage.setItem(STORAGE_KEYS.DELETED_IDS, JSON.stringify(merged));
          } catch {}
          applyTombstonesToState(merged);
        });

        // 1. Real-time products listener (NON-DESTRUCTIVE merge: preserves & uploads unsynced local items)
        const unsubProducts = subscribeToProducts((firestoreProducts, meta) => {
          if (!Array.isArray(firestoreProducts)) return;
          const delSet = new Set(deletedIdsRef.current.products);
          firestoreProducts.forEach((p) => {
            if (delSet.has(p.id) || DEMO_PRODUCT_IDS.has(p.id)) {
              removeProductFromFirestore(p.id).catch(() => {});
            }
          });
          const cleanProds = firestoreProducts
            .filter((p) => !DEMO_PRODUCT_IDS.has(p.id) && !delSet.has(p.id))
            .map((p) => {
              let updatedImg = normalizeImageUrl(p.imageUrl);
              if (p.name?.toLowerCase().includes('maleta') && (!updatedImg || updatedImg.includes('brake_kit'))) {
                updatedImg = PRESET_PRODUCT_IMAGES.maletaParaMoto;
              }
              return { ...p, imageUrl: updatedImg || p.imageUrl || PRESET_PRODUCT_IMAGES.brakeKit };
            });

          const remoteIdSet = new Set(cleanProds.map((p) => p.id));
          const prevSeen = seenFirestoreIdsRef.current.products;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          setProducts((prev) => {
            const unsyncedLocal = prev.filter(
              (p) =>
                !DEMO_PRODUCT_IDS.has(p.id) &&
                !delSet.has(p.id) &&
                !remoteIdSet.has(p.id) &&
                (!isServerConfirmed || !prevSeen.has(p.id))
            );
            if (unsyncedLocal.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                unsyncedLocal.forEach((p) => syncProductToFirestore(p).catch(() => {}));
              });
            }
            const merged = [...cleanProds, ...unsyncedLocal];
            if (merged.length > 0 || firestoreSyncedFlags.current.products) {
              productsRef.current = merged;
              return merged;
            }
            return prev;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.products = remoteIdSet;
            firestoreSyncedFlags.current.products = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 2. Real-time settings and BCV rate listener
        const unsubSettings = subscribeToSettings((firestoreSettings) => {
          if (firestoreSettings && firestoreSettings.commercialName) {
            setSettings((prev) => {
              const remoteCustom = Array.isArray(firestoreSettings.customCategories)
                ? firestoreSettings.customCategories
                : [];
              const localCustom = Array.isArray(prev.customCategories)
                ? prev.customCategories
                : [];
              const mergedCustom = Array.from(new Set([...remoteCustom, ...localCustom]));
              const remoteCustomModels = Array.isArray(firestoreSettings.customModelCategories)
                ? firestoreSettings.customModelCategories
                : [];
              const localCustomModels = Array.isArray(prev.customModelCategories)
                ? prev.customModelCategories
                : [];
              const mergedCustomModels = Array.from(
                new Set([...remoteCustomModels, ...localCustomModels])
              );
              const remoteHiddenModels = Array.isArray(firestoreSettings.hiddenDefaultModelCategories)
                ? firestoreSettings.hiddenDefaultModelCategories
                : [];
              const localHiddenModels = Array.isArray(prev.hiddenDefaultModelCategories)
                ? prev.hiddenDefaultModelCategories
                : [];
              const mergedHiddenModels = Array.from(
                new Set([...remoteHiddenModels, ...localHiddenModels])
              );
              const remoteCustomExpenses = Array.isArray(firestoreSettings.customExpenseCategories)
                ? firestoreSettings.customExpenseCategories
                : [];
              const localCustomExpenses = Array.isArray(prev.customExpenseCategories)
                ? prev.customExpenseCategories
                : [];
              const mergedCustomExpenses = Array.from(
                new Set([...remoteCustomExpenses, ...localCustomExpenses])
              );
              const remoteCustomIncomes = Array.isArray(firestoreSettings.customIncomeCategories)
                ? firestoreSettings.customIncomeCategories
                : [];
              const localCustomIncomes = Array.isArray(prev.customIncomeCategories)
                ? prev.customIncomeCategories
                : [];
              const mergedCustomIncomes = Array.from(
                new Set([...remoteCustomIncomes, ...localCustomIncomes])
              );
              const remoteCustomCommitments = Array.isArray(firestoreSettings.customCommitmentCategories)
                ? firestoreSettings.customCommitmentCategories
                : [];
              const localCustomCommitments = Array.isArray(prev.customCommitmentCategories)
                ? prev.customCommitmentCategories
                : [];
              const mergedCustomCommitments = Array.from(
                new Set([...remoteCustomCommitments, ...localCustomCommitments])
              );
              const remoteCustomPosBanks = Array.isArray(firestoreSettings.customExpensePosBanks)
                ? firestoreSettings.customExpensePosBanks
                : [];
              const localCustomPosBanks = Array.isArray(prev.customExpensePosBanks)
                ? prev.customExpensePosBanks
                : [];
              const mergedCustomPosBanks = Array.from(
                new Set([...remoteCustomPosBanks, ...localCustomPosBanks])
              );
              const baseNextSettings: BusinessSettings = {
                ...firestoreSettings,
                ...(mergedCustom.length > 0 ? { customCategories: mergedCustom } : {}),
                ...(mergedCustomModels.length > 0
                  ? { customModelCategories: mergedCustomModels }
                  : {}),
                ...(mergedHiddenModels.length > 0
                  ? { hiddenDefaultModelCategories: mergedHiddenModels }
                  : {}),
                ...(mergedCustomExpenses.length > 0
                  ? { customExpenseCategories: mergedCustomExpenses }
                  : {}),
                ...(mergedCustomIncomes.length > 0
                  ? { customIncomeCategories: mergedCustomIncomes }
                  : {}),
                ...(mergedCustomCommitments.length > 0
                  ? { customCommitmentCategories: mergedCustomCommitments }
                  : {}),
                ...(mergedCustomPosBanks.length > 0
                  ? { customExpensePosBanks: mergedCustomPosBanks }
                  : {}),
              };
              const { merged: nextSettings, shouldPushLiveToCloud } = applyFreshBcvIfNewer(
                baseNextSettings,
                prev
              );
              settingsRef.current = nextSettings;
              try {
                localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(nextSettings));
              } catch {}
              if (shouldPushLiveToCloud) {
                queueMicrotask(() => {
                  syncSettingsToFirestore(nextSettings).catch(() => {});
                });
              }
              return nextSettings;
            });
            setFirebaseSyncStatus('synced');
          }
        });

        // 3. Real-time customers listener (NON-DESTRUCTIVE merge: preserves & uploads unsynced local customers)
        const unsubCustomers = subscribeToCustomers((firestoreCustomers, meta) => {
          if (!Array.isArray(firestoreCustomers)) return;
          const delSet = new Set(deletedIdsRef.current.customers);
          firestoreCustomers.forEach((c) => {
            if (delSet.has(c.id) || DEMO_CUSTOMER_IDS.has(c.id)) {
              removeCustomerFromFirestore(c.id).catch(() => {});
            }
          });
          const cleanCusts = firestoreCustomers.filter(
            (c) =>
              !DEMO_CUSTOMER_IDS.has(c.id) &&
              !delSet.has(c.id) &&
              !DEMO_CUSTOMER_NAMES.has((c.name || '').trim().toLowerCase())
          );

          const remoteIdSet = new Set(cleanCusts.map((c) => c.id));
          const prevSeen = seenFirestoreIdsRef.current.customers;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          setCustomers((prev) => {
            const unsyncedLocal = prev.filter(
              (c) =>
                !DEMO_CUSTOMER_IDS.has(c.id) &&
                !delSet.has(c.id) &&
                !DEMO_CUSTOMER_NAMES.has((c.name || '').trim().toLowerCase()) &&
                !remoteIdSet.has(c.id) &&
                (!isServerConfirmed || !prevSeen.has(c.id))
            );
            if (unsyncedLocal.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                unsyncedLocal.forEach((c) => syncCustomerToFirestore(c).catch(() => {}));
              });
            }
            const merged = [...cleanCusts, ...unsyncedLocal].sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            customersRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.customers = remoteIdSet;
            firestoreSyncedFlags.current.customers = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 4. Real-time sales listener (NEVER drops local or pending-sync sales on optimistic/cached snapshots)
        const unsubSales = subscribeToSales((firestoreSales, meta) => {
          if (!Array.isArray(firestoreSales)) return;
          const delSet = new Set([...DEMO_SALE_IDS, ...deletedIdsRef.current.sales]);
          firestoreSales.forEach((s) => {
            if (delSet.has(s.id)) {
              removeSaleFromFirestore(s.id).catch(() => {});
            }
          });
          const cleanRemoteSales = firestoreSales.filter((s) => !delSet.has(s.id));
          const remoteById = new Map<string, Sale>(cleanRemoteSales.map((s) => [s.id, s]));
          const remoteIdSet = new Set(cleanRemoteSales.map((s) => s.id));
          const prevSeen = seenFirestoreIdsRef.current.sales;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          if (isServerConfirmed) {
            // Any pending-sync sale now present on confirmed server can be marked synced
            remoteIdSet.forEach((id) => {
              if (pendingSyncSaleIdsRef.current.has(id)) {
                clearSalePendingSync(id);
              }
            });
          }

          setSales((prev) => {
            const toUpload: Sale[] = [];
            const mergedMap = new Map<string, Sale>();

            // Start with confirmed/remote sales
            for (const remoteSale of cleanRemoteSales) {
              mergedMap.set(remoteSale.id, remoteSale);
            }

            // Merge local sales safely
            for (const localSale of prev) {
              if (delSet.has(localSale.id)) continue;

              const isPendingLocal = pendingSyncSaleIdsRef.current.has(localSale.id);
              const inRemote = remoteById.has(localSale.id);

              if (!inRemote) {
                // Keep if pending local sync, if snapshot is cached/optimistic, OR if never confirmed-seen on server before
                if (isPendingLocal || !isServerConfirmed || !prevSeen.has(localSale.id)) {
                  mergedMap.set(localSale.id, localSale);
                  toUpload.push(localSale);
                }
              } else if (isPendingLocal) {
                // Preserve local unconfirmed edits/payments until Firestore confirms upload
                mergedMap.set(localSale.id, localSale);
                toUpload.push(localSale);
              }
            }

            const mergedSorted = Array.from(mergedMap.values()).sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || '')
            );

            if (toUpload.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                toUpload.forEach((s) => syncSaleWithRetry(s));
              });
            }

            salesRef.current = mergedSorted;
            return mergedSorted;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.sales = remoteIdSet;
            firestoreSyncedFlags.current.sales = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 5. Real-time service orders listener (NON-DESTRUCTIVE merge)
        const unsubServiceOrders = subscribeToServiceOrders((firestoreOrders, meta) => {
          if (!Array.isArray(firestoreOrders)) return;
          const delSet = new Set(deletedIdsRef.current.serviceOrders);
          firestoreOrders.forEach((o) => {
            if (delSet.has(o.id) || DEMO_SERVICE_ORDER_IDS.has(o.id)) {
              removeServiceOrderFromFirestore(o.id).catch(() => {});
            }
          });
          const cleanOrders = firestoreOrders.filter(
            (o) => !DEMO_SERVICE_ORDER_IDS.has(o.id) && !delSet.has(o.id)
          );

          const remoteIdSet = new Set(cleanOrders.map((o) => o.id));
          const prevSeen = seenFirestoreIdsRef.current.serviceOrders;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          setServiceOrders((prev) => {
            const unsyncedLocal = prev.filter(
              (o) =>
                !DEMO_SERVICE_ORDER_IDS.has(o.id) &&
                !delSet.has(o.id) &&
                !remoteIdSet.has(o.id) &&
                (!isServerConfirmed || !prevSeen.has(o.id))
            );
            if (unsyncedLocal.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                unsyncedLocal.forEach((o) => syncServiceOrderToFirestore(o).catch(() => {}));
              });
            }
            const merged = [...cleanOrders, ...unsyncedLocal].sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            serviceOrdersRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.serviceOrders = remoteIdSet;
            firestoreSyncedFlags.current.serviceOrders = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 6. Real-time online orders listener (NON-DESTRUCTIVE merge)
        const unsubOnlineOrders = subscribeToOnlineOrders((firestoreOrders, meta) => {
          if (!Array.isArray(firestoreOrders)) return;
          const delSet = new Set(deletedIdsRef.current.onlineOrders);
          firestoreOrders.forEach((o) => {
            if (delSet.has(o.id) || DEMO_ONLINE_ORDER_IDS.has(o.id)) {
              removeOnlineOrderFromFirestore(o.id).catch(() => {});
            }
          });
          const cleanOrders = firestoreOrders.filter(
            (o) => !DEMO_ONLINE_ORDER_IDS.has(o.id) && !delSet.has(o.id)
          );

          const remoteIdSet = new Set(cleanOrders.map((o) => o.id));
          const prevSeen = seenFirestoreIdsRef.current.onlineOrders;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          setOnlineOrders((prev) => {
            const unsyncedLocal = prev.filter(
              (o) =>
                !DEMO_ONLINE_ORDER_IDS.has(o.id) &&
                !delSet.has(o.id) &&
                !remoteIdSet.has(o.id) &&
                (!isServerConfirmed || !prevSeen.has(o.id))
            );
            if (unsyncedLocal.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                unsyncedLocal.forEach((o) => syncOnlineOrderToFirestore(o).catch(() => {}));
              });
            }
            const merged = [...cleanOrders, ...unsyncedLocal].sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            onlineOrdersRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.onlineOrders = remoteIdSet;
            firestoreSyncedFlags.current.onlineOrders = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 7. Real-time technicians listener
        const unsubTechnicians = subscribeToTechnicians((firestoreTechs, meta) => {
          if (!Array.isArray(firestoreTechs)) return;
          const delSet = new Set(deletedIdsRef.current.technicians);
          firestoreTechs.forEach((t) => {
            if (delSet.has(t.id)) {
              removeTechnicianFromFirestore(t.id).catch(() => {});
            }
          });
          const cleanTechs = firestoreTechs.filter((t) => !delSet.has(t.id));
          const remoteIdSet = new Set(cleanTechs.map((t) => t.id));
          const prevSeen = seenFirestoreIdsRef.current.technicians;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          setTechnicians((prev) => {
            const unsyncedLocal = prev.filter(
              (t) =>
                !delSet.has(t.id) &&
                !remoteIdSet.has(t.id) &&
                (!isServerConfirmed || !prevSeen.has(t.id))
            );
            if (unsyncedLocal.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                unsyncedLocal.forEach((t) => syncTechnicianToFirestore(t).catch(() => {}));
              });
            }
            const merged = [...cleanTechs, ...unsyncedLocal].sort((a, b) =>
              (a.name || '').localeCompare(b.name || '')
            );
            techniciansRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.technicians = remoteIdSet;
            firestoreSyncedFlags.current.technicians = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 8. Real-time service commissions listener
        const unsubCommissions = subscribeToServiceCommissions((firestoreComms, meta) => {
          if (!Array.isArray(firestoreComms)) return;
          const delSet = new Set(deletedIdsRef.current.serviceCommissions);
          firestoreComms.forEach((c) => {
            if (delSet.has(c.id)) {
              removeServiceCommissionFromFirestore(c.id).catch(() => {});
            }
          });
          const cleanComms = firestoreComms.filter((c) => !delSet.has(c.id));
          const remoteById = new Map(cleanComms.map((c) => [c.id, c]));
          const remoteIdSet = new Set(cleanComms.map((c) => c.id));
          const prevSeen = seenFirestoreIdsRef.current.serviceCommissions;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          if (isServerConfirmed) {
            remoteIdSet.forEach((id) => pendingSyncCommissionIdsRef.current.delete(id));
          }

          setServiceCommissions((prev) => {
            const toUpload: ServiceCommission[] = [];
            const mergedMap = new Map<string, ServiceCommission>();

            for (const rc of cleanComms) {
              mergedMap.set(rc.id, rc);
            }

            for (const lc of prev) {
              if (delSet.has(lc.id)) continue;
              const rc = remoteById.get(lc.id);
              const isPendingLocal = pendingSyncCommissionIdsRef.current.has(lc.id);
              const isNewerLocal =
                rc && lc.updatedAt && (!rc.updatedAt || lc.updatedAt > rc.updatedAt);

              if (!rc) {
                if (isPendingLocal || !isServerConfirmed || !prevSeen.has(lc.id)) {
                  mergedMap.set(lc.id, lc);
                  toUpload.push(lc);
                }
              } else if (isPendingLocal || isNewerLocal) {
                mergedMap.set(lc.id, lc);
                toUpload.push(lc);
              }
            }

            if (toUpload.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                toUpload.forEach((c) => {
                  pendingSyncCommissionIdsRef.current.add(c.id);
                  syncServiceCommissionToFirestore(c)
                    .then(() => pendingSyncCommissionIdsRef.current.delete(c.id))
                    .catch(() => {});
                });
              });
            }

            const merged = Array.from(mergedMap.values()).sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            serviceCommissionsRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.serviceCommissions = remoteIdSet;
            firestoreSyncedFlags.current.serviceCommissions = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 9. Real-time technician payouts listener
        const unsubPayouts = subscribeToTechnicianPayouts((firestorePayouts, meta) => {
          if (!Array.isArray(firestorePayouts)) return;
          const delSet = new Set(deletedIdsRef.current.technicianPayouts);
          firestorePayouts.forEach((p) => {
            if (delSet.has(p.id)) {
              removeTechnicianPayoutFromFirestore(p.id).catch(() => {});
            }
          });
          const cleanPayouts = firestorePayouts.filter((p) => !delSet.has(p.id));
          const remoteIdSet = new Set(cleanPayouts.map((p) => p.id));
          const prevSeen = seenFirestoreIdsRef.current.technicianPayouts;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          setTechnicianPayouts((prev) => {
            const unsyncedLocal = prev.filter(
              (p) =>
                !delSet.has(p.id) &&
                !remoteIdSet.has(p.id) &&
                (!isServerConfirmed || !prevSeen.has(p.id))
            );
            if (unsyncedLocal.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                unsyncedLocal.forEach((p) => syncTechnicianPayoutToFirestore(p).catch(() => {}));
              });
            }
            const merged = [...cleanPayouts, ...unsyncedLocal].sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            technicianPayoutsRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.technicianPayouts = remoteIdSet;
            firestoreSyncedFlags.current.technicianPayouts = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 10. Real-time suppliers listener
        const unsubSuppliers = subscribeToSuppliers((firestoreSuppliers, meta) => {
          if (!Array.isArray(firestoreSuppliers)) return;
          const delSet = new Set(deletedIdsRef.current.suppliers);
          firestoreSuppliers.forEach((s) => {
            if (delSet.has(s.id)) {
              removeSupplierFromFirestore(s.id).catch(() => {});
            }
          });
          const cleanSuppliers = firestoreSuppliers.filter((s) => !delSet.has(s.id));
          const remoteIdSet = new Set(cleanSuppliers.map((s) => s.id));
          const prevSeen = seenFirestoreIdsRef.current.suppliers;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          setSuppliers((prev) => {
            const unsyncedLocal = prev.filter(
              (s) =>
                !delSet.has(s.id) &&
                !remoteIdSet.has(s.id) &&
                (!isServerConfirmed || !prevSeen.has(s.id))
            );
            if (unsyncedLocal.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                unsyncedLocal.forEach((s) => syncSupplierToFirestore(s).catch(() => {}));
              });
            }
            const merged = [...cleanSuppliers, ...unsyncedLocal].sort((a, b) =>
              (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
            );
            suppliersRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.suppliers = remoteIdSet;
            firestoreSyncedFlags.current.suppliers = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 11. Real-time purchase orders listener
        const unsubPurchaseOrders = subscribeToPurchaseOrders((firestoreOrders, meta) => {
          if (!Array.isArray(firestoreOrders)) return;
          const delSet = new Set(deletedIdsRef.current.purchaseOrders);
          firestoreOrders.forEach((po) => {
            if (delSet.has(po.id)) {
              removePurchaseOrderFromFirestore(po.id).catch(() => {});
            }
          });
          const cleanOrders = firestoreOrders.filter((po) => !delSet.has(po.id));
          const remoteById = new Map(cleanOrders.map((po) => [po.id, po]));
          const remoteIdSet = new Set(cleanOrders.map((po) => po.id));
          const prevSeen = seenFirestoreIdsRef.current.purchaseOrders;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          if (isServerConfirmed) {
            remoteIdSet.forEach((id) => pendingSyncPurchaseOrderIdsRef.current.delete(id));
          }

          setPurchaseOrders((prev) => {
            const toUpload: PurchaseOrder[] = [];
            const mergedMap = new Map<string, PurchaseOrder>();

            for (const rpo of cleanOrders) {
              mergedMap.set(rpo.id, rpo);
            }

            for (const lpo of prev) {
              if (delSet.has(lpo.id)) continue;
              const rpo = remoteById.get(lpo.id);
              const isPendingLocal = pendingSyncPurchaseOrderIdsRef.current.has(lpo.id);
              const isNewerLocal =
                rpo && lpo.updatedAt && (!rpo.updatedAt || lpo.updatedAt > rpo.updatedAt);

              if (!rpo) {
                if (isPendingLocal || !isServerConfirmed || !prevSeen.has(lpo.id)) {
                  mergedMap.set(lpo.id, lpo);
                  toUpload.push(lpo);
                }
              } else if (isPendingLocal || isNewerLocal) {
                mergedMap.set(lpo.id, lpo);
                toUpload.push(lpo);
              }
            }

            if (toUpload.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                toUpload.forEach((po) => {
                  pendingSyncPurchaseOrderIdsRef.current.add(po.id);
                  syncPurchaseOrderToFirestore(po)
                    .then(() => pendingSyncPurchaseOrderIdsRef.current.delete(po.id))
                    .catch(() => {});
                });
              });
            }

            const merged = Array.from(mergedMap.values()).sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            purchaseOrdersRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.purchaseOrders = remoteIdSet;
            firestoreSyncedFlags.current.purchaseOrders = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 12. Real-time business expenses listener
        const unsubExpenses = subscribeToExpenses((firestoreExpenses, meta) => {
          if (!Array.isArray(firestoreExpenses)) return;
          const delSet = new Set(deletedIdsRef.current.expenses);
          firestoreExpenses.forEach((ex) => {
            if (delSet.has(ex.id)) {
              removeExpenseFromFirestore(ex.id).catch(() => {});
            }
          });
          const cleanExpenses = firestoreExpenses.filter((ex) => !delSet.has(ex.id));
          const remoteById = new Map(cleanExpenses.map((ex) => [ex.id, ex]));
          const remoteIdSet = new Set(cleanExpenses.map((ex) => ex.id));
          const prevSeen = seenFirestoreIdsRef.current.expenses;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          if (isServerConfirmed) {
            remoteIdSet.forEach((id) => pendingSyncExpenseIdsRef.current.delete(id));
          }

          setExpenses((prev) => {
            const toUpload: BusinessExpense[] = [];
            const mergedMap = new Map<string, BusinessExpense>();

            for (const rex of cleanExpenses) {
              mergedMap.set(rex.id, rex);
            }

            for (const lex of prev) {
              if (delSet.has(lex.id)) continue;
              const rex = remoteById.get(lex.id);
              const isPendingLocal = pendingSyncExpenseIdsRef.current.has(lex.id);
              const isNewerLocal =
                rex && lex.updatedAt && (!rex.updatedAt || lex.updatedAt > rex.updatedAt);

              if (!rex) {
                if (isPendingLocal || !isServerConfirmed || !prevSeen.has(lex.id)) {
                  mergedMap.set(lex.id, lex);
                  toUpload.push(lex);
                }
              } else if (isPendingLocal || isNewerLocal) {
                mergedMap.set(lex.id, lex);
                toUpload.push(lex);
              }
            }

            if (toUpload.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                toUpload.forEach((ex) => {
                  pendingSyncExpenseIdsRef.current.add(ex.id);
                  syncExpenseToFirestore(ex)
                    .then(() => pendingSyncExpenseIdsRef.current.delete(ex.id))
                    .catch(() => {});
                });
              });
            }

            const merged = Array.from(mergedMap.values()).sort(
              (a, b) =>
                (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
                (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            expensesRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.expenses = remoteIdSet;
            firestoreSyncedFlags.current.expenses = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 13. Real-time treasury accounts listener
        const unsubTreasuryAccounts = subscribeToTreasuryAccounts((firestoreAccounts, meta) => {
          if (!Array.isArray(firestoreAccounts)) return;
          const delSet = new Set(deletedIdsRef.current.treasuryAccounts);
          firestoreAccounts.forEach((acc) => {
            if (delSet.has(acc.id)) {
              removeTreasuryAccountFromFirestore(acc.id).catch(() => {});
            }
          });
          const cleanAccounts = firestoreAccounts.filter((acc) => !delSet.has(acc.id));
          const remoteById = new Map(cleanAccounts.map((acc) => [acc.id, acc]));
          const remoteIdSet = new Set(cleanAccounts.map((acc) => acc.id));
          const prevSeen = seenFirestoreIdsRef.current.treasuryAccounts;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          if (isServerConfirmed) {
            remoteIdSet.forEach((id) => pendingSyncTreasuryAccountIdsRef.current.delete(id));
          }

          setTreasuryAccounts((prev) => {
            const toUpload: TreasuryAccount[] = [];
            const mergedMap = new Map<string, TreasuryAccount>();

            for (const racc of cleanAccounts) {
              mergedMap.set(racc.id, racc);
            }

            for (const lacc of prev) {
              if (delSet.has(lacc.id)) continue;
              const racc = remoteById.get(lacc.id);
              const isPendingLocal = pendingSyncTreasuryAccountIdsRef.current.has(lacc.id);
              const isNewerLocal =
                racc && lacc.updatedAt && (!racc.updatedAt || lacc.updatedAt > racc.updatedAt);

              if (!racc) {
                if (isPendingLocal || !isServerConfirmed || !prevSeen.has(lacc.id)) {
                  mergedMap.set(lacc.id, lacc);
                  toUpload.push(lacc);
                }
              } else if (isPendingLocal || isNewerLocal) {
                mergedMap.set(lacc.id, lacc);
                toUpload.push(lacc);
              }
            }

            if (toUpload.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                toUpload.forEach((acc) => {
                  pendingSyncTreasuryAccountIdsRef.current.add(acc.id);
                  syncTreasuryAccountToFirestore(acc)
                    .then(() => pendingSyncTreasuryAccountIdsRef.current.delete(acc.id))
                    .catch(() => {});
                });
              });
            }

            const merged = Array.from(mergedMap.values()).sort((a, b) =>
              (a.createdAt || '').localeCompare(b.createdAt || '')
            );
            treasuryAccountsRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.treasuryAccounts = remoteIdSet;
            firestoreSyncedFlags.current.treasuryAccounts = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 14. Real-time treasury commitments listener
        const unsubTreasuryCommitments = subscribeToTreasuryCommitments((firestoreCommitments, meta) => {
          if (!Array.isArray(firestoreCommitments)) return;
          const delSet = new Set(deletedIdsRef.current.treasuryCommitments);
          firestoreCommitments.forEach((cm) => {
            if (delSet.has(cm.id)) {
              removeTreasuryCommitmentFromFirestore(cm.id).catch(() => {});
            }
          });
          const cleanCommitments = firestoreCommitments.filter((cm) => !delSet.has(cm.id));
          const remoteById = new Map(cleanCommitments.map((cm) => [cm.id, cm]));
          const remoteIdSet = new Set(cleanCommitments.map((cm) => cm.id));
          const prevSeen = seenFirestoreIdsRef.current.treasuryCommitments;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          if (isServerConfirmed) {
            remoteIdSet.forEach((id) => pendingSyncTreasuryCommitmentIdsRef.current.delete(id));
          }

          setTreasuryCommitments((prev) => {
            const toUpload: TreasuryCommitment[] = [];
            const mergedMap = new Map<string, TreasuryCommitment>();

            for (const rcm of cleanCommitments) {
              mergedMap.set(rcm.id, rcm);
            }

            for (const lcm of prev) {
              if (delSet.has(lcm.id)) continue;
              const rcm = remoteById.get(lcm.id);
              const isPendingLocal = pendingSyncTreasuryCommitmentIdsRef.current.has(lcm.id);
              const isNewerLocal =
                rcm && lcm.updatedAt && (!rcm.updatedAt || lcm.updatedAt > rcm.updatedAt);

              if (!rcm) {
                if (isPendingLocal || !isServerConfirmed || !prevSeen.has(lcm.id)) {
                  mergedMap.set(lcm.id, lcm);
                  toUpload.push(lcm);
                }
              } else if (isPendingLocal || isNewerLocal) {
                mergedMap.set(lcm.id, lcm);
                toUpload.push(lcm);
              }
            }

            if (toUpload.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                toUpload.forEach((cm) => {
                  pendingSyncTreasuryCommitmentIdsRef.current.add(cm.id);
                  syncTreasuryCommitmentToFirestore(cm)
                    .then(() => pendingSyncTreasuryCommitmentIdsRef.current.delete(cm.id))
                    .catch(() => {});
                });
              });
            }

            const merged = Array.from(mergedMap.values()).sort((a, b) =>
              (a.dueDate || '').localeCompare(b.dueDate || '')
            );
            treasuryCommitmentsRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.treasuryCommitments = remoteIdSet;
            firestoreSyncedFlags.current.treasuryCommitments = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 15. Real-time treasury movements listener
        const unsubTreasuryMovements = subscribeToTreasuryMovements((firestoreMovements, meta) => {
          if (!Array.isArray(firestoreMovements)) return;
          const delSet = new Set(deletedIdsRef.current.treasuryMovements);
          firestoreMovements.forEach((mv) => {
            if (delSet.has(mv.id)) {
              removeTreasuryMovementFromFirestore(mv.id).catch(() => {});
            }
          });
          const cleanMovements = firestoreMovements.filter((mv) => !delSet.has(mv.id));
          const remoteById = new Map(cleanMovements.map((mv) => [mv.id, mv]));
          const remoteIdSet = new Set(cleanMovements.map((mv) => mv.id));
          const prevSeen = seenFirestoreIdsRef.current.treasuryMovements;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          if (isServerConfirmed) {
            remoteIdSet.forEach((id) => pendingSyncTreasuryMovementIdsRef.current.delete(id));
          }

          setTreasuryMovements((prev) => {
            const toUpload: TreasuryMovement[] = [];
            const mergedMap = new Map<string, TreasuryMovement>();

            for (const rmv of cleanMovements) {
              mergedMap.set(rmv.id, rmv);
            }

            for (const lmv of prev) {
              if (delSet.has(lmv.id)) continue;
              const rmv = remoteById.get(lmv.id);
              const isPendingLocal = pendingSyncTreasuryMovementIdsRef.current.has(lmv.id);
              const isNewerLocal =
                rmv && lmv.updatedAt && (!rmv.updatedAt || lmv.updatedAt > rmv.updatedAt);

              if (!rmv) {
                if (isPendingLocal || !isServerConfirmed || !prevSeen.has(lmv.id)) {
                  mergedMap.set(lmv.id, lmv);
                  toUpload.push(lmv);
                }
              } else if (isPendingLocal || isNewerLocal) {
                mergedMap.set(lmv.id, lmv);
                toUpload.push(lmv);
              }
            }

            if (toUpload.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                toUpload.forEach((mv) => {
                  pendingSyncTreasuryMovementIdsRef.current.add(mv.id);
                  syncTreasuryMovementToFirestore(mv)
                    .then(() => pendingSyncTreasuryMovementIdsRef.current.delete(mv.id))
                    .catch(() => {});
                });
              });
            }

            const merged = Array.from(mergedMap.values()).sort(
              (a, b) =>
                (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
                (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            treasuryMovementsRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.treasuryMovements = remoteIdSet;
            firestoreSyncedFlags.current.treasuryMovements = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 16. Real-time treasury debts listener
        const unsubTreasuryDebts = subscribeToTreasuryDebts((firestoreDebts, meta) => {
          if (!Array.isArray(firestoreDebts)) return;
          const delSet = new Set(deletedIdsRef.current.treasuryDebts);
          firestoreDebts.forEach((d) => {
            if (delSet.has(d.id)) {
              removeTreasuryDebtFromFirestore(d.id).catch(() => {});
            }
          });
          const cleanDebts = firestoreDebts.filter((d) => !delSet.has(d.id));
          const remoteById = new Map(cleanDebts.map((d) => [d.id, d]));
          const remoteIdSet = new Set(cleanDebts.map((d) => d.id));
          const prevSeen = seenFirestoreIdsRef.current.treasuryDebts;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          if (isServerConfirmed) {
            remoteIdSet.forEach((id) => pendingSyncTreasuryDebtIdsRef.current.delete(id));
          }

          setTreasuryDebts((prev) => {
            const toUpload: TreasuryDebt[] = [];
            const mergedMap = new Map<string, TreasuryDebt>();

            for (const rd of cleanDebts) {
              mergedMap.set(rd.id, rd);
            }

            for (const ld of prev) {
              if (delSet.has(ld.id)) continue;
              const rd = remoteById.get(ld.id);
              const isPendingLocal = pendingSyncTreasuryDebtIdsRef.current.has(ld.id);
              const isNewerLocal =
                rd && ld.updatedAt && (!rd.updatedAt || ld.updatedAt > rd.updatedAt);

              if (!rd) {
                if (isPendingLocal || !isServerConfirmed || !prevSeen.has(ld.id)) {
                  mergedMap.set(ld.id, ld);
                  toUpload.push(ld);
                }
              } else if (isPendingLocal || isNewerLocal) {
                mergedMap.set(ld.id, ld);
                toUpload.push(ld);
              }
            }

            if (toUpload.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                toUpload.forEach((d) => {
                  pendingSyncTreasuryDebtIdsRef.current.add(d.id);
                  syncTreasuryDebtToFirestore(d)
                    .then(() => pendingSyncTreasuryDebtIdsRef.current.delete(d.id))
                    .catch(() => {});
                });
              });
            }

            const merged = Array.from(mergedMap.values()).sort((a, b) =>
              (b.createdAt || '').localeCompare(a.createdAt || '')
            );
            treasuryDebtsRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.treasuryDebts = remoteIdSet;
            firestoreSyncedFlags.current.treasuryDebts = true;
          }
          setFirebaseSyncStatus('synced');
        });

        // 17. Real-time POS daily open accounts listener
        const unsubOpenAccounts = subscribeToOpenAccounts((firestoreAccounts, meta) => {
          if (!Array.isArray(firestoreAccounts)) return;
          const delSet = new Set(deletedIdsRef.current.openAccounts);
          firestoreAccounts.forEach((a) => {
            if (delSet.has(a.id)) {
              removeOpenAccountFromFirestore(a.id).catch(() => {});
            }
          });
          const cleanAccounts = firestoreAccounts.filter((a) => !delSet.has(a.id));
          const remoteById = new Map(cleanAccounts.map((a) => [a.id, a]));
          const remoteIdSet = new Set(cleanAccounts.map((a) => a.id));
          const prevSeen = seenFirestoreIdsRef.current.openAccounts;
          const isServerConfirmed = !meta?.fromCache && !meta?.hasPendingWrites;

          if (isServerConfirmed) {
            remoteIdSet.forEach((id) => pendingSyncOpenAccountIdsRef.current.delete(id));
          }

          setOpenAccounts((prev) => {
            const toUpload: OpenAccount[] = [];
            const mergedMap = new Map<string, OpenAccount>();

            for (const ra of cleanAccounts) {
              mergedMap.set(ra.id, ra);
            }

            for (const la of prev) {
              if (delSet.has(la.id)) continue;
              const ra = remoteById.get(la.id);
              const isPendingLocal = pendingSyncOpenAccountIdsRef.current.has(la.id);
              const isNewerLocal =
                ra && la.updatedAt && (!ra.updatedAt || la.updatedAt > ra.updatedAt);

              if (!ra) {
                if (isPendingLocal || !isServerConfirmed || !prevSeen.has(la.id)) {
                  mergedMap.set(la.id, la);
                  toUpload.push(la);
                }
              } else if (isPendingLocal || isNewerLocal) {
                mergedMap.set(la.id, la);
                toUpload.push(la);
              }
            }

            if (toUpload.length > 0 && isServerConfirmed) {
              queueMicrotask(() => {
                toUpload.forEach((a) => {
                  pendingSyncOpenAccountIdsRef.current.add(a.id);
                  syncOpenAccountToFirestore(a)
                    .then(() => pendingSyncOpenAccountIdsRef.current.delete(a.id))
                    .catch(() => {});
                });
              });
            }

            const merged = Array.from(mergedMap.values()).sort((a, b) =>
              (b.updatedAt || b.openedAt || '').localeCompare(a.updatedAt || a.openedAt || '')
            );
            openAccountsRef.current = merged;
            return merged;
          });

          if (isServerConfirmed) {
            seenFirestoreIdsRef.current.openAccounts = remoteIdSet;
            firestoreSyncedFlags.current.openAccounts = true;
          }
          setFirebaseSyncStatus('synced');
        });

        unsubs = [
          unsubDeleted,
          unsubProducts,
          unsubSettings,
          unsubCustomers,
          unsubSales,
          unsubServiceOrders,
          unsubOnlineOrders,
          unsubTechnicians,
          unsubCommissions,
          unsubPayouts,
          unsubSuppliers,
          unsubPurchaseOrders,
          unsubExpenses,
          unsubTreasuryAccounts,
          unsubTreasuryCommitments,
          unsubTreasuryMovements,
          unsubTreasuryDebts,
          unsubOpenAccounts,
        ];
      } catch (err) {
        console.warn('Error starting Firestore real-time listeners:', err);
      }
    }

    initFirestore();

    return () => {
      isCancelled = true;
      unsubs.forEach((u) => {
        try {
          u();
        } catch {}
      });
    };
  }, []);

  const syncAllToFirebase = async (): Promise<{ success: boolean; count: number }> => {
    setFirebaseSyncStatus('syncing');
    try {
      const result = await uploadAllToFirestore({
        products,
        settings,
        customers,
        sales,
        serviceOrders,
        onlineOrders,
        technicians,
        serviceCommissions,
        technicianPayouts,
        suppliers,
        purchaseOrders,
        expenses,
        treasuryAccounts,
        treasuryCommitments,
        treasuryMovements,
        treasuryDebts,
        openAccounts,
        deletedIds: deletedIdsRef.current,
      });
      if (result.success) {
        setFirebaseSyncStatus('synced');
      } else {
        setFirebaseSyncStatus('error');
      }
      return result;
    } catch (err) {
      setFirebaseSyncStatus('error');
      return { success: false, count: 0 };
    }
  };

  // Debounced synchronization to server file system database
  useEffect(() => {
    if (!isInitialLoaded.current) return;

    if (saveTimeoutRef.current) {
      clearTimeout(saveTimeoutRef.current);
    }

    saveTimeoutRef.current = setTimeout(() => {
      fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings,
          products,
          customers,
          sales,
          serviceOrders,
          onlineOrders,
          technicians,
          serviceCommissions,
          technicianPayouts,
          suppliers,
          purchaseOrders,
          expenses,
          treasuryAccounts,
          treasuryCommitments,
          treasuryMovements,
          treasuryDebts,
          openAccounts,
          deletedIds: deletedIdsRef.current,
        }),
      }).catch((err) => {
        console.warn('Error guardando en el servidor:', err);
      });
    }, 350);

    return () => {
      if (saveTimeoutRef.current) {
        clearTimeout(saveTimeoutRef.current);
      }
    };
  }, [settings, products, customers, sales, serviceOrders, onlineOrders, technicians, serviceCommissions, technicianPayouts, suppliers, purchaseOrders, expenses, treasuryAccounts, treasuryCommitments, treasuryMovements, treasuryDebts, openAccounts, deletedIds]);

  // Guarantee save before tab/window is closed
  useEffect(() => {
    const handleBeforeUnload = () => {
      if (isInitialLoaded.current) {
        const payload = JSON.stringify({
          settings,
          products,
          customers,
          sales,
          serviceOrders,
          onlineOrders,
          technicians,
          serviceCommissions,
          technicianPayouts,
          suppliers,
          purchaseOrders,
          expenses,
          treasuryAccounts,
          treasuryCommitments,
          treasuryMovements,
          treasuryDebts,
          openAccounts,
          deletedIds: deletedIdsRef.current,
        });

        if (navigator.sendBeacon) {
          const blob = new Blob([payload], { type: 'application/json' });
          navigator.sendBeacon('/api/data', blob);
        } else {
          fetch('/api/data', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: payload,
            keepalive: true,
          }).catch(() => {});
        }
      }
    };

    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
    };
  }, [settings, products, customers, sales, serviceOrders, onlineOrders, technicians, serviceCommissions, technicianPayouts, suppliers, purchaseOrders, expenses, treasuryAccounts, treasuryCommitments, treasuryMovements, treasuryDebts, openAccounts, deletedIds]);

  // Online products: show items with stock > 0 OR made-to-order (tracksInventory === false), sanitize internal pricing fields, and sort A-Z
  const onlineProducts = useMemo(() => {
    return products
      .filter((p) => !productTracksInventory(p) || p.stock > 0)
      .map((p) => sanitizeProductForPublic(p))
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [products]);

  // Brecha cambiaria activa entre tasa_bcv y tasa_usdt (uso exclusivamente interno / administrativo)
  const exchangeGap = useMemo(
    () => calculateExchangeGap(settings.bcvRate, settings.usdtRate),
    [settings.bcvRate, settings.usdtRate]
  );

  // Combined product categories: defaults + saved custom categories + any categories on existing products
  const categories = useMemo<ProductCategory[]>(() => {
    const result: ProductCategory[] = [];
    const seenLower = new Set<string>();

    const registerCategory = (cat?: string) => {
      const cleaned = (cat || '').trim().replace(/\s+/g, ' ');
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      if (seenLower.has(key)) return;
      seenLower.add(key);
      result.push(cleaned);
    };

    DEFAULT_PRODUCT_CATEGORIES.forEach(registerCategory);
    if (Array.isArray(settings.customCategories)) {
      settings.customCategories.forEach(registerCategory);
    }
    products.forEach((p) => registerCategory(p.category));

    return result;
  }, [settings.customCategories, products]);

  const addCategory = (categoryName: string): { added: boolean; category: ProductCategory } => {
    const cleaned = categoryName.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      return { added: false, category: 'Accesorios' };
    }

    const existing = categories.find(
      (c) => c.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (existing) {
      return { added: false, category: existing };
    }

    const formatted =
      cleaned === cleaned.toLowerCase()
        ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
        : cleaned;

    setSettings((prev) => {
      const prevCustom = Array.isArray(prev.customCategories) ? prev.customCategories : [];
      if (prevCustom.some((c) => c.trim().toLowerCase() === formatted.toLowerCase())) {
        return prev;
      }
      const updated: BusinessSettings = {
        ...prev,
        customCategories: [...prevCustom, formatted],
      };
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      } catch {}
      syncSettingsToFirestore(updated).catch((err) =>
        console.warn('Firestore custom category sync error:', err)
      );
      return updated;
    });

    return { added: true, category: formatted };
  };

  // Categorías de Modelos de Motos Especializados (predefinidos + personalizados + presentes en productos)
  const modelCategories = useMemo<string[]>(() => {
    const result: string[] = [];
    const seenLower = new Set<string>();
    const hiddenLower = new Set<string>(
      (Array.isArray(settings.hiddenDefaultModelCategories)
        ? settings.hiddenDefaultModelCategories
        : []
      ).map((m) => m.trim().toLowerCase())
    );

    const registerModel = (model?: string, skipIfHidden = false) => {
      const cleaned = (model || '').trim().replace(/\s+/g, ' ');
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      if (skipIfHidden && hiddenLower.has(key)) return;
      if (seenLower.has(key)) return;
      seenLower.add(key);
      result.push(cleaned);
    };

    DEFAULT_MOTORCYCLE_MODEL_CATEGORIES.forEach((m) => registerModel(m, true));
    if (Array.isArray(settings.customModelCategories)) {
      settings.customModelCategories.forEach((m) => registerModel(m, false));
    }
    products.forEach((p) => {
      if (Array.isArray(p.modelCategories)) {
        p.modelCategories.forEach((m) => registerModel(m, false));
      }
    });

    return result;
  }, [settings.customModelCategories, settings.hiddenDefaultModelCategories, products]);

  const addModelCategory = (modelName: string): { added: boolean; modelCategory: string } => {
    const cleaned = modelName.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      return { added: false, modelCategory: '' };
    }

    const existing = modelCategories.find(
      (m) => m.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (existing) {
      return { added: false, modelCategory: existing };
    }

    const cleanedLower = cleaned.toLowerCase();
    const matchedDefault = DEFAULT_MOTORCYCLE_MODEL_CATEGORIES.find(
      (d) => d.trim().toLowerCase() === cleanedLower
    );
    const finalName = matchedDefault || cleaned;

    setSettings((prev) => {
      const prevCustom = Array.isArray(prev.customModelCategories)
        ? prev.customModelCategories
        : [];
      const prevHidden = Array.isArray(prev.hiddenDefaultModelCategories)
        ? prev.hiddenDefaultModelCategories
        : [];
      const nextHidden = prevHidden.filter(
        (h) => h.trim().toLowerCase() !== finalName.toLowerCase()
      );
      const nextCustom = matchedDefault
        ? prevCustom
        : prevCustom.some((c) => c.trim().toLowerCase() === finalName.toLowerCase())
          ? prevCustom
          : [...prevCustom, finalName];

      const updated: BusinessSettings = {
        ...prev,
        customModelCategories: nextCustom,
        hiddenDefaultModelCategories: nextHidden,
      };
      settingsRef.current = updated;
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      } catch {}
      syncSettingsToFirestore(updated).catch((err) =>
        console.warn('Firestore custom model category sync error:', err)
      );
      return updated;
    });

    return { added: true, modelCategory: finalName };
  };

  const renameModelCategory = (
    oldName: string,
    newName: string
  ): { updated: boolean; modelCategory: string } => {
    const oldClean = oldName.trim().replace(/\s+/g, ' ');
    const newClean = newName.trim().replace(/\s+/g, ' ');
    if (!oldClean || !newClean) {
      return { updated: false, modelCategory: oldClean };
    }
    const oldLower = oldClean.toLowerCase();
    const newLower = newClean.toLowerCase();
    if (oldClean === newClean) {
      return { updated: false, modelCategory: oldClean };
    }

    const isOldDefault = DEFAULT_MOTORCYCLE_MODEL_CATEGORIES.some(
      (d) => d.trim().toLowerCase() === oldLower
    );
    const isNewDefault = DEFAULT_MOTORCYCLE_MODEL_CATEGORIES.some(
      (d) => d.trim().toLowerCase() === newLower
    );

    setSettings((prev) => {
      const prevCustom = Array.isArray(prev.customModelCategories)
        ? prev.customModelCategories
        : [];
      const prevHidden = Array.isArray(prev.hiddenDefaultModelCategories)
        ? prev.hiddenDefaultModelCategories
        : [];

      let nextHidden = prevHidden.filter((h) => h.trim().toLowerCase() !== newLower);
      if (isOldDefault && oldLower !== newLower && !nextHidden.some((h) => h.toLowerCase() === oldLower)) {
        nextHidden = [...nextHidden, oldClean];
      }

      const withoutOld = prevCustom.filter((c) => c.trim().toLowerCase() !== oldLower);
      const nextCustom =
        isNewDefault || withoutOld.some((c) => c.trim().toLowerCase() === newLower)
          ? withoutOld
          : [...withoutOld, newClean];

      const updated: BusinessSettings = {
        ...prev,
        customModelCategories: nextCustom,
        hiddenDefaultModelCategories: nextHidden,
      };
      settingsRef.current = updated;
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      } catch {}
      syncSettingsToFirestore(updated).catch(() => {});
      return updated;
    });

    // Propagate rename to any products explicitly tagged with oldName
    setProducts((prev) => {
      const touched: Product[] = [];
      const next = prev.map((p) => {
        if (!Array.isArray(p.modelCategories) || p.modelCategories.length === 0) return p;
        const hasOld = p.modelCategories.some((m) => m.trim().toLowerCase() === oldLower);
        if (!hasOld) return p;
        const replaced = Array.from(
          new Set(
            p.modelCategories.map((m) => (m.trim().toLowerCase() === oldLower ? newClean : m))
          )
        );
        const updatedProduct: Product = { ...p, modelCategories: replaced };
        touched.push(updatedProduct);
        return updatedProduct;
      });
      if (touched.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(next));
        } catch {}
        touched.forEach((p) => syncProductToFirestore(p).catch(() => {}));
      }
      return next;
    });

    return { updated: true, modelCategory: newClean };
  };

  const deleteModelCategory = (modelName: string) => {
    const cleaned = modelName.trim().replace(/\s+/g, ' ');
    if (!cleaned) return;
    const targetLower = cleaned.toLowerCase();
    const isDefault = DEFAULT_MOTORCYCLE_MODEL_CATEGORIES.some(
      (d) => d.trim().toLowerCase() === targetLower
    );

    setSettings((prev) => {
      const prevCustom = Array.isArray(prev.customModelCategories)
        ? prev.customModelCategories
        : [];
      const prevHidden = Array.isArray(prev.hiddenDefaultModelCategories)
        ? prev.hiddenDefaultModelCategories
        : [];

      const nextCustom = prevCustom.filter((c) => c.trim().toLowerCase() !== targetLower);
      const nextHidden =
        isDefault && !prevHidden.some((h) => h.trim().toLowerCase() === targetLower)
          ? [...prevHidden, cleaned]
          : prevHidden;

      const updated: BusinessSettings = {
        ...prev,
        customModelCategories: nextCustom,
        hiddenDefaultModelCategories: nextHidden,
      };
      settingsRef.current = updated;
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      } catch {}
      syncSettingsToFirestore(updated).catch(() => {});
      return updated;
    });

    setProducts((prev) => {
      const touched: Product[] = [];
      const next = prev.map((p) => {
        if (!Array.isArray(p.modelCategories) || p.modelCategories.length === 0) return p;
        const filtered = p.modelCategories.filter(
          (m) => m.trim().toLowerCase() !== targetLower
        );
        if (filtered.length === p.modelCategories.length) return p;
        const updatedProduct: Product = { ...p, modelCategories: filtered };
        touched.push(updatedProduct);
        return updatedProduct;
      });
      if (touched.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(next));
        } catch {}
        touched.forEach((p) => syncProductToFirestore(p).catch(() => {}));
      }
      return next;
    });
  };

  const assignModelCategoryToProducts = (
    productIds: string[],
    modelCategory: string,
    mode: 'add' | 'remove' = 'add'
  ) => {
    const cleaned = modelCategory.trim().replace(/\s+/g, ' ');
    if (!cleaned || productIds.length === 0) return;
    const idSet = new Set(productIds);
    const targetLower = cleaned.toLowerCase();

    if (mode === 'add') {
      addModelCategory(cleaned);
    }

    setProducts((prev) => {
      const touched: Product[] = [];
      const next = prev.map((p) => {
        if (!idSet.has(p.id)) return p;
        const current = Array.isArray(p.modelCategories) ? p.modelCategories : [];
        let updatedModels: string[];
        if (mode === 'remove') {
          updatedModels = current.filter((m) => m.trim().toLowerCase() !== targetLower);
          if (updatedModels.length === current.length) return p;
        } else {
          if (current.some((m) => m.trim().toLowerCase() === targetLower)) return p;
          updatedModels = [...current, cleaned];
        }
        const updatedProduct: Product = { ...p, modelCategories: updatedModels };
        touched.push(updatedProduct);
        return updatedProduct;
      });

      if (touched.length > 0) {
        try {
          localStorage.setItem(STORAGE_KEYS.PRODUCTS, JSON.stringify(next));
        } catch {}
        touched.forEach((p) => syncProductToFirestore(p).catch(() => {}));
      }
      return next;
    });
  };

  // BCV Automatic Synchronization
  const [isSyncingBcv, setIsSyncingBcv] = useState(false);
  const [bcvSyncMessage, setBcvSyncMessage] = useState<string | null>(null);

  const syncBcvRate = async (force: boolean = false): Promise<BcvSyncResult> => {
    lastBcvCheckAtRef.current = Date.now();
    setIsSyncingBcv(true);
    setBcvSyncMessage('Consultando tasa oficial en bcv.org.ve...');
    try {
      const result = await fetchOfficialBcvRate({ force });
      if (result.success && result.rate > 0) {
        const syncedAtISO = result.timestamp || new Date().toISOString();
        const checkedTime = new Date().toLocaleTimeString('es-VE', {
          hour: '2-digit',
          minute: '2-digit',
        });

        if (result.isLive !== false) {
          latestLiveBcvRef.current = {
            rate: result.rate,
            date: result.date,
            source: result.source,
            lastUpdated: checkedTime,
            syncedAtISO,
          };
        }

        setSettings((prev) => {
          const prevRate = Number(prev.bcvRate) || 0;
          const rateChanged = Math.abs(prevRate - result.rate) >= 0.005;
          const dateChanged = Boolean(result.date && prev.bcvOfficialDate !== result.date);
          const sourceChanged = Boolean(result.source && prev.bcvSource !== result.source);

          const updated: BusinessSettings = {
            ...prev,
            bcvRate: result.rate,
            bcvOfficialDate: result.date || prev.bcvOfficialDate,
            bcvSource: result.source,
            bcvLastUpdated: checkedTime,
            bcvSyncedAtISO: syncedAtISO,
          };
          settingsRef.current = updated;
          try {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
          } catch {}

          // Persist to Firestore whenever the official rate/date actually updated or on manual force sync
          if (rateChanged || dateChanged || sourceChanged || force || !prev.bcvSyncedAtISO) {
            syncSettingsToFirestore(updated).catch(() => {});
          }
          return updated;
        });

        setBcvSyncMessage(
          `Tasa BCV oficial: Bs. ${result.rate.toFixed(2)}${result.date ? ` (${result.date})` : ''}`
        );
      } else {
        setBcvSyncMessage(result.error || 'No se pudo sincronizar con BCV');
      }
      setTimeout(() => setBcvSyncMessage(null), 4500);
      return result;
    } catch (err) {
      const errMsg = 'Error al consultar tasa oficial BCV';
      setBcvSyncMessage(errMsg);
      setTimeout(() => setBcvSyncMessage(null), 4500);
      return {
        success: false,
        rate: 0,
        source: 'Banco Central de Venezuela (bcv.org.ve)',
        timestamp: new Date().toISOString(),
        isLive: false,
        error: errMsg,
      };
    } finally {
      setIsSyncingBcv(false);
    }
  };

  // Auto-sync BCV immediately on startup, every 5 minutes, and whenever the user returns to the tab or reconnects
  useEffect(() => {
    syncBcvRate(false);

    const interval = setInterval(() => {
      syncBcvRate(false);
    }, 5 * 60 * 1000);

    const handleVisibilityOrOnline = () => {
      if (document.visibilityState === 'hidden') return;
      const elapsed = Date.now() - lastBcvCheckAtRef.current;
      if (elapsed >= 2 * 60 * 1000) {
        syncBcvRate(false);
      }
    };

    document.addEventListener('visibilitychange', handleVisibilityOrOnline);
    window.addEventListener('online', handleVisibilityOrOnline);

    return () => {
      clearInterval(interval);
      document.removeEventListener('visibilitychange', handleVisibilityOrOnline);
      window.removeEventListener('online', handleVisibilityOrOnline);
    };
  }, []);

  // Update Settings
  const updateSettings = async (newSettings: Partial<BusinessSettings>): Promise<void> => {
    const manualBcvChanged =
      newSettings.bcvRate !== undefined &&
      Math.abs(Number(newSettings.bcvRate) - Number(settings.bcvRate)) >= 0.005;
    const nowISO = new Date().toISOString();
    const updatedSettings: BusinessSettings = {
      ...settings,
      ...newSettings,
      ...(manualBcvChanged
        ? {
            bcvSyncedAtISO: nowISO,
            bcvLastUpdated: new Date().toLocaleTimeString('es-VE', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          }
        : {}),
      bankDetails: {
        ...settings.bankDetails,
        ...(newSettings.bankDetails || {}),
        bankTransferRif:
          newSettings.rif ||
          newSettings.bankDetails?.bankTransferRif ||
          settings.bankDetails?.bankTransferRif ||
          settings.rif,
      },
    };

    if (manualBcvChanged && updatedSettings.bcvRate > 0) {
      latestLiveBcvRef.current = {
        rate: updatedSettings.bcvRate,
        date: updatedSettings.bcvOfficialDate,
        source: updatedSettings.bcvSource || 'Ajuste Manual / BCV',
        lastUpdated: updatedSettings.bcvLastUpdated || '',
        syncedAtISO: nowISO,
      };
    }

    settingsRef.current = updatedSettings;
    setSettings(updatedSettings);
    localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updatedSettings));
    syncSettingsToFirestore(updatedSettings).catch((err) =>
      console.warn('Firestore settings sync error:', err)
    );

    try {
      await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: updatedSettings,
          products,
          customers,
          sales,
          serviceOrders,
          onlineOrders,
          deletedIds: deletedIdsRef.current,
        }),
      });
    } catch (err) {
      console.warn('Error guardando ajustes en el servidor:', err);
    }
  };

  const [isSyncingUsdt, setIsSyncingUsdt] = useState(false);
  const [usdtSyncMessage, setUsdtSyncMessage] = useState<string | null>(null);

  const syncUsdtRate = async (): Promise<BcvSyncResult> => {
    setIsSyncingUsdt(true);
    setUsdtSyncMessage('Consultando referencia USDT Binance...');
    try {
      const result = await fetchBinanceUsdtRate();
      if (result.success && result.rate > 0) {
        setSettings((prev) => {
          const updated: BusinessSettings = {
            ...prev,
            usdtRate: result.rate,
            usdtSource: result.source,
            usdtLastUpdated: new Date().toLocaleTimeString('es-VE', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          };
          try {
            localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
          } catch {}
          syncSettingsToFirestore(updated).catch(() => {});
          return updated;
        });
        setUsdtSyncMessage(`Tasa USDT ref.: Bs. ${result.rate.toFixed(2)}`);
      } else {
        setUsdtSyncMessage(result.error || 'No se pudo consultar la tasa USDT');
      }
      setTimeout(() => setUsdtSyncMessage(null), 4500);
      return result;
    } catch {
      const errMsg = 'Error al consultar tasa USDT Binance';
      setUsdtSyncMessage(errMsg);
      setTimeout(() => setUsdtSyncMessage(null), 4500);
      return {
        success: false,
        rate: 0,
        source: 'Referencia USDT Binance',
        timestamp: new Date().toISOString(),
        error: errMsg,
      };
    } finally {
      setIsSyncingUsdt(false);
    }
  };

  const updateBcvRate = (newRate: number) => {
    if (newRate > 0) {
      const nowISO = new Date().toISOString();
      const checkedTime = new Date().toLocaleTimeString('es-VE', {
        hour: '2-digit',
        minute: '2-digit',
      });
      latestLiveBcvRef.current = {
        rate: newRate,
        date: settingsRef.current.bcvOfficialDate,
        source: 'Ajuste Manual / BCV',
        lastUpdated: checkedTime,
        syncedAtISO: nowISO,
      };
      setSettings((prev) => {
        const updated: BusinessSettings = {
          ...prev,
          bcvRate: newRate,
          bcvLastUpdated: checkedTime,
          bcvSource: 'Ajuste Manual / BCV',
          bcvSyncedAtISO: nowISO,
        };
        settingsRef.current = updated;
        try {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
        } catch {}
        syncSettingsToFirestore(updated).catch(() => {});
        return updated;
      });
    }
  };

  const updateUsdtRate = (newRate: number) => {
    if (newRate > 0) {
      setSettings((prev) => {
        const updated: BusinessSettings = {
          ...prev,
          usdtRate: newRate,
          usdtLastUpdated: new Date().toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          usdtSource: 'Ajuste Manual / Binance USDT',
        };
        try {
          localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
        } catch {}
        syncSettingsToFirestore(updated).catch(() => {});
        return updated;
      });
    }
  };

  // Inventory / Products actions
  const addProduct = (productData: Omit<Product, 'id'>): Product => {
    const normalizedSku = (productData.sku || '').trim().toLowerCase();
    const existingDup = normalizedSku
      ? products.find((p) => (p.sku || '').trim().toLowerCase() === normalizedSku)
      : undefined;
    if (existingDup) {
      return existingDup;
    }

    let cleanImage = normalizeImageUrl(productData.imageUrl);
    if (!cleanImage && productData.name.toLowerCase().includes('maleta')) {
      cleanImage = PRESET_PRODUCT_IMAGES.maletaParaMoto;
    }
    const newProduct: Product = {
      ...productData,
      sku: (productData.sku || '').trim(),
      warehouseLocation: productData.warehouseLocation?.trim() || undefined,
      imageUrl: cleanImage || productData.imageUrl || PRESET_PRODUCT_IMAGES.brakeKit,
      id: `prod-${Date.now()}`,
    };
    setProducts((prev) => {
      if (normalizedSku && prev.some((p) => (p.sku || '').trim().toLowerCase() === normalizedSku)) {
        return prev;
      }
      return [newProduct, ...prev];
    });
    syncProductToFirestore(newProduct).catch((err) => console.warn('Firestore sync error:', err));
    return newProduct;
  };

  const updateProduct = (id: string, updates: Partial<Product>) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id !== id) return p;
        let img = updates.imageUrl !== undefined ? normalizeImageUrl(updates.imageUrl) : p.imageUrl;
        if (!img && (updates.name || p.name).toLowerCase().includes('maleta')) {
          img = PRESET_PRODUCT_IMAGES.maletaParaMoto;
        }
        const updated = {
          ...p,
          ...updates,
          ...(updates.warehouseLocation !== undefined
            ? { warehouseLocation: updates.warehouseLocation.trim() || undefined }
            : {}),
          imageUrl: img,
        };
        syncProductToFirestore(updated).catch((err) => console.warn('Firestore sync error:', err));
        return updated;
      })
    );
  };

  const deleteProduct = (id: string) => {
    recordDeleted('products', [id]);
    setProducts((prev) => prev.filter((p) => p.id !== id));
    setCart((prev) => prev.filter((item) => item.product.id !== id));
    removeProductFromFirestore(id).catch((err) => console.warn('Firestore delete error:', err));
  };

  const deleteProducts = (ids: string[]) => {
    recordDeleted('products', ids);
    const idSet = new Set(ids);
    setProducts((prev) => prev.filter((p) => !idSet.has(p.id)));
    setCart((prev) => prev.filter((item) => !idSet.has(item.product.id)));
    ids.forEach((id) => removeProductFromFirestore(id).catch(() => {}));
  };

  const adjustStock = (id: string, delta: number) => {
    setProducts((prev) =>
      prev.map((p) => {
        if (p.id === id) {
          if (!productTracksInventory(p)) return p;
          const newStock = Math.max(0, p.stock + delta);
          const updated = { ...p, stock: newStock };
          syncProductToFirestore(updated).catch((err) => console.warn('Firestore sync error:', err));
          return updated;
        }
        return p;
      })
    );
  };

  const bulkImportProducts = (
    importedProducts: Array<Omit<Product, 'id'> & { id?: string }>
  ): { added: number; updated: number } => {
    let addedCount = 0;
    let updatedCount = 0;

    setProducts((prev) => {
      const updatedList = [...prev];
      const timestamp = Date.now();
      const changedProducts: Product[] = [];

      importedProducts.forEach((item, index) => {
        let cleanImage = normalizeImageUrl(item.imageUrl);
        if (!cleanImage && item.name?.toLowerCase().includes('maleta')) {
          cleanImage = PRESET_PRODUCT_IMAGES.maletaParaMoto;
        }

        const normalizedSku = item.sku?.trim().toUpperCase();
        const existingIndex = updatedList.findIndex(
          (p) =>
            (normalizedSku && p.sku.trim().toUpperCase() === normalizedSku) ||
            (item.id && p.id === item.id)
        );

        if (existingIndex >= 0) {
          const existing = updatedList[existingIndex];
          const updatedProd: Product = {
            ...existing,
            name: item.name ? item.name.trim() : existing.name,
            category: item.category || existing.category,
            description: item.description !== undefined ? item.description : existing.description,
            costPrice: typeof item.costPrice === 'number' && !isNaN(item.costPrice) ? Math.max(0, item.costPrice) : existing.costPrice,
            salePrice: typeof item.salePrice === 'number' && !isNaN(item.salePrice) ? Math.max(0, item.salePrice) : existing.salePrice,
            stock: typeof item.stock === 'number' && !isNaN(item.stock) ? Math.max(0, Math.floor(item.stock)) : existing.stock,
            minStock: typeof item.minStock === 'number' && !isNaN(item.minStock) ? Math.max(0, Math.floor(item.minStock)) : existing.minStock,
            brand: item.brand ? item.brand.trim() : existing.brand,
            compatibility: item.compatibility ? item.compatibility.trim() : existing.compatibility,
            imageUrl: cleanImage || existing.imageUrl || PRESET_PRODUCT_IMAGES.brakeKit,
            barcode: item.barcode !== undefined ? item.barcode?.trim() : existing.barcode,
            warehouseLocation:
              item.warehouseLocation !== undefined
                ? item.warehouseLocation?.trim() || undefined
                : existing.warehouseLocation,
            featured: item.featured !== undefined ? item.featured : existing.featured,
          };
          updatedList[existingIndex] = updatedProd;
          changedProducts.push(updatedProd);
          updatedCount++;
        } else {
          const newProd: Product = {
            id: item.id || `prod-bulk-${timestamp}-${index}`,
            sku: item.sku?.trim() || `SKU-${timestamp.toString().slice(-4)}${index}`,
            name: item.name ? item.name.trim() : 'Repuesto Sin Nombre',
            category: item.category || 'Accesorios',
            description: item.description || '',
            costPrice: typeof item.costPrice === 'number' && !isNaN(item.costPrice) ? Math.max(0, item.costPrice) : 0,
            salePrice: typeof item.salePrice === 'number' && !isNaN(item.salePrice) ? Math.max(0, item.salePrice) : 0,
            stock: typeof item.stock === 'number' && !isNaN(item.stock) ? Math.max(0, Math.floor(item.stock)) : 0,
            minStock: typeof item.minStock === 'number' && !isNaN(item.minStock) ? Math.max(0, Math.floor(item.minStock)) : 2,
            brand: item.brand ? item.brand.trim() : 'Genérico',
            compatibility: item.compatibility ? item.compatibility.trim() : 'Universal',
            imageUrl: cleanImage || PRESET_PRODUCT_IMAGES.brakeKit,
            barcode: item.barcode?.trim() || undefined,
            warehouseLocation: item.warehouseLocation?.trim() || undefined,
            featured: item.featured ?? false,
          };
          updatedList.unshift(newProd);
          changedProducts.push(newProd);
          addedCount++;
        }
      });

      queueMicrotask(() => {
        changedProducts.forEach((p) => syncProductToFirestore(p).catch(() => {}));
      });

      return updatedList;
    });

    return { added: addedCount, updated: updatedCount };
  };

  // Customers actions (uses customersRef so rapid back-to-back calls see just-created customers)
  const addCustomer = (customerData: Omit<Customer, 'id' | 'createdAt'>): Customer => {
    const newCustomer: Customer = {
      ...customerData,
      id: `cust-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      createdAt: new Date().toISOString(),
    };
    const nextCustomers = [newCustomer, ...customersRef.current];
    customersRef.current = nextCustomers;
    setCustomers((prev) => (prev.some((c) => c.id === newCustomer.id) ? prev : [newCustomer, ...prev]));
    syncCustomerToFirestore(newCustomer).catch((err) =>
      console.warn('Firestore customer sync error:', err)
    );
    return newCustomer;
  };

  const updateCustomer = (id: string, updates: Partial<Customer>) => {
    setCustomers((prev) => {
      const next = prev.map((c) => {
        if (c.id !== id) return c;
        const updated = { ...c, ...updates };
        syncCustomerToFirestore(updated).catch((err) =>
          console.warn('Firestore customer sync error:', err)
        );
        return updated;
      });
      customersRef.current = next;
      return next;
    });
  };

  const deleteCustomer = (id: string) => {
    recordDeleted('customers', [id]);
    setCustomers((prev) => {
      const next = prev.filter((c) => c.id !== id);
      customersRef.current = next;
      return next;
    });
    removeCustomerFromFirestore(id).catch((err) =>
      console.warn('Firestore customer delete error:', err)
    );
  };

  const getCustomerByPhone = (phone: string): Customer | undefined => {
    const cleanSearch = normalizePhoneKey(phone);
    if (!cleanSearch) return undefined;
    return customersRef.current.find((c) => {
      const cleanCustomer = normalizePhoneKey(c.phone);
      return cleanCustomer !== '' && cleanCustomer === cleanSearch;
    });
  };

  const ensureCustomer = (
    name: string,
    phone: string,
    documentId?: string,
    state?: string,
    city?: string,
    explicitCustomerId?: string,
    address?: string
  ): Customer => {
    const currentCustomers = customersRef.current;
    const currentSettings = settingsRef.current;
    const cleanName = name && name.trim() ? name.trim() : 'Cliente Mostrador';
    const cleanPhone = phone && phone.trim() ? phone.trim() : '';
    const cleanAddress = address && address.trim() ? address.trim() : '';
    const normPhone = normalizePhoneKey(cleanPhone);
    const normDoc = normalizeDocumentKey(documentId);

    // 1. Honor explicit customerId ONLY if the name is compatible (never hijack another customer)
    if (explicitCustomerId) {
      const explicitMatch = currentCustomers.find((c) => c.id === explicitCustomerId);
      if (explicitMatch && areNamesCompatible(explicitMatch.name, cleanName)) {
        const updates: Partial<Customer> = {};
        if (normPhone && !normalizePhoneKey(explicitMatch.phone)) {
          updates.phone = cleanPhone;
        }
        if (normDoc && !normalizeDocumentKey(explicitMatch.documentId)) {
          updates.documentId = documentId!.trim().toUpperCase();
        }
        if (city && city.trim() && !explicitMatch.city) {
          updates.city = city.trim();
        }
        if (cleanAddress && !explicitMatch.address) {
          updates.address = cleanAddress;
        }
        if (Object.keys(updates).length > 0) {
          updateCustomer(explicitMatch.id, updates);
        }
        return { ...explicitMatch, ...updates };
      }
    }

    // 2. Truly generic walk-in client (only when name itself is generic AND no valid phone or doc)
    if (isGenericWalkInName(cleanName) && !normPhone && !normDoc) {
      const existingGeneric = currentCustomers.find((c) => isGenericWalkInName(c.name));
      if (existingGeneric) {
        return existingGeneric;
      }
      return addCustomer({
        name: 'Cliente Mostrador',
        phone: '00000000000',
        documentId: documentId || 'V-00000000',
        state: state || currentSettings.state,
        city: city || currentSettings.city,
        notes: 'Cliente mostrador / Venta directa sin registro previo',
      });
    }

    // 3. Find existing named customer by documentId, phone, or exact name — always checking name compatibility
    const normTargetName = normalizeNameKey(cleanName);
    let existing: Customer | undefined;

    if (normDoc) {
      existing = currentCustomers.find(
        (c) =>
          !isGenericWalkInName(c.name) &&
          normalizeDocumentKey(c.documentId) === normDoc &&
          areNamesCompatible(c.name, cleanName)
      );
    }

    if (!existing && normPhone) {
      existing = currentCustomers.find(
        (c) =>
          !isGenericWalkInName(c.name) &&
          normalizePhoneKey(c.phone) === normPhone &&
          areNamesCompatible(c.name, cleanName)
      );
    }

    if (!existing && !isGenericWalkInName(cleanName)) {
      existing = currentCustomers.find(
        (c) => !isGenericWalkInName(c.name) && normalizeNameKey(c.name) === normTargetName
      );
    }

    if (existing) {
      const updates: Partial<Customer> = {};
      if (cleanName && cleanName.length > existing.name.length && areNamesCompatible(existing.name, cleanName)) {
        updates.name = cleanName;
      }
      if (normPhone && !normalizePhoneKey(existing.phone)) {
        updates.phone = cleanPhone;
      }
      if (normDoc && !normalizeDocumentKey(existing.documentId)) {
        updates.documentId = documentId!.trim().toUpperCase();
      }
      if (state && !existing.state) updates.state = state;
      if (city && !existing.city) updates.city = city;
      if (cleanAddress && !existing.address) updates.address = cleanAddress;
      if (Object.keys(updates).length > 0) {
        updateCustomer(existing.id, updates);
      }
      return { ...existing, ...updates };
    }

    return addCustomer({
      name: cleanName,
      phone: cleanPhone || 'N/A',
      documentId: documentId && documentId.trim() ? documentId.trim().toUpperCase() : '',
      state: state || currentSettings.state,
      city: city && city.trim() ? city.trim() : currentSettings.city,
      ...(cleanAddress ? { address: cleanAddress } : {}),
    });
  };

  // Sales (POS) with BCV rate conversion (functional updaters + live salesRef + pending-sync queue)
  const createSale = (saleData: {
    customerId?: string;
    customerName: string;
    customerPhone: string;
    customerDocument?: string;
    items: SaleItem[];
    subtotal: number;
    discount: number;
    tax: number;
    total: number;
    paymentMethod: any;
    pagoMovilAccount?: PagoMovilAccountOption;
    paymentSplits?: SalePaymentSplit[];
    notes?: string;
    source?: 'POS' | 'TIENDA_ONLINE';
    paymentType?: SalePaymentType;
    creditDays?: number;
    creditDueDate?: string;
    creditPaidAmount?: number;
    creditPaidAmountBs?: number;
    creditInitialPaymentCurrency?: PaymentCurrencyMode;
    creditStatus?: 'PENDIENTE' | 'PAGADO';
    mercadolibreCommissionUSD?: number;
    mercadolibreCommissionRate?: number;
    mercadolibreFeeStatus?: 'PENDIENTE' | 'PAGADO';
    hasShipping?: boolean;
    shippingCostUSD?: number;
    shippingCostBs?: number;
    shippingCurrencyMode?: PaymentCurrencyMode;
    shippingState?: string;
    shippingAgency?: string;
    shippingNotes?: string;
    skipInventoryDeduction?: boolean;
  }): Sale => {
    const customer = ensureCustomer(
      saleData.customerName,
      saleData.customerPhone,
      saleData.customerDocument,
      undefined,
      undefined,
      saleData.customerId
    );

    // Auto-deduct inventory & sync updated product stocks to Firestore (skipped when settling an already-deducted Open Account)
    if (!saleData.skipInventoryDeduction) {
      setProducts((prevProducts) => {
        const touched: Product[] = [];
        const prevProdIdSet = new Set(prevProducts.map((p) => p.id));
        const next = prevProducts.map((prod) => {
          if (!productTracksInventory(prod)) return prod;
          const matchingItems = saleData.items.filter((item) => {
            if (item.isService) return false;
            if (item.productId && prevProdIdSet.has(item.productId)) {
              return item.productId === prod.id;
            }
            return (
              typeof item.sku === 'string' &&
              item.sku.trim().length > 0 &&
              typeof prod.sku === 'string' &&
              prod.sku.trim().length > 0 &&
              item.sku.trim().toLowerCase() === prod.sku.trim().toLowerCase()
            );
          });
          if (matchingItems.length > 0) {
            const totalQty = matchingItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
            const updatedStock = Math.max(0, prod.stock - totalQty);
            const updatedProd = { ...prod, stock: updatedStock };
            touched.push(updatedProd);
            return updatedProd;
          }
          return prod;
        });
        productsRef.current = next;
        queueMicrotask(() => {
          touched.forEach((p) => syncProductToFirestore(p).catch(() => {}));
        });
        return next;
      });
    }

    const year = new Date().getFullYear();
    const maxExistingSeq = salesRef.current.reduce((maxSeq, s) => {
      const match = (s.invoiceNumber || '').match(/FACT-\d+-(\d+)/);
      const seq = match ? parseInt(match[1], 10) : 0;
      return seq > maxSeq ? seq : maxSeq;
    }, 100);
    const invoiceNum = `FACT-${year}-${String(maxExistingSeq + 1).padStart(4, '0')}`;
    const rate = settingsRef.current.bcvRate;

    const saleId = `sale-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`;
    const resolvedPaymentType: SalePaymentType = saleData.paymentType || 'CONTADO';
    const rawSplits = Array.isArray(saleData.paymentSplits)
      ? saleData.paymentSplits.filter((sp) => (Number(sp.amountUSD) || 0) > 0)
      : [];
    const isMixto = resolvedPaymentType === 'MIXTO' && rawSplits.length > 0;

    let resolvedPaymentMethod: PaymentMethod = saleData.paymentMethod;
    let resolvedPagoMovilAccount: PagoMovilAccountOption | undefined =
      saleData.paymentMethod === 'Pago Móvil'
        ? saleData.pagoMovilAccount || 'BANESCO_PERSONAL'
        : undefined;

    // Monto efectivamente recibido en el momento de la venta
    const collectedUSD =
      resolvedPaymentType === 'CREDITO' || resolvedPaymentType === 'APARTADO'
        ? Math.max(0, Number(saleData.creditPaidAmount || 0))
        : Math.max(0, Number(saleData.total || 0));

    let linkedTreasuryAccountId: string | undefined;
    let linkedTreasuryAccountName: string | undefined;
    let linkedTreasuryMovementId: string | undefined;
    let resolvedPaymentSplits: SalePaymentSplit[] | undefined;

    if (isMixto) {
      const recordedSplits: SalePaymentSplit[] = [];
      let cashPartUSD = 0;
      let creditPartUSD = 0;

      for (let i = 0; i < rawSplits.length; i += 1) {
        const leg = rawSplits[i];
        const legUSD = Math.round((Number(leg.amountUSD) || 0) * 100) / 100;
        const explicitLegBs = Number(leg.amountBs);
        const legBs =
          !Number.isNaN(explicitLegBs) && explicitLegBs > 0
            ? Math.round(explicitLegBs * 100) / 100
            : Math.round(legUSD * rate * 100) / 100;
        const splitType = leg.splitType === 'CREDITO' ? 'CREDITO' : 'CONTADO';

        if (splitType === 'CREDITO') {
          creditPartUSD = Math.round((creditPartUSD + legUSD) * 100) / 100;
          recordedSplits.push({
            id: leg.id || `split-${Date.now()}-${i}`,
            splitType: 'CREDITO',
            paymentMethod: leg.paymentMethod,
            amountUSD: legUSD,
            amountBs: legBs,
            pagoMovilAccount: undefined,
            treasuryAccountId: undefined,
            treasuryAccountName: 'Cuenta por Cobrar (Crédito)',
            treasuryMovementId: undefined,
            reference: leg.reference?.trim() || undefined,
          });
        } else {
          cashPartUSD = Math.round((cashPartUSD + legUSD) * 100) / 100;
          const legPmAccount: PagoMovilAccountOption | undefined =
            leg.paymentMethod === 'Pago Móvil'
              ? leg.pagoMovilAccount || 'BANESCO_PERSONAL'
              : undefined;
          const treasuryIncome = recordAutomaticSaleIncomeInTreasury({
            saleId,
            invoiceNumber: invoiceNum,
            customerName: customer.name || saleData.customerName,
            amountUSD: legUSD,
            amountBs: legBs,
            bcvRate: rate,
            paymentMethod: leg.paymentMethod,
            pagoMovilAccount: legPmAccount,
            explicitAccountId: leg.treasuryAccountId,
            category: 'Ventas POS (Pago Mixto)',
            reference: leg.reference?.trim() || invoiceNum,
            notes: saleData.notes
              ? `${saleData.notes} · Pago Mixto (${i + 1}/${rawSplits.length})`
              : `Pago Mixto (${i + 1}/${rawSplits.length})`,
          });
          recordedSplits.push({
            id: leg.id || `split-${Date.now()}-${i}`,
            splitType: 'CONTADO',
            paymentMethod: leg.paymentMethod,
            amountUSD: legUSD,
            amountBs: legBs,
            pagoMovilAccount: legPmAccount,
            treasuryAccountId: treasuryIncome?.account.id || leg.treasuryAccountId,
            treasuryAccountName: treasuryIncome?.account.name || leg.treasuryAccountName,
            treasuryMovementId: treasuryIncome?.movement.id,
            reference: leg.reference?.trim() || undefined,
          });
        }
      }

      resolvedPaymentSplits = recordedSplits;
      const cashLegs = recordedSplits.filter((sp) => sp.splitType !== 'CREDITO');
      const primaryLeg = (cashLegs.length > 0 ? cashLegs : recordedSplits).reduce(
        (best, cur) => (cur.amountUSD > best.amountUSD ? cur : best),
        (cashLegs.length > 0 ? cashLegs : recordedSplits)[0]
      );
      if (primaryLeg) {
        resolvedPaymentMethod = primaryLeg.paymentMethod;
        resolvedPagoMovilAccount =
          primaryLeg.splitType !== 'CREDITO' && primaryLeg.paymentMethod === 'Pago Móvil'
            ? primaryLeg.pagoMovilAccount
            : undefined;
        linkedTreasuryAccountId = primaryLeg.treasuryAccountId;
        linkedTreasuryMovementId = primaryLeg.treasuryMovementId;
      }
      const uniqueAccNames = Array.from(
        new Set(recordedSplits.map((sp) => sp.treasuryAccountName).filter(Boolean) as string[])
      );
      linkedTreasuryAccountName = uniqueAccNames.join(' + ') || primaryLeg?.treasuryAccountName;

      // Si alguna parte es a crédito, vincular automáticamente a Cuentas por Cobrar
      if (creditPartUSD > 0.01) {
        saleData = {
          ...saleData,
          creditDays: saleData.creditDays || 15,
          creditDueDate: saleData.creditDueDate,
          creditPaidAmount: cashPartUSD,
          creditStatus: 'PENDIENTE',
        };
      }
    } else if (collectedUSD > 0) {
      const explicitCollectedBs = Number(saleData.creditPaidAmountBs);
      const collectedBs =
        (resolvedPaymentType === 'CREDITO' || resolvedPaymentType === 'APARTADO') &&
        !Number.isNaN(explicitCollectedBs) &&
        explicitCollectedBs > 0
          ? Math.round(explicitCollectedBs * 100) / 100
          : Math.round(collectedUSD * rate * 100) / 100;
      const treasuryIncome = recordAutomaticSaleIncomeInTreasury({
        saleId,
        invoiceNumber: invoiceNum,
        customerName: customer.name || saleData.customerName,
        amountUSD: collectedUSD,
        amountBs: collectedBs,
        bcvRate: rate,
        paymentMethod: saleData.paymentMethod,
        pagoMovilAccount: resolvedPagoMovilAccount,
        category:
          resolvedPaymentType === 'CREDITO' || resolvedPaymentType === 'APARTADO'
            ? 'Abono Inicial Venta'
            : resolvedPaymentType === 'MERCADOLIBRE'
              ? 'Venta MercadoLibre'
              : 'Ventas POS',
        notes: saleData.notes,
      });
      if (treasuryIncome) {
        linkedTreasuryAccountId = treasuryIncome.account.id;
        linkedTreasuryAccountName = treasuryIncome.account.name;
        linkedTreasuryMovementId = treasuryIncome.movement.id;
      }
    }

    const mixtoHasCredit =
      isMixto &&
      Array.isArray(resolvedPaymentSplits) &&
      resolvedPaymentSplits.some((sp) => sp.splitType === 'CREDITO' && sp.amountUSD > 0);

    const isDeferredSingle = resolvedPaymentType === 'CREDITO' || resolvedPaymentType === 'APARTADO';
    const resolvedInitialPaidBs =
      isDeferredSingle && collectedUSD > 0
        ? !Number.isNaN(Number(saleData.creditPaidAmountBs)) && Number(saleData.creditPaidAmountBs) > 0
          ? Math.round(Number(saleData.creditPaidAmountBs) * 100) / 100
          : Math.round(collectedUSD * rate * 100) / 100
        : undefined;
    const resolvedInitialCurrency: PaymentCurrencyMode | undefined =
      isDeferredSingle && collectedUSD > 0
        ? saleData.creditInitialPaymentCurrency ||
          (resolvedPaymentMethod === 'Pago Móvil' ||
          resolvedPaymentMethod === 'Efectivo Bs' ||
          resolvedPaymentMethod === 'Punto de Venta (Bs)' ||
          resolvedPaymentMethod === 'Transferencia Bancaria Bs'
            ? 'BS'
            : 'USD')
        : undefined;

    const newSale: Sale = {
      ...saleData,
      id: saleId,
      invoiceNumber: invoiceNum,
      customerId: customer.id,
      customerName: customer.name || saleData.customerName,
      customerPhone:
        saleData.customerPhone && saleData.customerPhone !== 'N/A'
          ? saleData.customerPhone
          : customer.phone || 'N/A',
      customerDocument:
        (saleData.customerDocument && saleData.customerDocument.trim()) ||
        customer.documentId ||
        undefined,
      bcvRate: rate,
      subtotalBs: saleData.subtotal * rate,
      totalBs:
        saleData.shippingCurrencyMode === 'BS' &&
        (saleData.shippingCostBs || 0) > 0 &&
        (saleData.shippingCostUSD || 0) > 0
          ? Math.round(
              ((saleData.total - (saleData.shippingCostUSD || 0)) * rate +
                (saleData.shippingCostBs || 0)) *
                100
            ) / 100
          : saleData.total * rate,
      paymentMethod: resolvedPaymentMethod,
      pagoMovilAccount: resolvedPagoMovilAccount,
      treasuryAccountId: linkedTreasuryAccountId,
      treasuryAccountName: linkedTreasuryAccountName,
      treasuryMovementId: linkedTreasuryMovementId,
      paymentSplits: resolvedPaymentSplits,
      createdAt: new Date().toISOString(),
      source: saleData.source || 'POS',
      paymentType: resolvedPaymentType,
      creditDays:
        resolvedPaymentType === 'CREDITO' || resolvedPaymentType === 'APARTADO' || mixtoHasCredit
          ? saleData.creditDays
          : undefined,
      creditDueDate:
        resolvedPaymentType === 'CREDITO' || resolvedPaymentType === 'APARTADO' || mixtoHasCredit
          ? saleData.creditDueDate
          : undefined,
      creditPaidAmount:
        resolvedPaymentType === 'CREDITO' || resolvedPaymentType === 'APARTADO' || mixtoHasCredit
          ? (saleData.creditPaidAmount ?? 0)
          : saleData.creditPaidAmount,
      creditPaidAmountBs: resolvedInitialPaidBs,
      creditInitialPaymentCurrency: resolvedInitialCurrency,
      creditStatus:
        resolvedPaymentType === 'CREDITO' || resolvedPaymentType === 'APARTADO' || mixtoHasCredit
          ? (saleData.creditStatus || 'PENDIENTE')
          : undefined,
      creditPayments: [],
      mercadolibreCommissionUSD: resolvedPaymentType === 'MERCADOLIBRE' ? (saleData.mercadolibreCommissionUSD || 0) : undefined,
      mercadolibreCommissionRate: resolvedPaymentType === 'MERCADOLIBRE' ? saleData.mercadolibreCommissionRate : undefined,
      mercadolibreFeeStatus: resolvedPaymentType === 'MERCADOLIBRE' ? (saleData.mercadolibreFeeStatus || 'PENDIENTE') : undefined,
    };

    const optimisticList = [newSale, ...salesRef.current];
    salesRef.current = optimisticList;

    setSales((prev) => {
      const next = prev.some((s) => s.id === newSale.id) ? prev : [newSale, ...prev];
      salesRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(next));
      } catch {}
      return next;
    });

    try {
      localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(optimisticList));
    } catch {}

    fetch('/api/sales', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(newSale),
      keepalive: true,
    }).catch((err) => {
      console.warn('Error guardando venta atómica en servidor:', err);
    });

    syncSaleWithRetry(newSale);

    return newSale;
  };

  const updateSale = (
    saleId: string,
    updates: Partial<Sale> & {
      reassignCustomer?: boolean;
      syncTreasuryPayment?: boolean;
      syncInventoryOnItemsChange?: boolean;
    }
  ): Sale | null => {
    const existing = salesRef.current.find((s) => s.id === saleId);
    if (!existing) return null;

    const {
      reassignCustomer,
      syncTreasuryPayment,
      syncInventoryOnItemsChange,
      ...saleUpdates
    } = updates;
    const isVoidedExisting = Boolean(existing.isVoided || existing.creditStatus === 'ANULADO');
    const nextName =
      saleUpdates.customerName !== undefined ? saleUpdates.customerName.trim() : existing.customerName;
    const nextPhone =
      saleUpdates.customerPhone !== undefined ? saleUpdates.customerPhone.trim() : existing.customerPhone;
    const nextDoc =
      saleUpdates.customerDocument !== undefined
        ? saleUpdates.customerDocument.trim()
        : existing.customerDocument;

    const identityChanged =
      reassignCustomer ||
      (saleUpdates.customerName !== undefined &&
        normalizeNameKey(saleUpdates.customerName) !== normalizeNameKey(existing.customerName)) ||
      (saleUpdates.customerPhone !== undefined &&
        normalizePhoneKey(saleUpdates.customerPhone) !== normalizePhoneKey(existing.customerPhone)) ||
      (saleUpdates.customerDocument !== undefined &&
        normalizeDocumentKey(saleUpdates.customerDocument) !== normalizeDocumentKey(existing.customerDocument));

    let resolvedCustomerId = saleUpdates.customerId || existing.customerId;
    let resolvedCustomerPhone = nextPhone || 'N/A';
    let resolvedCustomerDoc = nextDoc;

    if (identityChanged && !saleUpdates.customerId) {
      const cust = ensureCustomer(nextName, nextPhone || 'N/A', nextDoc);
      resolvedCustomerId = cust.id;
      if (!nextPhone && cust.phone) resolvedCustomerPhone = cust.phone;
      if (!nextDoc && cust.documentId) resolvedCustomerDoc = cust.documentId;
    }

    // Normalizar ítems y sincronizar inventario (reponer lo quitado / descontar lo agregado)
    const itemsWereProvided = Array.isArray(saleUpdates.items);
    const normalizedItems: SaleItem[] = itemsWereProvided
      ? (saleUpdates.items as SaleItem[]).map((it) => {
          const qty = Math.max(1, Math.round(Number(it.quantity) || 1));
          const unitPrice = Math.max(0, Math.round((Number(it.unitPrice) || 0) * 100) / 100);
          return {
            ...it,
            quantity: qty,
            unitPrice,
            total: Math.round(qty * unitPrice * 100) / 100,
          };
        })
      : existing.items;

    if (itemsWereProvided && !isVoidedExisting && syncInventoryOnItemsChange !== false) {
      const resolveProductIdForSaleItem = (item: SaleItem, catalog: Product[]): string | null => {
        if (item.isService) return null;
        if (item.productId) {
          const byId = catalog.find((p) => p.id === item.productId);
          if (byId) return byId.id;
        }
        const normSku = (item.sku || '').trim().toLowerCase();
        if (normSku) {
          const bySku = catalog.find((p) => (p.sku || '').trim().toLowerCase() === normSku);
          if (bySku) return bySku.id;
        }
        return null;
      };

      const oldQtyByProdId = new Map<string, number>();
      const newQtyByProdId = new Map<string, number>();
      const currentCatalog = productsRef.current;

      (existing.items || []).forEach((it) => {
        const pid = resolveProductIdForSaleItem(it, currentCatalog);
        if (!pid) return;
        oldQtyByProdId.set(pid, (oldQtyByProdId.get(pid) || 0) + Math.max(0, Number(it.quantity) || 0));
      });

      normalizedItems.forEach((it) => {
        const pid = resolveProductIdForSaleItem(it, currentCatalog);
        if (!pid) return;
        newQtyByProdId.set(pid, (newQtyByProdId.get(pid) || 0) + Math.max(0, Number(it.quantity) || 0));
      });

      const affectedIds = new Set<string>([
        ...Array.from(oldQtyByProdId.keys()),
        ...Array.from(newQtyByProdId.keys()),
      ]);

      const deltaByProdId = new Map<string, number>();
      affectedIds.forEach((pid) => {
        const oldQty = oldQtyByProdId.get(pid) || 0;
        const newQty = newQtyByProdId.get(pid) || 0;
        const stockDelta = oldQty - newQty; // positivo = reponer al inventario, negativo = descontar del inventario
        if (stockDelta !== 0) {
          deltaByProdId.set(pid, stockDelta);
        }
      });

      if (deltaByProdId.size > 0) {
        setProducts((prev) => {
          const touched: Product[] = [];
          const next = prev.map((prod) => {
            if (!productTracksInventory(prod)) return prod;
            const delta = deltaByProdId.get(prod.id);
            if (!delta) return prod;
            const updatedProd: Product = {
              ...prod,
              stock: Math.max(0, prod.stock + delta),
            };
            touched.push(updatedProd);
            return updatedProd;
          });
          productsRef.current = next;
          queueMicrotask(() => {
            touched.forEach((p) =>
              syncProductToFirestore(p).catch((err) =>
                console.warn('Firestore sync error al editar venta:', err)
              )
            );
          });
          return next;
        });
      }
    }

    const nextRate = saleUpdates.bcvRate ?? existing.bcvRate ?? settingsRef.current.bcvRate;
    const nextDiscount =
      saleUpdates.discount !== undefined
        ? Math.max(0, Math.round((Number(saleUpdates.discount) || 0) * 100) / 100)
        : existing.discount || 0;
    const nextShippingUSD =
      saleUpdates.shippingCostUSD !== undefined
        ? Math.max(0, Math.round((Number(saleUpdates.shippingCostUSD) || 0) * 100) / 100)
        : existing.shippingCostUSD || 0;
    const nextTax =
      saleUpdates.tax !== undefined
        ? Math.max(0, Math.round((Number(saleUpdates.tax) || 0) * 100) / 100)
        : existing.tax || 0;

    const computedItemsSubtotal = Math.round(
      normalizedItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0) * 100
    ) / 100;
    const nextSubtotal =
      saleUpdates.subtotal !== undefined
        ? Math.round((Number(saleUpdates.subtotal) || 0) * 100) / 100
        : itemsWereProvided
          ? computedItemsSubtotal
          : existing.subtotal;
    const nextTotal =
      saleUpdates.total !== undefined
        ? Math.max(0, Math.round((Number(saleUpdates.total) || 0) * 100) / 100)
        : itemsWereProvided || saleUpdates.discount !== undefined || saleUpdates.shippingCostUSD !== undefined
          ? Math.max(0, Math.round((nextSubtotal - nextDiscount + nextShippingUSD + nextTax) * 100) / 100)
          : existing.total;

    const totalChanged = Math.abs(nextTotal - existing.total) > 0.005;

    // Resolve payment type, payment method, payment splits, Pago Móvil destination & Treasury reconciliation
    const nextPaymentType: SalePaymentType = (saleUpdates.paymentType ?? existing.paymentType ?? 'CONTADO') as SalePaymentType;
    let nextPaymentMethod = (saleUpdates.paymentMethod ?? existing.paymentMethod) as PaymentMethod;
    const explicitAccountId = saleUpdates.treasuryAccountId;
    const explicitAccount = explicitAccountId
      ? treasuryAccountsRef.current.find((a) => a.id === explicitAccountId)
      : undefined;

    let nextPagoMovilAccount: PagoMovilAccountOption | undefined =
      nextPaymentMethod === 'Pago Móvil'
        ? saleUpdates.pagoMovilAccount ?? existing.pagoMovilAccount ?? 'BANESCO_PERSONAL'
        : undefined;

    if (nextPaymentMethod === 'Pago Móvil' && explicitAccount) {
      if (explicitAccount.id === 'acc-provincial' || /provincial/i.test(explicitAccount.name)) {
        nextPagoMovilAccount = 'PROVINCIAL';
      } else if (
        explicitAccount.id === 'acc-banesco-personal' ||
        /banesco\s*personal/i.test(explicitAccount.name)
      ) {
        nextPagoMovilAccount = 'BANESCO_PERSONAL';
      }
    }

    const incomingSplitsRaw =
      saleUpdates.paymentSplits !== undefined ? saleUpdates.paymentSplits : existing.paymentSplits;
    const validIncomingSplits = Array.isArray(incomingSplitsRaw)
      ? incomingSplitsRaw.filter((sp) => (Number(sp.amountUSD) || 0) > 0)
      : [];
    const isNextMixto = nextPaymentType === 'MIXTO' && validIncomingSplits.length > 0;
    const wasMixto =
      existing.paymentType === 'MIXTO' ||
      (Array.isArray(existing.paymentSplits) && existing.paymentSplits.length > 0);

    const isNextDeferred = nextPaymentType === 'CREDITO' || nextPaymentType === 'APARTADO';
    const paymentChanged =
      Boolean(syncTreasuryPayment) ||
      (totalChanged && !isNextDeferred) ||
      (saleUpdates.paymentType !== undefined && saleUpdates.paymentType !== existing.paymentType) ||
      saleUpdates.paymentSplits !== undefined ||
      (saleUpdates.paymentMethod !== undefined && saleUpdates.paymentMethod !== existing.paymentMethod) ||
      (saleUpdates.pagoMovilAccount !== undefined &&
        saleUpdates.pagoMovilAccount !== existing.pagoMovilAccount) ||
      (saleUpdates.treasuryAccountId !== undefined &&
        saleUpdates.treasuryAccountId !== (existing.treasuryAccountId || ''));

    let nextTreasuryAccountId = existing.treasuryAccountId;
    let nextTreasuryAccountName = existing.treasuryAccountName;
    let nextTreasuryMovementId = existing.treasuryMovementId;
    let nextPaymentSplits: SalePaymentSplit[] | undefined = isNextMixto
      ? existing.paymentSplits
      : undefined;
    let nextCreditPaidAmount = saleUpdates.creditPaidAmount ?? existing.creditPaidAmount;
    let nextCreditStatus = saleUpdates.creditStatus ?? existing.creditStatus;
    let nextCreditDays = saleUpdates.creditDays ?? existing.creditDays;
    let nextCreditDueDate = saleUpdates.creditDueDate ?? existing.creditDueDate;

    // Recalcular estado de crédito/apartado si cambió el total de la venta
    if (totalChanged && !isVoidedExisting && isNextDeferred) {
      const paidNow = Math.max(0, Number(nextCreditPaidAmount || 0));
      nextCreditStatus = paidNow >= nextTotal - 0.01 && nextTotal > 0 ? 'PAGADO' : 'PENDIENTE';
    }

    if (paymentChanged) {
      const isVoidedSale = Boolean(existing.isVoided || existing.creditStatus === 'ANULADO');
      const existingSplitMovIds = new Set(
        (existing.paymentSplits || [])
          .map((sp) => sp.treasuryMovementId)
          .filter(Boolean) as string[]
      );
      const linkedSaleMovements = treasuryMovementsRef.current.filter(
        (m) =>
          (m.saleId === saleId &&
            m.type === 'INGRESO' &&
            m.category !== 'Cobro Cuentas por Cobrar') ||
          (existing.treasuryMovementId && m.id === existing.treasuryMovementId) ||
          existingSplitMovIds.has(m.id)
      );

      if (isNextMixto) {
        const subsequentPaymentsSum = (existing.creditPayments || []).reduce(
          (sum, p) => sum + (Number(p.amountUSD) || 0),
          0
        );
        let cashPartUSD = 0;
        let creditPartUSD = 0;

        if (!isVoidedSale) {
          // Revert all previous initial-sale Treasury movements before recording new split legs
          linkedSaleMovements.forEach((m) => deleteTreasuryMovement(m.id, true));

          const recordedSplits: SalePaymentSplit[] = [];
          const movDate = existing.createdAt ? existing.createdAt.split('T')[0] : undefined;
          for (let i = 0; i < validIncomingSplits.length; i += 1) {
            const leg = validIncomingSplits[i];
            const legUSD = Math.round((Number(leg.amountUSD) || 0) * 100) / 100;
            const explicitLegBs = Number(leg.amountBs);
            const legBs =
              !Number.isNaN(explicitLegBs) && explicitLegBs > 0
                ? Math.round(explicitLegBs * 100) / 100
                : Math.round(legUSD * nextRate * 100) / 100;
            const splitType = leg.splitType === 'CREDITO' ? 'CREDITO' : 'CONTADO';

            if (splitType === 'CREDITO') {
              creditPartUSD = Math.round((creditPartUSD + legUSD) * 100) / 100;
              recordedSplits.push({
                id: leg.id || `split-${Date.now()}-${i}`,
                splitType: 'CREDITO',
                paymentMethod: leg.paymentMethod,
                amountUSD: legUSD,
                amountBs: legBs,
                pagoMovilAccount: undefined,
                treasuryAccountId: undefined,
                treasuryAccountName: 'Cuenta por Cobrar (Crédito)',
                treasuryMovementId: undefined,
                reference: leg.reference?.trim() || undefined,
              });
            } else {
              cashPartUSD = Math.round((cashPartUSD + legUSD) * 100) / 100;
              const legExplicitAcc = leg.treasuryAccountId
                ? treasuryAccountsRef.current.find((a) => a.id === leg.treasuryAccountId)
                : undefined;
              let legPmAccount: PagoMovilAccountOption | undefined =
                leg.paymentMethod === 'Pago Móvil'
                  ? leg.pagoMovilAccount || 'BANESCO_PERSONAL'
                  : undefined;
              if (leg.paymentMethod === 'Pago Móvil' && legExplicitAcc) {
                if (legExplicitAcc.id === 'acc-provincial' || /provincial/i.test(legExplicitAcc.name)) {
                  legPmAccount = 'PROVINCIAL';
                } else if (
                  legExplicitAcc.id === 'acc-banesco-personal' ||
                  /banesco\s*personal/i.test(legExplicitAcc.name)
                ) {
                  legPmAccount = 'BANESCO_PERSONAL';
                }
              }
              const incomeRes = recordAutomaticSaleIncomeInTreasury({
                saleId,
                invoiceNumber: existing.invoiceNumber,
                customerName: nextName || existing.customerName,
                amountUSD: legUSD,
                amountBs: legBs,
                bcvRate: nextRate,
                paymentMethod: leg.paymentMethod,
                pagoMovilAccount: legPmAccount,
                explicitAccountId: legExplicitAcc?.id,
                date: movDate,
                category: 'Ventas POS (Pago Mixto)',
                reference: leg.reference?.trim() || existing.invoiceNumber,
                notes:
                  (saleUpdates.notes !== undefined ? saleUpdates.notes.trim() : existing.notes) ||
                  `Pago Mixto (${i + 1}/${validIncomingSplits.length})`,
              });
              recordedSplits.push({
                id: leg.id || `split-${Date.now()}-${i}`,
                splitType: 'CONTADO',
                paymentMethod: leg.paymentMethod,
                amountUSD: legUSD,
                amountBs: legBs,
                pagoMovilAccount: legPmAccount,
                treasuryAccountId: incomeRes?.account.id || leg.treasuryAccountId,
                treasuryAccountName: incomeRes?.account.name || leg.treasuryAccountName,
                treasuryMovementId: incomeRes?.movement.id,
                reference: leg.reference?.trim() || undefined,
              });
            }
          }

          nextPaymentSplits = recordedSplits;
          const cashLegs = recordedSplits.filter((sp) => sp.splitType !== 'CREDITO');
          const primaryLeg = (cashLegs.length > 0 ? cashLegs : recordedSplits).reduce(
            (best, cur) => (cur.amountUSD > best.amountUSD ? cur : best),
            (cashLegs.length > 0 ? cashLegs : recordedSplits)[0]
          );
          if (primaryLeg) {
            nextPaymentMethod = primaryLeg.paymentMethod;
            nextPagoMovilAccount =
              primaryLeg.splitType !== 'CREDITO' && primaryLeg.paymentMethod === 'Pago Móvil'
                ? primaryLeg.pagoMovilAccount
                : undefined;
            nextTreasuryAccountId = primaryLeg.treasuryAccountId;
            nextTreasuryMovementId = primaryLeg.treasuryMovementId;
          }
          const uniqueAccNames = Array.from(
            new Set(recordedSplits.map((sp) => sp.treasuryAccountName).filter(Boolean) as string[])
          );
          nextTreasuryAccountName = uniqueAccNames.join(' + ') || primaryLeg?.treasuryAccountName;

          if (creditPartUSD > 0.01) {
            const totalPaidNow = Math.min(
              nextTotal,
              Math.round((cashPartUSD + subsequentPaymentsSum) * 100) / 100
            );
            nextCreditPaidAmount = totalPaidNow;
            nextCreditStatus = totalPaidNow >= nextTotal - 0.01 ? 'PAGADO' : 'PENDIENTE';
            nextCreditDays = nextCreditDays || 15;
          } else {
            nextCreditPaidAmount = undefined;
            nextCreditStatus = undefined;
            nextCreditDays = undefined;
            nextCreditDueDate = undefined;
          }
        } else {
          // Voided sale: update split metadata without altering Treasury balances
          nextPaymentSplits = validIncomingSplits.map((leg, i) => {
            const legUSD = Math.round((Number(leg.amountUSD) || 0) * 100) / 100;
            const explicitLegBs = Number(leg.amountBs);
            const legBs =
              !Number.isNaN(explicitLegBs) && explicitLegBs > 0
                ? Math.round(explicitLegBs * 100) / 100
                : Math.round(legUSD * nextRate * 100) / 100;
            const splitType = leg.splitType === 'CREDITO' ? 'CREDITO' : 'CONTADO';
            const legAcc =
              splitType !== 'CREDITO' && leg.treasuryAccountId
                ? treasuryAccountsRef.current.find((a) => a.id === leg.treasuryAccountId)
                : undefined;
            return {
              ...leg,
              id: leg.id || `split-${Date.now()}-${i}`,
              splitType,
              amountUSD: legUSD,
              amountBs: legBs,
              treasuryAccountName:
                splitType === 'CREDITO'
                  ? 'Cuenta por Cobrar (Crédito)'
                  : legAcc?.name || leg.treasuryAccountName,
              treasuryMovementId: undefined,
            };
          });
          const primaryLeg = nextPaymentSplits[0];
          if (primaryLeg) {
            nextPaymentMethod = primaryLeg.paymentMethod;
            nextPagoMovilAccount =
              primaryLeg.splitType !== 'CREDITO' && primaryLeg.paymentMethod === 'Pago Móvil'
                ? primaryLeg.pagoMovilAccount
                : undefined;
            nextTreasuryAccountId = primaryLeg.treasuryAccountId;
          }
          nextTreasuryAccountName =
            Array.from(
              new Set(nextPaymentSplits.map((sp) => sp.treasuryAccountName).filter(Boolean) as string[])
            ).join(' + ') || undefined;
          nextTreasuryMovementId = undefined;
        }
      } else {
        // Single-payment destination
        nextPaymentSplits = undefined;
        if (nextPaymentType !== 'CREDITO' && nextPaymentType !== 'APARTADO') {
          nextCreditPaidAmount = undefined;
          nextCreditStatus = existing.isVoided ? existing.creditStatus : undefined;
          nextCreditDays = undefined;
          nextCreditDueDate = undefined;
        }
        const targetAccount =
          explicitAccount ||
          resolveOrCreateTreasuryAccountForSale(nextPaymentMethod, nextPagoMovilAccount);

        if (!isVoidedSale && (wasMixto || linkedSaleMovements.length > 1)) {
          // Transitioning from multi-movement MIXTO to single payment: revert all old movements and create one clean movement
          linkedSaleMovements.forEach((m) => deleteTreasuryMovement(m.id, true));

          const isDeferred = nextPaymentType === 'CREDITO' || nextPaymentType === 'APARTADO';
          const subsequentPaymentsSum = (existing.creditPayments || []).reduce(
            (sum, p) => sum + (Number(p.amountUSD) || 0),
            0
          );
          const initialCollectedUSD = isDeferred
            ? Math.max(
                0,
                Math.round(((existing.creditPaidAmount || 0) - subsequentPaymentsSum) * 100) / 100
              )
            : Math.max(0, Math.round((Number(nextTotal) || 0) * 100) / 100);

          if (initialCollectedUSD > 0) {
            const incomeRes = recordAutomaticSaleIncomeInTreasury({
              saleId,
              invoiceNumber: existing.invoiceNumber,
              customerName: nextName || existing.customerName,
              amountUSD: initialCollectedUSD,
              bcvRate: nextRate,
              paymentMethod: nextPaymentMethod,
              pagoMovilAccount: nextPagoMovilAccount,
              explicitAccountId: targetAccount.id,
              date: existing.createdAt ? existing.createdAt.split('T')[0] : undefined,
              category: isDeferred
                ? 'Abono Inicial Venta'
                : nextPaymentType === 'MERCADOLIBRE'
                  ? 'Venta MercadoLibre'
                  : 'Ventas POS',
              notes: saleUpdates.notes !== undefined ? saleUpdates.notes : existing.notes,
            });
            if (incomeRes) {
              nextTreasuryAccountId = incomeRes.account.id;
              nextTreasuryAccountName = incomeRes.account.name;
              nextTreasuryMovementId = incomeRes.movement.id;
            }
          } else {
            nextTreasuryAccountId = targetAccount.id;
            nextTreasuryAccountName = targetAccount.name;
            nextTreasuryMovementId = undefined;
          }
        } else {
          const linkedMovement = linkedSaleMovements[0];

          if (!isVoidedSale && linkedMovement) {
            const movAmountUSD = Math.round((Number(linkedMovement.amountUSD) || 0) * 100) / 100;
            const movRate =
              linkedMovement.bcvRate && linkedMovement.bcvRate > 0 ? linkedMovement.bcvRate : nextRate;
            const movAmountBs =
              Math.round((Number(linkedMovement.amountBs) || movAmountUSD * movRate) * 100) / 100;

            const isDeferredSingle = nextPaymentType === 'CREDITO' || nextPaymentType === 'APARTADO';
            const desiredMovUSD = isDeferredSingle
              ? movAmountUSD
              : Math.max(0, Math.round((Number(nextTotal) || 0) * 100) / 100);
            const desiredMovBs =
              Math.abs(desiredMovUSD - movAmountUSD) < 0.005
                ? movAmountBs
                : Math.round(desiredMovUSD * movRate * 100) / 100;

            // 1. Revert income from previous Treasury account
            const oldAccount = treasuryAccountsRef.current.find(
              (a) => a.id === linkedMovement.accountId
            );
            if (oldAccount && movAmountUSD > 0) {
              const oldNativeRevert = oldAccount.currency === 'BS' ? -movAmountBs : -movAmountUSD;
              applyAccountDelta(oldAccount, -movAmountUSD, movRate, oldNativeRevert);
            }

            // 2. Credit updated income to destination Treasury account (re-fetch fresh reference)
            const freshTarget =
              treasuryAccountsRef.current.find((a) => a.id === targetAccount.id) || targetAccount;
            const newNativeDelta = freshTarget.currency === 'BS' ? desiredMovBs : desiredMovUSD;
            const updatedTargetAcc =
              desiredMovUSD > 0
                ? applyAccountDelta(freshTarget, desiredMovUSD, movRate, newNativeDelta)
                : freshTarget;

            const methodDetail =
              nextPaymentMethod === 'Pago Móvil'
                ? `Pago Móvil (${updatedTargetAcc.name})`
                : nextPaymentMethod === 'Punto de Venta (Bs)'
                  ? `Punto de Venta · ${updatedTargetAcc.name}`
                  : `${nextPaymentMethod} · ${updatedTargetAcc.name}`;

            const updatedMovement: TreasuryMovement = {
              ...linkedMovement,
              amountUSD: desiredMovUSD,
              amountBs: desiredMovBs,
              accountId: updatedTargetAcc.id,
              accountName: updatedTargetAcc.name,
              accountGroup: updatedTargetAcc.group,
              description: `${existing.invoiceNumber} · ${nextName || existing.customerName} (${methodDetail})`,
              notes:
                (saleUpdates.notes !== undefined ? saleUpdates.notes.trim() : existing.notes) ||
                undefined,
              updatedAt: new Date().toISOString(),
            };

            pendingSyncTreasuryMovementIdsRef.current.add(updatedMovement.id);
            const nextMovements = treasuryMovementsRef.current
              .map((m) => (m.id === updatedMovement.id ? updatedMovement : m))
              .sort(
                (a, b) =>
                  (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
                  (b.createdAt || '').localeCompare(a.createdAt || '')
              );
            treasuryMovementsRef.current = nextMovements;
            setTreasuryMovements(nextMovements);
            try {
              localStorage.setItem(STORAGE_KEYS.TREASURY_MOVEMENTS, JSON.stringify(nextMovements));
            } catch {}
            syncTreasuryMovementToFirestore(updatedMovement)
              .then(() => pendingSyncTreasuryMovementIdsRef.current.delete(updatedMovement.id))
              .catch(() => {});

            nextTreasuryAccountId = updatedTargetAcc.id;
            nextTreasuryAccountName = updatedTargetAcc.name;
            nextTreasuryMovementId = updatedMovement.id;
          } else if (!isVoidedSale) {
            // Legacy sale without a Treasury movement yet: compute initial collected amount and link it
            const isDeferred = nextPaymentType === 'CREDITO' || nextPaymentType === 'APARTADO';
            const subsequentPaymentsSum = (existing.creditPayments || []).reduce(
              (sum, p) => sum + (Number(p.amountUSD) || 0),
              0
            );
            const initialCollectedUSD = isDeferred
              ? Math.max(
                  0,
                  Math.round(((existing.creditPaidAmount || 0) - subsequentPaymentsSum) * 100) / 100
                )
              : Math.max(0, Math.round((Number(nextTotal) || 0) * 100) / 100);

            if (initialCollectedUSD > 0) {
              const incomeRes = recordAutomaticSaleIncomeInTreasury({
                saleId,
                invoiceNumber: existing.invoiceNumber,
                customerName: nextName || existing.customerName,
                amountUSD: initialCollectedUSD,
                bcvRate: nextRate,
                paymentMethod: nextPaymentMethod,
                pagoMovilAccount: nextPagoMovilAccount,
                explicitAccountId: targetAccount.id,
                date: existing.createdAt ? existing.createdAt.split('T')[0] : undefined,
                category: isDeferred
                  ? 'Abono Inicial Venta'
                  : nextPaymentType === 'MERCADOLIBRE'
                    ? 'Venta MercadoLibre'
                    : 'Ventas POS',
                notes: saleUpdates.notes !== undefined ? saleUpdates.notes : existing.notes,
              });
              if (incomeRes) {
                nextTreasuryAccountId = incomeRes.account.id;
                nextTreasuryAccountName = incomeRes.account.name;
                nextTreasuryMovementId = incomeRes.movement.id;
              }
            } else {
              nextTreasuryAccountId = targetAccount.id;
              nextTreasuryAccountName = targetAccount.name;
            }
          } else {
            // Voided sale: update metadata only without altering Treasury liquidity
            nextTreasuryAccountId = targetAccount.id;
            nextTreasuryAccountName = targetAccount.name;
          }
        }
      }
    }

    const nextMercadoLibreCommissionUSD =
      nextPaymentType === 'MERCADOLIBRE' &&
      totalChanged &&
      existing.mercadolibreCommissionRate &&
      existing.mercadolibreFeeStatus !== 'PAGADO'
        ? Math.round(nextTotal * (existing.mercadolibreCommissionRate / 100) * 100) / 100
        : saleUpdates.mercadolibreCommissionUSD ?? existing.mercadolibreCommissionUSD;

    const updatedSale: Sale = {
      ...existing,
      ...saleUpdates,
      items: normalizedItems,
      customerId: resolvedCustomerId,
      customerName: nextName || existing.customerName,
      customerPhone: resolvedCustomerPhone,
      customerDocument: resolvedCustomerDoc || undefined,
      bcvRate: nextRate,
      discount: nextDiscount,
      shippingCostUSD: nextShippingUSD > 0 ? nextShippingUSD : existing.shippingCostUSD,
      tax: nextTax,
      subtotal: nextSubtotal,
      total: nextTotal,
      subtotalBs: Math.round(nextSubtotal * nextRate * 100) / 100,
      totalBs: Math.round(nextTotal * nextRate * 100) / 100,
      paymentType: nextPaymentType,
      paymentMethod: nextPaymentMethod,
      pagoMovilAccount: nextPagoMovilAccount,
      treasuryAccountId: nextTreasuryAccountId,
      treasuryAccountName: nextTreasuryAccountName,
      treasuryMovementId: nextTreasuryMovementId,
      paymentSplits: nextPaymentSplits,
      creditDays: nextCreditDays,
      creditDueDate: nextCreditDueDate,
      creditPaidAmount: nextCreditPaidAmount,
      creditStatus: nextCreditStatus,
      mercadolibreCommissionUSD: nextMercadoLibreCommissionUSD,
    };

    setSales((prev) => {
      const next = prev.map((s) => (s.id === saleId ? updatedSale : s));
      salesRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(next));
      } catch {}
      return next;
    });

    if (selectedInvoice?.id === saleId) {
      setSelectedInvoice(updatedSale);
    }

    fetch(`/api/sales/${saleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSale),
      keepalive: true,
    }).catch((err) => {
      console.warn('Error actualizando factura en servidor:', err);
    });

    syncSaleWithRetry(updatedSale);

    return updatedSale;
  };

  const updateSaleCreditStatus = (
    saleId: string,
    status: 'PENDIENTE' | 'PAGADO',
    paidAmount?: number
  ) => {
    let updatedSale: Sale | null = null;
    setSales((prev) => {
      const next = prev.map((s) => {
        if (s.id !== saleId) return s;
        updatedSale = {
          ...s,
          creditStatus: status,
          creditPaidAmount:
            paidAmount !== undefined ? paidAmount : status === 'PAGADO' ? s.total : s.creditPaidAmount,
        };
        return updatedSale;
      });
      salesRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(next));
      } catch {}
      return next;
    });

    if (!updatedSale) {
      const target = salesRef.current.find((s) => s.id === saleId);
      if (target) {
        updatedSale = {
          ...target,
          creditStatus: status,
          creditPaidAmount:
            paidAmount !== undefined ? paidAmount : status === 'PAGADO' ? target.total : target.creditPaidAmount,
        };
      }
    }

    if (updatedSale) {
      fetch(`/api/sales/${saleId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(updatedSale),
        keepalive: true,
      }).catch((err) => {
        console.warn('Error actualizando crédito de venta en servidor:', err);
      });
      syncSaleWithRetry(updatedSale);
    }
  };

  const recordCreditPayment = (
    saleId: string,
    payment: {
      amountUSD: number;
      amountBs?: number;
      currencyMode?: PaymentCurrencyMode;
      paymentMethod: any;
      pagoMovilAccount?: PagoMovilAccountOption;
      reference?: string;
      notes?: string;
    }
  ) => {
    const rate = settingsRef.current.bcvRate;
    const existingSale = salesRef.current.find((s) => s.id === saleId);
    if (!existingSale) return null;

    const currentPaid = existingSale.creditPaidAmount || 0;
    const cleanUSD = Math.round((Number(payment.amountUSD) || 0) * 100) / 100;
    const explicitBs = Number(payment.amountBs);
    const cleanBs =
      !Number.isNaN(explicitBs) && explicitBs > 0
        ? Math.round(explicitBs * 100) / 100
        : Math.round(cleanUSD * rate * 100) / 100;
    const rawNewPaid = Math.round((currentPaid + cleanUSD) * 100) / 100;
    const isPaidFull = rawNewPaid >= existingSale.total - 0.02;
    const newPaid = isPaidFull ? Math.min(existingSale.total, Math.max(rawNewPaid, existingSale.total)) : rawNewPaid;

    const resolvedPagoMovilAccount: PagoMovilAccountOption | undefined =
      payment.paymentMethod === 'Pago Móvil'
        ? payment.pagoMovilAccount || 'BANESCO_PERSONAL'
        : undefined;

    const resolvedCurrencyMode: PaymentCurrencyMode =
      payment.currencyMode ||
      (payment.paymentMethod === 'Pago Móvil' ||
      payment.paymentMethod === 'Efectivo Bs' ||
      payment.paymentMethod === 'Punto de Venta (Bs)' ||
      payment.paymentMethod === 'Transferencia Bancaria Bs'
        ? 'BS'
        : 'USD');

    const treasuryIncome =
      cleanUSD > 0
        ? recordAutomaticSaleIncomeInTreasury({
            saleId: existingSale.id,
            invoiceNumber: existingSale.invoiceNumber,
            customerName: existingSale.customerName,
            amountUSD: cleanUSD,
            amountBs: cleanBs,
            bcvRate: rate,
            paymentMethod: payment.paymentMethod,
            pagoMovilAccount: resolvedPagoMovilAccount,
            category: 'Cobro Cuentas por Cobrar',
            reference: payment.reference || existingSale.invoiceNumber,
            notes: payment.notes,
          })
        : null;

    const paymentRecord: CreditPaymentRecord = {
      id: `pay-${Date.now()}`,
      date: new Date().toISOString(),
      amountUSD: cleanUSD,
      amountBs: cleanBs,
      currencyMode: resolvedCurrencyMode,
      bcvRate: rate,
      paymentMethod: payment.paymentMethod,
      pagoMovilAccount: resolvedPagoMovilAccount,
      treasuryAccountId: treasuryIncome?.account.id,
      treasuryAccountName: treasuryIncome?.account.name,
      treasuryMovementId: treasuryIncome?.movement.id,
      reference: payment.reference,
      notes: payment.notes,
    };

    const updatedSale: Sale = {
      ...existingSale,
      creditPaidAmount: newPaid,
      creditStatus: isPaidFull ? 'PAGADO' : 'PENDIENTE',
      creditPayments: [...(existingSale.creditPayments || []), paymentRecord],
    };

    const nextSalesList = salesRef.current.map((s) => (s.id === saleId ? updatedSale : s));
    salesRef.current = nextSalesList;

    setSales(nextSalesList);
    try {
      localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(nextSalesList));
    } catch {}

    // Compute total remaining debt across all active pending accounts of this customer after applying the payment
    const normDoc = (d?: string) => (d || '').replace(/\D/g, '');
    const normPhone = (p?: string) => {
      const digits = (p || '').replace(/\D/g, '');
      return digits.length >= 7 ? digits.slice(-10) : '';
    };
    const normName = (n?: string) => (n || '').trim().toLowerCase();

    const targetDoc = normDoc(updatedSale.customerDocument);
    const targetPhone = normPhone(updatedSale.customerPhone);
    const targetName = normName(updatedSale.customerName);

    const totalCustomerDebtAfterUSD = Math.round(
      nextSalesList
        .filter((s) => {
          if (!isSaleWithCredit(s)) return false;
          if (s.isVoided || s.creditStatus === 'ANULADO' || s.creditStatus === 'PAGADO') return false;
          const matchesId = Boolean(updatedSale.customerId && s.customerId === updatedSale.customerId);
          const matchesDoc = Boolean(targetDoc.length >= 5 && normDoc(s.customerDocument) === targetDoc);
          const matchesPhone = Boolean(targetPhone && normPhone(s.customerPhone) === targetPhone);
          const matchesName = Boolean(
            targetName &&
              targetName !== 'cliente mostrador' &&
              normName(s.customerName) === targetName
          );
          return matchesId || matchesDoc || matchesPhone || matchesName;
        })
        .reduce((sum, s) => sum + Math.max(0, s.total - (s.creditPaidAmount || 0)), 0) * 100
    ) / 100;

    fetch(`/api/sales/${saleId}`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(updatedSale),
      keepalive: true,
    }).catch((err) => {
      console.warn('Error registrando abono en servidor:', err);
    });
    syncSaleWithRetry(updatedSale);

    return { updatedSale, paymentRecord, totalCustomerDebtAfterUSD };
  };

  const deleteSale = async (saleId: string, restoreStock: boolean = false): Promise<boolean> => {
    const saleToDelete = salesRef.current.find((s) => s.id === saleId);
    clearSalePendingSync(saleId);
    recordDeleted('sales', [saleId]);

    // Revertir ingresos automáticos vinculados en Tesorería para no inflar liquidez (incluye Pago Mixto)
    const splitMovIds = new Set(
      (saleToDelete?.paymentSplits || [])
        .map((sp) => sp.treasuryMovementId)
        .filter(Boolean) as string[]
    );
    const linkedMovements = treasuryMovementsRef.current.filter(
      (m) =>
        m.saleId === saleId ||
        (saleToDelete?.treasuryMovementId && m.id === saleToDelete.treasuryMovementId) ||
        splitMovIds.has(m.id)
    );
    linkedMovements.forEach((m) => deleteTreasuryMovement(m.id, true));

    if (restoreStock && saleToDelete && Array.isArray(saleToDelete.items)) {
      setProducts((prev) => {
        const touched: Product[] = [];
        const next = prev.map((prod) => {
          if (!productTracksInventory(prod)) return prod;
          const item = saleToDelete.items.find((it) => it.productId === prod.id || it.sku === prod.sku);
          if (item && !item.isService) {
            const updatedProd = { ...prod, stock: prod.stock + (item.quantity || 1) };
            touched.push(updatedProd);
            return updatedProd;
          }
          return prod;
        });
        productsRef.current = next;
        queueMicrotask(() => {
          touched.forEach((p) => syncProductToFirestore(p).catch(() => {}));
        });
        return next;
      });
    }

    setSales((prev) => {
      const next = prev.filter((s) => s.id !== saleId);
      salesRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(next));
      } catch {}
      return next;
    });

    removeSaleFromFirestore(saleId).catch((err) =>
      console.warn('Firestore delete sale error:', err)
    );

    try {
      await fetch(`/api/sales/${saleId}`, {
        method: 'DELETE',
        keepalive: true,
      });
    } catch (err) {
      console.warn('Error eliminando venta en servidor:', err);
    }
    return true;
  };

  const voidSale = async (
    saleId: string,
    reason: string = 'Anulada por administración / cuenta no reconocida',
    restoreStock: boolean = false
  ): Promise<boolean> => {
    const saleToVoid = salesRef.current.find((s) => s.id === saleId);
    if (!saleToVoid) return false;

    if (restoreStock && Array.isArray(saleToVoid.items)) {
      setProducts((prev) => {
        const touched: Product[] = [];
        const next = prev.map((prod) => {
          if (!productTracksInventory(prod)) return prod;
          const item = saleToVoid.items.find((it) => it.productId === prod.id || it.sku === prod.sku);
          if (item && !item.isService) {
            const updatedProd = { ...prod, stock: prod.stock + (item.quantity || 1) };
            touched.push(updatedProd);
            return updatedProd;
          }
          return prod;
        });
        productsRef.current = next;
        queueMicrotask(() => {
          touched.forEach((p) => syncProductToFirestore(p).catch(() => {}));
        });
        return next;
      });
    }

    // Revertir ingresos automáticos vinculados en Tesorería al anular la venta (incluye Pago Mixto)
    const splitMovIds = new Set(
      (saleToVoid.paymentSplits || [])
        .map((sp) => sp.treasuryMovementId)
        .filter(Boolean) as string[]
    );
    const linkedMovements = treasuryMovementsRef.current.filter(
      (m) =>
        m.saleId === saleId ||
        (saleToVoid.treasuryMovementId && m.id === saleToVoid.treasuryMovementId) ||
        splitMovIds.has(m.id)
    );
    linkedMovements.forEach((m) => deleteTreasuryMovement(m.id, true));

    const now = new Date().toISOString();
    const updatedTargetSale: Sale = {
      ...saleToVoid,
      creditStatus: 'ANULADO' as SaleCreditStatus,
      isVoided: true,
      voidedAt: now,
      voidReason: reason,
      treasuryMovementId: undefined,
      paymentSplits: saleToVoid.paymentSplits
        ? saleToVoid.paymentSplits.map((sp) => ({ ...sp, treasuryMovementId: undefined }))
        : undefined,
    };

    setSales((prev) => {
      const next = prev.map((s) => (s.id === saleId ? updatedTargetSale : s));
      salesRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(next));
      } catch {}
      return next;
    });

    syncSaleWithRetry(updatedTargetSale);

    try {
      await fetch(`/api/sales/void/${saleId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason, restoreStock }),
        keepalive: true,
      });
    } catch (err) {
      console.warn('Error anulando venta en servidor:', err);
    }
    return true;
  };

  const reactivateSale = async (saleId: string): Promise<boolean> => {
    const sale = salesRef.current.find((s) => s.id === saleId);
    if (!sale) return false;

    const isDeferred = isSaleWithCredit(sale);
    const isPaid =
      !isDeferred || (sale.creditPaidAmount || 0) >= sale.total;
    const updatedTargetSale: Sale = {
      ...sale,
      creditStatus: (isPaid ? 'PAGADO' : 'PENDIENTE') as SaleCreditStatus,
      isVoided: false,
      voidedAt: undefined,
      voidReason: undefined,
    };

    setSales((prev) => {
      const next = prev.map((s) => (s.id === saleId ? updatedTargetSale : s));
      salesRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(next));
      } catch {}
      return next;
    });

    syncSaleWithRetry(updatedTargetSale);

    try {
      await fetch(`/api/sales/reactivate/${saleId}`, {
        method: 'POST',
        keepalive: true,
      });
    } catch (err) {
      console.warn('Error reactivando venta en servidor:', err);
    }
    return true;
  };

  const deleteCustomerCreditSales = async (
    customerIdOrPhoneOrIds: string | string[],
    restoreStock: boolean = false
  ): Promise<number> => {
    const currentSales = salesRef.current;
    let targetSales: Sale[] = [];
    if (Array.isArray(customerIdOrPhoneOrIds)) {
      const explicitIds = new Set(customerIdOrPhoneOrIds);
      targetSales = currentSales.filter(
        (s) => isSaleWithCredit(s) && explicitIds.has(s.id)
      );
    } else {
      const normSearchPhone = normalizePhoneKey(customerIdOrPhoneOrIds);
      targetSales = currentSales.filter(
        (s) =>
          isSaleWithCredit(s) &&
          (s.customerId === customerIdOrPhoneOrIds ||
            (normSearchPhone !== '' && normalizePhoneKey(s.customerPhone) === normSearchPhone))
      );
    }
    if (targetSales.length === 0) return 0;

    if (restoreStock) {
      setProducts((prev) => {
        const touched: Product[] = [];
        const next = prev.map((prod) => {
          if (!productTracksInventory(prod)) return prod;
          const totalRestored = targetSales.reduce((acc, s) => {
            const it = (s.items || []).find((i) => i.productId === prod.id || i.sku === prod.sku);
            return it && !it.isService ? acc + (it.quantity || 1) : acc;
          }, 0);
          if (totalRestored > 0) {
            const updatedProd = { ...prod, stock: prod.stock + totalRestored };
            touched.push(updatedProd);
            return updatedProd;
          }
          return prod;
        });
        productsRef.current = next;
        queueMicrotask(() => {
          touched.forEach((p) => syncProductToFirestore(p).catch(() => {}));
        });
        return next;
      });
    }

    const idsArray = targetSales.map((s) => s.id);
    const targetIds = new Set(idsArray);
    idsArray.forEach((id) => clearSalePendingSync(id));
    recordDeleted('sales', idsArray);

    setSales((prev) => {
      const next = prev.filter((s) => !targetIds.has(s.id));
      salesRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(next));
      } catch {}
      return next;
    });

    idsArray.forEach((id) => removeSaleFromFirestore(id).catch(() => {}));

    try {
      await fetch('/api/sales/clear-credit-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleIds: idsArray, action: 'DELETE' }),
        keepalive: true,
      });
    } catch (err) {
      console.warn('Error eliminando cuentas de cliente en servidor:', err);
    }
    return targetSales.length;
  };

  const voidCustomerCreditSales = async (
    customerIdOrPhoneOrIds: string | string[],
    reason: string = 'Anulada por usuario / cuenta no reconocida',
    restoreStock: boolean = false
  ): Promise<number> => {
    const currentSales = salesRef.current;
    let targetSales: Sale[] = [];
    if (Array.isArray(customerIdOrPhoneOrIds)) {
      const explicitIds = new Set(customerIdOrPhoneOrIds);
      targetSales = currentSales.filter(
        (s) =>
          isSaleWithCredit(s) &&
          !s.isVoided &&
          explicitIds.has(s.id)
      );
    } else {
      const normSearchPhone = normalizePhoneKey(customerIdOrPhoneOrIds);
      targetSales = currentSales.filter(
        (s) =>
          isSaleWithCredit(s) &&
          !s.isVoided &&
          (s.customerId === customerIdOrPhoneOrIds ||
            (normSearchPhone !== '' && normalizePhoneKey(s.customerPhone) === normSearchPhone))
      );
    }
    if (targetSales.length === 0) return 0;

    if (restoreStock) {
      setProducts((prev) => {
        const touched: Product[] = [];
        const next = prev.map((prod) => {
          if (!productTracksInventory(prod)) return prod;
          const totalRestored = targetSales.reduce((acc, s) => {
            const it = (s.items || []).find((i) => i.productId === prod.id || i.sku === prod.sku);
            return it && !it.isService ? acc + (it.quantity || 1) : acc;
          }, 0);
          if (totalRestored > 0) {
            const updatedProd = { ...prod, stock: prod.stock + totalRestored };
            touched.push(updatedProd);
            return updatedProd;
          }
          return prod;
        });
        productsRef.current = next;
        queueMicrotask(() => {
          touched.forEach((p) => syncProductToFirestore(p).catch(() => {}));
        });
        return next;
      });
    }

    const targetIds = new Set(targetSales.map((s) => s.id));
    const now = new Date().toISOString();
    const voidedCopies: Sale[] = [];

    setSales((prev) => {
      const next = prev.map((s) => {
        if (targetIds.has(s.id)) {
          const voidedSale: Sale = {
            ...s,
            creditStatus: 'ANULADO' as SaleCreditStatus,
            isVoided: true,
            voidedAt: now,
            voidReason: reason,
          };
          voidedCopies.push(voidedSale);
          return voidedSale;
        }
        return s;
      });
      salesRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(next));
      } catch {}
      return next;
    });

    voidedCopies.forEach((vs) => syncSaleWithRetry(vs));

    try {
      await fetch('/api/sales/clear-credit-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleIds: Array.from(targetIds), action: 'VOID' }),
        keepalive: true,
      });
    } catch (err) {
      console.warn('Error anulando cuentas de cliente en servidor:', err);
    }
    return targetSales.length;
  };

  const clearAllTestCreditSales = async (): Promise<number> => {
    const targetSales = salesRef.current.filter((s) => isSaleWithCredit(s));
    if (targetSales.length === 0) return 0;

    const idsArray = targetSales.map((s) => s.id);
    const targetIds = new Set(idsArray);
    idsArray.forEach((id) => clearSalePendingSync(id));
    recordDeleted('sales', idsArray);

    setSales((prev) => {
      const next = prev.filter((s) => !targetIds.has(s.id));
      salesRef.current = next;
      try {
        localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(next));
      } catch {}
      return next;
    });

    idsArray.forEach((id) => removeSaleFromFirestore(id).catch(() => {}));

    try {
      await fetch('/api/sales/clear-credit-sales', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ saleIds: idsArray, action: 'DELETE' }),
        keepalive: true,
      });
    } catch (err) {
      console.warn('Error limpiando cuentas en servidor:', err);
    }
    return targetSales.length;
  };

  // Cuentas por Cobrar & Créditos Computados (Excluye ventas anuladas o canceladas; incluye Pago Mixto con parte a crédito)
  const pendingCreditSales = useMemo(() => {
    return sales.filter(
      (s) =>
        isSaleWithCredit(s) &&
        !s.isVoided &&
        s.creditStatus !== 'PAGADO' &&
        s.creditStatus !== 'ANULADO' &&
        (s.total - (s.creditPaidAmount || 0)) > 0.01
    );
  }, [sales]);

  const overdueCreditSales = useMemo(() => {
    const today = new Date().toISOString().split('T')[0];
    return pendingCreditSales.filter(
      (s) => s.creditDueDate && s.creditDueDate < today
    );
  }, [pendingCreditSales]);

  const totalAccountsReceivableUSD = useMemo(() => {
    return Math.round(
      pendingCreditSales.reduce(
        (sum, s) => sum + Math.max(0, s.total - (s.creditPaidAmount || 0)),
        0
      ) * 100
    ) / 100;
  }, [pendingCreditSales]);

  const totalAccountsReceivableBs = totalAccountsReceivableUSD * settings.bcvRate;

  const updateMercadoLibreCommission = (
    saleId: string,
    status: 'PENDIENTE' | 'PAGADO',
    commissionUSD?: number
  ) => {
    setSales((prev) =>
      prev.map((s) => {
        if (s.id !== saleId) return s;
        const updated: Sale = {
          ...s,
          mercadolibreFeeStatus: status,
          mercadolibreCommissionUSD: commissionUSD !== undefined ? commissionUSD : s.mercadolibreCommissionUSD,
          mercadolibreSettledAt: status === 'PAGADO' ? new Date().toISOString() : undefined,
        };
        syncSaleToFirestore(updated).catch(() => {});
        return updated;
      })
    );
  };

  const addMercadoLibreManualEntry = (amountUSD: number, description: string, isPayment: boolean = false): MercadoLibreEntry => {
    const cleanAmount = Math.max(0.01, Math.round(Math.abs(amountUSD) * 100) / 100);
    const newEntry: MercadoLibreEntry = {
      id: `ml-entry-${Date.now()}`,
      createdAt: new Date().toISOString(),
      description: description.trim() || (isPayment ? 'Pago / Abono realizado a MercadoLibre' : 'Comisión adicional / Cargo manual'),
      amountUSD: isPayment ? -cleanAmount : cleanAmount,
      type: isPayment ? 'ABONO_PAGO' : 'CARGO_MANUAL',
      status: 'PENDIENTE',
    };
    setMlEntries((prev) => [newEntry, ...prev]);
    return newEntry;
  };

  const deleteMercadoLibreEntry = (id: string) => {
    setMlEntries((prev) => prev.filter((e) => e.id !== id));
  };

  const settleAllMercadoLibreCommissions = () => {
    const now = new Date().toISOString();
    setSales((prev) =>
      prev.map((s) => {
        if (s.paymentType === 'MERCADOLIBRE' && s.mercadolibreFeeStatus !== 'PAGADO') {
          const updated: Sale = {
            ...s,
            mercadolibreFeeStatus: 'PAGADO',
            mercadolibreSettledAt: now,
          };
          syncSaleToFirestore(updated).catch(() => {});
          return updated;
        }
        return s;
      })
    );
    setMlEntries((prev) =>
      prev.map((e) => ({
        ...e,
        status: 'PAGADO',
      }))
    );
  };

  const pendingMercadoLibreSales = useMemo(() => {
    return sales.filter(
      (s) => s.paymentType === 'MERCADOLIBRE' && s.mercadolibreFeeStatus !== 'PAGADO' && (s.mercadolibreCommissionUSD || 0) > 0
    );
  }, [sales]);

  const mercadolibreDebtUSD = useMemo(() => {
    const salesDebt = pendingMercadoLibreSales.reduce((sum: number, s: Sale) => sum + (s.mercadolibreCommissionUSD || 0), 0);
    const manualDebt = mlEntries
      .filter((e) => e.status !== 'PAGADO')
      .reduce((sum: number, e: MercadoLibreEntry) => sum + e.amountUSD, 0);
    return Math.max(0, Math.round((salesDebt + manualDebt) * 100) / 100);
  }, [pendingMercadoLibreSales, mlEntries]);

  const mercadolibreDebtBs = mercadolibreDebtUSD * settings.bcvRate;

  // Workshop Service Orders
  const createServiceOrder = (
    orderData: Omit<ServiceOrder, 'id' | 'orderNumber' | 'createdAt' | 'updatedAt'> & {
      customerCity?: string;
      customerAddress?: string;
      initialPayment?: {
        mode: 'PENDIENTE' | 'ABONO' | 'PAGADO';
        amountUSD?: number;
        amountBs?: number;
        currencyMode?: PaymentCurrencyMode;
        paymentMethod: PaymentMethod;
        pagoMovilAccount?: PagoMovilAccountOption;
        reference?: string;
        notes?: string;
        syncToTreasury?: boolean;
      };
    }
  ): ServiceOrder => {
    const { customerCity, customerAddress, initialPayment, ...serviceOrderFields } = orderData;
    const customer = ensureCustomer(
      serviceOrderFields.customerName,
      serviceOrderFields.customerPhone,
      serviceOrderFields.customerDocument,
      undefined,
      customerCity,
      serviceOrderFields.customerId,
      customerAddress
    );

    if (serviceOrderFields.partsUsed && serviceOrderFields.partsUsed.length > 0) {
      setProducts((prevProducts) => {
        const touched: Product[] = [];
        const next = prevProducts.map((prod) => {
          if (!productTracksInventory(prod)) return prod;
          const totalUsedQty = serviceOrderFields.partsUsed
            .filter((item) => item.productId === prod.id || (prod.sku && item.sku === prod.sku))
            .reduce((sum, item) => sum + (Number(item.quantity) || 0), 0);
          if (totalUsedQty > 0) {
            const updatedStock = Math.max(0, prod.stock - totalUsedQty);
            const updatedProd = { ...prod, stock: updatedStock };
            touched.push(updatedProd);
            return updatedProd;
          }
          return prod;
        });
        queueMicrotask(() => {
          touched.forEach((p) => syncProductToFirestore(p).catch(() => {}));
        });
        return next;
      });
    }

    const year = new Date().getFullYear();
    const orderId = `ord-${Date.now()}`;
    const orderNum = `ORD-${year}-${String(serviceOrders.length + 1).padStart(4, '0')}`;
    const rate = settingsRef.current.bcvRate || settings.bcvRate;
    const totalCostUSD = Math.max(0, Math.round((Number(serviceOrderFields.totalCost) || 0) * 100) / 100);
    const totalCostBs = Math.round(totalCostUSD * rate * 100) / 100;

    let paymentStatus: ServiceOrderPaymentStatus = serviceOrderFields.paymentStatus || 'PENDIENTE';
    let paidAmountUSD = Number(serviceOrderFields.paidAmountUSD) || 0;
    let paidAmountBs = Number(serviceOrderFields.paidAmountBs) || 0;
    let payments: ServiceOrderPaymentRecord[] = Array.isArray(serviceOrderFields.payments)
      ? [...serviceOrderFields.payments]
      : [];

    if (initialPayment && initialPayment.mode !== 'PENDIENTE') {
      const isFull = initialPayment.mode === 'PAGADO';
      const rawUSD = isFull
        ? totalCostUSD
        : Math.max(0, Math.round((Number(initialPayment.amountUSD) || 0) * 100) / 100);
      const explicitBs = Number(initialPayment.amountBs);
      const rawBs = isFull
        ? totalCostBs
        : !Number.isNaN(explicitBs) && explicitBs > 0
        ? Math.round(explicitBs * 100) / 100
        : Math.round(rawUSD * rate * 100) / 100;

      if (rawUSD > 0) {
        const resolvedPagoMovilAccount: PagoMovilAccountOption | undefined =
          initialPayment.paymentMethod === 'Pago Móvil'
            ? initialPayment.pagoMovilAccount || 'BANESCO_PERSONAL'
            : undefined;
        const resolvedCurrencyMode: PaymentCurrencyMode =
          initialPayment.currencyMode ||
          (initialPayment.paymentMethod === 'Pago Móvil' ||
          initialPayment.paymentMethod === 'Efectivo Bs' ||
          initialPayment.paymentMethod === 'Punto de Venta (Bs)' ||
          initialPayment.paymentMethod === 'Transferencia Bancaria Bs'
            ? 'BS'
            : 'USD');

        const treasuryIncome =
          initialPayment.syncToTreasury !== false
            ? recordAutomaticSaleIncomeInTreasury({
                saleId: orderId,
                invoiceNumber: orderNum,
                customerName: customer.name,
                amountUSD: rawUSD,
                amountBs: rawBs,
                bcvRate: rate,
                paymentMethod: initialPayment.paymentMethod,
                pagoMovilAccount: resolvedPagoMovilAccount,
                category: 'Servicios de Taller',
                reference: initialPayment.reference || orderNum,
                notes:
                  initialPayment.notes ||
                  (isFull
                    ? `Pago total orden ${orderNum} (${serviceOrderFields.entryType === 'ASIENTO' ? 'Tapicería / Asiento' : serviceOrderFields.serviceType})`
                    : `Abono inicial orden ${orderNum} (${serviceOrderFields.entryType === 'ASIENTO' ? 'Tapicería / Asiento' : serviceOrderFields.serviceType})`),
              })
            : null;

        const record: ServiceOrderPaymentRecord = {
          id: `ordpay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          date: new Date().toISOString(),
          amountUSD: rawUSD,
          amountBs: rawBs,
          currencyMode: resolvedCurrencyMode,
          bcvRate: rate,
          paymentMethod: initialPayment.paymentMethod,
          pagoMovilAccount: resolvedPagoMovilAccount,
          treasuryAccountId: treasuryIncome?.account.id,
          treasuryAccountName: treasuryIncome?.account.name,
          treasuryMovementId: treasuryIncome?.movement.id,
          reference: initialPayment.reference?.trim() || undefined,
          notes:
            initialPayment.notes?.trim() ||
            (isFull ? 'Pago total al ingresar la orden' : 'Abono inicial al ingresar la orden'),
        };

        payments = [record];
        paidAmountUSD = rawUSD;
        paidAmountBs = rawBs;
        paymentStatus =
          isFull || (totalCostUSD > 0 && paidAmountUSD >= totalCostUSD - 0.02)
            ? 'PAGADO'
            : 'ABONO';
      } else if (isFull) {
        paymentStatus = 'PAGADO';
        paidAmountUSD = totalCostUSD;
        paidAmountBs = totalCostBs;
      }
    }

    const newOrder: ServiceOrder = {
      ...serviceOrderFields,
      id: orderId,
      orderNumber: orderNum,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: serviceOrderFields.customerPhone.trim() || customer.phone,
      customerDocument:
        (serviceOrderFields.customerDocument && serviceOrderFields.customerDocument.trim()) ||
        customer.documentId ||
        undefined,
      bcvRate: rate,
      totalCost: totalCostUSD,
      totalCostBs,
      paymentStatus,
      paidAmountUSD,
      paidAmountBs,
      payments,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    setServiceOrders((prev) => [newOrder, ...prev]);
    syncServiceOrderToFirestore(newOrder).catch((err) =>
      console.warn('Firestore service order sync error:', err)
    );

    if (newOrder.status === 'CULMINADA' || newOrder.status === 'ENTREGADA') {
      queueMicrotask(() => {
        autoSyncServiceOrderCommissionIfMatched(newOrder);
      });
    }

    return newOrder;
  };

  const updateServiceOrderStatus = (
    id: string,
    newStatus: ServiceOrderStatus,
    notes?: string
  ): ServiceOrder | undefined => {
    const existing = serviceOrders.find((o) => o.id === id);
    if (!existing) return undefined;

    const nextNotes = notes
      ? `${existing.notes || ''}\n[${new Date().toLocaleTimeString('es-VE')}]: ${notes}`.trim()
      : existing.notes;
    const updatedOrder: ServiceOrder = {
      ...existing,
      status: newStatus,
      updatedAt: new Date().toISOString(),
      ...(nextNotes !== undefined ? { notes: nextNotes } : {}),
    };

    setServiceOrders((prev) =>
      prev.map((order) => (order.id === id ? updatedOrder : order))
    );
    syncServiceOrderToFirestore(updatedOrder).catch(() => {});

    if (newStatus === 'CULMINADA' || newStatus === 'ENTREGADA') {
      queueMicrotask(() => {
        autoSyncServiceOrderCommissionIfMatched(updatedOrder);
      });
    }

    return updatedOrder;
  };

  const updateServiceOrder = (
    id: string,
    updates: Partial<ServiceOrder> & { customerCity?: string; customerAddress?: string }
  ): ServiceOrder | undefined => {
    const { customerCity, customerAddress, ...cleanUpdates } = updates;
    const existingOrder = serviceOrders.find((o) => o.id === id);

    let resolvedCustomer: Customer | undefined;
    if (
      existingOrder &&
      (cleanUpdates.customerName !== undefined ||
        cleanUpdates.customerPhone !== undefined ||
        cleanUpdates.customerDocument !== undefined ||
        cleanUpdates.customerId !== undefined)
    ) {
      resolvedCustomer = ensureCustomer(
        cleanUpdates.customerName ?? existingOrder.customerName,
        cleanUpdates.customerPhone ?? existingOrder.customerPhone,
        cleanUpdates.customerDocument !== undefined
          ? cleanUpdates.customerDocument
          : existingOrder.customerDocument,
        undefined,
        customerCity,
        cleanUpdates.customerId !== undefined ? cleanUpdates.customerId : existingOrder.customerId,
        customerAddress
      );
    }

    let updatedOrder: ServiceOrder | undefined;

    setServiceOrders((prev) =>
      prev.map((order) => {
        if (order.id === id) {
          // Check if partsUsed changed to sync inventory stock
          if (cleanUpdates.partsUsed) {
            const oldParts = order.partsUsed || [];
            const newParts = cleanUpdates.partsUsed || [];

            const oldQtyMap = new Map<string, number>();
            oldParts.forEach((p) => {
              if (p.productId) {
                oldQtyMap.set(p.productId, (oldQtyMap.get(p.productId) || 0) + p.quantity);
              }
            });

            const newQtyMap = new Map<string, number>();
            newParts.forEach((p) => {
              if (p.productId) {
                newQtyMap.set(p.productId, (newQtyMap.get(p.productId) || 0) + p.quantity);
              }
            });

            // Adjust stock for any difference
            const allProductIds = new Set([...oldQtyMap.keys(), ...newQtyMap.keys()]);
            allProductIds.forEach((prodId) => {
              const oldQty = oldQtyMap.get(prodId) || 0;
              const newQty = newQtyMap.get(prodId) || 0;
              const delta = newQty - oldQty;
              if (delta !== 0) {
                adjustStock(prodId, -delta);
              }
            });
          }

          const currentRate = cleanUpdates.bcvRate || order.bcvRate || settings.bcvRate;
          const currentTotal = cleanUpdates.totalCost !== undefined ? cleanUpdates.totalCost : order.totalCost;
          const currentTotalBs = cleanUpdates.totalCostBs !== undefined ? cleanUpdates.totalCostBs : currentTotal * currentRate;

          const mergedDraft: ServiceOrder = {
            ...order,
            ...cleanUpdates,
            customerId: resolvedCustomer ? resolvedCustomer.id : (cleanUpdates.customerId ?? order.customerId),
            customerName: resolvedCustomer ? resolvedCustomer.name : (cleanUpdates.customerName ?? order.customerName),
            customerPhone:
              cleanUpdates.customerPhone !== undefined
                ? cleanUpdates.customerPhone.trim() || resolvedCustomer?.phone || order.customerPhone
                : order.customerPhone,
            customerDocument:
              cleanUpdates.customerDocument !== undefined
                ? cleanUpdates.customerDocument.trim() || resolvedCustomer?.documentId || undefined
                : order.customerDocument,
            bcvRate: currentRate,
            totalCost: currentTotal,
            totalCostBs: currentTotalBs,
            updatedAt: new Date().toISOString(),
          };

          // Reconcile paymentStatus if totalCost changed and payments exist (unless explicitly set)
          if (cleanUpdates.paymentStatus === undefined && (mergedDraft.payments?.length || (mergedDraft.paidAmountUSD || 0) > 0)) {
            const summary = getServiceOrderPaymentSummary(mergedDraft, currentRate);
            mergedDraft.paymentStatus = summary.paymentStatus;
            mergedDraft.paidAmountUSD = summary.paidUSD;
            mergedDraft.paidAmountBs = summary.paidBs;
          }

          updatedOrder = mergedDraft;
          syncServiceOrderToFirestore(updatedOrder).catch(() => {});
          return updatedOrder;
        }
        return order;
      })
    );

    if (!updatedOrder && existingOrder) {
      const currentRate = cleanUpdates.bcvRate || existingOrder.bcvRate || settings.bcvRate;
      const currentTotal = cleanUpdates.totalCost !== undefined ? cleanUpdates.totalCost : existingOrder.totalCost;
      const currentTotalBs = cleanUpdates.totalCostBs !== undefined ? cleanUpdates.totalCostBs : currentTotal * currentRate;
      const mergedDraft: ServiceOrder = {
        ...existingOrder,
        ...cleanUpdates,
        customerId: resolvedCustomer ? resolvedCustomer.id : (cleanUpdates.customerId ?? existingOrder.customerId),
        customerName: resolvedCustomer ? resolvedCustomer.name : (cleanUpdates.customerName ?? existingOrder.customerName),
        customerPhone:
          cleanUpdates.customerPhone !== undefined
            ? cleanUpdates.customerPhone.trim() || resolvedCustomer?.phone || existingOrder.customerPhone
            : existingOrder.customerPhone,
        customerDocument:
          cleanUpdates.customerDocument !== undefined
            ? cleanUpdates.customerDocument.trim() || resolvedCustomer?.documentId || undefined
            : existingOrder.customerDocument,
        bcvRate: currentRate,
        totalCost: currentTotal,
        totalCostBs: currentTotalBs,
        updatedAt: new Date().toISOString(),
      };
      if (cleanUpdates.paymentStatus === undefined && (mergedDraft.payments?.length || (mergedDraft.paidAmountUSD || 0) > 0)) {
        const summary = getServiceOrderPaymentSummary(mergedDraft, currentRate);
        mergedDraft.paymentStatus = summary.paymentStatus;
        mergedDraft.paidAmountUSD = summary.paidUSD;
        mergedDraft.paidAmountBs = summary.paidBs;
      }
      updatedOrder = mergedDraft;
    }

    if (updatedOrder && (updatedOrder.status === 'CULMINADA' || updatedOrder.status === 'ENTREGADA')) {
      const finalOrd = updatedOrder;
      queueMicrotask(() => {
        autoSyncServiceOrderCommissionIfMatched(finalOrd);
      });
    }

    return updatedOrder;
  };

  const recordServiceOrderPayment = (
    orderId: string,
    payment: {
      amountUSD: number;
      amountBs?: number;
      currencyMode?: PaymentCurrencyMode;
      paymentMethod: PaymentMethod;
      pagoMovilAccount?: PagoMovilAccountOption;
      reference?: string;
      notes?: string;
      syncToTreasury?: boolean;
      markAsFullPayment?: boolean;
    }
  ): { updatedOrder: ServiceOrder; paymentRecord: ServiceOrderPaymentRecord } | null => {
    const existing = serviceOrdersRef.current.find((o) => o.id === orderId);
    if (!existing) return null;

    const rate = settingsRef.current.bcvRate || existing.bcvRate || 1;
    const prevSummary = getServiceOrderPaymentSummary(existing, rate);
    const cleanUSD = Math.max(0, Math.round((Number(payment.amountUSD) || 0) * 100) / 100);
    const explicitBs = Number(payment.amountBs);
    const cleanBs =
      !Number.isNaN(explicitBs) && explicitBs > 0
        ? Math.round(explicitBs * 100) / 100
        : Math.round(cleanUSD * rate * 100) / 100;

    const resolvedPagoMovilAccount: PagoMovilAccountOption | undefined =
      payment.paymentMethod === 'Pago Móvil'
        ? payment.pagoMovilAccount || 'BANESCO_PERSONAL'
        : undefined;

    const resolvedCurrencyMode: PaymentCurrencyMode =
      payment.currencyMode ||
      (payment.paymentMethod === 'Pago Móvil' ||
      payment.paymentMethod === 'Efectivo Bs' ||
      payment.paymentMethod === 'Punto de Venta (Bs)' ||
      payment.paymentMethod === 'Transferencia Bancaria Bs'
        ? 'BS'
        : 'USD');

    const treasuryIncome =
      cleanUSD > 0 && payment.syncToTreasury !== false
        ? recordAutomaticSaleIncomeInTreasury({
            saleId: existing.id,
            invoiceNumber: existing.orderNumber,
            customerName: existing.customerName,
            amountUSD: cleanUSD,
            amountBs: cleanBs,
            bcvRate: rate,
            paymentMethod: payment.paymentMethod,
            pagoMovilAccount: resolvedPagoMovilAccount,
            category: 'Servicios de Taller',
            reference: payment.reference?.trim() || existing.orderNumber,
            notes:
              payment.notes?.trim() ||
              `${payment.markAsFullPayment ? 'Pago total' : 'Abono'} orden ${existing.orderNumber} (${existing.entryType === 'ASIENTO' ? 'Tapicería / Asiento' : existing.serviceType})`,
          })
        : null;

    const paymentRecord: ServiceOrderPaymentRecord = {
      id: `ordpay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: new Date().toISOString(),
      amountUSD: cleanUSD,
      amountBs: cleanBs,
      currencyMode: resolvedCurrencyMode,
      bcvRate: rate,
      paymentMethod: payment.paymentMethod,
      pagoMovilAccount: resolvedPagoMovilAccount,
      treasuryAccountId: treasuryIncome?.account.id,
      treasuryAccountName: treasuryIncome?.account.name,
      treasuryMovementId: treasuryIncome?.movement.id,
      reference: payment.reference?.trim() || undefined,
      notes: payment.notes?.trim() || undefined,
    };

    const existingPayments = Array.isArray(existing.payments) ? existing.payments : [];
    const nextPayments = cleanUSD > 0 ? [...existingPayments, paymentRecord] : existingPayments;
    const nextPaidUSD =
      cleanUSD > 0
        ? Math.round((prevSummary.paidUSD + cleanUSD) * 100) / 100
        : payment.markAsFullPayment
        ? existing.totalCost
        : prevSummary.paidUSD;
    const nextPaidBs =
      cleanUSD > 0
        ? Math.round((prevSummary.paidBs + cleanBs) * 100) / 100
        : payment.markAsFullPayment
        ? existing.totalCostBs || Math.round(existing.totalCost * rate * 100) / 100
        : prevSummary.paidBs;

    const isPaidFull =
      Boolean(payment.markAsFullPayment) ||
      (existing.totalCost > 0 && nextPaidUSD >= existing.totalCost - 0.02);

    const nextStatus: ServiceOrderPaymentStatus = isPaidFull
      ? 'PAGADO'
      : nextPaidUSD > 0.009
      ? 'ABONO'
      : 'PENDIENTE';

    const updatedOrder: ServiceOrder = {
      ...existing,
      paymentStatus: nextStatus,
      paidAmountUSD: nextPaidUSD,
      paidAmountBs: nextPaidBs,
      payments: nextPayments,
      updatedAt: new Date().toISOString(),
    };

    const nextList = serviceOrdersRef.current.map((o) => (o.id === orderId ? updatedOrder : o));
    serviceOrdersRef.current = nextList;
    setServiceOrders(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.SERVICE_ORDERS, JSON.stringify(nextList));
    } catch {}
    syncServiceOrderToFirestore(updatedOrder).catch((err) =>
      console.warn('Firestore service order payment sync error:', err)
    );

    return { updatedOrder, paymentRecord };
  };

  const deleteServiceOrderPayment = (orderId: string, paymentId: string): ServiceOrder | undefined => {
    const existing = serviceOrdersRef.current.find((o) => o.id === orderId);
    if (!existing) return undefined;

    const existingPayments = Array.isArray(existing.payments) ? existing.payments : [];
    const targetPayment = existingPayments.find((p) => p.id === paymentId);
    if (targetPayment?.treasuryMovementId) {
      deleteTreasuryMovement(targetPayment.treasuryMovementId, true);
    }

    const nextPayments = existingPayments.filter((p) => p.id !== paymentId);
    const rate = existing.bcvRate || settingsRef.current.bcvRate || 1;
    const nextPaidUSD = Math.round(nextPayments.reduce((s, p) => s + (Number(p.amountUSD) || 0), 0) * 100) / 100;
    const nextPaidBs = Math.round(nextPayments.reduce((s, p) => s + (Number(p.amountBs) || 0), 0) * 100) / 100;
    const nextStatus: ServiceOrderPaymentStatus =
      existing.totalCost > 0 && nextPaidUSD >= existing.totalCost - 0.02
        ? 'PAGADO'
        : nextPaidUSD > 0.009
        ? 'ABONO'
        : 'PENDIENTE';

    const updatedOrder: ServiceOrder = {
      ...existing,
      paymentStatus: nextStatus,
      paidAmountUSD: nextPaidUSD,
      paidAmountBs: nextPaidBs,
      payments: nextPayments,
      updatedAt: new Date().toISOString(),
    };

    const nextList = serviceOrdersRef.current.map((o) => (o.id === orderId ? updatedOrder : o));
    serviceOrdersRef.current = nextList;
    setServiceOrders(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.SERVICE_ORDERS, JSON.stringify(nextList));
    } catch {}
    syncServiceOrderToFirestore(updatedOrder).catch((err) =>
      console.warn('Firestore service order payment delete sync error:', err)
    );

    return updatedOrder;
  };

  const deleteServiceOrder = (id: string, restoreStock: boolean = true) => {
    const targetOrder = serviceOrdersRef.current.find((o) => o.id === id);
    if (targetOrder && Array.isArray(targetOrder.payments)) {
      targetOrder.payments.forEach((pay) => {
        if (pay.treasuryMovementId) {
          deleteTreasuryMovement(pay.treasuryMovementId, true);
        }
      });
    }
    recordDeleted('serviceOrders', [id]);
    removeServiceOrderFromFirestore(id).catch((err) =>
      console.warn('Firestore service order delete error:', err)
    );
    setServiceOrders((prev) => {
      const order = prev.find((o) => o.id === id);
      if (order && restoreStock && order.partsUsed) {
        order.partsUsed.forEach((part) => {
          if (part.productId) {
            adjustStock(part.productId, part.quantity);
          }
        });
      }
      return prev.filter((o) => o.id !== id);
    });
  };

  // --- Workshop Technician Commissions & Payouts ---
  const computeCommissionStatus = (
    commissionAmountUSD: number,
    paidAmountUSD: number
  ): ServiceCommissionStatus => {
    if (paidAmountUSD >= commissionAmountUSD - 0.01 && commissionAmountUSD > 0) return 'PAGADO';
    if (paidAmountUSD > 0.01) return 'PARCIAL';
    return 'PENDIENTE';
  };

  const getOrderCommissionBaseUSD = (order: ServiceOrder): number => {
    const servicesSum = Array.isArray(order.servicesList)
      ? order.servicesList.reduce((acc, s) => acc + (Number(s.cost) || 0), 0)
      : 0;
    const base = Math.max(Number(order.laborCost) || 0, servicesSum);
    return Math.round(base * 100) / 100;
  };

  const getOrderServiceDescription = (order: ServiceOrder): string => {
    if (Array.isArray(order.servicesList) && order.servicesList.length > 0) {
      return order.servicesList.map((s) => s.name).filter(Boolean).join(', ');
    }
    return order.reportedIssue || order.serviceType || 'Servicio de taller';
  };

  const addTechnician = (techData: Omit<Technician, 'id' | 'createdAt'>): Technician => {
    const cleanName = techData.name.trim();
    const rateVal = Math.min(100, Math.max(0, Number(techData.commissionRate) || 0));
    const newTech: Technician = {
      ...techData,
      id: `tech-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      name: cleanName,
      phone: (techData.phone || '').trim(),
      documentId: techData.documentId?.trim() || undefined,
      specialty: techData.specialty?.trim() || 'Mecánica General',
      commissionRate: Math.round(rateVal * 100) / 100,
      active: techData.active !== false,
      createdAt: new Date().toISOString(),
    };
    const nextList = [...techniciansRef.current, newTech].sort((a, b) =>
      a.name.localeCompare(b.name)
    );
    techniciansRef.current = nextList;
    setTechnicians(nextList);
    syncTechnicianToFirestore(newTech).catch(() => {});
    return newTech;
  };

  const updateTechnician = (
    id: string,
    updates: Partial<Technician>,
    applyRateToPending: boolean = false
  ) => {
    const existing = techniciansRef.current.find((t) => t.id === id);
    if (!existing) return;

    const cleanRate =
      updates.commissionRate !== undefined
        ? Math.min(100, Math.max(0, Math.round(Number(updates.commissionRate) * 100) / 100))
        : existing.commissionRate;

    const updatedTech: Technician = {
      ...existing,
      ...updates,
      name: updates.name !== undefined ? updates.name.trim() : existing.name,
      phone: updates.phone !== undefined ? updates.phone.trim() : existing.phone,
      commissionRate: cleanRate,
      updatedAt: new Date().toISOString(),
    };

    const nextTechs = techniciansRef.current.map((t) => (t.id === id ? updatedTech : t));
    techniciansRef.current = nextTechs;
    setTechnicians(nextTechs);
    syncTechnicianToFirestore(updatedTech).catch(() => {});

    // Keep technician name / phone / rate synced on unpaid or partial commissions if requested
    const updatedComms: ServiceCommission[] = [];
    const nextComms = serviceCommissionsRef.current.map((c) => {
      if (c.technicianId !== id) return c;
      const shouldUpdateRate = applyRateToPending && c.status !== 'PAGADO' && c.paidAmountUSD <= 0.01;
      const nextRate = shouldUpdateRate ? cleanRate : c.commissionRate;
      const nextAmount = shouldUpdateRate
        ? Math.round(c.baseAmountUSD * (nextRate / 100) * 100) / 100
        : c.commissionAmountUSD;
      const nextStatus = computeCommissionStatus(nextAmount, c.paidAmountUSD);
      const changed =
        c.technicianName !== updatedTech.name ||
        c.technicianPhone !== updatedTech.phone ||
        c.commissionRate !== nextRate ||
        c.commissionAmountUSD !== nextAmount;
      if (!changed) return c;
      const nextC: ServiceCommission = {
        ...c,
        technicianName: updatedTech.name,
        technicianPhone: updatedTech.phone,
        commissionRate: nextRate,
        commissionAmountUSD: nextAmount,
        status: nextStatus,
        updatedAt: new Date().toISOString(),
      };
      updatedComms.push(nextC);
      return nextC;
    });
    if (updatedComms.length > 0) {
      serviceCommissionsRef.current = nextComms;
      setServiceCommissions(nextComms);
      updatedComms.forEach((c) => syncServiceCommissionToFirestore(c).catch(() => {}));
    }
  };

  const deleteTechnician = (id: string) => {
    recordDeleted('technicians', [id]);
    removeTechnicianFromFirestore(id).catch(() => {});
    const next = techniciansRef.current.filter((t) => t.id !== id);
    techniciansRef.current = next;
    setTechnicians(next);
  };

  const addServiceCommission = (
    data: Omit<ServiceCommission, 'id' | 'createdAt' | 'commissionAmountUSD' | 'status' | 'paidAmountUSD'> & {
      paidAmountUSD?: number;
    }
  ): ServiceCommission => {
    const base = Math.max(0, Math.round((Number(data.baseAmountUSD) || 0) * 100) / 100);
    const rate = Math.min(100, Math.max(0, Math.round((Number(data.commissionRate) || 0) * 100) / 100));
    const commissionAmountUSD = Math.round(base * (rate / 100) * 100) / 100;
    const paidAmountUSD = Math.min(
      commissionAmountUSD,
      Math.max(0, Math.round((Number(data.paidAmountUSD) || 0) * 100) / 100)
    );
    const newComm: ServiceCommission = {
      ...data,
      id: `comm-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      baseAmountUSD: base,
      commissionRate: rate,
      commissionAmountUSD,
      paidAmountUSD,
      status: computeCommissionStatus(commissionAmountUSD, paidAmountUSD),
      createdAt: new Date().toISOString(),
    };
    const next = [newComm, ...serviceCommissionsRef.current];
    serviceCommissionsRef.current = next;
    setServiceCommissions(next);
    syncServiceCommissionToFirestore(newComm).catch(() => {});
    return newComm;
  };

  const updateServiceCommission = (id: string, updates: Partial<ServiceCommission>) => {
    const existing = serviceCommissionsRef.current.find((c) => c.id === id);
    if (!existing) return;

    const nextBase =
      updates.baseAmountUSD !== undefined
        ? Math.max(0, Math.round(Number(updates.baseAmountUSD) * 100) / 100)
        : existing.baseAmountUSD;
    const nextRate =
      updates.commissionRate !== undefined
        ? Math.min(100, Math.max(0, Math.round(Number(updates.commissionRate) * 100) / 100))
        : existing.commissionRate;
    const nextAmount =
      updates.commissionAmountUSD !== undefined &&
      updates.baseAmountUSD === undefined &&
      updates.commissionRate === undefined
        ? Math.max(0, Math.round(Number(updates.commissionAmountUSD) * 100) / 100)
        : Math.round(nextBase * (nextRate / 100) * 100) / 100;
    const nextPaid =
      updates.paidAmountUSD !== undefined
        ? Math.min(nextAmount, Math.max(0, Math.round(Number(updates.paidAmountUSD) * 100) / 100))
        : Math.min(nextAmount, existing.paidAmountUSD);

    const updatedComm: ServiceCommission = {
      ...existing,
      ...updates,
      baseAmountUSD: nextBase,
      commissionRate: nextRate,
      commissionAmountUSD: nextAmount,
      paidAmountUSD: nextPaid,
      status: computeCommissionStatus(nextAmount, nextPaid),
      updatedAt: new Date().toISOString(),
    };

    const next = serviceCommissionsRef.current.map((c) => (c.id === id ? updatedComm : c));
    serviceCommissionsRef.current = next;
    setServiceCommissions(next);
    syncServiceCommissionToFirestore(updatedComm).catch(() => {});
  };

  const deleteServiceCommission = (id: string) => {
    recordDeleted('serviceCommissions', [id]);
    removeServiceCommissionFromFirestore(id).catch(() => {});
    const next = serviceCommissionsRef.current.filter((c) => c.id !== id);
    serviceCommissionsRef.current = next;
    setServiceCommissions(next);
  };

  const autoSyncServiceOrderCommissionIfMatched = (order: ServiceOrder) => {
    if (order.skipCommissionSync) return;
    const baseUSD = getOrderCommissionBaseUSD(order);
    if (baseUSD <= 0) return;
    const rawTechName = (order.assignedTechnician || '').trim();
    if (!rawTechName && !order.assignedTechnicianId) return;

    const matchedTech =
      (order.assignedTechnicianId
        ? techniciansRef.current.find((t) => t.id === order.assignedTechnicianId)
        : undefined) ||
      techniciansRef.current.find(
        (t) => normalizeNameKey(t.name) === normalizeNameKey(rawTechName)
      );
    if (!matchedTech) return;

    const existingComm = serviceCommissionsRef.current.find(
      (c) => c.serviceOrderId === order.id
    );
    if (existingComm) {
      if (existingComm.status === 'PENDIENTE' && existingComm.paidAmountUSD <= 0.01) {
        updateServiceCommission(existingComm.id, {
          baseAmountUSD: baseUSD,
          motorcycleLabel:
            order.entryType === 'ASIENTO'
              ? `Asiento · ${order.motorcycle.model}`
              : `${order.motorcycle.brand} ${order.motorcycle.model} (${order.motorcycle.plate})`,
          customerName: order.customerName,
          serviceDescription: getOrderServiceDescription(order),
        });
      }
      return;
    }

    syncServiceOrderToCommission(order, {
      technicianId: matchedTech.id,
      technicianName: matchedTech.name,
      commissionRate: matchedTech.commissionRate,
    });
  };

  const syncServiceOrderToCommission = (
    order: ServiceOrder,
    options?: {
      technicianId?: string;
      technicianName?: string;
      commissionRate?: number;
      baseAmountUSD?: number;
    }
  ): ServiceCommission | null => {
    const existing = serviceCommissionsRef.current.find((c) => c.serviceOrderId === order.id);
    if (existing) return existing;

    const baseAmountUSD =
      options?.baseAmountUSD !== undefined
        ? Math.max(0, Math.round(options.baseAmountUSD * 100) / 100)
        : getOrderCommissionBaseUSD(order);
    if (baseAmountUSD <= 0) return null;

    const targetTechName = (options?.technicianName || order.assignedTechnician || '').trim();
    let tech: Technician | undefined;
    if (options?.technicianId) {
      tech = techniciansRef.current.find((t) => t.id === options.technicianId);
    }
    if (!tech && targetTechName) {
      tech = techniciansRef.current.find(
        (t) => normalizeNameKey(t.name) === normalizeNameKey(targetTechName)
      );
    }
    if (!tech && targetTechName) {
      tech = addTechnician({
        name: targetTechName,
        phone: '',
        specialty: order.serviceType || 'Mecánica General',
        commissionRate: options?.commissionRate !== undefined ? options.commissionRate : 50,
        active: true,
      });
    }
    if (!tech) return null;

    const rate =
      options?.commissionRate !== undefined ? options.commissionRate : tech.commissionRate;

    return addServiceCommission({
      serviceOrderId: order.id,
      orderNumber: order.orderNumber,
      technicianId: tech.id,
      technicianName: tech.name,
      technicianPhone: tech.phone,
      motorcycleLabel:
        order.entryType === 'ASIENTO'
          ? `Asiento · ${order.motorcycle.model}`
          : `${order.motorcycle.brand} ${order.motorcycle.model} · ${order.motorcycle.plate}`,
      customerName: order.customerName,
      serviceDescription: getOrderServiceDescription(order),
      baseAmountUSD,
      commissionRate: rate,
      workDate: order.updatedAt || order.createdAt,
    });
  };

  const syncAllPendingServiceOrdersToCommissions = (
    defaultRate: number = 50
  ): { created: number; createdTechnicians: number } => {
    const initialTechCount = techniciansRef.current.length;
    let created = 0;
    const existingOrderIds = new Set(
      serviceCommissionsRef.current.map((c) => c.serviceOrderId).filter(Boolean)
    );

    for (const order of serviceOrdersRef.current) {
      if (order.skipCommissionSync) continue;
      if (existingOrderIds.has(order.id)) continue;
      if (order.status !== 'CULMINADA' && order.status !== 'ENTREGADA') continue;
      const baseUSD = getOrderCommissionBaseUSD(order);
      if (baseUSD <= 0) continue;
      const techName = (order.assignedTechnician || '').trim();
      if (!techName) continue;

      const result = syncServiceOrderToCommission(order, {
        technicianName: techName,
        commissionRate: defaultRate,
      });
      if (result) {
        created++;
        existingOrderIds.add(order.id);
      }
    }

    return {
      created,
      createdTechnicians: Math.max(0, techniciansRef.current.length - initialTechCount),
    };
  };

  const payTechnicianCommissions = (params: {
    technicianId: string;
    commissionIds?: string[];
    amountUSD?: number;
    paymentMethod: PaymentMethod;
    reference?: string;
    notes?: string;
    customPayoutNumber?: string;
    technicianPhoneOverride?: string;
  }): TechnicianPayout | null => {
    const existingTech = techniciansRef.current.find((t) => t.id === params.technicianId);
    const matchedCommsById = serviceCommissionsRef.current.filter(
      (c) => c.technicianId === params.technicianId
    );

    if (!existingTech && matchedCommsById.length === 0) return null;

    const cleanOverridePhone = (params.technicianPhoneOverride || '').trim();
    const firstComm = matchedCommsById[0];

    const resolvedTech: Technician = existingTech
      ? {
          ...existingTech,
          phone: cleanOverridePhone || existingTech.phone || '',
        }
      : {
          id: params.technicianId,
          name: firstComm?.technicianName || 'Técnico de Taller',
          phone: cleanOverridePhone || firstComm?.technicianPhone || '',
          commissionRate: firstComm?.commissionRate ?? 50,
          active: true,
          createdAt: firstComm?.createdAt || new Date().toISOString(),
        };

    // Persist newly supplied phone onto saved technician if previously blank
    if (existingTech && cleanOverridePhone && cleanOverridePhone !== (existingTech.phone || '').trim()) {
      const updatedTechRec: Technician = {
        ...existingTech,
        phone: cleanOverridePhone,
        updatedAt: new Date().toISOString(),
      };
      const nextTechList = techniciansRef.current.map((t) =>
        t.id === existingTech.id ? updatedTechRec : t
      );
      techniciansRef.current = nextTechList;
      setTechnicians(nextTechList);
      try {
        localStorage.setItem(STORAGE_KEYS.TECHNICIANS, JSON.stringify(nextTechList));
      } catch {}
      syncTechnicianToFirestore(updatedTechRec).catch(() => {});
    }

    const allTechComms = serviceCommissionsRef.current.filter(
      (c) => c.technicianId === resolvedTech.id
    );

    const selectedSet =
      params.commissionIds && params.commissionIds.length > 0
        ? new Set(params.commissionIds)
        : null;

    // Sort oldest pending commissions first (FIFO)
    const eligiblePending = allTechComms
      .filter((c) => {
        const pending = Math.max(0, c.commissionAmountUSD - c.paidAmountUSD);
        if (pending <= 0.005) return false;
        if (selectedSet && !selectedSet.has(c.id)) return false;
        return true;
      })
      .sort((a, b) => (a.workDate || a.createdAt).localeCompare(b.workDate || b.createdAt));

    const totalEligiblePending =
      Math.round(
        eligiblePending.reduce(
          (acc, c) => acc + Math.max(0, c.commissionAmountUSD - c.paidAmountUSD),
          0
        ) * 100
      ) / 100;

    if (totalEligiblePending <= 0) return null;

    const requestedAmount =
      params.amountUSD !== undefined && params.amountUSD > 0
        ? Math.min(totalEligiblePending, Math.round(params.amountUSD * 100) / 100)
        : totalEligiblePending;

    if (requestedAmount <= 0) return null;

    let remainingToAllocate = requestedAmount;
    const payoutItems: TechnicianPayoutItem[] = [];
    const updatedMap = new Map<string, ServiceCommission>();

    for (const comm of eligiblePending) {
      if (remainingToAllocate <= 0.005) break;
      const pendingThis = Math.max(0, comm.commissionAmountUSD - comm.paidAmountUSD);
      const payNow = Math.min(pendingThis, remainingToAllocate);
      const roundedPayNow = Math.round(payNow * 100) / 100;
      if (roundedPayNow <= 0) continue;

      const newPaid = Math.min(
        comm.commissionAmountUSD,
        Math.round((comm.paidAmountUSD + roundedPayNow) * 100) / 100
      );
      const remainingAfter = Math.max(
        0,
        Math.round((comm.commissionAmountUSD - newPaid) * 100) / 100
      );

      const updatedComm: ServiceCommission = {
        ...comm,
        paidAmountUSD: newPaid,
        technicianPhone: resolvedTech.phone || comm.technicianPhone,
        status: computeCommissionStatus(comm.commissionAmountUSD, newPaid),
        updatedAt: new Date().toISOString(),
      };
      updatedMap.set(comm.id, updatedComm);

      payoutItems.push({
        commissionId: comm.id,
        orderNumber: comm.orderNumber,
        motorcycleLabel: comm.motorcycleLabel,
        serviceDescription: comm.serviceDescription,
        baseAmountUSD: comm.baseAmountUSD,
        commissionRate: comm.commissionRate,
        commissionAmountUSD: comm.commissionAmountUSD,
        amountPaidInThisPayoutUSD: roundedPayNow,
        previousPaidUSD: comm.paidAmountUSD,
        remainingAfterPayoutUSD: remainingAfter,
      });

      remainingToAllocate = Math.round((remainingToAllocate - roundedPayNow) * 100) / 100;
    }

    if (payoutItems.length === 0) return null;

    const nextComms = serviceCommissionsRef.current.map((c) => updatedMap.get(c.id) || c);
    serviceCommissionsRef.current = nextComms;
    setServiceCommissions(nextComms);
    try {
      localStorage.setItem(STORAGE_KEYS.SERVICE_COMMISSIONS, JSON.stringify(nextComms));
    } catch {}
    updatedMap.forEach((c) => {
      pendingSyncCommissionIdsRef.current.add(c.id);
      syncServiceCommissionToFirestore(c)
        .then(() => pendingSyncCommissionIdsRef.current.delete(c.id))
        .catch(() => {});
    });

    // Compute exact total debt & total paid for this technician AFTER this payout
    const techCommsAfter = nextComms.filter((c) => c.technicianId === resolvedTech.id);
    const remainingDebtUSD = Math.max(
      0,
      Math.round(
        techCommsAfter.reduce(
          (acc, c) => acc + Math.max(0, c.commissionAmountUSD - c.paidAmountUSD),
          0
        ) * 100
      ) / 100
    );
    const totalPaidAfterUSD =
      Math.round(techCommsAfter.reduce((acc, c) => acc + c.paidAmountUSD, 0) * 100) / 100;

    const rate = settingsRef.current.bcvRate || 1;
    const actualPaidUSD =
      Math.round(
        payoutItems.reduce((acc, it) => acc + it.amountPaidInThisPayoutUSD, 0) * 100
      ) / 100;

    const year = new Date().getFullYear();
    const maxSeq = technicianPayoutsRef.current.reduce((max, p) => {
      const match = String(p.payoutNumber || '').match(/(\d+)$/);
      const num = match ? parseInt(match[1], 10) : 0;
      return num > max ? num : max;
    }, technicianPayoutsRef.current.length);
    const payoutNumber =
      params.customPayoutNumber?.trim() ||
      `LIQ-${year}-${String(maxSeq + 1).padStart(4, '0')}`;

    const newPayout: TechnicianPayout = {
      id: `pay-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      payoutNumber,
      technicianId: resolvedTech.id,
      technicianName: resolvedTech.name,
      technicianPhone: resolvedTech.phone,
      technicianDocument: resolvedTech.documentId,
      amountUSD: actualPaidUSD,
      bcvRate: rate,
      amountBs: Math.round(actualPaidUSD * rate * 100) / 100,
      paymentMethod: params.paymentMethod,
      reference: params.reference?.trim() || undefined,
      notes: params.notes?.trim() || undefined,
      commissionItems: payoutItems,
      totalPaidToTechnicianAfterPayoutUSD: totalPaidAfterUSD,
      remainingDebtUSD,
      remainingDebtBs: Math.round(remainingDebtUSD * rate * 100) / 100,
      createdAt: new Date().toISOString(),
    };

    const nextPayouts = [newPayout, ...technicianPayoutsRef.current];
    technicianPayoutsRef.current = nextPayouts;
    setTechnicianPayouts(nextPayouts);
    try {
      localStorage.setItem(STORAGE_KEYS.TECH_PAYOUTS, JSON.stringify(nextPayouts));
    } catch {}
    syncTechnicianPayoutToFirestore(newPayout).catch(() => {});

    return newPayout;
  };

  const deleteTechnicianPayout = (payoutId: string, revertPaidAmounts: boolean = true) => {
    const payout = technicianPayoutsRef.current.find((p) => p.id === payoutId);
    recordDeleted('technicianPayouts', [payoutId]);
    removeTechnicianPayoutFromFirestore(payoutId).catch(() => {});

    if (payout && revertPaidAmounts && Array.isArray(payout.commissionItems)) {
      const revertByCommId = new Map<string, number>();
      payout.commissionItems.forEach((it) => {
        revertByCommId.set(
          it.commissionId,
          (revertByCommId.get(it.commissionId) || 0) + it.amountPaidInThisPayoutUSD
        );
      });

      const updatedComms: ServiceCommission[] = [];
      const nextComms = serviceCommissionsRef.current.map((c) => {
        const revertAmt = revertByCommId.get(c.id);
        if (!revertAmt) return c;
        const nextPaid = Math.max(0, Math.round((c.paidAmountUSD - revertAmt) * 100) / 100);
        const updatedC: ServiceCommission = {
          ...c,
          paidAmountUSD: nextPaid,
          status: computeCommissionStatus(c.commissionAmountUSD, nextPaid),
          updatedAt: new Date().toISOString(),
        };
        updatedComms.push(updatedC);
        return updatedC;
      });
      serviceCommissionsRef.current = nextComms;
      setServiceCommissions(nextComms);
      updatedComms.forEach((c) => syncServiceCommissionToFirestore(c).catch(() => {}));
    }

    const nextPayouts = technicianPayoutsRef.current.filter((p) => p.id !== payoutId);
    technicianPayoutsRef.current = nextPayouts;
    setTechnicianPayouts(nextPayouts);
  };

  const pendingTechniciansCommissionUSD = useMemo(() => {
    return (
      Math.round(
        serviceCommissions.reduce(
          (sum, c) => sum + Math.max(0, c.commissionAmountUSD - c.paidAmountUSD),
          0
        ) * 100
      ) / 100
    );
  }, [serviceCommissions]);

  const pendingTechniciansCommissionBs = pendingTechniciansCommissionUSD * settings.bcvRate;

  // Suppliers & Purchase Orders Operations
  const generateNextSupplierCode = (): string => {
    let maxNum = suppliersRef.current.length;
    suppliersRef.current.forEach((s) => {
      const match = (s.code || '').match(/(\d+)$/);
      if (match) {
        const parsed = parseInt(match[1], 10);
        if (!isNaN(parsed) && parsed > maxNum) maxNum = parsed;
      }
    });
    return `PROV-${String(maxNum + 1).padStart(3, '0')}`;
  };

  const addSupplier = (supplierData: Omit<Supplier, 'id' | 'createdAt' | 'updatedAt'>): Supplier => {
    const now = new Date().toISOString();
    const newSupplier: Supplier = {
      ...supplierData,
      id: `sup-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      code: (supplierData.code || '').trim().toUpperCase() || generateNextSupplierCode(),
      name: (supplierData.name || '').trim(),
      vendorName: (supplierData.vendorName || '').trim(),
      vendorPhone: (supplierData.vendorPhone || '').trim(),
      createdAt: now,
      updatedAt: now,
    };
    const nextList = [...suppliersRef.current, newSupplier].sort((a, b) =>
      (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' })
    );
    suppliersRef.current = nextList;
    setSuppliers(nextList);
    syncSupplierToFirestore(newSupplier).catch(() => {});
    return newSupplier;
  };

  const updateSupplier = (id: string, updates: Partial<Supplier>) => {
    const existing = suppliersRef.current.find((s) => s.id === id);
    if (!existing) return;
    const updatedSupplier: Supplier = {
      ...existing,
      ...updates,
      code: updates.code !== undefined ? updates.code.trim().toUpperCase() : existing.code,
      updatedAt: new Date().toISOString(),
    };
    const nextList = suppliersRef.current
      .map((s) => (s.id === id ? updatedSupplier : s))
      .sort((a, b) => (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' }));
    suppliersRef.current = nextList;
    setSuppliers(nextList);
    syncSupplierToFirestore(updatedSupplier).catch(() => {});

    // Keep denormalized supplier snapshots updated on existing purchase orders
    const touchedOrders: PurchaseOrder[] = [];
    const nextOrders = purchaseOrdersRef.current.map((po) => {
      if (po.supplierId !== id) return po;
      const syncedPo: PurchaseOrder = {
        ...po,
        supplierCode: updatedSupplier.code,
        supplierName: updatedSupplier.name,
        vendorName: updatedSupplier.vendorName,
        vendorPhone: updatedSupplier.vendorPhone,
        updatedAt: new Date().toISOString(),
      };
      touchedOrders.push(syncedPo);
      return syncedPo;
    });
    if (touchedOrders.length > 0) {
      purchaseOrdersRef.current = nextOrders;
      setPurchaseOrders(nextOrders);
      touchedOrders.forEach((po) => syncPurchaseOrderToFirestore(po).catch(() => {}));
    }
  };

  const deleteSupplier = (id: string) => {
    recordDeleted('suppliers', [id]);
    removeSupplierFromFirestore(id).catch(() => {});
    const nextList = suppliersRef.current.filter((s) => s.id !== id);
    suppliersRef.current = nextList;
    setSuppliers(nextList);
  };

  const applyPurchaseItemsToInventory = (items: PurchaseOrderItem[]): PurchaseOrderItem[] => {
    if (!Array.isArray(items) || items.length === 0) return items;

    const updatedList = [...productsRef.current];
    const changedProducts: Product[] = [];
    const timestamp = Date.now();
    const resolvedItems: PurchaseOrderItem[] = [];

    items.forEach((it, index) => {
      const qty = Math.max(0, Math.floor(Number(it.quantity) || 0));
      const unitCost = Math.round(Math.max(0, Number(it.unitCostUSD) || 0) * 100) / 100;
      const salePrice =
        it.salePriceUSD !== undefined && !isNaN(Number(it.salePriceUSD))
          ? Math.round(Math.max(0, Number(it.salePriceUSD)) * 100) / 100
          : undefined;

      const rawSku = (it.sku || '').trim();
      const normalizedSku =
        rawSku && rawSku.toUpperCase() !== 'NUEVO' ? rawSku.toLowerCase() : '';

      const existingIdx = updatedList.findIndex(
        (prod) =>
          (it.productId && prod.id === it.productId) ||
          (normalizedSku && prod.sku && prod.sku.trim().toLowerCase() === normalizedSku)
      );

      if (it.category && it.category.trim()) {
        addCategory(it.category.trim());
      }

      if (existingIdx >= 0) {
        const prod = updatedList[existingIdx];
        let cleanImage = it.imageUrl ? normalizeImageUrl(it.imageUrl) : '';
        if (!cleanImage && (it.name || prod.name).toLowerCase().includes('maleta')) {
          cleanImage = prod.imageUrl || PRESET_PRODUCT_IMAGES.maletaParaMoto;
        }

        const updatedProd: Product = {
          ...prod,
          name: it.name?.trim() ? it.name.trim() : prod.name,
          category: (it.category?.trim() || prod.category) as ProductCategory,
          description: it.description !== undefined && it.description.trim() !== '' ? it.description.trim() : prod.description,
          brand: it.brand?.trim() ? it.brand.trim() : prod.brand,
          compatibility: it.compatibility?.trim() ? it.compatibility.trim() : prod.compatibility,
          warehouseLocation:
            it.warehouseLocation !== undefined
              ? it.warehouseLocation.trim() || prod.warehouseLocation
              : prod.warehouseLocation,
          barcode:
            it.barcode !== undefined
              ? it.barcode.trim() || prod.barcode
              : prod.barcode,
          minStock:
            it.minStock !== undefined && !isNaN(Number(it.minStock))
              ? Math.max(0, Math.floor(Number(it.minStock)))
              : prod.minStock,
          stock: Math.max(0, (Number(prod.stock) || 0) + qty),
          costPrice: unitCost > 0 ? unitCost : prod.costPrice,
          costCurrencyOrigin: it.costCurrencyOrigin ?? prod.costCurrencyOrigin,
          costPriceBs:
            it.costPriceBs !== undefined && Number(it.costPriceBs) > 0
              ? Number(it.costPriceBs)
              : prod.costPriceBs,
          referenceCostUSD:
            it.referenceCostUSD !== undefined && Number(it.referenceCostUSD) > 0
              ? Number(it.referenceCostUSD)
              : prod.referenceCostUSD,
          salePrice: salePrice !== undefined && salePrice > 0 ? salePrice : prod.salePrice,
          salePriceRefUSD:
            it.salePriceRefUSD !== undefined && Number(it.salePriceRefUSD) > 0
              ? Number(it.salePriceRefUSD)
              : prod.salePriceRefUSD,
          salePriceBsBcv:
            it.salePriceBsBcv !== undefined && Number(it.salePriceBsBcv) > 0
              ? Number(it.salePriceBsBcv)
              : prod.salePriceBsBcv,
          imageUrl: cleanImage || prod.imageUrl,
        };
        updatedList[existingIdx] = updatedProd;
        const existingTouchIdx = changedProducts.findIndex((p) => p.id === updatedProd.id);
        if (existingTouchIdx >= 0) {
          changedProducts[existingTouchIdx] = updatedProd;
        } else {
          changedProducts.push(updatedProd);
        }
        resolvedItems.push({
          ...it,
          productId: updatedProd.id,
          sku: updatedProd.sku,
          isNewProduct: false,
        });
      } else {
        const finalSku =
          rawSku && rawSku.toUpperCase() !== 'NUEVO'
            ? rawSku.toUpperCase()
            : `REP-${String(timestamp).slice(-5)}${index + 1}`;
        let cleanImage = normalizeImageUrl(it.imageUrl || '');
        if (!cleanImage && (it.name || '').toLowerCase().includes('maleta')) {
          cleanImage = PRESET_PRODUCT_IMAGES.maletaParaMoto;
        }
        if (!cleanImage) {
          cleanImage = PRESET_PRODUCT_IMAGES.brakeKit;
        }

        const newProd: Product = {
          id: `prod-po-${timestamp}-${index}-${Math.random().toString(36).slice(2, 5)}`,
          sku: finalSku,
          barcode: it.barcode?.trim() || undefined,
          name: (it.name || '').trim() || 'Repuesto Nuevo',
          category: (it.category?.trim() || 'Accesorios') as ProductCategory,
          description: it.description?.trim() || '',
          costPrice: unitCost,
          costCurrencyOrigin: it.costCurrencyOrigin || 'DIVISAS',
          costPriceBs:
            it.costPriceBs !== undefined && Number(it.costPriceBs) > 0
              ? Number(it.costPriceBs)
              : undefined,
          referenceCostUSD:
            it.referenceCostUSD !== undefined && Number(it.referenceCostUSD) > 0
              ? Number(it.referenceCostUSD)
              : unitCost,
          salePrice: salePrice !== undefined && salePrice >= 0 ? salePrice : unitCost,
          salePriceRefUSD:
            it.salePriceRefUSD !== undefined && Number(it.salePriceRefUSD) > 0
              ? Number(it.salePriceRefUSD)
              : undefined,
          salePriceBsBcv:
            it.salePriceBsBcv !== undefined && Number(it.salePriceBsBcv) > 0
              ? Number(it.salePriceBsBcv)
              : undefined,
          stock: qty,
          minStock:
            it.minStock !== undefined && !isNaN(Number(it.minStock))
              ? Math.max(0, Math.floor(Number(it.minStock)))
              : 2,
          brand: it.brand?.trim() || 'Genérico',
          compatibility: it.compatibility?.trim() || 'Universal',
          warehouseLocation: it.warehouseLocation?.trim() || undefined,
          imageUrl: cleanImage,
          featured: false,
        };
        updatedList.unshift(newProd);
        changedProducts.push(newProd);
        resolvedItems.push({
          ...it,
          productId: newProd.id,
          sku: newProd.sku,
          isNewProduct: false,
        });
      }
    });

    if (changedProducts.length > 0) {
      productsRef.current = updatedList;
      setProducts(updatedList);
      queueMicrotask(() => {
        changedProducts.forEach((p) => syncProductToFirestore(p).catch(() => {}));
      });
    }

    return resolvedItems;
  };

  const computeOrderDueDate = (days?: number): string | undefined => {
    if (!days || days <= 0) return undefined;
    const d = new Date();
    d.setDate(d.getDate() + Number(days));
    return d.toISOString().split('T')[0];
  };

  const createPurchaseOrder: AppContextType['createPurchaseOrder'] = (orderData) => {
    const supplier = suppliersRef.current.find((s) => s.id === orderData.supplierId);
    if (!supplier) return null;

    const rate = settingsRef.current.bcvRate || 1;
    const now = new Date().toISOString();
    const cleanItems: PurchaseOrderItem[] = (orderData.items || []).map((it) => {
      const qty = Math.max(1, Number(it.quantity) || 1);
      const unitCost = Math.max(0, Number(it.unitCostUSD) || 0);
      return {
        ...it,
        quantity: qty,
        unitCostUSD: Math.round(unitCost * 100) / 100,
        totalCostUSD: Math.round(qty * unitCost * 100) / 100,
      };
    });

    const totalUSD =
      Math.round(cleanItems.reduce((sum, it) => sum + it.totalCostUSD, 0) * 100) / 100;
    const totalBs = Math.round(totalUSD * rate * 100) / 100;

    let initialPaid = 0;
    if (orderData.paymentType === 'CONTADO') {
      initialPaid = orderData.isPaidImmediately !== false ? totalUSD : Math.min(totalUSD, Math.max(0, Number(orderData.initialPaidUSD) || 0));
    } else {
      initialPaid = Math.min(totalUSD, Math.max(0, Number(orderData.initialPaidUSD) || 0));
    }
    initialPaid = Math.round(initialPaid * 100) / 100;

    const payments: PurchasePaymentRecord[] = [];
    if (initialPaid > 0.009) {
      const currCat: PurchasePaymentCurrency = orderData.initialPaymentCurrency || 'DIVISAS';
      const methodLabel =
        orderData.initialPaymentMethod ||
        (currCat === 'DIVISAS'
          ? 'Divisas ($ Efectivo)'
          : currCat === 'USDT'
          ? 'USDT (Binance Pay)'
          : 'Bolívares (Pago Móvil / Transf.)');
      payments.push({
        id: `popay-${Date.now()}-${Math.random().toString(36).slice(2, 5)}`,
        date: now,
        amountUSD: initialPaid,
        amountBs: Math.round(initialPaid * rate * 100) / 100,
        bcvRate: rate,
        currencyCategory: currCat,
        paymentMethod: methodLabel,
        reference: orderData.initialPaymentReference?.trim() || undefined,
        notes: orderData.paymentType === 'CONTADO' ? 'Pago de contado al emitir orden' : 'Abono inicial',
      });
    }

    const paymentStatus: PurchaseOrder['paymentStatus'] =
      initialPaid >= totalUSD - 0.01 && totalUSD > 0
        ? 'PAGADO'
        : initialPaid > 0.01
        ? 'PARCIAL'
        : 'PENDIENTE';

    let nextIndex = purchaseOrdersRef.current.length + 1;
    purchaseOrdersRef.current.forEach((po) => {
      const m = (po.orderNumber || '').match(/(\d+)$/);
      if (m) {
        const parsed = parseInt(m[1], 10);
        if (!isNaN(parsed) && parsed >= nextIndex) nextIndex = parsed + 1;
      }
    });
    const year = new Date().getFullYear();
    const orderNumber = `OC-${year}-${String(nextIndex).padStart(4, '0')}`;

    const shouldApplyStock = orderData.applyStockToInventory !== false;
    const finalItems = shouldApplyStock
      ? applyPurchaseItemsToInventory(cleanItems)
      : cleanItems;

    const newOrder: PurchaseOrder = {
      id: `po-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      orderNumber,
      supplierInvoiceNumber: orderData.supplierInvoiceNumber?.trim() || undefined,
      supplierId: supplier.id,
      supplierCode: supplier.code,
      supplierName: supplier.name,
      vendorName: supplier.vendorName,
      vendorPhone: supplier.vendorPhone,
      items: finalItems,
      totalUSD,
      bcvRate: rate,
      totalBs,
      paymentType: orderData.paymentType,
      paymentCurrencyCondition: orderData.paymentCurrencyCondition || 'DIVISAS',
      creditDays: orderData.paymentType === 'CREDITO' ? Number(orderData.creditDays) || 15 : undefined,
      creditDueDate:
        orderData.paymentType === 'CREDITO'
          ? orderData.creditDueDate || computeOrderDueDate(Number(orderData.creditDays) || 15)
          : undefined,
      paymentStatus,
      paidAmountUSD: initialPaid,
      payments,
      initialPaymentCurrency: orderData.initialPaymentCurrency,
      initialPaymentMethod: orderData.initialPaymentMethod,
      receivedStatus: orderData.receivedStatus,
      receivedDate:
        orderData.receivedStatus === 'RECIBIDA'
          ? orderData.receivedDate || new Date().toISOString().split('T')[0]
          : undefined,
      stockApplied: shouldApplyStock,
      notes: orderData.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    pendingSyncPurchaseOrderIdsRef.current.add(newOrder.id);
    const nextOrders = [newOrder, ...purchaseOrdersRef.current];
    purchaseOrdersRef.current = nextOrders;
    setPurchaseOrders(nextOrders);
    try {
      localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(nextOrders));
    } catch {}
    syncPurchaseOrderToFirestore(newOrder)
      .then(() => pendingSyncPurchaseOrderIdsRef.current.delete(newOrder.id))
      .catch(() => {});

    return newOrder;
  };

  const reconcilePurchaseItemsInInventory = (
    oldItems: PurchaseOrderItem[],
    newItems: PurchaseOrderItem[]
  ): PurchaseOrderItem[] => {
    const updatedList = [...productsRef.current];
    const changedProducts: Product[] = [];
    const timestamp = Date.now();

    const markChanged = (prod: Product) => {
      const idx = changedProducts.findIndex((p) => p.id === prod.id);
      if (idx >= 0) {
        changedProducts[idx] = prod;
      } else {
        changedProducts.push(prod);
      }
    };

    const findProductIdx = (it: PurchaseOrderItem): number => {
      const rawSku = (it.sku || '').trim();
      const normalizedSku =
        rawSku && rawSku.toUpperCase() !== 'NUEVO' ? rawSku.toLowerCase() : '';
      return updatedList.findIndex(
        (prod) =>
          (it.productId && prod.id === it.productId) ||
          (normalizedSku && prod.sku && prod.sku.trim().toLowerCase() === normalizedSku)
      );
    };

    // 1. Aggregate previous quantities per matched product
    const oldQtyByProdId = new Map<string, number>();
    (oldItems || []).forEach((it) => {
      const idx = findProductIdx(it);
      if (idx >= 0) {
        const prodId = updatedList[idx].id;
        const qty = Math.max(0, Math.floor(Number(it.quantity) || 0));
        oldQtyByProdId.set(prodId, (oldQtyByProdId.get(prodId) || 0) + qty);
      }
    });

    // 2. Aggregate new quantities per matched existing product
    const newQtyByProdId = new Map<string, number>();
    const resolvedItems: PurchaseOrderItem[] = [];

    (newItems || []).forEach((it, index) => {
      const qty = Math.max(0, Math.floor(Number(it.quantity) || 0));
      const unitCost = Math.round(Math.max(0, Number(it.unitCostUSD) || 0) * 10000) / 10000;
      const salePrice =
        it.salePriceUSD !== undefined && !isNaN(Number(it.salePriceUSD))
          ? Math.round(Math.max(0, Number(it.salePriceUSD)) * 10000) / 10000
          : undefined;

      if (it.category && it.category.trim()) {
        addCategory(it.category.trim());
      }

      const existingIdx = findProductIdx(it);
      if (existingIdx >= 0) {
        const prod = updatedList[existingIdx];
        newQtyByProdId.set(prod.id, (newQtyByProdId.get(prod.id) || 0) + qty);

        let cleanImage = it.imageUrl ? normalizeImageUrl(it.imageUrl) : '';
        if (!cleanImage && (it.name || prod.name).toLowerCase().includes('maleta')) {
          cleanImage = prod.imageUrl || PRESET_PRODUCT_IMAGES.maletaParaMoto;
        }

        const updatedProd: Product = {
          ...prod,
          name: it.name?.trim() ? it.name.trim() : prod.name,
          category: (it.category?.trim() || prod.category) as ProductCategory,
          description:
            it.description !== undefined && it.description.trim() !== ''
              ? it.description.trim()
              : prod.description,
          brand: it.brand?.trim() ? it.brand.trim() : prod.brand,
          compatibility: it.compatibility?.trim() ? it.compatibility.trim() : prod.compatibility,
          warehouseLocation:
            it.warehouseLocation !== undefined
              ? it.warehouseLocation.trim() || prod.warehouseLocation
              : prod.warehouseLocation,
          barcode:
            it.barcode !== undefined
              ? it.barcode.trim() || prod.barcode
              : prod.barcode,
          minStock:
            it.minStock !== undefined && !isNaN(Number(it.minStock))
              ? Math.max(0, Math.floor(Number(it.minStock)))
              : prod.minStock,
          costPrice: unitCost > 0 ? unitCost : prod.costPrice,
          costCurrencyOrigin: it.costCurrencyOrigin ?? prod.costCurrencyOrigin,
          costPriceBs:
            it.costPriceBs !== undefined && Number(it.costPriceBs) > 0
              ? Number(it.costPriceBs)
              : prod.costPriceBs,
          referenceCostUSD:
            it.referenceCostUSD !== undefined && Number(it.referenceCostUSD) > 0
              ? Number(it.referenceCostUSD)
              : prod.referenceCostUSD,
          salePrice: salePrice !== undefined && salePrice > 0 ? salePrice : prod.salePrice,
          salePriceRefUSD:
            it.salePriceRefUSD !== undefined && Number(it.salePriceRefUSD) > 0
              ? Number(it.salePriceRefUSD)
              : prod.salePriceRefUSD,
          salePriceBsBcv:
            it.salePriceBsBcv !== undefined && Number(it.salePriceBsBcv) > 0
              ? Number(it.salePriceBsBcv)
              : prod.salePriceBsBcv,
          imageUrl: cleanImage || prod.imageUrl,
        };
        updatedList[existingIdx] = updatedProd;
        markChanged(updatedProd);

        resolvedItems.push({
          ...it,
          productId: updatedProd.id,
          sku: updatedProd.sku,
          isNewProduct: false,
        });
      } else {
        const rawSku = (it.sku || '').trim();
        const finalSku =
          rawSku && rawSku.toUpperCase() !== 'NUEVO'
            ? rawSku.toUpperCase()
            : `REP-${String(timestamp).slice(-5)}${index + 1}`;
        let cleanImage = normalizeImageUrl(it.imageUrl || '');
        if (!cleanImage && (it.name || '').toLowerCase().includes('maleta')) {
          cleanImage = PRESET_PRODUCT_IMAGES.maletaParaMoto;
        }
        if (!cleanImage) {
          cleanImage = PRESET_PRODUCT_IMAGES.brakeKit;
        }

        const newProd: Product = {
          id: `prod-po-${timestamp}-${index}-${Math.random().toString(36).slice(2, 5)}`,
          sku: finalSku,
          barcode: it.barcode?.trim() || undefined,
          name: (it.name || '').trim() || 'Repuesto Nuevo',
          category: (it.category?.trim() || 'Accesorios') as ProductCategory,
          description: it.description?.trim() || '',
          costPrice: unitCost,
          costCurrencyOrigin: it.costCurrencyOrigin || 'DIVISAS',
          costPriceBs:
            it.costPriceBs !== undefined && Number(it.costPriceBs) > 0
              ? Number(it.costPriceBs)
              : undefined,
          referenceCostUSD:
            it.referenceCostUSD !== undefined && Number(it.referenceCostUSD) > 0
              ? Number(it.referenceCostUSD)
              : unitCost,
          salePrice: salePrice !== undefined && salePrice >= 0 ? salePrice : unitCost,
          salePriceRefUSD:
            it.salePriceRefUSD !== undefined && Number(it.salePriceRefUSD) > 0
              ? Number(it.salePriceRefUSD)
              : undefined,
          salePriceBsBcv:
            it.salePriceBsBcv !== undefined && Number(it.salePriceBsBcv) > 0
              ? Number(it.salePriceBsBcv)
              : undefined,
          stock: qty,
          minStock:
            it.minStock !== undefined && !isNaN(Number(it.minStock))
              ? Math.max(0, Math.floor(Number(it.minStock)))
              : 2,
          brand: it.brand?.trim() || 'Genérico',
          compatibility: it.compatibility?.trim() || 'Universal',
          warehouseLocation: it.warehouseLocation?.trim() || undefined,
          imageUrl: cleanImage,
          featured: false,
        };
        updatedList.unshift(newProd);
        markChanged(newProd);
        resolvedItems.push({
          ...it,
          productId: newProd.id,
          sku: newProd.sku,
          isNewProduct: false,
        });
      }
    });

    // 3. Apply stock delta (newQty - oldQty) for every product touched in old or new order
    const allTouchedProdIds = new Set<string>([
      ...Array.from(oldQtyByProdId.keys()),
      ...Array.from(newQtyByProdId.keys()),
    ]);
    allTouchedProdIds.forEach((prodId) => {
      const oldQty = oldQtyByProdId.get(prodId) || 0;
      const newQty = newQtyByProdId.get(prodId) || 0;
      const delta = newQty - oldQty;
      if (delta !== 0) {
        const pIdx = updatedList.findIndex((p) => p.id === prodId);
        if (pIdx >= 0) {
          const prod = updatedList[pIdx];
          const adjustedProd: Product = {
            ...prod,
            stock: Math.max(0, (Number(prod.stock) || 0) + delta),
          };
          updatedList[pIdx] = adjustedProd;
          markChanged(adjustedProd);
        }
      }
    });

    if (changedProducts.length > 0) {
      productsRef.current = updatedList;
      setProducts(updatedList);
      queueMicrotask(() => {
        changedProducts.forEach((p) => syncProductToFirestore(p).catch(() => {}));
      });
    }

    return resolvedItems;
  };

  const updatePurchaseOrder: AppContextType['updatePurchaseOrder'] = (id, updates) => {
    const existing = purchaseOrdersRef.current.find((po) => po.id === id);
    if (!existing) return null;

    const rate =
      updates.bcvRate !== undefined && Number(updates.bcvRate) > 0
        ? Number(updates.bcvRate)
        : existing.bcvRate || settingsRef.current.bcvRate || 1;

    const nextItems = Array.isArray(updates.items)
      ? updates.items.map((it) => {
          const qty = Math.max(1, Math.floor(Number(it.quantity) || 1));
          const unitCost = Math.round(Math.max(0, Number(it.unitCostUSD) || 0) * 10000) / 10000;
          const salePrice =
            it.salePriceUSD !== undefined && !isNaN(Number(it.salePriceUSD))
              ? Math.round(Math.max(0, Number(it.salePriceUSD)) * 10000) / 10000
              : undefined;
          return {
            ...it,
            quantity: qty,
            unitCostUSD: unitCost,
            salePriceUSD: salePrice,
            totalCostUSD: Math.round(qty * unitCost * 100) / 100,
          };
        })
      : existing.items;

    const nextTotalUSD =
      Math.round(nextItems.reduce((sum, it) => sum + it.totalCostUSD, 0) * 100) / 100;
    const nextTotalBs = Math.round(nextTotalUSD * rate * 100) / 100;

    let supplierFields = {
      supplierId: existing.supplierId,
      supplierCode: existing.supplierCode,
      supplierName: existing.supplierName,
      vendorName: existing.vendorName,
      vendorPhone: existing.vendorPhone,
    };
    if (updates.supplierId && updates.supplierId !== existing.supplierId) {
      const sup = suppliersRef.current.find((s) => s.id === updates.supplierId);
      if (sup) {
        supplierFields = {
          supplierId: sup.id,
          supplierCode: sup.code,
          supplierName: sup.name,
          vendorName: sup.vendorName,
          vendorPhone: sup.vendorPhone,
        };
      }
    }

    const nextReceivedStatus = updates.receivedStatus || existing.receivedStatus;
    const shouldApplyStock =
      !existing.stockApplied &&
      (updates.applyStockToInventory === true ||
        (nextReceivedStatus === 'RECIBIDA' && updates.applyStockToInventory !== false));

    const shouldReconcileStock =
      Boolean(existing.stockApplied) &&
      Array.isArray(updates.items) &&
      updates.syncInventoryDelta !== false;

    const resolvedItems = shouldApplyStock
      ? applyPurchaseItemsToInventory(nextItems)
      : shouldReconcileStock
      ? reconcilePurchaseItemsInInventory(existing.items, nextItems)
      : nextItems;

    // Normalize payments if provided in updates
    const nextPayments: PurchasePaymentRecord[] = Array.isArray(updates.payments)
      ? updates.payments
          .filter((p) => Number(p.amountUSD) > 0)
          .map((p) => {
            const pAmountUSD = Math.round(Math.max(0, Number(p.amountUSD) || 0) * 100) / 100;
            const pRate = Number(p.bcvRate) > 0 ? Number(p.bcvRate) : rate;
            return {
              ...p,
              id: p.id || `popay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              date: p.date || new Date().toISOString(),
              amountUSD: pAmountUSD,
              bcvRate: pRate,
              amountBs: Math.round(pAmountUSD * pRate * 100) / 100,
              currencyCategory: p.currencyCategory || 'DIVISAS',
              paymentMethod: p.paymentMethod || 'Divisas ($ Efectivo)',
              reference: p.reference?.trim() || undefined,
              notes: p.notes?.trim() || undefined,
            };
          })
      : existing.payments || [];

    const nextPaidUSD = Array.isArray(updates.payments)
      ? Math.round(nextPayments.reduce((sum, p) => sum + (Number(p.amountUSD) || 0), 0) * 100) / 100
      : updates.paidAmountUSD !== undefined
      ? Math.round(Math.max(0, Number(updates.paidAmountUSD) || 0) * 100) / 100
      : existing.paidAmountUSD || 0;

    const nextPaymentStatus: PurchaseOrder['paymentStatus'] =
      nextPaidUSD >= nextTotalUSD - 0.01 && nextTotalUSD > 0
        ? 'PAGADO'
        : nextPaidUSD > 0.01
        ? 'PARCIAL'
        : 'PENDIENTE';

    const {
      applyStockToInventory: _ignoreApply,
      syncInventoryDelta: _ignoreDelta,
      ...cleanUpdates
    } = updates;

    const nextPaymentType = updates.paymentType || existing.paymentType;
    const nextOrderNumber =
      updates.orderNumber && updates.orderNumber.trim()
        ? updates.orderNumber.trim()
        : existing.orderNumber;

    const updatedOrder: PurchaseOrder = {
      ...existing,
      ...cleanUpdates,
      ...supplierFields,
      orderNumber: nextOrderNumber,
      createdAt: updates.createdAt || existing.createdAt,
      items: resolvedItems,
      totalUSD: nextTotalUSD,
      bcvRate: rate,
      totalBs: nextTotalBs,
      paymentType: nextPaymentType,
      creditDays:
        nextPaymentType === 'CREDITO'
          ? updates.creditDays !== undefined
            ? updates.creditDays
            : existing.creditDays
          : undefined,
      creditDueDate:
        nextPaymentType === 'CREDITO'
          ? updates.creditDueDate !== undefined
            ? updates.creditDueDate
            : existing.creditDueDate
          : undefined,
      payments: nextPayments,
      paidAmountUSD: nextPaidUSD,
      paymentStatus: updates.paymentStatus || nextPaymentStatus,
      receivedStatus: nextReceivedStatus,
      receivedDate:
        nextReceivedStatus === 'RECIBIDA'
          ? updates.receivedDate || existing.receivedDate || new Date().toISOString().split('T')[0]
          : undefined,
      stockApplied: existing.stockApplied || shouldApplyStock,
      updatedAt: new Date().toISOString(),
    };

    pendingSyncPurchaseOrderIdsRef.current.add(id);
    const nextList = purchaseOrdersRef.current.map((po) => (po.id === id ? updatedOrder : po));
    purchaseOrdersRef.current = nextList;
    setPurchaseOrders(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(nextList));
    } catch {}
    syncPurchaseOrderToFirestore(updatedOrder)
      .then(() => pendingSyncPurchaseOrderIdsRef.current.delete(id))
      .catch(() => {});

    // Keep any linked Treasury Commitment synchronized with the edited Purchase Order
    const linkedCommitments = treasuryCommitmentsRef.current.filter(
      (c) => c.linkedPurchaseOrderId === id
    );
    if (linkedCommitments.length > 0) {
      const pendingUSD = Math.round(Math.max(0, updatedOrder.totalUSD - (updatedOrder.paidAmountUSD || 0)) * 100) / 100;
      const isBsBcv = updatedOrder.paymentCurrencyCondition === 'BS_BCV';
      const currentRate = settingsRef.current.bcvRate || rate || 1;
      const updatedCommitments: TreasuryCommitment[] = [];
      const nextCommitments = treasuryCommitmentsRef.current.map((c) => {
        if (c.linkedPurchaseOrderId !== id) return c;
        const synced: TreasuryCommitment = {
          ...c,
          title: `${updatedOrder.supplierName} (${updatedOrder.orderNumber})`,
          dueDate: updatedOrder.creditDueDate || updatedOrder.createdAt.split('T')[0],
          amountUSD: pendingUSD > 0.01 ? pendingUSD : updatedOrder.totalUSD,
          amountBs: Math.round((pendingUSD > 0.01 ? pendingUSD : updatedOrder.totalUSD) * currentRate * 100) / 100,
          bcvRate: currentRate,
          paymentCurrency: isBsBcv ? 'BS' : c.paymentCurrency || 'EFECTIVO_USD',
          isPaid: pendingUSD <= 0.01,
          paidAt: pendingUSD <= 0.01 ? c.paidAt || new Date().toISOString() : undefined,
          notes: updatedOrder.supplierInvoiceNumber
            ? `Factura proveedor: ${updatedOrder.supplierInvoiceNumber}`
            : c.notes,
          updatedAt: new Date().toISOString(),
        };
        updatedCommitments.push(synced);
        return synced;
      });
      treasuryCommitmentsRef.current = nextCommitments;
      setTreasuryCommitments(nextCommitments);
      try {
        localStorage.setItem(STORAGE_KEYS.TREASURY_COMMITMENTS, JSON.stringify(nextCommitments));
      } catch {}
      updatedCommitments.forEach((cm) => {
        syncTreasuryCommitmentToFirestore(cm).catch(() => {});
      });
    }

    return updatedOrder;
  };

  const markPurchaseOrderReceived = (
    id: string,
    receivedDate?: string,
    applyStockToInventory: boolean = true
  ): PurchaseOrder | null => {
    const existing = purchaseOrdersRef.current.find((po) => po.id === id);
    if (!existing) return null;
    const shouldApply = !existing.stockApplied && applyStockToInventory;
    const resolvedItems = shouldApply
      ? applyPurchaseItemsToInventory(existing.items)
      : existing.items;
    const updatedOrder: PurchaseOrder = {
      ...existing,
      items: resolvedItems,
      receivedStatus: 'RECIBIDA',
      receivedDate: receivedDate || new Date().toISOString().split('T')[0],
      stockApplied: existing.stockApplied || shouldApply,
      updatedAt: new Date().toISOString(),
    };
    pendingSyncPurchaseOrderIdsRef.current.add(id);
    const nextList = purchaseOrdersRef.current.map((po) => (po.id === id ? updatedOrder : po));
    purchaseOrdersRef.current = nextList;
    setPurchaseOrders(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(nextList));
    } catch {}
    syncPurchaseOrderToFirestore(updatedOrder)
      .then(() => pendingSyncPurchaseOrderIdsRef.current.delete(id))
      .catch(() => {});
    return updatedOrder;
  };

  const recordPurchaseOrderPayment: AppContextType['recordPurchaseOrderPayment'] = (
    orderId,
    payment
  ) => {
    const existing = purchaseOrdersRef.current.find((po) => po.id === orderId);
    if (!existing) return null;

    const rate = settingsRef.current.bcvRate || existing.bcvRate || 1;
    const remainingBefore = Math.max(0, existing.totalUSD - (existing.paidAmountUSD || 0));
    const appliedUSD = Math.min(
      remainingBefore > 0 ? remainingBefore : Number(payment.amountUSD) || 0,
      Math.max(0, Math.round((Number(payment.amountUSD) || 0) * 100) / 100)
    );
    if (appliedUSD <= 0) return null;

    const paymentRecord: PurchasePaymentRecord = {
      id: `popay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: new Date().toISOString(),
      amountUSD: appliedUSD,
      amountBs: Math.round(appliedUSD * rate * 100) / 100,
      bcvRate: rate,
      currencyCategory: payment.currencyCategory,
      paymentMethod: payment.paymentMethod,
      reference: payment.reference?.trim() || undefined,
      notes: payment.notes?.trim() || undefined,
    };

    const nextPaidUSD = Math.round(((existing.paidAmountUSD || 0) + appliedUSD) * 100) / 100;
    const nextPaymentStatus: PurchaseOrder['paymentStatus'] =
      nextPaidUSD >= existing.totalUSD - 0.01
        ? 'PAGADO'
        : nextPaidUSD > 0.01
        ? 'PARCIAL'
        : 'PENDIENTE';

    const updatedOrder: PurchaseOrder = {
      ...existing,
      paidAmountUSD: nextPaidUSD,
      paymentStatus: nextPaymentStatus,
      payments: [...(existing.payments || []), paymentRecord],
      updatedAt: new Date().toISOString(),
    };

    pendingSyncPurchaseOrderIdsRef.current.add(orderId);
    const nextList = purchaseOrdersRef.current.map((po) => (po.id === orderId ? updatedOrder : po));
    purchaseOrdersRef.current = nextList;
    setPurchaseOrders(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.PURCHASE_ORDERS, JSON.stringify(nextList));
    } catch {}
    syncPurchaseOrderToFirestore(updatedOrder)
      .then(() => pendingSyncPurchaseOrderIdsRef.current.delete(orderId))
      .catch(() => {});

    const totalSupplierDebtAfterUSD = Math.round(
      nextList
        .filter((po) => po.supplierId === existing.supplierId)
        .reduce((sum, po) => sum + Math.max(0, po.totalUSD - (po.paidAmountUSD || 0)), 0) * 100
    ) / 100;

    return { updatedOrder, paymentRecord, totalSupplierDebtAfterUSD };
  };

  const deletePurchaseOrder = (id: string) => {
    recordDeleted('purchaseOrders', [id]);
    removePurchaseOrderFromFirestore(id).catch(() => {});
    const nextList = purchaseOrdersRef.current.filter((po) => po.id !== id);
    purchaseOrdersRef.current = nextList;
    setPurchaseOrders(nextList);
  };

  const totalSupplierDebtUSD = useMemo(() => {
    return (
      Math.round(
        purchaseOrders.reduce(
          (sum, po) => sum + Math.max(0, po.totalUSD - (po.paidAmountUSD || 0)),
          0
        ) * 100
      ) / 100
    );
  }, [purchaseOrders]);

  const totalSupplierDebtBs = totalSupplierDebtUSD * settings.bcvRate;

  const pendingReceptionOrdersCount = useMemo(() => {
    return purchaseOrders.filter((po) => po.receivedStatus === 'PENDIENTE').length;
  }, [purchaseOrders]);

  // Business Expenses Categories & CRUD
  const expenseCategories = useMemo<string[]>(() => {
    const result: string[] = [];
    const seenLower = new Set<string>();
    const registerCat = (cat?: string) => {
      const cleaned = (cat || '').trim().replace(/\s+/g, ' ');
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      if (seenLower.has(key)) return;
      seenLower.add(key);
      result.push(cleaned);
    };
    DEFAULT_EXPENSE_CATEGORIES.forEach(registerCat);
    if (Array.isArray(settings.customExpenseCategories)) {
      settings.customExpenseCategories.forEach(registerCat);
    }
    expenses.forEach((ex) => registerCat(ex.category));
    return result;
  }, [settings.customExpenseCategories, expenses]);

  const addExpenseCategory = (categoryName: string): { added: boolean; category: string } => {
    const cleaned = categoryName.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      return { added: false, category: 'Otros Gastos' };
    }
    const existing = expenseCategories.find(
      (c) => c.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (existing) {
      return { added: false, category: existing };
    }
    const formatted =
      cleaned === cleaned.toLowerCase()
        ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
        : cleaned;

    setSettings((prev) => {
      const prevCustom = Array.isArray(prev.customExpenseCategories)
        ? prev.customExpenseCategories
        : [];
      if (prevCustom.some((c) => c.trim().toLowerCase() === formatted.toLowerCase())) {
        return prev;
      }
      const updated: BusinessSettings = {
        ...prev,
        customExpenseCategories: [...prevCustom, formatted],
      };
      settingsRef.current = updated;
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      } catch {}
      syncSettingsToFirestore(updated).catch((err) =>
        console.warn('Firestore custom expense category sync error:', err)
      );
      return updated;
    });

    return { added: true, category: formatted };
  };

  const deleteExpenseCategory = (categoryName: string) => {
    const targetLower = categoryName.trim().toLowerCase();
    setSettings((prev) => {
      const prevCustom = Array.isArray(prev.customExpenseCategories)
        ? prev.customExpenseCategories
        : [];
      const nextCustom = prevCustom.filter((c) => c.trim().toLowerCase() !== targetLower);
      const updated: BusinessSettings = {
        ...prev,
        customExpenseCategories: nextCustom,
      };
      settingsRef.current = updated;
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      } catch {}
      syncSettingsToFirestore(updated).catch(() => {});
      return updated;
    });
  };

  // Treasury Income / Record Categories (Categorías de Ingresos y Registros)
  const incomeCategories = useMemo<string[]>(() => {
    const result: string[] = [];
    const seenLower = new Set<string>();
    const registerCat = (cat?: string) => {
      const cleaned = (cat || '').trim().replace(/\s+/g, ' ');
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      if (seenLower.has(key)) return;
      seenLower.add(key);
      result.push(cleaned);
    };
    DEFAULT_INCOME_CATEGORIES.forEach(registerCat);
    if (Array.isArray(settings.customIncomeCategories)) {
      settings.customIncomeCategories.forEach(registerCat);
    }
    treasuryMovements
      .filter((m) => m.type === 'INGRESO')
      .forEach((m) => registerCat(m.category));
    return result;
  }, [settings.customIncomeCategories, treasuryMovements]);

  const addIncomeCategory = (categoryName: string): { added: boolean; category: string } => {
    const cleaned = categoryName.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      return { added: false, category: 'Otros Ingresos' };
    }
    const existing = incomeCategories.find(
      (c) => c.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (existing) {
      return { added: false, category: existing };
    }
    const formatted =
      cleaned === cleaned.toLowerCase()
        ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
        : cleaned;

    setSettings((prev) => {
      const prevCustom = Array.isArray(prev.customIncomeCategories)
        ? prev.customIncomeCategories
        : [];
      if (prevCustom.some((c) => c.trim().toLowerCase() === formatted.toLowerCase())) {
        return prev;
      }
      const updated: BusinessSettings = {
        ...prev,
        customIncomeCategories: [...prevCustom, formatted],
      };
      settingsRef.current = updated;
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      } catch {}
      syncSettingsToFirestore(updated).catch((err) =>
        console.warn('Firestore custom income category sync error:', err)
      );
      return updated;
    });

    return { added: true, category: formatted };
  };

  const deleteIncomeCategory = (categoryName: string) => {
    const targetLower = categoryName.trim().toLowerCase();
    setSettings((prev) => {
      const prevCustom = Array.isArray(prev.customIncomeCategories)
        ? prev.customIncomeCategories
        : [];
      const nextCustom = prevCustom.filter((c) => c.trim().toLowerCase() !== targetLower);
      const updated: BusinessSettings = {
        ...prev,
        customIncomeCategories: nextCustom,
      };
      settingsRef.current = updated;
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      } catch {}
      syncSettingsToFirestore(updated).catch(() => {});
      return updated;
    });
  };

  // Planned Payment / Fixed Expense Categories (Categorías de Pagos Planificados / Compromisos)
  const commitmentCategories = useMemo<
    Array<{ id: string; label: string; isCustom: boolean }>
  >(() => {
    const result: Array<{ id: string; label: string; isCustom: boolean }> = [];
    const seenIds = new Set<string>();
    const seenLabels = new Set<string>();

    DEFAULT_COMMITMENT_CATEGORIES.forEach((def) => {
      seenIds.add(def.id.toLowerCase());
      seenLabels.add(def.label.toLowerCase());
      result.push({ id: def.id, label: def.label, isCustom: false });
    });

    const registerCustom = (raw?: string) => {
      const cleaned = (raw || '').trim().replace(/\s+/g, ' ');
      if (!cleaned) return;
      const lower = cleaned.toLowerCase();
      if (seenIds.has(lower) || seenLabels.has(lower)) return;
      seenIds.add(lower);
      seenLabels.add(lower);
      result.push({ id: cleaned, label: cleaned, isCustom: true });
    };

    if (Array.isArray(settings.customCommitmentCategories)) {
      settings.customCommitmentCategories.forEach(registerCustom);
    }
    treasuryCommitments.forEach((cm) => registerCustom(cm.category));

    return result;
  }, [settings.customCommitmentCategories, treasuryCommitments]);

  const addCommitmentCategory = (
    categoryName: string
  ): { added: boolean; id: string; label: string } => {
    const cleaned = categoryName.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      return { added: false, id: 'GASTOS_FIJOS', label: 'Gastos Fijos' };
    }
    const existing = commitmentCategories.find(
      (c) =>
        c.id.trim().toLowerCase() === cleaned.toLowerCase() ||
        c.label.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (existing) {
      return { added: false, id: existing.id, label: existing.label };
    }
    const formatted =
      cleaned === cleaned.toLowerCase()
        ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
        : cleaned;

    setSettings((prev) => {
      const prevCustom = Array.isArray(prev.customCommitmentCategories)
        ? prev.customCommitmentCategories
        : [];
      if (prevCustom.some((c) => c.trim().toLowerCase() === formatted.toLowerCase())) {
        return prev;
      }
      const updated: BusinessSettings = {
        ...prev,
        customCommitmentCategories: [...prevCustom, formatted],
      };
      settingsRef.current = updated;
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      } catch {}
      syncSettingsToFirestore(updated).catch((err) =>
        console.warn('Firestore custom commitment category sync error:', err)
      );
      return updated;
    });

    return { added: true, id: formatted, label: formatted };
  };

  const deleteCommitmentCategory = (categoryIdOrLabel: string) => {
    const targetLower = categoryIdOrLabel.trim().toLowerCase();
    setSettings((prev) => {
      const prevCustom = Array.isArray(prev.customCommitmentCategories)
        ? prev.customCommitmentCategories
        : [];
      const nextCustom = prevCustom.filter((c) => c.trim().toLowerCase() !== targetLower);
      const updated: BusinessSettings = {
        ...prev,
        customCommitmentCategories: nextCustom,
      };
      settingsRef.current = updated;
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      } catch {}
      syncSettingsToFirestore(updated).catch(() => {});
      return updated;
    });
  };

  const expensePosBanks = useMemo<string[]>(() => {
    const result: string[] = [];
    const seenLower = new Set<string>();
    const registerBank = (bank?: string) => {
      const cleaned = (bank || '').trim().replace(/\s+/g, ' ');
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      if (seenLower.has(key)) return;
      seenLower.add(key);
      result.push(cleaned);
    };
    DEFAULT_EXPENSE_POS_BANKS.forEach(registerBank);
    if (Array.isArray(settings.customExpensePosBanks)) {
      settings.customExpensePosBanks.forEach(registerBank);
    }
    expenses.forEach((ex) => registerBank(ex.cardBank));
    return result;
  }, [settings.customExpensePosBanks, expenses]);

  const addExpensePosBank = (bankName: string): { added: boolean; bank: string } => {
    const cleaned = bankName.trim().replace(/\s+/g, ' ');
    if (!cleaned) {
      return { added: false, bank: DEFAULT_EXPENSE_POS_BANKS[0] };
    }
    const existing = expensePosBanks.find(
      (b) => b.trim().toLowerCase() === cleaned.toLowerCase()
    );
    if (existing) {
      return { added: false, bank: existing };
    }
    const formatted =
      cleaned === cleaned.toLowerCase()
        ? cleaned.charAt(0).toUpperCase() + cleaned.slice(1)
        : cleaned;

    setSettings((prev) => {
      const prevCustom = Array.isArray(prev.customExpensePosBanks)
        ? prev.customExpensePosBanks
        : [];
      if (prevCustom.some((b) => b.trim().toLowerCase() === formatted.toLowerCase())) {
        return prev;
      }
      const updated: BusinessSettings = {
        ...prev,
        customExpensePosBanks: [...prevCustom, formatted],
      };
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      } catch {}
      syncSettingsToFirestore(updated).catch((err) =>
        console.warn('Firestore custom POS bank sync error:', err)
      );
      return updated;
    });

    return { added: true, bank: formatted };
  };

  const deleteExpensePosBank = (bankName: string) => {
    const targetLower = bankName.trim().toLowerCase();
    setSettings((prev) => {
      const prevCustom = Array.isArray(prev.customExpensePosBanks)
        ? prev.customExpensePosBanks
        : [];
      const nextCustom = prevCustom.filter((b) => b.trim().toLowerCase() !== targetLower);
      const updated: BusinessSettings = {
        ...prev,
        customExpensePosBanks: nextCustom,
      };
      try {
        localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(updated));
      } catch {}
      syncSettingsToFirestore(updated).catch(() => {});
      return updated;
    });
  };

  const resolveTreasuryAccountForExpense = (
    paymentCurrencyType: ExpensePaymentCurrency,
    preferredAccountId?: string,
    cardBank?: string
  ): TreasuryAccount | undefined => {
    if (treasuryAccountsRef.current.length === 0) {
      initializeDefaultTreasuryAccounts();
    }
    const accounts = treasuryAccountsRef.current;
    if (accounts.length === 0) return undefined;

    if (preferredAccountId) {
      const explicit = accounts.find((a) => a.id === preferredAccountId);
      if (explicit) return explicit;
    }

    if (paymentCurrencyType === 'EFECTIVO_USD') {
      return (
        accounts.find((a) => a.currency === 'USD' && a.group === 'EFECTIVO') ||
        accounts.find((a) => a.currency === 'USD') ||
        accounts[0]
      );
    }
    if (paymentCurrencyType === 'EFECTIVO_BS') {
      return (
        accounts.find((a) => a.currency === 'BS' && a.group === 'EFECTIVO') ||
        accounts.find((a) => a.currency === 'BS') ||
        accounts[0]
      );
    }
    if (paymentCurrencyType === 'PUNTO_VENTA') {
      const bankNeedle = (cardBank || '').trim().toLowerCase();
      if (bankNeedle) {
        const matchedByBank = accounts.find((a) => {
          const hay = `${a.name} ${a.institution || ''}`.toLowerCase();
          return hay.includes(bankNeedle);
        });
        if (matchedByBank) return matchedByBank;
      }
      return (
        accounts.find((a) => a.currency === 'BS' && a.group === 'BANCO_NACIONAL') ||
        accounts.find((a) => a.currency === 'BS') ||
        accounts[0]
      );
    }
    if (paymentCurrencyType === 'BS') {
      return (
        accounts.find((a) => a.currency === 'BS' && a.group === 'BANCO_NACIONAL') ||
        accounts.find((a) => a.currency === 'BS') ||
        accounts[0]
      );
    }
    // USDT
    return (
      accounts.find((a) => a.currency === 'USDT') ||
      accounts.find((a) => a.group === 'BILLETERA_DIVISAS') ||
      accounts.find((a) => a.currency === 'USD') ||
      accounts[0]
    );
  };

  const formatCommitmentDisplayLabel = (cm: TreasuryCommitment): string => {
    const worker = cm.workerName?.trim();
    if (worker && !cm.title.toLowerCase().includes(worker.toLowerCase())) {
      return `${cm.title} (${worker})`;
    }
    return cm.title;
  };

  const adjustCommitmentForSalaryAdvance = (
    commitmentId: string,
    deltaAdvanceUSD: number
  ): { commitment: TreasuryCommitment; appliedUSD: number } | null => {
    const existing = treasuryCommitmentsRef.current.find((c) => c.id === commitmentId);
    if (!existing) return null;

    const cleanDelta = Math.round((Number(deltaAdvanceUSD) || 0) * 100) / 100;
    if (Math.abs(cleanDelta) < 0.005) {
      return { commitment: existing, appliedUSD: 0 };
    }

    const prevAdvances = Math.max(
      0,
      Math.round((Number(existing.advancesTotalUSD) || 0) * 100) / 100
    );
    const currentAmountUSD = Math.max(
      0,
      Math.round((Number(existing.amountUSD) || 0) * 100) / 100
    );
    const baseOriginalUSD =
      existing.originalAmountUSD !== undefined && Number(existing.originalAmountUSD) > 0
        ? Math.round(Number(existing.originalAmountUSD) * 100) / 100
        : Math.round((currentAmountUSD + prevAdvances) * 100) / 100;

    let appliedUSD = 0;
    let nextAdvances = prevAdvances;
    let nextAmountUSD = currentAmountUSD;

    if (cleanDelta > 0) {
      appliedUSD = Math.round(Math.min(currentAmountUSD, cleanDelta) * 100) / 100;
      nextAmountUSD = Math.max(0, Math.round((currentAmountUSD - appliedUSD) * 100) / 100);
      nextAdvances = Math.round((prevAdvances + appliedUSD) * 100) / 100;
    } else {
      const revertAmt = Math.abs(cleanDelta);
      const actualRevert = Math.round(Math.min(prevAdvances, revertAmt) * 100) / 100;
      appliedUSD = -actualRevert;
      nextAdvances = Math.max(0, Math.round((prevAdvances - actualRevert) * 100) / 100);
      nextAmountUSD = Math.min(
        baseOriginalUSD,
        Math.round((currentAmountUSD + actualRevert) * 100) / 100
      );
    }

    const rate =
      existing.paymentCurrency === 'BS' &&
      existing.appliedExchangeRate &&
      existing.appliedExchangeRate > 0
        ? existing.appliedExchangeRate
        : existing.bcvRate || settingsRef.current.bcvRate || 1;
    const nextAmountBs = Math.round(nextAmountUSD * rate * 100) / 100;
    const nextReservedUSD = Math.min(nextAmountUSD, Math.max(0, Number(existing.reservedUSD) || 0));

    const now = new Date().toISOString();
    let nextIsPaid = existing.isPaid;
    let nextPaidByAdvances = Boolean(existing.paidByAdvances);
    let nextPaidAt = existing.paidAt;
    let nextPaidAccountId = existing.paidAccountId;
    let nextPaidAccountName = existing.paidAccountName;

    if (cleanDelta > 0 && nextAmountUSD <= 0.009) {
      nextIsPaid = true;
      nextPaidByAdvances = true;
      nextPaidAt = now;
      nextPaidAccountId = undefined;
      nextPaidAccountName = 'Liquidado con Vales / Adelantos';
    } else if (cleanDelta < 0 && nextAmountUSD > 0.009 && existing.paidByAdvances) {
      nextIsPaid = false;
      nextPaidByAdvances = false;
      nextPaidAt = undefined;
      nextPaidAccountId = undefined;
      nextPaidAccountName = undefined;
    }

    const updatedCommitment: TreasuryCommitment = {
      ...existing,
      originalAmountUSD: baseOriginalUSD,
      advancesTotalUSD: nextAdvances,
      amountUSD: nextAmountUSD,
      amountBs: nextAmountBs,
      reservedUSD: nextReservedUSD,
      isPaid: nextIsPaid,
      paidByAdvances: nextPaidByAdvances || undefined,
      paidAt: nextPaidAt,
      paidAccountId: nextPaidAccountId,
      paidAccountName: nextPaidAccountName,
      updatedAt: now,
    };

    pendingSyncTreasuryCommitmentIdsRef.current.add(updatedCommitment.id);
    const nextList = treasuryCommitmentsRef.current
      .map((c) => (c.id === updatedCommitment.id ? updatedCommitment : c))
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    treasuryCommitmentsRef.current = nextList;
    setTreasuryCommitments(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_COMMITMENTS, JSON.stringify(nextList));
    } catch {}
    syncTreasuryCommitmentToFirestore(updatedCommitment)
      .then(() => pendingSyncTreasuryCommitmentIdsRef.current.delete(updatedCommitment.id))
      .catch(() => {});

    return { commitment: updatedCommitment, appliedUSD };
  };

  const addExpense: AppContextType['addExpense'] = (expenseData) => {
    const activeRate = Number(expenseData.bcvRate) > 0 ? Number(expenseData.bcvRate) : settingsRef.current.bcvRate || 1;
    const rawAmountUSD = Math.max(0, Number(expenseData.amountUSD) || 0);
    const amountUSD = Math.round(rawAmountUSD * 100) / 100;
    const amountBs =
      expenseData.amountBs !== undefined && Number(expenseData.amountBs) > 0
        ? Math.round(Number(expenseData.amountBs) * 100) / 100
        : Math.round(amountUSD * activeRate * 100) / 100;

    let nextIndex = expensesRef.current.length + 1;
    expensesRef.current.forEach((ex) => {
      const m = (ex.expenseNumber || '').match(/(\d+)$/);
      if (m) {
        const parsed = parseInt(m[1], 10);
        if (!isNaN(parsed) && parsed >= nextIndex) nextIndex = parsed + 1;
      }
    });
    const year = new Date().getFullYear();
    const expenseNumber = `GAS-${year}-${String(nextIndex).padStart(4, '0')}`;
    const now = new Date().toISOString();
    const expenseId = `exp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    const expenseDate = expenseData.date || now.split('T')[0];

    let isSalaryAdvance = Boolean(expenseData.isSalaryAdvance && expenseData.linkedCommitmentId);
    let linkedCommitmentId = isSalaryAdvance ? expenseData.linkedCommitmentId : undefined;
    let linkedCommitmentTitle = isSalaryAdvance ? expenseData.linkedCommitmentTitle : undefined;
    let salaryAdvanceAppliedUSD =
      isSalaryAdvance && expenseData.salaryAdvanceAppliedUSD !== undefined
        ? Math.round(Math.max(0, Number(expenseData.salaryAdvanceAppliedUSD) || 0) * 100) / 100
        : undefined;

    if (
      !expenseData.skipCommitmentDeduction &&
      isSalaryAdvance &&
      linkedCommitmentId &&
      amountUSD > 0
    ) {
      const advResult = adjustCommitmentForSalaryAdvance(linkedCommitmentId, amountUSD);
      if (advResult) {
        linkedCommitmentTitle = formatCommitmentDisplayLabel(advResult.commitment);
        salaryAdvanceAppliedUSD = advResult.appliedUSD;
      } else {
        isSalaryAdvance = false;
        linkedCommitmentId = undefined;
        linkedCommitmentTitle = undefined;
        salaryAdvanceAppliedUSD = undefined;
      }
    }

    let linkedAccountId = expenseData.treasuryAccountId;
    let linkedAccountName = expenseData.treasuryAccountName;
    let linkedMovementId = expenseData.treasuryMovementId;
    let deductedFromTreasury = Boolean(
      expenseData.skipTreasuryDeduction && (expenseData.treasuryAccountId || expenseData.treasuryMovementId)
    );

    const cleanCardBank =
      expenseData.paymentCurrencyType === 'PUNTO_VENTA' && expenseData.cardBank?.trim()
        ? expenseData.cardBank.trim()
        : undefined;

    const shouldDeduct = !expenseData.skipTreasuryDeduction && expenseData.deductFromTreasury !== false;
    if (shouldDeduct && amountUSD > 0) {
      const targetAccount = resolveTreasuryAccountForExpense(
        expenseData.paymentCurrencyType,
        expenseData.treasuryAccountId,
        cleanCardBank
      );
      if (targetAccount) {
        const nativeDelta = targetAccount.currency === 'BS' ? -amountBs : -amountUSD;
        applyAccountDelta(targetAccount, -amountUSD, activeRate, nativeDelta);

        const cardNoteSuffix = cleanCardBank ? ` · Punto de Venta (Tarjeta ${cleanCardBank})` : '';
        const advanceNoteSuffix =
          isSalaryAdvance && linkedCommitmentTitle
            ? ` · Vale descontado de: ${linkedCommitmentTitle}`
            : '';

        const newMovement: TreasuryMovement = {
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          movementNumber: nextMovementNumber(),
          date: expenseDate,
          type: 'GASTO',
          accountId: targetAccount.id,
          accountName: targetAccount.name,
          accountGroup: targetAccount.group,
          category: expenseData.category.trim() || 'Otros Gastos',
          description: expenseData.description.trim(),
          amountUSD,
          bcvRate: activeRate,
          amountBs,
          reference: expenseData.reference?.trim() || undefined,
          expenseId,
          salaryAdvanceCommitmentId: linkedCommitmentId,
          salaryAdvanceAppliedUSD,
          notes:
            (expenseData.notes?.trim() ||
              (expenseData.beneficiary?.trim()
                ? `Gasto ${expenseNumber} · Pagado a: ${expenseData.beneficiary.trim()}`
                : `Gasto del negocio ${expenseNumber}`)) +
            cardNoteSuffix +
            advanceNoteSuffix,
          createdAt: now,
          updatedAt: now,
        };

        pendingSyncTreasuryMovementIdsRef.current.add(newMovement.id);
        const nextMovements = [newMovement, ...treasuryMovementsRef.current].sort(
          (a, b) =>
            (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
            (b.createdAt || '').localeCompare(a.createdAt || '')
        );
        treasuryMovementsRef.current = nextMovements;
        setTreasuryMovements(nextMovements);
        try {
          localStorage.setItem(STORAGE_KEYS.TREASURY_MOVEMENTS, JSON.stringify(nextMovements));
        } catch {}
        syncTreasuryMovementToFirestore(newMovement)
          .then(() => pendingSyncTreasuryMovementIdsRef.current.delete(newMovement.id))
          .catch(() => {});

        linkedAccountId = targetAccount.id;
        linkedAccountName = targetAccount.name;
        linkedMovementId = newMovement.id;
        deductedFromTreasury = true;
      }
    }

    const newExpense: BusinessExpense = {
      id: expenseId,
      expenseNumber,
      date: expenseDate,
      category: expenseData.category.trim() || 'Otros Gastos',
      description: expenseData.description.trim(),
      beneficiary: expenseData.beneficiary?.trim() || undefined,
      amountUSD,
      bcvRate: activeRate,
      amountBs,
      paymentCurrencyType: expenseData.paymentCurrencyType,
      paymentMethod: expenseData.paymentMethod,
      cardBank: cleanCardBank,
      reference: expenseData.reference?.trim() || undefined,
      notes: expenseData.notes?.trim() || undefined,
      treasuryAccountId: linkedAccountId,
      treasuryAccountName: linkedAccountName,
      treasuryMovementId: linkedMovementId,
      deductedFromTreasury,
      isSalaryAdvance: isSalaryAdvance || undefined,
      linkedCommitmentId,
      linkedCommitmentTitle,
      salaryAdvanceAppliedUSD,
      createdAt: now,
      updatedAt: now,
    };

    pendingSyncExpenseIdsRef.current.add(newExpense.id);
    const nextList = [newExpense, ...expensesRef.current].sort(
      (a, b) =>
        (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
        (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    expensesRef.current = nextList;
    setExpenses(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(nextList));
    } catch {}
    syncExpenseToFirestore(newExpense)
      .then(() => pendingSyncExpenseIdsRef.current.delete(newExpense.id))
      .catch(() => {});

    return newExpense;
  };

  const updateExpense: AppContextType['updateExpense'] = (id, updates) => {
    const existing = expensesRef.current.find((ex) => ex.id === id);
    if (!existing) return null;

    const now = new Date().toISOString();
    const rate =
      updates.bcvRate !== undefined && Number(updates.bcvRate) > 0
        ? Number(updates.bcvRate)
        : existing.bcvRate || settingsRef.current.bcvRate || 1;
    const nextUSD =
      updates.amountUSD !== undefined
        ? Math.round(Math.max(0, Number(updates.amountUSD) || 0) * 100) / 100
        : existing.amountUSD;
    const nextBs =
      updates.amountBs !== undefined
        ? Math.round(Math.max(0, Number(updates.amountBs) || 0) * 100) / 100
        : Math.round(nextUSD * rate * 100) / 100;
    const nextPaymentCurrencyType = updates.paymentCurrencyType || existing.paymentCurrencyType;
    const nextDate = updates.date || existing.date;
    const nextCategory = (updates.category !== undefined ? updates.category : existing.category).trim() || 'Otros Gastos';
    const nextDescription = (updates.description !== undefined ? updates.description : existing.description).trim();
    const nextReference = updates.reference !== undefined ? updates.reference?.trim() || undefined : existing.reference;
    const nextNotes = updates.notes !== undefined ? updates.notes?.trim() || undefined : existing.notes;
    const nextBeneficiary = updates.beneficiary !== undefined ? updates.beneficiary?.trim() || undefined : existing.beneficiary;

    // Handle salary advance (vale al sueldo) commitment deduction updates cleanly
    const prevLinkedCommitmentId = existing.linkedCommitmentId;
    const prevAppliedAdvanceUSD = Math.max(
      0,
      Math.round((Number(existing.salaryAdvanceAppliedUSD) || 0) * 100) / 100
    );

    const nextIsSalaryAdvanceFlag =
      updates.isSalaryAdvance !== undefined
        ? Boolean(updates.isSalaryAdvance)
        : Boolean(existing.isSalaryAdvance);
    const nextTargetCommitmentId = nextIsSalaryAdvanceFlag
      ? updates.linkedCommitmentId !== undefined
        ? updates.linkedCommitmentId
        : existing.linkedCommitmentId
      : undefined;

    let nextIsSalaryAdvance: boolean | undefined = existing.isSalaryAdvance;
    let nextLinkedCommitmentId: string | undefined = existing.linkedCommitmentId;
    let nextLinkedCommitmentTitle: string | undefined = existing.linkedCommitmentTitle;
    let nextSalaryAdvanceAppliedUSD: number | undefined = existing.salaryAdvanceAppliedUSD;

    const advanceChanged =
      updates.isSalaryAdvance !== undefined ||
      updates.linkedCommitmentId !== undefined ||
      (prevLinkedCommitmentId && Math.abs(nextUSD - existing.amountUSD) >= 0.005);

    if (advanceChanged) {
      if (prevLinkedCommitmentId && prevAppliedAdvanceUSD > 0) {
        adjustCommitmentForSalaryAdvance(prevLinkedCommitmentId, -prevAppliedAdvanceUSD);
      }
      if (nextIsSalaryAdvanceFlag && nextTargetCommitmentId && nextUSD > 0) {
        const advResult = adjustCommitmentForSalaryAdvance(nextTargetCommitmentId, nextUSD);
        if (advResult) {
          nextIsSalaryAdvance = true;
          nextLinkedCommitmentId = advResult.commitment.id;
          nextLinkedCommitmentTitle = formatCommitmentDisplayLabel(advResult.commitment);
          nextSalaryAdvanceAppliedUSD = advResult.appliedUSD;
        } else {
          nextIsSalaryAdvance = undefined;
          nextLinkedCommitmentId = undefined;
          nextLinkedCommitmentTitle = undefined;
          nextSalaryAdvanceAppliedUSD = undefined;
        }
      } else {
        nextIsSalaryAdvance = undefined;
        nextLinkedCommitmentId = undefined;
        nextLinkedCommitmentTitle = undefined;
        nextSalaryAdvanceAppliedUSD = undefined;
      }
    }

    const linkedMovement =
      (existing.treasuryMovementId
        ? treasuryMovementsRef.current.find((m) => m.id === existing.treasuryMovementId)
        : undefined) || treasuryMovementsRef.current.find((m) => m.expenseId === id);

    const nextCardBank =
      nextPaymentCurrencyType === 'PUNTO_VENTA'
        ? (updates.cardBank !== undefined ? updates.cardBank : existing.cardBank)?.trim() ||
          undefined
        : undefined;
    const cardNoteSuffix = nextCardBank ? ` · Punto de Venta (Tarjeta ${nextCardBank})` : '';

    const wantsTreasuryLink =
      updates.deductedFromTreasury !== undefined
        ? updates.deductedFromTreasury
        : Boolean(existing.deductedFromTreasury || linkedMovement || updates.treasuryAccountId);

    let nextTreasuryAccountId = existing.treasuryAccountId;
    let nextTreasuryAccountName = existing.treasuryAccountName;
    let nextTreasuryMovementId = linkedMovement?.id || existing.treasuryMovementId;
    let nextDeductedFromTreasury = Boolean(linkedMovement);

    if (linkedMovement && !wantsTreasuryLink) {
      // Unlink and revert balance in Treasury
      deleteTreasuryMovement(linkedMovement.id, true);
      nextTreasuryAccountId = undefined;
      nextTreasuryAccountName = undefined;
      nextTreasuryMovementId = undefined;
      nextDeductedFromTreasury = false;
    } else if (linkedMovement && wantsTreasuryLink) {
      // Revert previous movement deduction from previous account
      const oldAccount = treasuryAccountsRef.current.find((a) => a.id === linkedMovement.accountId);
      if (oldAccount) {
        const oldRevertSign = linkedMovement.type === 'INGRESO' ? -1 : 1;
        const oldNativeRevert =
          oldAccount.currency === 'BS' && Number(linkedMovement.amountBs) > 0
            ? oldRevertSign * Number(linkedMovement.amountBs)
            : oldRevertSign * (Number(linkedMovement.amountUSD) || 0);
        applyAccountDelta(
          oldAccount,
          oldRevertSign * (Number(linkedMovement.amountUSD) || 0),
          linkedMovement.bcvRate || rate,
          oldNativeRevert
        );
      }

      const preferredAccountId =
        updates.treasuryAccountId !== undefined
          ? updates.treasuryAccountId
          : updates.paymentCurrencyType && updates.paymentCurrencyType !== existing.paymentCurrencyType
            ? undefined
            : linkedMovement.accountId;
      const targetAccount = resolveTreasuryAccountForExpense(
        nextPaymentCurrencyType,
        preferredAccountId,
        nextCardBank
      );
      if (targetAccount) {
        const freshTarget =
          treasuryAccountsRef.current.find((a) => a.id === targetAccount.id) || targetAccount;
        const newNativeDelta = freshTarget.currency === 'BS' ? -nextBs : -nextUSD;
        applyAccountDelta(freshTarget, -nextUSD, rate, newNativeDelta);

        const updatedMovement: TreasuryMovement = {
          ...linkedMovement,
          date: nextDate,
          accountId: freshTarget.id,
          accountName: freshTarget.name,
          accountGroup: freshTarget.group,
          category: nextCategory,
          description: nextDescription,
          amountUSD: nextUSD,
          bcvRate: rate,
          amountBs: nextBs,
          reference: nextReference,
          salaryAdvanceCommitmentId: nextLinkedCommitmentId,
          salaryAdvanceAppliedUSD: nextSalaryAdvanceAppliedUSD,
          notes:
            (nextNotes ||
              (nextBeneficiary
                ? `Gasto ${existing.expenseNumber} · Pagado a: ${nextBeneficiary}`
                : `Gasto del negocio ${existing.expenseNumber}`)) + cardNoteSuffix,
          updatedAt: now,
        };

        pendingSyncTreasuryMovementIdsRef.current.add(updatedMovement.id);
        const nextMovements = treasuryMovementsRef.current
          .map((m) => (m.id === updatedMovement.id ? updatedMovement : m))
          .sort(
            (a, b) =>
              (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
              (b.createdAt || '').localeCompare(a.createdAt || '')
          );
        treasuryMovementsRef.current = nextMovements;
        setTreasuryMovements(nextMovements);
        try {
          localStorage.setItem(STORAGE_KEYS.TREASURY_MOVEMENTS, JSON.stringify(nextMovements));
        } catch {}
        syncTreasuryMovementToFirestore(updatedMovement)
          .then(() => pendingSyncTreasuryMovementIdsRef.current.delete(updatedMovement.id))
          .catch(() => {});

        nextTreasuryAccountId = freshTarget.id;
        nextTreasuryAccountName = freshTarget.name;
        nextTreasuryMovementId = updatedMovement.id;
        nextDeductedFromTreasury = true;
      }
    } else if (!linkedMovement && wantsTreasuryLink && nextUSD > 0) {
      const targetAccount = resolveTreasuryAccountForExpense(
        nextPaymentCurrencyType,
        updates.treasuryAccountId || existing.treasuryAccountId,
        nextCardBank
      );
      if (targetAccount) {
        const nativeDelta = targetAccount.currency === 'BS' ? -nextBs : -nextUSD;
        applyAccountDelta(targetAccount, -nextUSD, rate, nativeDelta);

        const newMovement: TreasuryMovement = {
          id: `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          movementNumber: nextMovementNumber(),
          date: nextDate,
          type: 'GASTO',
          accountId: targetAccount.id,
          accountName: targetAccount.name,
          accountGroup: targetAccount.group,
          category: nextCategory,
          description: nextDescription,
          amountUSD: nextUSD,
          bcvRate: rate,
          amountBs: nextBs,
          reference: nextReference,
          expenseId: id,
          salaryAdvanceCommitmentId: nextLinkedCommitmentId,
          salaryAdvanceAppliedUSD: nextSalaryAdvanceAppliedUSD,
          notes:
            (nextNotes ||
              (nextBeneficiary
                ? `Gasto ${existing.expenseNumber} · Pagado a: ${nextBeneficiary}`
                : `Gasto del negocio ${existing.expenseNumber}`)) + cardNoteSuffix,
          createdAt: now,
          updatedAt: now,
        };

        pendingSyncTreasuryMovementIdsRef.current.add(newMovement.id);
        const nextMovements = [newMovement, ...treasuryMovementsRef.current].sort(
          (a, b) =>
            (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
            (b.createdAt || '').localeCompare(a.createdAt || '')
        );
        treasuryMovementsRef.current = nextMovements;
        setTreasuryMovements(nextMovements);
        try {
          localStorage.setItem(STORAGE_KEYS.TREASURY_MOVEMENTS, JSON.stringify(nextMovements));
        } catch {}
        syncTreasuryMovementToFirestore(newMovement)
          .then(() => pendingSyncTreasuryMovementIdsRef.current.delete(newMovement.id))
          .catch(() => {});

        nextTreasuryAccountId = targetAccount.id;
        nextTreasuryAccountName = targetAccount.name;
        nextTreasuryMovementId = newMovement.id;
        nextDeductedFromTreasury = true;
      }
    }

    const updatedExpense: BusinessExpense = {
      ...existing,
      ...updates,
      date: nextDate,
      category: nextCategory,
      description: nextDescription,
      beneficiary: nextBeneficiary,
      cardBank: nextCardBank,
      reference: nextReference,
      notes: nextNotes,
      amountUSD: nextUSD,
      bcvRate: rate,
      amountBs: nextBs,
      treasuryAccountId: nextTreasuryAccountId,
      treasuryAccountName: nextTreasuryAccountName,
      treasuryMovementId: nextTreasuryMovementId,
      deductedFromTreasury: nextDeductedFromTreasury,
      isSalaryAdvance: nextIsSalaryAdvance,
      linkedCommitmentId: nextLinkedCommitmentId,
      linkedCommitmentTitle: nextLinkedCommitmentTitle,
      salaryAdvanceAppliedUSD: nextSalaryAdvanceAppliedUSD,
      updatedAt: now,
    };

    pendingSyncExpenseIdsRef.current.add(id);
    const nextList = expensesRef.current
      .map((ex) => (ex.id === id ? updatedExpense : ex))
      .sort(
        (a, b) =>
          (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
          (b.createdAt || '').localeCompare(a.createdAt || '')
      );
    expensesRef.current = nextList;
    setExpenses(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(nextList));
    } catch {}
    syncExpenseToFirestore(updatedExpense)
      .then(() => pendingSyncExpenseIdsRef.current.delete(id))
      .catch(() => {});

    return updatedExpense;
  };

  const deleteExpense = (id: string) => {
    const existing = expensesRef.current.find((ex) => ex.id === id);

    // If this expense was a salary advance (vale al sueldo), restore the deducted balance to the worker's commitment
    if (existing?.linkedCommitmentId && (Number(existing.salaryAdvanceAppliedUSD) || 0) > 0) {
      adjustCommitmentForSalaryAdvance(
        existing.linkedCommitmentId,
        -Number(existing.salaryAdvanceAppliedUSD)
      );
    }

    const linkedMovement =
      (existing?.treasuryMovementId
        ? treasuryMovementsRef.current.find((m) => m.id === existing.treasuryMovementId)
        : undefined) || treasuryMovementsRef.current.find((m) => m.expenseId === id);

    // Revert deducted liquidity in Treasury & remove linked movement
    if (linkedMovement) {
      deleteTreasuryMovement(linkedMovement.id, true);
    }

    recordDeleted('expenses', [id]);
    removeExpenseFromFirestore(id).catch(() => {});
    const nextList = expensesRef.current.filter((ex) => ex.id !== id);
    expensesRef.current = nextList;
    setExpenses(nextList);
  };

  const totalExpensesUSD = useMemo(() => {
    return (
      Math.round(expenses.reduce((sum, ex) => sum + (Number(ex.amountUSD) || 0), 0) * 100) / 100
    );
  }, [expenses]);

  const totalExpensesBs = totalExpensesUSD * settings.bcvRate;

  const currentMonthExpensesUSD = useMemo(() => {
    const now = new Date();
    const monthPrefix = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
    return (
      Math.round(
        expenses
          .filter((ex) => (ex.date || ex.createdAt || '').startsWith(monthPrefix))
          .reduce((sum, ex) => sum + (Number(ex.amountUSD) || 0), 0) * 100
      ) / 100
    );
  }, [expenses]);

  const currentMonthExpensesBs = currentMonthExpensesUSD * settings.bcvRate;

  // Treasury & Finance (Tesorería y Finanzas) Operations
  const computeAccountBalanceUSD = (
    currency: 'USD' | 'BS' | 'USDT',
    nativeBalance: number,
    rate: number
  ): number => {
    const cleanNative = Number(nativeBalance) || 0;
    if (currency === 'BS') {
      const safeRate = rate > 0 ? rate : 1;
      return Math.round((cleanNative / safeRate) * 100) / 100;
    }
    return Math.round(cleanNative * 100) / 100;
  };

  const initializeDefaultTreasuryAccounts = (): TreasuryAccount[] => {
    const now = new Date().toISOString();
    const defaults: TreasuryAccount[] = [
      {
        id: 'acc-efectivo-usd',
        name: 'Caja Efectivo USD ($)',
        group: 'EFECTIVO',
        currency: 'USD',
        nativeBalance: 0,
        balanceUSD: 0,
        institution: 'Caja Mostrador',
        notes: 'Efectivo en divisas disponibles en caja',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'acc-efectivo-bs',
        name: 'Caja Efectivo Bs',
        group: 'EFECTIVO',
        currency: 'BS',
        nativeBalance: 0,
        balanceUSD: 0,
        institution: 'Caja Mostrador',
        notes: 'Efectivo en Bolívares en caja',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'acc-banesco-personal',
        name: 'Banesco Personal (Bs)',
        group: 'BANCO_NACIONAL',
        currency: 'BS',
        nativeBalance: 0,
        balanceUSD: 0,
        institution: 'Banesco',
        notes: 'Cuenta para ingresos por Pago Móvil (Banesco Personal)',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'acc-provincial',
        name: 'Provincial (Bs)',
        group: 'BANCO_NACIONAL',
        currency: 'BS',
        nativeBalance: 0,
        balanceUSD: 0,
        institution: 'BBVA Provincial',
        notes: 'Cuenta para ingresos por Pago Móvil (Provincial)',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'acc-banesco-smcc',
        name: 'Banesco SMCC (Bs)',
        group: 'BANCO_NACIONAL',
        currency: 'BS',
        nativeBalance: 0,
        balanceUSD: 0,
        institution: 'Banesco',
        notes: 'Cuenta para ingresos automáticos por Punto de Venta (Bs)',
        createdAt: now,
        updatedAt: now,
      },
      {
        id: 'acc-billetera-usdt',
        name: 'Billetera USDT (Binance)',
        group: 'BILLETERA_DIVISAS',
        currency: 'USDT',
        nativeBalance: 0,
        balanceUSD: 0,
        institution: 'Binance Pay',
        notes: 'Saldo digital en USDT / divisas electrónicas',
        createdAt: now,
        updatedAt: now,
      },
    ];

    const existingIds = new Set(treasuryAccountsRef.current.map((a) => a.id));
    const toInsert = defaults.filter((d) => !existingIds.has(d.id));
    if (toInsert.length === 0) return treasuryAccountsRef.current;

    // Remove from tombstones if user explicitly requested re-initializing default accounts
    const restoredIds = toInsert.map((a) => a.id);
    if (deletedIdsRef.current.treasuryAccounts.some((id) => restoredIds.includes(id))) {
      const nextDeleted = {
        ...deletedIdsRef.current,
        treasuryAccounts: deletedIdsRef.current.treasuryAccounts.filter(
          (id) => !restoredIds.includes(id)
        ),
      };
      deletedIdsRef.current = nextDeleted;
      setDeletedIds(nextDeleted);
    }

    const nextAccounts = [...treasuryAccountsRef.current, ...toInsert];
    treasuryAccountsRef.current = nextAccounts;
    setTreasuryAccounts(nextAccounts);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_ACCOUNTS, JSON.stringify(nextAccounts));
    } catch {}
    toInsert.forEach((acc) => {
      pendingSyncTreasuryAccountIdsRef.current.add(acc.id);
      syncTreasuryAccountToFirestore(acc)
        .then(() => pendingSyncTreasuryAccountIdsRef.current.delete(acc.id))
        .catch(() => {});
    });
    return nextAccounts;
  };

  const ensureSalesTreasuryAccount = (
    preset:
      | 'BANESCO_PERSONAL'
      | 'PROVINCIAL'
      | 'BANESCO_SMCC'
      | 'EFECTIVO_BS'
      | 'EFECTIVO_USD'
      | 'BILLETERA_USDT'
  ): TreasuryAccount => {
    const accounts = treasuryAccountsRef.current;

    const findByPreset = (): TreasuryAccount | undefined => {
      if (preset === 'BANESCO_PERSONAL') {
        return (
          accounts.find((a) => a.id === 'acc-banesco-personal') ||
          accounts.find((a) => /banesco\s*personal/i.test(a.name))
        );
      }
      if (preset === 'PROVINCIAL') {
        return (
          accounts.find((a) => a.id === 'acc-provincial') ||
          accounts.find((a) => /provincial/i.test(a.name))
        );
      }
      if (preset === 'BANESCO_SMCC') {
        return (
          accounts.find((a) => a.id === 'acc-banesco-smcc') ||
          accounts.find((a) => /banesco\s*smcc|\bsmcc\b/i.test(a.name))
        );
      }
      if (preset === 'EFECTIVO_BS') {
        return (
          accounts.find((a) => a.id === 'acc-efectivo-bs') ||
          accounts.find((a) => /caja\s*efectivo\s*bs/i.test(a.name)) ||
          accounts.find((a) => a.currency === 'BS' && a.group === 'EFECTIVO')
        );
      }
      if (preset === 'EFECTIVO_USD') {
        return (
          accounts.find((a) => a.id === 'acc-efectivo-usd') ||
          accounts.find((a) => a.currency === 'USD' && a.group === 'EFECTIVO') ||
          accounts.find((a) => a.currency === 'USD')
        );
      }
      return (
        accounts.find((a) => a.id === 'acc-billetera-usdt') ||
        accounts.find((a) => a.currency === 'USDT') ||
        accounts.find((a) => a.group === 'BILLETERA_DIVISAS')
      );
    };

    const existing = findByPreset();
    if (existing) return existing;

    const now = new Date().toISOString();
    const presetDefinitions: Record<
      typeof preset,
      Omit<TreasuryAccount, 'createdAt' | 'updatedAt' | 'nativeBalance' | 'balanceUSD'>
    > = {
      BANESCO_PERSONAL: {
        id: 'acc-banesco-personal',
        name: 'Banesco Personal (Bs)',
        group: 'BANCO_NACIONAL',
        currency: 'BS',
        institution: 'Banesco',
        notes: 'Cuenta para ingresos por Pago Móvil (Banesco Personal)',
      },
      PROVINCIAL: {
        id: 'acc-provincial',
        name: 'Provincial (Bs)',
        group: 'BANCO_NACIONAL',
        currency: 'BS',
        institution: 'BBVA Provincial',
        notes: 'Cuenta para ingresos por Pago Móvil (Provincial)',
      },
      BANESCO_SMCC: {
        id: 'acc-banesco-smcc',
        name: 'Banesco SMCC (Bs)',
        group: 'BANCO_NACIONAL',
        currency: 'BS',
        institution: 'Banesco',
        notes: 'Cuenta para ingresos automáticos por Punto de Venta (Bs)',
      },
      EFECTIVO_BS: {
        id: 'acc-efectivo-bs',
        name: 'Caja Efectivo Bs',
        group: 'EFECTIVO',
        currency: 'BS',
        institution: 'Caja Mostrador',
        notes: 'Efectivo en Bolívares disponible en caja mostrador',
      },
      EFECTIVO_USD: {
        id: 'acc-efectivo-usd',
        name: 'Caja Efectivo USD ($)',
        group: 'EFECTIVO',
        currency: 'USD',
        institution: 'Caja Mostrador',
        notes: 'Efectivo en divisas disponibles en caja',
      },
      BILLETERA_USDT: {
        id: 'acc-billetera-usdt',
        name: 'Billetera USDT (Binance)',
        group: 'BILLETERA_DIVISAS',
        currency: 'USDT',
        institution: 'Binance Pay',
        notes: 'Saldo digital en USDT / divisas electrónicas',
      },
    };

    const def = presetDefinitions[preset];
    const created: TreasuryAccount = {
      ...def,
      nativeBalance: 0,
      balanceUSD: 0,
      createdAt: now,
      updatedAt: now,
    };

    if (deletedIdsRef.current.treasuryAccounts.includes(created.id)) {
      const nextDeleted = {
        ...deletedIdsRef.current,
        treasuryAccounts: deletedIdsRef.current.treasuryAccounts.filter(
          (id) => id !== created.id
        ),
      };
      deletedIdsRef.current = nextDeleted;
      setDeletedIds(nextDeleted);
    }

    pendingSyncTreasuryAccountIdsRef.current.add(created.id);
    const nextAccounts = [...treasuryAccountsRef.current, created];
    treasuryAccountsRef.current = nextAccounts;
    setTreasuryAccounts(nextAccounts);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_ACCOUNTS, JSON.stringify(nextAccounts));
    } catch {}
    syncTreasuryAccountToFirestore(created)
      .then(() => pendingSyncTreasuryAccountIdsRef.current.delete(created.id))
      .catch(() => {});

    return created;
  };

  const resolveOrCreateTreasuryAccountForSale = (
    paymentMethod: PaymentMethod | string,
    pagoMovilAccount?: PagoMovilAccountOption
  ): TreasuryAccount => {
    if (paymentMethod === 'Pago Móvil') {
      return ensureSalesTreasuryAccount(
        pagoMovilAccount === 'PROVINCIAL' ? 'PROVINCIAL' : 'BANESCO_PERSONAL'
      );
    }
    if (paymentMethod === 'Efectivo Bs') {
      return ensureSalesTreasuryAccount('EFECTIVO_BS');
    }
    if (paymentMethod === 'Punto de Venta (Bs)') {
      return ensureSalesTreasuryAccount('BANESCO_SMCC');
    }
    if (paymentMethod === 'Dólares Efectivo (USD)') {
      return ensureSalesTreasuryAccount('EFECTIVO_USD');
    }
    if (paymentMethod === 'Binance Pay (USDT)') {
      return ensureSalesTreasuryAccount('BILLETERA_USDT');
    }
    // Transferencia Bancaria Bs u otro método en Bolívares
    const existingBank =
      treasuryAccountsRef.current.find(
        (a) => a.id === 'acc-banesco-smcc' || /banesco\s*smcc|\bsmcc\b/i.test(a.name)
      ) ||
      treasuryAccountsRef.current.find(
        (a) => a.group === 'BANCO_NACIONAL' && a.currency === 'BS'
      );
    return existingBank || ensureSalesTreasuryAccount('BANESCO_SMCC');
  };

  const recordAutomaticSaleIncomeInTreasury = (params: {
    saleId: string;
    invoiceNumber: string;
    customerName: string;
    amountUSD: number;
    amountBs?: number;
    bcvRate: number;
    paymentMethod: PaymentMethod | string;
    pagoMovilAccount?: PagoMovilAccountOption;
    explicitAccountId?: string;
    date?: string;
    category: string;
    reference?: string;
    notes?: string;
  }): { account: TreasuryAccount; movement: TreasuryMovement } | null => {
    const cleanUSD = Math.round((Number(params.amountUSD) || 0) * 100) / 100;
    if (cleanUSD <= 0) return null;

    const safeRate = params.bcvRate > 0 ? params.bcvRate : settingsRef.current.bcvRate || 1;
    const explicitBs = Number(params.amountBs);
    const cleanBs =
      !Number.isNaN(explicitBs) && explicitBs > 0
        ? Math.round(explicitBs * 100) / 100
        : Math.round(cleanUSD * safeRate * 100) / 100;

    const explicitAcc = params.explicitAccountId
      ? treasuryAccountsRef.current.find((a) => a.id === params.explicitAccountId)
      : undefined;
    const targetAccount =
      explicitAcc ||
      resolveOrCreateTreasuryAccountForSale(
        params.paymentMethod,
        params.pagoMovilAccount
      );

    const explicitNativeDelta =
      targetAccount.currency === 'BS' ? cleanBs : cleanUSD;
    const updatedAccount = applyAccountDelta(
      targetAccount,
      cleanUSD,
      safeRate,
      explicitNativeDelta
    );

    const now = new Date().toISOString();
    const movDate = params.date || now.split('T')[0];
    const movementId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const methodDetail =
      params.paymentMethod === 'Pago Móvil'
        ? `Pago Móvil (${updatedAccount.name})`
        : params.paymentMethod === 'Punto de Venta (Bs)'
          ? `Punto de Venta · ${updatedAccount.name}`
          : `${String(params.paymentMethod)} · ${updatedAccount.name}`;

    const newMovement: TreasuryMovement = {
      id: movementId,
      movementNumber: nextMovementNumber(),
      date: movDate,
      type: 'INGRESO',
      accountId: updatedAccount.id,
      accountName: updatedAccount.name,
      accountGroup: updatedAccount.group,
      category: params.category,
      description: `${params.invoiceNumber} · ${params.customerName} (${methodDetail})`,
      amountUSD: cleanUSD,
      bcvRate: safeRate,
      amountBs: cleanBs,
      reference: params.reference || params.invoiceNumber,
      saleId: params.saleId,
      saleInvoiceNumber: params.invoiceNumber,
      notes: params.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    pendingSyncTreasuryMovementIdsRef.current.add(newMovement.id);
    const nextMovements = [newMovement, ...treasuryMovementsRef.current].sort(
      (a, b) =>
        (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
        (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    treasuryMovementsRef.current = nextMovements;
    setTreasuryMovements(nextMovements);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_MOVEMENTS, JSON.stringify(nextMovements));
    } catch {}
    syncTreasuryMovementToFirestore(newMovement)
      .then(() => pendingSyncTreasuryMovementIdsRef.current.delete(newMovement.id))
      .catch(() => {});

    return { account: updatedAccount, movement: newMovement };
  };

  const addTreasuryAccount: AppContextType['addTreasuryAccount'] = (data) => {
    const now = new Date().toISOString();
    const rate = settingsRef.current.bcvRate || 1;
    const nativeBal = Math.round((Number(data.nativeBalance) || 0) * 100) / 100;
    const balanceUSD = computeAccountBalanceUSD(data.currency, nativeBal, rate);

    const newAccount: TreasuryAccount = {
      id: `acc-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: data.name.trim(),
      group: data.group,
      currency: data.currency,
      nativeBalance: nativeBal,
      balanceUSD,
      institution: data.institution?.trim() || undefined,
      accountNumber: data.accountNumber?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    pendingSyncTreasuryAccountIdsRef.current.add(newAccount.id);
    const nextList = [...treasuryAccountsRef.current, newAccount];
    treasuryAccountsRef.current = nextList;
    setTreasuryAccounts(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_ACCOUNTS, JSON.stringify(nextList));
    } catch {}
    syncTreasuryAccountToFirestore(newAccount)
      .then(() => pendingSyncTreasuryAccountIdsRef.current.delete(newAccount.id))
      .catch(() => {});

    return newAccount;
  };

  const updateTreasuryAccount: AppContextType['updateTreasuryAccount'] = (id, updates) => {
    const existing = treasuryAccountsRef.current.find((a) => a.id === id);
    if (!existing) return null;

    const rate = settingsRef.current.bcvRate || 1;
    const nextCurrency = updates.currency ?? existing.currency;
    const nextNative =
      updates.nativeBalance !== undefined
        ? Math.round((Number(updates.nativeBalance) || 0) * 100) / 100
        : existing.nativeBalance;
    const nextBalanceUSD =
      updates.nativeBalance !== undefined || updates.currency !== undefined
        ? computeAccountBalanceUSD(nextCurrency, nextNative, rate)
        : updates.balanceUSD !== undefined
          ? Math.round((Number(updates.balanceUSD) || 0) * 100) / 100
          : existing.balanceUSD;

    const updatedAccount: TreasuryAccount = {
      ...existing,
      ...updates,
      currency: nextCurrency,
      nativeBalance: nextNative,
      balanceUSD: nextBalanceUSD,
      updatedAt: new Date().toISOString(),
    };

    pendingSyncTreasuryAccountIdsRef.current.add(id);
    const nextList = treasuryAccountsRef.current.map((a) => (a.id === id ? updatedAccount : a));
    treasuryAccountsRef.current = nextList;
    setTreasuryAccounts(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_ACCOUNTS, JSON.stringify(nextList));
    } catch {}
    syncTreasuryAccountToFirestore(updatedAccount)
      .then(() => pendingSyncTreasuryAccountIdsRef.current.delete(id))
      .catch(() => {});

    return updatedAccount;
  };

  const deleteTreasuryAccount = (id: string) => {
    recordDeleted('treasuryAccounts', [id]);
    removeTreasuryAccountFromFirestore(id).catch(() => {});
    const nextList = treasuryAccountsRef.current.filter((a) => a.id !== id);
    treasuryAccountsRef.current = nextList;
    setTreasuryAccounts(nextList);
  };

  // Local calendar date helpers (immune to UTC midnight timezone shifts)
  const getLocalTodayYMD = (): string => {
    const now = new Date();
    return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(
      now.getDate()
    ).padStart(2, '0')}`;
  };

  const parseLocalYMD = (ymd: string): Date | null => {
    const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec((ymd || '').trim());
    if (!m) return null;
    const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]), 12, 0, 0);
    return isNaN(d.getTime()) ? null : d;
  };

  const formatLocalYMD = (d: Date): string =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(
      d.getDate()
    ).padStart(2, '0')}`;

  const addDaysYMD = (ymd: string, days: number): string => {
    const d = parseLocalYMD(ymd);
    if (!d) return ymd;
    d.setDate(d.getDate() + days);
    return formatLocalYMD(d);
  };

  const addMonthsYMD = (ymd: string, months: number): string => {
    const d = parseLocalYMD(ymd);
    if (!d) return ymd;
    const targetDay = d.getDate();
    const targetMonthIndex = d.getMonth() + months;
    const firstOfTarget = new Date(d.getFullYear(), targetMonthIndex, 1, 12, 0, 0);
    const daysInTargetMonth = new Date(
      firstOfTarget.getFullYear(),
      firstOfTarget.getMonth() + 1,
      0,
      12,
      0,
      0
    ).getDate();
    firstOfTarget.setDate(Math.min(targetDay, daysInTargetMonth));
    return formatLocalYMD(firstOfTarget);
  };

  const getEndOfMonthYMD = (ymd: string): string => {
    const d = parseLocalYMD(ymd) || new Date();
    const lastDay = new Date(d.getFullYear(), d.getMonth() + 1, 0, 12, 0, 0);
    return formatLocalYMD(lastDay);
  };

  const getDayOfWeekYMD = (ymd: string): number => {
    const d = parseLocalYMD(ymd);
    return d ? d.getDay() : new Date().getDay();
  };

  const getEffectiveRecurrenceFrequency = (
    cm: TreasuryCommitment
  ): TreasuryCommitmentRecurrence => {
    if (cm.recurrenceFrequency) return cm.recurrenceFrequency;
    if (cm.isRecurringMonthly) return 'MENSUAL';
    return 'UNICO';
  };

  const advanceCommitmentDate = (
    ymd: string,
    freq: TreasuryCommitmentRecurrence
  ): string | null => {
    if (freq === 'SEMANAL') return addDaysYMD(ymd, 7);
    if (freq === 'QUINCENAL') return addDaysYMD(ymd, 14);
    if (freq === 'MENSUAL') return addMonthsYMD(ymd, 1);
    return null;
  };

  const sanitizeRecurrenceGroupId = (raw: string): string => {
    const cleaned = raw.replace(/[^a-zA-Z0-9_-]/g, '');
    return cleaned || `rec${Date.now()}`;
  };

  const syncRecurringCommitments: AppContextType['syncRecurringCommitments'] = (options) => {
    const currentList = treasuryCommitmentsRef.current;
    if (currentList.length === 0) return [];

    const deletedSet = new Set(deletedIdsRef.current.treasuryCommitments || []);
    const existingIds = new Set(currentList.map((c) => c.id));
    const today = getLocalTodayYMD();
    const endOfCurrentMonth = getEndOfMonthYMD(today);

    // Group recurring commitments by recurrenceGroupId (or own id for legacy monthly entries)
    const groups = new Map<string, TreasuryCommitment[]>();
    currentList.forEach((cm) => {
      const freq = getEffectiveRecurrenceFrequency(cm);
      if (freq === 'UNICO') return;
      const gKey = sanitizeRecurrenceGroupId(cm.recurrenceGroupId || cm.id);
      if (options?.targetGroupId && gKey !== sanitizeRecurrenceGroupId(options.targetGroupId)) {
        return;
      }
      const list = groups.get(gKey) || [];
      list.push(cm);
      groups.set(gKey, list);
    });

    if (groups.size === 0) return [];

    const createdList: TreasuryCommitment[] = [];
    const nowIso = new Date().toISOString();
    const currentBcvRate = settingsRef.current.bcvRate || 1;

    groups.forEach((items, safeGroupId) => {
      const sorted = [...items].sort(
        (a, b) =>
          (a.dueDate || '').localeCompare(b.dueDate || '') ||
          (a.createdAt || '').localeCompare(b.createdAt || '')
      );
      const latest = sorted[sorted.length - 1];
      if (!latest) return;

      const freq = getEffectiveRecurrenceFrequency(latest);
      if (freq === 'UNICO' || latest.recurrenceActive === false) return;
      if (!parseLocalYMD(latest.dueDate)) return;

      const mode: TreasuryCommitmentRecurrenceMode =
        options?.forceFillCurrentMonth
          ? 'MES_COMPLETO'
          : latest.recurrenceMode || 'PROGRESIVO';

      const existingDates = new Set(sorted.map((item) => item.dueDate));
      const datesToCreate: string[] = [];

      let cursor = advanceCommitmentDate(latest.dueDate, freq);
      let guard = 0;
      const maxSteps = 24;

      if (mode === 'MES_COMPLETO') {
        const nextWeekHorizon = addDaysYMD(today, 7);
        while (cursor && guard < maxSteps) {
          guard += 1;
          const withinCurrentMonth = cursor <= endOfCurrentMonth;
          const isImmediateNextAfterPayingLast =
            latest.isPaid && datesToCreate.length === 0 && cursor <= nextWeekHorizon;

          if (withinCurrentMonth || isImmediateNextAfterPayingLast) {
            if (!existingDates.has(cursor)) {
              datesToCreate.push(cursor);
              existingDates.add(cursor);
            }
            if (!withinCurrentMonth) break;
            cursor = advanceCommitmentDate(cursor, freq);
          } else {
            break;
          }
        }
      } else {
        // PROGRESIVO: appears week-by-week depending on its payment date (or right after marking paid)
        const shouldGenerateNext = latest.isPaid || latest.dueDate < today;
        if (shouldGenerateNext) {
          while (cursor && guard < maxSteps) {
            guard += 1;
            const occIdCheck = `cmt-${safeGroupId}-${cursor}`;
            const isDeleted = deletedSet.has(occIdCheck);
            const alreadyExists = existingDates.has(cursor) || existingIds.has(occIdCheck);

            if (!alreadyExists && !isDeleted) {
              datesToCreate.push(cursor);
              existingDates.add(cursor);
            }

            // Keep catching up any missed dates <= today, then stop once we have scheduled the next upcoming date > today
            if (cursor > today && (!isDeleted || cursor > addDaysYMD(today, 35))) {
              break;
            }
            cursor = advanceCommitmentDate(cursor, freq);
          }
        }
      }

      if (datesToCreate.length === 0) return;

      const baseAmountUSD =
        Math.round(
          Math.max(0, Number(latest.originalAmountUSD ?? latest.amountUSD) || 0) * 100
        ) / 100;
      const paymentCurrency: TreasuryCommitmentPaymentCurrency =
        latest.paymentCurrency === 'BS' ? 'BS' : 'EFECTIVO_USD';
      const exchangeRateType: TreasuryCommitmentRateType | undefined =
        paymentCurrency === 'BS' ? latest.exchangeRateType || 'BCV' : undefined;
      const appliedRate =
        paymentCurrency === 'BS'
          ? exchangeRateType === 'BCV'
            ? currentBcvRate
            : Number(latest.appliedExchangeRate) > 0
              ? Number(latest.appliedExchangeRate)
              : currentBcvRate
          : currentBcvRate;
      const amountBs = Math.round(baseAmountUSD * appliedRate * 100) / 100;

      datesToCreate.forEach((dueDate) => {
        const occId = `cmt-${safeGroupId}-${dueDate}`;
        if (deletedSet.has(occId) || existingIds.has(occId)) return;
        existingIds.add(occId);

        const nextCommitment: TreasuryCommitment = {
          id: occId,
          title: latest.title,
          workerName: latest.workerName,
          category: latest.category,
          dueDate,
          amountUSD: baseAmountUSD,
          originalAmountUSD: baseAmountUSD,
          advancesTotalUSD: 0,
          bcvRate: appliedRate,
          amountBs,
          paymentCurrency,
          exchangeRateType,
          appliedExchangeRate: paymentCurrency === 'BS' ? appliedRate : undefined,
          reservedUSD: 0,
          isPaid: false,
          isRecurringMonthly: freq === 'MENSUAL',
          recurrenceFrequency: freq,
          recurrenceMode: latest.recurrenceMode || 'PROGRESIVO',
          recurrenceGroupId: safeGroupId,
          recurrenceDayOfWeek:
            freq === 'SEMANAL'
              ? latest.recurrenceDayOfWeek ?? getDayOfWeekYMD(dueDate)
              : undefined,
          recurrenceActive: true,
          isAutoGenerated: true,
          notes: latest.notes,
          createdAt: nowIso,
          updatedAt: nowIso,
        };
        createdList.push(nextCommitment);
      });
    });

    if (createdList.length === 0) return [];

    createdList.forEach((cm) => pendingSyncTreasuryCommitmentIdsRef.current.add(cm.id));
    const nextList = [...treasuryCommitmentsRef.current, ...createdList].sort((a, b) =>
      (a.dueDate || '').localeCompare(b.dueDate || '')
    );
    treasuryCommitmentsRef.current = nextList;
    setTreasuryCommitments(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_COMMITMENTS, JSON.stringify(nextList));
    } catch {}
    createdList.forEach((cm) => {
      syncTreasuryCommitmentToFirestore(cm)
        .then(() => pendingSyncTreasuryCommitmentIdsRef.current.delete(cm.id))
        .catch(() => {});
    });

    return createdList;
  };

  const addTreasuryCommitment: AppContextType['addTreasuryCommitment'] = (data) => {
    const now = new Date().toISOString();
    const paymentCurrency: TreasuryCommitmentPaymentCurrency =
      data.paymentCurrency === 'BS' ? 'BS' : 'EFECTIVO_USD';
    const exchangeRateType: TreasuryCommitmentRateType | undefined =
      paymentCurrency === 'BS' ? data.exchangeRateType || 'BCV' : undefined;
    const baseBcv = Number(data.bcvRate) > 0 ? Number(data.bcvRate) : settingsRef.current.bcvRate || 1;
    const appliedRate =
      paymentCurrency === 'BS'
        ? Number(data.appliedExchangeRate) > 0
          ? Number(data.appliedExchangeRate)
          : baseBcv
        : baseBcv;
    const amountUSD = Math.round(Math.max(0, Number(data.amountUSD) || 0) * 100) / 100;
    const amountBs = Math.round(amountUSD * appliedRate * 100) / 100;
    const reservedUSD =
      data.reservedUSD !== undefined
        ? Math.min(amountUSD, Math.max(0, Math.round(Number(data.reservedUSD) * 100) / 100))
        : 0;

    const dueDate = data.dueDate || getLocalTodayYMD();
    const recurrenceFrequency: TreasuryCommitmentRecurrence =
      data.recurrenceFrequency || (data.isRecurringMonthly ? 'MENSUAL' : 'UNICO');
    const isRecurring = recurrenceFrequency !== 'UNICO';
    const recurrenceMode: TreasuryCommitmentRecurrenceMode | undefined = isRecurring
      ? data.recurrenceMode || 'PROGRESIVO'
      : undefined;
    const recurrenceGroupId = isRecurring
      ? sanitizeRecurrenceGroupId(`rec${Date.now()}${Math.random().toString(36).slice(2, 6)}`)
      : undefined;
    const recurrenceDayOfWeek =
      recurrenceFrequency === 'SEMANAL'
        ? data.recurrenceDayOfWeek ?? getDayOfWeekYMD(dueDate)
        : undefined;
    const recurrenceActive = isRecurring ? data.recurrenceActive !== false : false;

    const newCommitment: TreasuryCommitment = {
      id: `cmt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      title: data.title.trim(),
      workerName: data.workerName?.trim() || undefined,
      category: data.category,
      dueDate,
      amountUSD,
      originalAmountUSD: amountUSD,
      advancesTotalUSD: 0,
      bcvRate: appliedRate,
      amountBs,
      paymentCurrency,
      exchangeRateType,
      appliedExchangeRate: paymentCurrency === 'BS' ? appliedRate : undefined,
      reservedUSD,
      isPaid: false,
      linkedPurchaseOrderId: data.linkedPurchaseOrderId || undefined,
      isRecurringMonthly: recurrenceFrequency === 'MENSUAL' || Boolean(data.isRecurringMonthly),
      recurrenceFrequency,
      recurrenceMode,
      recurrenceGroupId,
      recurrenceDayOfWeek,
      recurrenceActive: isRecurring ? recurrenceActive : undefined,
      notes: data.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    pendingSyncTreasuryCommitmentIdsRef.current.add(newCommitment.id);
    const nextList = [...treasuryCommitmentsRef.current, newCommitment].sort((a, b) =>
      (a.dueDate || '').localeCompare(b.dueDate || '')
    );
    treasuryCommitmentsRef.current = nextList;
    setTreasuryCommitments(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_COMMITMENTS, JSON.stringify(nextList));
    } catch {}
    syncTreasuryCommitmentToFirestore(newCommitment)
      .then(() => pendingSyncTreasuryCommitmentIdsRef.current.delete(newCommitment.id))
      .catch(() => {});

    // Immediately generate remaining weeks of current month (or catch-up dates) if recurring
    if (isRecurring && recurrenceActive && recurrenceGroupId) {
      syncRecurringCommitments({ targetGroupId: recurrenceGroupId });
    }

    return newCommitment;
  };

  const updateTreasuryCommitment: AppContextType['updateTreasuryCommitment'] = (id, updates) => {
    const existing = treasuryCommitmentsRef.current.find((c) => c.id === id);
    if (!existing) return null;

    const nextPaymentCurrency: TreasuryCommitmentPaymentCurrency =
      updates.paymentCurrency !== undefined
        ? updates.paymentCurrency
        : existing.paymentCurrency || 'EFECTIVO_USD';
    const nextRateType: TreasuryCommitmentRateType | undefined =
      nextPaymentCurrency === 'BS'
        ? updates.exchangeRateType || existing.exchangeRateType || 'BCV'
        : undefined;
    const nextAppliedRate =
      nextPaymentCurrency === 'BS'
        ? updates.appliedExchangeRate !== undefined && Number(updates.appliedExchangeRate) > 0
          ? Number(updates.appliedExchangeRate)
          : updates.bcvRate !== undefined && Number(updates.bcvRate) > 0
            ? Number(updates.bcvRate)
            : existing.appliedExchangeRate || existing.bcvRate || settingsRef.current.bcvRate || 1
        : updates.bcvRate !== undefined && Number(updates.bcvRate) > 0
          ? Number(updates.bcvRate)
          : existing.bcvRate || settingsRef.current.bcvRate || 1;
    const nextAmountUSD =
      updates.amountUSD !== undefined
        ? Math.round(Math.max(0, Number(updates.amountUSD) || 0) * 100) / 100
        : existing.amountUSD;
    const nextAmountBs =
      updates.amountBs !== undefined
        ? Math.round(Math.max(0, Number(updates.amountBs) || 0) * 100) / 100
        : Math.round(nextAmountUSD * nextAppliedRate * 100) / 100;
    const currentAdvances = Math.max(0, Number(updates.advancesTotalUSD ?? existing.advancesTotalUSD) || 0);
    const nextOriginalAmountUSD =
      updates.originalAmountUSD !== undefined
        ? Math.round(Math.max(0, Number(updates.originalAmountUSD) || 0) * 100) / 100
        : updates.amountUSD !== undefined
          ? Math.round((nextAmountUSD + currentAdvances) * 100) / 100
          : existing.originalAmountUSD;
    const nextWorkerName =
      updates.workerName !== undefined
        ? updates.workerName?.trim() || undefined
        : existing.workerName;
    const nextDueDate = updates.dueDate !== undefined ? updates.dueDate : existing.dueDate;

    const nextRecurrenceFreq: TreasuryCommitmentRecurrence =
      updates.recurrenceFrequency !== undefined
        ? updates.recurrenceFrequency
        : getEffectiveRecurrenceFrequency(existing);
    const isNowRecurring = nextRecurrenceFreq !== 'UNICO';
    const nextRecurrenceGroupId = isNowRecurring
      ? sanitizeRecurrenceGroupId(
          updates.recurrenceGroupId ||
            existing.recurrenceGroupId ||
            `rec${Date.now()}${Math.random().toString(36).slice(2, 6)}`
        )
      : undefined;
    const nextRecurrenceMode: TreasuryCommitmentRecurrenceMode | undefined = isNowRecurring
      ? updates.recurrenceMode || existing.recurrenceMode || 'PROGRESIVO'
      : undefined;
    const nextRecurrenceDayOfWeek =
      nextRecurrenceFreq === 'SEMANAL'
        ? updates.recurrenceDayOfWeek ?? getDayOfWeekYMD(nextDueDate)
        : undefined;
    const nextRecurrenceActive = isNowRecurring
      ? updates.recurrenceActive !== undefined
        ? updates.recurrenceActive
        : existing.recurrenceActive !== false
      : false;

    const updatedCommitment: TreasuryCommitment = {
      ...existing,
      ...updates,
      dueDate: nextDueDate,
      workerName: nextWorkerName,
      paymentCurrency: nextPaymentCurrency,
      exchangeRateType: nextRateType,
      appliedExchangeRate: nextPaymentCurrency === 'BS' ? nextAppliedRate : undefined,
      amountUSD: nextAmountUSD,
      originalAmountUSD: nextOriginalAmountUSD,
      bcvRate: nextAppliedRate,
      amountBs: nextAmountBs,
      isRecurringMonthly: nextRecurrenceFreq === 'MENSUAL',
      recurrenceFrequency: nextRecurrenceFreq,
      recurrenceMode: nextRecurrenceMode,
      recurrenceGroupId: nextRecurrenceGroupId,
      recurrenceDayOfWeek: nextRecurrenceDayOfWeek,
      recurrenceActive: isNowRecurring ? nextRecurrenceActive : undefined,
      updatedAt: new Date().toISOString(),
    };

    const stoppedExistingSeries =
      Boolean(existing.recurrenceGroupId) &&
      (!isNowRecurring || nextRecurrenceActive === false);

    pendingSyncTreasuryCommitmentIdsRef.current.add(id);
    const siblingsToSync: TreasuryCommitment[] = [];
    const nextList = treasuryCommitmentsRef.current
      .map((c) => {
        if (c.id === id) return updatedCommitment;
        if (
          stoppedExistingSeries &&
          existing.recurrenceGroupId &&
          c.recurrenceGroupId === existing.recurrenceGroupId &&
          c.recurrenceActive !== false
        ) {
          const pausedSibling: TreasuryCommitment = {
            ...c,
            recurrenceActive: false,
            updatedAt: new Date().toISOString(),
          };
          pendingSyncTreasuryCommitmentIdsRef.current.add(pausedSibling.id);
          siblingsToSync.push(pausedSibling);
          return pausedSibling;
        }
        return c;
      })
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''));
    treasuryCommitmentsRef.current = nextList;
    setTreasuryCommitments(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_COMMITMENTS, JSON.stringify(nextList));
    } catch {}
    syncTreasuryCommitmentToFirestore(updatedCommitment)
      .then(() => pendingSyncTreasuryCommitmentIdsRef.current.delete(id))
      .catch(() => {});
    siblingsToSync.forEach((sib) => {
      syncTreasuryCommitmentToFirestore(sib)
        .then(() => pendingSyncTreasuryCommitmentIdsRef.current.delete(sib.id))
        .catch(() => {});
    });

    if (
      isNowRecurring &&
      nextRecurrenceActive &&
      nextRecurrenceGroupId &&
      (updates.recurrenceFrequency !== undefined ||
        updates.recurrenceMode !== undefined ||
        updates.recurrenceActive === true ||
        updates.dueDate !== undefined)
    ) {
      syncRecurringCommitments({ targetGroupId: nextRecurrenceGroupId });
    }

    return updatedCommitment;
  };

  const deleteTreasuryCommitment = (id: string) => {
    recordDeleted('treasuryCommitments', [id]);
    removeTreasuryCommitmentFromFirestore(id).catch(() => {});
    const nextList = treasuryCommitmentsRef.current.filter((c) => c.id !== id);
    treasuryCommitmentsRef.current = nextList;
    setTreasuryCommitments(nextList);
  };

  // Auto-schedule recurring weekly/biweekly/monthly commitments on mount, data sync, and daily check
  useEffect(() => {
    const timer = window.setTimeout(() => {
      syncRecurringCommitments();
    }, 350);
    return () => window.clearTimeout(timer);
  }, [treasuryCommitments]);

  useEffect(() => {
    const interval = window.setInterval(() => {
      syncRecurringCommitments();
    }, 1000 * 60 * 15);
    return () => window.clearInterval(interval);
  }, []);

  const mapAccountToExpensePayment = (
    account: TreasuryAccount
  ): { currencyType: ExpensePaymentCurrency; method: ExpensePaymentMethod } => {
    if (account.currency === 'USDT') {
      return { currencyType: 'USDT', method: 'USDT (Binance Pay)' };
    }
    if (account.currency === 'BS' && account.group === 'EFECTIVO') {
      return { currencyType: 'EFECTIVO_BS', method: 'Efectivo Bs' };
    }
    if (account.currency === 'BS') {
      return { currencyType: 'BS', method: 'Bolívares (Transferencia / Pago Móvil)' };
    }
    return { currencyType: 'EFECTIVO_USD', method: 'Efectivo en Dólares ($)' };
  };

  const nextMovementNumber = (): string => {
    let nextIndex = treasuryMovementsRef.current.length + 1;
    treasuryMovementsRef.current.forEach((mv) => {
      const m = (mv.movementNumber || '').match(/(\d+)$/);
      if (m) {
        const parsed = parseInt(m[1], 10);
        if (!isNaN(parsed) && parsed >= nextIndex) nextIndex = parsed + 1;
      }
    });
    const year = new Date().getFullYear();
    return `MOV-${year}-${String(nextIndex).padStart(4, '0')}`;
  };

  const applyAccountDelta = (
    account: TreasuryAccount,
    deltaUSD: number,
    rate: number,
    explicitNativeDelta?: number
  ): TreasuryAccount => {
    const safeRate = rate > 0 ? rate : settingsRef.current.bcvRate || 1;
    const nativeDelta =
      explicitNativeDelta !== undefined
        ? explicitNativeDelta
        : account.currency === 'BS'
          ? Math.round(deltaUSD * safeRate * 100) / 100
          : Math.round(deltaUSD * 100) / 100;

    const nextNative = Math.round(((Number(account.nativeBalance) || 0) + nativeDelta) * 100) / 100;
    const nextBalanceUSD = computeAccountBalanceUSD(account.currency, nextNative, safeRate);
    const updatedAcc: TreasuryAccount = {
      ...account,
      nativeBalance: nextNative,
      balanceUSD: nextBalanceUSD,
      updatedAt: new Date().toISOString(),
    };

    pendingSyncTreasuryAccountIdsRef.current.add(updatedAcc.id);
    const nextAccounts = treasuryAccountsRef.current.map((a) =>
      a.id === updatedAcc.id ? updatedAcc : a
    );
    treasuryAccountsRef.current = nextAccounts;
    setTreasuryAccounts(nextAccounts);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_ACCOUNTS, JSON.stringify(nextAccounts));
    } catch {}
    syncTreasuryAccountToFirestore(updatedAcc)
      .then(() => pendingSyncTreasuryAccountIdsRef.current.delete(updatedAcc.id))
      .catch(() => {});

    return updatedAcc;
  };

  const markCommitmentPaidFromAccount: AppContextType['markCommitmentPaidFromAccount'] = (
    commitmentId,
    accountId,
    options
  ) => {
    const commitment = treasuryCommitmentsRef.current.find((c) => c.id === commitmentId);
    const account = treasuryAccountsRef.current.find((a) => a.id === accountId);
    if (!commitment || !account) return null;

    const isBsCommitment = commitment.paymentCurrency === 'BS';
    const rateType = options?.exchangeRateType || commitment.exchangeRateType || 'BCV';
    const rate =
      options?.appliedExchangeRate && Number(options.appliedExchangeRate) > 0
        ? Number(options.appliedExchangeRate)
        : isBsCommitment && rateType !== 'BCV' && commitment.appliedExchangeRate && commitment.appliedExchangeRate > 0
          ? Number(commitment.appliedExchangeRate)
          : settingsRef.current.bcvRate || commitment.bcvRate || 1;
    const now = new Date().toISOString();
    const payDate = options?.paymentDate || now.split('T')[0];
    const amountUSD = Math.round((Number(commitment.amountUSD) || 0) * 100) / 100;
    const amountBs = Math.round(amountUSD * rate * 100) / 100;

    const rateLabelNote = isBsCommitment
      ? `Pago en Bs (${rateType === 'EURO' ? 'Tasa Euro' : rateType === 'USDT' ? 'Tasa USDT' : 'Tasa BCV'}: Bs. ${rate.toFixed(2)})`
      : 'Pago en Efectivo Dólares ($)';

    // 1. Deduct from selected account using exact native amount (respects Euro/USDT/BCV rate when paying from Bs account)
    const explicitNativeDelta = account.currency === 'BS' ? -amountBs : -amountUSD;
    const updatedAccount = applyAccountDelta(account, -amountUSD, rate, explicitNativeDelta);

    // 2. Sync linked Purchase Order if applicable
    if (commitment.linkedPurchaseOrderId) {
      const linkedPo = purchaseOrdersRef.current.find(
        (po) => po.id === commitment.linkedPurchaseOrderId
      );
      if (linkedPo) {
        const remainingPo = Math.max(0, linkedPo.totalUSD - (linkedPo.paidAmountUSD || 0));
        if (remainingPo > 0.01) {
          const poCurrency: PurchasePaymentCurrency =
            account.currency === 'USDT'
              ? 'USDT'
              : account.currency === 'BS'
                ? 'BS'
                : 'DIVISAS';
          recordPurchaseOrderPayment(linkedPo.id, {
            amountUSD: Math.min(amountUSD, remainingPo),
            currencyCategory: poCurrency,
            paymentMethod: account.name,
            reference: options?.reference,
            notes: `Pagado desde Tesorería (${account.name}) · ${rateLabelNote}`,
          });
        }
      }
    }

    // 3. Optionally mirror into Gastos del Negocio (except Proveedores already tracked in purchaseOrders)
    const movementId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    let createdExpense: BusinessExpense | undefined;
    if (options?.syncToExpense !== false && commitment.category !== 'PROVEEDORES') {
      const mapped = mapAccountToExpensePayment(account);
      const expenseCategory =
        commitment.category === 'NOMINA_SUELDOS'
          ? 'Sueldos y Nómina'
          : commitment.category === 'GASTOS_FIJOS'
            ? 'Servicios Públicos (Luz, Agua, Internet)'
            : commitment.category;
      createdExpense = addExpense({
        date: payDate,
        category: expenseCategory,
        description: commitment.title,
        amountUSD,
        amountBs,
        bcvRate: rate,
        paymentCurrencyType: mapped.currencyType,
        paymentMethod: mapped.method,
        reference: options?.reference,
        notes: options?.notes || `${rateLabelNote} desde ${account.name}`,
        treasuryAccountId: account.id,
        treasuryAccountName: account.name,
        treasuryMovementId: movementId,
        skipTreasuryDeduction: true,
      });
    }

    // 4. Create Treasury Movement
    const categoryLabel =
      commitment.category === 'NOMINA_SUELDOS'
        ? 'Nómina/Sueldos'
        : commitment.category === 'PROVEEDORES'
          ? 'Proveedores'
          : commitment.category === 'GASTOS_FIJOS'
            ? 'Gastos Fijos'
            : commitment.category;

    const newMovement: TreasuryMovement = {
      id: movementId,
      movementNumber: nextMovementNumber(),
      date: payDate,
      type: 'PAGO_PLANIFICADO',
      accountId: account.id,
      accountName: account.name,
      accountGroup: account.group,
      category: categoryLabel,
      description: commitment.title,
      amountUSD,
      bcvRate: rate,
      amountBs,
      reference: options?.reference?.trim() || undefined,
      commitmentId: commitment.id,
      expenseId: createdExpense?.id,
      notes: options?.notes?.trim() || rateLabelNote,
      createdAt: now,
      updatedAt: now,
    };

    pendingSyncTreasuryMovementIdsRef.current.add(newMovement.id);
    const nextMovements = [newMovement, ...treasuryMovementsRef.current].sort(
      (a, b) =>
        (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
        (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    treasuryMovementsRef.current = nextMovements;
    setTreasuryMovements(nextMovements);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_MOVEMENTS, JSON.stringify(nextMovements));
    } catch {}
    syncTreasuryMovementToFirestore(newMovement)
      .then(() => pendingSyncTreasuryMovementIdsRef.current.delete(newMovement.id))
      .catch(() => {});

    // 5. Update Commitment status -> Pagado
    const updatedCommitment = updateTreasuryCommitment(commitment.id, {
      isPaid: true,
      paidAt: now,
      paidAccountId: account.id,
      paidAccountName: account.name,
      reservedUSD: amountUSD,
      bcvRate: rate,
      amountBs,
      ...(isBsCommitment ? { exchangeRateType: rateType, appliedExchangeRate: rate } : {}),
    });

    // 6. If recurring (semanal / quincenal / mensual), automatically schedule the next payment date
    let generatedNextCommitments: TreasuryCommitment[] = [];
    const targetCm = updatedCommitment || commitment;
    if (
      getEffectiveRecurrenceFrequency(targetCm) !== 'UNICO' &&
      targetCm.recurrenceActive !== false
    ) {
      generatedNextCommitments = syncRecurringCommitments({
        targetGroupId: targetCm.recurrenceGroupId || targetCm.id,
      });
    }

    return {
      commitment: updatedCommitment || { ...commitment, isPaid: true },
      movement: newMovement,
      account: updatedAccount,
      generatedNextCommitments,
    };
  };

  const recordTreasuryMovement: AppContextType['recordTreasuryMovement'] = (data) => {
    const account = treasuryAccountsRef.current.find((a) => a.id === data.accountId);
    if (!account) return null;

    const rate =
      Number(data.bcvRate) > 0 ? Number(data.bcvRate) : settingsRef.current.bcvRate || 1;
    const rawInput = Math.max(0, Number(data.amountInput) || 0);
    if (rawInput <= 0) return null;

    const effectiveCurrency = data.inputCurrency || account.currency;
    const amountUSD =
      effectiveCurrency === 'BS'
        ? Math.round((rawInput / rate) * 100) / 100
        : Math.round(rawInput * 100) / 100;
    const amountBs =
      effectiveCurrency === 'BS'
        ? Math.round(rawInput * 100) / 100
        : Math.round(amountUSD * rate * 100) / 100;

    const sign = data.type === 'INGRESO' ? 1 : -1;
    const explicitNativeDelta =
      account.currency === 'BS' && effectiveCurrency === 'BS'
        ? sign * Math.round(rawInput * 100) / 100
        : account.currency !== 'BS' && effectiveCurrency !== 'BS'
          ? sign * Math.round(rawInput * 100) / 100
          : undefined;

    const updatedAccount = applyAccountDelta(account, sign * amountUSD, rate, explicitNativeDelta);

    const now = new Date().toISOString();
    const movDate = data.date || now.split('T')[0];

    const movementId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    let updatedCommitment: TreasuryCommitment | undefined;
    let salaryAdvanceCommitmentId: string | undefined;
    let salaryAdvanceCommitmentTitle: string | undefined;
    let salaryAdvanceAppliedUSD: number | undefined;

    if (
      data.type === 'GASTO' &&
      data.isSalaryAdvance &&
      data.linkedCommitmentId &&
      amountUSD > 0
    ) {
      const advResult = adjustCommitmentForSalaryAdvance(data.linkedCommitmentId, amountUSD);
      if (advResult) {
        updatedCommitment = advResult.commitment;
        salaryAdvanceCommitmentId = advResult.commitment.id;
        salaryAdvanceCommitmentTitle = formatCommitmentDisplayLabel(advResult.commitment);
        salaryAdvanceAppliedUSD = advResult.appliedUSD;
      }
    }

    let createdExpense: BusinessExpense | undefined;
    if (data.type !== 'INGRESO' && data.syncToExpense) {
      const mapped = mapAccountToExpensePayment(account);
      createdExpense = addExpense({
        date: movDate,
        category: data.category.trim() || 'Otros Gastos',
        description: data.description.trim(),
        beneficiary: data.beneficiary?.trim() || undefined,
        amountUSD,
        amountBs,
        bcvRate: rate,
        paymentCurrencyType: mapped.currencyType,
        paymentMethod: mapped.method,
        reference: data.reference,
        notes: data.notes,
        treasuryAccountId: account.id,
        treasuryAccountName: account.name,
        treasuryMovementId: movementId,
        skipTreasuryDeduction: true,
        isSalaryAdvance: Boolean(salaryAdvanceCommitmentId),
        linkedCommitmentId: salaryAdvanceCommitmentId,
        linkedCommitmentTitle: salaryAdvanceCommitmentTitle,
        salaryAdvanceAppliedUSD,
        skipCommitmentDeduction: true,
      });
    }

    const advanceNote = salaryAdvanceCommitmentTitle
      ? `Vale descontado de: ${salaryAdvanceCommitmentTitle}`
      : undefined;
    const combinedNotes = [data.notes?.trim(), advanceNote].filter(Boolean).join(' · ') || undefined;

    const newMovement: TreasuryMovement = {
      id: movementId,
      movementNumber: nextMovementNumber(),
      date: movDate,
      type: data.type,
      accountId: account.id,
      accountName: account.name,
      accountGroup: account.group,
      category: data.category.trim() || (data.type === 'INGRESO' ? 'Ingreso Operativo' : 'Gasto Operativo'),
      description: data.description.trim(),
      amountUSD,
      bcvRate: rate,
      amountBs,
      reference: data.reference?.trim() || undefined,
      expenseId: createdExpense?.id,
      salaryAdvanceCommitmentId,
      salaryAdvanceAppliedUSD,
      notes: combinedNotes,
      createdAt: now,
      updatedAt: now,
    };

    pendingSyncTreasuryMovementIdsRef.current.add(newMovement.id);
    const nextMovements = [newMovement, ...treasuryMovementsRef.current].sort(
      (a, b) =>
        (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
        (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    treasuryMovementsRef.current = nextMovements;
    setTreasuryMovements(nextMovements);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_MOVEMENTS, JSON.stringify(nextMovements));
    } catch {}
    syncTreasuryMovementToFirestore(newMovement)
      .then(() => pendingSyncTreasuryMovementIdsRef.current.delete(newMovement.id))
      .catch(() => {});

    return {
      movement: newMovement,
      account: updatedAccount,
      expense: createdExpense,
      updatedCommitment,
    };
  };

  const recordUsdtPurchase: AppContextType['recordUsdtPurchase'] = (data) => {
    const sourceAccount = treasuryAccountsRef.current.find((a) => a.id === data.sourceAccountId);
    const initialTargetAccount = treasuryAccountsRef.current.find(
      (a) => a.id === data.targetAccountId
    );
    if (!sourceAccount || !initialTargetAccount) return null;
    if (sourceAccount.id === initialTargetAccount.id) return null;

    const cleanSpentBs = Math.round(Math.max(0, Number(data.spentBs) || 0) * 100) / 100;
    const cleanPurchasedUsdt =
      Math.round(Math.max(0, Number(data.purchasedUsdt) || 0) * 100) / 100;
    if (cleanSpentBs <= 0 || cleanPurchasedUsdt <= 0) return null;

    const safeBcvRate =
      Number(data.bcvRate) > 0 ? Number(data.bcvRate) : settingsRef.current.bcvRate || 1;
    const effectiveUsdtRate = Math.round((cleanSpentBs / cleanPurchasedUsdt) * 100) / 100;
    const sourceDeductUSD = Math.round((cleanSpentBs / safeBcvRate) * 100) / 100;

    // 1) Deduct exact Bolívares (or USD equivalent if non-Bs source) from the source account
    const sourceExplicitNativeDelta =
      sourceAccount.currency === 'BS' ? -cleanSpentBs : -sourceDeductUSD;
    const updatedSourceAccount = applyAccountDelta(
      sourceAccount,
      -sourceDeductUSD,
      safeBcvRate,
      sourceExplicitNativeDelta
    );

    // 2) Re-read target account from ref after source update so both updates persist cleanly
    const freshTargetAccount =
      treasuryAccountsRef.current.find((a) => a.id === data.targetAccountId) ||
      initialTargetAccount;
    const targetExplicitNativeDelta =
      freshTargetAccount.currency === 'BS' ? cleanSpentBs : cleanPurchasedUsdt;
    const updatedTargetAccount = applyAccountDelta(
      freshTargetAccount,
      cleanPurchasedUsdt,
      safeBcvRate,
      targetExplicitNativeDelta
    );

    // 3) Create two linked TreasuryMovements (GASTO on source account + INGRESO on USDT wallet)
    const now = new Date().toISOString();
    const movDate = data.date || now.split('T')[0];
    const ts = Date.now();
    const expenseMovementId = `mov-${ts}-usdt-out-${Math.random().toString(36).slice(2, 6)}`;
    const incomeMovementId = `mov-${ts}-usdt-in-${Math.random().toString(36).slice(2, 6)}`;

    const expenseMovNum = nextMovementNumber();
    const numMatch = expenseMovNum.match(/^(.+-)(\d+)$/);
    const incomeMovNum = numMatch
      ? `${numMatch[1]}${String(parseInt(numMatch[2], 10) + 1).padStart(4, '0')}`
      : `${expenseMovNum}-B`;

    const formattedRateStr = effectiveUsdtRate.toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const formattedSpentBsStr = cleanSpentBs.toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });
    const formattedUsdtStr = cleanPurchasedUsdt.toLocaleString('es-VE', {
      minimumFractionDigits: 2,
      maximumFractionDigits: 2,
    });

    const userNote = data.notes?.trim() || '';
    const rateNote = `Tasa efectiva: Bs. ${formattedRateStr}/USDT`;
    const combinedNotes = [userNote, rateNote].filter(Boolean).join(' · ');

    const expenseMovement: TreasuryMovement = {
      id: expenseMovementId,
      movementNumber: expenseMovNum,
      date: movDate,
      type: 'GASTO',
      accountId: updatedSourceAccount.id,
      accountName: updatedSourceAccount.name,
      accountGroup: updatedSourceAccount.group,
      category: 'Compra de USDT / Divisas',
      description: `Compra de ${formattedUsdtStr} USDT → ${updatedTargetAccount.name} (Bs. ${formattedSpentBsStr})`,
      amountUSD: sourceDeductUSD,
      bcvRate: safeBcvRate,
      amountBs: cleanSpentBs,
      reference: data.reference?.trim() || undefined,
      linkedMovementId: incomeMovementId,
      notes: combinedNotes,
      createdAt: now,
      updatedAt: now,
    };

    const incomeMovement: TreasuryMovement = {
      id: incomeMovementId,
      movementNumber: incomeMovNum,
      date: movDate,
      type: 'INGRESO',
      accountId: updatedTargetAccount.id,
      accountName: updatedTargetAccount.name,
      accountGroup: updatedTargetAccount.group,
      category: 'Ingreso de USDT (Compra)',
      description: `Ingreso de ${formattedUsdtStr} USDT (Pagado desde ${updatedSourceAccount.name}: Bs. ${formattedSpentBsStr})`,
      amountUSD: cleanPurchasedUsdt,
      bcvRate: safeBcvRate,
      amountBs: cleanSpentBs,
      reference: data.reference?.trim() || undefined,
      linkedMovementId: expenseMovementId,
      notes: combinedNotes,
      createdAt: now,
      updatedAt: now,
    };

    pendingSyncTreasuryMovementIdsRef.current.add(expenseMovement.id);
    pendingSyncTreasuryMovementIdsRef.current.add(incomeMovement.id);
    const nextMovements = [incomeMovement, expenseMovement, ...treasuryMovementsRef.current].sort(
      (a, b) =>
        (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
        (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    treasuryMovementsRef.current = nextMovements;
    setTreasuryMovements(nextMovements);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_MOVEMENTS, JSON.stringify(nextMovements));
    } catch {}
    syncTreasuryMovementToFirestore(expenseMovement)
      .then(() => pendingSyncTreasuryMovementIdsRef.current.delete(expenseMovement.id))
      .catch(() => {});
    syncTreasuryMovementToFirestore(incomeMovement)
      .then(() => pendingSyncTreasuryMovementIdsRef.current.delete(incomeMovement.id))
      .catch(() => {});

    return {
      expenseMovement,
      incomeMovement,
      sourceAccount: updatedSourceAccount,
      targetAccount: updatedTargetAccount,
      effectiveUsdtRate,
    };
  };

  const deleteTreasuryMovement = (id: string, revertAccountBalance: boolean = true) => {
    const existing = treasuryMovementsRef.current.find((m) => m.id === id);
    if (existing && revertAccountBalance) {
      const account = treasuryAccountsRef.current.find((a) => a.id === existing.accountId);
      if (account) {
        const revertSign = existing.type === 'INGRESO' ? -1 : 1;
        const rate = existing.bcvRate || settingsRef.current.bcvRate || 1;
        const explicitNativeRevert =
          account.currency === 'BS' && Number(existing.amountBs) > 0
            ? revertSign * Number(existing.amountBs)
            : revertSign * (Number(existing.amountUSD) || 0);
        applyAccountDelta(
          account,
          revertSign * (Number(existing.amountUSD) || 0),
          rate,
          explicitNativeRevert
        );
      }
    }
    recordDeleted('treasuryMovements', [id]);
    removeTreasuryMovementFromFirestore(id).catch(() => {});
    const nextList = treasuryMovementsRef.current.filter((m) => m.id !== id);
    treasuryMovementsRef.current = nextList;
    setTreasuryMovements(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_MOVEMENTS, JSON.stringify(nextList));
    } catch {}

    // If this standalone movement (without a linked BusinessExpense) discounted a worker commitment as a vale, restore it
    if (
      existing?.salaryAdvanceCommitmentId &&
      (Number(existing.salaryAdvanceAppliedUSD) || 0) > 0 &&
      !existing.expenseId
    ) {
      adjustCommitmentForSalaryAdvance(
        existing.salaryAdvanceCommitmentId,
        -Number(existing.salaryAdvanceAppliedUSD)
      );
    }

    // If a BusinessExpense pointed to this movement, clear the link so deleting the expense later won't double-revert
    if (existing?.expenseId) {
      const linkedExp = expensesRef.current.find(
        (ex) => ex.id === existing.expenseId && ex.treasuryMovementId === id
      );
      if (linkedExp) {
        const unlinkedExp: BusinessExpense = {
          ...linkedExp,
          treasuryMovementId: undefined,
          deductedFromTreasury: false,
          updatedAt: new Date().toISOString(),
        };
        pendingSyncExpenseIdsRef.current.add(unlinkedExp.id);
        const nextExpenses = expensesRef.current.map((ex) =>
          ex.id === unlinkedExp.id ? unlinkedExp : ex
        );
        expensesRef.current = nextExpenses;
        setExpenses(nextExpenses);
        try {
          localStorage.setItem(STORAGE_KEYS.EXPENSES, JSON.stringify(nextExpenses));
        } catch {}
        syncExpenseToFirestore(unlinkedExp)
          .then(() => pendingSyncExpenseIdsRef.current.delete(unlinkedExp.id))
          .catch(() => {});
      }
    }

    // If a Sale pointed to this movement, unlink it so deleting/voiding the sale later won't double-revert
    if (existing?.saleId) {
      const linkedSale = salesRef.current.find(
        (s) => s.id === existing.saleId && s.treasuryMovementId === id
      );
      if (linkedSale) {
        const unlinkedSale: Sale = {
          ...linkedSale,
          treasuryMovementId: undefined,
        };
        const nextSales = salesRef.current.map((s) =>
          s.id === unlinkedSale.id ? unlinkedSale : s
        );
        salesRef.current = nextSales;
        setSales(nextSales);
        try {
          localStorage.setItem(STORAGE_KEYS.SALES, JSON.stringify(nextSales));
        } catch {}
        syncSaleWithRetry(unlinkedSale);
      }
    }

    // If a TreasuryDebt payment pointed to this movement, revert that payment on the debt
    if (existing?.debtId) {
      const linkedDebt = treasuryDebtsRef.current.find((d) => d.id === existing.debtId);
      if (linkedDebt) {
        const removedPayment = (linkedDebt.payments || []).find(
          (p) => p.treasuryMovementId === id
        );
        if (removedPayment) {
          const remainingPayments = (linkedDebt.payments || []).filter(
            (p) => p.treasuryMovementId !== id
          );
          const nextPaidUSD =
            Math.round(
              Math.max(0, (Number(linkedDebt.paidAmountUSD) || 0) - (Number(removedPayment.amountUSD) || 0)) *
                100
            ) / 100;
          const nextRemainingUSD =
            Math.round(Math.max(0, (Number(linkedDebt.totalAmountUSD) || 0) - nextPaidUSD) * 100) /
            100;
          const nextPlan = linkedDebt.paymentPlan
            ? {
                ...linkedDebt.paymentPlan,
                installments: linkedDebt.paymentPlan.installments.map((inst) =>
                  removedPayment.installmentId && inst.id === removedPayment.installmentId
                    ? {
                        ...inst,
                        status: 'PENDIENTE' as const,
                        paidAt: undefined,
                        paidAccountId: undefined,
                        paidAccountName: undefined,
                        reference: undefined,
                      }
                    : inst
                ),
              }
            : undefined;
          const nextStatus: DebtStatus =
            nextRemainingUSD <= 0.009
              ? 'PAGADA'
              : nextPlan && nextPlan.installments.length > 0
                ? 'EN_PLAN'
                : 'ACTIVA';
          const updatedDebt: TreasuryDebt = {
            ...linkedDebt,
            payments: remainingPayments,
            paidAmountUSD: nextPaidUSD,
            remainingAmountUSD: nextRemainingUSD,
            status: nextStatus,
            paymentPlan: nextPlan,
            updatedAt: new Date().toISOString(),
          };
          pendingSyncTreasuryDebtIdsRef.current.add(updatedDebt.id);
          const nextDebts = treasuryDebtsRef.current.map((d) =>
            d.id === updatedDebt.id ? updatedDebt : d
          );
          treasuryDebtsRef.current = nextDebts;
          setTreasuryDebts(nextDebts);
          try {
            localStorage.setItem(STORAGE_KEYS.TREASURY_DEBTS, JSON.stringify(nextDebts));
          } catch {}
          syncTreasuryDebtToFirestore(updatedDebt)
            .then(() => pendingSyncTreasuryDebtIdsRef.current.delete(updatedDebt.id))
            .catch(() => {});
        }
      }
    }

    // If this movement was paired with another (e.g. USDT purchase deducting Bs from source account), revert & remove the paired movement too
    if (existing?.linkedMovementId) {
      const sibling = treasuryMovementsRef.current.find(
        (m) => m.id === existing.linkedMovementId
      );
      if (sibling) {
        deleteTreasuryMovement(sibling.id, revertAccountBalance);
      }
    }
  };

  const importUnpaidPurchaseOrdersToCommitments = (): number => {
    const existingLinkedIds = new Set(
      treasuryCommitmentsRef.current.map((c) => c.linkedPurchaseOrderId).filter(Boolean)
    );
    const rate = settingsRef.current.bcvRate || 1;
    let added = 0;

    purchaseOrdersRef.current.forEach((po) => {
      const pendingUSD = Math.round(Math.max(0, po.totalUSD - (po.paidAmountUSD || 0)) * 100) / 100;
      if (pendingUSD <= 0.01 || existingLinkedIds.has(po.id)) return;
      const isBsBcv = po.paymentCurrencyCondition === 'BS_BCV';
      addTreasuryCommitment({
        title: `${po.supplierName} (${po.orderNumber})`,
        category: 'PROVEEDORES',
        dueDate: po.creditDueDate || po.createdAt.split('T')[0],
        amountUSD: pendingUSD,
        bcvRate: rate,
        paymentCurrency: isBsBcv ? 'BS' : 'EFECTIVO_USD',
        exchangeRateType: isBsBcv ? 'BCV' : undefined,
        appliedExchangeRate: isBsBcv ? rate : undefined,
        linkedPurchaseOrderId: po.id,
        notes: po.supplierInvoiceNumber ? `Factura proveedor: ${po.supplierInvoiceNumber}` : undefined,
      });
      added += 1;
    });

    return added;
  };

  // Computed Treasury KPIs (live linked to BCV rate & unpaid commitments)
  const totalLiquidityUSD = useMemo(() => {
    const rate = settings.bcvRate || 1;
    return (
      Math.round(
        treasuryAccounts.reduce(
          (sum, acc) =>
            sum + computeAccountBalanceUSD(acc.currency, Number(acc.nativeBalance) || 0, rate),
          0
        ) * 100
      ) / 100
    );
  }, [treasuryAccounts, settings.bcvRate]);

  const totalLiquidityBs = totalLiquidityUSD * settings.bcvRate;

  const pendingCommitmentsUSD = useMemo(() => {
    return (
      Math.round(
        treasuryCommitments
          .filter((cm) => !cm.isPaid)
          .reduce((sum, cm) => sum + (Number(cm.amountUSD) || 0), 0) * 100
      ) / 100
    );
  }, [treasuryCommitments]);

  const pendingCommitmentsBs = pendingCommitmentsUSD * settings.bcvRate;
  const projectedFreeBalanceUSD =
    Math.round((totalLiquidityUSD - pendingCommitmentsUSD) * 100) / 100;
  const projectedFreeBalanceBs = projectedFreeBalanceUSD * settings.bcvRate;

  // =========================================================================
  // TREASURY DEBTS & DEBT PAYMENT PLANNING
  // =========================================================================
  const debtCategories = useMemo<string[]>(() => {
    const result: string[] = [];
    const seen = new Set<string>();
    const addUnique = (raw?: string) => {
      const cleaned = (raw || '').trim().replace(/\s+/g, ' ');
      if (!cleaned) return;
      const key = cleaned.toLowerCase();
      if (seen.has(key)) return;
      seen.add(key);
      result.push(cleaned);
    };
    customDebtCategories.forEach(addUnique);
    treasuryDebts.forEach((d) => addUnique(d.category));
    if (result.length === 0) {
      DEFAULT_DEBT_CATEGORIES.forEach(addUnique);
    }
    return result;
  }, [customDebtCategories, treasuryDebts]);

  const addDebtCategory = (name: string): { added: boolean; category: string } => {
    const cleaned = (name || '').trim().replace(/\s+/g, ' ');
    if (!cleaned) return { added: false, category: '' };
    const existing = debtCategories.find((c) => c.toLowerCase() === cleaned.toLowerCase());
    if (existing) return { added: false, category: existing };
    setCustomDebtCategories((prev) => {
      const next = [...prev, cleaned];
      try {
        localStorage.setItem(STORAGE_KEYS.DEBT_CATEGORIES, JSON.stringify(next));
      } catch {}
      return next;
    });
    return { added: true, category: cleaned };
  };

  const renameDebtCategory = (
    oldName: string,
    newName: string
  ): { renamed: boolean; updatedCount: number; newCategory?: string } => {
    const oldClean = (oldName || '').trim();
    const newClean = (newName || '').trim().replace(/\s+/g, ' ');
    if (!oldClean || !newClean || oldClean.toLowerCase() === newClean.toLowerCase()) {
      return { renamed: false, updatedCount: 0 };
    }

    setCustomDebtCategories((prev) => {
      const seen = new Set<string>();
      const next: string[] = [];
      const source = prev.length > 0 ? prev : [...DEFAULT_DEBT_CATEGORIES];
      source.forEach((cat) => {
        const replaced = cat.toLowerCase() === oldClean.toLowerCase() ? newClean : cat;
        const key = replaced.toLowerCase();
        if (!seen.has(key)) {
          seen.add(key);
          next.push(replaced);
        }
      });
      if (!seen.has(newClean.toLowerCase())) {
        next.push(newClean);
      }
      try {
        localStorage.setItem(STORAGE_KEYS.DEBT_CATEGORIES, JSON.stringify(next));
      } catch {}
      return next;
    });

    const now = new Date().toISOString();
    let updatedCount = 0;
    const touchedDebts: TreasuryDebt[] = [];
    const nextDebts = treasuryDebtsRef.current.map((debt) => {
      if ((debt.category || '').trim().toLowerCase() !== oldClean.toLowerCase()) return debt;
      updatedCount += 1;
      const updated: TreasuryDebt = {
        ...debt,
        category: newClean,
        updatedAt: now,
      };
      touchedDebts.push(updated);
      return updated;
    });

    if (touchedDebts.length > 0) {
      treasuryDebtsRef.current = nextDebts;
      setTreasuryDebts(nextDebts);
      try {
        localStorage.setItem(STORAGE_KEYS.TREASURY_DEBTS, JSON.stringify(nextDebts));
      } catch {}
      touchedDebts.forEach((d) => {
        pendingSyncTreasuryDebtIdsRef.current.add(d.id);
        syncTreasuryDebtToFirestore(d)
          .then(() => pendingSyncTreasuryDebtIdsRef.current.delete(d.id))
          .catch(() => {});
      });
    }

    return { renamed: true, updatedCount, newCategory: newClean };
  };

  const deleteDebtCategory = (name: string) => {
    const target = (name || '').trim().toLowerCase();
    if (!target) return;
    setCustomDebtCategories((prev) => {
      const next = prev.filter((c) => c.trim().toLowerCase() !== target);
      const safeNext = next.length > 0 ? next : ['Otras Deudas'];
      try {
        localStorage.setItem(STORAGE_KEYS.DEBT_CATEGORIES, JSON.stringify(safeNext));
      } catch {}
      return safeNext;
    });
  };

  const nextDebtNumber = (): string => {
    const year = new Date().getFullYear();
    const prefix = `DEU-${year}-`;
    let maxNum = 0;
    treasuryDebtsRef.current.forEach((d) => {
      if (d.debtNumber?.startsWith(prefix)) {
        const n = parseInt(d.debtNumber.slice(prefix.length), 10);
        if (!Number.isNaN(n) && n > maxNum) maxNum = n;
      }
    });
    return `${prefix}${String(maxNum + 1).padStart(4, '0')}`;
  };

  const addTreasuryDebt: AppContextType['addTreasuryDebt'] = (data) => {
    const now = new Date().toISOString();
    const totalAmountUSD = Math.round(Math.max(0, Number(data.totalAmountUSD) || 0) * 100) / 100;
    const paidAmountUSD =
      Math.round(
        Math.min(totalAmountUSD, Math.max(0, Number(data.initialPaidUSD) || 0)) * 100
      ) / 100;
    const remainingAmountUSD = Math.round(Math.max(0, totalAmountUSD - paidAmountUSD) * 100) / 100;
    const cleanedCategory = (data.category || '').trim() || 'Otras Deudas';
    addDebtCategory(cleanedCategory);

    const status: DebtStatus =
      remainingAmountUSD <= 0.009
        ? 'PAGADA'
        : data.paymentPlan && data.paymentPlan.installments.length > 0
          ? 'EN_PLAN'
          : 'ACTIVA';

    const newDebt: TreasuryDebt = {
      id: `deu-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      debtNumber: nextDebtNumber(),
      title: data.title.trim(),
      creditor: data.creditor.trim() || 'Acreedor general',
      category: cleanedCategory,
      priority: data.priority || 'MEDIA',
      totalAmountUSD,
      paidAmountUSD,
      remainingAmountUSD,
      status,
      startDate: data.startDate || now.split('T')[0],
      dueDate: data.dueDate || undefined,
      paymentPlan: data.paymentPlan,
      payments: [],
      notes: data.notes?.trim() || undefined,
      createdAt: now,
      updatedAt: now,
    };

    pendingSyncTreasuryDebtIdsRef.current.add(newDebt.id);
    const nextList = [newDebt, ...treasuryDebtsRef.current];
    treasuryDebtsRef.current = nextList;
    setTreasuryDebts(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_DEBTS, JSON.stringify(nextList));
    } catch {}
    syncTreasuryDebtToFirestore(newDebt)
      .then(() => pendingSyncTreasuryDebtIdsRef.current.delete(newDebt.id))
      .catch(() => {});

    return newDebt;
  };

  const updateTreasuryDebt: AppContextType['updateTreasuryDebt'] = (id, updates) => {
    const existing = treasuryDebtsRef.current.find((d) => d.id === id);
    if (!existing) return null;

    if (updates.category) {
      addDebtCategory(updates.category);
    }

    const totalAmountUSD =
      updates.totalAmountUSD !== undefined
        ? Math.round(Math.max(0, Number(updates.totalAmountUSD) || 0) * 100) / 100
        : existing.totalAmountUSD;
    const paidAmountUSD =
      updates.paidAmountUSD !== undefined
        ? Math.round(Math.max(0, Number(updates.paidAmountUSD) || 0) * 100) / 100
        : existing.paidAmountUSD;
    const remainingAmountUSD = Math.round(Math.max(0, totalAmountUSD - paidAmountUSD) * 100) / 100;

    const effectivePlan =
      updates.paymentPlan !== undefined ? updates.paymentPlan : existing.paymentPlan;
    const computedStatus: DebtStatus =
      remainingAmountUSD <= 0.009
        ? 'PAGADA'
        : effectivePlan && effectivePlan.installments.length > 0
          ? 'EN_PLAN'
          : 'ACTIVA';

    const updatedDebt: TreasuryDebt = {
      ...existing,
      ...updates,
      title: updates.title !== undefined ? updates.title.trim() : existing.title,
      creditor: updates.creditor !== undefined ? updates.creditor.trim() : existing.creditor,
      category: updates.category !== undefined ? updates.category.trim() : existing.category,
      totalAmountUSD,
      paidAmountUSD,
      remainingAmountUSD,
      status: updates.status || computedStatus,
      updatedAt: new Date().toISOString(),
    };

    pendingSyncTreasuryDebtIdsRef.current.add(updatedDebt.id);
    const nextList = treasuryDebtsRef.current.map((d) => (d.id === id ? updatedDebt : d));
    treasuryDebtsRef.current = nextList;
    setTreasuryDebts(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_DEBTS, JSON.stringify(nextList));
    } catch {}
    syncTreasuryDebtToFirestore(updatedDebt)
      .then(() => pendingSyncTreasuryDebtIdsRef.current.delete(updatedDebt.id))
      .catch(() => {});

    return updatedDebt;
  };

  const deleteTreasuryDebt = (id: string) => {
    recordDeleted('treasuryDebts', [id]);
    removeTreasuryDebtFromFirestore(id).catch(() => {});
    const nextList = treasuryDebtsRef.current.filter((d) => d.id !== id);
    treasuryDebtsRef.current = nextList;
    setTreasuryDebts(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_DEBTS, JSON.stringify(nextList));
    } catch {}
  };

  const saveDebtPaymentPlan: AppContextType['saveDebtPaymentPlan'] = (debtId, plan) => {
    const existing = treasuryDebtsRef.current.find((d) => d.id === debtId);
    if (!existing) return null;

    const sortedInstallments = [...(plan.installments || [])]
      .sort((a, b) => (a.dueDate || '').localeCompare(b.dueDate || ''))
      .map((inst, idx) => ({
        ...inst,
        number: idx + 1,
        amountUSD: Math.round(Math.max(0, Number(inst.amountUSD) || 0) * 100) / 100,
      }));

    const lastDueDate =
      sortedInstallments.length > 0
        ? sortedInstallments[sortedInstallments.length - 1].dueDate
        : existing.dueDate;

    const normalizedPlan: DebtPaymentPlan = {
      ...plan,
      installmentsCount: sortedInstallments.length,
      installments: sortedInstallments,
      updatedAt: new Date().toISOString(),
    };

    return updateTreasuryDebt(debtId, {
      paymentPlan: normalizedPlan,
      dueDate: lastDueDate || existing.dueDate,
      status:
        existing.remainingAmountUSD <= 0.009
          ? 'PAGADA'
          : sortedInstallments.length > 0
            ? 'EN_PLAN'
            : 'ACTIVA',
    });
  };

  const recordDebtPayment: AppContextType['recordDebtPayment'] = (debtId, data) => {
    const debt = treasuryDebtsRef.current.find((d) => d.id === debtId);
    const account = treasuryAccountsRef.current.find((a) => a.id === data.accountId);
    if (!debt || !account) return null;

    const rate =
      Number(data.bcvRate) > 0 ? Number(data.bcvRate) : settingsRef.current.bcvRate || 1;
    const rawInput = Math.max(0, Number(data.amountInput) || 0);
    if (rawInput <= 0) return null;

    const effectiveCurrency = data.inputCurrency || account.currency;
    const amountUSD =
      effectiveCurrency === 'BS'
        ? Math.round((rawInput / rate) * 100) / 100
        : Math.round(rawInput * 100) / 100;
    const amountBs =
      effectiveCurrency === 'BS'
        ? Math.round(rawInput * 100) / 100
        : Math.round(amountUSD * rate * 100) / 100;

    if (amountUSD <= 0) return null;

    const explicitNativeDelta =
      account.currency === 'BS' && effectiveCurrency === 'BS'
        ? -Math.round(rawInput * 100) / 100
        : account.currency !== 'BS' && effectiveCurrency !== 'BS'
          ? -Math.round(rawInput * 100) / 100
          : undefined;

    // 1. Deduct from selected Treasury Account
    const updatedAccount = applyAccountDelta(account, -amountUSD, rate, explicitNativeDelta);

    const now = new Date().toISOString();
    const payDate = data.date || now.split('T')[0];
    const movementId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const matchedInstallment = data.installmentId
      ? debt.paymentPlan?.installments.find((inst) => inst.id === data.installmentId)
      : undefined;

    const descriptionText = matchedInstallment
      ? `Pago Deuda (${debt.debtNumber}): ${debt.title} · Cuota #${matchedInstallment.number}`
      : `Abono a Deuda (${debt.debtNumber}): ${debt.title}`;

    // 2. Optionally mirror into Gastos del Negocio
    let createdExpense: BusinessExpense | undefined;
    if (data.syncToExpense) {
      const mapped = mapAccountToExpensePayment(account);
      createdExpense = addExpense({
        date: payDate,
        category: `Pago de Deuda · ${debt.category}`,
        description: descriptionText,
        beneficiary: debt.creditor || undefined,
        amountUSD,
        amountBs,
        bcvRate: rate,
        paymentCurrencyType: mapped.currencyType,
        paymentMethod: mapped.method,
        reference: data.reference?.trim() || undefined,
        notes: data.notes?.trim() || undefined,
        treasuryAccountId: account.id,
        treasuryAccountName: account.name,
        treasuryMovementId: movementId,
        skipTreasuryDeduction: true,
        skipCommitmentDeduction: true,
      });
    }

    // 3. Create TreasuryMovement
    const newMovement: TreasuryMovement = {
      id: movementId,
      movementNumber: nextMovementNumber(),
      date: payDate,
      type: 'PAGO_PLANIFICADO',
      accountId: account.id,
      accountName: account.name,
      accountGroup: account.group,
      category: `Deuda · ${debt.category}`,
      description: descriptionText,
      amountUSD,
      bcvRate: rate,
      amountBs,
      reference: data.reference?.trim() || undefined,
      expenseId: createdExpense?.id,
      debtId: debt.id,
      notes: data.notes?.trim() || (debt.creditor ? `Acreedor: ${debt.creditor}` : undefined),
      createdAt: now,
      updatedAt: now,
    };

    pendingSyncTreasuryMovementIdsRef.current.add(newMovement.id);
    const nextMovements = [newMovement, ...treasuryMovementsRef.current].sort(
      (a, b) =>
        (b.date || b.createdAt || '').localeCompare(a.date || a.createdAt || '') ||
        (b.createdAt || '').localeCompare(a.createdAt || '')
    );
    treasuryMovementsRef.current = nextMovements;
    setTreasuryMovements(nextMovements);
    try {
      localStorage.setItem(STORAGE_KEYS.TREASURY_MOVEMENTS, JSON.stringify(nextMovements));
    } catch {}
    syncTreasuryMovementToFirestore(newMovement)
      .then(() => pendingSyncTreasuryMovementIdsRef.current.delete(newMovement.id))
      .catch(() => {});

    // 4. Update linked commitment if this installment had been scheduled
    if (matchedInstallment?.linkedCommitmentId) {
      const linkedCm = treasuryCommitmentsRef.current.find(
        (c) => c.id === matchedInstallment.linkedCommitmentId
      );
      if (linkedCm && !linkedCm.isPaid) {
        updateTreasuryCommitment(linkedCm.id, {
          isPaid: true,
          paidAt: now,
          paidAccountId: account.id,
          paidAccountName: account.name,
          reservedUSD: linkedCm.amountUSD,
        });
      }
    }

    // 5. Update Debt record
    const paymentRecord: DebtPaymentRecord = {
      id: `dpay-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      date: payDate,
      amountUSD,
      amountBs,
      bcvRate: rate,
      accountId: account.id,
      accountName: account.name,
      reference: data.reference?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      installmentId: matchedInstallment?.id,
      installmentNumber: matchedInstallment?.number,
      treasuryMovementId: newMovement.id,
      createdAt: now,
    };

    const nextPaidUSD =
      Math.round(((Number(debt.paidAmountUSD) || 0) + amountUSD) * 100) / 100;
    const nextRemainingUSD =
      Math.round(Math.max(0, (Number(debt.totalAmountUSD) || 0) - nextPaidUSD) * 100) / 100;

    let nextPlan = debt.paymentPlan;
    if (nextPlan && matchedInstallment) {
      nextPlan = {
        ...nextPlan,
        installments: nextPlan.installments.map((inst) =>
          inst.id === matchedInstallment.id
            ? {
                ...inst,
                status: 'PAGADA' as const,
                paidAt: now,
                paidAccountId: account.id,
                paidAccountName: account.name,
                reference: data.reference?.trim() || undefined,
              }
            : inst
        ),
        updatedAt: now,
      };
    }

    const updatedDebt = updateTreasuryDebt(debt.id, {
      paidAmountUSD: nextPaidUSD,
      remainingAmountUSD: nextRemainingUSD,
      paymentPlan: nextPlan,
      payments: [paymentRecord, ...(debt.payments || [])],
      status:
        nextRemainingUSD <= 0.009
          ? 'PAGADA'
          : nextPlan && nextPlan.installments.length > 0
            ? 'EN_PLAN'
            : 'ACTIVA',
    });

    return {
      debt: updatedDebt || debt,
      payment: paymentRecord,
      movement: newMovement,
      account: updatedAccount,
      expense: createdExpense,
    };
  };

  const scheduleDebtInstallmentToCommitments: AppContextType['scheduleDebtInstallmentToCommitments'] = (
    debtId,
    installmentId
  ) => {
    const debt = treasuryDebtsRef.current.find((d) => d.id === debtId);
    if (!debt || !debt.paymentPlan) return null;
    const inst = debt.paymentPlan.installments.find((i) => i.id === installmentId);
    if (!inst || inst.status === 'PAGADA') return null;

    if (inst.linkedCommitmentId) {
      const existing = treasuryCommitmentsRef.current.find(
        (c) => c.id === inst.linkedCommitmentId
      );
      if (existing) return existing;
    }

    const plan = debt.paymentPlan;
    const isBs = plan.paymentCurrency === 'BS';
    const rate =
      isBs && Number(plan.appliedExchangeRate) > 0
        ? Number(plan.appliedExchangeRate)
        : settingsRef.current.bcvRate || 1;

    const createdCommitment = addTreasuryCommitment({
      title: `Deuda: ${debt.title} · Cuota #${inst.number}`,
      category: 'GASTOS_FIJOS',
      dueDate: inst.dueDate,
      amountUSD: inst.amountUSD,
      bcvRate: rate,
      paymentCurrency: isBs ? 'BS' : 'EFECTIVO_USD',
      exchangeRateType: isBs ? plan.exchangeRateType || 'BCV' : undefined,
      appliedExchangeRate: isBs ? rate : undefined,
      notes: `Plan de pago ${debt.debtNumber} · Acreedor: ${debt.creditor} · Categoría: ${debt.category}`,
    });

    const updatedPlan: DebtPaymentPlan = {
      ...plan,
      installments: plan.installments.map((item) =>
        item.id === installmentId
          ? { ...item, linkedCommitmentId: createdCommitment.id }
          : item
      ),
      updatedAt: new Date().toISOString(),
    };

    updateTreasuryDebt(debt.id, { paymentPlan: updatedPlan });
    return createdCommitment;
  };

  const totalPendingDebtsUSD = useMemo(() => {
    return (
      Math.round(
        treasuryDebts
          .filter((d) => d.status !== 'PAGADA' && d.remainingAmountUSD > 0.009)
          .reduce((sum, d) => sum + (Number(d.remainingAmountUSD) || 0), 0) * 100
      ) / 100
    );
  }, [treasuryDebts]);

  const totalPendingDebtsBs = totalPendingDebtsUSD * settings.bcvRate;

  // =========================================================================
  // POS Daily Open Accounts ("Abrir Cuenta" para clientes en talleres vecinos)
  // =========================================================================
  const adjustInventoryForOpenAccountItems = (items: SaleItem[], direction: 'DEDUCT' | 'RESTORE') => {
    if (!Array.isArray(items) || items.length === 0) return;
    setProducts((prevProducts) => {
      const touched: Product[] = [];
      const prevProdIdSet = new Set(prevProducts.map((p) => p.id));
      const next = prevProducts.map((prod) => {
        if (!productTracksInventory(prod)) return prod;
        const matchingItems = items.filter((item) => {
          if (item.isService) return false;
          if (item.productId && prevProdIdSet.has(item.productId)) {
            return item.productId === prod.id;
          }
          return (
            typeof item.sku === 'string' &&
            item.sku.trim().length > 0 &&
            typeof prod.sku === 'string' &&
            prod.sku.trim().length > 0 &&
            item.sku.trim().toLowerCase() === prod.sku.trim().toLowerCase()
          );
        });
        if (matchingItems.length === 0) return prod;
        const qtySum = matchingItems.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
        if (qtySum <= 0) return prod;
        const nextStock =
          direction === 'DEDUCT' ? Math.max(0, prod.stock - qtySum) : prod.stock + qtySum;
        const updatedProd = { ...prod, stock: nextStock };
        touched.push(updatedProd);
        return updatedProd;
      });
      productsRef.current = next;
      if (touched.length > 0) {
        queueMicrotask(() => {
          touched.forEach((p) => syncProductToFirestore(p).catch(() => {}));
        });
      }
      return next;
    });
  };

  const openCustomerAccount = (data: {
    customerId?: string;
    customerName: string;
    customerPhone: string;
    customerDocument?: string;
    workshopName?: string;
    motorcycleInfo?: string;
    notes?: string;
    items: SaleItem[];
  }): OpenAccount => {
    const customer = ensureCustomer(
      data.customerName,
      data.customerPhone || 'N/A',
      data.customerDocument,
      undefined,
      undefined,
      data.customerId
    );

    const now = new Date().toISOString();
    const year = new Date().getFullYear();
    const maxSeq = openAccountsRef.current.reduce((maxVal, acc) => {
      const m = (acc.accountNumber || '').match(/CTA-\d+-(\d+)/);
      const seq = m ? parseInt(m[1], 10) : 0;
      return seq > maxVal ? seq : maxVal;
    }, 0);
    const accountNumber = `CTA-${year}-${String(maxSeq + 1).padStart(4, '0')}`;
    const rate = settingsRef.current.bcvRate;

    const initialItems: OpenAccountItem[] = (data.items || []).map((item, idx) => ({
      ...item,
      total: Math.round(Number(item.unitPrice || 0) * Number(item.quantity || 0) * 100) / 100,
      entryId: `oai-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
      addedAt: now,
    }));

    if (initialItems.length > 0) {
      adjustInventoryForOpenAccountItems(initialItems, 'DEDUCT');
    }

    const subtotal =
      Math.round(initialItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0) * 100) / 100;

    const newAccount: OpenAccount = {
      id: `openacc-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
      accountNumber,
      customerId: customer.id,
      customerName: customer.name || data.customerName.trim(),
      customerPhone: (data.customerPhone || customer.phone || 'N/A').trim() || 'N/A',
      customerDocument: (data.customerDocument || customer.documentId || '').trim() || undefined,
      workshopName: data.workshopName?.trim() || undefined,
      motorcycleInfo: data.motorcycleInfo?.trim() || undefined,
      notes: data.notes?.trim() || undefined,
      items: initialItems,
      subtotal,
      bcvRate: rate,
      status: 'ABIERTA',
      openedAt: now,
      updatedAt: now,
    };

    const nextList = [newAccount, ...openAccountsRef.current];
    openAccountsRef.current = nextList;
    setOpenAccounts(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.OPEN_ACCOUNTS, JSON.stringify(nextList));
    } catch {}

    pendingSyncOpenAccountIdsRef.current.add(newAccount.id);
    syncOpenAccountToFirestore(newAccount)
      .then(() => pendingSyncOpenAccountIdsRef.current.delete(newAccount.id))
      .catch(() => {});

    return newAccount;
  };

  const addItemsToOpenAccount = (
    accountId: string,
    items: SaleItem[],
    note?: string
  ): OpenAccount | null => {
    const existing = openAccountsRef.current.find((a) => a.id === accountId);
    if (!existing || existing.status !== 'ABIERTA' || !Array.isArray(items) || items.length === 0) {
      return null;
    }

    const now = new Date().toISOString();
    const newEntries: OpenAccountItem[] = items.map((item, idx) => ({
      ...item,
      total: Math.round(Number(item.unitPrice || 0) * Number(item.quantity || 0) * 100) / 100,
      entryId: `oai-${Date.now()}-${idx}-${Math.floor(Math.random() * 1000)}`,
      addedAt: now,
      note: note?.trim() || undefined,
    }));

    adjustInventoryForOpenAccountItems(newEntries, 'DEDUCT');

    const updatedItems = [...existing.items, ...newEntries];
    const subtotal =
      Math.round(updatedItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0) * 100) / 100;

    const updatedAccount: OpenAccount = {
      ...existing,
      items: updatedItems,
      subtotal,
      bcvRate: settingsRef.current.bcvRate,
      updatedAt: now,
    };

    const nextList = openAccountsRef.current.map((a) => (a.id === accountId ? updatedAccount : a));
    openAccountsRef.current = nextList;
    setOpenAccounts(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.OPEN_ACCOUNTS, JSON.stringify(nextList));
    } catch {}

    pendingSyncOpenAccountIdsRef.current.add(updatedAccount.id);
    syncOpenAccountToFirestore(updatedAccount)
      .then(() => pendingSyncOpenAccountIdsRef.current.delete(updatedAccount.id))
      .catch(() => {});

    return updatedAccount;
  };

  const updateOpenAccountItem = (
    accountId: string,
    entryId: string,
    updates: { quantity?: number; unitPrice?: number }
  ): OpenAccount | null => {
    const existing = openAccountsRef.current.find((a) => a.id === accountId);
    if (!existing || existing.status !== 'ABIERTA') return null;

    const targetItem = existing.items.find((it) => it.entryId === entryId);
    if (!targetItem) return null;

    const nextQty =
      updates.quantity !== undefined ? Math.max(0, Math.floor(updates.quantity)) : targetItem.quantity;
    if (nextQty <= 0) {
      return removeOpenAccountItem(accountId, entryId);
    }

    const nextPrice =
      updates.unitPrice !== undefined && !Number.isNaN(updates.unitPrice) && updates.unitPrice >= 0
        ? Math.round(updates.unitPrice * 100) / 100
        : targetItem.unitPrice;

    const qtyDelta = nextQty - targetItem.quantity;
    if (qtyDelta > 0) {
      adjustInventoryForOpenAccountItems([{ ...targetItem, quantity: qtyDelta }], 'DEDUCT');
    } else if (qtyDelta < 0) {
      adjustInventoryForOpenAccountItems([{ ...targetItem, quantity: Math.abs(qtyDelta) }], 'RESTORE');
    }

    const updatedItems = existing.items.map((it) =>
      it.entryId === entryId
        ? {
            ...it,
            quantity: nextQty,
            unitPrice: nextPrice,
            total: Math.round(nextPrice * nextQty * 100) / 100,
          }
        : it
    );
    const subtotal =
      Math.round(updatedItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0) * 100) / 100;

    const updatedAccount: OpenAccount = {
      ...existing,
      items: updatedItems,
      subtotal,
      updatedAt: new Date().toISOString(),
    };

    const nextList = openAccountsRef.current.map((a) => (a.id === accountId ? updatedAccount : a));
    openAccountsRef.current = nextList;
    setOpenAccounts(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.OPEN_ACCOUNTS, JSON.stringify(nextList));
    } catch {}

    pendingSyncOpenAccountIdsRef.current.add(updatedAccount.id);
    syncOpenAccountToFirestore(updatedAccount)
      .then(() => pendingSyncOpenAccountIdsRef.current.delete(updatedAccount.id))
      .catch(() => {});

    return updatedAccount;
  };

  const removeOpenAccountItem = (accountId: string, entryId: string): OpenAccount | null => {
    const existing = openAccountsRef.current.find((a) => a.id === accountId);
    if (!existing || existing.status !== 'ABIERTA') return null;

    const targetItem = existing.items.find((it) => it.entryId === entryId);
    if (!targetItem) return null;

    adjustInventoryForOpenAccountItems([targetItem], 'RESTORE');

    const updatedItems = existing.items.filter((it) => it.entryId !== entryId);
    const subtotal =
      Math.round(updatedItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0) * 100) / 100;

    const updatedAccount: OpenAccount = {
      ...existing,
      items: updatedItems,
      subtotal,
      updatedAt: new Date().toISOString(),
    };

    const nextList = openAccountsRef.current.map((a) => (a.id === accountId ? updatedAccount : a));
    openAccountsRef.current = nextList;
    setOpenAccounts(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.OPEN_ACCOUNTS, JSON.stringify(nextList));
    } catch {}

    pendingSyncOpenAccountIdsRef.current.add(updatedAccount.id);
    syncOpenAccountToFirestore(updatedAccount)
      .then(() => pendingSyncOpenAccountIdsRef.current.delete(updatedAccount.id))
      .catch(() => {});

    return updatedAccount;
  };

  const updateOpenAccountMeta = (
    accountId: string,
    updates: {
      customerName?: string;
      customerPhone?: string;
      customerDocument?: string;
      workshopName?: string;
      motorcycleInfo?: string;
      notes?: string;
    }
  ): OpenAccount | null => {
    const existing = openAccountsRef.current.find((a) => a.id === accountId);
    if (!existing) return null;

    const updatedAccount: OpenAccount = {
      ...existing,
      customerName: updates.customerName !== undefined ? updates.customerName.trim() || existing.customerName : existing.customerName,
      customerPhone: updates.customerPhone !== undefined ? updates.customerPhone.trim() || 'N/A' : existing.customerPhone,
      customerDocument: updates.customerDocument !== undefined ? updates.customerDocument.trim() || undefined : existing.customerDocument,
      workshopName: updates.workshopName !== undefined ? updates.workshopName.trim() || undefined : existing.workshopName,
      motorcycleInfo: updates.motorcycleInfo !== undefined ? updates.motorcycleInfo.trim() || undefined : existing.motorcycleInfo,
      notes: updates.notes !== undefined ? updates.notes.trim() || undefined : existing.notes,
      updatedAt: new Date().toISOString(),
    };

    const nextList = openAccountsRef.current.map((a) => (a.id === accountId ? updatedAccount : a));
    openAccountsRef.current = nextList;
    setOpenAccounts(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.OPEN_ACCOUNTS, JSON.stringify(nextList));
    } catch {}

    pendingSyncOpenAccountIdsRef.current.add(updatedAccount.id);
    syncOpenAccountToFirestore(updatedAccount)
      .then(() => pendingSyncOpenAccountIdsRef.current.delete(updatedAccount.id))
      .catch(() => {});

    return updatedAccount;
  };

  const cancelOpenAccount = (accountId: string): boolean => {
    const existing = openAccountsRef.current.find((a) => a.id === accountId);
    if (!existing) return false;

    if (existing.status === 'ABIERTA' && existing.items.length > 0) {
      adjustInventoryForOpenAccountItems(existing.items, 'RESTORE');
    }

    recordDeleted('openAccounts', [accountId]);
    pendingSyncOpenAccountIdsRef.current.delete(accountId);

    const nextList = openAccountsRef.current.filter((a) => a.id !== accountId);
    openAccountsRef.current = nextList;
    setOpenAccounts(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.OPEN_ACCOUNTS, JSON.stringify(nextList));
    } catch {}

    removeOpenAccountFromFirestore(accountId).catch(() => {});
    return true;
  };

  const settleOpenAccount = (
    accountId: string,
    settlement: {
      paymentType: SalePaymentType;
      paymentMethod: PaymentMethod;
      pagoMovilAccount?: PagoMovilAccountOption;
      paymentSplits?: SalePaymentSplit[];
      discount?: number;
      notes?: string;
      creditDays?: number;
      creditDueDate?: string;
      creditPaidAmount?: number;
      creditPaidAmountBs?: number;
      creditInitialPaymentCurrency?: PaymentCurrencyMode;
      hasShipping?: boolean;
      shippingCostUSD?: number;
      shippingCostBs?: number;
      shippingCurrencyMode?: PaymentCurrencyMode;
      shippingState?: string;
      shippingAgency?: string;
      shippingNotes?: string;
    }
  ): Sale | null => {
    const existing = openAccountsRef.current.find((a) => a.id === accountId);
    if (!existing || existing.status !== 'ABIERTA' || existing.items.length === 0) {
      return null;
    }

    // Consolidate identical productId + unitPrice lines cleanly for the official invoice
    const consolidatedMap = new Map<string, SaleItem>();
    for (const item of existing.items) {
      const key = `${item.productId || item.sku || item.name}__${item.unitPrice}__${item.isService ? 'S' : 'P'}`;
      const prev = consolidatedMap.get(key);
      if (prev) {
        const nextQty = prev.quantity + item.quantity;
        consolidatedMap.set(key, {
          ...prev,
          quantity: nextQty,
          total: Math.round(prev.unitPrice * nextQty * 100) / 100,
        });
      } else {
        consolidatedMap.set(key, {
          productId: item.productId,
          sku: item.sku,
          name: item.name,
          category: item.category,
          quantity: item.quantity,
          unitPrice: item.unitPrice,
          total: Math.round(item.unitPrice * item.quantity * 100) / 100,
          isService: item.isService,
          imageUrl: item.imageUrl,
        });
      }
    }
    const saleItems = Array.from(consolidatedMap.values());
    const subtotalUSD =
      Math.round(saleItems.reduce((sum, it) => sum + (Number(it.total) || 0), 0) * 100) / 100;
    const discountUSD = Math.max(0, Math.round((settlement.discount || 0) * 100) / 100);
    const shippingUSD =
      settlement.hasShipping && (settlement.shippingCostUSD || 0) > 0
        ? Math.round((settlement.shippingCostUSD || 0) * 100) / 100
        : 0;
    const totalUSD = Math.max(0, Math.round((subtotalUSD - discountUSD + shippingUSD) * 100) / 100);

    const metaBits: string[] = [`Cierre de Cuenta Abierta #${existing.accountNumber}`];
    if (existing.workshopName) metaBits.push(`Taller: ${existing.workshopName}`);
    if (existing.motorcycleInfo) metaBits.push(`Moto: ${existing.motorcycleInfo}`);
    if (existing.notes) metaBits.push(existing.notes);
    if (settlement.notes?.trim()) metaBits.push(settlement.notes.trim());

    const isDeferred = settlement.paymentType === 'CREDITO' || settlement.paymentType === 'APARTADO';
    const isMixtoCredit =
      settlement.paymentType === 'MIXTO' &&
      Array.isArray(settlement.paymentSplits) &&
      settlement.paymentSplits.some((sp) => sp.splitType === 'CREDITO' && (Number(sp.amountUSD) || 0) > 0);
    const hasCreditComponent = isDeferred || isMixtoCredit;
    const paidAmount = isDeferred
      ? Math.max(0, settlement.creditPaidAmount || 0)
      : isMixtoCredit
      ? Math.round(
          (settlement.paymentSplits || [])
            .filter((sp) => sp.splitType !== 'CREDITO')
            .reduce((s, sp) => s + (Number(sp.amountUSD) || 0), 0) * 100
        ) / 100
      : totalUSD;

    const newSale = createSale({
      customerId: existing.customerId,
      customerName: existing.customerName,
      customerPhone: existing.customerPhone,
      customerDocument: existing.customerDocument,
      items: saleItems,
      subtotal: subtotalUSD,
      discount: discountUSD,
      tax: 0,
      total: totalUSD,
      paymentMethod: settlement.paymentMethod,
      pagoMovilAccount: settlement.pagoMovilAccount,
      paymentSplits: settlement.paymentSplits,
      notes: metaBits.join(' · '),
      source: 'POS',
      paymentType: settlement.paymentType,
      creditDays: hasCreditComponent ? settlement.creditDays || 15 : undefined,
      creditDueDate: hasCreditComponent ? settlement.creditDueDate : undefined,
      creditPaidAmount: hasCreditComponent ? paidAmount : undefined,
      creditPaidAmountBs: isDeferred ? settlement.creditPaidAmountBs : undefined,
      creditInitialPaymentCurrency: isDeferred ? settlement.creditInitialPaymentCurrency : undefined,
      creditStatus: hasCreditComponent
        ? paidAmount >= totalUSD - 0.02
          ? 'PAGADO'
          : 'PENDIENTE'
        : undefined,
      hasShipping: shippingUSD > 0 ? true : undefined,
      shippingCostUSD: shippingUSD > 0 ? shippingUSD : undefined,
      shippingCostBs: shippingUSD > 0 ? settlement.shippingCostBs : undefined,
      shippingCurrencyMode: shippingUSD > 0 ? settlement.shippingCurrencyMode : undefined,
      shippingState: shippingUSD > 0 ? settlement.shippingState : undefined,
      shippingAgency: shippingUSD > 0 ? settlement.shippingAgency : undefined,
      shippingNotes: shippingUSD > 0 ? settlement.shippingNotes : undefined,
      skipInventoryDeduction: true, // Stock was already deducted as items were picked up!
    });

    const now = new Date().toISOString();
    const closedAccount: OpenAccount = {
      ...existing,
      status: 'CERRADA',
      settledAt: now,
      updatedAt: now,
      settledSaleId: newSale.id,
      settledInvoiceNumber: newSale.invoiceNumber,
    };

    const nextList = openAccountsRef.current.map((a) => (a.id === accountId ? closedAccount : a));
    openAccountsRef.current = nextList;
    setOpenAccounts(nextList);
    try {
      localStorage.setItem(STORAGE_KEYS.OPEN_ACCOUNTS, JSON.stringify(nextList));
    } catch {}

    pendingSyncOpenAccountIdsRef.current.add(closedAccount.id);
    syncOpenAccountToFirestore(closedAccount)
      .then(() => pendingSyncOpenAccountIdsRef.current.delete(closedAccount.id))
      .catch(() => {});

    return newSale;
  };

  // Online Store Orders
  const placeOnlineOrder = (
    orderData: Omit<OnlineOrder, 'id' | 'orderCode' | 'createdAt' | 'status' | 'bcvRate' | 'totalBs'>
  ): OnlineOrder => {
    const customerDoc = orderData.customerDocument || orderData.recipientDocument || undefined;
    const customer = ensureCustomer(
      orderData.customerName,
      orderData.customerPhone,
      customerDoc,
      orderData.customerState,
      orderData.customerCity
    );

    setProducts((prevProducts) => {
      const touched: Product[] = [];
      const next = prevProducts.map((prod) => {
        if (!productTracksInventory(prod)) return prod;
        const itemOrdered = orderData.items.find(
          (item) => item.productId === prod.id || item.sku === prod.sku
        );
        if (itemOrdered) {
          const updatedStock = Math.max(0, prod.stock - itemOrdered.quantity);
          const updatedProd = { ...prod, stock: updatedStock };
          touched.push(updatedProd);
          return updatedProd;
        }
        return prod;
      });
      queueMicrotask(() => {
        touched.forEach((p) => syncProductToFirestore(p).catch(() => {}));
      });
      return next;
    });

    const randomSuffix = Math.floor(1000 + Math.random() * 9000);
    const orderCode = `PED-${randomSuffix}`;
    const rate = settings.bcvRate;

    const newOrder: OnlineOrder = {
      ...orderData,
      id: `onl-${Date.now()}`,
      orderCode,
      customerId: customer.id,
      bcvRate: rate,
      totalBs: orderData.total * rate,
      status: 'PENDIENTE_PAGO',
      createdAt: new Date().toISOString(),
    };

    setOnlineOrders((prev) => [newOrder, ...prev]);
    syncOnlineOrderToFirestore(newOrder).catch((err) =>
      console.warn('Firestore online order sync error:', err)
    );
    setCart([]);
    return newOrder;
  };

  const updateOrderStatus = (id: string, status: OnlineOrderStatus) => {
    const order = onlineOrders.find((o) => o.id === id);
    if (!order) return;

    if (status === 'CANCELADO' && order.status !== 'CANCELADO') {
      setProducts((prev) => {
        const touched: Product[] = [];
        const next = prev.map((prod) => {
          if (!productTracksInventory(prod)) return prod;
          const item = order.items.find((i) => i.productId === prod.id || i.sku === prod.sku);
          if (item) {
            const updatedProd = { ...prod, stock: prod.stock + item.quantity };
            touched.push(updatedProd);
            return updatedProd;
          }
          return prod;
        });
        queueMicrotask(() => {
          touched.forEach((p) => syncProductToFirestore(p).catch(() => {}));
        });
        return next;
      });
    }

    setOnlineOrders((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const updated = { ...o, status };
        syncOnlineOrderToFirestore(updated).catch(() => {});
        return updated;
      })
    );
  };

  // Cart operations
  const addToCart = (product: Product, quantity = 1) => {
    const tracksInv = productTracksInventory(product);
    if (tracksInv && product.stock <= 0) return;

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.id === product.id);
      if (existing) {
        const nextQty = tracksInv
          ? Math.min(product.stock, existing.quantity + quantity)
          : Math.max(1, existing.quantity + quantity);
        return prevCart.map((item) =>
          item.product.id === product.id ? { ...item, product, quantity: nextQty } : item
        );
      }
      const initialQty = tracksInv ? Math.min(product.stock, quantity) : Math.max(1, quantity);
      return [...prevCart, { product, quantity: initialQty }];
    });
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          const validQty = productTracksInventory(item.product)
            ? Math.min(item.product.stock, quantity)
            : Math.max(1, quantity);
          return { ...item, quantity: validQty };
        }
        return item;
      })
    );
  };

  const clearCart = () => setCart([]);

  const cartWholesaleSummary = useMemo(
    () => calculateCartWholesaleSummary(cart, settings.bcvRate),
    [cart, settings.bcvRate]
  );
  const cartSubtotalBeforeDiscount = cartWholesaleSummary.subtotalBeforeDiscountUSD;
  const cartWholesaleDiscount = cartWholesaleSummary.totalDiscountUSD;
  const cartTotal = cartWholesaleSummary.finalTotalUSD;
  const cartTotalBs = cartWholesaleSummary.finalTotalBs;
  const cartItemCount = cart.reduce((sum, item) => sum + item.quantity, 0);

  const resetAllData = () => {
    fetch('/api/data/reset', { method: 'POST' }).catch((err) => {
      console.warn('Error reiniciando datos en el servidor:', err);
    });
    clearDeletedIdsInFirestore().catch(() => {});
    deletedIdsRef.current = { ...EMPTY_DELETED_IDS };
    setDeletedIds(EMPTY_DELETED_IDS);
    setSettings(INITIAL_SETTINGS);
    setProducts(INITIAL_PRODUCTS);
    setCustomers(INITIAL_CUSTOMERS);
    setSales(INITIAL_SALES);
    setServiceOrders(INITIAL_SERVICE_ORDERS);
    setOnlineOrders(INITIAL_ONLINE_ORDERS);
    setTechnicians([]);
    setServiceCommissions([]);
    setTechnicianPayouts([]);
    setSuppliers([]);
    setPurchaseOrders([]);
    setExpenses([]);
    setTreasuryAccounts([]);
    setTreasuryCommitments([]);
    setTreasuryMovements([]);
    setTreasuryDebts([]);
    setOpenAccounts([]);
    setCart([]);
    localStorage.clear();
  };

  return (
    <AppContext.Provider
      value={{
        currentView,
        setCurrentView,
        trackedPhone,
        setTrackedPhone,
        isPublicClientMode,
        setIsPublicClientMode,
        enterPublicStore,
        enterAdminMode,
        publicStoreUrl,
        onlineStoreBrand: settings.onlineStoreName || 'Mercado Moto CC',
        settings,
        updateSettings,
        updateBcvRate,
        updateUsdtRate,
        isSyncingBcv,
        bcvSyncMessage,
        syncBcvRate,
        isSyncingUsdt,
        usdtSyncMessage,
        syncUsdtRate,
        exchangeGap,
        products,
        onlineProducts,
        categories,
        addCategory,
        modelCategories,
        addModelCategory,
        renameModelCategory,
        deleteModelCategory,
        assignModelCategoryToProducts,
        addProduct,
        updateProduct,
        deleteProduct,
        deleteProducts,
        adjustStock,
        bulkImportProducts,
        customers,
        addCustomer,
        updateCustomer,
        deleteCustomer,
        getCustomerByPhone,
        sales,
        createSale,
        updateSale,
        updateSaleCreditStatus,
        recordCreditPayment,
        deleteSale,
        voidSale,
        reactivateSale,
        deleteCustomerCreditSales,
        voidCustomerCreditSales,
        clearAllTestCreditSales,
        pendingCreditSales,
        overdueCreditSales,
        totalAccountsReceivableUSD,
        totalAccountsReceivableBs,
        updateMercadoLibreCommission,
        settleAllMercadoLibreCommissions,
        mercadolibreDebtUSD,
        mercadolibreDebtBs,
        pendingMercadoLibreSales,
        mlEntries,
        addMercadoLibreManualEntry,
        deleteMercadoLibreEntry,
        serviceOrders,
        createServiceOrder,
        updateServiceOrderStatus,
        updateServiceOrder,
        recordServiceOrderPayment,
        deleteServiceOrderPayment,
        deleteServiceOrder,
        technicians,
        addTechnician,
        updateTechnician,
        deleteTechnician,
        serviceCommissions,
        addServiceCommission,
        updateServiceCommission,
        deleteServiceCommission,
        syncServiceOrderToCommission,
        syncAllPendingServiceOrdersToCommissions,
        technicianPayouts,
        payTechnicianCommissions,
        deleteTechnicianPayout,
        pendingTechniciansCommissionUSD,
        pendingTechniciansCommissionBs,
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
        totalSupplierDebtBs,
        pendingReceptionOrdersCount,
        expenses,
        expenseCategories,
        addExpenseCategory,
        deleteExpenseCategory,
        incomeCategories,
        addIncomeCategory,
        deleteIncomeCategory,
        commitmentCategories,
        addCommitmentCategory,
        deleteCommitmentCategory,
        expensePosBanks,
        addExpensePosBank,
        deleteExpensePosBank,
        addExpense,
        updateExpense,
        deleteExpense,
        totalExpensesUSD,
        totalExpensesBs,
        currentMonthExpensesUSD,
        currentMonthExpensesBs,
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
        syncRecurringCommitments,
        markCommitmentPaidFromAccount,
        recordTreasuryMovement,
        recordUsdtPurchase,
        deleteTreasuryMovement,
        importUnpaidPurchaseOrdersToCommitments,
        totalLiquidityUSD,
        totalLiquidityBs,
        pendingCommitmentsUSD,
        pendingCommitmentsBs,
        projectedFreeBalanceUSD,
        projectedFreeBalanceBs,
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
        openAccounts,
        openCustomerAccount,
        addItemsToOpenAccount,
        updateOpenAccountItem,
        removeOpenAccountItem,
        updateOpenAccountMeta,
        cancelOpenAccount,
        settleOpenAccount,
        onlineOrders,
        placeOnlineOrder,
        updateOrderStatus,
        cart,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        cartTotal,
        cartTotalBs,
        cartSubtotalBeforeDiscount,
        cartWholesaleDiscount,
        cartWholesaleSummary,
        cartItemCount,
        selectedInvoice,
        setSelectedInvoice,
        whatsappModalData,
        setWhatsappModalData,
        isAdminSidebarCollapsed,
        setIsAdminSidebarCollapsed,
        toggleAdminSidebar,
        isAdminMobileMenuOpen,
        setIsAdminMobileMenuOpen,
        currentUser,
        isAuthenticated,
        isAdmin,
        isAuthModalOpen,
        authModalTab,
        openAuthModal,
        closeAuthModal,
        login,
        register,
        changeAdminPassword,
        resetAdminPassword,
        isChangePasswordModalOpen,
        setIsChangePasswordModalOpen,
        logout,
        isFirebaseConnected,
        firebaseSyncStatus,
        syncAllToFirebase,
        firebaseConfigData: firebaseConfig,
        resetAllData,
      }}
    >
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};
