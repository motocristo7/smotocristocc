import {
  Sale,
  ServiceOrder,
  OnlineOrder,
  BusinessSettings,
  MercadoLibreEntry,
  TechnicianPayout,
  Technician,
  CreditPaymentRecord,
  PurchaseOrder,
  PurchasePaymentRecord,
  OpenAccount,
  isSaleWithCredit,
  getServiceOrderPaymentSummary,
} from '../types';

export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatBs(amountBs: number): string {
  return `Bs. ${new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amountBs)}`;
}

export function formatDualPrice(amountUSD: number, bcvRate: number): string {
  const usdText = formatUSD(amountUSD);
  const bsAmount = amountUSD * bcvRate;
  const bsText = formatBs(bsAmount);
  return `${usdText} · ${bsText}`;
}

export function sanitizePhone(phone: string): string {
  const cleaned = phone.replace(/\D/g, '');

  // Venezuelan numbers: 0414..., 0424..., 0412..., 0416..., 0426... (11 digits)
  if (cleaned.length === 11 && cleaned.startsWith('0')) {
    return `58${cleaned.slice(1)}`;
  }
  // Venezuelan without leading 0: 4141234567 (10 digits)
  if (cleaned.length === 10 && (cleaned.startsWith('414') || cleaned.startsWith('424') || cleaned.startsWith('412') || cleaned.startsWith('416') || cleaned.startsWith('426'))) {
    return `58${cleaned}`;
  }
  // Already with Venezuelan country code 58
  if (cleaned.startsWith('58') && cleaned.length >= 12) {
    return cleaned;
  }
  // Colombian fallback if still used
  if (cleaned.length === 10 && cleaned.startsWith('3')) {
    return `57${cleaned}`;
  }
  return cleaned;
}

export function hasValidWhatsAppPhone(phone?: string): boolean {
  if (!phone) return false;
  const trimmed = phone.trim().toUpperCase();
  if (!trimmed || trimmed === 'N/A' || trimmed === 'NA' || trimmed === 'SIN TELEFONO' || trimmed === 'SIN TELÉFONO') {
    return false;
  }
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length < 7) return false;
  if (/^0+$/.test(digits)) return false;
  return true;
}

export function buildWhatsAppSendUrl(rawPhone: string | undefined, message: string): string {
  const encodedText = encodeURIComponent(message);
  if (hasValidWhatsAppPhone(rawPhone)) {
    const phone = sanitizePhone(rawPhone!);
    if (phone && phone.length >= 7 && !/^0+$/.test(phone)) {
      return `https://api.whatsapp.com/send?phone=${phone}&text=${encodedText}`;
    }
  }
  return `https://api.whatsapp.com/send?text=${encodedText}`;
}

export const PUBLIC_APP_ORIGIN = 'https://motocristoc.com';

export function getPublicAppOrigin(): string {
  if (typeof window !== 'undefined' && window.location?.origin) {
    const origin = window.location.origin;
    if (
      origin.includes('ais-dev-') ||
      origin.includes('ais-pre-') ||
      origin.includes('localhost')
    ) {
      return PUBLIC_APP_ORIGIN;
    }
    return origin;
  }
  return PUBLIC_APP_ORIGIN;
}

/**
 * Builds the WhatsApp message and direct URL for a purchase invoice receipt (in USD & Bs a Tasa BCV)
 * Ultra-compact: only what was bought, condition (contado/crédito/mercadolibre), and payment details.
 */
export function buildInvoiceWhatsAppMessage(sale: Sale, settings: BusinessSettings): { message: string; url: string } {
  const rate = sale.bcvRate || settings.bcvRate;
  const itemsText = sale.items
    .map(item => `▪ ${item.quantity}x ${item.name} (${formatUSD(item.total)})`)
    .join('\n');

  const appOrigin = getPublicAppOrigin().replace(/\/+$/, '');
  const qrImageLink = `${appOrigin}${settings.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg'}`;
  const storePromoFooter = `
───────────────────────
🔥🛵 *¡ENTRA EN NUESTRA TIENDA ONLINE PARA MÁS REPUESTOS, ACCESORIOS Y OFERTAS!* 🛒💨
✨ *Explora todo nuestro catálogo en vivo aquí:*
👉 *${appOrigin}/* 👈`;

  const isCredit = sale.paymentType === 'CREDITO';
  const isApartado = sale.paymentType === 'APARTADO';
  const isMercadoLibre = sale.paymentType === 'MERCADOLIBRE';
  const isMixto = sale.paymentType === 'MIXTO' && Array.isArray(sale.paymentSplits) && sale.paymentSplits.length > 0;
  const isMixtoWithCredit = isMixto && isSaleWithCredit(sale);
  const pendingBalanceUSD = Math.max(0, sale.total - (sale.creditPaidAmount || 0));
  const pendingBalanceBs = pendingBalanceUSD * rate;
  const businessName = (settings.commercialName || settings.name || 'MotoCristoc').toUpperCase();
  const shippingLine =
    (sale.shippingCostUSD || 0) > 0
      ? `🚚 *Gastos de Envío (${sale.shippingAgency || 'Encomienda'}${
          sale.shippingState ? ` · ${sale.shippingState}` : ''
        }):* *+${formatUSD(sale.shippingCostUSD || 0)}* (${formatBs(
          sale.shippingCostBs || (sale.shippingCostUSD || 0) * rate
        )})${sale.shippingNotes ? ` — ${sale.shippingNotes}` : ''}\n`
      : '';

  let message = '';

  if (isApartado) {
    // Sistema de Apartado: Comprobante con abono inicial, saldo para retirar y datos para futuros abonos
    const paidUSD = sale.creditPaidAmount || 0;
    const paidBs = sale.creditPaidAmountBs || paidUSD * rate;
    const initialIsBs =
      sale.creditInitialPaymentCurrency === 'BS' ||
      (!sale.creditInitialPaymentCurrency &&
        (sale.paymentMethod === 'Pago Móvil' ||
          sale.paymentMethod === 'Efectivo Bs' ||
          sale.paymentMethod === 'Punto de Venta (Bs)' ||
          sale.paymentMethod === 'Transferencia Bancaria Bs'));
    const abonoLine =
      paidUSD > 0
        ? initialIsBs
          ? `💵 Abono Inicial / Reserva: *${formatBs(paidBs)}* (Equiv. *${formatUSD(paidUSD)}* BCV)\n`
          : `💵 Abono Inicial / Reserva: *${formatUSD(paidUSD)}* (Equiv. *${formatBs(paidBs)}* BCV)\n`
        : '';

    message = `🔒 *COMPROBANTE DE APARTADO #${sale.invoiceNumber}* - *${businessName}*

🛒 *Mercancía Apartada:*
${itemsText}

${shippingLine}💰 *Total del Apartado:* *${formatUSD(sale.total)}* | *${formatBs(sale.totalBs || sale.total * rate)}*
📌 Condición: *SISTEMA DE APARTADO* (${sale.creditDays || 15} días para retirar)
⏳ Fecha Límite de Retiro: *${sale.creditDueDate || 'A convenir'}*
${abonoLine}⚠️ *Saldo Restante para Retirar:* *${formatUSD(pendingBalanceUSD)}* | *${formatBs(pendingBalanceBs)}* (Tasa BCV: ${rate.toFixed(2)})

📲 *Datos para abonos / liquidación:*
🏦 Banco: ${settings.bankDetails.pagoMovilBank || '0134 - Banesco'}
📱 Pago Móvil: ${settings.bankDetails.pagoMovilPhone || '0412-2242450'}
🆔 CI/RIF: ${settings.bankDetails.pagoMovilId || 'V-19996141'}
🖼️ QR: ${qrImageLink}

📎 Le adjuntamos su Comprobante de Apartado en PDF.${storePromoFooter}`;
  } else if (isCredit) {
    // Venta a Crédito: Nota de Crédito con saldo pendiente y datos para el pago
    const paidUSD = sale.creditPaidAmount || 0;
    const paidBs = sale.creditPaidAmountBs || paidUSD * rate;
    const initialIsBs =
      sale.creditInitialPaymentCurrency === 'BS' ||
      (!sale.creditInitialPaymentCurrency &&
        (sale.paymentMethod === 'Pago Móvil' ||
          sale.paymentMethod === 'Efectivo Bs' ||
          sale.paymentMethod === 'Punto de Venta (Bs)' ||
          sale.paymentMethod === 'Transferencia Bancaria Bs'));
    const abonoLine =
      paidUSD > 0
        ? initialIsBs
          ? `💵 Abono Inicial: *${formatBs(paidBs)}* (Equiv. *${formatUSD(paidUSD)}* BCV)\n`
          : `💵 Abono Inicial: *${formatUSD(paidUSD)}* (Equiv. *${formatBs(paidBs)}* BCV)\n`
        : '';

    message = `📋 *NOTA DE CRÉDITO #${sale.invoiceNumber}* - *${businessName}*

🛒 *Detalle de compra:*
${itemsText}

${shippingLine}💰 *Monto Total:* *${formatUSD(sale.total)}* | *${formatBs(sale.totalBs || sale.total * rate)}*
📌 Condición: *A CRÉDITO* (${sale.creditDays || 15} días)
⏳ Fecha de Vencimiento: *${sale.creditDueDate || 'A convenir'}*
${abonoLine}⚠️ *Saldo Pendiente por Pagar:* *${formatUSD(pendingBalanceUSD)}* | *${formatBs(pendingBalanceBs)}* (Tasa BCV: ${rate.toFixed(2)})

📲 *Datos para el pago:*
🏦 Banco: ${settings.bankDetails.pagoMovilBank || '0134 - Banesco'}
📱 Pago Móvil: ${settings.bankDetails.pagoMovilPhone || '0412-2242450'}
🆔 CI/RIF: ${settings.bankDetails.pagoMovilId || 'V-19996141'}
🖼️ QR: ${qrImageLink}

📎 Le adjuntamos su Nota de Crédito en PDF.${storePromoFooter}`;
  } else if (isMixtoWithCredit && sale.creditStatus !== 'PAGADO' && pendingBalanceUSD > 0.01) {
    // Pago Mixto con parte De Contado y parte A Crédito pendiente
    const mixtoLines = (sale.paymentSplits || [])
      .map((sp) => {
        const label = sp.splitType === 'CREDITO' ? '⏳ A Crédito' : `✅ Contado (${sp.paymentMethod})`;
        const spBs = sp.amountBs || sp.amountUSD * rate;
        const isBsMethod =
          sp.splitType !== 'CREDITO' &&
          (sp.paymentMethod === 'Pago Móvil' ||
            sp.paymentMethod === 'Efectivo Bs' ||
            sp.paymentMethod === 'Punto de Venta (Bs)' ||
            sp.paymentMethod === 'Transferencia Bancaria Bs');
        const amountText = isBsMethod
          ? `*${formatBs(spBs)}* (Equiv. ${formatUSD(sp.amountUSD)} BCV)`
          : `*${formatUSD(sp.amountUSD)}* (${formatBs(spBs)})`;
        return `   • ${label}: ${amountText}${sp.reference ? ` · Ref: ${sp.reference}` : ''}`;
      })
      .join('\n');

    message = `📄 *FACTURA DE COMPRA #${sale.invoiceNumber}* - *${businessName}*

🛒 *Detalle de compra:*
${itemsText}

${shippingLine}💰 *Monto Total:* *${formatUSD(sale.total)}* | *${formatBs(sale.totalBs || sale.total * rate)}*
📌 Condición: *PAGO MIXTO (CONTADO + CRÉDITO ${sale.creditDays || 15} días)*
💳 *Desglose de pago:*
${mixtoLines}
💵 Pagado / Abonado: *${formatUSD(sale.creditPaidAmount || 0)}*
⏳ Fecha de Vencimiento: *${sale.creditDueDate || 'A convenir'}*
⚠️ *Saldo Pendiente por Pagar:* *${formatUSD(pendingBalanceUSD)}* | *${formatBs(pendingBalanceBs)}* (Tasa BCV: ${rate.toFixed(2)})

📲 *Datos para el pago del saldo:*
🏦 Banco: ${settings.bankDetails.pagoMovilBank || '0134 - Banesco'}
📱 Pago Móvil: ${settings.bankDetails.pagoMovilPhone || '0412-2242450'}
🆔 CI/RIF: ${settings.bankDetails.pagoMovilId || 'V-19996141'}
🖼️ QR: ${qrImageLink}

📎 Le adjuntamos su Factura en PDF.${storePromoFooter}`;
  } else {
    // Venta de Contado, Pago Mixto (pagado en su totalidad) o MercadoLibre
    const mixtoLines = isMixto
      ? (sale.paymentSplits || [])
          .map((sp) => {
            const spBs = sp.amountBs || sp.amountUSD * rate;
            const isBsMethod =
              sp.splitType !== 'CREDITO' &&
              (sp.paymentMethod === 'Pago Móvil' ||
                sp.paymentMethod === 'Efectivo Bs' ||
                sp.paymentMethod === 'Punto de Venta (Bs)' ||
                sp.paymentMethod === 'Transferencia Bancaria Bs');
            const amountText = isBsMethod
              ? `*${formatBs(spBs)}* (Equiv. ${formatUSD(sp.amountUSD)} BCV)`
              : `*${formatUSD(sp.amountUSD)}* (${formatBs(spBs)})`;
            return `   • ${sp.splitType === 'CREDITO' ? 'Parte a Crédito (Liquidada)' : sp.paymentMethod}: ${amountText}${sp.reference ? ` · Ref: ${sp.reference}` : ''}`;
          })
          .join('\n')
      : '';
    const conditionText = isMercadoLibre
      ? `📌 Condición: *MERCADOLIBRE* 📦 (Pagado)`
      : isMixto
      ? `📌 Condición: *PAGO MIXTO (PAGADO)* ✅\n💳 *Desglose de pago:*\n${mixtoLines}`
      : `📌 Condición: *DE CONTADO (PAGADO)* ✅\n💳 Método: ${sale.paymentMethod || 'Pago Móvil / Divisas'}`;

    message = `📄 *FACTURA DE COMPRA #${sale.invoiceNumber}* - *${businessName}*

🛒 *Detalle de compra:*
${itemsText}

${shippingLine}💰 *Total Pagado:* *${formatUSD(sale.total)}* | *${formatBs(sale.totalBs || sale.total * rate)}* (Tasa BCV: ${rate.toFixed(2)})
${conditionText}

📎 Le adjuntamos su Factura de Compra en PDF.
¡Muchas gracias por su compra en ${settings.commercialName || settings.name}!${storePromoFooter}`;
  }

  const url = buildWhatsAppSendUrl(sale.customerPhone, message);

  return { message, url };
}

/**
 * Builds the WhatsApp notification message sent to the OWNER with accumulated MercadoLibre debt
 */
export function buildMercadoLibreDebtWhatsAppMessage(
  pendingSales: Sale[],
  totalDebtUSD: number,
  settings: BusinessSettings,
  latestSale?: Sale,
  recentManualEntry?: MercadoLibreEntry,
  pendingManualEntries?: MercadoLibreEntry[]
): { message: string; url: string } {
  const rate = settings.bcvRate;
  const totalDebtBs = totalDebtUSD * rate;

  let header = `🔔 *CONTROL DE DEUDA MERCADOLIBRE* 📦\n`;
  if (latestSale) {
    header += `\n🚨 *Nueva venta registrada en MercadoLibre:*
▪ Factura: #${latestSale.invoiceNumber}
▪ Cliente: ${latestSale.customerName}
▪ Monto venta: ${formatUSD(latestSale.total)}
▪ Comisión venta: *${formatUSD(latestSale.mercadolibreCommissionUSD || 0)}* (${formatBs((latestSale.mercadolibreCommissionUSD || 0) * rate)})
───────────────────────\n`;
  } else if (recentManualEntry) {
    const isPay = recentManualEntry.type === 'ABONO_PAGO';
    header += `\n📝 *${isPay ? 'Pago / Abono realizado a MercadoLibre registrado:' : 'Comisión adicional / Cargo manual registrado:'}*
▪ Detalle: ${recentManualEntry.description}
▪ Monto: *${isPay ? '-' : '+'}${formatUSD(Math.abs(recentManualEntry.amountUSD))}* (${formatBs(Math.abs(recentManualEntry.amountUSD) * rate)})
───────────────────────\n`;
  }

  const listPending = pendingSales.length > 0
    ? pendingSales.slice(0, 8).map((s) =>
        `▪ #${s.invoiceNumber} (${s.customerName}): ${formatUSD(s.mercadolibreCommissionUSD || 0)}`
      ).join('\n')
    : '';

  const listManual = (pendingManualEntries && pendingManualEntries.length > 0)
    ? pendingManualEntries.slice(0, 5).map((e) =>
        `▪ ${e.type === 'ABONO_PAGO' ? 'Abono/Pago' : 'Cargo'}: ${e.description} (${formatUSD(e.amountUSD)})`
      ).join('\n')
    : '';

  let detailSection = '';
  if (listPending) {
    detailSection += `📋 *Ventas pendientes (${pendingSales.length}):*\n${listPending}\n`;
  }
  if (listManual) {
    detailSection += `📋 *Ajustes y pagos manuales (${pendingManualEntries?.length}):*\n${listManual}\n`;
  }
  if (!listPending && !listManual) {
    detailSection = `✅ Sin comisiones ni cargos pendientes de pago.\n`;
  }

  const message = `${header}💰 *DEUDA TOTAL ACUMULADA A MERCADOLIBRE:*
💵 *${formatUSD(totalDebtUSD)} USD*
🇻🇪 *Bs. ${formatBs(totalDebtBs)}* (Tasa BCV: ${rate.toFixed(2)})

${detailSection}Recuerda mantener al día los pagos a MercadoLibre para conservar la reputación de tu cuenta. 🛵💨`;

  const targetPhone = settings.whatsapp || settings.phone || '04127860509';
  const url = buildWhatsAppSendUrl(targetPhone, message);

  return { message, url };
}

/**
 * Builds the WhatsApp message and direct URL for Workshop Service Order notifications
 */
export function buildServiceStatusWhatsAppMessage(order: ServiceOrder, settings: BusinessSettings): { message: string; url: string } {
  const moto = order.motorcycle;
  const rate = order.bcvRate || settings.bcvRate;
  const totalBs = order.totalCostBs || order.totalCost * rate;
  const appOrigin = getPublicAppOrigin();
  const trackingLink = `${appOrigin}/?trackPhone=${encodeURIComponent(order.customerPhone)}`;
  const qrImageLink = `${appOrigin}${settings.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg'}`;

  const isSeatOrder = order.entryType === 'ASIENTO';
  let statusHeader = '';

  switch (order.status) {
    case 'CREADA':
      statusHeader = isSeatOrder
        ? '📋 *ORDEN DE ASIENTO REGISTRADA (EN ESPERA)*'
        : '📋 *ORDEN DE SERVICIO REGISTRADA (EN ESPERA)*';
      break;
    case 'EN_PROCESO':
      statusHeader = isSeatOrder
        ? '✂️ *TU ASIENTO ESTÁ EN PROCESO DE TRABAJO*'
        : '🔧 *TU MOTO ESTÁ EN PROCESO DE SERVICIO*';
      break;
    case 'CULMINADA':
      statusHeader = isSeatOrder
        ? '✅ *¡ASIENTO LISTO PARA ENTREGA!*'
        : '✅ *¡TRABAJO CULMINADO - LISTA PARA ENTREGA!*';
      break;
    case 'ENTREGADA':
      statusHeader = isSeatOrder
        ? '🏁 *ASIENTO ENTREGADO AL CLIENTE*'
        : '🏁 *VEHÍCULO ENTREGADO AL CLIENTE*';
      break;
  }

  const servicesText = order.servicesList && order.servicesList.length > 0
    ? `\n🛠️ *Servicios y Mano de Obra:*\n` + order.servicesList.map(s => `▪ ${s.name} (${formatUSD(s.cost)} / ${formatBs(s.cost * rate)})`).join('\n')
    : (order.laborCost > 0 ? `\n🛠️ *Mano de Obra / Servicio:* ${formatUSD(order.laborCost)} (${formatBs(order.laborCost * rate)})` : '');

  const partsText = order.partsUsed.length > 0
    ? `\n🔩 *Repuestos e insumos utilizados:*\n` + order.partsUsed.map(p => `▪ ${p.quantity}x ${p.name} (${formatUSD(p.total)} / ${formatBs(p.total * rate)})`).join('\n')
    : '';

  const vehicleBlock = isSeatOrder
    ? `🪑 *INGRESO DE ASIENTO* · Modelo de Moto: *${moto.model || 'N/A'}*`
    : `🛵 *MOTO:* ${moto.brand} ${moto.model} · Placa: *${moto.plate.toUpperCase()}*\n🎨 Color: ${moto.color} | 🧭 Km: ${moto.mileage.toLocaleString()} km`;

  const paySummary = getServiceOrderPaymentSummary(order, rate);
  const paymentStatusBlock =
    paySummary.paymentStatus === 'PAGADO'
      ? `✅ *ESTADO DE PAGO: PAGADO EN SU TOTALIDAD*\n💵 *Total Cancelado:* ${formatUSD(paySummary.paidUSD)} (${formatBs(paySummary.paidBs)})\n📌 *Saldo Pendiente:* $0.00`
      : paySummary.paymentStatus === 'ABONO'
      ? `💳 *ESTADO DE PAGO: ABONO PARCIAL REGISTRADO*\n✅ *Total Abonado:* ${formatUSD(paySummary.paidUSD)} (${formatBs(paySummary.paidBs)})\n⚠️ *Saldo Restante por Pagar:* *${formatUSD(paySummary.remainingUSD)}* | *${formatBs(paySummary.remainingBs)}*`
      : `⏳ *ESTADO DE PAGO:* Pendiente por pagar`;

  const paymentCoordsBlock =
    paySummary.paymentStatus === 'PAGADO'
      ? `✅ *Gracias por su pago. Esta orden se encuentra cancelada al 100%.*`
      : `📲 *DATOS PAGO MÓVIL${paySummary.paymentStatus === 'ABONO' ? ' (PARA CANCELAR SALDO RESTANTE)' : ''}:*
🏦 Banco: ${settings.bankDetails.pagoMovilBank || '0134 - Banesco'}
📱 Celular: ${settings.bankDetails.pagoMovilPhone || '0412-2242450'}
🆔 Cédula: ${settings.bankDetails.pagoMovilId || 'V-19996141'}
🖼️ Escanea el código QR para pagar:
👉 ${qrImageLink}`;

  const message = `🏍️ *${settings.name.toUpperCase()}* 🏍️
───────────────────────
${statusHeader}
🔖 *Orden:* #${order.orderNumber}
👤 Cliente: *${order.customerName}*
${vehicleBlock}
🛠️ Tipo de Servicio: *${order.serviceType}*
───────────────────────
📝 *${isSeatOrder ? 'Trabajo por Hacerle al Asiento' : 'Trabajo Solicitado / Falla'}:*
${order.reportedIssue}
${order.diagnosis ? `\n🔍 *Diagnóstico Técnico:* ${order.diagnosis}` : ''}
${servicesText}
${partsText}
───────────────────────
💵 *Mano de Obra + Repuestos:* ${formatUSD(order.totalCost)}
📊 *Tasa BCV del día:* Bs. ${rate.toFixed(2)}
🇻🇪 *Total en Bolívares:* ${formatBs(totalBs)}
${paymentStatusBlock}
${order.estimatedDelivery ? `⏰ Entrega estimada: ${order.estimatedDelivery}\n` : ''}
${paymentCoordsBlock}
───────────────────────
🔎 *Consulta en tiempo real el historial y estado de tu moto:*
🔗 ${trackingLink}

¡Estamos para brindarte la mejor calidad y seguridad sobre dos ruedas! 🔧🛡️`;

  const url = buildWhatsAppSendUrl(order.customerPhone, message);

  return { message, url };
}

/**
 * Builds WhatsApp message when customer places an order from the online store
 */
export function buildStoreOrderWhatsAppMessage(order: OnlineOrder, settings: BusinessSettings): { message: string; url: string } {
  const rate = order.bcvRate || settings.bcvRate;
  const madeToOrderItems = order.items.filter((item) => item.isMadeToOrder);
  const itemsText = order.items
    .map((item) => {
      const mtoSuffix = item.isMadeToOrder
        ? ` [Bajo pedido: ${item.productionTimeLabel || '12 a 24 horas'}]`
        : '';
      const wholesaleSuffix =
        item.wholesaleDiscountPct && item.wholesaleDiscountPct > 0
          ? ` (-${item.wholesaleDiscountPct}% Mayor)`
          : '';
      return `▪ ${item.quantity}x ${item.name}${wholesaleSuffix}${mtoSuffix} - ${formatUSD(item.total)} (${formatBs(item.total * rate)})`;
    })
    .join('\n');

  const productionNotice =
    madeToOrderItems.length > 0
      ? `\n⏳ *TIEMPO DE FABRICACIÓN:* Incluye artículo(s) fabricados bajo pedido (${
          madeToOrderItems[0].productionTimeLabel || '12 a 24 horas'
        }, sujeto a posibles retrasos por cortes de luz).\n`
      : '';

  const wholesaleSummaryBlock =
    order.wholesaleDiscountTotal && order.wholesaleDiscountTotal > 0
      ? `🏷️ *Subtotal Regular:* ${formatUSD(order.subtotalBeforeDiscount || order.total + order.wholesaleDiscountTotal)}\n✨ *Descuento al Mayor:* -${formatUSD(order.wholesaleDiscountTotal)}\n`
      : '';

  let deliverySection = '';
  if (order.deliveryType === 'ENVIO_NACIONAL') {
    deliverySection = `📦 *MODALIDAD: ENVÍO NACIONAL (${order.shippingAgency || 'MRW / ZOOM / TEALCA'})*
🏢 *Agencia:* ${order.agencyAddress || 'Dirección de agencia'}, ${order.customerCity || ''} - ${order.customerState || ''}
👤 *Destinatario:* ${order.recipientName || order.customerName}
🆔 *Cédula:* ${order.recipientDocument || 'No especificada'}
📱 *Teléfono de Retiro:* ${order.recipientPhone || order.customerPhone}`;
  } else if (order.deliveryType === 'DOMICILIO') {
    deliverySection = `🛵 *MODALIDAD: DELIVERY LOCAL (MÉRIDA)*
📍 *Dirección:* ${order.customerAddress || 'No especificada'}, ${order.customerCity || ''} - ${order.customerState || ''}`;
  } else {
    deliverySection = `🏬 *MODALIDAD: RETIRO EN TIENDA / SEDE*
📍 *Sede:* ${settings.city} - ${settings.address}`;
  }

  const storeBrand = settings.onlineStoreName || 'Mercado Moto CC';
  const message = `🛍️ *NUEVO PEDIDO - ${storeBrand.toUpperCase()} #${order.orderCode}*
───────────────────────
Hola *${settings.commercialName}*, acabo de realizar una compra desde su tienda online *${storeBrand}*:

👤 *Cliente:* ${order.customerName}
📱 *Teléfono:* ${order.customerPhone}
${deliverySection}

📦 *PRODUCTOS:*
${itemsText}
${productionNotice}───────────────────────
${wholesaleSummaryBlock}💵 *TOTAL A PAGAR (USD): ${formatUSD(order.total)}*
📊 *Tasa BCV:* Bs. ${rate.toFixed(2)}
🇻🇪 *TOTAL EN BOLÍVARES: ${formatBs(order.totalBs || order.total * rate)}*
───────────────────────
💳 *Método seleccionado:* ${order.paymentMethod}
${order.paymentProofReference ? `🧾 Ref. / Comprobante: ${order.paymentProofReference}\n` : ''}${order.notes ? `📝 Notas: ${order.notes}\n` : ''}
Quedo atento a la confirmación y guía de envío de mi pedido. ¡Muchas gracias!`;

  const url = buildWhatsAppSendUrl(settings.whatsapp, message);

  return { message, url };
}

/**
 * Builds WhatsApp message for single credit invoice debt reminder
 */
export function buildCreditReminderWhatsAppMessage(
  sale: Sale,
  settings: BusinessSettings
): { message: string; url: string } {
  const rate = sale.bcvRate || settings.bcvRate;
  const businessName = (settings.commercialName || settings.name || 'MotoCristoc').toUpperCase();
  const pendingUSD = Math.max(0, sale.total - (sale.creditPaidAmount || 0));
  const pendingBs = pendingUSD * rate;

  // Calculate overdue status
  let dueDateText = sale.creditDueDate || 'A convenir';
  let statusAlert = '';
  if (sale.creditDueDate) {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const due = new Date(sale.creditDueDate);
    due.setHours(0, 0, 0, 0);
    const diffTime = due.getTime() - today.getTime();
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24));

    if (diffDays < 0) {
      statusAlert = `⚠️ *ESTADO: VENCIDO HACE ${Math.abs(diffDays)} DÍA(S)*`;
    } else if (diffDays === 0) {
      statusAlert = `⚠️ *ESTADO: VENCE HOY*`;
    } else {
      statusAlert = `⏳ *Vence en:* ${diffDays} día(s) (${dueDateText})`;
    }
  }

  const itemsText = sale.items
    .map((item) => `▪ ${item.quantity}x ${item.name} (${formatUSD(item.total)})`)
    .join('\n');

  const appOrigin = getPublicAppOrigin();
  const qrImageLink = `${appOrigin}${settings.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg'}`;

  const isApartadoSale = sale.paymentType === 'APARTADO';
  const message = `🏍️ *${businessName}* - Recordatorio de ${isApartadoSale ? 'Apartado' : 'Pago'}
Hola estimado(a) *${sale.customerName}*, un cordial saludo.

${isApartadoSale ? 'Le escribimos para recordarle amablemente el saldo pendiente de su *Sistema de Apartado* para completar el retiro de su mercancía:' : 'Le escribimos para recordarle amablemente el saldo pendiente de su compra a crédito:'}

📋 *${isApartadoSale ? 'Comprobante de Apartado' : 'Factura / Nota de Crédito'}:* #${sale.invoiceNumber}
📅 *Fecha de Emisión:* ${new Date(sale.createdAt).toLocaleDateString('es-VE')}
${statusAlert ? `${statusAlert}\n` : ''}
🛒 *Repuestos / Servicios:*
${itemsText}

💵 *Total de la Factura:* ${formatUSD(sale.total)}
${(sale.creditPaidAmount || 0) > 0 ? `✅ *Monto Abonado:* ${formatUSD(sale.creditPaidAmount || 0)}\n` : ''}🚨 *SALDO PENDIENTE:* *${formatUSD(pendingUSD)}*
📊 *Equivalente en Bolívares:* *${formatBs(pendingBs)}* (Tasa BCV: ${rate.toFixed(2)})

📲 *Datos para realizar su pago:*
🏦 *Banco:* ${settings.bankDetails.pagoMovilBank || '0134 - Banesco'}
📱 *Pago Móvil:* ${settings.bankDetails.pagoMovilPhone || '0412-2242450'}
🆔 *C.I. / RIF:* ${settings.bankDetails.pagoMovilId || 'V-19996141'}
🏛️ *Transferencia Banesco:* ${settings.bankDetails.bankTransferAccount || '0134-0030-08-0301034334'} (${settings.bankDetails.bankTransferRif || settings.rif})
${settings.bankDetails.binancePayId ? `🟡 *Binance Pay ID:* ${settings.bankDetails.binancePayId}\n` : ''}🖼️ *QR Pago Móvil:* ${qrImageLink}

Por favor, una vez realice su abono o pago, envíenos el capture o número de referencia por este medio para registrarlo en su estado de cuenta. ¡Muchas gracias por su preferencia!`;

  const url = buildWhatsAppSendUrl(sale.customerPhone, message);

  return { message, url };
}

/**
 * Builds WhatsApp notification receipt when a customer makes an abono/payment toward a credit or apartado account,
 * clearly displaying both the payment amount and the current remaining debt after applying the payment.
 */
export function buildCreditPaymentReceiptWhatsAppMessage(
  sale: Sale,
  payment: CreditPaymentRecord,
  settings: BusinessSettings,
  totalCustomerDebtAfterUSD?: number
): { message: string; url: string } {
  const rate = settings.bcvRate || sale.bcvRate;
  const businessName = (settings.commercialName || settings.name || 'MotoCristoc').toUpperCase();
  const isApartado = sale.paymentType === 'APARTADO';

  const totalPaidAfterUSD = Math.round((sale.creditPaidAmount || 0) * 100) / 100;
  const remainingInvoiceUSD = Math.max(0, Math.round((sale.total - totalPaidAfterUSD) * 100) / 100);
  const remainingInvoiceBs = remainingInvoiceUSD * rate;

  const totalDebtAfterUSD =
    totalCustomerDebtAfterUSD !== undefined
      ? Math.max(0, Math.round(totalCustomerDebtAfterUSD * 100) / 100)
      : remainingInvoiceUSD;
  const totalDebtAfterBs = totalDebtAfterUSD * rate;

  const dateStr = new Date(payment.date).toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const appOrigin = getPublicAppOrigin().replace(/\/+$/, '');
  const hasOtherPendingAccounts = Math.abs(totalDebtAfterUSD - remainingInvoiceUSD) > 0.01;

  const balanceSection =
    remainingInvoiceUSD <= 0.01
      ? `🎉 *ESTADO DE ESTA ${isApartado ? 'NOTA DE APARTADO' : 'FACTURA'}: PAGADA AL 100% ($0.00 pendiente)*`
      : `🚨 *MONTO ACTUAL QUE DEBE EN ESTA ${isApartado ? 'NOTA' : 'FACTURA'}:* *${formatUSD(remainingInvoiceUSD)}* | *${formatBs(remainingInvoiceBs)}*`;

  const consolidatedDebtLine = hasOtherPendingAccounts
    ? `\n📌 *DEUDA TOTAL ACTUAL QUE DEBE (TODAS SUS CUENTAS):* *${formatUSD(totalDebtAfterUSD)}* | *${formatBs(totalDebtAfterBs)}*`
    : totalDebtAfterUSD <= 0.01
    ? `\n🟢 *SALDO TOTAL ACTUAL DE SU CUENTA:* *$0.00 (AL DÍA)* 🙌`
    : '';

  const paymentAccountsBlock =
    totalDebtAfterUSD > 0.01
      ? `\n\n📲 *Datos para sus próximos abonos:*\n🏦 *Banco:* ${settings.bankDetails.pagoMovilBank || '0134 - Banesco'}\n📱 *Pago Móvil:* ${settings.bankDetails.pagoMovilPhone || '0412-2242450'}\n🆔 *C.I. / RIF:* ${settings.bankDetails.pagoMovilId || 'V-19996141'}`
      : '';

  const paidBs = payment.amountBs || payment.amountUSD * (payment.bcvRate || rate);
  const paidInBs =
    payment.currencyMode === 'BS' ||
    (!payment.currencyMode &&
      (payment.paymentMethod === 'Pago Móvil' ||
        payment.paymentMethod === 'Efectivo Bs' ||
        payment.paymentMethod === 'Punto de Venta (Bs)' ||
        payment.paymentMethod === 'Transferencia Bancaria Bs'));
  const paidTodayDisplay = paidInBs
    ? `*${formatBs(paidBs)}* (Equiv. *${formatUSD(payment.amountUSD)}* BCV)`
    : `*${formatUSD(payment.amountUSD)}* (Equiv. *${formatBs(paidBs)}* BCV)`;

  const message = `✅ *COMPROBANTE DE ABONO RECIBIDO* - *${businessName}*
───────────────────────
Hola estimado(a) *${sale.customerName}*, hemos aplicado exitosamente su abono en su cuenta:

📋 *${isApartado ? 'Comprobante de Apartado' : 'Factura'}:* #${sale.invoiceNumber}
📅 *Fecha del Abono:* ${dateStr}
💵 *MONTO ABONADO HOY:* ${paidTodayDisplay}
💳 *Método:* ${payment.paymentMethod}
${payment.reference ? `🔖 *Referencia:* ${payment.reference}\n` : ''}${payment.notes ? `📝 *Nota:* ${payment.notes}\n` : ''}───────────────────────
📊 *Total de la ${isApartado ? 'nota' : 'factura'}:* ${formatUSD(sale.total)} (${formatBs(sale.total * rate)})
✅ *Total abonado acumulado:* ${formatUSD(totalPaidAfterUSD)} (${formatBs(totalPaidAfterUSD * rate)})
${balanceSection}${consolidatedDebtLine}
_(Calculado a Tasa Oficial BCV: Bs. ${rate.toFixed(2)})_${paymentAccountsBlock}

───────────────────────
🔥🛵 *¡ENTRA EN NUESTRA TIENDA ONLINE PARA MÁS REPUESTOS Y OFERTAS!*
👉 *${appOrigin}/* 👈

¡Muchas gracias por su pago y confianza! 🔧`;

  const url = buildWhatsAppSendUrl(sale.customerPhone, message);

  return { message, url };
}

/**
 * Builds comprehensive account statement WhatsApp message for customer with all pending credit invoices
 */
export function buildCustomerAccountStatementWhatsAppMessage(
  customerName: string,
  customerPhone: string,
  pendingSales: Sale[],
  settings: BusinessSettings
): { message: string; url: string } {
  const rate = settings.bcvRate;
  const businessName = (settings.commercialName || settings.name || 'MotoCristoc').toUpperCase();

  const totalDebtUSD = pendingSales.reduce((sum, s) => {
    return sum + Math.max(0, s.total - (s.creditPaidAmount || 0));
  }, 0);
  const totalDebtBs = totalDebtUSD * rate;

  const invoicesList = pendingSales
    .map((s) => {
      const pendingThis = Math.max(0, s.total - (s.creditPaidAmount || 0));
      const label = s.paymentType === 'APARTADO' ? 'Apartado' : 'Factura';
      return `▪ *${label} #${s.invoiceNumber}* (${s.paymentType === 'APARTADO' ? 'Retiro límite' : 'Vence'}: ${s.creditDueDate || 'Pendiente'})\n  Saldo: *${formatUSD(pendingThis)}* (${formatBs(pendingThis * rate)})`;
    })
    .join('\n\n');

  const appOrigin = getPublicAppOrigin();
  const qrImageLink = `${appOrigin}${settings.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg'}`;

  const message = `📋 *ESTADO DE CUENTA DE CRÉDITO* - *${businessName}*
Estimado(a) *${customerName}*, le enviamos el resumen consolidado de sus cuentas pendientes:

📑 *Facturas por Cobrar (${pendingSales.length}):*
${invoicesList}

───────────────────────
🚨 *TOTAL GENERAL PENDIENTE: ${formatUSD(totalDebtUSD)}*
🇻🇪 *TOTAL EN BOLÍVARES: ${formatBs(totalDebtBs)}*
(Calculado a Tasa Oficial BCV: Bs. ${rate.toFixed(2)})
───────────────────────

📲 *Cuentas para su pago:*
🏦 *Banco:* ${settings.bankDetails.pagoMovilBank || '0134 - Banesco'}
📱 *Pago Móvil:* ${settings.bankDetails.pagoMovilPhone || '0412-2242450'}
🆔 *C.I./RIF:* ${settings.bankDetails.pagoMovilId || 'V-19996141'}
🏛️ *Transferencia:* ${settings.bankDetails.bankTransferAccount || '0134-0030-08-0301034334'} (${settings.bankDetails.bankTransferRif || settings.rif})
${settings.bankDetails.binancePayId ? `🟡 *Binance Pay ID:* ${settings.bankDetails.binancePayId}\n` : ''}🖼️ *QR Pago Móvil:* ${qrImageLink}

Agradecemos reportar su comprobante de pago por este medio. ¡Estamos a su entera orden!`;

  const url = buildWhatsAppSendUrl(customerPhone, message);

  return { message, url };
}

/**
 * Builds WhatsApp notification for technician when a commission payout is registered,
 * including both the amount just paid AND the total remaining balance owed to the technician.
 */
export function buildTechnicianPayoutWhatsAppMessage(
  payout: TechnicianPayout,
  settings: BusinessSettings
): { message: string; url: string } {
  const rate = payout.bcvRate || settings.bcvRate;
  const businessName = (settings.commercialName || settings.name || 'MotoCristoc').toUpperCase();
  const dateStr = new Date(payout.createdAt).toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const ordersText =
    payout.commissionItems.length > 0
      ? payout.commissionItems
          .map(
            (item) =>
              `▪ *${item.orderNumber}* (${item.motorcycleLabel || 'Taller'}) — ${item.commissionRate}%: *${formatUSD(item.amountPaidInThisPayoutUSD)}*`
          )
          .join('\n')
      : '▪ Abono general a cuenta de comisiones';

  const hasDebt = payout.remainingDebtUSD > 0.009;
  const debtSection = hasDebt
    ? `⏳ *TOTAL QUE SE LE DEBE PENDIENTE:* *${formatUSD(payout.remainingDebtUSD)}* (${formatBs(payout.remainingDebtBs)})`
    : `🎉 *SALDO PENDIENTE QUE SE LE DEBE:* *$0.00 (CUENTA AL DÍA)*`;

  const message = `🔧 *${businessName}* · NOTIFICACIÓN DE PAGO DE COMISIÓN
───────────────────────
Hola *${payout.technicianName}*, se ha registrado un pago a tu favor:

🧾 *Comprobante / Factura:* #${payout.payoutNumber}
📅 *Fecha:* ${dateStr}
💳 *Método de Pago:* ${payout.paymentMethod}
${payout.reference ? `🔖 *Referencia:* ${payout.reference}\n` : ''}
💵 *MONTO PAGADO HOY:* *${formatUSD(payout.amountUSD)}*
🇻🇪 *Equivalente en Bs (BCV ${rate.toFixed(2)}):* *${formatBs(payout.amountBs)}*

📋 *Órdenes / Trabajos Liquidados:*
${ordersText}

───────────────────────
${debtSection}
───────────────────────
${payout.notes ? `📝 Notas: ${payout.notes}\n` : ''}Adjunto te enviamos tu factura en PDF con el desglose completo. ¡Gracias por tu excelente trabajo en el taller! 🏍️`;

  const url = buildWhatsAppSendUrl(payout.technicianPhone || '', message);

  return { message, url };
}

/**
 * Builds WhatsApp notification sent to the ASSIGNED TECHNICIAN when a workshop service order is created or updated
 */
export function buildTechnicianAssignedOrderWhatsAppMessage(
  order: ServiceOrder,
  technician: Pick<Technician, 'name' | 'phone' | 'commissionRate' | 'specialty'>,
  settings: BusinessSettings
): { message: string; url: string } {
  const moto = order.motorcycle;
  const rate = order.bcvRate || settings.bcvRate;
  const businessName = (settings.commercialName || settings.name || 'MotoCristoc').toUpperCase();

  const laborBaseUSD = Math.max(
    Number(order.laborCost) || 0,
    Array.isArray(order.servicesList)
      ? order.servicesList.reduce((acc, s) => acc + (Number(s.cost) || 0), 0)
      : 0
  );
  const commissionRate = Number(technician.commissionRate) || 0;
  const estimatedCommissionUSD =
    commissionRate > 0 ? Math.round(((laborBaseUSD * commissionRate) / 100) * 100) / 100 : 0;

  const servicesText =
    order.servicesList && order.servicesList.length > 0
      ? `\n🛠️ *Servicios asignados:*\n` +
        order.servicesList
          .map((s) => `▪ ${s.name} (${formatUSD(s.cost)})`)
          .join('\n')
      : '';

  const partsText =
    order.partsUsed.length > 0
      ? `\n🔩 *Repuestos asignados (${order.partsUsed.length}):*\n` +
        order.partsUsed
          .map((p) => `▪ ${p.quantity}x ${p.name}${p.productId ? '' : ' (Externo)'}`)
          .join('\n')
      : '\n🔩 *Repuestos:* Sin repuestos asignados aún.';

  const commissionLine =
    commissionRate > 0
      ? `\n💼 *Tu Comisión (${commissionRate}%):* *${formatUSD(estimatedCommissionUSD)}* (${formatBs(estimatedCommissionUSD * rate)})`
      : '';

  const isSeatOrder = order.entryType === 'ASIENTO';
  const techVehicleBlock = isSeatOrder
    ? `🪑 *Ingreso de Asiento* · Modelo de Moto: *${moto.model || 'N/A'}*`
    : `🛵 *Moto:* ${moto.brand} ${moto.model}${moto.year ? ` (${moto.year})` : ''}\n🪪 *Placa:* *${moto.plate.toUpperCase()}*\n🎨 Color: ${moto.color || 'N/A'} | 🧭 Km: ${moto.mileage.toLocaleString()} | ⛽ Gas: ${order.fuelLevel}`;

  const message = `🔧 *${businessName}* · NUEVA ORDEN ASIGNADA
───────────────────────
Hola *${technician.name}*, se te ha asignado un nuevo trabajo en el taller:

🔖 *Orden:* #${order.orderNumber}
🛠️ *Tipo de Servicio:* *${order.serviceType}*
${techVehicleBlock}
👤 *Cliente:* ${order.customerName} (${order.customerPhone})
───────────────────────
📝 *${isSeatOrder ? 'Descripción del Trabajo al Asiento' : 'Falla / Trabajo a Realizar'}:*
${order.reportedIssue}
${order.diagnosis ? `\n🔍 *Diagnóstico Inicial:*\n${order.diagnosis}` : ''}${servicesText}${partsText}
───────────────────────
💵 *Mano de Obra:* ${formatUSD(laborBaseUSD)} (${formatBs(laborBaseUSD * rate)})${commissionLine}
${order.estimatedDelivery ? `⏰ *Entrega Estimada:* ${order.estimatedDelivery}\n` : ''}
Por favor revisar e iniciar el servicio. ¡Gracias por tu compromiso! 🏍️`;

  const targetPhone = technician.phone || order.assignedTechnicianPhone || '';
  const url = buildWhatsAppSendUrl(targetPhone, message);

  return { message, url };
}

/**
 * Builds WhatsApp notification sent to the SUPPLIER VENDOR regarding the Purchase Order / Invoice owed (with PDF attachment)
 */
export function buildPurchaseOrderDebtWhatsAppMessage(
  order: PurchaseOrder,
  settings: BusinessSettings
): { message: string; url: string } {
  const businessName = (settings.commercialName || settings.name || 'MotoCristoc').toUpperCase();
  const remainingUSD = Math.max(0, Math.round((order.totalUSD - (order.paidAmountUSD || 0)) * 100) / 100);
  const isCredit = order.paymentType === 'CREDITO';
  const isBsBcv = order.paymentCurrencyCondition === 'BS_BCV';

  const itemsText =
    order.items.length > 0
      ? order.items
          .map(
            (it) =>
              `▪ ${it.quantity}x ${it.name} (${formatUSD(it.unitCostUSD)} c/u → ${formatUSD(it.totalCostUSD)})`
          )
          .join('\n')
      : '▪ Detalle adjunto en factura PDF';

  const receptionLine =
    order.receivedStatus === 'RECIBIDA'
      ? `✅ *Mercancía:* Recibida${order.receivedDate ? ` (Llegó: ${order.receivedDate})` : ''}`
      : `⏳ *Mercancía:* Pendiente por recibir`;

  const creditLine = isCredit
    ? `📌 *Condición:* A CRÉDITO (${order.creditDays || 15} días${order.creditDueDate ? ` · Vence: ${order.creditDueDate}` : ''})`
    : `📌 *Condición:* DE CONTADO`;

  const currencyConditionLine = isBsBcv
    ? `💱 *Modalidad de Pago:* *Bs a Tasa BCV* (del día en que se realice el pago)`
    : `💱 *Modalidad de Pago:* *Divisas ($ USD)*`;

  const statusLine =
    remainingUSD <= 0.01
      ? `✅ *ESTADO:* *FACTURA CANCELADA AL 100% ($0.00 pendiente)*`
      : `🚨 *MONTO ACTUAL QUE SE DEBE:* *${formatUSD(remainingUSD)}*`;

  const bcvNote =
    isBsBcv && remainingUSD > 0.01
      ? `\n_(El equivalente en Bolívares se calcula a la tasa BCV vigente el día del pago)_`
      : '';

  const message = `📦 *ORDEN DE COMPRA / ESTADO DE FACTURA* · *${businessName}*
───────────────────────
Hola *${order.vendorName || order.supplierName}*, te saludamos de *${businessName}*:

🏢 *Proveedor:* ${order.supplierName} (Cód: *${order.supplierCode}*)
🧾 *Orden de Compra:* #${order.orderNumber}${order.supplierInvoiceNumber ? `\n📄 *Factura Proveedor:* #${order.supplierInvoiceNumber}` : ''}
${creditLine}
${currencyConditionLine}
${receptionLine}

🔩 *Repuestos solicitados:*
${itemsText}

───────────────────────
💵 *Total de la Factura:* ${formatUSD(order.totalUSD)}
${(order.paidAmountUSD || 0) > 0 ? `✅ *Total Abonado:* ${formatUSD(order.paidAmountUSD)}\n` : ''}${statusLine}${bcvNote}

📎 Te adjuntamos la factura / orden de compra en *PDF* con el detalle completo. ¡Saludos!`;

  const url = buildWhatsAppSendUrl(order.vendorPhone, message);
  return { message, url };
}

/**
 * Builds WhatsApp notification sent to the SUPPLIER VENDOR when an abono/payment is applied to a purchase order
 */
export function buildPurchaseOrderPaymentWhatsAppMessage(
  order: PurchaseOrder,
  payment: PurchasePaymentRecord,
  settings: BusinessSettings,
  totalSupplierDebtAfterUSD?: number
): { message: string; url: string } {
  const rate = settings.bcvRate || payment.bcvRate || order.bcvRate;
  const businessName = (settings.commercialName || settings.name || 'MotoCristoc').toUpperCase();
  const isBsBcv = order.paymentCurrencyCondition === 'BS_BCV';

  const totalPaidAfterUSD = Math.round((order.paidAmountUSD || 0) * 100) / 100;
  const remainingOrderUSD = Math.max(0, Math.round((order.totalUSD - totalPaidAfterUSD) * 100) / 100);

  const totalDebtAfterUSD =
    totalSupplierDebtAfterUSD !== undefined
      ? Math.max(0, Math.round(totalSupplierDebtAfterUSD * 100) / 100)
      : remainingOrderUSD;

  const dateStr = new Date(payment.date).toLocaleString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

  const hasOtherPendingOrders = Math.abs(totalDebtAfterUSD - remainingOrderUSD) > 0.01;

  const abonoBsPart =
    payment.currencyCategory === 'BS'
      ? ` | *${formatBs(payment.amountBs || payment.amountUSD * rate)}* (BCV ${rate.toFixed(2)})`
      : '';

  const currencyConditionLabel = isBsBcv
    ? 'Bs a Tasa BCV (del día de pago)'
    : 'Divisas ($ USD)';

  const balanceLine =
    remainingOrderUSD <= 0.01
      ? `🎉 *ESTADO DE ESTA FACTURA:* *PAGADA AL 100% ($0.00 pendiente)*`
      : `🚨 *SALDO RESTANTE QUE SE DEBE EN ESTA FACTURA:* *${formatUSD(remainingOrderUSD)}*`;

  const consolidatedDebtLine = hasOtherPendingOrders
    ? `\n📌 *DEUDA TOTAL ACTUAL CON ${order.supplierName.toUpperCase()}:* *${formatUSD(totalDebtAfterUSD)}*`
    : totalDebtAfterUSD <= 0.01
    ? `\n🟢 *SALDO TOTAL CON EL PROVEEDOR:* *$0.00 (AL DÍA)*`
    : '';

  const bcvNote =
    isBsBcv && remainingOrderUSD > 0.01
      ? `\n_(El saldo restante en Bolívares se calcula a la tasa BCV del día en que realice el próximo abono)_`
      : '';

  const message = `✅ *NOTIFICACIÓN DE ABONO / PAGO A PROVEEDOR* · *${businessName}*
───────────────────────
Hola *${order.vendorName || order.supplierName}*, hemos registrado un pago / abono a su cuenta:

🏢 *Proveedor:* ${order.supplierName} (Cód: *${order.supplierCode}*)
🧾 *Orden de Compra:* #${order.orderNumber}${order.supplierInvoiceNumber ? ` | *Fact. Prov:* #${order.supplierInvoiceNumber}` : ''}
💱 *Condición Pactada:* ${currencyConditionLabel}
📅 *Fecha del Abono:* ${dateStr}

💵 *MONTO ABONADO HOY:* *${formatUSD(payment.amountUSD)}*${abonoBsPart}
💳 *Forma de Pago:* ${payment.paymentMethod}
${payment.reference ? `🔖 *Referencia / Comprobante:* ${payment.reference}\n` : ''}${payment.notes ? `📝 *Nota:* ${payment.notes}\n` : ''}───────────────────────
📊 *Total de la Factura:* ${formatUSD(order.totalUSD)}
✅ *Total Abonado Acumulado:* ${formatUSD(totalPaidAfterUSD)}
${balanceLine}${consolidatedDebtLine}${bcvNote}

📎 Adjunto te enviamos el comprobante / estado de cuenta actualizado en *PDF*. ¡Muchas gracias!`;

  const url = buildWhatsAppSendUrl(order.vendorPhone, message);
  return { message, url };
}

/**
 * Builds WhatsApp running statement for a POS daily Open Account ("Cuenta Abierta del Día")
 */
export function buildOpenAccountWhatsAppMessage(
  account: OpenAccount,
  settings: BusinessSettings
): { message: string; url: string } {
  const rate = settings.bcvRate || account.bcvRate;
  const businessName = (settings.commercialName || settings.name || 'MotoCristoc').toUpperCase();
  const totalUSD = Math.round((account.subtotal || 0) * 100) / 100;
  const totalBs = Math.round(totalUSD * rate * 100) / 100;

  const itemsLines =
    account.items.length > 0
      ? account.items
          .map((item) => {
            const timeLabel = item.addedAt
              ? new Date(item.addedAt).toLocaleTimeString('es-VE', {
                  hour: '2-digit',
                  minute: '2-digit',
                })
              : '';
            return `▪ ${item.quantity}x ${item.name} — *${formatUSD(item.total)}*${timeLabel ? ` _(${timeLabel})_` : ''}`;
          })
          .join('\n')
      : '▪ Sin repuestos cargados todavía';

  const workshopLine = account.workshopName ? `🔧 *Taller / Mecánico:* ${account.workshopName}\n` : '';
  const motoLine = account.motorcycleInfo ? `🏍️ *Moto / Placa:* ${account.motorcycleInfo}\n` : '';

  const message = `📋 *ESTADO DE CUENTA ABIERTA DEL DÍA* · *${businessName}*
───────────────────────
Hola *${account.customerName}*, te enviamos el resumen actualizado de los repuestos cargados a tu cuenta hoy:

🔖 *Cuenta:* #${account.accountNumber}
${account.customerDocument ? `🆔 *C.I./RIF:* ${account.customerDocument}\n` : ''}${workshopLine}${motoLine}
🔩 *Repuestos Retirados (${account.items.length}):*
${itemsLines}

───────────────────────
💵 *TOTAL ACUMULADO HOY:* *${formatUSD(totalUSD)}*
🇻🇪 *Equivalente en Bolívares:* *${formatBs(totalBs)}* _(Tasa BCV: Bs. ${rate.toFixed(2)})_
───────────────────────

📲 *Datos para cancelar al finalizar el día:*
🏦 *Banco:* ${settings.bankDetails.pagoMovilBank || '0134 - Banesco'}
📱 *Pago Móvil:* ${settings.bankDetails.pagoMovilPhone || '0412-2242450'}
🆔 *C.I. / RIF:* ${settings.bankDetails.pagoMovilId || 'V-19996141'}
${settings.bankDetails.binancePayId ? `🟡 *Binance Pay ID:* ${settings.bankDetails.binancePayId}\n` : ''}
¡Estamos a la orden para cualquier otro repuesto que necesite tu moto! 🛵🔧`;

  const url = buildWhatsAppSendUrl(account.customerPhone, message);
  return { message, url };
}
