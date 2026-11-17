import React, { createContext, useContext, useState, useEffect, useMemo } from 'react';
import { Product, BusinessSettings, CartItem, ServiceOrder, Sale } from '../types';
import { fetchSharedDatabase, fetchLiveBcvRate, sendOnlineOrderToBackend } from '../services/api';

interface StoreContextType {
  products: Product[];
  isLoading: boolean;
  bcvRate: number;
  bcvDate: string;
  settings: BusinessSettings;
  cart: CartItem[];
  cartCount: number;
  cartTotalUSD: number;
  cartTotalBs: number;
  addToCart: (product: Product, quantity?: number) => void;
  removeFromCart: (productId: string) => void;
  updateCartQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
  activeTab: 'catalogo' | 'portal';
  setActiveTab: (tab: 'catalogo' | 'portal') => void;
  isCartOpen: boolean;
  setIsCartOpen: (open: boolean) => void;
  serviceOrders: ServiceOrder[];
  sales: Sale[];
  submitOrder: (order: any) => Promise<boolean>;
  refreshData: () => Promise<void>;
}

const StoreContext = createContext<StoreContextType | undefined>(undefined);

const DEFAULT_SETTINGS: BusinessSettings = {
  name: 'SERVIMOTOS CRISTO CENTRO C.A.',
  commercialName: 'Servimotos Cristo Centro',
  onlineStoreName: 'Mercado Moto CC',
  rif: 'J-50123456-7',
  phone: '0412-2242450',
  whatsapp: '04122242450',
  address: 'Av. Las Américas, sector Cristo Rey, local 12-A',
  city: 'Mérida',
  state: 'Mérida',
  bcvRate: 901.62,
  bcvLastUpdated: new Date().toLocaleDateString('es-VE'),
  bcvAutoSync: true,
  bankDetails: {
    pagoMovilBank: '0134 - Banesco',
    pagoMovilPhone: '0412-2242450',
    pagoMovilId: 'V-19996141',
    pagoMovilQrUrl: '/assets/pagomovil_qr.jpeg',
    bankTransferBank: 'Banesco Banco Universal',
    bankTransferAccount: '0134-0030-08-0301034334',
    bankTransferRif: 'J-50123456-7',
    binancePayId: '98451234',
  },
};

export const StoreProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [products, setProducts] = useState<Product[]>([]);
  const [settings, setSettings] = useState<BusinessSettings>(DEFAULT_SETTINGS);
  const [serviceOrders, setServiceOrders] = useState<ServiceOrder[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [bcvRate, setBcvRate] = useState<number>(DEFAULT_SETTINGS.bcvRate);
  const [bcvDate, setBcvDate] = useState<string>(DEFAULT_SETTINGS.bcvLastUpdated);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [cart, setCart] = useState<CartItem[]>(() => {
    try {
      const saved = localStorage.getItem('mercadomotocc_cart');
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [activeTab, setActiveTab] = useState<'catalogo' | 'portal'>('catalogo');
  const [isCartOpen, setIsCartOpen] = useState<boolean>(false);

  // Guardar carrito en localStorage
  useEffect(() => {
    try {
      localStorage.setItem('mercadomotocc_cart', JSON.stringify(cart));
    } catch {}
  }, [cart]);

  // Cargar datos desde la base de datos compartida
  const loadSharedData = async () => {
    try {
      const db = await fetchSharedDatabase();
      if (db) {
        if (Array.isArray(db.products)) {
          setProducts(db.products);
        }
        if (db.settings) {
          setSettings(db.settings);
          if (db.settings.bcvRate) {
            setBcvRate(db.settings.bcvRate);
            setBcvDate(db.settings.bcvLastUpdated || new Date().toLocaleDateString('es-VE'));
          }
        }
        if (Array.isArray(db.serviceOrders)) {
          setServiceOrders(db.serviceOrders);
        }
        if (Array.isArray(db.sales)) {
          setSales(db.sales);
        }
      }

      // Obtener tasa BCV oficial actualizada
      const bcv = await fetchLiveBcvRate();
      if (bcv && bcv.rate > 0) {
        setBcvRate(bcv.rate);
        setBcvDate(bcv.date);
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadSharedData();
    // Sondeo periódico cada 20 segundos para reflejar cambios de stock y precio en vivo
    const interval = setInterval(loadSharedData, 20000);
    return () => clearInterval(interval);
  }, []);

  // Métodos del carrito
  const addToCart = (product: Product, quantity: number = 1) => {
    setCart((prev) => {
      const existing = prev.find((item) => item.product.id === product.id);
      if (existing) {
        const nextQty = Math.min(product.stock, existing.quantity + quantity);
        return prev.map((item) =>
          item.product.id === product.id ? { ...item, quantity: nextQty } : item
        );
      }
      return [...prev, { product, quantity: Math.min(product.stock, quantity) }];
    });
    setIsCartOpen(true);
  };

  const removeFromCart = (productId: string) => {
    setCart((prev) => prev.filter((item) => item.product.id !== productId));
  };

  const updateCartQuantity = (productId: string, quantity: number) => {
    if (quantity <= 0) {
      removeFromCart(productId);
      return;
    }
    setCart((prev) =>
      prev.map((item) => {
        if (item.product.id === productId) {
          const max = item.product.stock || 999;
          return { ...item, quantity: Math.min(max, quantity) };
        }
        return item;
      })
    );
  };

  const clearCart = () => setCart([]);

  const cartCount = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.quantity, 0);
  }, [cart]);

  const cartTotalUSD = useMemo(() => {
    return cart.reduce((sum, item) => sum + item.product.salePrice * item.quantity, 0);
  }, [cart]);

  const cartTotalBs = useMemo(() => {
    return cartTotalUSD * bcvRate;
  }, [cartTotalUSD, bcvRate]);

  const submitOrder = async (order: any): Promise<boolean> => {
    const success = await sendOnlineOrderToBackend(order);
    if (success) {
      clearCart();
    }
    return success;
  };

  return (
    <StoreContext.Provider
      value={{
        products,
        isLoading,
        bcvRate,
        bcvDate,
        settings,
        cart,
        cartCount,
        cartTotalUSD,
        cartTotalBs,
        addToCart,
        removeFromCart,
        updateCartQuantity,
        clearCart,
        activeTab,
        setActiveTab,
        isCartOpen,
        setIsCartOpen,
        serviceOrders,
        sales,
        submitOrder,
        refreshData: loadSharedData,
      }}
    >
      {children}
    </StoreContext.Provider>
  );
};

export const useStore = () => {
  const context = useContext(StoreContext);
  if (!context) {
    throw new Error('useStore debe ser usado dentro de StoreProvider');
  }
  return context;
};
