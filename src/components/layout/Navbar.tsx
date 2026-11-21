import React, { useState, useRef, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  ShoppingBag,
  Search,
  LayoutDashboard,
  ShoppingCart,
  RefreshCw,
  TrendingUp,
  PanelLeftClose,
  PanelLeftOpen,
  Menu,
  User,
  UserCheck,
  LogOut,
  ChevronDown,
  ShieldCheck,
  UserPlus,
  KeyRound,
} from 'lucide-react';

interface NavbarProps {
  onOpenCart: () => void;
}

export const Navbar: React.FC<NavbarProps> = ({ onOpenCart }) => {
  const {
    currentView,
    setCurrentView,
    cartItemCount,
    settings,
    updateBcvRate,
    updateUsdtRate,
    isSyncingBcv,
    bcvSyncMessage,
    syncBcvRate,
    isSyncingUsdt,
    usdtSyncMessage,
    syncUsdtRate,
    exchangeGap,
    isAdminSidebarCollapsed,
    toggleAdminSidebar,
    isAdminMobileMenuOpen,
    setIsAdminMobileMenuOpen,
    isPublicClientMode,
    enterPublicStore,
    enterAdminMode,
    onlineStoreBrand,
    currentUser,
    isAuthenticated,
    isAdmin,
    openAuthModal,
    setIsChangePasswordModalOpen,
    logout,
  } = useApp();
  const [isEditingRate, setIsEditingRate] = useState(false);
  const [tempRate, setTempRate] = useState(settings.bcvRate.toString());
  const [isEditingUsdt, setIsEditingUsdt] = useState(false);
  const [tempUsdtRate, setTempUsdtRate] = useState(exchangeGap.usdtRate.toString());
  const [isUserMenuOpen, setIsUserMenuOpen] = useState(false);
  const userMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (userMenuRef.current && !userMenuRef.current.contains(event.target as Node)) {
        setIsUserMenuOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const isAdminView = currentView.startsWith('admin_') && isAdmin;
  const storeName = onlineStoreBrand || 'Mercado Moto CC';

  const handleSaveRate = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(tempRate);
    if (!isNaN(parsed) && parsed > 0) {
      updateBcvRate(parsed);
      setIsEditingRate(false);
    }
  };

  const handleSaveUsdtRate = (e: React.FormEvent) => {
    e.preventDefault();
    const parsed = parseFloat(tempUsdtRate);
    if (!isNaN(parsed) && parsed > 0) {
      updateUsdtRate(parsed);
      setIsEditingUsdt(false);
    }
  };

  return (
    <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200">
      {/* BCV Sync Toast Notice */}
      {bcvSyncMessage && (
        <div className="bg-emerald-600 text-white text-[11px] font-medium py-1 px-4 text-center transition-all flex items-center justify-center gap-2 shadow-xs">
          <RefreshCw className={`w-3 h-3 shrink-0 ${isSyncingBcv ? 'animate-spin' : ''}`} />
          <span className="truncate">{bcvSyncMessage}</span>
          <span className="opacity-80 hidden sm:inline shrink-0">· Oficial bcv.org.ve</span>
        </div>
      )}

      {/* USDT Sync Toast Notice (SOLO ADMIN) */}
      {isAdminView && usdtSyncMessage && (
        <div className="bg-amber-600 text-white text-[11px] font-medium py-1 px-4 text-center transition-all flex items-center justify-center gap-2 shadow-xs">
          <RefreshCw className={`w-3 h-3 shrink-0 ${isSyncingUsdt ? 'animate-spin' : ''}`} />
          <span className="truncate">{usdtSyncMessage}</span>
          <span className="opacity-80 hidden sm:inline shrink-0">· Referencia USDT Binance</span>
        </div>
      )}

      {/* Top Bar Zone: Brand | Links | Primary Actions */}
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-3 md:gap-6 lg:gap-8">
        {/* Zone 1: Brand Wordmark & Sidebar Toggle (Protected from squishing) */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0 min-w-0">
          {isAdminView && (
            <>
              {/* Desktop 1-click toggle */}
              <button
                type="button"
                onClick={toggleAdminSidebar}
                className="hidden md:flex p-1.5 sm:p-2 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                title={isAdminSidebarCollapsed ? 'Desplegar menú lateral' : 'Plegar menú lateral'}
              >
                {isAdminSidebarCollapsed ? (
                  <PanelLeftOpen className="w-5 h-5 text-amber-600" />
                ) : (
                  <PanelLeftClose className="w-5 h-5 text-slate-700" />
                )}
              </button>

              {/* Mobile drawer toggle */}
              <button
                type="button"
                onClick={() => setIsAdminMobileMenuOpen(!isAdminMobileMenuOpen)}
                className="md:hidden p-1.5 text-slate-700 hover:text-slate-900 hover:bg-slate-100 rounded-lg transition-colors cursor-pointer shrink-0"
                title="Abrir menú"
              >
                <Menu className="w-5 h-5 text-slate-800" />
              </button>
            </>
          )}

          {/* Brand Logo & Single-Line Wordmark */}
          <button
            type="button"
            onClick={() => setCurrentView('tienda')}
            className="text-left group cursor-pointer focus:outline-hidden flex items-center gap-2 sm:gap-2.5 shrink-0"
          >
            <div className="w-8 h-8 sm:w-9 sm:h-9 rounded-xl bg-gradient-to-br from-amber-500 to-amber-600 text-slate-950 flex items-center justify-center font-black shadow-xs shrink-0 group-hover:scale-105 transition-transform">
              <ShoppingBag className="w-4 h-4 sm:w-5 sm:h-5" />
            </div>
            <span className="text-base sm:text-lg lg:text-xl font-extrabold tracking-tight text-slate-950 group-hover:text-amber-600 transition-colors whitespace-nowrap font-display max-w-[165px] sm:max-w-none truncate">
              {isPublicClientMode || !isAdminView ? storeName : settings.commercialName}
            </span>
          </button>
        </div>

        {/* Zone 2: Navigation Links (Single-line, concise, centered) */}
        <nav className="hidden md:flex items-center justify-center gap-5 lg:gap-7 text-sm font-medium text-slate-600 shrink-0">
          <button
            type="button"
            onClick={() => setCurrentView('tienda')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-950 py-1 cursor-pointer border-b-2 ${
              currentView === 'tienda'
                ? 'text-amber-600 font-semibold border-amber-500'
                : 'border-transparent'
            }`}
          >
            Tienda
          </button>
          <button
            type="button"
            onClick={() => setCurrentView('consulta_cliente')}
            className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-950 py-1 cursor-pointer border-b-2 ${
              currentView === 'consulta_cliente'
                ? 'text-amber-600 font-semibold border-amber-500'
                : 'border-transparent'
            }`}
          >
            Consultar Moto
          </button>

          {/* Admin panel link: ONLY visible to authenticated Admins */}
          {isAdmin && (
            <button
              type="button"
              onClick={enterAdminMode}
              className={`transition-colors whitespace-nowrap shrink-0 hover:text-slate-950 py-1 cursor-pointer flex items-center gap-1.5 border-b-2 ${
                isAdminView
                  ? 'text-amber-600 font-bold border-amber-500'
                  : 'text-slate-700 hover:text-amber-600 font-semibold border-transparent'
              }`}
            >
              <LayoutDashboard className="w-4 h-4 text-amber-500 shrink-0" />
              <span>Panel Taller</span>
            </button>
          )}
        </nav>

        {/* Zone 3: Primary Actions & Utilities */}
        <div className="flex items-center gap-2 sm:gap-2.5 shrink-0">
          {/* BCV Exchange Rate Control (Desktop xl+) */}
          <div className="hidden xl:flex items-center gap-1.5 bg-emerald-50 text-emerald-900 border border-emerald-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0">
            <TrendingUp className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
            <span className="text-slate-600 text-[11px] font-medium">BCV</span>
            {isEditingRate ? (
              <form onSubmit={handleSaveRate} className="inline-flex items-center gap-1">
                <input
                  type="number"
                  step="0.01"
                  value={tempRate}
                  onChange={(e) => setTempRate(e.target.value)}
                  className="w-16 p-0.5 text-xs font-mono bg-white border border-emerald-400 rounded text-slate-900"
                  autoFocus
                />
                <button type="submit" className="text-[10px] bg-emerald-600 text-white px-1.5 py-0.5 rounded cursor-pointer">
                  OK
                </button>
              </form>
            ) : (
              <button
                type="button"
                onClick={() => {
                  if (isAdminView) {
                    setTempRate(settings.bcvRate.toString());
                    setIsEditingRate(true);
                  }
                }}
                className={`font-mono tabular-nums text-emerald-950 font-bold whitespace-nowrap ${
                  isAdminView ? 'hover:underline cursor-pointer' : 'cursor-default'
                }`}
                title={`Tasa oficial BCV: Bs. ${settings.bcvRate.toFixed(2)}${settings.bcvLastUpdated ? ` (Última sinc: ${settings.bcvLastUpdated})` : ''}`}
              >
                Bs. {settings.bcvRate.toFixed(2)}
              </button>
            )}

            {isAdminView && (
              <button
                type="button"
                onClick={() => syncBcvRate()}
                disabled={isSyncingBcv}
                className={`p-0.5 text-emerald-700 hover:text-emerald-950 hover:bg-emerald-100 rounded transition-colors cursor-pointer ${
                  isSyncingBcv ? 'opacity-60 cursor-not-allowed' : ''
                }`}
                title="Sincronizar tasa oficial en vivo desde el Banco Central de Venezuela"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingBcv ? 'animate-spin text-emerald-700' : ''}`} />
              </button>
            )}
          </div>

          {/* USDT Binance + Brecha Cambiaria (ESTRICTAMENTE SOLO EN PANEL ADMINISTRATIVO) */}
          {isAdminView && (
            <div className="hidden xl:flex items-center gap-1.5 bg-amber-50 text-amber-950 border border-amber-200 px-2.5 py-1.5 rounded-lg text-xs font-semibold shrink-0">
              <span className="text-amber-700 text-[11px] font-bold">USDT</span>
              {isEditingUsdt ? (
                <form onSubmit={handleSaveUsdtRate} className="inline-flex items-center gap-1">
                  <input
                    type="number"
                    step="0.01"
                    value={tempUsdtRate}
                    onChange={(e) => setTempUsdtRate(e.target.value)}
                    className="w-16 p-0.5 text-xs font-mono bg-white border border-amber-400 rounded text-slate-900"
                    autoFocus
                  />
                  <button type="submit" className="text-[10px] bg-amber-600 text-white px-1.5 py-0.5 rounded cursor-pointer">
                    OK
                  </button>
                </form>
              ) : (
                <button
                  type="button"
                  onClick={() => {
                    setTempUsdtRate(exchangeGap.usdtRate.toString());
                    setIsEditingUsdt(true);
                  }}
                  className="font-mono tabular-nums text-amber-950 font-bold whitespace-nowrap hover:underline cursor-pointer"
                  title={`Tasa USDT Binance (Solo Admin): Bs. ${exchangeGap.usdtRate.toFixed(2)} · Clic para editar`}
                >
                  Bs. {exchangeGap.usdtRate.toFixed(2)}
                </button>
              )}
              <button
                type="button"
                onClick={() => syncUsdtRate()}
                disabled={isSyncingUsdt}
                className={`p-0.5 text-amber-700 hover:text-amber-950 hover:bg-amber-100 rounded transition-colors cursor-pointer ${
                  isSyncingUsdt ? 'opacity-60 cursor-not-allowed' : ''
                }`}
                title="Sincronizar tasa referencia USDT Binance"
              >
                <RefreshCw className={`w-3 h-3 ${isSyncingUsdt ? 'animate-spin text-amber-700' : ''}`} />
              </button>
              <span
                className="ml-0.5 pl-1.5 border-l border-amber-300 font-mono text-[11px] font-extrabold text-amber-800 whitespace-nowrap"
                title={`Brecha cambiaria: ((${exchangeGap.usdtRate.toFixed(2)} - ${exchangeGap.bcvRate.toFixed(2)}) / ${exchangeGap.bcvRate.toFixed(2)}) × 100 · Factor ×${exchangeGap.gapFactor.toFixed(3)}`}
              >
                Brecha {exchangeGap.gapPct >= 0 ? '+' : ''}
                {exchangeGap.gapPct.toFixed(1)}%
              </span>
            </div>
          )}

          {/* User Account / Login Button */}
          {!currentUser ? (
            <div className="flex items-center gap-1.5 shrink-0">
              <button
                type="button"
                onClick={() => openAuthModal('login')}
                className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 text-xs font-bold text-slate-800 hover:text-slate-950 bg-slate-100 hover:bg-slate-200 rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 border border-slate-200"
              >
                <User className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                <span className="hidden sm:inline">Ingresar</span>
              </button>
              <button
                type="button"
                onClick={() => openAuthModal('register')}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all cursor-pointer whitespace-nowrap shrink-0 shadow-xs"
              >
                <UserPlus className="w-3.5 h-3.5 shrink-0" />
                <span>Registrarme</span>
              </button>
            </div>
          ) : (
            <div className="relative shrink-0" ref={userMenuRef}>
              <button
                type="button"
                onClick={() => setIsUserMenuOpen(!isUserMenuOpen)}
                className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 sm:py-2 text-xs font-bold rounded-xl transition-all cursor-pointer border whitespace-nowrap ${
                  isAdmin
                    ? 'bg-amber-500 text-slate-950 border-amber-600 shadow-xs'
                    : 'bg-slate-100 hover:bg-slate-200 text-slate-800 border-slate-200'
                }`}
                title="Menú de Usuario"
              >
                {isAdmin ? (
                  <ShieldCheck className="w-3.5 h-3.5 text-slate-950 shrink-0" />
                ) : (
                  <UserCheck className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                )}
                <span className="hidden sm:inline max-w-[110px] truncate">
                  {currentUser.name.split(' ')[0]}
                </span>
                <ChevronDown className="w-3 h-3 opacity-70 shrink-0" />
              </button>

              {/* User Dropdown Menu */}
              {isUserMenuOpen && (
                <div className="absolute right-0 mt-2 w-56 bg-white rounded-2xl shadow-2xl border border-slate-200 py-2 z-50 animate-in fade-in zoom-in-95 duration-150">
                  <div className="px-4 py-2 border-b border-slate-100">
                    <p className="text-xs font-bold text-slate-900 truncate">{currentUser.name}</p>
                    <p className="text-[10px] text-slate-500 font-mono truncate">
                      {currentUser.documentId || currentUser.phone || currentUser.email}
                    </p>
                    <p className="text-[10px] font-bold text-amber-700 mt-1">
                      {isAdmin ? 'Administrador' : 'Cliente Registrado'}
                    </p>
                  </div>

                  <div className="py-1">
                    <button
                      type="button"
                      onClick={() => {
                        setCurrentView('consulta_cliente');
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                    >
                      <Search className="w-3.5 h-3.5 text-amber-600" />
                      <span>Mis Compras y Pedidos</span>
                    </button>

                    {isAdmin && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            enterAdminMode();
                            setIsUserMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-xs text-amber-900 hover:bg-amber-50 flex items-center gap-2 cursor-pointer font-bold"
                        >
                          <LayoutDashboard className="w-3.5 h-3.5 text-amber-600" />
                          <span>Panel Administrativo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setIsChangePasswordModalOpen(true);
                            setIsUserMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-amber-50 flex items-center gap-2 cursor-pointer font-semibold"
                        >
                          <KeyRound className="w-3.5 h-3.5 text-amber-600" />
                          <span>Editar Clave Admin</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            enterPublicStore();
                            setIsUserMenuOpen(false);
                          }}
                          className="w-full text-left px-4 py-2 text-xs text-slate-700 hover:bg-slate-50 flex items-center gap-2 cursor-pointer font-medium"
                        >
                          <ShoppingBag className="w-3.5 h-3.5 text-slate-500" />
                          <span>Ver Web Clientes</span>
                        </button>
                      </>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        logout();
                        setIsUserMenuOpen(false);
                      }}
                      className="w-full text-left px-4 py-2 text-xs text-rose-600 hover:bg-rose-50 flex items-center gap-2 cursor-pointer font-semibold border-t border-slate-100 mt-1"
                    >
                      <LogOut className="w-3.5 h-3.5 text-rose-500" />
                      <span>Cerrar Sesión</span>
                    </button>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* Primary Action in Admin Mode vs Storefront Mode */}
          {isAdmin && isAdminView ? (
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={enterPublicStore}
                className="hidden lg:inline-flex items-center gap-1.5 px-3 py-2 text-xs font-bold text-slate-900 bg-amber-400 hover:bg-amber-300 rounded-xl transition-all whitespace-nowrap shrink-0 shadow-xs cursor-pointer"
                title="Ver Mercado Moto CC tal como lo ven los clientes"
              >
                <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
                <span>Web Clientes</span>
              </button>
              <button
                type="button"
                onClick={() => setCurrentView('admin_pos')}
                className="inline-flex items-center gap-1.5 px-3 sm:px-3.5 py-1.5 sm:py-2 text-xs font-semibold text-white bg-slate-900 hover:bg-slate-800 rounded-xl transition-all whitespace-nowrap shrink-0 shadow-xs cursor-pointer"
              >
                <ShoppingCart className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                <span className="hidden sm:inline">Facturar POS</span>
                <span className="sm:hidden">POS</span>
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={onOpenCart}
              className="relative inline-flex items-center gap-1.5 sm:gap-2 px-3 sm:px-4 py-1.5 sm:py-2 text-xs font-semibold text-white bg-slate-950 hover:bg-slate-800 rounded-xl transition-all whitespace-nowrap shrink-0 shadow-sm cursor-pointer"
            >
              <ShoppingBag className="w-4 h-4 text-amber-400 shrink-0" />
              <span className="hidden sm:inline">Carrito</span>
              {cartItemCount > 0 ? (
                <span className="bg-amber-500 text-slate-950 font-bold px-1.5 py-0.2 rounded-full text-[11px] font-mono tabular-nums">
                  {cartItemCount}
                </span>
              ) : (
                <span className="sm:hidden font-mono text-[11px] tabular-nums">0</span>
              )}
            </button>
          )}
        </div>
      </div>

      {/* Mobile Navigation Strip */}
      <div className="md:hidden flex items-center justify-around border-t border-slate-100 bg-slate-50/95 px-2 py-1 text-xs">
        <button
          type="button"
          onClick={() => setCurrentView('tienda')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            currentView === 'tienda'
              ? 'bg-amber-500 text-slate-950 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <ShoppingBag className="w-3.5 h-3.5 shrink-0" />
          <span>Tienda</span>
        </button>

        <button
          type="button"
          onClick={() => setCurrentView('consulta_cliente')}
          className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
            currentView === 'consulta_cliente'
              ? 'bg-amber-500 text-slate-950 shadow-2xs font-bold'
              : 'text-slate-600 hover:text-slate-900'
          }`}
        >
          <Search className="w-3.5 h-3.5 shrink-0" />
          <span>{currentUser ? 'Mis Compras' : 'Consultar'}</span>
        </button>

        {isAdmin ? (
          <button
            type="button"
            onClick={enterAdminMode}
            className={`flex items-center gap-1 px-2.5 py-1 rounded-lg font-semibold transition-colors cursor-pointer whitespace-nowrap ${
              isAdminView
                ? 'bg-amber-500 text-slate-950 shadow-2xs font-bold'
                : 'text-slate-600 hover:text-slate-900'
            }`}
          >
            <LayoutDashboard className="w-3.5 h-3.5 shrink-0" />
            <span>Panel Taller</span>
          </button>
        ) : (
          <div className="flex items-center gap-1 px-2 py-1 text-[11px] font-mono font-bold text-emerald-800 whitespace-nowrap">
            <span>BCV: Bs. {settings.bcvRate.toFixed(2)}</span>
          </div>
        )}
      </div>
    </header>
  );
};

