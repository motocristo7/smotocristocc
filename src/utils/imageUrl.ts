/**
 * Utility for handling, detecting, and normalizing product image URLs,
 * especially converting Google Drive view/share links into direct embeddable image CDN URLs.
 */

export const PRESET_PRODUCT_IMAGES = {
  maletaParaMoto: '/src/assets/images/maleta_para_moto_1793720416522.jpg',
  brakeKit: '/src/assets/images/brake_kit_part_1793482050634.jpg',
  exhaust: '/src/assets/images/exhaust_system_part_1793482051770.jpg',
  helmet: '/src/assets/images/helmet_moto_part_1793482052443.jpg',
  upholsterySeat: '/src/assets/images/moto_upholstery_seat_1793482052580.jpg',
};

/**
 * Extracts the file ID from any Google Drive sharing or viewing link.
 * Examples:
 * - https://drive.google.com/file/d/1A2B3C4D5E.../view?usp=sharing
 * - https://drive.google.com/open?id=1A2B3C4D5E...
 * - https://drive.google.com/uc?id=1A2B3C4D5E...
 * - https://lh3.googleusercontent.com/d/1A2B3C4D5E...
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
 * Converts any Google Drive view or sharing link to Google's direct CDN image format.
 * If already a direct link or relative asset, trims and returns it.
 */
export function normalizeImageUrl(url?: string): string {
  if (!url) return '';
  const trimmed = url.trim();
  if (!trimmed) return '';

  if (isGoogleDriveUrl(trimmed)) {
    const fileId = extractGoogleDriveId(trimmed);
    if (fileId) {
      // lh3.googleusercontent.com/d/{id} is Google's modern CDN endpoint for raw image bytes
      return `https://lh3.googleusercontent.com/d/${fileId}`;
    }
  }

  return trimmed;
}

/**
 * Alternative Google Drive thumbnail endpoint in case the primary CDN encounters CORS
 */
export function getGoogleDriveThumbnailUrl(fileId: string, size = 1000): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${size}`;
}
