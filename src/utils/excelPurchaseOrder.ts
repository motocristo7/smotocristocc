import * as XLSX from 'xlsx';
import {
  Product,
  PurchaseOrderCurrencyCondition,
  PurchaseOrderItem,
  Supplier,
} from '../types';
import { normalizeCategory } from './excelInventory';

export interface ParsedPOExcelItem extends PurchaseOrderItem {
  rowNumber: number;
  matchStatus: 'existing' | 'new';
}

export interface InvalidPOExcelRow {
  rowNumber: number;
  reason: string;
  data: Record<string, unknown>;
}

export interface ParsedPOHeaderMetadata {
  supplierId?: string;
  supplierCodeHint?: string;
  supplierInvoiceNumber?: string;
  paymentType?: 'CREDITO' | 'CONTADO';
  paymentCurrencyCondition?: PurchaseOrderCurrencyCondition;
  creditDays?: number;
  receivedStatus?: 'PENDIENTE' | 'RECIBIDA';
  receivedDate?: string;
  notes?: string;
}

export interface ParsedPurchaseOrderExcelResult {
  validItems: ParsedPOExcelItem[];
  invalidRows: InvalidPOExcelRow[];
  headerMetadata: ParsedPOHeaderMetadata | null;
  stats: {
    totalRows: number;
    validCount: number;
    invalidCount: number;
    newCount: number;
    existingCount: number;
    totalCostUSD: number;
  };
}

function normalizeKey(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

function parseNumber(val: unknown, fallback = 0): number {
  if (typeof val === 'number') return isNaN(val) ? fallback : val;
  if (val === undefined || val === null || val === '') return fallback;
  const cleaned = String(val)
    .replace(/[$BsUSD\s]/gi, '')
    .replace(',', '.')
    .trim();
  const num = parseFloat(cleaned);
  return isNaN(num) ? fallback : num;
}

/**
 * Downloads a pre-formatted Excel template for creating a new Purchase Order.
 */
export function downloadPurchaseOrderTemplate() {
  const itemsTemplateData = [
    {
      codigo_sku: 'SKU-BER-001',
      codigo_barra: '7591029384751',
      nombre_repuesto: 'Pastillas de Freno Delanteras Bera SBR 150',
      categoria: 'Frenos',
      marca: 'Bera Genuine',
      compatibilidad: 'Bera SBR 150, León 150, New Jaguar',
      cantidad: 10,
      costo_unitario_usd: 4.5,
      precio_venta_usd: 8.5,
      stock_minimo: 4,
      ubicacion_almacen: 'Estante A-1',
      descripcion: 'Pastillas de freno semimetálicas de alto frenado.',
      url_imagen: '',
    },
    {
      codigo_sku: 'SKU-EMP-002',
      codigo_barra: '7598472910384',
      nombre_repuesto: 'Kit de Arrastre Empire Horse 150 (Corona + Piñón + Cadena)',
      categoria: 'Transmisión',
      marca: 'Empire Keeway',
      compatibilidad: 'Empire Horse 150, Arsen II, Owen 150',
      cantidad: 5,
      costo_unitario_usd: 12.0,
      precio_venta_usd: 22.0,
      stock_minimo: 3,
      ubicacion_almacen: 'Estante B-3',
      descripcion: 'Kit de transmisión reforzado 428H.',
      url_imagen: '',
    },
  ];

  const wsItems = XLSX.utils.json_to_sheet(itemsTemplateData);
  wsItems['!cols'] = [
    { wch: 16 }, // codigo_sku
    { wch: 18 }, // codigo_barra
    { wch: 44 }, // nombre_repuesto
    { wch: 16 }, // categoria
    { wch: 18 }, // marca
    { wch: 36 }, // compatibilidad
    { wch: 12 }, // cantidad
    { wch: 20 }, // costo_unitario_usd
    { wch: 20 }, // precio_venta_usd
    { wch: 14 }, // stock_minimo
    { wch: 22 }, // ubicacion_almacen
    { wch: 46 }, // descripcion
    { wch: 28 }, // url_imagen
  ];

  const orderHeaderData = [
    {
      codigo_proveedor: 'PROV-001',
      nro_factura_proveedor: 'FAC-000123',
      tipo_pago: 'CREDITO',
      condicion_moneda: 'DIVISAS',
      dias_credito: 15,
      mercancia_recibida: 'SI',
      fecha_recepcion: new Date().toISOString().split('T')[0],
      notas: 'Orden cargada desde plantilla Excel',
    },
  ];

  const wsHeader = XLSX.utils.json_to_sheet(orderHeaderData);
  wsHeader['!cols'] = [
    { wch: 20 },
    { wch: 24 },
    { wch: 14 },
    { wch: 20 },
    { wch: 14 },
    { wch: 20 },
    { wch: 18 },
    { wch: 40 },
  ];

  const instructionsData = [
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'codigo_sku',
      Obligatorio: 'OPCIONAL',
      Descripción:
        'Código único del repuesto. Si coincide con un SKU ya existente en tu inventario, actualizará el producto y sumará la cantidad al stock. Si no existe o queda vacío, creará un repuesto nuevo.',
    },
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'codigo_barra',
      Obligatorio: 'OPCIONAL',
      Descripción: 'Código de barras EAN/UPC del producto.',
    },
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'nombre_repuesto',
      Obligatorio: 'SÍ',
      Descripción: 'Nombre comercial del repuesto que se compra e ingresa al inventario.',
    },
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'categoria',
      Obligatorio: 'SÍ',
      Descripción:
        'Categoría del inventario (ej: Frenos, Motor, Transmisión, Suspensión, Eléctrico, Llantas, Tapicería, Accesorios, Lubricantes o una nueva).',
    },
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'marca',
      Obligatorio: 'OPCIONAL',
      Descripción: 'Marca o fabricante (por defecto: Genérico).',
    },
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'compatibilidad',
      Obligatorio: 'OPCIONAL',
      Descripción: 'Motos compatibles (por defecto: Universal).',
    },
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'cantidad',
      Obligatorio: 'SÍ',
      Descripción: 'Cantidad de unidades compradas en la orden (entero >= 1).',
    },
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'costo_unitario_usd',
      Obligatorio: 'SÍ',
      Descripción:
        'Costo unitario de compra en $ USD. La orden de compra totalizará EXCLUSIVAMENTE con la suma de (cantidad × costo_unitario_usd).',
    },
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'precio_venta_usd',
      Obligatorio: 'SÍ (Nuevos)',
      Descripción:
        'Precio de venta al público en $ USD para ingresar el repuesto directamente al inventario y tienda. No altera el total de costos de la orden.',
    },
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'stock_minimo',
      Obligatorio: 'OPCIONAL',
      Descripción: 'Alerta mínima de stock en inventario (por defecto: 2).',
    },
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'ubicacion_almacen',
      Obligatorio: 'OPCIONAL',
      Descripción: 'Ubicación física en almacén (ej: Estante A-1, Gaveta 3).',
    },
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'descripcion',
      Obligatorio: 'OPCIONAL',
      Descripción: 'Descripción técnica para el catálogo e inventario.',
    },
    {
      Hoja: 'Orden_Compra_Repuestos',
      Campo: 'url_imagen',
      Obligatorio: 'OPCIONAL',
      Descripción: 'URL de imagen (opcional; puedes subir foto luego desde el modal).',
    },
    {
      Hoja: 'Datos_Orden_Opcional',
      Campo: 'Encabezado de Orden',
      Obligatorio: 'OPCIONAL',
      Descripción:
        'Opcionalmente llena esta hoja para precargar codigo_proveedor, nro_factura_proveedor, tipo_pago (CREDITO/CONTADO), condicion_moneda (DIVISAS/BS_BCV), dias_credito, mercancia_recibida (SI/NO), fecha_recepcion y notas.',
    },
  ];

  const wsInstructions = XLSX.utils.json_to_sheet(instructionsData);
  wsInstructions['!cols'] = [{ wch: 24 }, { wch: 22 }, { wch: 14 }, { wch: 80 }];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, wsItems, 'Orden_Compra_Repuestos');
  XLSX.utils.book_append_sheet(wb, wsHeader, 'Datos_Orden_Opcional');
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instrucciones');

  XLSX.writeFile(wb, 'Plantilla_Orden_Compra_Servimotos.xlsx');
}

/**
 * Parses an uploaded Excel / CSV file into PurchaseOrderItems (with inventory metadata)
 * and optional order header metadata.
 */
export async function parsePurchaseOrderExcelFile(
  file: File,
  existingProducts: Product[],
  suppliers: Supplier[]
): Promise<ParsedPurchaseOrderExcelResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  const preferredSheets = [
    'Orden_Compra_Repuestos',
    'Repuestos_Orden',
    'Orden_Compra',
    'Plantilla_Inventario',
  ];
  const sheetName =
    preferredSheets.find((name) => wb.SheetNames.includes(name)) || wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error('El archivo no contiene ninguna hoja de cálculo válida.');
  }

  const rawRowsAll: Record<string, unknown>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });
  // Filter completely empty rows
  const rawRows = rawRowsAll.filter((row) =>
    Object.values(row).some((val) => String(val ?? '').trim() !== '')
  );

  if (rawRows.length === 0) {
    throw new Error('La hoja de repuestos está vacía o no contiene filas con datos.');
  }

  const existingBySku = new Map<string, Product>();
  const existingByBarcode = new Map<string, Product>();
  existingProducts.forEach((p) => {
    if (p.sku) existingBySku.set(p.sku.trim().toUpperCase(), p);
    if (p.barcode) existingByBarcode.set(p.barcode.trim().toUpperCase(), p);
  });

  const validItems: ParsedPOExcelItem[] = [];
  const invalidRows: InvalidPOExcelRow[] = [];

  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2;
    const normalizedRow: Record<string, unknown> = {};
    Object.keys(row).forEach((k) => {
      normalizedRow[normalizeKey(k)] = row[k];
    });

    const findVal = (keys: string[]): unknown => {
      for (const k of keys) {
        if (normalizedRow[k] !== undefined && String(normalizedRow[k]).trim() !== '') {
          return normalizedRow[k];
        }
      }
      return undefined;
    };

    const rawSku = findVal(['codigo_sku', 'sku', 'codigo', 'cod', 'referencia']);
    const rawBarcode = findVal([
      'codigo_barra',
      'codigo_barras',
      'barcode',
      'barra',
      'codigo_de_barra',
      'ean',
      'upc',
      'cod_barra',
    ]);
    const rawName = findVal([
      'nombre_repuesto',
      'nombre',
      'repuesto',
      'producto',
      'articulo',
      'item',
      'descripcion_corta',
    ]);
    const rawCat = findVal(['categoria', 'rubro', 'grupo', 'linea']);
    const rawBrand = findVal(['marca', 'fabricante', 'brand']);
    const rawComp = findVal(['compatibilidad', 'motos_compatibles', 'aplicacion', 'modelo', 'compatible']);
    const rawQty = findVal(['cantidad', 'cant', 'qty', 'unidades', 'cantidad_comprada', 'stock']);
    const rawCost = findVal([
      'costo_unitario_usd',
      'costo_unit_usd',
      'precio_costo_usd',
      'costo_usd',
      'precio_costo',
      'costo_unitario',
      'costo',
      'cost',
    ]);
    const rawSale = findVal([
      'precio_venta_usd',
      'precio_venta',
      'pvp_usd',
      'pvp',
      'precio_usd',
      'precio',
      'price',
    ]);
    const rawMinStock = findVal(['stock_minimo', 'min_stock', 'minimo', 'alerta_minima']);
    const rawLocation = findVal([
      'ubicacion_almacen',
      'ubicacion_en_almacen',
      'ubicacion',
      'almacen',
      'estante',
      'pasillo',
      'gaveta',
      'location',
    ]);
    const rawDesc = findVal(['descripcion', 'detalles', 'observaciones', 'especificaciones', 'nota']);
    const rawImage = findVal(['url_imagen', 'imagen', 'foto', 'link_imagen', 'url']);

    if (!rawName || String(rawName).trim() === '') {
      invalidRows.push({
        rowNumber,
        reason: 'El nombre del repuesto (nombre_repuesto) está vacío.',
        data: row,
      });
      return;
    }

    const name = String(rawName).trim();
    const qty = Math.floor(parseNumber(rawQty, 0));
    if (qty < 1) {
      invalidRows.push({
        rowNumber,
        reason: 'La cantidad comprada (cantidad) debe ser mayor o igual a 1.',
        data: row,
      });
      return;
    }

    const rawSkuUpper = rawSku ? String(rawSku).trim().toUpperCase() : '';
    const rawBarcodeUpper = rawBarcode ? String(rawBarcode).trim().toUpperCase() : '';
    const matchedProduct =
      (rawSkuUpper ? existingBySku.get(rawSkuUpper) : undefined) ||
      (rawBarcodeUpper ? existingByBarcode.get(rawBarcodeUpper) : undefined);

    const parsedCost = parseNumber(rawCost, -1);
    const unitCostUSD =
      parsedCost >= 0
        ? Math.round(parsedCost * 100) / 100
        : matchedProduct
        ? Number(matchedProduct.costPrice) || 0
        : -1;

    if (unitCostUSD < 0) {
      invalidRows.push({
        rowNumber,
        reason: 'El costo unitario (costo_unitario_usd) es obligatorio y debe ser >= 0.',
        data: row,
      });
      return;
    }

    const parsedSale = parseNumber(rawSale, 0);
    const salePriceUSD =
      parsedSale > 0
        ? Math.round(parsedSale * 100) / 100
        : matchedProduct && matchedProduct.salePrice > 0
        ? Number(matchedProduct.salePrice)
        : 0;

    if (salePriceUSD <= 0) {
      invalidRows.push({
        rowNumber,
        reason: 'Falta precio_venta_usd (> 0) requerido para ingresar el repuesto al inventario.',
        data: row,
      });
      return;
    }

    const sku =
      rawSkuUpper ||
      matchedProduct?.sku ||
      `REP-${String(Date.now()).slice(-4)}${String(idx + 1).padStart(2, '0')}`;

    const barcode = rawBarcode ? String(rawBarcode).trim() : matchedProduct?.barcode || undefined;
    const category = rawCat
      ? normalizeCategory(rawCat)
      : matchedProduct
      ? String(matchedProduct.category)
      : 'Accesorios';
    const brand = rawBrand ? String(rawBrand).trim() : matchedProduct?.brand || 'Genérico';
    const compatibility = rawComp
      ? String(rawComp).trim()
      : matchedProduct?.compatibility || 'Universal';
    const warehouseLocation = rawLocation
      ? String(rawLocation).trim()
      : matchedProduct?.warehouseLocation || undefined;
    const minStock =
      rawMinStock !== undefined
        ? Math.max(0, Math.floor(parseNumber(rawMinStock, 2)))
        : matchedProduct?.minStock ?? 2;
    const description = rawDesc ? String(rawDesc).trim() : matchedProduct?.description || '';
    const imageUrl = rawImage ? String(rawImage).trim() : matchedProduct?.imageUrl || undefined;
    const totalCostUSD = Math.round(qty * unitCostUSD * 100) / 100;

    validItems.push({
      id: `poi-xl-${Date.now()}-${idx}-${Math.random().toString(36).slice(2, 5)}`,
      rowNumber,
      productId: matchedProduct?.id,
      sku,
      barcode,
      name,
      category,
      brand,
      compatibility,
      warehouseLocation,
      minStock,
      description,
      imageUrl,
      quantity: qty,
      unitCostUSD,
      salePriceUSD,
      totalCostUSD,
      isNewProduct: !matchedProduct,
      matchStatus: matchedProduct ? 'existing' : 'new',
    });
  });

  // Optional header metadata sheet parsing
  let headerMetadata: ParsedPOHeaderMetadata | null = null;
  const headerSheetName = wb.SheetNames.find((n) =>
    ['Datos_Orden_Opcional', 'Datos_Orden', 'Encabezado'].includes(n)
  );
  if (headerSheetName && wb.Sheets[headerSheetName]) {
    const headerRows: Record<string, unknown>[] = XLSX.utils.sheet_to_json(
      wb.Sheets[headerSheetName],
      { defval: '' }
    );
    const firstRow = headerRows.find((r) =>
      Object.values(r).some((v) => String(v ?? '').trim() !== '')
    );
    if (firstRow) {
      const normH: Record<string, unknown> = {};
      Object.keys(firstRow).forEach((k) => {
        normH[normalizeKey(k)] = firstRow[k];
      });
      const getH = (keys: string[]) => {
        for (const k of keys) {
          if (normH[k] !== undefined && String(normH[k]).trim() !== '') {
            return String(normH[k]).trim();
          }
        }
        return undefined;
      };

      const supCode = getH(['codigo_proveedor', 'cod_proveedor', 'proveedor_codigo', 'proveedor']);
      const matchedSup = supCode
        ? suppliers.find(
            (s) =>
              s.code.trim().toUpperCase() === supCode.toUpperCase() ||
              s.name.trim().toLowerCase() === supCode.toLowerCase()
          )
        : undefined;

      const inv = getH(['nro_factura_proveedor', 'factura_proveedor', 'factura', 'nro_factura']);
      const rawPayType = getH(['tipo_pago', 'condicion_compra', 'condicion'])?.toUpperCase();
      const paymentType: 'CREDITO' | 'CONTADO' | undefined =
        rawPayType && rawPayType.includes('CONTADO')
          ? 'CONTADO'
          : rawPayType && rawPayType.includes('CRED')
          ? 'CREDITO'
          : undefined;

      const rawCurrencyCond = getH(['condicion_moneda', 'moneda_pago', 'moneda'])?.toUpperCase();
      const paymentCurrencyCondition: PurchaseOrderCurrencyCondition | undefined =
        rawCurrencyCond && (rawCurrencyCond.includes('BS') || rawCurrencyCond.includes('BCV'))
          ? 'BS_BCV'
          : rawCurrencyCond && (rawCurrencyCond.includes('DIV') || rawCurrencyCond.includes('USD'))
          ? 'DIVISAS'
          : undefined;

      const rawDays = getH(['dias_credito', 'credito_dias', 'dias']);
      const creditDays = rawDays ? Math.max(1, Math.floor(parseNumber(rawDays, 15))) : undefined;

      const rawRec = getH(['mercancia_recibida', 'recibida', 'recepcion'])?.toUpperCase();
      const receivedStatus: 'PENDIENTE' | 'RECIBIDA' | undefined =
        rawRec && (rawRec === 'SI' || rawRec === 'SÍ' || rawRec.includes('RECIB'))
          ? 'RECIBIDA'
          : rawRec && (rawRec === 'NO' || rawRec.includes('PEND'))
          ? 'PENDIENTE'
          : undefined;

      const receivedDate = getH(['fecha_recepcion', 'fecha_llegada']);
      const notes = getH(['notas', 'observaciones']);

      if (
        matchedSup ||
        supCode ||
        inv ||
        paymentType ||
        paymentCurrencyCondition ||
        creditDays ||
        receivedStatus ||
        notes
      ) {
        headerMetadata = {
          supplierId: matchedSup?.id,
          supplierCodeHint: supCode,
          supplierInvoiceNumber: inv,
          paymentType,
          paymentCurrencyCondition,
          creditDays,
          receivedStatus,
          receivedDate,
          notes,
        };
      }
    }
  }

  const totalCostUSD =
    Math.round(validItems.reduce((sum, it) => sum + (it.totalCostUSD || 0), 0) * 100) / 100;

  return {
    validItems,
    invalidRows,
    headerMetadata,
    stats: {
      totalRows: rawRows.length,
      validCount: validItems.length,
      invalidCount: invalidRows.length,
      newCount: validItems.filter((r) => r.matchStatus === 'new').length,
      existingCount: validItems.filter((r) => r.matchStatus === 'existing').length,
      totalCostUSD,
    },
  };
}
