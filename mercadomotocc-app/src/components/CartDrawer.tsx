import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { formatUSD, formatBs, buildWhatsAppLink } from '../utils/formatters';
import { PaymentMethod, OnlineOrderDeliveryType, ShippingAgency } from '../types';
import {
  X,
  ShoppingBag,
  Trash2,
  Plus,
  Minus,
  CheckCircle2,
  Copy,
  Check,
  CreditCard,
  MessageSquare,
  ArrowRight,
  ShieldCheck,
  Building2,
  Phone,
  Truck,
  MapPin,
  AlertCircle,
  User,
} from 'lucide-react';

export const CartDrawer: React.FC = () => {
  const {
    cart,
    cartTotalUSD,
    cartTotalBs,
    cartCount,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    settings,
    bcvRate,
    isCartOpen,
    setIsCartOpen,
    submitOrder,
  } = useStore();

  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>('cart');
  const [customerName, setCustomerName] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [deliveryType, setDeliveryType] = useState<OnlineOrderDeliveryType>('RETIRO_TIENDA');
  const [shippingAgency, setShippingAgency] = useState<ShippingAgency>('MRW');
  const [agencyAddress, setAgencyAddress] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientDocument, setRecipientDocument] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Pago Móvil');
  const [paymentProofRef, setPaymentProofRef] = useState('');
  const [notes, setNotes] = useState('');
  const [copiedLabel, setCopiedLabel] = useState<string | null>(null);
  const [completedOrderCode, setCompletedOrderCode] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  if (!isCartOpen) return null;

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedLabel(label);
    setTimeout(() => setCopiedLabel(null), 2000);
  };

  const handleConfirmOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!customerName.trim() || !customerPhone.trim()) {
      setFormError('Por favor ingresa tu nombre y número de WhatsApp.');
      return;
    }

    if (deliveryType === 'DOMICILIO' && !address.trim()) {
      setFormError('Por favor ingresa la dirección exacta de entrega en Mérida.');
      return;
    }

    if (deliveryType === 'ENVIO_NACIONAL') {
      if (!agencyAddress.trim()) {
        setFormError('Por favor indica la agencia de destino (Zoom, MRW o Tealca).');
        return;
      }
      if (!recipientName.trim() || !recipientDocument.trim() || !recipientPhone.trim()) {
        setFormError('Por favor completa los datos del destinatario requeridos por la encomienda.');
        return;
      }
    }

    const orderCode = `ORD-${Math.floor(1000 + Math.random() * 9000)}`;

    const itemsText = cart
      .map((item) => `▪ ${item.quantity}x ${item.product.name} (${formatUSD(item.product.salePrice * item.quantity)})`)
      .join('\n');

    let deliveryText = '';
    if (deliveryType === 'RETIRO_TIENDA') {
      deliveryText = `🏬 *Retiro Personal:* Sede Mérida (${settings.address})`;
    } else if (deliveryType === 'DOMICILIO') {
      deliveryText = `🛵 *Entrega a Domicilio (Mérida):* ${address}`;
    } else {
      deliveryText = `🚚 *Envío Nacional (${shippingAgency}):*
Agencia: ${agencyAddress}
Destinatario: ${recipientName} (C.I. ${recipientDocument}) - Telf: ${recipientPhone}`;
    }

    const message = `🛍️ *NUEVO PEDIDO - MERCADO MOTO CC #${orderCode}*
────────────────────────
Hola *${settings.commercialName}*, deseo realizar la siguiente compra en su tienda online:

👤 *Cliente:* ${customerName}
📱 *WhatsApp:* ${customerPhone}
${deliveryText}

📦 *REPUESTOS SOLICITADOS:*
${itemsText}
────────────────────────
💵 *TOTAL A PAGAR: ${formatUSD(cartTotalUSD)}*
📊 *Tasa BCV:* Bs. ${bcvRate.toFixed(2)}
🇻🇪 *TOTAL EN BOLÍVARES: ${formatBs(cartTotalBs)}*
────────────────────────
💳 *Método de Pago:* ${paymentMethod}
${paymentProofRef ? `🧾 *Ref. / Comprobante:* ${paymentProofRef}\n` : ''}${notes ? `📝 *Notas:* ${notes}\n` : ''}
Quedo atento a su confirmación. ¡Muchas gracias!`;

    // Guardar en la base de datos compartida
    await submitOrder({
      id: `online-${Date.now()}`,
      orderCode,
      customerName,
      customerPhone,
      total: cartTotalUSD,
      totalBs: cartTotalBs,
      items: cart.map((i) => ({
        productId: i.product.id,
        sku: i.product.sku,
        name: i.product.name,
        quantity: i.quantity,
        unitPrice: i.product.salePrice,
        total: i.product.salePrice * i.quantity,
      })),
      deliveryType,
      paymentMethod,
      paymentProofRef,
      createdAt: new Date().toISOString(),
      source: 'TIENDA_ONLINE',
    });

    setCompletedOrderCode(orderCode);
    setStep('success');

    // Abrir WhatsApp con el pedido preparado
    const whatsappLink = buildWhatsAppLink(settings.whatsapp, message);
    window.open(whatsappLink, '_blank');
  };

  return (
    <div className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end">
      <div className="w-full max-w-lg bg-white h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200">
        {/* Drawer Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 bg-slate-900 text-white flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ShoppingBag className="w-5 h-5 text-amber-400" />
            <h2 className="font-bold text-sm sm:text-base font-display">
              {step === 'cart'
                ? `Carrito de Compras (${cartCount})`
                : step === 'checkout'
                ? 'Finalizar Pedido'
                : '¡Pedido Generado con Éxito!'}
            </h2>
          </div>
          <button
            onClick={() => setIsCartOpen(false)}
            className="p-1 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-5 text-xs">
          {step === 'cart' && (
            <>
              {cart.length === 0 ? (
                <div className="py-20 text-center space-y-3">
                  <ShoppingBag className="w-12 h-12 text-slate-300 mx-auto" />
                  <p className="font-bold text-slate-700">Tu carrito está vacío</p>
                  <p className="text-slate-500 max-w-xs mx-auto">
                    Explora el catálogo de repuestos y agrega los artículos que necesitas para tu motocicleta.
                  </p>
                </div>
              ) : (
                <div className="space-y-3">
                  {cart.map((item) => (
                    <div
                      key={item.product.id}
                      className="p-3 bg-slate-50 rounded-xl border border-slate-200 flex items-center justify-between gap-3"
                    >
                      <div className="flex-1 min-w-0">
                        <span className="text-[10px] text-slate-400 font-mono block">
                          SKU: {item.product.sku}
                        </span>
                        <h4 className="font-bold text-slate-900 truncate">
                          {item.product.name}
                        </h4>
                        <div className="flex items-baseline gap-2 mt-1">
                          <span className="font-mono font-bold text-slate-900">
                            {formatUSD(item.product.salePrice)}
                          </span>
                          <span className="font-mono text-[11px] text-emerald-700 font-medium">
                            {formatBs(item.product.salePrice * bcvRate)}
                          </span>
                        </div>
                      </div>

                      {/* Quantity controls */}
                      <div className="flex items-center gap-1.5 bg-white border border-slate-200 rounded-lg p-1">
                        <button
                          onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                        >
                          <Minus className="w-3 h-3" />
                        </button>
                        <span className="w-6 text-center font-mono font-bold text-slate-900">
                          {item.quantity}
                        </span>
                        <button
                          onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                          className="p-1 hover:bg-slate-100 rounded text-slate-600 cursor-pointer"
                        >
                          <Plus className="w-3 h-3" />
                        </button>
                      </div>

                      <button
                        onClick={() => removeFromCart(item.product.id)}
                        className="p-1.5 text-slate-400 hover:text-rose-600 cursor-pointer"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                  ))}

                  <div className="pt-2 flex justify-between">
                    <button
                      onClick={clearCart}
                      className="text-slate-400 hover:text-rose-600 font-medium text-[11px] cursor-pointer"
                    >
                      Vaciar carrito
                    </button>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 'checkout' && (
            <form onSubmit={handleConfirmOrder} className="space-y-4">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-rose-700 font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 shrink-0" />
                  <span>{formError}</span>
                </div>
              )}

              {/* Customer info */}
              <div className="space-y-2">
                <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                  <User className="w-3.5 h-3.5 text-amber-600" />
                  <span>Tus Datos de Contacto</span>
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Nombre y Apellido *</label>
                    <input
                      type="text"
                      required
                      value={customerName}
                      onChange={(e) => setCustomerName(e.target.value)}
                      placeholder="Ej. Carlos Mendoza"
                      className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Celular con WhatsApp *</label>
                    <input
                      type="tel"
                      required
                      value={customerPhone}
                      onChange={(e) => setCustomerPhone(e.target.value)}
                      placeholder="Ej. 04121234567"
                      className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Delivery method */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                  <Truck className="w-3.5 h-3.5 text-amber-600" />
                  <span>Método de Entrega</span>
                </h3>

                <div className="grid grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryType('RETIRO_TIENDA')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      deliveryType === 'RETIRO_TIENDA'
                        ? 'border-amber-500 bg-amber-50/50 text-slate-950 font-bold shadow-2xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="block text-base">🏬</span>
                    <span className="block text-[11px] mt-1">Retiro en Tienda</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryType('DOMICILIO')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      deliveryType === 'DOMICILIO'
                        ? 'border-amber-500 bg-amber-50/50 text-slate-950 font-bold shadow-2xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="block text-base">🛵</span>
                    <span className="block text-[11px] mt-1">Delivery Mérida</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryType('ENVIO_NACIONAL')}
                    className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                      deliveryType === 'ENVIO_NACIONAL'
                        ? 'border-amber-500 bg-amber-50/50 text-slate-950 font-bold shadow-2xs'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <span className="block text-base">🚚</span>
                    <span className="block text-[11px] mt-1">Envío Nacional</span>
                  </button>
                </div>

                {deliveryType === 'RETIRO_TIENDA' && (
                  <p className="text-[11px] text-slate-500 bg-slate-50 p-2.5 rounded-lg border border-slate-200">
                    📍 <strong>Sede física:</strong> {settings.address}, {settings.city}. Horario: Lunes a Sábado 8:00 AM - 6:30 PM.
                  </p>
                )}

                {deliveryType === 'DOMICILIO' && (
                  <div>
                    <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">Dirección en Mérida *</label>
                    <input
                      type="text"
                      required
                      value={address}
                      onChange={(e) => setAddress(e.target.value)}
                      placeholder="Sector, calle, edificio o punto de referencia"
                      className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50"
                    />
                  </div>
                )}

                {deliveryType === 'ENVIO_NACIONAL' && (
                  <div className="space-y-2 bg-slate-50 p-3 rounded-xl border border-slate-200">
                    <div className="grid grid-cols-3 gap-2">
                      {(['MRW', 'Zoom', 'Tealca'] as ShippingAgency[]).map((agency) => (
                        <button
                          key={agency}
                          type="button"
                          onClick={() => setShippingAgency(agency)}
                          className={`py-1.5 px-2 rounded-lg text-xs font-bold border transition-colors cursor-pointer ${
                            shippingAgency === agency
                              ? 'bg-amber-500 text-slate-950 border-amber-500'
                              : 'bg-white border-slate-200 text-slate-700'
                          }`}
                        >
                          {agency}
                        </button>
                      ))}
                    </div>

                    <input
                      type="text"
                      required
                      value={agencyAddress}
                      onChange={(e) => setAgencyAddress(e.target.value)}
                      placeholder={`Dirección o nombre de la agencia ${shippingAgency} de destino`}
                      className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                    />

                    <div className="grid grid-cols-2 gap-2">
                      <input
                        type="text"
                        required
                        value={recipientName}
                        onChange={(e) => setRecipientName(e.target.value)}
                        placeholder="Nombre de quien retira"
                        className="w-full p-2 rounded-lg border border-slate-200 bg-white"
                      />
                      <input
                        type="text"
                        required
                        value={recipientDocument}
                        onChange={(e) => setRecipientDocument(e.target.value)}
                        placeholder="Cédula (V-12345678)"
                        className="w-full p-2 rounded-lg border border-slate-200 bg-white font-mono"
                      />
                    </div>

                    <input
                      type="tel"
                      required
                      value={recipientPhone}
                      onChange={(e) => setRecipientPhone(e.target.value)}
                      placeholder="Teléfono del destinatario"
                      className="w-full p-2 rounded-lg border border-slate-200 bg-white font-mono"
                    />
                  </div>
                )}
              </div>

              {/* Payment method */}
              <div className="space-y-2 pt-2 border-t border-slate-200">
                <h3 className="font-bold text-slate-900 uppercase text-[11px] tracking-wider flex items-center gap-1.5">
                  <CreditCard className="w-3.5 h-3.5 text-amber-600" />
                  <span>Método de Pago en Venezuela</span>
                </h3>

                <div className="grid grid-cols-2 gap-2">
                  {(['Pago Móvil', 'Transferencia Banesco', 'Efectivo Divisas', 'Binance Pay'] as PaymentMethod[]).map(
                    (method) => (
                      <button
                        key={method}
                        type="button"
                        onClick={() => setPaymentMethod(method)}
                        className={`p-2 rounded-lg border text-left font-semibold transition-all cursor-pointer ${
                          paymentMethod === method
                            ? 'border-amber-500 bg-amber-50 text-slate-950 font-bold'
                            : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                        }`}
                      >
                        {method}
                      </button>
                    )
                  )}
                </div>

                {/* Bank Details Display */}
                {paymentMethod === 'Pago Móvil' && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                    <span className="font-bold text-slate-900 block">Datos para Pago Móvil:</span>
                    <div className="flex items-center justify-between text-slate-600">
                      <span>Banco: {settings.bankDetails.pagoMovilBank}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy('0134', 'banco')}
                        className="text-amber-600 font-bold hover:underline"
                      >
                        {copiedLabel === 'banco' ? '¡Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 font-mono">
                      <span>Teléfono: {settings.bankDetails.pagoMovilPhone}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(settings.bankDetails.pagoMovilPhone, 'telf')}
                        className="text-amber-600 font-bold hover:underline font-sans"
                      >
                        {copiedLabel === 'telf' ? '¡Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <div className="flex items-center justify-between text-slate-600 font-mono">
                      <span>C.I. / RIF: {settings.bankDetails.pagoMovilId}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(settings.bankDetails.pagoMovilId, 'ci')}
                        className="text-amber-600 font-bold hover:underline font-sans"
                      >
                        {copiedLabel === 'ci' ? '¡Copiado!' : 'Copiar'}
                      </button>
                    </div>
                  </div>
                )}

                {paymentMethod === 'Transferencia Banesco' && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                    <span className="font-bold text-slate-900 block">Cuenta Corriente Banesco:</span>
                    <div className="flex items-center justify-between text-slate-600 font-mono text-[11px]">
                      <span>{settings.bankDetails.bankTransferAccount}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(settings.bankDetails.bankTransferAccount, 'cuenta')}
                        className="text-amber-600 font-bold hover:underline font-sans"
                      >
                        {copiedLabel === 'cuenta' ? '¡Copiado!' : 'Copiar'}
                      </button>
                    </div>
                    <p className="text-slate-500">Titular: {settings.name} (RIF: {settings.bankDetails.bankTransferRif})</p>
                  </div>
                )}

                {paymentMethod === 'Binance Pay' && (
                  <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-1.5">
                    <span className="font-bold text-slate-900 block">Binance Pay ID:</span>
                    <div className="flex items-center justify-between text-slate-600 font-mono">
                      <span>{settings.bankDetails.binancePayId || '98451234'}</span>
                      <button
                        type="button"
                        onClick={() => handleCopy(settings.bankDetails.binancePayId || '98451234', 'binance')}
                        className="text-amber-600 font-bold hover:underline font-sans"
                      >
                        {copiedLabel === 'binance' ? '¡Copiado!' : 'Copiar'}
                      </button>
                    </div>
                  </div>
                )}

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                    Número de Referencia del Pago (Opcional)
                  </label>
                  <input
                    type="text"
                    value={paymentProofRef}
                    onChange={(e) => setPaymentProofRef(e.target.value)}
                    placeholder="Ej. Últimos 4 dígitos o referencia"
                    className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono"
                  />
                </div>

                <div>
                  <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                    Notas adicionales (Opcional)
                  </label>
                  <input
                    type="text"
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Ej. Año de mi moto o color requerido"
                    className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>

              {/* Submit Button */}
              <button
                type="submit"
                className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl shadow-lg transition-all flex items-center justify-center gap-2 cursor-pointer mt-4"
              >
                <MessageSquare className="w-4 h-4" />
                <span>Confirmar y Enviar Pedido a WhatsApp</span>
              </button>
            </form>
          )}

          {step === 'success' && (
            <div className="py-10 text-center space-y-4">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mx-auto">
                <CheckCircle2 className="w-8 h-8" />
              </div>

              <div>
                <h3 className="text-lg font-bold text-slate-900">¡Pedido Enviado a WhatsApp!</h3>
                <p className="text-xs text-slate-500 font-mono mt-1">Código: {completedOrderCode}</p>
                <p className="text-xs text-slate-600 mt-2 max-w-xs mx-auto">
                  Tu orden ha sido registrada. Nuestro equipo en Servimotos Cristo Centro te responderá enseguida para coordinar el despacho.
                </p>
              </div>

              <button
                onClick={() => {
                  setStep('cart');
                  setIsCartOpen(false);
                }}
                className="px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs cursor-pointer"
              >
                Seguir Comprando
              </button>
            </div>
          )}
        </div>

        {/* Drawer Footer (Subtotals) */}
        {step === 'cart' && cart.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-slate-200 bg-slate-50 space-y-3">
            <div className="space-y-1">
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span>Total en Dólares:</span>
                <span className="font-mono font-bold text-slate-900 text-sm">
                  {formatUSD(cartTotalUSD)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs text-slate-500">
                <span>Tasa Oficial BCV:</span>
                <span className="font-mono font-medium text-slate-700">
                  Bs. {bcvRate.toFixed(2)}
                </span>
              </div>
              <div className="flex justify-between items-center text-xs font-bold pt-1 border-t border-slate-200 text-slate-900">
                <span>Total a Pagar en Bolívares:</span>
                <span className="font-mono text-emerald-700 text-base font-extrabold">
                  {formatBs(cartTotalBs)}
                </span>
              </div>
            </div>

            <button
              onClick={() => setStep('checkout')}
              className="w-full py-3 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-all flex items-center justify-center gap-2 cursor-pointer shadow-md"
            >
              <span>Continuar al Pago y Envío</span>
              <ArrowRight className="w-4 h-4" />
            </button>
          </div>
        )}

        {step === 'checkout' && (
          <div className="p-3 bg-slate-100 border-t border-slate-200 flex justify-between items-center">
            <button
              type="button"
              onClick={() => setStep('cart')}
              className="text-slate-600 hover:text-slate-900 font-bold text-xs cursor-pointer"
            >
              ← Volver al carrito
            </button>
            <div className="text-right">
              <span className="font-bold text-slate-900 font-mono">{formatUSD(cartTotalUSD)}</span>
              <span className="text-[10px] text-emerald-700 font-mono block">{formatBs(cartTotalBs)}</span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
