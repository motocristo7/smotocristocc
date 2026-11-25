import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Product, ProductCategory, DEFAULT_PRODUCT_CATEGORIES } from '../../types';
import { formatUSD, formatBs, sanitizePhone } from '../../utils/whatsapp';
import {
  Search,
  ShoppingCart,
  Wrench,
  ShieldCheck,
  CheckCircle2,
  Phone,
  Sparkles,
  ChevronRight,
  Eye,
  CreditCard,
  Building2,
  Copy,
  Check,
  TrendingUp,
  X,
  Share2,
  Bike,
  Plus,
  Filter,
  ChevronLeft,
  Images,
} from 'lucide-react';
import {
  PRESET_PRODUCT_IMAGES,
  handleProductImageError,
  getProductImages,
} from '../../utils/imageUrl';
import {
  doesProductMatchModelCategory,
  getProductModelCategories,
} from '../../utils/modelCategories';
import { CustomerPendingAccountsModal } from '../modals/CustomerPendingAccountsModal';

interface StorefrontProps {
  onOpenCart: (step?: 'cart' | 'checkout') => void;
}

export const Storefront: React.FC<StorefrontProps> = ({ onOpenCart }) => {
  const {
    onlineProducts,
    categories: allCategories,
    modelCategories,
    addModelCategory,
    isAdmin,
    addToCart,
    settings,
    setCurrentView,
    onlineStoreBrand,
    publicStoreUrl,
  } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedModelCategory, setSelectedModelCategory] = useState<string>('all');
  const [isAddingStoreModel, setIsAddingStoreModel] = useState(false);
  const [newStoreModelName, setNewStoreModelName] = useState('');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [modalImageIndex, setModalImageIndex] = useState<number>(0);
  const [cardImageIndices, setCardImageIndices] = useState<Record<string, number>>({});
  const [copiedBank, setCopiedBank] = useState<string | null>(null);
  const [copiedStoreLink, setCopiedStoreLink] = useState(false);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [cartToast, setCartToast] = useState<{ productName: string } | null>(null);
  const [isPendingAccountsOpen, setIsPendingAccountsOpen] = useState(false);

  const openProductDetailModal = (product: Product, startIndex = 0) => {
    setSelectedProduct(product);
    setModalImageIndex(startIndex);
  };

  const handleQuickAddModelFromStore = () => {
    const trimmed = newStoreModelName.trim();
    if (!trimmed) return;
    const res = addModelCategory(trimmed);
    if (res.modelCategory) {
      setSelectedModelCategory(res.modelCategory);
    }
    setNewStoreModelName('');
    setIsAddingStoreModel(false);
  };

  const storeName = onlineStoreBrand || 'Mercado Moto CC';

  const handleCopyStoreLink = async () => {
    try {
      await navigator.clipboard.writeText(publicStoreUrl);
    } catch {
      const tempInput = document.createElement('textarea');
      tempInput.value = publicStoreUrl;
      tempInput.setAttribute('readonly', '');
      tempInput.style.position = 'absolute';
      tempInput.style.left = '-9999px';
      document.body.appendChild(tempInput);
      tempInput.select();
      try {
        document.execCommand('copy');
      } finally {
        document.body.removeChild(tempInput);
      }
    }
    setCopiedStoreLink(true);
    setTimeout(() => setCopiedStoreLink(false), 2500);
  };

  const handleBuyNow = (product: Product) => {
    addToCart(product, 1);
    onOpenCart('checkout');
  };

  const handleAddToCart = (product: Product) => {
    addToCart(product, 1);
    setRecentlyAddedId(product.id);
    setCartToast({ productName: product.name });
    setTimeout(() => {
      setRecentlyAddedId((prev) => (prev === product.id ? null : prev));
    }, 2000);
    setTimeout(() => {
      setCartToast((prev) => (prev?.productName === product.name ? null : prev));
    }, 4000);
  };

  const categories: ProductCategory[] = useMemo(() => {
    const defaultSet = new Set<string>(DEFAULT_PRODUCT_CATEGORIES);
    return allCategories.filter(
      (cat) => defaultSet.has(cat) || onlineProducts.some((p) => p.category === cat)
    );
  }, [allCategories, onlineProducts]);

  // Products filtered only by selected model (used for live part-category counts)
  const productsByModel = useMemo(() => {
    if (selectedModelCategory === 'all') return onlineProducts;
    return onlineProducts.filter((p) => doesProductMatchModelCategory(p, selectedModelCategory));
  }, [onlineProducts, selectedModelCategory]);

  // Products filtered only by selected spare-part category (used for live model-category counts)
  const productsByPartCategory = useMemo(() => {
    if (selectedCategory === 'all') return onlineProducts;
    return onlineProducts.filter((p) => p.category === selectedCategory);
  }, [onlineProducts, selectedCategory]);

  const filteredProducts = useMemo(() => {
    const filtered = onlineProducts.filter((product) => {
      if (product.stock <= 0) return false;

      if (selectedCategory !== 'all' && product.category !== selectedCategory) {
        return false;
      }

      if (
        selectedModelCategory !== 'all' &&
        !doesProductMatchModelCategory(product, selectedModelCategory)
      ) {
        return false;
      }

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        const modelMatch = Array.isArray(product.modelCategories)
          ? product.modelCategories.some((m) => m.toLowerCase().includes(query))
          : false;
        return (
          product.name.toLowerCase().includes(query) ||
          (product.description && product.description.toLowerCase().includes(query)) ||
          product.sku.toLowerCase().includes(query) ||
          product.brand.toLowerCase().includes(query) ||
          product.compatibility.toLowerCase().includes(query) ||
          modelMatch
        );
      }

      return true;
    });

    return [...filtered].sort((a, b) =>
      a.name.trim().localeCompare(b.name.trim(), 'es', { sensitivity: 'base', numeric: true })
    );
  }, [onlineProducts, selectedCategory, selectedModelCategory, searchTerm]);

  const hasActiveFilters =
    selectedCategory !== 'all' || selectedModelCategory !== 'all' || Boolean(searchTerm.trim());

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBank(label);
    setTimeout(() => setCopiedBank(null), 2000);
  };

  const handleConsultWhatsApp = (product: Product) => {
    const bsPrice = formatBs(product.salePrice * settings.bcvRate);
    const text = `Hola *${settings.commercialName}*, estoy interesado en el repuesto *${product.name}* (Ref: ${product.sku}) por valor de ${formatUSD(product.salePrice)} (${bsPrice} a tasa BCV). ¿Tienen disponibilidad inmediata para mi moto?`;
    const url = `https://api.whatsapp.com/send?phone=${sanitizePhone(settings.whatsapp)}&text=${encodeURIComponent(text)}`;
    window.open(url, '_blank', 'noopener,noreferrer');
  };

  return (
    <div className="min-h-screen bg-slate-50 pb-20">
      {/* Hero Banner Section */}
      <section className="relative bg-slate-950 text-white overflow-hidden border-b border-slate-800">
        <div className="absolute inset-0 z-0">
          <img
            src={PRESET_PRODUCT_IMAGES.heroWorkshop}
            alt="Taller y Tienda de Repuestos Servimotos Cristo Centro"
            className="w-full h-full object-cover opacity-35"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
        </div>

        <div className="relative z-10 max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-8 sm:py-12">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-400 tracking-wider uppercase mb-2.5">
              <span>Tienda Oficial Online</span>
              <span aria-hidden="true">·</span>
              <span>Servimotos Cristo Centro</span>
              <span aria-hidden="true">·</span>
              <span>Mérida, Venezuela</span>
            </div>

            <h1 className="text-3xl sm:text-4xl font-extrabold tracking-tight font-display text-white leading-tight text-balance">
              {storeName}
              <span className="block text-lg sm:text-xl text-amber-400 font-semibold mt-1">
                Repuestos, Accesorios y Tapicería para Motos
              </span>
            </h1>

            <p className="mt-3 text-sm sm:text-base text-slate-300 leading-relaxed">
              Catálogo sincronizado en tiempo real con inventario físico en Mérida. Precios en <strong>Dólares ($ USD)</strong> y facturados en <strong>Bolívares (Bs.) a la tasa oficial del BCV</strong>. Envíos nacionales por MRW, Zoom y Tealca o retiro en taller.
            </p>

            <div className="mt-6 flex flex-wrap items-center gap-3">
              <a
                href="#catalogo"
                className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors shadow-lg shadow-amber-500/20 cursor-pointer whitespace-nowrap shrink-0"
              >
                Explorar Catálogo Online
              </a>
              <button
                type="button"
                onClick={() => setIsPendingAccountsOpen(true)}
                className="px-4 py-2.5 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-white border border-amber-500/40 font-semibold text-sm transition-colors backdrop-blur-xs flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
              >
                <CreditCard className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Cuentas Pendientes por Pagar</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('consulta_cliente')}
                className="px-4 py-2.5 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-white border border-slate-700 font-semibold text-sm transition-colors backdrop-blur-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                Consultar Estado de mi Moto
              </button>
              <button
                type="button"
                onClick={handleCopyStoreLink}
                className="px-4 py-2.5 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 font-medium text-xs transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                title={`Copiar enlace de la tienda (${publicStoreUrl}) para compartir`}
              >
                {copiedStoreLink ? (
                  <>
                    <Check className="w-4 h-4 text-emerald-400" />
                    <span className="text-emerald-400 font-bold">¡Link Copiado!</span>
                  </>
                ) : (
                  <>
                    <Share2 className="w-4 h-4 text-amber-400" />
                    <span>Compartir Web</span>
                  </>
                )}
              </button>
            </div>

            {/* Quick Trust badges */}
            <div className="mt-6 pt-4 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs text-slate-300">
              <div className="flex items-center gap-2">
                <TrendingUp className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Tasa BCV oficial: Bs. {settings.bcvRate.toFixed(2)}</span>
              </div>
              <div className="flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Pago Móvil & Efectivo $</span>
              </div>
              <div className="flex items-center gap-2">
                <Phone className="w-4 h-4 text-emerald-400 shrink-0" />
                <span>Factura al WhatsApp</span>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Main Catalog Viewport */}
      <main id="catalogo" className="max-w-[1440px] mx-auto px-3 sm:px-6 lg:px-8 pt-6 sm:pt-8">
        {/* Search & Categories Navigation Bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-3 sm:p-4 shadow-xs mb-5">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por repuesto, marca, referencia o moto (ej. DR650, KLR, Falcon 400, Supershadow, Gavilán)..."
                className="w-full pl-10 pr-4 py-2 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 transition-colors"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600 cursor-pointer"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Live Tasa BCV & Stock indicator */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200/80 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-700 whitespace-nowrap tabular-nums">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Tasa BCV: Bs. {settings.bcvRate.toFixed(2)}</span>
              </div>
              <span className="text-slate-300 hidden sm:inline">|</span>
              <span className="text-slate-500 text-[11px] hidden sm:inline whitespace-nowrap">Stock físico real</span>
            </div>
          </div>

          {/* Filter Section 1: Modelos de Motos Especializados (todos visibles sin scroll horizontal) */}
          <div id="modelos-motos" className="mt-3.5 pt-3.5 border-t border-slate-100 space-y-2.5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-900">
                  <Bike className="w-4 h-4 text-amber-600 shrink-0" />
                  <span>Filtrar por Modelo de Moto</span>
                </span>
                <span className="text-xs text-slate-400" aria-hidden="true">·</span>
                <span className="text-xs text-slate-500 tabular-nums">
                  {modelCategories.length} modelos especializados
                </span>
              </div>
              <div className="flex items-center gap-2">
                {selectedModelCategory !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedModelCategory('all')}
                    className="text-xs font-semibold text-amber-700 hover:text-amber-900 cursor-pointer"
                  >
                    Ver todos los modelos
                  </button>
                )}
                {isAdmin && !isAddingStoreModel && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddingStoreModel(true);
                      setNewStoreModelName('');
                    }}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300 bg-amber-50 hover:bg-amber-100 text-amber-950 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title="Agregar un nuevo modelo especializado al filtro de la tienda online"
                  >
                    <Plus className="w-3.5 h-3.5" />
                    <span>Agregar modelo</span>
                  </button>
                )}
              </div>
            </div>

            {isAdmin && isAddingStoreModel && (
              <div className="flex flex-wrap items-center gap-2 bg-amber-50/70 border border-amber-200 rounded-lg p-2.5">
                <input
                  type="text"
                  value={newStoreModelName}
                  onChange={(e) => setNewStoreModelName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleQuickAddModelFromStore();
                    } else if (e.key === 'Escape') {
                      setIsAddingStoreModel(false);
                      setNewStoreModelName('');
                    }
                  }}
                  placeholder="Ej. Suzuki GN 125 / Yamaha FZ16 / KLR 650..."
                  autoFocus
                  className="flex-1 min-w-[200px] px-3 py-1.5 rounded-md border border-amber-300 bg-white text-xs text-slate-900 focus:outline-hidden focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleQuickAddModelFromStore}
                  disabled={!newStoreModelName.trim()}
                  className="px-3.5 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs cursor-pointer whitespace-nowrap shrink-0"
                >
                  Guardar modelo
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setIsAddingStoreModel(false);
                    setNewStoreModelName('');
                  }}
                  className="px-2.5 py-1.5 rounded-md text-slate-500 hover:text-slate-800 text-xs font-medium cursor-pointer whitespace-nowrap shrink-0"
                >
                  Cancelar
                </button>
              </div>
            )}

            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setSelectedModelCategory('all')}
                className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer border ${
                  selectedModelCategory === 'all'
                    ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold shadow-2xs'
                    : 'bg-amber-50/60 border-amber-200 text-amber-950 hover:bg-amber-100'
                }`}
              >
                Todos los modelos{' '}
                <span className="font-mono tabular-nums opacity-80">
                  ({productsByPartCategory.length})
                </span>
              </button>
              {modelCategories.map((modelCat) => {
                const count = productsByPartCategory.filter((p) =>
                  doesProductMatchModelCategory(p, modelCat)
                ).length;
                const isSelected = selectedModelCategory === modelCat;
                return (
                  <button
                    key={modelCat}
                    type="button"
                    onClick={() =>
                      setSelectedModelCategory(isSelected ? 'all' : modelCat)
                    }
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer border ${
                      isSelected
                        ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-800 font-medium hover:border-amber-400 hover:bg-amber-50 hover:text-slate-950'
                    }`}
                  >
                    {modelCat}{' '}
                    {count > 0 && (
                      <span
                        className={`font-mono tabular-nums ${
                          isSelected ? 'text-slate-950/80' : 'text-slate-500'
                        }`}
                      >
                        ({count})
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Filter Section 2: Categorías de Repuestos (todas visibles sin scroll horizontal) */}
          <div className="mt-3.5 pt-3.5 border-t border-slate-100 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 text-xs font-bold text-slate-800">
                  <Wrench className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                  <span>Categoría de Repuesto</span>
                </span>
                <span className="text-xs text-slate-400" aria-hidden="true">·</span>
                <span className="text-xs text-slate-500 tabular-nums">
                  {categories.length} categorías
                </span>
              </div>
              {selectedCategory !== 'all' && (
                <button
                  type="button"
                  onClick={() => setSelectedCategory('all')}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Ver todas
                </button>
              )}
            </div>
            <div className="flex flex-wrap items-center gap-1.5">
              <button
                type="button"
                onClick={() => setSelectedCategory('all')}
                className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer border ${
                  selectedCategory === 'all'
                    ? 'bg-slate-900 border-slate-900 text-white shadow-2xs'
                    : 'bg-white border-slate-200 text-slate-700 hover:text-slate-900 hover:bg-slate-100'
                }`}
              >
                Todos <span className="font-mono tabular-nums opacity-80">({productsByModel.length})</span>
              </button>
              {categories.map((cat) => {
                const count = productsByModel.filter((p) => p.category === cat).length;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer border ${
                      selectedCategory === cat
                        ? 'bg-slate-900 border-slate-900 text-white font-semibold shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 font-medium hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    {cat}{' '}
                    {count > 0 && (
                      <span className="opacity-70 font-mono tabular-nums">({count})</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Active Combined Filters Summary */}
          {hasActiveFilters && (
            <div className="mt-3 pt-2.5 border-t border-slate-100 flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-1.5">
                <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-500 mr-1">
                  <Filter className="w-3 h-3" />
                  Filtros activos:
                </span>
                {selectedCategory !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedCategory('all')}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-900 text-white text-[11px] font-semibold cursor-pointer hover:bg-slate-700"
                  >
                    <span>Repuesto: {selectedCategory}</span>
                    <X className="w-3 h-3" />
                  </button>
                )}
                {selectedModelCategory !== 'all' && (
                  <button
                    type="button"
                    onClick={() => setSelectedModelCategory('all')}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-500 text-slate-950 text-[11px] font-bold cursor-pointer hover:bg-amber-400"
                  >
                    <span>Moto: {selectedModelCategory}</span>
                    <X className="w-3 h-3" />
                  </button>
                )}
                {searchTerm.trim() && (
                  <button
                    type="button"
                    onClick={() => setSearchTerm('')}
                    className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-slate-200 text-slate-800 text-[11px] font-semibold cursor-pointer hover:bg-slate-300"
                  >
                    <span>"{searchTerm.trim()}"</span>
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
              <button
                type="button"
                onClick={() => {
                  setSelectedCategory('all');
                  setSelectedModelCategory('all');
                  setSearchTerm('');
                }}
                className="text-[11px] font-bold text-rose-600 hover:text-rose-700 cursor-pointer"
              >
                Limpiar filtros
              </button>
            </div>
          )}
        </div>

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-4">
          <div>
            <h2 className="text-lg sm:text-2xl font-bold font-display text-slate-900">
              {selectedModelCategory !== 'all'
                ? `Repuestos para ${selectedModelCategory}`
                : 'Repuestos y Accesorios Disponibles en Mérida'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5 tabular-nums">
              Mostrando {filteredProducts.length} repuestos
              {selectedCategory !== 'all' ? ` en ${selectedCategory}` : ''}
              {selectedModelCategory !== 'all' ? ` · Modelo ${selectedModelCategory}` : ''} con precio en $ USD y equivalente en Bs. según tasa oficial BCV
            </p>
          </div>

          <button
            type="button"
            onClick={() => onOpenCart('cart')}
            className="text-xs font-semibold text-amber-600 hover:text-amber-700 flex items-center gap-1 cursor-pointer whitespace-nowrap shrink-0 self-start sm:self-auto"
          >
            <span>Ver Carrito</span>
            <ChevronRight className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Product Grid */}
        {filteredProducts.length === 0 ? (
          <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center max-w-md mx-auto my-8">
            <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center mb-4">
              <Search className="w-6 h-6" />
            </div>
            <h3 className="font-bold text-slate-900 text-base">No se encontraron repuestos</h3>
            <p className="text-xs text-slate-500 mt-1 leading-relaxed">
              No hay productos con stock disponible para los filtros seleccionados
              {selectedModelCategory !== 'all' ? ` (Modelo: ${selectedModelCategory})` : ''}
              {selectedCategory !== 'all' ? ` (Categoría: ${selectedCategory})` : ''}
              {searchTerm.trim() ? ` o la búsqueda "${searchTerm}"` : ''}.
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('all');
                setSelectedModelCategory('all');
              }}
              className="mt-4 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3.5">
            {filteredProducts.map((product) => {
              const priceBs = product.salePrice * settings.bcvRate;
              const productImages = getProductImages(product, true);
              const rawIdx = cardImageIndices[product.id] ?? 0;
              const activeIdx = rawIdx >= 0 && rawIdx < productImages.length ? rawIdx : 0;
              const activeSrc = productImages[activeIdx];
              const hasMultipleImages = productImages.length > 1;

              return (
                <article
                  key={product.id}
                  className="group bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col hover:border-slate-300 hover:shadow-md hover:-translate-y-0.5 transition-all duration-150"
                >
                  {/* Product Image / Mini Carousel */}
                  <div
                    onClick={() => openProductDetailModal(product, activeIdx)}
                    className="relative aspect-4/3 bg-slate-100 overflow-hidden cursor-pointer"
                  >
                    <img
                      key={`${product.id}-${activeIdx}`}
                      src={activeSrc}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                      onError={(e) => handleProductImageError(e, product)}
                    />
                    {hasMultipleImages && (
                      <>
                        <span className="absolute top-2 left-2 inline-flex items-center gap-1 bg-slate-950/75 backdrop-blur-xs text-white text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums">
                          <Images className="w-2.5 h-2.5 text-amber-400" />
                          <span>
                            {activeIdx + 1}/{productImages.length}
                          </span>
                        </span>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardImageIndices((prev) => ({
                              ...prev,
                              [product.id]:
                                (activeIdx - 1 + productImages.length) % productImages.length,
                            }));
                          }}
                          className="absolute left-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-950/65 hover:bg-slate-950/90 text-white flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                          aria-label="Foto anterior"
                        >
                          <ChevronLeft className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            setCardImageIndices((prev) => ({
                              ...prev,
                              [product.id]: (activeIdx + 1) % productImages.length,
                            }));
                          }}
                          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-slate-950/65 hover:bg-slate-950/90 text-white flex items-center justify-center sm:opacity-0 sm:group-hover:opacity-100 transition-opacity cursor-pointer"
                          aria-label="Foto siguiente"
                        >
                          <ChevronRight className="w-3.5 h-3.5" />
                        </button>
                        <div className="absolute bottom-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-slate-950/45 backdrop-blur-xs px-1.5 py-0.5 rounded-full">
                          {productImages.map((_, dotIdx) => (
                            <button
                              key={dotIdx}
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                setCardImageIndices((prev) => ({ ...prev, [product.id]: dotIdx }));
                              }}
                              aria-label={`Ver foto ${dotIdx + 1}`}
                              className={`h-1.5 rounded-full transition-all cursor-pointer ${
                                dotIdx === activeIdx
                                  ? 'w-3.5 bg-amber-400'
                                  : 'w-1.5 bg-white/70 hover:bg-white'
                              }`}
                            />
                          ))}
                        </div>
                      </>
                    )}
                    <span className="absolute top-2 right-2 bg-slate-950/80 backdrop-blur-xs text-white text-[10px] font-semibold px-1.5 py-0.5 rounded tabular-nums">
                      {product.stock} disp.
                    </span>
                  </div>

                  {/* Compact Content + Price + Actions */}
                  <div className="p-2.5 sm:p-3 flex-1 flex flex-col">
                    <div className="flex items-start justify-between gap-1.5 flex-wrap text-[10px] sm:text-[11px] text-slate-500 leading-tight">
                      <span className="font-medium whitespace-normal break-words">{product.brand} · {product.category}</span>
                      <span className="font-mono text-slate-400 shrink-0 hidden sm:inline">{product.sku}</span>
                    </div>

                    <h3
                      onClick={() => openProductDetailModal(product, activeIdx)}
                      className="mt-1 font-bold text-slate-900 text-xs sm:text-[13px] leading-snug whitespace-normal break-words hover:text-amber-600 cursor-pointer transition-colors"
                    >
                      {product.name}
                    </h3>

                    {product.description && (
                      <p className="mt-0.5 text-[11px] text-slate-600 whitespace-normal break-words leading-snug">
                        {product.description}
                      </p>
                    )}

                    {product.compatibility && (
                      <p className="mt-0.5 text-[11px] text-slate-500 whitespace-normal break-words leading-tight">
                        <span className="font-semibold text-slate-600">Compat:</span> {product.compatibility}
                      </p>
                    )}

                    {Array.isArray(product.modelCategories) && product.modelCategories.length > 0 && (
                      <div className="mt-1 flex flex-wrap gap-1">
                        {product.modelCategories.slice(0, 3).map((mc) => (
                          <button
                            key={mc}
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedModelCategory(mc);
                            }}
                            className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200/90 text-[10px] font-semibold text-amber-900 hover:bg-amber-100 transition-colors cursor-pointer leading-none"
                            title={`Filtrar todos los repuestos para ${mc}`}
                          >
                            <Bike className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                            <span>{mc}</span>
                          </button>
                        ))}
                        {product.modelCategories.length > 3 && (
                          <span className="text-[10px] font-semibold text-amber-700 px-1">
                            +{product.modelCategories.length - 3}
                          </span>
                        )}
                      </div>
                    )}

                    {/* Dual Pricing ($ USD and Bs.) & 2 Compact Action Buttons */}
                    <div className="mt-auto pt-1.5 border-t border-slate-100 flex flex-col gap-1.5">
                      <div className="flex items-end justify-between gap-1">
                        <div className="min-w-0">
                          <span className="text-sm sm:text-base font-extrabold text-slate-950 font-mono tabular-nums block leading-none">
                            {formatUSD(product.salePrice)}
                          </span>
                          <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 font-mono tabular-nums block leading-tight mt-0.5 truncate">
                            {formatBs(priceBs)}{' '}
                            <span className="font-normal text-slate-400 text-[9px]">BCV</span>
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => openProductDetailModal(product, activeIdx)}
                          className="inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 p-1.5 sm:px-2 sm:py-1 rounded-md transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                          title="Ver ficha completa del repuesto"
                          aria-label={`Ver detalles de ${product.name}`}
                        >
                          <Eye className="w-3.5 h-3.5 shrink-0" />
                          <span className="hidden sm:inline">Ver</span>
                        </button>
                      </div>

                      <div className="grid grid-cols-2 gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleBuyNow(product)}
                          className="min-h-[36px] sm:min-h-[38px] w-full inline-flex items-center justify-center gap-1 py-1.5 px-1.5 sm:px-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] sm:text-xs rounded-lg shadow-2xs transition-colors cursor-pointer font-display whitespace-nowrap shrink-0"
                          title="Comprar directamente y gestionar el pago"
                        >
                          <CreditCard className="w-3.5 h-3.5 text-slate-950 shrink-0 hidden min-[380px]:block" />
                          <span>Comprar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAddToCart(product)}
                          className={`min-h-[36px] sm:min-h-[38px] w-full inline-flex items-center justify-center gap-1 py-1.5 px-1.5 sm:px-2 border rounded-lg font-semibold text-[11px] sm:text-xs transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                            recentlyAddedId === product.id
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-bold'
                              : 'bg-slate-900 hover:bg-slate-800 text-white border-transparent'
                          }`}
                          title="Agregar este repuesto a tu carrito"
                        >
                          {recentlyAddedId === product.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0 hidden min-[380px]:block" />
                              <span>¡Listo!</span>
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="w-3.5 h-3.5 text-slate-200 shrink-0 hidden min-[380px]:block" />
                              <span>Al carrito</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>
        )}

        {/* Business Payment Information Section (Venezuela: Pago Móvil, Bancos, Zelle) */}
        <section className="mt-16 bg-white rounded-2xl border border-slate-200 p-6 sm:p-10 shadow-xs">
          <div className="max-w-3xl">
            <div className="flex items-center gap-2 text-xs font-bold text-amber-600 uppercase tracking-wider mb-2">
              <CreditCard className="w-4 h-4" />
              <span>Cuentas de Pago en Venezuela</span>
            </div>
            <h2 className="text-2xl font-bold font-display text-slate-900">
              Datos para Realizar tu Pago (Pago Móvil & Transferencias)
            </h2>
            <p className="text-xs sm:text-sm text-slate-600 mt-1">
              Todos los precios están calculados a la <strong>Tasa Oficial del Banco Central de Venezuela (Bs. {settings.bcvRate.toFixed(2)})</strong>. Puedes cancelar por Pago Móvil, transferencia bancaria en Bolívares o divisas en efectivo.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mt-6">
            {/* Pago Móvil */}
            <div className="bg-emerald-50/60 rounded-xl p-4 border border-emerald-200 flex flex-col justify-between">
              <div>
                <div className="flex items-center justify-between">
                  <span className="text-xs font-bold text-emerald-800 uppercase tracking-wider">
                    Pago Móvil (Inmediato)
                  </span>
                  <button
                    onClick={() => handleCopy(`${settings.bankDetails.pagoMovilPhone} ${settings.bankDetails.pagoMovilId}`, 'pagoMovil')}
                    className="text-[10px] text-emerald-700 bg-white px-2 py-0.5 rounded border border-emerald-200 flex items-center gap-1 font-medium cursor-pointer"
                  >
                    {copiedBank === 'pagoMovil' ? <Check className="w-3 h-3 text-emerald-600" /> : <Copy className="w-3 h-3" />}
                    <span>{copiedBank === 'pagoMovil' ? 'Copiado' : 'Copiar'}</span>
                  </button>
                </div>

                <div className="mt-3 flex items-center gap-3 bg-white p-2.5 rounded-lg border border-emerald-100">
                  <a
                    href={settings.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg'}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 group relative block"
                    title="Clic para ver QR en grande"
                  >
                    <img
                      src={settings.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg'}
                      alt="QR Pago Móvil"
                      className="w-16 h-auto object-contain rounded border border-slate-200 shadow-2xs group-hover:scale-105 transition-transform"
                    />
                    <span className="block text-[8px] text-center text-slate-400 font-semibold mt-0.5">Ver QR</span>
                  </a>

                  <div className="space-y-1 text-xs">
                    <p><strong className="text-slate-600">Banco:</strong> {settings.bankDetails.pagoMovilBank}</p>
                    <p><strong className="text-slate-600">Celular:</strong> <span className="font-mono font-bold text-slate-900">{settings.bankDetails.pagoMovilPhone}</span></p>
                    <p><strong className="text-slate-600">C.I.:</strong> <span className="font-mono font-bold text-slate-900">{settings.bankDetails.pagoMovilId}</span></p>
                    <p className="text-[11px] text-slate-500">{settings.bankDetails.pagoMovilHolder}</p>
                  </div>
                </div>
              </div>
              <p className="text-[10px] text-emerald-700 mt-3 pt-2 border-t border-emerald-200">
                Paga a tasa oficial BCV sin recargos escaneando el código QR
              </p>
            </div>

            {/* Transferencia Bancaria */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-slate-700 uppercase tracking-wider block">
                  Transferencia Bolívares
                </span>
                <div className="mt-2 space-y-1 text-xs">
                  <p><strong className="text-slate-600">Banco:</strong> {settings.bankDetails.bankTransferName}</p>
                  <p><strong className="text-slate-600">Cuenta:</strong> <span className="font-mono text-[11px] font-bold text-slate-900">{settings.bankDetails.bankTransferAccount}</span></p>
                  <p><strong className="text-slate-600">RIF:</strong> {settings.bankDetails.bankTransferRif}</p>
                  <p className="text-[11px] text-slate-500">{settings.bankDetails.bankTransferHolder}</p>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-200">
                Cuenta Corriente Banesco
              </p>
            </div>

            {/* Divisas Efectivo & Binance */}
            <div className="bg-slate-50 rounded-xl p-4 border border-slate-200 flex flex-col justify-between">
              <div>
                <span className="text-xs font-bold text-amber-700 uppercase tracking-wider block">
                  Divisas ($ USD) / Binance Pay
                </span>
                <div className="mt-2 space-y-1 text-xs">
                  <p><strong className="text-slate-600">Efectivo $:</strong> En tienda o contraentrega</p>
                  <p><strong className="text-slate-600">Binance Pay ID:</strong> <span className="font-mono">{settings.bankDetails.binancePayId || '66195935'}</span></p>
                </div>
              </div>
              <p className="text-[10px] text-slate-400 mt-3 pt-2 border-t border-slate-200">
                Aceptamos billetes en buen estado sin tachaduras
              </p>
            </div>
          </div>
        </section>

        {/* Workshop Services Highlight */}
        <section className="mt-12 bg-slate-900 text-white rounded-2xl overflow-hidden shadow-xl border border-slate-800">
          <div className="grid grid-cols-1 lg:grid-cols-2">
            <div className="p-8 sm:p-12 flex flex-col justify-between">
              <div>
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400 uppercase tracking-wider">
                  <Wrench className="w-4 h-4" />
                  <span>Taller Especializado en Venezuela</span>
                </div>
                <h3 className="text-2xl sm:text-3xl font-extrabold font-display mt-2 leading-tight">
                  Mecánica Multimarca y Tapicería de Motocicletas
                </h3>
                <p className="text-slate-300 text-xs sm:text-sm mt-3 leading-relaxed">
                  Reparación de Bera, Empire Keeway, Yamaha, Suzuki, Honda y Bajaj. Servicio exclusivo de tapicería ergonómica resistente al clima venezolano y espuma viscoelástica indeformable.
                </p>

                <div className="mt-6 space-y-2.5 text-xs text-slate-300">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Presupuestos y facturación en USD o Bolívares a tasa oficial BCV.</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Notificación a tu WhatsApp en cada fase (Espera, En Proceso, Culminada).</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                    <span>Consulta en tiempo real con la placa de tu moto o cédula.</span>
                  </div>
                </div>
              </div>

              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  onClick={() => setCurrentView('consulta_cliente')}
                  className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                >
                  Consultar Historial de mi Moto
                </button>
                <a
                  href={`https://api.whatsapp.com/send?phone=${sanitizePhone(settings.whatsapp)}&text=Hola%20Servimotos,%20deseo%20agendar%20un%20servicio%20de%20mecanica%20o%20tapiceria%20en%20Caracas`}
                  target="_blank"
                  rel="noreferrer"
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-white font-semibold text-xs rounded-lg border border-slate-700 transition-colors inline-flex items-center gap-1.5"
                >
                  <Phone className="w-3.5 h-3.5 text-emerald-400" />
                  <span>Agendar por WhatsApp</span>
                </a>
              </div>
            </div>

            <div className="relative min-h-[280px] lg:min-h-full">
              <img
                src={PRESET_PRODUCT_IMAGES.upholsterySeat}
                alt="Tapicería de motos y asientos custom"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent lg:hidden" />
            </div>
          </div>
        </section>
      </main>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 text-xs font-semibold text-amber-600 uppercase">
                    <span>{selectedProduct.brand}</span>
                    <span>·</span>
                    <span className="font-mono">{selectedProduct.sku}</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold font-display text-slate-900 mt-1">
                    {selectedProduct.name}
                  </h3>
                </div>
                <button
                  onClick={() => setSelectedProduct(null)}
                  className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100"
                >
                  ✕
                </button>
              </div>

              <div className="mt-4 grid grid-cols-1 sm:grid-cols-2 gap-6">
                {(() => {
                  const modalImages = getProductImages(selectedProduct, true);
                  const safeModalIdx =
                    modalImageIndex >= 0 && modalImageIndex < modalImages.length
                      ? modalImageIndex
                      : 0;
                  const activeModalSrc = modalImages[safeModalIdx];
                  const hasMultiple = modalImages.length > 1;

                  return (
                    <div className="space-y-2.5">
                      <div className="relative aspect-4/3 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                        <img
                          key={`${selectedProduct.id}-${safeModalIdx}`}
                          src={activeModalSrc}
                          alt={`${selectedProduct.name} - Foto ${safeModalIdx + 1}`}
                          className="w-full h-full object-cover"
                          referrerPolicy="no-referrer"
                          onError={(e) => handleProductImageError(e, selectedProduct)}
                        />
                        {hasMultiple && (
                          <>
                            <span className="absolute top-2.5 left-2.5 inline-flex items-center gap-1 bg-slate-950/75 backdrop-blur-xs text-white text-[11px] font-bold px-2 py-0.5 rounded-md tabular-nums">
                              <Images className="w-3 h-3 text-amber-400" />
                              <span>
                                {safeModalIdx + 1} / {modalImages.length}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={() =>
                                setModalImageIndex(
                                  (safeModalIdx - 1 + modalImages.length) % modalImages.length
                                )
                              }
                              className="absolute left-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-950/70 hover:bg-slate-950 text-white flex items-center justify-center shadow-md transition-colors cursor-pointer"
                              aria-label="Foto anterior"
                            >
                              <ChevronLeft className="w-4 h-4" />
                            </button>
                            <button
                              type="button"
                              onClick={() =>
                                setModalImageIndex((safeModalIdx + 1) % modalImages.length)
                              }
                              className="absolute right-2 top-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-slate-950/70 hover:bg-slate-950 text-white flex items-center justify-center shadow-md transition-colors cursor-pointer"
                              aria-label="Foto siguiente"
                            >
                              <ChevronRight className="w-4 h-4" />
                            </button>
                          </>
                        )}
                      </div>

                      {hasMultiple && (
                        <div className="grid grid-cols-6 gap-1.5">
                          {modalImages.map((imgSrc, idx) => (
                            <button
                              key={`${idx}-${imgSrc.slice(0, 32)}`}
                              type="button"
                              onClick={() => setModalImageIndex(idx)}
                              className={`aspect-square rounded-lg overflow-hidden border-2 transition-all cursor-pointer bg-slate-100 ${
                                idx === safeModalIdx
                                  ? 'border-amber-500 ring-2 ring-amber-200 scale-[1.03]'
                                  : 'border-slate-200 opacity-75 hover:opacity-100 hover:border-slate-400'
                              }`}
                              title={`Ver foto ${idx + 1}`}
                            >
                              <img
                                src={imgSrc}
                                alt={`Miniatura ${idx + 1}`}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={(e) => handleProductImageError(e, selectedProduct)}
                              />
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })()}

                <div className="flex flex-col justify-between">
                  <div className="space-y-3">
                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase block">Precio Oficial</span>
                      <div className="flex items-baseline gap-2">
                        <span className="text-2xl font-extrabold text-slate-950 font-mono tabular-nums">
                          {formatUSD(selectedProduct.salePrice)}
                        </span>
                      </div>
                      <span className="text-sm font-bold text-emerald-700 font-mono tabular-nums">
                        {formatBs(selectedProduct.salePrice * settings.bcvRate)}{' '}
                        <span className="text-[10px] font-normal text-slate-500">(Tasa BCV: {settings.bcvRate.toFixed(2)})</span>
                      </span>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase block">Disponibilidad en Almacén</span>
                      <div className="flex items-center gap-1.5 text-emerald-600 font-semibold text-xs mt-0.5">
                        <CheckCircle2 className="w-4 h-4" />
                        <span>{selectedProduct.stock} unidades en stock</span>
                      </div>
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase block">Compatibilidad</span>
                      <p className="text-xs text-slate-700 mt-0.5 bg-slate-50 p-2 rounded-lg border border-slate-200">
                        {selectedProduct.compatibility || 'Consultar compatibilidad por WhatsApp'}
                      </p>
                      {(() => {
                        const matchedModels = getProductModelCategories(selectedProduct, modelCategories);
                        if (matchedModels.length === 0) return null;
                        return (
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {matchedModels.map((mc) => (
                              <button
                                key={mc}
                                type="button"
                                onClick={() => {
                                  setSelectedModelCategory(mc);
                                  setSelectedProduct(null);
                                }}
                                className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-amber-50 border border-amber-200 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 cursor-pointer"
                              >
                                <Bike className="w-3 h-3 text-amber-600" />
                                <span>{mc}</span>
                              </button>
                            ))}
                          </div>
                        );
                      })()}
                    </div>

                    <div>
                      <span className="text-xs font-semibold text-slate-500 uppercase block">Descripción</span>
                      <p className="text-xs text-slate-600 mt-0.5 leading-relaxed">
                        {selectedProduct.description}
                      </p>
                    </div>
                  </div>

                  <div className="mt-6 pt-4 border-t border-slate-200 flex flex-col gap-2.5">
                    <div className="grid grid-cols-2 gap-2">
                      <button
                        onClick={() => {
                          handleBuyNow(selectedProduct);
                          setSelectedProduct(null);
                        }}
                        className="py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs font-display"
                        title="Comprar y gestionar el pago directamente"
                      >
                        <CreditCard className="w-4 h-4 text-slate-950" />
                        <span>Comprar Ahora</span>
                      </button>

                      <button
                        onClick={() => handleAddToCart(selectedProduct)}
                        className={`py-2.5 px-3 border rounded-xl font-semibold text-xs transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
                          recentlyAddedId === selectedProduct.id
                            ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-bold'
                            : 'bg-slate-900 hover:bg-slate-800 text-white border-transparent'
                        }`}
                      >
                        {recentlyAddedId === selectedProduct.id ? (
                          <>
                            <Check className="w-4 h-4 text-emerald-600" />
                            <span>¡Agregado!</span>
                          </>
                        ) : (
                          <>
                            <ShoppingCart className="w-4 h-4 text-slate-200" />
                            <span>Agregar al Carrito</span>
                          </>
                        )}
                      </button>
                    </div>

                    <button
                      onClick={() => handleConsultWhatsApp(selectedProduct)}
                      className="w-full py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                    >
                      <Phone className="w-3.5 h-3.5 text-emerald-600" />
                      <span>Consultar disponibilidad por WhatsApp</span>
                    </button>
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Floating Toast Notification for Added to Cart */}
      {cartToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 text-xs animate-in fade-in slide-in-from-bottom-2">
          <div className="w-7 h-7 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0">
            <CheckCircle2 className="w-4 h-4" />
          </div>
          <div className="min-w-0 pr-1">
            <p className="font-bold text-white">¡Repuesto agregado al carrito!</p>
            <p className="text-[11px] text-slate-300 truncate max-w-xs">{cartToast.productName}</p>
          </div>
          <button
            onClick={() => {
              setCartToast(null);
              onOpenCart('cart');
            }}
            className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold rounded-lg text-xs cursor-pointer shadow-xs transition-colors shrink-0 font-display"
          >
            Ver Carrito
          </button>
          <button
            onClick={() => setCartToast(null)}
            className="text-slate-400 hover:text-white p-1 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending Accounts Lookup Modal by Cédula */}
      <CustomerPendingAccountsModal
        isOpen={isPendingAccountsOpen}
        onClose={() => setIsPendingAccountsOpen(false)}
      />
    </div>
  );
};
