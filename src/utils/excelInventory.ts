import * as XLSX from 'xlsx';
import { Product, ProductCategory } from '../types';

export const VALID_CATEGORIES: ProductCategory[] = [
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

export interface ParsedProductRow {
  rowNumber: number;
  sku: string;
  name: string;
  category: ProductCategory;
  brand: string;
  compatibility: string;
  costPrice: number;
  salePrice: number;
  stock: number;
  minStock: number;
  description: string;
  imageUrl: string;
  barcode?: string;
  warehouseLocation?: string;
  action: 'new' | 'update';
  existingProductId?: string;
}

export interface InvalidProductRow {
  rowNumber: number;
  reason: string;
  data: Record<string, any>;
}

export interface ParsedExcelResult {
  validRows: ParsedProductRow[];
  invalidRows: InvalidProductRow[];
  stats: {
    totalRows: number;
    validCount: number;
    invalidCount: number;
    newCount: number;
    updateCount: number;
  };
}

/**
 * Normalizes string keys for header matching (removes accents, lowercase, removes symbols)
 */
function normalizeKey(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Maps a string value to one of the valid product categories
 */
export function normalizeCategory(val?: any): ProductCategory {
  if (!val) return 'Accesorios';
  const raw = String(val).trim().replace(/\s+/g, ' ');
  if (!raw) return 'Accesorios';
  const clean = raw.toLowerCase();
  if (clean.includes('freno')) return 'Frenos';
  if (clean.includes('motor') || clean.includes('piston') || clean.includes('cilindro')) return 'Motor';
  if (clean.includes('transmi') || clean.includes('cadena') || clean.includes('corona') || clean.includes('pinon')) return 'Transmisión';
  if (clean.includes('suspen') || clean.includes('amortiguador') || clean.includes('telescop')) return 'Suspensión';
  if (clean.includes('electr') || clean.includes('bateria') || clean.includes('bujia') || clean.includes('cdi') || clean.includes('luces')) return 'Eléctrico';
  if (clean.includes('llanta') || clean.includes('caucho') || clean.includes('tripa') || clean.includes('rin')) return 'Llantas';
  if (clean.includes('tapic') || clean.includes('asiento') || clean.includes('funda') || clean.includes('forro')) return 'Tapicería';
  if (clean.includes('lubric') || clean.includes('aceite') || clean.includes('grasa')) return 'Lubricantes';
  if (clean === 'accesorios' || clean === 'accesorio') return 'Accesorios';
  return raw === clean ? raw.charAt(0).toUpperCase() + raw.slice(1) : raw;
}

/**
 * Downloads a pre-formatted Excel template for bulk inventory upload
 */
export function downloadInventoryTemplate() {
  const templateData = [
    {
      codigo_sku: 'SKU-BER-001',
      codigo_barra: '7591029384751',
      nombre_repuesto: 'Pastillas de Freno Delanteras Bera SBR 150',
      categoria: 'Frenos',
      marca: 'Bera Genuine',
      compatibilidad: 'Bera SBR 150, León 150, New Jaguar',
      precio_costo_usd: 4.5,
      precio_venta_usd: 8.0,
      stock: 20,
      stock_minimo: 4,
      ubicacion_almacen: 'Estante A-1',
      descripcion: 'Pastillas de freno semimetálicas de alto frenado y resistencia térmica.',
      url_imagen: '',
    },
    {
      codigo_sku: 'SKU-EMP-002',
      codigo_barra: '7598472910384',
      nombre_repuesto: 'Kit de Arrastre Empire Horse 150 (Corona + Piñón + Cadena)',
      categoria: 'Transmisión',
      marca: 'Empire Keeway',
      compatibilidad: 'Empire Horse 150, Arsen II, Owen 150',
      precio_costo_usd: 12.0,
      precio_venta_usd: 22.0,
      stock: 15,
      stock_minimo: 3,
      ubicacion_almacen: 'Estante B-3',
      descripcion: 'Kit de transmisión reforzado 428H con tratamiento anticorrosivo.',
      url_imagen: '',
    },
    {
      codigo_sku: 'SKU-TAP-003',
      codigo_barra: '7592837491028',
      nombre_repuesto: 'Forro Antirresbalante Asiento Moto Bera / Keeway',
      categoria: 'Tapicería',
      marca: 'Servimotos Tapicería',
      compatibilidad: 'Bera SBR, Empire Horse, Suzuki GN, Universal',
      precio_costo_usd: 6.0,
      precio_venta_usd: 12.5,
      stock: 30,
      stock_minimo: 5,
      ubicacion_almacen: 'Vitrina 2',
      descripcion: 'Cuerina térmica antiresbalante impermeable con costuras dobles reforzadas.',
      url_imagen: '',
    },
  ];

  const ws = XLSX.utils.json_to_sheet(templateData);

  // Column width hints
  ws['!cols'] = [
    { wch: 16 }, // codigo_sku
    { wch: 18 }, // codigo_barra
    { wch: 42 }, // nombre_repuesto
    { wch: 16 }, // categoria
    { wch: 18 }, // marca
    { wch: 36 }, // compatibilidad
    { wch: 18 }, // precio_costo_usd
    { wch: 18 }, // precio_venta_usd
    { wch: 10 }, // stock
    { wch: 14 }, // stock_minimo
    { wch: 22 }, // ubicacion_almacen
    { wch: 50 }, // descripcion
    { wch: 30 }, // url_imagen
  ];

  const instructionsData = [
    { Campo: 'codigo_sku', Obligatorio: 'SÍ', Descripción: 'Código único interno del repuesto (ej: SKU-101). Si ya existe en tu inventario, ACTUALIZARÁ sus datos; si no existe, lo CREARÁ.' },
    { Campo: 'codigo_barra', Obligatorio: 'OPCIONAL', Descripción: 'Código de barra del producto (EAN, UPC, o código leído con pistola lectora de código de barra).' },
    { Campo: 'nombre_repuesto', Obligatorio: 'SÍ', Descripción: 'Nombre comercial del repuesto (ej: Pastillas de Freno Bera SBR).' },
    { Campo: 'categoria', Obligatorio: 'SÍ', Descripción: 'Categoría válida o personalizada (ej: Frenos, Motor, Transmisión, Suspensión, Eléctrico, Llantas, Tapicería, Accesorios, Lubricantes).' },
    { Campo: 'marca', Obligatorio: 'OPCIONAL', Descripción: 'Marca del repuesto (ej: Bera, Motul, Yamaha, Genérica).' },
    { Campo: 'compatibilidad', Obligatorio: 'OPCIONAL', Descripción: 'Modelos de motos en los que aplica (ej: Bera SBR, Empire Horse, Universal).' },
    { Campo: 'precio_costo_usd', Obligatorio: 'SÍ', Descripción: 'Costo en Dólares ($ USD). Solo números (ej: 5.50).' },
    { Campo: 'precio_venta_usd', Obligatorio: 'SÍ', Descripción: 'Precio de venta al público en Dólares ($ USD). El sistema calcula automáticamente el equivalente en Bs con la tasa BCV.' },
    { Campo: 'stock', Obligatorio: 'SÍ', Descripción: 'Cantidad de unidades disponibles en almacén (número entero >= 0).' },
    { Campo: 'stock_minimo', Obligatorio: 'OPCIONAL', Descripción: 'Punto de reorden / alerta de stock bajo (por defecto: 2).' },
    { Campo: 'ubicacion_almacen', Obligatorio: 'OPCIONAL', Descripción: 'Ubicación física dentro del almacén o tienda (ej: Estante A-1, Pasillo 2, Gaveta 4).' },
    { Campo: 'descripcion', Obligatorio: 'OPCIONAL', Descripción: 'Detalles técnicos o características adicionales del repuesto.' },
    { Campo: 'url_imagen', Obligatorio: 'OPCIONAL', Descripción: 'Enlace web directo o enlace público de Google Drive a la foto del repuesto.' },
  ];

  const wsInstructions = XLSX.utils.json_to_sheet(instructionsData);
  wsInstructions['!cols'] = [
    { wch: 20 },
    { wch: 14 },
    { wch: 75 },
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Plantilla_Inventario');
  XLSX.utils.book_append_sheet(wb, wsInstructions, 'Instrucciones');

  XLSX.writeFile(wb, 'Plantilla_Inventario_Servimotos.xlsx');
}

/**
 * Exports current live inventory to an Excel spreadsheet
 */
export function exportInventoryToExcel(products: Product[], bcvRate: number) {
  const today = new Date().toISOString().split('T')[0];
  const exportRows = products.map((p) => ({
    codigo_sku: p.sku,
    codigo_barra: p.barcode || '',
    nombre_repuesto: p.name,
    categoria: p.category,
    marca: p.brand || 'Genérica',
    compatibilidad: p.compatibility || 'Universal',
    precio_costo_usd: Number(p.costPrice.toFixed(2)),
    precio_venta_usd: Number(p.salePrice.toFixed(2)),
    precio_venta_bs_bcv: Number((p.salePrice * bcvRate).toFixed(2)),
    stock: p.stock,
    stock_minimo: p.minStock,
    ubicacion_almacen: p.warehouseLocation || '',
    estado_stock: p.stock <= 0 ? 'AGOTADO' : p.stock <= p.minStock ? 'STOCK BAJO' : 'DISPONIBLE',
    visible_en_tienda: p.stock > 0 ? 'SÍ' : 'NO (Agotado)',
    descripcion: p.description || '',
    url_imagen: p.imageUrl || '',
  }));

  const ws = XLSX.utils.json_to_sheet(exportRows);
  ws['!cols'] = [
    { wch: 16 }, // sku
    { wch: 18 }, // codigo_barra
    { wch: 40 }, // nombre
    { wch: 16 }, // cat
    { wch: 16 }, // marca
    { wch: 32 }, // comp
    { wch: 16 }, // costo
    { wch: 16 }, // venta usd
    { wch: 20 }, // venta bs
    { wch: 10 }, // stock
    { wch: 14 }, // min
    { wch: 22 }, // ubicacion_almacen
    { wch: 16 }, // estado
    { wch: 18 }, // visible
    { wch: 45 }, // desc
    { wch: 30 }, // url
  ];

  const wb = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(wb, ws, 'Inventario_Actual');
  XLSX.writeFile(wb, `Inventario_Servimotos_${today}.xlsx`);
}

/**
 * Parses an uploaded Excel / CSV file and validates rows against existing products
 */
export async function parseInventoryExcelFile(
  file: File,
  existingProducts: Product[]
): Promise<ParsedExcelResult> {
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });

  // Pick first sheet or 'Plantilla_Inventario'
  const sheetName = wb.SheetNames.includes('Plantilla_Inventario')
    ? 'Plantilla_Inventario'
    : wb.SheetNames[0];

  const ws = wb.Sheets[sheetName];
  if (!ws) {
    throw new Error('El archivo no contiene ninguna hoja de cálculo válida.');
  }

  // Convert to array of objects
  const rawRows: Record<string, any>[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

  if (rawRows.length === 0) {
    throw new Error('La hoja de cálculo está vacía o no contiene filas de datos.');
  }

  const validRows: ParsedProductRow[] = [];
  const invalidRows: InvalidProductRow[] = [];

  const existingBySku = new Map<string, Product>();
  existingProducts.forEach((p) => {
    if (p.sku) existingBySku.set(p.sku.trim().toUpperCase(), p);
  });

  rawRows.forEach((row, idx) => {
    const rowNumber = idx + 2; // header is row 1 in Excel

    // Normalize keys in row
    const normalizedRow: Record<string, any> = {};
    Object.keys(row).forEach((k) => {
      normalizedRow[normalizeKey(k)] = row[k];
    });

    // Helper to find value from possible keys
    const findVal = (possibleKeys: string[]): any => {
      for (const k of possibleKeys) {
        if (normalizedRow[k] !== undefined && normalizedRow[k] !== '') {
          return normalizedRow[k];
        }
      }
      return undefined;
    };

    const rawSku = findVal(['codigo_sku', 'sku', 'codigo', 'cod', 'referencia']);
    const rawBarcode = findVal(['codigo_barra', 'codigo_barras', 'barcode', 'barra', 'codigo_de_barra', 'ean', 'upc', 'cod_barra']);
    const rawName = findVal(['nombre_repuesto', 'nombre', 'repuesto', 'producto', 'articulo', 'descripcion_corta']);
    const rawCat = findVal(['categoria', 'rubro', 'grupo', 'linea']);
    const rawBrand = findVal(['marca', 'fabricante', 'brand']);
    const rawComp = findVal(['compatibilidad', 'motos_compatibles', 'aplicacion', 'modelo', 'compatible']);
    const rawCost = findVal(['precio_costo_usd', 'costo_usd', 'precio_costo', 'costo', 'cost']);
    const rawSale = findVal(['precio_venta_usd', 'precio_usd', 'precio_venta', 'precio', 'pvp', 'price']);
    const rawStock = findVal(['stock', 'cantidad', 'existencia', 'unidades', 'cant']);
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
    const rawDesc = findVal(['descripcion', 'detalles', 'observaciones', 'nota']);
    const rawImage = findVal(['url_imagen', 'imagen', 'foto', 'link_imagen', 'url']);

    // Check required fields
    if (!rawName || String(rawName).trim() === '') {
      invalidRows.push({
        rowNumber,
        reason: 'El nombre del repuesto está vacío.',
        data: row,
      });
      return;
    }

    const name = String(rawName).trim();

    // Parse prices
    const parseNumber = (val: any, fallback = 0): number => {
      if (typeof val === 'number') return isNaN(val) ? fallback : val;
      if (!val) return fallback;
      // Handle comma as decimal separator
      const cleaned = String(val).replace(/[$ Bs.]/g, '').replace(',', '.').trim();
      const num = parseFloat(cleaned);
      return isNaN(num) ? fallback : num;
    };

    const costPrice = Math.max(0, parseNumber(rawCost, 0));
    const salePrice = Math.max(0, parseNumber(rawSale, 0));

    if (salePrice <= 0 && costPrice <= 0) {
      invalidRows.push({
        rowNumber,
        reason: 'El precio de venta o costo debe ser mayor a 0.',
        data: row,
      });
      return;
    }

    const stock = Math.max(0, Math.floor(parseNumber(rawStock, 0)));
    const minStock = Math.max(0, Math.floor(parseNumber(rawMinStock, 2)));

    // SKU handling: generate if empty
    const sku = rawSku && String(rawSku).trim() !== ''
      ? String(rawSku).trim().toUpperCase()
      : `SKU-${Date.now().toString().slice(-4)}${idx}`;

    const barcode = rawBarcode && String(rawBarcode).trim() !== ''
      ? String(rawBarcode).trim()
      : undefined;

    const category = normalizeCategory(rawCat);
    const brand = rawBrand ? String(rawBrand).trim() : 'Genérica';
    const compatibility = rawComp ? String(rawComp).trim() : 'Universal';
    const warehouseLocation =
      rawLocation && String(rawLocation).trim() !== '' ? String(rawLocation).trim() : undefined;
    const description = rawDesc ? String(rawDesc).trim() : '';
    const imageUrl = rawImage ? String(rawImage).trim() : '';

    // Check if this SKU matches an existing product
    const existing = existingBySku.get(sku);

    validRows.push({
      rowNumber,
      sku,
      barcode,
      name,
      category,
      brand,
      compatibility,
      costPrice,
      salePrice: salePrice > 0 ? salePrice : costPrice * 1.3,
      stock,
      minStock,
      warehouseLocation,
      description,
      imageUrl,
      action: existing ? 'update' : 'new',
      existingProductId: existing?.id,
    });
  });

  const newCount = validRows.filter((r) => r.action === 'new').length;
  const updateCount = validRows.filter((r) => r.action === 'update').length;

  return {
    validRows,
    invalidRows,
    stats: {
      totalRows: rawRows.length,
      validCount: validRows.length,
      invalidCount: invalidRows.length,
      newCount,
      updateCount,
    },
  };
}
