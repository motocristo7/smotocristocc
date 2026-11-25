import React, { useState, useEffect, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import {
  WholesaleDiscountRule,
  WholesaleDiscountTier,
  WholesaleFilterScope,
} from '../../types';
import {
  SUGGESTED_WHOLESALE_TIERS,
  normalizeWholesaleTiers,
} from '../../utils/wholesalePricing';
import { formatUSD } from '../../utils/whatsapp';
import {
  X,
  Percent,
  Plus,
  Trash2,
  Check,
  Wrench,
  Bike,
  Globe,
  Save,
  Sparkles,
  Layers,
} from 'lucide-react';

interface WholesalePricingModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialScope?: WholesaleFilterScope;
  initialFilterValue?: string;
  onSaved?: (activeCount: number) => void;
}

const makeRuleKey = (scope: WholesaleFilterScope, filterValue: string) =>
  `${scope}::${scope === 'ALL' ? '' : filterValue.trim().toLowerCase()}`;

export const WholesalePricingModal: React.FC<WholesalePricingModalProps> = ({
  isOpen,
  onClose,
  initialScope = 'CATEGORY',
  initialFilterValue = '',
  onSaved,
}) => {
  const { settings, updateSettings, categories, modelCategories } = useApp();

  const [activeTab, setActiveTab] = useState<WholesaleFilterScope>(initialScope);
  const [selectedFilterValue, setSelectedFilterValue] = useState<string>(initialFilterValue);
  const [draftRules, setDraftRules] = useState<WholesaleDiscountRule[]>([]);
  const [samplePriceUSD, setSamplePriceUSD] = useState<string>('20');

  useEffect(() => {
    if (!isOpen) return;
    const saved = Array.isArray(settings.wholesaleDiscountRules)
      ? settings.wholesaleDiscountRules.map((r) => ({
          ...r,
          tiers: Array.isArray(r.tiers) ? r.tiers.map((t) => ({ ...t })) : [],
        }))
      : [];
    setDraftRules(saved);
    setActiveTab(initialScope);
    if (initialScope === 'ALL') {
      setSelectedFilterValue('');
    } else if (initialFilterValue) {
      setSelectedFilterValue(initialFilterValue);
    } else if (initialScope === 'CATEGORY') {
      setSelectedFilterValue(categories[0] || '');
    } else {
      setSelectedFilterValue(modelCategories[0] || '');
    }
  }, [isOpen, settings.wholesaleDiscountRules, initialScope, initialFilterValue, categories, modelCategories]);

  const filterListForTab = useMemo(() => {
    if (activeTab === 'CATEGORY') return categories;
    if (activeTab === 'MODEL') return modelCategories;
    return [''];
  }, [activeTab, categories, modelCategories]);

  useEffect(() => {
    if (!isOpen) return;
    if (activeTab === 'ALL') {
      setSelectedFilterValue('');
      return;
    }
    const list = activeTab === 'CATEGORY' ? categories : modelCategories;
    if (list.length > 0 && !list.includes(selectedFilterValue)) {
      setSelectedFilterValue(list[0]);
    }
  }, [activeTab, categories, modelCategories, selectedFilterValue, isOpen]);

  const currentRuleKey = makeRuleKey(activeTab, selectedFilterValue);

  const currentRule = useMemo<WholesaleDiscountRule | undefined>(() => {
    return draftRules.find((r) => makeRuleKey(r.scope, r.filterValue) === currentRuleKey);
  }, [draftRules, currentRuleKey]);

  const activeRulesCountByTab = useMemo(() => {
    let catCount = 0;
    let modelCount = 0;
    let allCount = 0;
    draftRules.forEach((r) => {
      if (!r.active || normalizeWholesaleTiers(r.tiers).length === 0) return;
      if (r.scope === 'CATEGORY') catCount += 1;
      else if (r.scope === 'MODEL') modelCount += 1;
      else allCount += 1;
    });
    return { catCount, modelCount, allCount, total: catCount + modelCount + allCount };
  }, [draftRules]);

  if (!isOpen) return null;

  const upsertCurrentRule = (
    updater: (existing: WholesaleDiscountRule) => WholesaleDiscountRule
  ) => {
    const scope = activeTab;
    const filterValue = scope === 'ALL' ? '' : selectedFilterValue;
    const key = makeRuleKey(scope, filterValue);

    setDraftRules((prev) => {
      const idx = prev.findIndex((r) => makeRuleKey(r.scope, r.filterValue) === key);
      const base: WholesaleDiscountRule =
        idx >= 0
          ? prev[idx]
          : {
              id: `wh-${scope.toLowerCase()}-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
              scope,
              filterValue,
              active: true,
              combineAcrossFilter: true,
              tiers: SUGGESTED_WHOLESALE_TIERS.map((t, i) => ({
                id: `tier-${Date.now()}-${i}`,
                minQty: t.minQty,
                discountPct: t.discountPct,
              })),
            };
      const nextRule = updater(base);
      if (idx >= 0) {
        return prev.map((r, i) => (i === idx ? nextRule : r));
      }
      return [...prev, nextRule];
    });
  };

  const handleToggleRuleActive = () => {
    if (!currentRule) {
      upsertCurrentRule((r) => ({ ...r, active: true }));
      return;
    }
    upsertCurrentRule((r) => ({
      ...r,
      active: !r.active,
      tiers:
        !r.active && r.tiers.length === 0
          ? SUGGESTED_WHOLESALE_TIERS.map((t, i) => ({
              id: `tier-${Date.now()}-${i}`,
              minQty: t.minQty,
              discountPct: t.discountPct,
            }))
          : r.tiers,
    }));
  };

  const handleApplySuggestedTiers = () => {
    upsertCurrentRule((r) => ({
      ...r,
      active: true,
      tiers: SUGGESTED_WHOLESALE_TIERS.map((t, i) => ({
        id: `tier-${Date.now()}-${i}`,
        minQty: t.minQty,
        discountPct: t.discountPct,
      })),
    }));
  };

  const handleAddTier = () => {
    upsertCurrentRule((r) => {
      const lastTier = r.tiers[r.tiers.length - 1];
      const nextMinQty = lastTier ? Math.max(2, lastTier.minQty + 6) : 3;
      const nextPct = lastTier ? Math.min(80, lastTier.discountPct + 5) : 5;
      return {
        ...r,
        active: true,
        tiers: [
          ...r.tiers,
          {
            id: `tier-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
            minQty: nextMinQty,
            discountPct: nextPct,
          },
        ],
      };
    });
  };

  const handleUpdateTier = (
    tierId: string,
    field: keyof Pick<WholesaleDiscountTier, 'minQty' | 'discountPct'>,
    rawValue: string
  ) => {
    const parsed = parseFloat(rawValue);
    upsertCurrentRule((r) => ({
      ...r,
      tiers: r.tiers.map((t) => {
        if (t.id !== tierId) return t;
        if (field === 'minQty') {
          return { ...t, minQty: Number.isNaN(parsed) ? 2 : Math.max(2, Math.floor(parsed)) };
        }
        return {
          ...t,
          discountPct: Number.isNaN(parsed) ? 0 : Math.min(90, Math.max(0, parsed)),
        };
      }),
    }));
  };

  const handleRemoveTier = (tierId: string) => {
    upsertCurrentRule((r) => ({
      ...r,
      tiers: r.tiers.filter((t) => t.id !== tierId),
    }));
  };

  const handleRemoveCurrentRule = () => {
    setDraftRules((prev) =>
      prev.filter((r) => makeRuleKey(r.scope, r.filterValue) !== currentRuleKey)
    );
  };

  const handleSaveAll = () => {
    const cleanedRules: WholesaleDiscountRule[] = draftRules
      .map((r) => ({
        ...r,
        tiers: normalizeWholesaleTiers(r.tiers),
      }))
      .filter((r) => r.tiers.length > 0);

    updateSettings({ wholesaleDiscountRules: cleanedRules });
    const activeCount = cleanedRules.filter((r) => r.active).length;
    if (onSaved) onSaved(activeCount);
    onClose();
  };

  const samplePrice = Math.max(0, parseFloat(samplePriceUSD) || 0);
  const previewTiers = currentRule ? normalizeWholesaleTiers(currentRule.tiers) : [];

  return (
    <div
      onClick={onClose}
      className="fixed inset-0 z-50 bg-slate-950/65 backdrop-blur-xs flex items-center justify-center p-2 sm:p-4 cursor-pointer"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="bg-white rounded-2xl w-full max-w-5xl h-[92vh] max-h-[820px] shadow-2xl border border-slate-200 flex flex-col overflow-hidden cursor-default"
      >
        {/* Pinned Header */}
        <div className="shrink-0 px-5 py-4 bg-slate-900 text-white flex items-center justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
              <Percent className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <h2 className="text-base font-bold font-display leading-tight truncate">
                Precios al Mayor por Filtro y Cantidad (Tienda Online)
              </h2>
              <p className="text-[11px] text-slate-300 truncate">
                Configura porcentajes de descuento escalonados según la cantidad comprada para cada categoría o modelo de moto.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
            aria-label="Cerrar configuración de precios al mayor"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scope Selector Tabs */}
        <div className="shrink-0 px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-2">
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => setActiveTab('CATEGORY')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'CATEGORY'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Wrench className="w-3.5 h-3.5" />
              <span>Por Categoría de Repuesto</span>
              {activeRulesCountByTab.catCount > 0 && (
                <span className="font-mono text-[10px] text-amber-400">
                  ({activeRulesCountByTab.catCount})
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('MODEL')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'MODEL'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Bike className="w-3.5 h-3.5" />
              <span>Por Modelo de Moto</span>
              {activeRulesCountByTab.modelCount > 0 && (
                <span className="font-mono text-[10px] text-amber-400">
                  ({activeRulesCountByTab.modelCount})
                </span>
              )}
            </button>

            <button
              type="button"
              onClick={() => setActiveTab('ALL')}
              className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                activeTab === 'ALL'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'bg-white text-slate-700 border border-slate-200 hover:bg-slate-100'
              }`}
            >
              <Globe className="w-3.5 h-3.5" />
              <span>Regla General (Toda la Tienda)</span>
              {activeRulesCountByTab.allCount > 0 && (
                <span className="font-mono text-[10px] text-emerald-400">✓</span>
              )}
            </button>
          </div>

          <span className="text-[11px] text-slate-500">
            Si un producto coincide con varios filtros, se aplica automáticamente el mayor descuento.
          </span>
        </div>

        {/* Main 2-Column Workspace */}
        <div className="flex-1 min-h-0 grid grid-cols-1 md:grid-cols-12 overflow-hidden">
          {/* Left sidebar: list of filters (hidden for ALL tab) */}
          {activeTab !== 'ALL' && (
            <div className="md:col-span-4 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/70 overflow-y-auto p-3 space-y-1">
              <p className="px-2 py-1 text-[11px] font-bold text-slate-500">
                {activeTab === 'CATEGORY'
                  ? 'Selecciona una categoría de repuesto'
                  : 'Selecciona un modelo de moto'}
              </p>
              {filterListForTab.map((val) => {
                const key = makeRuleKey(activeTab, val);
                const rule = draftRules.find((r) => makeRuleKey(r.scope, r.filterValue) === key);
                const tiers = rule ? normalizeWholesaleTiers(rule.tiers) : [];
                const isActive = Boolean(rule?.active && tiers.length > 0);
                const maxPct = tiers.reduce((m, t) => Math.max(m, t.discountPct), 0);
                const isSelected = selectedFilterValue === val;

                return (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setSelectedFilterValue(val)}
                    className={`w-full px-3 py-2.5 rounded-xl text-left flex items-center justify-between gap-2 transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-white border-slate-900 text-slate-950 shadow-2xs font-bold'
                        : 'bg-transparent border-transparent text-slate-700 hover:bg-white/80 hover:border-slate-200 font-medium'
                    }`}
                  >
                    <span className="text-xs truncate">{val}</span>
                    {isActive ? (
                      <span className="text-[10px] font-mono font-bold text-emerald-700 shrink-0 tabular-nums">
                        hasta -{maxPct}%
                      </span>
                    ) : (
                      <span className="text-[10px] text-slate-400 shrink-0">Sin regla</span>
                    )}
                  </button>
                );
              })}
            </div>
          )}

          {/* Right editor panel */}
          <div
            className={`${
              activeTab === 'ALL' ? 'md:col-span-12' : 'md:col-span-8'
            } overflow-y-auto p-5 space-y-5 bg-white`}
          >
            {/* Rule Header + Active Switch */}
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <p className="text-xs text-slate-500 font-medium">
                  {activeTab === 'CATEGORY'
                    ? 'Filtro por Categoría de Repuesto'
                    : activeTab === 'MODEL'
                    ? 'Filtro por Modelo de Moto'
                    : 'Regla General para toda la Tienda Online'}
                </p>
                <h3 className="text-lg font-bold text-slate-900 mt-0.5">
                  {activeTab === 'ALL' ? 'Todos los Productos' : selectedFilterValue || 'Sin selección'}
                </h3>
              </div>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleToggleRuleActive}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold transition-colors cursor-pointer border ${
                    currentRule?.active
                      ? 'bg-emerald-600 border-emerald-600 text-white hover:bg-emerald-700'
                      : 'bg-slate-100 border-slate-300 text-slate-700 hover:bg-slate-200'
                  }`}
                >
                  {currentRule?.active ? '✓ Descuento al Mayor Activo' : 'Activar Descuento al Mayor'}
                </button>
                {currentRule && (
                  <button
                    type="button"
                    onClick={handleRemoveCurrentRule}
                    className="p-2 text-rose-600 hover:bg-rose-50 rounded-lg border border-rose-200 transition-colors cursor-pointer"
                    title="Eliminar configuración de este filtro"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {!currentRule || !currentRule.active ? (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-6 text-center space-y-3">
                <div className="w-11 h-11 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center mx-auto">
                  <Layers className="w-5 h-5" />
                </div>
                <div className="max-w-md mx-auto">
                  <h4 className="text-sm font-bold text-slate-900">
                    Este filtro aún no tiene precios al mayor activos
                  </h4>
                  <p className="text-xs text-slate-600 mt-1">
                    Activa la escala de descuentos por cantidad para que tus clientes vean el precio al mayor y reciban el descuento automáticamente en el carrito.
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleApplySuggestedTiers}
                    className="inline-flex items-center gap-1.5 px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    <span>Activar con escala sugerida (3+: 5% · 6+: 10% · 12+: 15%)</span>
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-5">
                {/* Combine mode toggle */}
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentRule.combineAcrossFilter !== false}
                    onChange={(e) =>
                      upsertCurrentRule((r) => ({
                        ...r,
                        combineAcrossFilter: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-slate-300 text-slate-900 focus:ring-amber-500 w-4 h-4 cursor-pointer"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 block">
                      Permitir combinar distintos artículos dentro de este mismo filtro
                    </span>
                    <span className="text-slate-600 block mt-0.5">
                      {activeTab === 'ALL'
                        ? 'Si el cliente lleva varias unidades mezcladas en la tienda, se suman todas para alcanzar la cantidad mínima.'
                        : `Ejemplo: si lleva 3 unidades de un artículo y 3 de otro dentro de "${selectedFilterValue}", suma 6 unidades y activa la escala de 6+. Si lo desactivas, cuenta la cantidad por cada producto individual.`}
                    </span>
                  </div>
                </label>

                {/* Tiers editor */}
                <div className="space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-slate-900">
                        Escalas de Cantidad y Porcentaje de Descuento
                      </h4>
                      <p className="text-[11px] text-slate-500">
                        Mientras mayor cantidad compre el cliente, mayor será el porcentaje de descuento aplicado.
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={handleApplySuggestedTiers}
                        className="px-2.5 py-1.5 text-[11px] font-semibold text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
                      >
                        Restablecer 3 / 6 / 12
                      </button>
                      <button
                        type="button"
                        onClick={handleAddTier}
                        className="inline-flex items-center gap-1 px-3 py-1.5 text-xs font-bold text-slate-950 bg-amber-500 hover:bg-amber-400 rounded-lg transition-colors cursor-pointer"
                      >
                        <Plus className="w-3.5 h-3.5" />
                        <span>Agregar escala</span>
                      </button>
                    </div>
                  </div>

                  <div className="border border-slate-200 rounded-xl overflow-hidden divide-y divide-slate-200">
                    <div className="grid grid-cols-12 gap-2 px-3.5 py-2 bg-slate-50 text-[11px] font-bold text-slate-600">
                      <div className="col-span-4">Cantidad mínima (uds)</div>
                      <div className="col-span-4">Descuento (%)</div>
                      <div className="col-span-3 text-right">Ejemplo (${samplePrice.toFixed(0)})</div>
                      <div className="col-span-1 text-right"></div>
                    </div>

                    {currentRule.tiers.map((tier) => {
                      const discountedExample = Math.max(
                        0,
                        samplePrice * (1 - (Number(tier.discountPct) || 0) / 100)
                      );
                      return (
                        <div
                          key={tier.id}
                          className="grid grid-cols-12 gap-2 items-center px-3.5 py-2.5 bg-white"
                        >
                          <div className="col-span-4 flex items-center gap-1.5">
                            <span className="text-xs text-slate-500 shrink-0">Desde</span>
                            <input
                              type="number"
                              min={2}
                              step={1}
                              value={tier.minQty}
                              onChange={(e) => handleUpdateTier(tier.id, 'minQty', e.target.value)}
                              className="w-20 px-2.5 py-1.5 text-xs font-mono font-bold text-slate-900 bg-slate-50 border border-slate-300 rounded-lg focus:bg-white focus:border-amber-500 tabular-nums"
                            />
                            <span className="text-xs text-slate-500 shrink-0">uds</span>
                          </div>

                          <div className="col-span-4 flex items-center gap-1.5">
                            <input
                              type="number"
                              min={1}
                              max={90}
                              step={0.5}
                              value={tier.discountPct}
                              onChange={(e) =>
                                handleUpdateTier(tier.id, 'discountPct', e.target.value)
                              }
                              className="w-20 px-2.5 py-1.5 text-xs font-mono font-bold text-emerald-800 bg-emerald-50/60 border border-emerald-300 rounded-lg focus:bg-white focus:border-emerald-500 tabular-nums"
                            />
                            <span className="text-xs font-bold text-emerald-700">% desc.</span>
                          </div>

                          <div className="col-span-3 text-right font-mono tabular-nums">
                            <span className="text-xs font-bold text-slate-900">
                              {formatUSD(discountedExample)}
                            </span>
                            <span className="text-[10px] text-slate-400 block">por unidad</span>
                          </div>

                          <div className="col-span-1 text-right">
                            <button
                              type="button"
                              onClick={() => handleRemoveTier(tier.id)}
                              disabled={currentRule.tiers.length <= 1}
                              className="p-1.5 text-slate-400 hover:text-rose-600 disabled:opacity-30 rounded-lg transition-colors cursor-pointer"
                              title="Quitar escala"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Live Simulator */}
                <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="text-xs font-bold text-slate-800">
                      Vista previa en tu tienda online
                    </span>
                    <div className="flex items-center gap-1.5 text-xs">
                      <span className="text-slate-500">Probar con precio base USD:</span>
                      <input
                        type="number"
                        min={1}
                        step={1}
                        value={samplePriceUSD}
                        onChange={(e) => setSamplePriceUSD(e.target.value)}
                        className="w-20 px-2 py-1 text-xs font-mono font-bold bg-white border border-slate-300 rounded-md tabular-nums"
                      />
                    </div>
                  </div>
                  {previewTiers.length > 0 ? (
                    <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 text-xs text-slate-700 tabular-nums">
                      {previewTiers.map((t) => (
                        <span key={t.id}>
                          <strong>{t.minQty}+ uds:</strong>{' '}
                          <span className="font-mono font-bold text-emerald-700">
                            {formatUSD(samplePrice * (1 - t.discountPct / 100))}
                          </span>{' '}
                          <span className="text-slate-500">(-{t.discountPct}%)</span>
                        </span>
                      ))}
                    </div>
                  ) : (
                    <p className="text-xs text-slate-500">
                      Agrega al menos una escala con cantidad mínima ≥ 2 y porcentaje &gt; 0.
                    </p>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Pinned Footer */}
        <div className="shrink-0 px-5 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
          <div className="text-xs text-slate-600 tabular-nums">
            <strong>{activeRulesCountByTab.total}</strong>{' '}
            {activeRulesCountByTab.total === 1 ? 'filtro configurado' : 'filtros configurados'} con precios al mayor activos
          </div>
          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="button"
              onClick={handleSaveAll}
              className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Save className="w-3.5 h-3.5 text-amber-400" />
              <span>Guardar Precios al Mayor</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
