import React from 'react';
import { useStore } from '../context/StoreContext';
import { buildWhatsAppLink } from '../utils/formatters';
import { MapPin, Phone, Clock, ShieldCheck } from 'lucide-react';

export const Footer: React.FC = () => {
  const { settings } = useStore();

  const whatsappUrl = buildWhatsAppLink(
    settings.whatsapp,
    `Hola ${settings.commercialName}, tengo una consulta sobre sus repuestos y servicios de taller.`
  );

  return (
    <footer className="bg-slate-950 text-slate-400 text-xs border-t border-slate-800 mt-16 pb-16 md:pb-0">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-10">
        <div className="grid grid-cols-1 md:grid-cols-4 gap-8">
          <div className="space-y-3">
            <span className="text-base font-bold text-white font-display">
              MERCADO MOTO CC
            </span>
            <p className="text-slate-400 text-xs leading-relaxed">
              La tienda oficial de repuestos, lubricantes y accesorios de <strong>{settings.commercialName}</strong> en Mérida, Venezuela.
            </p>
            <p className="text-[11px] text-slate-500 font-mono">RIF: {settings.rif}</p>
          </div>

          <div>
            <span className="text-white font-semibold block mb-3 uppercase text-[11px] tracking-wider">
              Envíos & Entregas
            </span>
            <ul className="space-y-2 text-slate-400 text-xs">
              <li>🏬 Retiro personal en taller (Mérida)</li>
              <li>🛵 Delivery local en el casco de Mérida</li>
              <li>🚚 Envíos nacionales con cobro en destino:</li>
              <li className="text-amber-400 font-semibold pl-3">▪ MRW · Zoom · Tealca</li>
            </ul>
          </div>

          <div>
            <span className="text-white font-semibold block mb-3 uppercase text-[11px] tracking-wider">
              Atención & Ubicación
            </span>
            <div className="space-y-2 text-slate-400">
              <p className="flex items-start gap-1.5">
                <MapPin className="w-3.5 h-3.5 mt-0.5 text-amber-500 shrink-0" />
                <span>{settings.address}, {settings.city} - {settings.state}</span>
              </p>
              <p className="flex items-center gap-1.5">
                <Phone className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                <span>
                  WhatsApp:{' '}
                  <a
                    href={whatsappUrl}
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
              Pagos en Venezuela
            </span>
            <p className="text-xs text-slate-400 leading-relaxed mb-3">
              Precios en Dólares ($) con cobro en Bolívares (Bs.) a tasa oficial del BCV. Recibimos Pago Móvil Banesco, Transferencia, Efectivo Divisas y Binance Pay.
            </p>
            <div className="flex items-center gap-2 text-slate-300">
              <ShieldCheck className="w-4 h-4 text-emerald-400" />
              <span className="text-[11px]">Factura y comprobante enviado a tu WhatsApp</span>
            </div>
          </div>
        </div>

        <div className="mt-8 pt-6 border-t border-slate-900 flex flex-col sm:flex-row items-center justify-between gap-3 text-[11px] text-slate-500">
          <span>
            © {new Date().getFullYear()} Mercado Moto CC · Servimotos Cristo Centro. Todos los derechos reservados.
          </span>
          <span>Mérida, Venezuela 🇻🇪</span>
        </div>
      </div>
    </footer>
  );
};
