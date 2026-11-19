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

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  description: string;
  costPrice: number; // In USD ($)
  salePrice: number; // In USD ($)
  stock: number;
  minStock: number;
  brand: string;
  compatibility: string; // e.g., "Yamaha NMAX, BWS 125, Pulsar NS200, Universal"
  imageUrl: string;
  barcode?: string; // Código de barra / EAN / UPC
  warehouseLocation?: string; // Ubicación física en almacén (ej. Estante A-3, Pasillo 2)
  featured?: boolean;
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
  imageUrl?: string;
}

export type PaymentMethod = 
  | 'Pago Móvil'
  | 'Dólares Efectivo (USD)'
  | 'Transferencia Bancaria Bs'
  | 'Punto de Venta (Bs)'
  | 'Binance Pay (USDT)';

export type SalePaymentType = 'CONTADO' | 'CREDITO' | 'APARTADO' | 'MERCADOLIBRE';
export type SaleCreditStatus = 'PENDIENTE' | 'PAGADO' | 'ANULADO';

export type PagoMovilAccountOption = 'BANESCO_PERSONAL' | 'PROVINCIAL';

export interface CreditPaymentRecord {
  id: string;
  date: string; // ISO string
  amountUSD: number;
  amountBs: number;
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
  notes?: string;
  createdAt: string; // ISO date
  source: 'POS' | 'TIENDA_ONLINE';

  // Modalidad de pago: De Contado, A Crédito, Sistema de Apartado o MercadoLibre
  paymentType?: SalePaymentType; // 'CONTADO' | 'CREDITO' | 'APARTADO' | 'MERCADOLIBRE'
  creditDays?: number; // p. ej. 7, 15, 30 días
  creditDueDate?: string; // Fecha límite de pago (YYYY-MM-DD)
  creditPaidAmount?: number; // Monto abonado acumulado en USD
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

export type FuelLevel = 'Vacío' | '1/4' | '1/2' | '3/4' | 'Lleno';

export interface ServiceOrder {
  id: string;
  orderNumber: string; // e.g., ORD-2026-0045
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerDocument?: string;
  motorcycle: Motorcycle;
  serviceType: WorkshopServiceType;
  fuelLevel: FuelLevel;
  reportedIssue: string; // Motivo de ingreso / falla reportada
  diagnosis?: string; // Diagnóstico técnico del mecánico/tapicero
  partsUsed: SaleItem[]; // Repuestos sacados de inventario o agregados (en USD)
  laborCost: number; // Costo total de mano de obra en USD
  servicesList?: ServiceItem[]; // Servicios adicionales y reparaciones detalladas
  totalCost: number; // Total en USD
  bcvRate?: number; // Tasa BCV aplicada
  totalCostBs?: number; // Total equivalente en Bs.
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
  bcvRate: number; // Tasa oficial del Banco Central de Venezuela (Bs/USD)
  bcvLastUpdated?: string; // Fecha y hora de última sincronización
  bcvOfficialDate?: string; // Fecha Valor oficial reportada por el BCV
  bcvSource?: string; // Fuente oficial (bcv.org.ve)
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
  customExpenseCategories?: string[];
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
  salePriceUSD?: number; // Precio de venta para inventario ($) — no se suma al total de la orden de compra
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

export type ExpensePaymentCurrency = 'BS' | 'USDT' | 'EFECTIVO_BS' | 'EFECTIVO_USD';

export type ExpensePaymentMethod =
  | 'Bolívares (Transferencia / Pago Móvil)'
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
  paymentCurrencyType: ExpensePaymentCurrency; // 'BS' | 'USDT' | 'EFECTIVO_BS' | 'EFECTIVO_USD'
  paymentMethod: ExpensePaymentMethod;
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

export type TreasuryCommitmentCategory = 'GASTOS_FIJOS' | 'NOMINA_SUELDOS' | 'PROVEEDORES';

export type TreasuryCommitmentPaymentCurrency = 'EFECTIVO_USD' | 'BS';

export type TreasuryCommitmentRateType = 'BCV' | 'EURO' | 'USDT';

export type TreasuryCommitmentDisplayStatus = 'PAGADO' | 'PENDIENTE' | 'PROXIMO_VENCER';

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
  notes?: string;
  createdAt: string;
  updatedAt?: string;
}
