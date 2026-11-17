import React, { useState, useEffect } from 'react';
import { useApp } from '../../context/AppContext';
import {
  X,
  KeyRound,
  Lock,
  Eye,
  EyeOff,
  CheckCircle2,
  AlertCircle,
  ShieldCheck,
} from 'lucide-react';

export const ChangeAdminPasswordModal: React.FC = () => {
  const {
    isAdmin,
    currentUser,
    isChangePasswordModalOpen,
    setIsChangePasswordModalOpen,
    changeAdminPassword,
  } = useApp();

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  useEffect(() => {
    if (isChangePasswordModalOpen) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setShowCurrent(false);
      setShowNew(false);
      setShowConfirm(false);
      setErrorMsg(null);
      setSuccessMsg(null);
    }
  }, [isChangePasswordModalOpen]);

  if (!isAdmin || !isChangePasswordModalOpen) return null;

  const handleClose = () => {
    if (!isSaving) {
      setIsChangePasswordModalOpen(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);
    setSuccessMsg(null);

    if (!currentPassword) {
      setErrorMsg('Ingresa tu clave administrativa actual.');
      return;
    }
    if (!newPassword || newPassword.trim().length < 4) {
      setErrorMsg('La nueva clave debe tener al menos 4 caracteres.');
      return;
    }
    if (newPassword !== confirmPassword) {
      setErrorMsg('La nueva clave y la confirmación no coinciden.');
      return;
    }

    setIsSaving(true);
    try {
      const res = await changeAdminPassword(currentPassword, newPassword, confirmPassword);
      if (res.success) {
        setSuccessMsg('¡Clave administrativa actualizada con éxito! Úsala en tu próximo inicio de sesión.');
        setTimeout(() => {
          setIsChangePasswordModalOpen(false);
        }, 1400);
      } else {
        setErrorMsg(res.error || 'No se pudo actualizar la clave administrativa.');
      }
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-slate-950/75 backdrop-blur-xs animate-in fade-in duration-150">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
        {/* Header */}
        <div className="bg-slate-950 text-white px-5 py-4 flex items-center justify-between border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center border border-amber-500/30">
              <KeyRound className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm font-display">
                Editar Clave Administrativa
              </h3>
              <p className="text-[11px] text-slate-400 font-mono truncate max-w-[240px]">
                {currentUser?.email || 'SERVIMOTOSCRISTOCENTRO@gmail.com'}
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={handleClose}
            className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 transition-colors cursor-pointer"
            title="Cerrar"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4 text-xs">
          <div className="p-3 rounded-xl bg-amber-50 border border-amber-200 text-amber-950 flex items-start gap-2">
            <ShieldCheck className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <p className="text-[11px] leading-relaxed">
              Al guardar una clave personalizada, las claves predeterminadas anteriores dejarán de funcionar y solo podrás entrar con tu nueva contraseña.
            </p>
          </div>

          {errorMsg && (
            <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 flex items-start gap-2 text-xs font-semibold">
              <AlertCircle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-2.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-800 flex items-start gap-2 text-xs font-semibold">
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {/* Current Password */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Clave Actual *
            </label>
            <div className="relative">
              <Lock className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showCurrent ? 'text' : 'password'}
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Ingresa tu clave actual"
                autoComplete="current-password"
                className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 focus:outline-hidden font-mono"
                required
              />
              <button
                type="button"
                onClick={() => setShowCurrent((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                tabIndex={-1}
              >
                {showCurrent ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* New Password */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Nueva Clave Administrativa *
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showNew ? 'text' : 'password'}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Mínimo 4 caracteres"
                autoComplete="new-password"
                className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 focus:outline-hidden font-mono"
                required
              />
              <button
                type="button"
                onClick={() => setShowNew((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                tabIndex={-1}
              >
                {showNew ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Confirm New Password */}
          <div>
            <label className="block font-bold text-slate-700 mb-1">
              Confirmar Nueva Clave *
            </label>
            <div className="relative">
              <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type={showConfirm ? 'text' : 'password'}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Repite la nueva clave"
                autoComplete="new-password"
                className="w-full pl-9 pr-9 py-2.5 rounded-xl border border-slate-300 bg-slate-50 focus:bg-white focus:border-amber-500 focus:outline-hidden font-mono"
                required
              />
              <button
                type="button"
                onClick={() => setShowConfirm((prev) => !prev)}
                className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 p-1 cursor-pointer"
                tabIndex={-1}
              >
                {showConfirm ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>
          </div>

          {/* Actions */}
          <div className="pt-2 flex items-center justify-end gap-2 border-t border-slate-200">
            <button
              type="button"
              onClick={handleClose}
              disabled={isSaving}
              className="px-4 py-2 font-semibold text-slate-700 hover:bg-slate-100 rounded-xl transition-colors cursor-pointer"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={isSaving}
              className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
            >
              <CheckCircle2 className="w-4 h-4 text-amber-400" />
              <span>{isSaving ? 'Guardando...' : 'Guardar Nueva Clave'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};
