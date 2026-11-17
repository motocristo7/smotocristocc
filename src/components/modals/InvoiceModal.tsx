import React, { useEffect, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  formatUSD,
  formatBs,
  buildInvoiceWhatsAppMessage,
  hasValidWhatsAppPhone,
  getPublicAppOrigin,
} from '../../utils/whatsapp';
import { downloadInvoicePDF } from '../../utils/pdfInvoice';
import {
  X,
  Printer,
  MessageSquare,
  CheckCircle2,
  ShieldCheck,
  TrendingUp,
  FileDown,
  Calendar,
  Package,
  ExternalLink,
  Phone,
  Eye,
} from 'lucide-react';

export const InvoiceModal: React.FC = () => {
  const {
    selectedInvoice,
    setSelectedInvoice,
    settings,
    setWhatsappModalData,
    updateSaleCreditStatus,
    updateMercadoLibreCommission,
  } = useApp();
  const [downloaded, setDownloaded] = useState(false);
  const [showPhoneBar, setShowPhoneBar] = useState(false);
  const [manualPhone, setManualPhone] = useState('');
  const [whatsappNotice, setWhatsappNotice] = useState<string | null>(null);
  const phoneBarRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    setDownloaded(false);
    setShowPhoneBar(false);
    setManualPhone('');
    setWhatsappNotice(null);
  }, [selectedInvoice?.id]);

  useEffect(() => {
    if (showPhoneBar) {
      phoneBarRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [showPhoneBar]);

  if (!selectedInvoice) return null;

  const rate = selectedInvoice.bcvRate || settings.bcvRate;
  const totalBs = selectedInvoice.totalBs || selectedInvoice.total * rate;

  const storedPhoneValid = hasValidWhatsAppPhone(selectedInvoice.customerPhone);
  const effectivePhone = storedPhoneValid ? selectedInvoice.customerPhone : manualPhone.trim();
  const directWhatsApp = buildInvoiceWhatsAppMessage(
    { ...selectedInvoice, customerPhone: effectivePhone },
    settings
  );

  const handlePrint = () => {
    window.print();
  };

  const handleDownloadPDF = () => {
    downloadInvoicePDF(selectedInvoice, settings);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 3000);
  };

  const handleDirectWhatsAppAndDownload = () => {
    downloadInvoicePDF(selectedInvoice, settings);
    setDownloaded(true);
    setWhatsappNotice(
      `Factura #${selectedInvoice.invoiceNumber} descargada en PDF y abierta en WhatsApp. Adjunta el PDF con el ícono de clip (📎).`
    );
    setTimeout(() => setDownloaded(false), 3500);
  };

  const handleOpenWhatsAppPreview = () => {
    setWhatsappModalData({
      title: `Factura #${selectedInvoice.invoiceNumber}`,
      message: directWhatsApp.message,
      url: directWhatsApp.url,
      phone: effectivePhone || 'Sin teléfono',
      recipientName: selectedInvoice.customerName || 'Cliente',
      sale: selectedInvoice,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl my-8 overflow-hidden animate-in fade-in zoom-in-95 duration-150 print-container">
        {/* Modal Controls Bar (hidden during print) */}
        <div className="bg-slate-900 text-white px-6 py-3.5 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-2">
            <span className="font-semibold text-sm">Comprobante de Venta (Venezuela)</span>
            <span className="text-slate-400">·</span>
            <span className="font-mono text-xs text-amber-400 bg-amber-400/10 px-2 py-0.5 rounded">
              {selectedInvoice.invoiceNumber}
            </span>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            <button
              type="button"
              onClick={handleDownloadPDF}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-semibold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors cursor-pointer shadow-xs"
              title="Descargar documento PDF oficial con membrete y RIF"
            >
              <FileDown className="w-3.5 h-3.5" />
              <span>{downloaded ? '¡Descargado!' : 'Descargar PDF'}</span>
            </button>

            {storedPhoneValid ? (
              <a
                href={directWhatsApp.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleDirectWhatsAppAndDownload}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors cursor-pointer"
                title="Abrir WhatsApp con la factura y descargar PDF en ese momento"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Enviar a WhatsApp</span>
                <ExternalLink className="w-3 h-3 opacity-80" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setShowPhoneBar((prev) => !prev)}
                className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-emerald-600 hover:bg-emerald-700 text-white rounded-md transition-colors cursor-pointer"
                title="Ingresar número o enviar a WhatsApp descargando PDF"
              >
                <MessageSquare className="w-3.5 h-3.5" />
                <span>Enviar a WhatsApp</span>
              </button>
            )}

            <button
              type="button"
              onClick={handlePrint}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 text-xs font-medium bg-slate-800 hover:bg-slate-700 text-slate-200 rounded-md transition-colors cursor-pointer"
            >
              <Printer className="w-3.5 h-3.5" />
              <span>Imprimir</span>
            </button>
            <button
              type="button"
              onClick={() => setSelectedInvoice(null)}
              className="p-1.5 text-slate-400 hover:text-white rounded-md transition-colors cursor-pointer"
            >
              <X className="w-5 h-5" />
            </button>
          </div>
        </div>

        {/* Printable Invoice Body */}
        <div className="p-8 bg-white text-slate-900" id="printable-invoice">
          {/* Header */}
          <div className="flex items-start justify-between border-b border-slate-200 pb-6">
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xl font-extrabold tracking-tight text-slate-950 font-display">
                  {settings.commercialName.toUpperCase()}
                </span>
              </div>
              <p className="text-xs text-slate-500 mt-1">Repuestos de Motocicletas, Taller Mecánico y Tapicería</p>
              <p className="text-xs text-slate-700 font-bold mt-1 font-mono">RIF: {settings.rif}</p>
              <p className="text-xs text-slate-600 max-w-sm">{settings.address}</p>
              {!settings.address.includes(settings.city) && (
                <p className="text-xs text-slate-600">{settings.city}, {settings.state} - Venezuela</p>
              )}
              <p className="text-xs text-slate-600 font-medium">Teléfono / WhatsApp: <span className="font-mono">{settings.phone}</span></p>
            </div>

            <div className="text-right">
              <div className="inline-block bg-slate-100 px-3 py-1.5 rounded border border-slate-200 text-right">
                <p className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">Factura de Venta</p>
                <p className="text-base font-bold font-mono text-slate-900">{selectedInvoice.invoiceNumber}</p>
              </div>
              <p className="text-xs text-slate-500 mt-2">
                Fecha: {new Date(selectedInvoice.createdAt).toLocaleDateString('es-VE', {
                  day: '2-digit',
                  month: 'short',
                  year: 'numeric'
                })}
              </p>
              <p className="text-xs text-slate-500 font-mono">
                Hora: {new Date(selectedInvoice.createdAt).toLocaleTimeString('es-VE', {
                  hour: '2-digit',
                  minute: '2-digit'
                })}
              </p>
              <div className="mt-2 inline-flex items-center gap-1 text-[11px] font-bold text-emerald-800 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                <TrendingUp className="w-3 h-3 text-emerald-600" />
                <span>Tasa BCV: Bs. {rate.toFixed(2)}</span>
              </div>
            </div>
          </div>

          {/* Customer info */}
          <div className="grid grid-cols-2 gap-4 py-4 border-b border-slate-200 text-xs">
            <div>
              <span className="font-semibold text-slate-500 uppercase tracking-wider block text-[10px]">
                Datos del Cliente
              </span>
              <p className="font-semibold text-slate-900 text-sm mt-0.5">{selectedInvoice.customerName}</p>
              <p className="text-slate-600 mt-0.5">Teléfono: <span className="font-mono">{selectedInvoice.customerPhone}</span></p>
              {selectedInvoice.customerDocument && (
                <p className="text-slate-600 font-mono font-medium">Cédula / RIF: {selectedInvoice.customerDocument}</p>
              )}
            </div>

            <div className="text-right sm:text-left">
              <span className="font-semibold text-slate-500 uppercase tracking-wider block text-[10px]">
                Detalles del Pago & Condición
              </span>
              <div className="mt-1 flex items-center gap-1.5 flex-wrap">
                <span className="font-semibold text-slate-900 text-xs">
                  Método: <span className="text-emerald-700">{selectedInvoice.paymentMethod}</span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded text-[10px] font-bold ${
                    selectedInvoice.paymentType === 'APARTADO'
                      ? 'bg-indigo-100 text-indigo-900 border border-indigo-300'
                      : selectedInvoice.paymentType === 'CREDITO'
                      ? 'bg-amber-100 text-amber-850 border border-amber-300'
                      : selectedInvoice.paymentType === 'MERCADOLIBRE'
                      ? 'bg-yellow-200 text-yellow-950 border border-yellow-400'
                      : 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                  }`}
                >
                  {selectedInvoice.paymentType === 'APARTADO'
                    ? `SISTEMA DE APARTADO (${selectedInvoice.creditDays || 15} DÍAS)`
                    : selectedInvoice.paymentType === 'CREDITO'
                    ? `A CRÉDITO (${selectedInvoice.creditDays || 15} DÍAS)`
                    : selectedInvoice.paymentType === 'MERCADOLIBRE'
                    ? 'MERCADOLIBRE'
                    : 'DE CONTADO'}
                </span>
              </div>

              {(selectedInvoice.paymentType === 'CREDITO' || selectedInvoice.paymentType === 'APARTADO') ? (
                <div
                  className={`mt-1.5 p-2 rounded-lg border text-[11px] space-y-1 ${
                    selectedInvoice.paymentType === 'APARTADO'
                      ? 'bg-indigo-50 border-indigo-200'
                      : 'bg-amber-50 border-amber-200'
                  }`}
                >
                  <div
                    className={`flex justify-between items-center ${
                      selectedInvoice.paymentType === 'APARTADO' ? 'text-indigo-900' : 'text-amber-900'
                    }`}
                  >
                    <span className="flex items-center gap-1 font-medium">
                      <Calendar
                        className={`w-3 h-3 ${
                          selectedInvoice.paymentType === 'APARTADO' ? 'text-indigo-600' : 'text-amber-600'
                        }`}
                      />
                      {selectedInvoice.paymentType === 'APARTADO' ? 'Retirar antes:' : 'Vence:'}{' '}
                      {selectedInvoice.creditDueDate || 'A convenir'}
                    </span>
                    <span
                      className={`font-bold px-1.5 py-0.2 rounded text-[10px] ${
                        selectedInvoice.creditStatus === 'PAGADO'
                          ? 'bg-emerald-100 text-emerald-800'
                          : 'bg-rose-100 text-rose-800'
                      }`}
                    >
                      {selectedInvoice.creditStatus === 'PAGADO' ? 'PAGADO' : 'PENDIENTE'}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600">
                    <span>{selectedInvoice.paymentType === 'APARTADO' ? 'Abonado / Reserva:' : 'Abonado:'}</span>
                    <span className="font-mono font-bold text-slate-800">
                      {formatUSD(selectedInvoice.creditPaidAmount || 0)}
                    </span>
                  </div>

                  <div
                    className={`flex justify-between font-bold border-t pt-1 ${
                      selectedInvoice.paymentType === 'APARTADO'
                        ? 'text-indigo-950 border-indigo-200/80'
                        : 'text-amber-950 border-amber-200/80'
                    }`}
                  >
                    <span>
                      {selectedInvoice.paymentType === 'APARTADO' ? 'Saldo para retirar:' : 'Saldo pendiente:'}
                    </span>
                    <span className="font-mono text-rose-700">
                      {formatUSD(Math.max(0, selectedInvoice.total - (selectedInvoice.creditPaidAmount || 0)))}
                    </span>
                  </div>

                  {selectedInvoice.creditStatus !== 'PAGADO' && (
                    <button
                      type="button"
                      onClick={() => {
                        updateSaleCreditStatus(selectedInvoice.id, 'PAGADO', selectedInvoice.total);
                        setSelectedInvoice({
                          ...selectedInvoice,
                          creditStatus: 'PAGADO',
                          creditPaidAmount: selectedInvoice.total,
                        });
                      }}
                      className="w-full mt-1 py-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>
                        {selectedInvoice.paymentType === 'APARTADO'
                          ? 'Marcar Apartado como Liquidado'
                          : 'Marcar Crédito como Pagado'}
                      </span>
                    </button>
                  )}
                </div>
              ) : selectedInvoice.paymentType === 'MERCADOLIBRE' ? (
                <div className="mt-1.5 p-2 bg-yellow-50 rounded-lg border border-yellow-300 text-[11px] space-y-1">
                  <div className="flex justify-between items-center text-yellow-950 font-bold">
                    <span className="flex items-center gap-1">
                      <Package className="w-3 h-3 text-yellow-700" />
                      Canal MercadoLibre
                    </span>
                    <span
                      className={`font-bold px-1.5 py-0.5 rounded text-[10px] ${
                        selectedInvoice.mercadolibreFeeStatus === 'PAGADO'
                          ? 'bg-emerald-100 text-emerald-800 border border-emerald-300'
                          : 'bg-amber-100 text-amber-900 border border-amber-300'
                      }`}
                    >
                      {selectedInvoice.mercadolibreFeeStatus === 'PAGADO' ? 'COMISIÓN PAGADA' : 'DEUDA PENDIENTE'}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-700">
                    <span>Comisión a MercadoLibre:</span>
                    <span className="font-mono font-bold text-yellow-950">
                      {formatUSD(selectedInvoice.mercadolibreCommissionUSD || 0)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-600 text-[10px]">
                    <span>Equivalente en Bs:</span>
                    <span className="font-mono">
                      {formatBs((selectedInvoice.mercadolibreCommissionUSD || 0) * rate)}
                    </span>
                  </div>

                  <div className="flex justify-between text-slate-700 border-t border-yellow-200/90 pt-1">
                    <span>Neto taller (Precio registrado):</span>
                    <span className="font-mono font-bold text-emerald-700">
                      {formatUSD(selectedInvoice.subtotal - (selectedInvoice.discount || 0))}
                    </span>
                  </div>

                  {selectedInvoice.mercadolibreFeeStatus !== 'PAGADO' && (
                    <button
                      type="button"
                      onClick={() => {
                        updateMercadoLibreCommission(selectedInvoice.id, 'PAGADO');
                        setSelectedInvoice({
                          ...selectedInvoice,
                          mercadolibreFeeStatus: 'PAGADO',
                        });
                      }}
                      className="w-full mt-1.5 py-1 px-2 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded text-[10px] flex items-center justify-center gap-1 transition-colors cursor-pointer"
                    >
                      <CheckCircle2 className="w-3 h-3" />
                      <span>Marcar Comisión como Pagada a ML</span>
                    </button>
                  )}
                </div>
              ) : (
                <div className="flex items-center gap-1 text-emerald-600 mt-1">
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span className="font-medium text-[11px]">Pagado de Contado y Liquidado</span>
                </div>
              )}
            </div>
          </div>

          {/* Items Table */}
          <div className="py-4">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-slate-300 text-slate-500 text-[11px] font-semibold uppercase tracking-wider text-left">
                  <th className="py-2 w-12 text-center">Cant.</th>
                  <th className="py-2">Descripción del Repuesto / Servicio</th>
                  <th className="py-2 text-right">Precio ($ USD)</th>
                  <th className="py-2 text-right">Equiv. (Bs)</th>
                  <th className="py-2 text-right">Total ($ USD)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {selectedInvoice.items.map((item, idx) => {
                  const itemTotalBs = item.total * rate;
                  return (
                    <tr key={idx} className="hover:bg-slate-50">
                      <td className="py-2.5 text-center font-mono font-medium text-slate-700">{item.quantity}</td>
                      <td className="py-2.5">
                        <p className="font-medium text-slate-900">{item.name}</p>
                        {item.sku && (
                          <p className="text-[10px] text-slate-400 font-mono">SKU: {item.sku}</p>
                        )}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-600 tabular-nums">
                        {formatUSD(item.unitPrice)}
                      </td>
                      <td className="py-2.5 text-right font-mono text-slate-500 tabular-nums">
                        {formatBs(item.unitPrice * rate)}
                      </td>
                      <td className="py-2.5 text-right font-mono font-semibold text-slate-900 tabular-nums">
                        {formatUSD(item.total)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Dual Currency Totals */}
          <div className="border-t border-slate-200 pt-4 flex justify-end">
            <div className="w-72 space-y-2 text-xs">
              <div className="flex justify-between text-slate-600">
                <span>{selectedInvoice.paymentType === 'MERCADOLIBRE' ? 'Subtotal (Precio Registrado):' : 'Subtotal (USD):'}</span>
                <span className="font-mono tabular-nums">{formatUSD(selectedInvoice.subtotal)}</span>
              </div>
              {selectedInvoice.discount > 0 && (
                <div className="flex justify-between text-emerald-600 font-medium">
                  <span>Descuento:</span>
                  <span className="font-mono tabular-nums">-{formatUSD(selectedInvoice.discount)}</span>
                </div>
              )}
              {selectedInvoice.paymentType === 'MERCADOLIBRE' && (selectedInvoice.mercadolibreCommissionUSD || 0) > 0 && (
                <div className="flex justify-between text-amber-800 font-semibold">
                  <span>Recargo MercadoLibre (Adicional):</span>
                  <span className="font-mono tabular-nums">+{formatUSD(selectedInvoice.mercadolibreCommissionUSD || 0)}</span>
                </div>
              )}
              <div className="flex justify-between text-sm font-bold text-slate-900 pt-2 border-t border-slate-200">
                <span>Total en Dólares:</span>
                <span className="font-mono text-base tabular-nums text-slate-950 font-extrabold">
                  {formatUSD(selectedInvoice.total)}
                </span>
              </div>

              {/* Bolívares a tasa BCV */}
              <div className="bg-emerald-50 border border-emerald-200 p-2.5 rounded-lg space-y-1">
                <div className="flex justify-between text-[11px] text-emerald-800">
                  <span>Tasa Oficial BCV:</span>
                  <span className="font-mono font-bold">Bs. {rate.toFixed(2)}</span>
                </div>
                <div className="flex justify-between text-sm font-bold text-emerald-950 pt-1 border-t border-emerald-200/80">
                  <span>Total en Bolívares:</span>
                  <span className="font-mono text-base tabular-nums font-extrabold text-emerald-900">
                    {formatBs(totalBs)}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Datos para el pago: Para ventas a crédito o sistema de apartado con saldo pendiente */}
          {(selectedInvoice.paymentType === 'CREDITO' || selectedInvoice.paymentType === 'APARTADO') ? (
            <div
              className={`mt-4 p-3.5 border rounded-xl flex items-center justify-between gap-4 ${
                selectedInvoice.paymentType === 'APARTADO'
                  ? 'bg-indigo-50/80 border-indigo-300'
                  : 'bg-amber-50/80 border-amber-300'
              }`}
            >
              <div className="text-xs space-y-1">
                <span
                  className={`font-bold text-[11px] uppercase tracking-wide block ${
                    selectedInvoice.paymentType === 'APARTADO' ? 'text-indigo-900' : 'text-amber-900'
                  }`}
                >
                  {selectedInvoice.paymentType === 'APARTADO'
                    ? 'Datos para Abonos / Liquidación de Apartado (Venezuela)'
                    : 'Datos para el Pago del Crédito (Venezuela)'}
                </span>
                <p><strong className="text-slate-700">Banco:</strong> {settings.bankDetails.pagoMovilBank}</p>
                <p><strong className="text-slate-700">Pago Móvil:</strong> <span className="font-mono font-bold text-slate-900">{settings.bankDetails.pagoMovilPhone}</span> · <span className="font-mono font-bold text-slate-900">{settings.bankDetails.pagoMovilId}</span></p>
                <p
                  className={`text-[11px] font-semibold ${
                    selectedInvoice.paymentType === 'APARTADO' ? 'text-indigo-900' : 'text-amber-900'
                  }`}
                >
                  {selectedInvoice.paymentType === 'APARTADO' ? 'Saldo para retirar:' : 'Saldo pendiente:'}{' '}
                  {formatUSD(Math.max(0, selectedInvoice.total - (selectedInvoice.creditPaidAmount || 0)))}
                </p>
              </div>
              <img
                src={settings.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg'}
                alt="QR Pago Móvil"
                className="w-16 h-16 object-contain rounded-lg border border-amber-200 shadow-2xs shrink-0 bg-white"
              />
            </div>
          ) : (
            <div className="mt-4 p-3 bg-emerald-50/80 border border-emerald-200 rounded-xl text-xs space-y-0.5">
              <span className="font-bold text-emerald-800 text-[11px] uppercase tracking-wide block">
                ✓ Comprobante de Compra de Contado - Cancelado en su totalidad
              </span>
              <p className="text-slate-600 text-[11px]">
                Método: <strong className="text-slate-800">{selectedInvoice.paymentMethod || 'Pago Móvil / Divisas'}</strong> · ¡Muchas gracias por su compra y preferencia!
              </p>
            </div>
          )}

          {/* Banner llamativo Tienda Online */}
          <a
            href={`${getPublicAppOrigin().replace(/\/+$/, '')}/`}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 block rounded-xl bg-slate-950 border-2 border-amber-500 overflow-hidden shadow-md hover:border-amber-400 transition-colors group"
          >
            <div className="bg-amber-500 text-slate-950 px-4 py-1.5 text-[11px] font-black uppercase tracking-wider flex items-center justify-between">
              <span>{(settings.onlineStoreName || 'Mercado Moto CC').toUpperCase()} · TIENDA ONLINE OFICIAL</span>
              <span>CATÁLOGO EN VIVO</span>
            </div>
            <div className="p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="space-y-1">
                <p className="text-base sm:text-lg font-extrabold text-white font-display leading-snug">
                  ¡Entra en nuestra tienda para más repuestos y ofertas!
                </p>
                <p className="text-xs text-slate-300">
                  Explora precios actualizados a tasa BCV, apartados y consulta tus cuentas por pagar.
                </p>
              </div>
              <div className="px-4 py-2.5 rounded-lg bg-amber-500 group-hover:bg-amber-400 text-slate-950 font-mono font-extrabold text-xs sm:text-sm whitespace-nowrap shrink-0 flex items-center justify-center gap-1.5 shadow-sm">
                <span>{getPublicAppOrigin().replace(/^https?:\/\//, '')}</span>
                <ExternalLink className="w-3.5 h-3.5 shrink-0" />
              </div>
            </div>
          </a>

          {/* Guarantee & Notes */}
          <div className="mt-5 pt-4 border-t border-dashed border-slate-200 text-[11px] text-slate-500 space-y-1">
            <div className="flex items-start gap-1.5 text-slate-700">
              <ShieldCheck className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
              <span>{settings.invoiceDisclaimer}</span>
            </div>
            {selectedInvoice.notes && (
              <p className="text-slate-600 italic">Observaciones: {selectedInvoice.notes}</p>
            )}
            <p className="text-center text-[10px] text-slate-400 pt-3">
              Gracias por su preferencia en {settings.name}. ¡Buenas rutas y seguridad ante todo!
            </p>
          </div>
        </div>

        {/* Inline WhatsApp Phone Input (for Cliente Mostrador / sin teléfono) */}
        {showPhoneBar && !storedPhoneValid && (
          <div
            ref={phoneBarRef}
            className="px-5 py-3.5 bg-emerald-50 border-t border-emerald-200 no-print space-y-2"
          >
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-bold text-emerald-950 flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-700" />
                <span>Ingresa el WhatsApp del cliente (o deja vacío para elegir contacto en WhatsApp):</span>
              </p>
              <button
                type="button"
                onClick={() => setShowPhoneBar(false)}
                className="text-xs text-emerald-800 hover:text-emerald-950 font-semibold cursor-pointer"
              >
                Cerrar
              </button>
            </div>
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
              <input
                type="tel"
                value={manualPhone}
                onChange={(e) => setManualPhone(e.target.value)}
                placeholder="Ej: 0412-1234567"
                autoFocus
                className="flex-1 px-3 py-2 text-xs bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-900"
              />
              <a
                href={directWhatsApp.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleDirectWhatsAppAndDownload}
                className="inline-flex items-center justify-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Descargar PDF y Enviar a WhatsApp</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>
            </div>
          </div>
        )}

        {/* Confirmation Banner after opening WhatsApp + downloading PDF */}
        {whatsappNotice && (
          <div className="px-5 py-2.5 bg-emerald-600 text-white text-xs font-medium flex items-center justify-between gap-3 no-print">
            <div className="flex items-center gap-2">
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{whatsappNotice}</span>
            </div>
            <button
              type="button"
              onClick={handleOpenWhatsAppPreview}
              className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-white/15 hover:bg-white/25 text-white text-[11px] font-semibold shrink-0 cursor-pointer"
            >
              <Eye className="w-3 h-3" />
              <span>Ver texto / Cambiar Nº</span>
            </button>
          </div>
        )}

        {/* Modal Bottom actions */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 no-print">
          <div className="flex items-center gap-3">
            <p className="text-xs text-slate-500">
              Comprobante registrado y respaldado en sistema a tasa oficial BCV.
            </p>
            <button
              type="button"
              onClick={handleOpenWhatsAppPreview}
              className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 underline cursor-pointer"
            >
              Vista previa mensaje
            </button>
          </div>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => setSelectedInvoice(null)}
              className="px-4 py-2 text-xs font-medium text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
            >
              Cerrar
            </button>

            {storedPhoneValid ? (
              <a
                href={directWhatsApp.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={handleDirectWhatsAppAndDownload}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Enviar Factura a WhatsApp</span>
                <ExternalLink className="w-3.5 h-3.5 opacity-80" />
              </a>
            ) : (
              <button
                type="button"
                onClick={() => setShowPhoneBar((prev) => !prev)}
                className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-lg shadow-sm transition-colors cursor-pointer"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Enviar Factura a WhatsApp</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};
