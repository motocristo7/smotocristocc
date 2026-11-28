import React from 'react';
import maletaParaMotoImg from '../assets/images/maleta_para_moto_1793720416522.jpg';
import brakeKitImg from '../assets/images/brake_kit_part_1793482050634.jpg';
import exhaustImg from '../assets/images/exhaust_system_part_1793482051770.jpg';
import helmetImg from '../assets/images/helmet_moto_part_1793482052443.jpg';
import upholsterySeatImg from '../assets/images/moto_upholstery_seat_1793482052580.jpg';
import heroWorkshopImg from '../assets/images/hero_moto_workshop_1793482050114.jpg';

/**
 * Bundled ES-imported product & storefront images so Vite always serves valid assets
 * across dev, ais-pre- preview, and production Vercel builds.
 */
export const PRESET_PRODUCT_IMAGES = {
  maletaParaMoto: maletaParaMotoImg,
  brakeKit: brakeKitImg,
  exhaust: exhaustImg,
  helmet: helmetImg,
  upholsterySeat: upholsterySeatImg,
  heroWorkshop: heroWorkshopImg,
};

const LEGACY_ASSET_PATH_MAP: Record<string, string> = {
  '/src/assets/images/maleta_para_moto_1793720416522.jpg': maletaParaMotoImg,
  '/src/assets/images/brake_kit_part_1793482050634.jpg': brakeKitImg,
  '/src/assets/images/exhaust_system_part_1793482051770.jpg': exhaustImg,
  '/src/assets/images/helmet_moto_part_1793482052443.jpg': helmetImg,
  '/src/assets/images/moto_upholstery_seat_1793482052580.jpg': upholsterySeatImg,
  '/src/assets/images/hero_moto_workshop_1793482050114.jpg': heroWorkshopImg,
};

/**
 * Extracts the file ID from any Google Drive sharing or viewing link.
 */
export function extractGoogleDriveId(url: string): string | null {
  if (!url) return null;
  const trimmed = url.trim();

  // Pattern 1: /file/d/FILE_ID
  const matchFileD = trimmed.match(/\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (matchFileD && matchFileD[1]) return matchFileD[1];

  // Pattern 2: id=FILE_ID or &id=FILE_ID
  const matchIdParam = trimmed.match(/[?&]id=([a-zA-Z0-9_-]+)/);
  if (matchIdParam && matchIdParam[1]) return matchIdParam[1];

  // Pattern 3: /d/FILE_ID (googleusercontent or drive direct)
  const matchD = trimmed.match(/\/d\/([a-zA-Z0-9_-]+)/);
  if (matchD && matchD[1]) return matchD[1];

  return null;
}

/**
 * Returns true if the URL points to Google Drive
 */
export function isGoogleDriveUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.toLowerCase();
  return (
    lower.includes('drive.google.com') ||
    lower.includes('docs.google.com') ||
    lower.includes('googleusercontent.com')
  );
}

/**
 * Converts any Google Drive view/share link to Google's direct CDN image format,
 * and maps legacy /src/assets/images/... string paths to Vite-bundled asset URLs.
 */
export function normalizeImageUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  if (LEGACY_ASSET_PATH_MAP[trimmed]) {
    return LEGACY_ASSET_PATH_MAP[trimmed];
  }

  if (isGoogleDriveUrl(trimmed)) {
    const fileId = extractGoogleDriveId(trimmed);
    if (fileId) {
      return `https://lh3.googleusercontent.com/d/${fileId}`;
    }
  }

  return trimmed;
}

/**
 * Alternative Google Drive thumbnail endpoint in case the primary CDN encounters CORS/cookie issues
 */
export function getGoogleDriveThumbnailUrl(fileId: string, size = 1000): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
}

/**
 * Returns an always-available bundled category image when an external URL fails or is private.
 */
export function getFallbackProductImage(name?: string, category?: string): string {
  const lowerName = (name || '').toLowerCase();
  const lowerCat = (category || '').toLowerCase();

  if (lowerName.includes('maleta') || lowerName.includes('baul') || lowerName.includes('baúl')) {
    return maletaParaMotoImg;
  }
  if (lowerName.includes('casco') || lowerName.includes('helmet')) {
    return helmetImg;
  }
  if (
    lowerCat.includes('tapicer') ||
    lowerName.includes('forro') ||
    lowerName.includes('asiento') ||
    lowerName.includes('sillin') ||
    lowerName.includes('sillín')
  ) {
    return upholsterySeatImg;
  }
  if (
    lowerCat.includes('motor') ||
    lowerCat.includes('transmisi') ||
    lowerCat.includes('lubricante') ||
    lowerName.includes('escape') ||
    lowerName.includes('biela') ||
    lowerName.includes('bujia') ||
    lowerName.includes('bujía') ||
    lowerName.includes('cadena') ||
    lowerName.includes('aceite')
  ) {
    return exhaustImg;
  }
  return brakeKitImg;
}

/**
 * Resilient multi-step onError handler for product <img> tags:
 * 1) If Google Drive lh3 fails, try drive.google.com/thumbnail?id=...
 * 2) Otherwise (or if thumbnail also fails), switch cleanly to the Vite-bundled category image.
 */
export function handleProductImageError(
  e: React.SyntheticEvent<HTMLImageElement>,
  product?: { name?: string; category?: string; imageUrl?: string }
): void {
  const target = e.currentTarget;
  const step = target.dataset.fallbackStep || '0';

  if (step === '0') {
    const driveId = extractGoogleDriveId(target.src || product?.imageUrl || '');
    if (driveId && !target.src.includes('drive.google.com/thumbnail')) {
      target.dataset.fallbackStep = '1';
      target.src = getGoogleDriveThumbnailUrl(driveId, 1000);
      return;
    }
  }

  if (step !== 'done') {
    target.dataset.fallbackStep = 'done';
    target.src = getFallbackProductImage(product?.name, product?.category);
  }
}

export const MAX_PRODUCT_IMAGES = 6;

/**
 * Returns true if the URL is a legacy inline base64 Data URL.
 */
export function isEmbeddedImageUrl(url?: string): boolean {
  return Boolean(url && url.trim().toLowerCase().startsWith('data:image/'));
}

/**
 * Returns true if the URL is hosted on Firebase Storage.
 */
export function isFirebaseStorageImageUrl(url?: string): boolean {
  if (!url) return false;
  const lower = url.trim().toLowerCase();
  return (
    lower.includes('firebasestorage.googleapis.com') ||
    lower.includes('firebasestorage.app') ||
    lower.includes('storage.googleapis.com')
  );
}

/**
 * Returns true if the URL is one of the built-in bundled fallback placeholder assets.
 */
export function isPresetFallbackImageUrl(url?: string): boolean {
  if (!url) return false;
  const norm = normalizeImageUrl(url);
  return Object.values(PRESET_PRODUCT_IMAGES).includes(norm);
}

/**
 * Returns true if the URL is a real uploaded photo hosted on Firebase Storage (or legacy embedded photo).
 */
export function isUploadedImageUrl(url?: string): boolean {
  if (!url) return false;
  return isFirebaseStorageImageUrl(url) || isEmbeddedImageUrl(url);
}

/**
 * Collects all normalized unique images of a product (primary `imageUrl` first, followed by `imageUrls`).
 */
export function getProductImages(
  product?: { imageUrl?: string; imageUrls?: string[]; name?: string; category?: string } | null,
  includeFallback = true
): string[] {
  const result: string[] = [];
  const seen = new Set<string>();

  const pushUrl = (raw?: string) => {
    const norm = normalizeImageUrl(raw);
    if (!norm || seen.has(norm)) return;
    seen.add(norm);
    result.push(norm);
  };

  if (product) {
    if (Array.isArray(product.imageUrls) && product.imageUrls.length > 0) {
      // Preserve explicit ordering from imageUrls first, then include imageUrl if distinct
      product.imageUrls.forEach(pushUrl);
      pushUrl(product.imageUrl);
    } else {
      pushUrl(product.imageUrl);
    }
  }

  if (result.length === 0 && includeFallback) {
    result.push(getFallbackProductImage(product?.name, product?.category));
  }

  return result;
}

/**
 * Returns true if the product has at least one real uploaded photo (Firebase Storage URL or legacy uploaded photo).
 */
export function hasAnyEmbeddedImage(
  product?: { imageUrl?: string; imageUrls?: string[] } | null
): boolean {
  if (!product) return false;
  if (isUploadedImageUrl(product.imageUrl)) return true;
  if (Array.isArray(product.imageUrls)) {
    return product.imageUrls.some((u) => isUploadedImageUrl(u));
  }
  return false;
}

