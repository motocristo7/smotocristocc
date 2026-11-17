import { Product, BusinessSettings, ServiceOrder, Sale } from '../types';

// URL base del backend central (Servimotos Cristo Centro)
// Configurable en .env con VITE_API_BASE_URL
const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'https://ais-pre-flhofni32tpb4dwfwnak7d-506340403707.us-west1.run.app';

export interface AppDatabaseResponse {
  settings: BusinessSettings;
  products: Product[];
  serviceOrders: ServiceOrder[];
  sales: Sale[];
  updatedAt: string;
}

/**
 * Obtiene todos los productos, configuración y tasa BCV desde la base de datos compartida
 */
export async function fetchSharedDatabase(): Promise<AppDatabaseResponse | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/data`, {
      headers: {
        Accept: 'application/json',
      },
    });
    if (!res.ok) {
      throw new Error(`HTTP error ${res.status}`);
    }
    const json = await res.json();
    if (json.success && json.data) {
      return json.data;
    }
    return null;
  } catch (err) {
    console.warn('No se pudo conectar a la API remota, usando caché o respaldo:', err);
    return null;
  }
}

/**
 * Consulta la tasa oficial del Banco Central de Venezuela en tiempo real
 */
export async function fetchLiveBcvRate(): Promise<{ rate: number; date: string } | null> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/bcv`);
    if (res.ok) {
      const json = await res.json();
      if (json.success && json.rate) {
        return { rate: json.rate, date: json.date || new Date().toLocaleDateString('es-VE') };
      }
    }
  } catch (err) {
    console.warn('Error al obtener tasa BCV directa:', err);
  }

  // Respaldo de DolarApi en caso de que el backend esté reiniciándose
  try {
    const resMirror = await fetch('https://ve.dolarapi.com/v1/dolares/oficial');
    if (resMirror.ok) {
      const data = await resMirror.json();
      const rate = data.promedio || data.venta || data.compra;
      if (rate) {
        return { rate: Math.round(rate * 100) / 100, date: data.fechaActualizacion || new Date().toLocaleDateString('es-VE') };
      }
    }
  } catch {}

  return null;
}

/**
 * Registra un pedido online en la base de datos central compartida
 */
export async function sendOnlineOrderToBackend(orderData: any): Promise<boolean> {
  try {
    const res = await fetch(`${API_BASE_URL}/api/sales`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(orderData),
    });
    return res.ok;
  } catch (err) {
    console.error('Error registrando pedido en backend:', err);
    return false;
  }
}
