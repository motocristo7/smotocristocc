export type UserRole = 'ADMIN' | 'CLIENTE';

export interface AppUser {
  id: string;
  name: string;
  documentId: string; // Cédula (V- / E-)
  phone: string; // WhatsApp / Móvil
  email?: string;
  role: UserRole;
  createdAt: string;
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

export interface CreditPaymentRecord {
  id: string;
  date: string; // ISO string
  amountUSD: number;
  amountBs: number;
  paymentMethod: PaymentMethod;
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
