import React, { useState } from 'react';
import { useStore } from '../context/StoreContext';
import { formatUSD, formatBs, buildWhatsAppLink } from '../utils/formatters';
import {
  Search,
  Wrench,
  FileText,
  Clock,
  CheckCircle2,
  AlertTriangle,
  Phone,
  Calendar,
  DollarSign,
  ShieldCheck,
  Bike,
} from 'lucide-react';

export const CustomerPortal: React.FC = () => {
  const { serviceOrders, sales, settings, bcvRate } = useStore();
  const [query, setQuery] = useState('');
  const [hasSearched, setHasSearched] = useState(false);

  const cleanQuery = query.trim().toUpperCase();

  // Buscar por teléfono o por placa
  const matchedOrders = serviceOrders.filter((order) => {
    if (!cleanQuery) return false;
    const phoneClean = order.customerPhone?.replace(/\D/g, '') || '';
    const queryDigits = cleanQuery.replace(/\D/g, '');
    const matchesPhone = queryDigits.length >= 4 && phoneClean.includes(queryDigits);
    const matchesPlate = (order.motorcycle?.plate || '').toUpperCase().includes(cleanQuery);
    return matchesPhone || matchesPlate;
  });

  const matchedSales = sales.filter((sale) => {
    if (!cleanQuery) return false;
    const phoneClean = sale.customerPhone?.replace(/\D/g, '') || '';
    const queryDigits = cleanQuery.replace(/\D/g, '');
    const matchesPhone = queryDigits.length >= 4 && phoneClean.includes(queryDigits);
    const matchesName = (sale.customerName || '').toUpperCase().includes(cleanQuery);
    return matchesPhone || matchesName;
  });

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (cleanQuery) {
      setHasSearched(true);
    }
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'CREADA':
        return (
          <span className="bg-slate-100 text-slate-800 font-bold px-2.5 py-1 rounded-full text-xs flex items-center gap-1">
            <Clock className="w-3.5 h-3.5 text-slate-500" />
            <span>En Espera</span>
          </span>
        );
      case 'EN_PROCESO':
        return (
          <span className="bg-amber-100 text-amber-900 font-bold px-2.5 py-1 rounded-full text-xs flex items-center gap-1">
            <Wrench className="w-3.5 h-3.5 text-amber-600 animate-spin" />
            <span>En Reparación</span>
          </span>
        );
      case 'CULMINADA':
        return (
          <span className="bg-emerald-100 text-emerald-900 font-bold px-2.5 py-1 rounded-full text-xs flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
            <span>Lista para Entrega</span>
          </span>
        );
      case 'ENTREGADA':
        return (
          <span className="bg-blue-100 text-blue-900 font-bold px-2.5 py-1 rounded-full text-xs flex items-center gap-1">
            <CheckCircle2 className="w-3.5 h-3.5 text-blue-600" />
            <span>Vehículo Entregado</span>
          </span>
        );
      default:
        return null;
    }
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="bg-white rounded-3xl border border-slate-200 p-6 sm:p-8 shadow-sm space-y-4 text-center">
        <div className="w-14 h-14 bg-amber-500/10 text-amber-600 rounded-2xl flex items-center justify-center mx-auto border border-amber-500/20">
          <Bike className="w-7 h-7" />
        </div>
        <div>
          <h2 className="text-xl sm:text-2xl font-black font-display text-slate-950">
            Portal de Autoservicio del Cliente
          </h2>
          <p className="text-xs sm:text-sm text-slate-500 max-w-md mx-auto mt-1">
            Ingresa tu número de WhatsApp o la placa de tu moto para consultar el estado del trabajo en el taller y tus facturas emitidas.
          </p>
        </div>

        {/* Search Bar */}
        <form onSubmit={handleSearch} className="max-w-md mx-auto flex items-center gap-2">
          <div className="relative flex-1">
            <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input
              type="text"
              required
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Ej. 04121234567 o Placa (ej. AB1C23)"
              className="w-full pl-9 pr-3 py-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white text-xs font-medium"
            />
          </div>
          <button
            type="submit"
            className="px-5 py-2.5 bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs rounded-xl shadow-xs transition-colors cursor-pointer"
          >
            Consultar
          </button>
        </form>
      </div>

      {/* Results */}
      {hasSearched && (
        <div className="space-y-6 animate-in fade-in duration-150">
          {matchedOrders.length === 0 && matchedSales.length === 0 ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-10 text-center space-y-3">
              <AlertTriangle className="w-10 h-10 text-amber-500 mx-auto" />
              <h3 className="font-bold text-slate-800 text-sm">No encontramos registros asociados</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Verifica que el número de teléfono o placa esté escrito correctamente, o escríbenos a nuestro WhatsApp de atención.
              </p>
            </div>
          ) : (
            <>
              {/* Service Orders */}
              {matchedOrders.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-amber-600" />
                    <span>Órdenes de Taller Mecánico ({matchedOrders.length})</span>
                  </h3>

                  {matchedOrders.map((order) => (
                    <div
                      key={order.id}
                      className="bg-white rounded-2xl border border-slate-200 p-5 shadow-xs space-y-4"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2 pb-3 border-b border-slate-100">
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="font-bold text-slate-900 text-sm font-display">
                              Orden #{order.orderNumber}
                            </span>
                            <span className="bg-amber-500 text-slate-950 font-mono font-bold text-[10px] px-2 py-0.5 rounded">
                              {order.motorcycle?.plate}
                            </span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">
                            {order.motorcycle?.brand} {order.motorcycle?.model} ({order.motorcycle?.year || 'S/A'})
                          </p>
                        </div>
                        {getStatusBadge(order.status)}
                      </div>

                      {order.reportedIssues && (
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Falla Reportada:
                          </span>
                          <p className="text-xs text-slate-700 mt-0.5">{order.reportedIssues}</p>
                        </div>
                      )}

                      {order.technicalDiagnosis && (
                        <div>
                          <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                            Diagnóstico Técnico:
                          </span>
                          <p className="text-xs text-slate-700 mt-0.5">{order.technicalDiagnosis}</p>
                        </div>
                      )}

                      {/* Financial breakdown */}
                      <div className="bg-slate-50 p-3 rounded-xl border border-slate-200 flex items-center justify-between">
                        <div>
                          <span className="text-[10px] text-slate-500 font-medium block">Total de la Orden</span>
                          <span className="font-bold text-slate-900 font-mono text-sm">
                            {formatUSD(order.totalCost)}
                          </span>
                          <span className="font-medium text-emerald-700 font-mono text-xs block">
                            {formatBs(order.totalCostBs || order.totalCost * bcvRate)}
                          </span>
                        </div>

                        {order.estimatedDelivery && (
                          <div className="text-right">
                            <span className="text-[10px] text-slate-500 font-medium block">Entrega Estimada</span>
                            <span className="text-xs font-bold text-slate-800">{order.estimatedDelivery}</span>
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}

              {/* Invoices */}
              {matchedSales.length > 0 && (
                <div className="space-y-3">
                  <h3 className="font-bold text-slate-900 text-sm flex items-center gap-2">
                    <FileText className="w-4 h-4 text-amber-600" />
                    <span>Facturas y Compras ({matchedSales.length})</span>
                  </h3>

                  <div className="bg-white rounded-2xl border border-slate-200 divide-y divide-slate-100 overflow-hidden">
                    {matchedSales.map((sale) => (
                      <div key={sale.id} className="p-4 flex flex-wrap items-center justify-between gap-3 text-xs">
                        <div>
                          <span className="font-bold text-slate-900 font-mono block">
                            Factura #{sale.invoiceNumber}
                          </span>
                          <span className="text-[11px] text-slate-400">
                            {new Date(sale.createdAt).toLocaleDateString('es-VE')} · {sale.paymentType}
                          </span>
                        </div>

                        <div className="text-right">
                          <span className="font-bold text-slate-900 font-mono text-sm block">
                            {formatUSD(sale.total)}
                          </span>
                          <span className="font-medium text-emerald-700 font-mono text-[11px]">
                            {formatBs(sale.totalBs || sale.total * bcvRate)}
                          </span>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
};
