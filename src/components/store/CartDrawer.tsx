import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import { formatUSD, formatBs, buildStoreOrderWhatsAppMessage } from '../../utils/whatsapp';
import {
  PaymentMethod,
  ShippingAgency,
  OnlineOrderDeliveryType,
  productTracksInventory,
  DEFAULT_PRODUCTION_TIME_LABEL,
  DEFAULT_PRODUCTION_TIME_NOTE,
} from '../../types';
import { VENEZUELA_LOCATIONS } from '../../data/venezuela';
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
  TrendingUp,
  Truck,
  MapPin,
  AlertCircle,
  User,
  Clock,
  Percent,
} from 'lucide-react';
import {
  normalizeImageUrl,
  getFallbackProductImage,
  handleProductImageError,
} from '../../utils/imageUrl';

interface CartDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  initialStep?: 'cart' | 'checkout';
}

export const CartDrawer: React.FC<CartDrawerProps> = ({ isOpen, onClose, initialStep = 'cart' }) => {
  const {
    cart,
    cartSubtotalBeforeDiscount,
    cartWholesaleDiscount,
    cartWholesaleSummary,
    cartTotal,
    cartTotalBs,
    cartItemCount,
    updateCartQuantity,
    removeFromCart,
    clearCart,
    placeOnlineOrder,
    settings,
    setWhatsappModalData,
    currentUser,
  } = useApp();

  const [step, setStep] = useState<'cart' | 'checkout' | 'success'>(initialStep);

  const [customerName, setCustomerName] = useState(currentUser?.name || '');
  const [customerPhone, setCustomerPhone] = useState(currentUser?.phone || '');
  const [customerDocument, setCustomerDocument] = useState(currentUser?.documentId || '');

  useEffect(() => {
    if (isOpen) {
      setStep(initialStep || 'cart');
      setFormError(null);
      if (currentUser) {
        if (!customerName) setCustomerName(currentUser.name || '');
        if (!customerPhone) setCustomerPhone(currentUser.phone || '');
        if (!customerDocument) setCustomerDocument(currentUser.documentId || '');
        if (!recipientDocument) setRecipientDocument(currentUser.documentId || '');
      }
    }
  }, [isOpen, initialStep, currentUser]);

  const [deliveryType, setDeliveryType] = useState<OnlineOrderDeliveryType>('RETIRO_TIENDA');
  const [shippingAgency, setShippingAgency] = useState<ShippingAgency>('MRW');
  const [agencyAddress, setAgencyAddress] = useState('');
  const [recipientName, setRecipientName] = useState('');
  const [recipientDocument, setRecipientDocument] = useState('');
  const [recipientPhone, setRecipientPhone] = useState('');
  const [selectedState, setSelectedState] = useState(settings.state || 'Mérida');
  const [selectedCity, setSelectedCity] = useState(settings.city || 'Mérida');
  const [address, setAddress] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('Pago Móvil');
  const [paymentProofRef, setPaymentProofRef] = useState('');
  const [notes, setNotes] = useState('');
  const [copiedBank, setCopiedBank] = useState<string | null>(null);
  const [completedOrderCode, setCompletedOrderCode] = useState<string>('');
  const [formError, setFormError] = useState<string | null>(null);

  if (!isOpen) return null;

  // Cities for current selected state
  const availableCities = VENEZUELA_LOCATIONS.find((l) => l.state === selectedState)?.cities || [selectedCity];

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBank(label);
    setTimeout(() => setCopiedBank(null), 2000);
  };

  const handleUseCustomerDataForShipping = () => {
    if (customerName.trim()) setRecipientName(customerName.trim());
    if (customerPhone.trim()) setRecipientPhone(customerPhone.trim());
    if (customerDocument.trim()) setRecipientDocument(customerDocument.trim());
  };

  const handleConfirmOrder = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (!customerName.trim() || !customerPhone.trim()) {
      setFormError('Por favor ingresa tu nombre completo y teléfono de WhatsApp.');
      return;
    }

    if (!customerDocument.trim()) {
      setFormError('Por favor ingresa tu número de Cédula de Identidad o RIF para registrar tu factura.');
      return;
    }

    if (deliveryType === 'DOMICILIO' && !address.trim()) {
      setFormError('Por favor ingresa la dirección de entrega a domicilio en Mérida.');
      return;
    }

    if (deliveryType === 'ENVIO_NACIONAL') {
      if (!agencyAddress.trim()) {
        setFormError('Por favor indica la dirección o nombre de la agencia (Zoom, MRW o Tealca) de destino.');
        return;
      }
      if (!recipientName.trim()) {
        setFormError('Por favor indica el nombre de la persona que retira en la agencia.');
        return;
      }
      if (!recipientDocument.trim()) {
        setFormError('Por favor indica la Cédula de Identidad de quien retira (requerido por las agencias de encomienda).');
        return;
      }
      if (!recipientPhone.trim()) {
        setFormError('Por favor indica el teléfono de contacto de quien retira en la agencia.');
        return;
      }
    }

    const orderItems = cartWholesaleSummary.items.map((line) => {
      const madeToOrder = !productTracksInventory(line.product);
      const hasDiscount = line.discountPct > 0;
      return {
        productId: line.product.id,
        sku: line.product.sku,
        name: line.product.name,
        category: line.product.category,
        quantity: line.quantity,
        unitPrice: line.effectiveUnitPriceUSD,
        total: line.finalSubtotalUSD,
        ...(hasDiscount
          ? {
              originalUnitPrice: line.regularUnitPriceUSD,
              wholesaleDiscountPct: line.discountPct,
              wholesaleRuleLabel: line.appliedRuleLabel,
            }
          : {}),
        ...(madeToOrder
          ? {
              isMadeToOrder: true,
              productionTimeLabel: line.product.productionTimeLabel || DEFAULT_PRODUCTION_TIME_LABEL,
              productionTimeNote: line.product.productionTimeNote || DEFAULT_PRODUCTION_TIME_NOTE,
            }
          : {}),
      };
    });

    const newOrder = placeOnlineOrder({
      customerName: customerName.trim(),
      customerPhone: customerPhone.trim(),
      customerDocument: customerDocument.trim(),
      customerAddress: deliveryType === 'DOMICILIO' ? address.trim() : undefined,
      customerCity: selectedCity,
      customerState: selectedState,
      deliveryType,
      shippingAgency: deliveryType === 'ENVIO_NACIONAL' ? shippingAgency : undefined,
      agencyAddress: deliveryType === 'ENVIO_NACIONAL' ? agencyAddress.trim() : undefined,
      recipientDocument: deliveryType === 'ENVIO_NACIONAL' ? recipientDocument.trim() : customerDocument.trim(),
      recipientName: deliveryType === 'ENVIO_NACIONAL' ? recipientName.trim() : customerName.trim(),
      recipientPhone: deliveryType === 'ENVIO_NACIONAL' ? recipientPhone.trim() : customerPhone.trim(),
      items: orderItems,
      ...(cartWholesaleDiscount > 0
        ? {
            subtotalBeforeDiscount: cartSubtotalBeforeDiscount,
            wholesaleDiscountTotal: cartWholesaleDiscount,
          }
        : {}),
      total: cartTotal,
      paymentMethod,
      paymentProofReference: paymentProofRef.trim() || undefined,
      notes: notes.trim() || undefined,
    });

    setCompletedOrderCode(newOrder.orderCode);
    setStep('success');

    // WhatsApp message
    const { message, url } = buildStoreOrderWhatsAppMessage(newOrder, settings);
    const storeBrand = settings.onlineStoreName || 'Mercado Moto CC';
    setWhatsappModalData({
      title: `Pedido ${newOrder.orderCode} - Enviar a ${storeBrand}`,
      message,
      url,
      phone: settings.whatsapp,
      recipientName: storeBrand,
    });
  };

  const handleResetDrawer = () => {
    setStep('cart');
    onClose();
  };

  return (
    <div
      onClick={handleResetDrawer}
      className="fixed inset-0 z-50 overflow-hidden bg-slate-900/60 backdrop-blur-xs flex justify-end cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white w-full max-w-lg h-full shadow-2xl flex flex-col animate-in slide-in-from-right duration-200 cursor-default"
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-200 flex items-center justify-between bg-slate-900 text-white">
          <div className="flex items-center gap-2.5">
            <ShoppingBag className="w-5 h-5 text-amber-400" />
            <div>
              <h2 className="font-bold text-base font-display">
                {step === 'cart' && `Carrito de Compras (${cartItemCount})`}
                {step === 'checkout' && 'Finalizar Compra y Pago'}
                {step === 'success' && '¡Pedido Recibido con Éxito!'}
              </h2>
              <p className="text-[11px] text-emerald-400 font-mono">
                Tasa BCV: Bs. {settings.bcvRate.toFixed(2)} / USD
              </p>
            </div>
          </div>
          <button
            onClick={handleResetDrawer}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 bg-slate-50">
          {step === 'cart' && (
            <>
              {cart.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-500">
                  <div className="w-16 h-16 rounded-full bg-slate-100 flex items-center justify-center text-slate-400 mb-3">
                    <ShoppingBag className="w-8 h-8" />
                  </div>
                  <h3 className="font-bold text-slate-800 text-base">Tu carrito está vacío</h3>
                  <p className="text-xs text-slate-500 mt-1 max-w-xs">
                    Explora nuestro catálogo de repuestos en Venezuela y agrega los que necesites.
                  </p>
                  <button
                    onClick={onClose}
                    className="mt-5 px-5 py-2.5 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                  >
                    Ver Catálogo
                  </button>
                </div>
              ) : (
                <div className="space-y-3">
                  {cartWholesaleDiscount > 0 && (
                    <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-3 py-2.5 flex items-center justify-between gap-2 text-xs">
                      <div className="flex items-center gap-2 min-w-0">
                        <Percent className="w-4 h-4 text-emerald-700 shrink-0" />
                        <span className="font-bold text-emerald-950">
                          Descuento al Mayor aplicado
                        </span>
                      </div>
                      <span className="font-mono font-extrabold text-emerald-700 tabular-nums shrink-0">
                        -{formatUSD(cartWholesaleDiscount)}
                      </span>
                    </div>
                  )}

                  {cartWholesaleSummary.items.map((line) => {
                    const item = line;
                    const itemTotalBs = line.finalSubtotalUSD * settings.bcvRate;
                    const hasWholesale = line.discountPct > 0;

                    return (
                      <div
                        key={item.product.id}
                        className="bg-white rounded-xl border border-slate-200 p-3.5 flex gap-3 shadow-2xs"
                      >
                        <div className="w-20 h-20 rounded-lg bg-slate-100 overflow-hidden shrink-0 border border-slate-200">
                          <img
                            src={
                              normalizeImageUrl(item.product.imageUrl) ||
                              getFallbackProductImage(item.product.name, item.product.category)
                            }
                            alt={item.product.name}
                            className="w-full h-full object-cover"
                            referrerPolicy="no-referrer"
                            onError={(e) => handleProductImageError(e, item.product)}
                          />
                        </div>

                        <div className="flex-1 flex flex-col justify-between min-w-0">
                          <div>
                            <div className="flex items-start justify-between gap-1">
                              <h4 className="text-xs font-bold text-slate-900 whitespace-normal break-words leading-snug">
                                {item.product.name}
                              </h4>
                              <button
                                onClick={() => removeFromCart(item.product.id)}
                                className="text-slate-400 hover:text-rose-600 p-1 cursor-pointer"
                                title="Eliminar"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </div>
                            <span className="text-[10px] text-slate-500 font-mono">
                              {item.product.sku} ·{' '}
                              {productTracksInventory(item.product)
                                ? `Stock: ${item.product.stock}`
                                : `Bajo pedido (${item.product.productionTimeLabel || DEFAULT_PRODUCTION_TIME_LABEL})`}
                            </span>

                            {hasWholesale && (
                              <div className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[10px]">
                                <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded tabular-nums">
                                  -{line.discountPct}% al mayor
                                </span>
                                <span className="font-mono text-slate-600 tabular-nums">
                                  {formatUSD(line.effectiveUnitPriceUSD)} c/u
                                </span>
                                {line.appliedRuleLabel && (
                                  <span className="text-slate-400 truncate">
                                    ({line.appliedRuleLabel})
                                  </span>
                                )}
                              </div>
                            )}

                            {line.nextTierHint && (
                              <p className="mt-1 text-[10px] text-amber-800 bg-amber-50 border border-amber-200/80 rounded px-1.5 py-0.5 leading-snug">
                                Agrega <strong className="font-mono">{line.nextTierHint.missingQty}</strong> más
                                {line.nextTierHint.combineAcrossFilter
                                  ? ` en ${line.nextTierHint.ruleLabel}`
                                  : ''}{' '}
                                para <strong className="font-mono">-{line.nextTierHint.nextDiscountPct}%</strong> al mayor
                              </p>
                            )}
                          </div>

                          <div className="flex items-center justify-between mt-2 pt-1.5 border-t border-slate-100">
                            <div className="flex items-center border border-slate-200 rounded-md bg-slate-50 overflow-hidden">
                              <button
                                onClick={() => updateCartQuantity(item.product.id, item.quantity - 1)}
                                className="p-1 text-slate-600 hover:bg-slate-200 transition-colors cursor-pointer"
                              >
                                <Minus className="w-3 h-3" />
                              </button>
                              <span className="px-2.5 text-xs font-mono font-semibold text-slate-900 tabular-nums">
                                {item.quantity}
                              </span>
                              <button
                                onClick={() => updateCartQuantity(item.product.id, item.quantity + 1)}
                                disabled={
                                  productTracksInventory(item.product) &&
                                  item.quantity >= item.product.stock
                                }
                                className="p-1 text-slate-600 hover:bg-slate-200 disabled:opacity-30 transition-colors cursor-pointer"
                              >
                                <Plus className="w-3 h-3" />
                              </button>
                            </div>

                            <div className="text-right">
                              {hasWholesale && (
                                <span className="text-[10px] font-mono text-slate-400 line-through block tabular-nums">
                                  {formatUSD(line.regularSubtotalUSD)}
                                </span>
                              )}
                              <span className="text-xs font-bold font-mono text-slate-900 block tabular-nums">
                                {formatUSD(line.finalSubtotalUSD)}
                              </span>
                              <span className="text-[10px] font-semibold text-emerald-700 font-mono tabular-nums block">
                                {formatBs(itemTotalBs)}
                              </span>
                            </div>
                          </div>
                        </div>
                      </div>
                    );
                  })}

                  {cart.some((item) => !productTracksInventory(item.product)) && (
                    <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-950 flex items-start gap-2">
                      <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="font-bold">Tiempo de fabricación bajo pedido</p>
                        <p className="text-amber-900 mt-0.5 leading-snug">
                          {cart.find((item) => !productTracksInventory(item.product))?.product
                            .productionTimeNote || DEFAULT_PRODUCTION_TIME_NOTE}
                        </p>
                      </div>
                    </div>
                  )}

                  <div className="pt-2 flex justify-between text-xs text-slate-500">
                    <button
                      onClick={clearCart}
                      className="text-rose-600 hover:underline cursor-pointer"
                    >
                      Vaciar Carrito
                    </button>
                    <span>{cartItemCount} unidades en total</span>
                  </div>
                </div>
              )}
            </>
          )}

          {step === 'checkout' && (
            <form id="checkout-form" onSubmit={handleConfirmOrder} className="space-y-4">
              {/* Order Items Preview */}
              <div className="bg-amber-500/10 border border-amber-300 rounded-xl p-3 flex items-center justify-between text-xs gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-1.5 font-bold text-slate-900">
                    <ShoppingBag className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                    <span>{cartItemCount} {cartItemCount === 1 ? 'repuesto a pagar' : 'repuestos a pagar'}</span>
                  </div>
                  {cartWholesaleDiscount > 0 && (
                    <p className="text-[11px] text-emerald-800 font-semibold mt-0.5 font-mono tabular-nums">
                      Subtotal {formatUSD(cartSubtotalBeforeDiscount)} · Ahorro al mayor -{formatUSD(cartWholesaleDiscount)}
                    </p>
                  )}
                  <p className="text-[11px] text-slate-600 mt-0.5">
                    Total: <strong className="font-mono text-slate-900">{formatUSD(cartTotal)}</strong> ({formatBs(cartTotalBs)} BCV)
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setStep('cart')}
                  className="px-2.5 py-1 text-[11px] font-semibold text-slate-700 hover:text-slate-900 bg-white hover:bg-slate-50 border border-slate-200 rounded-lg transition-colors cursor-pointer shrink-0"
                >
                  Ver artículos
                </button>
              </div>

              {cart.some((item) => !productTracksInventory(item.product)) && (
                <div className="rounded-xl bg-amber-50 border border-amber-200 p-3 text-[11px] text-amber-950 flex items-start gap-2">
                  <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                  <div>
                    <p className="font-bold">Tu pedido incluye fabricación bajo pedido</p>
                    <p className="text-amber-900 mt-0.5 leading-snug">
                      {cart.find((item) => !productTracksInventory(item.product))?.product
                        .productionTimeNote || DEFAULT_PRODUCTION_TIME_NOTE}
                    </p>
                  </div>
                </div>
              )}

              {/* Customer info */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-amber-600" />
                  <span>Datos de Contacto y Facturación (Venezuela)</span>
                </h3>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Nombre Completo *
                  </label>
                  <input
                    type="text"
                    required
                    value={customerName}
                    onChange={(e) => setCustomerName(e.target.value)}
                    placeholder="Ej. Juan Pérez"
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Teléfono / WhatsApp * (Para confirmación y factura)
                  </label>
                  <input
                    type="tel"
                    required
                    value={customerPhone}
                    onChange={(e) => setCustomerPhone(e.target.value)}
                    placeholder="Ej. 0414-1234567 o 0424-9876543"
                    className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              {/* Delivery method and Venezuelan Location Selector */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                    <Truck className="w-3.5 h-3.5 text-amber-600" />
                    <span>Modalidad de Entrega en Venezuela</span>
                  </h3>
                </div>

                {/* 3 Delivery Options Grid */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                  <button
                    type="button"
                    onClick={() => setDeliveryType('RETIRO_TIENDA')}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      deliveryType === 'RETIRO_TIENDA'
                        ? 'border-amber-600 bg-amber-50/70 text-slate-950 font-semibold shadow-2xs ring-1 ring-amber-500/30'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-slate-900">
                      <Building2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="font-bold">Retiro en Sede</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">Mérida - Campo de Oro (Gratis)</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryType('DOMICILIO')}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      deliveryType === 'DOMICILIO'
                        ? 'border-amber-600 bg-amber-50/70 text-slate-950 font-semibold shadow-2xs ring-1 ring-amber-500/30'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-slate-900">
                      <MapPin className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="font-bold">Delivery Local</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">Motorizado en Mérida</p>
                  </button>

                  <button
                    type="button"
                    onClick={() => setDeliveryType('ENVIO_NACIONAL')}
                    className={`p-2.5 rounded-xl border text-left text-xs transition-all cursor-pointer ${
                      deliveryType === 'ENVIO_NACIONAL'
                        ? 'border-amber-600 bg-amber-50/70 text-slate-950 font-semibold shadow-2xs ring-1 ring-amber-500/30'
                        : 'border-slate-200 hover:bg-slate-50 text-slate-600'
                    }`}
                  >
                    <div className="flex items-center gap-1.5 mb-1 text-slate-900">
                      <Truck className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="font-bold">Otros Estados</span>
                    </div>
                    <p className="text-[10px] text-slate-500 leading-tight">Zoom, MRW o Tealca</p>
                  </button>
                </div>

                {/* Retiro en Tienda Info */}
                {deliveryType === 'RETIRO_TIENDA' && (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-3 text-[11px] text-slate-600 space-y-1">
                    <p className="font-bold text-slate-800">
                      📍 Punto de retiro oficial en Mérida:
                    </p>
                    <p>{settings.address}</p>
                    <p className="text-[10px] text-slate-500">
                      Horario: Lunes a Sábado de 8:00 AM a 5:30 PM. Retiro inmediato tras confirmar tu pago.
                    </p>
                  </div>
                )}

                {/* Delivery Local en Mérida */}
                {deliveryType === 'DOMICILIO' && (
                  <div className="space-y-2.5 pt-2 border-t border-slate-100">
                    <p className="text-[11px] font-bold text-slate-800 flex items-center gap-1">
                      <span>🛵 Entrega a Domicilio en Mérida</span>
                    </p>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Dirección exacta de entrega en Mérida *
                      </label>
                      <input
                        type="text"
                        required
                        value={address}
                        onChange={(e) => setAddress(e.target.value)}
                        placeholder="Ej. Sector Campo de Oro, Calle 3, Res. Los Andes, Apto 2-B"
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
                      />
                    </div>
                  </div>
                )}

                {/* Envíos Nacionales a Otros Estados (MRW, Zoom, Tealca) */}
                {deliveryType === 'ENVIO_NACIONAL' && (
                  <div className="space-y-3 pt-2 border-t border-slate-100">
                    <div>
                      <label className="block text-[11px] font-bold text-slate-900 mb-1.5">
                        Selecciona la Empresa de Encomienda:
                      </label>
                      <div className="grid grid-cols-3 gap-2">
                        {/* ZOOM */}
                        <button
                          type="button"
                          onClick={() => setShippingAgency('ZOOM')}
                          className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                            shippingAgency === 'ZOOM'
                              ? 'border-amber-500 bg-amber-50 text-slate-950 font-bold shadow-xs ring-1 ring-amber-400'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="inline-block px-2 py-0.5 rounded bg-blue-900 text-amber-400 font-black text-xs tracking-wider mb-1">
                            ZOOM
                          </div>
                          <p className="text-[10px] text-slate-500">Cobro en Destino</p>
                        </button>

                        {/* MRW */}
                        <button
                          type="button"
                          onClick={() => setShippingAgency('MRW')}
                          className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                            shippingAgency === 'MRW'
                              ? 'border-rose-500 bg-rose-50 text-slate-950 font-bold shadow-xs ring-1 ring-rose-400'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="inline-block px-2 py-0.5 rounded bg-slate-900 text-rose-500 font-black text-xs tracking-wider mb-1">
                            MRW
                          </div>
                          <p className="text-[10px] text-slate-500">Cobro en Destino</p>
                        </button>

                        {/* TEALCA */}
                        <button
                          type="button"
                          onClick={() => setShippingAgency('TEALCA')}
                          className={`p-2.5 rounded-xl border text-center transition-all cursor-pointer ${
                            shippingAgency === 'TEALCA'
                              ? 'border-cyan-600 bg-cyan-50 text-slate-950 font-bold shadow-xs ring-1 ring-cyan-500'
                              : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                          }`}
                        >
                          <div className="inline-block px-2 py-0.5 rounded bg-blue-950 text-cyan-400 font-black text-xs tracking-wider mb-1">
                            TEALCA
                          </div>
                          <p className="text-[10px] text-slate-500">Cobro en Destino</p>
                        </button>
                      </div>
                    </div>

                    {/* Estado y Ciudad de destino */}
                    <div className="grid grid-cols-2 gap-2">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Estado de Destino *
                        </label>
                        <select
                          value={selectedState}
                          onChange={(e) => {
                            const newState = e.target.value;
                            setSelectedState(newState);
                            const loc = VENEZUELA_LOCATIONS.find((l) => l.state === newState);
                            if (loc && loc.cities.length > 0) {
                              setSelectedCity(loc.cities[0]);
                            }
                          }}
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 font-medium"
                        >
                          {VENEZUELA_LOCATIONS.map((loc) => (
                            <option key={loc.state} value={loc.state}>
                              {loc.state}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div>
                        <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                          Ciudad / Zona *
                        </label>
                        <select
                          value={selectedCity}
                          onChange={(e) => setSelectedCity(e.target.value)}
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 font-medium"
                        >
                          {availableCities.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>

                    {/* Dirección o código de agencia */}
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                        Dirección o Nombre de la Agencia {shippingAgency} *
                      </label>
                      <input
                        type="text"
                        required
                        value={agencyAddress}
                        onChange={(e) => setAgencyAddress(e.target.value)}
                        placeholder={`Ej. Agencia ${shippingAgency} Centro, Av. Bolívar cruce con Calle 10`}
                        className="w-full text-xs p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
                      />
                    </div>

                    {/* Datos del Destinatario (Requeridos por la agencia para retiro) */}
                    <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[11px] font-bold text-slate-900 flex items-center gap-1">
                          <User className="w-3.5 h-3.5 text-amber-600" />
                          <span>Datos de quien retira en la Agencia {shippingAgency}</span>
                        </span>
                        <button
                          type="button"
                          onClick={handleUseCustomerDataForShipping}
                          className="text-[10px] font-bold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
                        >
                          Usar mis datos
                        </button>
                      </div>

                      <div>
                        <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                          Nombre y Apellido de quien retira *
                        </label>
                        <input
                          type="text"
                          required
                          value={recipientName}
                          onChange={(e) => setRecipientName(e.target.value)}
                          placeholder="Ej. Carlos Eduardo Mendoza"
                          className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white"
                        />
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            Cédula de Identidad *
                          </label>
                          <input
                            type="text"
                            required
                            value={recipientDocument}
                            onChange={(e) => setRecipientDocument(e.target.value)}
                            placeholder="Ej. V-18.456.789"
                            className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white font-mono"
                          />
                        </div>

                        <div>
                          <label className="block text-[10px] font-semibold text-slate-600 mb-0.5">
                            Teléfono de contacto *
                          </label>
                          <input
                            type="tel"
                            required
                            value={recipientPhone}
                            onChange={(e) => setRecipientPhone(e.target.value)}
                            placeholder="Ej. 0412-1234567"
                            className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-white font-mono"
                          />
                        </div>
                      </div>

                      <p className="text-[10px] text-slate-500">
                        📦 El paquete se enviará con flete a cobro en destino a nombre del titular indicado arriba.
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Form Validation Error Banner */}
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 rounded-xl text-xs text-rose-800 flex items-start gap-2 animate-in fade-in">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
                  <div className="flex-1">
                    <p className="font-bold">Faltan datos requeridos</p>
                    <p className="text-[11px] mt-0.5">{formError}</p>
                  </div>
                </div>
              )}

              {/* Payment Methods Venezuela */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs space-y-3">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">
                    Forma de Pago
                  </h3>
                  <span className="text-[10px] text-emerald-700 font-bold bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                    Tasa BCV: Bs. {settings.bcvRate.toFixed(2)}
                  </span>
                </div>

                <div className="space-y-1.5">
                  {(['Pago Móvil', 'Dólares Efectivo (USD)', 'Transferencia Bancaria Bs', 'Binance Pay (USDT)'] as PaymentMethod[]).map((method) => (
                    <label
                      key={method}
                      className={`flex items-center justify-between p-2.5 rounded-lg border text-xs cursor-pointer transition-colors ${
                        paymentMethod === method
                          ? 'border-amber-600 bg-amber-50/40 text-slate-900 font-semibold'
                          : 'border-slate-200 hover:bg-slate-50 text-slate-700'
                      }`}
                    >
                      <div className="flex items-center gap-2">
                        <input
                          type="radio"
                          name="paymentMethod"
                          value={method}
                          checked={paymentMethod === method}
                          onChange={() => setPaymentMethod(method)}
                          className="text-amber-600 focus:ring-amber-500"
                        />
                        <span>{method}</span>
                      </div>
                    </label>
                  ))}
                </div>

                {/* Direct Bank Details for the chosen method */}
                <div className="bg-slate-100 p-3 rounded-lg border border-slate-200 text-xs space-y-2">
                  <p className="font-semibold text-slate-800 text-[11px]">
                    Datos para cancelar con {paymentMethod}:
                  </p>

                  {paymentMethod === 'Pago Móvil' && (
                    <div className="bg-white p-3 rounded-lg border border-slate-200 space-y-3">
                      <div className="flex flex-col sm:flex-row items-center gap-3">
                        <div className="shrink-0 text-center">
                          <img
                            src={settings.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg'}
                            alt="QR Pago Móvil"
                            className="w-28 sm:w-24 h-auto object-contain rounded-lg border border-slate-200 shadow-2xs mx-auto"
                          />
                          <span className="text-[10px] text-slate-500 font-medium block mt-1">Escanea y paga</span>
                        </div>
                        <div className="flex-1 w-full space-y-1.5 text-xs">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Banco:</span>
                            <span className="font-bold text-slate-900">{settings.bankDetails.pagoMovilBank}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Celular:</span>
                            <div className="flex items-center gap-1">
                              <span className="font-mono font-bold text-slate-900">{settings.bankDetails.pagoMovilPhone}</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(settings.bankDetails.pagoMovilPhone, 'pmPhone')}
                                className="text-[10px] bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded border border-slate-200 cursor-pointer"
                              >
                                {copiedBank === 'pmPhone' ? '✓' : 'Copiar'}
                              </button>
                            </div>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-500">Identificación:</span>
                            <div className="flex items-center gap-1">
                              <span className="font-mono font-bold text-slate-900">{settings.bankDetails.pagoMovilId}</span>
                              <button
                                type="button"
                                onClick={() => handleCopy(settings.bankDetails.pagoMovilId, 'pmId')}
                                className="text-[10px] bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded border border-slate-200 cursor-pointer"
                              >
                                {copiedBank === 'pmId' ? '✓' : 'Copiar'}
                              </button>
                            </div>
                          </div>
                        </div>
                      </div>

                      <div className="pt-2 border-t border-slate-100 flex justify-between items-center">
                        <span className="text-slate-500 text-xs">Monto exacto a transferir:</span>
                        <div className="flex items-center gap-1.5">
                          <span className="font-mono font-extrabold text-emerald-700 text-sm">
                            {formatBs(cartTotalBs)}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleCopy(cartTotalBs.toFixed(2), 'montoBs')}
                            className="text-[10px] bg-slate-100 hover:bg-slate-200 px-1.5 py-0.5 rounded border border-slate-200 font-medium cursor-pointer"
                          >
                            {copiedBank === 'montoBs' ? 'Copiado' : 'Copiar'}
                          </button>
                        </div>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'Transferencia Bancaria Bs' && (
                    <div className="space-y-1.5 bg-white p-2.5 rounded border border-slate-200 text-[11px]">
                      <div className="flex justify-between">
                        <span className="text-slate-500">Banco:</span>
                        <span className="font-bold">{settings.bankDetails.bankTransferName}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Cuenta:</span>
                        <span className="font-mono font-bold">{settings.bankDetails.bankTransferAccount}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">RIF:</span>
                        <span className="font-mono">{settings.bankDetails.bankTransferRif}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-slate-500">Titular:</span>
                        <span>{settings.bankDetails.bankTransferHolder}</span>
                      </div>
                      <div className="pt-1 border-t border-slate-100 flex justify-between font-bold text-emerald-700">
                        <span>Total en Bs:</span>
                        <span>{formatBs(cartTotalBs)}</span>
                      </div>
                    </div>
                  )}

                  {paymentMethod === 'Binance Pay (USDT)' && (
                    <div className="bg-white p-2.5 rounded border border-slate-200 text-[11px] space-y-1">
                      <p><span className="text-slate-500">Binance Pay ID:</span> <strong className="font-mono">{settings.bankDetails.binancePayId || '66195935'}</strong></p>
                      <p className="text-amber-700 pt-1 border-t border-slate-100 font-bold">Monto a transferir: {formatUSD(cartTotal)} USDT</p>
                    </div>
                  )}

                  {paymentMethod === 'Dólares Efectivo (USD)' && (
                    <p className="text-slate-600 bg-white p-2 rounded border border-slate-200 text-[11px]">
                      Puedes pagar en efectivo al momento de retirar en nuestra tienda o contraentrega al motorizado ({formatUSD(cartTotal)}). Billetes sin roturas.
                    </p>
                  )}

                  {paymentMethod !== 'Dólares Efectivo (USD)' && (
                    <div>
                      <label className="block text-[10px] font-semibold text-slate-600 mb-1">
                        Número de Referencia / Comprobante:
                      </label>
                      <input
                        type="text"
                        value={paymentProofRef}
                        onChange={(e) => setPaymentProofRef(e.target.value)}
                        placeholder="Ej. Últimos 6 dígitos de la referencia"
                        className="w-full text-xs p-2 rounded border border-slate-300 bg-white font-mono"
                      />
                    </div>
                  )}
                </div>

                <div>
                  <label className="block text-[11px] font-semibold text-slate-700 mb-1">
                    Notas adicionales (Opcional):
                  </label>
                  <textarea
                    rows={2}
                    value={notes}
                    onChange={(e) => setNotes(e.target.value)}
                    placeholder="Instrucciones para el motorizado o detalles de tu moto..."
                    className="w-full text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white"
                  />
                </div>
              </div>
            </form>
          )}

          {step === 'success' && (
            <div className="h-full flex flex-col items-center justify-center text-center p-6 text-slate-600">
              <div className="w-16 h-16 rounded-full bg-emerald-100 text-emerald-600 flex items-center justify-center mb-4">
                <CheckCircle2 className="w-10 h-10" />
              </div>
              <h3 className="text-xl font-bold font-display text-slate-900">
                ¡Pedido #{completedOrderCode} Registrado!
              </h3>
              <p className="text-xs text-slate-600 mt-2 max-w-sm leading-relaxed">
                El stock se ha reservado en nuestro sistema. Por favor confirma tu pedido enviando el comprobante por WhatsApp a nuestra tienda.
              </p>

              <div className="mt-6 w-full space-y-2">
                <button
                  onClick={handleResetDrawer}
                  className="w-full py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl shadow-md transition-colors flex items-center justify-center gap-2 cursor-pointer"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Enviar Confirmación a WhatsApp</span>
                </button>
                <button
                  onClick={handleResetDrawer}
                  className="w-full py-2.5 text-xs text-slate-600 hover:text-slate-900 font-medium cursor-pointer"
                >
                  Seguir Comprando
                </button>
              </div>
            </div>
          )}
        </div>

        {/* Footer actions with dual amount */}
        {step !== 'success' && cart.length > 0 && (
          <div className="p-4 sm:p-5 border-t border-slate-200 bg-white">
            {cartWholesaleDiscount > 0 && (
              <div className="mb-3 pb-2.5 border-b border-slate-100 space-y-1 text-xs">
                <div className="flex items-center justify-between text-slate-500">
                  <span>Subtotal regular:</span>
                  <span className="font-mono tabular-nums line-through">
                    {formatUSD(cartSubtotalBeforeDiscount)}
                  </span>
                </div>
                <div className="flex items-center justify-between text-emerald-700 font-bold">
                  <span>Descuento al mayor:</span>
                  <span className="font-mono tabular-nums">
                    -{formatUSD(cartWholesaleDiscount)}
                  </span>
                </div>
              </div>
            )}
            <div className="flex items-center justify-between mb-4">
              <div>
                <span className="text-xs text-slate-500 font-medium block">Total de la Orden:</span>
                <span className="text-[11px] text-emerald-700 font-semibold font-mono">
                  Tasa BCV: Bs. {settings.bcvRate.toFixed(2)}
                </span>
              </div>
              <div className="text-right">
                <span className="text-xl font-extrabold text-slate-950 font-mono tabular-nums block">
                  {formatUSD(cartTotal)}
                </span>
                <span className="text-sm font-bold text-emerald-700 font-mono tabular-nums block">
                  {formatBs(cartTotalBs)}
                </span>
              </div>
            </div>

            {step === 'cart' ? (
              <button
                onClick={() => setStep('checkout')}
                className="w-full py-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 cursor-pointer shadow-md shadow-amber-500/20"
              >
                <span>Continuar al Pago</span>
                <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setStep('cart')}
                  className="px-4 py-3 border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl transition-colors"
                >
                  Volver
                </button>
                <button
                  form="checkout-form"
                  type="submit"
                  className="flex-1 py-3 bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs rounded-xl transition-colors flex items-center justify-center gap-2 shadow-md cursor-pointer"
                >
                  <CheckCircle2 className="w-4 h-4" />
                  <span>Confirmar Pedido y Enviar a WhatsApp</span>
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
