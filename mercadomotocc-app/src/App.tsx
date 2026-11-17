import React from 'react';
import { StoreProvider, useStore } from './context/StoreContext';
import { Navbar } from './components/Navbar';
import { Catalog } from './components/Catalog';
import { CustomerPortal } from './components/CustomerPortal';
import { CartDrawer } from './components/CartDrawer';
import { Footer } from './components/Footer';

const StoreContent: React.FC = () => {
  const { activeTab } = useStore();

  return (
    <div className="min-h-screen flex flex-col bg-slate-50 text-slate-900 font-sans">
      <Navbar />

      <main className="flex-1 max-w-7xl w-full mx-auto px-4 sm:px-6 py-6 sm:py-8">
        {activeTab === 'catalogo' ? <Catalog /> : <CustomerPortal />}
      </main>

      <CartDrawer />
      <Footer />
    </div>
  );
};

export default function App() {
  return (
    <StoreProvider>
      <StoreContent />
    </StoreProvider>
  );
}
