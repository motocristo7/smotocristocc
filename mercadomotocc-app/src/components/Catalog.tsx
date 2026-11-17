import React, { useState, useMemo } from 'react';
import { useStore } from '../context/StoreContext';
import { ProductCategory, Product } from '../types';
import { formatUSD, formatBs } from '../utils/formatters';
import {
  Search,
  SlidersHorizontal,
  X,
  Plus,
  Check,
  ShoppingBag,
  Sparkles,
  Tag,
  ShieldCheck,
  Package,
} from 'lucide-react';

const CATEGORIES: ProductCategory[] = [
  'Frenos',
  'Motor',
  'Transmisión',
  'Suspensión',
  'Eléctrico',
  'Llantas',
  'Tapicería',
  'Accesorios',
  'Lubricantes',
];

const COMMON_BRANDS = [
  'Empire Keeway',
  'Bera',
  'Yamaha',
  'Honda',
  'Suzuki',
  'Bajaj',
  'Haojue',
  'Skygo',
];

export const Catalog: React.FC = () => {
  const { products, bcvRate, addToCart, cart, isLoading } = useStore();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedBrand, setSelectedBrand] = useState<string>('all');
  const [onlyInStock, setOnlyInStock] = useState<boolean>(true);

  // Filtrado de productos
  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      // Búsqueda por texto (nombre, sku, compatibilidad, marca)
      if (searchTerm) {
        const query = searchTerm.toLowerCase();
        const matchesName = p.name.toLowerCase().includes(query);
        const matchesSku = p.sku.toLowerCase().includes(query);
        const matchesCompat = p.compatibility?.toLowerCase().includes(query);
        const matchesBrand = p.brand?.toLowerCase().includes(query);
        if (!matchesName && !matchesSku && !matchesCompat && !matchesBrand) {
          return false;
        }
      }

      // Filtro por categoría
      if (selectedCategory !== 'all' && p.category !== selectedCategory) {
        return false;
      }

      // Filtro por marca
      if (selectedBrand !== 'all') {
        const pBrand = (p.brand || '').toLowerCase();
        const pCompat = (p.compatibility || '').toLowerCase();
        const target = selectedBrand.toLowerCase();
        if (!pBrand.includes(target) && !pCompat.includes(target)) {
          return false;
        }
      }

      // Filtro por stock
      if (onlyInStock && p.stock <= 0) {
        return false;
      }

      return true;
    });
  }, [products, searchTerm, selectedCategory, selectedBrand, onlyInStock]);

  const getProductCartQuantity = (productId: string) => {
    const item = cart.find((i) => i.product.id === productId);
    return item ? item.quantity : 0;
  };

  return (
    <div className="space-y-6">
      {/* Hero Header */}
      <div className="bg-gradient-to-r from-slate-950 via-slate-900 to-slate-950 rounded-3xl p-6 sm:p-10 text-white shadow-xl relative overflow-hidden border border-slate-800">
        <div className="relative z-10 max-w-2xl space-y-3">
          <div className="inline-flex items-center gap-2 bg-amber-500/20 text-amber-400 px-3 py-1 rounded-full text-xs font-bold border border-amber-500/30">
            <Sparkles className="w-3.5 h-3.5" />
            <span>Repuestos Nuevos & Originales en Mérida</span>
          </div>

          <h1 className="text-2xl sm:text-4xl font-extrabold font-display tracking-tight">
            Catálogo Oficial de Repuestos para Motos
          </h1>

          <p className="text-xs sm:text-sm text-slate-300 leading-relaxed">
            Precios en <strong>Dólares ($ USD)</strong> y en <strong>Bolívares (Bs.) a tasa oficial del BCV</strong> en tiempo real. Envíos nacionales y entregas locales inmediatas.
          </p>
        </div>

        {/* Decorative circle glow */}
        <div className="absolute -right-20 -bottom-20 w-80 h-80 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />
      </div>

      {/* Search & Filters Bar */}
      <div className="bg-white p-4 sm:p-5 rounded-2xl border border-slate-200 shadow-sm space-y-4">
        {/* Search Input */}
        <div className="relative">
          <Search className="w-5 h-5 absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por repuesto, modelo de moto (ej. Bera SBR, Empire Arsen, GN 125, pastillas, aceite)..."
            className="w-full pl-11 pr-10 py-3 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20 text-xs sm:text-sm font-medium transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm('')}
              className="absolute right-3.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        {/* Category Filter Pills */}
        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 scrollbar-none text-xs">
          <button
            onClick={() => setSelectedCategory('all')}
            className={`px-3.5 py-1.5 rounded-full font-bold whitespace-nowrap transition-colors cursor-pointer ${
              selectedCategory === 'all'
                ? 'bg-slate-900 text-white'
                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
            }`}
          >
            Todas las Categorías
          </button>
          {CATEGORIES.map((cat) => (
            <button
              key={cat}
              onClick={() => setSelectedCategory(cat)}
              className={`px-3.5 py-1.5 rounded-full font-bold whitespace-nowrap transition-colors cursor-pointer ${
                selectedCategory === cat
                  ? 'bg-amber-500 text-slate-950'
                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
              }`}
            >
              {cat}
            </button>
          ))}
        </div>

        {/* Brand & Stock Row */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-slate-100 text-xs">
          <div className="flex items-center gap-2">
            <span className="text-slate-500 font-semibold">Marca de Moto:</span>
            <select
              value={selectedBrand}
              onChange={(e) => setSelectedBrand(e.target.value)}
              className="p-1.5 border border-slate-200 rounded-lg bg-slate-50 font-medium text-slate-800"
            >
              <option value="all">Todas las Marcas</option>
              {COMMON_BRANDS.map((b) => (
                <option key={b} value={b}>
                  {b}
                </option>
              ))}
            </select>
          </div>

          <label className="flex items-center gap-2 cursor-pointer text-slate-700 font-medium">
            <input
              type="checkbox"
              checked={onlyInStock}
              onChange={(e) => setOnlyInStock(e.target.checked)}
              className="rounded text-amber-500 focus:ring-amber-500"
            />
            <span>Solo artículos con stock disponible</span>
          </label>
        </div>
      </div>

      {/* Catalog Grid */}
      {isLoading ? (
        <div className="py-20 text-center text-slate-400 space-y-2">
          <div className="w-8 h-8 border-3 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs font-semibold">Sincronizando inventario con la tienda...</p>
        </div>
      ) : filteredProducts.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <Package className="w-12 h-12 text-slate-300 mx-auto" />
          <h3 className="font-bold text-slate-800 text-sm">No se encontraron repuestos</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            Intenta buscando con otra palabra clave o restablece los filtros para ver todo el inventario.
          </p>
          <button
            onClick={() => {
              setSearchTerm('');
              setSelectedCategory('all');
              setSelectedBrand('all');
              setOnlyInStock(false);
            }}
            className="px-4 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-xl text-xs transition-colors cursor-pointer"
          >
            Ver todos los repuestos
          </button>
        </div>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-3 sm:gap-5">
          {filteredProducts.map((product) => {
            const inCartQty = getProductCartQuantity(product.id);
            const isOutOfStock = product.stock <= 0;
            const priceBs = product.salePrice * bcvRate;

            return (
              <div
                key={product.id}
                className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs hover:shadow-md transition-all flex flex-col group"
              >
                {/* Product Image */}
                <div className="aspect-square bg-slate-100 relative overflow-hidden flex items-center justify-center p-4">
                  {product.imageUrl ? (
                    <img
                      src={product.imageUrl}
                      alt={product.name}
                      className="w-full h-full object-contain group-hover:scale-105 transition-transform duration-200"
                    />
                  ) : (
                    <div className="w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/20 text-amber-600 flex items-center justify-center font-bold text-xl">
                      🏍️
                    </div>
                  )}

                  {/* Stock pill */}
                  <div className="absolute top-2 left-2">
                    {isOutOfStock ? (
                      <span className="bg-rose-500 text-white font-bold text-[10px] px-2 py-0.5 rounded-full">
                        Agotado
                      </span>
                    ) : product.stock <= 3 ? (
                      <span className="bg-amber-500 text-slate-950 font-bold text-[10px] px-2 py-0.5 rounded-full">
                        Últimos {product.stock}
                      </span>
                    ) : (
                      <span className="bg-emerald-500 text-white font-bold text-[10px] px-2 py-0.5 rounded-full">
                        En Stock
                      </span>
                    )}
                  </div>

                  {/* SKU pill */}
                  <span className="absolute top-2 right-2 bg-slate-900/80 text-white text-[9px] font-mono px-1.5 py-0.5 rounded">
                    {product.sku}
                  </span>
                </div>

                {/* Product Content */}
                <div className="p-3.5 sm:p-4 flex-1 flex flex-col justify-between space-y-3">
                  <div>
                    <div className="flex items-center gap-1.5 text-[10px] text-slate-400 font-semibold uppercase tracking-wider mb-1">
                      <span>{product.category}</span>
                      {product.brand && (
                        <>
                          <span>•</span>
                          <span className="text-amber-600">{product.brand}</span>
                        </>
                      )}
                    </div>

                    <h3 className="font-bold text-slate-900 text-xs sm:text-sm line-clamp-2 leading-snug">
                      {product.name}
                    </h3>

                    {product.compatibility && (
                      <p className="text-[11px] text-slate-500 line-clamp-1 mt-1">
                        Aplica: {product.compatibility}
                      </p>
                    )}
                  </div>

                  {/* Pricing and Cart button */}
                  <div className="pt-2 border-t border-slate-100 space-y-2">
                    <div>
                      <div className="text-base sm:text-lg font-black text-slate-950 font-mono">
                        {formatUSD(product.salePrice)}
                      </div>
                      <div className="text-[11px] font-bold text-emerald-700 font-mono">
                        {formatBs(priceBs)}
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={isOutOfStock}
                      onClick={() => addToCart(product, 1)}
                      className={`w-full py-2 px-3 rounded-xl font-bold text-xs flex items-center justify-center gap-1.5 transition-all cursor-pointer shadow-xs ${
                        isOutOfStock
                          ? 'bg-slate-100 text-slate-400 cursor-not-allowed'
                          : inCartQty > 0
                          ? 'bg-emerald-600 hover:bg-emerald-700 text-white'
                          : 'bg-slate-950 hover:bg-amber-500 hover:text-slate-950 text-white'
                      }`}
                    >
                      {inCartQty > 0 ? (
                        <>
                          <Check className="w-3.5 h-3.5" />
                          <span>En Carrito ({inCartQty})</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3.5 h-3.5" />
                          <span>Agregar</span>
                        </>
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
