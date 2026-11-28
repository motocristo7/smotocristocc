import React from 'react';
import { AlertTriangle, RefreshCw, Trash2 } from 'lucide-react';
import { clearHeavyLocalCaches } from '../utils/safeStorage';

interface ErrorBoundaryProps {
  children: React.ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = {
      hasError: false,
      errorMessage: '',
    };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return {
      hasError: true,
      errorMessage: error?.message || 'Error inesperado al mostrar la pantalla.',
    };
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('ErrorBoundary caught error:', error, info);
  }

  handleReload = (): void => {
    try {
      window.location.reload();
    } catch {
      this.setState({ hasError: false, errorMessage: '' });
    }
  };

  handleClearCacheAndReload = (): void => {
    clearHeavyLocalCaches();
    this.handleReload();
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-slate-50 flex items-center justify-center p-4">
          <div className="max-w-md w-full bg-white rounded-2xl border border-slate-200 shadow-lg p-6 text-center space-y-4">
            <div className="w-12 h-12 rounded-xl bg-amber-50 border border-amber-200 text-amber-700 flex items-center justify-center mx-auto">
              <AlertTriangle className="w-6 h-6" />
            </div>

            <div className="space-y-1.5">
              <h1 className="text-lg font-bold text-slate-900 font-display">
                No se pudo cargar la pantalla
              </h1>
              <p className="text-xs text-slate-600 leading-relaxed">
                Ocurrió un inconveniente temporal en el navegador. Tus datos en la nube están seguros. Recarga la página para continuar.
              </p>
            </div>

            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-center gap-2 pt-1">
              <button
                type="button"
                onClick={this.handleReload}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold transition-colors cursor-pointer"
              >
                <RefreshCw className="w-3.5 h-3.5" />
                <span>Recargar página</span>
              </button>
              <button
                type="button"
                onClick={this.handleClearCacheAndReload}
                className="inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-50 hover:bg-amber-100 text-amber-950 border border-amber-300 text-xs font-semibold transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Limpiar caché local</span>
              </button>
            </div>

            {this.state.errorMessage && (
              <details className="text-left pt-2 border-t border-slate-100">
                <summary className="text-[11px] text-slate-400 cursor-pointer select-none">
                  Detalle técnico
                </summary>
                <p className="mt-1.5 text-[11px] font-mono text-slate-500 break-words bg-slate-50 p-2 rounded-lg border border-slate-200">
                  {this.state.errorMessage}
                </p>
              </details>
            )}
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}
