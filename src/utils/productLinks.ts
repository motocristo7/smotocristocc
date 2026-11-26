import { Product } from '../types';
import { formatBs, formatUSD, getPublicAppOrigin } from './whatsapp';

const PRODUCT_QUERY_KEYS = ['repuesto', 'producto', 'item', 'sku', 'p'] as const;

export function slugifyProductName(name: string): string {
  return (name || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48)
    .replace(/-+$/, '');
}

export function buildProductUrlParam(product: Pick<Product, 'id' | 'name'>): string {
  const slug = slugifyProductName(product.name);
  return slug ? `${slug}--${product.id}` : product.id;
}

export function buildProductShareUrl(
  product: Pick<Product, 'id' | 'name'>,
  storeOrigin?: string
): string {
  const origin = (storeOrigin || getPublicAppOrigin()).replace(/\/+$/, '');
  const param = buildProductUrlParam(product);
  return `${origin}/?repuesto=${encodeURIComponent(param)}`;
}

export function extractProductRefFromLocation(
  loc?: { pathname: string; search: string }
): string | null {
  const target =
    loc ||
    (typeof window !== 'undefined'
      ? { pathname: window.location.pathname, search: window.location.search }
      : null);

  if (!target) return null;

  try {
    const params = new URLSearchParams(target.search || '');
    for (const key of PRODUCT_QUERY_KEYS) {
      const val = params.get(key);
      if (val && val.trim()) {
        return val.trim();
      }
    }
  } catch {
    // ignore malformed query string
  }

  const pathMatch = (target.pathname || '').match(/^\/(?:repuesto|producto)\/([^/?#]+)/i);
  if (pathMatch && pathMatch[1]) {
    try {
      return decodeURIComponent(pathMatch[1]).trim();
    } catch {
      return pathMatch[1].trim();
    }
  }

  return null;
}

export function hasProductDeepLinkInLocation(
  loc?: { pathname: string; search: string }
): boolean {
  return Boolean(extractProductRefFromLocation(loc));
}

export function findProductByUrlRef<T extends Pick<Product, 'id' | 'sku' | 'name'>>(
  products: T[],
  rawRef: string | null
): T | null {
  if (!rawRef || !products.length) return null;

  let decoded = rawRef.trim();
  try {
    decoded = decodeURIComponent(decoded).trim();
  } catch {
    // keep rawRef if already decoded or malformed
  }
  if (!decoded) return null;

  const lower = decoded.toLowerCase();

  // 1. Exact product ID match
  const exactId = products.find((p) => p.id === decoded || p.id.toLowerCase() === lower);
  if (exactId) return exactId;

  // 2. Slug + "--" + product ID match (primary generated format)
  const sepIdx = decoded.lastIndexOf('--');
  if (sepIdx !== -1) {
    const idPart = decoded.slice(sepIdx + 2).trim();
    if (idPart) {
      const idPartLower = idPart.toLowerCase();
      const byEmbeddedId = products.find(
        (p) => p.id === idPart || p.id.toLowerCase() === idPartLower
      );
      if (byEmbeddedId) return byEmbeddedId;
    }
  }

  // 3. Exact SKU match (case-insensitive)
  const bySku = products.find((p) => p.sku && p.sku.trim().toLowerCase() === lower);
  if (bySku) return bySku;

  // 4. Slug match on product name (fallback)
  const refSlug = slugifyProductName(sepIdx !== -1 ? decoded.slice(0, sepIdx) : decoded);
  if (refSlug) {
    const bySlug = products.find((p) => slugifyProductName(p.name) === refSlug);
    if (bySlug) return bySlug;
  }

  return null;
}

export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (typeof navigator !== 'undefined' && navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to execCommand fallback (iframe / older mobile browsers)
    }
  }

  if (typeof document === 'undefined') return false;
  const tempInput = document.createElement('textarea');
  tempInput.value = text;
  tempInput.setAttribute('readonly', '');
  tempInput.style.position = 'fixed';
  tempInput.style.opacity = '0';
  tempInput.style.left = '-9999px';
  document.body.appendChild(tempInput);
  tempInput.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    document.body.removeChild(tempInput);
  }
}

export function buildProductWhatsAppShareUrl(
  product: Product,
  bcvRate: number,
  commercialName: string,
  storeOrigin?: string
): string {
  const link = buildProductShareUrl(product, storeOrigin);
  const priceUsd = formatUSD(product.salePrice);
  const priceBs = formatBs(product.salePrice * bcvRate);
  const compatLine = product.compatibility?.trim()
    ? `\n🏍️ *Compatible con:* ${product.compatibility.trim()}`
    : '';
  const text = `🔧 *${product.name}*${compatLine}\n💵 *Precio:* ${priceUsd} (${priceBs} a tasa BCV)\n🛒 *Ver fotos, detalles y comprar aquí:*\n${link}\n\n— *${commercialName}*`;
  return `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
}
