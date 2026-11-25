import { Product, WholesaleDiscountTier } from '../types';

const round2 = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

export const SUGGESTED_WHOLESALE_TIERS: Array<{ minQty: number; discountPct: number }> = [
  { minQty: 3, discountPct: 5 },
  { minQty: 6, discountPct: 10 },
  { minQty: 12, discountPct: 15 },
];

export const AGGRESSIVE_WHOLESALE_TIERS: Array<{ minQty: number; discountPct: number }> = [
  { minQty: 3, discountPct: 8 },
  { minQty: 6, discountPct: 15 },
  { minQty: 12, discountPct: 22 },
];

export function normalizeWholesaleTiers(
  tiers: WholesaleDiscountTier[] | undefined | null
): WholesaleDiscountTier[] {
  if (!Array.isArray(tiers)) return [];
  const byQty = new Map<number, WholesaleDiscountTier>();

  tiers.forEach((tier, idx) => {
    const minQty = Math.max(2, Math.floor(Number(tier.minQty) || 0));
    const discountPct = Math.min(90, Math.max(0.5, round2(Number(tier.discountPct) || 0)));
    if (!Number.isFinite(minQty) || !Number.isFinite(discountPct) || minQty < 2 || discountPct <= 0) {
      return;
    }
    const existing = byQty.get(minQty);
    if (!existing || discountPct > existing.discountPct) {
      byQty.set(minQty, {
        id: tier.id || `tier-${minQty}-${idx}`,
        minQty,
        discountPct,
      });
    }
  });

  return Array.from(byQty.values()).sort((a, b) => a.minQty - b.minQty);
}

export function productHasWholesaleTiers(
  product?: Pick<Product, 'wholesaleTiers'> | null
): boolean {
  return normalizeWholesaleTiers(product?.wholesaleTiers).length > 0;
}

export interface ProductWholesaleDisplayTier {
  id: string;
  minQty: number;
  discountPct: number;
  unitPriceUSD: number;
}

export function getProductWholesaleDisplayTiers(product: Product): {
  tiers: ProductWholesaleDisplayTier[];
  hasWholesale: boolean;
  maxDiscountPct: number;
} {
  const normalized = normalizeWholesaleTiers(product.wholesaleTiers);
  if (normalized.length === 0) {
    return { tiers: [], hasWholesale: false, maxDiscountPct: 0 };
  }

  const tiers: ProductWholesaleDisplayTier[] = normalized.map((t) => ({
    id: t.id,
    minQty: t.minQty,
    discountPct: t.discountPct,
    unitPriceUSD: round2(Math.max(0, (Number(product.salePrice) || 0) * (1 - t.discountPct / 100))),
  }));

  const maxDiscountPct = tiers.reduce((max, t) => Math.max(max, t.discountPct), 0);

  return {
    tiers,
    hasWholesale: tiers.length > 0,
    maxDiscountPct,
  };
}

export interface CartWholesaleItemSummary {
  product: Product;
  quantity: number;
  regularUnitPriceUSD: number;
  effectiveUnitPriceUSD: number;
  regularSubtotalUSD: number;
  finalSubtotalUSD: number;
  discountPct: number;
  savingsUSD: number;
  appliedTierMinQty?: number;
  nextTierHint?: {
    missingQty: number;
    targetMinQty: number;
    nextDiscountPct: number;
  };
}

export interface CartWholesaleSummary {
  items: CartWholesaleItemSummary[];
  subtotalBeforeDiscountUSD: number;
  totalDiscountUSD: number;
  finalTotalUSD: number;
  finalTotalBs: number;
  hasAnyWholesaleDiscount: boolean;
}

export function calculateCartWholesaleSummary(
  cart: Array<{ product: Product; quantity: number }>,
  bcvRate: number
): CartWholesaleSummary {
  const safeRate = Number(bcvRate) > 0 ? Number(bcvRate) : 1;

  const itemSummaries: CartWholesaleItemSummary[] = cart.map((item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const regularUnitPriceUSD = round2(Math.max(0, Number(item.product.salePrice) || 0));
    const regularSubtotalUSD = round2(regularUnitPriceUSD * qty);

    const tiers = normalizeWholesaleTiers(item.product.wholesaleTiers);
    const unlockedTiers = tiers.filter((t) => qty >= t.minQty);
    const activeTier = unlockedTiers[unlockedTiers.length - 1];

    const discountPct = activeTier ? activeTier.discountPct : 0;
    const nextTier = tiers.find((t) => t.minQty > qty && t.discountPct > discountPct);

    const effectiveUnitPriceUSD =
      discountPct > 0
        ? round2(Math.max(0, regularUnitPriceUSD * (1 - discountPct / 100)))
        : regularUnitPriceUSD;
    const finalSubtotalUSD = round2(effectiveUnitPriceUSD * qty);
    const savingsUSD = round2(Math.max(0, regularSubtotalUSD - finalSubtotalUSD));

    return {
      product: item.product,
      quantity: qty,
      regularUnitPriceUSD,
      effectiveUnitPriceUSD,
      regularSubtotalUSD,
      finalSubtotalUSD,
      discountPct,
      savingsUSD,
      appliedTierMinQty: activeTier?.minQty,
      nextTierHint: nextTier
        ? {
            missingQty: nextTier.minQty - qty,
            targetMinQty: nextTier.minQty,
            nextDiscountPct: nextTier.discountPct,
          }
        : undefined,
    };
  });

  const subtotalBeforeDiscountUSD = round2(
    itemSummaries.reduce((sum, it) => sum + it.regularSubtotalUSD, 0)
  );
  const finalTotalUSD = round2(
    itemSummaries.reduce((sum, it) => sum + it.finalSubtotalUSD, 0)
  );
  const totalDiscountUSD = round2(Math.max(0, subtotalBeforeDiscountUSD - finalTotalUSD));
  const finalTotalBs = round2(finalTotalUSD * safeRate);

  return {
    items: itemSummaries,
    subtotalBeforeDiscountUSD,
    totalDiscountUSD,
    finalTotalUSD,
    finalTotalBs,
    hasAnyWholesaleDiscount: totalDiscountUSD > 0,
  };
}
