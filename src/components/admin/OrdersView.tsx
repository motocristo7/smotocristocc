import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import { OnlineOrderStatus, OnlineOrder } from '../../types';
import { formatUSD, formatBs, sanitizePhone } from '../../utils/whatsapp';
import {
  ShoppingBag,
  Search,
  MessageSquare,
  Clock,
  CheckCircle2,
  XCircle,
  Truck,
  Package,
  MapPin,
  Phone,
  Filter,
} from 'lucide-react';

export const OrdersView: React.FC = () => {
  const { onlineOrders, updateOrderStatus, settings, setWhatsappModalData } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [orderToCancel, setOrderToCancel] = useState<OnlineOrder | null>(null);

  const rate = settings.bcvRate;

  const filteredOrders = onlineOrders.filter((order) => {
    if (statusFilter !== 'all' && order.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const q = searchTerm.toLowerCase();
      return (
        order.orderCode.toLowerCase().includes(q) ||
        order.customerName.toLowerCase().includes(q) ||
        order.customerPhone.includes(q)
      );
    }
    return true;
  });

  const handleNotifyCustomer = (order: OnlineOrder) => {
    const orderRate = order.bcvRate || rate;
    const totalBs = order.totalBs || order.total * orderRate;
    let statusText = '';
    switch (order.status) {
      case 'PENDIENTE_PAGO':
        statusText = 'hemos recibido tu orden y estamos a la espera de la confirmación del Pago Móvil o transferencia';
        break;
      case 'CONFIRMADO':
      case 'EN_ALISTAMIENTO':
        statusText = 'tu pago ha sido verificado y tus repuestos ya están en alistamiento y empaque';
        break;
      case 'LISTO_ENTREGA':
        if (order.deliveryType === 'ENVIO_NACIONAL') {
          statusText = `tu encomienda ha sido alistada y entregada a la agencia ${order.shippingAgency || 'de encomienda'} para su traslado a ${order.customerCity || 'tu ciudad'}`;
        } else if (order.deliveryType === 'DOMICILIO') {
          statusText = 'tu pedido va en camino a tu dirección en Mérida con nuestro mensajero motorizado';
        } else {
          statusText = `tu pedido ya está listo para que lo retires en nuestra sede en ${settings.city}`;
        }
        break;
      case 'ENTREGADO':
        statusText = 'tu pedido ha sido entregado exitosamente. ¡Gracias por confiar en Servimotos Venezuela!';
        break;
      case 'CANCELADO':
        statusText = 'tu pedido ha sido cancelado y el stock se ha reintegrado al sistema';
        break;
    }

    const message = `Hola *${order.customerName}*, te informamos de *${settings.commercialName}* sobre tu pedido *#${order.orderCode}*:\n\nℹ️ ${statusText}.\n\nTotal: ${formatUSD(order.total)} (${formatBs(totalBs)} a tasa BCV Bs. ${orderRate.toFixed(2)})\nSi tienes alguna duda escríbenos directamente por aquí. ¡Buenas rutas! 🏍️💨`;
    const url = `https://api.whatsapp.com/send?phone=${sanitizePhone(order.customerPhone)}&text=${encodeURIComponent(message)}`;

    setWhatsappModalData({
      title: `Notificar Pedido #${order.orderCode}`,
      message,
      url,
      phone: order.customerPhone,
      recipientName: order.customerName,
    });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
            Canal de Venta Digital
          </span>
          <h1 className="text-2xl font-bold font-display text-slate-900 mt-0.5">
            Pedidos Recibidos de la Tienda Online
          </h1>
          <p className="text-xs text-slate-500">
            Control de órdenes digitales realizadas por clientes, verificación de pagos por Nequi/Daviplata/Bancos y actualización de despacho.
          </p>
        </div>
      </div>

      {/* Filter toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por código de pedido (ej. PED-4821), nombre o celular..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 font-medium"
            >
              <option value="all">Todos los estados ({onlineOrders.length})</option>
              <option value="PENDIENTE_PAGO">Pendiente de Pago</option>
              <option value="EN_ALISTAMIENTO">En Alistamiento</option>
              <option value="LISTO_ENTREGA">Listo / En Camino</option>
              <option value="ENTREGADO">Entregado</option>
              <option value="CANCELADO">Cancelado</option>
            </select>
          </div>
        </div>
      </div>

      {/* Orders List */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-400 text-xs">
            No se encontraron pedidos de la tienda online con los filtros seleccionados.
          </div>
        ) : (
          filteredOrders.map((order) => (
            <div
              key={order.id}
              className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs hover:border-slate-300 transition-colors"
            >
              <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
                    <ShoppingBag className="w-5 h-5" />
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-sm bg-slate-900 text-white px-2 py-0.5 rounded">
                        {order.orderCode}
                      </span>
                      <span className="font-bold text-slate-900 text-sm">{order.customerName}</span>
                      <span className="text-slate-400">·</span>
                      <span className="text-xs text-slate-500 font-mono">
                        {new Date(order.createdAt).toLocaleString('es-CO', { dateStyle: 'short', timeStyle: 'short' })}
                      </span>
                    </div>

                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-500 mt-1">
                      <span className="font-mono text-slate-700 flex items-center gap-1">
                        <Phone className="w-3.5 h-3.5" />
                        {order.customerPhone}
                      </span>
                      <span>·</span>
                      <span className="font-semibold text-emerald-700">Pago: {order.paymentMethod}</span>
                      {order.paymentProofReference && (
                        <span className="bg-slate-100 px-2 py-0.5 rounded font-mono text-[11px]">
                          Ref: {order.paymentProofReference}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Status Switcher & WhatsApp Notify */}
                <div className="flex flex-wrap items-center gap-3">
                  <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                    <button
                      onClick={() => updateOrderStatus(order.id, 'PENDIENTE_PAGO')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                        order.status === 'PENDIENTE_PAGO'
                          ? 'bg-amber-500 text-slate-950 font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Pend. Pago
                    </button>
                    <button
                      onClick={() => updateOrderStatus(order.id, 'EN_ALISTAMIENTO')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                        order.status === 'EN_ALISTAMIENTO'
                          ? 'bg-blue-600 text-white font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Alistamiento
                    </button>
                    <button
                      onClick={() => updateOrderStatus(order.id, 'LISTO_ENTREGA')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                        order.status === 'LISTO_ENTREGA'
                          ? 'bg-emerald-600 text-white font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Listo / En camino
                    </button>
                    <button
                      onClick={() => updateOrderStatus(order.id, 'ENTREGADO')}
                      className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                        order.status === 'ENTREGADO'
                          ? 'bg-slate-800 text-white font-bold shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Entregado
                    </button>
                    <button
                      onClick={() => setOrderToCancel(order)}
                      className={`px-2 py-1 text-[11px] rounded-md transition-colors cursor-pointer ${
                        order.status === 'CANCELADO'
                          ? 'bg-rose-600 text-white font-bold'
                          : 'text-rose-600 hover:bg-rose-50'
                      }`}
                      title="Cancelar pedido"
                    >
                      Cancelar
                    </button>
                  </div>

                  <button
                    onClick={() => handleNotifyCustomer(order)}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                  >
                    <MessageSquare className="w-3.5 h-3.5" />
                    <span>WhatsApp Cliente</span>
                  </button>
                </div>
              </div>

              {/* Items & Delivery Details */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-4 text-xs">
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Repuestos del Pedido
                  </span>
                  <div className="space-y-1 bg-slate-50 p-3 rounded-lg border border-slate-100">
                    {order.items.map((item, idx) => (
                      <div key={idx} className="flex justify-between gap-2 text-slate-700">
                        <div className="min-w-0">
                          <span>
                            <strong className="font-mono text-slate-900">{item.quantity}x</strong> {item.name}
                          </span>
                          {item.wholesaleDiscountPct && item.wholesaleDiscountPct > 0 && (
                            <span className="ml-1.5 text-[10px] font-mono font-bold text-emerald-700">
                              (-{item.wholesaleDiscountPct}% mayor)
                            </span>
                          )}
                        </div>
                        <div className="text-right shrink-0">
                          <span className="font-mono block tabular-nums">{formatUSD(item.total)}</span>
                          <span className="font-mono text-[10px] text-emerald-700 block tabular-nums">{formatBs(item.total * (order.bcvRate || rate))}</span>
                        </div>
                      </div>
                    ))}
                    {order.wholesaleDiscountTotal && order.wholesaleDiscountTotal > 0 && (
                      <div className="pt-1.5 border-t border-slate-200 space-y-0.5 text-[11px]">
                        <div className="flex justify-between text-slate-500">
                          <span>Subtotal regular:</span>
                          <span className="font-mono tabular-nums line-through">
                            {formatUSD(order.subtotalBeforeDiscount || order.total + order.wholesaleDiscountTotal)}
                          </span>
                        </div>
                        <div className="flex justify-between text-emerald-700 font-bold">
                          <span>Descuento al mayor:</span>
                          <span className="font-mono tabular-nums">
                            -{formatUSD(order.wholesaleDiscountTotal)}
                          </span>
                        </div>
                      </div>
                    )}
                    <div className="pt-2 border-t border-slate-200 flex justify-between font-bold text-slate-950 text-sm">
                      <span>Total:</span>
                      <div className="text-right">
                        <span className="font-mono block tabular-nums">{formatUSD(order.total)}</span>
                        <span className="font-mono text-xs text-emerald-700 block tabular-nums">{formatBs(order.totalBs || order.total * (order.bcvRate || rate))}</span>
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block mb-1">
                    Información de Despacho y Entrega
                  </span>
                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 space-y-2">
                    {order.deliveryType === 'ENVIO_NACIONAL' ? (
                      <div className="space-y-1.5">
                        <div className="flex items-center gap-2">
                          <span className="text-xs font-bold text-slate-900 flex items-center gap-1">
                            <Truck className="w-3.5 h-3.5 text-amber-600" />
                            Envío Nacional:
                          </span>
                          <span
                            className={`px-2 py-0.5 rounded text-[11px] font-black tracking-wide ${
                              order.shippingAgency === 'ZOOM'
                                ? 'bg-blue-900 text-amber-400 border border-blue-950'
                                : order.shippingAgency === 'MRW'
                                ? 'bg-slate-900 text-rose-500 border border-slate-950'
                                : 'bg-blue-950 text-cyan-400 border border-blue-900'
                            }`}
                          >
                            {order.shippingAgency || 'MRW'}
                          </span>
                          <span className="text-[11px] text-slate-500">(Cobro en Destino)</span>
                        </div>

                        {order.agencyAddress && (
                          <div className="text-slate-700 text-xs flex items-start gap-1">
                            <MapPin className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                            <span>
                              <strong>Agencia:</strong> {order.agencyAddress}
                              {order.customerCity && `, ${order.customerCity}`}
                              {order.customerState && ` (${order.customerState})`}
                            </span>
                          </div>
                        )}

                        <div className="bg-white p-2 rounded border border-slate-200 text-[11px] space-y-0.5">
                          <p className="font-semibold text-slate-800">
                            👤 <strong>Destinatario:</strong> {order.recipientName || order.customerName}
                          </p>
                          <p className="text-slate-600 font-mono">
                            🆔 <strong>Cédula:</strong> {order.recipientDocument || 'No especificada'}
                          </p>
                          <p className="text-slate-600 font-mono">
                            📱 <strong>Teléfono:</strong> {order.recipientPhone || order.customerPhone}
                          </p>
                        </div>
                      </div>
                    ) : order.deliveryType === 'DOMICILIO' ? (
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-800 flex items-center gap-1">
                          <Truck className="w-3.5 h-3.5 text-amber-600" />
                          <span>Delivery Local en Mérida</span>
                        </p>
                        {order.customerAddress && (
                          <p className="text-slate-600 flex items-start gap-1">
                            <MapPin className="w-3.5 h-3.5 mt-0.5 text-slate-400 shrink-0" />
                            <span>{order.customerAddress}, {order.customerCity}</span>
                          </p>
                        )}
                      </div>
                    ) : (
                      <div className="space-y-1">
                        <p className="font-semibold text-slate-800 flex items-center gap-1">
                          <span>🏬 Retiro en Sede (Mérida)</span>
                        </p>
                        <p className="text-slate-500 text-[11px]">
                          Sede Mérida: {settings.address}
                        </p>
                      </div>
                    )}

                    {order.notes && (
                      <p className="text-slate-500 italic pt-1 border-t border-slate-200">
                        Notas del cliente: {order.notes}
                      </p>
                    )}
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>

      {/* Cancel Order Confirmation Modal */}
      {orderToCancel && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-4 sm:p-5 bg-rose-50 border-b border-rose-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                <XCircle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base font-display text-slate-900">
                  ¿Cancelar pedido {orderToCancel.orderCode}?
                </h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  El stock de los repuestos se reintegrará al inventario.
                </p>
              </div>
            </div>

            <div className="p-5 space-y-3 text-xs text-slate-600">
              <p>
                Cliente: <span className="font-semibold text-slate-900">{orderToCancel.customerName}</span> ({orderToCancel.customerPhone})
              </p>
              <div className="p-3 bg-slate-50 rounded-xl border border-slate-200">
                <span className="font-bold text-slate-800 block mb-1">Repuestos incluidos:</span>
                <ul className="space-y-1">
                  {orderToCancel.items.map((it) => (
                    <li key={it.productId || it.sku || it.name} className="flex justify-between text-slate-700">
                      <span>• {it.name}</span>
                      <span className="font-mono font-bold">x{it.quantity}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setOrderToCancel(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Volver
              </button>
              <button
                type="button"
                onClick={() => {
                  updateOrderStatus(orderToCancel.id, 'CANCELADO');
                  setOrderToCancel(null);
                }}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <span>Sí, cancelar pedido</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
