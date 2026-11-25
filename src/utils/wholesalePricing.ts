import {
  Product,
  WholesaleDiscountRule,
  WholesaleDiscountTier,
  WholesaleFilterScope,
} from '../types';
import { doesProductMatchModelCategory } from './modelCategories';

const round2 = (value: number): number => Math.round((Number(value) || 0) * 100) / 100;

export const SUGGESTED_WHOLESALE_TIERS: Array<{ minQty: number; discountPct: number }> = [
  { minQty: 3, discountPct: 5 },
  { minQty: 6, discountPct: 10 },
  { minQty: 12, discountPct: 15 },
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

export function getWholesaleRuleLabel(rule: Pick<WholesaleDiscountRule, 'scope' | 'filterValue'>): string {
  if (rule.scope === 'ALL') return 'Toda la tienda';
  if (rule.scope === 'CATEGORY') return `Categoría: ${rule.filterValue}`;
  return `Modelo: ${rule.filterValue}`;
}

export function doesProductMatchWholesaleRule(
  product: Product,
  rule: WholesaleDiscountRule
): boolean {
  if (!rule.active) return false;
  const tiers = normalizeWholesaleTiers(rule.tiers);
  if (tiers.length === 0) return false;

  if (rule.scope === 'ALL') return true;
  if (rule.scope === 'CATEGORY') {
    return (
      (product.category || '').trim().toLowerCase() ===
      (rule.filterValue || '').trim().toLowerCase()
    );
  }
  if (rule.scope === 'MODEL') {
    return doesProductMatchModelCategory(product, rule.filterValue);
  }
  return false;
}

export function getActiveWholesaleRuleForFilter(
  scope: WholesaleFilterScope,
  filterValue: string,
  rules: WholesaleDiscountRule[] | undefined | null
): (WholesaleDiscountRule & { tiers: WholesaleDiscountTier[] }) | null {
  if (!Array.isArray(rules) || rules.length === 0) return null;
  const target = (filterValue || '').trim().toLowerCase();
  const found = rules.find((r) => {
    if (!r.active || r.scope !== scope) return false;
    if (scope === 'ALL') return true;
    return (r.filterValue || '').trim().toLowerCase() === target;
  });
  if (!found) return null;
  const tiers = normalizeWholesaleTiers(found.tiers);
  if (tiers.length === 0) return null;
  return { ...found, tiers };
}

export function getMaxDiscountPctForFilter(
  scope: WholesaleFilterScope,
  filterValue: string,
  rules: WholesaleDiscountRule[] | undefined | null
): number {
  const rule = getActiveWholesaleRuleForFilter(scope, filterValue, rules);
  if (!rule || rule.tiers.length === 0) return 0;
  return rule.tiers.reduce((max, t) => Math.max(max, t.discountPct), 0);
}

export interface ProductWholesaleDisplayTier {
  minQty: number;
  discountPct: number;
  unitPriceUSD: number;
  ruleLabel: string;
  combineAcrossFilter: boolean;
}

export function getProductWholesaleDisplayTiers(
  product: Product,
  rules: WholesaleDiscountRule[] | undefined | null
): {
  tiers: ProductWholesaleDisplayTier[];
  hasWholesale: boolean;
  combineAcrossFilter: boolean;
  primaryRuleLabel: string;
} {
  if (!Array.isArray(rules) || rules.length === 0) {
    return { tiers: [], hasWholesale: false, combineAcrossFilter: false, primaryRuleLabel: '' };
  }

  const matchingRules = rules
    .filter((r) => doesProductMatchWholesaleRule(product, r))
    .map((r) => ({
      ...r,
      tiers: normalizeWholesaleTiers(r.tiers),
    }))
    .filter((r) => r.tiers.length > 0);

  if (matchingRules.length === 0) {
    return { tiers: [], hasWholesale: false, combineAcrossFilter: false, primaryRuleLabel: '' };
  }

  // Collect all candidate minQty breakpoints across all matching rules
  const qtySet = new Set<number>();
  matchingRules.forEach((r) => r.tiers.forEach((t) => qtySet.add(t.minQty)));
  const sortedQtys = Array.from(qtySet).sort((a, b) => a - b);

  const effectiveTiers: ProductWholesaleDisplayTier[] = [];
  let highestDiscountSoFar = 0;

  for (const qty of sortedQtys) {
    let bestPct = 0;
    let bestRule: WholesaleDiscountRule | null = null;

    for (const rule of matchingRules) {
      const unlocked = rule.tiers.filter((t) => qty >= t.minQty);
      const top = unlocked[unlocked.length - 1];
      if (top && top.discountPct > bestPct) {
        bestPct = top.discountPct;
        bestRule = rule;
      }
    }

    if (bestPct > highestDiscountSoFar && bestRule) {
      highestDiscountSoFar = bestPct;
      const unitPriceUSD = round2(Math.max(0, product.salePrice * (1 - bestPct / 100)));
      effectiveTiers.push({
        minQty: qty,
        discountPct: bestPct,
        unitPriceUSD,
        ruleLabel: getWholesaleRuleLabel(bestRule),
        combineAcrossFilter: bestRule.combineAcrossFilter !== false,
      });
    }
  }

  return {
    tiers: effectiveTiers,
    hasWholesale: effectiveTiers.length > 0,
    combineAcrossFilter: effectiveTiers.some((t) => t.combineAcrossFilter),
    primaryRuleLabel: effectiveTiers[0]?.ruleLabel || '',
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
  appliedRuleLabel?: string;
  effectiveQtyUsed: number;
  nextTierHint?: {
    missingQty: number;
    targetMinQty: number;
    nextDiscountPct: number;
    ruleLabel: string;
    combineAcrossFilter: boolean;
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
  rules: WholesaleDiscountRule[] | undefined | null,
  bcvRate: number
): CartWholesaleSummary {
  const safeRate = Number(bcvRate) > 0 ? Number(bcvRate) : 1;
  const activeRules = Array.isArray(rules)
    ? rules
        .filter((r) => r.active)
        .map((r) => ({ ...r, tiers: normalizeWholesaleTiers(r.tiers) }))
        .filter((r) => r.tiers.length > 0)
    : [];

  // Precompute combined quantity in cart for each active rule
  const combinedQtyByRuleId = new Map<string, number>();
  activeRules.forEach((rule) => {
    let sum = 0;
    cart.forEach((item) => {
      if (doesProductMatchWholesaleRule(item.product, rule)) {
        sum += Math.max(0, Number(item.quantity) || 0);
      }
    });
    combinedQtyByRuleId.set(rule.id, sum);
  });

  const itemSummaries: CartWholesaleItemSummary[] = cart.map((item) => {
    const qty = Math.max(1, Number(item.quantity) || 1);
    const regularUnitPriceUSD = round2(Math.max(0, Number(item.product.salePrice) || 0));
    const regularSubtotalUSD = round2(regularUnitPriceUSD * qty);

    let bestDiscountPct = 0;
    let bestRuleLabel: string | undefined;
    let bestEffectiveQtyUsed = qty;

    let bestNextTierHint: CartWholesaleItemSummary['nextTierHint'] | undefined;

    for (const rule of activeRules) {
      if (!doesProductMatchWholesaleRule(item.product, rule)) continue;
      const combine = rule.combineAcrossFilter !== false;
      const effectiveQty = combine ? combinedQtyByRuleId.get(rule.id) || qty : qty;

      const unlockedTiers = rule.tiers.filter((t) => effectiveQty >= t.minQty);
      const topUnlocked = unlockedTiers[unlockedTiers.length - 1];
      if (topUnlocked && topUnlocked.discountPct > bestDiscountPct) {
        bestDiscountPct = topUnlocked.discountPct;
        bestRuleLabel = getWholesaleRuleLabel(rule);
        bestEffectiveQtyUsed = effectiveQty;
      }

      const nextTier = rule.tiers.find(
        (t) => t.minQty > effectiveQty && t.discountPct > bestDiscountPct
      );
      if (nextTier) {
        const missingQty = nextTier.minQty - effectiveQty;
        if (
          !bestNextTierHint ||
          missingQty < bestNextTierHint.missingQty ||
          (missingQty === bestNextTierHint.missingQty &&
            nextTier.discountPct > bestNextTierHint.nextDiscountPct)
        ) {
          bestNextTierHint = {
            missingQty,
            targetMinQty: nextTier.minQty,
            nextDiscountPct: nextTier.discountPct,
            ruleLabel: getWholesaleRuleLabel(rule),
            combineAcrossFilter: combine,
          };
        }
      }
    }

    // Re-filter nextTierHint in case another rule already beat nextTierHint's discountPct
    if (bestNextTierHint && bestNextTierHint.nextDiscountPct <= bestDiscountPct) {
      bestNextTierHint = undefined;
    }

    const effectiveUnitPriceUSD =
      bestDiscountPct > 0
        ? round2(Math.max(0, regularUnitPriceUSD * (1 - bestDiscountPct / 100)))
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
      discountPct: bestDiscountPct,
      savingsUSD,
      appliedRuleLabel: bestRuleLabel,
      effectiveQtyUsed: bestEffectiveQtyUsed,
      nextTierHint: bestNextTierHint,
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
