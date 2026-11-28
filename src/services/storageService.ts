import { ref, uploadBytes, getDownloadURL } from 'firebase/storage';
import { storage } from '../firebase';

export type StorageImageFolder =
  | 'products'
  | 'service-orders'
  | 'purchase-orders'
  | 'settings';

export function isBase64ImageUrl(url?: unknown): boolean {
  return typeof url === 'string' && url.trim().toLowerCase().startsWith('data:image/');
}

export function isFirebaseStorageUrl(url?: unknown): boolean {
  if (typeof url !== 'string') return false;
  const lower = url.trim().toLowerCase();
  return (
    lower.includes('firebasestorage.googleapis.com') ||
    lower.includes('firebasestorage.app') ||
    lower.includes('storage.googleapis.com')
  );
}

export function isServerUploadedImageUrl(url?: unknown): boolean {
  if (typeof url !== 'string') return false;
  const trimmed = url.trim();
  return trimmed.startsWith('/uploads/') || trimmed.toLowerCase().includes('/uploads/');
}

// Circuit breaker: if Firebase Storage bucket is not activated yet (404/CORS),
// avoid waiting 5.5s on every subsequent image upload during the session.
const FIREBASE_STORAGE_UPLOAD_TIMEOUT_MS = 5500;
const FIREBASE_STORAGE_COOLDOWN_MS = 10 * 60 * 1000;
let firebaseStorageUnavailableUntil = 0;

function withTimeout<T>(promise: Promise<T>, ms: number, timeoutMessage: string): Promise<T> {
  return new Promise<T>((resolve, reject) => {
    const timer = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, ms);
    promise.then(
      (value) => {
        window.clearTimeout(timer);
        resolve(value);
      },
      (err) => {
        window.clearTimeout(timer);
        reject(err);
      }
    );
  });
}

async function uploadBlobToServerStorage(
  blob: Blob,
  folder: StorageImageFolder,
  safePrefix: string
): Promise<string> {
  const controller = new AbortController();
  const timer = window.setTimeout(() => controller.abort(), 20000);
  try {
    const params = new URLSearchParams({
      folder,
      prefix: safePrefix,
    });
    const response = await fetch(`/api/uploads/image?${params.toString()}`, {
      method: 'POST',
      headers: {
        'Content-Type': blob.type || 'image/jpeg',
      },
      body: blob,
      signal: controller.signal,
    });

    const data = await response.json().catch(() => null);
    if (!response.ok || !data?.success || typeof data?.url !== 'string' || !data.url) {
      throw new Error(data?.error || `Error HTTP ${response.status} al guardar la imagen.`);
    }
    if (isBase64ImageUrl(data.url)) {
      throw new Error('El servidor devolvió una URL inválida.');
    }
    return data.url;
  } finally {
    window.clearTimeout(timer);
  }
}

async function uploadBlobWithCloudAndFallback(
  blob: Blob,
  folder: StorageImageFolder,
  safePrefix: string,
  ext: string,
  contentType: string
): Promise<string> {
  const randomSuffix = Math.random().toString(36).slice(2, 8);
  const storagePath = `${folder}/${safePrefix}_${Date.now()}_${randomSuffix}.${ext}`;
  const storageRef = ref(storage, storagePath);

  let firebaseError: unknown = null;

  if (Date.now() >= firebaseStorageUnavailableUntil) {
    try {
      await withTimeout(
        uploadBytes(storageRef, blob, {
          contentType,
          cacheControl: 'public, max-age=31536000',
        }),
        FIREBASE_STORAGE_UPLOAD_TIMEOUT_MS,
        'Firebase Storage no respondió a tiempo (bucket no activado o bloqueado por CORS).'
      );
      const downloadUrl = await withTimeout(
        getDownloadURL(storageRef),
        FIREBASE_STORAGE_UPLOAD_TIMEOUT_MS,
        'Firebase Storage tardó demasiado en devolver la URL.'
      );
      if (downloadUrl && !isBase64ImageUrl(downloadUrl)) {
        return downloadUrl;
      }
    } catch (err) {
      firebaseError = err;
      firebaseStorageUnavailableUntil = Date.now() + FIREBASE_STORAGE_COOLDOWN_MS;
      console.warn(
        'Firebase Storage no disponible aún; usando servidor de imágenes de la aplicación (/uploads):',
        err instanceof Error ? err.message : err
      );
    }
  }

  try {
    return await uploadBlobToServerStorage(blob, folder, safePrefix);
  } catch (serverErr) {
    throw buildFriendlyStorageError(firebaseError || serverErr);
  }
}

function sanitizeStoragePrefix(raw?: string): string {
  const cleaned = (raw || 'img')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-zA-Z0-9_-]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 40);
  return cleaned || 'img';
}

/**
 * Resizes and compresses an image File directly into a JPEG Blob using an Object URL + Canvas.
 * Never produces or stores a base64 Data URL.
 */
export async function compressImageFileToBlob(
  file: File,
  maxDimension = 1080,
  quality = 0.82
): Promise<Blob> {
  if (!file || !file.type.startsWith('image/')) {
    throw new Error('Selecciona un archivo de imagen válido (JPG, PNG o WebP).');
  }

  return new Promise<Blob>((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const img = new Image();

    const cleanup = () => {
      try {
        URL.revokeObjectURL(objectUrl);
      } catch {
        // ignore
      }
    };

    img.onerror = () => {
      cleanup();
      reject(new Error('No se pudo leer la imagen seleccionada.'));
    };

    img.onload = () => {
      try {
        let { width, height } = img;
        if (width > maxDimension || height > maxDimension) {
          if (width >= height) {
            height = Math.max(1, Math.round((height * maxDimension) / width));
            width = maxDimension;
          } else {
            width = Math.max(1, Math.round((width * maxDimension) / height));
            height = maxDimension;
          }
        }

        const canvas = document.createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d');
        if (!ctx) {
          cleanup();
          reject(new Error('No se pudo procesar la imagen en el navegador.'));
          return;
        }

        // Fill white background so transparent PNG/WebP cutouts render cleanly in JPEG
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, width, height);
        ctx.drawImage(img, 0, 0, width, height);

        canvas.toBlob(
          (blob) => {
            cleanup();
            if (!blob) {
              reject(new Error('No se pudo comprimir la imagen para subirla.'));
              return;
            }
            resolve(blob);
          },
          'image/jpeg',
          quality
        );
      } catch (err) {
        cleanup();
        reject(err instanceof Error ? err : new Error('Error procesando la imagen.'));
      }
    };

    img.src = objectUrl;
  });
}

function buildFriendlyStorageError(error: unknown): Error {
  const rawMessage = error instanceof Error ? error.message : String(error || '');
  const code = (error as { code?: string } | null)?.code || '';

  if (code === 'storage/unauthorized' || rawMessage.includes('storage/unauthorized')) {
    return new Error(
      'Permiso denegado en Firebase Storage. Habilita las reglas de escritura en tu bucket de Firebase Storage para subir imágenes.'
    );
  }
  if (code === 'storage/bucket-not-found' || rawMessage.includes('storage/bucket-not-found')) {
    return new Error(
      'Firebase Storage no está activado aún en este proyecto. Activa Storage en Firebase Console para guardar fotos en la nube.'
    );
  }
  if (code === 'storage/quota-exceeded' || rawMessage.includes('quota')) {
    return new Error('Se alcanzó el límite de cuota de Firebase Storage.');
  }
  if (code === 'storage/retry-limit-exceeded' || rawMessage.includes('network')) {
    return new Error('Error de conexión al subir la imagen. Verifica tu internet e intenta nuevamente.');
  }
  return new Error(
    rawMessage
      ? `No se pudo subir la imagen: ${rawMessage}`
      : 'No se pudo subir la imagen.'
  );
}

/**
 * Compresses an image File to a JPEG Blob, uploads it to Firebase Storage
 * (or automatically to the app's /uploads image server if Firebase Storage is not activated),
 * and returns a clean URL. Never returns base64.
 */
export async function uploadImageToFirebaseStorage(
  file: File,
  folder: StorageImageFolder,
  filenamePrefix?: string,
  maxDimension = 1080,
  quality = 0.82
): Promise<string> {
  const blob = await compressImageFileToBlob(file, maxDimension, quality);
  const safePrefix = sanitizeStoragePrefix(filenamePrefix);
  return uploadBlobWithCloudAndFallback(blob, folder, safePrefix, 'jpg', 'image/jpeg');
}

/**
 * Converts a legacy base64 Data URL into a Blob and uploads it,
 * returning a permanent URL. Used to migrate legacy inline photos automatically.
 */
export async function uploadDataUrlToFirebaseStorage(
  dataUrl: string,
  folder: StorageImageFolder,
  filenamePrefix?: string
): Promise<string> {
  if (!isBase64ImageUrl(dataUrl)) {
    return dataUrl;
  }

  const match = dataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) {
    throw new Error('Formato de imagen base64 inválido.');
  }
  const mimeType = match[1];
  const base64Data = match[2];
  const binaryStr = atob(base64Data);
  const bytes = new Uint8Array(binaryStr.length);
  for (let i = 0; i < binaryStr.length; i++) {
    bytes[i] = binaryStr.charCodeAt(i);
  }
  const ext = mimeType.includes('png') ? 'png' : mimeType.includes('webp') ? 'webp' : 'jpg';
  const blob = new Blob([bytes], { type: mimeType });

  const safePrefix = sanitizeStoragePrefix(filenamePrefix);
  return uploadBlobWithCloudAndFallback(blob, folder, safePrefix, ext, mimeType);
}

/**
 * Recursively strips any base64 data:image/* strings from an object/array so base64
 * can never be written into Firestore, IndexedDB, or localStorage.
 */
export function stripBase64ImagesDeep<T>(input: T, depth = 0): T {
  if (depth > 6 || input === null || input === undefined) {
    return input;
  }

  if (typeof input === 'string') {
    return (isBase64ImageUrl(input) ? '' : input) as unknown as T;
  }

  if (Array.isArray(input)) {
    const out: unknown[] = [];
    for (let i = 0; i < input.length; i++) {
      const item = input[i];
      if (isBase64ImageUrl(item)) continue;
      out.push(stripBase64ImagesDeep(item, depth + 1));
    }
    return out as unknown as T;
  }

  if (typeof input === 'object') {
    const source = input as Record<string, unknown>;
    const copy: Record<string, unknown> = {};
    for (const key of Object.keys(source)) {
      const val = source[key];
      if (isBase64ImageUrl(val)) {
        copy[key] = '';
      } else {
        copy[key] = stripBase64ImagesDeep(val, depth + 1);
      }
    }
    return copy as T;
  }

  return input;
}
