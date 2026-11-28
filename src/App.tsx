import React, { useState, useEffect, Suspense, lazy } from 'react';
import { AppProvider, useApp } from './context/AppContext';
import { Navbar } from './components/layout/Navbar';
import { Storefront } from './components/store/Storefront';
import { CartDrawer } from './components/store/CartDrawer';
import { ErrorBoundary } from './components/ErrorBoundary';
import {
  ShieldCheck,
  Phone,
  MapPin,
  Clock,
  Lock,
} from 'lucide-react';

// Lazy-load secondary views, heavy admin modules (Excel/PDF/Charts), and modals on demand
// so initial storefront load stays lightweight and fast on every device.
const CustomerPortal = lazy(() =>
  import('./components/portal/CustomerPortal').then((m) => ({ default: m.CustomerPortal }))
);
const AdminDashboard = lazy(() =>
  import('./components/admin/AdminDashboard').then((m) => ({ default: m.AdminDashboard }))
);
const TasksView = lazy(() =>
  import('./components/admin/TasksView').then((m) => ({ default: m.TasksView }))
);
const TaskReminderNotifier = lazy(() =>
  import('./components/admin/TaskReminderNotifier').then((m) => ({ default: m.TaskReminderNotifier }))
);
const PosView = lazy(() =>
  import('./components/admin/PosView').then((m) => ({ default: m.PosView }))
);
const SalesDatabaseView = lazy(() =>
  import('./components/admin/SalesDatabaseView').then((m) => ({ default: m.SalesDatabaseView }))
);
const AccountsReceivableView = lazy(() =>
  import('./components/admin/AccountsReceivableView').then((m) => ({ default: m.AccountsReceivableView }))
);
const PurchaseOrdersView = lazy(() =>
  import('./components/admin/PurchaseOrdersView').then((m) => ({ default: m.PurchaseOrdersView }))
);
const ExpensesView = lazy(() =>
  import('./components/admin/ExpensesView').then((m) => ({ default: m.ExpensesView }))
);
const TreasuryFinanceView = lazy(() =>
  import('./components/admin/TreasuryFinanceView').then((m) => ({ default: m.TreasuryFinanceView }))
);
const InventoryView = lazy(() =>
  import('./components/admin/InventoryView').then((m) => ({ default: m.InventoryView }))
);
const WholesalePricingView = lazy(() =>
  import('./components/admin/WholesalePricingView').then((m) => ({ default: m.WholesalePricingView }))
);
const ServiceOrdersView = lazy(() =>
  import('./components/admin/ServiceOrdersView').then((m) => ({ default: m.ServiceOrdersView }))
);
const CommissionsView = lazy(() =>
  import('./components/admin/CommissionsView').then((m) => ({ default: m.CommissionsView }))
);
const OrdersView = lazy(() =>
  import('./components/admin/OrdersView').then((m) => ({ default: m.OrdersView }))
);
const CustomersView = lazy(() =>
  import('./components/admin/CustomersView').then((m) => ({ default: m.CustomersView }))
);
const SettingsView = lazy(() =>
  import('./components/admin/SettingsView').then((m) => ({ default: m.SettingsView }))
);
const StaffManagementView = lazy(() =>
  import('./components/admin/StaffManagementView').then((m) => ({ default: m.StaffManagementView }))
);
const AdminSidebar = lazy(() =>
  import('./components/layout/AdminSidebar').then((m) => ({ default: m.AdminSidebar }))
);
const InvoiceModal = lazy(() =>
  import('./components/modals/InvoiceModal').then((m) => ({ default: m.InvoiceModal }))
);
const WhatsAppModal = lazy(() =>
  import('./components/modals/WhatsAppModal').then((m) => ({ default: m.WhatsAppModal }))
);
const AuthModal = lazy(() =>
  import('./components/modals/AuthModal').then((m) => ({ default: m.AuthModal }))
);
const ChangeAdminPasswordModal = lazy(() =>
  import('./components/modals/ChangeAdminPasswordModal').then((m) => ({ default: m.ChangeAdminPasswordModal }))
);

const ViewLoadingFallback: React.FC = () => (
  <div className="flex-1 flex items-center justify-center py-20 px-4">
    <div className="flex items-center gap-3 text-xs font-semibold text-slate-500">
      <span className="w-4 h-4 rounded-full border-2 border-slate-300 border-t-amber-500 animate-spin" />
      <span>Cargando módulo...</span>
    </div>
  </div>
);

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
    isStaff,
    canAccessView,
    getDefaultStaffView,
    isAuthModalOpen,
    closeAuthModal,
    authModalTab,
    selectedInvoice,
    whatsappModalData,
    isChangePasswordModalOpen,
  } = useApp();
  const [isCartOpen, setIsCartOpen] = useState(false);
  const [cartInitialStep, setCartInitialStep] = useState<'cart' | 'checkout'>('cart');

  useEffect(() => {
    try {
      const saved = localStorage.getItem('servimotos_ui_font_scale');
      const scale = saved === 'normal' || saved === 'max' ? saved : 'grande';
      document.documentElement.setAttribute('data-font-scale', scale);
    } catch {
      document.documentElement.setAttribute('data-font-scale', 'grande');
    }
  }, []);

  const handleOpenCart = (step: 'cart' | 'checkout' = 'cart') => {
    setCartInitialStep(step);
    setIsCartOpen(true);
  };

  const isCurrentViewAdmin = currentView.startsWith('admin_') && isStaff;
  const hasCurrentViewAccess = !isCurrentViewAdmin || canAccessView(currentView);
  const showStorefrontFallback =
    currentView === 'tienda' || (currentView !== 'consulta_cliente' && !isCurrentViewAdmin);

  const safeAddress = typeof settings?.address === 'string' ? settings.address : '';
  const safeCity = typeof settings?.city === 'string' ? settings.city : 'Mérida';
  const safeState = typeof settings?.state === 'string' ? settings.state : 'Mérida';
  const safeWhatsapp = typeof settings?.whatsapp === 'string' ? settings.whatsapp : '';

  return (
    <div className="min-h-screen bg-slate-50 flex flex-col text-slate-900">
      {/* Top Navigation */}
      <Navbar onOpenCart={() => handleOpenCart('cart')} />

      {/* Main Content Viewport */}
      <div className="flex-1 flex flex-col md:flex-row">
        {isCurrentViewAdmin && (
          <Suspense fallback={null}>
            <AdminSidebar />
          </Suspense>
        )}

        <div className="flex-1 min-w-0 flex flex-col">
          <ErrorBoundary>
            {showStorefrontFallback && (
              <Storefront onOpenCart={(step) => handleOpenCart(step || 'cart')} />
            )}

            {currentView === 'consulta_cliente' && (
              <Suspense fallback={<ViewLoadingFallback />}>
                <CustomerPortal />
              </Suspense>
            )}

            {/* Staff / Admin Views - enforced by role and module permissions */}
            {isCurrentViewAdmin && (
              <main className="max-w-[1440px] w-full mx-auto px-3 sm:px-5 lg:px-7 py-6 sm:py-7 flex-1">
                {!hasCurrentViewAccess ? (
                  <div className="max-w-lg mx-auto my-12 bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-4">
                    <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
                      <Lock className="w-6 h-6" />
                    </div>
                    <div className="space-y-1">
                      <h2 className="text-lg font-bold text-slate-900">Área restringida</h2>
                      <p className="text-xs text-slate-600">
                        Tu usuario no tiene permisos habilitados para acceder a este módulo. Solicita autorización al administrador si lo necesitas para tu trabajo.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setCurrentView(getDefaultStaffView())}
                      className="px-4 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl cursor-pointer transition-colors"
                    >
                      Ir a mi área autorizada
                    </button>
                  </div>
                ) : (
                  <Suspense fallback={<ViewLoadingFallback />}>
                    {currentView === 'admin_dashboard' && <AdminDashboard />}
                    {currentView === 'admin_tareas' && <TasksView />}
                    {currentView === 'admin_pos' && <PosView />}
                    {currentView === 'admin_ventas' && <SalesDatabaseView />}
                    {currentView === 'admin_cuentas_cobrar' && <AccountsReceivableView />}
                    {currentView === 'admin_compras' && <PurchaseOrdersView />}
                    {currentView === 'admin_gastos' && <ExpensesView />}
                    {currentView === 'admin_tesoreria' && <TreasuryFinanceView />}
                    {currentView === 'admin_inventario' && <InventoryView />}
                    {currentView === 'admin_mayorista' && <WholesalePricingView />}
                    {currentView === 'admin_taller' && <ServiceOrdersView />}
                    {currentView === 'admin_comisiones' && <CommissionsView />}
                    {currentView === 'admin_pedidos' && <OrdersView />}
                    {currentView === 'admin_clientes' && <CustomersView />}
                    {currentView === 'admin_usuarios' && isAdmin && <StaffManagementView />}
                    {currentView === 'admin_ajustes' && <SettingsView />}
                  </Suspense>
                )}
              </main>
            )}
          </ErrorBoundary>
        </div>
      </div>

      {/* Global Modals (mounted lazily only when opened) */}
      <CartDrawer
        isOpen={isCartOpen}
        onClose={() => setIsCartOpen(false)}
        initialStep={cartInitialStep}
      />
      {selectedInvoice && (
        <Suspense fallback={null}>
          <InvoiceModal />
        </Suspense>
      )}
      {whatsappModalData && (
        <Suspense fallback={null}>
          <WhatsAppModal />
        </Suspense>
      )}
      {isAuthModalOpen && (
        <Suspense fallback={null}>
          <AuthModal
            isOpen={isAuthModalOpen}
            onClose={closeAuthModal}
            defaultTab={authModalTab}
          />
        </Suspense>
      )}
      {isChangePasswordModalOpen && (
        <Suspense fallback={null}>
          <ChangeAdminPasswordModal />
        </Suspense>
      )}
      {isStaff && (
        <Suspense fallback={null}>
          <TaskReminderNotifier />
        </Suspense>
      )}

      {/* Clean Domain Footer */}
      <footer className="bg-slate-950 text-slate-400 text-xs border-t border-slate-800 mt-auto no-print">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 lg:px-8 py-10">
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
                  <span>{safeAddress.includes(safeCity) ? safeAddress : `${safeAddress}, ${safeCity} - ${safeState}`}</span>
                </p>
                <p className="flex items-center gap-1.5">
                  <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                  <span>
                    Teléfono / WhatsApp:{' '}
                    <a
                      href={`https://api.whatsapp.com/send?phone=58${safeWhatsapp.replace(/\D/g, '').replace(/^0/, '')}`}
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
                  <button onClick={enterAdminMode} className="hover:text-slate-300 cursor-pointer">
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
    <ErrorBoundary>
      <AppProvider>
        <AppContent />
      </AppProvider>
    </ErrorBoundary>
  );
}
