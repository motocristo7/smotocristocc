import { Product, Customer, Sale, ServiceOrder, BusinessSettings, OnlineOrder } from '../types';

export const INITIAL_SETTINGS: BusinessSettings = {
  name: 'Servimotos Cristo Centro C.A.',
  commercialName: 'Servimotos Cristo Centro',
  onlineStoreName: 'Mercado Moto CC',
  onlineStoreSlug: 'mercadomotocc',
  rif: 'V-19996141-8',
  phone: '0412-7860509',
  whatsapp: '0412-7860509',
  email: 'SERVIMOTOSCRISTOCENTRO@gmail.com',
  address: 'Calle Kennedy con calle 2 de Campo de Oro casa #1-23. Frente a la torre 5 de, Mérida 5101, Mérida',
  state: 'Mérida',
  city: 'Mérida',
  bcvRate: 896.12,
  currencySymbol: '$',
  secondaryCurrencySymbol: 'Bs.',
  bankDetails: {
    pagoMovilBank: '0134 - Banesco',
    pagoMovilPhone: '0412-2242450',
    pagoMovilId: 'V-19996141',
    pagoMovilHolder: 'Servimotos Cristo Centro',
    pagoMovilQrUrl: '/assets/pagomovil_qr.jpeg',
    bankTransferName: 'Banesco Banco Universal',
    bankTransferAccount: '0134-0030-08-0301034334',
    bankTransferType: 'Cuenta Corriente',
    bankTransferHolder: 'Servimotos Cristo Centro C.A.',
    bankTransferRif: 'V-19996141-8',
    binancePayId: '66195935',
  },
  invoiceDisclaimer: 'Garantía legal de 30 días en partes eléctricas y 90 días en repuestos mecánicos. Precios fijados en divisas USD y pagaderos en Bolívares a la tasa oficial BCV vigente al momento del pago.',
  warrantyPolicy: 'Los servicios de tapicería cuentan con 6 meses de garantía sobre costuras y materiales sintéticos impermeables de alta densidad.',
  bcvOfficialDate: 'Viernes, 06 Noviembre 2026',
  bcvSource: 'Banco Central de Venezuela (bcv.org.ve)',
  bcvLastUpdated: '03:54 p. m.'
};

export const INITIAL_PRODUCTS: Product[] = [
  {
    id: 'prod-1793985592406',
    sku: 'BH68',
    barcode: '0374946301739373837',
    name: 'FORRO MALLA XXL',
    category: 'Accesorios',
    description: '',
    costPrice: 2.78,
    salePrice: 8,
    stock: 5,
    minStock: 2,
    brand: 'HT',
    compatibility: 'TX, DT, KAVAK, LECHUZA, TIGRITO, RKV',
    imageUrl: 'https://lh3.googleusercontent.com/d/1Bq9liv-M_0toAtcjieQ1G2zi4A-EoQuU',
    featured: true
  },
  {
    id: 'prod-1793634511278',
    sku: '92677981',
    name: 'MALETA PARA MOTO PLASTICA NEGRA',
    category: 'Accesorios',
    description: 'Maleta Sencilla sin Base, se instala directamente en la parrilla, atornillada.',
    costPrice: 10,
    salePrice: 24,
    stock: 9,
    minStock: 2,
    brand: '',
    compatibility: 'Sincronicas y Scooters con parrilla',
    imageUrl: 'https://lh3.googleusercontent.com/d/1XAFxEg-LcvyFFrlWHzaWZCoMf-5xfhMg',
    featured: true
  }
];

export const INITIAL_CUSTOMERS: Customer[] = [
  {
    id: 'cust-1793899313593',
    name: 'Edwin Lobo (Abuelo)',
    phone: '584226442204',
    email: '',
    documentId: '',
    state: 'Mérida',
    city: 'Mérida',
    address: '',
    notes: '',
    createdAt: '2026-11-05T17:21:53.593Z'
  },
  {
    id: 'cust-1793898901051',
    name: 'Hugo Josue Ramirez',
    phone: '584129656023',
    email: '',
    documentId: '27781072',
    state: 'Mérida',
    city: 'Mérida',
    address: '',
    notes: '',
    createdAt: '2026-11-05T17:15:01.051Z'
  },
  {
    id: 'cust-1793898797018',
    name: 'Jhoan Alejandro Mata Sabalza',
    phone: '584247364424',
    email: '',
    documentId: '17663229',
    state: 'Mérida',
    city: 'Mérida',
    address: '',
    notes: '',
    createdAt: '2026-11-05T17:13:17.018Z'
  },
  {
    id: 'cust-1793898709082',
    name: 'Sergio Sojo Mendez',
    phone: '584123798158',
    email: '',
    documentId: '10098701',
    state: 'Mérida',
    city: 'Mérida',
    address: '',
    notes: '',
    createdAt: '2026-11-05T17:11:49.082Z'
  },
  {
    id: 'cust-1793898507840',
    name: 'Elier Jesus Partida Hurtado',
    phone: '584144050119',
    email: '',
    documentId: '19365222',
    state: 'Mérida',
    city: 'Mérida',
    address: 'CARABOBO',
    notes: '',
    createdAt: '2026-11-05T17:08:27.840Z'
  },
  {
    id: 'cust-1793484530936',
    name: 'ISMAEL CONTRERAS',
    phone: '04122242450',
    email: '',
    documentId: '19996141',
    state: 'Mérida',
    city: 'Mérida',
    address: '',
    notes: '',
    createdAt: '2026-10-31T22:08:50.936Z'
  }
];

export const INITIAL_SALES: Sale[] = [];

export const INITIAL_SERVICE_ORDERS: ServiceOrder[] = [];

export const INITIAL_ONLINE_ORDERS: OnlineOrder[] = [
  {
    id: 'onl-1793725010765',
    orderCode: 'PED-8041',
    customerId: 'cust-1793484530936',
    customerName: 'ISMAEL CONTRERAS',
    customerPhone: '04122242450',
    customerCity: 'Mérida',
    customerState: 'Mérida',
    deliveryType: 'RETIRO_TIENDA',
    items: [
      {
        productId: 'prod-1793634511278',
        sku: '92677981',
        name: 'MALETA PARA MOTO PLASTICA NEGRA',
        category: 'Accesorios',
        quantity: 1,
        unitPrice: 24,
        total: 24
      }
    ],
    total: 24,
    bcvRate: 891.11,
    totalBs: 21386.64,
    paymentMethod: 'Pago Móvil',
    paymentProofReference: '9877567544354',
    status: 'PENDIENTE_PAGO',
    createdAt: '2026-11-03T16:56:50.765Z'
  }
];
