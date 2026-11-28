import React, { useState, useMemo, useEffect } from 'react';
import {
  OpenAccount,
  PaymentMethod,
  PagoMovilAccountOption,
  SalePaymentType,
  SalePaymentSplit,
  SaleSplitCondition,
  PaymentCurrencyMode,
  BusinessSettings,
  Sale,
} from '../../types';
import {
  formatUSD,
  formatBs,
  buildOpenAccountWhatsAppMessage,
  hasValidWhatsAppPhone,
} from '../../utils/whatsapp';
import {
  ClipboardList,
  Plus,
  Minus,
  Trash2,
  X,
  CheckCircle2,
  Clock,
  Wrench,
  Bike,
  User,
  Phone,
  CreditCard,
  MessageSquare,
  Building2,
  Layers,
  Banknote,
  AlertCircle,
  Edit3,
  Save,
  ChevronDown,
  ChevronUp,
  Receipt,
  ArrowLeftRight,
  Eye,
} from 'lucide-react';

const isBsMethod = (method: PaymentMethod): boolean =>
  method === 'Pago Móvil' ||
  method === 'Efectivo Bs' ||
  method === 'Punto de Venta (Bs)' ||
  method === 'Transferencia Bancaria Bs';

interface MixtoSplitDraft {
  id: string;
  splitType: SaleSplitCondition;
  currencyMode: 'BS' | 'USD';
  paymentMethod: PaymentMethod;
  pagoMovilAccount: PagoMovilAccountOption;
  amountUSD: string;
  amountBs: string;
  reference: string;
}

const createInitialMixtoSplits = (): MixtoSplitDraft[] => [
  {
    id: `oa-mix-1-${Date.now()}`,
    splitType: 'CONTADO',
    currencyMode: 'BS',
    paymentMethod: 'Pago Móvil',
    pagoMovilAccount: 'BANESCO_PERSONAL',
    amountUSD: '',
    amountBs: '',
    reference: '',
  },
  {
    id: `oa-mix-2-${Date.now()}`,
    splitType: 'CONTADO',
    currencyMode: 'USD',
    paymentMethod: 'Dólares Efectivo (USD)',
    pagoMovilAccount: 'BANESCO_PERSONAL',
    amountUSD: '',
    amountBs: '',
    reference: '',
  },
];

// ============================================================================
// 1. PANEL: Cuentas Abiertas del Día (rendered prominently inside PosView)
// ============================================================================
interface OpenAccountsPanelProps {
  openAccounts: OpenAccount[];
  rate: number;
  activeTargetAccountId: string | null;
  onStartAddItems: (account: OpenAccount) => void;
  onStartNewAccount: () => void;
  onInspectAccount: (account: OpenAccount) => void;
  onSettleAccount: (account: OpenAccount) => void;
  onSendWhatsAppStatement: (account: OpenAccount) => void;
}

export const OpenAccountsPanel: React.FC<OpenAccountsPanelProps> = ({
  openAccounts,
  rate,
  activeTargetAccountId,
  onStartAddItems,
  onStartNewAccount,
  onInspectAccount,
  onSettleAccount,
  onSendWhatsAppStatement,
}) => {
  const activeAccounts = useMemo(
    () => openAccounts.filter((a) => a.status === 'ABIERTA'),
    [openAccounts]
  );

  const todayClosedAccounts = useMemo(() => {
    const todayStr = new Date().toISOString().split('T')[0];
    return openAccounts.filter(
      (a) => a.status === 'CERRADA' && (a.settledAt || a.updatedAt || '').startsWith(todayStr)
    );
  }, [openAccounts]);

  const [isExpanded, setIsExpanded] = useState<boolean>(activeAccounts.length > 0);
  const [showClosedToday, setShowClosedToday] = useState<boolean>(false);

  useEffect(() => {
    if (activeAccounts.length > 0) {
      setIsExpanded(true);
    }
  }, [activeAccounts.length]);

  const totalOpenUSD = useMemo(
    () =>
      Math.round(activeAccounts.reduce((sum, a) => sum + (Number(a.subtotal) || 0), 0) * 100) / 100,
    [activeAccounts]
  );
  const totalOpenBs = Math.round(totalOpenUSD * rate * 100) / 100;

  return (
    <section
      aria-label="Cuentas abiertas del día para talleres vecinos"
      className={`rounded-2xl border shadow-xs overflow-hidden transition-colors ${
        activeAccounts.length > 0
          ? 'bg-gradient-to-br from-violet-50/90 via-white to-fuchsia-50/40 border-violet-300'
          : 'bg-white border-slate-200'
      }`}
    >
      {/* Header Bar */}
      <div className="px-4 py-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          onClick={() => setIsExpanded((prev) => !prev)}
          className="flex items-center gap-3 text-left cursor-pointer min-w-0 flex-1"
        >
          <div
            className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 shadow-xs ${
              activeAccounts.length > 0
                ? 'bg-violet-600 text-white'
                : 'bg-violet-100 text-violet-700'
            }`}
          >
            <ClipboardList className="w-5 h-5" />
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h2 className="text-sm sm:text-base font-extrabold text-slate-900">
                Cuentas Abiertas del Día (Talleres Vecinos)
              </h2>
              <span
                className={`px-2 py-0.5 rounded-md text-xs font-extrabold font-mono ${
                  activeAccounts.length > 0
                    ? 'bg-violet-600 text-white'
                    : 'bg-slate-100 text-slate-600'
                }`}
              >
                {activeAccounts.length} {activeAccounts.length === 1 ? 'abierta' : 'abiertas'}
              </span>
              {todayClosedAccounts.length > 0 && (
                <span className="px-2 py-0.5 rounded-md text-[11px] font-bold bg-emerald-100 text-emerald-800">
                  {todayClosedAccounts.length} cobrada{todayClosedAccounts.length === 1 ? '' : 's'} hoy
                </span>
              )}
            </div>
            <p className="text-xs text-slate-600 leading-snug">
              {activeAccounts.length > 0
                ? 'Ve sumando los repuestos que retiren durante el día y cobra el total acumulado al finalizar.'
                : 'Abre una cuenta diaria para clientes reparando su moto en talleres vecinos y cobra al final del día.'}
            </p>
          </div>
        </button>

        <div className="flex items-center gap-2.5 flex-wrap shrink-0">
          {activeAccounts.length > 0 && (
            <div className="px-3 py-1.5 rounded-xl bg-slate-950 text-white text-right tabular-nums">
              <span className="text-[10px] font-bold text-violet-300 uppercase block leading-none">
                Total Abierto Hoy
              </span>
              <div className="flex items-baseline gap-2 mt-0.5">
                <span className="text-sm sm:text-base font-extrabold font-mono text-amber-400">
                  {formatUSD(totalOpenUSD)}
                </span>
                <span className="text-xs font-bold font-mono text-emerald-400">
                  {formatBs(totalOpenBs)}
                </span>
              </div>
            </div>
          )}

          <button
            type="button"
            onClick={onStartNewAccount}
            className="px-3.5 py-2 bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold rounded-xl shadow-xs flex items-center gap-1.5 cursor-pointer transition-colors"
          >
            <Plus className="w-4 h-4" />
            <span>Abrir Nueva Cuenta</span>
          </button>

          <button
            type="button"
            onClick={() => setIsExpanded((prev) => !prev)}
            className="p-2 rounded-xl border border-slate-200 bg-white hover:bg-slate-50 text-slate-600 cursor-pointer"
            title={isExpanded ? 'Contraer lista' : 'Ver cuentas abiertas'}
          >
            {isExpanded ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
          </button>
        </div>
      </div>

      {/* Body */}
      {isExpanded && (
        <div className="px-4 pb-4 pt-1 border-t border-violet-200/70 space-y-3">
          {activeAccounts.length === 0 ? (
            <div className="py-5 text-center bg-slate-50/80 rounded-xl border border-dashed border-slate-200 space-y-2">
              <p className="text-xs font-semibold text-slate-600">
                No hay cuentas abiertas en este momento.
              </p>
              <p className="text-[11px] text-slate-500 max-w-lg mx-auto">
                Usa el botón <strong>"Abrir Nueva Cuenta"</strong> o selecciona la modalidad{' '}
                <strong>"Abrir Cuenta"</strong> en Condición de la Venta para registrar los datos del cliente y sumar lo que vaya retirando durante el día.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-3 pt-2">
              {activeAccounts.map((acc) => {
                const isTarget = activeTargetAccountId === acc.id;
                const totalUnits = acc.items.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
                const openedTime = new Date(acc.openedAt).toLocaleTimeString('es-VE', {
                  hour: '2-digit',
                  minute: '2-digit',
                });
                const accTotalBs = Math.round((acc.subtotal || 0) * rate * 100) / 100;

                return (
                  <div
                    key={acc.id}
                    className={`rounded-xl border-2 p-3.5 flex flex-col justify-between gap-3 transition-all shadow-2xs ${
                      isTarget
                        ? 'bg-violet-50 border-violet-600 ring-2 ring-violet-400/40'
                        : 'bg-white border-violet-200/90 hover:border-violet-400'
                    }`}
                  >
                    <div className="space-y-2">
                      {/* Top row: Account number + opened time + target badge */}
                      <div className="flex items-center justify-between gap-2">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="px-2 py-0.5 rounded-md bg-violet-100 text-violet-900 font-mono text-[11px] font-extrabold">
                            {acc.accountNumber}
                          </span>
                          <span className="text-[11px] text-slate-500 font-semibold flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Abierta {openedTime}
                          </span>
                        </div>
                        {isTarget && (
                          <span className="px-2 py-0.5 rounded-md bg-violet-600 text-white text-[10px] font-extrabold uppercase tracking-wide">
                            Sumando aquí
                          </span>
                        )}
                      </div>

                      {/* Full Customer Name & Personal Data */}
                      <div>
                        <h3 className="text-sm sm:text-base font-extrabold text-slate-900 leading-snug whitespace-normal break-words">
                          {acc.customerName}
                        </h3>
                        <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-600 font-mono">
                          {acc.customerDocument && (
                            <span className="flex items-center gap-1">
                              <CreditCard className="w-3 h-3 text-slate-400" />
                              {acc.customerDocument}
                            </span>
                          )}
                          {acc.customerPhone && acc.customerPhone !== 'N/A' && (
                            <span className="flex items-center gap-1">
                              <Phone className="w-3 h-3 text-slate-400" />
                              {acc.customerPhone}
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Workshop / Motorcycle tags */}
                      {(acc.workshopName || acc.motorcycleInfo) && (
                        <div className="flex flex-wrap gap-1.5 pt-0.5">
                          {acc.workshopName && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-amber-900 text-[11px] font-bold">
                              <Wrench className="w-3 h-3 text-amber-600 shrink-0" />
                              <span className="whitespace-normal break-words">{acc.workshopName}</span>
                            </span>
                          )}
                          {acc.motorcycleInfo && (
                            <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-100 border border-slate-200 text-slate-800 text-[11px] font-bold">
                              <Bike className="w-3 h-3 text-slate-500 shrink-0" />
                              <span className="whitespace-normal break-words">{acc.motorcycleInfo}</span>
                            </span>
                          )}
                        </div>
                      )}

                      {/* Recent items preview */}
                      <div className="bg-slate-50 rounded-lg border border-slate-200/80 px-2.5 py-2 space-y-1">
                        <div className="flex items-center justify-between text-[11px] font-bold text-slate-600">
                          <span>
                            {acc.items.length === 0
                              ? 'Sin repuestos cargados aún'
                              : `${acc.items.length} ${acc.items.length === 1 ? 'retiro' : 'retiros'} · ${totalUnits} unds`}
                          </span>
                          {hasValidWhatsAppPhone(acc.customerPhone) && (
                            <button
                              type="button"
                              onClick={() => onSendWhatsAppStatement(acc)}
                              className="text-emerald-700 hover:text-emerald-800 flex items-center gap-1 font-bold cursor-pointer"
                              title="Enviar estado de cuenta por WhatsApp"
                            >
                              <MessageSquare className="w-3 h-3" />
                              <span>WhatsApp</span>
                            </button>
                          )}
                        </div>
                        {acc.items.length > 0 && (
                          <div className="space-y-0.5 max-h-20 overflow-y-auto pr-1">
                            {acc.items.slice(-4).map((it) => (
                              <div
                                key={it.entryId}
                                className="flex items-center justify-between gap-2 text-[11px] text-slate-700"
                              >
                                <span className="truncate">
                                  <strong className="font-mono text-violet-800">{it.quantity}x</strong>{' '}
                                  {it.name}
                                </span>
                                <span className="font-mono font-bold text-slate-900 shrink-0 tabular-nums">
                                  {formatUSD(it.total)}
                                </span>
                              </div>
                            ))}
                            {acc.items.length > 4 && (
                              <p className="text-[10px] text-violet-700 font-semibold">
                                + {acc.items.length - 4} más... (clic en Ver / Editar)
                              </p>
                            )}
                          </div>
                        )}
                      </div>
                    </div>

                    {/* Footer: Running total + 3 action buttons */}
                    <div className="space-y-2.5 pt-2 border-t border-slate-100">
                      <div className="flex items-baseline justify-between gap-2">
                        <span className="text-[11px] font-bold uppercase text-slate-500">
                          Acumulado:
                        </span>
                        <div className="text-right tabular-nums">
                          <span className="text-lg font-extrabold font-mono text-slate-950 block leading-none">
                            {formatUSD(acc.subtotal)}
                          </span>
                          <span className="text-xs font-bold font-mono text-emerald-700 block mt-0.5">
                            {formatBs(accTotalBs)}
                          </span>
                        </div>
                      </div>

                      <div className="grid grid-cols-3 gap-1.5">
                        <button
                          type="button"
                          onClick={() => onStartAddItems(acc)}
                          className={`py-2 px-2 rounded-lg text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors ${
                            isTarget
                              ? 'bg-violet-700 text-white shadow-xs'
                              : 'bg-violet-100 hover:bg-violet-200 text-violet-950 border border-violet-300'
                          }`}
                          title="Seleccionar esta cuenta para sumar repuestos desde el catálogo"
                        >
                          <Plus className="w-3.5 h-3.5 shrink-0" />
                          <span>Sumar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onInspectAccount(acc)}
                          className="py-2 px-2 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-800 border border-slate-200 text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors"
                          title="Ver detalle con horas de retiro, editar o devolver repuestos"
                        >
                          <Eye className="w-3.5 h-3.5 shrink-0" />
                          <span>Detalle</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => onSettleAccount(acc)}
                          disabled={acc.items.length === 0}
                          className="py-2 px-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-[11px] font-bold flex items-center justify-center gap-1 cursor-pointer transition-colors shadow-2xs"
                          title="Cobrar y cerrar esta cuenta al final del día"
                        >
                          <Receipt className="w-3.5 h-3.5 shrink-0" />
                          <span>Cobrar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Optional collapsible list of accounts closed today */}
          {todayClosedAccounts.length > 0 && (
            <div className="pt-1">
              <button
                type="button"
                onClick={() => setShowClosedToday((p) => !p)}
                className="text-xs font-bold text-emerald-800 hover:text-emerald-950 flex items-center gap-1.5 cursor-pointer"
              >
                <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                <span>
                  {showClosedToday ? 'Ocultar' : 'Ver'} cuentas cobradas y cerradas hoy (
                  {todayClosedAccounts.length})
                </span>
              </button>
              {showClosedToday && (
                <div className="mt-2 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-2">
                  {todayClosedAccounts.map((acc) => (
                    <div
                      key={acc.id}
                      className="p-2.5 rounded-xl bg-emerald-50/70 border border-emerald-200 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="min-w-0">
                        <p className="font-bold text-slate-900 whitespace-normal break-words">
                          {acc.customerName}
                        </p>
                        <p className="text-[11px] text-emerald-800 font-mono">
                          {acc.accountNumber} → {acc.settledInvoiceNumber || 'Facturada'}
                        </p>
                      </div>
                      <div className="text-right font-mono font-extrabold text-emerald-900 shrink-0 tabular-nums">
                        {formatUSD(acc.subtotal)}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </section>
  );
};

// ============================================================================
// 2. MODAL: Detalle y Gestión de una Cuenta Abierta (editar/devolver/WhatsApp)
// ============================================================================
interface OpenAccountDetailModalProps {
  account: OpenAccount;
  rate: number;
  settings: BusinessSettings;
  onClose: () => void;
  onUpdateItem: (accountId: string, entryId: string, updates: { quantity?: number; unitPrice?: number }) => void;
  onRemoveItem: (accountId: string, entryId: string) => void;
  onUpdateMeta: (
    accountId: string,
    updates: {
      customerName?: string;
      customerPhone?: string;
      customerDocument?: string;
      workshopName?: string;
      motorcycleInfo?: string;
      notes?: string;
    }
  ) => void;
  onCancelAccount: (accountId: string) => void;
  onStartAddItems: (account: OpenAccount) => void;
  onProceedToSettle: (account: OpenAccount) => void;
  onSendWhatsAppStatement: (account: OpenAccount) => void;
}

export const OpenAccountDetailModal: React.FC<OpenAccountDetailModalProps> = ({
  account,
  rate,
  onClose,
  onUpdateItem,
  onRemoveItem,
  onUpdateMeta,
  onCancelAccount,
  onStartAddItems,
  onProceedToSettle,
  onSendWhatsAppStatement,
}) => {
  const [isEditingMeta, setIsEditingMeta] = useState(false);
  const [editName, setEditName] = useState(account.customerName);
  const [editDoc, setEditDoc] = useState(account.customerDocument || '');
  const [editPhone, setEditPhone] = useState(account.customerPhone === 'N/A' ? '' : account.customerPhone);
  const [editWorkshop, setEditWorkshop] = useState(account.workshopName || '');
  const [editMoto, setEditMoto] = useState(account.motorcycleInfo || '');
  const [editNotes, setEditNotes] = useState(account.notes || '');
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [qtyDrafts, setQtyDrafts] = useState<Record<string, string>>({});

  const clearEntryQtyDraft = (entryId: string) => {
    setQtyDrafts((prev) => {
      if (!(entryId in prev)) return prev;
      const next = { ...prev };
      delete next[entryId];
      return next;
    });
  };

  const commitEntryQtyDraft = (entryId: string, currentQty: number) => {
    const raw = qtyDrafts[entryId];
    clearEntryQtyDraft(entryId);
    if (raw === undefined) return;
    const parsed = parseInt(raw.trim(), 10);
    if (Number.isNaN(parsed) || parsed <= 0 || parsed === currentQty) return;
    onUpdateItem(account.id, entryId, { quantity: parsed });
  };

  const totalBs = Math.round((account.subtotal || 0) * rate * 100) / 100;

  const handleSaveMeta = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editName.trim()) return;
    onUpdateMeta(account.id, {
      customerName: editName.trim(),
      customerDocument: editDoc.trim(),
      customerPhone: editPhone.trim() || 'N/A',
      workshopName: editWorkshop.trim(),
      motorcycleInfo: editMoto.trim(),
      notes: editNotes.trim(),
    });
    setIsEditingMeta(false);
  };

  return (
    <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-2xl w-full border border-slate-200 shadow-2xl overflow-hidden my-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-violet-700 to-violet-900 px-5 py-4 text-white flex items-start justify-between gap-3">
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="px-2 py-0.5 rounded bg-white/20 font-mono text-xs font-extrabold">
                {account.accountNumber}
              </span>
              <span className="text-xs text-violet-200">
                Abierta el{' '}
                {new Date(account.openedAt).toLocaleString('es-VE', {
                  day: '2-digit',
                  month: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </span>
            </div>
            <h3 className="text-lg font-extrabold mt-1 whitespace-normal break-words">
              {account.customerName}
            </h3>
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-violet-100 mt-1">
              {account.customerDocument && <span>C.I./RIF: {account.customerDocument}</span>}
              {account.customerPhone && account.customerPhone !== 'N/A' && (
                <span>Tel: {account.customerPhone}</span>
              )}
              {account.workshopName && <span>Taller: {account.workshopName}</span>}
              {account.motorcycleInfo && <span>Moto: {account.motorcycleInfo}</span>}
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer shrink-0"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 space-y-4 max-h-[75vh] overflow-y-auto">
          {/* Edit personal / workshop info toggle */}
          <div className="flex items-center justify-between gap-2 flex-wrap">
            <button
              type="button"
              onClick={() => setIsEditingMeta((p) => !p)}
              className="px-3 py-1.5 rounded-lg border border-slate-200 bg-slate-50 hover:bg-slate-100 text-xs font-bold text-slate-700 flex items-center gap-1.5 cursor-pointer"
            >
              <Edit3 className="w-3.5 h-3.5 text-violet-600" />
              <span>{isEditingMeta ? 'Cancelar Edición' : 'Editar Datos del Cliente / Taller'}</span>
            </button>

            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => {
                  onStartAddItems(account);
                  onClose();
                }}
                className="px-3 py-1.5 rounded-lg bg-violet-100 hover:bg-violet-200 text-violet-950 border border-violet-300 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Sumar Más Repuestos</span>
              </button>
              <button
                type="button"
                onClick={() => onSendWhatsAppStatement(account)}
                className="px-3 py-1.5 rounded-lg bg-emerald-50 hover:bg-emerald-100 text-emerald-900 border border-emerald-200 text-xs font-bold flex items-center gap-1.5 cursor-pointer"
              >
                <MessageSquare className="w-3.5 h-3.5 text-emerald-600" />
                <span>Enviar Estado WhatsApp</span>
              </button>
            </div>
          </div>

          {isEditingMeta && (
            <form
              onSubmit={handleSaveMeta}
              className="p-3.5 rounded-xl bg-violet-50/70 border border-violet-200 space-y-3"
            >
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Nombre Completo del Cliente *
                  </label>
                  <input
                    type="text"
                    required
                    value={editName}
                    onChange={(e) => setEditName(e.target.value)}
                    className="w-full px-3 py-2 text-xs font-semibold rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Cédula / RIF</label>
                  <input
                    type="text"
                    value={editDoc}
                    onChange={(e) => setEditDoc(e.target.value)}
                    placeholder="Ej. V-24567890"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Teléfono / WhatsApp
                  </label>
                  <input
                    type="text"
                    value={editPhone}
                    onChange={(e) => setEditPhone(e.target.value)}
                    placeholder="Ej. 0414-1234567"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Taller Vecino / Mecánico
                  </label>
                  <input
                    type="text"
                    value={editWorkshop}
                    onChange={(e) => setEditWorkshop(e.target.value)}
                    placeholder="Ej. Taller El Chino"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div>
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">
                    Moto / Placa
                  </label>
                  <input
                    type="text"
                    value={editMoto}
                    onChange={(e) => setEditMoto(e.target.value)}
                    placeholder="Ej. Bera SBR · AB1C23D"
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  />
                </div>
                <div className="sm:col-span-2">
                  <label className="block text-[11px] font-bold text-slate-700 mb-1">Notas</label>
                  <input
                    type="text"
                    value={editNotes}
                    onChange={(e) => setEditNotes(e.target.value)}
                    placeholder="Observaciones..."
                    className="w-full px-3 py-2 text-xs rounded-lg border border-slate-300 bg-white"
                  />
                </div>
              </div>
              <div className="flex justify-end">
                <button
                  type="submit"
                  className="px-4 py-2 rounded-lg bg-violet-600 hover:bg-violet-700 text-white text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>Guardar Cambios</span>
                </button>
              </div>
            </form>
          )}

          {/* Timestamped items list */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-extrabold uppercase tracking-wider text-slate-700">
                Repuestos Retirados ({account.items.length})
              </h4>
              <span className="text-[11px] text-slate-500">
                Al restar o quitar un repuesto se devuelve automáticamente al inventario
              </span>
            </div>

            {account.items.length === 0 ? (
              <div className="p-6 text-center rounded-xl border border-dashed border-slate-300 bg-slate-50 text-xs text-slate-500">
                Esta cuenta todavía no tiene repuestos cargados. Haz clic en{' '}
                <strong>"Sumar Más Repuestos"</strong> para comenzar a agregar del catálogo.
              </div>
            ) : (
              <div className="divide-y divide-slate-200 border border-slate-200 rounded-xl overflow-hidden">
                {account.items.map((item) => {
                  const timeStr = new Date(item.addedAt).toLocaleTimeString('es-VE', {
                    hour: '2-digit',
                    minute: '2-digit',
                  });
                  return (
                    <div
                      key={item.entryId}
                      className="p-3 bg-white hover:bg-slate-50/70 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5"
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2 flex-wrap">
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 font-mono text-[10px] font-bold">
                            {timeStr}
                          </span>
                          <span className="text-xs sm:text-sm font-bold text-slate-900 whitespace-normal break-words">
                            {item.name}
                          </span>
                        </div>
                        <div className="text-[11px] text-slate-500 mt-0.5 flex items-center gap-2 flex-wrap">
                          {item.sku && <span className="font-mono">SKU: {item.sku}</span>}
                          <span className="font-mono">P.Unit: {formatUSD(item.unitPrice)}</span>
                          {item.note && (
                            <span className="text-violet-700 font-semibold">· {item.note}</span>
                          )}
                        </div>
                      </div>

                      <div className="flex items-center justify-between sm:justify-end gap-3 shrink-0">
                        <div className="flex items-center border border-slate-200 rounded-lg bg-white focus-within:border-violet-500 focus-within:ring-1 focus-within:ring-violet-400/40">
                          <button
                            type="button"
                            onClick={() => {
                              clearEntryQtyDraft(item.entryId);
                              onUpdateItem(account.id, item.entryId, { quantity: item.quantity - 1 });
                            }}
                            className="p-1.5 hover:bg-slate-100 text-slate-700 cursor-pointer rounded-l-lg"
                            title="Restar 1 (devuelve al stock)"
                          >
                            <Minus className="w-3 h-3" />
                          </button>
                          <input
                            type="number"
                            inputMode="numeric"
                            min="1"
                            step="1"
                            value={qtyDrafts[item.entryId] ?? String(item.quantity)}
                            onChange={(e) =>
                              setQtyDrafts((prev) => ({ ...prev, [item.entryId]: e.target.value }))
                            }
                            onBlur={() => commitEntryQtyDraft(item.entryId, item.quantity)}
                            onFocus={(e) => e.currentTarget.select()}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.currentTarget.blur();
                              } else if (e.key === 'Escape') {
                                clearEntryQtyDraft(item.entryId);
                                e.currentTarget.blur();
                              }
                            }}
                            aria-label={`Cantidad de ${item.name}`}
                            title="Usa las flechas o escribe la cantidad con el teclado"
                            className="w-14 px-1 py-0.5 font-mono font-bold text-xs text-center text-slate-900 bg-transparent border-x border-slate-100 outline-none tabular-nums"
                          />
                          <button
                            type="button"
                            onClick={() => {
                              clearEntryQtyDraft(item.entryId);
                              onUpdateItem(account.id, item.entryId, { quantity: item.quantity + 1 });
                            }}
                            className="p-1.5 hover:bg-slate-100 text-slate-700 cursor-pointer rounded-r-lg"
                            title="Sumar 1 (descuenta del stock)"
                          >
                            <Plus className="w-3 h-3" />
                          </button>
                        </div>

                        <div className="text-right min-w-[78px] tabular-nums">
                          <span className="font-mono font-extrabold text-sm text-slate-900 block">
                            {formatUSD(item.total)}
                          </span>
                          <span className="font-mono text-[10px] text-emerald-700 block">
                            {formatBs(item.total * rate)}
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => onRemoveItem(account.id, item.entryId)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg cursor-pointer"
                          title="Quitar y devolver repuesto al inventario"
                        >
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Running Total Banner */}
          <div className="p-4 rounded-xl bg-slate-950 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <span className="text-[11px] font-bold uppercase tracking-wider text-violet-300 block">
                Total Acumulado de la Cuenta
              </span>
              <span className="text-xs text-slate-400">Tasa BCV: Bs. {rate.toFixed(2)}</span>
            </div>
            <div className="text-right tabular-nums">
              <span className="text-2xl sm:text-3xl font-extrabold font-mono text-amber-400 block leading-none">
                {formatUSD(account.subtotal)}
              </span>
              <span className="text-base font-extrabold font-mono text-emerald-400 block mt-1">
                {formatBs(totalBs)}
              </span>
            </div>
          </div>

          {/* Footer actions */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-1">
            {!confirmCancel ? (
              <button
                type="button"
                onClick={() => setConfirmCancel(true)}
                className="px-3.5 py-2 rounded-xl border border-rose-200 bg-rose-50 hover:bg-rose-100 text-rose-700 text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Anular Cuenta y Devolver Stock</span>
              </button>
            ) : (
              <div className="flex items-center gap-2 bg-rose-50 border border-rose-300 rounded-xl px-3 py-1.5">
                <span className="text-xs font-bold text-rose-900">¿Seguro? Se devuelve el stock:</span>
                <button
                  type="button"
                  onClick={() => {
                    onCancelAccount(account.id);
                    onClose();
                  }}
                  className="px-2.5 py-1 rounded-lg bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold cursor-pointer"
                >
                  Sí, anular
                </button>
                <button
                  type="button"
                  onClick={() => setConfirmCancel(false)}
                  className="px-2 py-1 rounded-lg bg-white border border-slate-200 text-slate-700 text-xs font-semibold cursor-pointer"
                >
                  No
                </button>
              </div>
            )}

            <button
              type="button"
              disabled={account.items.length === 0}
              onClick={() => {
                onClose();
                onProceedToSettle(account);
              }}
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:opacity-40 text-white text-xs sm:text-sm font-extrabold shadow-sm flex items-center justify-center gap-2 cursor-pointer"
            >
              <Receipt className="w-4 h-4" />
              <span>Cobrar y Cerrar Cuenta ({formatUSD(account.subtotal)})</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

// ============================================================================
// 3. MODAL: Cobrar y Cerrar Cuenta al Final del Día
// ============================================================================
interface SettleOpenAccountModalProps {
  account: OpenAccount;
  rate: number;
  onClose: () => void;
  onConfirmSettle: (
    accountId: string,
    settlement: {
      paymentType: SalePaymentType;
      paymentMethod: PaymentMethod;
      pagoMovilAccount?: PagoMovilAccountOption;
      paymentSplits?: SalePaymentSplit[];
      discount?: number;
      notes?: string;
      creditDays?: number;
      creditDueDate?: string;
      creditPaidAmount?: number;
      creditPaidAmountBs?: number;
      creditInitialPaymentCurrency?: PaymentCurrencyMode;
    }
  ) => Sale | null;
}

export const SettleOpenAccountModal: React.FC<SettleOpenAccountModalProps> = ({
  account,
  rate,
  onClose,
  onConfirmSettle,
}) => {
  const [paymentType, setPaymentType] = useState<'CONTADO' | 'MIXTO' | 'CREDITO'>('CONTADO');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Pago Móvil');
  const [pagoMovilAccount, setPagoMovilAccount] =
    useState<PagoMovilAccountOption>('BANESCO_PERSONAL');
  const [discountUSD, setDiscountUSD] = useState<number>(0);
  const [notes, setNotes] = useState('');
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  // Crédito
  const [creditDays, setCreditDays] = useState<number>(7);
  const [creditDueDate, setCreditDueDate] = useState<string>(() => {
    const d = new Date();
    d.setDate(d.getDate() + 7);
    return d.toISOString().split('T')[0];
  });
  const [creditPaidCurrencyMode, setCreditPaidCurrencyMode] = useState<PaymentCurrencyMode>('BS');
  const [creditPaidUSDInput, setCreditPaidUSDInput] = useState('');
  const [creditPaidBsInput, setCreditPaidBsInput] = useState('');

  // Pago Mixto
  const [mixtoSplits, setMixtoSplits] = useState<MixtoSplitDraft[]>(() =>
    createInitialMixtoSplits()
  );

  const subtotalUSD = Math.round((account.subtotal || 0) * 100) / 100;
  const finalTotalUSD = Math.max(0, Math.round((subtotalUSD - (discountUSD || 0)) * 100) / 100);
  const finalTotalBs = Math.round(finalTotalUSD * rate * 100) / 100;

  const handleCreditDaysChange = (days: number) => {
    setCreditDays(days);
    const d = new Date();
    d.setDate(d.getDate() + days);
    setCreditDueDate(d.toISOString().split('T')[0]);
  };

  const handleCreditPaidUSD = (raw: string) => {
    setCreditPaidUSDInput(raw);
    const num = parseFloat(raw);
    if (raw === '' || Number.isNaN(num) || num < 0) {
      setCreditPaidBsInput('');
      return;
    }
    setCreditPaidBsInput((num * rate).toFixed(2));
  };

  const handleCreditPaidBs = (raw: string) => {
    setCreditPaidBsInput(raw);
    const num = parseFloat(raw);
    if (raw === '' || Number.isNaN(num) || num < 0) {
      setCreditPaidUSDInput('');
      return;
    }
    setCreditPaidUSDInput(rate > 0 ? (num / rate).toFixed(2) : '');
  };

  const updateMixtoUSD = (legId: string, raw: string) => {
    const num = parseFloat(raw);
    const valid = !Number.isNaN(num) && num >= 0 ? num : 0;
    setMixtoSplits((prev) => {
      const updated = prev.map((leg) =>
        leg.id === legId
          ? { ...leg, amountUSD: raw, amountBs: raw === '' ? '' : (valid * rate).toFixed(2) }
          : leg
      );
      if (updated.length === 2 && updated[0].id === legId && finalTotalUSD > 0) {
        const rem = Math.max(0, Math.round((finalTotalUSD - valid) * 100) / 100);
        updated[1] = {
          ...updated[1],
          amountUSD: raw === '' ? '' : rem.toFixed(2),
          amountBs: raw === '' ? '' : (rem * rate).toFixed(2),
        };
      }
      return updated;
    });
  };

  const updateMixtoBs = (legId: string, raw: string) => {
    const numBs = parseFloat(raw);
    const validBs = !Number.isNaN(numBs) && numBs >= 0 ? numBs : 0;
    const equivUSD = rate > 0 ? Math.round((validBs / rate) * 100) / 100 : 0;
    setMixtoSplits((prev) => {
      const updated = prev.map((leg) =>
        leg.id === legId
          ? { ...leg, amountBs: raw, amountUSD: raw === '' ? '' : equivUSD.toFixed(2) }
          : leg
      );
      if (updated.length === 2 && updated[0].id === legId && finalTotalUSD > 0) {
        const rem = Math.max(0, Math.round((finalTotalUSD - equivUSD) * 100) / 100);
        const remBs =
          updated[1].currencyMode === 'BS'
            ? Math.max(0, Math.round((finalTotalUSD * rate - validBs) * 100) / 100)
            : Math.round(rem * rate * 100) / 100;
        updated[1] = {
          ...updated[1],
          amountUSD: raw === '' ? '' : rem.toFixed(2),
          amountBs: raw === '' ? '' : remBs.toFixed(2),
        };
      }
      return updated;
    });
  };

  const mixtoAssignedUSD = useMemo(
    () =>
      Math.round(mixtoSplits.reduce((s, sp) => s + (parseFloat(sp.amountUSD) || 0), 0) * 100) / 100,
    [mixtoSplits]
  );
  const mixtoRemainingUSD = Math.round((finalTotalUSD - mixtoAssignedUSD) * 100) / 100;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    let finalizedSplits: SalePaymentSplit[] | undefined;
    let resolvedMethod: PaymentMethod = paymentMethod;
    let resolvedPmAcc: PagoMovilAccountOption | undefined =
      paymentMethod === 'Pago Móvil' ? pagoMovilAccount : undefined;

    if (paymentType === 'MIXTO') {
      const parsed = mixtoSplits
        .map((sp, idx) => {
          const rawBs = parseFloat(sp.amountBs);
          const rawUsd = parseFloat(sp.amountUSD);
          const hasBs = !Number.isNaN(rawBs) && rawBs > 0;
          const hasUsd = !Number.isNaN(rawUsd) && rawUsd > 0;
          const bs = hasBs
            ? Math.round(rawBs * 100) / 100
            : Math.round((hasUsd ? rawUsd : 0) * rate * 100) / 100;
          const usd = hasUsd
            ? Math.round(rawUsd * 100) / 100
            : rate > 0
            ? Math.round((bs / rate) * 100) / 100
            : 0;
          const isCred = sp.splitType === 'CREDITO';
          const leg: SalePaymentSplit = {
            id: sp.id || `oa-split-${Date.now()}-${idx}`,
            splitType: isCred ? 'CREDITO' : 'CONTADO',
            paymentMethod: isCred ? 'Pago Móvil' : sp.paymentMethod,
            amountUSD: usd,
            amountBs: bs,
            pagoMovilAccount: !isCred && sp.paymentMethod === 'Pago Móvil' ? sp.pagoMovilAccount : undefined,
            reference: sp.reference.trim() || undefined,
          };
          return { leg, isBs: sp.currencyMode === 'BS', hasBs };
        })
        .filter((e) => e.leg.amountUSD > 0 || e.leg.amountBs > 0);

      if (parsed.length < 2) {
        setErrorMsg('En Pago Mixto debes ingresar montos mayores a $0 en al menos 2 formas de pago.');
        return;
      }

      const legs = parsed.map((p) => p.leg);
      const sumUSD = Math.round(legs.reduce((s, l) => s + l.amountUSD, 0) * 100) / 100;
      const diff = Math.round((finalTotalUSD - sumUSD) * 100) / 100;
      if (Math.abs(diff) > 0.02) {
        setErrorMsg(
          diff > 0
            ? `Faltan ${formatUSD(diff)} (${formatBs(diff * rate)}) por asignar en el Pago Mixto.`
            : `El Pago Mixto excede el total por ${formatUSD(Math.abs(diff))}.`
        );
        return;
      }
      if (diff !== 0 && legs.length > 0) {
        const lastIdx = legs.length - 1;
        const nextUsd = Math.max(0.01, Math.round((legs[lastIdx].amountUSD + diff) * 100) / 100);
        legs[lastIdx] = {
          ...legs[lastIdx],
          amountUSD: nextUsd,
          amountBs:
            parsed[lastIdx].isBs && parsed[lastIdx].hasBs
              ? legs[lastIdx].amountBs
              : Math.round(nextUsd * rate * 100) / 100,
        };
      }

      finalizedSplits = legs;
      const primary = legs.reduce((best, cur) => (cur.amountUSD > best.amountUSD ? cur : best), legs[0]);
      resolvedMethod = primary.paymentMethod;
      resolvedPmAcc = primary.paymentMethod === 'Pago Móvil' ? primary.pagoMovilAccount : undefined;
    }

    const creditPaidUSD = Math.max(0, parseFloat(creditPaidUSDInput) || 0);
    const creditPaidBs =
      creditPaidCurrencyMode === 'BS' && parseFloat(creditPaidBsInput) > 0
        ? Math.round(parseFloat(creditPaidBsInput) * 100) / 100
        : Math.round(creditPaidUSD * rate * 100) / 100;

    if (paymentType === 'CREDITO' && creditPaidUSD > finalTotalUSD + 0.05) {
      setErrorMsg('El abono inicial excede el total de la cuenta.');
      return;
    }

    const createdSale = onConfirmSettle(account.id, {
      paymentType,
      paymentMethod: resolvedMethod,
      pagoMovilAccount: resolvedPmAcc,
      paymentSplits: finalizedSplits,
      discount: discountUSD || 0,
      notes: notes.trim() || undefined,
      creditDays: paymentType === 'CREDITO' ? creditDays : undefined,
      creditDueDate: paymentType === 'CREDITO' ? creditDueDate : undefined,
      creditPaidAmount: paymentType === 'CREDITO' ? creditPaidUSD : undefined,
      creditPaidAmountBs: paymentType === 'CREDITO' && creditPaidUSD > 0 ? creditPaidBs : undefined,
      creditInitialPaymentCurrency:
        paymentType === 'CREDITO' && creditPaidUSD > 0 ? creditPaidCurrencyMode : undefined,
    });

    if (createdSale) {
      onClose();
    }
  };

  return (
    <div className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-50 flex items-center justify-center p-4 overflow-y-auto">
      <div className="bg-white rounded-2xl max-w-xl w-full border border-slate-200 shadow-2xl overflow-hidden my-4">
        {/* Header */}
        <div className="bg-gradient-to-r from-emerald-600 to-emerald-800 px-5 py-4 text-white flex items-start justify-between gap-3">
          <div>
            <span className="text-[11px] font-bold uppercase tracking-wider text-emerald-200">
              Cierre y Cobro de Cuenta Abierta · {account.accountNumber}
            </span>
            <h3 className="text-lg font-extrabold whitespace-normal break-words">
              {account.customerName}
            </h3>
            <p className="text-xs text-emerald-100 mt-0.5">
              {account.workshopName ? `Taller: ${account.workshopName} · ` : ''}
              {account.items.length} {account.items.length === 1 ? 'retiro' : 'retiros'} acumulados hoy
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-white/80 hover:text-white hover:bg-white/10 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 max-h-[78vh] overflow-y-auto">
          {/* Compact Items Summary */}
          <div className="rounded-xl bg-slate-50 border border-slate-200 p-3 max-h-36 overflow-y-auto space-y-1">
            {account.items.map((it) => (
              <div key={it.entryId} className="flex items-center justify-between gap-2 text-xs">
                <span className="text-slate-800 truncate">
                  <strong className="font-mono text-violet-700">{it.quantity}x</strong> {it.name}
                </span>
                <span className="font-mono font-bold text-slate-900 shrink-0 tabular-nums">
                  {formatUSD(it.total)}
                </span>
              </div>
            ))}
          </div>

          {/* Discount & Total Card */}
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-3 items-stretch">
            <div className="sm:col-span-4">
              <label className="block text-[11px] font-bold text-slate-700 mb-1">
                Descuento ($ USD)
              </label>
              <input
                type="number"
                step="any"
                min="0"
                max={subtotalUSD}
                value={discountUSD || ''}
                onChange={(e) => setDiscountUSD(Math.max(0, Number(e.target.value) || 0))}
                placeholder="0.00"
                className="w-full px-3 py-2.5 rounded-xl border border-slate-300 bg-slate-50 font-mono text-sm font-bold text-slate-900"
              />
            </div>

            <div className="sm:col-span-8 p-3 rounded-xl bg-slate-950 text-white flex items-center justify-between gap-2 tabular-nums">
              <div>
                <span className="text-[10px] font-bold uppercase text-amber-300 block">
                  Total a Cobrar
                </span>
                <span className="text-[11px] text-slate-400">BCV: Bs. {rate.toFixed(2)}</span>
              </div>
              <div className="text-right">
                <span className="text-2xl font-extrabold font-mono text-amber-400 block leading-none">
                  {formatUSD(finalTotalUSD)}
                </span>
                <span className="text-sm font-extrabold font-mono text-emerald-400 block mt-0.5">
                  {formatBs(finalTotalBs)}
                </span>
              </div>
            </div>
          </div>

          {/* Payment Condition */}
          <div>
            <label className="block text-[11px] font-bold text-slate-700 uppercase tracking-wider mb-1.5">
              Modalidad de Cobro al Cerrar:
            </label>
            <div className="grid grid-cols-3 gap-2">
              <button
                type="button"
                onClick={() => {
                  setPaymentType('CONTADO');
                  setErrorMsg(null);
                }}
                className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                  paymentType === 'CONTADO'
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Banknote className="w-3.5 h-3.5" />
                <span>Contado</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentType('MIXTO');
                  setErrorMsg(null);
                }}
                className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                  paymentType === 'MIXTO'
                    ? 'bg-teal-600 border-teal-600 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Layers className="w-3.5 h-3.5" />
                <span>Pago Mixto</span>
              </button>
              <button
                type="button"
                onClick={() => {
                  setPaymentType('CREDITO');
                  setErrorMsg(null);
                }}
                className={`py-2 px-2 rounded-xl border text-xs font-bold flex items-center justify-center gap-1.5 cursor-pointer ${
                  paymentType === 'CREDITO'
                    ? 'bg-amber-600 border-amber-600 text-white shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Clock className="w-3.5 h-3.5" />
                <span>A Crédito</span>
              </button>
            </div>
          </div>

          {/* CONTADO Options */}
          {paymentType === 'CONTADO' && (
            <div className="space-y-2.5">
              <div>
                <label className="block text-[11px] font-bold text-slate-700 mb-1">
                  Método de Pago Recibido:
                </label>
                <select
                  value={paymentMethod}
                  onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                  className="w-full p-2.5 rounded-xl border border-slate-300 bg-white text-xs font-bold text-slate-900"
                >
                  <option value="Pago Móvil">Pago Móvil (Bs.)</option>
                  <option value="Efectivo Bs">Efectivo en Bolívares (Bs.)</option>
                  <option value="Dólares Efectivo (USD)">Dólares Efectivo ($ USD)</option>
                  <option value="Punto de Venta (Bs)">Punto de Venta (Bs.)</option>
                  <option value="Transferencia Bancaria Bs">Transferencia Bancaria Bs</option>
                  <option value="Binance Pay (USDT)">Binance Pay (USDT)</option>
                </select>
              </div>

              {paymentMethod === 'Pago Móvil' && (
                <div className="p-3 rounded-xl bg-blue-50 border border-blue-200 space-y-2">
                  <span className="text-[11px] font-bold text-blue-950 flex items-center gap-1.5">
                    <Building2 className="w-3.5 h-3.5 text-blue-600" />
                    ¿A qué cuenta cae el Pago Móvil?
                  </span>
                  <div className="grid grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => setPagoMovilAccount('BANESCO_PERSONAL')}
                      className={`py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                        pagoMovilAccount === 'BANESCO_PERSONAL'
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-blue-200 text-slate-700'
                      }`}
                    >
                      Banesco Personal
                    </button>
                    <button
                      type="button"
                      onClick={() => setPagoMovilAccount('PROVINCIAL')}
                      className={`py-2 rounded-lg border text-xs font-bold cursor-pointer ${
                        pagoMovilAccount === 'PROVINCIAL'
                          ? 'bg-slate-900 border-slate-900 text-white'
                          : 'bg-white border-blue-200 text-slate-700'
                      }`}
                    >
                      Provincial
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* PAGO MIXTO Options */}
          {paymentType === 'MIXTO' && (
            <div className="p-3 rounded-xl bg-teal-50/90 border border-teal-300 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <span className="text-xs font-extrabold text-teal-950">
                  Desglose de Pago Mixto (Bs. / Divisas)
                </span>
                <span
                  className={`text-xs font-mono font-extrabold ${
                    Math.abs(mixtoRemainingUSD) <= 0.01 ? 'text-emerald-700' : 'text-amber-700'
                  }`}
                >
                  {Math.abs(mixtoRemainingUSD) <= 0.01
                    ? '✓ Completo'
                    : mixtoRemainingUSD > 0
                    ? `Faltan ${formatUSD(mixtoRemainingUSD)}`
                    : `Excede ${formatUSD(Math.abs(mixtoRemainingUSD))}`}
                </span>
              </div>

              {mixtoSplits.map((leg, idx) => (
                <div
                  key={leg.id}
                  className="p-2.5 rounded-lg bg-white border border-teal-200 space-y-2"
                >
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-[11px] font-extrabold text-slate-700">
                      Parte #{idx + 1}
                    </span>
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() =>
                          setMixtoSplits((prev) =>
                            prev.map((l) =>
                              l.id === leg.id
                                ? {
                                    ...l,
                                    currencyMode: 'BS',
                                    paymentMethod: isBsMethod(l.paymentMethod)
                                      ? l.paymentMethod
                                      : 'Pago Móvil',
                                  }
                                : l
                            )
                          )
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          leg.currencyMode === 'BS'
                            ? 'bg-sky-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        Bs.
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setMixtoSplits((prev) =>
                            prev.map((l) =>
                              l.id === leg.id
                                ? {
                                    ...l,
                                    currencyMode: 'USD',
                                    paymentMethod: !isBsMethod(l.paymentMethod)
                                      ? l.paymentMethod
                                      : 'Dólares Efectivo (USD)',
                                  }
                                : l
                            )
                          )
                        }
                        className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                          leg.currencyMode === 'USD'
                            ? 'bg-emerald-600 text-white'
                            : 'bg-slate-100 text-slate-600'
                        }`}
                      >
                        $ Divisas
                      </button>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <select
                      value={leg.paymentMethod}
                      onChange={(e) => {
                        const nextM = e.target.value as PaymentMethod;
                        setMixtoSplits((prev) =>
                          prev.map((l) =>
                            l.id === leg.id
                              ? {
                                  ...l,
                                  paymentMethod: nextM,
                                  currencyMode: isBsMethod(nextM) ? 'BS' : 'USD',
                                }
                              : l
                          )
                        );
                      }}
                      className="p-2 rounded-lg border border-slate-200 text-xs font-semibold bg-slate-50"
                    >
                      <option value="Pago Móvil">Pago Móvil (Bs.)</option>
                      <option value="Efectivo Bs">Efectivo Bs</option>
                      <option value="Dólares Efectivo (USD)">Dólares Efectivo ($)</option>
                      <option value="Punto de Venta (Bs)">Punto de Venta (Bs.)</option>
                      <option value="Transferencia Bancaria Bs">Transferencia Bs</option>
                      <option value="Binance Pay (USDT)">Binance Pay (USDT)</option>
                    </select>

                    {leg.paymentMethod === 'Pago Móvil' && (
                      <select
                        value={leg.pagoMovilAccount}
                        onChange={(e) =>
                          setMixtoSplits((prev) =>
                            prev.map((l) =>
                              l.id === leg.id
                                ? { ...l, pagoMovilAccount: e.target.value as PagoMovilAccountOption }
                                : l
                            )
                          )
                        }
                        className="p-2 rounded-lg border border-blue-200 text-xs font-semibold bg-blue-50"
                      >
                        <option value="BANESCO_PERSONAL">Banesco Personal</option>
                        <option value="PROVINCIAL">Provincial</option>
                      </select>
                    )}
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                        Monto en Bs.
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={leg.amountBs}
                        onChange={(e) => updateMixtoBs(leg.id, e.target.value)}
                        placeholder="0.00"
                        className="w-full p-1.5 rounded-lg border border-slate-300 font-mono text-xs font-bold"
                      />
                    </div>
                    <div>
                      <label className="block text-[10px] font-bold text-slate-500 mb-0.5">
                        Monto en $ USD
                      </label>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={leg.amountUSD}
                        onChange={(e) => updateMixtoUSD(leg.id, e.target.value)}
                        placeholder="0.00"
                        className="w-full p-1.5 rounded-lg border border-slate-300 font-mono text-xs font-bold"
                      />
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* CREDITO Options */}
          {paymentType === 'CREDITO' && (
            <div className="p-3 rounded-xl bg-amber-50 border border-amber-300 space-y-2.5">
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-[10px] font-bold text-amber-900 mb-1">
                    Plazo (días):
                  </label>
                  <div className="flex gap-1">
                    {[3, 7, 15, 30].map((d) => (
                      <button
                        key={d}
                        type="button"
                        onClick={() => handleCreditDaysChange(d)}
                        className={`flex-1 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                          creditDays === d
                            ? 'bg-amber-600 text-white border-amber-600'
                            : 'bg-white text-amber-900 border-amber-200'
                        }`}
                      >
                        {d}d
                      </button>
                    ))}
                  </div>
                </div>
                <div>
                  <label className="block text-[10px] font-bold text-amber-900 mb-1">
                    Fecha límite:
                  </label>
                  <input
                    type="date"
                    value={creditDueDate}
                    onChange={(e) => setCreditDueDate(e.target.value)}
                    className="w-full p-1.5 rounded-lg border border-amber-300 bg-white text-xs font-bold"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <div className="flex items-center justify-between">
                  <label className="text-[10px] font-bold text-amber-950 uppercase">
                    Abono Inicial Hoy (Opcional):
                  </label>
                  <div className="inline-flex rounded-lg border border-amber-300 bg-white p-0.5">
                    <button
                      type="button"
                      onClick={() => setCreditPaidCurrencyMode('BS')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        creditPaidCurrencyMode === 'BS' ? 'bg-sky-600 text-white' : 'text-slate-600'
                      }`}
                    >
                      Bs.
                    </button>
                    <button
                      type="button"
                      onClick={() => setCreditPaidCurrencyMode('USD')}
                      className={`px-2 py-0.5 rounded text-[10px] font-bold cursor-pointer ${
                        creditPaidCurrencyMode === 'USD'
                          ? 'bg-emerald-600 text-white'
                          : 'text-slate-600'
                      }`}
                    >
                      $ Divisas
                    </button>
                  </div>
                </div>

                <div className="grid grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      Abono en Bs.
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={creditPaidBsInput}
                      onChange={(e) => handleCreditPaidBs(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-1.5 rounded-lg border border-amber-300 bg-white font-mono text-xs font-bold"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-600 mb-0.5">
                      Equiv. $ USD
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={creditPaidUSDInput}
                      onChange={(e) => handleCreditPaidUSD(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-1.5 rounded-lg border border-amber-300 bg-white font-mono text-xs font-bold"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-[10px] font-bold text-amber-900 mb-0.5">
                    Método del abono (si abona hoy):
                  </label>
                  <select
                    value={paymentMethod}
                    onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
                    className="w-full p-2 rounded-lg border border-amber-300 bg-white text-xs font-semibold"
                  >
                    <option value="Pago Móvil">Pago Móvil (Bs.)</option>
                    <option value="Efectivo Bs">Efectivo Bs</option>
                    <option value="Dólares Efectivo (USD)">Dólares Efectivo ($)</option>
                    <option value="Punto de Venta (Bs)">Punto de Venta (Bs.)</option>
                    <option value="Transferencia Bancaria Bs">Transferencia Bs</option>
                    <option value="Binance Pay (USDT)">Binance Pay (USDT)</option>
                  </select>
                </div>
              </div>
            </div>
          )}

          {/* Notes */}
          <div>
            <input
              type="text"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="Observación de cierre (opcional)..."
              className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 text-xs"
            />
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Footer Submit */}
          <div className="flex items-center justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 rounded-xl border border-slate-200 bg-slate-50 hover:bg-slate-100 text-slate-700 text-xs font-bold cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className="px-5 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-extrabold shadow-md flex items-center gap-2 cursor-pointer"
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>Cobrar {formatUSD(finalTotalUSD)} y Emitir Factura</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

// Re-export helper so PosView can build WhatsApp messages easily
export { buildOpenAccountWhatsAppMessage };
