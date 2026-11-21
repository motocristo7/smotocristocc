import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Customer, isSaleWithCredit } from '../../types';
import { VENEZUELA_LOCATIONS } from '../../data/venezuela';
import { formatUSD, formatBs, sanitizePhone, buildInvoiceWhatsAppMessage } from '../../utils/whatsapp';
import { downloadInvoicePDF } from '../../utils/pdfInvoice';
import {
  Users,
  Search,
  Plus,
  Phone,
  Mail,
  MapPin,
  FileText,
  Wrench,
  MessageSquare,
  Eye,
  Calendar,
  X,
  ShieldCheck,
  TrendingUp,
  FileDown,
  Edit2,
  Trash2,
  Check,
  ArrowUpDown,
  Clock,
  AlertCircle,
} from 'lucide-react';

type CustomerSortOption =
  | 'created_desc'
  | 'created_asc'
  | 'alpha_asc'
  | 'alpha_desc'
  | 'pending_desc';

function parseCreatedTimestamp(cust: Customer): number {
  const raw = cust.createdAt as unknown;
  if (typeof raw === 'string' && raw.trim()) {
    const parsed = new Date(raw).getTime();
    if (!Number.isNaN(parsed)) return parsed;
  } else if (typeof raw === 'number' && !Number.isNaN(raw)) {
    return raw;
  } else if (raw && typeof raw === 'object') {
    const maybeTs = raw as { toDate?: () => Date; seconds?: number };
    if (typeof maybeTs.toDate === 'function') {
      return maybeTs.toDate().getTime();
    }
    if (typeof maybeTs.seconds === 'number') {
      return maybeTs.seconds * 1000;
    }
  }
  const idMatch = cust.id?.match(/^cust-(\d{10,})/);
  if (idMatch) {
    const ts = Number(idMatch[1]);
    if (!Number.isNaN(ts)) return ts;
  }
  return 0;
}

function formatCreatedDateTime(cust: Customer): { date: string; time: string; full: string } {
  const ts = parseCreatedTimestamp(cust);
  if (!ts) {
    return { date: 'Sin registro', time: '—', full: 'Sin fecha registrada' };
  }
  const d = new Date(ts);
  const date = d.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  const time = d.toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
    hour12: true,
  });
  return { date, time, full: `${date} · ${time}` };
}

export const CustomersView: React.FC = () => {
  const {
    customers,
    sales,
    serviceOrders,
    addCustomer,
    updateCustomer,
    deleteCustomer,
    settings,
    setSelectedInvoice,
    setWhatsappModalData,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [sortBy, setSortBy] = useState<CustomerSortOption>('created_desc');
  const [onlyPendingAccounts, setOnlyPendingAccounts] = useState(false);
  const [selectedCustomer, setSelectedCustomer] = useState<Customer | null>(null);
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<Customer | null>(null);
  const [confirmDeleteCustomerId, setConfirmDeleteCustomerId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const rate = settings.bcvRate;

  // Form state (Venezuela)
  const initialForm = {
    name: '',
    phone: '',
    email: '',
    documentId: '',
    state: settings.state || 'Mérida',
    city: settings.city || 'Mérida',
    address: '',
    notes: '',
  };
  const [customerForm, setCustomerForm] = useState(initialForm);

  const availableCities = VENEZUELA_LOCATIONS.find((l) => l.state === customerForm.state)?.cities || [customerForm.city];

  const normalizePhone = (phone?: string) => {
    const digits = (phone || '').replace(/\D/g, '');
    if (digits.length < 7 || /^0+$/.test(digits)) return '';
    if (digits.length === 12 && digits.startsWith('58')) return digits.slice(2);
    if (digits.length === 11 && digits.startsWith('0')) return digits.slice(1);
    return digits;
  };

  const normalizeName = (name?: string) =>
    (name || '')
      .trim()
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ');

  const doesRecordBelongToCustomer = (
    record: { customerId?: string; customerPhone?: string; customerName?: string },
    cust: Customer
  ) => {
    if (record.customerId && record.customerId === cust.id) return true;
    const custName = normalizeName(cust.name);
    const recName = normalizeName(record.customerName);
    if (recName && custName && recName === custName) return true;
    const custPhone = normalizePhone(cust.phone);
    const recPhone = normalizePhone(record.customerPhone);
    if (custPhone && recPhone && custPhone === recPhone) {
      return !recName || !custName || recName === custName;
    }
    return false;
  };

  const customerMetricsMap = useMemo(() => {
    const map = new Map<
      string,
      {
        custSales: typeof sales;
        custServices: typeof serviceOrders;
        totalSpentUSD: number;
        pendingDebtUSD: number;
        pendingCreditCount: number;
        createdTs: number;
      }
    >();

    for (const cust of customers) {
      const custSales = sales.filter((s) => doesRecordBelongToCustomer(s, cust));
      const custServices = serviceOrders.filter((o) => doesRecordBelongToCustomer(o, cust));
      const totalSpentUSD =
        custSales.reduce((s, sale) => s + sale.total, 0) +
        custServices.reduce((s, o) => s + o.totalCost, 0);

      let pendingDebtUSD = 0;
      let pendingCreditCount = 0;
      for (const s of custSales) {
        if (!isSaleWithCredit(s)) continue;
        if (s.creditStatus === 'PAGADO' || s.creditStatus === 'ANULADO' || s.isVoided) continue;
        const pending = Math.max(0, s.total - (s.creditPaidAmount || 0));
        if (pending > 0.01) {
          pendingDebtUSD += pending;
          pendingCreditCount += 1;
        }
      }

      map.set(cust.id, {
        custSales,
        custServices,
        totalSpentUSD,
        pendingDebtUSD,
        pendingCreditCount,
        createdTs: parseCreatedTimestamp(cust),
      });
    }

    return map;
  }, [customers, sales, serviceOrders]);

  const customersWithPendingCount = useMemo(() => {
    let count = 0;
    customerMetricsMap.forEach((m) => {
      if (m.pendingDebtUSD > 0.01) count += 1;
    });
    return count;
  }, [customerMetricsMap]);

  const filteredCustomers = useMemo(() => {
    const filtered = customers.filter((c) => {
      if (onlyPendingAccounts) {
        const metrics = customerMetricsMap.get(c.id);
        if (!metrics || metrics.pendingDebtUSD <= 0.01) return false;
      }
      if (!searchTerm.trim()) return true;
      const q = searchTerm.toLowerCase();
      return (
        c.name.toLowerCase().includes(q) ||
        c.phone.includes(q) ||
        (c.documentId && c.documentId.toLowerCase().includes(q)) ||
        (c.city && c.city.toLowerCase().includes(q)) ||
        (c.state && c.state.toLowerCase().includes(q))
      );
    });

    return [...filtered].sort((a, b) => {
      const mA = customerMetricsMap.get(a.id);
      const mB = customerMetricsMap.get(b.id);

      switch (sortBy) {
        case 'created_desc':
          return (mB?.createdTs || 0) - (mA?.createdTs || 0);
        case 'created_asc':
          return (mA?.createdTs || 0) - (mB?.createdTs || 0);
        case 'alpha_asc':
          return (a.name || '').localeCompare(b.name || '', 'es', { sensitivity: 'base' });
        case 'alpha_desc':
          return (b.name || '').localeCompare(a.name || '', 'es', { sensitivity: 'base' });
        case 'pending_desc': {
          const debtDiff = (mB?.pendingDebtUSD || 0) - (mA?.pendingDebtUSD || 0);
          if (Math.abs(debtDiff) > 0.001) return debtDiff;
          return (mB?.createdTs || 0) - (mA?.createdTs || 0);
        }
        default:
          return 0;
      }
    });
  }, [customers, searchTerm, sortBy, onlyPendingAccounts, customerMetricsMap]);

  const handleOpenAddModal = () => {
    setEditingCustomer(null);
    setCustomerForm({
      ...initialForm,
      state: settings.state || 'Mérida',
      city: settings.city || 'Mérida',
    });
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleOpenEditModal = (customer: Customer) => {
    setEditingCustomer(customer);
    setCustomerForm({
      name: customer.name || '',
      phone: customer.phone || '',
      email: customer.email || '',
      documentId: customer.documentId || '',
      state: customer.state || settings.state || 'Mérida',
      city: customer.city || settings.city || 'Mérida',
      address: customer.address || '',
      notes: customer.notes || '',
    });
    setFormError(null);
    setIsAddModalOpen(true);
  };

  const handleSaveCustomer = (e: React.FormEvent) => {
    e.preventDefault();
    if (!customerForm.name.trim() || !customerForm.phone.trim()) {
      setFormError('El nombre y el teléfono de WhatsApp son obligatorios.');
      return;
    }
    setFormError(null);

    if (editingCustomer) {
      updateCustomer(editingCustomer.id, customerForm);
      if (selectedCustomer?.id === editingCustomer.id) {
        setSelectedCustomer({
          ...selectedCustomer,
          ...customerForm,
        });
      }
    } else {
      addCustomer({
        ...customerForm,
      });
    }

    setIsAddModalOpen(false);
    setEditingCustomer(null);
    setCustomerForm(initialForm);
  };

  const handleDeleteCustomer = (id: string) => {
    deleteCustomer(id);
    if (selectedCustomer?.id === id) {
      setSelectedCustomer(null);
    }
    setConfirmDeleteCustomerId(null);
  };

  const handleOpenWhatsAppChat = (customer: Customer) => {
    const text = `Hola *${customer.name}*, te saludamos desde *${settings.commercialName}*. ¿En qué podemos ayudarte el día de hoy con tu motocicleta o repuesto?`;
    const url = `https://api.whatsapp.com/send?phone=${sanitizePhone(customer.phone)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
            Directorio & Clientes en Venezuela
          </span>
          <h1 className="text-2xl font-bold font-display text-slate-900 mt-0.5">
            Registro de Clientes y Motocicletas
          </h1>
          <p className="text-xs text-slate-500">
            Base de datos con ciudades y estados de Venezuela, números celulares nacionales e historial de compras y servicios.
          </p>
        </div>

        <button
          onClick={handleOpenAddModal}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          <span>Registrar Nuevo Cliente</span>
        </button>
      </div>

      {/* Search & Organization Filters Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col lg:flex-row lg:items-center gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nombre, celular (0414, 0424...), cédula o ciudad venezolana..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-1.5">
              <ArrowUpDown className="w-3.5 h-3.5 text-slate-500 shrink-0" />
              <label htmlFor="customers-sort-select" className="text-[11px] font-semibold text-slate-600 shrink-0">
                Organizar por:
              </label>
              <select
                id="customers-sort-select"
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value as CustomerSortOption)}
                className="text-xs font-semibold text-slate-900 bg-transparent focus:outline-none cursor-pointer"
              >
                <option value="created_desc">Fecha de creación (Más recientes)</option>
                <option value="created_asc">Fecha de creación (Más antiguos)</option>
                <option value="alpha_asc">Orden alfabético (A - Z)</option>
                <option value="alpha_desc">Orden alfabético (Z - A)</option>
                <option value="pending_desc">Cuentas pendientes (Mayor saldo)</option>
              </select>
            </div>

            <button
              type="button"
              onClick={() => {
                const next = !onlyPendingAccounts;
                setOnlyPendingAccounts(next);
                if (next && sortBy !== 'pending_desc') {
                  setSortBy('pending_desc');
                }
              }}
              className={`inline-flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-semibold border transition-colors cursor-pointer ${
                onlyPendingAccounts
                  ? 'bg-rose-600 text-white border-rose-600 shadow-xs'
                  : 'bg-white text-slate-700 border-slate-200 hover:bg-rose-50 hover:border-rose-300 hover:text-rose-800'
              }`}
              title="Filtrar solo clientes con cuentas a crédito pendientes por pagar"
            >
              <AlertCircle className="w-3.5 h-3.5" />
              <span>Cuentas pendientes ({customersWithPendingCount})</span>
            </button>
          </div>
        </div>

        <div className="flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-500">
          <span>
            Mostrando <strong className="text-slate-800">{filteredCustomers.length}</strong> de{' '}
            <strong className="text-slate-800">{customers.length}</strong> clientes registrados
          </span>
          {(onlyPendingAccounts || searchTerm.trim() || sortBy !== 'created_desc') && (
            <button
              type="button"
              onClick={() => {
                setSearchTerm('');
                setOnlyPendingAccounts(false);
                setSortBy('created_desc');
              }}
              className="text-amber-700 hover:text-amber-900 font-semibold underline cursor-pointer"
            >
              Restablecer filtros
            </button>
          )}
        </div>
      </div>

      {/* Customers Table */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-4">Cliente</th>
                <th className="py-3 px-3">Fecha y Hora de Registro</th>
                <th className="py-3 px-3">Ubicación (Venezuela)</th>
                <th className="py-3 px-3">Celular / WhatsApp</th>
                <th className="py-3 px-3">Cédula / RIF</th>
                <th className="py-3 px-3 text-center">Facturas</th>
                <th className="py-3 px-3 text-center">Taller</th>
                <th className="py-3 px-3 text-right">Total / Saldo Pendiente</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredCustomers.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No se encontraron clientes registrados con ese criterio.
                  </td>
                </tr>
              ) : (
                filteredCustomers.map((cust) => {
                  const metrics = customerMetricsMap.get(cust.id);
                  const custSales = metrics?.custSales || [];
                  const custServices = metrics?.custServices || [];
                  const totalSpentUSD = metrics?.totalSpentUSD || 0;
                  const totalSpentBs = totalSpentUSD * rate;
                  const pendingDebtUSD = metrics?.pendingDebtUSD || 0;
                  const pendingCreditCount = metrics?.pendingCreditCount || 0;
                  const createdFormatted = formatCreatedDateTime(cust);

                  return (
                    <tr key={cust.id} className="hover:bg-slate-50/70 transition-colors">
                      <td className="py-3 px-4">
                        <p className="font-bold text-slate-900">{cust.name}</p>
                        {pendingDebtUSD > 0.01 && (
                          <span className="inline-flex items-center gap-1 mt-1 px-1.5 py-0.5 rounded bg-rose-50 border border-rose-200 text-[10px] font-bold text-rose-700">
                            <AlertCircle className="w-2.5 h-2.5" />
                            <span>
                              {pendingCreditCount} {pendingCreditCount === 1 ? 'cuenta pendiente' : 'cuentas pendientes'}
                            </span>
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-3 text-slate-600 whitespace-nowrap">
                        <div className="flex items-center gap-1.5 font-mono font-semibold text-slate-800">
                          <Calendar className="w-3 h-3 text-amber-600 shrink-0" />
                          <span>{createdFormatted.date}</span>
                        </div>
                        <div className="flex items-center gap-1.5 font-mono text-[10px] text-slate-500 mt-0.5">
                          <Clock className="w-3 h-3 text-slate-400 shrink-0" />
                          <span>{createdFormatted.time}</span>
                        </div>
                      </td>

                      <td className="py-3 px-3 text-slate-600">
                        <p className="font-medium text-slate-800">{cust.city || 'Caracas'}</p>
                        <p className="text-[10px] text-slate-400">{cust.state || 'Distrito Capital'}</p>
                      </td>

                      <td className="py-3 px-3 font-mono font-medium text-slate-700">
                        {cust.phone}
                      </td>

                      <td className="py-3 px-3 font-mono text-slate-600 font-medium">
                        {cust.documentId || '—'}
                      </td>

                      <td className="py-3 px-3 text-center font-mono font-bold text-slate-700">
                        {custSales.length}
                      </td>

                      <td className="py-3 px-3 text-center font-mono font-bold text-amber-700">
                        {custServices.length}
                      </td>

                      <td className="py-3 px-3 text-right">
                        <span className="font-mono font-bold text-slate-900 block tabular-nums">
                          {formatUSD(totalSpentUSD)}
                        </span>
                        <span className="font-mono text-[10px] font-semibold text-emerald-700 block tabular-nums">
                          {formatBs(totalSpentBs)}
                        </span>
                        {pendingDebtUSD > 0.01 && (
                          <span className="font-mono text-[10px] font-bold text-rose-700 block tabular-nums mt-0.5">
                            Debe: {formatUSD(pendingDebtUSD)}
                          </span>
                        )}
                      </td>

                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => setSelectedCustomer(cust)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded cursor-pointer"
                            title="Ver Historial Completo"
                          >
                            <Eye className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenEditModal(cust)}
                            className="p-1.5 text-amber-600 hover:text-amber-800 hover:bg-amber-50 rounded cursor-pointer"
                            title="Editar Datos del Cliente"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => handleOpenWhatsAppChat(cust)}
                            className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded cursor-pointer"
                            title="Chatear en WhatsApp"
                          >
                            <MessageSquare className="w-3.5 h-3.5" />
                          </button>

                          {confirmDeleteCustomerId === cust.id ? (
                            <div className="flex items-center gap-1 bg-red-50 border border-red-200 p-0.5 rounded">
                              <span className="text-[10px] text-red-700 font-semibold px-1">¿Borrar?</span>
                              <button
                                onClick={() => handleDeleteCustomer(cust.id)}
                                className="px-1.5 py-0.5 bg-red-600 hover:bg-red-700 text-white rounded text-[10px] font-bold cursor-pointer"
                              >
                                Sí
                              </button>
                              <button
                                onClick={() => setConfirmDeleteCustomerId(null)}
                                className="p-0.5 text-slate-400 hover:text-slate-600 text-[10px] rounded cursor-pointer"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </div>
                          ) : (
                            <button
                              onClick={() => setConfirmDeleteCustomerId(cust.id)}
                              className="p-1.5 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded cursor-pointer"
                              title="Eliminar Cliente"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Customer Detail Drawer / Modal */}
      {selectedCustomer && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                  Perfil de Cliente e Historial (Venezuela)
                </span>
                <h3 className="font-bold text-base font-display mt-0.5">{selectedCustomer.name}</h3>
              </div>
              <div className="flex items-center gap-2">
                <button
                  onClick={() => handleOpenEditModal(selectedCustomer)}
                  className="px-2.5 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="Editar datos del cliente"
                >
                  <Edit2 className="w-3.5 h-3.5" />
                  <span>Editar</span>
                </button>
                <button
                  onClick={() => handleDeleteCustomer(selectedCustomer.id)}
                  className="px-2.5 py-1.5 bg-red-600/80 hover:bg-red-600 text-white font-semibold rounded-lg text-xs flex items-center gap-1.5 cursor-pointer transition-colors"
                  title="Eliminar este cliente"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  <span>Eliminar</span>
                </button>
                <button
                  onClick={() => setSelectedCustomer(null)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            <div className="p-6 overflow-y-auto space-y-6 text-xs bg-slate-50">
              {/* Contact Card */}
              <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs grid grid-cols-2 sm:grid-cols-4 gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Celular / WhatsApp</span>
                  <span className="font-mono font-bold text-slate-900">{selectedCustomer.phone}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Cédula / RIF</span>
                  <span className="font-mono text-slate-700 font-bold">{selectedCustomer.documentId || 'No registrado'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Ubicación</span>
                  <span className="text-slate-700">{selectedCustomer.city || 'Caracas'}, {selectedCustomer.state || 'Distrito Capital'}</span>
                </div>
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-semibold block">Fecha y Hora de Registro</span>
                  <span className="font-mono font-semibold text-slate-800 block">
                    {formatCreatedDateTime(selectedCustomer).full}
                  </span>
                </div>
                {(customerMetricsMap.get(selectedCustomer.id)?.pendingDebtUSD || 0) > 0.01 && (
                  <div className="col-span-2 sm:col-span-4 pt-2 border-t border-slate-100 flex items-center justify-between text-rose-700 bg-rose-50 px-3 py-2 rounded-lg border border-rose-200">
                    <span className="font-bold flex items-center gap-1.5">
                      <AlertCircle className="w-3.5 h-3.5" />
                      <span>Saldo Pendiente por Cuentas a Crédito:</span>
                    </span>
                    <span className="font-mono font-extrabold text-sm">
                      {formatUSD(customerMetricsMap.get(selectedCustomer.id)?.pendingDebtUSD || 0)} (
                      {formatBs((customerMetricsMap.get(selectedCustomer.id)?.pendingDebtUSD || 0) * rate)})
                    </span>
                  </div>
                )}
              </div>

              {/* Purchase Invoices Section */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <FileText className="w-3.5 h-3.5 text-emerald-600" />
                  <span>Historial de Facturas de Venta ($ y Bs)</span>
                </h4>

                {sales.filter((s) => doesRecordBelongToCustomer(s, selectedCustomer)).length === 0 ? (
                  <p className="text-slate-400 text-center py-4 bg-white rounded-lg border border-slate-200">
                    No hay compras registradas aún.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {sales
                      .filter((s) => doesRecordBelongToCustomer(s, selectedCustomer))
                      .map((sale) => {
                        const saleRate = sale.bcvRate || rate;
                        return (
                          <div
                            key={sale.id}
                            className="bg-white p-3.5 rounded-xl border border-slate-200 flex items-center justify-between shadow-2xs"
                          >
                            <div>
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold text-slate-900">{sale.invoiceNumber}</span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-500">
                                  {new Date(sale.createdAt).toLocaleDateString('es-VE')}
                                </span>
                              </div>
                              <p className="text-[11px] text-slate-600 mt-0.5">
                                {sale.items.map((i) => `${i.quantity}x ${i.name}`).join(', ')}
                              </p>
                            </div>

                            <div className="flex items-center gap-3">
                              <div className="text-right">
                                <span className="font-mono font-bold text-slate-900 block">
                                  {formatUSD(sale.total)}
                                </span>
                                <span className="font-mono text-[10px] text-emerald-700 block">
                                  {formatBs(sale.totalBs || sale.total * saleRate)}
                                </span>
                              </div>
                              <button
                                onClick={() => downloadInvoicePDF(sale, settings)}
                                className="p-1.5 text-amber-600 hover:text-amber-700 hover:bg-amber-50 rounded"
                                title="Descargar Factura PDF"
                              >
                                <FileDown className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => setSelectedInvoice(sale)}
                                className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded"
                                title="Ver Factura"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                              <button
                                onClick={() => {
                                  const { message, url } = buildInvoiceWhatsAppMessage(sale, settings);
                                  setWhatsappModalData({
                                    title: `Factura #${sale.invoiceNumber}`,
                                    message,
                                    url,
                                    phone: sale.customerPhone,
                                    recipientName: sale.customerName,
                                    sale,
                                  });
                                }}
                                className="p-1.5 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded"
                                title="Enviar Factura PDF por WhatsApp"
                              >
                                <MessageSquare className="w-3.5 h-3.5" />
                              </button>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>

              {/* Service Orders Section (Mecánica y Tapicería) */}
              <div className="space-y-3">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-amber-600" />
                  <span>Historial de Servicios de Taller (Mecánica y Tapicería)</span>
                </h4>

                {serviceOrders.filter((o) => doesRecordBelongToCustomer(o, selectedCustomer)).length === 0 ? (
                  <p className="text-slate-400 text-center py-4 bg-white rounded-lg border border-slate-200">
                    No hay servicios de taller registrados aún para este cliente.
                  </p>
                ) : (
                  <div className="space-y-2">
                    {serviceOrders
                      .filter((o) => doesRecordBelongToCustomer(o, selectedCustomer))
                      .map((order) => {
                        const orderRate = order.bcvRate || rate;
                        return (
                          <div
                            key={order.id}
                            className="bg-white p-3.5 rounded-xl border border-slate-200 flex flex-col gap-2 shadow-2xs"
                          >
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <span className="font-mono font-bold bg-slate-900 text-white px-2 py-0.5 rounded text-[11px]">
                                  {order.motorcycle.plate}
                                </span>
                                <span className="font-bold text-slate-900">
                                  {order.motorcycle.brand} {order.motorcycle.model}
                                </span>
                                <span className="text-slate-400">·</span>
                                <span className="text-slate-500 font-mono">{order.orderNumber}</span>
                              </div>
                              <div className="text-right">
                                <span className="font-mono font-bold text-slate-900 block">
                                  {formatUSD(order.totalCost)}
                                </span>
                                <span className="font-mono text-[10px] text-emerald-700 block">
                                  {formatBs(order.totalCostBs || order.totalCost * orderRate)}
                                </span>
                              </div>
                            </div>

                            <div className="text-[11px] text-slate-600">
                              <p><strong>Tipo:</strong> {order.serviceType} · <strong>Falla:</strong> {order.reportedIssue}</p>
                            </div>

                            <div className="pt-2 border-t border-slate-100 flex items-center justify-between text-[11px]">
                              <span className="font-semibold text-amber-700">
                                Estado: {order.status}
                              </span>
                              <span className="text-slate-400">
                                {new Date(order.createdAt).toLocaleDateString('es-VE')}
                              </span>
                            </div>
                          </div>
                        );
                      })}
                  </div>
                )}
              </div>
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex justify-end">
              <button
                onClick={() => setSelectedCustomer(null)}
                className="px-4 py-2 bg-slate-900 text-white rounded-lg text-xs font-semibold"
              >
                Cerrar Perfil
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Add / Edit Customer Modal */}
      {isAddModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-5 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <span className="text-[10px] font-bold text-amber-400 uppercase tracking-wider block">
                  {editingCustomer ? 'Modificar Registro' : 'Nuevo Registro'}
                </span>
                <h3 className="font-bold text-sm font-display mt-0.5">
                  {editingCustomer ? `Editar Cliente: ${editingCustomer.name}` : 'Registrar Nuevo Cliente en Venezuela'}
                </h3>
              </div>
              <button
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingCustomer(null);
                }}
                className="p-1 text-slate-400 hover:text-white rounded cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCustomer} className="p-6 space-y-3.5 text-xs">
              {formError && (
                <div className="p-2.5 rounded-lg bg-red-50 border border-red-200 text-red-700 text-xs font-medium">
                  {formError}
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={customerForm.name}
                  onChange={(e) => setCustomerForm({ ...customerForm, name: e.target.value })}
                  placeholder="Ej. Santiago Mejía"
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Celular / WhatsApp (Venezuela) *</label>
                  <input
                    type="tel"
                    required
                    value={customerForm.phone}
                    onChange={(e) => setCustomerForm({ ...customerForm, phone: e.target.value })}
                    placeholder="Ej. 04141234567"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono focus:bg-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cédula / RIF</label>
                  <input
                    type="text"
                    value={customerForm.documentId}
                    onChange={(e) => setCustomerForm({ ...customerForm, documentId: e.target.value })}
                    placeholder="Ej. V-19874521 o J-12345678-9"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono focus:bg-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>
              </div>

              {/* Venezuelan State & City Selectors */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Estado de Venezuela *</label>
                  <select
                    value={customerForm.state}
                    onChange={(e) => {
                      const newState = e.target.value;
                      const loc = VENEZUELA_LOCATIONS.find((l) => l.state === newState);
                      setCustomerForm({
                        ...customerForm,
                        state: newState,
                        city: loc && loc.cities.length > 0 ? loc.cities[0] : '',
                      });
                    }}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-medium cursor-pointer"
                  >
                    {VENEZUELA_LOCATIONS.map((loc) => (
                      <option key={loc.state} value={loc.state}>
                        {loc.state}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Ciudad / Municipio *</label>
                  <select
                    value={customerForm.city}
                    onChange={(e) => setCustomerForm({ ...customerForm, city: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-medium cursor-pointer"
                  >
                    {availableCities.map((city) => (
                      <option key={city} value={city}>
                        {city}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Dirección / Sector (Opcional)</label>
                <input
                  type="text"
                  value={customerForm.address}
                  onChange={(e) => setCustomerForm({ ...customerForm, address: e.target.value })}
                  placeholder="Ej. Calle 2 de Campo de Oro, Casa #1-23"
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notas o Datos del Vehículo (Opcional)</label>
                <input
                  type="text"
                  value={customerForm.notes}
                  onChange={(e) => setCustomerForm({ ...customerForm, notes: e.target.value })}
                  placeholder="Ej. Bera SBR 150 azul, cliente frecuente de repuestos"
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingCustomer(null);
                  }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-slate-900 text-white font-bold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  {editingCustomer ? 'Actualizar Cliente' : 'Guardar Cliente'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
