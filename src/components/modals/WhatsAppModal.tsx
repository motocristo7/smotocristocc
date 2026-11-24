import React, { useEffect, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  downloadInvoicePDF,
  getInvoicePDFBlob,
  downloadServiceOrderPDF,
  getServiceOrderPDFBlob,
  downloadTechnicianPayoutPDF,
  getTechnicianPayoutPDFBlob,
  downloadPurchaseOrderPDF,
  getPurchaseOrderPDFBlob,
} from '../../utils/pdfInvoice';
import { buildWhatsAppSendUrl, hasValidWhatsAppPhone } from '../../utils/whatsapp';
import {
  MessageSquare,
  ExternalLink,
  Copy,
  Check,
  X,
  Phone,
  FileDown,
  Share2,
  Paperclip,
  CheckCircle2,
  Wrench,
  User,
  Truck,
} from 'lucide-react';

export const WhatsAppModal: React.FC = () => {
  const { whatsappModalData, setWhatsappModalData, settings, products } = useApp();
  const [copied, setCopied] = useState(false);
  const [downloadedPdf, setDownloadedPdf] = useState(false);
  const [isGeneratingPdf, setIsGeneratingPdf] = useState(false);
  const [activeTarget, setActiveTarget] = useState<'primary' | 'secondary'>('primary');
  const [manualPhones, setManualPhones] = useState<{ primary: string; secondary: string }>({
    primary: '',
    secondary: '',
  });
  const [sentTargets, setSentTargets] = useState<{ primary: boolean; secondary: boolean }>({
    primary: false,
    secondary: false,
  });
  const [showPhoneEditor, setShowPhoneEditor] = useState(false);

  useEffect(() => {
    setManualPhones({ primary: '', secondary: '' });
    setSentTargets({ primary: false, secondary: false });
    setActiveTarget('primary');
    setShowPhoneEditor(false);
    setDownloadedPdf(false);
    setCopied(false);
  }, [whatsappModalData]);

  if (!whatsappModalData) return null;

  const secondary = whatsappModalData.secondaryNotification;
  const isSecondaryActive = Boolean(secondary && activeTarget === 'secondary');

  const activeTitle = isSecondaryActive && secondary ? secondary.title : whatsappModalData.title;
  const activeMessage = isSecondaryActive && secondary ? secondary.message : whatsappModalData.message;
  const activeRecipientName =
    isSecondaryActive && secondary ? secondary.recipientName : whatsappModalData.recipientName;
  const activeStoredPhone =
    (isSecondaryActive && secondary ? secondary.phone : whatsappModalData.phone) || '';
  const activeManualPhone = isSecondaryActive ? manualPhones.secondary : manualPhones.primary;
  const activeIsTechnician = Boolean(
    isSecondaryActive ? secondary?.isTechnician : whatsappModalData.isTechnician
  );
  const activeIsSupplier = Boolean(!isSecondaryActive && (whatsappModalData.isSupplier || whatsappModalData.purchaseOrder));

  const sale = whatsappModalData.sale;
  const serviceOrder = whatsappModalData.serviceOrder;
  const technicianPayout = whatsappModalData.technicianPayout;
  const purchaseOrder = whatsappModalData.purchaseOrder;
  const hasPdf = !isSecondaryActive && Boolean(sale || serviceOrder || technicianPayout || purchaseOrder);

  const hasStoredValidPhone = hasValidWhatsAppPhone(activeStoredPhone);
  const activePhone = hasValidWhatsAppPhone(activeManualPhone)
    ? activeManualPhone.trim()
    : activeStoredPhone;
  const hasActiveValidPhone = hasValidWhatsAppPhone(activePhone);

  const rawDefaultUrl =
    isSecondaryActive && secondary ? secondary.url : whatsappModalData.url;

  const effectiveUrl =
    hasValidWhatsAppPhone(activeManualPhone) || !hasStoredValidPhone
      ? buildWhatsAppSendUrl(activePhone, activeMessage)
      : rawDefaultUrl || buildWhatsAppSendUrl(activePhone, activeMessage);

  const pdfDisplayName = sale
    ? `Factura_${sale.invoiceNumber}_MotoCristoc.pdf`
    : serviceOrder
    ? `Factura_Servicio_${serviceOrder.orderNumber}_MotoCristoc.pdf`
    : technicianPayout
    ? `Factura_Comision_${technicianPayout.payoutNumber}.pdf`
    : purchaseOrder
    ? `Orden_Compra_${purchaseOrder.orderNumber}_${purchaseOrder.supplierCode || 'Proveedor'}.pdf`
    : '';

  const handleCopy = () => {
    navigator.clipboard.writeText(activeMessage);
    setCopied(true);
    setTimeout(() => setCopied(false), 2500);
  };

  const triggerPdfDownloadSync = () => {
    setSentTargets((prev) => ({
      ...prev,
      [isSecondaryActive ? 'secondary' : 'primary']: true,
    }));

    if (!hasPdf) return;
    if (technicianPayout) {
      downloadTechnicianPayoutPDF(technicianPayout, settings);
      setDownloadedPdf(true);
      setTimeout(() => setDownloadedPdf(false), 4000);
      return;
    }

    setIsGeneratingPdf(true);
    const task = sale
      ? downloadInvoicePDF(sale, settings, products)
      : purchaseOrder
      ? downloadPurchaseOrderPDF(purchaseOrder, settings, products)
      : serviceOrder
      ? downloadServiceOrderPDF(serviceOrder, settings, products)
      : Promise.resolve();

    task
      .then(() => {
        setDownloadedPdf(true);
        setTimeout(() => setDownloadedPdf(false), 4000);
      })
      .catch((err) => console.warn('Error generando PDF:', err))
      .finally(() => setIsGeneratingPdf(false));
  };

  const handleDownloadPDF = async () => {
    if (!hasPdf || isGeneratingPdf) return;
    setIsGeneratingPdf(true);
    try {
      if (sale) {
        await downloadInvoicePDF(sale, settings, products);
      } else if (technicianPayout) {
        downloadTechnicianPayoutPDF(technicianPayout, settings);
      } else if (purchaseOrder) {
        await downloadPurchaseOrderPDF(purchaseOrder, settings, products);
      } else if (serviceOrder) {
        await downloadServiceOrderPDF(serviceOrder, settings, products);
      }
      setDownloadedPdf(true);
      setTimeout(() => setDownloadedPdf(false), 4000);
    } finally {
      setIsGeneratingPdf(false);
    }
  };

  const handleNativeShare = async () => {
    if (!hasPdf) {
      return;
    }

    setIsGeneratingPdf(true);
    try {
      let blob: Blob;
      let pdfFileName: string;
      let shareTitle: string;

      if (sale) {
        blob = await getInvoicePDFBlob(sale, settings, products);
        const isCredit = sale.paymentType === 'CREDITO';
        pdfFileName = isCredit
          ? `Nota_Credito_${sale.invoiceNumber}_MotoCristoc.pdf`
          : `Factura_${sale.invoiceNumber}_MotoCristoc.pdf`;
        shareTitle = `${isCredit ? 'Nota de Crédito' : 'Factura'} ${sale.invoiceNumber} - ${settings.commercialName}`;
      } else if (technicianPayout) {
        blob = getTechnicianPayoutPDFBlob(technicianPayout, settings);
        pdfFileName = `Factura_Comision_${technicianPayout.payoutNumber}.pdf`;
        shareTitle = `Comprobante Comisión ${technicianPayout.payoutNumber} - ${technicianPayout.technicianName}`;
      } else if (purchaseOrder) {
        blob = await getPurchaseOrderPDFBlob(purchaseOrder, settings, products);
        pdfFileName = `Orden_Compra_${purchaseOrder.orderNumber}_${purchaseOrder.supplierCode || 'Proveedor'}.pdf`;
        shareTitle = `Orden de Compra ${purchaseOrder.orderNumber} - ${purchaseOrder.supplierName}`;
      } else if (serviceOrder) {
        blob = await getServiceOrderPDFBlob(serviceOrder, settings, products);
        pdfFileName = `Factura_Servicio_${serviceOrder.orderNumber}_MotoCristoc.pdf`;
        shareTitle = `Factura de Servicio ${serviceOrder.orderNumber} - ${settings.commercialName}`;
      } else {
        return;
      }

      const file = new File([blob], pdfFileName, { type: 'application/pdf' });

      if (navigator.canShare && navigator.canShare({ files: [file] })) {
        await navigator.share({
          title: shareTitle,
          text: activeMessage,
          files: [file],
        });
        return;
      }
    } catch (err) {
      console.warn('Share API falló o fue cancelado por el usuario:', err);
    } finally {
      setIsGeneratingPdf(false);
    }

    await handleDownloadPDF();
  };

  const handleSwitchTarget = (next: 'primary' | 'secondary') => {
    setActiveTarget(next);
    setShowPhoneEditor(false);
    setCopied(false);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div
          className={`px-6 py-4 text-white flex items-center justify-between transition-colors ${
            activeIsTechnician || activeIsSupplier ? 'bg-slate-900' : 'bg-emerald-600'
          }`}
        >
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${
                activeIsTechnician || activeIsSupplier ? 'bg-amber-500/20 text-amber-400' : 'bg-white/15 text-white'
              }`}
            >
              {activeIsTechnician ? (
                <Wrench className="w-5 h-5" />
              ) : activeIsSupplier ? (
                <Truck className="w-5 h-5" />
              ) : (
                <MessageSquare className="w-5 h-5" />
              )}
            </div>
            <div className="min-w-0">
              <h3 className="font-semibold text-base sm:text-lg leading-tight truncate">{activeTitle}</h3>
              <p
                className={`text-xs flex items-center gap-1.5 mt-0.5 flex-wrap ${
                  activeIsTechnician || activeIsSupplier ? 'text-slate-300' : 'text-emerald-100'
                }`}
              >
                <Phone className="w-3.5 h-3.5 shrink-0" />
                <span className="font-semibold">{activeRecipientName}</span>
                <span>·</span>
                <span className="font-mono">
                  {hasActiveValidPhone ? activePhone : 'Sin teléfono registrado'}
                </span>
                <button
                  type="button"
                  onClick={() => setShowPhoneEditor((prev) => !prev)}
                  className="ml-1 underline hover:text-white text-[11px] cursor-pointer"
                >
                  {showPhoneEditor ? 'Ocultar' : 'Cambiar Nº'}
                </button>
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setWhatsappModalData(null)}
            className="p-1.5 rounded-lg text-white/75 hover:text-white hover:bg-white/10 transition-colors cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Dual Recipient Tabs (when both Cliente & Técnico notifications exist) */}
        {secondary && (
          <div className="px-4 py-2.5 bg-slate-100 border-b border-slate-200 space-y-1.5">
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSwitchTarget('primary')}
                className={`px-3 py-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  !isSecondaryActive
                    ? 'bg-white border-emerald-500 shadow-xs ring-1 ring-emerald-500/30'
                    : 'bg-slate-50 border-slate-200 hover:bg-white text-slate-600'
                }`}
              >
                <div className="min-w-0 flex items-center gap-2">
                  {whatsappModalData.isTechnician ? (
                    <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {whatsappModalData.primaryLabel || '1. Cliente'}
                    </span>
                    <span className="block text-xs font-bold text-slate-900 truncate">
                      {whatsappModalData.recipientName}
                    </span>
                  </div>
                </div>
                {sentTargets.primary && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
              </button>

              <button
                type="button"
                onClick={() => handleSwitchTarget('secondary')}
                className={`px-3 py-2 rounded-xl border text-left transition-all cursor-pointer flex items-center justify-between gap-2 ${
                  isSecondaryActive
                    ? 'bg-white border-amber-500 shadow-xs ring-1 ring-amber-500/30'
                    : 'bg-slate-50 border-slate-200 hover:bg-white text-slate-600'
                }`}
              >
                <div className="min-w-0 flex items-center gap-2">
                  {secondary.isTechnician ? (
                    <Wrench className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                  ) : (
                    <User className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <span className="block text-[10px] font-bold uppercase tracking-wider text-slate-400">
                      {secondary.label}
                    </span>
                    <span className="block text-xs font-bold text-slate-900 truncate">
                      {secondary.recipientName}
                    </span>
                  </div>
                </div>
                {sentTargets.secondary && (
                  <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                )}
              </button>
            </div>
            <p className="text-[10px] text-slate-500 text-center">
              Envía la notificación al destinatario activo y luego cambia de pestaña para enviar la otra.
            </p>
          </div>
        )}

        {/* Inline phone editor when missing or toggling edit */}
        {(!hasStoredValidPhone || showPhoneEditor) && (
          <div className="px-6 py-3 bg-emerald-50 border-b border-emerald-200 flex flex-col sm:flex-row sm:items-center gap-2">
            <label className="text-xs font-semibold text-emerald-950 shrink-0">
              Número WhatsApp destino:
            </label>
            <input
              type="tel"
              value={activeManualPhone}
              onChange={(e) => {
                const val = e.target.value;
                setManualPhones((prev) => ({
                  ...prev,
                  [isSecondaryActive ? 'secondary' : 'primary']: val,
                }));
              }}
              placeholder={hasStoredValidPhone ? activeStoredPhone : 'Ej: 0412-1234567 (opcional)'}
              className="flex-1 px-3 py-1.5 text-xs bg-white border border-emerald-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500 font-mono text-slate-900"
            />
            {!hasActiveValidPhone && (
              <span className="text-[11px] text-emerald-800">
                Si lo dejas vacío, podrás elegir el contacto directo en WhatsApp.
              </span>
            )}
          </div>
        )}

        {/* Content Preview & PDF Section */}
        <div className="p-6 overflow-y-auto flex-1 bg-slate-50 space-y-4">
          {/* PDF Invoice Banner if it is a sale or completed service order */}
          {hasPdf && (
            <div className="bg-gradient-to-r from-amber-50 to-emerald-50 border border-emerald-200/80 rounded-xl p-4 shadow-2xs">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-start gap-2.5">
                  <div className="w-9 h-9 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0 mt-0.5 shadow-xs">
                    <FileDown className="w-5 h-5" />
                  </div>
                  <div>
                    <h4 className="font-bold text-slate-900 text-xs">
                      {serviceOrder
                        ? 'Factura de Taller en PDF (con Detalle y QR de Pago)'
                        : technicianPayout
                        ? 'Factura / Comprobante de Pago de Comisión en PDF'
                        : purchaseOrder
                        ? 'Orden de Compra / Estado de Deuda y Abonos en PDF'
                        : 'Factura Oficial en Formato PDF'}
                    </h4>
                    <p className="text-[11px] text-slate-600 mt-0.5">
                      Archivo: <span className="font-mono font-semibold text-slate-800">{pdfDisplayName}</span>
                    </p>
                    <p className="text-[10px] text-emerald-700 font-medium mt-1 flex items-center gap-1">
                      <Paperclip className="w-3 h-3" />
                      <span>
                        {serviceOrder
                          ? 'Al presionar "Descargar PDF y Enviar a WhatsApp" se descargará el PDF con el trabajo, datos y QR Pago Móvil.'
                          : technicianPayout
                          ? 'Al presionar "Descargar PDF y Enviar a WhatsApp" se enviará la notificación al técnico y se descargará el comprobante PDF.'
                          : purchaseOrder
                          ? 'Al presionar "Descargar PDF y Enviar a WhatsApp" se descargará el PDF para enviárselo al vendedor por WhatsApp.'
                          : 'Al presionar "Descargar PDF y Enviar a WhatsApp" se abrirá WhatsApp y se descargará el PDF en ese momento.'}
                      </span>
                    </p>
                  </div>
                </div>

                <button
                  type="button"
                  onClick={handleDownloadPDF}
                  disabled={isGeneratingPdf}
                  className="px-3 py-1.5 rounded-lg bg-white border border-emerald-300 hover:bg-emerald-50 text-emerald-800 text-xs font-bold transition-all shadow-2xs shrink-0 flex items-center gap-1.5 cursor-pointer disabled:opacity-60"
                >
                  {downloadedPdf ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" /> : <FileDown className="w-3.5 h-3.5" />}
                  <span>
                    {isGeneratingPdf ? 'Generando...' : downloadedPdf ? '¡Descargado!' : 'Descargar PDF'}
                  </span>
                </button>
              </div>
            </div>
          )}

          {/* Pago Móvil QR & Data Card (only for customer-facing charges, not technician/supplier messages) */}
          {!technicianPayout && !activeIsTechnician && !activeIsSupplier && !purchaseOrder && (
            <div className="bg-white border border-slate-200 rounded-xl p-3.5 shadow-2xs flex items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <img
                  src={settings.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg'}
                  alt="QR Pago Móvil"
                  className="w-16 h-16 object-contain rounded-lg border border-slate-200 shadow-2xs shrink-0"
                />
                <div className="text-xs">
                  <span className="inline-block px-1.5 py-0.5 rounded bg-emerald-100 text-emerald-800 text-[10px] font-bold">
                    Pago Móvil Oficial
                  </span>
                  <p className="font-bold text-slate-900 mt-0.5">Banco: {settings.bankDetails.pagoMovilBank || '0134 - Banesco'}</p>
                  <p className="text-slate-600 font-mono text-[11px]">Celular: {settings.bankDetails.pagoMovilPhone || '0412-2242450'}</p>
                  <p className="text-slate-600 font-mono text-[11px]">C.I.: {settings.bankDetails.pagoMovilId || 'V-19996141'}</p>
                </div>
              </div>
              <a
                href={settings.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg'}
                target="_blank"
                rel="noopener noreferrer"
                className="text-[11px] font-semibold text-emerald-700 hover:text-emerald-800 bg-emerald-50 hover:bg-emerald-100 px-2.5 py-1.5 rounded-lg border border-emerald-200 transition-colors shrink-0 text-center"
              >
                Ver QR
              </a>
            </div>
          )}

          {/* WhatsApp Text Preview */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
                {activeIsTechnician
                  ? 'Mensaje para el Técnico'
                  : activeIsSupplier
                  ? 'Mensaje para el Vendedor / Proveedor'
                  : 'Mensaje de Notificación WhatsApp'}
              </span>
              <button
                type="button"
                onClick={handleCopy}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900 bg-white px-2.5 py-1 rounded-md border border-slate-200 shadow-2xs hover:bg-slate-50 transition-colors cursor-pointer"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '¡Copiado!' : 'Copiar texto'}</span>
              </button>
            </div>

            <div className="bg-[#e7fedb] border border-[#c1e9a7] rounded-xl p-4 text-slate-800 text-xs sm:text-sm font-mono whitespace-pre-wrap leading-relaxed shadow-xs max-h-56 overflow-y-auto">
              {activeMessage}
            </div>
          </div>

          {hasPdf && (
            <div className="text-[11px] text-slate-500 bg-white rounded-lg p-3 border border-slate-200 leading-normal flex items-start gap-2">
              <span className="text-emerald-600 font-bold">Tip:</span>
              <span>
                En WhatsApp Web o móvil, haz clic en el icono de <strong>Clip (📎) &gt; Documento</strong> y selecciona la factura en PDF recién descargada para enviársela.
              </span>
            </div>
          )}
        </div>

        {/* Actions */}
        <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <button
            type="button"
            onClick={() => setWhatsappModalData(null)}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
          >
            Cerrar
          </button>

          <div className="flex items-center gap-2 flex-wrap">
            {secondary && !isSecondaryActive && !sentTargets.secondary && (
              <button
                type="button"
                onClick={() => handleSwitchTarget('secondary')}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 border border-amber-200 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
              >
                <Wrench className="w-3.5 h-3.5 text-amber-600" />
                <span>Ir a {secondary.label}</span>
              </button>
            )}
            {secondary && isSecondaryActive && !sentTargets.primary && (
              <button
                type="button"
                onClick={() => handleSwitchTarget('primary')}
                className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
              >
                <User className="w-3.5 h-3.5 text-slate-600" />
                <span>Ir a {whatsappModalData.primaryLabel || 'Cliente'}</span>
              </button>
            )}

            {hasPdf && typeof navigator !== 'undefined' && 'share' in navigator && (
              <button
                type="button"
                onClick={handleNativeShare}
                disabled={isGeneratingPdf}
                className="inline-flex items-center gap-1.5 px-3.5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-60"
                title="Compartir directamente el PDF y mensaje"
              >
                <Share2 className="w-3.5 h-3.5 text-amber-400" />
                <span>{isGeneratingPdf ? 'Generando...' : 'Compartir PDF'}</span>
              </button>
            )}

            <a
              href={effectiveUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={triggerPdfDownloadSync}
              className={`inline-flex items-center gap-2 px-5 py-2.5 font-semibold text-xs rounded-lg shadow-sm transition-colors cursor-pointer ${
                activeIsTechnician
                  ? 'bg-amber-500 hover:bg-amber-600 text-slate-950'
                  : 'bg-emerald-600 hover:bg-emerald-700 text-white'
              }`}
            >
              <MessageSquare className="w-4 h-4" />
              <span>
                {hasPdf
                  ? 'Descargar PDF y Enviar a WhatsApp'
                  : activeIsTechnician
                  ? 'Notificar Técnico por WhatsApp'
                  : 'Abrir en WhatsApp'}
              </span>
              <ExternalLink className="w-3.5 h-3.5 opacity-80" />
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};
