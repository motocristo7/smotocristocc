export type UserRole = 'ADMIN' | 'CLIENTE';

export interface AppUser {
  id: string;
  name: string;
  documentId: string; // Cédula (V- / E-)
  phone: string; // WhatsApp / Móvil
  email?: string;
  role: UserRole;
  createdAt: string;
  hasCustomPassword?: boolean;
  passwordUpdatedAt?: string;
  passwordHash?: string;
}

export type DefaultProductCategory =
  | 'Frenos'
  | 'Motor'
  | 'Transmisión'
  | 'Suspensión'
  | 'Eléctrico'
  | 'Llantas'
  | 'Tapicería'
  | 'Accesorios'
  | 'Lubricantes';

export const DEFAULT_PRODUCT_CATEGORIES: DefaultProductCategory[] = [
  'Frenos',
  'Motor',
  'Transmisión',
  'Suspensión',
  'Eléctrico',
  'Llantas',
  'Tapicería',
  'Accesorios',
  'Lubricantes',
];

export type ProductCategory = DefaultProductCategory | (string & {});

export const DEFAULT_MOTORCYCLE_MODEL_CATEGORIES: string[] = [
  'Supershadow 250 / Virago XV250',
  'MD Gavilán / Halcón (CBF150)',
  'GR250',
  'Honda Falcon 400',
  'DR650',
  'KLR',
  'Honda Rebel 250 / King / Keen',
  'DT Bera',
  'Kavak 150 Bera',
  'Lechuza',
  'UM DSR',
];

export type ProductCostOrigin = 'DIVISAS' | 'BS_BCV';

export const DEFAULT_PRODUCTION_TIME_LABEL = '12 a 24 horas';
export const DEFAULT_PRODUCTION_TIME_NOTE =
  'Fabricación bajo pedido: tiempo estimado de 12 a 24 horas (sujeto a posibles retrasos por cortes de energía eléctrica).';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  description: string;
  costPrice: number; // Costo base en USD (nominal BCV si origen es BS_BCV, o directo en divisas si DIVISAS)
  costCurrencyOrigin?: ProductCostOrigin; // 'DIVISAS' (USD/USDT) | 'BS_BCV' (cotizado en Bs a tasa BCV)
  costPriceBs?: number; // Costo registrado en Bs (cuando origen es BS_BCV) o equivalente en Bs
  referenceCostUSD?: number; // Costo de referencia en divisas ajustado por brecha BCV/USDT (Solo Admin)
  salePrice: number; // Precio comercial USD-BCV (precio_venta_bs_bcv / tasa_bcv) usado en tienda y facturación
  salePriceRefUSD?: number; // SOLO ADMIN: Precio de venta de referencia en divisas (nunca visible en tienda ni facturas)
  salePriceBsBcv?: number; // Precio de venta comercial en Bs a tasa BCV (sincronizado con tasa_bcv)
  targetProfitPct?: number; // SOLO ADMIN: % de utilidad objetivo guardado para referencia interna
  tracksInventory?: boolean; // true/undefined = usa control de stock físico; false = sin inventario (fabricación bajo pedido)
  productionTimeLabel?: string; // Ej. "12 a 24 horas" (visible en tienda cuando tracksInventory === false)
  productionTimeNote?: string; // Aviso al cliente sobre tiempo de fabricación y posibles retrasos por cortes de luz
  stock: number;
  minStock: number;
  brand: string;
  compatibility: string; // e.g., "Yamaha NMAX, BWS 125, Pulsar NS200, Universal"
  modelCategories?: string[]; // Categorías de modelos de motos especializados para filtro en tienda online
  imageUrl: string;
  imageUrls?: string[]; // Galería de múltiples fotos del repuesto (la primera coincide con imageUrl)
  barcode?: string; // Código de barra / EAN / UPC
  warehouseLocation?: string; // Ubicación física en almacén (ej. Estante A-3, Pasillo 2)
  featured?: boolean;
}

export function productTracksInventory(
  product?: Pick<Product, 'tracksInventory'> | null
): boolean {
  return product?.tracksInventory !== false;
}

export interface Customer {
  id: string;
  name: string;
  phone: string; // Used for WhatsApp notifications & portal lookup (e.g. 0414-1234567)
  email?: string;
  documentId?: string; // Cédula (V- / E-) o RIF (J-)
  state?: string; // Estado de Venezuela
  city?: string; // Ciudad de Venezuela
  address?: string;
  createdAt: string;
  notes?: string;
}

export interface Motorcycle {
  plate: string; // Placa venezolana (ej: AB1C23D o AE8C90G)
  brand: string; // e.g. Yamaha, Bajaj, Honda, Suzuki, Empire Keeway, Bera, Ava
  model: string; // e.g. Bera SBR, Empire Horse, Arsen, Outlook, FZ, TX 200
  year?: number;
  color: string;
  mileage: number; // Kilometraje
}

export interface SaleItem {
  productId?: string;
  sku?: string;
  name: string;
  category?: string;
  quantity: number;
  unitPrice: number; // In USD ($)
  total: number; // In USD ($)
  isService?: boolean;
  isMadeToOrder?: boolean;
  productionTimeLabel?: string;
  productionTimeNote?: string;
  imageUrl?: string;
}

export type PaymentMethod = 
  | 'Pago Móvil'
  | 'Efectivo Bs'
  | 'Dólares Efectivo (USD)'
  | 'Transferencia Bancaria Bs'
  | 'Punto de Venta (Bs)'
  | 'Binance Pay (USDT)';

export type SalePaymentType = 'CONTADO' | 'CREDITO' | 'APARTADO' | 'MERCADOLIBRE' | 'MIXTO';
export type SaleCreditStatus = 'PENDIENTE' | 'PAGADO' | 'ANULADO';

export type PagoMovilAccountOption = 'BANESCO_PERSONAL' | 'PROVINCIAL';

export type SaleSplitCondition = 'CONTADO' | 'CREDITO';

export interface SalePaymentSplit {
  id: string;
  splitType?: SaleSplitCondition; // 'CONTADO' (default, ingresa a Tesorería) o 'CREDITO' (genera Cuenta por Cobrar)
  paymentMethod: PaymentMethod;
  amountUSD: number;
  amountBs: number;
  pagoMovilAccount?: PagoMovilAccountOption;
  treasuryAccountId?: string;
  treasuryAccountName?: string;
  treasuryMovementId?: string;
  reference?: string;
}

export function isSaleWithCredit(
  sale: Pick<Sale, 'paymentType' | 'paymentSplits' | 'creditStatus'> | null | undefined
): boolean {
  if (!sale) return false;
  if (sale.paymentType === 'CREDITO' || sale.paymentType === 'APARTADO') return true;
  if (sale.paymentType === 'MIXTO') {
    if (
      Array.isArray(sale.paymentSplits) &&
      sale.paymentSplits.some(
        (sp) => sp.splitType === 'CREDITO' && (Number(sp.amountUSD) || 0) > 0
      )
    ) {
      return true;
    }
    if (sale.creditStatus === 'PENDIENTE') return true;
  }
  return false;
}

export type PaymentCurrencyMode = 'BS' | 'USD';

export interface CreditPaymentRecord {
  id: string;
  date: string; // ISO string
  amountUSD: number;
  amountBs: number;
  currencyMode?: PaymentCurrencyMode; // Moneda en la que se recibió el abono ('BS' o 'USD')
  bcvRate?: number; // Tasa BCV aplicada al registrar este abono
  paymentMethod: PaymentMethod;
  pagoMovilAccount?: PagoMovilAccountOption;
  treasuryAccountId?: string;
  treasuryAccountName?: string;
  treasuryMovementId?: string;
  reference?: string;
  notes?: string;
}

export interface Sale {
  id: string;
  invoiceNumber: string; // e.g., FACT-2026-0012
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerDocument?: string;
  items: SaleItem[];
  subtotal: number; // in USD
  discount: number; // in USD
  tax: number; // in USD
  total: number; // in USD
  bcvRate: number; // Tasa oficial BCV aplicada (Bs. / USD)
  subtotalBs: number; // in Bs.
  totalBs: number; // in Bs.
  paymentMethod: PaymentMethod;
  pagoMovilAccount?: PagoMovilAccountOption; // Cuenta destino cuando paymentMethod === 'Pago Móvil'
  treasuryAccountId?: string; // Cuenta de Tesorería donde ingresó el pago
  treasuryAccountName?: string; // Nombre de la cuenta de Tesorería (ej. Banesco Personal, Provincial, Banesco SMCC)
  treasuryMovementId?: string; // ID del movimiento de ingreso registrado en Tesorería
  paymentSplits?: SalePaymentSplit[]; // Desglose de pagos cuando paymentType === 'MIXTO'
  notes?: string;
  createdAt: string; // ISO date
  source: 'POS' | 'TIENDA_ONLINE';

  // Modalidad de pago: De Contado, Pago Mixto, A Crédito, Sistema de Apartado o MercadoLibre
  paymentType?: SalePaymentType; // 'CONTADO' | 'CREDITO' | 'APARTADO' | 'MERCADOLIBRE' | 'MIXTO'
  creditDays?: number; // p. ej. 7, 15, 30 días
  creditDueDate?: string; // Fecha límite de pago (YYYY-MM-DD)
  creditPaidAmount?: number; // Monto abonado acumulado en USD
  creditPaidAmountBs?: number; // Monto exacto en Bs. del abono inicial (cuando se ingresa en Bolívares o su equivalente BCV)
  creditInitialPaymentCurrency?: PaymentCurrencyMode; // Moneda en la que se registró el abono inicial ('BS' o 'USD')
  creditStatus?: SaleCreditStatus; // 'PENDIENTE' | 'PAGADO' | 'ANULADO'
  creditPayments?: CreditPaymentRecord[]; // Historial de abonos parciales
  lastPaymentReminderSentAt?: string; // Fecha del último recordatorio de cobro enviado por WhatsApp

  // Control de Anulación de Venta / Cuenta por Cobrar
  isVoided?: boolean; // Indica si la venta/factura fue anulada
  voidedAt?: string; // Fecha y hora de anulación
  voidReason?: string; // Motivo de la anulación (error, prueba, devolución, etc.)

  // MercadoLibre Comisión y Deuda
  mercadolibreCommissionUSD?: number; // Comisión adeudada a MercadoLibre en USD
  mercadolibreCommissionRate?: number; // % de comisión aplicada
  mercadolibreFeeStatus?: 'PENDIENTE' | 'PAGADO'; // Estado de liquidación con MercadoLibre
  mercadolibreSettledAt?: string; // Fecha de liquidación

  // Gastos de Envío Nacional (Ventas a otros estados distintos a Mérida)
  hasShipping?: boolean;
  shippingCostUSD?: number;
  shippingCostBs?: number;
  shippingCurrencyMode?: PaymentCurrencyMode;
  shippingState?: string;
  shippingAgency?: string;
  shippingNotes?: string;
}

export interface MercadoLibreEntry {
  id: string;
  createdAt: string; // ISO date
  description: string;
  amountUSD: number; // Monto en USD (positivo = comisión/cargo a pagar, negativo = abono/pago realizado)
  type: 'CARGO_MANUAL' | 'COMISION_VENTA' | 'ABONO_PAGO';
  saleInvoiceNumber?: string;
  status: 'PENDIENTE' | 'PAGADO';
}

export type WorkshopServiceType = 
  | 'Mecánica General'
  | 'Tapicería y Asientos'
  | 'Mantenimiento Preventivo'
  | 'Sistema Eléctrico'
  | 'Frenos y Suspensión'
  | 'Personalización y Modificación';

export type ServiceOrderStatus = 
  | 'CREADA' // Creada / En espera
  | 'EN_PROCESO' // En proceso
  | 'CULMINADA' // Culminado / Listo para entrega
  | 'ENTREGADA'; // Entregado / Finalizado

export interface ServiceItem {
  id: string;
  name: string;
  cost: number; // Costo del servicio en USD ($)
  technician?: string;
  technicianId?: string;
  notes?: string;
}

export interface WorkshopServicePreset {
  id: string;
  name: string;
  cost: number; // Costo base preguardado en USD ($)
  scope?: 'GENERAL' | 'ASIENTO';
}

export type FuelLevel = 'Vacío' | '1/4' | '1/2' | '3/4' | 'Lleno';

export type ServiceOrderEntryType = 'MOTOCICLETA' | 'ASIENTO';

export type ServiceOrderPaymentStatus = 'PENDIENTE' | 'ABONO' | 'PAGADO';

export interface ServiceOrderPaymentRecord {
  id: string;
  date: string; // ISO string
  amountUSD: number;
  amountBs: number;
  currencyMode?: PaymentCurrencyMode; // 'BS' | 'USD'
  bcvRate: number;
  paymentMethod: PaymentMethod;
  pagoMovilAccount?: PagoMovilAccountOption;
  treasuryAccountId?: string;
  treasuryAccountName?: string;
  treasuryMovementId?: string;
  reference?: string;
  notes?: string;
}

export interface ServiceOrder {
  id: string;
  orderNumber: string; // e.g., ORD-2026-0045
  entryType?: ServiceOrderEntryType; // 'MOTOCICLETA' (por defecto) o 'ASIENTO' (solo ingreso de asiento)
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerDocument?: string;
  motorcycle: Motorcycle;
  serviceType: WorkshopServiceType;
  fuelLevel: FuelLevel;
  reportedIssue: string; // Motivo de ingreso / falla reportada / trabajo por hacerle al asiento
  diagnosis?: string; // Diagnóstico técnico del mecánico/tapicero
  seatIntakePhoto?: string; // Foto obligatoria de cómo se recibió el asiento (Data URL comprimido)
  seatDeliveryPhoto?: string; // Foto de cómo se entregó el asiento (Data URL comprimido)
  partsUsed: SaleItem[]; // Repuestos sacados de inventario o agregados (en USD)
  laborCost: number; // Costo total de mano de obra en USD
  servicesList?: ServiceItem[]; // Servicios adicionales y reparaciones detalladas
  totalCost: number; // Total en USD
  bcvRate?: number; // Tasa BCV aplicada
  totalCostBs?: number; // Total equivalente en Bs.
  paymentStatus?: ServiceOrderPaymentStatus; // 'PENDIENTE' | 'ABONO' | 'PAGADO'
  paidAmountUSD?: number; // Monto total abonado / pagado acumulado en USD
  paidAmountBs?: number; // Monto total abonado / pagado acumulado en Bs.
  payments?: ServiceOrderPaymentRecord[]; // Historial de abonos o pago total
  status: ServiceOrderStatus;
  assignedTechnician?: string;
  assignedTechnicianId?: string;
  assignedTechnicianPhone?: string;
  skipCommissionSync?: boolean;
  estimatedDelivery?: string;
  createdAt: string;
  updatedAt: string;
  notes?: string;
}

export function getServiceOrderPaymentSummary(
  order: Pick<ServiceOrder, 'totalCost' | 'bcvRate' | 'totalCostBs' | 'paymentStatus' | 'paidAmountUSD' | 'paidAmountBs' | 'payments'>,
  fallbackRate: number = 1
): {
  paymentStatus: ServiceOrderPaymentStatus;
  totalUSD: number;
  totalBs: number;
  paidUSD: number;
  paidBs: number;
  remainingUSD: number;
  remainingBs: number;
  paymentsCount: number;
} {
  const rate = order.bcvRate && order.bcvRate > 0 ? order.bcvRate : fallbackRate > 0 ? fallbackRate : 1;
  const totalUSD = Math.max(0, Math.round((Number(order.totalCost) || 0) * 100) / 100);
  const totalBs = Math.round(((order.totalCostBs !== undefined && order.totalCostBs > 0 ? order.totalCostBs : totalUSD * rate)) * 100) / 100;
  const records = Array.isArray(order.payments) ? order.payments : [];
  const sumRecordsUSD = records.reduce((s, p) => s + (Number(p.amountUSD) || 0), 0);
  const sumRecordsBs = records.reduce((s, p) => s + (Number(p.amountBs) || 0), 0);

  let paidUSD = records.length > 0
    ? Math.round(sumRecordsUSD * 100) / 100
    : Math.max(0, Math.round((Number(order.paidAmountUSD) || 0) * 100) / 100);
  let paidBs = records.length > 0
    ? Math.round(sumRecordsBs * 100) / 100
    : order.paidAmountBs !== undefined
    ? Math.max(0, Math.round((Number(order.paidAmountBs) || 0) * 100) / 100)
    : Math.round(paidUSD * rate * 100) / 100;

  let paymentStatus: ServiceOrderPaymentStatus;
  if (order.paymentStatus === 'PAGADO' && (records.length === 0 || totalUSD === 0 || paidUSD >= totalUSD - 0.02)) {
    paymentStatus = 'PAGADO';
    if (records.length === 0 && paidUSD < totalUSD) {
      paidUSD = totalUSD;
      paidBs = totalBs;
    }
  } else if (totalUSD > 0 && paidUSD >= totalUSD - 0.02) {
    paymentStatus = 'PAGADO';
  } else if (paidUSD > 0.009) {
    paymentStatus = 'ABONO';
  } else if (order.paymentStatus === 'PAGADO') {
    paymentStatus = 'PAGADO';
  } else {
    paymentStatus = 'PENDIENTE';
  }

  const remainingUSD = paymentStatus === 'PAGADO' ? 0 : Math.max(0, Math.round((totalUSD - paidUSD) * 100) / 100);
  const remainingBs = paymentStatus === 'PAGADO' ? 0 : Math.max(0, Math.round(remainingUSD * rate * 100) / 100);

  return {
    paymentStatus,
    totalUSD,
    totalBs,
    paidUSD,
    paidBs,
    remainingUSD,
    remainingBs,
    paymentsCount: records.length,
  };
}

export type OnlineOrderStatus = 'PENDIENTE_PAGO' | 'CONFIRMADO' | 'EN_ALISTAMIENTO' | 'LISTO_ENTREGA' | 'ENTREGADO' | 'CANCELADO';

export type ShippingAgency = 'MRW' | 'ZOOM' | 'TEALCA';

export type OnlineOrderDeliveryType = 'DOMICILIO' | 'RETIRO_TIENDA' | 'ENVIO_NACIONAL';

export interface OnlineOrder {
  id: string;
  orderCode: string; // e.g. PED-9821
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerDocument?: string; // Cédula o RIF del cliente comprador
  customerAddress?: string;
  customerCity?: string;
  customerState?: string;
  deliveryType: OnlineOrderDeliveryType;
  shippingAgency?: ShippingAgency;
  agencyAddress?: string;
  recipientDocument?: string;
  recipientName?: string;
  recipientPhone?: string;
  items: SaleItem[];
  total: number; // in USD
  bcvRate: number; // Tasa BCV
  totalBs: number; // in Bs.
  paymentMethod: PaymentMethod;
  paymentProofReference?: string;
  status: OnlineOrderStatus;
  createdAt: string;
  notes?: string;
}

export interface BusinessSettings {
  name: string;
  commercialName: string;
  onlineStoreName?: string; // Nombre de la tienda online pública para clientes (ej: Mercado Moto CC)
  onlineStoreSlug?: string; // Slug de la URL pública (ej: mercadomotocc)
  rif: string; // RIF venezolano (ej: J-40982315-0)
  phone: string;
  whatsapp: string;
  email: string;
  address: string;
  state: string; // Estado venezolano
  city: string; // Ciudad venezolana
  bcvRate: number; // Tasa oficial del Banco Central de Venezuela (Bs/USD) — tasa_bcv
  bcvLastUpdated?: string; // Fecha y hora de última sincronización
  bcvOfficialDate?: string; // Fecha Valor oficial reportada por el BCV
  bcvSource?: string; // Fuente oficial (bcv.org.ve)
  bcvSyncedAtISO?: string; // Timestamp ISO de la última actualización oficial de tasa BCV
  usdtRate?: number; // Tasa referencia USDT Binance (Bs/USDT) — tasa_usdt (Solo Admin)
  usdtLastUpdated?: string; // Fecha y hora de última actualización USDT
  usdtSource?: string; // Fuente de la tasa USDT (Binance / Manual)
  currencySymbol: string; // $
  secondaryCurrencySymbol: string; // Bs.
  bankDetails: {
    // Pago Móvil
    pagoMovilBank: string;
    pagoMovilPhone: string;
    pagoMovilId: string; // CI o RIF
    pagoMovilHolder: string;
    pagoMovilQrUrl?: string;
    // Transferencia Bancaria en Bs
    bankTransferName: string;
    bankTransferAccount: string;
    bankTransferType: string;
    bankTransferHolder: string;
    bankTransferRif: string;
    // Divisas
    binancePayId?: string;
  };
  invoiceDisclaimer: string;
  warrantyPolicy: string;
  customCategories?: string[];
  customModelCategories?: string[];
  hiddenDefaultModelCategories?: string[];
  customExpenseCategories?: string[];
  customIncomeCategories?: string[];
  customCommitmentCategories?: string[];
  customExpensePosBanks?: string[];
  customWorkshopServicePresets?: WorkshopServicePreset[];
}

export interface Technician {
  id: string;
  name: string;
  phone: string; // WhatsApp para notificaciones de pago
  documentId?: string; // Cédula V- / E-
  specialty?: string; // Ej. Mecánica General, Tapicería, Electricidad
  commissionRate: number; // Porcentaje de comisión por defecto (0 - 100)
  active: boolean;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type ServiceCommissionStatus = 'PENDIENTE' | 'PARCIAL' | 'PAGADO';

export interface ServiceCommission {
  id: string;
  serviceOrderId?: string;
  orderNumber: string; // e.g., ORD-2026-0004 o MAN-0001
  technicianId: string;
  technicianName: string;
  technicianPhone?: string;
  motorcycleLabel: string;
  customerName?: string;
  serviceDescription: string;
  baseAmountUSD: number; // Monto base comisionable (Mano de Obra / Servicio) en USD
  commissionRate: number; // % aplicado en esta orden
  commissionAmountUSD: number; // Monto total de comisión generada en USD
  paidAmountUSD: number; // Monto abonado / pagado acumulado en USD
  status: ServiceCommissionStatus;
  workDate: string; // Fecha de la orden/reparación ISO
  createdAt: string;
  updatedAt?: string;
  notes?: string;
}

export interface TechnicianPayoutItem {
  commissionId: string;
  orderNumber: string;
  motorcycleLabel: string;
  serviceDescription: string;
  baseAmountUSD: number;
  commissionRate: number;
  commissionAmountUSD: number;
  amountPaidInThisPayoutUSD: number;
  previousPaidUSD: number;
  remainingAfterPayoutUSD: number;
}

export interface TechnicianPayout {
  id: string;
  payoutNumber: string; // e.g., LIQ-2026-0001
  technicianId: string;
  technicianName: string;
  technicianPhone?: string;
  technicianDocument?: string;
  amountUSD: number;
  bcvRate: number;
  amountBs: number;
  paymentMethod: PaymentMethod;
  reference?: string;
  notes?: string;
  commissionItems: TechnicianPayoutItem[];
  totalPaidToTechnicianAfterPayoutUSD?: number;
  remainingDebtUSD: number; // Deuda total restante con el técnico después de este pago
  remainingDebtBs: number;
  createdAt: string;
}

export interface Supplier {
  id: string;
  code: string; // Código único del proveedor (ej: PROV-001)
  name: string; // Razón social / nombre del proveedor
  rif?: string; // RIF / Documento fiscal opcional
  vendorName: string; // Nombre del vendedor asignado
  vendorPhone: string; // Teléfono WhatsApp del vendedor
  email?: string;
  address?: string;
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type PurchasePaymentCurrency = 'DIVISAS' | 'USDT' | 'BS';

export interface PurchaseOrderItem {
  id?: string;
  productId?: string;
  sku?: string;
  barcode?: string;
  name: string;
  category?: string;
  description?: string;
  brand?: string;
  compatibility?: string;
  warehouseLocation?: string;
  imageUrl?: string;
  quantity: number;
  unitCostUSD: number;
  costCurrencyOrigin?: ProductCostOrigin; // 'DIVISAS' | 'BS_BCV'
  costPriceBs?: number; // Costo unitario en Bs si fue cotizado a tasa BCV
  referenceCostUSD?: number; // Costo unitario de referencia en divisas ajustado por brecha BCV/USDT
  salePriceUSD?: number; // Precio de venta comercial USD-BCV para inventario y facturación
  salePriceRefUSD?: number; // SOLO ADMIN: Precio de venta de referencia en divisas
  salePriceBsBcv?: number; // Precio de venta comercial en Bs a tasa BCV
  minStock?: number;
  totalCostUSD: number;
  isNewProduct?: boolean;
}

export interface PurchasePaymentRecord {
  id: string;
  date: string; // ISO string
  amountUSD: number;
  amountBs: number;
  bcvRate: number;
  currencyCategory: PurchasePaymentCurrency; // 'DIVISAS' | 'USDT' | 'BS'
  paymentMethod: string; // Ej: 'Divisas ($ Efectivo)', 'USDT (Binance Pay)', 'Bolívares (Pago Móvil)', 'Bolívares (Transferencia)'
  reference?: string;
  notes?: string;
}

export type PurchaseOrderPaymentStatus = 'PENDIENTE' | 'PARCIAL' | 'PAGADO';
export type PurchaseOrderReceivedStatus = 'PENDIENTE' | 'RECIBIDA';
export type PurchaseOrderCurrencyCondition = 'DIVISAS' | 'BS_BCV';

export interface PurchaseOrder {
  id: string;
  orderNumber: string; // Correlativo interno: OC-2026-0001
  supplierInvoiceNumber?: string; // Nro. factura física del proveedor (opcional)
  supplierId: string;
  supplierCode: string;
  supplierName: string;
  vendorName: string;
  vendorPhone: string;
  items: PurchaseOrderItem[];
  totalUSD: number;
  bcvRate: number;
  totalBs: number;
  paymentType: 'CONTADO' | 'CREDITO';
  paymentCurrencyCondition?: PurchaseOrderCurrencyCondition; // 'DIVISAS' | 'BS_BCV'
  creditDays?: number; // Días de crédito si paymentType === 'CREDITO'
  creditDueDate?: string; // Fecha de vencimiento YYYY-MM-DD
  paymentStatus: PurchaseOrderPaymentStatus; // 'PENDIENTE' | 'PARCIAL' | 'PAGADO'
  paidAmountUSD: number;
  payments: PurchasePaymentRecord[];
  initialPaymentCurrency?: PurchasePaymentCurrency;
  initialPaymentMethod?: string;
  receivedStatus: PurchaseOrderReceivedStatus; // 'PENDIENTE' | 'RECIBIDA'
  receivedDate?: string; // Fecha de llegada YYYY-MM-DD
  stockApplied?: boolean; // Controla que los repuestos se sumen al inventario una sola vez
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export const DEFAULT_EXPENSE_CATEGORIES: string[] = [
  'Sueldos y Nómina',
  'Vales / Adelantos de Sueldo',
  'Papelería y Oficina',
  'Limpieza y Aseo',
  'Servicios Públicos (Luz, Agua, Internet)',
  'Alquiler y Condominio',
  'Mantenimiento y Equipos',
  'Transporte y Envíos',
  'Publicidad y Marketing',
  'Impuestos y Tasas',
  'Otros Gastos',
];

export const DEFAULT_INCOME_CATEGORIES: string[] = [
  'Ingreso de Ventas / Caja',
  'Cobro de Clientes / Abonos',
  'Servicios de Taller',
  'Aporte de Capital / Socios',
  'Reembolso / Devolución',
  'Otros Ingresos',
];

export const DEFAULT_EXPENSE_POS_BANKS: string[] = [
  'Banesco Personal',
  'Provincial',
];

export type ExpensePaymentCurrency =
  | 'BS'
  | 'PUNTO_VENTA'
  | 'USDT'
  | 'EFECTIVO_BS'
  | 'EFECTIVO_USD';

export type ExpensePaymentMethod =
  | 'Bolívares (Transferencia / Pago Móvil)'
  | 'Punto de Venta (Bs)'
  | 'USDT (Binance Pay)'
  | 'Efectivo Bs'
  | 'Efectivo en Dólares ($)';

export interface BusinessExpense {
  id: string;
  expenseNumber: string; // Correlativo GAS-2026-0001
  date: string; // Fecha del gasto YYYY-MM-DD
  category: string; // Sueldo, Papelería, Limpieza o categoría personalizada
  description: string; // Detalle del gasto
  beneficiary?: string; // Empleado, comercio o proveedor del servicio
  amountUSD: number; // Monto equivalente en USD
  bcvRate: number; // Tasa BCV aplicada
  amountBs: number; // Monto equivalente en Bolívares
  paymentCurrencyType: ExpensePaymentCurrency; // 'BS' | 'PUNTO_VENTA' | 'USDT' | 'EFECTIVO_BS' | 'EFECTIVO_USD'
  paymentMethod: ExpensePaymentMethod;
  cardBank?: string; // Banco de la tarjeta usada cuando se paga por Punto de Venta (ej. Banesco Personal, Provincial o banco agregado)
  reference?: string; // Número de referencia o comprobante
  notes?: string;
  treasuryAccountId?: string; // Cuenta de Tesorería de la cual se descontó el gasto
  treasuryAccountName?: string; // Nombre de la cuenta descontada
  treasuryMovementId?: string; // ID del movimiento espejo creado en Tesorería
  deductedFromTreasury?: boolean; // Indica si el gasto descontó liquidez en Tesorería
  isSalaryAdvance?: boolean; // Indica si es un vale / adelanto al sueldo de un trabajador
  linkedCommitmentId?: string; // ID del compromiso (sueldo/gasto fijo) del cual se descontó el vale
  linkedCommitmentTitle?: string; // Nombre descriptivo del sueldo/compromiso descontado
  salaryAdvanceAppliedUSD?: number; // Monto USD efectivamente descontado del compromiso
  createdAt: string;
  updatedAt?: string;
}

export type TreasuryAccountGroup = 'EFECTIVO' | 'BANCO_NACIONAL' | 'BILLETERA_DIVISAS';

export interface TreasuryAccount {
  id: string;
  name: string; // Ej: Caja Efectivo USD, Banco Mercantil Bs, Binance USDT
  group: TreasuryAccountGroup;
  currency: 'USD' | 'BS' | 'USDT';
  balanceUSD: number; // Saldo actual equivalente en USD
  nativeBalance: number; // Saldo en moneda nativa de la cuenta (Bs o USD/USDT)
  institution?: string; // Ej: Banesco, Mercantil, Binance, Caja Mostrador
  accountNumber?: string; // Últimos dígitos o identificador opcional
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type TreasuryCommitmentCategory =
  | 'GASTOS_FIJOS'
  | 'NOMINA_SUELDOS'
  | 'PROVEEDORES'
  | (string & {});

export const DEFAULT_COMMITMENT_CATEGORIES: Array<{ id: string; label: string }> = [
  { id: 'GASTOS_FIJOS', label: 'Gastos Fijos' },
  { id: 'NOMINA_SUELDOS', label: 'Nómina / Sueldos' },
  { id: 'PROVEEDORES', label: 'Proveedores' },
];

export type TreasuryCommitmentPaymentCurrency = 'EFECTIVO_USD' | 'BS';

export type TreasuryCommitmentRateType = 'BCV' | 'EURO' | 'USDT';

export type TreasuryCommitmentDisplayStatus = 'PAGADO' | 'PENDIENTE' | 'PROXIMO_VENCER';

export type TreasuryCommitmentRecurrence = 'UNICO' | 'SEMANAL' | 'QUINCENAL' | 'MENSUAL';

export type TreasuryCommitmentRecurrenceMode = 'PROGRESIVO' | 'MES_COMPLETO';

export interface TreasuryCommitment {
  id: string;
  title: string; // Ej: Alquiler local, Sueldo mecánico, Factura proveedor X
  workerName?: string; // Nombre del trabajador asignado (para Nómina / Sueldos o Gastos Fijos)
  category: TreasuryCommitmentCategory;
  dueDate: string; // Fecha límite YYYY-MM-DD
  amountUSD: number; // Saldo pendiente por pagar en USD (se reduce con vales/adelantos)
  originalAmountUSD?: number; // Monto base original antes de descontar vales/adelantos
  advancesTotalUSD?: number; // Total acumulado descontado mediante vales/adelantos de sueldo
  bcvRate: number;
  amountBs: number;
  paymentCurrency?: TreasuryCommitmentPaymentCurrency; // 'EFECTIVO_USD' | 'BS'
  exchangeRateType?: TreasuryCommitmentRateType; // 'BCV' | 'EURO' | 'USDT' (cuando es en Bs)
  appliedExchangeRate?: number; // Tasa en Bs usada (BCV, Euro o USDT)
  reservedUSD?: number; // Monto apartado para cobertura
  isPaid: boolean;
  paidByAdvances?: boolean; // True si quedó liquidado automáticamente en $0 por vales de sueldo
  paidAt?: string;
  paidAccountId?: string;
  paidAccountName?: string;
  linkedPurchaseOrderId?: string;
  isRecurringMonthly?: boolean;
  recurrenceFrequency?: TreasuryCommitmentRecurrence; // 'UNICO' | 'SEMANAL' | 'QUINCENAL' | 'MENSUAL'
  recurrenceMode?: TreasuryCommitmentRecurrenceMode; // 'PROGRESIVO' | 'MES_COMPLETO'
  recurrenceGroupId?: string; // Identificador de serie recurrente
  recurrenceDayOfWeek?: number; // 0=Dom .. 6=Sáb para pagos semanales
  recurrenceActive?: boolean; // Permite pausar o mantener activa la generación automática
  isAutoGenerated?: boolean; // True si fue creado automáticamente por su regla recurrente
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type TreasuryMovementType = 'INGRESO' | 'GASTO' | 'PAGO_PLANIFICADO';

export interface TreasuryMovement {
  id: string;
  movementNumber: string; // MOV-2026-0001
  date: string; // YYYY-MM-DD
  type: TreasuryMovementType;
  accountId: string;
  accountName: string;
  accountGroup: TreasuryAccountGroup;
  category: string;
  description: string;
  amountUSD: number;
  bcvRate: number;
  amountBs: number;
  reference?: string;
  commitmentId?: string;
  expenseId?: string;
  saleId?: string;
  saleInvoiceNumber?: string;
  salaryAdvanceCommitmentId?: string; // Compromiso de sueldo/gasto fijo descontado por vale
  salaryAdvanceAppliedUSD?: number; // Monto USD descontado al compromiso por este vale
  debtId?: string; // ID de la deuda vinculada cuando es un abono o pago de deuda
  linkedMovementId?: string; // ID del movimiento hermano (ej. compra de USDT que descuenta Bs de otra cuenta)
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export const DEFAULT_DEBT_CATEGORIES: string[] = [
  'Préstamo Bancario',
  'Proveedores / Mercancía',
  'Socios / Capital',
  'Alquiler / Local',
  'Impuestos / Seniat',
  'Servicios Atrasados',
  'Equipos / Financiamiento',
  'Otras Deudas',
];

export type DebtPriority = 'ALTA' | 'MEDIA' | 'BAJA';
export type DebtStatus = 'ACTIVA' | 'EN_PLAN' | 'PAGADA';
export type DebtPaymentStrategy = 'CUOTAS_IGUALES' | 'PAGO_UNICO' | 'FLEXIBLE';
export type DebtPaymentFrequency = 'SEMANAL' | 'QUINCENAL' | 'MENSUAL' | 'UNICO';

export interface DebtInstallment {
  id: string;
  number: number; // Cuota #1, #2, ...
  dueDate: string; // YYYY-MM-DD
  amountUSD: number;
  status: 'PENDIENTE' | 'PAGADA';
  paidAt?: string;
  paidAccountId?: string;
  paidAccountName?: string;
  reference?: string;
  linkedCommitmentId?: string; // Si fue agendada en Planificación de Pagos
}

export interface DebtPaymentPlan {
  strategy: DebtPaymentStrategy;
  frequency: DebtPaymentFrequency;
  installmentsCount: number;
  installmentAmountUSD?: number; // Monto deseado por cuota en USD
  calculationMode?: 'BY_AMOUNT' | 'BY_COUNT'; // Si el usuario definió el monto por cuota o el número de cuotas
  startDate: string; // YYYY-MM-DD
  estimatedEndDate?: string; // YYYY-MM-DD fecha calculada de finalización
  paymentWeekdays?: number[]; // Días de la semana (0=Dom..6=Sáb) cuando es SEMANAL
  biweeklyMode?: 'FIXED_DAYS' | 'EVERY_15_DAYS'; // Modalidad cuando es QUINCENAL
  biweeklyDays?: [number, number]; // Ej: [15, 30] o [1, 15]
  monthlyDay?: number; // Día del mes (1..31) cuando es MENSUAL
  preferredAccountId?: string;
  preferredAccountName?: string;
  paymentCurrency: TreasuryCommitmentPaymentCurrency; // 'EFECTIVO_USD' | 'BS'
  exchangeRateType?: TreasuryCommitmentRateType; // 'BCV' | 'EURO' | 'USDT'
  appliedExchangeRate?: number;
  installments: DebtInstallment[];
  notes?: string;
  updatedAt?: string;
}

export interface DebtPaymentRecord {
  id: string;
  date: string; // YYYY-MM-DD
  amountUSD: number;
  amountBs: number;
  bcvRate: number;
  accountId: string;
  accountName: string;
  reference?: string;
  notes?: string;
  installmentId?: string;
  installmentNumber?: number;
  treasuryMovementId?: string;
  createdAt: string;
}

export interface TreasuryDebt {
  id: string;
  debtNumber: string; // DEU-2026-0001
  title: string; // Concepto de la deuda
  creditor: string; // Acreedor (banco, persona, proveedor)
  category: string; // Categoría editable
  priority: DebtPriority;
  totalAmountUSD: number; // Monto total original de la deuda
  paidAmountUSD: number; // Total abonado/pagado acumulado
  remainingAmountUSD: number; // Saldo pendiente por pagar
  status: DebtStatus; // 'ACTIVA' | 'EN_PLAN' | 'PAGADA'
  startDate: string; // Fecha en que se adquirió/registró YYYY-MM-DD
  dueDate?: string; // Fecha límite objetivo YYYY-MM-DD
  paymentPlan?: DebtPaymentPlan;
  payments: DebtPaymentRecord[];
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}

export type OpenAccountStatus = 'ABIERTA' | 'CERRADA';

export interface OpenAccountItem extends SaleItem {
  entryId: string;
  addedAt: string; // ISO timestamp when customer/mechanic picked up this part
  note?: string;
}

export interface OpenAccount {
  id: string;
  accountNumber: string; // e.g., CTA-2026-0001
  customerId?: string;
  customerName: string;
  customerPhone: string;
  customerDocument?: string;
  workshopName?: string; // Taller vecino donde arreglan la motocicleta
  motorcycleInfo?: string; // Modelo / placa / color de la motocicleta
  notes?: string;
  items: OpenAccountItem[];
  subtotal: number; // Acumulado actual en USD
  bcvRate: number;
  status: OpenAccountStatus;
  openedAt: string; // ISO date
  updatedAt: string; // ISO date
  settledAt?: string;
  settledSaleId?: string;
  settledInvoiceNumber?: string;
}
