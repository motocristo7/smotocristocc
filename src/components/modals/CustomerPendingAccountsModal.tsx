import React, { useState, useMemo, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { Sale, Customer } from '../../types';
import { formatUSD, formatBs, buildWhatsAppSendUrl } from '../../utils/whatsapp';
import { downloadInvoicePDF } from '../../utils/pdfInvoice';
import {
  X,
  Search,
  CreditCard,
  FileText,
  FileDown,
  Eye,
  MessageSquare,
  CheckCircle2,
  AlertTriangle,
  Clock,
  Copy,
  Check,
  Building2,
  UserCheck,
  UserPlus,
  ChevronDown,
  ChevronUp,
} from 'lucide-react';

interface CustomerPendingAccountsModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function normalizeDocDigits(doc?: string): string {
  const digits = (doc || '').replace(/\D/g, '');
  return digits.length >= 5 && !/^0+$/.test(digits) ? digits : '';
}

function normalizeDocAlnum(doc?: string): string {
  return (doc || '').trim().toLowerCase().replace(/[^a-z0-9]/g, '');
}

function normalizePhoneDigits(phone?: string): string {
  const digits = (phone || '').replace(/\D/g, '');
  if (digits.length < 7 || /^0+$/.test(digits)) return '';
  if (digits.length === 12 && digits.startsWith('58')) return digits.slice(2);
  if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
  return digits;
}

export const CustomerPendingAccountsModal: React.FC<CustomerPendingAccountsModalProps> = ({
  isOpen,
  onClose,
}) => {
  const {
    customers,
    sales,
    settings,
    currentUser,
    setSelectedInvoice,
    openAuthModal,
  } = useApp();

  const [documentInput, setDocumentInput] = useState('');
  const [submittedDocument, setSubmittedDocument] = useState('');
  const [showPaymentDetails, setShowPaymentDetails] = useState(false);
  const [copiedField, setCopiedField] = useState<string | null>(null);
  const [expandedPaymentsId, setExpandedPaymentsId] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen && currentUser?.documentId && currentUser.role === 'CLIENTE') {
      setDocumentInput(currentUser.documentId);
      setSubmittedDocument(currentUser.documentId);
    }
  }, [isOpen, currentUser]);

  const queryDigits = normalizeDocDigits(submittedDocument);
  const queryAlnum = normalizeDocAlnum(submittedDocument);

  const matchedCustomer: Customer | null = useMemo(() => {
    if (!submittedDocument.trim() || (!queryDigits && !queryAlnum)) return null;

    const foundInDirectory = customers.find((c) => {
      const cDigits = normalizeDocDigits(c.documentId);
      const cAlnum = normalizeDocAlnum(c.documentId);
      if (queryDigits && cDigits && cDigits === queryDigits) return true;
      if (queryAlnum && cAlnum && cAlnum === queryAlnum) return true;
      return false;
    });

    if (foundInDirectory) return foundInDirectory;

    if (currentUser?.documentId) {
      const uDigits = normalizeDocDigits(currentUser.documentId);
      const uAlnum = normalizeDocAlnum(currentUser.documentId);
      if ((queryDigits && uDigits === queryDigits) || (queryAlnum && uAlnum === queryAlnum)) {
        return {
          id: currentUser.id,
          name: currentUser.name,
          phone: currentUser.phone || '',
          documentId: currentUser.documentId,
          email: currentUser.email,
          createdAt: currentUser.createdAt,
        };
      }
    }

    return null;
  }, [customers, currentUser, submittedDocument, queryDigits, queryAlnum]);

  const pendingSales: Sale[] = useMemo(() => {
    if (!submittedDocument.trim() || (!queryDigits && !queryAlnum)) return [];

    const customerPhoneKey = normalizePhoneDigits(matchedCustomer?.phone);

    return sales
      .filter((sale) => {
        if (sale.paymentType !== 'CREDITO' && sale.paymentType !== 'APARTADO') return false;
        if (sale.isVoided || sale.creditStatus === 'PAGADO' || sale.creditStatus === 'ANULADO') {
          return false;
        }
        const pendingUSD = Math.max(0, sale.total - (sale.creditPaidAmount || 0));
        if (pendingUSD <= 0.01) return false;

        if (matchedCustomer && sale.customerId && sale.customerId === matchedCustomer.id) {
          return true;
        }

        const saleDocDigits = normalizeDocDigits(sale.customerDocument);
        const saleDocAlnum = normalizeDocAlnum(sale.customerDocument);
        if (queryDigits && saleDocDigits && saleDocDigits === queryDigits) {
          return true;
        }
        if (queryAlnum && saleDocAlnum && saleDocAlnum === queryAlnum) {
          return true;
        }

        if (customerPhoneKey) {
          const salePhoneKey = normalizePhoneDigits(sale.customerPhone);
          if (salePhoneKey && salePhoneKey === customerPhoneKey) return true;
        }

        return false;
      })
      .sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  }, [sales, matchedCustomer, submittedDocument, queryDigits, queryAlnum]);

  const isRegisteredOrHasInvoices = Boolean(matchedCustomer || pendingSales.length > 0);

  const displayCustomerName =
    matchedCustomer?.name ||
    pendingSales[0]?.customerName ||
    '';

  const displayCustomerPhone =
    matchedCustomer?.phone ||
    pendingSales[0]?.customerPhone ||
    '';

  const displayCustomerDocument =
    matchedCustomer?.documentId ||
    pendingSales[0]?.customerDocument ||
    submittedDocument.trim().toUpperCase();

  const totalPendingUSD = useMemo(
    () =>
      pendingSales.reduce(
        (sum, s) => sum + Math.max(0, s.total - (s.creditPaidAmount || 0)),
        0
      ),
    [pendingSales]
  );

  const totalPendingBs = totalPendingUSD * settings.bcvRate;

  if (!isOpen) return null;

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    setSubmittedDocument(documentInput.trim());
  };

  const handleCopy = (value: string, label: string) => {
    navigator.clipboard.writeText(value);
    setCopiedField(label);
    setTimeout(() => setCopiedField(null), 2000);
  };

  const getDueStatus = (dueDateStr?: string) => {
    if (!dueDateStr) {
      return { label: 'Sin fecha límite', tone: 'text-slate-600' };
    }
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(dueDateStr);
    due.setHours(0, 0, 0, 0);
    const diffDays = Math.ceil((due.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      return { label: `Vencida hace ${Math.abs(diffDays)} día(s)`, tone: 'text-rose-700 font-semibold' };
    }
    if (diffDays === 0) {
      return { label: 'Vence hoy', tone: 'text-amber-700 font-semibold' };
    }
    return { label: `Vence en ${diffDays} día(s)`, tone: 'text-emerald-700 font-medium' };
  };

  const buildReportPaymentUrl = (sale: Sale, pendingUSD: number) => {
    const pendingBs = pendingUSD * settings.bcvRate;
    const modalidad = sale.paymentType === 'APARTADO' ? 'Sistema de Apartado' : 'Crédito';
    const message = [
      `Hola *${settings.commercialName}*, soy *${displayCustomerName || 'Cliente'}* (Cédula: ${displayCustomerDocument}).`,
      `Deseo reportar un abono/pago para mi cuenta pendiente (${modalidad}):`,
      `▪ Factura: *${sale.invoiceNumber}*`,
      `▪ Saldo pendiente: *${formatUSD(pendingUSD)}* (${formatBs(pendingBs)} a tasa BCV ${settings.bcvRate.toFixed(2)})`,
      `Por favor confirmar recepción del comprobante.`,
    ].join('\n');
    return buildWhatsAppSendUrl(settings.whatsapp, message);
  };

  return (
    <div className="fixed inset-0 z-[45] overflow-y-auto bg-slate-950/75 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white w-full max-w-3xl rounded-2xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[92vh] animate-in fade-in zoom-in-95 duration-150">
        {/* Header */}
        <div className="bg-slate-950 text-white px-6 py-5 flex items-start justify-between gap-4 border-b border-slate-800 shrink-0">
          <div>
            <div className="flex items-center gap-2 text-xs text-amber-400 font-semibold">
              <span>Clientes Registrados</span>
              <span aria-hidden="true">·</span>
              <span>Consulta por Cédula</span>
            </div>
            <h2 className="text-xl font-bold font-display text-white mt-0.5 flex items-center gap-2">
              <CreditCard className="w-5 h-5 text-amber-400 shrink-0" />
              <span>Cuentas Pendientes por Pagar</span>
            </h2>
            <p className="text-xs text-slate-300 mt-1">
              Ingresa tu cédula o RIF registrado para revisar tus facturas a crédito, sistema de apartado y saldos en USD y Bolívares (tasa BCV).
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar consulta de cuentas pendientes"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-6 overflow-y-auto flex-1 space-y-6">
          {/* Cédula Search Form */}
          <form onSubmit={handleSearch} className="flex flex-col sm:flex-row gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={documentInput}
                onChange={(e) => setDocumentInput(e.target.value)}
                placeholder="Ej: V-19996141 o 19996141"
                className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:outline-hidden focus:ring-2 focus:ring-amber-500 font-mono text-slate-900"
                autoFocus
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
            >
              <Search className="w-4 h-4 text-amber-400" />
              <span>Consultar Cuentas</span>
            </button>
          </form>

          {/* States */}
          {!submittedDocument.trim() ? (
            <div className="py-10 text-center space-y-3 border-t border-slate-100">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                <FileText className="w-6 h-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-900">
                Consulta rápida con tu Cédula de Identidad
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                Escribe tu número de cédula (con o sin letra V-/E-) para verificar al instante el monto pendiente, fecha de vencimiento y los abonos registrados en tu cuenta.
              </p>
            </div>
          ) : !isRegisteredOrHasInvoices ? (
            <div className="py-8 px-4 text-center space-y-4 border-t border-slate-100">
              <div className="w-12 h-12 rounded-xl bg-amber-50 text-amber-600 border border-amber-200 flex items-center justify-center mx-auto">
                <AlertTriangle className="w-6 h-6" />
              </div>
              <div className="space-y-1">
                <h3 className="text-sm font-bold text-slate-900">
                  No encontramos un cliente registrado con la cédula &ldquo;{submittedDocument}&rdquo;
                </h3>
                <p className="text-xs text-slate-500 max-w-md mx-auto leading-relaxed">
                  Verifica que los números de tu cédula sean correctos o crea tu cuenta de cliente para quedar registrado en el sistema.
                </p>
              </div>
              <div className="flex flex-wrap items-center justify-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    onClose();
                    openAuthModal('register');
                  }}
                  className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors inline-flex items-center gap-1.5 cursor-pointer whitespace-nowrap shrink-0"
                >
                  <UserPlus className="w-4 h-4" />
                  <span>Registrarme como Cliente</span>
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Customer Header Summary */}
              <div className="bg-slate-50 rounded-xl border border-slate-200 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="space-y-1 min-w-0">
                  <div className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700">
                    <UserCheck className="w-4 h-4 shrink-0" />
                    <span>Cliente Registrado</span>
                  </div>
                  <h3 className="text-base font-bold text-slate-900 truncate">
                    {displayCustomerName}
                  </h3>
                  <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 font-mono">
                    <span>Cédula: {displayCustomerDocument}</span>
                    {displayCustomerPhone && (
                      <>
                        <span aria-hidden="true">·</span>
                        <span>Tel: {displayCustomerPhone}</span>
                      </>
                    )}
                  </div>
                </div>

                <div className="text-left sm:text-right border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-200 shrink-0">
                  <span className="text-xs text-slate-500 block">
                    Total Pendiente ({pendingSales.length}{' '}
                    {pendingSales.length === 1 ? 'cuenta' : 'cuentas'})
                  </span>
                  <span className="text-xl font-extrabold font-mono tabular-nums text-slate-950 block">
                    {formatUSD(totalPendingUSD)}
                  </span>
                  <span className="text-xs font-bold font-mono tabular-nums text-emerald-700 block">
                    {formatBs(totalPendingBs)}
                  </span>
                </div>
              </div>

              {pendingSales.length === 0 ? (
                <div className="py-8 px-4 text-center space-y-2 bg-emerald-50/70 rounded-xl border border-emerald-200">
                  <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto" />
                  <h4 className="text-sm font-bold text-emerald-950">
                    ¡Estás al día! No tienes cuentas pendientes por pagar
                  </h4>
                  <p className="text-xs text-emerald-800 max-w-md mx-auto">
                    Todas tus facturas y apartados registrados con esta cédula se encuentran cancelados.
                  </p>
                </div>
              ) : (
                <>
                  {/* Bank Details Toggle */}
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <button
                      type="button"
                      onClick={() => setShowPaymentDetails(!showPaymentDetails)}
                      className="w-full px-4 py-3 bg-white hover:bg-slate-50 flex items-center justify-between gap-3 text-left transition-colors cursor-pointer"
                    >
                      <div className="flex items-center gap-2 text-xs font-bold text-slate-900">
                        <Building2 className="w-4 h-4 text-amber-600 shrink-0" />
                        <span>Ver datos bancarios y Pago Móvil para realizar abonos</span>
                      </div>
                      {showPaymentDetails ? (
                        <ChevronUp className="w-4 h-4 text-slate-500 shrink-0" />
                      ) : (
                        <ChevronDown className="w-4 h-4 text-slate-500 shrink-0" />
                      )}
                    </button>

                    {showPaymentDetails && (
                      <div className="px-4 pb-4 pt-3 bg-slate-50 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1.5">
                          <p className="font-bold text-slate-900">Pago Móvil (Bs.)</p>
                          <p className="text-slate-600">Banco: {settings.bankDetails.pagoMovilBank}</p>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-slate-800">
                              Tel: {settings.bankDetails.pagoMovilPhone}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(settings.bankDetails.pagoMovilPhone, 'pm-phone')}
                              className="text-amber-700 hover:text-amber-900 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              {copiedField === 'pm-phone' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedField === 'pm-phone' ? 'Copiado' : 'Copiar'}</span>
                            </button>
                          </div>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-slate-800">
                              CI/RIF: {settings.bankDetails.pagoMovilId}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(settings.bankDetails.pagoMovilId, 'pm-id')}
                              className="text-amber-700 hover:text-amber-900 font-semibold inline-flex items-center gap-1 cursor-pointer"
                            >
                              {copiedField === 'pm-id' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedField === 'pm-id' ? 'Copiado' : 'Copiar'}</span>
                            </button>
                          </div>
                        </div>

                        <div className="space-y-1.5">
                          <p className="font-bold text-slate-900">Transferencia / Divisas</p>
                          <p className="text-slate-600">{settings.bankDetails.bankTransferName}</p>
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-mono text-slate-800 truncate">
                              {settings.bankDetails.bankTransferAccount}
                            </span>
                            <button
                              type="button"
                              onClick={() => handleCopy(settings.bankDetails.bankTransferAccount, 'bank-acc')}
                              className="text-amber-700 hover:text-amber-900 font-semibold inline-flex items-center gap-1 cursor-pointer shrink-0"
                            >
                              {copiedField === 'bank-acc' ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                              <span>{copiedField === 'bank-acc' ? 'Copiado' : 'Copiar'}</span>
                            </button>
                          </div>
                          {settings.bankDetails.binancePayId && (
                            <p className="font-mono text-slate-700">
                              Binance Pay: {settings.bankDetails.binancePayId}
                            </p>
                          )}
                        </div>
                      </div>
                    )}
                  </div>

                  {/* Pending Invoices List */}
                  <div className="space-y-3">
                    {pendingSales.map((sale) => {
                      const paidUSD = sale.creditPaidAmount || 0;
                      const pendingUSD = Math.max(0, sale.total - paidUSD);
                      const pendingBs = pendingUSD * settings.bcvRate;
                      const dueInfo = getDueStatus(sale.creditDueDate);
                      const modality = sale.paymentType === 'APARTADO' ? 'Sistema de Apartado' : 'Crédito';
                      const payments = sale.creditPayments || [];
                      const isExpanded = expandedPaymentsId === sale.id;

                      return (
                        <div
                          key={sale.id}
                          className="bg-white rounded-xl border border-slate-200 p-4 space-y-3"
                        >
                          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-3">
                            <div className="space-y-1">
                              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                                <span className="font-mono font-bold text-slate-950">
                                  {sale.invoiceNumber}
                                </span>
                                <span aria-hidden="true">·</span>
                                <span className="font-semibold text-amber-800">{modality}</span>
                                <span aria-hidden="true">·</span>
                                <span>
                                  {new Date(sale.createdAt).toLocaleDateString('es-VE', {
                                    dateStyle: 'medium',
                                  })}
                                </span>
                              </div>
                              <div className="flex items-center gap-1.5 text-xs">
                                <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                                <span className={dueInfo.tone}>{dueInfo.label}</span>
                                {sale.creditDueDate && (
                                  <span className="text-slate-500 font-mono">
                                    ({sale.creditDueDate})
                                  </span>
                                )}
                              </div>
                            </div>

                            <div className="text-left sm:text-right shrink-0">
                              <span className="text-xs text-slate-500 block">Saldo Pendiente</span>
                              <span className="text-lg font-extrabold font-mono tabular-nums text-rose-700 block">
                                {formatUSD(pendingUSD)}
                              </span>
                              <span className="text-xs font-semibold font-mono tabular-nums text-emerald-700 block">
                                {formatBs(pendingBs)}
                              </span>
                            </div>
                          </div>

                          {/* Items & Totals Breakdown */}
                          <div className="pt-3 border-t border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 text-xs">
                            <div className="space-y-1 text-slate-700">
                              {sale.items.map((item, idx) => (
                                <p key={idx}>
                                  <span className="font-mono font-bold">{item.quantity}x</span>{' '}
                                  {item.name}
                                </p>
                              ))}
                            </div>
                            <div className="flex items-center gap-4 text-xs text-slate-600 font-mono tabular-nums shrink-0">
                              <span>Total: {formatUSD(sale.total)}</span>
                              <span aria-hidden="true">·</span>
                              <span className="text-emerald-700">Abonado: {formatUSD(paidUSD)}</span>
                            </div>
                          </div>

                          {/* Payments History if any */}
                          {payments.length > 0 && (
                            <div className="pt-2 border-t border-slate-100">
                              <button
                                type="button"
                                onClick={() => setExpandedPaymentsId(isExpanded ? null : sale.id)}
                                className="text-xs font-semibold text-slate-600 hover:text-slate-900 inline-flex items-center gap-1 cursor-pointer"
                              >
                                <span>Ver {payments.length} abono(s) registrado(s)</span>
                                {isExpanded ? (
                                  <ChevronUp className="w-3.5 h-3.5" />
                                ) : (
                                  <ChevronDown className="w-3.5 h-3.5" />
                                )}
                              </button>
                              {isExpanded && (
                                <div className="mt-2 space-y-1.5 text-xs text-slate-600 pl-2 border-l border-slate-200">
                                  {payments.map((p) => (
                                    <div
                                      key={p.id}
                                      className="flex flex-wrap items-center justify-between gap-2"
                                    >
                                      <span>
                                        {new Date(p.date).toLocaleDateString('es-VE')} ·{' '}
                                        {p.paymentMethod}
                                        {p.reference ? ` (Ref: ${p.reference})` : ''}
                                      </span>
                                      <span className="font-mono tabular-nums font-semibold text-emerald-700">
                                        {formatUSD(p.amountUSD)}
                                      </span>
                                    </div>
                                  ))}
                                </div>
                              )}
                            </div>
                          )}

                          {/* Actions */}
                          <div className="pt-3 border-t border-slate-100 flex flex-wrap items-center justify-end gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedInvoice(sale)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Ver Factura</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadInvoicePDF(sale, settings)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors cursor-pointer whitespace-nowrap shrink-0"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                              <span>Descargar PDF</span>
                            </button>
                            <a
                              href={buildReportPaymentUrl(sale, pendingUSD)}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors whitespace-nowrap shrink-0"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Reportar Pago por WhatsApp</span>
                            </a>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
