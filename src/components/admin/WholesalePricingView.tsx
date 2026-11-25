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
  getWholesaleRuleLabel,
  doesProductMatchWholesaleRule,
} from '../../utils/wholesalePricing';
import { formatUSD, formatBs } from '../../utils/whatsapp';
import {
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
  CheckCircle2,
  ExternalLink,
  Package,
  AlertCircle,
} from 'lucide-react';

const AGGRESSIVE_WHOLESALE_TIERS = [
  { minQty: 3, discountPct: 8 },
  { minQty: 6, discountPct: 15 },
  { minQty: 12, discountPct: 22 },
];

const makeRuleKey = (scope: WholesaleFilterScope, filterValue: string) =>
  `${scope}::${scope === 'ALL' ? '' : filterValue.trim().toLowerCase()}`;

export const WholesalePricingView: React.FC = () => {
  const {
    settings,
    updateSettings,
    categories,
    modelCategories,
    onlineProducts,
    enterPublicStore,
  } = useApp();

  const [activeTab, setActiveTab] = useState<WholesaleFilterScope>('ALL');
  const [selectedFilterValue, setSelectedFilterValue] = useState<string>('');
  const [draftRules, setDraftRules] = useState<WholesaleDiscountRule[]>([]);
  const [samplePriceUSD, setSamplePriceUSD] = useState<string>('20');
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [savedNotice, setSavedNotice] = useState<string | null>(null);

  useEffect(() => {
    const saved = Array.isArray(settings.wholesaleDiscountRules)
      ? settings.wholesaleDiscountRules.map((r) => ({
          ...r,
          tiers: Array.isArray(r.tiers) ? r.tiers.map((t) => ({ ...t })) : [],
        }))
      : [];
    setDraftRules(saved);
    setHasUnsavedChanges(false);
  }, [settings.wholesaleDiscountRules]);

  const filterListForTab = useMemo(() => {
    if (activeTab === 'CATEGORY') return categories;
    if (activeTab === 'MODEL') return modelCategories;
    return [''];
  }, [activeTab, categories, modelCategories]);

  useEffect(() => {
    if (activeTab === 'ALL') {
      setSelectedFilterValue('');
      return;
    }
    const list = activeTab === 'CATEGORY' ? categories : modelCategories;
    if (list.length > 0 && !list.includes(selectedFilterValue)) {
      setSelectedFilterValue(list[0]);
    }
  }, [activeTab, categories, modelCategories, selectedFilterValue]);

  const currentRuleKey = makeRuleKey(activeTab, selectedFilterValue);

  const currentRule = useMemo<WholesaleDiscountRule | undefined>(() => {
    return draftRules.find((r) => makeRuleKey(r.scope, r.filterValue) === currentRuleKey);
  }, [draftRules, currentRuleKey]);

  const stats = useMemo(() => {
    let catCount = 0;
    let modelCount = 0;
    let allCount = 0;
    let maxDiscount = 0;

    const activeNormalized = draftRules
      .filter((r) => r.active)
      .map((r) => ({ ...r, tiers: normalizeWholesaleTiers(r.tiers) }))
      .filter((r) => r.tiers.length > 0);

    activeNormalized.forEach((r) => {
      if (r.scope === 'CATEGORY') catCount += 1;
      else if (r.scope === 'MODEL') modelCount += 1;
      else allCount += 1;
      r.tiers.forEach((t) => {
        if (t.discountPct > maxDiscount) maxDiscount = t.discountPct;
      });
    });

    const coveredProducts = onlineProducts.filter((prod) =>
      activeNormalized.some((rule) => doesProductMatchWholesaleRule(prod, rule))
    ).length;

    return {
      catCount,
      modelCount,
      allCount,
      totalActive: activeNormalized.length,
      maxDiscount,
      coveredProducts,
      activeNormalized,
    };
  }, [draftRules, onlineProducts]);

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
    setHasUnsavedChanges(true);
    setSavedNotice(null);
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

  const handleApplyPreset = (preset: Array<{ minQty: number; discountPct: number }>) => {
    upsertCurrentRule((r) => ({
      ...r,
      active: true,
      tiers: preset.map((t, i) => ({
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
    setHasUnsavedChanges(true);
    setSavedNotice(null);
  };

  const handleSaveAll = () => {
    const cleanedRules: WholesaleDiscountRule[] = draftRules
      .map((r) => ({
        ...r,
        tiers: normalizeWholesaleTiers(r.tiers),
      }))
      .filter((r) => r.tiers.length > 0);

    updateSettings({ wholesaleDiscountRules: cleanedRules });
    setHasUnsavedChanges(false);
    const activeCount = cleanedRules.filter((r) => r.active).length;
    setSavedNotice(
      activeCount > 0
        ? `Cambios guardados: ${activeCount} regla${activeCount === 1 ? '' : 's'} al mayor activa${activeCount === 1 ? '' : 's'} en tu tienda online.`
        : 'Cambios guardados: actualmente no hay reglas al mayor activas.'
    );
  };

  const samplePrice = Math.max(0, parseFloat(samplePriceUSD) || 0);
  const previewTiers = currentRule ? normalizeWholesaleTiers(currentRule.tiers) : [];

  const matchingSampleProducts = useMemo(() => {
    if (!currentRule) return [];
    const tempRule = { ...currentRule, active: true, tiers: previewTiers };
    if (previewTiers.length === 0) return [];
    return onlineProducts.filter((p) => doesProductMatchWholesaleRule(p, tempRule)).slice(0, 4);
  }, [currentRule, previewTiers, onlineProducts]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
            Tienda Online · Ventas por Volumen
          </span>
          <h1 className="text-2xl font-bold font-display text-slate-900 mt-0.5">
            Configuración de Precios al Mayor
          </h1>
          <p className="text-xs text-slate-500 mt-1 max-w-2xl">
            Define descuentos automáticos según la cantidad que compren tus clientes. Puedes activar una escala general para toda la tienda o escalas personalizadas por cada categoría de repuesto y modelo de moto.
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
          <button
            type="button"
            onClick={handleSaveAll}
            className={`px-4 py-2.5 font-bold text-xs rounded-xl shadow-xs transition-colors inline-flex items-center gap-1.5 cursor-pointer ${
              hasUnsavedChanges
                ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                : 'bg-slate-900 hover:bg-slate-800 text-white'
            }`}
          >
            <Save className="w-4 h-4" />
            <span>{hasUnsavedChanges ? 'Guardar Cambios*' : 'Guardar Configuración'}</span>
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
            onClick={enterPublicStore}
            className="font-bold text-emerald-800 hover:text-emerald-950 underline cursor-pointer shrink-0"
          >
            Probar en tienda
          </button>
        </div>
      )}

      {hasUnsavedChanges && (
        <div className="rounded-xl bg-amber-50 border border-amber-200 px-4 py-2.5 text-xs text-amber-950 flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            <span>Tienes cambios sin guardar. Haz clic en <strong>Guardar Cambios</strong> para publicarlos en la tienda online.</span>
          </div>
          <button
            type="button"
            onClick={handleSaveAll}
            className="px-3 py-1 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] cursor-pointer shrink-0"
          >
            Guardar ahora
          </button>
        </div>
      )}

      {/* KPI Summary Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Reglas Activas
          </span>
          <p className="text-2xl font-extrabold font-mono text-slate-900 tabular-nums mt-1">
            {stats.totalActive}
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            {stats.allCount > 0 ? 'General activa · ' : ''}
            {stats.catCount} categorías · {stats.modelCount} modelos
          </p>
        </div>

        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs">
          <span className="text-[11px] font-semibold text-slate-500 uppercase tracking-wider block">
            Productos con Mayor
          </span>
          <p className="text-2xl font-extrabold font-mono text-emerald-700 tabular-nums mt-1">
            {stats.coveredProducts}{' '}
            <span className="text-xs font-normal text-slate-400">/ {onlineProducts.length}</span>
          </p>
          <p className="text-[11px] text-slate-500 mt-0.5">
            Visibles con escala en tienda online
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
            El mejor % gana automáticamente
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
            Precios al mayor en $ y Bs. BCV
          </p>
        </div>
      </div>

      {/* Main Editor Card */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {/* Scope Tabs */}
        <div className="px-4 sm:px-5 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={() => setActiveTab('ALL')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer border ${
              activeTab === 'ALL'
                ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Globe className="w-3.5 h-3.5" />
            <span>Regla General (Toda la Tienda)</span>
            {stats.allCount > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono ${
                  activeTab === 'ALL' ? 'bg-white/20 text-white' : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                Activa
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('CATEGORY')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer border ${
              activeTab === 'CATEGORY'
                ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Wrench className="w-3.5 h-3.5" />
            <span>Por Categoría de Repuesto</span>
            {stats.catCount > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono tabular-nums ${
                  activeTab === 'CATEGORY'
                    ? 'bg-emerald-500/20 text-emerald-300'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {stats.catCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('MODEL')}
            className={`px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-2 transition-colors cursor-pointer border ${
              activeTab === 'MODEL'
                ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-2xs'
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
            }`}
          >
            <Bike className="w-3.5 h-3.5" />
            <span>Por Modelo de Moto</span>
            {stats.modelCount > 0 && (
              <span
                className={`text-[10px] px-1.5 py-0.5 rounded font-mono tabular-nums ${
                  activeTab === 'MODEL'
                    ? 'bg-slate-950/15 text-slate-950'
                    : 'bg-emerald-100 text-emerald-800'
                }`}
              >
                {stats.modelCount}
              </span>
            )}
          </button>
        </div>

        {/* Body: 2 Columns */}
        <div className="flex flex-col md:flex-row min-h-[460px]">
          {/* Left Filter List */}
          {activeTab !== 'ALL' && (
            <div className="md:w-72 shrink-0 border-b md:border-b-0 md:border-r border-slate-200 bg-slate-50/60 overflow-y-auto max-h-[240px] md:max-h-[600px] p-2.5 space-y-1">
              <div className="px-2 py-1 text-[10px] font-bold text-slate-500 uppercase tracking-wider">
                {activeTab === 'CATEGORY'
                  ? `Categorías (${filterListForTab.length})`
                  : `Modelos Especializados (${filterListForTab.length})`}
              </div>
              {filterListForTab.map((filterName) => {
                const key = makeRuleKey(activeTab, filterName);
                const rule = draftRules.find((r) => makeRuleKey(r.scope, r.filterValue) === key);
                const validTiers = rule ? normalizeWholesaleTiers(rule.tiers) : [];
                const isRuleActive = Boolean(rule?.active && validTiers.length > 0);
                const maxPct = validTiers.reduce((m, t) => Math.max(m, t.discountPct), 0);
                const isSelected = selectedFilterValue === filterName;

                return (
                  <button
                    key={filterName}
                    type="button"
                    onClick={() => setSelectedFilterValue(filterName)}
                    className={`w-full text-left px-3 py-2.5 rounded-lg text-xs transition-colors flex items-center justify-between gap-2 cursor-pointer border ${
                      isSelected
                        ? 'bg-white border-amber-400 text-slate-950 font-bold shadow-2xs'
                        : 'bg-transparent border-transparent text-slate-700 hover:bg-white/80 font-medium'
                    }`}
                  >
                    <span className="truncate">{filterName}</span>
                    {isRuleActive ? (
                      <span className="text-[10px] font-mono font-bold text-emerald-700 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded shrink-0 tabular-nums">
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

          {/* Right Editor Pane */}
          <div className="flex-1 p-5 sm:p-6 space-y-5">
            {/* Selected Filter Header + Active Switch */}
            <div className="flex flex-wrap items-start justify-between gap-3 pb-4 border-b border-slate-200">
              <div>
                <span className="text-[11px] font-bold uppercase tracking-wider text-amber-600">
                  {activeTab === 'CATEGORY'
                    ? 'Filtro por Categoría de Repuesto'
                    : activeTab === 'MODEL'
                    ? 'Filtro por Modelo de Moto'
                    : 'Regla General de Toda la Tienda'}
                </span>
                <h2 className="text-lg font-extrabold text-slate-900 mt-0.5">
                  {activeTab === 'ALL' ? 'Todos los productos de la tienda' : selectedFilterValue}
                </h2>
                <p className="text-xs text-slate-500 mt-0.5">
                  {activeTab === 'ALL'
                    ? 'Se aplica a cualquier producto del catálogo. Si un filtro específico tiene un % mayor, se aplica automáticamente el mayor descuento.'
                    : 'Se aplica a todos los repuestos que pertenezcan a este filtro cuando el cliente alcance las cantidades mínimas.'}
                </p>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={handleToggleRuleActive}
                  className={`px-3.5 py-2 rounded-lg text-xs font-bold inline-flex items-center gap-2 border transition-colors cursor-pointer ${
                    currentRule?.active
                      ? 'bg-emerald-600 border-emerald-600 text-white shadow-2xs'
                      : 'bg-white border-slate-300 text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Check className={`w-3.5 h-3.5 ${currentRule?.active ? 'opacity-100' : 'opacity-30'}`} />
                  <span>{currentRule?.active ? 'Descuento Activo' : 'Activar Descuento'}</span>
                </button>
                {currentRule && (
                  <button
                    type="button"
                    onClick={handleRemoveCurrentRule}
                    className="p-2 rounded-lg border border-rose-200 text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                    title="Eliminar regla de este filtro"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                )}
              </div>
            </div>

            {!currentRule || !currentRule.active ? (
              <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 p-6 sm:p-8 text-center space-y-3">
                <div className="w-12 h-12 rounded-xl bg-emerald-100 text-emerald-700 flex items-center justify-center mx-auto">
                  <Percent className="w-6 h-6" />
                </div>
                <div className="space-y-1 max-w-md mx-auto">
                  <p className="text-sm font-bold text-slate-900">
                    {activeTab === 'ALL'
                      ? 'Activa descuentos al mayor para toda tu tienda'
                      : `Sin descuento al mayor activo para "${selectedFilterValue}"`}
                  </p>
                  <p className="text-xs text-slate-500">
                    Elige una escala sugerida en 1 clic o crea tus propios escalones por cantidad (por ejemplo: 3+ uds → 5%, 6+ uds → 10%, 12+ uds → 15%).
                  </p>
                </div>
                <div className="flex flex-wrap items-center justify-center gap-2 pt-2">
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(SUGGESTED_WHOLESALE_TIERS)}
                    className="px-4 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer shadow-2xs"
                  >
                    <Sparkles className="w-3.5 h-3.5" />
                    <span>Escala estándar (3+: 5% · 6+: 10% · 12+: 15%)</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => handleApplyPreset(AGGRESSIVE_WHOLESALE_TIERS)}
                    className="px-3.5 py-2 rounded-lg bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 font-bold text-xs inline-flex items-center gap-1.5 cursor-pointer"
                  >
                    <Sparkles className="w-3.5 h-3.5 text-amber-600" />
                    <span>Mayorista agresiva (3+: 8% · 6+: 15% · 12+: 22%)</span>
                  </button>
                  <button
                    type="button"
                    onClick={handleToggleRuleActive}
                    className="px-3.5 py-2 rounded-lg bg-white hover:bg-slate-100 text-slate-800 border border-slate-300 font-semibold text-xs cursor-pointer"
                  >
                    Configurar manual
                  </button>
                </div>
              </div>
            ) : (
              <>
                {/* Combine products toggle */}
                <label className="flex items-start gap-3 p-3.5 rounded-xl border border-slate-200 bg-slate-50/80 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={currentRule.combineAcrossFilter !== false}
                    onChange={(e) =>
                      upsertCurrentRule((r) => ({
                        ...r,
                        combineAcrossFilter: e.target.checked,
                      }))
                    }
                    className="mt-0.5 rounded border-slate-300 text-emerald-600 focus:ring-emerald-500"
                  />
                  <div className="text-xs">
                    <span className="font-bold text-slate-900 block">
                      Sumar cantidades combinando distintos repuestos de este filtro
                    </span>
                    <span className="text-slate-500">
                      Si está activo, el cliente puede llevar por ejemplo 2 unidades de un artículo y 4 de otro dentro de{' '}
                      <strong>{activeTab === 'ALL' ? 'toda la tienda' : selectedFilterValue}</strong> para sumar 6 unidades y obtener el descuento al mayor.
                    </span>
                  </div>
                </label>

                {/* Editable Tiers Table */}
                <div className="space-y-2.5">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-1.5">
                      <Layers className="w-3.5 h-3.5 text-amber-600" />
                      <span>Escalones por Cantidad y % de Descuento</span>
                    </h3>
                    <div className="flex flex-wrap items-center gap-2">
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
                        Agresiva (8/15/22%)
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

                  <div className="rounded-xl border border-slate-200 overflow-hidden bg-white">
                    <table className="w-full text-xs">
                      <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                        <tr>
                          <th className="text-left py-2.5 px-3 font-bold">Desde (unidades)</th>
                          <th className="text-left py-2.5 px-3 font-bold">Descuento (%)</th>
                          <th className="text-right py-2.5 px-3 font-bold">Ejemplo precio unit.</th>
                          <th className="w-10 py-2.5 px-2" />
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {currentRule.tiers.map((tier) => {
                          const discounted = Math.max(
                            0,
                            samplePrice * (1 - (Number(tier.discountPct) || 0) / 100)
                          );
                          return (
                            <tr key={tier.id}>
                              <td className="py-2.5 px-3">
                                <div className="flex items-center gap-1.5">
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
                                  <span className="text-slate-500">uds o más</span>
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
                              <td className="py-2.5 px-3 text-right font-mono tabular-nums">
                                <span className="font-bold text-slate-900">
                                  {formatUSD(discounted)}
                                </span>
                                <span className="text-[11px] text-emerald-700 ml-2">
                                  ({formatBs(discounted * settings.bcvRate)})
                                </span>
                              </td>
                              <td className="py-2.5 px-2 text-right">
                                <button
                                  type="button"
                                  onClick={() => handleRemoveTier(tier.id)}
                                  className="p-1.5 text-slate-400 hover:text-rose-600 rounded-md hover:bg-rose-50 cursor-pointer"
                                  title="Quitar escalón"
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
                </div>

                {/* Live Simulator & Sample Real Products */}
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/50 p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-xs font-bold text-emerald-950">
                        Simulador de Precio Unitario
                      </span>
                      <div className="flex items-center gap-1.5 text-xs">
                        <span className="text-slate-600">Precio detal:</span>
                        <div className="relative">
                          <span className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-500 font-mono">
                            $
                          </span>
                          <input
                            type="number"
                            min={0}
                            step={0.5}
                            value={samplePriceUSD}
                            onChange={(e) => setSamplePriceUSD(e.target.value)}
                            className="w-20 pl-5 pr-2 py-1 rounded-md border border-emerald-300 bg-white font-mono font-bold text-slate-900 tabular-nums text-xs"
                          />
                        </div>
                      </div>
                    </div>
                    {previewTiers.length > 0 && (
                      <div className="flex flex-wrap gap-2">
                        {previewTiers.map((t) => {
                          const unit = Math.max(0, samplePrice * (1 - t.discountPct / 100));
                          return (
                            <div
                              key={t.id}
                              className="bg-white border border-emerald-200 rounded-lg px-3 py-1.5 text-xs font-mono tabular-nums"
                            >
                              <span className="font-bold text-slate-900">{t.minQty}+ uds:</span>{' '}
                              <span className="font-extrabold text-emerald-700">
                                {formatUSD(unit)}
                              </span>{' '}
                              <span className="text-[11px] text-slate-500">(-{t.discountPct}%)</span>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>

                  {matchingSampleProducts.length > 0 && (
                    <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                      <span className="text-xs font-bold text-slate-800 flex items-center gap-1.5">
                        <Package className="w-3.5 h-3.5 text-amber-600" />
                        <span>Ejemplo en repuestos reales de tu catálogo</span>
                      </span>
                      <div className="space-y-1.5">
                        {matchingSampleProducts.map((prod) => {
                          const firstTier = previewTiers[0];
                          const bestTier = previewTiers[previewTiers.length - 1];
                          const minUnit = prod.salePrice * (1 - bestTier.discountPct / 100);
                          return (
                            <div
                              key={prod.id}
                              className="flex items-center justify-between gap-2 text-[11px] bg-white px-2.5 py-1.5 rounded-lg border border-slate-200/80"
                            >
                              <span className="font-semibold text-slate-800 truncate">
                                {prod.name}
                              </span>
                              <span className="font-mono tabular-nums shrink-0 text-slate-600">
                                {formatUSD(prod.salePrice)} →{' '}
                                <strong className="text-emerald-700">
                                  {formatUSD(minUnit)}
                                </strong>{' '}
                                <span className="text-[10px] text-slate-400">
                                  ({firstTier.minQty}+ a {bestTier.minQty}+ u)
                                </span>
                              </span>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}
                </div>
              </>
            )}
          </div>
        </div>
      </div>

      {/* Overview Table of All Active Wholesale Rules */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        <div className="px-5 py-3.5 border-b border-slate-200 flex items-center justify-between gap-2">
          <h3 className="text-sm font-bold text-slate-900">
            Resumen de Reglas al Mayor Activas ({stats.activeNormalized.length})
          </h3>
          <span className="text-[11px] text-slate-500">
            Haz clic en cualquier regla para editarla
          </span>
        </div>

        {stats.activeNormalized.length === 0 ? (
          <div className="p-8 text-center text-xs text-slate-500">
            Aún no hay reglas al mayor activas. Activa la <strong>Regla General</strong> arriba o elige una categoría/modelo para crear tu primera escala de descuentos.
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead className="bg-slate-50 border-b border-slate-200 text-slate-600">
                <tr>
                  <th className="py-2.5 px-4 text-left font-bold">Filtro / Alcance</th>
                  <th className="py-2.5 px-4 text-left font-bold">Escala de Descuentos</th>
                  <th className="py-2.5 px-4 text-left font-bold">Combina productos</th>
                  <th className="py-2.5 px-4 text-right font-bold">Acción</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {stats.activeNormalized.map((rule) => (
                  <tr key={rule.id} className="hover:bg-slate-50/70">
                    <td className="py-2.5 px-4 font-bold text-slate-900">
                      {getWholesaleRuleLabel(rule)}
                    </td>
                    <td className="py-2.5 px-4 font-mono tabular-nums text-emerald-700 font-semibold">
                      {rule.tiers.map((t) => `${t.minQty}+ u (-${t.discountPct}%)`).join(' · ')}
                    </td>
                    <td className="py-2.5 px-4 text-slate-600">
                      {rule.combineAcrossFilter !== false ? 'Sí, combinables' : 'Por producto individual'}
                    </td>
                    <td className="py-2.5 px-4 text-right">
                      <button
                        type="button"
                        onClick={() => {
                          setActiveTab(rule.scope);
                          setSelectedFilterValue(rule.scope === 'ALL' ? '' : rule.filterValue);
                          window.scrollTo({ top: 0, behavior: 'smooth' });
                        }}
                        className="text-xs font-bold text-amber-700 hover:text-amber-900 cursor-pointer"
                      >
                        Editar
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
