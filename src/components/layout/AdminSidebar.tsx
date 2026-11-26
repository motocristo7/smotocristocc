import React from 'react';
import { useApp, AppView } from '../../context/AppContext';
import {
  LayoutDashboard,
  ShoppingCart,
  Boxes,
  Wrench,
  ClipboardList,
  Users,
  Settings,
  ShoppingBag,
  Search,
  ChevronLeft,
  ChevronRight,
  TrendingUp,
  X,
  PanelLeftClose,
  PanelLeftOpen,
  FileText,
  Clock,
  BadgePercent,
  Truck,
  Receipt,
  Landmark,
  Percent,
  BellRing,
} from 'lucide-react';

import { productHasWholesaleTiers } from '../../utils/wholesalePricing';

interface NavItem {
  view: AppView;
  label: string;
  shortLabel: string;
  icon: React.ComponentType<{ className?: string }>;
  badge?: number | string;
}

export const AdminSidebar: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    settings,
    exchangeGap,
    isAdminSidebarCollapsed,
    toggleAdminSidebar,
    isAdminMobileMenuOpen,
    setIsAdminMobileMenuOpen,
    products,
    onlineOrders,
    serviceOrders,
    serviceCommissions,
    pendingCreditSales,
    purchaseOrders,
    pendingReceptionOrdersCount,
    treasuryCommitments,
    adminTasks,
    enterPublicStore,
    onlineStoreBrand,
  } = useApp();

  const storeName = onlineStoreBrand || 'Mercado Moto CC';

  const pendingOrdersCount = onlineOrders.filter(
    (o) => o.status === 'PENDIENTE_PAGO' || o.status === 'EN_ALISTAMIENTO'
  ).length;

  const activeWorkshopCount = serviceOrders.filter(
    (o) => o.status !== 'ENTREGADA'
  ).length;

  const pendingCommissionsCount = serviceCommissions.filter(
    (c) => Math.max(0, c.commissionAmountUSD - c.paidAmountUSD) > 0.01
  ).length;

  const pendingPurchasePayCount = purchaseOrders.filter(
    (po) => Math.max(0, po.totalUSD - (po.paidAmountUSD || 0)) > 0.01
  ).length;
  const purchaseBadgeCount = Math.max(pendingPurchasePayCount, pendingReceptionOrdersCount);

  const pendingTreasuryCount = treasuryCommitments.filter((c) => !c.isPaid).length;

  const pendingCreditCount = pendingCreditSales.length;

  const activeWholesaleProductsCount = products.filter((p) => productHasWholesaleTiers(p)).length;

  const pendingTasksCount = adminTasks.filter((t) => t.status === 'PENDIENTE').length;

  const navItems: NavItem[] = [
    {
      view: 'admin_dashboard',
      label: 'Resumen General',
      shortLabel: 'Resumen',
      icon: LayoutDashboard,
    },
    {
      view: 'admin_tareas',
      label: 'Tareas Pendientes',
      shortLabel: 'Tareas',
      icon: BellRing,
      badge: pendingTasksCount > 0 ? pendingTasksCount : undefined,
    },
    {
      view: 'admin_pos',
      label: 'Punto de Venta ($ y Bs)',
      shortLabel: 'POS',
      icon: ShoppingCart,
    },
    {
      view: 'admin_ventas',
      label: 'Base de Datos de Ventas',
      shortLabel: 'Ventas',
      icon: FileText,
    },
    {
      view: 'admin_cuentas_cobrar',
      label: 'Cuentas por Cobrar (Créditos)',
      shortLabel: 'Por Cobrar',
      icon: Clock,
      badge: pendingCreditCount > 0 ? pendingCreditCount : undefined,
    },
    {
      view: 'admin_compras',
      label: 'Órdenes de Compra',
      shortLabel: 'Compras',
      icon: Truck,
      badge: purchaseBadgeCount > 0 ? purchaseBadgeCount : undefined,
    },
    {
      view: 'admin_gastos',
      label: 'Gastos del Negocio',
      shortLabel: 'Gastos',
      icon: Receipt,
    },
    {
      view: 'admin_tesoreria',
      label: 'Tesorería y Finanzas',
      shortLabel: 'Tesorería',
      icon: Landmark,
      badge: pendingTreasuryCount > 0 ? pendingTreasuryCount : undefined,
    },
    {
      view: 'admin_inventario',
      label: 'Inventario & Repuestos',
      shortLabel: 'Inventario',
      icon: Boxes,
    },
    {
      view: 'admin_mayorista',
      label: 'Precios al Mayor',
      shortLabel: 'Mayorista',
      icon: Percent,
      badge: activeWholesaleProductsCount > 0 ? activeWholesaleProductsCount : undefined,
    },
    {
      view: 'admin_taller',
      label: 'Órdenes de Taller',
      shortLabel: 'Taller',
      icon: Wrench,
      badge: activeWorkshopCount > 0 ? activeWorkshopCount : undefined,
    },
    {
      view: 'admin_comisiones',
      label: 'Comisiones Técnicos',
      shortLabel: 'Comisiones',
      icon: BadgePercent,
      badge: pendingCommissionsCount > 0 ? pendingCommissionsCount : undefined,
    },
    {
      view: 'admin_pedidos',
      label: 'Gestión de Pedidos',
      shortLabel: 'Pedidos',
      icon: ClipboardList,
      badge: pendingOrdersCount > 0 ? pendingOrdersCount : undefined,
    },
    {
      view: 'admin_clientes',
      label: 'Clientes Venezuela',
      shortLabel: 'Clientes',
      icon: Users,
    },
    {
      view: 'admin_ajustes',
      label: 'Ajustes & Tasa BCV',
      shortLabel: 'Ajustes',
      icon: Settings,
    },
  ];

  const handleNavClick = (view: AppView) => {
    setCurrentView(view);
    if (isAdminMobileMenuOpen) {
      setIsAdminMobileMenuOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isAdminMobileMenuOpen && (
        <div
          className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs md:hidden"
          onClick={() => setIsAdminMobileMenuOpen(false)}
        />
      )}

      {/* Sidebar Container */}
      <aside
        className={`fixed inset-y-0 left-0 md:sticky md:top-16 z-50 md:z-30 h-screen md:h-[calc(100vh-4rem)] bg-slate-900 text-slate-300 border-r border-slate-800 transition-all duration-300 ease-in-out flex flex-col justify-between select-none shadow-xl md:shadow-none ${
          // Mobile state
          isAdminMobileMenuOpen
            ? 'w-72 translate-x-0'
            : '-translate-x-full md:translate-x-0'
        } ${
          // Desktop state
          isAdminSidebarCollapsed ? 'md:w-18' : 'md:w-72'
        }`}
      >
        {/* Top Header inside Sidebar: Title + 1-Click Collapse/Expand Button */}
        <div className="p-3 border-b border-slate-800 flex items-center justify-between gap-2">
          {!isAdminSidebarCollapsed ? (
            <div className="flex items-center gap-2 overflow-hidden px-1">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center shrink-0 text-amber-400">
                <Wrench className="w-4 h-4" />
              </div>
              <div className="min-w-0">
                <span className="text-xs font-bold text-white block truncate uppercase tracking-wider">
                  Panel Admin
                </span>
                <span className="text-[10px] text-slate-400 block truncate">
                  {settings.commercialName}
                </span>
              </div>
            </div>
          ) : (
            <div className="w-full flex justify-center py-1">
              <div className="w-8 h-8 rounded-lg bg-amber-500/20 border border-amber-500/30 flex items-center justify-center text-amber-400">
                <Wrench className="w-4 h-4" />
              </div>
            </div>
          )}

          {/* Single-Click Toggle Button (Plegar / Desplegar) */}
          <button
            type="button"
            onClick={toggleAdminSidebar}
            className="hidden md:flex p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer shrink-0"
            title={isAdminSidebarCollapsed ? 'Desplegar menú lateral' : 'Plegar menú lateral'}
          >
            {isAdminSidebarCollapsed ? (
              <PanelLeftOpen className="w-4 h-4 text-amber-400" />
            ) : (
              <PanelLeftClose className="w-4 h-4 text-slate-300" />
            )}
          </button>

          {/* Close button for mobile */}
          <button
            type="button"
            onClick={() => setIsAdminMobileMenuOpen(false)}
            className="md:hidden p-1.5 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Cerrar menú"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Main Navigation Items */}
        <div className="flex-1 py-3 px-2 overflow-y-auto space-y-1 scrollbar-thin scrollbar-thumb-slate-800">
          <div className="px-2 pb-1.5">
            {!isAdminSidebarCollapsed && (
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block">
                Módulos de Gestión
              </span>
            )}
          </div>

          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.view;

            return (
              <button
                key={item.view}
                type="button"
                onClick={() => handleNavClick(item.view)}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-xs font-semibold transition-all group cursor-pointer relative ${
                  isActive
                    ? 'bg-amber-500 text-slate-950 font-bold shadow-md shadow-amber-500/10'
                    : 'text-slate-300 hover:text-white hover:bg-slate-800/80'
                } ${isAdminSidebarCollapsed ? 'justify-center px-2' : ''}`}
                title={isAdminSidebarCollapsed ? item.label : undefined}
              >
                <Icon
                  className={`w-4 h-4 shrink-0 transition-transform group-hover:scale-110 ${
                    isActive ? 'text-slate-950' : 'text-slate-400 group-hover:text-amber-400'
                  }`}
                />

                {!isAdminSidebarCollapsed && (
                  <span className="truncate flex-1 text-left">{item.label}</span>
                )}

                {/* Badge if present */}
                {item.badge !== undefined && (
                  <span
                    className={`text-[10px] font-bold px-1.5 py-0.2 rounded-full shrink-0 font-mono ${
                      isActive
                        ? 'bg-slate-950 text-amber-400'
                        : 'bg-amber-500 text-slate-950'
                    }`}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}

          {/* Divider */}
          <div className="pt-3 pb-1.5 border-t border-slate-800/80 my-2">
            {!isAdminSidebarCollapsed && (
              <span className="text-[10px] font-bold text-slate-500 uppercase tracking-wider block px-2">
                Accesos Directos
              </span>
            )}
          </div>

          {/* Quick link to online store (Mercado Moto CC) */}
          <button
            type="button"
            onClick={() => {
              enterPublicStore();
              if (isAdminMobileMenuOpen) setIsAdminMobileMenuOpen(false);
            }}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all group cursor-pointer text-slate-300 hover:text-white hover:bg-slate-800/80 ${
              isAdminSidebarCollapsed ? 'justify-center px-2' : ''
            }`}
            title={isAdminSidebarCollapsed ? `Ver ${storeName} (Web Clientes)` : undefined}
          >
            <ShoppingBag className="w-4 h-4 shrink-0 text-amber-400 group-hover:scale-110 transition-transform" />
            {!isAdminSidebarCollapsed && (
              <div className="min-w-0 text-left">
                <span className="truncate block font-semibold text-white">{storeName}</span>
                <span className="text-[10px] text-amber-400/90 block">Web Clientes</span>
              </div>
            )}
          </button>

          {/* Quick link to customer portal */}
          <button
            type="button"
            onClick={() => handleNavClick('consulta_cliente')}
            className={`w-full flex items-center gap-3 px-3 py-2 rounded-xl text-xs font-medium transition-all group cursor-pointer text-slate-300 hover:text-white hover:bg-slate-800/80 ${
              isAdminSidebarCollapsed ? 'justify-center px-2' : ''
            }`}
            title={isAdminSidebarCollapsed ? 'Portal de Clientes' : undefined}
          >
            <Search className="w-4 h-4 shrink-0 text-slate-400 group-hover:text-amber-400 group-hover:scale-110 transition-transform" />
            {!isAdminSidebarCollapsed && <span className="truncate text-left">Portal Cliente</span>}
          </button>
        </div>

        {/* Sidebar Footer: BCV Rate & 1-Click Collapse Bar */}
        <div className="p-3 border-t border-slate-800 bg-slate-950/40 space-y-2">
          {/* BCV, USDT & Brecha Indicator (Solo Admin) */}
          {!isAdminSidebarCollapsed ? (
            <div className="bg-slate-800/60 rounded-xl p-2.5 border border-slate-700/50 space-y-1.5 text-xs">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-1.5">
                  <TrendingUp className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span className="text-[11px] text-slate-400">BCV:</span>
                </div>
                <span className="font-mono font-bold text-emerald-400 text-xs">
                  Bs. {settings.bcvRate.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between">
                <span className="text-[11px] text-slate-400 pl-5">USDT:</span>
                <span className="font-mono font-bold text-amber-400 text-xs">
                  Bs. {exchangeGap.usdtRate.toFixed(2)}
                </span>
              </div>
              <div className="flex items-center justify-between pt-1 border-t border-slate-700/60">
                <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-400">
                  Brecha
                </span>
                <span className="font-mono font-bold text-amber-300 text-[11px]">
                  {exchangeGap.gapPct >= 0 ? '+' : ''}
                  {exchangeGap.gapPct.toFixed(2)}% · ×{exchangeGap.gapFactor.toFixed(2)}
                </span>
              </div>
            </div>
          ) : (
            <div
              className="flex justify-center p-1"
              title={`BCV: Bs. ${settings.bcvRate.toFixed(2)} · USDT: Bs. ${exchangeGap.usdtRate.toFixed(2)} · Brecha: ${exchangeGap.gapPct.toFixed(2)}%`}
            >
              <div className="w-8 h-8 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                <TrendingUp className="w-3.5 h-3.5" />
              </div>
            </div>
          )}

          {/* 1-Click Collapse/Expand button at bottom for desktop */}
          <button
            type="button"
            onClick={toggleAdminSidebar}
            className={`hidden md:flex w-full items-center gap-2 p-2 text-xs font-medium text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer ${
              isAdminSidebarCollapsed ? 'justify-center' : 'justify-between'
            }`}
            title={isAdminSidebarCollapsed ? 'Desplegar menú' : 'Plegar menú'}
          >
            {!isAdminSidebarCollapsed && <span>Plegar menú lateral</span>}
            {isAdminSidebarCollapsed ? (
              <ChevronRight className="w-4 h-4 text-amber-400" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>
      </aside>
    </>
  );
};
