import {
  collection,
  doc,
  getDoc,
  getDocFromServer,
  setDoc,
  deleteDoc,
  onSnapshot,
  arrayUnion,
} from 'firebase/firestore';
import { db, handleFirestoreError, logFirestoreError, OperationType } from '../firebase';
import {
  Product,
  Customer,
  Sale,
  ServiceOrder,
  OnlineOrder,
  BusinessSettings,
  AppUser,
  Technician,
  ServiceCommission,
  TechnicianPayout,
  Supplier,
  PurchaseOrder,
  BusinessExpense,
  TreasuryAccount,
  TreasuryCommitment,
  TreasuryMovement,
} from '../types';

export interface SnapshotSyncMeta {
  hasPendingWrites: boolean;
  fromCache: boolean;
}

export interface DeletedIdsMap {
  sales: string[];
  products: string[];
  customers: string[];
  serviceOrders: string[];
  onlineOrders: string[];
  technicians: string[];
  serviceCommissions: string[];
  technicianPayouts: string[];
  suppliers: string[];
  purchaseOrders: string[];
  expenses: string[];
  treasuryAccounts: string[];
  treasuryCommitments: string[];
  treasuryMovements: string[];
}

export const EMPTY_DELETED_IDS: DeletedIdsMap = {
  sales: [],
  products: [],
  customers: [],
  serviceOrders: [],
  onlineOrders: [],
  technicians: [],
  serviceCommissions: [],
  technicianPayouts: [],
  suppliers: [],
  purchaseOrders: [],
  expenses: [],
  treasuryAccounts: [],
  treasuryCommitments: [],
  treasuryMovements: [],
};

// Recursively remove undefined values because Firestore throws on undefined fields
export function stripUndefined<T>(value: T): T {
  if (Array.isArray(value)) {
    return value
      .filter((item) => item !== undefined)
      .map((item) => stripUndefined(item)) as unknown as T;
  }
  if (value !== null && typeof value === 'object') {
    const clean: Record<string, any> = {};
    for (const [k, v] of Object.entries(value as Record<string, any>)) {
      if (v !== undefined) {
        clean[k] = stripUndefined(v);
      }
    }
    return clean as T;
  }
  return value;
}

// Real-time listener for products
export function subscribeToProducts(callback: (products: Product[], meta: SnapshotSyncMeta) => void) {
  try {
    const prodsCol = collection(db, 'products');
    return onSnapshot(
      prodsCol,
      (snapshot) => {
        const list: Product[] = [];
        snapshot.forEach((docSnap) => {
          const data = docSnap.data() as Product;
          list.push({ ...data, id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'products');
      }
    );
  } catch (error) {
    console.warn('Error starting products listener:', error);
    return () => {};
  }
}

// Real-time listener for business settings and BCV rate
export function subscribeToSettings(callback: (settings: BusinessSettings) => void) {
  try {
    const settingsDoc = doc(db, 'settings', 'business');
    return onSnapshot(
      settingsDoc,
      (snapshot) => {
        if (snapshot.exists()) {
          callback(snapshot.data() as BusinessSettings);
        }
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'settings/business');
      }
    );
  } catch (error) {
    console.warn('Error starting settings listener:', error);
    return () => {};
  }
}

// Real-time listener for customers
export function subscribeToCustomers(callback: (customers: Customer[], meta: SnapshotSyncMeta) => void) {
  try {
    const custCol = collection(db, 'customers');
    return onSnapshot(
      custCol,
      (snapshot) => {
        const list: Customer[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as Customer), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'customers');
      }
    );
  } catch (error) {
    console.warn('Error starting customers listener:', error);
    return () => {};
  }
}

// Real-time listener for sales
export function subscribeToSales(callback: (sales: Sale[], meta: SnapshotSyncMeta) => void) {
  try {
    const salesCol = collection(db, 'sales');
    return onSnapshot(
      salesCol,
      (snapshot) => {
        const list: Sale[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as Sale), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'sales');
      }
    );
  } catch (error) {
    console.warn('Error starting sales listener:', error);
    return () => {};
  }
}

// Real-time listener for service orders
export function subscribeToServiceOrders(callback: (orders: ServiceOrder[], meta: SnapshotSyncMeta) => void) {
  try {
    const colRef = collection(db, 'serviceOrders');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: ServiceOrder[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as ServiceOrder), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'serviceOrders');
      }
    );
  } catch (error) {
    console.warn('Error starting service orders listener:', error);
    return () => {};
  }
}

// Real-time listener for online orders
export function subscribeToOnlineOrders(callback: (orders: OnlineOrder[], meta: SnapshotSyncMeta) => void) {
  try {
    const colRef = collection(db, 'onlineOrders');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: OnlineOrder[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as OnlineOrder), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'onlineOrders');
      }
    );
  } catch (error) {
    console.warn('Error starting online orders listener:', error);
    return () => {};
  }
}

// Real-time listener for users
export function subscribeToUsers(callback: (users: AppUser[]) => void) {
  try {
    const colRef = collection(db, 'users');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: AppUser[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as AppUser), id: docSnap.id });
        });
        callback(list);
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'users');
      }
    );
  } catch (error) {
    console.warn('Error starting users listener:', error);
    return () => {};
  }
}

// Real-time listener for technicians
export function subscribeToTechnicians(callback: (technicians: Technician[], meta: SnapshotSyncMeta) => void) {
  try {
    const colRef = collection(db, 'technicians');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: Technician[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as Technician), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'technicians');
      }
    );
  } catch (error) {
    console.warn('Error starting technicians listener:', error);
    return () => {};
  }
}

// Real-time listener for service commissions
export function subscribeToServiceCommissions(callback: (commissions: ServiceCommission[], meta: SnapshotSyncMeta) => void) {
  try {
    const colRef = collection(db, 'serviceCommissions');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: ServiceCommission[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as ServiceCommission), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'serviceCommissions');
      }
    );
  } catch (error) {
    console.warn('Error starting serviceCommissions listener:', error);
    return () => {};
  }
}

// Real-time listener for technician payouts
export function subscribeToTechnicianPayouts(callback: (payouts: TechnicianPayout[], meta: SnapshotSyncMeta) => void) {
  try {
    const colRef = collection(db, 'technicianPayouts');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: TechnicianPayout[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as TechnicianPayout), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'technicianPayouts');
      }
    );
  } catch (error) {
    console.warn('Error starting technicianPayouts listener:', error);
    return () => {};
  }
}

// Real-time listener for suppliers
export function subscribeToSuppliers(callback: (suppliers: Supplier[], meta: SnapshotSyncMeta) => void) {
  try {
    const colRef = collection(db, 'suppliers');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: Supplier[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as Supplier), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'suppliers');
      }
    );
  } catch (error) {
    console.warn('Error starting suppliers listener:', error);
    return () => {};
  }
}

// Real-time listener for purchase orders
export function subscribeToPurchaseOrders(callback: (orders: PurchaseOrder[], meta: SnapshotSyncMeta) => void) {
  try {
    const colRef = collection(db, 'purchaseOrders');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: PurchaseOrder[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as PurchaseOrder), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'purchaseOrders');
      }
    );
  } catch (error) {
    console.warn('Error starting purchaseOrders listener:', error);
    return () => {};
  }
}

// Real-time listener for business expenses
export function subscribeToExpenses(callback: (expenses: BusinessExpense[], meta: SnapshotSyncMeta) => void) {
  try {
    const colRef = collection(db, 'expenses');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: BusinessExpense[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as BusinessExpense), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'expenses');
      }
    );
  } catch (error) {
    console.warn('Error starting expenses listener:', error);
    return () => {};
  }
}

// Real-time listener for treasury accounts
export function subscribeToTreasuryAccounts(callback: (accounts: TreasuryAccount[], meta: SnapshotSyncMeta) => void) {
  try {
    const colRef = collection(db, 'treasuryAccounts');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: TreasuryAccount[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as TreasuryAccount), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'treasuryAccounts');
      }
    );
  } catch (error) {
    console.warn('Error starting treasuryAccounts listener:', error);
    return () => {};
  }
}

// Real-time listener for treasury commitments
export function subscribeToTreasuryCommitments(callback: (commitments: TreasuryCommitment[], meta: SnapshotSyncMeta) => void) {
  try {
    const colRef = collection(db, 'treasuryCommitments');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: TreasuryCommitment[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as TreasuryCommitment), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'treasuryCommitments');
      }
    );
  } catch (error) {
    console.warn('Error starting treasuryCommitments listener:', error);
    return () => {};
  }
}

// Real-time listener for treasury movements
export function subscribeToTreasuryMovements(callback: (movements: TreasuryMovement[], meta: SnapshotSyncMeta) => void) {
  try {
    const colRef = collection(db, 'treasuryMovements');
    return onSnapshot(
      colRef,
      (snapshot) => {
        const list: TreasuryMovement[] = [];
        snapshot.forEach((docSnap) => {
          list.push({ ...(docSnap.data() as TreasuryMovement), id: docSnap.id });
        });
        callback(list, {
          hasPendingWrites: snapshot.metadata.hasPendingWrites,
          fromCache: snapshot.metadata.fromCache,
        });
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'treasuryMovements');
      }
    );
  } catch (error) {
    console.warn('Error starting treasuryMovements listener:', error);
    return () => {};
  }
}

// One-shot fetch for deleted IDs tombstones before starting collection listeners
export async function fetchDeletedIdsFromFirestore(): Promise<DeletedIdsMap | null> {
  try {
    const docRef = doc(db, 'deletedIds', 'registry');
    const snapshot = await getDoc(docRef);
    if (!snapshot.exists()) return null;
    const data = snapshot.data() as Partial<DeletedIdsMap>;
    return {
      sales: Array.isArray(data.sales) ? data.sales : [],
      products: Array.isArray(data.products) ? data.products : [],
      customers: Array.isArray(data.customers) ? data.customers : [],
      serviceOrders: Array.isArray(data.serviceOrders) ? data.serviceOrders : [],
      onlineOrders: Array.isArray(data.onlineOrders) ? data.onlineOrders : [],
      technicians: Array.isArray(data.technicians) ? data.technicians : [],
      serviceCommissions: Array.isArray(data.serviceCommissions) ? data.serviceCommissions : [],
      technicianPayouts: Array.isArray(data.technicianPayouts) ? data.technicianPayouts : [],
      suppliers: Array.isArray(data.suppliers) ? data.suppliers : [],
      purchaseOrders: Array.isArray(data.purchaseOrders) ? data.purchaseOrders : [],
      expenses: Array.isArray(data.expenses) ? data.expenses : [],
      treasuryAccounts: Array.isArray(data.treasuryAccounts) ? data.treasuryAccounts : [],
      treasuryCommitments: Array.isArray(data.treasuryCommitments) ? data.treasuryCommitments : [],
      treasuryMovements: Array.isArray(data.treasuryMovements) ? data.treasuryMovements : [],
    };
  } catch (error) {
    console.warn('Error fetching deletedIds registry:', error);
    return null;
  }
}

// Real-time listener for deleted IDs tombstones
export function subscribeToDeletedIds(callback: (deletedIds: DeletedIdsMap) => void) {
  try {
    const docRef = doc(db, 'deletedIds', 'registry');
    return onSnapshot(
      docRef,
      (snapshot) => {
        if (snapshot.exists()) {
          const data = snapshot.data() as Partial<DeletedIdsMap>;
          callback({
            sales: Array.isArray(data.sales) ? data.sales : [],
            products: Array.isArray(data.products) ? data.products : [],
            customers: Array.isArray(data.customers) ? data.customers : [],
            serviceOrders: Array.isArray(data.serviceOrders) ? data.serviceOrders : [],
            onlineOrders: Array.isArray(data.onlineOrders) ? data.onlineOrders : [],
            technicians: Array.isArray(data.technicians) ? data.technicians : [],
            serviceCommissions: Array.isArray(data.serviceCommissions) ? data.serviceCommissions : [],
            technicianPayouts: Array.isArray(data.technicianPayouts) ? data.technicianPayouts : [],
            suppliers: Array.isArray(data.suppliers) ? data.suppliers : [],
            purchaseOrders: Array.isArray(data.purchaseOrders) ? data.purchaseOrders : [],
            expenses: Array.isArray(data.expenses) ? data.expenses : [],
            treasuryAccounts: Array.isArray(data.treasuryAccounts) ? data.treasuryAccounts : [],
            treasuryCommitments: Array.isArray(data.treasuryCommitments) ? data.treasuryCommitments : [],
            treasuryMovements: Array.isArray(data.treasuryMovements) ? data.treasuryMovements : [],
          });
        }
      },
      (error) => {
        logFirestoreError(error, OperationType.GET, 'deletedIds/registry');
      }
    );
  } catch (error) {
    console.warn('Error starting deletedIds listener:', error);
    return () => {};
  }
}

// Single item mutations to Firestore
export async function syncProductToFirestore(product: Product): Promise<void> {
  try {
    await setDoc(doc(db, 'products', product.id), stripUndefined(product));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `products/${product.id}`);
  }
}

export async function removeProductFromFirestore(productId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'products', productId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `products/${productId}`);
  }
}

export async function syncSettingsToFirestore(settings: BusinessSettings): Promise<void> {
  try {
    await setDoc(doc(db, 'settings', 'business'), stripUndefined(settings), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'settings/business');
  }
}

export async function syncCustomerToFirestore(customer: Customer): Promise<void> {
  try {
    await setDoc(doc(db, 'customers', customer.id), stripUndefined(customer));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `customers/${customer.id}`);
  }
}

export async function removeCustomerFromFirestore(customerId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'customers', customerId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `customers/${customerId}`);
  }
}

export async function syncSaleToFirestore(sale: Sale): Promise<void> {
  try {
    await setDoc(doc(db, 'sales', sale.id), stripUndefined(sale));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `sales/${sale.id}`);
  }
}

export async function removeSaleFromFirestore(saleId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'sales', saleId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `sales/${saleId}`);
  }
}

export async function syncServiceOrderToFirestore(order: ServiceOrder): Promise<void> {
  try {
    await setDoc(doc(db, 'serviceOrders', order.id), stripUndefined(order));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `serviceOrders/${order.id}`);
  }
}

export async function removeServiceOrderFromFirestore(orderId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'serviceOrders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `serviceOrders/${orderId}`);
  }
}

export async function syncOnlineOrderToFirestore(order: OnlineOrder): Promise<void> {
  try {
    await setDoc(doc(db, 'onlineOrders', order.id), stripUndefined(order));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `onlineOrders/${order.id}`);
  }
}

export async function removeOnlineOrderFromFirestore(orderId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'onlineOrders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `onlineOrders/${orderId}`);
  }
}

export async function syncUserToFirestore(user: AppUser): Promise<void> {
  try {
    await setDoc(doc(db, 'users', user.id), stripUndefined(user), { merge: true });
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users/${user.id}`);
  }
}

export async function fetchAdminUserFromFirestore(): Promise<AppUser | null> {
  const adminRef = doc(db, 'users', 'usr-admin-1');
  try {
    const serverSnap = await getDocFromServer(adminRef);
    if (serverSnap.exists()) {
      const data = serverSnap.data() as AppUser;
      return { ...data, id: serverSnap.id };
    }
    return null;
  } catch {
    try {
      const cacheSnap = await getDoc(adminRef);
      if (cacheSnap.exists()) {
        const data = cacheSnap.data() as AppUser;
        return { ...data, id: cacheSnap.id };
      }
    } catch (error) {
      logFirestoreError(error, OperationType.GET, 'users/usr-admin-1');
    }
    return null;
  }
}

export async function syncTechnicianToFirestore(technician: Technician): Promise<void> {
  try {
    await setDoc(doc(db, 'technicians', technician.id), stripUndefined(technician));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `technicians/${technician.id}`);
  }
}

export async function removeTechnicianFromFirestore(technicianId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'technicians', technicianId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `technicians/${technicianId}`);
  }
}

export async function syncServiceCommissionToFirestore(commission: ServiceCommission): Promise<void> {
  try {
    await setDoc(doc(db, 'serviceCommissions', commission.id), stripUndefined(commission));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `serviceCommissions/${commission.id}`);
  }
}

export async function removeServiceCommissionFromFirestore(commissionId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'serviceCommissions', commissionId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `serviceCommissions/${commissionId}`);
  }
}

export async function syncTechnicianPayoutToFirestore(payout: TechnicianPayout): Promise<void> {
  try {
    await setDoc(doc(db, 'technicianPayouts', payout.id), stripUndefined(payout));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `technicianPayouts/${payout.id}`);
  }
}

export async function removeTechnicianPayoutFromFirestore(payoutId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'technicianPayouts', payoutId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `technicianPayouts/${payoutId}`);
  }
}

export async function syncSupplierToFirestore(supplier: Supplier): Promise<void> {
  try {
    await setDoc(doc(db, 'suppliers', supplier.id), stripUndefined(supplier));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `suppliers/${supplier.id}`);
  }
}

export async function removeSupplierFromFirestore(supplierId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'suppliers', supplierId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `suppliers/${supplierId}`);
  }
}

export async function syncPurchaseOrderToFirestore(order: PurchaseOrder): Promise<void> {
  try {
    await setDoc(doc(db, 'purchaseOrders', order.id), stripUndefined(order));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `purchaseOrders/${order.id}`);
  }
}

export async function removePurchaseOrderFromFirestore(orderId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'purchaseOrders', orderId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `purchaseOrders/${orderId}`);
  }
}

export async function syncExpenseToFirestore(expense: BusinessExpense): Promise<void> {
  try {
    await setDoc(doc(db, 'expenses', expense.id), stripUndefined(expense));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `expenses/${expense.id}`);
  }
}

export async function removeExpenseFromFirestore(expenseId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'expenses', expenseId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `expenses/${expenseId}`);
  }
}

export async function syncTreasuryAccountToFirestore(account: TreasuryAccount): Promise<void> {
  try {
    await setDoc(doc(db, 'treasuryAccounts', account.id), stripUndefined(account));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `treasuryAccounts/${account.id}`);
  }
}

export async function removeTreasuryAccountFromFirestore(accountId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'treasuryAccounts', accountId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `treasuryAccounts/${accountId}`);
  }
}

export async function syncTreasuryCommitmentToFirestore(commitment: TreasuryCommitment): Promise<void> {
  try {
    await setDoc(doc(db, 'treasuryCommitments', commitment.id), stripUndefined(commitment));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `treasuryCommitments/${commitment.id}`);
  }
}

export async function removeTreasuryCommitmentFromFirestore(commitmentId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'treasuryCommitments', commitmentId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `treasuryCommitments/${commitmentId}`);
  }
}

export async function syncTreasuryMovementToFirestore(movement: TreasuryMovement): Promise<void> {
  try {
    await setDoc(doc(db, 'treasuryMovements', movement.id), stripUndefined(movement));
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `treasuryMovements/${movement.id}`);
  }
}

export async function removeTreasuryMovementFromFirestore(movementId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'treasuryMovements', movementId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `treasuryMovements/${movementId}`);
  }
}

export async function recordDeletedIdsInFirestore(
  category: keyof DeletedIdsMap,
  ids: string[]
): Promise<void> {
  if (!ids || ids.length === 0) return;
  try {
    await setDoc(
      doc(db, 'deletedIds', 'registry'),
      { [category]: arrayUnion(...ids) },
      { merge: true }
    );
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'deletedIds/registry');
  }
}

export async function clearDeletedIdsInFirestore(): Promise<void> {
  try {
    await setDoc(doc(db, 'deletedIds', 'registry'), EMPTY_DELETED_IDS);
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, 'deletedIds/registry');
  }
}

// Bulk migration utility to seed Firestore with current database
export async function uploadAllToFirestore(data: {
  products: Product[];
  settings: BusinessSettings;
  customers: Customer[];
  sales: Sale[];
  serviceOrders: ServiceOrder[];
  onlineOrders: OnlineOrder[];
  technicians?: Technician[];
  serviceCommissions?: ServiceCommission[];
  technicianPayouts?: TechnicianPayout[];
  suppliers?: Supplier[];
  purchaseOrders?: PurchaseOrder[];
  expenses?: BusinessExpense[];
  treasuryAccounts?: TreasuryAccount[];
  treasuryCommitments?: TreasuryCommitment[];
  treasuryMovements?: TreasuryMovement[];
  users?: AppUser[];
  deletedIds?: DeletedIdsMap;
}): Promise<{ success: boolean; count: number }> {
  try {
    let totalCount = 0;

    // 1. Settings
    if (data.settings) {
      await setDoc(doc(db, 'settings', 'business'), stripUndefined(data.settings), { merge: true });
      totalCount++;
    }

    // 2. Deleted IDs tombstones
    if (data.deletedIds) {
      await setDoc(doc(db, 'deletedIds', 'registry'), stripUndefined(data.deletedIds), { merge: true });
      for (const id of data.deletedIds.sales || []) {
        await deleteDoc(doc(db, 'sales', id)).catch(() => {});
      }
      for (const id of data.deletedIds.products || []) {
        await deleteDoc(doc(db, 'products', id)).catch(() => {});
      }
      for (const id of data.deletedIds.customers || []) {
        await deleteDoc(doc(db, 'customers', id)).catch(() => {});
      }
      for (const id of data.deletedIds.serviceOrders || []) {
        await deleteDoc(doc(db, 'serviceOrders', id)).catch(() => {});
      }
      for (const id of data.deletedIds.onlineOrders || []) {
        await deleteDoc(doc(db, 'onlineOrders', id)).catch(() => {});
      }
      for (const id of data.deletedIds.technicians || []) {
        await deleteDoc(doc(db, 'technicians', id)).catch(() => {});
      }
      for (const id of data.deletedIds.serviceCommissions || []) {
        await deleteDoc(doc(db, 'serviceCommissions', id)).catch(() => {});
      }
      for (const id of data.deletedIds.technicianPayouts || []) {
        await deleteDoc(doc(db, 'technicianPayouts', id)).catch(() => {});
      }
      for (const id of data.deletedIds.suppliers || []) {
        await deleteDoc(doc(db, 'suppliers', id)).catch(() => {});
      }
      for (const id of data.deletedIds.purchaseOrders || []) {
        await deleteDoc(doc(db, 'purchaseOrders', id)).catch(() => {});
      }
      for (const id of data.deletedIds.expenses || []) {
        await deleteDoc(doc(db, 'expenses', id)).catch(() => {});
      }
      for (const id of data.deletedIds.treasuryAccounts || []) {
        await deleteDoc(doc(db, 'treasuryAccounts', id)).catch(() => {});
      }
      for (const id of data.deletedIds.treasuryCommitments || []) {
        await deleteDoc(doc(db, 'treasuryCommitments', id)).catch(() => {});
      }
      for (const id of data.deletedIds.treasuryMovements || []) {
        await deleteDoc(doc(db, 'treasuryMovements', id)).catch(() => {});
      }
    }

    // 3. Products
    if (Array.isArray(data.products) && data.products.length > 0) {
      for (const p of data.products) {
        await setDoc(doc(db, 'products', p.id), stripUndefined(p));
        totalCount++;
      }
    }

    // 4. Customers
    if (Array.isArray(data.customers) && data.customers.length > 0) {
      for (const c of data.customers) {
        await setDoc(doc(db, 'customers', c.id), stripUndefined(c));
        totalCount++;
      }
    }

    // 5. Sales
    if (Array.isArray(data.sales) && data.sales.length > 0) {
      for (const s of data.sales) {
        await setDoc(doc(db, 'sales', s.id), stripUndefined(s));
        totalCount++;
      }
    }

    // 6. Service orders
    if (Array.isArray(data.serviceOrders) && data.serviceOrders.length > 0) {
      for (const ord of data.serviceOrders) {
        await setDoc(doc(db, 'serviceOrders', ord.id), stripUndefined(ord));
        totalCount++;
      }
    }

    // 7. Online orders
    if (Array.isArray(data.onlineOrders) && data.onlineOrders.length > 0) {
      for (const onl of data.onlineOrders) {
        await setDoc(doc(db, 'onlineOrders', onl.id), stripUndefined(onl));
        totalCount++;
      }
    }

    // 8. Technicians, Service Commissions, and Technician Payouts
    if (Array.isArray(data.technicians) && data.technicians.length > 0) {
      for (const t of data.technicians) {
        await setDoc(doc(db, 'technicians', t.id), stripUndefined(t));
        totalCount++;
      }
    }

    if (Array.isArray(data.serviceCommissions) && data.serviceCommissions.length > 0) {
      for (const sc of data.serviceCommissions) {
        await setDoc(doc(db, 'serviceCommissions', sc.id), stripUndefined(sc));
        totalCount++;
      }
    }

    if (Array.isArray(data.technicianPayouts) && data.technicianPayouts.length > 0) {
      for (const tp of data.technicianPayouts) {
        await setDoc(doc(db, 'technicianPayouts', tp.id), stripUndefined(tp));
        totalCount++;
      }
    }

    // 9. Suppliers & Purchase Orders
    if (Array.isArray(data.suppliers) && data.suppliers.length > 0) {
      for (const sup of data.suppliers) {
        await setDoc(doc(db, 'suppliers', sup.id), stripUndefined(sup));
        totalCount++;
      }
    }

    if (Array.isArray(data.purchaseOrders) && data.purchaseOrders.length > 0) {
      for (const po of data.purchaseOrders) {
        await setDoc(doc(db, 'purchaseOrders', po.id), stripUndefined(po));
        totalCount++;
      }
    }

    // 10. Business Expenses
    if (Array.isArray(data.expenses) && data.expenses.length > 0) {
      for (const exp of data.expenses) {
        await setDoc(doc(db, 'expenses', exp.id), stripUndefined(exp));
        totalCount++;
      }
    }

    // 11. Treasury Accounts, Commitments & Movements
    if (Array.isArray(data.treasuryAccounts) && data.treasuryAccounts.length > 0) {
      for (const acc of data.treasuryAccounts) {
        await setDoc(doc(db, 'treasuryAccounts', acc.id), stripUndefined(acc));
        totalCount++;
      }
    }

    if (Array.isArray(data.treasuryCommitments) && data.treasuryCommitments.length > 0) {
      for (const cm of data.treasuryCommitments) {
        await setDoc(doc(db, 'treasuryCommitments', cm.id), stripUndefined(cm));
        totalCount++;
      }
    }

    if (Array.isArray(data.treasuryMovements) && data.treasuryMovements.length > 0) {
      for (const mv of data.treasuryMovements) {
        await setDoc(doc(db, 'treasuryMovements', mv.id), stripUndefined(mv));
        totalCount++;
      }
    }

    return { success: true, count: totalCount };
  } catch (err: any) {
    console.error('Error in uploadAllToFirestore:', err);
    return { success: false, count: 0 };
  }
}
