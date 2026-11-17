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
} from 'lucide-react';
import { normalizeImageUrl, PRESET_PRODUCT_IMAGES } from '../../utils/imageUrl';
import { CustomerPendingAccountsModal } from '../modals/CustomerPendingAccountsModal';

interface StorefrontProps {
  onOpenCart: (step?: 'cart' | 'checkout') => void;
}

export const Storefront: React.FC<StorefrontProps> = ({ onOpenCart }) => {
  const {
    onlineProducts,
    categories: allCategories,
    addToCart,
    settings,
    setCurrentView,
    onlineStoreBrand,
    publicStoreUrl,
  } = useApp();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [copiedBank, setCopiedBank] = useState<string | null>(null);
  const [copiedStoreLink, setCopiedStoreLink] = useState(false);
  const [recentlyAddedId, setRecentlyAddedId] = useState<string | null>(null);
  const [cartToast, setCartToast] = useState<{ productName: string } | null>(null);
  const [isPendingAccountsOpen, setIsPendingAccountsOpen] = useState(false);

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

  const filteredProducts = useMemo(() => {
    return onlineProducts.filter((product) => {
      if (product.stock <= 0) return false;

      if (selectedCategory !== 'all' && product.category !== selectedCategory) {
        return false;
      }

      if (searchTerm.trim()) {
        const query = searchTerm.toLowerCase();
        return (
          product.name.toLowerCase().includes(query) ||
          product.sku.toLowerCase().includes(query) ||
          product.brand.toLowerCase().includes(query) ||
          product.compatibility.toLowerCase().includes(query)
        );
      }

      return true;
    });
  }, [onlineProducts, selectedCategory, searchTerm]);

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
            src="/src/assets/images/hero_moto_workshop_1793482050114.jpg"
            alt="Taller y Tienda de Repuestos Servimotos Cristo Centro"
            className="w-full h-full object-cover opacity-35"
            referrerPolicy="no-referrer"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-slate-950 via-slate-950/60 to-transparent" />
        </div>

        <div className="relative z-10 max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-16 sm:py-24">
          <div className="max-w-2xl">
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-amber-400 tracking-wider uppercase mb-3">
              <span>Tienda Oficial Online</span>
              <span aria-hidden="true">·</span>
              <span>Servimotos Cristo Centro</span>
              <span aria-hidden="true">·</span>
              <span>Mérida, Venezuela</span>
            </div>

            <h1 className="text-3xl sm:text-5xl font-extrabold tracking-tight font-display text-white leading-tight">
              {storeName}
              <span className="block text-xl sm:text-2xl text-amber-400 font-semibold mt-1">
                Repuestos, Accesorios y Tapicería para Motos
              </span>
            </h1>

            <p className="mt-4 text-base sm:text-lg text-slate-300 leading-relaxed">
              Catálogo sincronizado en tiempo real con inventario físico en Mérida. Precios en <strong>Dólares ($ USD)</strong> y facturados en <strong>Bolívares (Bs.) a la tasa oficial del BCV</strong>. Envíos nacionales por MRW, Zoom y Tealca o retiro en taller.
            </p>

            <div className="mt-8 flex flex-wrap items-center gap-3">
              <a
                href="#catalogo"
                className="px-6 py-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm transition-colors shadow-lg shadow-amber-500/20 cursor-pointer whitespace-nowrap shrink-0"
              >
                Explorar Catálogo Online
              </a>
              <button
                type="button"
                onClick={() => setIsPendingAccountsOpen(true)}
                className="px-5 py-3 rounded-lg bg-slate-800/90 hover:bg-slate-700 text-white border border-amber-500/40 font-semibold text-sm transition-colors backdrop-blur-xs flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
              >
                <CreditCard className="w-4 h-4 text-amber-400 shrink-0" />
                <span>Cuentas Pendientes por Pagar</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('consulta_cliente')}
                className="px-5 py-3 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-white border border-slate-700 font-semibold text-sm transition-colors backdrop-blur-xs cursor-pointer whitespace-nowrap shrink-0"
              >
                Consultar Estado de mi Moto
              </button>
              <button
                type="button"
                onClick={handleCopyStoreLink}
                className="px-4 py-3 rounded-lg bg-slate-900/90 hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-700/80 font-medium text-xs transition-colors flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
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
            <div className="mt-10 pt-6 border-t border-slate-800/80 grid grid-cols-1 sm:grid-cols-3 gap-4 text-xs text-slate-300">
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
      <main id="catalogo" className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 pt-10">
        {/* Search & Categories Navigation Bar */}
        <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-xs mb-8">
          <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-4">
            {/* Search Input */}
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar por repuesto, marca, referencia o moto (ej. Bera SBR, Horse, NMAX, GN)..."
                className="w-full pl-10 pr-4 py-2.5 text-sm rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500 transition-colors"
              />
              {searchTerm && (
                <button
                  onClick={() => setSearchTerm('')}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-xs text-slate-400 hover:text-slate-600"
                >
                  Limpiar
                </button>
              )}
            </div>

            {/* Live Tasa BCV & Stock indicator */}
            <div className="flex flex-wrap items-center gap-2.5 shrink-0 bg-slate-50 px-3 py-2 rounded-lg border border-slate-200/80 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-emerald-700 whitespace-nowrap">
                <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                <span>Tasa BCV: Bs. {settings.bcvRate.toFixed(2)}</span>
              </div>
              <span className="text-slate-300 hidden sm:inline">|</span>
              <span className="text-slate-500 text-[11px] hidden sm:inline whitespace-nowrap">Stock físico real</span>
            </div>
          </div>

          {/* Category Tabs */}
          <div className="mt-4 pt-4 border-t border-slate-100 flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none">
            <button
              onClick={() => setSelectedCategory('all')}
              className={`px-3.5 py-1.5 rounded-lg text-xs font-semibold whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === 'all'
                  ? 'bg-slate-900 text-white shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
              }`}
            >
              Todos ({onlineProducts.length})
            </button>
            {categories.map((cat) => {
              const count = onlineProducts.filter((p) => p.category === cat).length;
              return (
                <button
                  key={cat}
                  onClick={() => setSelectedCategory(cat)}
                  className={`px-3 py-1.5 rounded-lg text-xs font-medium whitespace-nowrap transition-colors cursor-pointer ${
                    selectedCategory === cat
                      ? 'bg-slate-900 text-white font-semibold shadow-2xs'
                      : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                  }`}
                >
                  {cat} {count > 0 && <span className="opacity-70 font-mono">({count})</span>}
                </button>
              );
            })}
          </div>
        </div>

        {/* Section Header */}
        <div className="flex flex-col sm:flex-row sm:items-baseline justify-between gap-2 mb-6">
          <div>
            <h2 className="text-xl sm:text-2xl font-bold font-display text-slate-900">
              Repuestos y Accesorios Disponibles en Mérida
            </h2>
            <p className="text-xs text-slate-500 mt-1">
              Mostrando {filteredProducts.length} repuestos con precio en $ USD y equivalente en Bs. según tasa oficial BCV
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
              No hay productos con stock disponible para los filtros seleccionados o la búsqueda "{searchTerm}".
            </p>
            <button
              onClick={() => {
                setSearchTerm('');
                setSelectedCategory('all');
              }}
              className="mt-4 px-4 py-2 bg-slate-900 text-white text-xs font-semibold rounded-lg hover:bg-slate-800 transition-colors"
            >
              Restablecer filtros
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
            {filteredProducts.map((product) => {
              const priceBs = product.salePrice * settings.bcvRate;

              return (
                <div
                  key={product.id}
                  className="group bg-white rounded-xl border border-slate-200 overflow-hidden flex flex-col hover:border-slate-300 hover:shadow-md transition-all duration-200"
                >
                  {/* Product Image */}
                  <div className="relative aspect-4/3 bg-slate-100 overflow-hidden">
                    <img
                      src={normalizeImageUrl(product.imageUrl)}
                      alt={product.name}
                      className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        const target = e.currentTarget;
                        if (product.name.toLowerCase().includes('maleta')) {
                          target.src = PRESET_PRODUCT_IMAGES.maletaParaMoto;
                        } else {
                          target.src = PRESET_PRODUCT_IMAGES.brakeKit;
                        }
                      }}
                    />
                    <div className="absolute top-2.5 left-2.5 bg-slate-900/80 backdrop-blur-xs text-white text-[10px] font-semibold px-2 py-0.5 rounded">
                      {product.category}
                    </div>
                    <div className="absolute top-2.5 right-2.5 bg-emerald-600 text-white text-[10px] font-semibold px-2 py-0.5 rounded shadow-2xs">
                      {product.stock} disp.
                    </div>
                  </div>

                  {/* Content */}
                  <div className="p-4 flex-1 flex flex-col justify-between">
                    <div>
                      <div className="flex items-center justify-between text-slate-400 text-[11px] mb-1 font-mono">
                        <span>{product.brand}</span>
                        <span>{product.sku}</span>
                      </div>

                      <h3
                        onClick={() => setSelectedProduct(product)}
                        className="font-bold text-slate-900 text-sm line-clamp-2 hover:text-amber-600 cursor-pointer transition-colors"
                        title={product.name}
                      >
                        {product.name}
                      </h3>

                      <p className="text-xs text-slate-500 mt-1 line-clamp-2 leading-relaxed">
                        {product.description}
                      </p>

                      <div className="mt-2.5 pt-2 border-t border-slate-100 text-[11px] text-slate-600">
                        <span className="font-semibold text-slate-700">Compatible con: </span>
                        <span className="text-slate-500">{product.compatibility}</span>
                      </div>
                    </div>

                    {/* Dual Pricing ($ USD and Bs.) & 2 Action Buttons */}
                    <div className="mt-4 pt-3 border-t border-slate-100 space-y-2.5">
                      <div className="flex items-center justify-between">
                        <div>
                          <span className="text-base sm:text-lg font-extrabold text-slate-950 font-mono tabular-nums block leading-tight">
                            {formatUSD(product.salePrice)}
                          </span>
                          <span className="text-[11px] font-bold text-emerald-700 font-mono tabular-nums block">
                            {formatBs(priceBs)}{' '}
                            <span className="font-normal text-slate-400 text-[10px]">(BCV)</span>
                          </span>
                        </div>

                        <button
                          type="button"
                          onClick={() => setSelectedProduct(product)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-900 hover:bg-slate-100 px-2 py-1 rounded-md transition-colors cursor-pointer"
                          title="Ver detalles completos del repuesto"
                        >
                          <Eye className="w-3.5 h-3.5" />
                          <span>Detalles</span>
                        </button>
                      </div>

                      {/* 2 Buttons: Comprar (Direct to Payment) & Agregar al carrito */}
                      <div className="grid grid-cols-2 gap-2 pt-1">
                        <button
                          type="button"
                          onClick={() => handleBuyNow(product)}
                          className="w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs rounded-xl shadow-xs hover:shadow-sm transition-all cursor-pointer font-display"
                          title="Comprar directamente y gestionar el pago"
                        >
                          <CreditCard className="w-3.5 h-3.5 text-slate-950 shrink-0" />
                          <span>Comprar</span>
                        </button>

                        <button
                          type="button"
                          onClick={() => handleAddToCart(product)}
                          className={`w-full inline-flex items-center justify-center gap-1.5 py-2.5 px-2 border rounded-xl font-semibold text-xs transition-all cursor-pointer ${
                            recentlyAddedId === product.id
                              ? 'bg-emerald-50 border-emerald-400 text-emerald-800 font-bold'
                              : 'bg-slate-900 hover:bg-slate-800 text-white border-transparent'
                          }`}
                          title="Agregar este repuesto a tu carrito"
                        >
                          {recentlyAddedId === product.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="whitespace-nowrap">¡Agregado!</span>
                            </>
                          ) : (
                            <>
                              <ShoppingCart className="w-3.5 h-3.5 text-slate-200 shrink-0" />
                              <span className="whitespace-nowrap">Al carrito</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
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
                src="/src/assets/images/moto_upholstery_seat_1793482052580.jpg"
                alt="Tapicería de motos y asientos custom"
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
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
                <div className="aspect-4/3 rounded-xl overflow-hidden bg-slate-100 border border-slate-200">
                  <img
                    src={normalizeImageUrl(selectedProduct.imageUrl)}
                    alt={selectedProduct.name}
                    className="w-full h-full object-cover"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      const target = e.currentTarget;
                      if (selectedProduct.name.toLowerCase().includes('maleta')) {
                        target.src = PRESET_PRODUCT_IMAGES.maletaParaMoto;
                      } else {
                        target.src = PRESET_PRODUCT_IMAGES.brakeKit;
                      }
                    }}
                  />
                </div>

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
                        {selectedProduct.compatibility}
                      </p>
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
