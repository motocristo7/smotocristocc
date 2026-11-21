/**
 * Servicio para sincronización automática con la tasa oficial del Banco Central de Venezuela (BCV).
 * Fuente primaria: Scraper en backend /api/bcv (extrae directamente de https://www.bcv.org.ve/ #dolar)
 * Fuente secundaria: Mirror oficial de DolarApi con CORS habilitado
 */

export interface BcvSyncResult {
  success: boolean;
  rate: number;
  rawRate?: number;
  date?: string;
  source: string;
  timestamp: string;
  error?: string;
}

export async function fetchOfficialBcvRate(): Promise<BcvSyncResult> {
  // Intento 1: Servidor local /api/bcv (scraping directo de https://www.bcv.org.ve/)
  try {
    const res = await fetch('/api/bcv', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.rate && !isNaN(data.rate)) {
        return {
          success: true,
          rate: Number(data.rate),
          rawRate: data.rawRate ? Number(data.rawRate) : Number(data.rate),
          date: data.date || 'Tasa Oficial BCV',
          source: data.source || 'Banco Central de Venezuela (bcv.org.ve)',
          timestamp: data.timestamp || new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.warn('No se pudo conectar con el endpoint local /api/bcv, intentando mirror directo:', err);
  }

  // Intento 2: Mirror oficial DolarApi directo desde el navegador (con soporte CORS y tasa oficial BCV)
  try {
    const mirrorRes = await fetch('https://ve.dolarapi.com/v1/dolares/oficial', {
      headers: { Accept: 'application/json' },
    });
    if (mirrorRes.ok) {
      const mirrorJson = await mirrorRes.json();
      const rateVal = mirrorJson.promedio || mirrorJson.venta || mirrorJson.compra;
      if (rateVal && !isNaN(rateVal)) {
        const roundedRate = Math.round(Number(rateVal) * 100) / 100;
        return {
          success: true,
          rate: roundedRate,
          rawRate: Number(rateVal),
          date: mirrorJson.fechaActualizacion
            ? new Date(mirrorJson.fechaActualizacion).toLocaleDateString('es-VE', {
                weekday: 'long',
                day: 'numeric',
                month: 'long',
                year: 'numeric',
              })
            : 'Tasa Oficial BCV',
          source: 'Banco Central de Venezuela (bcv.org.ve)',
          timestamp: new Date().toISOString(),
        };
      }
    }
  } catch (mirrorErr) {
    console.error('Error al consultar mirror oficial de BCV:', mirrorErr);
  }

  return {
    success: false,
    rate: 0,
    source: 'Banco Central de Venezuela (bcv.org.ve)',
    timestamp: new Date().toISOString(),
    error: 'No se pudo contactar los servidores del BCV en este momento.',
  };
}

export async function fetchOfficialEuroBcvRate(): Promise<BcvSyncResult> {
  try {
    const mirrorRes = await fetch('https://ve.dolarapi.com/v1/euros/oficial', {
      headers: { Accept: 'application/json' },
    });
    if (mirrorRes.ok) {
      const mirrorJson = await mirrorRes.json();
      const rateVal = mirrorJson.promedio || mirrorJson.venta || mirrorJson.compra;
      if (rateVal && !isNaN(rateVal)) {
        const roundedRate = Math.round(Number(rateVal) * 100) / 100;
        return {
          success: true,
          rate: roundedRate,
          rawRate: Number(rateVal),
          date: mirrorJson.fechaActualizacion
            ? new Date(mirrorJson.fechaActualizacion).toLocaleDateString('es-VE', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : 'Euro Oficial BCV',
          source: 'Euro Oficial BCV',
          timestamp: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.warn('No se pudo consultar tasa Euro BCV:', err);
  }

  return {
    success: false,
    rate: 0,
    source: 'Euro Oficial BCV',
    timestamp: new Date().toISOString(),
    error: 'No se pudo consultar la tasa Euro BCV automáticamente. Puedes ingresarla manualmente.',
  };
}

export async function fetchBinanceUsdtRate(): Promise<BcvSyncResult> {
  // Intento 1: Servidor local /api/usdt
  try {
    const res = await fetch('/api/usdt', {
      headers: { Accept: 'application/json' },
    });
    if (res.ok) {
      const data = await res.json();
      if (data.success && data.rate && !isNaN(data.rate)) {
        return {
          success: true,
          rate: Number(data.rate),
          rawRate: data.rawRate ? Number(data.rawRate) : Number(data.rate),
          date: data.date || 'Referencia USDT Binance',
          source: data.source || 'Referencia USDT Binance',
          timestamp: data.timestamp || new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.warn('No se pudo conectar con /api/usdt, intentando mirror directo:', err);
  }

  // Intento 2: Mirror público de referencia paralelo/USDT
  try {
    const mirrorRes = await fetch('https://ve.dolarapi.com/v1/dolares/paralelo', {
      headers: { Accept: 'application/json' },
    });
    if (mirrorRes.ok) {
      const mirrorJson = await mirrorRes.json();
      const rateVal = mirrorJson.promedio || mirrorJson.venta || mirrorJson.compra;
      if (rateVal && !isNaN(rateVal)) {
        const roundedRate = Math.round(Number(rateVal) * 100) / 100;
        return {
          success: true,
          rate: roundedRate,
          rawRate: Number(rateVal),
          date: mirrorJson.fechaActualizacion
            ? new Date(mirrorJson.fechaActualizacion).toLocaleDateString('es-VE', {
                day: 'numeric',
                month: 'short',
                year: 'numeric',
              })
            : 'Referencia USDT Binance',
          source: 'Referencia USDT Binance / Paralelo',
          timestamp: new Date().toISOString(),
        };
      }
    }
  } catch (err) {
    console.warn('No se pudo consultar referencia USDT:', err);
  }

  return {
    success: false,
    rate: 0,
    source: 'Referencia USDT Binance',
    timestamp: new Date().toISOString(),
    error: 'No se pudo consultar la tasa USDT Binance automáticamente. Puedes ingresarla manualmente.',
  };
}


