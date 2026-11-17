export type ProductCategory =
  | 'Frenos'
  | 'Motor'
  | 'Transmisión'
  | 'Suspensión'
  | 'Eléctrico'
  | 'Llantas'
  | 'Tapicería'
  | 'Accesorios'
  | 'Lubricantes';

export interface Product {
  id: string;
  sku: string;
  name: string;
  category: ProductCategory;
  brand: string;
  compatibility: string;
  costUSD: number;
  salePrice: number;
  stock: number;
  minStock: number;
  imageUrl?: string;
  barcode?: string;
  description?: string;
}

export type PaymentMethod =
  | 'Pago Móvil'
  | 'Efectivo Divisas'
  | 'Transferencia Banesco'
  | 'Punto de Venta'
  | 'Binance Pay';

export type OnlineOrderDeliveryType = 'RETIRO_TIENDA' | 'DOMICILIO' | 'ENVIO_NACIONAL';
export type ShippingAgency = 'MRW' | 'Zoom' | 'Tealca';

export interface CartItem {
  product: Product;
  quantity: number;
}

export interface BankDetails {
  pagoMovilBank: string;
  pagoMovilPhone: string;
  pagoMovilId: string;
  pagoMovilQrUrl?: string;
  bankTransferBank: string;
  bankTransferAccount: string;
  bankTransferRif: string;
  binancePayId?: string;
}

export interface BusinessSettings {
  name: string;
  commercialName: string;
  onlineStoreName?: string;
  rif: string;
  phone: string;
  whatsapp: string;
  address: string;
  city: string;
  state: string;
  bcvRate: number;
  bcvLastUpdated: string;
  bcvAutoSync: boolean;
  bankDetails: BankDetails;
}

export interface SaleItem {
  productId: string;
  sku: string;
  name: string;
  category: ProductCategory;
  quantity: number;
  unitPrice: number;
  total: number;
  isService?: boolean;
}

export interface Sale {
  id: string;
  invoiceNumber: string;
  customerName: string;
  customerPhone: string;
  customerDocument?: string;
  items: SaleItem[];
  subtotal: number;
  subtotalBs: number;
  discount: number;
  total: number;
  totalBs: number;
  paymentMethod: PaymentMethod;
  bcvRate: number;
  createdAt: string;
  paymentType: 'CONTADO' | 'CREDITO' | 'MERCADOLIBRE';
  creditStatus?: 'PENDIENTE' | 'PAGADO' | 'ANULADO';
  creditDueDate?: string;
  creditPaidAmount?: number;
}

export interface ServiceOrder {
  id: string;
  orderNumber: string;
  customerName: string;
  customerPhone: string;
  motorcycle: {
    brand: string;
    model: string;
    plate: string;
    year?: string;
  };
  reportedIssues: string;
  technicalDiagnosis?: string;
  status: 'CREADA' | 'EN_PROCESO' | 'CULMINADA' | 'ENTREGADA';
  laborCost: number;
  partsUsed: SaleItem[];
  servicesList?: Array<{
    id: string;
    name: string;
    cost: number;
  }>;
  totalCost: number;
  totalCostBs: number;
  bcvRate: number;
  createdAt: string;
  estimatedDelivery?: string;
}
