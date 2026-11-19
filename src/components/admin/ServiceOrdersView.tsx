import React, { useState, useMemo, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { useApp } from '../../context/AppContext';
import {
  ServiceOrder,
  WorkshopServiceType,
  ServiceOrderStatus,
  Motorcycle,
  SaleItem,
  ServiceItem,
  Customer,
  FuelLevel,
  Product,
  Technician,
} from '../../types';
import {
  formatUSD,
  formatBs,
  buildServiceStatusWhatsAppMessage,
  buildTechnicianAssignedOrderWhatsAppMessage,
  hasValidWhatsAppPhone,
} from '../../utils/whatsapp';
import { downloadServiceOrderPDF } from '../../utils/pdfInvoice';
import {
  Wrench,
  Plus,
  Search,
  MessageSquare,
  Clock,
  CheckCircle2,
  AlertCircle,
  Fuel,
  Gauge,
  Calendar,
  X,
  User,
  UserPlus,
  Users,
  MapPin,
  Scissors,
  Phone,
  FileText,
  FileDown,
  Boxes,
  TrendingUp,
  Trash2,
  Edit3,
  Save,
  PlusCircle,
  Check,
  Sparkles,
  Percent,
  Tag,
  ChevronDown,
} from 'lucide-react';

const normalizeText = (value?: string): string =>
  (value || '')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .trim()
    .toLowerCase();

const normalizeDoc = (value?: string): string =>
  (value || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();

const normalizePhoneDigits = (value?: string): string =>
  (value || '').replace(/\D/g, '');

const FUEL_LEVEL_OPTIONS: { value: FuelLevel; label: string }[] = [
  { value: 'Vacío', label: 'Tanque Vacío' },
  { value: '1/4', label: '1/4 Tanque' },
  { value: '1/2', label: '1/2 Tanque' },
  { value: '3/4', label: '3/4 Tanque' },
  { value: 'Lleno', label: 'Tanque Lleno' },
];

export interface ServiceCustomerValue {
  customerId: string;
  customerName: string;
  customerPhone: string;
  customerDocument: string;
  customerCity: string;
  customerAddress: string;
}

interface ServiceCustomerSelectorProps {
  customers: Customer[];
  mode: 'existing' | 'new';
  onModeChange: (mode: 'existing' | 'new') => void;
  value: ServiceCustomerValue;
  onChange: (next: ServiceCustomerValue) => void;
  defaultCity?: string;
}

const ServiceCustomerSelector: React.FC<ServiceCustomerSelectorProps> = ({
  customers,
  mode,
  onModeChange,
  value,
  onChange,
  defaultCity,
}) => {
  const [searchQuery, setSearchQuery] = useState('');
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsDropdownOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedCustomer = useMemo(
    () => (value.customerId ? customers.find((c) => c.id === value.customerId) : undefined),
    [customers, value.customerId]
  );

  const filteredCustomers = useMemo(() => {
    const qText = normalizeText(searchQuery);
    const qDoc = normalizeDoc(searchQuery);
    const qDigits = normalizePhoneDigits(searchQuery);

    const validCustomers = customers.filter(
      (c) => normalizeText(c.name) !== 'cliente mostrador'
    );

    if (!qText && !qDoc && !qDigits) {
      return [...validCustomers]
        .sort((a, b) => a.name.localeCompare(b.name, 'es'))
        .slice(0, 40);
    }

    const scored = validCustomers
      .map((c) => {
        const cName = normalizeText(c.name);
        const cDoc = normalizeDoc(c.documentId);
        const cPhone = normalizePhoneDigits(c.phone);

        let score = 0;
        if (qDoc && cDoc) {
          if (cDoc === qDoc) score += 120;
          else if (cDoc.startsWith(qDoc)) score += 90;
          else if (cDoc.includes(qDoc)) score += 65;
        }
        if (qDigits && cPhone) {
          if (cPhone === qDigits) score += 110;
          else if (cPhone.startsWith(qDigits)) score += 80;
          else if (cPhone.includes(qDigits)) score += 55;
        }
        if (qText) {
          if (cName === qText) score += 115;
          else if (cName.startsWith(qText)) score += 85;
          else {
            const tokens = qText.split(/\s+/).filter(Boolean);
            if (tokens.length > 0 && tokens.every((t) => cName.includes(t))) {
              score += 60;
            } else if (cName.includes(qText)) {
              score += 50;
            }
          }
        }
        return { customer: c, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || a.customer.name.localeCompare(b.customer.name, 'es'));

    return scored.slice(0, 40).map((entry) => entry.customer);
  }, [customers, searchQuery]);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [searchQuery, isDropdownOpen]);

  // Duplicate check when typing in "new" mode
  const duplicateMatchInNewMode = useMemo(() => {
    if (mode !== 'new') return undefined;
    const normDoc = normalizeDoc(value.customerDocument);
    const normPhone = normalizePhoneDigits(value.customerPhone);
    if (!normDoc && normPhone.length < 7) return undefined;
    return customers.find((c) => {
      if (normalizeText(c.name) === 'cliente mostrador') return false;
      const cDoc = normalizeDoc(c.documentId);
      const cPhone = normalizePhoneDigits(c.phone);
      if (normDoc && cDoc && normDoc === cDoc) return true;
      if (normPhone.length >= 7 && cPhone && normPhone === cPhone) return true;
      return false;
    });
  }, [mode, customers, value.customerDocument, value.customerPhone]);

  const handleSelectCustomer = (c: Customer) => {
    onModeChange('existing');
    onChange({
      customerId: c.id,
      customerName: c.name,
      customerPhone: c.phone === 'N/A' ? '' : c.phone || '',
      customerDocument: c.documentId || '',
      customerCity: c.city || defaultCity || '',
      customerAddress: c.address || '',
    });
    setSearchQuery('');
    setIsDropdownOpen(false);
  };

  const handleSwitchToExisting = () => {
    onModeChange('existing');
    setIsDropdownOpen(true);
    setTimeout(() => searchInputRef.current?.focus(), 0);
  };

  const handleSwitchToNew = () => {
    onModeChange('new');
    setIsDropdownOpen(false);
    setSearchQuery('');
    // Clear previous linked registered customer fields so user enters fresh new customer data
    if (value.customerId) {
      onChange({
        customerId: '',
        customerName: '',
        customerPhone: '',
        customerDocument: '',
        customerCity: defaultCity || '',
        customerAddress: '',
      });
    } else {
      onChange({
        ...value,
        customerId: '',
        customerCity: value.customerCity || defaultCity || '',
      });
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (!isDropdownOpen && (e.key === 'ArrowDown' || e.key === 'ArrowUp')) {
      setIsDropdownOpen(true);
      return;
    }
    if (!isDropdownOpen || filteredCustomers.length === 0) {
      if (e.key === 'Escape') setIsDropdownOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((prev) => (prev + 1) % filteredCustomers.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((prev) => (prev - 1 + filteredCustomers.length) % filteredCustomers.length);
    } else if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredCustomers[highlightedIdx] || filteredCustomers[0];
      if (target) handleSelectCustomer(target);
    } else if (e.key === 'Escape') {
      setIsDropdownOpen(false);
    }
  };

  const registeredCount = useMemo(
    () => customers.filter((c) => normalizeText(c.name) !== 'cliente mostrador').length,
    [customers]
  );

  return (
    <div ref={containerRef} className="space-y-3">
      {/* Mode Toggle Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <div className="flex items-center gap-1.5">
          <User className="w-3.5 h-3.5 text-amber-600" />
          <span className="font-bold text-slate-900 uppercase tracking-wider text-[11px]">
            Datos del Cliente
          </span>
        </div>

        <div className="inline-flex items-center gap-1 bg-slate-100 p-1 rounded-lg border border-slate-200">
          <button
            type="button"
            onClick={handleSwitchToExisting}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
              mode === 'existing'
                ? 'bg-slate-900 text-white shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <Users className="w-3 h-3 text-amber-400" />
            <span>Cliente Registrado ({registeredCount})</span>
          </button>

          <button
            type="button"
            onClick={handleSwitchToNew}
            className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-[11px] font-semibold transition-colors cursor-pointer ${
              mode === 'new'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <UserPlus className="w-3 h-3" />
            <span>+ Cliente Nuevo</span>
          </button>
        </div>
      </div>

      {/* Mode 1: Existing Customer Picker */}
      {mode === 'existing' && (
        <div className="space-y-2.5">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onFocus={() => setIsDropdownOpen(true)}
              onChange={(e) => {
                setSearchQuery(e.target.value);
                setIsDropdownOpen(true);
              }}
              onKeyDown={handleKeyDown}
              placeholder={`Buscar cliente registrado por nombre, cédula o teléfono (${registeredCount} disponibles)...`}
              className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-amber-300/80 bg-amber-50/40 focus:bg-white focus:outline-hidden focus:border-amber-500 text-slate-900 placeholder:text-slate-500"
            />
            {searchQuery && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  setIsDropdownOpen(true);
                  searchInputRef.current?.focus();
                }}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-0.5 cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}

            {isDropdownOpen && (
              <div className="absolute left-0 right-0 z-40 mt-1 bg-white border border-slate-200 rounded-xl shadow-xl max-h-56 overflow-y-auto divide-y divide-slate-100">
                {filteredCustomers.length > 0 ? (
                  <>
                    <div className="px-3 py-1.5 bg-slate-50 text-[10px] font-semibold text-slate-500 flex items-center justify-between sticky top-0 z-10 border-b border-slate-100">
                      <span>
                        {searchQuery.trim()
                          ? `Coincidencias (${filteredCustomers.length})`
                          : `Clientes registrados (${registeredCount})`}
                      </span>
                      <span>Clic o Enter para seleccionar</span>
                    </div>
                    {filteredCustomers.map((c, idx) => {
                      const isHighlighted = idx === highlightedIdx;
                      const isSelected = value.customerId === c.id;
                      return (
                        <button
                          key={c.id}
                          type="button"
                          onMouseDown={(e) => {
                            e.preventDefault();
                            handleSelectCustomer(c);
                          }}
                          onMouseEnter={() => setHighlightedIdx(idx)}
                          className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                            isHighlighted
                              ? 'bg-amber-50 text-slate-950'
                              : isSelected
                              ? 'bg-emerald-50/70 text-slate-900'
                              : 'hover:bg-slate-50 text-slate-800'
                          }`}
                        >
                          <div className="min-w-0 flex-1">
                            <div className="flex items-center gap-1.5">
                              <span className="text-xs font-bold truncate">{c.name}</span>
                              {isSelected && <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />}
                            </div>
                            <div className="flex items-center gap-2 text-[10px] text-slate-500 font-mono mt-0.5 flex-wrap">
                              {c.documentId ? (
                                <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-semibold">
                                  C.I./RIF: {c.documentId}
                                </span>
                              ) : (
                                <span className="text-slate-400">Sin cédula</span>
                              )}
                              {c.phone && c.phone !== 'N/A' && (
                                <span className="flex items-center gap-0.5">
                                  <Phone className="w-2.5 h-2.5 text-slate-400" />
                                  {c.phone}
                                </span>
                              )}
                              {c.city && (
                                <span className="flex items-center gap-0.5 font-sans text-slate-400">
                                  <MapPin className="w-2.5 h-2.5" />
                                  {c.city}
                                </span>
                              )}
                            </div>
                          </div>
                          <span className="text-[10px] font-bold text-amber-700 shrink-0">
                            Seleccionar
                          </span>
                        </button>
                      );
                    })}
                  </>
                ) : (
                  <div className="px-3 py-3 text-center text-[11px] text-slate-500 space-y-2">
                    <p>
                      No se encontró ningún cliente registrado con{' '}
                      <strong className="text-slate-800">"{searchQuery}"</strong>.
                    </p>
                    <button
                      type="button"
                      onMouseDown={(e) => {
                        e.preventDefault();
                        const typed = searchQuery.trim();
                        const looksLikeDoc = /^[VEJvej]-?\d+/.test(typed) || /^\d{6,10}$/.test(typed);
                        const looksLikePhone = /^0?4\d{2}/.test(typed.replace(/\D/g, ''));
                        onModeChange('new');
                        setIsDropdownOpen(false);
                        setSearchQuery('');
                        onChange({
                          customerId: '',
                          customerName: !looksLikeDoc && !looksLikePhone ? typed : '',
                          customerPhone: looksLikePhone ? typed : '',
                          customerDocument: looksLikeDoc ? typed.toUpperCase() : '',
                          customerCity: defaultCity || '',
                          customerAddress: '',
                        });
                      }}
                      className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-[11px] cursor-pointer"
                    >
                      <UserPlus className="w-3.5 h-3.5" />
                      <span>Registrar como Cliente Nuevo</span>
                    </button>
                  </div>
                )}
              </div>
            )}
          </div>

          {selectedCustomer ? (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 text-[11px] text-emerald-950">
              <div className="flex items-center gap-2 min-w-0 flex-wrap">
                <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
                <span>
                  Cliente seleccionado: <strong className="font-bold">{selectedCustomer.name}</strong>
                </span>
                {selectedCustomer.documentId && (
                  <span className="font-mono text-[10px] bg-white px-1.5 py-0.5 rounded border border-emerald-200 text-emerald-800">
                    {selectedCustomer.documentId}
                  </span>
                )}
                {selectedCustomer.phone && selectedCustomer.phone !== 'N/A' && (
                  <span className="font-mono text-[10px] text-emerald-800">
                    · {selectedCustomer.phone}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => {
                    setIsDropdownOpen(true);
                    searchInputRef.current?.focus();
                  }}
                  className="text-[10px] font-bold text-emerald-700 hover:text-emerald-950 underline cursor-pointer"
                >
                  Cambiar
                </button>
                <button
                  type="button"
                  onClick={handleSwitchToNew}
                  className="text-[10px] font-bold text-amber-700 hover:text-amber-950 underline cursor-pointer"
                >
                  + Cliente Nuevo
                </button>
              </div>
            </div>
          ) : (
            <div className="px-3 py-2 rounded-lg bg-slate-50 border border-dashed border-slate-200 text-[11px] text-slate-500 flex items-center justify-between gap-2">
              <span>
                Busca y selecciona un cliente arriba, o haz clic en{' '}
                <strong className="text-slate-700">+ Cliente Nuevo</strong> si es primera vez que visita el taller.
              </span>
            </div>
          )}
        </div>
      )}

      {/* Mode 2: New Customer Info Banner */}
      {mode === 'new' && (
        <div className="space-y-2">
          <div className="flex items-center justify-between gap-2 px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 text-[11px] text-amber-950">
            <div className="flex items-center gap-2">
              <UserPlus className="w-4 h-4 text-amber-600 shrink-0" />
              <span>
                <strong>Cliente Nuevo:</strong> al guardar la orden, este cliente quedará guardado automáticamente en la base de datos de clientes.
              </span>
            </div>
          </div>

          {duplicateMatchInNewMode && (
            <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg bg-blue-50 border border-blue-200 text-[11px] text-blue-950">
              <span>
                Ya existe un cliente registrado con esos datos:{' '}
                <strong>{duplicateMatchInNewMode.name}</strong>{' '}
                ({duplicateMatchInNewMode.documentId || 'Sin C.I.'} · {duplicateMatchInNewMode.phone})
              </span>
              <button
                type="button"
                onClick={() => handleSelectCustomer(duplicateMatchInNewMode)}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 text-white font-bold rounded-md text-[10px] cursor-pointer shrink-0"
              >
                Usar este cliente
              </button>
            </div>
          )}
        </div>
      )}

      {/* Customer Editable Fields */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Nombre Completo *</label>
          <input
            type="text"
            required
            value={value.customerName}
            onChange={(e) => onChange({ ...value, customerName: e.target.value })}
            placeholder="Ej. Carlos Rodríguez"
            className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 text-xs"
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Celular / WhatsApp *</label>
          <input
            type="tel"
            required
            value={value.customerPhone}
            onChange={(e) => onChange({ ...value, customerPhone: e.target.value })}
            placeholder="Ej. 04141234567"
            className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 font-mono text-xs"
          />
        </div>
        <div>
          <label className="block font-semibold text-slate-700 mb-1">Cédula / RIF</label>
          <input
            type="text"
            value={value.customerDocument}
            onChange={(e) => onChange({ ...value, customerDocument: e.target.value })}
            placeholder="Ej. V-19874521"
            className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 font-mono text-xs"
          />
        </div>
      </div>

      {mode === 'new' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Ciudad (Opcional)</label>
            <input
              type="text"
              value={value.customerCity}
              onChange={(e) => onChange({ ...value, customerCity: e.target.value })}
              placeholder={defaultCity ? `Ej. ${defaultCity}` : 'Ej. Valencia'}
              className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 text-xs"
            />
          </div>
          <div>
            <label className="block font-semibold text-slate-700 mb-1">Dirección / Sector (Opcional)</label>
            <input
              type="text"
              value={value.customerAddress}
              onChange={(e) => onChange({ ...value, customerAddress: e.target.value })}
              placeholder="Ej. Urb. La Viña, Calle 3"
              className="w-full p-2 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 text-xs"
            />
          </div>
        </div>
      )}
    </div>
  );
};

interface ServicePartsPickerProps {
  products: Product[];
  selectedParts: SaleItem[];
  bcvRate: number;
  onAddInventoryPart: (product: Product, qty: number) => void;
  onAddCustomPart: (name: string, unitPriceUSD: number, qty: number) => void;
  validateStock?: boolean;
}

const ServicePartsPicker: React.FC<ServicePartsPickerProps> = ({
  products,
  selectedParts,
  bcvRate,
  onAddInventoryPart,
  onAddCustomPart,
  validateStock = true,
}) => {
  const [sourceMode, setSourceMode] = useState<'INVENTORY' | 'CUSTOM'>('INVENTORY');
  const [partSearch, setPartSearch] = useState('');
  const [qtyByProduct, setQtyByProduct] = useState<Record<string, number>>({});
  const [customName, setCustomName] = useState('');
  const [customPrice, setCustomPrice] = useState('');
  const [customQty, setCustomQty] = useState(1);
  const [localError, setLocalError] = useState<string | null>(null);

  const selectedQtyMap = useMemo(() => {
    const map = new Map<string, number>();
    selectedParts.forEach((item) => {
      if (item.productId) {
        map.set(item.productId, (map.get(item.productId) || 0) + (Number(item.quantity) || 0));
      }
    });
    return map;
  }, [selectedParts]);

  const matchingProducts = useMemo(() => {
    const q = normalizeText(partSearch);
    const tokens = q.split(/\s+/).filter(Boolean);

    const scored = products
      .map((p) => {
        const nameNorm = normalizeText(p.name);
        const skuNorm = normalizeText(p.sku);
        const barcodeNorm = normalizeText(p.barcode);
        const brandNorm = normalizeText(p.brand);
        const compatNorm = normalizeText(p.compatibility);
        const locNorm = normalizeText(p.warehouseLocation);
        const catNorm = normalizeText(p.category);
        const combined = `${nameNorm} ${skuNorm} ${barcodeNorm} ${brandNorm} ${compatNorm} ${locNorm} ${catNorm}`;

        if (tokens.length === 0) {
          return { product: p, score: p.stock > 0 ? 10 : 1 };
        }

        if (!tokens.every((t) => combined.includes(t))) {
          return { product: p, score: 0 };
        }

        let score = 40;
        if (skuNorm === q || barcodeNorm === q) score += 100;
        else if (nameNorm.startsWith(q)) score += 70;
        else if (nameNorm.includes(q)) score += 50;
        if (p.stock > 0) score += 15;
        return { product: p, score };
      })
      .filter((entry) => entry.score > 0)
      .sort((a, b) => b.score - a.score || b.product.stock - a.product.stock || a.product.name.localeCompare(b.product.name, 'es'));

    return scored.slice(0, 35).map((entry) => entry.product);
  }, [products, partSearch]);

  const handleClickAddInventory = (prod: Product) => {
    setLocalError(null);
    const qty = Math.max(1, Number(qtyByProduct[prod.id]) || 1);
    const alreadyUsed = selectedQtyMap.get(prod.id) || 0;
    const remaining = prod.stock - alreadyUsed;

    if (validateStock && qty > remaining) {
      setLocalError(
        remaining <= 0
          ? `"${prod.name}" ya no tiene stock disponible (${prod.stock} en almacén, ${alreadyUsed} en la orden).`
          : `Stock insuficiente para "${prod.name}". Disponibles restantes: ${remaining}.`
      );
      return;
    }

    onAddInventoryPart(prod, qty);
    setQtyByProduct((prev) => ({ ...prev, [prod.id]: 1 }));
  };

  const handleClickAddCustom = () => {
    setLocalError(null);
    const trimmedName = customName.trim();
    const price = parseFloat(customPrice) || 0;
    const qty = Math.max(1, Number(customQty) || 1);

    if (!trimmedName) {
      setLocalError('Escribe el nombre del repuesto o insumo no guardado.');
      return;
    }
    if (price <= 0) {
      setLocalError('Ingresa un precio válido en USD ($) mayor a 0.');
      return;
    }

    onAddCustomPart(trimmedName, price, qty);
    setCustomName('');
    setCustomPrice('');
    setCustomQty(1);
  };

  return (
    <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-3">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
        <span className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
          <Boxes className="w-3.5 h-3.5 text-amber-600" />
          <span>Agregar Repuesto / Insumo a la Orden:</span>
        </span>

        <div className="flex items-center gap-1 bg-white p-0.5 rounded-lg border border-slate-200 text-[11px] self-start sm:self-auto">
          <button
            type="button"
            onClick={() => {
              setSourceMode('INVENTORY');
              setLocalError(null);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              sourceMode === 'INVENTORY'
                ? 'bg-slate-900 text-amber-400 shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            Buscar en Almacén ({products.filter((p) => p.stock > 0).length})
          </button>
          <button
            type="button"
            onClick={() => {
              setSourceMode('CUSTOM');
              setLocalError(null);
            }}
            className={`px-2.5 py-1 rounded-md font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              sourceMode === 'CUSTOM'
                ? 'bg-amber-500 text-slate-950 font-bold shadow-2xs'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            + Repuesto No Guardado
          </button>
        </div>
      </div>

      {localError && (
        <div className="px-3 py-2 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium flex items-center justify-between gap-2">
          <span>{localError}</span>
          <button
            type="button"
            onClick={() => setLocalError(null)}
            className="text-rose-500 hover:text-rose-700 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {sourceMode === 'INVENTORY' ? (
        <div className="space-y-2">
          <div className="relative">
            <Search className="w-3.5 h-3.5 text-amber-600 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input
              type="text"
              value={partSearch}
              onChange={(e) => setPartSearch(e.target.value)}
              placeholder="Buscar repuesto en almacén por nombre, SKU, código de barra, marca, moto o estante..."
              className="w-full pl-8 pr-8 py-2 text-xs rounded-lg border border-slate-300 bg-white focus:outline-hidden focus:border-amber-500 text-slate-900 placeholder:text-slate-400"
            />
            {partSearch && (
              <button
                type="button"
                onClick={() => setPartSearch('')}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                title="Limpiar búsqueda"
              >
                <X className="w-3.5 h-3.5" />
              </button>
            )}
          </div>

          <div className="bg-white border border-slate-200 rounded-xl max-h-52 overflow-y-auto divide-y divide-slate-100 shadow-2xs">
            {matchingProducts.length > 0 ? (
              matchingProducts.map((prod) => {
                const alreadyInOrder = selectedQtyMap.get(prod.id) || 0;
                const availableNow = prod.stock - alreadyInOrder;
                const rowQty = Math.max(1, Number(qtyByProduct[prod.id]) || 1);
                const isOutOfStock = validateStock ? availableNow <= 0 : prod.stock <= 0;

                return (
                  <div
                    key={prod.id}
                    className={`px-3 py-2 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs transition-colors ${
                      isOutOfStock ? 'bg-slate-50/70 opacity-75' : 'hover:bg-amber-50/50'
                    }`}
                  >
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-bold text-slate-900 whitespace-normal break-words">{prod.name}</span>
                        <span className="font-mono text-[10px] bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded border border-slate-200">
                          {prod.sku}
                        </span>
                        {prod.brand && (
                          <span className="text-[10px] text-slate-500 font-medium">· {prod.brand}</span>
                        )}
                      </div>
                      {prod.description && (
                        <p className="text-[10px] text-slate-500 whitespace-normal break-words leading-snug mt-0.5">
                          {prod.description}
                        </p>
                      )}
                      <div className="flex items-center gap-2 text-[10px] text-slate-500 mt-0.5 flex-wrap">
                        <span
                          className={`font-bold px-1.5 py-0.5 rounded tabular-nums ${
                            availableNow > 3
                              ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                              : availableNow > 0
                              ? 'bg-amber-50 text-amber-800 border border-amber-200'
                              : 'bg-rose-50 text-rose-700 border border-rose-200'
                          }`}
                        >
                          Stock: {prod.stock}
                          {alreadyInOrder > 0 ? ` (${alreadyInOrder} en orden)` : ''}
                        </span>
                        {prod.warehouseLocation && (
                          <span className="text-slate-600 font-medium">
                            Ubicación: {prod.warehouseLocation}
                          </span>
                        )}
                        {prod.compatibility && (
                          <span className="text-slate-400 whitespace-normal break-words">
                            Compat: {prod.compatibility}
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex items-center justify-between sm:justify-end gap-2 shrink-0">
                      <div className="text-right">
                        <span className="font-mono font-bold text-slate-900 block tabular-nums">
                          {formatUSD(prod.salePrice)}
                        </span>
                        <span className="font-mono text-[10px] text-emerald-700 block tabular-nums">
                          {formatBs(prod.salePrice * bcvRate)}
                        </span>
                      </div>

                      <input
                        type="number"
                        min={1}
                        max={validateStock ? Math.max(1, availableNow) : undefined}
                        value={rowQty}
                        onChange={(e) =>
                          setQtyByProduct((prev) => ({
                            ...prev,
                            [prod.id]: Math.max(1, Number(e.target.value) || 1),
                          }))
                        }
                        className="w-12 p-1.5 text-center font-mono font-bold text-xs rounded-lg border border-slate-200 bg-slate-50"
                        title="Cantidad"
                      />

                      <button
                        type="button"
                        onClick={() => handleClickAddInventory(prod)}
                        disabled={isOutOfStock}
                        className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg text-[11px] transition-colors cursor-pointer disabled:opacity-40 disabled:cursor-not-allowed flex items-center gap-1 whitespace-nowrap"
                      >
                        <Plus className="w-3 h-3 text-amber-400" />
                        <span>Agregar</span>
                      </button>
                    </div>
                  </div>
                );
              })
            ) : (
              <div className="p-4 text-center text-xs text-slate-500 space-y-2">
                <p>
                  No se encontró ningún repuesto en almacén con{' '}
                  <strong className="text-slate-800">"{partSearch}"</strong>.
                </p>
                <button
                  type="button"
                  onClick={() => {
                    setSourceMode('CUSTOM');
                    setCustomName(partSearch.trim());
                  }}
                  className="inline-flex items-center gap-1 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-[11px] cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar "{partSearch.trim() || 'repuesto'}" como No Guardado</span>
                </button>
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-2">
          <p className="text-[11px] text-slate-600">
            Agrega un repuesto o insumo que no está guardado en el inventario del almacén (no descuenta stock).
          </p>
          <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
            <div className="sm:col-span-6">
              <input
                type="text"
                value={customName}
                onChange={(e) => setCustomName(e.target.value)}
                placeholder="Nombre del repuesto (ej. Kit de empacaduras, Rolinera, Tornillo...)"
                className="w-full p-2 rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div className="sm:col-span-3">
              <div className="flex items-center bg-white border border-slate-300 rounded-lg px-2 py-1.5">
                <span className="text-slate-400 text-xs font-mono mr-1">$</span>
                <input
                  type="number"
                  step="any"
                  min="0"
                  value={customPrice}
                  onChange={(e) => setCustomPrice(e.target.value)}
                  placeholder="Precio USD"
                  className="w-full font-mono font-bold text-xs focus:outline-hidden"
                />
              </div>
              {parseFloat(customPrice) > 0 && (
                <span className="text-[10px] text-emerald-700 font-mono block mt-0.5">
                  = {formatBs((parseFloat(customPrice) || 0) * bcvRate)}
                </span>
              )}
            </div>
            <div className="sm:col-span-1">
              <input
                type="number"
                min={1}
                value={customQty}
                onChange={(e) => setCustomQty(Math.max(1, Number(e.target.value) || 1))}
                title="Cantidad"
                className="w-full p-2 text-center font-mono font-bold rounded-lg border border-slate-300 bg-white text-xs"
              />
            </div>
            <div className="sm:col-span-2">
              <button
                type="button"
                onClick={handleClickAddCustom}
                className="w-full py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1 text-xs whitespace-nowrap"
              >
                <Plus className="w-3.5 h-3.5" />
                <span>Agregar</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

interface SelectedPartsTableProps {
  parts: SaleItem[];
  bcvRate: number;
  onUpdateQty: (index: number, newQty: number) => void;
  onUpdatePrice: (index: number, newPrice: number) => void;
  onRemove: (index: number) => void;
  emptyText?: string;
}

const SelectedPartsTable: React.FC<SelectedPartsTableProps> = ({
  parts,
  bcvRate,
  onUpdateQty,
  onUpdatePrice,
  onRemove,
  emptyText = 'No hay repuestos asignados a esta orden. Busca en el almacén o agrega repuestos externos arriba.',
}) => {
  if (parts.length === 0) {
    return (
      <div className="p-4 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center text-slate-400 text-xs">
        {emptyText}
      </div>
    );
  }

  return (
    <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs bg-white">
      <table className="w-full text-left border-collapse text-xs">
        <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
          <tr>
            <th className="py-2 px-3">Repuesto / Pieza</th>
            <th className="py-2 px-3 w-28 text-center">Cantidad</th>
            <th className="py-2 px-3 w-28 text-right">Precio Unit ($)</th>
            <th className="py-2 px-3 w-32 text-right">Total ($ / Bs)</th>
            <th className="py-2 px-3 w-12 text-center">Acción</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100">
          {parts.map((item, pIdx) => (
            <tr key={`${item.productId || item.sku || item.name}-${pIdx}`} className="hover:bg-slate-50 transition-colors">
              <td className="py-2 px-3">
                <span className="font-semibold text-slate-900 block">{item.name}</span>
                <div className="flex items-center gap-1.5 mt-0.5 flex-wrap">
                  <span
                    className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      item.productId
                        ? 'bg-emerald-50 text-emerald-700 border border-emerald-200'
                        : 'bg-amber-50 text-amber-800 border border-amber-200'
                    }`}
                  >
                    <Tag className="w-2.5 h-2.5" />
                    <span>{item.productId ? 'Almacén' : 'No guardado / Externo'}</span>
                  </span>
                  {item.sku && (
                    <span className="text-[10px] text-slate-400 font-mono">{item.sku}</span>
                  )}
                </div>
              </td>

              <td className="py-2 px-3 text-center">
                <div className="inline-flex items-center gap-1 bg-white border border-slate-200 rounded-md p-0.5">
                  <button
                    type="button"
                    onClick={() => onUpdateQty(pIdx, item.quantity - 1)}
                    className="w-5 h-5 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded cursor-pointer font-bold"
                  >
                    -
                  </button>
                  <span className="font-mono font-bold w-6 text-center text-xs tabular-nums">
                    {item.quantity}
                  </span>
                  <button
                    type="button"
                    onClick={() => onUpdateQty(pIdx, item.quantity + 1)}
                    className="w-5 h-5 flex items-center justify-center text-slate-500 hover:bg-slate-100 rounded cursor-pointer font-bold"
                  >
                    +
                  </button>
                </div>
              </td>

              <td className="py-2 px-3 text-right">
                <div className="inline-flex items-center gap-0.5">
                  <span className="text-slate-400 font-mono text-[10px]">$</span>
                  <input
                    type="number"
                    step="any"
                    min="0"
                    value={item.unitPrice}
                    onChange={(e) => onUpdatePrice(pIdx, parseFloat(e.target.value) || 0)}
                    className="w-16 p-1 text-right font-mono font-bold text-xs border border-slate-200 rounded bg-white tabular-nums"
                  />
                </div>
              </td>

              <td className="py-2 px-3 text-right">
                <span className="font-mono font-bold text-slate-950 block tabular-nums">
                  {formatUSD(item.total)}
                </span>
                <span className="font-mono text-[10px] text-emerald-700 block tabular-nums">
                  {formatBs(item.total * bcvRate)}
                </span>
              </td>

              <td className="py-2 px-3 text-center">
                <button
                  type="button"
                  onClick={() => onRemove(pIdx)}
                  className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                  title="Eliminar repuesto"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
};

interface TechnicianSearchPickerProps {
  technicians: Technician[];
  selectedId?: string;
  selectedName?: string;
  onSelect: (tech: { id: string; name: string; phone: string } | null) => void;
  onOpenCreateTech?: (prefillName?: string) => void;
  placeholder?: string;
  emptyOptionLabel?: string;
  size?: 'sm' | 'md';
}

const TechnicianSearchPicker: React.FC<TechnicianSearchPickerProps> = ({
  technicians,
  selectedId,
  selectedName,
  onSelect,
  onOpenCreateTech,
  placeholder = 'Buscar técnico registrado...',
  emptyOptionLabel,
  size = 'md',
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [highlightedIdx, setHighlightedIdx] = useState(0);
  const [menuStyle, setMenuStyle] = useState<React.CSSProperties>({});

  const triggerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const activeTechnicians = useMemo(
    () =>
      [...technicians]
        .filter((t) => t.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [technicians]
  );

  const matchedTech = useMemo(() => {
    if (selectedId) {
      const byId = technicians.find((t) => t.id === selectedId);
      if (byId) return byId;
    }
    const cleanName = (selectedName || '').trim();
    if (cleanName) {
      const norm = normalizeText(cleanName);
      return technicians.find((t) => normalizeText(t.name) === norm);
    }
    return undefined;
  }, [technicians, selectedId, selectedName]);

  const filteredTechnicians = useMemo(() => {
    const qText = normalizeText(query);
    if (!qText) return activeTechnicians;

    const tokens = qText.split(/\s+/).filter(Boolean);
    const qDigits = normalizePhoneDigits(query);

    return activeTechnicians
      .map((t) => {
        const nameNorm = normalizeText(t.name);
        const specNorm = normalizeText(t.specialty);
        const docNorm = normalizeDoc(t.documentId).toLowerCase();
        const phoneDigits = normalizePhoneDigits(t.phone);
        const combined = `${nameNorm} ${specNorm} ${docNorm} ${phoneDigits}`;

        const matchesTokens =
          tokens.length > 0 && tokens.every((tok) => combined.includes(tok));
        const matchesDigits = qDigits.length >= 2 && phoneDigits.includes(qDigits);

        if (!matchesTokens && !matchesDigits) {
          return { tech: t, score: 0 };
        }

        let score = 40;
        if (nameNorm === qText) score += 120;
        else if (nameNorm.startsWith(qText)) score += 90;
        else if (nameNorm.includes(qText)) score += 65;
        if (specNorm.includes(qText)) score += 25;
        return { tech: t, score };
      })
      .filter((item) => item.score > 0)
      .sort((a, b) => b.score - a.score || a.tech.name.localeCompare(b.tech.name, 'es'))
      .map((item) => item.tech);
  }, [activeTechnicians, query]);

  const updatePosition = () => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportHeight = window.innerHeight;
    const viewportWidth = window.innerWidth;
    const desiredWidth = Math.max(rect.width, size === 'sm' ? 275 : 310);
    const clampedWidth = Math.min(desiredWidth, viewportWidth - 16);
    const left = Math.max(8, Math.min(rect.left, viewportWidth - clampedWidth - 8));

    const estimatedMenuHeight = 290;
    const spaceBelow = viewportHeight - rect.bottom;
    const openAbove = spaceBelow < estimatedMenuHeight && rect.top > spaceBelow;

    setMenuStyle(
      openAbove
        ? {
            position: 'fixed',
            bottom: viewportHeight - rect.top + 4,
            left,
            width: clampedWidth,
            zIndex: 100,
          }
        : {
            position: 'fixed',
            top: rect.bottom + 4,
            left,
            width: clampedWidth,
            zIndex: 100,
          }
    );
  };

  useEffect(() => {
    if (!isOpen) return;
    updatePosition();
    const timer = window.setTimeout(() => {
      searchInputRef.current?.focus();
    }, 10);

    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        triggerRef.current?.contains(target) ||
        dropdownRef.current?.contains(target)
      ) {
        return;
      }
      setIsOpen(false);
    };

    const handleScrollOrResize = () => {
      updatePosition();
    };

    document.addEventListener('mousedown', handleOutsideClick);
    window.addEventListener('scroll', handleScrollOrResize, true);
    window.addEventListener('resize', handleScrollOrResize);
    return () => {
      window.clearTimeout(timer);
      document.removeEventListener('mousedown', handleOutsideClick);
      window.removeEventListener('scroll', handleScrollOrResize, true);
      window.removeEventListener('resize', handleScrollOrResize);
    };
  }, [isOpen]);

  useEffect(() => {
    setHighlightedIdx(0);
  }, [query, isOpen]);

  const handleChoose = (tech: Technician) => {
    onSelect({ id: tech.id, name: tech.name, phone: tech.phone || '' });
    setQuery('');
    setIsOpen(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Escape') {
      e.preventDefault();
      setIsOpen(false);
      return;
    }
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setHighlightedIdx((prev) =>
        filteredTechnicians.length > 0 ? (prev + 1) % filteredTechnicians.length : 0
      );
      return;
    }
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      setHighlightedIdx((prev) =>
        filteredTechnicians.length > 0
          ? (prev - 1 + filteredTechnicians.length) % filteredTechnicians.length
          : 0
      );
      return;
    }
    if (e.key === 'Enter') {
      e.preventDefault();
      const target = filteredTechnicians[highlightedIdx] || filteredTechnicians[0];
      if (target) {
        handleChoose(target);
      }
    }
  };

  const displayName = matchedTech?.name || (selectedName || '').trim();
  const hasSelection = Boolean(displayName);

  return (
    <div ref={triggerRef} className="relative w-full">
      <div
        role="button"
        tabIndex={0}
        onClick={() => {
          setIsOpen((prev) => !prev);
        }}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            setIsOpen((prev) => !prev);
          }
        }}
        className={`w-full flex items-center justify-between gap-1.5 rounded-lg border transition-colors cursor-pointer select-none ${
          isOpen
            ? 'border-amber-500 bg-white ring-2 ring-amber-500/20'
            : hasSelection
            ? 'border-slate-300 bg-white hover:border-amber-400'
            : 'border-slate-300 bg-slate-50 hover:bg-white hover:border-amber-400'
        } ${size === 'sm' ? 'px-2 py-1.5 text-[11px]' : 'px-3 py-2 text-xs'}`}
        title={displayName || placeholder}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <Search
            className={`${
              size === 'sm' ? 'w-3 h-3' : 'w-3.5 h-3.5'
            } ${hasSelection ? 'text-amber-600' : 'text-slate-400'} shrink-0`}
          />
          {hasSelection ? (
            <span className="font-semibold text-slate-900 truncate">
              {displayName}
            </span>
          ) : (
            <span className="text-slate-400 truncate">{placeholder}</span>
          )}
          {matchedTech && size === 'md' && (
            <span className="hidden sm:inline-block shrink-0 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-mono font-bold text-amber-800">
              {matchedTech.commissionRate}%
            </span>
          )}
        </div>

        <div className="flex items-center gap-1 shrink-0">
          {hasSelection && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onSelect(null);
                setQuery('');
              }}
              className="p-0.5 text-slate-400 hover:text-rose-600 rounded cursor-pointer"
              title="Quitar técnico seleccionado"
            >
              <X className="w-3 h-3" />
            </button>
          )}
          <ChevronDown
            className={`w-3.5 h-3.5 text-slate-400 transition-transform ${
              isOpen ? 'rotate-180 text-amber-600' : ''
            }`}
          />
        </div>
      </div>

      {isOpen &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            ref={dropdownRef}
            style={menuStyle}
            className="bg-white border border-slate-200 rounded-xl shadow-2xl overflow-hidden animate-in fade-in duration-100"
          >
            {/* Search Input Header */}
            <div className="p-2 border-b border-slate-100 bg-slate-50">
              <div className="relative">
                <Search className="w-3.5 h-3.5 text-amber-600 absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={query}
                  onChange={(e) => setQuery(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Buscar técnico por nombre, especialidad o tel..."
                  className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-slate-300 bg-white text-slate-900 placeholder:text-slate-400 focus:outline-hidden focus:border-amber-500"
                />
                {query && (
                  <button
                    type="button"
                    onClick={() => {
                      setQuery('');
                      searchInputRef.current?.focus();
                    }}
                    className="absolute right-2 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                )}
              </div>
            </div>

            {/* Option to reset / inherit order technician */}
            {emptyOptionLabel && (
              <button
                type="button"
                onClick={() => {
                  onSelect(null);
                  setQuery('');
                  setIsOpen(false);
                }}
                className="w-full text-left px-3 py-1.5 text-[11px] font-medium text-slate-600 hover:bg-slate-50 border-b border-slate-100 cursor-pointer flex items-center justify-between"
              >
                <span>{emptyOptionLabel}</span>
                {!hasSelection && <Check className="w-3 h-3 text-amber-600" />}
              </button>
            )}

            {/* Filtered Registered Technicians */}
            <div className="max-h-52 overflow-y-auto divide-y divide-slate-100">
              {filteredTechnicians.length > 0 ? (
                filteredTechnicians.map((tech, idx) => {
                  const isSelected =
                    matchedTech?.id === tech.id ||
                    (!matchedTech && normalizeText(selectedName) === normalizeText(tech.name));
                  const isHighlighted = idx === highlightedIdx;

                  return (
                    <button
                      key={tech.id}
                      type="button"
                      onMouseEnter={() => setHighlightedIdx(idx)}
                      onClick={() => handleChoose(tech)}
                      className={`w-full text-left px-3 py-2 flex items-center justify-between gap-2 transition-colors cursor-pointer ${
                        isSelected
                          ? 'bg-amber-50/90'
                          : isHighlighted
                          ? 'bg-slate-50'
                          : 'bg-white hover:bg-slate-50'
                      }`}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <span className="font-bold text-slate-900 text-xs truncate">
                            {tech.name}
                          </span>
                          <span className="px-1.5 py-0.5 rounded bg-slate-100 border border-slate-200 font-mono text-[10px] font-bold text-slate-700">
                            {tech.commissionRate}%
                          </span>
                        </div>
                        <div className="text-[10px] text-slate-500 flex items-center gap-2 mt-0.5 truncate">
                          {tech.specialty && <span>{tech.specialty}</span>}
                          {tech.phone && (
                            <span className="font-mono text-slate-400">· {tech.phone}</span>
                          )}
                        </div>
                      </div>
                      {isSelected && (
                        <Check className="w-4 h-4 text-amber-600 shrink-0" />
                      )}
                    </button>
                  );
                })
              ) : (
                <div className="px-3 py-4 text-center text-[11px] text-slate-500 space-y-2">
                  <p>
                    {activeTechnicians.length === 0
                      ? 'No hay técnicos preguardados todavía.'
                      : `No se encontró ningún técnico para "${query}".`}
                  </p>
                </div>
              )}
            </div>

            {onOpenCreateTech && (
              <div className="p-2 border-t border-slate-100 bg-slate-50">
                <button
                  type="button"
                  onClick={() => {
                    const typed = query.trim();
                    setIsOpen(false);
                    setQuery('');
                    onOpenCreateTech(typed || undefined);
                  }}
                  className="w-full py-1.5 px-2.5 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] flex items-center justify-center gap-1.5 cursor-pointer transition-colors"
                >
                  <UserPlus className="w-3.5 h-3.5" />
                  <span>
                    {query.trim()
                      ? `+ Pre-guardar "${query.trim()}"`
                      : '+ Pre-guardar Nuevo Técnico'}
                  </span>
                </button>
              </div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
};

interface ServiceTechnicianSelectorProps {
  technicians: Technician[];
  selectedId: string;
  selectedName: string;
  selectedPhone: string;
  onChange: (next: { id: string; name: string; phone: string }) => void;
  onOpenCreateTech: (prefillName?: string) => void;
  onOpenEditTech: (tech: Technician) => void;
}

const ServiceTechnicianSelector: React.FC<ServiceTechnicianSelectorProps> = ({
  technicians,
  selectedId,
  selectedName,
  selectedPhone,
  onChange,
  onOpenCreateTech,
  onOpenEditTech,
}) => {
  const activeTechnicians = useMemo(
    () =>
      [...technicians]
        .filter((t) => t.active !== false)
        .sort((a, b) => a.name.localeCompare(b.name, 'es')),
    [technicians]
  );

  const matchedTech = useMemo(() => {
    if (selectedId) {
      const byId = technicians.find((t) => t.id === selectedId);
      if (byId) return byId;
    }
    if (selectedName.trim()) {
      const norm = normalizeText(selectedName);
      return technicians.find((t) => normalizeText(t.name) === norm);
    }
    return undefined;
  }, [technicians, selectedId, selectedName]);

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between gap-2">
        <label className="font-semibold text-slate-700 flex items-center gap-1.5">
          <Wrench className="w-3.5 h-3.5 text-amber-600" />
          <span>Técnico Principal Asignado</span>
        </label>
        <button
          type="button"
          onClick={() => onOpenCreateTech()}
          className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-[11px] transition-colors cursor-pointer whitespace-nowrap"
        >
          <UserPlus className="w-3 h-3" />
          <span>+ Pre-guardar Técnico</span>
        </button>
      </div>

      <TechnicianSearchPicker
        technicians={technicians}
        selectedId={selectedId}
        selectedName={selectedName}
        placeholder={
          activeTechnicians.length > 0
            ? 'Buscar técnico registrado por nombre o especialidad...'
            : 'Sin técnicos registrados (haz clic en "+ Pre-guardar Técnico")'
        }
        emptyOptionLabel="-- Sin técnico principal asignado --"
        size="md"
        onSelect={(next) => {
          if (!next) {
            onChange({ id: '', name: '', phone: '' });
          } else {
            onChange(next);
          }
        }}
        onOpenCreateTech={(prefill) => onOpenCreateTech(prefill)}
      />

      {/* Quick chips when there are saved technicians */}
      {activeTechnicians.length > 0 && (
        <div className="flex flex-wrap gap-1">
          {activeTechnicians.slice(0, 6).map((t) => {
            const isSelected = matchedTech?.id === t.id;
            return (
              <button
                key={t.id}
                type="button"
                onClick={() => onChange({ id: t.id, name: t.name, phone: t.phone || '' })}
                className={`px-2 py-0.5 rounded-md text-[10px] font-semibold cursor-pointer border transition-colors ${
                  isSelected
                    ? 'bg-slate-900 text-amber-400 border-slate-900'
                    : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {t.name} ({t.commissionRate}%)
              </button>
            );
          })}
        </div>
      )}

      {/* Info strip of selected pre-saved technician */}
      {matchedTech ? (
        <div className="px-3 py-2 rounded-lg bg-emerald-50 border border-emerald-200 flex flex-wrap items-center justify-between gap-2 text-[11px]">
          <div className="flex items-center gap-2 flex-wrap text-emerald-950">
            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="font-bold">{matchedTech.name}</span>
            {matchedTech.specialty && (
              <span className="text-emerald-800">· {matchedTech.specialty}</span>
            )}
            <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-white border border-emerald-200 font-mono text-[10px] font-bold text-emerald-800">
              {matchedTech.commissionRate}% com.
            </span>
            {hasValidWhatsAppPhone(matchedTech.phone) ? (
              <span className="font-mono text-[10px] text-emerald-800 flex items-center gap-1">
                <Phone className="w-2.5 h-2.5" />
                {matchedTech.phone}
              </span>
            ) : (
              <span className="text-amber-800 bg-amber-100 px-1.5 py-0.5 rounded text-[10px] font-semibold">
                Sin WhatsApp registrado
              </span>
            )}
          </div>
          <button
            type="button"
            onClick={() => onOpenEditTech(matchedTech)}
            className="text-[10px] font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer shrink-0"
          >
            Editar datos
          </button>
        </div>
      ) : selectedName.trim() ? (
        <div className="px-3 py-2 rounded-lg bg-amber-50 border border-amber-200 flex items-center justify-between gap-2 text-[11px] text-amber-900">
          <span>
            Técnico asignado manual: <strong>{selectedName}</strong>
            {selectedPhone ? ` (${selectedPhone})` : ''}
          </span>
          <button
            type="button"
            onClick={() => onOpenCreateTech(selectedName)}
            className="text-[10px] font-bold underline cursor-pointer shrink-0"
          >
            Guardar en catálogo
          </button>
        </div>
      ) : null}
    </div>
  );
};

export const ServiceOrdersView: React.FC = () => {
  const {
    serviceOrders,
    createServiceOrder,
    updateServiceOrderStatus,
    updateServiceOrder,
    deleteServiceOrder,
    products,
    customers,
    technicians,
    addTechnician,
    updateTechnician,
    settings,
    setWhatsappModalData,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [isNewOrderModalOpen, setIsNewOrderModalOpen] = useState(false);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);

  const rate = settings.bcvRate;

  // Quick Pre-save / Edit Technician Modal State
  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [editingTechRecord, setEditingTechRecord] = useState<Technician | null>(null);
  const [techModalTarget, setTechModalTarget] = useState<
    | { kind: 'create-order' }
    | { kind: 'edit-order' }
    | { kind: 'create-service-adder' }
    | { kind: 'edit-service-adder' }
    | { kind: 'create-service-row'; index: number }
    | { kind: 'edit-service-row'; index: number }
  >({ kind: 'create-order' });
  const [techModalError, setTechModalError] = useState<string | null>(null);
  const [techForm, setTechForm] = useState({
    name: '',
    phone: '',
    documentId: '',
    specialty: 'Mecánica General',
    commissionRate: 50,
    notes: '',
  });

  // New Order Form state (Venezuela)
  const initialOrderForm = {
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerDocument: '',
    customerCity: '',
    customerAddress: '',
    plate: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
    mileage: 0,
    fuelLevel: '1/2' as FuelLevel,
    serviceType: 'Mecánica General' as WorkshopServiceType,
    reportedIssue: '',
    diagnosis: '',
    assignedTechnician: '',
    assignedTechnicianId: '',
    assignedTechnicianPhone: '',
    estimatedDelivery: 'Hoy 6:00 PM',
    laborCostUSD: 15,
    selectedParts: [] as SaleItem[],
    servicesList: [] as ServiceItem[],
    notifyTechnicianOnCreate: true,
  };

  const [orderForm, setOrderForm] = useState(initialOrderForm);
  const [newCustomerMode, setNewCustomerMode] = useState<'existing' | 'new'>('existing');
  const [newOrderError, setNewOrderError] = useState<string | null>(null);

  // Edit Order Modal & Form State
  const [editingOrder, setEditingOrder] = useState<ServiceOrder | null>(null);
  const [isEditModalOpen, setIsEditModalOpen] = useState(false);
  const [editSuccessMessage, setEditSuccessMessage] = useState<string | null>(null);
  const [editCustomerMode, setEditCustomerMode] = useState<'existing' | 'new'>('existing');
  const [editOrderError, setEditOrderError] = useState<string | null>(null);

  const [editForm, setEditForm] = useState({
    id: '',
    orderNumber: '',
    customerId: '',
    customerName: '',
    customerPhone: '',
    customerDocument: '',
    customerCity: '',
    customerAddress: '',
    plate: '',
    brand: '',
    model: '',
    year: new Date().getFullYear(),
    color: '',
    mileage: 0,
    fuelLevel: '1/2' as FuelLevel,
    serviceType: 'Mecánica General' as WorkshopServiceType,
    reportedIssue: '',
    diagnosis: '',
    assignedTechnician: '',
    assignedTechnicianId: '',
    assignedTechnicianPhone: '',
    estimatedDelivery: '',
    status: 'CREADA' as ServiceOrderStatus,
    notes: '',
    selectedParts: [] as SaleItem[],
    servicesList: [] as ServiceItem[],
    laborCost: 0,
  });

  // New Order Services controls
  const [newServiceName, setNewServiceName] = useState('');
  const [newServiceCost, setNewServiceCost] = useState<string>('');
  const [newServiceTech, setNewServiceTech] = useState('');
  const [newServiceTechId, setNewServiceTechId] = useState('');

  // Edit Services controls
  const [editServiceName, setEditServiceName] = useState('');
  const [editServiceCost, setEditServiceCost] = useState<string>('');
  const [editServiceTech, setEditServiceTech] = useState('');
  const [editServiceTechId, setEditServiceTechId] = useState('');

  // Presets of common workshop services in Venezuela
  const WORKSHOP_SERVICE_PRESETS = [
    { name: 'Cambio de Aceite y Filtro', cost: 5 },
    { name: 'Sincronización y Limpieza de Carburador', cost: 15 },
    { name: 'Mantenimiento y Graduación de Frenos', cost: 10 },
    { name: 'Tapicería de Asiento (Cuero Antiresbalante)', cost: 30 },
    { name: 'Revisión y Reparación Sistema Eléctrico', cost: 15 },
    { name: 'Cambio de Banda / Pastillas de Freno', cost: 8 },
    { name: 'Mantenimiento Preventivo General', cost: 25 },
    { name: 'Bajada y Armado de Motor Completo', cost: 50 },
    { name: 'Cambio de Kit de Arrastre (Cadena/Corona/Piñón)', cost: 10 },
    { name: 'Cambio de Guayas de Embrague / Acelerador', cost: 6 },
  ];

  const serviceTypes: WorkshopServiceType[] = [
    'Mecánica General',
    'Tapicería y Asientos',
    'Mantenimiento Preventivo',
    'Sistema Eléctrico',
    'Frenos y Suspensión',
    'Personalización y Modificación',
  ];

  const filteredOrders = useMemo(() => {
    return serviceOrders.filter((order) => {
      if (statusFilter !== 'all' && order.status !== statusFilter) return false;
      if (typeFilter !== 'all' && order.serviceType !== typeFilter) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          order.orderNumber.toLowerCase().includes(q) ||
          order.customerName.toLowerCase().includes(q) ||
          order.customerPhone.includes(q) ||
          order.motorcycle.plate.toLowerCase().includes(q) ||
          order.motorcycle.model.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [serviceOrders, statusFilter, typeFilter, searchTerm]);

  const handleUpdateStatus = (order: ServiceOrder, newStatus: ServiceOrderStatus) => {
    const updated = updateServiceOrderStatus(order.id, newStatus);
    if (updated) {
      const isCulminada = newStatus === 'CULMINADA';
      if (isCulminada) {
        downloadServiceOrderPDF(updated, settings).catch((err) =>
          console.warn('Error generando factura PDF de orden culminada:', err)
        );
      }

      const { message, url } = buildServiceStatusWhatsAppMessage(updated, settings);
      setWhatsappModalData({
        title: isCulminada
          ? `Orden #${updated.orderNumber} Culminada · Factura PDF lista`
          : `Notificación WhatsApp #${updated.orderNumber}`,
        message,
        url,
        phone: updated.customerPhone,
        recipientName: updated.customerName,
        ...(isCulminada || newStatus === 'ENTREGADA' ? { serviceOrder: updated } : {}),
      });
    }
  };

  const resolveTechnicianForOrder = (order: Pick<ServiceOrder, 'assignedTechnicianId' | 'assignedTechnician' | 'assignedTechnicianPhone'>) => {
    const byId = order.assignedTechnicianId
      ? technicians.find((t) => t.id === order.assignedTechnicianId)
      : undefined;
    if (byId) return byId;
    const rawName = (order.assignedTechnician || '').trim();
    if (rawName) {
      const byName = technicians.find((t) => normalizeText(t.name) === normalizeText(rawName));
      if (byName) return byName;
    }
    return undefined;
  };

  const handleOpenCreateTechModal = (
    target:
      | { kind: 'create-order' }
      | { kind: 'edit-order' }
      | { kind: 'create-service-adder' }
      | { kind: 'edit-service-adder' }
      | { kind: 'create-service-row'; index: number }
      | { kind: 'edit-service-row'; index: number },
    prefillName?: string
  ) => {
    setTechModalTarget(target);
    setEditingTechRecord(null);
    setTechModalError(null);
    const defaultName =
      (prefillName || '').trim() ||
      (target.kind === 'create-order'
        ? orderForm.assignedTechnician.trim()
        : target.kind === 'edit-order'
        ? editForm.assignedTechnician.trim()
        : '');
    const isEditModalTarget =
      target.kind === 'edit-order' ||
      target.kind === 'edit-service-adder' ||
      target.kind === 'edit-service-row';
    setTechForm({
      name:
        defaultName && !technicians.some((t) => normalizeText(t.name) === normalizeText(defaultName))
          ? defaultName
          : '',
      phone: '',
      documentId: '',
      specialty: isEditModalTarget ? editForm.serviceType : orderForm.serviceType,
      commissionRate: 50,
      notes: '',
    });
    setIsTechModalOpen(true);
  };

  const handleOpenEditTechModal = (tech: Technician, targetForm: 'create' | 'edit') => {
    setTechModalTarget({ kind: targetForm === 'create' ? 'create-order' : 'edit-order' });
    setEditingTechRecord(tech);
    setTechModalError(null);
    setTechForm({
      name: tech.name,
      phone: tech.phone || '',
      documentId: tech.documentId || '',
      specialty: tech.specialty || 'Mecánica General',
      commissionRate: tech.commissionRate,
      notes: tech.notes || '',
    });
    setIsTechModalOpen(true);
  };

  const handleSaveQuickTech = (e: React.FormEvent) => {
    e.preventDefault();
    const cleanName = techForm.name.trim();
    const cleanPhone = techForm.phone.trim();
    if (!cleanName) {
      setTechModalError('Ingresa el nombre completo del técnico.');
      return;
    }
    if (!hasValidWhatsAppPhone(cleanPhone)) {
      setTechModalError('Ingresa un teléfono WhatsApp válido para notificarle al técnico.');
      return;
    }
    const rateVal = Math.max(0, Math.min(100, Number(techForm.commissionRate) || 0));

    let savedTech: Technician;
    if (editingTechRecord) {
      updateTechnician(editingTechRecord.id, {
        name: cleanName,
        phone: cleanPhone,
        documentId: techForm.documentId.trim() || undefined,
        specialty: techForm.specialty.trim() || 'Mecánica General',
        commissionRate: rateVal,
        notes: techForm.notes.trim() || undefined,
      });
      savedTech = {
        ...editingTechRecord,
        name: cleanName,
        phone: cleanPhone,
        documentId: techForm.documentId.trim() || undefined,
        specialty: techForm.specialty.trim() || 'Mecánica General',
        commissionRate: rateVal,
        notes: techForm.notes.trim() || undefined,
      };
    } else {
      savedTech = addTechnician({
        name: cleanName,
        phone: cleanPhone,
        documentId: techForm.documentId.trim() || undefined,
        specialty: techForm.specialty.trim() || 'Mecánica General',
        commissionRate: rateVal,
        active: true,
        notes: techForm.notes.trim() || undefined,
      });
    }

    if (techModalTarget.kind === 'create-order') {
      setOrderForm((prev) => ({
        ...prev,
        assignedTechnician: savedTech.name,
        assignedTechnicianId: savedTech.id,
        assignedTechnicianPhone: savedTech.phone,
      }));
      setNewServiceTech(savedTech.name);
      setNewServiceTechId(savedTech.id);
    } else if (techModalTarget.kind === 'edit-order') {
      setEditForm((prev) => ({
        ...prev,
        assignedTechnician: savedTech.name,
        assignedTechnicianId: savedTech.id,
        assignedTechnicianPhone: savedTech.phone,
      }));
      setEditServiceTech(savedTech.name);
      setEditServiceTechId(savedTech.id);
    } else if (techModalTarget.kind === 'create-service-adder') {
      setNewServiceTech(savedTech.name);
      setNewServiceTechId(savedTech.id);
    } else if (techModalTarget.kind === 'edit-service-adder') {
      setEditServiceTech(savedTech.name);
      setEditServiceTechId(savedTech.id);
    } else if (techModalTarget.kind === 'create-service-row') {
      handleUpdateServiceTechnicianInNewOrder(techModalTarget.index, {
        id: savedTech.id,
        name: savedTech.name,
        phone: savedTech.phone,
      });
    } else if (techModalTarget.kind === 'edit-service-row') {
      handleUpdateServiceTechnicianInEdit(techModalTarget.index, {
        id: savedTech.id,
        name: savedTech.name,
        phone: savedTech.phone,
      });
    }

    setIsTechModalOpen(false);
    setEditSuccessMessage(
      editingTechRecord
        ? `Datos del técnico "${savedTech.name}" actualizados.`
        : `Técnico "${savedTech.name}" preguardado y seleccionado.`
    );
    setTimeout(() => setEditSuccessMessage(null), 4000);
  };

  const handleOpenNewOrderModal = () => {
    setOrderForm(initialOrderForm);
    setNewCustomerMode(
      customers.some((c) => normalizeText(c.name) !== 'cliente mostrador') ? 'existing' : 'new'
    );
    setNewServiceName('');
    setNewServiceCost('');
    setNewServiceTech('');
    setNewServiceTechId('');
    setNewOrderError(null);
    setIsNewOrderModalOpen(true);
  };

  const handleAddInventoryPartToNewOrder = (prod: Product, qty: number) => {
    setNewOrderError(null);
    setOrderForm((prev) => {
      const existingIdx = prev.selectedParts.findIndex((p) => p.productId === prod.id);
      if (existingIdx >= 0) {
        const nextParts = [...prev.selectedParts];
        const nextQty = nextParts[existingIdx].quantity + qty;
        nextParts[existingIdx] = {
          ...nextParts[existingIdx],
          quantity: nextQty,
          total: nextParts[existingIdx].unitPrice * nextQty,
        };
        return { ...prev, selectedParts: nextParts };
      }
      const item: SaleItem = {
        productId: prod.id,
        sku: prod.sku,
        name: prod.name,
        category: prod.category,
        quantity: qty,
        unitPrice: prod.salePrice,
        total: prod.salePrice * qty,
      };
      return { ...prev, selectedParts: [...prev.selectedParts, item] };
    });
  };

  const handleAddCustomPartToNewOrder = (name: string, unitPriceUSD: number, qty: number) => {
    setNewOrderError(null);
    const item: SaleItem = {
      sku: `REP-EXT-${Date.now().toString().slice(-4)}`,
      name,
      category: 'Accesorios',
      quantity: qty,
      unitPrice: unitPriceUSD,
      total: unitPriceUSD * qty,
    };
    setOrderForm((prev) => ({
      ...prev,
      selectedParts: [...prev.selectedParts, item],
    }));
  };

  const handleUpdatePartQtyInNewOrder = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemovePartFromOrder(index);
      return;
    }
    const target = orderForm.selectedParts[index];
    if (target?.productId) {
      const prod = products.find((p) => p.id === target.productId);
      if (prod && newQty > prod.stock) {
        setNewOrderError(`Stock máximo disponible para "${prod.name}": ${prod.stock} unidades.`);
        return;
      }
    }
    setNewOrderError(null);
    setOrderForm((prev) => {
      const nextParts = [...prev.selectedParts];
      const item = nextParts[index];
      nextParts[index] = {
        ...item,
        quantity: newQty,
        total: item.unitPrice * newQty,
      };
      return { ...prev, selectedParts: nextParts };
    });
  };

  const handleUpdatePartPriceInNewOrder = (index: number, newPrice: number) => {
    setOrderForm((prev) => {
      const nextParts = [...prev.selectedParts];
      const item = nextParts[index];
      nextParts[index] = {
        ...item,
        unitPrice: newPrice,
        total: newPrice * item.quantity,
      };
      return { ...prev, selectedParts: nextParts };
    });
  };

  const handleRemovePartFromOrder = (index: number) => {
    setOrderForm((prev) => ({
      ...prev,
      selectedParts: prev.selectedParts.filter((_, i) => i !== index),
    }));
  };

  const handleAddServiceToNewOrder = (name?: string, cost?: number) => {
    setNewOrderError(null);
    const sName = (name || newServiceName).trim();
    const sCost = cost !== undefined ? cost : parseFloat(String(newServiceCost)) || 0;

    if (!sName) {
      setNewOrderError('Ingresa el nombre del servicio o reparación.');
      return;
    }
    if (sCost <= 0) {
      setNewOrderError('Ingresa el costo del servicio en USD.');
      return;
    }

    const pickedTech = resolveTechnicianForOrder({
      assignedTechnicianId: newServiceTechId || orderForm.assignedTechnicianId,
      assignedTechnician: newServiceTech || orderForm.assignedTechnician,
    });

    const newService: ServiceItem = {
      id: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: sName,
      cost: sCost,
      technician: pickedTech?.name || newServiceTech.trim() || orderForm.assignedTechnician || undefined,
      technicianId: pickedTech?.id || newServiceTechId || orderForm.assignedTechnicianId || undefined,
    };

    setOrderForm((prev) => {
      const nextServices = [...prev.servicesList, newService];
      const totalLabor = nextServices.reduce((sum, s) => sum + s.cost, 0);
      return {
        ...prev,
        servicesList: nextServices,
        laborCostUSD: totalLabor,
      };
    });

    setNewServiceName('');
    setNewServiceCost('');
  };

  const handleRemoveServiceFromNewOrder = (index: number) => {
    setOrderForm((prev) => {
      const nextServices = prev.servicesList.filter((_, i) => i !== index);
      const totalLabor =
        nextServices.length > 0 ? nextServices.reduce((sum, s) => sum + s.cost, 0) : prev.laborCostUSD;
      return {
        ...prev,
        servicesList: nextServices,
        laborCostUSD: totalLabor,
      };
    });
  };

  const handleUpdateServiceCostInNewOrder = (index: number, newCost: number) => {
    setOrderForm((prev) => {
      const nextServices = [...prev.servicesList];
      nextServices[index] = { ...nextServices[index], cost: newCost };
      const totalLabor = nextServices.reduce((sum, s) => sum + s.cost, 0);
      return {
        ...prev,
        servicesList: nextServices,
        laborCostUSD: totalLabor,
      };
    });
  };

  const handleUpdateServiceTechnicianInNewOrder = (
    index: number,
    tech: { id: string; name: string; phone: string } | null
  ) => {
    setOrderForm((prev) => {
      const nextServices = [...prev.servicesList];
      nextServices[index] = {
        ...nextServices[index],
        technician: tech ? tech.name : undefined,
        technicianId: tech ? tech.id : undefined,
      };
      return {
        ...prev,
        servicesList: nextServices,
      };
    });
  };

  const handleCreateOrder = (e: React.FormEvent) => {
    e.preventDefault();
    if (!orderForm.customerName.trim() || !orderForm.customerPhone.trim() || !orderForm.plate.trim()) {
      setNewOrderError('Por favor completa nombre del cliente, teléfono de WhatsApp y placa de la moto.');
      return;
    }
    setNewOrderError(null);

    const normDoc = normalizeDoc(orderForm.customerDocument);
    const normPhone = normalizePhoneDigits(orderForm.customerPhone);
    const normName = normalizeText(orderForm.customerName);
    const existedBefore =
      Boolean(orderForm.customerId && customers.some((c) => c.id === orderForm.customerId)) ||
      customers.some(
        (c) =>
          (normDoc && normalizeDoc(c.documentId) === normDoc) ||
          (normPhone.length >= 7 && normalizePhoneDigits(c.phone) === normPhone) ||
          normalizeText(c.name) === normName
      );

    const partsTotalUSD = orderForm.selectedParts.reduce((sum, p) => sum + p.total, 0);
    const laborTotalUSD =
      orderForm.servicesList.length > 0
        ? orderForm.servicesList.reduce((sum, s) => sum + s.cost, 0)
        : Number(orderForm.laborCostUSD);
    const totalCostUSD = partsTotalUSD + laborTotalUSD;

    const motorcycle: Motorcycle = {
      plate: orderForm.plate.toUpperCase().trim(),
      brand: orderForm.brand.trim() || 'Bera',
      model: orderForm.model.trim() || 'SBR 150',
      year: Number(orderForm.year),
      color: orderForm.color.trim() || 'Negro',
      mileage: Number(orderForm.mileage),
    };

    const assignedTechRecord = resolveTechnicianForOrder({
      assignedTechnicianId: orderForm.assignedTechnicianId,
      assignedTechnician: orderForm.assignedTechnician,
      assignedTechnicianPhone: orderForm.assignedTechnicianPhone,
    });

    const resolvedTechName = assignedTechRecord?.name || orderForm.assignedTechnician.trim();
    const resolvedTechId = assignedTechRecord?.id || orderForm.assignedTechnicianId || undefined;
    const resolvedTechPhone = assignedTechRecord?.phone || orderForm.assignedTechnicianPhone || undefined;

    const newOrder = createServiceOrder({
      customerId: orderForm.customerId || '',
      customerName: orderForm.customerName.trim(),
      customerPhone: orderForm.customerPhone.trim(),
      customerDocument: orderForm.customerDocument.trim() || undefined,
      customerCity: orderForm.customerCity.trim() || undefined,
      customerAddress: orderForm.customerAddress.trim() || undefined,
      motorcycle,
      serviceType: orderForm.serviceType,
      fuelLevel: orderForm.fuelLevel,
      reportedIssue: orderForm.reportedIssue.trim(),
      diagnosis: orderForm.diagnosis.trim() || undefined,
      partsUsed: orderForm.selectedParts,
      servicesList: orderForm.servicesList.length > 0 ? orderForm.servicesList : undefined,
      laborCost: laborTotalUSD,
      totalCost: totalCostUSD,
      status: 'CREADA',
      assignedTechnician: resolvedTechName || undefined,
      assignedTechnicianId: resolvedTechId,
      assignedTechnicianPhone: resolvedTechPhone,
      estimatedDelivery: orderForm.estimatedDelivery,
    });

    const shouldNotifyTech = Boolean(orderForm.notifyTechnicianOnCreate && resolvedTechName);

    setIsNewOrderModalOpen(false);
    setOrderForm(initialOrderForm);

    if (!existedBefore) {
      setEditSuccessMessage(
        `¡Orden #${newOrder.orderNumber} creada! Cliente "${newOrder.customerName}" guardado en la base de datos de clientes.`
      );
      setTimeout(() => setEditSuccessMessage(null), 5000);
    }

    // Build notifications for Client AND Assigned Technician
    const customerNotif = buildServiceStatusWhatsAppMessage(newOrder, settings);
    const techPayload = shouldNotifyTech
      ? buildTechnicianAssignedOrderWhatsAppMessage(
          newOrder,
          assignedTechRecord || {
            name: resolvedTechName,
            phone: resolvedTechPhone || '',
            commissionRate: 0,
            specialty: newOrder.serviceType,
          },
          settings
        )
      : null;

    setWhatsappModalData({
      title: `Orden ${newOrder.orderNumber} Creada · Notificar a Cliente`,
      message: customerNotif.message,
      url: customerNotif.url,
      phone: newOrder.customerPhone,
      recipientName: newOrder.customerName,
      primaryLabel: '1. Cliente',
      ...(techPayload
        ? {
            secondaryNotification: {
              label: '2. Técnico Asignado',
              title: `Orden ${newOrder.orderNumber} · Notificar al Técnico`,
              message: techPayload.message,
              url: techPayload.url,
              phone: resolvedTechPhone || '',
              recipientName: resolvedTechName,
              isTechnician: true,
            },
          }
        : {}),
    });
  };

  const handleOpenEditModal = (order: ServiceOrder) => {
    setEditingOrder(order);
    setEditOrderError(null);

    const matchedTech = resolveTechnicianForOrder(order);

    let initialServices: ServiceItem[] = [];
    if (order.servicesList && order.servicesList.length > 0) {
      initialServices = order.servicesList.map((s) => {
        const srvTech = resolveTechnicianForOrder({
          assignedTechnicianId: s.technicianId,
          assignedTechnician: s.technician,
        });
        return {
          ...s,
          technician: srvTech?.name || s.technician,
          technicianId: srvTech?.id || s.technicianId,
        };
      });
    } else if (order.laborCost > 0) {
      initialServices = [
        {
          id: `srv-${Date.now()}-1`,
          name: `Mano de Obra (${order.serviceType})`,
          cost: order.laborCost,
          technician: matchedTech?.name || order.assignedTechnician,
          technicianId: matchedTech?.id || order.assignedTechnicianId,
        },
      ];
    }

    // Match linked registered customer by id, documentId, phone, or name
    const matchedCustomer =
      (order.customerId && customers.find((c) => c.id === order.customerId)) ||
      customers.find(
        (c) =>
          (order.customerDocument &&
            normalizeDoc(c.documentId) === normalizeDoc(order.customerDocument)) ||
          (order.customerPhone &&
            normalizePhoneDigits(c.phone) === normalizePhoneDigits(order.customerPhone)) ||
          normalizeText(c.name) === normalizeText(order.customerName)
      );

    setEditCustomerMode(matchedCustomer || customers.length > 0 ? 'existing' : 'new');

    setEditForm({
      id: order.id,
      orderNumber: order.orderNumber,
      customerId: matchedCustomer?.id || order.customerId || '',
      customerName: order.customerName,
      customerPhone: order.customerPhone,
      customerDocument: order.customerDocument || matchedCustomer?.documentId || '',
      customerCity: matchedCustomer?.city || '',
      customerAddress: matchedCustomer?.address || '',
      plate: order.motorcycle.plate,
      brand: order.motorcycle.brand,
      model: order.motorcycle.model,
      year: order.motorcycle.year || new Date().getFullYear(),
      color: order.motorcycle.color,
      mileage: order.motorcycle.mileage || 0,
      fuelLevel: order.fuelLevel,
      serviceType: order.serviceType,
      reportedIssue: order.reportedIssue,
      diagnosis: order.diagnosis || '',
      assignedTechnician: matchedTech?.name || order.assignedTechnician || '',
      assignedTechnicianId: matchedTech?.id || order.assignedTechnicianId || '',
      assignedTechnicianPhone: matchedTech?.phone || order.assignedTechnicianPhone || '',
      estimatedDelivery: order.estimatedDelivery || '',
      status: order.status,
      notes: order.notes || '',
      selectedParts: (order.partsUsed || []).map((p) => ({ ...p })),
      servicesList: initialServices,
      laborCost: order.laborCost,
    });

    setEditServiceName('');
    setEditServiceCost('');
    setEditServiceTech(matchedTech?.name || order.assignedTechnician || '');
    setEditServiceTechId(matchedTech?.id || order.assignedTechnicianId || '');

    setIsEditModalOpen(true);
  };

  const handleAddInventoryPartToEditOrder = (prod: Product, qty: number) => {
    setEditOrderError(null);
    setEditForm((prev) => {
      const existingIdx = prev.selectedParts.findIndex((p) => p.productId === prod.id);
      if (existingIdx >= 0) {
        const nextParts = [...prev.selectedParts];
        const nextQty = nextParts[existingIdx].quantity + qty;
        nextParts[existingIdx] = {
          ...nextParts[existingIdx],
          quantity: nextQty,
          total: nextParts[existingIdx].unitPrice * nextQty,
        };
        return { ...prev, selectedParts: nextParts };
      }
      const item: SaleItem = {
        productId: prod.id,
        sku: prod.sku,
        name: prod.name,
        category: prod.category,
        quantity: qty,
        unitPrice: prod.salePrice,
        total: prod.salePrice * qty,
      };
      return { ...prev, selectedParts: [...prev.selectedParts, item] };
    });
  };

  const handleAddCustomPartToEditOrder = (name: string, unitPriceUSD: number, qty: number) => {
    setEditOrderError(null);
    const item: SaleItem = {
      sku: `REP-EXT-${Date.now().toString().slice(-4)}`,
      name,
      category: 'Accesorios',
      quantity: qty,
      unitPrice: unitPriceUSD,
      total: unitPriceUSD * qty,
    };
    setEditForm((prev) => ({
      ...prev,
      selectedParts: [...prev.selectedParts, item],
    }));
  };

  const handleUpdatePartQtyInEdit = (index: number, newQty: number) => {
    if (newQty <= 0) {
      handleRemovePartFromEdit(index);
      return;
    }
    setEditForm((prev) => {
      const parts = [...prev.selectedParts];
      const p = parts[index];
      parts[index] = {
        ...p,
        quantity: newQty,
        total: p.unitPrice * newQty,
      };
      return { ...prev, selectedParts: parts };
    });
  };

  const handleUpdatePartPriceInEdit = (index: number, newPrice: number) => {
    setEditForm((prev) => {
      const parts = [...prev.selectedParts];
      const p = parts[index];
      parts[index] = {
        ...p,
        unitPrice: newPrice,
        total: newPrice * p.quantity,
      };
      return { ...prev, selectedParts: parts };
    });
  };

  const handleRemovePartFromEdit = (index: number) => {
    setEditForm((prev) => ({
      ...prev,
      selectedParts: prev.selectedParts.filter((_, i) => i !== index),
    }));
  };

  const handleAddServiceToEdit = (name?: string, cost?: number) => {
    setEditOrderError(null);
    const sName = (name || editServiceName).trim();
    const sCost = cost !== undefined ? cost : parseFloat(String(editServiceCost)) || 0;

    if (!sName) {
      setEditOrderError('Ingresa el nombre del servicio o reparación.');
      return;
    }
    if (sCost <= 0) {
      setEditOrderError('Ingresa el costo del servicio en USD.');
      return;
    }

    const pickedTech = resolveTechnicianForOrder({
      assignedTechnicianId: editServiceTechId || editForm.assignedTechnicianId,
      assignedTechnician: editServiceTech || editForm.assignedTechnician,
    });

    const newService: ServiceItem = {
      id: `srv-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: sName,
      cost: sCost,
      technician: pickedTech?.name || editServiceTech.trim() || editForm.assignedTechnician || undefined,
      technicianId: pickedTech?.id || editServiceTechId || editForm.assignedTechnicianId || undefined,
    };

    setEditForm((prev) => {
      const nextServices = [...prev.servicesList, newService];
      const totalLabor = nextServices.reduce((sum, s) => sum + s.cost, 0);
      return {
        ...prev,
        servicesList: nextServices,
        laborCost: totalLabor,
      };
    });

    setEditServiceName('');
    setEditServiceCost('');
  };

  const handleRemoveServiceFromEdit = (index: number) => {
    setEditForm((prev) => {
      const nextServices = prev.servicesList.filter((_, i) => i !== index);
      const totalLabor = nextServices.reduce((sum, s) => sum + s.cost, 0);
      return {
        ...prev,
        servicesList: nextServices,
        laborCost: totalLabor,
      };
    });
  };

  const handleUpdateServiceCostInEdit = (index: number, newCost: number) => {
    setEditForm((prev) => {
      const nextServices = [...prev.servicesList];
      nextServices[index] = { ...nextServices[index], cost: newCost };
      const totalLabor = nextServices.reduce((sum, s) => sum + s.cost, 0);
      return {
        ...prev,
        servicesList: nextServices,
        laborCost: totalLabor,
      };
    });
  };

  const handleUpdateServiceTechnicianInEdit = (
    index: number,
    tech: { id: string; name: string; phone: string } | null
  ) => {
    setEditForm((prev) => {
      const nextServices = [...prev.servicesList];
      nextServices[index] = {
        ...nextServices[index],
        technician: tech ? tech.name : undefined,
        technicianId: tech ? tech.id : undefined,
      };
      return {
        ...prev,
        servicesList: nextServices,
      };
    });
  };

  const handleSaveEditOrder = (notifyWhatsApp: boolean) => {
    if (!editForm.customerName.trim() || !editForm.customerPhone.trim() || !editForm.plate.trim()) {
      setEditOrderError('Por favor completa nombre del cliente, teléfono de WhatsApp y placa de la moto.');
      return;
    }
    setEditOrderError(null);

    const normDoc = normalizeDoc(editForm.customerDocument);
    const normPhone = normalizePhoneDigits(editForm.customerPhone);
    const normName = normalizeText(editForm.customerName);
    const existedBefore =
      Boolean(editForm.customerId && customers.some((c) => c.id === editForm.customerId)) ||
      customers.some(
        (c) =>
          (normDoc && normalizeDoc(c.documentId) === normDoc) ||
          (normPhone.length >= 7 && normalizePhoneDigits(c.phone) === normPhone) ||
          normalizeText(c.name) === normName
      );

    const partsTotalUSD = editForm.selectedParts.reduce((sum, p) => sum + p.total, 0);
    const servicesTotalUSD = editForm.servicesList.length > 0
      ? editForm.servicesList.reduce((sum, s) => sum + s.cost, 0)
      : Number(editForm.laborCost || 0);

    const totalCostUSD = partsTotalUSD + servicesTotalUSD;
    const currentRate = settings.bcvRate;
    const totalCostBs = totalCostUSD * currentRate;

    const motorcycle: Motorcycle = {
      plate: editForm.plate.toUpperCase().trim(),
      brand: editForm.brand.trim() || 'Bera',
      model: editForm.model.trim() || 'SBR 150',
      year: Number(editForm.year),
      color: editForm.color.trim() || 'Negro',
      mileage: Number(editForm.mileage),
    };

    const assignedTechRecord = resolveTechnicianForOrder({
      assignedTechnicianId: editForm.assignedTechnicianId,
      assignedTechnician: editForm.assignedTechnician,
      assignedTechnicianPhone: editForm.assignedTechnicianPhone,
    });

    const updated = updateServiceOrder(editForm.id, {
      customerId: editForm.customerId || '',
      customerName: editForm.customerName.trim(),
      customerPhone: editForm.customerPhone.trim(),
      customerDocument: editForm.customerDocument.trim() || undefined,
      customerCity: editForm.customerCity.trim() || undefined,
      customerAddress: editForm.customerAddress.trim() || undefined,
      motorcycle,
      serviceType: editForm.serviceType,
      fuelLevel: editForm.fuelLevel,
      reportedIssue: editForm.reportedIssue.trim(),
      diagnosis: editForm.diagnosis.trim() || undefined,
      status: editForm.status,
      assignedTechnician: assignedTechRecord?.name || editForm.assignedTechnician.trim() || undefined,
      assignedTechnicianId: assignedTechRecord?.id || editForm.assignedTechnicianId || undefined,
      assignedTechnicianPhone: assignedTechRecord?.phone || editForm.assignedTechnicianPhone || undefined,
      estimatedDelivery: editForm.estimatedDelivery,
      partsUsed: editForm.selectedParts,
      servicesList: editForm.servicesList,
      laborCost: servicesTotalUSD,
      totalCost: totalCostUSD,
      totalCostBs,
      notes: editForm.notes.trim() || undefined,
    });

    const becameCulminada =
      editingOrder?.status !== 'CULMINADA' && editForm.status === 'CULMINADA';

    setIsEditModalOpen(false);
    setEditSuccessMessage(
      !existedBefore
        ? `¡Orden #${editForm.orderNumber} actualizada y cliente "${editForm.customerName.trim()}" guardado en la base de datos de clientes!`
        : becameCulminada
        ? `¡Orden #${editForm.orderNumber} marcada como CULMINADA y factura PDF generada!`
        : `¡Orden #${editForm.orderNumber} actualizada con éxito!`
    );
    setTimeout(() => setEditSuccessMessage(null), 4500);

    if (becameCulminada && updated) {
      downloadServiceOrderPDF(updated, settings).catch((err) =>
        console.warn('Error generando factura PDF al culminar orden:', err)
      );
    }

    if ((notifyWhatsApp || becameCulminada) && updated) {
      const { message, url } = buildServiceStatusWhatsAppMessage(updated, settings);
      const includePdf = updated.status === 'CULMINADA' || updated.status === 'ENTREGADA';
      setWhatsappModalData({
        title: becameCulminada
          ? `Orden #${updated.orderNumber} Culminada · Factura PDF lista`
          : `Actualización Orden #${updated.orderNumber} - Notificar WhatsApp`,
        message,
        url,
        phone: updated.customerPhone,
        recipientName: updated.customerName,
        ...(includePdf ? { serviceOrder: updated } : {}),
      });
    }
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
            Taller Mecánico y Tapicería en Venezuela
          </span>
          <h1 className="text-2xl font-bold font-display text-slate-900 mt-0.5">
            Órdenes de Servicio y Reparaciones ($ y Bs)
          </h1>
          <p className="text-xs text-slate-500">
            Registra motos, asigna repuestos y envía notificaciones por WhatsApp en cada fase a tasa oficial BCV (Bs. {rate.toFixed(2)}).
          </p>
        </div>

        <button
          onClick={handleOpenNewOrderModal}
          className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer self-start sm:self-auto"
        >
          <Plus className="w-4 h-4 text-amber-400" />
          <span>Ingresar Motocicleta al Taller</span>
        </button>
      </div>

      {/* Success Notification Toast */}
      {editSuccessMessage && (
        <div className="bg-emerald-500 text-slate-950 font-bold px-4 py-2.5 rounded-xl shadow-xs flex items-center justify-between text-xs animate-in fade-in">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4" />
            <span>{editSuccessMessage}</span>
          </div>
          <button
            onClick={() => setEditSuccessMessage(null)}
            className="p-1 hover:bg-emerald-600/20 rounded cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por placa (ej. AE8C90G), cliente, número de orden o modelo..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
            />
          </div>

          <div className="flex items-center gap-2">
            <select
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 font-medium"
            >
              <option value="all">Todos los estados</option>
              <option value="CREADA">1. Creada / En Espera</option>
              <option value="EN_PROCESO">2. En Proceso</option>
              <option value="CULMINADA">3. Culminada / Lista</option>
              <option value="ENTREGADA">4. Entregada</option>
            </select>

            <select
              value={typeFilter}
              onChange={(e) => setTypeFilter(e.target.value)}
              className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 font-medium"
            >
              <option value="all">Todos los tipos</option>
              {serviceTypes.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </select>
          </div>
        </div>
      </div>

      {/* Orders List / Cards */}
      <div className="space-y-4">
        {filteredOrders.length === 0 ? (
          <div className="bg-white rounded-xl border border-slate-200 p-12 text-center text-slate-500 text-xs">
            {serviceOrders.length === 0 ? (
              <div className="space-y-3">
                <Wrench className="w-10 h-10 text-slate-300 mx-auto" />
                <p className="text-sm font-semibold text-slate-700">No hay órdenes de servicio en el taller</p>
                <p className="text-slate-400 max-w-sm mx-auto">
                  Las órdenes por defecto han sido eliminadas. Las nuevas órdenes que registres quedarán guardadas permanentemente en el servidor.
                </p>
                <button
                  onClick={handleOpenNewOrderModal}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs transition-colors shadow-xs cursor-pointer"
                >
                  <Plus className="w-4 h-4" />
                  <span>Crear Primera Orden de Servicio</span>
                </button>
              </div>
            ) : (
              'No se encontraron órdenes de servicio con los filtros aplicados.'
            )}
          </div>
        ) : (
          filteredOrders.map((order) => {
            const isUpholstery = order.serviceType === 'Tapicería y Asientos';
            const orderRate = order.bcvRate || rate;
            const totalBs = order.totalCostBs || order.totalCost * orderRate;

            return (
              <div
                key={order.id}
                className="bg-white rounded-xl border border-slate-200 p-5 shadow-2xs hover:border-slate-300 transition-colors"
              >
                <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-slate-100">
                  {/* Left: Plate & Customer */}
                  <div className="flex items-start gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center shrink-0 ${isUpholstery ? 'bg-purple-100 text-purple-700' : 'bg-amber-100 text-amber-700'}`}>
                      {isUpholstery ? <Scissors className="w-5 h-5" /> : <Wrench className="w-5 h-5" />}
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-bold text-sm bg-slate-900 text-white px-2 py-0.5 rounded">
                          {order.motorcycle.plate}
                        </span>
                        <span className="font-bold text-slate-900 text-sm">
                          {order.motorcycle.brand} {order.motorcycle.model} ({order.motorcycle.year})
                        </span>
                        <span className="text-slate-400">·</span>
                        <span className="text-xs text-slate-500 font-mono">{order.orderNumber}</span>
                      </div>

                      <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1">
                        <span className="font-semibold text-slate-700">{order.customerName}</span>
                        <span>·</span>
                        <span className="font-mono">{order.customerPhone}</span>
                        <span>·</span>
                        <span>Tipo: <strong className="text-slate-700">{order.serviceType}</strong></span>
                      </div>
                    </div>
                  </div>

                  {/* Right: Status Switcher & WhatsApp Notify */}
                  <div className="flex flex-wrap items-center gap-3">
                    <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
                      <button
                        onClick={() => handleUpdateStatus(order, 'CREADA')}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          order.status === 'CREADA'
                            ? 'bg-amber-500 text-slate-950 shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="Marcar como En Espera"
                      >
                        En Espera
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(order, 'EN_PROCESO')}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          order.status === 'EN_PROCESO'
                            ? 'bg-blue-600 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="Marcar como En Proceso (Notifica al cliente)"
                      >
                        En Proceso
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(order, 'CULMINADA')}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          order.status === 'CULMINADA'
                            ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="Marcar como Culminada (Notifica al cliente que está lista)"
                      >
                        Culminada
                      </button>
                      <button
                        onClick={() => handleUpdateStatus(order, 'ENTREGADA')}
                        className={`px-2.5 py-1 text-[11px] font-semibold rounded-md transition-colors cursor-pointer ${
                          order.status === 'ENTREGADA'
                            ? 'bg-slate-800 text-white shadow-2xs'
                            : 'text-slate-600 hover:text-slate-900'
                        }`}
                        title="Marcar como Entregada"
                      >
                        Entregada
                      </button>
                    </div>

                    <button
                      onClick={() => handleOpenEditModal(order)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-lg text-xs font-bold shadow-xs cursor-pointer transition-colors"
                      title="Editar orden: agregar repuestos o servicios a la orden guardada"
                    >
                      <Edit3 className="w-3.5 h-3.5" />
                      <span>Editar Orden</span>
                    </button>

                    {(order.status === 'CULMINADA' || order.status === 'ENTREGADA') && (
                      <button
                        onClick={() => {
                          downloadServiceOrderPDF(order, settings).catch((err) =>
                            console.warn('Error descargando factura PDF:', err)
                          );
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-xs font-bold shadow-xs cursor-pointer transition-colors"
                        title="Descargar Factura PDF con detalle de trabajo, datos de pago y QR Pago Móvil"
                      >
                        <FileDown className="w-3.5 h-3.5 text-amber-400" />
                        <span>Factura PDF (QR)</span>
                      </button>
                    )}

                    {order.assignedTechnician && (
                      <button
                        onClick={() => {
                          const techRecord = resolveTechnicianForOrder(order);
                          const { message, url } = buildTechnicianAssignedOrderWhatsAppMessage(
                            order,
                            techRecord || {
                              name: order.assignedTechnician || 'Técnico',
                              phone: order.assignedTechnicianPhone || '',
                              commissionRate: 0,
                              specialty: order.serviceType,
                            },
                            settings
                          );
                          setWhatsappModalData({
                            title: `Notificar Técnico · Orden #${order.orderNumber}`,
                            message,
                            url,
                            phone: techRecord?.phone || order.assignedTechnicianPhone || '',
                            recipientName: techRecord?.name || order.assignedTechnician || 'Técnico',
                            isTechnician: true,
                          });
                        }}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 hover:bg-amber-100 text-slate-800 border border-slate-200 hover:border-amber-300 rounded-lg text-xs font-semibold cursor-pointer transition-colors"
                        title="Enviar detalles del trabajo asignado por WhatsApp al técnico"
                      >
                        <Wrench className="w-3.5 h-3.5 text-amber-600" />
                        <span>Notificar Técnico</span>
                      </button>
                    )}

                    <button
                      onClick={() => {
                        const { message, url } = buildServiceStatusWhatsAppMessage(order, settings);
                        const includePdf = order.status === 'CULMINADA' || order.status === 'ENTREGADA';
                        setWhatsappModalData({
                          title: includePdf
                            ? `Factura PDF y Notificación #${order.orderNumber}`
                            : `Notificación WhatsApp #${order.orderNumber}`,
                          message,
                          url,
                          phone: order.customerPhone,
                          recipientName: order.customerName,
                          ...(includePdf ? { serviceOrder: order } : {}),
                        });
                      }}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-lg text-xs font-semibold shadow-xs cursor-pointer"
                      title={
                        order.status === 'CULMINADA' || order.status === 'ENTREGADA'
                          ? 'Enviar factura PDF (con QR) y notificación al WhatsApp del cliente'
                          : 'Enviar estado actual al WhatsApp del cliente'
                      }
                    >
                      <MessageSquare className="w-3.5 h-3.5" />
                      <span>
                        {order.status === 'CULMINADA' || order.status === 'ENTREGADA'
                          ? 'Enviar Factura WhatsApp'
                          : 'Notificar WhatsApp'}
                      </span>
                    </button>

                    {confirmDeleteId === order.id ? (
                      <div className="flex items-center gap-1 bg-red-50 border border-red-200 p-1 rounded-lg">
                        <span className="text-[10px] text-red-700 font-semibold px-1">¿Eliminar?</span>
                        <button
                          onClick={() => {
                            deleteServiceOrder(order.id);
                            setConfirmDeleteId(null);
                          }}
                          className="px-2 py-1 bg-red-600 hover:bg-red-700 text-white rounded text-[11px] font-bold cursor-pointer"
                        >
                          Sí
                        </button>
                        <button
                          onClick={() => setConfirmDeleteId(null)}
                          className="p-1 text-slate-500 hover:text-slate-700 text-[11px] rounded cursor-pointer"
                        >
                          <X className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ) : (
                      <button
                        onClick={() => setConfirmDeleteId(order.id)}
                        className="p-2 text-slate-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition-colors cursor-pointer"
                        title="Eliminar orden de servicio"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    )}
                  </div>
                </div>

                {/* Details grid with USD and Bs */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-4 text-xs">
                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Motivo / Falla Reportada
                    </span>
                    <p className="text-slate-800 font-medium mt-0.5">{order.reportedIssue}</p>
                    {order.diagnosis && (
                      <p className="text-slate-600 mt-1 italic">
                        <strong className="not-italic text-slate-700">Diag: </strong>{order.diagnosis}
                      </p>
                    )}
                  </div>

                  <div>
                    <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                      Datos Técnicos & Moto
                    </span>
                    <p className="text-slate-600 mt-0.5">Color: {order.motorcycle.color} · Gas: {order.fuelLevel}</p>
                    <p className="text-slate-600">Km: {order.motorcycle.mileage.toLocaleString()} km</p>
                    <p className="text-slate-600 mt-0.5 font-medium">
                      Técnico: <strong className="text-slate-900">{order.assignedTechnician || 'Por asignar'}</strong>
                      {(() => {
                        const t = resolveTechnicianForOrder(order);
                        const ph = t?.phone || order.assignedTechnicianPhone;
                        return ph ? <span className="text-slate-400 font-mono text-[11px] ml-1">({ph})</span> : null;
                      })()}
                    </p>
                  </div>

                  <div className="bg-slate-50 p-3 rounded-lg border border-slate-100 flex flex-col justify-between">
                    <div>
                      <div className="flex justify-between text-slate-500 text-[11px]">
                        <span>Mano de Obra / Servicios:</span>
                        <span className="font-mono">{formatUSD(order.laborCost)}</span>
                      </div>
                      <div className="flex justify-between text-slate-500 text-[11px]">
                        <span>Repuestos ({order.partsUsed.length}):</span>
                        <span className="font-mono">
                          {formatUSD(order.partsUsed.reduce((s, p) => s + p.total, 0))}
                        </span>
                      </div>
                    </div>

                    <div className="pt-2 border-t border-slate-200 mt-2">
                      <div className="flex justify-between items-baseline font-bold text-slate-900">
                        <span>Total USD:</span>
                        <span className="font-mono text-sm tabular-nums text-slate-950">
                          {formatUSD(order.totalCost)}
                        </span>
                      </div>
                      <div className="flex justify-between items-baseline text-[11px] text-emerald-700 font-semibold mt-0.5">
                        <span>Equiv. Bs (BCV):</span>
                        <span className="font-mono">{formatBs(totalBs)}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Items & Services Breakdown Row */}
                {(order.partsUsed.length > 0 || (order.servicesList && order.servicesList.length > 0)) && (
                  <div className="mt-3 pt-3 border-t border-slate-100 space-y-2">
                    {order.servicesList && order.servicesList.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0">
                          Servicios ({order.servicesList.length}):
                        </span>
                        {order.servicesList.map((srv, sIdx) => (
                          <span
                            key={sIdx}
                            className="inline-flex items-center gap-1 bg-amber-50 text-amber-900 border border-amber-200 px-2 py-0.5 rounded text-[11px] font-medium"
                          >
                            <Wrench className="w-3 h-3 text-amber-600" />
                            <span>
                              {srv.name} ({formatUSD(srv.cost)})
                            </span>
                            {srv.technician && (
                              <span className="text-amber-700 font-semibold">
                                · {srv.technician}
                              </span>
                            )}
                          </span>
                        ))}
                      </div>
                    )}

                    {order.partsUsed.length > 0 && (
                      <div className="flex flex-wrap items-center gap-1.5">
                        <span className="text-[10px] uppercase font-bold text-slate-400 shrink-0">
                          Repuestos ({order.partsUsed.length}):
                        </span>
                        {order.partsUsed.map((part, pIdx) => (
                          <span
                            key={pIdx}
                            className="inline-flex items-center gap-1 bg-slate-100 text-slate-800 border border-slate-200 px-2 py-0.5 rounded text-[11px] font-medium"
                          >
                            <Boxes className="w-3 h-3 text-slate-500" />
                            <span>{part.quantity}x {part.name} ({formatUSD(part.total)})</span>
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>

      {/* Modal: Ingresar Nueva Orden de Taller */}
      {isNewOrderModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-3xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Wrench className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm font-display">
                  Ingreso de Motocicleta al Taller (Venezuela)
                </h3>
              </div>
              <button
                onClick={() => setIsNewOrderModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleCreateOrder} className="p-6 overflow-y-auto space-y-5 text-xs">
              {newOrderError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-2 text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{newOrderError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setNewOrderError(null)}
                    className="p-0.5 hover:bg-rose-100 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* Customer section */}
              <div className="pb-4 border-b border-slate-200">
                <ServiceCustomerSelector
                  customers={customers}
                  mode={newCustomerMode}
                  onModeChange={setNewCustomerMode}
                  defaultCity={settings.city}
                  value={{
                    customerId: orderForm.customerId,
                    customerName: orderForm.customerName,
                    customerPhone: orderForm.customerPhone,
                    customerDocument: orderForm.customerDocument,
                    customerCity: orderForm.customerCity,
                    customerAddress: orderForm.customerAddress,
                  }}
                  onChange={(next) =>
                    setOrderForm((prev) => ({
                      ...prev,
                      customerId: next.customerId,
                      customerName: next.customerName,
                      customerPhone: next.customerPhone,
                      customerDocument: next.customerDocument,
                      customerCity: next.customerCity,
                      customerAddress: next.customerAddress,
                    }))
                  }
                />
              </div>

              {/* Motorcycle Section */}
              <div className="space-y-3 pb-3 border-b border-slate-200">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Gauge className="w-3.5 h-3.5 text-amber-600" />
                  <span>Ficha Técnica de la Motocicleta</span>
                </h4>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Placa (Venezuela) *</label>
                    <input
                      type="text"
                      required
                      value={orderForm.plate}
                      onChange={(e) => setOrderForm({ ...orderForm, plate: e.target.value.toUpperCase() })}
                      placeholder="Ej. AE8C90G"
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono font-bold"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Marca *</label>
                    <input
                      type="text"
                      required
                      value={orderForm.brand}
                      onChange={(e) => setOrderForm({ ...orderForm, brand: e.target.value })}
                      placeholder="Ej. Bera, Empire, Yamaha"
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Modelo *</label>
                    <input
                      type="text"
                      required
                      value={orderForm.model}
                      onChange={(e) => setOrderForm({ ...orderForm, model: e.target.value })}
                      placeholder="Ej. SBR 150, Horse, Outlook"
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Año</label>
                    <input
                      type="number"
                      value={orderForm.year}
                      onChange={(e) => setOrderForm({ ...orderForm, year: Number(e.target.value) })}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Color de la Moto</label>
                    <input
                      type="text"
                      value={orderForm.color}
                      onChange={(e) => setOrderForm({ ...orderForm, color: e.target.value })}
                      placeholder="Ej. Azul Eléctrico"
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kilometraje Actual</label>
                    <input
                      type="number"
                      value={orderForm.mileage}
                      onChange={(e) => setOrderForm({ ...orderForm, mileage: Number(e.target.value) })}
                      placeholder="Ej. 12500"
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Nivel de Gasolina</label>
                    <select
                      value={orderForm.fuelLevel}
                      onChange={(e) => setOrderForm({ ...orderForm, fuelLevel: e.target.value as FuelLevel })}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-medium"
                    >
                      {FUEL_LEVEL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>

              {/* Service Details */}
              <div className="space-y-3 pb-3 border-b border-slate-200">
                <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                  <Wrench className="w-3.5 h-3.5 text-amber-600" />
                  <span>Tipo de Servicio y Diagnóstico</span>
                </h4>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tipo de Trabajo *</label>
                    <select
                      value={orderForm.serviceType}
                      onChange={(e) => setOrderForm({ ...orderForm, serviceType: e.target.value as WorkshopServiceType })}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-bold text-amber-700"
                    >
                      {serviceTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>

                  <div>
                    <ServiceTechnicianSelector
                      technicians={technicians}
                      selectedId={orderForm.assignedTechnicianId}
                      selectedName={orderForm.assignedTechnician}
                      selectedPhone={orderForm.assignedTechnicianPhone}
                      onChange={(next) => {
                        setOrderForm((prev) => ({
                          ...prev,
                          assignedTechnicianId: next.id,
                          assignedTechnician: next.name,
                          assignedTechnicianPhone: next.phone,
                        }));
                        setNewServiceTech(next.name);
                        setNewServiceTechId(next.id);
                      }}
                      onOpenCreateTech={(prefill) =>
                        handleOpenCreateTechModal({ kind: 'create-order' }, prefill)
                      }
                      onOpenEditTech={(tech) => handleOpenEditTechModal(tech, 'create')}
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Motivo de Ingreso / Solicitud del Cliente *</label>
                  <textarea
                    rows={2}
                    required
                    value={orderForm.reportedIssue}
                    onChange={(e) => setOrderForm({ ...orderForm, reportedIssue: e.target.value })}
                    placeholder="Ej. Falla en freno delantero y retapizado de asiento con cuero náutico..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Diagnóstico Inicial del Taller</label>
                  <textarea
                    rows={2}
                    value={orderForm.diagnosis}
                    onChange={(e) => setOrderForm({ ...orderForm, diagnosis: e.target.value })}
                    placeholder="Observaciones de ingreso, rayones previos, diagnóstico mecánico..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  />
                </div>
              </div>

              {/* Spare parts: Search Warehouse OR Add Custom Unsaved Part */}
              <div className="space-y-3 pb-3 border-b border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Boxes className="w-3.5 h-3.5 text-amber-600" />
                    <span>Repuestos e Insumos ({orderForm.selectedParts.length})</span>
                  </h4>
                  <span className="text-[11px] font-mono font-bold text-slate-700">
                    Subtotal Repuestos: {formatUSD(orderForm.selectedParts.reduce((s, p) => s + p.total, 0))}
                  </span>
                </div>

                <ServicePartsPicker
                  products={products}
                  selectedParts={orderForm.selectedParts}
                  bcvRate={rate}
                  onAddInventoryPart={handleAddInventoryPartToNewOrder}
                  onAddCustomPart={handleAddCustomPartToNewOrder}
                  validateStock={true}
                />

                <SelectedPartsTable
                  parts={orderForm.selectedParts}
                  bcvRate={rate}
                  onUpdateQty={handleUpdatePartQtyInNewOrder}
                  onUpdatePrice={handleUpdatePartPriceInNewOrder}
                  onRemove={handleRemovePartFromOrder}
                />
              </div>

              {/* Services & Labor in USD (with per-service searchable technician picker) */}
              <div className="space-y-3 pb-3 border-b border-slate-200">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <h4 className="font-bold text-slate-900 uppercase tracking-wider text-[11px] flex items-center gap-1.5">
                    <Wrench className="w-3.5 h-3.5 text-amber-600" />
                    <span>Servicios y Reparaciones ({orderForm.servicesList.length})</span>
                  </h4>
                  <span className="text-[11px] font-mono font-bold text-emerald-700">
                    Mano de Obra:{' '}
                    {formatUSD(
                      orderForm.servicesList.length > 0
                        ? orderForm.servicesList.reduce((s, srv) => s + srv.cost, 0)
                        : Number(orderForm.laborCostUSD)
                    )}
                  </span>
                </div>

                {/* Quick Presets */}
                <div className="flex flex-wrap gap-1.5">
                  {WORKSHOP_SERVICE_PRESETS.map((preset, prIdx) => (
                    <button
                      key={prIdx}
                      type="button"
                      onClick={() => handleAddServiceToNewOrder(preset.name, preset.cost)}
                      className="inline-flex items-center gap-1 px-2 py-1 bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-900 border border-slate-200 hover:border-amber-300 rounded-lg text-[11px] transition-colors cursor-pointer font-medium"
                    >
                      <Plus className="w-3 h-3 text-amber-500" />
                      <span>{preset.name}</span>
                      <strong className="text-amber-700 font-mono">(${preset.cost})</strong>
                    </button>
                  ))}
                </div>

                {/* Custom Service Adder with Searchable Technician Picker */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 space-y-2">
                  <span className="font-semibold text-slate-700 text-[11px] block">
                    Agregar Servicio con Buscador de Técnico Registrado:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        value={newServiceName}
                        onChange={(e) => setNewServiceName(e.target.value)}
                        placeholder="Descripción del trabajo..."
                        className="w-full p-2 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="flex items-center bg-white border border-slate-300 rounded-lg px-2 py-1.5">
                        <span className="text-slate-400 text-xs font-mono mr-1">$</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={newServiceCost}
                          onChange={(e) => setNewServiceCost(e.target.value)}
                          placeholder="0.00"
                          className="w-full font-mono font-bold text-xs focus:outline-hidden"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-4">
                      <TechnicianSearchPicker
                        technicians={technicians}
                        selectedId={newServiceTechId}
                        selectedName={newServiceTech}
                        placeholder="Buscar técnico para el servicio..."
                        emptyOptionLabel="Usar técnico principal de la orden"
                        size="sm"
                        onSelect={(next) => {
                          setNewServiceTech(next ? next.name : '');
                          setNewServiceTechId(next ? next.id : '');
                        }}
                        onOpenCreateTech={(prefill) =>
                          handleOpenCreateTechModal({ kind: 'create-service-adder' }, prefill)
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => handleAddServiceToNewOrder()}
                        className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5 text-amber-400" />
                        <span>Agregar</span>
                      </button>
                    </div>
                  </div>
                </div>

                {orderForm.servicesList.length > 0 && (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-2 px-3">Servicio</th>
                          <th className="py-2 px-3 w-56">Técnico Asignado (Buscador)</th>
                          <th className="py-2 px-3 w-28 text-right">Costo ($)</th>
                          <th className="py-2 px-3 w-10 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {orderForm.servicesList.map((srv, sIdx) => (
                          <tr key={srv.id || sIdx} className="hover:bg-slate-50">
                            <td className="py-2 px-3 font-semibold text-slate-900">{srv.name}</td>
                            <td className="py-2 px-3">
                              <TechnicianSearchPicker
                                technicians={technicians}
                                selectedId={srv.technicianId}
                                selectedName={srv.technician}
                                placeholder="Buscar técnico..."
                                emptyOptionLabel="Sin técnico específico"
                                size="sm"
                                onSelect={(next) =>
                                  handleUpdateServiceTechnicianInNewOrder(sIdx, next)
                                }
                                onOpenCreateTech={(prefill) =>
                                  handleOpenCreateTechModal(
                                    { kind: 'create-service-row', index: sIdx },
                                    prefill
                                  )
                                }
                              />
                            </td>
                            <td className="py-2 px-3 text-right">
                              <div className="inline-flex items-center gap-0.5 justify-end">
                                <span className="text-slate-400 font-mono text-[10px]">$</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={srv.cost}
                                  onChange={(e) =>
                                    handleUpdateServiceCostInNewOrder(
                                      sIdx,
                                      parseFloat(e.target.value) || 0
                                    )
                                  }
                                  className="w-16 p-1 text-right font-mono font-bold text-xs border border-slate-200 rounded bg-white"
                                />
                              </div>
                            </td>
                            <td className="py-2 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveServiceFromNewOrder(sIdx)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                                title="Eliminar servicio"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">
                      {orderForm.servicesList.length > 0
                        ? 'Total Mano de Obra ($ USD) (Calculado por servicios)'
                        : 'Mano de Obra ($ USD) *'}
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      readOnly={orderForm.servicesList.length > 0}
                      value={
                        orderForm.servicesList.length > 0
                          ? orderForm.servicesList.reduce((s, srv) => s + srv.cost, 0)
                          : orderForm.laborCostUSD
                      }
                      onChange={(e) =>
                        setOrderForm({ ...orderForm, laborCostUSD: Number(e.target.value) })
                      }
                      className={`w-full p-2.5 rounded-lg border border-slate-200 font-mono font-bold ${
                        orderForm.servicesList.length > 0
                          ? 'bg-emerald-50 text-emerald-950'
                          : 'bg-slate-50'
                      }`}
                    />
                    <span className="text-[10px] text-emerald-700 font-mono">
                      = {formatBs(
                        (orderForm.servicesList.length > 0
                          ? orderForm.servicesList.reduce((s, srv) => s + srv.cost, 0)
                          : Number(orderForm.laborCostUSD)) * rate
                      )} a tasa BCV
                    </span>
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Fecha / Hora Estimada de Entrega</label>
                    <input
                      type="text"
                      value={orderForm.estimatedDelivery}
                      onChange={(e) => setOrderForm({ ...orderForm, estimatedDelivery: e.target.value })}
                      placeholder="Ej. Hoy 5:00 PM, Mañana 11 AM"
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                    />
                  </div>
                </div>
              </div>

              {/* Notify technician toggle */}
              {orderForm.assignedTechnician.trim() && (
                <label className="flex items-center gap-2.5 p-3 rounded-xl bg-amber-50 border border-amber-200 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={orderForm.notifyTechnicianOnCreate}
                    onChange={(e) =>
                      setOrderForm({ ...orderForm, notifyTechnicianOnCreate: e.target.checked })
                    }
                    className="w-4 h-4 rounded accent-amber-500 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 block">
                      Preparar notificación WhatsApp para el técnico ({orderForm.assignedTechnician})
                    </span>
                    <span className="text-[11px] text-slate-600">
                      Al guardar la orden, se abrirán listas las notificaciones tanto para el cliente como para el técnico asignado.
                    </span>
                  </div>
                </label>
              )}

              {/* Modal footer with dual total */}
              <div className="pt-4 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase font-bold block">Total de la Orden</span>
                  <span className="text-lg font-bold font-mono text-slate-950 block">
                    {formatUSD(
                      orderForm.selectedParts.reduce((s, p) => s + p.total, 0) +
                        (orderForm.servicesList.length > 0
                          ? orderForm.servicesList.reduce((s, srv) => s + srv.cost, 0)
                          : Number(orderForm.laborCostUSD))
                    )}
                  </span>
                  <span className="text-xs font-semibold text-emerald-700 font-mono">
                    {formatBs(
                      (orderForm.selectedParts.reduce((s, p) => s + p.total, 0) +
                        (orderForm.servicesList.length > 0
                          ? orderForm.servicesList.reduce((s, srv) => s + srv.cost, 0)
                          : Number(orderForm.laborCostUSD))) *
                        rate
                    )}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setIsNewOrderModalOpen(false)}
                    className="px-4 py-2 border border-slate-200 rounded-lg text-xs font-semibold text-slate-700 hover:bg-slate-50 cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold text-xs rounded-lg shadow-sm cursor-pointer"
                  >
                    Guardar Orden y Notificar
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Editar Orden de Servicio y Reparación */}
      {isEditModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl overflow-hidden flex flex-col max-h-[92vh] my-auto animate-in fade-in zoom-in-95">
            {/* Modal Header */}
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                  <Edit3 className="w-5 h-5" />
                </div>
                <div>
                  <div className="flex items-center gap-2">
                    <h3 className="font-bold text-base font-display">
                      Editar Orden #{editForm.orderNumber}
                    </h3>
                    <span className="font-mono font-bold text-xs bg-amber-500 text-slate-950 px-2 py-0.5 rounded">
                      {editForm.plate || 'SIN PLACA'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Cliente: <strong>{editForm.customerName}</strong> ({editForm.customerPhone}) · {editForm.brand} {editForm.model}
                  </p>
                </div>
              </div>

              <div className="flex items-center gap-2 self-end sm:self-auto">
                <div className="flex items-center gap-1.5 bg-slate-800 px-2.5 py-1.5 rounded-lg border border-slate-700">
                  <span className="text-[11px] text-slate-400">Estado:</span>
                  <select
                    value={editForm.status}
                    onChange={(e) => setEditForm({ ...editForm, status: e.target.value as ServiceOrderStatus })}
                    className="bg-transparent text-xs font-bold text-amber-400 focus:outline-hidden cursor-pointer"
                  >
                    <option value="CREADA" className="bg-slate-900 text-amber-400">1. Creada / En Espera</option>
                    <option value="EN_PROCESO" className="bg-slate-900 text-blue-400">2. En Proceso</option>
                    <option value="CULMINADA" className="bg-slate-900 text-emerald-400">3. Culminada / Lista</option>
                    <option value="ENTREGADA" className="bg-slate-900 text-slate-300">4. Entregada</option>
                  </select>
                </div>

                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                  title="Cerrar ventana"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>

            {/* Modal Body */}
            <div className="p-4 sm:p-6 overflow-y-auto space-y-6 text-xs divide-y divide-slate-100">
              {editOrderError && (
                <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-center justify-between gap-2 text-xs font-medium">
                  <div className="flex items-center gap-2">
                    <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                    <span>{editOrderError}</span>
                  </div>
                  <button
                    type="button"
                    onClick={() => setEditOrderError(null)}
                    className="p-0.5 hover:bg-rose-100 rounded cursor-pointer"
                  >
                    <X className="w-3.5 h-3.5" />
                  </button>
                </div>
              )}

              {/* SECTION 1: Repuestos Utilizados */}
              <div className="space-y-4 pt-1">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-amber-100 text-amber-700 flex items-center justify-center">
                      <Boxes className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        Repuestos e Insumos ({editForm.selectedParts.length})
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Agrega repuestos del almacén o piezas externas para la reparación.
                      </p>
                    </div>
                  </div>

                  <div className="bg-amber-50 border border-amber-200/80 px-3 py-1.5 rounded-lg text-right">
                    <span className="text-[10px] text-amber-800 uppercase font-bold block">Subtotal Repuestos</span>
                    <span className="font-mono font-bold text-amber-950 text-xs">
                      {formatUSD(editForm.selectedParts.reduce((s, p) => s + p.total, 0))}
                      <span className="text-[11px] font-normal text-amber-700 ml-1">
                        ({formatBs(editForm.selectedParts.reduce((s, p) => s + p.total, 0) * rate)})
                      </span>
                    </span>
                  </div>
                </div>

                {/* Sub-form to Add Part (Search Warehouse OR Manual Unsaved Part) */}
                <ServicePartsPicker
                  products={products}
                  selectedParts={editForm.selectedParts}
                  bcvRate={rate}
                  onAddInventoryPart={handleAddInventoryPartToEditOrder}
                  onAddCustomPart={handleAddCustomPartToEditOrder}
                  validateStock={false}
                />

                {/* Table of Parts in Order */}
                <SelectedPartsTable
                  parts={editForm.selectedParts}
                  bcvRate={rate}
                  onUpdateQty={handleUpdatePartQtyInEdit}
                  onUpdatePrice={handleUpdatePartPriceInEdit}
                  onRemove={handleRemovePartFromEdit}
                />
              </div>

              {/* SECTION 2: Servicios y Reparaciones (Mano de Obra) */}
              <div className="space-y-4 pt-5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <div className="w-7 h-7 rounded-lg bg-emerald-100 text-emerald-700 flex items-center justify-center">
                      <Wrench className="w-4 h-4" />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-900 text-sm">
                        Servicios y Reparaciones ({editForm.servicesList.length})
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Agrega trabajos de mecánica, tapicería o mantenimiento a la orden.
                      </p>
                    </div>
                  </div>

                  <div className="bg-emerald-50 border border-emerald-200/80 px-3 py-1.5 rounded-lg text-right">
                    <span className="text-[10px] text-emerald-800 uppercase font-bold block">Total Mano de Obra</span>
                    <span className="font-mono font-bold text-emerald-950 text-xs">
                      {formatUSD(editForm.servicesList.length > 0 ? editForm.servicesList.reduce((s, srv) => s + srv.cost, 0) : editForm.laborCost)}
                      <span className="text-[11px] font-normal text-emerald-700 ml-1">
                        ({formatBs((editForm.servicesList.length > 0 ? editForm.servicesList.reduce((s, srv) => s + srv.cost, 0) : editForm.laborCost) * rate)})
                      </span>
                    </span>
                  </div>
                </div>

                {/* Quick Presets Strip */}
                <div className="space-y-1.5">
                  <span className="text-[10px] uppercase font-bold text-slate-400 block">
                    Servicios Frecuentes (1 Clic para Agregar):
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    {WORKSHOP_SERVICE_PRESETS.map((preset, prIdx) => (
                      <button
                        key={prIdx}
                        type="button"
                        onClick={() => handleAddServiceToEdit(preset.name, preset.cost)}
                        className="inline-flex items-center gap-1 px-2.5 py-1 bg-white hover:bg-amber-50 text-slate-700 hover:text-amber-900 border border-slate-200 hover:border-amber-300 rounded-lg text-xs transition-colors cursor-pointer shadow-2xs font-medium"
                      >
                        <Plus className="w-3 h-3 text-amber-500" />
                        <span>{preset.name}</span>
                        <strong className="text-amber-700 font-mono ml-0.5">(${preset.cost})</strong>
                      </button>
                    ))}
                  </div>
                </div>

                {/* Custom Service Adder Input */}
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3.5 space-y-2">
                  <span className="font-semibold text-slate-700 text-xs block">
                    Agregar Otro Servicio / Mano de Obra Personalizada:
                  </span>
                  <div className="grid grid-cols-1 sm:grid-cols-12 gap-2 items-center">
                    <div className="sm:col-span-4">
                      <input
                        type="text"
                        value={editServiceName}
                        onChange={(e) => setEditServiceName(e.target.value)}
                        placeholder="Descripción del trabajo (ej. Rectificación de disco, Pintura...)"
                        className="w-full p-2 rounded-lg border border-slate-300 bg-white text-xs"
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <div className="flex items-center bg-white border border-slate-300 rounded-lg px-2 py-1.5">
                        <span className="text-slate-400 text-xs font-mono mr-1">$</span>
                        <input
                          type="number"
                          step="any"
                          min="0"
                          value={editServiceCost}
                          onChange={(e) => setEditServiceCost(e.target.value)}
                          placeholder="0.00"
                          className="w-full font-mono font-bold text-xs focus:outline-hidden"
                        />
                      </div>
                    </div>
                    <div className="sm:col-span-4">
                      <TechnicianSearchPicker
                        technicians={technicians}
                        selectedId={editServiceTechId}
                        selectedName={editServiceTech}
                        placeholder="Buscar técnico registrado..."
                        emptyOptionLabel="Usar técnico principal de la orden"
                        size="sm"
                        onSelect={(next) => {
                          setEditServiceTech(next ? next.name : '');
                          setEditServiceTechId(next ? next.id : '');
                        }}
                        onOpenCreateTech={(prefill) =>
                          handleOpenCreateTechModal({ kind: 'edit-service-adder' }, prefill)
                        }
                      />
                    </div>
                    <div className="sm:col-span-2">
                      <button
                        type="button"
                        onClick={() => handleAddServiceToEdit()}
                        className="w-full py-2 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-1"
                      >
                        <Plus className="w-3.5 h-3.5 text-amber-400" />
                        <span>Agregar</span>
                      </button>
                    </div>
                  </div>
                </div>

                {/* List of Services in Order */}
                {editForm.servicesList.length > 0 ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-slate-100 text-slate-600 text-[10px] uppercase font-bold tracking-wider border-b border-slate-200">
                        <tr>
                          <th className="py-2.5 px-3">Servicio / Reparación</th>
                          <th className="py-2.5 px-3 w-56">Técnico / Encargado (Buscador)</th>
                          <th className="py-2.5 px-3 w-32 text-right">Costo ($ / Bs)</th>
                          <th className="py-2.5 px-3 w-12 text-center">Acción</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {editForm.servicesList.map((srv, sIdx) => (
                          <tr key={srv.id || sIdx} className="hover:bg-slate-50 transition-colors">
                            <td className="py-2.5 px-3">
                              <span className="font-semibold text-slate-900">{srv.name}</span>
                            </td>
                            <td className="py-2.5 px-3">
                              <TechnicianSearchPicker
                                technicians={technicians}
                                selectedId={srv.technicianId}
                                selectedName={srv.technician}
                                placeholder={
                                  editForm.assignedTechnician
                                    ? `Orden: ${editForm.assignedTechnician}`
                                    : 'Buscar técnico registrado...'
                                }
                                emptyOptionLabel="Sin técnico específico"
                                size="sm"
                                onSelect={(next) =>
                                  handleUpdateServiceTechnicianInEdit(sIdx, next)
                                }
                                onOpenCreateTech={(prefill) =>
                                  handleOpenCreateTechModal(
                                    { kind: 'edit-service-row', index: sIdx },
                                    prefill
                                  )
                                }
                              />
                            </td>
                            <td className="py-2.5 px-3 text-right">
                              <div className="inline-flex items-center gap-0.5 justify-end">
                                <span className="text-slate-400 font-mono text-[10px]">$</span>
                                <input
                                  type="number"
                                  step="any"
                                  min="0"
                                  value={srv.cost}
                                  onChange={(e) => handleUpdateServiceCostInEdit(sIdx, parseFloat(e.target.value) || 0)}
                                  className="w-16 p-1 text-right font-mono font-bold text-xs border border-slate-200 rounded bg-white"
                                />
                              </div>
                              <span className="font-mono text-[10px] text-emerald-700 block">
                                {formatBs(srv.cost * rate)}
                              </span>
                            </td>
                            <td className="py-2.5 px-3 text-center">
                              <button
                                type="button"
                                onClick={() => handleRemoveServiceFromEdit(sIdx)}
                                className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer transition-colors"
                                title="Eliminar servicio"
                              >
                                <Trash2 className="w-3.5 h-3.5" />
                              </button>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="p-3 bg-slate-50 border border-slate-200 rounded-xl flex items-center justify-between">
                    <div>
                      <span className="font-semibold text-slate-700 block">Mano de Obra Global:</span>
                      <span className="text-[11px] text-slate-400">Puedes agregar servicios detallados arriba o fijar un monto global.</span>
                    </div>
                    <div className="flex items-center gap-1">
                      <span className="font-mono font-bold text-slate-500">$</span>
                      <input
                        type="number"
                        step="any"
                        min="0"
                        value={editForm.laborCost}
                        onChange={(e) => setEditForm({ ...editForm, laborCost: parseFloat(e.target.value) || 0 })}
                        className="w-20 p-1.5 text-right font-mono font-bold text-xs border border-slate-300 rounded-lg bg-white"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* SECTION 3: Datos de la Moto y Cliente */}
              <div className="space-y-4 pt-5">
                <h4 className="font-bold text-slate-900 text-sm flex items-center gap-1.5">
                  <User className="w-4 h-4 text-amber-600" />
                  <span>Ficha Técnica, Cliente y Diagnóstico de Taller</span>
                </h4>

                <ServiceCustomerSelector
                  customers={customers}
                  mode={editCustomerMode}
                  onModeChange={setEditCustomerMode}
                  defaultCity={settings.city}
                  value={{
                    customerId: editForm.customerId,
                    customerName: editForm.customerName,
                    customerPhone: editForm.customerPhone,
                    customerDocument: editForm.customerDocument,
                    customerCity: editForm.customerCity,
                    customerAddress: editForm.customerAddress,
                  }}
                  onChange={(next) =>
                    setEditForm((prev) => ({
                      ...prev,
                      customerId: next.customerId,
                      customerName: next.customerName,
                      customerPhone: next.customerPhone,
                      customerDocument: next.customerDocument,
                      customerCity: next.customerCity,
                      customerAddress: next.customerAddress,
                    }))
                  }
                />

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Placa *</label>
                    <input
                      type="text"
                      required
                      value={editForm.plate}
                      onChange={(e) => setEditForm({ ...editForm, plate: e.target.value.toUpperCase() })}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono font-bold text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Marca</label>
                    <input
                      type="text"
                      value={editForm.brand}
                      onChange={(e) => setEditForm({ ...editForm, brand: e.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Modelo</label>
                    <input
                      type="text"
                      value={editForm.model}
                      onChange={(e) => setEditForm({ ...editForm, model: e.target.value })}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Kilometraje</label>
                    <input
                      type="number"
                      value={editForm.mileage}
                      onChange={(e) => setEditForm({ ...editForm, mileage: Number(e.target.value) })}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono text-xs"
                    />
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Color de la Moto</label>
                    <input
                      type="text"
                      value={editForm.color}
                      onChange={(e) => setEditForm({ ...editForm, color: e.target.value })}
                      placeholder="Ej. Azul Eléctrico"
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1">
                      <Fuel className="w-3.5 h-3.5 text-amber-600" />
                      <span>Nivel de Gasolina</span>
                    </label>
                    <select
                      value={editForm.fuelLevel}
                      onChange={(e) => setEditForm({ ...editForm, fuelLevel: e.target.value as FuelLevel })}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-medium text-xs"
                    >
                      {FUEL_LEVEL_OPTIONS.map((opt) => (
                        <option key={opt.value} value={opt.value}>
                          {opt.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Tipo de Trabajo Principal</label>
                    <select
                      value={editForm.serviceType}
                      onChange={(e) => setEditForm({ ...editForm, serviceType: e.target.value as WorkshopServiceType })}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-bold text-amber-700 text-xs"
                    >
                      {serviceTypes.map((t) => (
                        <option key={t} value={t}>
                          {t}
                        </option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <ServiceTechnicianSelector
                      technicians={technicians}
                      selectedId={editForm.assignedTechnicianId}
                      selectedName={editForm.assignedTechnician}
                      selectedPhone={editForm.assignedTechnicianPhone}
                      onChange={(next) => {
                        setEditForm((prev) => ({
                          ...prev,
                          assignedTechnicianId: next.id,
                          assignedTechnician: next.name,
                          assignedTechnicianPhone: next.phone,
                        }));
                        setEditServiceTech(next.name);
                        setEditServiceTechId(next.id);
                      }}
                      onOpenCreateTech={(prefill) =>
                        handleOpenCreateTechModal({ kind: 'edit-order' }, prefill)
                      }
                      onOpenEditTech={(tech) => handleOpenEditTechModal(tech, 'edit')}
                    />
                  </div>
                  <div>
                    <label className="block font-semibold text-slate-700 mb-1">Entrega Estimada</label>
                    <input
                      type="text"
                      value={editForm.estimatedDelivery}
                      onChange={(e) => setEditForm({ ...editForm, estimatedDelivery: e.target.value })}
                      placeholder="Ej. Hoy 5:00 PM"
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Falla / Motivo de Ingreso</label>
                  <textarea
                    rows={2}
                    value={editForm.reportedIssue}
                    onChange={(e) => setEditForm({ ...editForm, reportedIssue: e.target.value })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Diagnóstico Técnico y Observaciones Actualizadas
                  </label>
                  <textarea
                    rows={2}
                    value={editForm.diagnosis}
                    onChange={(e) => setEditForm({ ...editForm, diagnosis: e.target.value })}
                    placeholder="Detalles técnicos de fallas encontradas al desmontar..."
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 text-xs"
                  />
                </div>
              </div>
            </div>

            {/* Modal Footer with Financial Summary */}
            <div className="p-4 sm:p-5 bg-slate-50 border-t border-slate-200 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4">
              <div className="space-y-0.5">
                <div className="flex items-center gap-3 text-[11px] text-slate-500">
                  <span>
                    Repuestos: <strong className="font-mono text-slate-800">{formatUSD(editForm.selectedParts.reduce((s, p) => s + p.total, 0))}</strong>
                  </span>
                  <span>·</span>
                  <span>
                    Mano de Obra: <strong className="font-mono text-slate-800">{formatUSD(editForm.servicesList.length > 0 ? editForm.servicesList.reduce((s, srv) => s + srv.cost, 0) : editForm.laborCost)}</strong>
                  </span>
                </div>
                <div className="flex items-baseline gap-2">
                  <span className="text-xs uppercase font-bold text-slate-500">Total Liquidado:</span>
                  <span className="text-xl font-bold font-mono text-slate-950">
                    {formatUSD(
                      editForm.selectedParts.reduce((s, p) => s + p.total, 0) +
                        (editForm.servicesList.length > 0
                          ? editForm.servicesList.reduce((s, srv) => s + srv.cost, 0)
                          : Number(editForm.laborCost || 0))
                    )}
                  </span>
                  <span className="text-xs font-bold text-emerald-700 font-mono">
                    {formatBs(
                      (editForm.selectedParts.reduce((s, p) => s + p.total, 0) +
                        (editForm.servicesList.length > 0
                          ? editForm.servicesList.reduce((s, srv) => s + srv.cost, 0)
                          : Number(editForm.laborCost || 0))) *
                        rate
                    )}
                  </span>
                  <span className="text-[10px] text-slate-400 font-medium">a tasa BCV (Bs. {rate.toFixed(2)})</span>
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsEditModalOpen(false)}
                  className="px-4 py-2.5 text-slate-700 hover:bg-slate-200 rounded-xl font-semibold text-xs cursor-pointer"
                >
                  Cancelar
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveEditOrder(false)}
                  className="px-4 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                >
                  <Save className="w-4 h-4 text-amber-400" />
                  <span>Guardar Cambios</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleSaveEditOrder(true)}
                  className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white font-bold rounded-xl text-xs transition-colors shadow-xs flex items-center gap-1.5 cursor-pointer"
                  title="Guarda los cambios y abre WhatsApp con el presupuesto actualizado"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Guardar y Notificar WhatsApp</span>
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Modal: Pre-guardar o Editar Técnico con sus Datos */}
      {isTechModalOpen && (
        <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between">
              <div className="flex items-center gap-2">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-sm font-display">
                  {editingTechRecord ? 'Editar Datos del Técnico' : 'Pre-guardar Técnico en Taller'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTechModalOpen(false)}
                className="p-1 text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveQuickTech} className="p-5 space-y-3.5 text-xs">
              {techModalError && (
                <div className="p-2.5 rounded-lg bg-rose-50 border border-rose-200 text-rose-800 text-[11px] font-medium flex items-center gap-2">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{techModalError}</span>
                </div>
              )}

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre Completo *</label>
                <input
                  type="text"
                  required
                  value={techForm.name}
                  onChange={(e) => setTechForm({ ...techForm, name: e.target.value })}
                  placeholder="Ej. Jairo Pérez"
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">WhatsApp / Celular *</label>
                  <input
                    type="tel"
                    required
                    value={techForm.phone}
                    onChange={(e) => setTechForm({ ...techForm, phone: e.target.value })}
                    placeholder="Ej. 04141234567"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cédula</label>
                  <input
                    type="text"
                    value={techForm.documentId}
                    onChange={(e) => setTechForm({ ...techForm, documentId: e.target.value })}
                    placeholder="Ej. V-20123456"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Especialidad</label>
                  <input
                    type="text"
                    value={techForm.specialty}
                    onChange={(e) => setTechForm({ ...techForm, specialty: e.target.value })}
                    placeholder="Ej. Mecánica General, Tapicería"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">% Comisión Asignada *</label>
                  <div className="relative">
                    <input
                      type="number"
                      min={0}
                      max={100}
                      step={1}
                      required
                      value={techForm.commissionRate}
                      onChange={(e) =>
                        setTechForm({ ...techForm, commissionRate: Number(e.target.value) })
                      }
                      className="w-full p-2.5 pr-8 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 font-mono font-bold"
                    />
                    <Percent className="w-3.5 h-3.5 text-slate-400 absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none" />
                  </div>
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Notas (Opcional)</label>
                <input
                  type="text"
                  value={techForm.notes}
                  onChange={(e) => setTechForm({ ...techForm, notes: e.target.value })}
                  placeholder="Datos de Pago Móvil, horario, observaciones..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
                />
              </div>

              <div className="pt-3 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsTechModalOpen(false)}
                  className="px-4 py-2 rounded-lg border border-slate-200 text-slate-700 font-semibold hover:bg-slate-50 cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-lg bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold shadow-xs cursor-pointer flex items-center gap-1.5"
                >
                  <Save className="w-3.5 h-3.5" />
                  <span>{editingTechRecord ? 'Guardar Cambios' : 'Guardar y Seleccionar'}</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};
