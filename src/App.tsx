import React, { useState } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/layout/Navbar';
import { Storefront } from './components/store/Storefront';
import { CartDrawer } from './components/store/CartDrawer';
import { CustomerPortal } from './components/portal/CustomerPortal';
import { AdminDashboard } from './components/admin/AdminDashboard';
import { PosView } from './components/admin/PosView';
import { SalesDatabaseView } from './components/admin/SalesDatabaseView';
import { AccountsReceivableView } from './components/admin/AccountsReceivableView';
import { PurchaseOrdersView } from './components/admin/PurchaseOrdersView';
import { ExpensesView } from './components/admin/ExpensesView';
import { TreasuryFinanceView } from './components/admin/TreasuryFinanceView';
import { InventoryView } from './components/admin/InventoryView';
import { ServiceOrdersView } from './components/admin/ServiceOrdersView';
import { CommissionsView } from './components/admin/CommissionsView';
import { OrdersView } from './components/admin/OrdersView';
import { CustomersView } from './components/admin/CustomersView';
import { SettingsView } from './components/admin/SettingsView';
import { AdminSidebar } from './components/layout/AdminSidebar';
import { InvoiceModal } from './components/modals/InvoiceModal';
import { WhatsAppModal } from './components/modals/WhatsAppModal';
import { AuthModal } from './components/modals/AuthModal';
import { ChangeAdminPasswordModal } from './components/modals/ChangeAdminPasswordModal';
import {
  ShieldCheck,
  Phone,
  MapPin,
  Clock,
  Lock,
} from 'lucide-react';

const AppContent: React.FC = () => {
  const {
    currentView,
    setCurrentView,
    settings,
    isPublicClientMode,
    enterAdminMode,
    enterPublicStore,
    onlineStoreBrand,
    isAdmin,
    currentUser,
    isAuthModalOpen,
    closeAuthModal,
    authModalTab,
    openAuthModal,
  } = useApp();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartInitialStep, setCartInitialStep] = useState<'cart' | 'checkout'>('cart');

  const handleOpenCart = (step: 'cart' | 'checkout' = 'cart') => {
    setCartInitialStep(step);
    setIsCartOpen(true);
  };

  const isCurrentViewAdmin = currentView.startsWith('admin_') && isAdmin;

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      {/* Top Navigation */}
      <Navbar onOpenCart={() => handleOpenCart('cart')} />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col md:flex-row">
        {isCurrentViewAdmin && <AdminSidebar />}

        <div className="flex-1 min-w-0 flex flex-col">
          {currentView === 'tienda' && <Storefront onOpenCart={(step) => handleOpenCart(step || 'cart')} />}
          {currentView === 'consulta_cliente' && <CustomerPortal />}

          {/* Admin Views - strictly restricted to authenticated Admin */}
          {isCurrentViewAdmin && (
            <main className="max-w-7xl w-full mx-auto px-4 sm:px-6 lg:px-8 py-8 flex-1">
              {currentView === 'admin_dashboard' && <AdminDashboard />}
              {currentView === 'admin_pos' && <PosView />}
              {currentView === 'admin_ventas' && <SalesDatabaseView />}
              {currentView === 'admin_cuentas_cobrar' && <AccountsReceivableView />}
              {currentView === 'admin_compras' && <PurchaseOrdersView />}
              {currentView === 'admin_gastos' && <ExpensesView />}
              {currentView === 'admin_tesoreria' && <TreasuryFinanceView />}
              {currentView === 'admin_inventario' && <InventoryView />}
              {currentView === 'admin_taller' && <ServiceOrdersView />}
              {currentView === 'admin_comisiones' && <CommissionsView />}
              {currentView === 'admin_pedidos' && <OrdersView />}
              {currentView === 'admin_clientes' && <CustomersView />}
              {currentView === 'admin_ajustes' && <SettingsView />}
            </main>
          )}
        </div>
      </div>

      {/* Global Modals */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        initialStep={cartInitialStep}
      />
      <InvoiceModal />
      <WhatsAppModal />
      <AuthModal
        isOpen={isAuthModalOpen}
        onClose={closeAuthModal}
        defaultTab={authModalTab}
      />
      <ChangeAdminPasswordModal />

      {/* Clean Domain Footer */}
      <footer className="bg-slate-950 text-slate-400 text-xs border-t border-slate-800 mt-auto no-print">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-10">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
            <div className="space-y-3">
              <span className="text-base font-bold text-white font-display">
                {settings.commercialName}
              </span>
              <p className="text-slate-400 text-xs leading-relaxed">
                Especialistas en venta de repuestos originales, taller mecánico multimarcas y tapicería personalizada de asientos para motocicletas.
              </p>
              <p className="text-[11px] text-slate-500">RIF: {settings.rif}</p>
            </div>

            <div>
              <span className="text-white font-semibold block mb-3 uppercase text-[11px] tracking-wider">
                Servicios del Taller
              </span>
              <ul className="space-y-2 text-slate-400">
                <li>Venta de Repuestos y Accesorios</li>
                <li>Mecánica Rápida y General</li>
                <li>Tapicería de Motocicletas</li>
                <li>Frenos ABS, Calipers y Discos</li>
                <li>Sincronización y Mantenimiento</li>
              </ul>
            </div>

            <div>
              <span className="text-white font-semibold block mb-3 uppercase text-[11px] tracking-wider">
                Atención & Ubicación
              </span>
              <div className="space-y-2 text-slate-400">
                <p className="flex items-start gap-1.5">
                  <MapPin className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                  <span>{settings.address.includes(settings.city) ? settings.address : `${settings.address}, ${settings.city} - ${settings.state}`}</span>
                </p>
                <p className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>
                    Teléfono / WhatsApp:{' '}
                    <a
                      href={`https://api.whatsapp.com/send?phone=58${settings.whatsapp.replace(/\D/g, '').replace(/^0/, '')}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-emerald-400 hover:underline font-mono font-bold"
                    >
                      {settings.phone}
                    </a>
                  </span>
                </p>
                <p className="flex items-center gap-1.5">
                  <Clock className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                  <span>Lunes a Sábado: 8:00 AM - 6:30 PM</span>
                </p>
              </div>
            </div>

            <div>
              <span className="text-white font-semibold block mb-3 uppercase text-[11px] tracking-wider">
                Pagos & Facturación en Venezuela
              </span>
              <p className="text-xs text-slate-400 leading-relaxed mb-3">
                Precios base en USD ($) con facturación y cobro en Bolívares (Bs.) a tasa oficial BCV. Recibimos Pago Móvil, Efectivo Divisas, Transferencia Bancaria y Binance Pay.
              </p>
              <div className="flex items-center gap-2 text-slate-300">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                <span className="text-[11px]">Factura y comprobante enviado al WhatsApp</span>
              </div>
            </div>
          </div>

          <div className="mt-8 pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
            <span>
              © {new Date().getFullYear()}{' '}
              {isPublicClientMode ? (onlineStoreBrand || 'Mercado Moto CC') : settings.commercialName}
              {' '}· Mérida, Venezuela. Todos los derechos reservados.
            </span>
            <div className="flex items-center gap-3">
              {isPublicClientMode ? (
                <>
                  <button onClick={() => setCurrentView('tienda')} className="hover:text-slate-300 cursor-pointer">
                    Catálogo
                  </button>
                  <span>·</span>
                  <button onClick={() => setCurrentView('consulta_cliente')} className="hover:text-slate-300 cursor-pointer">
                    Consultar Moto
                  </button>
                  <span>·</span>
                  <button
                    onClick={enterAdminMode}
                    className="hover:text-amber-400 flex items-center gap-1 cursor-pointer text-slate-600 transition-colors"
                    title="Acceso restringido para el personal del taller"
                  >
                    <Lock className="w-3 h-3" />
                    <span>Acceso Administrativo</span>
                  </button>
                </>
              ) : (
                <>
                  <button onClick={enterPublicStore} className="hover:text-amber-400 text-amber-500/90 font-medium cursor-pointer">
                    Web Mercado Moto CC
                  </button>
                  <span>·</span>
                  <button onClick={() => setCurrentView('consulta_cliente')} className="hover:text-slate-300 cursor-pointer">
                    Consultar Moto
                  </button>
                  <span>·</span>
                  <button onClick={() => setCurrentView('admin_dashboard')} className="hover:text-slate-300 cursor-pointer">
                    Panel Administración
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
};

export default function App() {
  return (
    <AppProvider>
      <AppContent />
    </AppProvider>
  );
}
