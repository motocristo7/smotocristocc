import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { fetchAdminUserFromFirestore } from '../../services/firestoreSync';
import { VENEZUELA_LOCATIONS, VENEZUELAN_BANKS } from '../../data/venezuela';
import { formatUSD, formatBs } from '../../utils/whatsapp';
import { calculateExchangeGap } from '../../utils/pricing';
import {
  Settings,
  Building2,
  CreditCard,
  FileCheck,
  RotateCcw,
  Save,
  CheckCircle2,
  Phone,
  ShieldCheck,
  TrendingUp,
  RefreshCw,
  ExternalLink,
  ShoppingBag,
  Globe,
  Copy,
  Check,
  Database,
  Flame,
  KeyRound,
  Lock,
  Percent,
} from 'lucide-react';
import { productHasWholesaleTiers } from '../../utils/wholesalePricing';

export const SettingsView: React.FC = () => {
  const {
    settings,
    updateSettings,
    resetAllData,
    isSyncingBcv,
    syncBcvRate,
    isSyncingUsdt,
    syncUsdtRate,
    publicStoreUrl,
    enterPublicStore,
    syncAllToFirebase,
    firebaseSyncStatus,
    isFirebaseConnected,
    firebaseConfigData,
    products,
    currentUser,
    setIsChangePasswordModalOpen,
    setCurrentView,
  } = useApp();
  const [formData, setFormData] = useState({ ...settings });
  const [savedSuccess, setSavedSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedFirebaseConfig, setCopiedFirebaseConfig] = useState(false);
  const [firebaseSyncing, setFirebaseSyncing] = useState(false);
  const [firebaseSyncMsg, setFirebaseSyncMsg] = useState<string | null>(null);
  const [adminStatus, setAdminStatus] = useState<{
    hasCustomPassword: boolean;
    passwordUpdatedAt: string | null;
  }>({
    hasCustomPassword: Boolean(currentUser?.hasCustomPassword),
    passwordUpdatedAt: currentUser?.passwordUpdatedAt || null,
  });

  React.useEffect(() => {
    setFormData(settings);
  }, [settings]);

  React.useEffect(() => {
    let active = true;
    setAdminStatus({
      hasCustomPassword: Boolean(currentUser?.hasCustomPassword),
      passwordUpdatedAt: currentUser?.passwordUpdatedAt || null,
    });

    Promise.all([
      fetch('/api/auth/admin-status')
        .then((res) => (res.ok && (res.headers.get('content-type') || '').includes('application/json') ? res.json() : null))
        .catch(() => null),
      fetchAdminUserFromFirestore().catch(() => null),
    ]).then(([serverData, cloudAdmin]) => {
      if (!active) return;
      const hasCustom = Boolean(serverData?.hasCustomPassword || cloudAdmin?.hasCustomPassword || currentUser?.hasCustomPassword);
      const updatedAt = cloudAdmin?.passwordUpdatedAt || serverData?.passwordUpdatedAt || currentUser?.passwordUpdatedAt || null;
      setAdminStatus({
        hasCustomPassword: hasCustom,
        passwordUpdatedAt: updatedAt,
      });
    });

    return () => {
      active = false;
    };
  }, [currentUser?.hasCustomPassword, currentUser?.passwordUpdatedAt]);

  const availableCities = VENEZUELA_LOCATIONS.find((l) => l.state === formData.state)?.cities || [formData.city];

  const handleSyncWithBcv = async () => {
    const res = await syncBcvRate(true);
    if (res.success && res.rate > 0) {
      setFormData((prev) => ({
        ...prev,
        bcvRate: res.rate,
        bcvOfficialDate: res.date,
        bcvSource: res.source,
        bcvSyncedAtISO: res.timestamp,
        bcvLastUpdated: new Date().toLocaleTimeString('es-VE', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }));
    }
  };

  const handleSyncWithUsdt = async () => {
    const res = await syncUsdtRate();
    if (res.success && res.rate > 0) {
      setFormData((prev) => ({
        ...prev,
        usdtRate: res.rate,
        usdtSource: res.source,
        usdtLastUpdated: new Date().toLocaleTimeString('es-VE', {
          hour: '2-digit',
          minute: '2-digit',
        }),
      }));
    }
  };

  const liveGap = calculateExchangeGap(formData.bcvRate, formData.usdtRate);

  const [isResetModalOpen, setIsResetModalOpen] = useState(false);
  const activeWholesaleProductsCount = products.filter((p) => productHasWholesaleTiers(p)).length;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSaving(true);
    try {
      await updateSettings(formData);
      setSavedSuccess(true);
      setTimeout(() => setSavedSuccess(false), 3500);
    } finally {
      setIsSaving(false);
    }
  };

  const handleConfirmReset = () => {
    resetAllData();
    window.location.reload();
  };

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div>
        <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
          Configuración Venezuela & Tasa BCV
        </span>
        <h1 className="text-2xl font-bold font-display text-slate-900 mt-0.5">
          Datos de la Empresa, Tasa BCV & Cuentas Bancarias
        </h1>
        <p className="text-xs text-slate-500">
          Ajusta la tasa oficial del Banco Central de Venezuela, tus datos de Pago Móvil y cuentas para la facturación.
        </p>
      </div>

      {/* Seguridad y Clave de Usuario Administrativo */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center shrink-0 border border-amber-200">
            <Lock className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900">
                Clave de Acceso Administrativo
              </h3>
              {adminStatus.hasCustomPassword ? (
                <span className="bg-emerald-100 text-emerald-800 border border-emerald-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Clave Personalizada Activa
                </span>
              ) : (
                <span className="bg-amber-100 text-amber-900 border border-amber-200 text-[10px] font-bold px-2 py-0.5 rounded-full">
                  Clave Predeterminada
                </span>
              )}
            </div>
            <p className="text-xs text-slate-500">
              Usuario administrador: <strong className="font-mono text-slate-700">{currentUser?.email || 'SERVIMOTOSCRISTOCENTRO@gmail.com'}</strong>
              {adminStatus.passwordUpdatedAt && (
                <span className="ml-2 text-[11px] text-slate-400">
                  · Último cambio: {new Date(adminStatus.passwordUpdatedAt).toLocaleDateString('es-VE')}
                </span>
              )}
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setIsChangePasswordModalOpen(true)}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0"
        >
          <KeyRound className="w-4 h-4 text-amber-400" />
          <span>Editar Clave Administrativa</span>
        </button>
      </div>

      {/* Precios de Venta al Mayor por Repuesto (Tienda Online) */}
      <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center shrink-0 border border-emerald-200">
            <Percent className="w-5 h-5" />
          </div>
          <div className="space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="text-sm font-bold text-slate-900">
                Precios de Venta al Mayor por Repuesto
              </h3>
              <span className="text-xs font-mono font-bold text-emerald-700 tabular-nums">
                {activeWholesaleProductsCount}{' '}
                {activeWholesaleProductsCount === 1 ? 'repuesto configurado' : 'repuestos configurados'}
              </span>
            </div>
            <p className="text-xs text-slate-500">
              Selecciona repuestos específicos y configura sus escalas de descuento según la cantidad comprada.
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={() => setCurrentView('admin_mayorista')}
          className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0"
        >
          <Percent className="w-4 h-4" />
          <span>Configurar Precios al Mayor</span>
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Tasa Oficial BCV Prominent Control Card con Sincronización Automática */}
        <div className="bg-emerald-900 text-white rounded-xl p-6 shadow-md border border-emerald-800 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-white/10 flex items-center justify-center text-emerald-300 shrink-0 mt-0.5">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base leading-tight">
                    Tasa Oficial del Banco Central de Venezuela (BCV)
                  </h3>
                  <span className="bg-emerald-800 text-emerald-200 border border-emerald-700 text-[10px] px-2 py-0.5 rounded-full font-medium">
                    Sincronización Automática
                  </span>
                </div>
                <p className="text-emerald-200 text-xs leading-relaxed max-w-xl">
                  Se sincroniza automáticamente con la cotización oficial publicada en{' '}
                  <a
                    href="https://www.bcv.org.ve/"
                    target="_blank"
                    rel="noreferrer"
                    className="underline text-emerald-100 hover:text-white inline-flex items-center gap-0.5 font-medium"
                  >
                    <span>www.bcv.org.ve</span>
                    <ExternalLink className="w-3 h-3" />
                  </a>
                  . Aplica de inmediato a la tienda online, mostrador POS, órdenes de servicio y WhatsApp.
                </p>
                <div className="text-[11px] text-emerald-300 flex flex-wrap items-center gap-3 pt-1">
                  <span>Fuente: <strong>{settings.bcvSource || 'Banco Central de Venezuela (bcv.org.ve)'}</strong></span>
                  <span>·</span>
                  <span>Fecha Valor: <strong>{settings.bcvOfficialDate || 'Vigente'}</strong></span>
                  {settings.bcvLastUpdated && (
                    <>
                      <span>·</span>
                      <span>Última comprobación: <strong>{settings.bcvLastUpdated}</strong></span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 bg-emerald-950/70 p-2 rounded-xl border border-emerald-700/60">
                <span className="text-xs text-emerald-300 font-semibold pl-2">Bs. / USD:</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  required
                  value={formData.bcvRate}
                  onChange={(e) => setFormData({ ...formData, bcvRate: parseFloat(e.target.value) || 0 })}
                  className="w-24 p-1.5 text-base font-bold font-mono text-emerald-100 bg-emerald-900 border border-emerald-500 rounded-lg text-right"
                />
              </div>

              <button
                type="button"
                onClick={handleSyncWithBcv}
                disabled={isSyncingBcv}
                className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs transition-all shadow-xs cursor-pointer ${
                  isSyncingBcv ? 'opacity-70 cursor-not-allowed' : ''
                }`}
                title="Sincronizar en este instante con bcv.org.ve"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncingBcv ? 'animate-spin' : ''}`} />
                <span>{isSyncingBcv ? 'Sincronizando...' : 'Sincronizar BCV'}</span>
              </button>
            </div>
          </div>

          <div className="pt-3 border-t border-emerald-800/80 flex flex-wrap items-center justify-between text-xs text-emerald-200">
            <span>Ejemplo de conversión: $10.00 USD = <strong>{formatBs(10 * formData.bcvRate)}</strong></span>
            <span>$50.00 USD = <strong>{formatBs(50 * formData.bcvRate)}</strong></span>
            <span>$100.00 USD = <strong>{formatBs(100 * formData.bcvRate)}</strong></span>
          </div>
        </div>

        {/* Tasa Referencia USDT Binance y Brecha Cambiaria (SOLO USO INTERNO ADMINISTRATIVO) */}
        <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md border border-amber-500/40 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                <TrendingUp className="w-5 h-5" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <h3 className="font-bold text-base leading-tight text-white">
                    Tasa Referencia USDT Binance &amp; Brecha Cambiaria
                  </h3>
                  <span className="bg-amber-500/20 text-amber-300 border border-amber-400/40 text-[10px] px-2 py-0.5 rounded-full font-bold uppercase">
                    Uso Exclusivo Admin
                  </span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed max-w-xl">
                  Referencia interna para calcular automáticamente la brecha cambiaria frente al BCV, el{' '}
                  <strong className="text-amber-300">Costo de Referencia en Divisas</strong> y el{' '}
                  <strong className="text-emerald-300">% de Utilidad</strong>. Esta tasa nunca se muestra al cliente ni en facturas.
                </p>
                <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-3 pt-1">
                  <span>Fuente: <strong className="text-slate-200">{settings.usdtSource || 'Referencia USDT Binance'}</strong></span>
                  {settings.usdtLastUpdated && (
                    <>
                      <span>·</span>
                      <span>Actualizada: <strong className="text-slate-200">{settings.usdtLastUpdated}</strong></span>
                    </>
                  )}
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <div className="flex items-center gap-2 bg-slate-950/80 p-2 rounded-xl border border-amber-500/40">
                <span className="text-xs text-amber-300 font-semibold pl-2">Bs. / USDT:</span>
                <input
                  type="number"
                  step="0.01"
                  min="0.01"
                  value={formData.usdtRate ?? liveGap.usdtRate}
                  onChange={(e) =>
                    setFormData({ ...formData, usdtRate: parseFloat(e.target.value) || 0 })
                  }
                  className="w-24 p-1.5 text-base font-bold font-mono text-amber-100 bg-slate-900 border border-amber-400/60 rounded-lg text-right"
                />
              </div>

              <button
                type="button"
                onClick={handleSyncWithUsdt}
                disabled={isSyncingUsdt}
                className={`inline-flex items-center justify-center gap-2 px-3.5 py-2.5 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs transition-all shadow-xs cursor-pointer ${
                  isSyncingUsdt ? 'opacity-70 cursor-not-allowed' : ''
                }`}
                title="Consultar tasa de referencia USDT Binance"
              >
                <RefreshCw className={`w-4 h-4 ${isSyncingUsdt ? 'animate-spin' : ''}`} />
                <span>{isSyncingUsdt ? 'Consultando...' : 'Sincronizar USDT'}</span>
              </button>
            </div>
          </div>

          {/* Panel visual de Brecha Cambiaria */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-3 border-t border-slate-800">
            <div className="bg-slate-800/70 rounded-xl p-3 border border-slate-700">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
                Brecha Cambiaria (%)
              </span>
              <div className="flex items-baseline gap-2 mt-1">
                <span
                  className={`text-xl font-black font-mono ${
                    liveGap.gapPct > 0
                      ? 'text-amber-400'
                      : liveGap.gapPct < 0
                      ? 'text-rose-400'
                      : 'text-emerald-400'
                  }`}
                >
                  {liveGap.gapPct >= 0 ? '+' : ''}
                  {liveGap.gapPct.toFixed(2)}%
                </span>
                <span className="text-xs font-mono text-slate-400">
                  (Factor ×{liveGap.gapFactor.toFixed(4)})
                </span>
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                ((USDT − BCV) ÷ BCV) × 100
              </span>
            </div>

            <div className="bg-slate-800/70 rounded-xl p-3 border border-slate-700">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
                Diferencial por Dólar
              </span>
              <div className="text-xl font-black font-mono text-white mt-1">
                {liveGap.diffBs >= 0 ? '+' : ''}
                {formatBs(liveGap.diffBs)}
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                BCV {formatBs(liveGap.bcvRate)} vs USDT {formatBs(liveGap.usdtRate)}
              </span>
            </div>

            <div className="bg-slate-800/70 rounded-xl p-3 border border-slate-700">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400 block">
                Ajuste Costo BCV → Divisas
              </span>
              <div className="text-sm font-bold font-mono text-emerald-300 mt-1">
                $10 BCV ({formatBs(10 * liveGap.bcvRate)}) ={' '}
                {formatUSD(liveGap.usdtRate > 0 ? (10 * liveGap.bcvRate) / liveGap.usdtRate : 10)} ref.
              </div>
              <span className="text-[10px] text-slate-400 block mt-0.5">
                Costo Bs ÷ Tasa USDT = ($ BCV ÷ (1 + Brecha%))
              </span>
            </div>
          </div>
        </div>

        {/* Firebase Firestore Cloud Synchronization Card (Para compartir inventario con tu otra app en tiempo real) */}
        <div className="bg-slate-900 text-white rounded-xl p-6 shadow-md border border-slate-800 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0 mt-0.5 border border-amber-500/30">
                <Flame className="w-5 h-5 text-amber-400" />
              </div>
              <div className="space-y-1">
                <div className="flex items-center gap-2">
                  <h3 className="font-bold text-base leading-tight text-white">
                    Base de Datos Cloud Firebase Firestore
                  </h3>
                  <span className="bg-emerald-500/20 text-emerald-300 border border-emerald-500/30 text-[10px] px-2 py-0.5 rounded-full font-bold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                    En Tiempo Real
                  </span>
                </div>
                <p className="text-slate-300 text-xs leading-relaxed max-w-xl">
                  Tu base de datos está alojada en Firebase Firestore en la nube. Cualquier repuesto, precio o stock que modifiques aquí se actualiza al instante en la colección <code>products</code> para que tu otra app de tienda online lo cargue en vivo sin desincronización.
                </p>
                <div className="text-[11px] text-slate-400 flex flex-wrap items-center gap-3 pt-1 font-mono">
                  <span>Proyecto: <strong className="text-amber-300">{firebaseConfigData?.projectId || 'charged-seeker-5vxch'}</strong></span>
                  <span>·</span>
                  <span>Database: <strong className="text-slate-200">{firebaseConfigData?.firestoreDatabaseId || 'default'}</strong></span>
                </div>
              </div>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={async () => {
                  setFirebaseSyncing(true);
                  setFirebaseSyncMsg(null);
                  try {
                    const res = await syncAllToFirebase();
                    if (res.success) {
                      setFirebaseSyncMsg(`¡Listo! Se sincronizaron ${res.count} registros a Firestore.`);
                    } else {
                      setFirebaseSyncMsg('Error al sincronizar con Firebase.');
                    }
                  } finally {
                    setFirebaseSyncing(false);
                    setTimeout(() => setFirebaseSyncMsg(null), 5000);
                  }
                }}
                disabled={firebaseSyncing}
                className="px-4 py-2 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-all flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${firebaseSyncing ? 'animate-spin' : ''}`} />
                <span>{firebaseSyncing ? 'Sincronizando...' : 'Subir Inventario a Firebase Ahora'}</span>
              </button>
            </div>
          </div>

          {firebaseSyncMsg && (
            <div className="p-2.5 rounded-lg bg-emerald-950/80 border border-emerald-500/50 text-emerald-300 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
              <span>{firebaseSyncMsg}</span>
            </div>
          )}

          {/* Quick Config Box for Second App */}
          <div className="mt-3 pt-3 border-t border-slate-800 bg-slate-950/70 p-3.5 rounded-xl border border-slate-800/80">
            <div className="flex items-center justify-between gap-2 mb-2">
              <span className="text-xs font-bold text-slate-200 flex items-center gap-1.5">
                <Database className="w-3.5 h-3.5 text-amber-400" />
                <span>Claves de Conexión para tu Otra App</span>
              </span>
              <button
                type="button"
                onClick={() => {
                  navigator.clipboard.writeText(JSON.stringify(firebaseConfigData, null, 2));
                  setCopiedFirebaseConfig(true);
                  setTimeout(() => setCopiedFirebaseConfig(false), 2500);
                }}
                className="px-2.5 py-1 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-200 text-[11px] font-semibold flex items-center gap-1 transition-colors cursor-pointer border border-slate-700"
              >
                {copiedFirebaseConfig ? (
                  <>
                    <Check className="w-3 h-3 text-emerald-400" />
                    <span>¡Copiado!</span>
                  </>
                ) : (
                  <>
                    <Copy className="w-3 h-3 text-amber-400" />
                    <span>Copiar Configuración Firebase</span>
                  </>
                )}
              </button>
            </div>
            <p className="text-[11px] text-slate-400 mb-2 leading-relaxed">
              Copia esta configuración en el archivo <code>firebase-applet-config.json</code> de tu otra app para que lea exactamente esta misma base de datos en tiempo real:
            </p>
            <pre className="text-[10px] font-mono bg-slate-900 text-amber-300/90 p-2.5 rounded-lg overflow-x-auto max-h-32 border border-slate-800">
              {JSON.stringify(firebaseConfigData, null, 2)}
            </pre>
          </div>
        </div>

        {/* Business details (Venezuela) */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <Building2 className="w-4 h-4 text-amber-600" />
            <span>Identificación y Ubicación en Venezuela</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Razón Social / Nombre Comercial *</label>
              <input
                type="text"
                required
                value={formData.commercialName}
                onChange={(e) => setFormData({ ...formData, commercialName: e.target.value, name: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">RIF Venezolano *</label>
              <input
                type="text"
                required
                value={formData.rif}
                onChange={(e) => {
                  const val = e.target.value;
                  setFormData((prev) => ({
                    ...prev,
                    rif: val,
                    bankDetails: {
                      ...prev.bankDetails,
                      bankTransferRif: val,
                    },
                  }));
                }}
                placeholder="Ej. V-19996141-8 o J-41285093-2"
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">WhatsApp Oficial de Notificaciones *</label>
              <input
                type="text"
                required
                value={formData.whatsapp}
                onChange={(e) => setFormData({ ...formData, whatsapp: e.target.value, phone: e.target.value })}
                placeholder="Ej. 0412-7860509"
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Correo Electrónico</label>
              <input
                type="email"
                value={formData.email}
                onChange={(e) => setFormData({ ...formData, email: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
              />
            </div>

            {/* State and City Selectors */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Estado de Venezuela *</label>
              <select
                value={formData.state}
                onChange={(e) => {
                  const newState = e.target.value;
                  const loc = VENEZUELA_LOCATIONS.find((l) => l.state === newState);
                  setFormData({
                    ...formData,
                    state: newState,
                    city: loc && loc.cities.length > 0 ? loc.cities[0] : '',
                  });
                }}
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-medium"
              >
                {VENEZUELA_LOCATIONS.map((loc) => (
                  <option key={loc.state} value={loc.state}>
                    {loc.state}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Ciudad / Municipio *</label>
              <select
                value={formData.city}
                onChange={(e) => setFormData({ ...formData, city: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-medium"
              >
                {availableCities.map((city) => (
                  <option key={city} value={city}>
                    {city}
                  </option>
                ))}
              </select>
            </div>

            <div className="sm:col-span-2">
              <label className="block font-semibold text-slate-700 mb-1">Dirección del Taller y Tienda</label>
              <input
                type="text"
                value={formData.address}
                onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                placeholder="Ej. Calle Kennedy con calle 2 de Campo de Oro casa #1-23. Mérida"
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* Tienda Online de Clientes (Mercado Moto CC) */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
              <ShoppingBag className="w-4 h-4 text-amber-600" />
              <span>Web Pública de Clientes · Mercado Moto CC</span>
            </h3>
            <span className="text-[10px] bg-amber-100 text-amber-900 font-bold px-2 py-0.5 rounded-full uppercase tracking-wider">
              Enlace Separado
            </span>
          </div>

          <p className="text-xs text-slate-500">
            Esta es la tienda online pública a la que entran tus clientes para comprar repuestos, ver precios en $ y Bs a tasa BCV y consultar el estado de sus motos sin ver controles de administración ni taller.
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Nombre Comercial de la Tienda Online *</label>
              <input
                type="text"
                required
                value={formData.onlineStoreName || 'Mercado Moto CC'}
                onChange={(e) => setFormData({ ...formData, onlineStoreName: e.target.value })}
                placeholder="Ej. Mercado Moto CC"
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-bold text-slate-900"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Enlace Web para tus Clientes</label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  readOnly
                  value={publicStoreUrl}
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-100 font-mono text-amber-700 font-semibold select-all text-xs"
                />
                <button
                  type="button"
                  onClick={() => {
                    navigator.clipboard.writeText(publicStoreUrl);
                    setCopiedLink(true);
                    setTimeout(() => setCopiedLink(false), 2000);
                  }}
                  className="px-3 py-2.5 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Copiar enlace"
                >
                  {copiedLink ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                </button>
                <button
                  type="button"
                  onClick={enterPublicStore}
                  className="px-3 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg transition-colors cursor-pointer shrink-0"
                  title="Abrir como cliente"
                >
                  <ExternalLink className="w-4 h-4" />
                </button>
              </div>
            </div>
          </div>
        </div>

        {/* Pago Móvil & Venezuelan Bank Accounts */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <CreditCard className="w-4 h-4 text-emerald-600" />
            <span>Datos de Pago Móvil y Cuentas Bancarias (Venezuela)</span>
          </h3>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
            {/* Pago Móvil */}
            <div>
              <label className="block font-semibold text-emerald-800 mb-1">Banco Pago Móvil</label>
              <select
                value={formData.bankDetails.pagoMovilBank}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankDetails: { ...formData.bankDetails, pagoMovilBank: e.target.value },
                  })
                }
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-medium"
              >
                {VENEZUELAN_BANKS.map((b) => (
                  <option key={b} value={b}>
                    {b}
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="block font-semibold text-emerald-800 mb-1">Teléfono Pago Móvil</label>
              <input
                type="text"
                value={formData.bankDetails.pagoMovilPhone}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankDetails: { ...formData.bankDetails, pagoMovilPhone: e.target.value },
                  })
                }
                placeholder="Ej. 04142345678"
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-emerald-800 mb-1">Cédula o RIF Pago Móvil</label>
              <input
                type="text"
                value={formData.bankDetails.pagoMovilId}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankDetails: { ...formData.bankDetails, pagoMovilId: e.target.value },
                  })
                }
                placeholder="Ej. J-412850932 o V-18459210"
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-emerald-800 mb-1">Titular Pago Móvil</label>
              <input
                type="text"
                value={formData.bankDetails.pagoMovilHolder}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankDetails: { ...formData.bankDetails, pagoMovilHolder: e.target.value },
                  })
                }
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
              />
            </div>

            {/* QR Pago Móvil Preview */}
            <div className="sm:col-span-2 bg-emerald-50/70 border border-emerald-200 rounded-xl p-3 flex items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <img
                  src={formData.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg'}
                  alt="QR Pago Móvil"
                  className="w-16 h-16 object-contain rounded-lg border border-slate-200 shadow-2xs shrink-0"
                />
                <div>
                  <h4 className="font-bold text-slate-900 text-xs">Código QR Suiche 7B (Pago Móvil)</h4>
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Activo y visible en tienda online, facturación, WhatsApp y consultas de clientes.
                  </p>
                  <p className="text-[10px] font-mono font-semibold text-emerald-800 mt-0.5">
                    0134 Banesco · 0412-2242450 · V-19996141
                  </p>
                </div>
              </div>
              <a
                href={formData.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg'}
                target="_blank"
                rel="noopener noreferrer"
                className="px-2.5 py-1.5 bg-white border border-emerald-300 text-emerald-800 rounded-lg text-xs font-semibold hover:bg-emerald-50 transition-colors shrink-0 cursor-pointer"
              >
                Ver Imagen
              </a>
            </div>

            {/* Transferencia Bolívares */}
            <div>
              <label className="block font-semibold text-slate-700 mb-1">Número de Cuenta Transferencia (20 dígitos)</label>
              <input
                type="text"
                value={formData.bankDetails.bankTransferAccount}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankDetails: { ...formData.bankDetails, bankTransferAccount: e.target.value },
                  })
                }
                placeholder="0134-XXXX-XX-XXXXXXXXXX"
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Banco Receptor de Transferencias</label>
              <input
                type="text"
                value={formData.bankDetails.bankTransferName}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    bankDetails: { ...formData.bankDetails, bankTransferName: e.target.value },
                  })
                }
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">Titular de la Cuenta Bancaria</label>
              <input
                type="text"
                value={formData.bankDetails.bankTransferHolder}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    bankDetails: { ...prev.bankDetails, bankTransferHolder: e.target.value },
                  }))
                }
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">RIF o Cédula Cuenta Bancaria</label>
              <input
                type="text"
                value={formData.bankDetails.bankTransferRif}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    bankDetails: { ...prev.bankDetails, bankTransferRif: e.target.value },
                  }))
                }
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono font-bold"
              />
            </div>

            <div>
              <label className="block font-semibold text-amber-700 mb-1">Binance Pay ID</label>
              <input
                type="text"
                value={formData.bankDetails.binancePayId || ''}
                onChange={(e) =>
                  setFormData((prev) => ({
                    ...prev,
                    bankDetails: { ...prev.bankDetails, binancePayId: e.target.value },
                  }))
                }
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono"
              />
            </div>
          </div>
        </div>

        {/* Legal & Warranty */}
        <div className="bg-white rounded-xl border border-slate-200 p-6 shadow-2xs space-y-4">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
            <ShieldCheck className="w-4 h-4 text-blue-600" />
            <span>Condiciones de Facturación a Tasa BCV y Garantías</span>
          </h3>

          <div className="space-y-3 text-xs">
            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Leyenda de Garantía en Factura:
              </label>
              <textarea
                rows={2}
                value={formData.invoiceDisclaimer}
                onChange={(e) => setFormData({ ...formData, invoiceDisclaimer: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
              />
            </div>

            <div>
              <label className="block font-semibold text-slate-700 mb-1">
                Políticas de Taller y Tapicería:
              </label>
              <textarea
                rows={2}
                value={formData.warrantyPolicy}
                onChange={(e) => setFormData({ ...formData, warrantyPolicy: e.target.value })}
                className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
              />
            </div>
          </div>
        </div>

        {/* Action buttons */}
        <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pt-2">
          <button
            type="button"
            onClick={() => setIsResetModalOpen(true)}
            className="text-xs text-rose-600 hover:text-rose-700 flex items-center gap-1.5 font-medium cursor-pointer"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Restablecer datos de prueba Venezuela</span>
          </button>

          <div className="flex items-center gap-3">
            {savedSuccess && (
              <span className="text-xs text-emerald-600 font-semibold flex items-center gap-1">
                <CheckCircle2 className="w-4 h-4" />
                <span>¡Configuración y Tasa BCV actualizadas!</span>
              </span>
            )}
            <button
              type="submit"
              disabled={isSaving}
              className={`px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-2 cursor-pointer ${
                isSaving ? 'opacity-70 cursor-not-allowed' : ''
              }`}
            >
              <Save className="w-4 h-4 text-amber-400" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Configuración'}</span>
            </button>
          </div>
        </div>
      </form>

      {/* Reset Confirmation Modal */}
      {isResetModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-4 sm:p-5 bg-rose-50 border-b border-rose-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                <RotateCcw className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base font-display text-slate-900">
                  ¿Restablecer datos de prueba?
                </h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  Esta acción restablecerá el catálogo, clientes, ventas y configuración inicial para Venezuela.
                </p>
              </div>
            </div>

            <div className="p-5 text-xs text-slate-600 space-y-2">
              <p>
                Se recargarán los repuestos de ejemplo y se borrarán las modificaciones que no hayas guardado de forma permanente.
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsResetModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmReset}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <span>Sí, restablecer datos</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
