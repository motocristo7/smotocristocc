import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Bell,
  CheckCheck,
  Clock,
  LogIn,
  LogOut,
  ArrowRight,
  X,
  AlertTriangle,
  Info,
  CheckCircle2,
} from 'lucide-react';
import { formatTime12h, formatDurationMinutes } from '../../utils/staffAnalytics';
import { playTaskReminderChime } from '../../utils/taskNotifications';
import { StaffNotification } from '../../types';

export const StaffNotificationsBell: React.FC = () => {
  const {
    currentUser,
    isAdmin,
    isEmployee,
    isStaff,
    staffNotifications,
    unreadStaffNotificationCount,
    markStaffNotificationRead,
    markAllStaffNotificationsRead,
    todayUserAttendance,
    recordStaffCheckIn,
    recordStaffCheckOut,
    setCurrentView,
    canAccessView,
  } = useApp();

  const [isOpen, setIsOpen] = useState(false);
  const [liveToast, setLiveToast] = useState<StaffNotification | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const initializedRef = useRef(false);

  const personalNotifications = useMemo(() => {
    if (!currentUser) return [];
    return staffNotifications
      .filter((n) => n.recipientUserId === currentUser.id)
      .slice(0, 30);
  }, [staffNotifications, currentUser]);

  // Detect brand-new unread notifications arriving in real time for current user
  useEffect(() => {
    if (!currentUser) return;
    if (!initializedRef.current) {
      personalNotifications.forEach((n) => seenNotifIdsRef.current.add(n.id));
      initializedRef.current = true;
      return;
    }

    const newlyArrived = personalNotifications.find(
      (n) => !n.readAt && !seenNotifIdsRef.current.has(n.id)
    );
    personalNotifications.forEach((n) => seenNotifIdsRef.current.add(n.id));

    if (newlyArrived) {
      setLiveToast(newlyArrived);
      try {
        playTaskReminderChime(newlyArrived.priority === 'URGENTE');
      } catch {}
      const timer = setTimeout(() => {
        setLiveToast((curr) => (curr?.id === newlyArrived.id ? null : curr));
      }, 9000);
      return () => clearTimeout(timer);
    }
  }, [personalNotifications, currentUser]);

  // Close popover on outside click
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!isStaff || !currentUser) return null;

  const handleOpenNotification = (notif: StaffNotification) => {
    markStaffNotificationRead(notif.id);
    if (notif.relatedView && canAccessView(notif.relatedView)) {
      setCurrentView(notif.relatedView);
      setIsOpen(false);
    }
  };

  const formatShortDateTime = (iso?: string) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleString('es-VE', {
        day: '2-digit',
        month: 'short',
        hour: '2-digit',
        minute: '2-digit',
      });
    } catch {
      return '';
    }
  };

  return (
    <>
      <div className="relative" ref={containerRef}>
        <button
          type="button"
          onClick={() => setIsOpen((prev) => !prev)}
          className="relative flex items-center justify-center p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 border border-slate-800 transition-colors cursor-pointer"
          title="Notificaciones y asistencia"
          aria-label="Centro de notificaciones"
        >
          <Bell className="w-4 h-4" />
          {unreadStaffNotificationCount > 0 && (
            <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 rounded-full bg-rose-600 text-white text-[10px] font-bold flex items-center justify-center tabular-nums">
              {unreadStaffNotificationCount > 9 ? '9+' : unreadStaffNotificationCount}
            </span>
          )}
        </button>

        {isOpen && (
          <div className="absolute right-0 mt-2 w-[340px] sm:w-[380px] bg-white rounded-xl border border-slate-200 shadow-2xl z-50 overflow-hidden text-slate-800">
            {/* Header */}
            <div className="px-4 py-3 bg-slate-900 text-white flex items-center justify-between">
              <div>
                <p className="text-xs font-bold tracking-tight">Notificaciones</p>
                <p className="text-[11px] text-slate-400">
                  {unreadStaffNotificationCount > 0
                    ? `${unreadStaffNotificationCount} sin leer`
                    : 'Todo al día'}
                </p>
              </div>
              <div className="flex items-center gap-2">
                {unreadStaffNotificationCount > 0 && (
                  <button
                    type="button"
                    onClick={() => markAllStaffNotificationsRead(currentUser.id)}
                    className="text-[11px] font-semibold text-amber-400 hover:text-amber-300 flex items-center gap-1 cursor-pointer whitespace-nowrap"
                  >
                    <CheckCheck className="w-3.5 h-3.5" />
                    <span>Marcar leídas</span>
                  </button>
                )}
                {isAdmin && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsOpen(false);
                      setCurrentView('admin_usuarios');
                    }}
                    className="text-[11px] font-semibold text-slate-300 hover:text-white cursor-pointer whitespace-nowrap"
                  >
                    Enviar aviso
                  </button>
                )}
              </div>
            </div>

            {/* Quick Attendance Box for Employees */}
            {isEmployee && (
              <div className="px-4 py-3 bg-slate-50 border-b border-slate-200">
                <div className="flex items-center justify-between gap-2">
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 text-[11px] font-semibold text-slate-600">
                      <Clock className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                      <span>Jornada de hoy</span>
                      <span className="text-slate-400">·</span>
                      <span className="font-mono tabular-nums text-slate-500">
                        Entrada {formatTime12h(currentUser.scheduledStartTime || '08:00')}
                      </span>
                    </div>
                    {todayUserAttendance ? (
                      <p className="text-xs font-bold text-slate-900 mt-0.5 tabular-nums">
                        Llegada {formatTime12h(todayUserAttendance.checkInTime)}
                        {' · '}
                        <span
                          className={
                            todayUserAttendance.punctualityStatus === 'PUNTUAL'
                              ? 'text-emerald-700'
                              : 'text-amber-700'
                          }
                        >
                          {todayUserAttendance.punctualityStatus === 'PUNTUAL'
                            ? 'Puntual'
                            : `Tarde (+${todayUserAttendance.minutesLate} min)`}
                        </span>
                        {todayUserAttendance.checkOutTime && (
                          <span className="text-slate-500 font-normal">
                            {' · '}Salida {formatTime12h(todayUserAttendance.checkOutTime)} (
                            {formatDurationMinutes(todayUserAttendance.workedMinutes)})
                          </span>
                        )}
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 mt-0.5">Llegada aún no marcada</p>
                    )}
                  </div>

                  {!todayUserAttendance ? (
                    <button
                      type="button"
                      onClick={() => recordStaffCheckIn(currentUser, 'MANUAL_STAFF')}
                      className="px-2.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5" />
                      <span>Marcar llegada</span>
                    </button>
                  ) : !todayUserAttendance.checkOutTime ? (
                    <button
                      type="button"
                      onClick={() => recordStaffCheckOut(todayUserAttendance.id)}
                      className="px-2.5 py-1.5 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg flex items-center gap-1 shrink-0 whitespace-nowrap cursor-pointer"
                    >
                      <LogOut className="w-3.5 h-3.5" />
                      <span>Marcar salida</span>
                    </button>
                  ) : (
                    <span className="text-[11px] font-semibold text-emerald-700 flex items-center gap-1 shrink-0">
                      <CheckCircle2 className="w-3.5 h-3.5" />
                      Cerrada
                    </span>
                  )}
                </div>
              </div>
            )}

            {/* Notification List */}
            <div className="max-h-80 overflow-y-auto divide-y divide-slate-100">
              {personalNotifications.length === 0 ? (
                <div className="px-4 py-8 text-center">
                  <Bell className="w-6 h-6 text-slate-300 mx-auto mb-2" />
                  <p className="text-xs font-semibold text-slate-600">Sin notificaciones recientes</p>
                  <p className="text-[11px] text-slate-400 mt-0.5">
                    Aquí verás tareas asignadas y avisos del administrador.
                  </p>
                </div>
              ) : (
                personalNotifications.map((notif) => {
                  const isUnread = !notif.readAt;
                  return (
                    <button
                      key={notif.id}
                      type="button"
                      onClick={() => handleOpenNotification(notif)}
                      className={`w-full text-left px-4 py-3 hover:bg-slate-50 transition-colors cursor-pointer block ${
                        isUnread ? 'bg-amber-50/50' : 'bg-white'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0 flex-1">
                          <div className="flex items-center gap-1.5 text-[11px] mb-0.5">
                            {notif.priority === 'URGENTE' ? (
                              <span className="font-bold text-rose-700 uppercase">Urgente</span>
                            ) : notif.priority === 'IMPORTANTE' ? (
                              <span className="font-bold text-amber-700 uppercase">Importante</span>
                            ) : (
                              <span className="font-semibold text-slate-500">Aviso</span>
                            )}
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-500 truncate">{notif.senderName}</span>
                            <span className="text-slate-300">·</span>
                            <span className="text-slate-400 tabular-nums shrink-0">
                              {formatShortDateTime(notif.createdAt)}
                            </span>
                          </div>
                          <p className={`text-xs leading-snug ${isUnread ? 'font-bold text-slate-900' : 'font-semibold text-slate-700'}`}>
                            {notif.title}
                          </p>
                          <p className="text-xs text-slate-600 mt-0.5 line-clamp-2">
                            {notif.message}
                          </p>
                          {notif.relatedView && canAccessView(notif.relatedView) && (
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-900 mt-1.5">
                              <span>Abrir sección</span>
                              <ArrowRight className="w-3 h-3" />
                            </span>
                          )}
                        </div>
                        {isUnread && (
                          <span className="w-2 h-2 rounded-full bg-amber-500 mt-1.5 shrink-0" title="Sin leer" />
                        )}
                      </div>
                    </button>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* Live Incoming Toast for New Employee Notification */}
      {liveToast && (
        <div
          className="fixed top-16 right-4 z-50 w-[calc(100vw-2rem)] max-w-sm bg-white border-2 border-slate-900 rounded-xl shadow-2xl overflow-hidden no-print"
          role="status"
        >
          <div
            className={`px-3.5 py-2 flex items-center justify-between text-xs font-bold ${
              liveToast.priority === 'URGENTE'
                ? 'bg-rose-600 text-white'
                : liveToast.priority === 'IMPORTANTE'
                ? 'bg-amber-400 text-slate-950'
                : 'bg-slate-900 text-white'
            }`}
          >
            <div className="flex items-center gap-1.5">
              {liveToast.priority === 'URGENTE' ? (
                <AlertTriangle className="w-3.5 h-3.5" />
              ) : (
                <Info className="w-3.5 h-3.5" />
              )}
              <span>
                {liveToast.priority === 'URGENTE'
                  ? 'Notificación Urgente'
                  : liveToast.priority === 'IMPORTANTE'
                  ? 'Aviso Importante'
                  : 'Nueva Notificación'}
              </span>
            </div>
            <button
              type="button"
              onClick={() => setLiveToast(null)}
              className="opacity-80 hover:opacity-100 cursor-pointer"
              aria-label="Cerrar notificación"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          </div>
          <div className="p-3.5">
            <p className="text-xs font-bold text-slate-900">{liveToast.title}</p>
            <p className="text-xs text-slate-600 mt-1">{liveToast.message}</p>
            <div className="flex items-center justify-between mt-3 pt-2 border-t border-slate-100">
              <span className="text-[11px] text-slate-400">De: {liveToast.senderName}</span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    markStaffNotificationRead(liveToast.id);
                    setLiveToast(null);
                  }}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900 cursor-pointer"
                >
                  Entendido
                </button>
                {liveToast.relatedView && canAccessView(liveToast.relatedView) && (
                  <button
                    type="button"
                    onClick={() => {
                      handleOpenNotification(liveToast);
                      setLiveToast(null);
                    }}
                    className="px-2.5 py-1 bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold rounded-lg cursor-pointer"
                  >
                    Ir ahora
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
};
