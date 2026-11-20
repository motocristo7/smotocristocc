import React, { useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  User,
  Lock,
  Phone,
  Mail,
  CreditCard,
  ShieldCheck,
  LogIn,
  UserPlus,
  AlertCircle,
  CheckCircle2,
  KeyRound,
  ArrowRight,
  Eye,
  EyeOff,
  ArrowLeft,
} from 'lucide-react';

interface AuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  defaultTab?: 'login' | 'register';
  defaultRoleHint?: 'ADMIN' | 'CLIENTE';
}

export const AuthModal: React.FC<AuthModalProps> = ({
  isOpen,
  onClose,
  defaultTab = 'login',
  defaultRoleHint,
}) => {
  const { login, register, resetAdminPassword } = useApp();
  const [activeTab, setActiveTab] = useState<'login' | 'register'>(defaultTab);
  const [showAdminRecovery, setShowAdminRecovery] = useState(false);

  // Login form state
  const [loginIdentifier, setLoginIdentifier] = useState('');
  const [loginPassword, setLoginPassword] = useState('');
  const [showLoginPassword, setShowLoginPassword] = useState(false);

  // Admin Recovery form state
  const [recEmail, setRecEmail] = useState('SERVIMOTOSCRISTOCENTRO@gmail.com');
  const [recDocumentId, setRecDocumentId] = useState('');
  const [recPhone, setRecPhone] = useState('');
  const [recNewPassword, setRecNewPassword] = useState('');
  const [recConfirmPassword, setRecConfirmPassword] = useState('');
  const [showRecPassword, setShowRecPassword] = useState(false);

  // Register form state
  const [regName, setRegName] = useState('');
  const [regDocumentId, setRegDocumentId] = useState('');
  const [regPhone, setRegPhone] = useState('');
  const [regEmail, setRegEmail] = useState('');
  const [regPassword, setRegPassword] = useState('');

  // Status
  const [loading, setLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!loginIdentifier.trim()) {
      setErrorMessage('Por favor ingresa tu correo, cédula o teléfono.');
      return;
    }
    if (!loginPassword) {
      setErrorMessage('Por favor ingresa tu contraseña.');
      return;
    }

    setLoading(true);
    try {
      const result = await login(loginIdentifier.trim(), loginPassword);
      if (result.success && result.user) {
        setSuccessMessage(
          result.user.role === 'ADMIN'
            ? `¡Bienvenido Administrador ${result.user.name}!`
            : `¡Bienvenido de nuevo, ${result.user.name}!`
        );
        setTimeout(() => {
          onClose();
        }, 800);
      } else {
        setErrorMessage(result.error || 'Credenciales inválidas. Revisa tus datos.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al comunicarse con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const handleRegisterSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!regName.trim()) {
      setErrorMessage('El nombre completo es requerido.');
      return;
    }
    if (!regPhone.trim() && !regEmail.trim()) {
      setErrorMessage('Debes indicar un número de teléfono o correo.');
      return;
    }
    if (!regPassword || regPassword.length < 4) {
      setErrorMessage('La contraseña debe tener al menos 4 caracteres.');
      return;
    }

    setLoading(true);
    try {
      const result = await register({
        name: regName.trim(),
        documentId: regDocumentId.trim() || 'V-00000000',
        phone: regPhone.trim(),
        email: regEmail.trim(),
        password: regPassword,
      });

      if (result.success && result.user) {
        setSuccessMessage(`¡Cuenta creada con éxito! Bienvenido, ${result.user.name}.`);
        setTimeout(() => {
          onClose();
        }, 1000);
      } else {
        setErrorMessage(result.error || 'No se pudo crear la cuenta.');
      }
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al conectar con el servidor.');
    } finally {
      setLoading(false);
    }
  };

  const fillAdminCredentials = () => {
    setActiveTab('login');
    setShowAdminRecovery(false);
    setLoginIdentifier('SERVIMOTOSCRISTOCENTRO@gmail.com');
    if (!loginPassword) {
      setLoginPassword('admin');
    }
    setErrorMessage(null);
  };

  const handleAdminRecoverySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    setLoading(true);
    try {
      const res = await resetAdminPassword({
        email: recEmail.trim(),
        documentId: recDocumentId.trim(),
        phone: recPhone.trim(),
        newPassword: recNewPassword,
        confirmPassword: recConfirmPassword,
      });

      if (res.success) {
        setSuccessMessage(
          '¡Clave administrativa restablecida y sincronizada en la nube! Entrando al panel...'
        );
        setTimeout(() => {
          setShowAdminRecovery(false);
          setRecNewPassword('');
          setRecConfirmPassword('');
          onClose();
        }, 900);
      } else {
        setErrorMessage(res.error || 'No se pudo restablecer la clave administrativa.');
      }
    } catch (err: any) {
      setErrorMessage(err?.message || 'Error al restablecer la clave.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-slate-950/70 backdrop-blur-xs flex items-center justify-center p-4">
      <div className="relative bg-white w-full max-w-md rounded-2xl shadow-2xl border border-slate-200 overflow-hidden animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-900 to-amber-950 p-6 text-white relative">
          <button
            onClick={onClose}
            className="absolute top-4 right-4 p-1.5 rounded-full bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white transition-colors cursor-pointer"
            title="Cerrar ventana"
          >
            <X className="w-5 h-5" />
          </button>

          <div className="flex items-center gap-2 mb-2">
            <span className="px-2.5 py-0.5 rounded-full text-[10px] font-black uppercase tracking-wider bg-amber-500 text-slate-950">
              Acceso de Usuarios
            </span>
            <span className="text-xs text-amber-300 font-medium">Servimotos Cristo Centro</span>
          </div>

          <h2 className="text-xl font-bold font-display text-white">
            {activeTab === 'login' ? 'Iniciar Sesión' : 'Registro de Cliente'}
          </h2>
          <p className="text-xs text-slate-300 mt-1">
            {activeTab === 'login'
              ? 'Accede como Cliente para ver tus compras o como Administrador del taller.'
              : 'Crea tu perfil en segundos para consultar pedidos, facturas y solicitar repuestos.'}
          </p>
        </div>

        {/* Tab switcher */}
        <div className="flex border-b border-slate-200 bg-slate-50">
          <button
            type="button"
            onClick={() => {
              setActiveTab('login');
              setErrorMessage(null);
            }}
            className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'login'
                ? 'bg-white text-amber-600 border-b-2 border-amber-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <LogIn className="w-4 h-4" />
            <span>Iniciar Sesión</span>
          </button>
          <button
            type="button"
            onClick={() => {
              setActiveTab('register');
              setErrorMessage(null);
            }}
            className={`flex-1 py-3 text-xs font-bold transition-all flex items-center justify-center gap-1.5 cursor-pointer ${
              activeTab === 'register'
                ? 'bg-white text-amber-600 border-b-2 border-amber-600 shadow-2xs'
                : 'text-slate-500 hover:text-slate-800'
            }`}
          >
            <UserPlus className="w-4 h-4" />
            <span>Crear Cuenta Cliente</span>
          </button>
        </div>

        {/* Notifications */}
        <div className="p-6 pt-4 space-y-4">
          {errorMessage && (
            <div className="p-3 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-start gap-2 animate-in fade-in">
              <AlertCircle className="w-4 h-4 text-rose-500 shrink-0 mt-0.5" />
              <span>{errorMessage}</span>
            </div>
          )}

          {successMessage && (
            <div className="p-3 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 text-xs flex items-center gap-2 animate-in fade-in">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
              <span>{successMessage}</span>
            </div>
          )}

          {/* Form: LOGIN */}
          {activeTab === 'login' && !showAdminRecovery && (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Correo, Cédula o Teléfono
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={loginIdentifier}
                    onChange={(e) => setLoginIdentifier(e.target.value)}
                    placeholder="ej. SERVIMOTOSCRISTOCENTRO@gmail.com o 0412-1234567"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                    required
                  />
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="text-xs font-bold text-slate-700">Contraseña</label>
                </div>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type={showLoginPassword ? 'text' : 'password'}
                    value={loginPassword}
                    onChange={(e) => setLoginPassword(e.target.value)}
                    placeholder="••••••••"
                    className="w-full pl-9 pr-9 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                    required
                  />
                  <button
                    type="button"
                    onClick={() => setShowLoginPassword((prev) => !prev)}
                    className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                    title={showLoginPassword ? 'Ocultar contraseña' : 'Ver contraseña'}
                  >
                    {showLoginPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-md hover:shadow-lg flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                {loading ? (
                  <span>Verificando...</span>
                ) : (
                  <>
                    <LogIn className="w-4 h-4 text-amber-400" />
                    <span>Entrar a mi Cuenta</span>
                  </>
                )}
              </button>

              {/* Quick Admin Auto-fill & Recovery Helpers */}
              <div className="mt-4 pt-3 border-t border-slate-100 flex flex-col gap-2">
                <button
                  type="button"
                  onClick={fillAdminCredentials}
                  className="w-full py-1.5 px-3 rounded-lg bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <ShieldCheck className="w-3.5 h-3.5 text-amber-600" />
                  <span>Acceso Rápido Administrador Taller</span>
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminRecovery(true);
                    setErrorMessage(null);
                    setSuccessMessage(null);
                  }}
                  className="w-full py-1.5 px-3 rounded-lg bg-slate-50 hover:bg-slate-100 border border-slate-200 text-slate-700 text-[11px] font-semibold flex items-center justify-center gap-1.5 transition-colors cursor-pointer"
                >
                  <KeyRound className="w-3.5 h-3.5 text-slate-500" />
                  <span>¿No te acepta la clave? Restablecer clave de Administrador</span>
                </button>
                <p className="text-[10px] text-center text-slate-400">
                  Los clientes pueden registrarse gratis para ver sus motos y pedidos.
                </p>
              </div>
            </form>
          )}

          {/* Form: ADMIN PASSWORD RECOVERY */}
          {activeTab === 'login' && showAdminRecovery && (
            <form onSubmit={handleAdminRecoverySubmit} className="space-y-3">
              <div className="flex items-center justify-between">
                <span className="text-xs font-bold text-slate-900 flex items-center gap-1.5">
                  <KeyRound className="w-4 h-4 text-amber-600" />
                  <span>Restablecer Clave de Administrador</span>
                </span>
                <button
                  type="button"
                  onClick={() => {
                    setShowAdminRecovery(false);
                    setErrorMessage(null);
                  }}
                  className="text-[11px] font-semibold text-slate-500 hover:text-slate-800 inline-flex items-center gap-1 cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5" />
                  Volver
                </button>
              </div>

              <p className="text-[11px] text-slate-600 bg-amber-50 border border-amber-200 rounded-xl p-2.5">
                Confirma los 3 datos del propietario registrados en el sistema para asignar una nueva contraseña administrativa sincronizada en todos tus dominios.
              </p>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Correo del Propietario *
                </label>
                <input
                  type="email"
                  required
                  value={recEmail}
                  onChange={(e) => setRecEmail(e.target.value)}
                  placeholder="SERVIMOTOSCRISTOCENTRO@gmail.com"
                  className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cédula o RIF *
                  </label>
                  <input
                    type="text"
                    required
                    value={recDocumentId}
                    onChange={(e) => setRecDocumentId(e.target.value)}
                    placeholder="Ej. V-19996141"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white font-mono"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfono Propietario *
                  </label>
                  <input
                    type="tel"
                    required
                    value={recPhone}
                    onChange={(e) => setRecPhone(e.target.value)}
                    placeholder="Ej. 0412-7860509"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Nueva Clave *
                  </label>
                  <div className="relative">
                    <input
                      type={showRecPassword ? 'text' : 'password'}
                      required
                      minLength={4}
                      value={recNewPassword}
                      onChange={(e) => setRecNewPassword(e.target.value)}
                      placeholder="Mín. 4 caracteres"
                      className="w-full pl-3 pr-8 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                    <button
                      type="button"
                      onClick={() => setShowRecPassword((p) => !p)}
                      className="absolute inset-y-0 right-0 pr-2.5 flex items-center text-slate-400 hover:text-slate-700 cursor-pointer"
                    >
                      {showRecPassword ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
                    </button>
                  </div>
                </div>
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Confirmar Clave *
                  </label>
                  <input
                    type={showRecPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    value={recConfirmPassword}
                    onChange={(e) => setRecConfirmPassword(e.target.value)}
                    placeholder="Repite la clave"
                    className="w-full px-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-2.5 px-4 bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <ShieldCheck className="w-4 h-4 text-amber-400" />
                <span>{loading ? 'Guardando nueva clave...' : 'Guardar Nueva Clave y Entrar'}</span>
              </button>
            </form>
          )}

          {/* Form: REGISTER (CLIENTE) */}
          {activeTab === 'register' && (
            <form onSubmit={handleRegisterSubmit} className="space-y-3">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Nombre Completo *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <User className="w-4 h-4" />
                  </div>
                  <input
                    type="text"
                    value={regName}
                    onChange={(e) => setRegName(e.target.value)}
                    placeholder="ej. Juan Carlos Pérez"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                    required
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Cédula / RIF
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <CreditCard className="w-4 h-4" />
                    </div>
                    <input
                      type="text"
                      value={regDocumentId}
                      onChange={(e) => setRegDocumentId(e.target.value)}
                      placeholder="V-19996141"
                      className="w-full pl-9 pr-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Teléfono / WhatsApp *
                  </label>
                  <div className="relative">
                    <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                      <Phone className="w-4 h-4" />
                    </div>
                    <input
                      type="tel"
                      value={regPhone}
                      onChange={(e) => setRegPhone(e.target.value)}
                      placeholder="0412-1234567"
                      className="w-full pl-9 pr-2 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                      required
                    />
                  </div>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Correo Electrónico (opcional)
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Mail className="w-4 h-4" />
                  </div>
                  <input
                    type="email"
                    value={regEmail}
                    onChange={(e) => setRegEmail(e.target.value)}
                    placeholder="cliente@ejemplo.com"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Contraseña / Clave de Acceso *
                </label>
                <div className="relative">
                  <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none text-slate-400">
                    <Lock className="w-4 h-4" />
                  </div>
                  <input
                    type="password"
                    value={regPassword}
                    onChange={(e) => setRegPassword(e.target.value)}
                    placeholder="Crea una contraseña segura"
                    className="w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 focus:outline-hidden focus:ring-2 focus:ring-amber-500 bg-white"
                    required
                  />
                </div>
              </div>

              <div className="pt-2">
                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 px-4 bg-gradient-to-r from-amber-500 to-amber-600 hover:from-amber-600 hover:to-amber-700 text-slate-950 font-bold text-xs rounded-xl transition-all shadow-md flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                >
                  {loading ? (
                    <span>Registrando...</span>
                  ) : (
                    <>
                      <UserPlus className="w-4 h-4" />
                      <span>Registrarme como Cliente</span>
                      <ArrowRight className="w-3.5 h-3.5 ml-1" />
                    </>
                  )}
                </button>
              </div>

              <p className="text-[10px] text-center text-slate-400 pt-1">
                Al registrarte podrás consultar el estado de tu moto y tus compras en cualquier momento.
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
};
