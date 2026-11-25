import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Product,
  WholesaleDiscountTier,
  productTracksInventory,
} from '../../types';
import {
  SUGGESTED_WHOLESALE_TIERS,
  AGGRESSIVE_WHOLESALE_TIERS,
  normalizeWholesaleTiers,
  productHasWholesaleTiers,
  getProductWholesaleDisplayTiers,
} from '../../utils/wholesalePricing';
import { formatUSD, formatBs } from '../../utils/whatsapp';
import {
  getProductImages,
  handleProductImageError,
} from '../../utils/imageUrl';
import {
  Percent,
  Plus,
  Trash2,
  Save,
  Sparkles,
  Layers,
  CheckCircle2,
  ExternalLink,
  Search,
  AlertCircle,
  X,
} from 'lucide-react';

export const WholesalePricingView: React.FC = () => {
  const {
    products,
    updateProduct,
    settings,
    enterPublicStore,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<'all' | 'with_wholesale' | 'without_wholesale'>('all');
  const [selectedProductId, setSelectedProductId] = useState<string>('');
  const [draftTiers, setDraftTiers] = useState<WholesaleDiscountTier[]>([]);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  const sortedProducts = useMemo(() => {
    return [...products].sort((a, b) =>
      a.name.trim().localeCompare(b.name.trim(), 'es', { sensitivity: 'base', numeric: true })
    );
  }, [products]);

  const filteredProducts = useMemo(() => {
    return sortedProducts.filter((p) => {
      const hasWholesale = productHasWholesaleTiers(p);
      if (statusFilter === 'with_wholesale' && !hasWholesale) return false;
      if (statusFilter === 'without_wholesale' && hasWholesale) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.brand && p.brand.toLowerCase().includes(q)) ||
          (p.category && p.category.toLowerCase().includes(q)) ||
          (p.compatibility && p.compatibility.toLowerCase().includes(q))
        );
      }
      return true;
    });
  }, [sortedProducts, statusFilter, searchTerm]);

  const selectedProduct: Product | null = useMemo(() => {
    if (selectedProductId) {
      const exact = products.find((p) => p.id === selectedProductId);
      if (exact) return exact;
    }
    return filteredProducts[0] || sortedProducts[0] || null;
  }, [products, selectedProductId, filteredProducts, sortedProducts]);

  useEffect(() => {
    if (!selectedProduct) {
      setDraftTiers([]);
      setHasUnsavedChanges(false);
      return;
    }
    const existing = normalizeWholesaleTiers(selectedProduct.wholesaleTiers);
    setDraftTiers(existing.map((t) => ({ ...t })));
    setHasUnsavedChanges(false);
  }, [selectedProduct?.id, selectedProduct?.wholesaleTiers]);

  const stats = useMemo(() => {
    const productsWithWholesale = sortedProducts.filter((p) => productHasWholesaleTiers(p));
    let maxDiscount = 0;
    let totalTiers = 0;
    productsWithWholesale.forEach((p) => {
      const tiers = normalizeWholesaleTiers(p.wholesaleTiers);
      totalTiers += tiers.length;
      tiers.forEach((t) => {
        if (t.discountPct > maxDiscount) maxDiscount = t.discountPct;
      });
    });

    return {
      productsWithWholesale,
      count: productsWithWholesale.length,
      maxDiscount,
      totalTiers,
    };
  }, [sortedProducts]);

  const handleSelectProduct = (productId: string) => {
    setSelectedProductId(productId);
    setSavedNotice(null);
  };

  const handleApplyPreset = (preset: Array<{ minQty: number; discountPct: number }>) => {
    setDraftTiers(
      preset.map((t, i) => ({
        id: `tier-${Date.now()}-${i}`,
        minQty: t.minQty,
        discountPct: t.discountPct,
      }))
    );
    setHasUnsavedChanges(true);
    setSavedNotice(null);
  };

  const handleAddTier = () => {
    setDraftTiers((prev) => {
      const last = prev[prev.length - 1];
      const nextMinQty = last ? Math.max(2, last.minQty + 3) : 3;
      const nextPct = last ? Math.min(85, last.discountPct + 5) : 5;
      return [
        ...prev,
        {
          id: `tier-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
          minQty: nextMinQty,
          discountPct: nextPct,
        },
      ];
    });
    setHasUnsavedChanges(true);
    setSavedNotice(null);
  };

  const handleUpdateTier = (
    tierId: string,
    field: keyof Pick<WholesaleDiscountTier, 'minQty' | 'discountPct'>,
    rawValue: string
  ) => {
    const parsed = parseFloat(rawValue);
    setDraftTiers((prev) =>
      prev.map((t) => {
        if (t.id !== tierId) return t;
        if (field === 'minQty') {
          return { ...t, minQty: Number.isNaN(parsed) ? 2 : Math.max(2, Math.floor(parsed)) };
        }
        return {
          ...t,
          discountPct: Number.isNaN(parsed) ? 0 : Math.min(90, Math.max(0, parsed)),
        };
      })
    );
    setHasUnsavedChanges(true);
    setSavedNotice(null);
  };

  const handleRemoveTier = (tierId: string) => {
    setDraftTiers((prev) => prev.filter((t) => t.id !== tierId));
    setHasUnsavedChanges(true);
    setSavedNotice(null);
  };

  const handleClearProductWholesale = (product: Product) => {
    updateProduct(product.id, { wholesaleTiers: [] });
    if (selectedProduct?.id === product.id) {
      setDraftTiers([]);
      setHasUnsavedChanges(false);
    }
    setSavedNotice(`Se eliminaron los precios al mayor de "${product.name}".`);
  };

  const handleSaveSelectedProduct = () => {
    if (!selectedProduct) return;
    const cleaned = normalizeWholesaleTiers(draftTiers);
    updateProduct(selectedProduct.id, { wholesaleTiers: cleaned });
    setDraftTiers(cleaned);
    setHasUnsavedChanges(false);
    setSavedNotice(
      cleaned.length > 0
        ? `Precios al mayor guardados para "${selectedProduct.name}" (${cleaned.length} ${
            cleaned.length === 1 ? 'escalón' : 'escalones'
          } de descuento).`
        : `Se desactivó el precio al mayor para "${selectedProduct.name}".`
    );
  };

  const normalizedDraftPreview = useMemo(() => normalizeWholesaleTiers(draftTiers), [draftTiers]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
            Tienda Online · Descuentos Individuales por Repuesto
          </span>
          <h1 className="text-2xl font-bold font-display text-slate-900 mt-0.5">
            Precios al Mayor por Repuesto
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Selecciona cualquier repuesto específico de tu inventario y define los escalones de descuento que desees según la cantidad comprada (ej. 3+ uds → 5%, 6+ uds → 10%, 12+ uds → 15%).
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={enterPublicStore}
            className="px-3.5 py-2.5 bg-white hover:bg-slate-50 text-slate-800 border border-slate-300 font-semibold text-xs rounded-xl transition-colors inline-flex items-center gap-1.5 cursor-pointer"
          >
            <ExternalLink className="w-3.5 h-3.5 text-amber-600" />
            <span>Ver Tienda Online</span>
          </button>
        </div>
      </div>

      {savedNotice && (
        <div className="rounded-xl bg-emerald-50 border border-emerald-200 px-4 py-3 text-xs text-emerald-900 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            <span className="font-semibold">{savedNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setSavedNotice(null)}
            className="text-emerald-700 hover:text-emerald-950 p-1 cursor-pointer"
            aria-label="Cerrar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Repuestos con Mayor
          </span>
          <p className="text-2xl font-extrabold font-mono text-emerald-700 tabular-nums mt-1">
            {stats.count}{' '}
            <span className="text-xs font-normal text-slate-400">/ {products.length}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Configurados de forma individual
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Escalones Totales
          </span>
          <p className="text-2xl font-extrabold font-mono text-slate-900 tabular-nums mt-1">
            {stats.totalTiers}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Niveles de cantidad activos
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Descuento Máximo
          </span>
          <p className="text-2xl font-extrabold font-mono text-amber-600 tabular-nums mt-1">
            {stats.maxDiscount > 0 ? `-${stats.maxDiscount}%` : '0%'}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Aplicado automáticamente en carrito
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Tasa BCV Vigente
          </span>
          <p className="text-2xl font-extrabold font-mono text-slate-900 tabular-nums mt-1">
            Bs. {settings.bcvRate.toFixed(2)}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Cálculo exacto en $ USD y Bs.
          </p>
        </div>
      </div>

      {/* Main 2-Column Per-Product Configurator */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden flex flex-col lg:flex-row min-h-[540px]">
        {/* Left: Product Picker */}
        <div className="lg:w-96 shrink-0 border-b lg:border-b-0 lg:border-r border-slate-200 bg-slate-50/70 flex flex-col">
          <div className="p-3.5 border-b border-slate-200 bg-white space-y-2.5">
            <div className="relative">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar repuesto por nombre, SKU o marca..."
                className="w-full pl-9 pr-8 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
              />
              {searchTerm && (
                <button
                  type="button"
                  onClick={() => setSearchTerm('')}
                  className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  <X className="w-3.5 h-3.5" />
                </button>
              )}
            </div>

            <div className="grid grid-cols-3 gap-1 bg-slate-100 p-1 rounded-lg text-[11px] font-semibold">
              <button
                type="button"
                onClick={() => setStatusFilter('all')}
                className={`py-1 rounded-md cursor-pointer transition-colors ${
                  statusFilter === 'all'
                    ? 'bg-white text-slate-950 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Todos ({products.length})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('with_wholesale')}
                className={`py-1 rounded-md cursor-pointer transition-colors ${
                  statusFilter === 'with_wholesale'
                    ? 'bg-emerald-600 text-white shadow-2xs font-bold'
                    : 'text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                Con Mayor ({stats.count})
              </button>
              <button
                type="button"
                onClick={() => setStatusFilter('without_wholesale')}
                className={`py-1 rounded-md cursor-pointer transition-colors ${
                  statusFilter === 'without_wholesale'
                    ? 'bg-white text-slate-950 shadow-2xs font-bold'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Sin Mayor ({products.length - stats.count})
              </button>
            </div>
          </div>

          <div className="flex-1 overflow-y-auto max-h-[300px] lg:max-h-[600px] p-2 space-y-1">
            {filteredProducts.length === 0 ? (
              <div className="p-6 text-center text-xs text-slate-500">
                No se encontraron repuestos con ese criterio.
              </div>
            ) : (
              filteredProducts.map((prod) => {
                const isSelected = selectedProduct?.id === prod.id;
                const display = getProductWholesaleDisplayTiers(prod);
                const thumb = getProductImages(prod, true)[0];

                return (
                  <button
                    key={prod.id}
                    type="button"
                    onClick={() => handleSelectProduct(prod.id)}
                    className={`w-full text-left p-2.5 rounded-xl border transition-colors flex items-center gap-2.5 cursor-pointer ${
                      isSelected
                        ? 'bg-white border-amber-400 shadow-2xs ring-1 ring-amber-300/60'
                        : 'bg-transparent border-transparent hover:bg-white/90 hover:border-slate-200'
                    }`}
                  >
                    <img
                      src={thumb}
                      alt={prod.name}
                      className="w-10 h-10 rounded-lg object-cover border border-slate-200 bg-slate-100 shrink-0"
                      referrerPolicy="no-referrer"
                      onError={(e) => handleProductImageError(e, prod)}
                    />
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold text-slate-900 truncate">{prod.name}</p>
                      <div className="flex items-center justify-between gap-2 mt-0.5 text-[10px]">
                        <span className="font-mono text-slate-500 truncate">
                          {prod.sku} · {formatUSD(prod.salePrice)}
                        </span>
                        {display.hasWholesale ? (
                          <span className="font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.2 rounded shrink-0 tabular-nums">
                            {display.tiers.length} esc · -{display.maxDiscountPct}%
                          </span>
                        ) : (
                          <span className="text-slate-400 shrink-0">Sin mayor</span>
                        )}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Right: Selected Product Tier Editor */}
        <div className="flex-1 p-5 sm:p-6 flex flex-col justify-between gap-5">
          {!selectedProduct ? (
            <div className="flex-1 flex flex-col items-center justify-center text-center p-8 text-slate-500">
              <Percent className="w-10 h-10 text-slate-300 mb-3" />
              <p className="text-sm font-bold text-slate-800">Selecciona un repuesto</p>
              <p className="text-xs mt-1">
                Elige un artículo de la lista para configurar sus precios y descuentos al mayor.
              </p>
            </div>
          ) : (
            <>
              <div className="space-y-5">
                {/* Selected Product Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-slate-200">
                  <div className="flex items-center gap-3.5 min-w-0">
                    <img
                      src={getProductImages(selectedProduct, true)[0]}
                      alt={selectedProduct.name}
                      className="w-16 h-16 rounded-xl object-cover border border-slate-200 bg-slate-100 shrink-0"
                      referrerPolicy="no-referrer"
                      onError={(e) => handleProductImageError(e, selectedProduct)}
                    />
                    <div className="min-w-0">
                      <div className="flex flex-wrap items-center gap-1.5 text-[11px] text-slate-500">
                        <span className="font-mono font-bold text-slate-700">{selectedProduct.sku}</span>
                        <span>·</span>
                        <span>{selectedProduct.category}</span>
                        <span>·</span>
                        <span>
                          {productTracksInventory(selectedProduct)
                            ? `Stock: ${selectedProduct.stock} uds`
                            : 'Bajo pedido'}
                        </span>
                      </div>
                      <h2 className="text-lg font-extrabold text-slate-950 leading-snug mt-0.5">
                        {selectedProduct.name}
                      </h2>
                      <div className="flex items-baseline gap-2 mt-1 font-mono tabular-nums">
                        <span className="text-xs text-slate-500 font-sans">Precio Detal:</span>
                        <span className="text-sm font-extrabold text-slate-900">
                          {formatUSD(selectedProduct.salePrice)}
                        </span>
                        <span className="text-xs font-semibold text-emerald-700">
                          ({formatBs(selectedProduct.salePrice * settings.bcvRate)} BCV)
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-2 shrink-0">
                    {productHasWholesaleTiers(selectedProduct) && (
                      <button
                        type="button"
                        onClick={() => handleClearProductWholesale(selectedProduct)}
                        className="px-3 py-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-semibold inline-flex items-center gap-1.5 cursor-pointer"
                        title="Quitar todos los descuentos al mayor de este repuesto"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        <span>Quitar mayor</span>
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={handleSaveSelectedProduct}
                      className={`px-4 py-2 rounded-lg font-bold text-xs inline-flex items-center gap-1.5 shadow-2xs transition-colors cursor-pointer ${
                        hasUnsavedChanges
                          ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                          : 'bg-slate-900 hover:bg-slate-800 text-white'
                      }`}
                    >
                      <Save className="w-3.5 h-3.5" />
                      <span>{hasUnsavedChanges ? 'Guardar Cambios*' : 'Guardar Repuesto'}</span>
                    </button>
                  </div>
                </div>

                {hasUnsavedChanges && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 px-3.5 py-2 text-xs text-amber-950 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2">
                      <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
                      <span>Tienes cambios sin guardar para este repuesto.</span>
                    </div>
                    <button
                      type="button"
                      onClick={handleSaveSelectedProduct}
                      className="px-2.5 py-1 rounded bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] cursor-pointer"
                    >
                      Guardar ahora
                    </button>
                  </div>
                )}

                {/* Tiers Section */}
                {draftTiers.length === 0 ? (
                  <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 sm:p-8 text-center space-y-3">
                    <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                      <Percent className="w-6 h-6" />
                    </div>
                    <div className="space-y-1 max-w-md mx-auto">
                      <p className="text-sm font-bold text-slate-900">
                        Este repuesto no tiene precios al mayor todavía
                      </p>
                      <p className="text-xs text-slate-500">
                        Agrega los escalones de cantidad y porcentaje de descuento que quieras para{' '}
                        <strong>{selectedProduct.name}</strong>.
                      </p>
                    </div>
                    <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(SUGGESTED_WHOLESALE_TIERS)}
                        className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                      >
                        <Sparkles className="w-3.5 h-3.5" />
                        <span>Estándar (3+: 5% · 6+: 10% · 12+: 15%)</span>
                      </button>
                      <button
                        type="button"
                        onClick={() => handleApplyPreset(AGGRESSIVE_WHOLESALE_TIERS)}
                        className="px-3.5 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                        <span>Mayorista (3+: 8% · 6+: 15% · 12+: 22%)</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleAddTier}
                        className="px-3.5 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Crear escalón manual</span>
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                        <Layers className="w-3.5 h-3.5 text-emerald-700" />
                        <span>Escalones de Descuento por Cantidad</span>
                      </h3>
                      <div className="flex flex-wrap items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleApplyPreset(SUGGESTED_WHOLESALE_TIERS)}
                          className="text-[11px] font-semibold text-amber-800 hover:text-amber-950 bg-amber-50 hover:bg-amber-100 border border-amber-200 px-2.5 py-1 rounded-md cursor-pointer"
                        >
                          Estándar (5/10/15%)
                        </button>
                        <button
                          type="button"
                          onClick={() => handleApplyPreset(AGGRESSIVE_WHOLESALE_TIERS)}
                          className="text-[11px] font-semibold text-emerald-800 hover:text-emerald-950 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200 px-2.5 py-1 rounded-md cursor-pointer"
                        >
                          Mayorista (8/15/22%)
                        </button>
                        <button
                          type="button"
                          onClick={handleAddTier}
                          className="inline-flex items-center gap-1 text-xs font-bold text-white bg-slate-900 hover:bg-slate-800 px-3 py-1 rounded-md cursor-pointer"
                        >
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agregar escalón</span>
                        </button>
                      </div>
                    </div>

                    <div className="rounded-xl border border-slate-200 overflow-x-auto bg-white">
                      <table className="w-full text-xs">
                        <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                          <tr>
                            <th className="text-left py-2.5 px-3 font-bold">Cantidad mínima</th>
                            <th className="text-left py-2.5 px-3 font-bold">Descuento (%)</th>
                            <th className="text-right py-2.5 px-3 font-bold">Precio Unit. Mayor ($)</th>
                            <th className="text-right py-2.5 px-3 font-bold">Equiv. Bs. BCV</th>
                            <th className="w-10 py-2.5 px-2" />
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-slate-100">
                          {draftTiers.map((tier) => {
                            const discountedUSD =
                              Math.round(
                                Math.max(
                                  0,
                                  selectedProduct.salePrice *
                                    (1 - (Number(tier.discountPct) || 0) / 100)
                                ) * 100
                              ) / 100;
                            const discountedBs = discountedUSD * settings.bcvRate;

                            return (
                              <tr key={tier.id}>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-slate-500">Desde</span>
                                    <input
                                      type="number"
                                      min={2}
                                      step={1}
                                      value={tier.minQty}
                                      onChange={(e) =>
                                        handleUpdateTier(tier.id, 'minQty', e.target.value)
                                      }
                                      className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono font-bold text-slate-900 tabular-nums focus:outline-hidden focus:border-amber-500"
                                    />
                                    <span className="text-slate-500">uds</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3">
                                  <div className="flex items-center gap-1.5">
                                    <input
                                      type="number"
                                      min={0.5}
                                      max={90}
                                      step={0.5}
                                      value={tier.discountPct}
                                      onChange={(e) =>
                                        handleUpdateTier(tier.id, 'discountPct', e.target.value)
                                      }
                                      className="w-20 px-2.5 py-1.5 rounded-lg border border-slate-300 bg-white font-mono font-bold text-emerald-700 tabular-nums focus:outline-hidden focus:border-amber-500"
                                    />
                                    <span className="font-bold text-emerald-700">%</span>
                                  </div>
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-extrabold text-slate-950 tabular-nums">
                                  {formatUSD(discountedUSD)}
                                </td>
                                <td className="py-2.5 px-3 text-right font-mono font-semibold text-emerald-700 tabular-nums">
                                  {formatBs(discountedBs)}
                                </td>
                                <td className="py-2.5 px-2 text-right">
                                  <button
                                    type="button"
                                    onClick={() => handleRemoveTier(tier.id)}
                                    className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 cursor-pointer"
                                    title="Eliminar este escalón"
                                  >
                                    <Trash2 className="w-3.5 h-3.5" />
                                  </button>
                                </td>
                              </tr>
                            );
                          })}
                        </tbody>
                      </table>
                    </div>

                    {/* Preview of how customer will see it */}
                    {normalizedDraftPreview.length > 0 && (
                      <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4 space-y-2">
                        <span className="text-xs font-bold text-emerald-950 block">
                          Vista previa para el cliente en la tienda online:
                        </span>
                        <div className="flex flex-wrap gap-2">
                          {normalizedDraftPreview.map((t) => {
                            const unit =
                              Math.round(
                                Math.max(0, selectedProduct.salePrice * (1 - t.discountPct / 100)) *
                                  100
                              ) / 100;
                            return (
                              <div
                                key={t.id}
                                className="bg-white border border-emerald-200 rounded-lg px-3 py-1.5 text-xs font-mono tabular-nums"
                              >
                                <span className="font-bold text-slate-900">{t.minQty}+ uds:</span>{' '}
                                <span className="font-extrabold text-emerald-700">
                                  {formatUSD(unit)} c/u
                                </span>{' '}
                                <span className="text-[11px] text-slate-500">(-{t.discountPct}%)</span>
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      {/* Summary Table of All Products With Wholesale Pricing */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">
            Repuestos con Precio al Mayor Activo ({stats.count})
          </h3>
          <span className="text-[11px] text-slate-500">
            Haz clic en cualquier repuesto para modificar sus escalas
          </span>
        </div>

        {stats.productsWithWholesale.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Aún no hay repuestos con precios al mayor configurados. Selecciona un repuesto arriba para agregarle sus descuentos por cantidad.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left font-bold">Repuesto</th>
                  <th className="py-2.5 px-4 text-right font-bold">Precio Detal</th>
                  <th className="py-2.5 px-4 text-left font-bold">Escalas al Mayor</th>
                  <th className="py-2.5 px-4 text-right font-bold">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.productsWithWholesale.map((prod) => {
                  const display = getProductWholesaleDisplayTiers(prod);
                  return (
                    <tr key={prod.id} className="hover:bg-slate-50/70">
                      <td className="py-2.5 px-4">
                        <p className="font-bold text-slate-900">{prod.name}</p>
                        <p className="text-[10px] font-mono text-slate-500">
                          {prod.sku} · {prod.category}
                        </p>
                      </td>
                      <td className="py-2.5 px-4 text-right font-mono font-bold text-slate-800 tabular-nums whitespace-nowrap">
                        {formatUSD(prod.salePrice)}
                      </td>
                      <td className="py-2.5 px-4 font-mono tabular-nums text-emerald-700 font-semibold">
                        {display.tiers
                          .map((t) => `${t.minQty}+ u: ${formatUSD(t.unitPriceUSD)} (-${t.discountPct}%)`)
                          .join(' · ')}
                      </td>
                      <td className="py-2.5 px-4 text-right whitespace-nowrap">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedProductId(prod.id);
                            window.scrollTo({ top: 0, behavior: 'smooth' });
                          }}
                          className="text-xs font-bold text-amber-700 hover:text-amber-900 mr-3 cursor-pointer"
                        >
                          Editar
                        </button>
                        <button
                          type="button"
                          onClick={() => handleClearProductWholesale(prod)}
                          className="text-xs font-semibold text-rose-600 hover:text-rose-800 cursor-pointer"
                        >
                          Quitar
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
