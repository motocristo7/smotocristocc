import React, { useState, useMemo, useEffect, useRef, lazy, Suspense } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Product,
  ProductCategory,
  DEFAULT_PRODUCT_CATEGORIES,
  productTracksInventory,
  DEFAULT_PRODUCTION_TIME_LABEL,
  DEFAULT_PRODUCTION_TIME_NOTE,
  getProductUnitInfo,
} from '../../types';
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
  Minus,
  Filter,
  ChevronLeft,
  Images,
  Clock,
  Percent,
  Layers,
  Link2,
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
import {
  getProductWholesaleDisplayTiers,
  productHasWholesaleTiers,
} from '../../utils/wholesalePricing';
import { sanitizeProductForPublic } from '../../utils/pricing';
import {
  buildProductShareUrl,
  buildProductUrlParam,
  buildProductWhatsAppShareUrl,
  copyTextToClipboard,
  extractProductRefFromLocation,
  findProductByUrlRef,
} from '../../utils/productLinks';
const CustomerPendingAccountsModal = lazy(() =>
  import('../modals/CustomerPendingAccountsModal').then((m) => ({
    default: m.CustomerPendingAccountsModal,
  }))
);

interface StorefrontProps {
  onOpenCart: (step?: 'cart' | 'checkout') => void;
}

export const Storefront: React.FC<StorefrontProps> = ({ onOpenCart }) => {
  const {
    products: allCatalogProducts,
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
  const [copiedProductLinkId, setCopiedProductLinkId] = useState<string | null>(null);
  const [linkCopiedToast, setLinkCopiedToast] = useState<{
    productName: string;
    url: string;
  } | null>(null);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [cartToast, setCartToast] = useState<{ productName: string; qty?: number } | null>(null);
  const [isPendingAccountsOpen, setIsPendingAccountsOpen] = useState(false);
  const [modalOrderQty, setModalOrderQty] = useState<number>(1);
  const [shoppingMode, setShoppingMode] = useState<'retail' | 'wholesale'>('retail');
  const [onlyWholesaleProducts, setOnlyWholesaleProducts] = useState<boolean>(false);
  const [visibleCount, setVisibleCount] = useState<number>(24);
  const [pendingUrlProductRef, setPendingUrlProductRef] = useState<string | null>(() =>
    extractProductRefFromLocation()
  );

  useEffect(() => {
    setVisibleCount(24);
  }, [searchTerm, selectedCategory, selectedModelCategory, shoppingMode, onlyWholesaleProducts]);
  const defaultTitleRef = useRef<string>(
    typeof document !== 'undefined' ? document.title : ''
  );

  const syncProductParamInUrl = (product: Product | null, mode: 'push' | 'replace' = 'push') => {
    if (typeof window === 'undefined') return;
    try {
      const url = new URL(window.location.href);
      ['repuesto', 'producto', 'item', 'sku', 'p'].forEach((k) => url.searchParams.delete(k));
      if (/^\/(?:repuesto|producto)\//i.test(url.pathname)) {
        url.pathname = '/';
      }
      if (product) {
        url.searchParams.set('repuesto', buildProductUrlParam(product));
      }
      const nextUrl = `${url.pathname}${url.search}${url.hash}`;
      if (mode === 'push') {
        window.history.pushState({ productId: product?.id || null }, '', nextUrl);
      } else {
        window.history.replaceState({ productId: product?.id || null }, '', nextUrl);
      }
    } catch {
      // Ignore history API restrictions in sandboxed environments
    }
  };

  const openProductDetailModal = (
    product: Product,
    startIndex = 0,
    initialQty = 1,
    syncUrl = true
  ) => {
    setSelectedProduct(product);
    setModalImageIndex(startIndex);
    setModalOrderQty(Math.max(1, initialQty));
    if (syncUrl) {
      syncProductParamInUrl(product, 'push');
    }
  };

  const closeProductDetailModal = (syncUrl = true) => {
    setSelectedProduct(null);
    setPendingUrlProductRef(null);
    if (syncUrl) {
      syncProductParamInUrl(null, 'replace');
    }
  };

  const handleCopyProductLink = async (product: Product) => {
    const url = buildProductShareUrl(product, publicStoreUrl);
    await copyTextToClipboard(url);
    setCopiedProductLinkId(product.id);
    setLinkCopiedToast({ productName: product.name, url });
    setTimeout(() => {
      setCopiedProductLinkId((prev) => (prev === product.id ? null : prev));
    }, 2200);
    setTimeout(() => {
      setLinkCopiedToast((prev) => (prev?.url === url ? null : prev));
    }, 3800);
  };

  // Auto-open product modal when visitor arrives via a direct product link (?repuesto=...)
  useEffect(() => {
    if (!pendingUrlProductRef) return;
    const fromOnline = findProductByUrlRef(onlineProducts, pendingUrlProductRef);
    const fromAll =
      fromOnline ||
      (() => {
        const raw = findProductByUrlRef(allCatalogProducts, pendingUrlProductRef);
        return raw ? sanitizeProductForPublic(raw) : null;
      })();

    if (fromAll) {
      openProductDetailModal(fromAll, 0, 1, false);
      setPendingUrlProductRef(null);
    }
  }, [pendingUrlProductRef, onlineProducts, allCatalogProducts]);

  // Keep product modal in sync with browser Back / Forward navigation
  useEffect(() => {
    const handlePopState = () => {
      const ref = extractProductRefFromLocation();
      if (!ref) {
        setSelectedProduct(null);
        return;
      }
      const match =
        findProductByUrlRef(onlineProducts, ref) ||
        (() => {
          const raw = findProductByUrlRef(allCatalogProducts, ref);
          return raw ? sanitizeProductForPublic(raw) : null;
        })();
      if (match) {
        setSelectedProduct(match);
        setModalImageIndex(0);
        setModalOrderQty(1);
      }
    };

    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [onlineProducts, allCatalogProducts]);

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

  useEffect(() => {
    if (typeof document === 'undefined') return;
    if (selectedProduct) {
      document.title = `${selectedProduct.name} | ${storeName}`;
    } else if (defaultTitleRef.current) {
      document.title = defaultTitleRef.current;
    }
    return () => {
      if (defaultTitleRef.current) {
        document.title = defaultTitleRef.current;
      }
    };
  }, [selectedProduct, storeName]);

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

  const handleBuyNow = (product: Product, qty = 1) => {
    const safeQty = Math.max(1, Math.floor(qty));
    addToCart(product, safeQty);
    onOpenCart('checkout');
  };

  const handleAddToCart = (product: Product, qty = 1) => {
    const safeQty = Math.max(1, Math.floor(qty));
    addToCart(product, safeQty);
    setRecentlyAddedId(product.id);
    setCartToast({ productName: product.name, qty: safeQty });
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
      if (productTracksInventory(product) && product.stock <= 0) return false;

      if (selectedCategory !== 'all' && product.category !== selectedCategory) {
        return false;
      }

      if (
        selectedModelCategory !== 'all' &&
        !doesProductMatchModelCategory(product, selectedModelCategory)
      ) {
        return false;
      }

      if (shoppingMode === 'wholesale' && onlyWholesaleProducts) {
        if (!productHasWholesaleTiers(product)) return false;
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
  }, [
    onlineProducts,
    selectedCategory,
    selectedModelCategory,
    searchTerm,
    shoppingMode,
    onlyWholesaleProducts,
  ]);

  const hasActiveFilters =
    selectedCategory !== 'all' || selectedModelCategory !== 'all' || Boolean(searchTerm.trim());

  const wholesaleProductsCount = useMemo(
    () => onlineProducts.filter((p) => productHasWholesaleTiers(p)).length,
    [onlineProducts]
  );

  const maxStoreWholesalePct = useMemo(
    () =>
      onlineProducts.reduce(
        (max, p) => Math.max(max, getProductWholesaleDisplayTiers(p).maxDiscountPct),
        0
      ),
    [onlineProducts]
  );

  const handleCopy = (text: string, label: string) => {
    navigator.clipboard.writeText(text);
    setCopiedBank(label);
    setTimeout(() => setCopiedBank(null), 2000);
  };

  const handleConsultWhatsApp = (product: Product) => {
    const unitInfo = getProductUnitInfo(product);
    const bsPrice = formatBs(product.salePrice * settings.bcvRate);
    const productLink = buildProductShareUrl(product, publicStoreUrl);
    const text = `Hola *${settings.commercialName}*, estoy interesado en el repuesto *${product.name}* (Ref: ${product.sku}) por valor de ${formatUSD(product.salePrice)} ${unitInfo.priceSuffix} (${bsPrice} ${unitInfo.priceSuffix} a tasa BCV).\nLink del repuesto: ${productLink}\n¿Tienen disponibilidad inmediata para mi moto?`;
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
                onClick={() => setShoppingMode('retail')}
                className="px-5 py-2.5 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors shadow-lg shadow-amber-500/20 cursor-pointer whitespace-nowrap shrink-0"
              >
                Explorar Catálogo Online
              </a>
              <a
                href="#catalogo"
                onClick={() => setShoppingMode('wholesale')}
                className="px-4 py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-sm transition-colors shadow-lg shadow-emerald-600/20 flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
              >
                <Layers className="w-4 h-4 shrink-0" />
                <span>
                  Comprar al Mayor
                  {maxStoreWholesalePct > 0 ? ` (hasta -${maxStoreWholesalePct}%)` : ''}
                </span>
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

            {/* Compra al Detal / Compra al Mayor Switcher */}
            <div className="inline-flex items-center p-1 rounded-lg bg-slate-100 border border-slate-200 shrink-0 self-start md:self-auto">
              <button
                type="button"
                onClick={() => {
                  setShoppingMode('retail');
                  setOnlyWholesaleProducts(false);
                }}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  shoppingMode === 'retail'
                    ? 'bg-white text-slate-950 shadow-2xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Al Detal
              </button>
              <button
                type="button"
                onClick={() => setShoppingMode('wholesale')}
                className={`px-3 py-1.5 rounded-md text-xs font-bold transition-colors cursor-pointer whitespace-nowrap inline-flex items-center gap-1.5 ${
                  shoppingMode === 'wholesale'
                    ? 'bg-emerald-600 text-white shadow-2xs'
                    : 'text-emerald-800 hover:bg-emerald-50'
                }`}
              >
                <Layers className="w-3.5 h-3.5 shrink-0" />
                <span>Al Mayor</span>
                {maxStoreWholesalePct > 0 && (
                  <span
                    className={`font-mono text-[10px] tabular-nums px-1 py-0.2 rounded ${
                      shoppingMode === 'wholesale'
                        ? 'bg-white/20 text-white'
                        : 'bg-emerald-100 text-emerald-800'
                    }`}
                  >
                    -{maxStoreWholesalePct}%
                  </span>
                )}
              </button>
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

          {/* Dedicated Wholesale Shopping Mode Banner */}
          {shoppingMode === 'wholesale' && (
            <div className="mt-3 rounded-xl border border-emerald-300 bg-emerald-50 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-start gap-2.5 min-w-0">
                <div className="w-8 h-8 rounded-lg bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Percent className="w-4 h-4" />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-extrabold text-emerald-950">
                    Modo Compra al Mayor Activado
                  </p>
                  {wholesaleProductsCount > 0 ? (
                    <p className="text-[11px] text-emerald-900 mt-0.5 leading-snug">
                      Selecciona directamente las cantidades mayoristas disponibles en cada repuesto ({wholesaleProductsCount} con descuento al mayor). El descuento por volumen se aplica automáticamente al agregar la cantidad mínima de ese repuesto.
                    </p>
                  ) : (
                    <p className="text-[11px] text-emerald-900 mt-0.5 leading-snug">
                      {isAdmin
                        ? 'Aún no has asignado precios al mayor a ningún repuesto. Configúralos individualmente desde el módulo Precios al Mayor del Panel Administrativo.'
                        : 'Consulta nuestra lista especial de precios al mayor directamente por WhatsApp según la cantidad que necesites.'}
                    </p>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {wholesaleProductsCount > 0 ? (
                  <label className="inline-flex items-center gap-1.5 text-[11px] font-semibold text-emerald-950 bg-white border border-emerald-200 px-2.5 py-1.5 rounded-lg cursor-pointer">
                    <input
                      type="checkbox"
                      checked={onlyWholesaleProducts}
                      onChange={(e) => setOnlyWholesaleProducts(e.target.checked)}
                      className="rounded border-emerald-300 text-emerald-600 focus:ring-emerald-500"
                    />
                    <span>Solo con descuento al mayor ({wholesaleProductsCount})</span>
                  </label>
                ) : isAdmin ? (
                  <button
                    type="button"
                    onClick={() => setCurrentView('admin_mayorista')}
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs cursor-pointer whitespace-nowrap"
                  >
                    Configurar Precios al Mayor
                  </button>
                ) : (
                  <a
                    href={`https://api.whatsapp.com/send?phone=${sanitizePhone(settings.whatsapp)}&text=${encodeURIComponent(
                      `Hola *${settings.commercialName}*, deseo consultar precios de compra al mayor para repuestos de motos.`
                    )}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="px-3.5 py-2 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white font-bold text-xs inline-flex items-center gap-1.5 whitespace-nowrap"
                  >
                    <Phone className="w-3.5 h-3.5" />
                    <span>Cotizar al Mayor por WhatsApp</span>
                  </a>
                )}
              </div>
            </div>
          )}

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
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => setCurrentView('admin_mayorista')}
                    className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-emerald-300 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap shrink-0"
                    title="Configurar descuentos y escalas de precios al mayor por repuesto específico"
                  >
                    <Percent className="w-3.5 h-3.5 text-emerald-700" />
                    <span>
                      Precios al Mayor
                      {wholesaleProductsCount > 0 ? ` (${wholesaleProductsCount})` : ''}
                    </span>
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
                    className={`min-h-[38px] px-3.5 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer border inline-flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-amber-500 border-amber-500 text-slate-950 font-bold shadow-2xs'
                        : 'bg-slate-50 border-slate-200 text-slate-800 font-medium hover:border-amber-400 hover:bg-amber-50 hover:text-slate-950'
                    }`}
                  >
                    <span>{modelCat}</span>
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
                const isSelected = selectedCategory === cat;
                return (
                  <button
                    key={cat}
                    type="button"
                    onClick={() => setSelectedCategory(cat)}
                    className={`min-h-[34px] px-3 py-1.5 rounded-lg text-xs whitespace-nowrap transition-colors cursor-pointer border inline-flex items-center gap-1.5 ${
                      isSelected
                        ? 'bg-slate-900 border-slate-900 text-white font-semibold shadow-2xs'
                        : 'bg-white border-slate-200 text-slate-700 font-medium hover:text-slate-900 hover:bg-slate-100'
                    }`}
                  >
                    <span>{cat}</span>
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
          <>
          <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-2.5 sm:gap-3.5">
            {filteredProducts.slice(0, visibleCount).map((product) => {
              const priceBs = product.salePrice * settings.bcvRate;
              const unitInfo = getProductUnitInfo(product);
              const productImages = getProductImages(product, true);
              const rawIdx = cardImageIndices[product.id] ?? 0;
              const activeIdx = rawIdx >= 0 && rawIdx < productImages.length ? rawIdx : 0;
              const activeSrc = productImages[activeIdx];
              const hasMultipleImages = productImages.length > 1;
              const wholesaleDisplay = getProductWholesaleDisplayTiers(product);
              const firstWholesaleTier = wholesaleDisplay.tiers[0];
              const maxWholesaleTier =
                wholesaleDisplay.tiers[wholesaleDisplay.tiers.length - 1];
              const matchedModels = getProductModelCategories(product, modelCategories);
              const rawCompat = (product.compatibility || '').trim();
              const compatibilityText =
                rawCompat || (matchedModels.length > 0 ? matchedModels.join(' · ') : '');

              return (
                <article
                  key={product.id}
                  className={`group bg-white rounded-xl border overflow-hidden flex flex-col hover:shadow-md hover:-translate-y-0.5 transition-all duration-150 ${
                    wholesaleDisplay.hasWholesale
                      ? 'border-emerald-300/80 hover:border-emerald-400'
                      : 'border-slate-200 hover:border-slate-300'
                  }`}
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
                      loading="lazy"
                      decoding="async"
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
                      {productTracksInventory(product)
                        ? `${product.stock} ${unitInfo.isDefaultUnit ? '' : `${unitInfo.pluralShort} `}disp.`
                        : 'Bajo pedido'}
                    </span>
                    <span className="absolute bottom-2 right-2 bg-slate-950/75 backdrop-blur-xs text-white text-[10px] font-semibold px-1.5 py-0.5 rounded inline-flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity pointer-events-none">
                      <Eye className="w-2.5 h-2.5 text-amber-400" />
                      <span>Ver detalles</span>
                    </span>
                  </div>

                  {/* Compact Content + Compatibility + Price + Wholesale + Actions */}
                  <div className="p-2 sm:p-2.5 flex-1 flex flex-col gap-1">
                    <div>
                      <h3
                        onClick={() => openProductDetailModal(product, activeIdx)}
                        title={product.name}
                        className="font-bold text-slate-900 text-xs sm:text-[13px] leading-tight line-clamp-2 hover:text-amber-600 cursor-pointer transition-colors"
                      >
                        {product.name}
                      </h3>
                      {compatibilityText && (
                        <p
                          title={`Compatible con: ${compatibilityText}`}
                          className="mt-0.5 text-[11px] text-slate-600 leading-tight truncate"
                        >
                          <span className="font-semibold text-slate-500">Para:</span>{' '}
                          {compatibilityText}
                        </p>
                      )}
                    </div>

                    {/* Dual Pricing ($ USD and Bs.), Compact Wholesale Tiers & 2 Action Buttons */}
                    <div className="mt-auto pt-1.5 border-t border-slate-100 flex flex-col gap-1.5">
                      <div className="flex items-end justify-between gap-1">
                        <div className="min-w-0">
                          {shoppingMode === 'wholesale' && wholesaleDisplay.hasWholesale && firstWholesaleTier ? (
                            <>
                              <div className="flex items-baseline gap-1 flex-wrap">
                                <span className="text-sm sm:text-base font-extrabold text-emerald-800 font-mono tabular-nums leading-none">
                                  {formatUSD(firstWholesaleTier.unitPriceUSD)}
                                </span>
                                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-600 leading-none">
                                  {unitInfo.priceSuffix}
                                </span>
                                <span className="text-[10px] font-mono text-slate-400 line-through tabular-nums leading-none">
                                  {formatUSD(product.salePrice)}
                                </span>
                              </div>
                              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 font-mono tabular-nums block leading-tight mt-0.5 truncate">
                                {formatBs(firstWholesaleTier.unitPriceUSD * settings.bcvRate)}{' '}
                                <span className="font-normal text-slate-500 text-[9px]">
                                  ({firstWholesaleTier.minQty}+ {unitInfo.pluralShort})
                                </span>
                              </span>
                            </>
                          ) : (
                            <>
                              <div className="flex items-baseline gap-1 flex-wrap">
                                <span className="text-sm sm:text-base font-extrabold text-slate-950 font-mono tabular-nums leading-none">
                                  {formatUSD(product.salePrice)}
                                </span>
                                <span className="text-[10px] sm:text-[11px] font-semibold text-slate-600 leading-none">
                                  {unitInfo.priceSuffix}
                                </span>
                              </div>
                              <span className="text-[10px] sm:text-[11px] font-bold text-emerald-700 font-mono tabular-nums block leading-tight mt-0.5 truncate">
                                {formatBs(priceBs)}{' '}
                                <span className="font-normal text-slate-500 text-[9px]">
                                  {unitInfo.priceSuffix} · BCV
                                </span>
                              </span>
                            </>
                          )}
                        </div>

                        <div className="flex items-center gap-0.5 shrink-0">
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              void handleCopyProductLink(product);
                            }}
                            className={`inline-flex items-center justify-center p-1 rounded-md transition-colors cursor-pointer shrink-0 ${
                              copiedProductLinkId === product.id
                                ? 'text-emerald-700 bg-emerald-50'
                                : 'text-slate-400 hover:text-amber-600 hover:bg-amber-50'
                            }`}
                            title={
                              copiedProductLinkId === product.id
                                ? '¡Link copiado!'
                                : 'Copiar link directo de este repuesto'
                            }
                            aria-label={`Copiar link de ${product.name}`}
                          >
                            {copiedProductLinkId === product.id ? (
                              <Check className="w-3.5 h-3.5 shrink-0" />
                            ) : (
                              <Link2 className="w-3.5 h-3.5 shrink-0" />
                            )}
                          </button>

                          <button
                            type="button"
                            onClick={() => openProductDetailModal(product, activeIdx)}
                            className="inline-flex items-center justify-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 p-1 sm:px-1.5 sm:py-1 rounded-md transition-colors cursor-pointer shrink-0 whitespace-nowrap"
                            title="Ver descripción y detalles completos"
                            aria-label={`Ver detalles de ${product.name}`}
                          >
                            <Eye className="w-3.5 h-3.5 shrink-0" />
                            <span className="hidden sm:inline">Detalles</span>
                          </button>
                        </div>
                      </div>

                      {wholesaleDisplay.hasWholesale && firstWholesaleTier && (
                        <div className="rounded-md bg-emerald-50/90 border border-emerald-200 px-1.5 py-1 space-y-0.5">
                          <div className="flex items-center justify-between gap-1 text-[10px] leading-none pb-0.5 border-b border-emerald-200/70">
                            <span className="font-extrabold text-emerald-950">
                              Descuento al Mayor
                            </span>
                            <span className="font-mono font-extrabold text-emerald-700 tabular-nums whitespace-nowrap">
                              {maxWholesaleTier && maxWholesaleTier.discountPct > firstWholesaleTier.discountPct
                                ? `hasta -${maxWholesaleTier.discountPct}%`
                                : `-${firstWholesaleTier.discountPct}%`}
                            </span>
                          </div>
                          <div className="space-y-0.5">
                            {wholesaleDisplay.tiers.slice(0, 3).map((tier) => {
                              const hasStockForTier =
                                !productTracksInventory(product) || product.stock >= tier.minQty;
                              const isWholesaleMode = shoppingMode === 'wholesale';
                              return (
                                <button
                                  key={tier.minQty}
                                  type="button"
                                  disabled={isWholesaleMode && !hasStockForTier}
                                  onClick={() =>
                                    isWholesaleMode
                                      ? handleAddToCart(product, tier.minQty)
                                      : openProductDetailModal(product, activeIdx, tier.minQty)
                                  }
                                  className={`group/tier w-full flex items-center justify-between gap-1 px-1 py-0.5 rounded text-[10px] leading-tight transition-colors cursor-pointer disabled:opacity-45 disabled:cursor-not-allowed ${
                                    isWholesaleMode
                                      ? 'hover:bg-emerald-600 hover:text-white text-emerald-950'
                                      : 'hover:bg-emerald-100 text-emerald-950'
                                  }`}
                                  title={
                                    isWholesaleMode
                                      ? hasStockForTier
                                        ? `Agregar ${tier.minQty} ${unitInfo.pluralShort} al carrito a ${formatUSD(tier.unitPriceUSD)} ${unitInfo.priceSuffix} (-${tier.discountPct}%)`
                                        : `Stock actual (${product.stock}) menor a ${tier.minQty} ${unitInfo.pluralShort}`
                                      : `Ver ${tier.minQty}+ ${unitInfo.pluralShort} a ${formatUSD(tier.unitPriceUSD)} ${unitInfo.priceSuffix} (-${tier.discountPct}%)`
                                  }
                                >
                                  <span className="font-semibold tabular-nums whitespace-nowrap">
                                    {isWholesaleMode ? `+${tier.minQty}` : `${tier.minQty}+`} {unitInfo.pluralShort}
                                  </span>
                                  <span
                                    className={`font-mono font-extrabold tabular-nums whitespace-nowrap ${
                                      isWholesaleMode
                                        ? 'text-emerald-700 group-hover/tier:text-white'
                                        : 'text-emerald-700'
                                    }`}
                                  >
                                    -{tier.discountPct}%
                                  </span>
                                  <span className="font-mono font-bold tabular-nums whitespace-nowrap">
                                    {formatUSD(tier.unitPriceUSD)}
                                  </span>
                                </button>
                              );
                            })}
                            {wholesaleDisplay.tiers.length > 3 && (
                              <button
                                type="button"
                                onClick={() => openProductDetailModal(product, activeIdx)}
                                className="w-full text-center text-[10px] font-bold text-emerald-700 hover:text-emerald-900 hover:underline pt-0.5 cursor-pointer"
                              >
                                +{wholesaleDisplay.tiers.length - 3} escala
                                {wholesaleDisplay.tiers.length - 3 === 1 ? '' : 's'} más
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-2 gap-1.5">
                        {(() => {
                          const defaultBuyQty =
                            shoppingMode === 'wholesale' &&
                            firstWholesaleTier &&
                            (!productTracksInventory(product) ||
                              product.stock >= firstWholesaleTier.minQty)
                              ? firstWholesaleTier.minQty
                              : 1;
                          return (
                            <>
                              <button
                                type="button"
                                onClick={() => handleBuyNow(product, defaultBuyQty)}
                                className="min-h-[36px] sm:min-h-[38px] w-full inline-flex items-center justify-center gap-1 py-1.5 px-1.5 sm:px-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-[11px] sm:text-xs rounded-lg shadow-2xs transition-colors cursor-pointer font-display whitespace-nowrap shrink-0"
                                title={
                                  defaultBuyQty > 1
                                    ? `Comprar ${defaultBuyQty} unidades al mayor`
                                    : 'Comprar directamente y gestionar el pago'
                                }
                              >
                                <CreditCard className="w-3.5 h-3.5 text-slate-950 shrink-0 hidden min-[380px]:block" />
                                <span>{defaultBuyQty > 1 ? `Mayor (${defaultBuyQty})` : 'Comprar'}</span>
                              </button>

                              <button
                                type="button"
                                onClick={() => handleAddToCart(product, defaultBuyQty)}
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
                                    <span>{defaultBuyQty > 1 ? `+${defaultBuyQty} Carrito` : 'Al carrito'}</span>
                                  </>
                                )}
                              </button>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                </article>
              );
            })}
          </div>

          {visibleCount < filteredProducts.length && (
            <div className="mt-6 flex flex-col sm:flex-row items-center justify-center gap-2.5">
              <button
                type="button"
                onClick={() => setVisibleCount((prev) => prev + 24)}
                className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors cursor-pointer"
              >
                Mostrar más repuestos ({filteredProducts.length - visibleCount} restantes)
              </button>
              <button
                type="button"
                onClick={() => setVisibleCount(filteredProducts.length)}
                className="px-4 py-2.5 bg-white hover:bg-slate-50 text-slate-700 border border-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Ver todos ({filteredProducts.length})
              </button>
            </div>
          )}
          </>
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
                      loading="lazy"
                      decoding="async"
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
                loading="lazy"
                decoding="async"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-slate-900/80 via-transparent to-transparent lg:hidden" />
            </div>
          </div>
        </section>
      </main>

      {/* Product Detail Modal */}
      {selectedProduct && (
        <div
          onClick={() => closeProductDetailModal()}
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
        >
          <div
            onClick={(e) => e.stopPropagation()}
            className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh] animate-in fade-in zoom-in-95 duration-150"
          >
            <div className="p-4 sm:p-6 overflow-y-auto flex-1">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-1.5 text-xs font-semibold text-amber-600 uppercase">
                    <span>{selectedProduct.brand}</span>
                    <span>·</span>
                    <span>{selectedProduct.category}</span>
                    <span>·</span>
                    <span className="font-mono">{selectedProduct.sku}</span>
                  </div>
                  <h3 className="text-xl sm:text-2xl font-bold font-display text-slate-900 mt-1">
                    {selectedProduct.name}
                  </h3>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  <button
                    type="button"
                    onClick={() => void handleCopyProductLink(selectedProduct)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      copiedProductLinkId === selectedProduct.id
                        ? 'bg-emerald-50 border-emerald-300 text-emerald-800'
                        : 'bg-slate-50 hover:bg-amber-50 border-slate-200 hover:border-amber-300 text-slate-700 hover:text-amber-900'
                    }`}
                    title="Copiar enlace directo de este repuesto"
                  >
                    {copiedProductLinkId === selectedProduct.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                        <span>¡Copiado!</span>
                      </>
                    ) : (
                      <>
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Copiar link</span>
                      </>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => closeProductDetailModal()}
                    className="p-1.5 text-slate-400 hover:text-slate-700 rounded-lg hover:bg-slate-100 cursor-pointer"
                    aria-label="Cerrar detalles"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
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

                {(() => {
                  const modalWholesale = getProductWholesaleDisplayTiers(selectedProduct);
                  const selectedUnitInfo = getProductUnitInfo(selectedProduct);
                  const maxAllowedStock = productTracksInventory(selectedProduct)
                    ? Math.max(1, selectedProduct.stock)
                    : 9999;
                  const safeQty = Math.min(maxAllowedStock, Math.max(1, modalOrderQty));
                  const unlockedModalTiers = modalWholesale.tiers.filter(
                    (t) => safeQty >= t.minQty
                  );
                  const activeModalTier =
                    unlockedModalTiers[unlockedModalTiers.length - 1] || null;
                  const effectiveModalUnitUSD = activeModalTier
                    ? activeModalTier.unitPriceUSD
                    : selectedProduct.salePrice;
                  const effectiveModalLineUSD =
                    Math.round(effectiveModalUnitUSD * safeQty * 100) / 100;

                  return (
                    <div className="flex flex-col justify-between">
                      <div className="space-y-3">
                        <div>
                          <span className="text-xs font-semibold text-slate-500 uppercase block">
                            {activeModalTier
                              ? `Precio al Mayor (-${activeModalTier.discountPct}%) · ${selectedUnitInfo.customerLabel}`
                              : `Precio Oficial · ${selectedUnitInfo.customerLabel}`}
                          </span>
                          <div className="flex items-baseline gap-2 flex-wrap">
                            <span className="text-2xl font-extrabold text-slate-950 font-mono tabular-nums">
                              {formatUSD(effectiveModalUnitUSD)}
                            </span>
                            <span className="text-sm font-bold text-slate-700">
                              {selectedUnitInfo.priceSuffix}
                            </span>
                            {activeModalTier && (
                              <span className="text-sm font-mono tabular-nums text-slate-400 line-through">
                                {formatUSD(selectedProduct.salePrice)}
                              </span>
                            )}
                          </div>
                          <span className="text-sm font-bold text-emerald-700 font-mono tabular-nums">
                            {formatBs(effectiveModalUnitUSD * settings.bcvRate)}{' '}
                            <span className="text-[11px] font-semibold text-slate-600">
                              {selectedUnitInfo.priceSuffix}
                            </span>{' '}
                            <span className="text-[10px] font-normal text-slate-500">
                              (Tasa BCV: {settings.bcvRate.toFixed(2)})
                            </span>
                          </span>
                        </div>

                        {modalWholesale.hasWholesale && (
                          <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-3 space-y-2">
                            <div className="flex items-center justify-between gap-2">
                              <span className="text-[11px] font-bold text-emerald-950 flex items-center gap-1.5">
                                <Layers className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                                <span>Tabla de Precios al Mayor</span>
                              </span>
                              <span className="text-[10px] font-medium text-emerald-800">
                                {selectedUnitInfo.customerLabel}
                              </span>
                            </div>

                            <div className="bg-white rounded-lg border border-emerald-200/80 overflow-hidden">
                              <table className="w-full text-[11px]">
                                <thead className="bg-emerald-50/80 text-emerald-900 border-b border-emerald-100">
                                  <tr>
                                    <th className="py-1.5 px-2 text-left font-bold">Cantidad</th>
                                    <th className="py-1.5 px-2 text-right font-bold">Desc.</th>
                                    <th className="py-1.5 px-2 text-right font-bold">
                                      $ {selectedUnitInfo.priceSuffix}
                                    </th>
                                    <th className="py-1.5 px-2 text-right font-bold">Bs. BCV</th>
                                  </tr>
                                </thead>
                                <tbody className="divide-y divide-slate-100 font-mono tabular-nums">
                                  {modalWholesale.tiers.map((tier) => {
                                    const isCurrent = activeModalTier?.minQty === tier.minQty;
                                    const canSelectTier =
                                      !productTracksInventory(selectedProduct) ||
                                      selectedProduct.stock >= tier.minQty;
                                    return (
                                      <tr
                                        key={tier.minQty}
                                        onClick={() => {
                                          if (canSelectTier) setModalOrderQty(tier.minQty);
                                        }}
                                        className={`${
                                          isCurrent
                                            ? 'bg-emerald-50 font-bold text-emerald-950'
                                            : 'text-slate-700 hover:bg-slate-50'
                                        } ${canSelectTier ? 'cursor-pointer' : 'opacity-60'}`}
                                        title={
                                          canSelectTier
                                            ? `Seleccionar ${tier.minQty} ${selectedUnitInfo.pluralShort}`
                                            : 'Stock disponible menor a esta escala'
                                        }
                                      >
                                        <td className="py-1.5 px-2 font-sans font-semibold">
                                          {tier.minQty}+ {selectedUnitInfo.pluralShort}
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-bold text-emerald-700">
                                          -{tier.discountPct}%
                                        </td>
                                        <td className="py-1.5 px-2 text-right font-bold text-slate-950">
                                          {formatUSD(tier.unitPriceUSD)}
                                        </td>
                                        <td className="py-1.5 px-2 text-right text-slate-600">
                                          {formatBs(tier.unitPriceUSD * settings.bcvRate)}
                                        </td>
                                      </tr>
                                    );
                                  })}
                                </tbody>
                              </table>
                            </div>
                          </div>
                        )}

                        <div>
                          <span className="text-xs font-semibold text-slate-500 uppercase block">
                            {productTracksInventory(selectedProduct)
                              ? 'Disponibilidad en Almacén'
                              : 'Fabricación Propia bajo Pedido'}
                          </span>
                          {productTracksInventory(selectedProduct) ? (
                            selectedProduct.stock > 0 ? (
                              <div className="flex items-center gap-1.5 text-emerald-600 font-semibold text-xs mt-0.5">
                                <CheckCircle2 className="w-4 h-4" />
                                <span>
                                  {selectedProduct.stock}{' '}
                                  {selectedUnitInfo.isDefaultUnit
                                    ? 'unidades'
                                    : selectedUnitInfo.pluralShort}{' '}
                                  en stock
                                </span>
                              </div>
                            ) : (
                              <div className="mt-1 rounded-lg bg-rose-50 border border-rose-200 px-2.5 py-2 text-xs font-semibold text-rose-800">
                                Agotado temporalmente en almacén. Consúltanos por WhatsApp para fecha de reposición.
                              </div>
                            )
                          ) : (
                            <div className="mt-1.5 rounded-lg bg-amber-50 border border-amber-200 p-2.5 space-y-1">
                              <div className="flex items-center gap-1.5 text-amber-950 font-bold text-xs">
                                <Clock className="w-4 h-4 text-amber-700 shrink-0" />
                                <span>
                                  Tiempo estimado de fabricación:{' '}
                                  {selectedProduct.productionTimeLabel || DEFAULT_PRODUCTION_TIME_LABEL}
                                </span>
                              </div>
                              <p className="text-[11px] text-amber-900 leading-snug">
                                {selectedProduct.productionTimeNote || DEFAULT_PRODUCTION_TIME_NOTE}
                              </p>
                            </div>
                          )}
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
                                      closeProductDetailModal();
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

                      <div className="mt-5 pt-4 border-t border-slate-200 flex flex-col gap-2.5">
                        {(!productTracksInventory(selectedProduct) || selectedProduct.stock > 0) && (
                          <>
                            {/* Quantity Selector */}
                            <div className="flex flex-wrap items-center justify-between gap-2 bg-slate-50 rounded-xl border border-slate-200 px-3 py-2">
                              <div className="flex items-center gap-2">
                                <span className="text-[11px] font-bold text-slate-700">
                                  Cantidad ({selectedUnitInfo.pluralShort}):
                                </span>
                                <div className="flex items-center border border-slate-300 rounded-lg bg-white overflow-hidden">
                                  <button
                                    type="button"
                                    onClick={() => setModalOrderQty((q) => Math.max(1, q - 1))}
                                    className="p-1.5 text-slate-600 hover:bg-slate-100 cursor-pointer"
                                    aria-label="Disminuir cantidad"
                                  >
                                    <Minus className="w-3.5 h-3.5" />
                                  </button>
                                  <input
                                    type="number"
                                    min={1}
                                    max={maxAllowedStock}
                                    value={safeQty}
                                    onChange={(e) => {
                                      const val = parseInt(e.target.value, 10);
                                      if (!Number.isNaN(val)) {
                                        setModalOrderQty(Math.min(maxAllowedStock, Math.max(1, val)));
                                      }
                                    }}
                                    className="w-12 text-center text-xs font-mono font-bold text-slate-900 focus:outline-hidden tabular-nums"
                                  />
                                  <button
                                    type="button"
                                    onClick={() =>
                                      setModalOrderQty((q) => Math.min(maxAllowedStock, q + 1))
                                    }
                                    disabled={safeQty >= maxAllowedStock}
                                    className="p-1.5 text-slate-600 hover:bg-slate-100 disabled:opacity-30 cursor-pointer"
                                    aria-label="Aumentar cantidad"
                                  >
                                    <Plus className="w-3.5 h-3.5" />
                                  </button>
                                </div>
                              </div>

                              <div className="text-right font-mono tabular-nums">
                                <span className="text-xs font-extrabold text-slate-950 block">
                                  Total: {formatUSD(effectiveModalLineUSD)}
                                </span>
                                <span className="text-[10px] font-semibold text-emerald-700 block">
                                  {formatBs(effectiveModalLineUSD * settings.bcvRate)}
                                </span>
                              </div>
                            </div>

                            <div className="grid grid-cols-2 gap-2">
                              <button
                                onClick={() => {
                                  handleBuyNow(selectedProduct, safeQty);
                                  closeProductDetailModal();
                                }}
                                className="py-2.5 px-3 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl transition-all flex items-center justify-center gap-1.5 cursor-pointer shadow-xs font-display"
                                title="Comprar y gestionar el pago directamente"
                              >
                                <CreditCard className="w-4 h-4 text-slate-950" />
                                <span>
                                  Comprar ({safeQty}
                                  {selectedUnitInfo.isDefaultUnit ? '' : ` ${selectedUnitInfo.pluralShort}`})
                                </span>
                              </button>

                              <button
                                onClick={() => handleAddToCart(selectedProduct, safeQty)}
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
                                    <span>Al Carrito ({safeQty})</span>
                                  </>
                                )}
                              </button>
                            </div>
                          </>
                        )}

                        <div className="grid grid-cols-2 gap-2">
                          <button
                            type="button"
                            onClick={() => handleConsultWhatsApp(selectedProduct)}
                            className="py-2 px-2.5 bg-emerald-50 hover:bg-emerald-100 text-emerald-800 border border-emerald-200 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                          >
                            <Phone className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                            <span>Consultar</span>
                          </button>

                          <a
                            href={buildProductWhatsAppShareUrl(
                              selectedProduct,
                              settings.bcvRate,
                              settings.commercialName || storeName,
                              publicStoreUrl
                            )}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="py-2 px-2.5 bg-slate-50 hover:bg-slate-100 text-slate-800 border border-slate-200 font-semibold text-xs rounded-xl transition-colors flex items-center justify-center gap-1.5 cursor-pointer whitespace-nowrap"
                            title="Compartir enlace de este repuesto por WhatsApp"
                          >
                            <Share2 className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                            <span>Enviar Link</span>
                          </a>
                        </div>
                      </div>
                    </div>
                  );
                })()}
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
            <p className="font-bold text-white">
              {cartToast.qty && cartToast.qty > 1
                ? `¡${cartToast.qty} unidades agregadas al carrito!`
                : '¡Repuesto agregado al carrito!'}
            </p>
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

      {/* Floating Toast Notification for Copied Product Link */}
      {linkCopiedToast && !cartToast && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-slate-700 text-xs animate-in fade-in slide-in-from-bottom-2">
          <div className="w-7 h-7 rounded-full bg-amber-500/20 text-amber-400 flex items-center justify-center shrink-0">
            <Link2 className="w-4 h-4" />
          </div>
          <div className="min-w-0 pr-1">
            <p className="font-bold text-white">¡Link del repuesto copiado!</p>
            <p className="text-[11px] text-slate-300 truncate max-w-xs">
              {linkCopiedToast.productName}
            </p>
          </div>
          <button
            type="button"
            onClick={() => setLinkCopiedToast(null)}
            className="text-slate-400 hover:text-white p-1 cursor-pointer"
            aria-label="Cerrar aviso"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* Pending Accounts Lookup Modal by Cédula */}
      {isPendingAccountsOpen && (
        <Suspense fallback={null}>
          <CustomerPendingAccountsModal
            isOpen={isPendingAccountsOpen}
            onClose={() => setIsPendingAccountsOpen(false)}
          />
        </Suspense>
      )}
    </div>
  );
};
