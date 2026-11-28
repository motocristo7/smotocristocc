import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
import http from 'http';
import https from 'https';
import path from 'path';
import { fileURLToPath } from 'url';
import crypto from 'crypto';

import fs from 'fs';
import {
  INITIAL_SETTINGS,
  INITIAL_PRODUCTS,
  INITIAL_CUSTOMERS,
  INITIAL_SALES,
  INITIAL_SERVICE_ORDERS,
  INITIAL_ONLINE_ORDERS,
} from './src/data/mockData';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const PORT = 3000;

// Enable Cross-Origin Resource Sharing (CORS) for all origins and methods
app.use(
  cors({
    origin: '*',
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Origin', 'X-Requested-With', 'Content-Type', 'Accept', 'Authorization'],
  })
);

// Increase JSON and text limit to support bulk product imports and sendBeacon
app.use(express.json({ limit: '20mb' }));
app.use(express.text({ type: ['text/plain', 'application/json'], limit: '20mb' }));

const DATA_DIR = path.resolve(__dirname, 'data');
const DB_FILE = path.join(DATA_DIR, 'database.json');

const DEFAULT_ADMIN_USER = {
  id: 'usr-admin-1',
  name: 'Administrador Servimotos',
  email: 'SERVIMOTOSCRISTOCENTRO@gmail.com',
  phone: '0412-7860509',
  documentId: 'V-19996141',
  role: 'ADMIN',
  password: 'admin',
  hasCustomPassword: false,
  createdAt: '2026-01-01T00:00:00.000Z',
};

function hashPassword(plain: string): string {
  const salt = crypto.randomBytes(16).toString('hex');
  const derived = crypto.pbkdf2Sync(plain, salt, 100000, 32, 'sha256').toString('hex');
  return `pbkdf2$${salt}$${derived}`;
}

function verifyPassword(plain: string, stored?: string): boolean {
  if (!stored || !plain) return false;
  if (stored.startsWith('pbkdf2$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, originalHex] = parts;
    const derivedBuf = crypto.pbkdf2Sync(plain, salt, 100000, 32, 'sha256');
    const originalBuf = Buffer.from(originalHex, 'hex');
    if (derivedBuf.length !== originalBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, originalBuf);
  }
  if (stored.startsWith('scrypt$')) {
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, originalHex] = parts;
    const derivedBuf = crypto.scryptSync(plain, salt, 64);
    const originalBuf = Buffer.from(originalHex, 'hex');
    if (derivedBuf.length !== originalBuf.length) return false;
    return crypto.timingSafeEqual(derivedBuf, originalBuf);
  }
  return stored === plain;
}

interface DeletedIdsMap {
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
  treasuryDebts: string[];
  openAccounts: string[];
  adminTasks: string[];
  users: string[];
  staffAttendance: string[];
  staffNotifications: string[];
}

const EMPTY_DELETED_IDS: DeletedIdsMap = {
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
  treasuryDebts: [],
  openAccounts: [],
  adminTasks: [],
  users: [],
  staffAttendance: [],
  staffNotifications: [],
};

function mergeDeletedIds(a?: Partial<DeletedIdsMap>, b?: Partial<DeletedIdsMap>): DeletedIdsMap {
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
    adminTasks: Array.from(new Set([...(a?.adminTasks || []), ...(b?.adminTasks || [])])),
    users: Array.from(new Set([...(a?.users || []), ...(b?.users || [])])),
    staffAttendance: Array.from(new Set([...(a?.staffAttendance || []), ...(b?.staffAttendance || [])])),
    staffNotifications: Array.from(new Set([...(a?.staffNotifications || []), ...(b?.staffNotifications || [])])),
  };
}

interface AppDatabase {
  settings: any;
  products: any[];
  customers: any[];
  sales: any[];
  serviceOrders: any[];
  onlineOrders: any[];
  technicians: any[];
  serviceCommissions: any[];
  technicianPayouts: any[];
  suppliers: any[];
  purchaseOrders: any[];
  expenses: any[];
  treasuryAccounts: any[];
  treasuryCommitments: any[];
  treasuryMovements: any[];
  treasuryDebts: any[];
  openAccounts: any[];
  adminTasks: any[];
  staffAttendance: any[];
  staffNotifications: any[];
  users: any[];
  deletedIds: DeletedIdsMap;
  updatedAt: string;
}

function getInitialDatabase(): AppDatabase {
  return {
    settings: INITIAL_SETTINGS,
    products: INITIAL_PRODUCTS,
    customers: INITIAL_CUSTOMERS,
    sales: INITIAL_SALES,
    serviceOrders: INITIAL_SERVICE_ORDERS,
    onlineOrders: INITIAL_ONLINE_ORDERS,
    technicians: [],
    serviceCommissions: [],
    technicianPayouts: [],
    suppliers: [],
    purchaseOrders: [],
    expenses: [],
    treasuryAccounts: [],
    treasuryCommitments: [],
    treasuryMovements: [],
    treasuryDebts: [],
    openAccounts: [],
    adminTasks: [],
    staffAttendance: [],
    staffNotifications: [],
    users: [DEFAULT_ADMIN_USER],
    deletedIds: { ...EMPTY_DELETED_IDS, sales: ['sale-102', 'sale-103'] },
    updatedAt: new Date().toISOString(),
  };
}

function readDatabase(): AppDatabase {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    if (fs.existsSync(DB_FILE)) {
      const content = fs.readFileSync(DB_FILE, 'utf-8');
      const parsed = JSON.parse(content);
      
      const loadedUsers = Array.isArray(parsed.users) ? parsed.users : [];
      // Ensure admin exists
      const hasAdmin = loadedUsers.some(
        (u: any) =>
          u.role === 'ADMIN' ||
          (u.email && u.email.toLowerCase() === 'servimotoscristocentro@gmail.com')
      );
      const guaranteedUsers = hasAdmin ? loadedUsers : [DEFAULT_ADMIN_USER, ...loadedUsers];

      const deletedIds = mergeDeletedIds(parsed.deletedIds, { sales: ['sale-102', 'sale-103'] });
      const deletedSalesSet = new Set(deletedIds.sales);
      const deletedProductsSet = new Set(deletedIds.products);
      const deletedCustomersSet = new Set(deletedIds.customers);
      const deletedServiceSet = new Set(deletedIds.serviceOrders);
      const deletedOnlineSet = new Set(deletedIds.onlineOrders);
      const deletedTechSet = new Set(deletedIds.technicians);
      const deletedCommSet = new Set(deletedIds.serviceCommissions);
      const deletedPayoutSet = new Set(deletedIds.technicianPayouts);
      const deletedSupplierSet = new Set(deletedIds.suppliers);
      const deletedPurchaseOrderSet = new Set(deletedIds.purchaseOrders);
      const deletedExpenseSet = new Set(deletedIds.expenses);
      const deletedTreasuryAccountSet = new Set(deletedIds.treasuryAccounts);
      const deletedTreasuryCommitmentSet = new Set(deletedIds.treasuryCommitments);
      const deletedTreasuryMovementSet = new Set(deletedIds.treasuryMovements);
      const deletedTreasuryDebtSet = new Set(deletedIds.treasuryDebts);
      const deletedOpenAccountSet = new Set(deletedIds.openAccounts);
      const deletedAdminTaskSet = new Set(deletedIds.adminTasks);
      const deletedUsersSet = new Set(deletedIds.users);
      const deletedStaffAttendanceSet = new Set(deletedIds.staffAttendance);
      const deletedStaffNotificationSet = new Set(deletedIds.staffNotifications);

      return {
        settings: parsed.settings || INITIAL_SETTINGS,
        products: (Array.isArray(parsed.products) ? parsed.products : INITIAL_PRODUCTS).filter((p: any) => !deletedProductsSet.has(p.id)),
        customers: (Array.isArray(parsed.customers) ? parsed.customers : INITIAL_CUSTOMERS).filter((c: any) => !deletedCustomersSet.has(c.id)),
        sales: (Array.isArray(parsed.sales) ? parsed.sales : INITIAL_SALES).filter((s: any) => !deletedSalesSet.has(s.id)),
        serviceOrders: (Array.isArray(parsed.serviceOrders) ? parsed.serviceOrders : INITIAL_SERVICE_ORDERS).filter((o: any) => !deletedServiceSet.has(o.id)),
        onlineOrders: (Array.isArray(parsed.onlineOrders) ? parsed.onlineOrders : INITIAL_ONLINE_ORDERS).filter((o: any) => !deletedOnlineSet.has(o.id)),
        technicians: (Array.isArray(parsed.technicians) ? parsed.technicians : []).filter((t: any) => !deletedTechSet.has(t.id)),
        serviceCommissions: (Array.isArray(parsed.serviceCommissions) ? parsed.serviceCommissions : []).filter((c: any) => !deletedCommSet.has(c.id)),
        technicianPayouts: (Array.isArray(parsed.technicianPayouts) ? parsed.technicianPayouts : []).filter((p: any) => !deletedPayoutSet.has(p.id)),
        suppliers: (Array.isArray(parsed.suppliers) ? parsed.suppliers : []).filter((s: any) => !deletedSupplierSet.has(s.id)),
        purchaseOrders: (Array.isArray(parsed.purchaseOrders) ? parsed.purchaseOrders : []).filter((po: any) => !deletedPurchaseOrderSet.has(po.id)),
        expenses: (Array.isArray(parsed.expenses) ? parsed.expenses : []).filter((ex: any) => !deletedExpenseSet.has(ex.id)),
        treasuryAccounts: (Array.isArray(parsed.treasuryAccounts) ? parsed.treasuryAccounts : []).filter((acc: any) => !deletedTreasuryAccountSet.has(acc.id)),
        treasuryCommitments: (Array.isArray(parsed.treasuryCommitments) ? parsed.treasuryCommitments : []).filter((cm: any) => !deletedTreasuryCommitmentSet.has(cm.id)),
        treasuryMovements: (Array.isArray(parsed.treasuryMovements) ? parsed.treasuryMovements : []).filter((mv: any) => !deletedTreasuryMovementSet.has(mv.id)),
        treasuryDebts: (Array.isArray(parsed.treasuryDebts) ? parsed.treasuryDebts : []).filter((d: any) => !deletedTreasuryDebtSet.has(d.id)),
        openAccounts: (Array.isArray(parsed.openAccounts) ? parsed.openAccounts : []).filter((a: any) => !deletedOpenAccountSet.has(a.id)),
        adminTasks: (Array.isArray(parsed.adminTasks) ? parsed.adminTasks : []).filter((t: any) => !deletedAdminTaskSet.has(t.id)),
        staffAttendance: (Array.isArray(parsed.staffAttendance) ? parsed.staffAttendance : []).filter((a: any) => !deletedStaffAttendanceSet.has(a.id)),
        staffNotifications: (Array.isArray(parsed.staffNotifications) ? parsed.staffNotifications : []).filter((n: any) => !deletedStaffNotificationSet.has(n.id)),
        users: guaranteedUsers.filter((u: any) => u.id === 'usr-admin-1' || u.role === 'ADMIN' || !deletedUsersSet.has(u.id)),
        deletedIds,
        updatedAt: parsed.updatedAt || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error('Error reading database file, initializing fresh store:', err);
  }
  const initial = getInitialDatabase();
  writeDatabase(initial);
  return initial;
}

function mergeCollectionById<T extends { id?: string }>(
  existing: T[],
  incoming: T[],
  deletedSet: Set<string>
): T[] {
  const incomingIds = new Set(incoming.map((item) => item?.id).filter(Boolean) as string[]);
  const filteredIncoming = incoming.filter((item) => !item?.id || !deletedSet.has(item.id));
  const preservedExisting = existing.filter(
    (item) => item?.id && !incomingIds.has(item.id) && !deletedSet.has(item.id)
  );
  return [...filteredIncoming, ...preservedExisting];
}

function writeDatabase(
  data: Partial<AppDatabase>,
  replaceDeletedIds: boolean = false,
  mergeCollections: boolean = false
): boolean {
  try {
    if (!fs.existsSync(DATA_DIR)) {
      fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    let current: AppDatabase;
    try {
      current = fs.existsSync(DB_FILE)
        ? JSON.parse(fs.readFileSync(DB_FILE, 'utf-8'))
        : getInitialDatabase();
    } catch {
      current = getInitialDatabase();
    }

    // Maintain a rolling backup of the database before overwriting
    if (fs.existsSync(DB_FILE) && Array.isArray(current.products) && current.products.length > 0) {
      const backupFile = path.join(DATA_DIR, 'database.backup.json');
      try {
        let shouldWriteBackup = true;
        if (fs.existsSync(backupFile)) {
          const prevBackup = JSON.parse(fs.readFileSync(backupFile, 'utf-8'));
          const prevCount = Array.isArray(prevBackup?.products) ? prevBackup.products.length : 0;
          // Preserve the richer snapshot if current only shrinks
          if (current.products.length < prevCount) {
            shouldWriteBackup = false;
          }
        }
        if (shouldWriteBackup) {
          fs.writeFileSync(backupFile, JSON.stringify(current, null, 2), 'utf-8');
        }
      } catch {}
    }

    const mergedDeletedIds = replaceDeletedIds
      ? mergeDeletedIds(EMPTY_DELETED_IDS, data.deletedIds)
      : mergeDeletedIds(current.deletedIds, data.deletedIds);

    const deletedSalesSet = new Set(mergedDeletedIds.sales);
    const deletedProductsSet = new Set(mergedDeletedIds.products);
    const deletedCustomersSet = new Set(mergedDeletedIds.customers);
    const deletedServiceSet = new Set(mergedDeletedIds.serviceOrders);
    const deletedOnlineSet = new Set(mergedDeletedIds.onlineOrders);
    const deletedTechSet = new Set(mergedDeletedIds.technicians);
    const deletedCommSet = new Set(mergedDeletedIds.serviceCommissions);
    const deletedPayoutSet = new Set(mergedDeletedIds.technicianPayouts);
    const deletedSupplierSet = new Set(mergedDeletedIds.suppliers);
    const deletedPurchaseOrderSet = new Set(mergedDeletedIds.purchaseOrders);
    const deletedExpenseSet = new Set(mergedDeletedIds.expenses);
    const deletedTreasuryAccountSet = new Set(mergedDeletedIds.treasuryAccounts);
    const deletedTreasuryCommitmentSet = new Set(mergedDeletedIds.treasuryCommitments);
    const deletedTreasuryMovementSet = new Set(mergedDeletedIds.treasuryMovements);
    const deletedTreasuryDebtSet = new Set(mergedDeletedIds.treasuryDebts);
    const deletedOpenAccountSet = new Set(mergedDeletedIds.openAccounts);
    const deletedAdminTaskSet = new Set(mergedDeletedIds.adminTasks);
    const deletedUsersSet = new Set(mergedDeletedIds.users);
    const deletedStaffAttendanceSet = new Set(mergedDeletedIds.staffAttendance);
    const deletedStaffNotificationSet = new Set(mergedDeletedIds.staffNotifications);

    const rawProducts = Array.isArray(data.products)
      ? mergeCollections
        ? mergeCollectionById(current.products || [], data.products, deletedProductsSet)
        : data.products
      : current.products || [];
    const rawCustomers = Array.isArray(data.customers)
      ? mergeCollections
        ? mergeCollectionById(current.customers || [], data.customers, deletedCustomersSet)
        : data.customers
      : current.customers || [];
    const rawSales = Array.isArray(data.sales)
      ? mergeCollections
        ? mergeCollectionById(current.sales || [], data.sales, deletedSalesSet)
        : data.sales
      : current.sales || [];
    const rawServiceOrders = Array.isArray(data.serviceOrders)
      ? mergeCollections
        ? mergeCollectionById(current.serviceOrders || [], data.serviceOrders, deletedServiceSet)
        : data.serviceOrders
      : current.serviceOrders || [];
    const rawOnlineOrders = Array.isArray(data.onlineOrders)
      ? mergeCollections
        ? mergeCollectionById(current.onlineOrders || [], data.onlineOrders, deletedOnlineSet)
        : data.onlineOrders
      : current.onlineOrders || [];
    const rawTechnicians = Array.isArray(data.technicians)
      ? mergeCollections
        ? mergeCollectionById(current.technicians || [], data.technicians, deletedTechSet)
        : data.technicians
      : current.technicians || [];
    const rawServiceCommissions = Array.isArray(data.serviceCommissions)
      ? mergeCollections
        ? mergeCollectionById(current.serviceCommissions || [], data.serviceCommissions, deletedCommSet)
        : data.serviceCommissions
      : current.serviceCommissions || [];
    const rawTechnicianPayouts = Array.isArray(data.technicianPayouts)
      ? mergeCollections
        ? mergeCollectionById(current.technicianPayouts || [], data.technicianPayouts, deletedPayoutSet)
        : data.technicianPayouts
      : current.technicianPayouts || [];
    const rawSuppliers = Array.isArray(data.suppliers)
      ? mergeCollections
        ? mergeCollectionById(current.suppliers || [], data.suppliers, deletedSupplierSet)
        : data.suppliers
      : current.suppliers || [];
    const rawPurchaseOrders = Array.isArray(data.purchaseOrders)
      ? mergeCollections
        ? mergeCollectionById(current.purchaseOrders || [], data.purchaseOrders, deletedPurchaseOrderSet)
        : data.purchaseOrders
      : current.purchaseOrders || [];
    const rawExpenses = Array.isArray(data.expenses)
      ? mergeCollections
        ? mergeCollectionById(current.expenses || [], data.expenses, deletedExpenseSet)
        : data.expenses
      : current.expenses || [];
    const rawTreasuryAccounts = Array.isArray(data.treasuryAccounts)
      ? mergeCollections
        ? mergeCollectionById(current.treasuryAccounts || [], data.treasuryAccounts, deletedTreasuryAccountSet)
        : data.treasuryAccounts
      : current.treasuryAccounts || [];
    const rawTreasuryCommitments = Array.isArray(data.treasuryCommitments)
      ? mergeCollections
        ? mergeCollectionById(current.treasuryCommitments || [], data.treasuryCommitments, deletedTreasuryCommitmentSet)
        : data.treasuryCommitments
      : current.treasuryCommitments || [];
    const rawTreasuryMovements = Array.isArray(data.treasuryMovements)
      ? mergeCollections
        ? mergeCollectionById(current.treasuryMovements || [], data.treasuryMovements, deletedTreasuryMovementSet)
        : data.treasuryMovements
      : current.treasuryMovements || [];
    const rawTreasuryDebts = Array.isArray(data.treasuryDebts)
      ? mergeCollections
        ? mergeCollectionById(current.treasuryDebts || [], data.treasuryDebts, deletedTreasuryDebtSet)
        : data.treasuryDebts
      : current.treasuryDebts || [];
    const rawOpenAccounts = Array.isArray(data.openAccounts)
      ? mergeCollections
        ? mergeCollectionById(current.openAccounts || [], data.openAccounts, deletedOpenAccountSet)
        : data.openAccounts
      : current.openAccounts || [];
    const rawAdminTasks = Array.isArray(data.adminTasks)
      ? mergeCollections
        ? mergeCollectionById(current.adminTasks || [], data.adminTasks, deletedAdminTaskSet)
        : data.adminTasks
      : current.adminTasks || [];
    const rawStaffAttendance = Array.isArray(data.staffAttendance)
      ? mergeCollections
        ? mergeCollectionById(current.staffAttendance || [], data.staffAttendance, deletedStaffAttendanceSet)
        : data.staffAttendance
      : current.staffAttendance || [];
    const rawStaffNotifications = Array.isArray(data.staffNotifications)
      ? mergeCollections
        ? mergeCollectionById(current.staffNotifications || [], data.staffNotifications, deletedStaffNotificationSet)
        : data.staffNotifications
      : current.staffNotifications || [];
    // Merge users safely without ever dropping stored password hashes or the primary admin account
    const existingUsers = Array.isArray(current.users) ? current.users : [DEFAULT_ADMIN_USER];
    let mergedUsers = existingUsers;
    if (Array.isArray(data.users)) {
      if (mergeCollections) {
        const existingById = new Map(existingUsers.map((u: any) => [u.id, u]));
        const incomingMapped = data.users
          .filter((u: any) => u?.id && (u.id === 'usr-admin-1' || u.role === 'ADMIN' || !deletedUsersSet.has(u.id)))
          .map((inc: any) => {
            const prev = existingById.get(inc.id);
            const resolvedPassword =
              inc.password ||
              (typeof inc.passwordHash === 'string' && inc.passwordHash.startsWith('pbkdf2$')
                ? inc.passwordHash
                : prev?.password || prev?.passwordHash);
            return {
              ...(prev || {}),
              ...inc,
              password: resolvedPassword,
              passwordHash:
                typeof inc.passwordHash === 'string' && inc.passwordHash.startsWith('pbkdf2$')
                  ? inc.passwordHash
                  : prev?.passwordHash,
            };
          });
        const incomingIds = new Set(incomingMapped.map((u: any) => u.id));
        const preservedExisting = existingUsers.filter(
          (u: any) =>
            u?.id &&
            !incomingIds.has(u.id) &&
            (u.id === 'usr-admin-1' || u.role === 'ADMIN' || !deletedUsersSet.has(u.id))
        );
        mergedUsers = [...incomingMapped, ...preservedExisting];
      } else {
        mergedUsers = data.users.filter(
          (u: any) => u?.id === 'usr-admin-1' || u?.role === 'ADMIN' || !deletedUsersSet.has(u?.id)
        );
      }
    }
    if (!mergedUsers.some((u: any) => u.role === 'ADMIN' || u.id === 'usr-admin-1')) {
      mergedUsers = [DEFAULT_ADMIN_USER, ...mergedUsers];
    }

    // Protect fresher official BCV rate from being overwritten by stale client POST /api/data payloads
    let mergedSettings = data.settings !== undefined ? data.settings : current.settings;
    if (data.settings && current.settings) {
      const currTs = current.settings.bcvSyncedAtISO ? Date.parse(current.settings.bcvSyncedAtISO) : 0;
      const incTs = data.settings.bcvSyncedAtISO ? Date.parse(data.settings.bcvSyncedAtISO) : 0;
      if (
        currTs > 0 &&
        (!incTs || currTs > incTs) &&
        Number(current.settings.bcvRate) > 0 &&
        Number(current.settings.bcvRate) !== Number(data.settings.bcvRate)
      ) {
        mergedSettings = {
          ...data.settings,
          bcvRate: current.settings.bcvRate,
          bcvOfficialDate: current.settings.bcvOfficialDate,
          bcvSource: current.settings.bcvSource,
          bcvLastUpdated: current.settings.bcvLastUpdated,
          bcvSyncedAtISO: current.settings.bcvSyncedAtISO,
        };
      }
    }

    const updated: AppDatabase = {
      ...current,
      ...data,
      settings: mergedSettings,
      products: Array.isArray(rawProducts) ? rawProducts.filter((p: any) => !deletedProductsSet.has(p.id)) : [],
      customers: Array.isArray(rawCustomers) ? rawCustomers.filter((c: any) => !deletedCustomersSet.has(c.id)) : [],
      sales: Array.isArray(rawSales) ? rawSales.filter((s: any) => !deletedSalesSet.has(s.id)) : [],
      serviceOrders: Array.isArray(rawServiceOrders) ? rawServiceOrders.filter((o: any) => !deletedServiceSet.has(o.id)) : [],
      onlineOrders: Array.isArray(rawOnlineOrders) ? rawOnlineOrders.filter((o: any) => !deletedOnlineSet.has(o.id)) : [],
      technicians: Array.isArray(rawTechnicians) ? rawTechnicians.filter((t: any) => !deletedTechSet.has(t.id)) : [],
      serviceCommissions: Array.isArray(rawServiceCommissions) ? rawServiceCommissions.filter((c: any) => !deletedCommSet.has(c.id)) : [],
      technicianPayouts: Array.isArray(rawTechnicianPayouts) ? rawTechnicianPayouts.filter((p: any) => !deletedPayoutSet.has(p.id)) : [],
      suppliers: Array.isArray(rawSuppliers) ? rawSuppliers.filter((s: any) => !deletedSupplierSet.has(s.id)) : [],
      purchaseOrders: Array.isArray(rawPurchaseOrders) ? rawPurchaseOrders.filter((po: any) => !deletedPurchaseOrderSet.has(po.id)) : [],
      expenses: Array.isArray(rawExpenses) ? rawExpenses.filter((ex: any) => !deletedExpenseSet.has(ex.id)) : [],
      treasuryAccounts: Array.isArray(rawTreasuryAccounts) ? rawTreasuryAccounts.filter((acc: any) => !deletedTreasuryAccountSet.has(acc.id)) : [],
      treasuryCommitments: Array.isArray(rawTreasuryCommitments) ? rawTreasuryCommitments.filter((cm: any) => !deletedTreasuryCommitmentSet.has(cm.id)) : [],
      treasuryMovements: Array.isArray(rawTreasuryMovements) ? rawTreasuryMovements.filter((mv: any) => !deletedTreasuryMovementSet.has(mv.id)) : [],
      treasuryDebts: Array.isArray(rawTreasuryDebts) ? rawTreasuryDebts.filter((d: any) => !deletedTreasuryDebtSet.has(d.id)) : [],
      openAccounts: Array.isArray(rawOpenAccounts) ? rawOpenAccounts.filter((a: any) => !deletedOpenAccountSet.has(a.id)) : [],
      adminTasks: Array.isArray(rawAdminTasks) ? rawAdminTasks.filter((t: any) => !deletedAdminTaskSet.has(t.id)) : [],
      staffAttendance: Array.isArray(rawStaffAttendance) ? rawStaffAttendance.filter((a: any) => !deletedStaffAttendanceSet.has(a.id)) : [],
      staffNotifications: Array.isArray(rawStaffNotifications) ? rawStaffNotifications.filter((n: any) => !deletedStaffNotificationSet.has(n.id)) : [],
      users: mergedUsers,
      deletedIds: mergedDeletedIds,
      updatedAt: new Date().toISOString(),
    };

    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(updated, null, 2), 'utf-8');
    fs.renameSync(tempFile, DB_FILE);
    return true;
  } catch (err) {
    console.error('Error writing database file:', err);
    return false;
  }
}

interface BcvRateResponse {
  success: boolean;
  rate: number;
  rawRate?: number;
  date?: string;
  source: string;
  timestamp: string;
  isLive?: boolean;
}

const BCV_ALLOWED_HOSTS = new Set(['www.bcv.org.ve', 'bcv.org.ve']);
const BCV_CACHE_TTL_MS = 3 * 60 * 1000; // 3 minutes cache for live BCV responses
const BCV_MIN_FORCE_INTERVAL_MS = 15 * 1000; // 15s throttle on forced refreshes to protect bcv.org.ve
const BCV_BACKGROUND_POLL_MS = 10 * 60 * 1000; // Auto-check bcv.org.ve every 10 minutes on the server

let cachedBcvResponse: BcvRateResponse | null = null;
let cachedBcvFetchedAtMs = 0;
let inFlightBcvPromise: Promise<BcvRateResponse> | null = null;

function formatCaracasTime(): string {
  try {
    return new Date().toLocaleTimeString('es-VE', {
      timeZone: 'America/Caracas',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return new Date().toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' });
  }
}

function sanitizeBcvDateText(raw?: string): string {
  if (!raw || typeof raw !== 'string') {
    return new Date().toLocaleDateString('es-VE', { timeZone: 'America/Caracas' });
  }
  return raw
    .replace(/<[^>]*>/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 80);
}

// Fetch raw HTML from https://www.bcv.org.ve/ with safe redirect handling (strictly confined to bcv.org.ve)
function fetchBcvHtml(targetUrl: string, redirectsLeft = 3): Promise<string> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(targetUrl);
    } catch {
      return reject(new Error('URL BCV inválida'));
    }

    if (parsed.protocol !== 'https:' || !BCV_ALLOWED_HOSTS.has(parsed.hostname.toLowerCase())) {
      return reject(new Error('Host BCV no permitido'));
    }

    const agent = new https.Agent({
      rejectUnauthorized: false, // BCV SSL chain frequently has intermediate certificate issues
    });

    const req = https.request(
      {
        hostname: parsed.hostname,
        port: 443,
        path: `${parsed.pathname || '/'}${parsed.search || ''}`,
        method: 'GET',
        agent,
        headers: {
          'User-Agent':
            'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
          Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
          'Accept-Language': 'es-VE,es;q=0.9,en;q=0.8',
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
        },
        timeout: 12000,
      },
      (res) => {
        const status = res.statusCode || 0;
        if (
          status >= 300 &&
          status < 400 &&
          res.headers.location &&
          redirectsLeft > 0
        ) {
          res.resume();
          try {
            const nextUrl = new URL(res.headers.location, targetUrl).toString();
            return fetchBcvHtml(nextUrl, redirectsLeft - 1).then(resolve, reject);
          } catch (err) {
            return reject(err);
          }
        }

        if (status < 200 || status >= 300) {
          res.resume();
          return reject(new Error(`BCV respondió HTTP ${status}`));
        }

        let data = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          data += chunk;
          if (data.length > 2_000_000) {
            req.destroy();
            reject(new Error('Respuesta HTML de BCV excedió límite permitido'));
          }
        });
        res.on('end', () => resolve(data));
      }
    );

    req.on('timeout', () => {
      req.destroy();
      reject(new Error('Timeout al conectar con bcv.org.ve'));
    });

    req.on('error', (err) => {
      reject(err);
    });

    req.end();
  });
}

// Parse official USD rate & Fecha Valor from BCV homepage HTML
function parseBcvOfficialHtml(html: string): BcvRateResponse {
  // Primary selector: <div id="dolar" ...> ... <strong ...>919,82270000</strong>
  const dollarMatch =
    html.match(/id=["']dolar["'][\s\S]{0,1200}?<strong[^>]*>\s*([0-9.,]+)\s*<\/strong>/i) ||
    html.match(/USD[\s\S]{0,400}?<strong[^>]*>\s*([0-9]+[.,][0-9]+)\s*<\/strong>/i);

  // Extract official value date: Fecha Valor: <span ... class="date-display-single">Martes, 24 Noviembre 2026</span>
  const dateMatch =
    html.match(/Fecha\s+Valor:[\s\S]{0,400}?<span[^>]*class=["'][^"']*date-display-single[^"']*["'][^>]*>([^<]+)<\/span>/i) ||
    html.match(/class=["'][^"']*date-display-single[^"']*["'][^>]*>([^<]+)<\/span>/i);

  if (!dollarMatch || !dollarMatch[1]) {
    throw new Error('No se pudo extraer la tasa USD del HTML de bcv.org.ve');
  }

  const rawToken = dollarMatch[1].trim();
  const normalizedStr = rawToken.includes(',')
    ? rawToken.replace(/\./g, '').replace(',', '.')
    : rawToken;
  const numericRate = parseFloat(normalizedStr);

  if (!Number.isFinite(numericRate) || numericRate <= 1 || numericRate >= 1_000_000) {
    throw new Error(`Tasa BCV fuera de rango válido: ${rawToken}`);
  }

  return {
    success: true,
    rate: Math.round(numericRate * 100) / 100,
    rawRate: numericRate,
    date: sanitizeBcvDateText(dateMatch ? dateMatch[1] : undefined),
    source: 'Banco Central de Venezuela (bcv.org.ve)',
    timestamp: new Date().toISOString(),
    isLive: true,
  };
}

// Scrape official BCV rate directly from https://www.bcv.org.ve/ with 1 automatic retry
async function scrapeBcvOfficial(): Promise<BcvRateResponse> {
  let lastError: unknown;
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const html = await fetchBcvHtml('https://www.bcv.org.ve/');
      return parseBcvOfficialHtml(html);
    } catch (err) {
      lastError = err;
    }
  }
  throw lastError instanceof Error ? lastError : new Error('Fallo al consultar bcv.org.ve');
}

// Fallback using DolarApi (mirrors official BCV with CORS)
async function fetchBcvFallback(): Promise<BcvRateResponse> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 8000);
  try {
    const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });

    if (!response.ok) {
      throw new Error(`DolarApi error HTTP ${response.status}`);
    }

    const json = await response.json();
    const rate = Number(json.promedio || json.venta || json.compra);

    if (!Number.isFinite(rate) || rate <= 1 || rate >= 1_000_000) {
      throw new Error('Respuesta inválida de mirror BCV');
    }

    return {
      success: true,
      rate: Math.round(rate * 100) / 100,
      rawRate: rate,
      date: sanitizeBcvDateText(
        json.fechaActualizacion
          ? new Date(json.fechaActualizacion).toLocaleDateString('es-VE', {
              timeZone: 'America/Caracas',
              weekday: 'long',
              day: 'numeric',
              month: 'long',
              year: 'numeric',
            })
          : undefined
      ),
      source: 'Banco Central de Venezuela (BCV Oficial vía Mirror)',
      timestamp: new Date().toISOString(),
      isLive: true,
    };
  } finally {
    clearTimeout(timeout);
  }
}

// Persist newly fetched official BCV rate into server database.json so all APIs stay automatically up to date
function persistLiveBcvToDatabase(bcvData: BcvRateResponse): void {
  if (!bcvData.success || !bcvData.isLive || !(bcvData.rate > 0)) return;
  try {
    const db = readDatabase();
    const currentSettings = db.settings || {};
    const prevRate = Number(currentSettings.bcvRate) || 0;
    const prevDate = String(currentSettings.bcvOfficialDate || '');
    const nextDate = String(bcvData.date || prevDate);

    // Always update if rate, official date, or source changed, or if no ISO sync timestamp exists yet
    const hasChanged =
      Math.abs(prevRate - bcvData.rate) >= 0.005 ||
      (nextDate && prevDate !== nextDate) ||
      !currentSettings.bcvSyncedAtISO;

    if (hasChanged) {
      writeDatabase({
        settings: {
          ...currentSettings,
          bcvRate: bcvData.rate,
          bcvOfficialDate: nextDate,
          bcvSource: bcvData.source,
          bcvLastUpdated: formatCaracasTime(),
          bcvSyncedAtISO: bcvData.timestamp,
        },
      });
      console.log(
        `[BCV Auto-Sync] Tasa BCV actualizada automáticamente: Bs. ${bcvData.rate.toFixed(2)} (${nextDate}) [${bcvData.source}]`
      );
    }
  } catch (err) {
    console.warn('[BCV Auto-Sync] No se pudo persistir la tasa BCV en BD local:', err);
  }
}

async function getLatestBcvRate(forceRefresh = false): Promise<BcvRateResponse> {
  const now = Date.now();
  const cacheAgeMs = now - cachedBcvFetchedAtMs;

  if (cachedBcvResponse && cachedBcvResponse.isLive) {
    if (!forceRefresh && cacheAgeMs < BCV_CACHE_TTL_MS) {
      return cachedBcvResponse;
    }
    if (forceRefresh && cacheAgeMs < BCV_MIN_FORCE_INTERVAL_MS) {
      return cachedBcvResponse;
    }
  }

  if (inFlightBcvPromise) {
    return inFlightBcvPromise;
  }

  inFlightBcvPromise = (async (): Promise<BcvRateResponse> => {
    try {
      // 1. Primary: Direct live scrape from https://www.bcv.org.ve/
      const bcvData = await scrapeBcvOfficial();
      cachedBcvResponse = bcvData;
      cachedBcvFetchedAtMs = Date.now();
      persistLiveBcvToDatabase(bcvData);
      return bcvData;
    } catch (directErr) {
      console.warn('Scraping directo de bcv.org.ve falló, usando mirror:', (directErr as Error).message);
      try {
        // 2. Fallback: Official BCV mirror
        const fallbackData = await fetchBcvFallback();
        cachedBcvResponse = fallbackData;
        cachedBcvFetchedAtMs = Date.now();
        persistLiveBcvToDatabase(fallbackData);
        return fallbackData;
      } catch (fallbackErr) {
        console.warn('Ambas fuentes en vivo fallaron, usando tasa guardada en BD:', fallbackErr);
        const db = readDatabase();
        const currentRate = Number(db.settings?.bcvRate) || 919.82;
        return {
          success: true,
          rate: currentRate,
          rawRate: currentRate,
          date: db.settings?.bcvOfficialDate || db.settings?.bcvLastUpdated || new Date().toLocaleDateString('es-VE'),
          source: 'Base de Datos (Tasa activa guardada)',
          timestamp: db.settings?.bcvSyncedAtISO || new Date().toISOString(),
          isLive: false,
        };
      }
    } finally {
      inFlightBcvPromise = null;
    }
  })();

  return inFlightBcvPromise;
}

// API endpoint to fetch real-time BCV official rate
app.get('/api/bcv', async (req, res) => {
  res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate');
  const force = req.query.force === '1' || req.query.force === 'true';
  const bcvData = await getLatestBcvRate(force);
  return res.json(bcvData);
});

// API endpoint to fetch USDT Binance / parallel reference rate (used by Admin panel)
app.get('/api/usdt', async (_req, res) => {
  try {
    const mirrorRes = await fetch('https://ve.dolarapi.com/v1/dolares/paralelo', {
      headers: { Accept: 'application/json' },
    });
    if (mirrorRes.ok) {
      const json: any = await mirrorRes.json();
      const rateVal = Number(json.promedio || json.venta || json.compra);
      if (Number.isFinite(rateVal) && rateVal > 0) {
        return res.json({
          success: true,
          rate: Math.round(rateVal * 100) / 100,
          rawRate: rateVal,
          date: json.fechaActualizacion || new Date().toISOString(),
          source: 'Referencia USDT Binance / Paralelo',
          timestamp: new Date().toISOString(),
        });
      }
    }
  } catch (err) {
    console.warn('Consulta remota USDT falló, usando valor guardado en BD:', err);
  }

  const db = readDatabase();
  const bcv = Number(db.settings?.bcvRate) || 896.12;
  const currentUsdt = Number(db.settings?.usdtRate) || Math.round(bcv * 1.25 * 100) / 100;
  return res.json({
    success: true,
    rate: currentUsdt,
    rawRate: currentUsdt,
    date: db.settings?.usdtLastUpdated || new Date().toLocaleDateString('es-VE'),
    source: db.settings?.usdtSource || 'Base de Datos (Tasa USDT activa)',
    timestamp: new Date().toISOString(),
  });
});

// Endpoint público para que la tienda online consulte todos los repuestos del catálogo.
// FILTRO ESTRICTO DE VISIBILIDAD: Nunca exponer costos internos, precio_venta_divisa (salePriceRefUSD) ni utilidad_pct.
app.get('/api/products', (req, res) => {
  try {
    const dbData = readDatabase();
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'http' && !host.includes('localhost') ? 'https' : req.protocol;
    const baseUrl = `${protocol}://${host}`;
    const bcvRate = Number(dbData.settings?.bcvRate) || 0;

    const rawProducts = Array.isArray(dbData.products) ? dbData.products : [];
    const products = rawProducts.map((p: any) => {
      let img = p.imageUrl || '';
      if (img.startsWith('/')) {
        img = `${baseUrl}${img}`;
      }
      const rawImageUrls = Array.isArray(p.imageUrls)
        ? p.imageUrls
            .map((u: any) => {
              const s = typeof u === 'string' ? u.trim() : '';
              if (!s) return '';
              return s.startsWith('/') ? `${baseUrl}${s}` : s;
            })
            .filter(Boolean)
        : [];
      const salePrice = Number(p.salePrice) || 0;
      return {
        id: p.id,
        sku: p.sku,
        name: p.name,
        category: p.category,
        description: p.description || '',
        salePrice,
        ...(bcvRate > 0 ? { salePriceBsBcv: Math.round(salePrice * bcvRate * 100) / 100 } : {}),
        tracksInventory: p.tracksInventory !== false,
        ...(p.productionTimeLabel ? { productionTimeLabel: p.productionTimeLabel } : {}),
        ...(p.productionTimeNote ? { productionTimeNote: p.productionTimeNote } : {}),
        stock: Number(p.stock) || 0,
        minStock: Number(p.minStock) || 0,
        brand: p.brand || '',
        compatibility: p.compatibility || '',
        ...(Array.isArray(p.modelCategories) && p.modelCategories.length > 0
          ? { modelCategories: p.modelCategories }
          : {}),
        imageUrl: img,
        ...(rawImageUrls.length > 0 ? { imageUrls: rawImageUrls } : {}),
        barcode: p.barcode || '',
        featured: Boolean(p.featured),
      };
    });
    return res.json(products);
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Endpoint público para que la app secundaria obtenga la configuración de conexión de Firebase Firestore
app.get('/api/firebase-config', (_req, res) => {
  try {
    const configPath = path.resolve(__dirname, 'firebase-applet-config.json');
    if (fs.existsSync(configPath)) {
      const config = JSON.parse(fs.readFileSync(configPath, 'utf-8'));
      return res.json({ success: true, config });
    }
    return res.status(404).json({ success: false, error: 'Firebase no configurado aún' });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});
app.post('/api/auth/register', (req, res) => {
  try {
    const { name, documentId, phone, email, password } = req.body || {};
    if (!name || !name.trim()) {
      return res.status(400).json({ success: false, error: 'El nombre es obligatorio' });
    }
    if (!phone && !email) {
      return res.status(400).json({ success: false, error: 'Debe ingresar un teléfono o correo electrónico' });
    }

    const current = readDatabase();
    const users = Array.isArray(current.users) ? current.users : [];
    const customers = Array.isArray(current.customers) ? current.customers : [];

    const cleanPhone = (phone || '').replace(/\D/g, '');
    const cleanDoc = (documentId || '').trim().toUpperCase();
    const cleanEmail = (email || '').trim().toLowerCase();

    // Check if user already exists
    const existing = users.find((u: any) => {
      if (cleanEmail && u.email && u.email.trim().toLowerCase() === cleanEmail) return true;
      if (cleanPhone && u.phone && u.phone.replace(/\D/g, '') === cleanPhone) return true;
      if (cleanDoc && u.documentId && u.documentId.trim().toUpperCase() === cleanDoc) return true;
      return false;
    });

    if (existing) {
      return res.status(400).json({
        success: false,
        error: 'Ya existe un usuario registrado con este teléfono, cédula o correo. Por favor inicia sesión.',
      });
    }

    const newUser = {
      id: `usr-${Date.now()}`,
      name: name.trim(),
      documentId: cleanDoc || 'V-00000000',
      phone: phone ? phone.trim() : '',
      email: cleanEmail || '',
      password: password || '123456',
      role: 'CLIENTE',
      createdAt: new Date().toISOString(),
    };

    const updatedUsers = [...users, newUser];

    // Also ensure client is saved in customers list for history & orders
    const existingCust = customers.find((c: any) => {
      if (cleanPhone && c.phone && c.phone.replace(/\D/g, '') === cleanPhone) return true;
      if (cleanDoc && c.documentId && c.documentId.trim().toUpperCase() === cleanDoc) return true;
      return false;
    });

    let updatedCustomers = customers;
    if (!existingCust) {
      const newCust = {
        id: `cust-${Date.now()}`,
        name: newUser.name,
        phone: newUser.phone,
        email: newUser.email,
        documentId: newUser.documentId,
        createdAt: new Date().toISOString(),
      };
      updatedCustomers = [newCust, ...customers];
    }

    writeDatabase({ users: updatedUsers, customers: updatedCustomers });

    const safeUser = {
      id: newUser.id,
      name: newUser.name,
      documentId: newUser.documentId,
      phone: newUser.phone,
      email: newUser.email,
      role: newUser.role,
      createdAt: newUser.createdAt,
    };

    return res.json({
      success: true,
      message: 'Usuario registrado con éxito',
      user: safeUser,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/login', (req, res) => {
  try {
    const { identifier, password, cloudAdminUser, cloudStaffUser } = req.body || {};
    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ success: false, error: 'Ingresa tu usuario, correo, teléfono o cédula' });
    }
    if (!password) {
      return res.status(400).json({ success: false, error: 'Ingresa tu contraseña' });
    }

    const current = readDatabase();
    let users = Array.isArray(current.users) ? [...current.users] : [{ ...DEFAULT_ADMIN_USER }];

    // Synchronize admin password hash from shared Firestore cloudAdminUser if newer
    if (
      cloudAdminUser &&
      typeof cloudAdminUser === 'object' &&
      cloudAdminUser.hasCustomPassword &&
      typeof cloudAdminUser.passwordHash === 'string' &&
      cloudAdminUser.passwordHash.startsWith('pbkdf2$')
    ) {
      const adminIdx = users.findIndex(
        (u: any) =>
          u.id === 'usr-admin-1' ||
          u.role === 'ADMIN' ||
          (u.email && u.email.toLowerCase() === 'servimotoscristocentro@gmail.com')
      );
      const localAdmin = adminIdx >= 0 ? users[adminIdx] : null;
      const localTs = localAdmin?.passwordUpdatedAt ? Date.parse(localAdmin.passwordUpdatedAt) : 0;
      const cloudTs = cloudAdminUser.passwordUpdatedAt
        ? Date.parse(cloudAdminUser.passwordUpdatedAt)
        : 0;

      if (!localAdmin || !localAdmin.hasCustomPassword || cloudTs > localTs) {
        const mergedAdmin = {
          ...(localAdmin || DEFAULT_ADMIN_USER),
          role: 'ADMIN',
          password: cloudAdminUser.passwordHash,
          hasCustomPassword: true,
          passwordUpdatedAt: cloudAdminUser.passwordUpdatedAt || new Date().toISOString(),
        };
        if (adminIdx >= 0) {
          users[adminIdx] = mergedAdmin;
        } else {
          users.unshift(mergedAdmin);
        }
        writeDatabase({ users });
      }
    }

    // Synchronize employee account from Firestore if present and newer
    if (
      cloudStaffUser &&
      typeof cloudStaffUser === 'object' &&
      cloudStaffUser.id &&
      cloudStaffUser.role === 'EMPLEADO' &&
      typeof cloudStaffUser.passwordHash === 'string' &&
      cloudStaffUser.passwordHash.startsWith('pbkdf2$')
    ) {
      const idx = users.findIndex((u: any) => u.id === cloudStaffUser.id);
      const mergedStaff = {
        ...(idx >= 0 ? users[idx] : {}),
        ...cloudStaffUser,
        password: cloudStaffUser.passwordHash,
      };
      if (idx >= 0) {
        users[idx] = mergedStaff;
      } else {
        users.push(mergedStaff);
      }
      writeDatabase({ users });
    }

    const cleanInput = identifier.trim().toLowerCase();
    const cleanNumbers = identifier.replace(/\D/g, '');

    // Check special admin shortcut / owner credentials
    const isOwnerAttempt =
      cleanInput === 'servimotoscristocentro@gmail.com' ||
      cleanInput === 'admin' ||
      cleanInput === 'administrador' ||
      cleanNumbers === '04127860509' ||
      cleanNumbers === '4127860509' ||
      cleanNumbers === '584127860509' ||
      cleanNumbers === '19996141';

    // Find user (supports username, email, phone, cédula, or owner shortcut)
    const matchedIdx = users.findIndex((u: any) => {
      const uUsername = (u.username || '').trim().toLowerCase();
      const uEmail = (u.email || '').trim().toLowerCase();
      const uPhone = (u.phone || '').replace(/\D/g, '');
      const uDoc = (u.documentId || '').replace(/\D/g, '');

      if (uUsername && uUsername === cleanInput) return true;
      if (uEmail && uEmail === cleanInput) return true;
      if (cleanNumbers && uPhone && uPhone === cleanNumbers) return true;
      if (cleanNumbers && uDoc && uDoc === cleanNumbers) return true;
      if (u.role === 'ADMIN' && isOwnerAttempt) return true;
      return false;
    });

    if (matchedIdx === -1) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no encontrado. Verifica tu usuario, correo, cédula o teléfono.',
      });
    }

    let matchedUser = users[matchedIdx];

    if (matchedUser.role === 'EMPLEADO' && matchedUser.active === false) {
      return res.status(403).json({
        success: false,
        error: 'Esta cuenta de trabajador está desactivada. Contacta al administrador.',
      });
    }

    // Password check (supports password or passwordHash fields)
    const storedSecret = matchedUser.password || matchedUser.passwordHash || '';
    const isDefaultAdminUnchanged =
      matchedUser.role === 'ADMIN' &&
      !matchedUser.hasCustomPassword &&
      (!storedSecret || storedSecret === 'admin');

    const validPassword =
      verifyPassword(password, storedSecret) ||
      (isDefaultAdminUnchanged && (password === 'admin' || password === 'admin123' || password === '123456'));

    if (!validPassword) {
      return res.status(401).json({ success: false, error: 'Contraseña incorrecta' });
    }

    // Automatically upgrade legacy scrypt$ custom admin password to cross-platform pbkdf2$ so Firestore & published app share it
    if (
      matchedUser.role === 'ADMIN' &&
      matchedUser.hasCustomPassword &&
      typeof matchedUser.password === 'string' &&
      !matchedUser.password.startsWith('pbkdf2$')
    ) {
      const upgradedHash = hashPassword(password);
      matchedUser = {
        ...matchedUser,
        password: upgradedHash,
        passwordUpdatedAt: matchedUser.passwordUpdatedAt || new Date().toISOString(),
      };
      users[matchedIdx] = matchedUser;
      writeDatabase({ users });
    }

    const safeUser = {
      id: matchedUser.id,
      name: matchedUser.name,
      username: matchedUser.username,
      documentId: matchedUser.documentId,
      phone: matchedUser.phone,
      email: matchedUser.email,
      role: matchedUser.role,
      position: matchedUser.position,
      active: matchedUser.active !== false,
      allowedModules: Array.isArray(matchedUser.allowedModules) ? matchedUser.allowedModules : undefined,
      scheduledStartTime: matchedUser.scheduledStartTime,
      scheduledEndTime: matchedUser.scheduledEndTime,
      lateToleranceMinutes: matchedUser.lateToleranceMinutes,
      monthlySalesGoalUSD: matchedUser.monthlySalesGoalUSD,
      linkedTechnicianId: matchedUser.linkedTechnicianId,
      notes: matchedUser.notes,
      lastLoginAt: new Date().toISOString(),
      createdAt: matchedUser.createdAt,
      updatedAt: matchedUser.updatedAt,
      hasCustomPassword: Boolean(matchedUser.hasCustomPassword),
      passwordUpdatedAt: matchedUser.passwordUpdatedAt,
    };

    return res.json({
      success: true,
      message: 'Inicio de sesión exitoso',
      user: safeUser,
      cloudSyncHash:
        matchedUser.role === 'ADMIN' &&
        matchedUser.hasCustomPassword &&
        typeof matchedUser.password === 'string' &&
        matchedUser.password.startsWith('pbkdf2$')
          ? matchedUser.password
          : undefined,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/admin-status', (_req, res) => {
  try {
    const current = readDatabase();
    const users = Array.isArray(current.users) ? current.users : [DEFAULT_ADMIN_USER];
    const adminUser =
      users.find(
        (u: any) =>
          u.role === 'ADMIN' ||
          (u.email && u.email.toLowerCase() === 'servimotoscristocentro@gmail.com')
      ) || DEFAULT_ADMIN_USER;

    return res.json({
      success: true,
      hasCustomPassword: Boolean(adminUser.hasCustomPassword),
      passwordUpdatedAt: adminUser.passwordUpdatedAt || null,
      email: adminUser.email || DEFAULT_ADMIN_USER.email,
      phone: adminUser.phone || DEFAULT_ADMIN_USER.phone,
      documentId: adminUser.documentId || DEFAULT_ADMIN_USER.documentId,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/change-admin-password', (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword, cloudAdminUser } = req.body || {};

    if (!currentPassword || typeof currentPassword !== 'string') {
      return res.status(400).json({ success: false, error: 'Ingresa tu clave administrativa actual.' });
    }
    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
      return res.status(400).json({
        success: false,
        error: 'La nueva clave debe tener al menos 4 caracteres.',
      });
    }
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'La nueva clave y su confirmación no coinciden.',
      });
    }

    const current = readDatabase();
    const users = Array.isArray(current.users) ? [...current.users] : [{ ...DEFAULT_ADMIN_USER }];

    let adminIndex = users.findIndex(
      (u: any) =>
        u.id === 'usr-admin-1' ||
        u.role === 'ADMIN' ||
        (u.email && u.email.toLowerCase() === 'servimotoscristocentro@gmail.com')
    );

    if (adminIndex === -1) {
      users.unshift({ ...DEFAULT_ADMIN_USER });
      adminIndex = 0;
    }

    let adminUser = users[adminIndex];

    // Sync from cloudAdminUser if Firestore holds a newer custom password
    if (
      cloudAdminUser &&
      typeof cloudAdminUser === 'object' &&
      cloudAdminUser.hasCustomPassword &&
      typeof cloudAdminUser.passwordHash === 'string' &&
      cloudAdminUser.passwordHash.startsWith('pbkdf2$')
    ) {
      const localTs = adminUser?.passwordUpdatedAt ? Date.parse(adminUser.passwordUpdatedAt) : 0;
      const cloudTs = cloudAdminUser.passwordUpdatedAt
        ? Date.parse(cloudAdminUser.passwordUpdatedAt)
        : 0;
      if (!adminUser.hasCustomPassword || cloudTs > localTs) {
        adminUser = {
          ...adminUser,
          password: cloudAdminUser.passwordHash,
          hasCustomPassword: true,
          passwordUpdatedAt: cloudAdminUser.passwordUpdatedAt || adminUser.passwordUpdatedAt,
        };
      }
    }

    const isDefaultAdminUnchanged =
      !adminUser.hasCustomPassword && (!adminUser.password || adminUser.password === 'admin');

    const isCurrentValid =
      verifyPassword(currentPassword, adminUser.password) ||
      (cloudAdminUser?.passwordHash ? verifyPassword(currentPassword, cloudAdminUser.passwordHash) : false) ||
      (isDefaultAdminUnchanged &&
        (currentPassword === 'admin' || currentPassword === 'admin123' || currentPassword === '123456'));

    if (!isCurrentValid) {
      return res.status(401).json({
        success: false,
        error: 'La clave actual es incorrecta. Verifícala e intenta de nuevo.',
      });
    }

    const nowIso = new Date().toISOString();
    const newHash = hashPassword(newPassword);
    const updatedAdmin = {
      ...adminUser,
      role: 'ADMIN',
      password: newHash,
      hasCustomPassword: true,
      passwordUpdatedAt: nowIso,
    };

    users[adminIndex] = updatedAdmin;
    const saved = writeDatabase({ users });
    if (!saved) {
      return res.status(500).json({
        success: false,
        error: 'No se pudo guardar la nueva clave en el servidor.',
      });
    }

    const safeUser = {
      id: updatedAdmin.id,
      name: updatedAdmin.name,
      documentId: updatedAdmin.documentId,
      phone: updatedAdmin.phone,
      email: updatedAdmin.email,
      role: updatedAdmin.role,
      createdAt: updatedAdmin.createdAt,
      hasCustomPassword: true,
      passwordUpdatedAt: nowIso,
    };

    return res.json({
      success: true,
      message: '¡Clave administrativa actualizada correctamente!',
      user: safeUser,
      passwordHash: newHash,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/auth/reset-admin-password', (req, res) => {
  try {
    const { email, documentId, phone, newPassword, confirmPassword } = req.body || {};

    if (!newPassword || typeof newPassword !== 'string' || newPassword.trim().length < 4) {
      return res.status(400).json({
        success: false,
        error: 'La nueva clave debe tener al menos 4 caracteres.',
      });
    }
    if (confirmPassword !== undefined && newPassword !== confirmPassword) {
      return res.status(400).json({
        success: false,
        error: 'La nueva clave y su confirmación no coinciden.',
      });
    }

    const current = readDatabase();
    const settings = current.settings || INITIAL_SETTINGS;

    const cleanEmail = String(email || '').trim().toLowerCase();
    const allowedEmails = new Set<string>(['servimotoscristocentro@gmail.com']);
    if (settings?.email) allowedEmails.add(String(settings.email).trim().toLowerCase());
    if (!cleanEmail || !allowedEmails.has(cleanEmail)) {
      return res.status(403).json({
        success: false,
        error: 'El correo electrónico no coincide con el correo administrativo registrado.',
      });
    }

    const docDigits = String(documentId || '').replace(/\D/g, '');
    const allowedDocDigits = new Set<string>(['19996141']);
    if (settings?.rif) {
      const rifDigits = String(settings.rif).replace(/\D/g, '');
      if (rifDigits.length >= 6) {
        allowedDocDigits.add(rifDigits);
        if (rifDigits.length > 8) allowedDocDigits.add(rifDigits.slice(0, 8));
      }
    }
    if (
      !docDigits ||
      !Array.from(allowedDocDigits).some(
        (d) => docDigits === d || docDigits.startsWith(d) || d.startsWith(docDigits)
      )
    ) {
      return res.status(403).json({
        success: false,
        error: 'La Cédula o RIF no coincide con el documento del propietario registrado.',
      });
    }

    const normTail = (v?: string) => {
      const digits = String(v || '').replace(/\D/g, '');
      return digits.length >= 10 ? digits.slice(-10) : digits;
    };
    const phoneTail = normTail(phone);
    const allowedPhones = new Set<string>(['4127860509']);
    if (settings?.phone) {
      const t = normTail(settings.phone);
      if (t.length >= 7) allowedPhones.add(t);
    }
    if (settings?.whatsapp) {
      const t = normTail(settings.whatsapp);
      if (t.length >= 7) allowedPhones.add(t);
    }
    if (!phoneTail || !allowedPhones.has(phoneTail)) {
      return res.status(403).json({
        success: false,
        error: 'El teléfono no coincide con el teléfono del propietario registrado.',
      });
    }

    const users = Array.isArray(current.users) ? [...current.users] : [{ ...DEFAULT_ADMIN_USER }];
    let adminIndex = users.findIndex(
      (u: any) =>
        u.id === 'usr-admin-1' ||
        u.role === 'ADMIN' ||
        (u.email && u.email.toLowerCase() === 'servimotoscristocentro@gmail.com')
    );
    if (adminIndex === -1) {
      users.unshift({ ...DEFAULT_ADMIN_USER });
      adminIndex = 0;
    }

    const nowIso = new Date().toISOString();
    const newHash = hashPassword(newPassword);
    const updatedAdmin = {
      ...users[adminIndex],
      id: 'usr-admin-1',
      role: 'ADMIN',
      password: newHash,
      hasCustomPassword: true,
      passwordUpdatedAt: nowIso,
    };

    users[adminIndex] = updatedAdmin;
    writeDatabase({ users });

    const safeUser = {
      id: updatedAdmin.id,
      name: updatedAdmin.name,
      documentId: updatedAdmin.documentId,
      phone: updatedAdmin.phone,
      email: updatedAdmin.email,
      role: updatedAdmin.role,
      createdAt: updatedAdmin.createdAt,
      hasCustomPassword: true,
      passwordUpdatedAt: nowIso,
    };

    return res.json({
      success: true,
      message: '¡Clave administrativa restablecida correctamente!',
      user: safeUser,
      passwordHash: newHash,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.get('/api/auth/users', (_req, res) => {
  try {
    const current = readDatabase();
    const users = (Array.isArray(current.users) ? current.users : []).map((u: any) => ({
      id: u.id,
      name: u.name,
      documentId: u.documentId,
      phone: u.phone,
      email: u.email,
      role: u.role,
      createdAt: u.createdAt,
    }));
    return res.json({ success: true, users });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Helper to compute highest FACT-YYYY-NNNN sequence without transferring full history
function computeMaxInvoiceSeq(salesList: any[]): number {
  let maxSeq = 100;
  if (!Array.isArray(salesList)) return maxSeq;
  for (let i = 0; i < salesList.length; i++) {
    const match = String(salesList[i]?.invoiceNumber || '').match(/FACT-\d+-(\d+)/);
    if (match) {
      const seq = parseInt(match[1], 10);
      if (Number.isFinite(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  return maxSeq;
}

// API endpoints for persistent application database (products, customers, settings, sales, orders)
app.get('/api/data', (req, res) => {
  try {
    const dbData = readDatabase();
    // Never expose raw password or passwordHash fields in the general /api/data payload
    const safeUsers = (Array.isArray(dbData.users) ? dbData.users : []).map(
      ({ password: _pw, passwordHash: _ph, ...safe }: any) => safe
    );
    const excludeSales = req.query.excludeSales === '1' || req.query.excludeSales === 'true';
    const allSales = Array.isArray(dbData.sales) ? dbData.sales : [];
    const latestInvoiceSeq = computeMaxInvoiceSeq(allSales);

    if (excludeSales) {
      const { sales: _omittedSales, ...rest } = dbData;
      return res.json({
        success: true,
        data: {
          ...rest,
          latestInvoiceSeq,
          totalSalesCount: allSales.length,
          users: safeUsers,
        },
      });
    }

    return res.json({
      success: true,
      data: {
        ...dbData,
        latestInvoiceSeq,
        totalSalesCount: allSales.length,
        users: safeUsers,
      },
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Lightweight on-demand endpoint returning ONLY the latest N invoices (for POS quick lookup)
app.get('/api/sales/recent', (req, res) => {
  try {
    const dbData = readDatabase();
    const deletedSalesSet = new Set(dbData.deletedIds?.sales || []);
    const rawLimit = parseInt(String(req.query.limit || '15'), 10);
    const limitCount = Number.isFinite(rawLimit) ? Math.min(Math.max(rawLimit, 1), 100) : 15;
    const rawOffset = parseInt(String(req.query.offset || '0'), 10);
    const offset = Number.isFinite(rawOffset) && rawOffset > 0 ? rawOffset : 0;
    const search = String(req.query.search || '').trim().toLowerCase();

    const cleanSales = (Array.isArray(dbData.sales) ? dbData.sales : [])
      .filter((s: any) => s && s.id && !deletedSalesSet.has(s.id))
      .sort((a: any, b: any) => String(b.createdAt || '').localeCompare(String(a.createdAt || '')));

    const latestInvoiceSeq = computeMaxInvoiceSeq(cleanSales);

    const filtered = search
      ? cleanSales.filter((s: any) => {
          const inv = String(s.invoiceNumber || '').toLowerCase();
          const name = String(s.customerName || '').toLowerCase();
          const docId = String(s.customerDocument || '').toLowerCase();
          const phone = String(s.customerPhone || '').toLowerCase();
          return (
            inv.includes(search) ||
            name.includes(search) ||
            docId.includes(search) ||
            phone.includes(search)
          );
        })
      : cleanSales;

    const slice = filtered.slice(offset, offset + limitCount);
    return res.json({
      success: true,
      sales: slice,
      totalCount: filtered.length,
      hasMore: offset + slice.length < filtered.length,
      latestInvoiceSeq,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/data', (req, res) => {
  try {
    let payload = req.body;
    if (typeof payload === 'string') {
      try {
        payload = JSON.parse(payload);
      } catch {
        return res.status(400).json({ success: false, error: 'JSON inválido' });
      }
    }
    if (!payload || typeof payload !== 'object') {
      return res.status(400).json({ success: false, error: 'Payload inválido' });
    }
    const success = writeDatabase(payload, false, true);
    if (success) {
      return res.json({ success: true, message: 'Datos guardados correctamente en el servidor' });
    } else {
      return res.status(500).json({ success: false, error: 'Error al escribir en la base de datos' });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Direct atomic sales operations to guarantee instant disk persistence
app.post('/api/sales', (req, res) => {
  try {
    let sale = req.body;
    if (typeof sale === 'string') {
      try {
        sale = JSON.parse(sale);
      } catch {
        return res.status(400).json({ success: false, error: 'JSON inválido' });
      }
    }
    if (!sale || !sale.id) {
      return res.status(400).json({ success: false, error: 'Venta inválida' });
    }
    const current = readDatabase();
    const existingIndex = current.sales.findIndex((s) => s.id === sale.id);
    let updatedSales: any[];
    if (existingIndex >= 0) {
      updatedSales = current.sales.map((s, idx) => (idx === existingIndex ? sale : s));
    } else {
      updatedSales = [sale, ...current.sales];
    }
    writeDatabase({ sales: updatedSales });
    return res.json({ success: true, message: 'Venta guardada en la base de datos', sale });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.put('/api/sales/:id', (req, res) => {
  try {
    const saleId = req.params.id;
    let updates = req.body;
    if (typeof updates === 'string') {
      try {
        updates = JSON.parse(updates);
      } catch {
        return res.status(400).json({ success: false, error: 'JSON inválido' });
      }
    }
    const current = readDatabase();
    const existingIndex = current.sales.findIndex((s) => s.id === saleId);
    if (existingIndex < 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    const updatedSale = { ...current.sales[existingIndex], ...updates };
    const updatedSales = current.sales.map((s, idx) => (idx === existingIndex ? updatedSale : s));
    writeDatabase({ sales: updatedSales });
    return res.json({ success: true, message: 'Venta actualizada', sale: updatedSale });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Delete a sale permanently from database disk file
app.delete('/api/sales/:id', (req, res) => {
  try {
    const saleId = req.params.id;
    const current = readDatabase();
    const existing = current.sales.find((s) => s.id === saleId);
    const updatedSales = current.sales.filter((s) => s.id !== saleId);
    const updatedDeletedIds = mergeDeletedIds(current.deletedIds, { sales: [saleId] });
    writeDatabase({ sales: updatedSales, deletedIds: updatedDeletedIds });
    return res.json({
      success: true,
      message: 'Venta eliminada permanentemente de la base de datos',
      saleId,
      existed: Boolean(existing),
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Anular (Void) a sale / credit invoice without losing history
app.post('/api/sales/void/:id', (req, res) => {
  try {
    const saleId = req.params.id;
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {}
    }
    const { reason, restoreStock } = body;
    const current = readDatabase();
    const existingIndex = current.sales.findIndex((s) => s.id === saleId);
    if (existingIndex < 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    const sale = current.sales[existingIndex];
    const updatedSale = {
      ...sale,
      creditStatus: 'ANULADO',
      isVoided: true,
      voidedAt: new Date().toISOString(),
      voidReason: reason || 'Anulada por usuario / cuenta no reconocida',
    };
    const updatedSales = current.sales.map((s, idx) => (idx === existingIndex ? updatedSale : s));

    // Restore stock if requested
    let updatedProducts = current.products;
    if (restoreStock && Array.isArray(sale.items)) {
      updatedProducts = current.products.map((p) => {
        if (p.tracksInventory === false) return p;
        const item = sale.items.find((it: any) => it.productId === p.id || it.sku === p.sku);
        if (item && !item.isService) {
          return { ...p, stock: p.stock + (item.quantity || 1) };
        }
        return p;
      });
    }

    writeDatabase({ sales: updatedSales, products: updatedProducts });
    return res.json({
      success: true,
      message: 'Factura / cuenta anulada con éxito',
      sale: updatedSale,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Reactivate a voided sale if needed
app.post('/api/sales/reactivate/:id', (req, res) => {
  try {
    const saleId = req.params.id;
    const current = readDatabase();
    const existingIndex = current.sales.findIndex((s) => s.id === saleId);
    if (existingIndex < 0) {
      return res.status(404).json({ success: false, error: 'Venta no encontrada' });
    }
    const sale = current.sales[existingIndex];
    const isPaid = (sale.creditPaidAmount || 0) >= sale.total;
    const updatedSale = {
      ...sale,
      creditStatus: isPaid ? 'PAGADO' : 'PENDIENTE',
      isVoided: false,
      voidedAt: undefined,
      voidReason: undefined,
    };
    const updatedSales = current.sales.map((s, idx) => (idx === existingIndex ? updatedSale : s));
    writeDatabase({ sales: updatedSales });
    return res.json({
      success: true,
      message: 'Venta reactivada con éxito',
      sale: updatedSale,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Bulk purge/anulate credit sales
app.post('/api/sales/clear-credit-sales', (req, res) => {
  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {}
    }
    const { saleIds, action } = body;
    const current = readDatabase();
    let updatedSales: any[];

    const removedIds: string[] = [];
    if (Array.isArray(saleIds) && saleIds.length > 0) {
      const idSet = new Set(saleIds);
      if (action === 'VOID') {
        updatedSales = current.sales.map((s) => {
          if (idSet.has(s.id)) {
            return {
              ...s,
              creditStatus: 'ANULADO',
              isVoided: true,
              voidedAt: new Date().toISOString(),
              voidReason: 'Anulada en lote por usuario',
            };
          }
          return s;
        });
      } else {
        // DELETE
        updatedSales = current.sales.filter((s) => {
          if (idSet.has(s.id)) {
            removedIds.push(s.id);
            return false;
          }
          return true;
        });
      }
    } else {
      // Delete all credit sales
      updatedSales = current.sales.filter((s) => {
        if (s.paymentType === 'CREDITO' || s.paymentType === 'APARTADO') {
          removedIds.push(s.id);
          return false;
        }
        return true;
      });
    }

    const updatedDeletedIds =
      removedIds.length > 0
        ? mergeDeletedIds(current.deletedIds, { sales: removedIds })
        : current.deletedIds;

    writeDatabase({ sales: updatedSales, deletedIds: updatedDeletedIds });
    return res.json({
      success: true,
      message: 'Cuentas por cobrar procesadas con éxito',
      count: current.sales.length - updatedSales.length,
      sales: updatedSales,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

app.post('/api/data/reset', (_req, res) => {
  try {
    const initial = getInitialDatabase();
    const success = writeDatabase(initial, true);
    if (success) {
      return res.json({ success: true, message: 'Base de datos restablecida a valores iniciales', data: initial });
    } else {
      return res.status(500).json({ success: false, error: 'Error al restablecer la base de datos' });
    }
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

function extractDriveIdForServer(rawUrl: string): string | null {
  if (!rawUrl) return null;
  const trimmed = rawUrl.trim();
  const matchFileD = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFileD?.[1]) return matchFileD[1];
  const matchId = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchId?.[1]) return matchId[1];
  const matchD = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (matchD?.[1]) return matchD[1];
  return null;
}

function isDriveHostForServer(rawUrl: string): boolean {
  const lower = rawUrl.toLowerCase();
  return (
    lower.includes('drive.google.com') ||
    lower.includes('docs.google.com') ||
    lower.includes('googleusercontent.com')
  );
}

async function probeImageCandidate(url: string): Promise<{ ok: boolean; contentType: string; status: number }> {
  try {
    const response = await fetch(url, {
      method: 'GET',
      redirect: 'follow',
      signal: AbortSignal.timeout(4500),
      headers: {
        'User-Agent': 'Mozilla/5.0 (compatible; ServimotosImageChecker/1.0)',
      },
    });
    const contentType = (response.headers.get('content-type') || '').toLowerCase();
    try {
      await response.body?.cancel();
    } catch {}
    return {
      ok: response.ok && contentType.startsWith('image/'),
      contentType,
      status: response.status,
    };
  } catch {
    return { ok: false, contentType: '', status: 0 };
  }
}

async function checkPublicImageAccessibility(
  rawUrl: string
): Promise<{ public: boolean; reason: string; workingUrl?: string }> {
  const trimmed = (rawUrl || '').trim();
  if (!trimmed) {
    return { public: false, reason: 'empty' };
  }
  if (trimmed.startsWith('data:image/')) {
    return { public: true, reason: 'embedded_data_url', workingUrl: trimmed };
  }
  if (trimmed.startsWith('/') || trimmed.startsWith('assets/')) {
    return { public: true, reason: 'bundled_asset', workingUrl: trimmed };
  }
  if (!/^https?:\/\//i.test(trimmed)) {
    return { public: false, reason: 'invalid_url' };
  }

  if (isDriveHostForServer(trimmed)) {
    const driveId = extractDriveIdForServer(trimmed);
    if (!driveId) {
      return { public: false, reason: 'invalid_drive_link' };
    }
    const candidates = [
      `https://lh3.googleusercontent.com/d/${driveId}`,
      `https://drive.google.com/thumbnail?id=${driveId}&sz=w1000`,
    ];
    for (const candidate of candidates) {
      const probe = await probeImageCandidate(candidate);
      if (probe.ok) {
        return { public: true, reason: 'public_drive_image', workingUrl: candidate };
      }
    }
    return { public: false, reason: 'private_google_drive' };
  }

  const probe = await probeImageCandidate(trimmed);
  if (probe.ok) {
    return { public: true, reason: 'public_image', workingUrl: trimmed };
  }
  return {
    public: false,
    reason: probe.status ? `http_${probe.status}` : 'unreachable',
  };
}

// Single image public visibility check (runs unauthenticated from server)
app.get('/api/utils/check-image', async (req, res) => {
  try {
    const url = typeof req.query.url === 'string' ? req.query.url : '';
    if (!url) {
      return res.status(400).json({ success: false, error: 'Falta parámetro url' });
    }
    const result = await checkPublicImageAccessibility(url);
    return res.json({ success: true, url, ...result });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

// Batch image public visibility check for inventory diagnostics
app.post('/api/utils/check-images', async (req, res) => {
  try {
    let body = req.body || {};
    if (typeof body === 'string') {
      try {
        body = JSON.parse(body);
      } catch {}
    }
    const rawUrls: string[] = Array.isArray(body.urls) ? body.urls : [];
    const uniqueUrls = Array.from(
      new Set(
        rawUrls
          .filter((u) => typeof u === 'string' && u.trim().length > 0)
          .map((u) => u.trim())
      )
    ).slice(0, 80);

    const results: Record<string, { public: boolean; reason: string; workingUrl?: string }> = {};
    const CONCURRENCY = 8;
    for (let i = 0; i < uniqueUrls.length; i += CONCURRENCY) {
      const batch = uniqueUrls.slice(i, i + CONCURRENCY);
      const batchResults = await Promise.all(
        batch.map(async (u) => ({ url: u, res: await checkPublicImageAccessibility(u) }))
      );
      for (const item of batchResults) {
        results[item.url] = item.res;
      }
    }

    const values = Object.values(results);
    const publicCount = values.filter((r) => r.public).length;
    const privateCount = values.filter((r) => !r.public).length;

    return res.json({
      success: true,
      summary: { total: values.length, publicCount, privateCount },
      results,
    });
  } catch (err: any) {
    return res.status(500).json({ success: false, error: err.message });
  }
});

async function startServer() {
  // Ensure database exists on disk immediately
  try {
    readDatabase();
  } catch (err) {
    console.warn('Warning initializing local database at startup:', err);
  }

  const isProd = process.env.NODE_ENV === 'production';
  const httpServer = http.createServer(app);
  let viteServer: Awaited<ReturnType<typeof createViteServer>> | null = null;

  if (!isProd) {
    viteServer = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR === 'true' ? false : { server: httpServer },
      },
      appType: 'spa',
    });
    app.use(viteServer.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  httpServer.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
    // Immediately sync live official BCV rate at startup and poll bcv.org.ve every 10 minutes
    getLatestBcvRate(true).catch(() => {});
  });

  const bcvInterval = setInterval(() => {
    getLatestBcvRate(true).catch(() => {});
  }, BCV_BACKGROUND_POLL_MS);
  bcvInterval.unref();

  const shutdown = async () => {
    clearInterval(bcvInterval);
    try {
      if (viteServer) await viteServer.close();
    } catch {}
    httpServer.close(() => process.exit(0));
    setTimeout(() => process.exit(0), 2000).unref();
  };

  process.once('SIGTERM', shutdown);
  process.once('SIGINT', shutdown);
}

startServer().catch((err) => {
  console.error('Fatal server startup error:', err);
  process.exit(1);
});
