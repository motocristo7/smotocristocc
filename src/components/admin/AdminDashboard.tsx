import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { productTracksInventory } from '../../types';
import { productHasWholesaleTiers } from '../../utils/wholesalePricing';
import { formatUSD, formatBs, sanitizePhone, buildInvoiceWhatsAppMessage, buildServiceStatusWhatsAppMessage, buildMercadoLibreDebtWhatsAppMessage } from '../../utils/whatsapp';
import {
  TrendingUp,
  Boxes,
  Wrench,
  ShoppingBag,
  ShoppingCart,
  Users,
  AlertTriangle,
  CheckCircle2,
  Clock,
  ArrowRight,
  MessageSquare,
  Eye,
  Plus,
  Package,
  PlusCircle,
  MinusCircle,
  Trash2,
  X,
  DollarSign,
  ArrowDownRight,
  ArrowUpRight,
  Globe,
  Share2,
  Copy,
  Check,
  QrCode,
  ExternalLink,
  Receipt,
  Percent,
} from 'lucide-react';
import QRCode from 'qrcode';

export const AdminDashboard: React.FC = () => {
  const {
    sales,
    serviceOrders,
    products,
    onlineOrders,
    customers,
    setCurrentView,
    setSelectedInvoice,
    setWhatsappModalData,
    settings,
    mercadolibreDebtUSD,
    mercadolibreDebtBs,
    pendingMercadoLibreSales,
    mlEntries,
    addMercadoLibreManualEntry,
    deleteMercadoLibreEntry,
    settleAllMercadoLibreCommissions,
    enterPublicStore,
    publicStoreUrl,
    onlineStoreBrand,
    currentMonthExpensesUSD,
  } = useApp();

  const [showMlDetails, setShowMlDetails] = useState(false);
  const [showAddMlModal, setShowAddMlModal] = useState(false);
  const [mlModalType, setMlModalType] = useState<'CHARGE' | 'PAYMENT'>('CHARGE');
  const [mlModalAmount, setMlModalAmount] = useState<string>('');
  const [mlModalDescription, setMlModalDescription] = useState<string>('');
  const [mlError, setMlError] = useState<string>('');

  // Mercado Moto CC Public Store Sharing & QR
  const [copiedStoreUrl, setCopiedStoreUrl] = useState(false);
  const [showQrModal, setShowQrModal] = useState(false);
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);

  const storeName = onlineStoreBrand || 'Mercado Moto CC';

  const handleCopyPublicUrl = () => {
    navigator.clipboard.writeText(publicStoreUrl);
    setCopiedStoreUrl(true);
    setTimeout(() => setCopiedStoreUrl(false), 2500);
  };

  const handleOpenQrModal = async () => {
    try {
      if (!qrCodeUrl) {
        const dataUrl = await QRCode.toDataURL(publicStoreUrl, {
          width: 320,
          margin: 2,
          color: {
            dark: '#0f172a',
            light: '#ffffff',
          },
        });
        setQrCodeUrl(dataUrl);
      }
      setShowQrModal(true);
    } catch (err) {
      console.error('Error generating QR code:', err);
    }
  };

  const handleShareStoreWhatsApp = () => {
    const text = `¡Hola! 👋 Te invitamos a visitar *${storeName}*, nuestra tienda online de repuestos, lubricantes y tapicería para motos:

🏍️ Stock físico en tiempo real
💵 Precios en Dólares ($) y Bolívares (Bs.) a tasa oficial BCV
📦 Envíos nacionales (MRW, Zoom, Tealca) o retiro en taller en Mérida

Ingresa directamente desde tu teléfono aquí:
👉 ${publicStoreUrl}`;

    const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  const rate = settings.bcvRate;

  // Metrics in USD
  const totalSalesAmountUSD = sales.reduce((sum, s) => sum + s.total, 0);
  const totalWorkshopIncomeUSD = serviceOrders.reduce((sum, o) => sum + o.totalCost, 0);
  const activeServices = serviceOrders.filter((o) => o.status === 'CREADA' || o.status === 'EN_PROCESO');
  const readyServices = serviceOrders.filter((o) => o.status === 'CULMINADA');
  const lowStockProducts = products.filter((p) => productTracksInventory(p) && p.stock <= p.minStock);
  const outOfStockProducts = products.filter((p) => productTracksInventory(p) && p.stock === 0);
  const pendingOrders = onlineOrders.filter((o) => o.status === 'PENDIENTE_PAGO' || o.status === 'EN_ALISTAMIENTO');

  const pendingMlEntries = mlEntries.filter((e) => e.status === 'PENDIENTE');
  const totalMlPendingCount = pendingMercadoLibreSales.length + pendingMlEntries.length;

  const handleShareInvoiceWhatsApp = (sale: any) => {
    const { message, url } = buildInvoiceWhatsAppMessage(sale, settings);
    setWhatsappModalData({
      title: `Factura #${sale.invoiceNumber}`,
      message,
      url,
      phone: sale.customerPhone,
      recipientName: sale.customerName,
    });
  };

  const handleNotifyMercadoLibreDebtWhatsApp = () => {
    const { message, url } = buildMercadoLibreDebtWhatsAppMessage(
      pendingMercadoLibreSales,
      mercadolibreDebtUSD,
      settings,
      undefined,
      undefined,
      pendingMlEntries
    );
    const targetPhone = sanitizePhone(settings.whatsapp || settings.phone || '04127860509');
    setWhatsappModalData({
      title: 'Reporte de Deuda MercadoLibre',
      message,
      url,
      phone: targetPhone,
      recipientName: 'Mi WhatsApp (Administrador)',
    });
  };

  const handleSaveManualMlEntry = (notifyWhatsApp: boolean) => {
    const parsedAmount = parseFloat(mlModalAmount);
    if (!parsedAmount || isNaN(parsedAmount) || parsedAmount <= 0) {
      setMlError('Ingresa un monto válido mayor a 0');
      return;
    }
    setMlError('');

    const isPayment = mlModalType === 'PAYMENT';
    const fallbackDesc = isPayment
      ? 'Pago / Abono realizado a MercadoLibre'
      : 'Comisión adicional / Cargo manual';
    const description = mlModalDescription.trim() || fallbackDesc;

    const newEntry = addMercadoLibreManualEntry(parsedAmount, description, isPayment);

    if (notifyWhatsApp) {
      const projectedDebt = isPayment
        ? Math.max(0, mercadolibreDebtUSD - parsedAmount)
        : mercadolibreDebtUSD + parsedAmount;

      const { message, url } = buildMercadoLibreDebtWhatsAppMessage(
        pendingMercadoLibreSales,
        projectedDebt,
        settings,
        undefined,
        newEntry,
        [newEntry, ...pendingMlEntries]
      );
      const targetPhone = sanitizePhone(settings.whatsapp || settings.phone || '04127860509');
      setWhatsappModalData({
        title: isPayment ? 'Comprobante de Pago a MercadoLibre' : 'Nuevo Cargo/Comisión MercadoLibre',
        message,
        url,
        phone: targetPhone,
        recipientName: 'Mi WhatsApp (Administrador)',
      });
    }

    setMlModalAmount('');
    setMlModalDescription('');
    setShowAddMlModal(false);
  };

  const handleDeleteMlEntry = (id: string, description: string) => {
    if (window.confirm(`¿Deseas eliminar el registro manual "${description}"? Se recalculará tu saldo adeudado.`)) {
      deleteMercadoLibreEntry(id);
    }
  };

  return (
    <div className="space-y-6">
      {/* Top Banner / Welcome */}
      <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
            Panel de Control Venezuela
          </span>
          <h1 className="text-2xl font-bold font-display text-slate-900 mt-1">
            {settings.commercialName}
          </h1>
          <p className="text-xs text-slate-500 mt-0.5">
            Gestión de ventas, inventario, órdenes de taller y tienda online. Tasa BCV: <strong>Bs. {rate.toFixed(2)}</strong>
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={() => setCurrentView('admin_pos')}
            className="px-4 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <ShoppingCart className="w-4 h-4" />
            <span>Facturar Venta POS</span>
          </button>
          <button
            onClick={() => setCurrentView('admin_taller')}
            className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Wrench className="w-4 h-4 text-amber-400" />
            <span>Nueva Orden de Taller</span>
          </button>
          <button
            onClick={() => setCurrentView('admin_mayorista')}
            className="px-4 py-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-300 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Configurar descuentos por compra al mayor en cada repuesto"
          >
            <Percent className="w-4 h-4 text-emerald-700" />
            <span>
              Precios al Mayor ({products.filter((p) => productHasWholesaleTiers(p)).length})
            </span>
          </button>
          <button
            onClick={() => setCurrentView('admin_gastos')}
            className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Ir al módulo de Gastos del Negocio"
          >
            <Receipt className="w-4 h-4 text-rose-600" />
            <span>Gastos ({formatUSD(currentMonthExpensesUSD)})</span>
          </button>
        </div>
      </div>

      {/* Mercado Moto CC - Public Customer Store Card */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950 text-white rounded-2xl border border-amber-500/30 p-5 sm:p-6 shadow-md relative overflow-hidden">
        <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-[radial-gradient(ellipse_at_top_right,_var(--tw-gradient-stops))] from-amber-500/10 via-transparent to-transparent pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row items-start lg:items-center justify-between gap-5">
          <div className="space-y-1.5 max-w-2xl">
            <div className="flex items-center gap-2">
              <span className="px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-400 text-slate-950 uppercase tracking-wider font-mono">
                Web de Clientes Activa
              </span>
              <span className="text-xs text-amber-300 font-semibold flex items-center gap-1">
                <Globe className="w-3.5 h-3.5" />
                <span>{storeName}</span>
              </span>
            </div>

            <h2 className="text-lg sm:text-xl font-bold font-display text-white">
              Tienda Online Independiente para Clientes
            </h2>

            <p className="text-xs text-slate-300 leading-relaxed">
              Enlace directo donde los clientes navegan el catálogo de repuestos, ven precios en <strong>$ y Bs. (BCV)</strong>, consultan el estado de su moto y realizan compras sin ver el panel administrativo ni los controles del taller.
            </p>

            {/* URL Display Pill */}
            <div className="pt-1 flex flex-wrap items-center gap-2">
              <span className="text-[11px] text-slate-400 font-medium">Link para clientes:</span>
              <code className="text-xs font-mono bg-slate-950/80 border border-slate-700 text-amber-300 px-3 py-1 rounded-lg select-all max-w-full truncate">
                {publicStoreUrl}
              </code>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-wrap items-center gap-2.5 shrink-0 w-full lg:w-auto">
            <button
              type="button"
              onClick={handleCopyPublicUrl}
              className={`flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer ${
                copiedStoreUrl
                  ? 'bg-emerald-500 text-slate-950'
                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950'
              }`}
            >
              {copiedStoreUrl ? (
                <>
                  <Check className="w-4 h-4" />
                  <span>¡Enlace Copiado!</span>
                </>
              ) : (
                <>
                  <Copy className="w-4 h-4" />
                  <span>Copiar Enlace</span>
                </>
              )}
            </button>

            <button
              type="button"
              onClick={handleShareStoreWhatsApp}
              className="flex-1 sm:flex-none px-4 py-2.5 rounded-xl text-xs font-semibold bg-emerald-600 hover:bg-emerald-500 text-white transition-all shadow-xs flex items-center justify-center gap-1.5 cursor-pointer"
              title="Compartir enlace con mensaje promocional por WhatsApp"
            >
              <Share2 className="w-4 h-4" />
              <span>Enviar por WhatsApp</span>
            </button>

            <button
              type="button"
              onClick={handleOpenQrModal}
              className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-800 hover:bg-slate-700 text-white border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Generar código QR para imprimir o mostrar en el mostrador del taller"
            >
              <QrCode className="w-4 h-4 text-amber-400" />
              <span>Código QR Mostrador</span>
            </button>

            <button
              type="button"
              onClick={enterPublicStore}
              className="flex-1 sm:flex-none px-3.5 py-2.5 rounded-xl text-xs font-semibold bg-slate-800/80 hover:bg-slate-700 text-slate-200 hover:text-white border border-slate-700 transition-all flex items-center justify-center gap-1.5 cursor-pointer"
              title="Abrir la tienda tal como la ve un cliente"
            >
              <span>Abrir como Cliente</span>
              <ExternalLink className="w-3.5 h-3.5 opacity-70" />
            </button>
          </div>
        </div>
      </div>

      {/* KPI Cards Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Sales */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Ventas Totales
            </span>
            <div className="w-8 h-8 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center">
              <TrendingUp className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-slate-950 mt-2 tabular-nums">
            {formatUSD(totalSalesAmountUSD)}
          </p>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span className="text-emerald-700 font-medium font-mono">{formatBs(totalSalesAmountUSD * rate)}</span>
            <button
              onClick={() => setCurrentView('admin_pos')}
              className="text-amber-600 font-semibold hover:underline"
            >
              Ir al POS
            </button>
          </div>
        </div>

        {/* Active Workshop Services */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Motos en Taller
            </span>
            <div className="w-8 h-8 rounded-lg bg-amber-50 text-amber-600 flex items-center justify-center">
              <Wrench className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-slate-950 mt-2 tabular-nums">
            {activeServices.length} <span className="text-sm font-normal text-slate-500">en servicio</span>
          </p>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span className="text-emerald-700 font-semibold">{readyServices.length} listas para entrega</span>
            <button
              onClick={() => setCurrentView('admin_taller')}
              className="text-amber-600 font-semibold hover:underline"
            >
              Ver taller
            </button>
          </div>
        </div>

        {/* Low Stock Alerts */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Alertas de Stock
            </span>
            <div className={`w-8 h-8 rounded-lg flex items-center justify-center ${lowStockProducts.length > 0 ? 'bg-rose-50 text-rose-600' : 'bg-slate-50 text-slate-400'}`}>
              <AlertTriangle className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-slate-950 mt-2 tabular-nums">
            {lowStockProducts.length} <span className="text-sm font-normal text-slate-500">críticos</span>
          </p>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span className="text-rose-600 font-medium">{outOfStockProducts.length} ocultos de tienda</span>
            <button
              onClick={() => setCurrentView('admin_inventario')}
              className="text-amber-600 font-semibold hover:underline"
            >
              Inventario
            </button>
          </div>
        </div>

        {/* Online Orders */}
        <div className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              Pedidos Tienda
            </span>
            <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShoppingBag className="w-4 h-4" />
            </div>
          </div>
          <p className="text-2xl font-bold font-mono text-slate-950 mt-2 tabular-nums">
            {pendingOrders.length} <span className="text-sm font-normal text-slate-500">pendientes</span>
          </p>
          <div className="mt-2 text-xs text-slate-500 flex items-center justify-between">
            <span>{onlineOrders.length} pedidos totales</span>
            <button
              onClick={() => setCurrentView('admin_pedidos')}
              className="text-amber-600 font-semibold hover:underline"
            >
              Gestionar
            </button>
          </div>
        </div>
      </div>

      {/* Control de Comisiones y Deuda MercadoLibre */}
      <div className="bg-gradient-to-r from-yellow-50 via-amber-50 to-white rounded-2xl border border-yellow-300 p-5 shadow-xs">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div className="flex items-start gap-3">
            <div className="w-10 h-10 rounded-xl bg-yellow-400 text-slate-950 flex items-center justify-center shrink-0 shadow-2xs font-bold">
              <Package className="w-5 h-5 text-yellow-950" />
            </div>
            <div>
              <div className="flex items-center gap-2 flex-wrap">
                <h3 className="font-bold text-slate-900 text-base">
                  Control de Deuda MercadoLibre
                </h3>
                <span
                  className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                    mercadolibreDebtUSD > 0
                      ? 'bg-amber-200 text-amber-950 border border-amber-300'
                      : 'bg-emerald-100 text-emerald-800'
                  }`}
                >
                  {mercadolibreDebtUSD > 0
                    ? `${totalMlPendingCount} pendientes (${pendingMercadoLibreSales.length} ventas, ${pendingMlEntries.length} ajustes)`
                    : 'Sin deuda pendiente'}
                </span>
              </div>
              <p className="text-xs text-slate-600 mt-1">
                Registra ventas, comisiones adicionales o pagos a MercadoLibre y recibe reportes directos en tu WhatsApp.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            <div className="text-right">
              <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                Total Deuda Acumulada
              </span>
              <span className="text-xl font-mono font-extrabold text-slate-950 tabular-nums">
                {formatUSD(mercadolibreDebtUSD)}
              </span>
              <span className="text-xs font-mono font-bold text-amber-800 block tabular-nums">
                {formatBs(mercadolibreDebtBs)} BCV
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {/* Botón para ingresar comisión adicional o registrar pago manual */}
              <button
                type="button"
                onClick={() => {
                  setMlError('');
                  setShowAddMlModal(true);
                }}
                className="px-3 py-2 bg-yellow-400 hover:bg-yellow-300 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer border border-yellow-500/30"
                title="Ingresar comisión adicional a pagar o registrar pago realizado a MercadoLibre"
              >
                <PlusCircle className="w-3.5 h-3.5" />
                <span>+ Ingresar Comisión / Pago</span>
              </button>

              <button
                type="button"
                onClick={handleNotifyMercadoLibreDebtWhatsApp}
                className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                title="Enviar reporte de deuda a mi WhatsApp"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Notificar a mi WhatsApp</span>
              </button>

              {mercadolibreDebtUSD > 0 && (
                <button
                  type="button"
                  onClick={() => {
                    if (window.confirm('¿Confirmas que ya pagaste la deuda completa a MercadoLibre? Se liquidarán las ventas y los ajustes pendientes.')) {
                      settleAllMercadoLibreCommissions();
                    }
                  }}
                  className="px-3 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
                >
                  <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Liquidar Todo</span>
                </button>
              )}

              {totalMlPendingCount > 0 && (
                <button
                  type="button"
                  onClick={() => setShowMlDetails(!showMlDetails)}
                  className="px-2.5 py-2 border border-yellow-300 bg-white hover:bg-yellow-100/50 text-yellow-900 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  {showMlDetails ? 'Ocultar' : `Ver Detalle (${totalMlPendingCount})`}
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Expandable breakdown of pending MercadoLibre sales and manual entries */}
        {showMlDetails && (
          <div className="mt-4 pt-4 border-t border-yellow-200/80 space-y-4">
            {/* Ventas registradas con comisión pendiente */}
            {pendingMercadoLibreSales.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <Package className="w-3.5 h-3.5 text-yellow-700" />
                  <span>Ventas en MercadoLibre con comisión pendiente ({pendingMercadoLibreSales.length}):</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {pendingMercadoLibreSales.map((s) => (
                    <div key={s.id} className="p-2.5 bg-white rounded-lg border border-yellow-200 text-xs space-y-1">
                      <div className="flex justify-between items-center">
                        <span className="font-mono font-bold text-slate-900">#{s.invoiceNumber}</span>
                        <span className="text-[10px] text-slate-500">{new Date(s.createdAt).toLocaleDateString('es-VE')}</span>
                      </div>
                      <p className="text-slate-700 truncate font-medium">{s.customerName}</p>
                      <div className="flex justify-between items-center pt-1 border-t border-slate-100 font-mono text-[11px]">
                        <span className="text-slate-500">Venta: {formatUSD(s.total)}</span>
                        <span className="font-bold text-amber-900">Debe ML: {formatUSD(s.mercadolibreCommissionUSD || 0)}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Ajustes manuales: cargos adicionales y abonos/pagos */}
            {pendingMlEntries.length > 0 && (
              <div>
                <h4 className="text-xs font-bold text-slate-800 mb-2 flex items-center gap-1.5">
                  <DollarSign className="w-3.5 h-3.5 text-amber-700" />
                  <span>Cargos adicionales y pagos manuales ({pendingMlEntries.length}):</span>
                </h4>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2 max-h-48 overflow-y-auto pr-1">
                  {pendingMlEntries.map((e) => {
                    const isPayment = e.type === 'ABONO_PAGO';
                    return (
                      <div
                        key={e.id}
                        className={`p-2.5 bg-white rounded-lg border text-xs space-y-1.5 ${
                          isPayment ? 'border-emerald-200' : 'border-amber-200'
                        }`}
                      >
                        <div className="flex justify-between items-center">
                          <span
                            className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                              isPayment
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-amber-100 text-amber-900'
                            }`}
                          >
                            {isPayment ? 'Pago / Abono (-)' : 'Comisión Adicional (+)'}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleDeleteMlEntry(e.id, e.description)}
                            className="p-1 text-slate-400 hover:text-rose-600 rounded"
                            title="Eliminar este ajuste"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                        <p className="text-slate-800 font-medium truncate" title={e.description}>
                          {e.description}
                        </p>
                        <div className="flex justify-between items-center pt-1 border-t border-slate-100 font-mono text-[11px]">
                          <span className="text-[10px] text-slate-400">{new Date(e.createdAt).toLocaleDateString('es-VE')}</span>
                          <span
                            className={`font-bold ${
                              isPayment ? 'text-emerald-700' : 'text-amber-900'
                            }`}
                          >
                            {isPayment ? '-' : '+'}{formatUSD(Math.abs(e.amountUSD))}
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {totalMlPendingCount === 0 && (
              <div className="p-4 bg-white/80 rounded-xl text-center text-xs text-slate-500">
                No hay ventas ni cargos pendientes a MercadoLibre en este momento.
              </div>
            )}
          </div>
        )}
      </div>

      {/* Main split: Active Workshop Jobs + Recent Sales */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Active Workshop Jobs */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Wrench className="w-4 h-4 text-amber-600" />
              <h3 className="font-bold text-slate-900 text-sm">
                Órdenes de Mecánica y Tapicería Activas
              </h3>
            </div>
            <button
              onClick={() => setCurrentView('admin_taller')}
              className="text-xs text-amber-600 font-semibold hover:underline flex items-center gap-1"
            >
              <span>Ver todas</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="p-5 divide-y divide-slate-100 space-y-3 flex-1">
            {serviceOrders.length === 0 ? (
              <div className="py-8 text-center text-slate-400 text-xs">
                No hay órdenes de servicio activas en el taller.
              </div>
            ) : (
              serviceOrders.slice(0, 4).map((order) => (
              <div key={order.id} className="pt-3 first:pt-0 flex items-start justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2">
                    <span className="text-xs font-bold font-mono bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                      {order.motorcycle.plate}
                    </span>
                    <span className="text-xs font-semibold text-slate-800">
                      {order.motorcycle.brand} {order.motorcycle.model}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 line-clamp-1">{order.serviceType} · {order.reportedIssue}</p>
                  <p className="text-[11px] text-slate-400">Cliente: {order.customerName} ({order.customerPhone})</p>
                </div>

                <div className="text-right shrink-0">
                  <span
                    className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                      order.status === 'CREADA'
                        ? 'bg-amber-100 text-amber-800'
                        : order.status === 'EN_PROCESO'
                        ? 'bg-blue-100 text-blue-800'
                        : order.status === 'CULMINADA'
                        ? 'bg-emerald-100 text-emerald-800'
                        : 'bg-slate-100 text-slate-700'
                    }`}
                  >
                    {order.status === 'CREADA' && 'En Espera'}
                    {order.status === 'EN_PROCESO' && 'En Proceso'}
                    {order.status === 'CULMINADA' && 'Culminada'}
                    {order.status === 'ENTREGADA' && 'Entregada'}
                  </span>
                  <p className="text-xs font-bold font-mono text-slate-900 mt-1">
                    {formatUSD(order.totalCost)}
                  </p>
                  <p className="text-[10px] font-semibold text-emerald-700 font-mono">
                    {formatBs(order.totalCost * rate)}
                  </p>
                </div>
              </div>
            )))}
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-100 rounded-b-xl text-center">
            <button
              onClick={() => setCurrentView('admin_taller')}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900"
            >
              Registrar nuevo ingreso de motocicleta al taller →
            </button>
          </div>
        </div>

        {/* Recent Invoices / Sales */}
        <div className="bg-white rounded-xl border border-slate-200 shadow-2xs flex flex-col justify-between">
          <div className="p-5 border-b border-slate-100 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <ShoppingCart className="w-4 h-4 text-emerald-600" />
              <h3 className="font-bold text-slate-900 text-sm">
                Últimas Facturas Emitidas
              </h3>
            </div>
            <button
              onClick={() => setCurrentView('admin_pos')}
              className="text-xs text-amber-600 font-semibold hover:underline flex items-center gap-1"
            >
              <span>Abrir POS</span>
              <ArrowRight className="w-3 h-3" />
            </button>
          </div>

          <div className="p-5 divide-y divide-slate-100 space-y-3 flex-1">
            {sales.slice(0, 4).map((sale) => (
              <div key={sale.id} className="pt-3 first:pt-0 flex items-center justify-between gap-3">
                <div className="space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span className="font-mono text-xs font-bold text-slate-900">{sale.invoiceNumber}</span>
                    <span className="text-[10px] text-slate-400">·</span>
                    <span className="text-xs font-medium text-slate-700">{sale.customerName}</span>
                    <span
                      className={`text-[9px] font-bold px-1.5 py-0.5 rounded ${
                        sale.paymentType === 'CREDITO'
                          ? sale.creditStatus === 'PAGADO'
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-amber-100 text-amber-800'
                          : sale.paymentType === 'MERCADOLIBRE'
                          ? sale.mercadolibreFeeStatus === 'PAGADO'
                            ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                            : 'bg-yellow-200 text-yellow-950 border border-yellow-400 font-bold'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {sale.paymentType === 'CREDITO'
                        ? `Crédito (${sale.creditStatus === 'PAGADO' ? 'Pagado' : 'Pendiente'})`
                        : sale.paymentType === 'MERCADOLIBRE'
                        ? `MercadoLibre (${sale.mercadolibreFeeStatus === 'PAGADO' ? 'Pagada' : `Comisión: ${formatUSD(sale.mercadolibreCommissionUSD || 0)}`})`
                        : 'Contado'}
                    </span>
                  </div>
                  <p className="text-[11px] text-slate-500">
                    {sale.items.length} {sale.items.length === 1 ? 'ítem' : 'ítems'} · {sale.paymentMethod}
                  </p>
                </div>

                <div className="flex items-center gap-3">
                  <div className="text-right">
                    <span className="font-mono font-bold text-sm text-slate-950 tabular-nums block">
                      {formatUSD(sale.total)}
                    </span>
                    <span className="font-mono text-[10px] font-semibold text-emerald-700 block tabular-nums">
                      {formatBs(sale.totalBs || sale.total * rate)}
                    </span>
                  </div>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={() => setSelectedInvoice(sale)}
                      className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                      title="Ver Factura"
                    >
                      <Eye className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => handleShareInvoiceWhatsApp(sale)}
                      className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded"
                      title="WhatsApp"
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              </div>
            ))}
          </div>

          <div className="p-3 bg-slate-50 border-t border-slate-100 rounded-b-xl text-center">
            <button
              onClick={() => setCurrentView('admin_pos')}
              className="text-xs font-semibold text-slate-700 hover:text-slate-900"
            >
              Realizar nueva venta rápida con factura al WhatsApp →
            </button>
          </div>
        </div>
      </div>

      {/* Modal: Ingresar Comisión Adicional o Registrar Pago a MercadoLibre */}
      {showAddMlModal && (
        <div className="fixed inset-0 z-50 bg-slate-950/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            {/* Modal Header */}
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-gradient-to-r from-yellow-50/60 via-amber-50/40 to-white">
              <div className="flex items-center gap-3">
                <div
                  className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold ${
                    mlModalType === 'CHARGE'
                      ? 'bg-yellow-400 text-yellow-950 shadow-2xs'
                      : 'bg-emerald-500 text-white shadow-2xs'
                  }`}
                >
                  {mlModalType === 'CHARGE' ? (
                    <PlusCircle className="w-5 h-5" />
                  ) : (
                    <MinusCircle className="w-5 h-5" />
                  )}
                </div>
                <div>
                  <h3 className="font-bold text-slate-900 text-base">
                    {mlModalType === 'CHARGE'
                      ? 'Sumar Comisión o Cargo a Pagar'
                      : 'Registrar Pago / Abono Realizado'}
                  </h3>
                  <p className="text-xs text-slate-500">
                    Ajuste directo sobre tu saldo adeudado a MercadoLibre
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => {
                  setShowAddMlModal(false);
                  setMlError('');
                }}
                className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body */}
            <div className="p-6 space-y-4">
              {/* Type Switcher Tabs */}
              <div>
                <label className="block text-[10px] font-bold text-slate-600 uppercase tracking-wider mb-1.5">
                  Tipo de Movimiento:
                </label>
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => {
                      setMlModalType('CHARGE');
                      setMlError('');
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      mlModalType === 'CHARGE'
                        ? 'bg-yellow-400 text-slate-950 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <PlusCircle className="w-3.5 h-3.5" />
                    <span>➕ Sumar Comisión / Cargo</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMlModalType('PAYMENT');
                      setMlError('');
                    }}
                    className={`py-2 px-3 rounded-lg text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                      mlModalType === 'PAYMENT'
                        ? 'bg-emerald-600 text-white shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <MinusCircle className="w-3.5 h-3.5" />
                    <span>➖ Registrar Pago / Abono</span>
                  </button>
                </div>
                <p className="text-[11px] text-slate-500 mt-1.5">
                  {mlModalType === 'CHARGE'
                    ? '📌 Ingresa el monto que tienes que pagarle adicional al saldo ya registrado (comisiones extra, publicaciones, etc.).'
                    : '📌 Ingresa el monto que pagaste o transferiste a MercadoLibre para descontarlo de tu deuda acumulada.'}
                </p>
              </div>

              {/* Amount Input */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Monto en Dólares ($ USD):
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400 font-bold">
                    $
                  </div>
                  <input
                    type="number"
                    step="0.01"
                    min="0.01"
                    value={mlModalAmount}
                    onChange={(e) => {
                      setMlModalAmount(e.target.value);
                      if (mlError) setMlError('');
                    }}
                    placeholder="0.00"
                    autoFocus
                    className="w-full pl-8 pr-16 py-2.5 border border-slate-300 rounded-xl text-lg font-mono font-bold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
                  />
                  <div className="absolute inset-y-0 right-0 pr-3 flex items-center pointer-events-none text-xs font-bold text-slate-400">
                    USD
                  </div>
                </div>

                <div className="mt-1 flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-500">
                    Equivalente en Bolívares (Tasa BCV Bs. {rate.toFixed(2)}):
                  </span>
                  <span className="font-bold text-amber-800">
                    {formatBs((parseFloat(mlModalAmount || '0') || 0) * rate)}
                  </span>
                </div>

                {/* Quick amount chips */}
                <div className="flex items-center gap-1.5 mt-2">
                  <span className="text-[10px] text-slate-400 font-bold uppercase">Rápidos:</span>
                  {[2, 5, 10, 15, 20, 50].map((quick) => (
                    <button
                      key={quick}
                      type="button"
                      onClick={() => setMlModalAmount(quick.toString())}
                      className="px-2 py-0.5 text-[11px] font-mono font-semibold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md cursor-pointer transition-colors"
                    >
                      ${quick}
                    </button>
                  ))}
                </div>
              </div>

              {/* Description Input */}
              <div>
                <label className="block text-xs font-bold text-slate-800 mb-1">
                  Descripción o Motivo del Registro:
                </label>
                <input
                  type="text"
                  value={mlModalDescription}
                  onChange={(e) => setMlModalDescription(e.target.value)}
                  placeholder={
                    mlModalType === 'CHARGE'
                      ? 'Ej: Comisión adicional por venta, cargo por publicación, envío...'
                      : 'Ej: Transferencia bancaria, Pago Móvil Banco de Venezuela, etc...'
                  }
                  className="w-full px-3 py-2 border border-slate-300 rounded-xl text-xs text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-yellow-400 focus:border-yellow-400"
                />

                {/* Quick descriptions */}
                <div className="flex flex-wrap gap-1.5 mt-2">
                  {(mlModalType === 'CHARGE'
                    ? [
                        'Comisión extra venta',
                        'Cargo por publicación',
                        'Comisión Mercado Envíos',
                        'Ajuste por reclamo',
                      ]
                    : [
                        'Pago mensual ML',
                        'Transferencia bancaria',
                        'Abono parcial',
                        'Liquidación saldo',
                      ]
                  ).map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      onClick={() => setMlModalDescription(preset)}
                      className="px-2 py-0.5 text-[10px] font-medium bg-yellow-50 hover:bg-yellow-100 text-yellow-900 border border-yellow-200 rounded-md cursor-pointer transition-colors"
                    >
                      + {preset}
                    </button>
                  ))}
                </div>
              </div>

              {/* Live Balance Impact Preview */}
              {(() => {
                const entered = parseFloat(mlModalAmount || '0') || 0;
                const isPay = mlModalType === 'PAYMENT';
                const nextDebt = isPay
                  ? Math.max(0, mercadolibreDebtUSD - entered)
                  : mercadolibreDebtUSD + entered;

                return (
                  <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-xs space-y-1.5">
                    <div className="flex justify-between items-center text-slate-600">
                      <span>Saldo actual adeudado:</span>
                      <span className="font-mono font-semibold">{formatUSD(mercadolibreDebtUSD)}</span>
                    </div>
                    <div className="flex justify-between items-center font-bold">
                      <span className={isPay ? 'text-emerald-700' : 'text-amber-800'}>
                        {isPay ? '(-) Monto a descontar:' : '(+) Monto a sumar:'}
                      </span>
                      <span className={`font-mono ${isPay ? 'text-emerald-700' : 'text-amber-800'}`}>
                        {isPay ? '-' : '+'}{formatUSD(entered)}
                      </span>
                    </div>
                    <div className="pt-1.5 border-t border-slate-200 flex justify-between items-center font-bold text-slate-900">
                      <span>Nuevo saldo adeudado:</span>
                      <div className="text-right">
                        <span className="font-mono text-sm block">{formatUSD(nextDebt)}</span>
                        <span className="font-mono text-[10px] text-slate-500 font-normal">
                          {formatBs(nextDebt * rate)} BCV
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })()}

              {mlError && (
                <div className="p-2.5 bg-rose-50 border border-rose-200 text-rose-700 text-xs rounded-xl font-medium">
                  ⚠️ {mlError}
                </div>
              )}
            </div>

            {/* Modal Footer */}
            <div className="p-4 bg-slate-50 border-t border-slate-100 flex flex-col sm:flex-row items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setShowAddMlModal(false);
                  setMlError('');
                }}
                className="w-full sm:w-auto px-4 py-2 border border-slate-300 text-slate-700 hover:bg-slate-100 font-semibold text-xs rounded-xl cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => handleSaveManualMlEntry(false)}
                className="w-full sm:w-auto px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Solo Guardar
              </button>
              <button
                type="button"
                onClick={() => handleSaveManualMlEntry(true)}
                className="w-full sm:w-auto px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Guardar y Notificar a mi WhatsApp</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* QR Code Modal for Counter Display */}
      {showQrModal && (
        <div className="fixed inset-0 z-50 bg-slate-900/70 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full overflow-hidden shadow-2xl border border-slate-200 animate-in fade-in zoom-in-95">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-amber-400" />
                <h3 className="text-sm font-bold font-display">Código QR para Mostrador</h3>
              </div>
              <button
                type="button"
                onClick={() => setShowQrModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-6 flex flex-col items-center text-center space-y-4">
              <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
                {storeName}
              </span>
              <p className="text-xs text-slate-600">
                Los clientes pueden escanear este código con su teléfono en el mostrador para abrir la tienda online:
              </p>

              {qrCodeUrl ? (
                <div className="p-3 bg-white border-2 border-slate-200 rounded-2xl shadow-inner">
                  <img
                    src={qrCodeUrl}
                    alt={`Código QR ${storeName}`}
                    className="w-52 h-52 object-contain"
                  />
                </div>
              ) : (
                <div className="w-52 h-52 bg-slate-100 rounded-2xl flex items-center justify-center text-slate-400 text-xs">
                  Generando QR...
                </div>
              )}

              <p className="text-[11px] font-mono text-slate-500 break-all px-2">
                {publicStoreUrl}
              </p>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-2">
              <button
                type="button"
                onClick={handleCopyPublicUrl}
                className="px-3.5 py-2 text-xs font-semibold text-slate-700 bg-white border border-slate-300 rounded-xl hover:bg-slate-100 flex items-center gap-1.5 cursor-pointer"
              >
                {copiedStoreUrl ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copiedStoreUrl ? 'Copiado' : 'Copiar Link'}</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  if (qrCodeUrl) {
                    const link = document.createElement('a');
                    link.href = qrCodeUrl;
                    link.download = `QR_${storeName.replace(/\s+/g, '_')}.png`;
                    link.click();
                  }
                }}
                className="px-4 py-2 text-xs font-bold text-slate-950 bg-amber-400 hover:bg-amber-300 rounded-xl transition-colors shadow-xs cursor-pointer"
              >
                Descargar Imagen QR
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
