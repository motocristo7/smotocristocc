import { Product, ProductCostOrigin } from '../types';

export type ProfitCalcMode = 'margin' | 'markup';
export type ProfitHealthStatus = 'healthy' | 'low' | 'negative' | 'unknown';

export interface ExchangeGapInfo {
  bcvRate: number;
  usdtRate: number;
  diffBs: number;
  gapPct: number; // ((tasa_usdt - tasa_bcv) / tasa_bcv) * 100
  gapFactor: number; // tasa_usdt / tasa_bcv = 1 + (gapPct / 100)
}

export interface ReferenceCostResult {
  costOrigin: ProductCostOrigin;
  costBs: number; // Costo en Bs (si origen BS_BCV es el costo base en Bs; si DIVISAS es costo_divisa * tasa_usdt)
  costBsAtBcv: number; // Equivalente en Bs usando tasa_bcv
  costUsdAtBcv: number; // Equivalente nominal en $ usando tasa_bcv (costo_bs / tasa_bcv)
  referenceCostUSD: number; // Costo de referencia en divisas ajustado por brecha BCV/USDT
  gapPct: number;
  gapFactor: number;
}

export interface ProductPricingAnalysis {
  costOrigin: ProductCostOrigin;
  costBs: number;
  costUsdAtBcv: number;
  referenceCostUSD: number; // Costo de referencia real en divisas (ajustado por brecha si el costo fue en Bs BCV)
  salePriceRefUSD: number; // SOLO ADMIN: Precio de venta de referencia en divisas
  hasExplicitSalePriceRefUSD: boolean;
  salePriceBsBcv: number; // Precio de venta comercial en Bs a tasa BCV
  salePriceUsdBcv: number; // Equivalente comercial en USD BCV (salePriceBsBcv / tasa_bcv)
  realRevenueDivisasUSD: number; // Divisas reales equivalentes al cobrar salePriceBsBcv (salePriceBsBcv / tasa_usdt)
  // Utilidad basada en el precio de referencia en divisas (o divisas reales si no hay ref explícito)
  profitAmountUSD: number;
  profitMarginPct: number | null; // Margen sobre venta: ((venta - costo) / venta) * 100
  profitMarkupPct: number | null; // Markup sobre costo: ((venta - costo) / costo) * 100
  // Utilidad real al cobrar en Bs BCV y convertir a USDT
  realProfitAmountUSD: number;
  realProfitMarginPct: number | null;
  realProfitMarkupPct: number | null;
  // Alerta si el precio en Bs BCV queda por debajo del precio de referencia en divisas
  isBsLaggingRef: boolean;
  status: ProfitHealthStatus;
  gap: ExchangeGapInfo;
}

export interface SuggestedPriceResult {
  salePriceRefUSD: number; // Precio de venta de referencia en divisas (Solo Admin)
  salePriceBsBcv: number; // Precio en Bs a BCV que protege esa utilidad real en divisas (salePriceRefUSD * tasa_usdt)
  salePriceUsdBcv: number; // Equivalente comercial en USD BCV (salePriceBsBcv / tasa_bcv)
  profitAmountUSD: number;
  profitMarginPct: number;
  profitMarkupPct: number;
}

export function round2(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 100) / 100;
}

export function round4(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.round(value * 10000) / 10000;
}

export function getEffectiveUsdtRate(bcvRate: number, usdtRate?: number): number {
  const safeBcv = Number(bcvRate) > 0 ? Number(bcvRate) : 1;
  const safeUsdt = Number(usdtRate) > 0 ? Number(usdtRate) : safeBcv;
  return safeUsdt;
}

/**
 * Calcula la brecha cambiaria entre tasa_bcv (Bs/USD BCV) y tasa_usdt (Bs/USDT Binance).
 * Fórmula: brecha_pct = ((tasa_usdt - tasa_bcv) / tasa_bcv) * 100
 * Factor:  gapFactor  = tasa_usdt / tasa_bcv = 1 + (brecha_pct / 100)
 */
export function calculateExchangeGap(bcvRate: number, usdtRate?: number): ExchangeGapInfo {
  const safeBcv = Number(bcvRate) > 0 ? Number(bcvRate) : 1;
  const safeUsdt = getEffectiveUsdtRate(safeBcv, usdtRate);
  const diffBs = round2(safeUsdt - safeBcv);
  const gapPct = round2(((safeUsdt - safeBcv) / safeBcv) * 100);
  const gapFactor = round4(safeUsdt / safeBcv);

  return {
    bcvRate: safeBcv,
    usdtRate: safeUsdt,
    diffBs,
    gapPct,
    gapFactor,
  };
}

/**
 * Calcula el Costo de Referencia en Divisas ajustado por la brecha cambiaria BCV/USDT.
 *
 * - Si el costo se registra a Tasa BCV (en Bs):
 *     costo_usd_bcv = costo_bs_bcv / tasa_bcv
 *     costo_ref_divisa = costo_usd_bcv / (1 + brecha_pct / 100) = costo_bs_bcv / tasa_usdt
 * - Si el costo se registra directamente en Divisas / USDT:
 *     costo_ref_divisa = costo_divisa
 *     costo_bs_equiv = costo_divisa * tasa_usdt
 */
export function calculateReferenceCostUSD(params: {
  origin: ProductCostOrigin;
  costUSD?: number;
  costBs?: number;
  bcvRate: number;
  usdtRate?: number;
}): ReferenceCostResult {
  const gap = calculateExchangeGap(params.bcvRate, params.usdtRate);
  const origin: ProductCostOrigin = params.origin === 'BS_BCV' ? 'BS_BCV' : 'DIVISAS';

  if (origin === 'BS_BCV') {
    const rawBs =
      params.costBs !== undefined && Number(params.costBs) > 0
        ? Number(params.costBs)
        : Math.max(0, Number(params.costUSD) || 0) * gap.bcvRate;
    const costBs = round2(Math.max(0, rawBs));
    const costUsdAtBcv = round4(gap.bcvRate > 0 ? costBs / gap.bcvRate : 0);
    // Equivalente exacto: (costBs / tasa_bcv) / (1 + brecha_pct/100) === costBs / tasa_usdt
    const referenceCostUSD = round4(gap.usdtRate > 0 ? costBs / gap.usdtRate : costUsdAtBcv);

    return {
      costOrigin: 'BS_BCV',
      costBs,
      costBsAtBcv: costBs,
      costUsdAtBcv: round2(costUsdAtBcv),
      referenceCostUSD: round2(referenceCostUSD),
      gapPct: gap.gapPct,
      gapFactor: gap.gapFactor,
    };
  }

  const directDivisa = round2(Math.max(0, Number(params.costUSD) || 0));
  return {
    costOrigin: 'DIVISAS',
    costBs: round2(directDivisa * gap.usdtRate),
    costBsAtBcv: round2(directDivisa * gap.bcvRate),
    costUsdAtBcv: directDivisa,
    referenceCostUSD: directDivisa,
    gapPct: gap.gapPct,
    gapFactor: gap.gapFactor,
  };
}

export function classifyProfitStatus(marginPct: number | null): ProfitHealthStatus {
  if (marginPct === null || !Number.isFinite(marginPct)) return 'unknown';
  if (marginPct <= 0) return 'negative';
  if (marginPct < 20) return 'low';
  return 'healthy';
}

/**
 * Analiza en tiempo real los costos, precios duales y utilidad (SOLO USO ADMINISTRATIVO) de un repuesto.
 */
export function calculateProductPricing(
  product: Pick<
    Product,
    | 'costPrice'
    | 'costCurrencyOrigin'
    | 'costPriceBs'
    | 'referenceCostUSD'
    | 'salePrice'
    | 'salePriceRefUSD'
    | 'salePriceBsBcv'
  >,
  bcvRate: number,
  usdtRate?: number
): ProductPricingAnalysis {
  const gap = calculateExchangeGap(bcvRate, usdtRate);
  const costOrigin: ProductCostOrigin =
    product.costCurrencyOrigin === 'BS_BCV' ? 'BS_BCV' : 'DIVISAS';

  const costCalc = calculateReferenceCostUSD({
    origin: costOrigin,
    costUSD: Number(product.costPrice) || 0,
    costBs:
      costOrigin === 'BS_BCV' && product.costPriceBs && product.costPriceBs > 0
        ? Number(product.costPriceBs)
        : undefined,
    bcvRate: gap.bcvRate,
    usdtRate: gap.usdtRate,
  });

  const salePriceUsdBcv = round4(Math.max(0, Number(product.salePrice) || 0));
  const salePriceBsBcv = round2(salePriceUsdBcv * gap.bcvRate);
  const realRevenueDivisasUSD = round2(
    gap.usdtRate > 0 ? salePriceBsBcv / gap.usdtRate : salePriceUsdBcv
  );

  const hasExplicitSalePriceRefUSD =
    product.salePriceRefUSD !== undefined && Number(product.salePriceRefUSD) > 0;
  const salePriceRefUSD = hasExplicitSalePriceRefUSD
    ? round2(Number(product.salePriceRefUSD))
    : realRevenueDivisasUSD;

  const refCost = costCalc.referenceCostUSD;

  // Utilidad sobre el precio de venta de referencia en divisas (o real si no hay ref explícito)
  const profitAmountUSD = round2(salePriceRefUSD - refCost);
  const profitMarginPct =
    salePriceRefUSD > 0 ? round2(((salePriceRefUSD - refCost) / salePriceRefUSD) * 100) : null;
  const profitMarkupPct =
    refCost > 0 ? round2(((salePriceRefUSD - refCost) / refCost) * 100) : null;

  // Utilidad real al cobrar en Bs a tasa BCV y medirlo a tasa USDT
  const realProfitAmountUSD = round2(realRevenueDivisasUSD - refCost);
  const realProfitMarginPct =
    realRevenueDivisasUSD > 0
      ? round2(((realRevenueDivisasUSD - refCost) / realRevenueDivisasUSD) * 100)
      : null;
  const realProfitMarkupPct =
    refCost > 0 ? round2(((realRevenueDivisasUSD - refCost) / refCost) * 100) : null;

  // Si el precio comercial en Bs BCV representa menos divisas reales que el precio de referencia en divisas
  const isBsLaggingRef =
    hasExplicitSalePriceRefUSD &&
    salePriceRefUSD > 0 &&
    realRevenueDivisasUSD + 0.05 < salePriceRefUSD;

  // Semáforo visual basado en la utilidad real efectiva (protege contra rezago por brecha)
  const effectiveMarginForStatus = realProfitMarginPct ?? profitMarginPct;

  return {
    costOrigin,
    costBs: costCalc.costBs,
    costUsdAtBcv: costCalc.costUsdAtBcv,
    referenceCostUSD: refCost,
    salePriceRefUSD,
    hasExplicitSalePriceRefUSD,
    salePriceBsBcv,
    salePriceUsdBcv: round2(salePriceUsdBcv),
    realRevenueDivisasUSD,
    profitAmountUSD,
    profitMarginPct,
    profitMarkupPct,
    realProfitAmountUSD,
    realProfitMarginPct,
    realProfitMarkupPct,
    isBsLaggingRef,
    status: classifyProfitStatus(effectiveMarginForStatus),
    gap,
  };
}

/**
 * Sugiere el Precio de Venta de Referencia en Divisas y el Precio en Bs a BCV
 * a partir de un % de utilidad objetivo (Margen sobre Venta o Markup sobre Costo).
 */
export function suggestPriceFromTargetProfit(params: {
  referenceCostUSD: number;
  targetPct: number;
  mode: ProfitCalcMode;
  bcvRate: number;
  usdtRate?: number;
}): SuggestedPriceResult {
  const gap = calculateExchangeGap(params.bcvRate, params.usdtRate);
  const cost = Math.max(0, Number(params.referenceCostUSD) || 0);
  const rawPct = Math.max(0, Number(params.targetPct) || 0);

  let salePriceRefUSD = cost;
  if (params.mode === 'margin') {
    const safePct = Math.min(95, rawPct);
    salePriceRefUSD = safePct >= 95 ? cost * 20 : cost / (1 - safePct / 100);
  } else {
    salePriceRefUSD = cost * (1 + rawPct / 100);
  }

  salePriceRefUSD = round2(salePriceRefUSD);
  // Para conservar exactamente ese valor en divisas al cobrar en Bs a tasa BCV,
  // el monto en Bs se calcula usando tasa_usdt y su equivalente USD-BCV = Bs / tasa_bcv.
  const salePriceBsBcv = round2(salePriceRefUSD * gap.usdtRate);
  const salePriceUsdBcv = round2(gap.bcvRate > 0 ? salePriceBsBcv / gap.bcvRate : salePriceRefUSD);

  const profitAmountUSD = round2(salePriceRefUSD - cost);
  const profitMarginPct = salePriceRefUSD > 0 ? round2((profitAmountUSD / salePriceRefUSD) * 100) : 0;
  const profitMarkupPct = cost > 0 ? round2((profitAmountUSD / cost) * 100) : 0;

  return {
    salePriceRefUSD,
    salePriceBsBcv,
    salePriceUsdBcv,
    profitAmountUSD,
    profitMarginPct,
    profitMarkupPct,
  };
}

/**
 * Obtiene el precio comercial en Bs a tasa BCV de un repuesto para tienda pública y facturación.
 * NUNCA usa salePriceRefUSD ni expone costos o utilidades.
 */
export function getCommercialPriceBsBcv(
  product: Pick<Product, 'salePrice' | 'salePriceBsBcv'>,
  bcvRate: number
): number {
  const safeBcv = Number(bcvRate) > 0 ? Number(bcvRate) : 1;
  return round2((Number(product.salePrice) || 0) * safeBcv);
}

/**
 * Filtro estricto de visibilidad para tienda pública, catálogo de clientes y API pública.
 * Elimina completamente: costPrice real, costCurrencyOrigin, costPriceBs, referenceCostUSD,
 * salePriceRefUSD (precio_venta_divisa) y targetProfitPct / utilidades.
 */
export function sanitizeProductForPublic(product: Product): Product {
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    description: product.description,
    costPrice: 0, // Campo interno oculto en catálogo público
    salePrice: product.salePrice, // Precio comercial BCV (USD BCV para conversión oficial BCV)
    tracksInventory: product.tracksInventory !== false,
    ...(product.productionTimeLabel ? { productionTimeLabel: product.productionTimeLabel } : {}),
    ...(product.productionTimeNote ? { productionTimeNote: product.productionTimeNote } : {}),
    stock: product.stock,
    minStock: product.minStock,
    brand: product.brand,
    compatibility: product.compatibility,
    ...(Array.isArray(product.modelCategories) && product.modelCategories.length > 0
      ? { modelCategories: product.modelCategories }
      : {}),
    imageUrl: product.imageUrl,
    ...(Array.isArray(product.imageUrls) && product.imageUrls.length > 0
      ? { imageUrls: product.imageUrls }
      : {}),
    barcode: product.barcode,
    featured: product.featured,
  };
}

/**
 * Versión para respuesta JSON de API pública (/api/products):
 * no incluye siquiera las claves de costo ni precio de referencia en divisas ni utilidad.
 */
export function serializePublicProductForApi(product: Record<string, any>, bcvRate?: number): Record<string, any> {
  const safeSalePrice = Number(product.salePrice) || 0;
  const safeBcv = Number(bcvRate) > 0 ? Number(bcvRate) : 0;
  return {
    id: product.id,
    sku: product.sku,
    name: product.name,
    category: product.category,
    description: product.description || '',
    salePrice: safeSalePrice,
    ...(safeBcv > 0 ? { salePriceBsBcv: round2(safeSalePrice * safeBcv) } : {}),
    tracksInventory: product.tracksInventory !== false,
    ...(product.productionTimeLabel ? { productionTimeLabel: product.productionTimeLabel } : {}),
    ...(product.productionTimeNote ? { productionTimeNote: product.productionTimeNote } : {}),
    stock: Number(product.stock) || 0,
    minStock: Number(product.minStock) || 0,
    brand: product.brand || '',
    compatibility: product.compatibility || '',
    ...(Array.isArray(product.modelCategories) && product.modelCategories.length > 0
      ? { modelCategories: product.modelCategories }
      : {}),
    imageUrl: product.imageUrl || '',
    ...(Array.isArray(product.imageUrls) && product.imageUrls.length > 0
      ? { imageUrls: product.imageUrls }
      : {}),
    barcode: product.barcode || '',
    featured: Boolean(product.featured),
  };
}
