import React from 'react';
import { useStore } from '../context/StoreContext';
import { formatBs, buildWhatsAppLink } from '../utils/formatters';
import { ShoppingBag, Search, Phone, Wrench, Sparkles, Clock } from 'lucide-react';

export const Navbar: React.FC = () => {
  const {
    settings,
    bcvRate,
    bcvDate,
    cartCount,
    activeTab,
    setActiveTab,
    setIsCartOpen,
  } = useStore();

  const whatsappUrl = buildWhatsAppLink(
    settings.whatsapp,
    `¡Hola ${settings.commercialName}! Vengo de la tienda online Mercado Moto CC y deseo consultar la disponibilidad de un repuesto.`
  );

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      {/* Top Banner: BCV & Location info */}
      <div className="bg-slate-950 text-slate-300 text-[11px] px-4 py-1.5 font-medium border-b border-slate-800">
        <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="flex h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
            <span>Tasa Oficial BCV:</span>
            <span className="font-bold text-amber-400 font-mono">
              {formatBs(bcvRate)} / $1 USD
            </span>
            <span className="hidden sm:inline text-slate-500">({bcvDate})</span>
          </div>

          <div className="flex items-center gap-4 text-slate-400">
            <span className="hidden md:inline">📍 Mérida, Venezuela · Envíos por MRW, Zoom y Tealca</span>
            <a
              href={whatsappUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="text-emerald-400 hover:text-emerald-300 flex items-center gap-1 font-semibold"
            >
              <Phone className="w-3 h-3" />
              <span>WhatsApp: {settings.phone}</span>
            </a>
          </div>
        </div>
      </div>

      {/* Main Header */}
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-3 flex items-center justify-between gap-4">
        {/* Brand */}
        <div
          onClick={() => setActiveTab('catalogo')}
          className="flex items-center gap-3 cursor-pointer group"
        >
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-amber-500 to-amber-400 flex items-center justify-center text-slate-950 font-black shadow-md shadow-amber-500/20 group-hover:scale-105 transition-transform">
            <Wrench className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className="font-display font-black text-lg tracking-tight text-slate-950">
                MERCADO MOTO
              </span>
              <span className="font-bold text-[10px] bg-amber-500 text-slate-950 px-1.5 py-0.2 rounded font-mono">
                CC
              </span>
            </div>
            <p className="text-[11px] text-slate-500 font-medium">
              Tienda Oficial · {settings.commercialName}
            </p>
          </div>
        </div>

        {/* Desktop Navigation */}
        <nav className="hidden md:flex items-center gap-2">
          <button
            onClick={() => setActiveTab('catalogo')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
              activeTab === 'catalogo'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            Catálogo de Repuestos
          </button>
          <button
            onClick={() => setActiveTab('portal')}
            className={`px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer flex items-center gap-1.5 ${
              activeTab === 'portal'
                ? 'bg-amber-500 text-slate-950 shadow-xs'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
            }`}
          >
            <Search className="w-3.5 h-3.5" />
            <span>Consultar mi Moto / Factura</span>
          </button>
        </nav>

        {/* Cart Action */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => setIsCartOpen(true)}
            className="relative flex items-center gap-2 px-4 py-2.5 rounded-xl bg-slate-950 hover:bg-slate-800 text-white font-bold text-xs shadow-md transition-all cursor-pointer group"
          >
            <ShoppingBag className="w-4 h-4 text-amber-400 group-hover:scale-110 transition-transform" />
            <span>Mi Carrito</span>
            {cartCount > 0 ? (
              <span className="bg-amber-500 text-slate-950 font-black px-2 py-0.5 rounded-full text-[10px] font-mono animate-bounce">
                {cartCount}
              </span>
            ) : (
              <span className="text-slate-400 font-mono text-[11px]">0</span>
            )}
          </button>
        </div>
      </div>

      {/* Mobile Bottom Navigation Bar */}
      <div className="md:hidden fixed bottom-0 left-0 right-0 z-40 bg-white/95 backdrop-blur-md border-t border-slate-200 px-4 py-2 flex items-center justify-around shadow-2xl">
        <button
          onClick={() => setActiveTab('catalogo')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold py-1 px-3 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'catalogo' ? 'text-amber-600' : 'text-slate-500'
          }`}
        >
          <Wrench className="w-4 h-4" />
          <span>Repuestos</span>
        </button>

        <button
          onClick={() => setActiveTab('portal')}
          className={`flex flex-col items-center gap-1 text-[10px] font-bold py-1 px-3 rounded-lg transition-colors cursor-pointer ${
            activeTab === 'portal' ? 'text-amber-600' : 'text-slate-500'
          }`}
        >
          <Search className="w-4 h-4" />
          <span>Mi Moto</span>
        </button>

        <button
          onClick={() => setIsCartOpen(true)}
          className="relative flex flex-col items-center gap-1 text-[10px] font-bold py-1 px-3 text-slate-900 cursor-pointer"
        >
          <div className="relative">
            <ShoppingBag className="w-4 h-4 text-amber-500" />
            {cartCount > 0 && (
              <span className="absolute -top-1 -right-2 bg-amber-500 text-slate-950 font-mono font-bold text-[9px] px-1 rounded-full">
                {cartCount}
              </span>
            )}
          </div>
          <span>Carrito</span>
        </button>

        <a
          href={whatsappUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="flex flex-col items-center gap-1 text-[10px] font-bold py-1 px-3 text-emerald-600"
        >
          <Phone className="w-4 h-4" />
          <span>WhatsApp</span>
        </a>
      </div>
    </header>
  );
};
