import { Product } from '../types';

export const normalizeModelText = (value?: string): string =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .trim();

const escapeRegExp = (str: string): string =>
  str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/**
 * Curated alias dictionary for the store's specialized motorcycle model categories
 * so existing inventory items that mention a model in `compatibility` or `name`
 * are also matched accurately without false positives.
 */
const CURATED_MODEL_ALIASES: Record<string, string[]> = {
  'supershadow 250 / virago xv250': [
    'supershadow 250',
    'super shadow 250',
    'supershadow',
    'super shadow',
    'virago xv250',
    'virago 250',
    'virago',
    'xv250',
    'xv 250',
  ],
  'md gavilan / halcon (cbf150)': [
    'md gavilan',
    'gavilan',
    'md halcon',
    'halcon',
    'cbf150',
    'cbf 150',
  ],
  gr250: ['gr250', 'gr 250', 'gr-250'],
  'honda falcon 400': ['honda falcon 400', 'falcon 400', 'nx4', 'nx 400', 'falcon'],
  dr650: ['dr650', 'dr 650', 'dr-650'],
  klr: ['klr', 'klr650', 'klr 650', 'klr-650'],
  'honda rebel 250 / king / keen': [
    'honda rebel 250',
    'rebel 250',
    'rebel',
    'cmx250',
    'cmx 250',
    'king 250',
    'keen 250',
    'king',
    'keen',
  ],
  'dt bera': ['dt bera', 'bera dt', 'dt 200', 'dt200', 'dt-200'],
  'kavak 150 bera': ['kavak 150 bera', 'kavak 150', 'bera kavak', 'kavak'],
  lechuza: ['lechuza', 'md lechuza'],
  'um dsr': ['um dsr', 'dsr 200', 'dsr200', 'dsr'],
};

const buildDynamicAliases = (modelCategory: string): string[] => {
  const norm = normalizeModelText(modelCategory);
  if (!norm) return [];

  const curated = CURATED_MODEL_ALIASES[norm];
  if (curated) return curated;

  const aliases = new Set<string>();
  aliases.add(norm);

  // Split by "/", ",", ";", or parentheses for multi-name models added by the user
  const segments = norm
    .split(/[/,;()]+/)
    .map((s) => s.trim())
    .filter((s) => s.length >= 2);

  for (const seg of segments) {
    aliases.add(seg);
    // Also add space-collapsed / space-split letter+digit variants (e.g. "gn 125" <-> "gn125")
    const joined = seg.replace(/([a-z])\s+(\d)/g, '$1$2');
    const spaced = seg.replace(/([a-z])(\d)/g, '$1 $2');
    if (joined.length >= 3) aliases.add(joined);
    if (spaced.length >= 3) aliases.add(spaced);
  }

  return Array.from(aliases);
};

const containsTokenWithBoundary = (haystack: string, needle: string): boolean => {
  if (!haystack || !needle) return false;
  const regex = new RegExp(`(?:^|[^a-z0-9])${escapeRegExp(needle)}(?:$|[^a-z0-9])`, 'i');
  return regex.test(haystack);
};

/**
 * Checks if a product belongs to a given specialized motorcycle model category:
 * 1) Explicit tag in `product.modelCategories` (case- and accent-insensitive).
 * 2) Smart word-boundary match in `product.compatibility` or `product.name`.
 */
export const doesProductMatchModelCategory = (
  product: Pick<Product, 'modelCategories' | 'compatibility' | 'name'>,
  modelCategory: string
): boolean => {
  const targetNorm = normalizeModelText(modelCategory);
  if (!targetNorm) return false;

  if (Array.isArray(product.modelCategories) && product.modelCategories.length > 0) {
    const hasExplicit = product.modelCategories.some(
      (mc) => normalizeModelText(mc) === targetNorm
    );
    if (hasExplicit) return true;
  }

  const combinedText = normalizeModelText(`${product.compatibility || ''} ${product.name || ''}`);
  if (!combinedText) return false;

  const aliases = buildDynamicAliases(modelCategory);
  return aliases.some((alias) => containsTokenWithBoundary(combinedText, alias));
};

/**
 * Returns all specialized model categories matched by a product (explicitly assigned first,
 * followed by inferred matches from compatibility/name).
 */
export const getProductModelCategories = (
  product: Pick<Product, 'modelCategories' | 'compatibility' | 'name'>,
  availableModelCategories: string[]
): string[] => {
  const result: string[] = [];
  const seen = new Set<string>();

  if (Array.isArray(product.modelCategories)) {
    for (const raw of product.modelCategories) {
      const cleaned = (raw || '').trim();
      const key = normalizeModelText(cleaned);
      if (key && !seen.has(key)) {
        seen.add(key);
        result.push(cleaned);
      }
    }
  }

  for (const modelCat of availableModelCategories) {
    const key = normalizeModelText(modelCat);
    if (!key || seen.has(key)) continue;
    if (doesProductMatchModelCategory(product, modelCat)) {
      seen.add(key);
      result.push(modelCat);
    }
  }

  return result;
};
