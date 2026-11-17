import { AppUser } from '../types';

export const DEFAULT_ADMIN_PROFILE: AppUser = {
  id: 'usr-admin-1',
  name: 'Administrador Servimotos',
  email: 'SERVIMOTOSCRISTOCENTRO@gmail.com',
  phone: '0412-7860509',
  documentId: 'V-19996141',
  role: 'ADMIN',
  createdAt: '2026-01-01T00:00:00.000Z',
  hasCustomPassword: false,
};

export const DEFAULT_ADMIN_FALLBACK_PASSWORDS = ['admin', 'admin123', '123456'];

export function isOwnerAdminIdentifier(identifier: string): boolean {
  const cleanInput = identifier.trim().toLowerCase();
  const cleanNumbers = identifier.replace(/\D/g, '');
  return (
    cleanInput === 'servimotoscristocentro@gmail.com' ||
    cleanInput === 'admin' ||
    cleanInput === 'administrador' ||
    cleanNumbers === '04127860509' ||
    cleanNumbers === '4127860509' ||
    cleanNumbers === '584127860509' ||
    cleanNumbers === '19996141'
  );
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('');
}

function timingSafeHexEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

export async function hashPasswordClient(plain: string): Promise<string> {
  if (typeof globalThis === 'undefined' || !globalThis.crypto?.subtle) {
    throw new Error('El navegador no soporta cifrado Web Crypto.');
  }
  const saltBytes = new Uint8Array(16);
  globalThis.crypto.getRandomValues(saltBytes);
  const salt = bytesToHex(saltBytes);

  const enc = new TextEncoder();
  const keyMaterial = await globalThis.crypto.subtle.importKey(
    'raw',
    enc.encode(plain),
    'PBKDF2',
    false,
    ['deriveBits']
  );
  const derivedBits = await globalThis.crypto.subtle.deriveBits(
    {
      name: 'PBKDF2',
      salt: enc.encode(salt),
      iterations: 100000,
      hash: 'SHA-256',
    },
    keyMaterial,
    256
  );
  const derivedHex = bytesToHex(new Uint8Array(derivedBits));
  return `pbkdf2$${salt}$${derivedHex}`;
}

export async function verifyPasswordClient(plain: string, stored?: string): Promise<boolean> {
  if (!plain || !stored) return false;
  if (stored.startsWith('pbkdf2$')) {
    if (typeof globalThis === 'undefined' || !globalThis.crypto?.subtle) {
      return false;
    }
    const parts = stored.split('$');
    if (parts.length !== 3) return false;
    const [, salt, originalHex] = parts;
    const enc = new TextEncoder();
    const keyMaterial = await globalThis.crypto.subtle.importKey(
      'raw',
      enc.encode(plain),
      'PBKDF2',
      false,
      ['deriveBits']
    );
    const derivedBits = await globalThis.crypto.subtle.deriveBits(
      {
        name: 'PBKDF2',
        salt: enc.encode(salt),
        iterations: 100000,
        hash: 'SHA-256',
      },
      keyMaterial,
      256
    );
    const derivedHex = bytesToHex(new Uint8Array(derivedBits));
    return timingSafeHexEqual(derivedHex, originalHex);
  }
  if (stored.startsWith('scrypt$')) {
    // scrypt hashes must be verified by server.ts
    return false;
  }
  return stored === plain;
}
