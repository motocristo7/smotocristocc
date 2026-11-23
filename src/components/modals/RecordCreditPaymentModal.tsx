import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Sale,
  PaymentMethod,
  PagoMovilAccountOption,
  PaymentCurrencyMode,
  CreditPaymentRecord,
} from '../../types';
import { formatUSD, formatBs } from '../../utils/whatsapp';
import {
  DollarSign,
  Banknote,
  X,
  CheckCircle2,
  MessageSquare,
  BookmarkCheck,
  Building2,
  ArrowLeftRight,
  AlertCircle,
} from 'lucide-react';

interface RecordCreditPaymentModalProps {
  sale: Sale;
  onClose: () => void;
  onSuccess?: (
    result: {
      updatedSale: Sale;
      paymentRecord: CreditPaymentRecord;
      totalCustomerDebtAfterUSD: number;
    },
    sendWhatsApp: boolean
  ) => void;
}

const isBsMethod = (method: PaymentMethod): boolean =>
  method === 'Pago Móvil' ||
  method === 'Punto de Venta (Bs)' ||
  method === 'Transferencia Bancaria Bs';

export const RecordCreditPaymentModal: React.FC<RecordCreditPaymentModalProps> = ({
  sale,
  onClose,
  onSuccess,
}) => {
  const { settings, recordCreditPayment } = useApp();
  const rate = settings.bcvRate > 0 ? settings.bcvRate : sale.bcvRate || 1;
  const isApartado = sale.paymentType === 'APARTADO';

  const currentPendingUSD = Math.max(
    0,
    Math.round((sale.total - (sale.creditPaidAmount || 0)) * 100) / 100
  );
  const currentPendingBs = Math.round(currentPendingUSD * rate * 100) / 100;

  const [currencyMode, setCurrencyMode] = useState<PaymentCurrencyMode>('BS');
  const [amountUSDInput, setAmountUSDInput] = useState<string>(() =>
    currentPendingUSD > 0 ? currentPendingUSD.toFixed(2) : ''
  );
  const [amountBsInput, setAmountBsInput] = useState<string>(() =>
    currentPendingBs > 0 ? currentPendingBs.toFixed(2) : ''
  );
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Pago Móvil');
  const [pagoMovilAccount, setPagoMovilAccount] =
    useState<PagoMovilAccountOption>('BANESCO_PERSONAL');
  const [paymentRef, setPaymentRef] = useState('');
  const [paymentNotes, setPaymentNotes] = useState('');
  const [sendWhatsAppOnPayment, setSendWhatsAppOnPayment] = useState(true);
  const [formError, setFormError] = useState<string | null>(null);

  // Sincronizar si cambia el sale prop
  useEffect(() => {
    const pending = Math.max(
      0,
      Math.round((sale.total - (sale.creditPaidAmount || 0)) * 100) / 100
    );
    const pendingBs = Math.round(pending * rate * 100) / 100;
    setAmountUSDInput(pending > 0 ? pending.toFixed(2) : '');
    setAmountBsInput(pendingBs > 0 ? pendingBs.toFixed(2) : '');
    setFormError(null);
  }, [sale.id, sale.total, sale.creditPaidAmount, rate]);

  const handleSelectCurrencyMode = (nextMode: PaymentCurrencyMode) => {
    setCurrencyMode(nextMode);
    setFormError(null);
    if (nextMode === 'BS' && !isBsMethod(paymentMethod)) {
      setPaymentMethod('Pago Móvil');
    } else if (nextMode === 'USD' && isBsMethod(paymentMethod)) {
      setPaymentMethod('Dólares Efectivo (USD)');
    }
  };

  const handleChangeBs = (rawVal: string) => {
    setFormError(null);
    setAmountBsInput(rawVal);
    const parsed = parseFloat(rawVal);
    if (rawVal === '' || Number.isNaN(parsed) || parsed < 0) {
      setAmountUSDInput('');
      return;
    }
    const equivUsd = rate > 0 ? Math.round((parsed / rate) * 100) / 100 : 0;
    setAmountUSDInput(equivUsd.toFixed(2));
  };

  const handleChangeUSD = (rawVal: string) => {
    setFormError(null);
    setAmountUSDInput(rawVal);
    const parsed = parseFloat(rawVal);
    if (rawVal === '' || Number.isNaN(parsed) || parsed < 0) {
      setAmountBsInput('');
      return;
    }
    const equivBs = Math.round(parsed * rate * 100) / 100;
    setAmountBsInput(equivBs.toFixed(2));
  };

  const handleFillFraction = (fraction: number) => {
    setFormError(null);
    const targetUsd = Math.round(currentPendingUSD * fraction * 100) / 100;
    const targetBs = Math.round(targetUsd * rate * 100) / 100;
    setAmountUSDInput(targetUsd.toFixed(2));
    setAmountBsInput(targetBs.toFixed(2));
  };

  const parsedUSD = parseFloat(amountUSDInput);
  const parsedBs = parseFloat(amountBsInput);
  const effectiveUSD =
    !Number.isNaN(parsedUSD) && parsedUSD > 0
      ? Math.round(parsedUSD * 100) / 100
      : !Number.isNaN(parsedBs) && parsedBs > 0 && rate > 0
        ? Math.round((parsedBs / rate) * 100) / 100
        : 0;
  const effectiveBs =
    currencyMode === 'BS' && !Number.isNaN(parsedBs) && parsedBs > 0
      ? Math.round(parsedBs * 100) / 100
      : Math.round(effectiveUSD * rate * 100) / 100;

  const newRemainingUSD = Math.max(
    0,
    Math.round((currentPendingUSD - effectiveUSD) * 100) / 100
  );
  const isFullLiquidation = effectiveUSD > 0 && newRemainingUSD <= 0.02;

  const treasuryDestLabel =
    paymentMethod === 'Pago Móvil'
      ? pagoMovilAccount === 'PROVINCIAL'
        ? 'Provincial (Bs)'
        : 'Banesco Personal (Bs)'
      : paymentMethod === 'Punto de Venta (Bs)' || paymentMethod === 'Transferencia Bancaria Bs'
        ? 'Banesco SMCC (Bs)'
        : paymentMethod === 'Binance Pay (USDT)'
          ? 'Billetera USDT (Binance)'
          : 'Caja Efectivo USD ($)';

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (effectiveUSD <= 0) {
      setFormError('Ingresa un monto mayor a 0 en Bolívares o Divisas para registrar el abono.');
      return;
    }

    if (effectiveUSD > currentPendingUSD + 0.05) {
      setFormError(
        `El abono (${formatUSD(effectiveUSD)}) excede el saldo pendiente de ${formatUSD(currentPendingUSD)} (${formatBs(currentPendingBs)}).`
      );
      return;
    }

    // Si está dentro de 2 centavos de liquidar el saldo completo, ajustar USD al saldo exacto sin alterar el monto exacto en Bs
    const finalUSD =
      Math.abs(currentPendingUSD - effectiveUSD) <= 0.02 ? currentPendingUSD : effectiveUSD;
    const finalBs =
      currencyMode === 'BS' && !Number.isNaN(parsedBs) && parsedBs > 0
        ? Math.round(parsedBs * 100) / 100
        : Math.round(finalUSD * rate * 100) / 100;

    const result = recordCreditPayment(sale.id, {
      amountUSD: finalUSD,
      amountBs: finalBs,
      currencyMode,
      paymentMethod,
      pagoMovilAccount: paymentMethod === 'Pago Móvil' ? pagoMovilAccount : undefined,
      reference: paymentRef.trim() || undefined,
      notes: paymentNotes.trim() || undefined,
    });

    if (result && onSuccess) {
      onSuccess(result, sendWhatsAppOnPayment);
    }
    onClose();
  };

  return (
    <div
      className="fixed inset-0 bg-slate-950/75 backdrop-blur-xs z-60 flex items-center justify-center p-4 overflow-y-auto"
      onClick={(e) => e.stopPropagation()}
    >
      <div className="bg-white rounded-2xl max-w-lg w-full border border-slate-200 shadow-2xl overflow-hidden my-auto animate-in fade-in zoom-in-95">
        {/* Header */}
        <div
          className={`px-5 py-4 text-white flex items-center justify-between ${
            isApartado ? 'bg-indigo-600' : 'bg-amber-600'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {isApartado ? (
              <BookmarkCheck className="w-5 h-5 text-indigo-200 shrink-0" />
            ) : (
              <DollarSign className="w-5 h-5 text-amber-200 shrink-0" />
            )}
            <div>
              <h3 className="font-bold text-sm">
                {isApartado ? 'Registrar Abono de Apartado' : 'Registrar Abono o Pago'}
              </h3>
              <span
                className={`text-[11px] font-mono ${
                  isApartado ? 'text-indigo-100' : 'text-amber-100'
                }`}
              >
                {isApartado ? 'Apartado' : 'Factura'} #{sale.invoiceNumber} · BCV: Bs. {rate.toFixed(2)}
              </span>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-white/80 hover:text-white hover:bg-white/10 rounded-lg cursor-pointer transition-colors"
            title="Cerrar"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs max-h-[82vh] overflow-y-auto">
          {/* Resumen de la cuenta */}
          <div
            className={`p-3 rounded-xl border space-y-1.5 ${
              isApartado
                ? 'bg-indigo-50/90 border-indigo-200 text-indigo-950'
                : 'bg-amber-50/90 border-amber-200 text-amber-950'
            }`}
          >
            <div className="flex justify-between gap-2">
              <span className="opacity-80">Cliente:</span>
              <span className="font-bold text-right">{sale.customerName}</span>
            </div>
            <div className="flex justify-between gap-2">
              <span className="opacity-80">
                {isApartado ? 'Total del Apartado:' : 'Total Factura:'}
              </span>
              <span className="font-mono font-semibold">
                {formatUSD(sale.total)} <span className="opacity-70">({formatBs(sale.total * rate)})</span>
              </span>
            </div>
            <div className="flex justify-between gap-2 text-emerald-800">
              <span>Abonado acumulado:</span>
              <span className="font-mono font-semibold">
                {formatUSD(sale.creditPaidAmount || 0)}{' '}
                <span className="opacity-75">({formatBs((sale.creditPaidAmount || 0) * rate)})</span>
              </span>
            </div>
            <div
              className={`flex justify-between items-baseline pt-1.5 border-t font-bold ${
                isApartado
                  ? 'border-indigo-200 text-indigo-950'
                  : 'border-amber-200 text-amber-950'
              }`}
            >
              <span>{isApartado ? 'Saldo Restante para Retirar:' : 'Saldo Restante Pendiente:'}</span>
              <div className="text-right font-mono">
                <span className="text-sm block">{formatUSD(currentPendingUSD)}</span>
                <span className="text-[11px] font-semibold opacity-80 block">
                  {formatBs(currentPendingBs)}
                </span>
              </div>
            </div>
          </div>

          {/* 1. Selector de moneda: Bolívares vs Divisas */}
          <div className="space-y-1.5">
            <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">
              1. ¿En qué moneda se recibe este abono? *
            </label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => handleSelectCurrencyMode('BS')}
                className={`py-2.5 px-3 rounded-xl border-2 text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  currencyMode === 'BS'
                    ? 'bg-sky-600 border-sky-600 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-sky-900 hover:bg-sky-50'
                }`}
              >
                <Banknote className="w-4 h-4 shrink-0" />
                <span>Bs. Bolívares</span>
              </button>
              <button
                type="button"
                onClick={() => handleSelectCurrencyMode('USD')}
                className={`py-2.5 px-3 rounded-xl border-2 text-xs font-extrabold transition-all cursor-pointer flex items-center justify-center gap-1.5 ${
                  currencyMode === 'USD'
                    ? 'bg-emerald-600 border-emerald-600 text-white shadow-sm'
                    : 'bg-white border-slate-200 text-emerald-900 hover:bg-emerald-50'
                }`}
              >
                <DollarSign className="w-4 h-4 shrink-0" />
                <span>$ Divisas (USD)</span>
              </button>
            </div>
          </div>

          {/* 2. Campos sincronizados de monto (Bs. y $ USD) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between gap-2 flex-wrap">
              <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">
                2. Monto del Abono y Equivalente BCV *
              </label>
              <div className="flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => handleFillFraction(0.5)}
                  className="px-2 py-0.5 text-[10px] font-bold bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-md border border-slate-200 cursor-pointer"
                >
                  50%
                </button>
                <button
                  type="button"
                  onClick={() => handleFillFraction(1)}
                  className={`px-2 py-0.5 text-[10px] font-bold rounded-md border cursor-pointer ${
                    isApartado
                      ? 'bg-indigo-100 hover:bg-indigo-200 text-indigo-800 border-indigo-200'
                      : 'bg-amber-100 hover:bg-amber-200 text-amber-800 border-amber-200'
                  }`}
                >
                  Pagar Saldo Completo
                </button>
              </div>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
              {currencyMode === 'BS' ? (
                <>
                  <div>
                    <label className="block text-[10px] font-extrabold text-sky-800 uppercase mb-1">
                      Monto en Bolívares (Bs.) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={amountBsInput}
                      onChange={(e) => handleChangeBs(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-2.5 rounded-xl border-2 border-sky-400 font-mono font-extrabold text-sm text-sky-950 bg-sky-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-sky-400/50"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Equiv. en Divisas ($ USD BCV)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={amountUSDInput}
                      onChange={(e) => handleChangeUSD(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-sm text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                  </div>
                </>
              ) : (
                <>
                  <div>
                    <label className="block text-[10px] font-extrabold text-emerald-800 uppercase mb-1">
                      Monto en Divisas ($ USD) *
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={amountUSDInput}
                      onChange={(e) => handleChangeUSD(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-2.5 rounded-xl border-2 border-emerald-500 font-mono font-extrabold text-sm text-emerald-950 bg-emerald-50/50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400/50"
                      autoFocus
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-bold text-slate-500 uppercase mb-1">
                      Equiv. en Bolívares (Bs. BCV)
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={amountBsInput}
                      onChange={(e) => handleChangeBs(e.target.value)}
                      placeholder="0.00"
                      className="w-full p-2.5 rounded-xl border border-slate-300 font-mono font-bold text-sm text-slate-700 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-300"
                    />
                  </div>
                </>
              )}
            </div>

            {/* Banner claro de equivalencia exacta */}
            <div
              className={`px-3 py-2 rounded-xl border flex items-center justify-between gap-2 text-[11px] ${
                currencyMode === 'BS'
                  ? 'bg-sky-50 border-sky-200 text-sky-950'
                  : 'bg-emerald-50 border-emerald-200 text-emerald-950'
              }`}
            >
              <span className="flex items-center gap-1.5 font-semibold">
                <ArrowLeftRight className="w-3.5 h-3.5 shrink-0" />
                <span>{currencyMode === 'BS' ? 'Recibes en Bs.:' : 'Recibes en Divisas:'}</span>
              </span>
              <span className="font-mono font-extrabold text-right">
                {currencyMode === 'BS' ? (
                  <>
                    {formatBs(effectiveBs)}{' '}
                    <span className="font-semibold opacity-80">
                      (Equiv. {formatUSD(effectiveUSD)} BCV)
                    </span>
                  </>
                ) : (
                  <>
                    {formatUSD(effectiveUSD)}{' '}
                    <span className="font-semibold opacity-80">
                      (Equiv. {formatBs(effectiveBs)} BCV)
                    </span>
                  </>
                )}
              </span>
            </div>

            {/* Saldo restante tras aplicar este abono */}
            <div className="p-2.5 rounded-xl bg-slate-900 text-white flex items-center justify-between text-[11px]">
              <div>
                <span className="text-slate-300 font-medium block">
                  {isApartado
                    ? 'Saldo restante para retirar tras abono:'
                    : 'Saldo restante tras aplicar abono:'}
                </span>
                {isFullLiquidation && (
                  <span className="text-[10px] font-bold text-emerald-400">
                    ✓ {isApartado ? 'Apartado liquidado al 100% — Listo para retirar' : 'Factura pagada al 100%'}
                  </span>
                )}
              </div>
              <div className="text-right font-mono font-bold">
                <span className={isFullLiquidation ? 'text-emerald-400 text-sm' : 'text-amber-400 text-sm'}>
                  {formatUSD(isFullLiquidation ? 0 : newRemainingUSD)}
                </span>
                <span className="text-[10px] text-slate-300 block font-normal">
                  {formatBs((isFullLiquidation ? 0 : newRemainingUSD) * rate)}
                </span>
              </div>
            </div>
          </div>

          {formError && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-semibold flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{formError}</span>
            </div>
          )}

          {/* 3. Método de Pago */}
          <div className="space-y-2">
            <label className="block text-[11px] font-extrabold text-slate-700 uppercase tracking-wide">
              3. Método de Pago ({currencyMode === 'BS' ? 'Bolívares' : 'Divisas'}) *
            </label>
            <select
              value={paymentMethod}
              onChange={(e) => {
                const nextM = e.target.value as PaymentMethod;
                setPaymentMethod(nextM);
                setCurrencyMode(isBsMethod(nextM) ? 'BS' : 'USD');
              }}
              className={`w-full p-2.5 rounded-xl border font-semibold text-slate-800 ${
                currencyMode === 'BS'
                  ? 'border-sky-300 bg-sky-50/50'
                  : 'border-emerald-300 bg-emerald-50/50'
              }`}
            >
              {currencyMode === 'BS' ? (
                <>
                  <option value="Pago Móvil">Pago Móvil (Bs.)</option>
                  <option value="Punto de Venta (Bs)">Punto de Venta (Bs.)</option>
                  <option value="Transferencia Bancaria Bs">Transferencia Bancaria (Bs.)</option>
                </>
              ) : (
                <>
                  <option value="Dólares Efectivo (USD)">Dólares Efectivo ($ USD)</option>
                  <option value="Binance Pay (USDT)">Binance Pay (USDT)</option>
                </>
              )}
            </select>

            {currencyMode === 'BS' && paymentMethod === 'Pago Móvil' && (
              <div className="p-2.5 rounded-xl bg-blue-50/80 border border-blue-200 space-y-2">
                <label className="block text-[11px] font-bold text-blue-950">
                  ¿A qué cuenta cae el Pago Móvil? *
                </label>
                <div className="grid grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() => setPagoMovilAccount('BANESCO_PERSONAL')}
                    className={`px-2.5 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                      pagoMovilAccount === 'BANESCO_PERSONAL'
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-blue-200 text-slate-700 hover:bg-blue-100/60'
                    }`}
                  >
                    Banesco Personal
                  </button>
                  <button
                    type="button"
                    onClick={() => setPagoMovilAccount('PROVINCIAL')}
                    className={`px-2.5 py-2 rounded-lg border text-xs font-bold transition-all cursor-pointer ${
                      pagoMovilAccount === 'PROVINCIAL'
                        ? 'bg-slate-900 border-slate-900 text-white'
                        : 'bg-white border-blue-200 text-slate-700 hover:bg-blue-100/60'
                    }`}
                  >
                    Provincial
                  </button>
                </div>
              </div>
            )}

            <div className="px-3 py-2 rounded-xl bg-slate-50 border border-slate-200 flex items-center gap-2 text-[11px] text-slate-700">
              <Building2 className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <span>
                Ingreso automático en Tesorería: <strong className="text-slate-900">{treasuryDestLabel}</strong>
              </span>
            </div>
          </div>

          {/* Referencia y Notas */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                N° de Referencia (Opcional)
              </label>
              <input
                type="text"
                value={paymentRef}
                onChange={(e) => setPaymentRef(e.target.value)}
                placeholder="Ej. 12948271"
                className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white font-mono"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">
                Notas / Observaciones
              </label>
              <input
                type="text"
                value={paymentNotes}
                onChange={(e) => setPaymentNotes(e.target.value)}
                placeholder="Ej. Abono 2 / Recibido en tienda"
                className="w-full p-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white"
              />
            </div>
          </div>

          <label className="flex items-center gap-2 p-2.5 bg-emerald-50 border border-emerald-200 rounded-xl cursor-pointer">
            <input
              type="checkbox"
              checked={sendWhatsAppOnPayment}
              onChange={(e) => setSendWhatsAppOnPayment(e.target.checked)}
              className="rounded border-emerald-400 text-emerald-600 focus:ring-emerald-500 cursor-pointer w-4 h-4"
            />
            <span className="text-[11px] font-semibold text-emerald-950 flex items-center gap-1.5">
              <MessageSquare className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
              <span>Enviar comprobante del abono y saldo actual al WhatsApp del cliente</span>
            </span>
          </label>

          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 rounded-xl cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              className={`px-5 py-2.5 text-white font-bold rounded-xl shadow-xs cursor-pointer flex items-center gap-1.5 ${
                isApartado
                  ? 'bg-indigo-600 hover:bg-indigo-700'
                  : 'bg-amber-600 hover:bg-amber-700'
              }`}
            >
              <CheckCircle2 className="w-4 h-4" />
              <span>{sendWhatsAppOnPayment ? 'Registrar Abono y Notificar' : 'Registrar Abono'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
