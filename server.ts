import express from 'express';
import cors from 'cors';
import { createServer as createViteServer } from 'vite';
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
        users: guaranteedUsers,
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

    const updated: AppDatabase = {
      ...current,
      ...data,
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
}

// Scrape official BCV rate directly from https://www.bcv.org.ve/
async function scrapeBcvOfficial(): Promise<BcvRateResponse> {
  return new Promise((resolve, reject) => {
    const agent = new https.Agent({
      rejectUnauthorized: false, // BCV SSL chain frequently has issues
    });

    const options = {
      hostname: 'www.bcv.org.ve',
      port: 443,
      path: '/',
      method: 'GET',
      agent,
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
        Accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8',
        'Accept-Language': 'es-ES,es;q=0.9,en;q=0.8',
        'Cache-Control': 'no-cache',
      },
      timeout: 6000,
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.setEncoding('utf8');

      res.on('data', (chunk) => {
        data += chunk;
      });

      res.on('end', () => {
        try {
          // Extract dollar rate from <div id="dolar"...>...<strong ...>889,57540000</strong>
          const dollarMatch = data.match(/id=["']dolar["'][\s\S]*?<strong[^>]*>\s*([0-9]+[.,][0-9]+)\s*<\/strong>/i);
          
          // Extract official value date: Fecha Valor: <span class="date-display-single"...>Lunes, 02 Noviembre 2026</span>
          const dateMatch = data.match(/Fecha Valor:[\s\S]*?<span[^>]*class=["'][^"']*date-display-single[^"']*["'][^>]*>([^<]+)<\/span>/i);

          if (dollarMatch && dollarMatch[1]) {
            const rawRateStr = dollarMatch[1].replace(/\./g, '').replace(',', '.');
            const numericRate = parseFloat(rawRateStr);

            if (!isNaN(numericRate) && numericRate > 0) {
              const valueDate = dateMatch ? dateMatch[1].trim().replace(/\s+/g, ' ') : new Date().toLocaleDateString('es-VE');
              return resolve({
                success: true,
                rate: Math.round(numericRate * 100) / 100,
                rawRate: numericRate,
                date: valueDate,
                source: 'Banco Central de Venezuela (bcv.org.ve)',
                timestamp: new Date().toISOString(),
              });
            }
          }
          reject(new Error('No se pudo extraer la tasa del HTML de bcv.org.ve'));
        } catch (err) {
          reject(err);
        }
      });
    });

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

// Fallback using DolarApi (mirrors official BCV with CORS)
async function fetchBcvFallback(): Promise<BcvRateResponse> {
  const response = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    throw new Error(`DolarApi error HTTP ${response.status}`);
  }

  const json = await response.json();
  const rate = json.promedio || json.venta || json.compra;

  if (!rate || isNaN(rate)) {
    throw new Error('Respuesta inválida de mirror BCV');
  }

  return {
    success: true,
    rate: Math.round(rate * 100) / 100,
    rawRate: rate,
    date: json.fechaActualizacion || new Date().toISOString(),
    source: 'Banco Central de Venezuela (BCV Oficial vía Mirror)',
    timestamp: new Date().toISOString(),
  };
}

// API endpoint to fetch real-time BCV official rate
app.get('/api/bcv', async (_req, res) => {
  try {
    // 1. Try direct BCV scrape
    const bcvData = await scrapeBcvOfficial();
    return res.json(bcvData);
  } catch (directErr) {
    console.warn('Scraping directo de bcv.org.ve falló, usando mirror:', (directErr as Error).message);
    try {
      // 2. Fallback to BCV mirror
      const fallbackData = await fetchBcvFallback();
      return res.json(fallbackData);
    } catch (fallbackErr) {
      console.warn('Ambas fuentes en vivo fallaron, usando tasa guardada en BD:', fallbackErr);
      const db = readDatabase();
      const currentRate = db.settings?.bcvRate || 901.62;
      return res.json({
        success: true,
        rate: currentRate,
        rawRate: currentRate,
        date: db.settings?.bcvLastUpdated || new Date().toLocaleDateString('es-VE'),
        source: 'Base de Datos (Tasa activa guardada)',
        timestamp: new Date().toISOString(),
      });
    }
  }
});

// Endpoint público para que la tienda online consulte todos los repuestos del catálogo
app.get('/api/products', (req, res) => {
  try {
    const dbData = readDatabase();
    const host = req.get('host') || 'localhost:3000';
    const protocol = req.protocol === 'http' && !host.includes('localhost') ? 'https' : req.protocol;
    const baseUrl = `${protocol}://${host}`;

    const rawProducts = Array.isArray(dbData.products) ? dbData.products : [];
    const products = rawProducts.map((p) => {
      let img = p.imageUrl || '';
      if (img.startsWith('/')) {
        img = `${baseUrl}${img}`;
      }
      return {
        ...p,
        imageUrl: img,
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
    const { identifier, password, cloudAdminUser } = req.body || {};
    if (!identifier || !identifier.trim()) {
      return res.status(400).json({ success: false, error: 'Ingresa tu correo, teléfono o cédula' });
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

    // Find user
    const matchedIdx = users.findIndex((u: any) => {
      const uEmail = (u.email || '').trim().toLowerCase();
      const uPhone = (u.phone || '').replace(/\D/g, '');
      const uDoc = (u.documentId || '').replace(/\D/g, '');

      if (uEmail && uEmail === cleanInput) return true;
      if (cleanNumbers && uPhone && uPhone === cleanNumbers) return true;
      if (cleanNumbers && uDoc && uDoc === cleanNumbers) return true;
      if (u.role === 'ADMIN' && isOwnerAttempt) return true;
      return false;
    });

    if (matchedIdx === -1) {
      return res.status(401).json({
        success: false,
        error: 'Usuario no encontrado. Verifica tu correo, cédula o teléfono, o regístrate.',
      });
    }

    let matchedUser = users[matchedIdx];

    // Password check
    const isDefaultAdminUnchanged =
      matchedUser.role === 'ADMIN' &&
      !matchedUser.hasCustomPassword &&
      (!matchedUser.password || matchedUser.password === 'admin');

    const validPassword =
      verifyPassword(password, matchedUser.password) ||
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
      documentId: matchedUser.documentId,
      phone: matchedUser.phone,
      email: matchedUser.email,
      role: matchedUser.role,
      createdAt: matchedUser.createdAt,
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

// API endpoints for persistent application database (products, customers, settings, sales, orders)
app.get('/api/data', (_req, res) => {
  try {
    const dbData = readDatabase();
    return res.json({ success: true, data: dbData });
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
  readDatabase();

  const isProd = process.env.NODE_ENV === 'production';

  if (!isProd) {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
