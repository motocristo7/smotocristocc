import React, { createContext, useContext, useState, useEffect, useRef, useMemo } from 'react';
import {
  Product,
  Customer,
  Sale,
  ServiceOrder,
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
  Technician,
  ServiceCommission,
  ServiceCommissionStatus,
  TechnicianPayout,
  TechnicianPayoutItem,
  PaymentMethod,
  CreditPaymentRecord,
} from '../types';
import {
  INITIAL_SETTINGS,
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_SALES,
  INITIAL_SERVICE_ORDERS,
  INITIAL_ONLINE_ORDERS,
} from '../data/mockData';
import { fetchOfficialBcvRate, BcvSyncResult } from '../services/bcvService';
import { normalizeImageUrl, PRESET_PRODUCT_IMAGES } from '../utils/imageUrl';
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
  };
}

export type AppView =
  | 'tienda'
  | 'consulta_cliente'
  | 'admin_dashboard'
  | 'admin_pos'
  | 'admin_ventas'
  | 'admin_cuentas_cobrar'
  | 'admin_inventario'
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

  // Settings & BCV Exchange Rate
  settings: BusinessSettings;
  updateSettings: (newSettings: Partial<BusinessSettings>) => Promise<void>;
  updateBcvRate: (newRate: number) => void;
  isSyncingBcv: boolean;
  bcvSyncMessage: string | null;
  syncBcvRate: () => Promise<BcvSyncResult>;

  // Inventory / Products (in USD)
  products: Product[];
  onlineProducts: Product[]; // ONLY products with stock > 0
  categories: ProductCategory[];
  addCategory: (categoryName: string) => { added: boolean; category: ProductCategory };
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
    notes?: string;
    source?: 'POS' | 'TIENDA_ONLINE';
    paymentType?: 'CONTADO' | 'CREDITO' | 'APARTADO' | 'MERCADOLIBRE';
    creditDays?: number;
    creditDueDate?: string;
    creditPaidAmount?: number;
    creditStatus?: 'PENDIENTE' | 'PAGADO';
    mercadolibreCommissionUSD?: number;
    mercadolibreCommissionRate?: number;
    mercadolibreFeeStatus?: 'PENDIENTE' | 'PAGADO';
  }) => Sale;
  updateSale: (
    saleId: string,
    updates: Partial<Sale> & { reassignCustomer?: boolean }
  ) => Sale | null;
  updateSaleCreditStatus: (saleId: string, status: 'PENDIENTE' | 'PAGADO', paidAmount?: number) => void;
  recordCreditPayment: (
    saleId: string,
    payment: {
      amountUSD: number;
      paymentMethod: any;
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
    }
  ) => ServiceOrder;
  updateServiceOrderStatus: (id: string, newStatus: ServiceOrderStatus, notes?: string) => ServiceOrder | undefined;
  updateServiceOrder: (
    id: string,
    updates: Partial<ServiceOrder> & { customerCity?: string; customerAddress?: string }
  ) => ServiceOrder | undefined;
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
    sale?: Sale;
    serviceOrder?: ServiceOrder;
    technicianPayout?: TechnicianPayout;
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
    sale?: Sale;
    serviceOrder?: ServiceOrder;
    technicianPayout?: TechnicianPayout;
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

    // Direct store routes or parameters explicitly requested
    if (
      path.includes('mercadomotocc') ||
      path.includes('/tienda') ||
      path.includes('/catalogo') ||
      path.includes('/repuestos') ||
      search.includes('mercadomotocc') ||
      search.includes('tienda=mercadomotocc') ||
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

    // Public shared preview URL (ais-pre- or vercel.app) opens store if no admin route
    if (
      window.location.hostname.includes('ais-pre-') ||
      window.location.hostname.includes('vercel.app')
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
        return { success: false, error: 'Contraseña incorrecta' };
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

      // Explicit store routes
      if (
        path.includes('mercadomotocc') ||
        path.includes('/tienda') ||
        path.includes('/catalogo') ||
        search.includes('mercadomotocc') ||
        search.includes('tienda=mercadomotocc') ||
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
        search.includes('mercadomotocc') ||
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
    sale?: Sale;
    serviceOrder?: ServiceOrder;
    technicianPayout?: TechnicianPayout;
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

  // Pending-sync set for modified/newly paid service commissions so Firestore snapshots never overwrite local payouts in flight
  const pendingSyncCommissionIdsRef = useRef<Set<string>>(new Set());

  // Live refs so concurrent callbacks never read stale closures
  const salesRef = useRef<Sale[]>(sales);
  const customersRef = useRef<Customer[]>(customers);
  const productsRef = useRef<Product[]>(products);
  const serviceOrdersRef = useRef<ServiceOrder[]>(serviceOrders);
  const onlineOrdersRef = useRef<OnlineOrder[]>(onlineOrders);
  const techniciansRef = useRef<Technician[]>(technicians);
  const serviceCommissionsRef = useRef<ServiceCommission[]>(serviceCommissions);
  const technicianPayoutsRef = useRef<TechnicianPayout[]>(technicianPayouts);
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

          // Settings (merge customCategories from both server & local)
          if (serverDb.settings) {
            setSettings((prev) => {
              const mergedCustom = Array.from(
                new Set([
                  ...(Array.isArray(serverDb.settings.customCategories) ? serverDb.settings.customCategories : []),
                  ...(Array.isArray(prev.customCategories) ? prev.customCategories : []),
                ])
              );
              const nextSettings: BusinessSettings = {
                ...serverDb.settings,
                ...(mergedCustom.length > 0 ? { customCategories: mergedCustom } : {}),
              };
              localStorage.setItem(STORAGE_KEYS.SETTINGS, JSON.stringify(nextSettings));
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
  }>({
    products: new Set(),
    customers: new Set(),
    sales: new Set(),
    serviceOrders: new Set(),
    onlineOrders: new Set(),
    technicians: new Set(),
    serviceCommissions: new Set(),
    technicianPayouts: new Set(),
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

      setSales((prev) => prev.filter((s) => !delSales.has(s.id)));
      setProducts((prev) => prev.filter((p) => !delProds.has(p.id)));
      setCustomers((prev) => prev.filter((c) => !delCusts.has(c.id)));
      setServiceOrders((prev) => prev.filter((o) => !delServ.has(o.id)));
      setOnlineOrders((prev) => prev.filter((o) => !delOnl.has(o.id)));
      setTechnicians((prev) => prev.filter((t) => !delTechs.has(t.id)));
      setServiceCommissions((prev) => prev.filter((c) => !delComms.has(c.id)));
      setTechnicianPayouts((prev) => prev.filter((p) => !delPayouts.has(p.id)));
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
              const nextSettings: BusinessSettings = {
                ...firestoreSettings,
                ...(mergedCustom.length > 0 ? { customCategories: mergedCustom } : {}),
              };
              settingsRef.current = nextSettings;
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
  }, [settings, products, customers, sales, serviceOrders, onlineOrders, technicians, serviceCommissions, technicianPayouts, deletedIds]);

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
  }, [settings, products, customers, sales, serviceOrders, onlineOrders, technicians, serviceCommissions, technicianPayouts, deletedIds]);

  // Online products: strictly filter where stock > 0 and sort alphabetically (A-Z) by name
  const onlineProducts = useMemo(() => {
    return products
      .filter((p) => p.stock > 0)
      .sort((a, b) => a.name.localeCompare(b.name, 'es', { sensitivity: 'base' }));
  }, [products]);

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

  // BCV Automatic Synchronization
  const [isSyncingBcv, setIsSyncingBcv] = useState(false);
  const [bcvSyncMessage, setBcvSyncMessage] = useState<string | null>(null);

  const syncBcvRate = async (): Promise<BcvSyncResult> => {
    setIsSyncingBcv(true);
    setBcvSyncMessage('Consultando tasa oficial en bcv.org.ve...');
    try {
      const result = await fetchOfficialBcvRate();
      if (result.success && result.rate > 0) {
        setSettings((prev) => {
          const updated: BusinessSettings = {
            ...prev,
            bcvRate: result.rate,
            bcvOfficialDate: result.date,
            bcvSource: result.source,
            bcvLastUpdated: new Date().toLocaleTimeString('es-VE', {
              hour: '2-digit',
              minute: '2-digit',
            }),
          };
          syncSettingsToFirestore(updated).catch(() => {});
          return updated;
        });
        setBcvSyncMessage(`Tasa BCV oficial: Bs. ${result.rate.toFixed(2)}`);
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
        error: errMsg,
      };
    } finally {
      setIsSyncingBcv(false);
    }
  };

  // Auto-sync BCV on startup and every 30 minutes
  useEffect(() => {
    syncBcvRate();
    const interval = setInterval(() => {
      syncBcvRate();
    }, 30 * 60 * 1000);
    return () => clearInterval(interval);
  }, []);

  // Update Settings
  const updateSettings = async (newSettings: Partial<BusinessSettings>): Promise<void> => {
    const updatedSettings: BusinessSettings = {
      ...settings,
      ...newSettings,
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

  const updateBcvRate = (newRate: number) => {
    if (newRate > 0) {
      setSettings((prev) => {
        const updated: BusinessSettings = {
          ...prev,
          bcvRate: newRate,
          bcvLastUpdated: new Date().toLocaleTimeString('es-VE', {
            hour: '2-digit',
            minute: '2-digit',
          }),
          bcvSource: 'Ajuste Manual / BCV',
        };
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
    notes?: string;
    source?: 'POS' | 'TIENDA_ONLINE';
    paymentType?: 'CONTADO' | 'CREDITO' | 'APARTADO' | 'MERCADOLIBRE';
    creditDays?: number;
    creditDueDate?: string;
    creditPaidAmount?: number;
    creditStatus?: 'PENDIENTE' | 'PAGADO';
    mercadolibreCommissionUSD?: number;
    mercadolibreCommissionRate?: number;
    mercadolibreFeeStatus?: 'PENDIENTE' | 'PAGADO';
  }): Sale => {
    const customer = ensureCustomer(
      saleData.customerName,
      saleData.customerPhone,
      saleData.customerDocument,
      undefined,
      undefined,
      saleData.customerId
    );

    // Auto-deduct inventory & sync updated product stocks to Firestore
    setProducts((prevProducts) => {
      const touched: Product[] = [];
      const prevProdIdSet = new Set(prevProducts.map((p) => p.id));
      const next = prevProducts.map((prod) => {
        const itemSold = saleData.items.find((item) => {
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
        if (itemSold && !itemSold.isService) {
          const updatedStock = Math.max(0, prod.stock - itemSold.quantity);
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

    const year = new Date().getFullYear();
    const maxExistingSeq = salesRef.current.reduce((maxSeq, s) => {
      const match = (s.invoiceNumber || '').match(/FACT-\d+-(\d+)/);
      const seq = match ? parseInt(match[1], 10) : 0;
      return seq > maxSeq ? seq : maxSeq;
    }, 100);
    const invoiceNum = `FACT-${year}-${String(maxExistingSeq + 1).padStart(4, '0')}`;
    const rate = settingsRef.current.bcvRate;

    const newSale: Sale = {
      ...saleData,
      id: `sale-${Date.now()}-${Math.floor(Math.random() * 1000).toString().padStart(3, '0')}`,
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
      totalBs: saleData.total * rate,
      createdAt: new Date().toISOString(),
      source: saleData.source || 'POS',
      paymentType: saleData.paymentType || 'CONTADO',
      creditDays: saleData.creditDays,
      creditDueDate: saleData.creditDueDate,
      creditPaidAmount:
        saleData.paymentType === 'CREDITO' || saleData.paymentType === 'APARTADO'
          ? (saleData.creditPaidAmount ?? 0)
          : saleData.creditPaidAmount,
      creditStatus:
        saleData.paymentType === 'CREDITO' || saleData.paymentType === 'APARTADO'
          ? (saleData.creditStatus || 'PENDIENTE')
          : undefined,
      creditPayments: [],
      mercadolibreCommissionUSD: saleData.paymentType === 'MERCADOLIBRE' ? (saleData.mercadolibreCommissionUSD || 0) : undefined,
      mercadolibreCommissionRate: saleData.paymentType === 'MERCADOLIBRE' ? saleData.mercadolibreCommissionRate : undefined,
      mercadolibreFeeStatus: saleData.paymentType === 'MERCADOLIBRE' ? (saleData.mercadolibreFeeStatus || 'PENDIENTE') : undefined,
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
    updates: Partial<Sale> & { reassignCustomer?: boolean }
  ): Sale | null => {
    const existing = salesRef.current.find((s) => s.id === saleId);
    if (!existing) return null;

    const { reassignCustomer, ...saleUpdates } = updates;
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

    const nextRate = saleUpdates.bcvRate ?? existing.bcvRate ?? settingsRef.current.bcvRate;
    const nextSubtotal = saleUpdates.subtotal ?? existing.subtotal;
    const nextTotal = saleUpdates.total ?? existing.total;

    const updatedSale: Sale = {
      ...existing,
      ...saleUpdates,
      customerId: resolvedCustomerId,
      customerName: nextName || existing.customerName,
      customerPhone: resolvedCustomerPhone,
      customerDocument: resolvedCustomerDoc || undefined,
      bcvRate: nextRate,
      subtotal: nextSubtotal,
      total: nextTotal,
      subtotalBs: nextSubtotal * nextRate,
      totalBs: nextTotal * nextRate,
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
      paymentMethod: any;
      reference?: string;
      notes?: string;
    }
  ) => {
    const rate = settingsRef.current.bcvRate;
    const existingSale = salesRef.current.find((s) => s.id === saleId);
    if (!existingSale) return null;

    const currentPaid = existingSale.creditPaidAmount || 0;
    const newPaid = Math.round((currentPaid + payment.amountUSD) * 100) / 100;
    const isPaidFull = newPaid >= existingSale.total - 0.01;

    const paymentRecord: CreditPaymentRecord = {
      id: `pay-${Date.now()}`,
      date: new Date().toISOString(),
      amountUSD: payment.amountUSD,
      amountBs: payment.amountUSD * rate,
      paymentMethod: payment.paymentMethod,
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
          if (s.paymentType !== 'CREDITO' && s.paymentType !== 'APARTADO') return false;
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

    if (restoreStock && saleToDelete && Array.isArray(saleToDelete.items)) {
      setProducts((prev) => {
        const touched: Product[] = [];
        const next = prev.map((prod) => {
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

    const now = new Date().toISOString();
    const updatedTargetSale: Sale = {
      ...saleToVoid,
      creditStatus: 'ANULADO' as SaleCreditStatus,
      isVoided: true,
      voidedAt: now,
      voidReason: reason,
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

    const isDeferred = sale.paymentType === 'CREDITO' || sale.paymentType === 'APARTADO';
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
        (s) => (s.paymentType === 'CREDITO' || s.paymentType === 'APARTADO') && explicitIds.has(s.id)
      );
    } else {
      const normSearchPhone = normalizePhoneKey(customerIdOrPhoneOrIds);
      targetSales = currentSales.filter(
        (s) =>
          (s.paymentType === 'CREDITO' || s.paymentType === 'APARTADO') &&
          (s.customerId === customerIdOrPhoneOrIds ||
            (normSearchPhone !== '' && normalizePhoneKey(s.customerPhone) === normSearchPhone))
      );
    }
    if (targetSales.length === 0) return 0;

    if (restoreStock) {
      setProducts((prev) => {
        const touched: Product[] = [];
        const next = prev.map((prod) => {
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
          (s.paymentType === 'CREDITO' || s.paymentType === 'APARTADO') &&
          !s.isVoided &&
          explicitIds.has(s.id)
      );
    } else {
      const normSearchPhone = normalizePhoneKey(customerIdOrPhoneOrIds);
      targetSales = currentSales.filter(
        (s) =>
          (s.paymentType === 'CREDITO' || s.paymentType === 'APARTADO') &&
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
    const targetSales = salesRef.current.filter(
      (s) => s.paymentType === 'CREDITO' || s.paymentType === 'APARTADO'
    );
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

  // Cuentas por Cobrar & Créditos Computados (Excluye ventas anuladas o canceladas)
  const pendingCreditSales = useMemo(() => {
    return sales.filter(
      (s) =>
        (s.paymentType === 'CREDITO' || s.paymentType === 'APARTADO') &&
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
    }
  ): ServiceOrder => {
    const { customerCity, customerAddress, ...serviceOrderFields } = orderData;
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
    const orderNum = `ORD-${year}-${String(serviceOrders.length + 1).padStart(4, '0')}`;
    const rate = settings.bcvRate;

    const newOrder: ServiceOrder = {
      ...serviceOrderFields,
      id: `ord-${Date.now()}`,
      orderNumber: orderNum,
      customerId: customer.id,
      customerName: customer.name,
      customerPhone: serviceOrderFields.customerPhone.trim() || customer.phone,
      customerDocument:
        (serviceOrderFields.customerDocument && serviceOrderFields.customerDocument.trim()) ||
        customer.documentId ||
        undefined,
      bcvRate: rate,
      totalCostBs: serviceOrderFields.totalCost * rate,
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

          updatedOrder = {
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
      updatedOrder = {
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
    }

    if (updatedOrder && (updatedOrder.status === 'CULMINADA' || updatedOrder.status === 'ENTREGADA')) {
      const finalOrd = updatedOrder;
      queueMicrotask(() => {
        autoSyncServiceOrderCommissionIfMatched(finalOrd);
      });
    }

    return updatedOrder;
  };

  const deleteServiceOrder = (id: string, restoreStock: boolean = true) => {
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
          motorcycleLabel: `${order.motorcycle.brand} ${order.motorcycle.model} (${order.motorcycle.plate})`,
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
      motorcycleLabel: `${order.motorcycle.brand} ${order.motorcycle.model} · ${order.motorcycle.plate}`,
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
    if (product.stock <= 0) return;

    setCart((prevCart) => {
      const existing = prevCart.find((item) => item.product.id === product.id);
      if (existing) {
        const newQty = Math.min(product.stock, existing.quantity + quantity);
        return prevCart.map((item) =>
          item.product.id === product.id ? { ...item, quantity: newQty } : item
        );
      }
      return [...prevCart, { product, quantity: Math.min(product.stock, quantity) }];
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
          const validQty = Math.min(item.product.stock, quantity);
          return { ...item, quantity: validQty };
        }
        return item;
      })
    );
  };

  const clearCart = () => setCart([]);

  const cartTotal = cart.reduce((sum, item) => sum + item.product.salePrice * item.quantity, 0);
  const cartTotalBs = cartTotal * settings.bcvRate;
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
        isSyncingBcv,
        bcvSyncMessage,
        syncBcvRate,
        products,
        onlineProducts,
        categories,
        addCategory,
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
