import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { formatUSD, formatBs, sanitizePhone, buildInvoiceWhatsAppMessage, buildServiceStatusWhatsAppMessage } from '../../utils/whatsapp';
import { ServiceOrderStatus, Sale, ServiceOrder } from '../../types';
import { downloadInvoicePDF, downloadServiceOrderPDF } from '../../utils/pdfInvoice';
import {
  Search,
  Phone,
  FileText,
  Wrench,
  Clock,
  CheckCircle2,
  Calendar,
  MessageSquare,
  ShieldCheck,
  Eye,
  AlertCircle,
  Sparkles,
  ArrowRight,
  TrendingUp,
  FileDown,
  CreditCard,
} from 'lucide-react';

export const CustomerPortal: React.FC = () => {
  const {
    sales,
    serviceOrders,
    customers,
    settings,
    trackedPhone,
    setTrackedPhone,
    setSelectedInvoice,
    setWhatsappModalData,
    setCurrentView,
    currentUser,
    openAuthModal,
  } = useApp();

  const [inputPhone, setInputPhone] = useState(
    trackedPhone || currentUser?.phone || currentUser?.documentId || ''
  );
  const [activeTab, setActiveTab] = useState<'servicios' | 'ventas' | 'cuentas'>('servicios');

  useEffect(() => {
    if (currentUser?.phone) {
      setInputPhone(currentUser.phone);
    } else if (currentUser?.documentId) {
      setInputPhone(currentUser.documentId);
    } else if (trackedPhone) {
      setInputPhone(trackedPhone);
    }
  }, [currentUser, trackedPhone]);

  const cleanSearch = inputPhone.replace(/\D/g, '');
  const cleanSearchAlnum = inputPhone.trim().toLowerCase().replace(/[^a-z0-9]/g, '');

  const matchedCustomer = useMemo(() => {
    if (!cleanSearch && !cleanSearchAlnum) return null;
    return customers.find((c) => {
      const p = c.phone.replace(/\D/g, '');
      const docDigits = (c.documentId || '').replace(/\D/g, '');
      const docAlnum = (c.documentId || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      if (cleanSearch && p && (p.includes(cleanSearch) || cleanSearch.includes(p))) return true;
      if (cleanSearch.length >= 5 && docDigits && docDigits === cleanSearch) return true;
      if (cleanSearchAlnum && docAlnum && docAlnum === cleanSearchAlnum) return true;
      return false;
    });
  }, [customers, cleanSearch, cleanSearchAlnum]);

  const matchingSales = useMemo(() => {
    if (!cleanSearch && !inputPhone.trim()) return [];
    const matchedCustPhone = (matchedCustomer?.phone || '').replace(/\D/g, '');
    return sales.filter((s) => {
      if (matchedCustomer && s.customerId && s.customerId === matchedCustomer.id) return true;
      const p = s.customerPhone.replace(/\D/g, '');
      const docAlnum = (s.customerDocument || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const docDigits = (s.customerDocument || '').replace(/\D/g, '');
      return (
        (cleanSearch && p && (p.includes(cleanSearch) || cleanSearch.includes(p))) ||
        (matchedCustPhone && p && (p.includes(matchedCustPhone) || matchedCustPhone.includes(p))) ||
        (cleanSearch.length >= 5 && docDigits && docDigits === cleanSearch) ||
        (cleanSearchAlnum && docAlnum.includes(cleanSearchAlnum))
      );
    });
  }, [sales, matchedCustomer, cleanSearch, cleanSearchAlnum, inputPhone]);

  const matchingPendingSales = useMemo(() => {
    return matchingSales.filter((s) => {
      if (s.paymentType !== 'CREDITO' && s.paymentType !== 'APARTADO') return false;
      if (s.isVoided || s.creditStatus === 'PAGADO' || s.creditStatus === 'ANULADO') return false;
      return Math.max(0, s.total - (s.creditPaidAmount || 0)) > 0.01;
    });
  }, [matchingSales]);

  const matchingServices = useMemo(() => {
    if (!cleanSearch && !inputPhone.trim()) return [];
    return serviceOrders.filter((ord) => {
      if (matchedCustomer && ord.customerId && ord.customerId === matchedCustomer.id) return true;
      const p = ord.customerPhone.replace(/\D/g, '');
      const docAlnum = (ord.customerDocument || '').toLowerCase().replace(/[^a-z0-9]/g, '');
      const docDigits = (ord.customerDocument || '').replace(/\D/g, '');
      const plate = ord.motorcycle.plate.toLowerCase().replace(/[^a-z0-9]/g, '');

      return (
        (cleanSearch && p && (p.includes(cleanSearch) || cleanSearch.includes(p))) ||
        (cleanSearch.length >= 5 && docDigits && docDigits === cleanSearch) ||
        (cleanSearchAlnum && (plate.includes(cleanSearchAlnum) || docAlnum.includes(cleanSearchAlnum)))
      );
    });
  }, [serviceOrders, matchedCustomer, cleanSearch, cleanSearchAlnum, inputPhone]);

  const handleQuickLookup = (phone: string) => {
    setInputPhone(phone);
    setTrackedPhone(phone);
  };

  const handleShareInvoiceWhatsApp = (sale: Sale) => {
    const { message, url } = buildInvoiceWhatsAppMessage(sale, settings);
    setWhatsappModalData({
      title: `Factura #${sale.invoiceNumber}`,
      message,
      url,
      phone: sale.customerPhone,
      recipientName: sale.customerName,
      sale,
    });
  };

  const handleShareServiceWhatsApp = (order: ServiceOrder) => {
    const { message, url } = buildServiceStatusWhatsAppMessage(order, settings);
    setWhatsappModalData({
      title: `Estado Servicio #${order.orderNumber}`,
      message,
      url,
      phone: order.customerPhone,
      recipientName: order.customerName,
    });
  };

  const getStatusBadge = (status: ServiceOrderStatus) => {
    switch (status) {
      case 'CREADA':
        return {
          label: 'En Espera de Turno',
          bg: 'bg-amber-100 text-amber-800 border-amber-300',
          dot: 'bg-amber-500',
          step: 1,
        };
      case 'EN_PROCESO':
        return {
          label: 'En Proceso en Taller',
          bg: 'bg-blue-100 text-blue-800 border-blue-300',
          dot: 'bg-blue-500',
          step: 2,
        };
      case 'CULMINADA':
        return {
          label: '¡Listo para Entrega!',
          bg: 'bg-emerald-100 text-emerald-800 border-emerald-300',
          dot: 'bg-emerald-500',
          step: 3,
        };
      case 'ENTREGADA':
        return {
          label: 'Entregado a Satisfacción',
          bg: 'bg-slate-100 text-slate-800 border-slate-300',
          dot: 'bg-slate-500',
          step: 4,
        };
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 py-10">
      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8">
        {/* Title */}
        <div className="text-center max-w-2xl mx-auto mb-8">
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
            Portal de Autoservicio para Clientes (Venezuela)
          </span>
          <h1 className="text-2xl sm:text-4xl font-extrabold font-display text-slate-900 mt-1">
            Consulta tus Facturas y Estado de tu Moto
          </h1>
          <p className="text-xs sm:text-sm text-slate-600 mt-2 leading-relaxed">
            Ingresa tu celular registrado en Venezuela o la placa de tu moto para ver tus facturas con montos en <strong>Dólares ($ USD)</strong> y en <strong>Bolívares (Bs.) a tasa oficial BCV</strong>.
          </p>
        </div>

        {/* User Account Banner */}
        {currentUser ? (
          <div className="bg-amber-50 border border-amber-200 rounded-2xl p-4 mb-6 max-w-2xl mx-auto flex items-center justify-between gap-4">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-amber-500 text-slate-950 font-black flex items-center justify-center shrink-0">
                {currentUser.name.charAt(0).toUpperCase()}
              </div>
              <div className="min-w-0">
                <p className="text-xs font-bold text-slate-900 truncate">
                  Bienvenido, {currentUser.name}
                </p>
                <p className="text-[11px] text-slate-600 truncate">
                  Cédula: {currentUser.documentId || 'No registrada'} · Cel: {currentUser.phone || 'No registrado'}
                </p>
              </div>
            </div>
            <span className="px-2.5 py-1 rounded-full text-[10px] font-bold bg-amber-200/80 text-amber-900 shrink-0">
              Perfil Activo
            </span>
          </div>
        ) : (
          <div className="bg-gradient-to-r from-slate-900 to-amber-950 text-white rounded-2xl p-4 mb-6 max-w-2xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 shadow-xs">
            <div className="text-center sm:text-left">
              <p className="text-xs font-bold text-white">¿Quieres consultar tus motos y pedidos más rápido?</p>
              <p className="text-[11px] text-slate-300">Crea tu cuenta de cliente con tu cédula y teléfono para acceder siempre sin escribir tu número.</p>
            </div>
            <button
              type="button"
              onClick={() => openAuthModal('register')}
              className="px-4 py-2 bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer shrink-0 whitespace-nowrap"
            >
              Registrarme Gratis
            </button>
          </div>
        )}

        {/* Search Box Card */}
        <div className="bg-white rounded-2xl border border-slate-200 p-6 shadow-xs max-w-2xl mx-auto mb-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              setTrackedPhone(inputPhone);
            }}
            className="flex flex-col sm:flex-row gap-3"
          >
            <div className="relative flex-1">
              <Phone className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={inputPhone}
                onChange={(e) => setInputPhone(e.target.value)}
                placeholder="Ingresa tu cédula (V-19996141), celular o placa..."
                className="w-full pl-10 pr-4 py-3 text-sm rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 font-mono transition-colors"
              />
            </div>
            <button
              type="submit"
              className="px-6 py-3 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer shrink-0"
            >
              <Search className="w-4 h-4" />
              <span>Consultar Historial</span>
            </button>
          </form>

          {/* Quick Demo Pre-fills for Testing Venezuela */}
          <div className="mt-4 pt-3 border-t border-slate-100 flex flex-wrap items-center gap-2 text-xs">
            <span className="text-slate-400 text-[11px] font-medium">Ejemplos de prueba:</span>
            <button
              type="button"
              onClick={() => handleQuickLookup('04141234567')}
              className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-mono cursor-pointer transition-colors"
            >
              Carlos R. (04141234567 / AE8C90G)
            </button>
            <button
              type="button"
              onClick={() => handleQuickLookup('04249876543')}
              className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-mono cursor-pointer transition-colors"
            >
              Valentina G. (04249876543 / AB1C24D)
            </button>
            <button
              type="button"
              onClick={() => handleQuickLookup('04125559812')}
              className="px-2.5 py-1 rounded-md bg-slate-100 hover:bg-slate-200 text-slate-700 text-[11px] font-mono cursor-pointer transition-colors"
            >
              Javier M. (04125559812 / AG4K81P)
            </button>
          </div>
        </div>

        {/* Results Section */}
        {cleanSearch || inputPhone.trim() ? (
          <div>
            {matchedCustomer && (
              <div className="bg-amber-50/70 border border-amber-200/80 rounded-xl p-4 mb-6 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] font-bold text-amber-800 uppercase tracking-wider">
                    Cliente Registrado en Servimotos Venezuela
                  </span>
                  <h3 className="text-base font-bold text-slate-900 mt-0.5">
                    {matchedCustomer.name}
                  </h3>
                  <p className="text-xs text-slate-600 font-mono">
                    Tel: {matchedCustomer.phone} {matchedCustomer.documentId && `· ${matchedCustomer.documentId}`} · {matchedCustomer.city || 'Caracas'}, {matchedCustomer.state || 'Distrito Capital'}
                  </p>
                </div>
                <div className="flex items-center gap-3 text-xs text-slate-600">
                  <div className="bg-white px-3 py-1.5 rounded-lg border border-amber-200 text-center">
                    <span className="block text-[10px] text-slate-400 uppercase font-medium">Facturas</span>
                    <span className="font-bold text-slate-900 font-mono">{matchingSales.length}</span>
                  </div>
                  <div className="bg-white px-3 py-1.5 rounded-lg border border-amber-200 text-center">
                    <span className="block text-[10px] text-slate-400 uppercase font-medium">Servicios Taller</span>
                    <span className="font-bold text-slate-900 font-mono">{matchingServices.length}</span>
                  </div>
                </div>
              </div>
            )}

            {/* Navigation Tabs */}
            <div className="flex border-b border-slate-200 mb-6 overflow-x-auto scrollbar-none">
              <button
                type="button"
                onClick={() => setActiveTab('servicios')}
                className={`flex items-center gap-2 py-3 px-4 sm:px-5 border-b-2 font-semibold text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'servicios'
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <Wrench className="w-4 h-4 shrink-0" />
                <span>Taller & Tapicería ({matchingServices.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('ventas')}
                className={`flex items-center gap-2 py-3 px-4 sm:px-5 border-b-2 font-semibold text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'ventas'
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <FileText className="w-4 h-4 shrink-0" />
                <span>Facturas de Compra ({matchingSales.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('cuentas')}
                className={`flex items-center gap-2 py-3 px-4 sm:px-5 border-b-2 font-semibold text-xs sm:text-sm transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                  activeTab === 'cuentas'
                    ? 'border-amber-600 text-amber-600'
                    : 'border-transparent text-slate-500 hover:text-slate-800'
                }`}
              >
                <CreditCard className="w-4 h-4 shrink-0" />
                <span>Cuentas por Pagar ({matchingPendingSales.length})</span>
              </button>
            </div>

            {/* Tab: Workshop Services */}
            {activeTab === 'servicios' && (
              <div className="space-y-6">
                {matchingServices.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                    <Wrench className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <h4 className="font-bold text-slate-800 text-sm">No hay órdenes de servicio registradas</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      No encontramos trabajos de mecánica o tapicería activos ni pasados con este número o placa.
                    </p>
                  </div>
                ) : (
                  matchingServices.map((order) => {
                    const statusInfo = getStatusBadge(order.status);
                    const rate = order.bcvRate || settings.bcvRate;
                    const totalBs = order.totalCostBs || order.totalCost * rate;

                    return (
                      <div
                        key={order.id}
                        className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:border-slate-300 transition-colors"
                      >
                        {/* Order Header */}
                        <div className="p-5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                          <div>
                            <div className="flex items-center gap-2 text-xs text-amber-400 font-mono">
                              <span>{order.orderNumber}</span>
                              <span>·</span>
                              <span>{new Date(order.createdAt).toLocaleDateString('es-VE', { dateStyle: 'long' })}</span>
                            </div>
                            <h3 className="text-lg font-bold font-display mt-0.5">
                              {order.serviceType}
                            </h3>
                          </div>

                          <div className="flex items-center gap-2">
                            <span className={`px-3 py-1 rounded-full text-xs font-bold border flex items-center gap-1.5 ${statusInfo.bg}`}>
                              <span className={`w-2 h-2 rounded-full ${statusInfo.dot}`} />
                              <span>{statusInfo.label}</span>
                            </span>
                            <button
                              onClick={() => handleShareServiceWhatsApp(order)}
                              className="p-1.5 bg-emerald-600 hover:bg-emerald-500 text-white rounded-lg transition-colors cursor-pointer"
                              title="Notificación WhatsApp"
                            >
                              <MessageSquare className="w-4 h-4" />
                            </button>
                          </div>
                        </div>

                        {/* Status Progress Bar */}
                        <div className="px-5 py-4 bg-slate-50 border-b border-slate-200">
                          <div className="grid grid-cols-4 gap-2 text-center text-[10px] sm:text-xs">
                            <div className={`p-2 rounded-lg font-medium transition-colors ${order.status === 'CREADA' ? 'bg-amber-100 text-amber-900 font-bold border border-amber-300' : statusInfo.step > 1 ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                              <span>1. Creada / Espera</span>
                            </div>
                            <div className={`p-2 rounded-lg font-medium transition-colors ${order.status === 'EN_PROCESO' ? 'bg-blue-100 text-blue-900 font-bold border border-blue-300' : statusInfo.step > 2 ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                              <span>2. En Proceso</span>
                            </div>
                            <div className={`p-2 rounded-lg font-medium transition-colors ${order.status === 'CULMINADA' ? 'bg-emerald-100 text-emerald-950 font-bold border border-emerald-400' : statusInfo.step > 3 ? 'bg-emerald-50 text-emerald-800' : 'bg-slate-100 text-slate-400'}`}>
                              <span>3. Culminada / Lista</span>
                            </div>
                            <div className={`p-2 rounded-lg font-medium transition-colors ${order.status === 'ENTREGADA' ? 'bg-slate-800 text-white font-bold' : 'bg-slate-100 text-slate-400'}`}>
                              <span>4. Entregada</span>
                            </div>
                          </div>
                        </div>

                        {/* Details */}
                        <div className="p-5 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs">
                          {/* Motorcycle Specs */}
                          <div className="space-y-3">
                            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-amber-500" />
                              <span>Ficha de la Motocicleta</span>
                            </h4>

                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-1.5">
                              <div className="flex justify-between items-center">
                                <span className="text-slate-500">Placa:</span>
                                <span className="font-mono font-extrabold text-sm text-slate-900 bg-white px-2 py-0.5 rounded border border-slate-200">
                                  {order.motorcycle.plate}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-500">Moto:</span>
                                <span className="font-semibold text-slate-800">
                                  {order.motorcycle.brand} {order.motorcycle.model} {order.motorcycle.year}
                                </span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-500">Color:</span>
                                <span className="text-slate-700">{order.motorcycle.color}</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-500">Kilometraje:</span>
                                <span className="font-mono text-slate-800">{order.motorcycle.mileage.toLocaleString()} km</span>
                              </div>
                              <div className="flex justify-between items-center">
                                <span className="text-slate-500">Nivel de Gasolina:</span>
                                <span className="text-slate-800 font-medium">{order.fuelLevel}</span>
                              </div>
                            </div>

                            {order.assignedTechnician && (
                              <p className="text-slate-500 text-[11px]">
                                <span className="font-semibold text-slate-700">Técnico encargado: </span>
                                {order.assignedTechnician}
                              </p>
                            )}
                          </div>

                          {/* Work Diagnosis & Dual Cost */}
                          <div className="space-y-3">
                            <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                              <span className="w-2 h-2 rounded-full bg-emerald-500" />
                              <span>Detalle del Trabajo y Repuestos</span>
                            </h4>

                            <div className="bg-slate-50 p-3.5 rounded-xl border border-slate-200 space-y-2">
                              <div>
                                <span className="text-slate-500 text-[10px] uppercase font-bold block">Motivo / Solicitud:</span>
                                <p className="text-slate-800 font-medium mt-0.5">{order.reportedIssue}</p>
                              </div>

                              {order.diagnosis && (
                                <div className="pt-2 border-t border-slate-200">
                                  <span className="text-slate-500 text-[10px] uppercase font-bold block">Diagnóstico Técnico:</span>
                                  <p className="text-slate-700 mt-0.5 leading-relaxed">{order.diagnosis}</p>
                                </div>
                              )}

                              {order.servicesList && order.servicesList.length > 0 && (
                                <div className="pt-2 border-t border-slate-200">
                                  <span className="text-slate-500 text-[10px] uppercase font-bold block mb-1">Servicios y Reparaciones:</span>
                                  <div className="space-y-1">
                                    {order.servicesList.map((s, idx) => (
                                      <div key={idx} className="flex justify-between text-slate-700 text-xs">
                                        <span>🛠️ {s.name}</span>
                                        <span className="font-mono">{formatUSD(s.cost)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              {order.partsUsed.length > 0 && (
                                <div className="pt-2 border-t border-slate-200">
                                  <span className="text-slate-500 text-[10px] uppercase font-bold block mb-1">Repuestos Utilizados:</span>
                                  <div className="space-y-1">
                                    {order.partsUsed.map((p, idx) => (
                                      <div key={idx} className="flex justify-between text-slate-700">
                                        <span>{p.quantity}x {p.name}</span>
                                        <span className="font-mono">{formatUSD(p.total)}</span>
                                      </div>
                                    ))}
                                  </div>
                                </div>
                              )}

                              <div className="pt-2 border-t border-slate-200 flex justify-between items-center text-sm font-bold text-slate-900">
                                <div>
                                  <span>Total Liquidado:</span>
                                  <span className="block text-[10px] text-emerald-700 font-normal">Tasa BCV: Bs. {rate.toFixed(2)}</span>
                                </div>
                                <div className="text-right">
                                  <span className="font-mono text-base block">{formatUSD(order.totalCost)}</span>
                                  <span className="font-mono text-xs text-emerald-700 block">{formatBs(totalBs)}</span>
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>

                        {/* Card Footer with PDF & WhatsApp action */}
                        <div className="p-4 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
                          <span className="text-xs text-slate-500">
                            Última actualización: {new Date(order.updatedAt).toLocaleTimeString('es-VE', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                          <div className="flex flex-wrap items-center gap-2">
                            {(order.status === 'CULMINADA' || order.status === 'ENTREGADA') && (
                              <button
                                onClick={() => {
                                  downloadServiceOrderPDF(order, settings).catch((err) =>
                                    console.warn('Error descargando factura PDF:', err)
                                  );
                                }}
                                className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                              >
                                <FileDown className="w-3.5 h-3.5 text-amber-400" />
                                <span>Descargar Factura PDF (QR)</span>
                              </button>
                            )}
                            <button
                              onClick={() => handleShareServiceWhatsApp(order)}
                              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold transition-colors cursor-pointer"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>Recibir Notificación en mi WhatsApp</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab: Sales Invoices */}
            {activeTab === 'ventas' && (
              <div className="space-y-4">
                {matchingSales.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                    <FileText className="w-10 h-10 mx-auto text-slate-300 mb-2" />
                    <h4 className="font-bold text-slate-800 text-sm">No hay facturas registradas</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      No encontramos compras registradas con este número de celular en nuestra base de datos.
                    </p>
                  </div>
                ) : (
                  matchingSales.map((sale) => {
                    const rate = sale.bcvRate || settings.bcvRate;
                    const totalBs = sale.totalBs || sale.total * rate;

                    return (
                      <div
                        key={sale.id}
                        className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs hover:border-slate-300 transition-colors flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div>
                          <div className="flex items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono font-bold text-slate-900 bg-slate-100 px-2 py-0.5 rounded border border-slate-200">
                              {sale.invoiceNumber}
                            </span>
                            <span>·</span>
                            <span>{new Date(sale.createdAt).toLocaleDateString('es-VE', { dateStyle: 'medium' })}</span>
                            <span>·</span>
                            <span className="text-emerald-700 font-semibold">{sale.paymentMethod}</span>
                          </div>

                          <div className="mt-2.5 space-y-1">
                            {sale.items.map((item, idx) => (
                              <p key={idx} className="text-xs text-slate-700">
                                <span className="font-bold font-mono">{item.quantity}x</span> {item.name}
                              </p>
                            ))}
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                          <div className="text-left sm:text-right">
                            <span className="text-[10px] text-slate-400 uppercase font-medium block">Total Pagado</span>
                            <span className="text-base font-bold font-mono text-slate-950 tabular-nums block">
                              {formatUSD(sale.total)}
                            </span>
                            <span className="text-xs font-semibold text-emerald-700 font-mono tabular-nums block">
                              {formatBs(totalBs)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              onClick={() => downloadInvoicePDF(sale, settings)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-2xs"
                              title="Descargar documento PDF oficial"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                              <span>Descargar PDF</span>
                            </button>
                            <button
                              onClick={() => setSelectedInvoice(sale)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Ver Factura</span>
                            </button>
                            <button
                              onClick={() => handleShareInvoiceWhatsApp(sale)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                              title="Descargar PDF y enviar a WhatsApp"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>WhatsApp</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}

            {/* Tab: Pending Accounts Payable */}
            {activeTab === 'cuentas' && (
              <div className="space-y-4">
                {matchingPendingSales.length === 0 ? (
                  <div className="bg-white rounded-xl border border-slate-200 p-8 text-center text-slate-500">
                    <CheckCircle2 className="w-10 h-10 mx-auto text-emerald-500 mb-2" />
                    <h4 className="font-bold text-slate-800 text-sm">Sin cuentas pendientes por pagar</h4>
                    <p className="text-xs text-slate-500 mt-1 max-w-sm mx-auto">
                      No encontramos saldos pendientes a crédito o sistema de apartado para esta cédula o teléfono.
                    </p>
                  </div>
                ) : (
                  matchingPendingSales.map((sale) => {
                    const paidUSD = sale.creditPaidAmount || 0;
                    const pendingUSD = Math.max(0, sale.total - paidUSD);
                    const pendingBs = pendingUSD * settings.bcvRate;
                    const modality = sale.paymentType === 'APARTADO' ? 'Sistema de Apartado' : 'Crédito';

                    return (
                      <div
                        key={sale.id}
                        className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs flex flex-col sm:flex-row sm:items-center justify-between gap-4"
                      >
                        <div>
                          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
                            <span className="font-mono font-bold text-slate-950">
                              {sale.invoiceNumber}
                            </span>
                            <span aria-hidden="true">·</span>
                            <span className="font-semibold text-amber-800">{modality}</span>
                            <span aria-hidden="true">·</span>
                            <span>{new Date(sale.createdAt).toLocaleDateString('es-VE', { dateStyle: 'medium' })}</span>
                            {sale.creditDueDate && (
                              <>
                                <span aria-hidden="true">·</span>
                                <span className="font-mono">Vence: {sale.creditDueDate}</span>
                              </>
                            )}
                          </div>
                          <div className="mt-2 space-y-1">
                            {sale.items.map((item, idx) => (
                              <p key={idx} className="text-xs text-slate-700">
                                <span className="font-bold font-mono">{item.quantity}x</span> {item.name}
                              </p>
                            ))}
                          </div>
                          <p className="mt-2 text-xs text-slate-500 font-mono tabular-nums">
                            Total: {formatUSD(sale.total)} · Abonado: {formatUSD(paidUSD)}
                          </p>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-4 border-t sm:border-t-0 pt-3 sm:pt-0 border-slate-100">
                          <div className="text-left sm:text-right">
                            <span className="text-[10px] text-slate-500 uppercase font-medium block">Saldo Pendiente</span>
                            <span className="text-base font-bold font-mono text-rose-700 tabular-nums block">
                              {formatUSD(pendingUSD)}
                            </span>
                            <span className="text-xs font-semibold text-emerald-700 font-mono tabular-nums block">
                              {formatBs(pendingBs)}
                            </span>
                          </div>

                          <div className="flex flex-wrap items-center gap-2">
                            <button
                              type="button"
                              onClick={() => setSelectedInvoice(sale)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-slate-100 hover:bg-slate-200 text-slate-800 text-xs font-semibold rounded-lg transition-colors cursor-pointer"
                            >
                              <Eye className="w-3.5 h-3.5" />
                              <span>Ver Factura</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => downloadInvoicePDF(sale, settings)}
                              className="inline-flex items-center gap-1.5 px-3 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold rounded-lg transition-colors cursor-pointer shadow-2xs"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                              <span>PDF</span>
                            </button>
                          </div>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            )}
          </div>
        ) : (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-lg mx-auto text-slate-500">
            <div className="w-14 h-14 rounded-2xl bg-amber-50 text-amber-600 mx-auto flex items-center justify-center mb-4 border border-amber-100">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">Consulta tu Historial en Servimotos Venezuela</h3>
            <p className="text-xs text-slate-500 mt-2 leading-relaxed">
              Ingresa el número de celular que diste al momento de tu compra o de ingresar tu moto al taller para visualizar tus facturas con desglose en dólares y bolívares a tasa oficial BCV.
            </p>
          </div>
        )}
      </div>
    </div>
  );
};
