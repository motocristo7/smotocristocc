import { createRoot } from 'react-dom/client';
import App from './App.tsx';
import './index.css';

declare global {
  interface Window {
    __APP_MOUNTED__?: boolean;
    __SHOW_BOOT_RECOVERY__?: (title: string, detail?: string) => void;
  }
}

const rootEl = document.getElementById('root');
if (rootEl) {
  try {
    window.__APP_MOUNTED__ = true;
    createRoot(rootEl).render(<App />);
  } catch (err) {
    window.__APP_MOUNTED__ = false;
    const message = err instanceof Error ? err.message : String(err);
    console.error('Fatal mount error:', err);
    if (typeof window.__SHOW_BOOT_RECOVERY__ === 'function') {
      window.__SHOW_BOOT_RECOVERY__('Error al iniciar la aplicación', message);
    }
  }
}
