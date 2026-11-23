import { jsPDF } from 'jspdf';
import QRCode from 'qrcode';
import { Sale, BusinessSettings, Product, ServiceOrder, TechnicianPayout, PurchaseOrder, isSaleWithCredit } from '../types';
import { formatUSD, formatBs, getPublicAppOrigin } from './whatsapp';

/**
 * Draws a sharp, vector QR code directly into jsPDF synchronously without external images
 */
function drawVectorQRCode(doc: jsPDF, text: string, x: number, y: number, size: number) {
  try {
    const qr = QRCode.create(text, { errorCorrectionLevel: 'M' });
    const count = qr.modules.size;
    const cellSize = size / count;
    doc.setFillColor(15, 23, 42); // slate-900
    for (let r = 0; r < count; r++) {
      for (let c = 0; c < count; c++) {
        if (qr.modules.get(r, c)) {
          doc.rect(x + c * cellSize, y + r * cellSize, cellSize, cellSize, 'F');
        }
      }
    }
    // Subtle border around QR code
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.rect(x - 0.5, y - 0.5, size + 1, size + 1);
  } catch (e) {
    // Fallback if text is empty
    doc.setDrawColor(203, 213, 225);
    doc.rect(x, y, size, size);
  }
}

/**
 * Draws a clean spare part / product thumbnail icon if image is not loaded
 */
function drawProductThumbnailPlaceholder(doc: jsPDF, x: number, y: number, size: number, isService: boolean) {
  doc.setFillColor(248, 250, 252); // slate-50
  doc.setDrawColor(226, 232, 240); // slate-200
  doc.setLineWidth(0.2);
  doc.roundedRect(x, y, size, size, 1, 1, 'FD');

  if (isService) {
    // Stylized wrench / tool indicator
    doc.setDrawColor(217, 119, 6); // amber-600
    doc.setLineWidth(0.8);
    doc.line(x + 2.5, y + size - 2.5, x + size - 2.5, y + 2.5);
    doc.setFillColor(217, 119, 6);
    doc.circle(x + size - 2.5, y + 2.5, 1, 'F');
  } else {
    // Stylized gear / motorcycle spare part ring
    doc.setDrawColor(100, 116, 139); // slate-500
    doc.setLineWidth(0.8);
    doc.circle(x + size / 2, y + size / 2, size / 3.2, 'S');
    doc.setFillColor(245, 158, 11); // amber-500
    doc.circle(x + size / 2, y + size / 2, size / 6.5, 'F');
  }
}

/**
 * Genera el documento PDF oficial de la factura de compra o nota de crédito
 * con el formato fiel a la plantilla solicitada (MotoCristoc / Servimotos),
 * incluyendo tabla con Foto, Repuesto, Cantidad, Precio, Subtotal,
 * colores característicos y discriminación estricta entre Contado y Crédito.
 */
export function generateInvoicePDF(
  sale: Sale,
  settings: BusinessSettings,
  products?: Product[]
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const rate = sale.bcvRate || settings.bcvRate;
  const totalBs = sale.totalBs || sale.total * rate;
  const isCredit = sale.paymentType === 'CREDITO';
  const isApartado = sale.paymentType === 'APARTADO';
  const isMercadoLibre = sale.paymentType === 'MERCADOLIBRE';
  const isMixto = sale.paymentType === 'MIXTO' && Array.isArray(sale.paymentSplits) && sale.paymentSplits.length > 0;
  const isMixtoWithCredit = isMixto && isSaleWithCredit(sale);
  const pendingBalanceUSD = Math.max(0, sale.total - (sale.creditPaidAmount || 0));
  const pendingBalanceBs = pendingBalanceUSD * rate;

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2; // 180mm

  const commercialName = settings.commercialName || settings.name || 'MotoCristoc';
  const cleanPhone = (settings.whatsapp || settings.phone || '+584127860509').replace(/[^\d+]/g, '');
  const qrTargetUrl = `https://wa.me/${cleanPhone.replace('+', '')}`;

  // Helper for drawing the top header
  const drawPageHeader = () => {
    let headerY = 14;

    // --- LEFT / CENTER HEADER ---
    doc.setTextColor(15, 23, 42); // slate-900
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(commercialName, margin, headerY + 4);

    // Brand accent dot
    doc.setFillColor(245, 158, 11); // amber-500
    doc.circle(margin + doc.getTextWidth(commercialName) + 2.5, headerY + 2.5, 1.2, 'F');

    // RIF
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`RIF: ${settings.rif || 'V-19996141-8'}`, margin, headerY + 9.5);

    // Address
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const addressStr = settings.address || 'Calle Kennedy con calle 2 de Campo de Oro casa #1-23. Frente a la torre 5 de, Mérida 5101, Mérida';
    const addressLines: string[] = doc.splitTextToSize(addressStr, 112);
    doc.text(addressLines, margin, headerY + 13.5);

    const contactY = headerY + 13.5 + addressLines.length * 3.5;
    doc.text(settings.phone || '+584127860509', margin, contactY);
    doc.text(settings.email || 'servimotoscristocentro@gmail.com', margin, contactY + 3.8);

    // --- RIGHT: QR CODE (Top Right) ---
    const qrSize = 22;
    const qrX = pageWidth - margin - qrSize;
    drawVectorQRCode(doc, qrTargetUrl, qrX, headerY, qrSize);

    // Subtle label under QR
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(6);
    doc.setTextColor(100, 116, 139);
    doc.text('Escanear Contacto / WhatsApp', qrX + qrSize / 2, headerY + qrSize + 3, { align: 'center' });

    // --- HORIZONTAL DIVIDER ---
    const dividerY = Math.max(headerY + qrSize + 5, contactY + 7);
    doc.setDrawColor(15, 23, 42); // slate-900
    doc.setLineWidth(0.4);
    doc.line(margin, dividerY, margin + contentWidth, dividerY);

    // Website characteristic amber accent on divider
    doc.setDrawColor(245, 158, 11); // amber-500
    doc.setLineWidth(0.8);
    doc.line(margin, dividerY, margin + 28, dividerY);

    return dividerY + 5;
  };

  let y = drawPageHeader();

  // --- CUSTOMER INFORMATION BLOCK ---
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(15, 23, 42);

  // Cliente
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente: ', margin, y);
  const clientWidth = doc.getTextWidth('Cliente: ');
  doc.setFont('helvetica', 'normal');
  doc.text(sale.customerName || 'Cliente General', margin + clientWidth, y);

  // Documento
  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('Documento: ', margin, y);
  const docWidth = doc.getTextWidth('Documento: ');
  doc.setFont('helvetica', 'normal');
  doc.text(sale.customerDocument || 'No registrado', margin + docWidth, y);

  // Teléfono
  y += 4.5;
  doc.setFont('helvetica', 'bold');
  doc.text('Teléfono: ', margin, y);
  const phoneWidth = doc.getTextWidth('Teléfono: ');
  doc.setFont('helvetica', 'normal');
  doc.text(sale.customerPhone || 'No registrado', margin + phoneWidth, y);

  // Right-aligned metadata (Fecha y Condición)
  const metaRightX = margin + contentWidth;
  const metaY = y - 9;

  doc.setFont('helvetica', 'bold');
  doc.text('Fecha de emisión: ', metaRightX - 60, metaY);
  doc.setFont('helvetica', 'normal');
  const formattedDate = new Date(sale.createdAt).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  doc.text(formattedDate, metaRightX, metaY, { align: 'right' });

  // Condición
  doc.setFont('helvetica', 'bold');
  doc.text('Condición: ', metaRightX - 60, metaY + 4.5);
  doc.setFont('helvetica', 'bold');
  if (isApartado) {
    doc.setTextColor(67, 56, 202); // indigo-700
    doc.text(`SISTEMA DE APARTADO (${sale.creditDays || 15} DÍAS)`, metaRightX, metaY + 4.5, { align: 'right' });
    doc.setFontSize(7.5);
    doc.text(`Retirar antes: ${sale.creditDueDate || 'A convenir'}`, metaRightX, metaY + 8.5, { align: 'right' });
    doc.setFontSize(8);
  } else if (isCredit) {
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text(`A CRÉDITO (${sale.creditDays || 15} DÍAS)`, metaRightX, metaY + 4.5, { align: 'right' });
    doc.setFontSize(7.5);
    doc.text(`Vence: ${sale.creditDueDate || 'A convenir'}`, metaRightX, metaY + 8.5, { align: 'right' });
    doc.setFontSize(8);
  } else if (isMercadoLibre) {
    doc.setTextColor(161, 98, 7); // yellow-700
    doc.text('MERCADOLIBRE (CANAL ONLINE)', metaRightX, metaY + 4.5, { align: 'right' });
  } else if (isMixtoWithCredit) {
    doc.setTextColor(180, 83, 9); // amber-700
    doc.text(`PAGO MIXTO (CONTADO + CRÉDITO)`, metaRightX, metaY + 4.5, { align: 'right' });
    doc.setFontSize(7.5);
    doc.text(`Vence: ${sale.creditDueDate || 'A convenir'}`, metaRightX, metaY + 8.5, { align: 'right' });
    doc.setFontSize(8);
  } else if (isMixto) {
    doc.setTextColor(13, 148, 136); // teal-600
    doc.text('PAGO MIXTO (PAGADO)', metaRightX, metaY + 4.5, { align: 'right' });
  } else {
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text('DE CONTADO (PAGADO)', metaRightX, metaY + 4.5, { align: 'right' });
  }
  doc.setTextColor(15, 23, 42);

  // --- DOCUMENT TITLE (CENTERED & PROMINENT) ---
  y += 10;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);

  let docTitle = `Factura de compra #${sale.invoiceNumber}`;
  if (isApartado) {
    docTitle = `Comprobante de Apartado #${sale.invoiceNumber}`;
  } else if (isCredit) {
    docTitle = `Nota de crédito #${sale.invoiceNumber}`;
  } else if (isMercadoLibre) {
    docTitle = `Factura de compra #${sale.invoiceNumber}`;
  }
  doc.text(docTitle, pageWidth / 2, y, { align: 'center' });

  // Separate items into Repuestos (spare parts) and Servicios (services)
  const repuestos = sale.items.filter((item) => !item.isService && item.sku !== 'MAN-OBRA');
  const servicios = sale.items.filter((item) => item.isService || item.sku === 'MAN-OBRA');

  y += 6;

  // Function to check if a table row fits on page; otherwise add new page
  const ensureSpace = (requiredHeight: number) => {
    if (y + requiredHeight > pageHeight - 35) {
      doc.addPage();
      y = drawPageHeader();
      y += 4;
    }
  };

  // --- REPUESTOS TABLE ---
  if (repuestos.length > 0) {
    ensureSpace(24);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Repuestos', margin, y);
    y += 3.5;

    // Table Header: Foto | Repuesto | Cantidad | Precio | Subtotal
    const colFotoX = margin;
    const colFotoW = 16;
    const colRepuestoX = margin + colFotoW;
    const colRepuestoW = 88;
    const colCantX = colRepuestoX + colRepuestoW;
    const colCantW = 20;
    const colPrecioX = colCantX + colCantW;
    const colPrecioW = 26;
    const colSubtotalX = colPrecioX + colPrecioW;
    const colSubtotalW = 30;

    // Header Background
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, 6.5, 'FD');

    // Header Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Foto', colFotoX + colFotoW / 2, y + 4.3, { align: 'center' });
    doc.text('Repuesto', colRepuestoX + 2, y + 4.3);
    doc.text('Cantidad', colCantX + colCantW / 2, y + 4.3, { align: 'center' });
    doc.text('Precio', colPrecioX + colPrecioW - 2, y + 4.3, { align: 'right' });
    doc.text('Subtotal', colSubtotalX + colSubtotalW - 2, y + 4.3, { align: 'right' });

    y += 6.5;

    let repuestosSubtotal = 0;

    repuestos.forEach((item) => {
      const rowHeight = 11.5;
      ensureSpace(rowHeight);

      const itemTotal = item.unitPrice * item.quantity;
      repuestosSubtotal += itemTotal;

      // Outer row border
      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, contentWidth, rowHeight, 'S');

      // Vertical separators
      doc.line(colRepuestoX, y, colRepuestoX, y + rowHeight);
      doc.line(colCantX, y, colCantX, y + rowHeight);
      doc.line(colPrecioX, y, colPrecioX, y + rowHeight);
      doc.line(colSubtotalX, y, colSubtotalX, y + rowHeight);

      // Foto column: thumbnail
      const thumbSize = 8.5;
      const thumbX = colFotoX + (colFotoW - thumbSize) / 2;
      const thumbY = y + (rowHeight - thumbSize) / 2;
      drawProductThumbnailPlaceholder(doc, thumbX, thumbY, thumbSize, false);

      // Repuesto name
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      const nameLines: string[] = doc.splitTextToSize((item.name || '').toUpperCase(), colRepuestoW - 4);
      doc.text(nameLines[0] || '', colRepuestoX + 2, y + 5);
      if (item.sku || nameLines.length > 1) {
        doc.setFontSize(6.5);
        doc.setTextColor(100, 116, 139);
        const secondLine = nameLines.length > 1 ? nameLines[1] : `SKU: ${item.sku}`;
        doc.text(secondLine, colRepuestoX + 2, y + 8.5);
      }

      // Cantidad
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(8);
      doc.setTextColor(15, 23, 42);
      doc.text(item.quantity.toString(), colCantX + colCantW / 2, y + 6.8, { align: 'center' });

      // Precio
      doc.text(formatUSD(item.unitPrice), colPrecioX + colPrecioW - 2, y + 6.8, { align: 'right' });

      // Subtotal
      doc.setFont('helvetica', 'bold');
      doc.text(formatUSD(itemTotal), colSubtotalX + colSubtotalW - 2, y + 6.8, { align: 'right' });

      y += rowHeight;
    });

    // Subtotal Row for Repuestos
    ensureSpace(7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('Subtotal', colPrecioX + colPrecioW - 2, y + 4.5, { align: 'right' });
    doc.text(formatUSD(repuestosSubtotal), colSubtotalX + colSubtotalW - 2, y + 4.5, { align: 'right' });
    y += 7;
  }

  // --- SERVICIOS TABLE (if any services exist) ---
  if (servicios.length > 0) {
    ensureSpace(22);
    y += 2;
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(10);
    doc.setTextColor(15, 23, 42);
    doc.text('Servicios', margin, y);
    y += 3.5;

    const colServicioX = margin;
    const colServicioW = 104;
    const colCantX = colServicioX + colServicioW;
    const colCantW = 20;
    const colPrecioX = colCantX + colCantW;
    const colPrecioW = 26;
    const colSubtotalX = colPrecioX + colPrecioW;
    const colSubtotalW = 30;

    // Header Background
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, 6.5, 'FD');

    // Header Text
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text('Servicio', colServicioX + 3, y + 4.3);
    doc.text('Cantidad', colCantX + colCantW / 2, y + 4.3, { align: 'center' });
    doc.text('Precio', colPrecioX + colPrecioW - 2, y + 4.3, { align: 'right' });
    doc.text('Subtotal', colSubtotalX + colSubtotalW - 2, y + 4.3, { align: 'right' });

    y += 6.5;

    let serviciosSubtotal = 0;

    servicios.forEach((srv) => {
      const rowHeight = 9;
      ensureSpace(rowHeight);

      const srvTotal = srv.unitPrice * srv.quantity;
      serviciosSubtotal += srvTotal;

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, contentWidth, rowHeight, 'S');

      doc.line(colCantX, y, colCantX, y + rowHeight);
      doc.line(colPrecioX, y, colPrecioX, y + rowHeight);
      doc.line(colSubtotalX, y, colSubtotalX, y + rowHeight);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.5);
      doc.setTextColor(15, 23, 42);
      const srvLines: string[] = doc.splitTextToSize((srv.name || 'Mano de obra').toUpperCase(), colServicioW - 4);
      doc.text(srvLines[0] || '', colServicioX + 3, y + 5.5);

      doc.text(srv.quantity.toString(), colCantX + colCantW / 2, y + 5.5, { align: 'center' });
      doc.text(formatUSD(srv.unitPrice), colPrecioX + colPrecioW - 2, y + 5.5, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(formatUSD(srvTotal), colSubtotalX + colSubtotalW - 2, y + 5.5, { align: 'right' });

      y += rowHeight;
    });

    ensureSpace(7);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.text('Subtotal', colPrecioX + colPrecioW - 2, y + 4.5, { align: 'right' });
    doc.text(formatUSD(serviciosSubtotal), colSubtotalX + colSubtotalW - 2, y + 4.5, { align: 'right' });
    y += 7;
  }

  // --- TOTAL SUMMARY ---
  ensureSpace(28);
  y += 3;
  const totalsRightX = margin + contentWidth;

  // Optional Discount
  if (sale.discount > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(16, 185, 129); // emerald-500
    doc.text(`Descuento: -${formatUSD(sale.discount)}`, totalsRightX, y, { align: 'right' });
    y += 4.5;
  }

  // Optional MercadoLibre Surcharge
  if (isMercadoLibre && (sale.mercadolibreCommissionUSD || 0) > 0) {
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(161, 98, 7); // yellow-700
    doc.text(`Recargo MercadoLibre (Adicional): +${formatUSD(sale.mercadolibreCommissionUSD || 0)}`, totalsRightX, y, { align: 'right' });
    y += 4.5;
  }

  // Grand Total in USD
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(15, 23, 42);
  doc.text(`Total: ${formatUSD(sale.total)}`, totalsRightX, y, { align: 'right' });
  y += 5.5;

  // Bolívares at official BCV rate
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(5, 150, 105); // emerald-600
  doc.text(
    `Total en Bolívares: ${formatBs(totalBs)} (Tasa BCV: Bs. ${rate.toFixed(2)})`,
    totalsRightX,
    y,
    { align: 'right' }
  );

  y += 8;

  // --- PAYMENT DATA CONDITION (CRITICAL USER REQUIREMENT) ---
  // "Y quiero que los datos para el pago y el monto le llegue solo a los clientes que estan comprando a credito con una nota de credito, a los que compran decontado les llegue solo la factura de compra."
  if (isApartado) {
    // SISTEMA DE APARTADO: Reserva, abono inicial, saldo para retirar y datos bancarios
    const paidUSD = sale.creditPaidAmount || 0;
    const paidBs =
      sale.creditPayments && sale.creditPayments.length > 0
        ? paidUSD * rate
        : sale.creditPaidAmountBs || paidUSD * rate;
    const initialIsBs =
      (!sale.creditPayments || sale.creditPayments.length === 0) &&
      (sale.creditInitialPaymentCurrency === 'BS' ||
        (!sale.creditInitialPaymentCurrency &&
          (sale.paymentMethod === 'Pago Móvil' ||
            sale.paymentMethod === 'Punto de Venta (Bs)' ||
            sale.paymentMethod === 'Transferencia Bancaria Bs')));
    const abonoPdfText =
      paidUSD > 0
        ? initialIsBs
          ? ` | Abono: -${formatBs(paidBs)} (${formatUSD(paidUSD)})`
          : ` | Abono: -${formatUSD(paidUSD)} (${formatBs(paidBs)})`
        : '';

    ensureSpace(34);
    const boxHeight = 28;
    doc.setFillColor(238, 242, 255); // indigo-50
    doc.setDrawColor(99, 102, 241); // indigo-500
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(55, 48, 163); // indigo-800
    doc.text('CONDICIONES DEL SISTEMA DE APARTADO Y DATOS DE PAGO:', margin + 4, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(49, 46, 129); // indigo-900
    doc.text(`• Plazo de Reserva: ${sale.creditDays || 15} días  ·  Retirar antes: ${sale.creditDueDate || 'A convenir'}`, margin + 4, y + 9.5);
    doc.text(`• Total: ${formatUSD(sale.total)}${abonoPdfText}`, margin + 4, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(67, 56, 202); // indigo-700
    doc.text(`• SALDO PARA RETIRAR: ${formatUSD(pendingBalanceUSD)} (${formatBs(pendingBalanceBs)} a tasa BCV)`, margin + 4, y + 19);

    const rightColX = margin + 100;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(49, 46, 129);
    doc.text(`• Pago Móvil: ${settings.bankDetails.pagoMovilBank}`, rightColX, y + 9.5);
    doc.text(`  Tel: ${settings.bankDetails.pagoMovilPhone} | RIF: ${settings.bankDetails.pagoMovilId}`, rightColX, y + 13.5);
    doc.text(`• Transferencia: ${settings.bankDetails.bankTransferName} (Cta: ${settings.bankDetails.bankTransferAccount})`, rightColX, y + 17.5);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(55, 48, 163);
    doc.text(`Por favor reportar sus abonos al WhatsApp ${settings.whatsapp || settings.phone} para retirar su mercancía.`, margin + 4, y + 24.5);

    y += boxHeight + 6;
  } else if (isCredit) {
    // VENTA A CRÉDITO: SÍ se muestran los datos para el pago, nota de crédito y saldo pendiente
    const paidUSD = sale.creditPaidAmount || 0;
    const paidBs =
      sale.creditPayments && sale.creditPayments.length > 0
        ? paidUSD * rate
        : sale.creditPaidAmountBs || paidUSD * rate;
    const initialIsBs =
      (!sale.creditPayments || sale.creditPayments.length === 0) &&
      (sale.creditInitialPaymentCurrency === 'BS' ||
        (!sale.creditInitialPaymentCurrency &&
          (sale.paymentMethod === 'Pago Móvil' ||
            sale.paymentMethod === 'Punto de Venta (Bs)' ||
            sale.paymentMethod === 'Transferencia Bancaria Bs')));
    const abonoPdfText =
      paidUSD > 0
        ? initialIsBs
          ? ` | Abono: -${formatBs(paidBs)} (${formatUSD(paidUSD)})`
          : ` | Abono: -${formatUSD(paidUSD)} (${formatBs(paidBs)})`
        : '';

    ensureSpace(34);
    const boxHeight = 28;
    doc.setFillColor(254, 243, 199); // amber-100/50
    doc.setDrawColor(245, 158, 11); // amber-500
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');

    // Title Badge
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(146, 64, 14); // amber-800
    doc.text('CONDICIONES DE PAGO Y DATOS BANCARIOS (VENTA A CRÉDITO):', margin + 4, y + 5);

    // Left Col: Financials & Balance
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(120, 53, 15);
    doc.text(`• Plazo de Crédito: ${sale.creditDays || 15} días  ·  Fecha Límite: ${sale.creditDueDate || 'A convenir'}`, margin + 4, y + 9.5);
    doc.text(`• Total: ${formatUSD(sale.total)}${abonoPdfText}`, margin + 4, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(180, 83, 9);
    doc.text(`• SALDO PENDIENTE: ${formatUSD(pendingBalanceUSD)} (${formatBs(pendingBalanceBs)} a tasa BCV)`, margin + 4, y + 19);

    // Right Col / Details: Pago Móvil & Accounts
    const rightColX = margin + 100;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 53, 15);
    doc.text(`• Pago Móvil: ${settings.bankDetails.pagoMovilBank}`, rightColX, y + 9.5);
    doc.text(`  Tel: ${settings.bankDetails.pagoMovilPhone} | RIF: ${settings.bankDetails.pagoMovilId}`, rightColX, y + 13.5);
    doc.text(`• Transferencia: ${settings.bankDetails.bankTransferName} (Cta: ${settings.bankDetails.bankTransferAccount})`, rightColX, y + 17.5);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(146, 64, 14);
    doc.text(`Por favor reportar el comprobante de pago al WhatsApp ${settings.whatsapp || settings.phone}`, margin + 4, y + 24.5);

    y += boxHeight + 6;
  } else if (isMixtoWithCredit && sale.creditStatus !== 'PAGADO' && pendingBalanceUSD > 0.01) {
    // VENTA CON PAGO MIXTO (CONTADO + CRÉDITO): Mostrar desglose, saldo pendiente y datos bancarios para pagar el resto
    const splits = sale.paymentSplits || [];
    const splitsBlockH = splits.length * 4;
    const boxHeight = 28 + splitsBlockH;
    ensureSpace(boxHeight + 6);
    doc.setFillColor(254, 243, 199); // amber-100/50
    doc.setDrawColor(245, 158, 11); // amber-500
    doc.setLineWidth(0.4);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.2);
    doc.setTextColor(146, 64, 14); // amber-800
    doc.text('PAGO MIXTO (CONTADO + CRÉDITO) - DESGLOSE Y DATOS PARA EL SALDO:', margin + 4, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(120, 53, 15);
    let splitY = y + 9.2;
    splits.forEach((sp, idx) => {
      const spBs = sp.amountBs || sp.amountUSD * rate;
      const isBsMethod =
        sp.splitType !== 'CREDITO' &&
        (sp.paymentMethod === 'Pago Móvil' ||
          sp.paymentMethod === 'Punto de Venta (Bs)' ||
          sp.paymentMethod === 'Transferencia Bancaria Bs');
      const refPart = sp.reference ? ` · Ref: ${sp.reference}` : '';
      const label = sp.splitType === 'CREDITO' ? 'A Crédito (Por Cobrar)' : `De Contado - ${sp.paymentMethod}`;
      const amountLabel = isBsMethod
        ? `${formatBs(spBs)} (Equiv. ${formatUSD(sp.amountUSD)} BCV)`
        : `${formatUSD(sp.amountUSD)} (${formatBs(spBs)})`;
      doc.text(
        `${idx + 1}. ${label}: ${amountLabel}${refPart}`,
        margin + 4,
        splitY
      );
      splitY += 4;
    });

    const infoY = splitY + 1.5;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(120, 53, 15);
    doc.text(`• Plazo Crédito: ${sale.creditDays || 15} días · Vence: ${sale.creditDueDate || 'A convenir'}`, margin + 4, infoY);
    doc.text(`• Pagado / Abonado: ${formatUSD(sale.creditPaidAmount || 0)} de ${formatUSD(sale.total)}`, margin + 4, infoY + 4.2);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(180, 83, 9);
    doc.text(`• SALDO PENDIENTE: ${formatUSD(pendingBalanceUSD)} (${formatBs(pendingBalanceBs)} BCV)`, margin + 4, infoY + 9);

    const rightColX = margin + 100;
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.3);
    doc.setTextColor(120, 53, 15);
    doc.text(`• Pago Móvil: ${settings.bankDetails.pagoMovilBank}`, rightColX, infoY);
    doc.text(`  Tel: ${settings.bankDetails.pagoMovilPhone} | RIF: ${settings.bankDetails.pagoMovilId}`, rightColX, infoY + 4);
    doc.text(`• Transferencia: ${settings.bankDetails.bankTransferName} (Cta: ${settings.bankDetails.bankTransferAccount})`, rightColX, infoY + 8);

    doc.setFont('helvetica', 'italic');
    doc.setFontSize(7);
    doc.setTextColor(146, 64, 14);
    doc.text(`Por favor reportar el pago del saldo al WhatsApp ${settings.whatsapp || settings.phone}`, margin + 4, infoY + 14.2);

    y += boxHeight + 6;
  } else if (isMixto) {
    // VENTA CON PAGO MIXTO (100% PAGADO): Mostrar confirmación de pago completo + desglose
    const splits = sale.paymentSplits || [];
    const boxHeight = 11 + splits.length * 4.2;
    ensureSpace(boxHeight + 6);
    doc.setFillColor(240, 253, 250); // teal-50
    doc.setDrawColor(94, 234, 212); // teal-300
    doc.setLineWidth(0.35);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(15, 118, 110); // teal-700
    doc.text('✓ COMPROBANTE DE COMPRA (PAGO MIXTO) - CANCELADO EN SU TOTALIDAD', margin + 4, y + 4.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(51, 65, 85); // slate-700
    let splitY = y + 9.2;
    splits.forEach((sp, idx) => {
      const spBs = sp.amountBs || sp.amountUSD * rate;
      const isBsMethod =
        sp.splitType !== 'CREDITO' &&
        (sp.paymentMethod === 'Pago Móvil' ||
          sp.paymentMethod === 'Punto de Venta (Bs)' ||
          sp.paymentMethod === 'Transferencia Bancaria Bs');
      const refPart = sp.reference ? ` · Ref: ${sp.reference}` : '';
      const label = sp.splitType === 'CREDITO' ? 'Parte a Crédito (Liquidada)' : sp.paymentMethod;
      const amountLabel = isBsMethod
        ? `${formatBs(spBs)} (Equiv. ${formatUSD(sp.amountUSD)} BCV)`
        : `${formatUSD(sp.amountUSD)} (${formatBs(spBs)})`;
      doc.text(
        `${idx + 1}. ${label}: ${amountLabel}${refPart}`,
        margin + 4,
        splitY
      );
      splitY += 4.2;
    });

    y += boxHeight + 6;
  } else {
    // VENTA DE CONTADO O MERCADOLIBRE: NO se muestran coordenadas bancarias ni deudas.
    // Solo se muestra confirmación de compra cancelada en su totalidad.
    ensureSpace(14);
    const boxHeight = 11;
    doc.setFillColor(248, 250, 252); // slate-50
    doc.setDrawColor(203, 213, 225); // slate-300
    doc.setLineWidth(0.3);
    doc.roundedRect(margin, y, contentWidth, boxHeight, 1.5, 1.5, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8);
    doc.setTextColor(5, 150, 105); // emerald-600
    doc.text('✓ COMPROBANTE DE COMPRA DE CONTADO - CANCELADO EN SU TOTALIDAD', margin + 4, y + 4.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(71, 85, 105);
    const methodStr = isMercadoLibre
      ? 'Canal de Venta: MercadoLibre (Mercado Pago)'
      : `Método de Pago: ${sale.paymentMethod || 'Pago Móvil / Divisas'}`;
    doc.text(`${methodStr}  ·  ¡Muchas gracias por su compra y preferencia!`, margin + 4, y + 8.5);

    y += boxHeight + 6;
  }

  // --- PROMINENT ONLINE STORE PROMO BANNER (CALL TO ACTION + CLICKABLE LINK + QR) ---
  const storeUrl = `${getPublicAppOrigin().replace(/\/+$/, '')}/`;
  const storeBannerHeight = 32;
  ensureSpace(storeBannerHeight + 22);

  // Dark slate background card with thick amber frame
  doc.setFillColor(15, 23, 42); // slate-900
  doc.setDrawColor(245, 158, 11); // amber-500
  doc.setLineWidth(1.1);
  doc.roundedRect(margin, y, contentWidth, storeBannerHeight, 2.5, 2.5, 'FD');

  // Top amber ribbon inside card
  doc.setFillColor(245, 158, 11);
  doc.rect(margin + 0.5, y + 0.5, contentWidth - 1, 5.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  const storeBrandUpper = (settings.onlineStoreName || 'MERCADO MOTO CC').toUpperCase();
  doc.text(
    `${storeBrandUpper} · TIENDA ONLINE OFICIAL · STOCK EN TIEMPO REAL`,
    margin + 4,
    y + 4.3
  );

  // Big inviting headline
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(255, 255, 255);
  doc.text('¡ENTRA EN NUESTRA TIENDA PARA MÁS REPUESTOS Y OFERTAS!', margin + 4, y + 12.2);

  // Subtitle
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(203, 213, 225); // slate-300
  doc.text(
    'Explora todo el catálogo, precios a tasa BCV y consulta tus cuentas pendientes aquí:',
    margin + 4,
    y + 17.2
  );

  // Large bright amber URL button box
  const urlBtnX = margin + 4;
  const urlBtnY = y + 19.5;
  const urlBtnW = contentWidth - 36;
  const urlBtnH = 9.5;
  doc.setFillColor(245, 158, 11); // amber-500
  doc.roundedRect(urlBtnX, urlBtnY, urlBtnW, urlBtnH, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(storeUrl, urlBtnX + urlBtnW / 2, urlBtnY + 6.4, { align: 'center' });

  // QR Code on the right inside banner
  const bannerQrSize = 20;
  const bannerQrX = margin + contentWidth - bannerQrSize - 5.5;
  const bannerQrY = y + 7.5;
  doc.setFillColor(255, 255, 255);
  doc.roundedRect(bannerQrX - 1.5, bannerQrY - 1, bannerQrSize + 3, bannerQrSize + 2, 1, 1, 'F');
  drawVectorQRCode(doc, storeUrl, bannerQrX, bannerQrY, bannerQrSize);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(5.8);
  doc.setTextColor(251, 191, 36); // amber-400
  doc.text('ESCANEA Y ENTRA', bannerQrX + bannerQrSize / 2, y + 30.8, { align: 'center' });

  // Make the entire banner clickable in PDF viewers
  doc.link(margin, y, contentWidth, storeBannerHeight, { url: storeUrl });

  y += storeBannerHeight + 5;

  // --- LEGAL NOTICE (EXACT MATCH FROM SAMPLE) ---
  ensureSpace(18);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105); // slate-500
  doc.text('Nota Legal:', pageWidth / 2, y, { align: 'center' });

  y += 3.5;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(100, 116, 139); // slate-500
  const legalText =
    'Este documento tiene fines administrativos internos. No constituye documento ni comprobante fiscal según las disposiciones del SENIAT. El taller emisor es responsable de emitir el documento fiscal correspondiente al servicio o venta realizada.';
  const legalLines: string[] = doc.splitTextToSize(legalText, contentWidth - 10);
  doc.text(legalLines, pageWidth / 2, y, { align: 'center' });

  return doc;
}

/**
 * Descarga directamente el archivo PDF de la factura al dispositivo
 */
export function downloadInvoicePDF(
  sale: Sale,
  settings: BusinessSettings,
  products?: Product[]
): void {
  const doc = generateInvoicePDF(sale, settings, products);
  const isCredit = sale.paymentType === 'CREDITO';
  const isApartado = sale.paymentType === 'APARTADO';
  const prefix = isApartado
    ? 'Comprobante_Apartado'
    : isCredit
    ? 'Nota_Credito'
    : 'Factura_Compra';
  const fileName = `${prefix}_${sale.invoiceNumber}_MotoCristoc.pdf`;
  doc.save(fileName);
}

/**
 * Retorna el PDF en formato Blob para compartir o adjuntar
 */
export function getInvoicePDFBlob(
  sale: Sale,
  settings: BusinessSettings,
  products?: Product[]
): Blob {
  const doc = generateInvoicePDF(sale, settings, products);
  return doc.output('blob');
}

interface LoadedImageInfo {
  dataUrl: string;
  width: number;
  height: number;
}

async function loadImageAsDataUrl(url: string): Promise<LoadedImageInfo | null> {
  if (typeof window === 'undefined' || !url) return null;

  const tryLoad = (src: string): Promise<LoadedImageInfo | null> =>
    new Promise((resolve) => {
      const img = new Image();
      img.crossOrigin = 'anonymous';
      img.onload = () => {
        try {
          const canvas = document.createElement('canvas');
          canvas.width = img.naturalWidth || img.width || 600;
          canvas.height = img.naturalHeight || img.height || 750;
          const ctx = canvas.getContext('2d');
          if (!ctx) {
            resolve(null);
            return;
          }
          ctx.fillStyle = '#FFFFFF';
          ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve({
            dataUrl: canvas.toDataURL('image/jpeg', 0.92),
            width: canvas.width,
            height: canvas.height,
          });
        } catch {
          resolve(null);
        }
      };
      img.onerror = () => resolve(null);
      img.src = src;
    });

  const primary = await tryLoad(url);
  if (primary) return primary;

  if (url !== '/assets/pagomovil_qr.jpeg') {
    return tryLoad('/assets/pagomovil_qr.jpeg');
  }
  return null;
}

/**
 * Genera el documento PDF de Factura de Orden de Servicio de Taller (culminada / lista para entrega),
 * detallando lo realizado a la moto, servicios, repuestos, datos bancarios para el pago y el QR de Pago Móvil.
 */
export async function generateServiceOrderInvoicePDF(
  order: ServiceOrder,
  settings: BusinessSettings
): Promise<jsPDF> {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const rate = order.bcvRate || settings.bcvRate;
  const totalCost = Number(order.totalCost || 0);
  const totalBs = order.totalCostBs || totalCost * rate;

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2; // 180mm

  const commercialName = settings.commercialName || settings.name || 'Servimotos Cristo Centro';
  const cleanPhone = (settings.whatsapp || settings.phone || '04127860509').replace(/[^\d]/g, '');
  const waPhone = cleanPhone.startsWith('58') ? cleanPhone : `58${cleanPhone.replace(/^0/, '')}`;
  const qrContactUrl = `https://wa.me/${waPhone}`;

  // Preload official PagoMóvil QR image
  const qrImageUrl = settings.bankDetails.pagoMovilQrUrl || '/assets/pagomovil_qr.jpeg';
  const loadedQrImage = await loadImageAsDataUrl(qrImageUrl);

  const drawPageHeader = (): number => {
    const headerY = 14;

    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(commercialName, margin, headerY + 4);

    doc.setFillColor(245, 158, 11);
    doc.circle(margin + doc.getTextWidth(commercialName) + 2.5, headerY + 2.5, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`RIF: ${settings.rif || 'V-19996141-8'}`, margin, headerY + 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const addressStr =
      settings.address ||
      'Calle Kennedy con calle 2 de Campo de Oro casa #1-23. Frente a la torre 5 de, Mérida 5101, Mérida';
    const addressLines: string[] = doc.splitTextToSize(addressStr, 115);
    doc.text(addressLines, margin, headerY + 13.5);

    const contactY = headerY + 13.5 + addressLines.length * 3.5;
    doc.text(`Tel / WhatsApp: ${settings.phone || '0412-7860509'}`, margin, contactY);
    doc.text(settings.email || 'SERVIMOTOSCRISTOCENTRO@gmail.com', margin, contactY + 3.8);

    // Top-right small WhatsApp contact QR
    const smallQrSize = 20;
    const smallQrX = pageWidth - margin - smallQrSize;
    drawVectorQRCode(doc, qrContactUrl, smallQrX, headerY, smallQrSize);
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(5.8);
    doc.setTextColor(100, 116, 139);
    doc.text('WhatsApp Taller', smallQrX + smallQrSize / 2, headerY + smallQrSize + 3, { align: 'center' });

    const dividerY = Math.max(headerY + smallQrSize + 5.5, contactY + 7);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(margin, dividerY, margin + contentWidth, dividerY);

    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.9);
    doc.line(margin, dividerY, margin + 32, dividerY);

    return dividerY + 5;
  };

  let y = drawPageHeader();

  const ensureSpace = (requiredHeight: number) => {
    if (y + requiredHeight > pageHeight - 20) {
      doc.addPage();
      y = drawPageHeader();
      y += 2;
    }
  };

  // --- DOCUMENT TITLE & STATUS BANNER ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12);
  doc.setTextColor(15, 23, 42);
  doc.text(`FACTURA DE SERVICIO DE TALLER #${order.orderNumber}`, pageWidth / 2, y + 1, { align: 'center' });

  y += 5;
  const statusLabel =
    order.status === 'CULMINADA'
      ? 'ORDEN CULMINADA · LISTA PARA ENTREGA Y PAGO'
      : order.status === 'ENTREGADA'
      ? 'ORDEN CULMINADA Y ENTREGADA'
      : order.status === 'EN_PROCESO'
      ? 'SERVICIO EN PROCESO'
      : 'ORDEN REGISTRADA EN TALLER';

  doc.setFillColor(236, 253, 245); // emerald-50
  doc.setDrawColor(16, 185, 129); // emerald-500
  doc.setLineWidth(0.3);
  doc.roundedRect(margin + 35, y - 3, contentWidth - 70, 5.5, 1.5, 1.5, 'FD');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(4, 120, 87); // emerald-700
  doc.text(statusLabel, pageWidth / 2, y + 0.7, { align: 'center' });

  y += 7;

  // --- CUSTOMER & MOTORCYCLE INFO GRID ---
  const infoBoxHeight = 27;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, infoBoxHeight, 1.5, 1.5, 'FD');

  const midX = margin + contentWidth / 2;
  doc.line(midX, y + 2, midX, y + infoBoxHeight - 2);

  // Left: Cliente
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(180, 83, 9);
  doc.text('DATOS DEL CLIENTE', margin + 3.5, y + 4.5);

  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.text('Cliente:', margin + 3.5, y + 9.5);
  doc.setFont('helvetica', 'normal');
  doc.text(doc.splitTextToSize(order.customerName || 'Cliente', 66)[0] || '', margin + 21, y + 9.5);

  doc.setFont('helvetica', 'bold');
  doc.text('C.I. / RIF:', margin + 3.5, y + 14);
  doc.setFont('helvetica', 'normal');
  doc.text(order.customerDocument || 'No registrada', margin + 21, y + 14);

  doc.setFont('helvetica', 'bold');
  doc.text('WhatsApp:', margin + 3.5, y + 18.5);
  doc.setFont('helvetica', 'normal');
  doc.text(order.customerPhone || 'No registrado', margin + 21, y + 18.5);

  const formattedDate = new Date(order.updatedAt || order.createdAt).toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
  doc.setFont('helvetica', 'bold');
  doc.text('Emisión:', margin + 3.5, y + 23);
  doc.setFont('helvetica', 'normal');
  doc.text(`${formattedDate} · Tasa BCV: Bs. ${rate.toFixed(2)}`, margin + 21, y + 23);

  // Right: Motocicleta o Asiento
  const isSeatOrder = order.entryType === 'ASIENTO';
  const rightInfoX = midX + 3.5;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.5);
  doc.setTextColor(isSeatOrder ? 109 : 180, isSeatOrder ? 40 : 83, isSeatOrder ? 217 : 9);
  doc.text(isSeatOrder ? 'FICHA DE INGRESO DE ASIENTO' : 'FICHA DE LA MOTOCICLETA', rightInfoX, y + 4.5);

  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  if (isSeatOrder) {
    doc.setFont('helvetica', 'bold');
    doc.text('Ingreso:', rightInfoX, y + 9.5);
    doc.setFont('helvetica', 'normal');
    doc.text('Asiento de Motocicleta (Tapicería)', rightInfoX + 16, y + 9.5);

    doc.setFont('helvetica', 'bold');
    doc.text('Modelo:', rightInfoX, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(doc.splitTextToSize(order.motorcycle.model || 'N/A', 66)[0] || '', rightInfoX + 16, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.text('Fotos:', rightInfoX, y + 18.5);
    doc.setFont('helvetica', 'normal');
    const photoSummary = `${order.seatIntakePhoto ? 'Recibo ✓' : 'Sin recibo'} · ${
      order.seatDeliveryPhoto ? 'Entrega ✓' : 'Entrega pendiente'
    }`;
    doc.text(photoSummary, rightInfoX + 16, y + 18.5);
  } else {
    doc.setFont('helvetica', 'bold');
    doc.text('Moto:', rightInfoX, y + 9.5);
    doc.setFont('helvetica', 'normal');
    const motoLabel = `${order.motorcycle.brand} ${order.motorcycle.model}${order.motorcycle.year ? ` (${order.motorcycle.year})` : ''}`;
    doc.text(doc.splitTextToSize(motoLabel, 66)[0] || '', rightInfoX + 16, y + 9.5);

    doc.setFont('helvetica', 'bold');
    doc.text('Placa:', rightInfoX, y + 14);
    doc.setFont('helvetica', 'bold');
    doc.text(`${(order.motorcycle.plate || '').toUpperCase()}`, rightInfoX + 16, y + 14);
    doc.setFont('helvetica', 'normal');
    doc.text(`· Color: ${order.motorcycle.color || 'N/A'}`, rightInfoX + 36, y + 14);

    doc.setFont('helvetica', 'bold');
    doc.text('Km / Gas:', rightInfoX, y + 18.5);
    doc.setFont('helvetica', 'normal');
    doc.text(
      `${(order.motorcycle.mileage || 0).toLocaleString()} km · Gasolina: ${order.fuelLevel || '1/2'}`,
      rightInfoX + 16,
      y + 18.5
    );
  }

  doc.setFont('helvetica', 'bold');
  doc.text('Servicio:', rightInfoX, y + 23);
  doc.setFont('helvetica', 'normal');
  const techText = order.assignedTechnician ? ` · Téc: ${order.assignedTechnician}` : '';
  doc.text(doc.splitTextToSize(`${order.serviceType}${techText}`, 68)[0] || '', rightInfoX + 16, y + 23);

  y += infoBoxHeight + 5;

  // --- QUÉ SE LE HIZO A LA MOTO / ASIENTO (REPORTE Y DIAGNÓSTICO) ---
  const issueLines: string[] = doc.splitTextToSize(order.reportedIssue || 'Revisión y servicio técnico general.', contentWidth - 8);
  const diagLines: string[] = order.diagnosis
    ? doc.splitTextToSize(order.diagnosis, contentWidth - 8)
    : [];
  const workBoxHeight =
    9 +
    issueLines.length * 3.8 +
    (diagLines.length > 0 ? 5.5 + diagLines.length * 3.8 : 0) +
    3;

  ensureSpace(workBoxHeight + 4);
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, workBoxHeight, 1.5, 1.5, 'FD');

  let workY = y + 4.8;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text(
    isSeatOrder ? 'TRABAJO POR HACER / REALIZADO EN EL ASIENTO:' : 'TRABAJO REALIZADO Y DIAGNÓSTICO DE LA MOTOCICLETA:',
    margin + 4,
    workY
  );

  workY += 4.2;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.3);
  doc.setTextColor(71, 85, 105);
  doc.text('Solicitud / Motivo:', margin + 4, workY);
  workY += 3.6;
  doc.setFont('helvetica', 'normal');
  doc.setTextColor(15, 23, 42);
  doc.text(issueLines, margin + 4, workY);
  workY += issueLines.length * 3.8;

  if (diagLines.length > 0) {
    workY += 1.5;
    doc.setFont('helvetica', 'bold');
    doc.setTextColor(71, 85, 105);
    doc.text('Diagnóstico y Detalles Realizados:', margin + 4, workY);
    workY += 3.6;
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(15, 23, 42);
    doc.text(diagLines, margin + 4, workY);
  }

  y += workBoxHeight + 5;

  // --- SERVICIOS Y MANO DE OBRA REALIZADOS ---
  const serviceRows: { name: string; technician: string; cost: number }[] =
    order.servicesList && order.servicesList.length > 0
      ? order.servicesList.map((s) => ({
          name: s.name,
          technician: s.technician || order.assignedTechnician || 'Taller',
          cost: Number(s.cost || 0),
        }))
      : [
          {
            name: `Mano de Obra (${order.serviceType})`,
            technician: order.assignedTechnician || 'Taller',
            cost: Number(order.laborCost || 0),
          },
        ];

  const colSrvNameX = margin;
  const colSrvNameW = 94;
  const colSrvTechX = colSrvNameX + colSrvNameW;
  const colSrvTechW = 36;
  const colSrvUsdX = colSrvTechX + colSrvTechW;
  const colSrvUsdW = 24;
  const colSrvBsX = colSrvUsdX + colSrvUsdW;
  const colSrvBsW = 26;

  ensureSpace(20);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(15, 23, 42);
  doc.text('Servicios y Mano de Obra Realizados', margin, y);
  y += 3;

  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.rect(margin, y, contentWidth, 6, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(15, 23, 42);
  doc.text('Descripción del Trabajo', colSrvNameX + 2.5, y + 4);
  doc.text('Técnico', colSrvTechX + 2, y + 4);
  doc.text('Monto ($)', colSrvUsdX + colSrvUsdW - 2, y + 4, { align: 'right' });
  doc.text('Equiv. (Bs.)', colSrvBsX + colSrvBsW - 2, y + 4, { align: 'right' });
  y += 6;

  let servicesSubtotal = 0;
  serviceRows.forEach((srv) => {
    const rowH = 7.5;
    ensureSpace(rowH);
    servicesSubtotal += srv.cost;

    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.rect(margin, y, contentWidth, rowH, 'S');
    doc.line(colSrvTechX, y, colSrvTechX, y + rowH);
    doc.line(colSrvUsdX, y, colSrvUsdX, y + rowH);
    doc.line(colSrvBsX, y, colSrvBsX, y + rowH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.4);
    doc.setTextColor(15, 23, 42);
    doc.text(doc.splitTextToSize(srv.name, colSrvNameW - 4)[0] || '', colSrvNameX + 2.5, y + 4.8);
    doc.setTextColor(71, 85, 105);
    doc.text(doc.splitTextToSize(srv.technician, colSrvTechW - 4)[0] || '', colSrvTechX + 2, y + 4.8);

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(15, 23, 42);
    doc.text(formatUSD(srv.cost), colSrvUsdX + colSrvUsdW - 2, y + 4.8, { align: 'right' });
    doc.setFont('helvetica', 'normal');
    doc.setTextColor(5, 150, 105);
    doc.text(formatBs(srv.cost * rate), colSrvBsX + colSrvBsW - 2, y + 4.8, { align: 'right' });

    y += rowH;
  });

  ensureSpace(6);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.6);
  doc.setTextColor(15, 23, 42);
  doc.text('Subtotal Servicios:', colSrvTechX + colSrvTechW - 2, y + 4.2, { align: 'right' });
  doc.text(formatUSD(servicesSubtotal), colSrvUsdX + colSrvUsdW - 2, y + 4.2, { align: 'right' });
  doc.setTextColor(5, 150, 105);
  doc.text(formatBs(servicesSubtotal * rate), colSrvBsX + colSrvBsW - 2, y + 4.2, { align: 'right' });
  y += 7.5;

  // --- REPUESTOS UTILIZADOS ---
  let partsSubtotal = 0;
  if (order.partsUsed && order.partsUsed.length > 0) {
    ensureSpace(20);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(9);
    doc.setTextColor(15, 23, 42);
    doc.text('Repuestos e Insumos Instalados', margin, y);
    y += 3;

    const colPNameX = margin;
    const colPNameW = 104;
    const colPCantX = colPNameX + colPNameW;
    const colPCantW = 20;
    const colPUnitX = colPCantX + colPCantW;
    const colPUnitW = 26;
    const colPTotX = colPUnitX + colPUnitW;
    const colPTotW = 30;

    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.3);
    doc.rect(margin, y, contentWidth, 6, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(15, 23, 42);
    doc.text('Repuesto / Pieza', colPNameX + 2.5, y + 4);
    doc.text('Cant.', colPCantX + colPCantW / 2, y + 4, { align: 'center' });
    doc.text('Precio Unit.', colPUnitX + colPUnitW - 2, y + 4, { align: 'right' });
    doc.text('Subtotal ($)', colPTotX + colPTotW - 2, y + 4, { align: 'right' });
    y += 6;

    order.partsUsed.forEach((part) => {
      const rowH = 8;
      ensureSpace(rowH);
      const lineTotal = part.total ?? part.unitPrice * part.quantity;
      partsSubtotal += lineTotal;

      doc.setDrawColor(226, 232, 240);
      doc.setLineWidth(0.2);
      doc.rect(margin, y, contentWidth, rowH, 'S');
      doc.line(colPCantX, y, colPCantX, y + rowH);
      doc.line(colPUnitX, y, colPUnitX, y + rowH);
      doc.line(colPTotX, y, colPTotX, y + rowH);

      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.4);
      doc.setTextColor(15, 23, 42);
      const label = `${part.name}${part.sku ? ` (${part.sku})` : ''}`;
      doc.text(doc.splitTextToSize(label, colPNameW - 4)[0] || '', colPNameX + 2.5, y + 5.2);

      doc.text(String(part.quantity), colPCantX + colPCantW / 2, y + 5.2, { align: 'center' });
      doc.text(formatUSD(part.unitPrice), colPUnitX + colPUnitW - 2, y + 5.2, { align: 'right' });
      doc.setFont('helvetica', 'bold');
      doc.text(formatUSD(lineTotal), colPTotX + colPTotW - 2, y + 5.2, { align: 'right' });

      y += rowH;
    });

    ensureSpace(6);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.6);
    doc.setTextColor(15, 23, 42);
    doc.text('Subtotal Repuestos:', colPUnitX + colPUnitW - 2, y + 4.2, { align: 'right' });
    doc.text(formatUSD(partsSubtotal), colPTotX + colPTotW - 2, y + 4.2, { align: 'right' });
    y += 7;
  }

  // --- RESUMEN TOTAL A PAGAR ---
  ensureSpace(20);
  const totalsRightX = margin + contentWidth;
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.line(margin + 95, y, totalsRightX, y);
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(12.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`TOTAL A PAGAR: ${formatUSD(totalCost)}`, totalsRightX, y, { align: 'right' });
  y += 5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(9);
  doc.setTextColor(5, 150, 105);
  doc.text(
    `Total en Bolívares: ${formatBs(totalBs)} (Tasa BCV: Bs. ${rate.toFixed(2)})`,
    totalsRightX,
    y,
    { align: 'right' }
  );
  y += 7;

  // --- DATOS PARA REALIZAR EL PAGO + QR OFICIAL PAGO MÓVIL ---
  const paymentBoxHeight = 64;
  ensureSpace(paymentBoxHeight + 14);

  doc.setFillColor(255, 251, 235); // amber-50
  doc.setDrawColor(245, 158, 11); // amber-500
  doc.setLineWidth(0.5);
  doc.roundedRect(margin, y, contentWidth, paymentBoxHeight, 2, 2, 'FD');

  // Payment Header Bar
  doc.setFillColor(15, 23, 42); // slate-900
  doc.roundedRect(margin, y, contentWidth, 7, 2, 2, 'F');
  doc.rect(margin, y + 4, contentWidth, 3, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(251, 191, 36); // amber-400
  doc.text('DATOS PARA REALIZAR EL PAGO · ESCANEA EL QR O USA LAS CUENTAS OFICIALES', margin + 4, y + 4.8);

  const innerY = y + 9.5;
  const qrCardW = 43;
  const qrCardH = 51.5;
  const qrCardX = margin + 4;

  // Left: White card holding official PagoMóvil QR image
  doc.setFillColor(255, 255, 255);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.3);
  doc.roundedRect(qrCardX, innerY, qrCardW, qrCardH, 1.5, 1.5, 'FD');

  if (loadedQrImage) {
    const maxImgW = qrCardW - 3;
    const maxImgH = qrCardH - 6;
    const aspect = loadedQrImage.width / loadedQrImage.height;
    let drawW = maxImgW;
    let drawH = drawW / aspect;
    if (drawH > maxImgH) {
      drawH = maxImgH;
      drawW = drawH * aspect;
    }
    const drawX = qrCardX + (qrCardW - drawW) / 2;
    const drawY = innerY + 1.5;
    doc.addImage(loadedQrImage.dataUrl, 'JPEG', drawX, drawY, drawW, drawH);
  } else {
    drawVectorQRCode(
      doc,
      `PAGOMOVIL|${settings.bankDetails.pagoMovilBank}|${settings.bankDetails.pagoMovilPhone}|${settings.bankDetails.pagoMovilId}|${totalBs.toFixed(2)}`,
      qrCardX + 4.5,
      innerY + 3,
      34
    );
  }

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(6.4);
  doc.setTextColor(15, 23, 42);
  doc.text('Escanea y paga con Pago Móvil', qrCardX + qrCardW / 2, innerY + qrCardH - 1.6, {
    align: 'center',
  });

  // Right: Detailed payment coordinates
  const payTextX = qrCardX + qrCardW + 6;
  let py = innerY + 3.5;

  // Pago Móvil Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(146, 64, 14);
  doc.text('1. PAGO MÓVIL (BANESCO / INTERBANCARIO)', payTextX, py);
  py += 4.3;

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Banco: ${settings.bankDetails.pagoMovilBank || '0134 - Banesco'}   ·   Teléfono: ${settings.bankDetails.pagoMovilPhone || '0412-2242450'}`,
    payTextX,
    py
  );
  py += 4;
  doc.text(
    `C.I. / RIF: ${settings.bankDetails.pagoMovilId || 'V-19996141'}   ·   Titular: ${settings.bankDetails.pagoMovilHolder || commercialName}`,
    payTextX,
    py
  );
  py += 4.2;
  doc.setFont('helvetica', 'bold');
  doc.setTextColor(5, 150, 105);
  doc.text(`Monto exacto a cancelar: ${formatBs(totalBs)}  (${formatUSD(totalCost)})`, payTextX, py);
  py += 6.2;

  // Transferencia Bancaria Block
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(146, 64, 14);
  doc.text('2. TRANSFERENCIA BANCARIA', payTextX, py);
  py += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `${settings.bankDetails.bankTransferName || 'Banesco'} (${settings.bankDetails.bankTransferType || 'Corriente'}) · Cta: ${settings.bankDetails.bankTransferAccount || ''}`,
    payTextX,
    py
  );
  py += 3.8;
  doc.text(
    `Titular: ${settings.bankDetails.bankTransferHolder || commercialName} · RIF: ${settings.bankDetails.bankTransferRif || settings.rif}`,
    payTextX,
    py
  );
  py += 5.8;

  // Otros Métodos
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(146, 64, 14);
  doc.text('3. EFECTIVO DIVISAS ($ USD) / BINANCE PAY', payTextX, py);
  py += 4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(15, 23, 42);
  doc.text(
    `Binance Pay ID: ${settings.bankDetails.binancePayId || '66195935'} · Efectivo USD en taquilla`,
    payTextX,
    py
  );
  py += 5.5;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(180, 83, 9);
  doc.text(
    `Envía el comprobante de pago al WhatsApp ${settings.whatsapp || settings.phone} indicando la orden #${order.orderNumber}.`,
    payTextX,
    py
  );

  y += paymentBoxHeight + 6;

  // --- LEGAL & WARRANTY NOTICE ---
  ensureSpace(15);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(71, 85, 105);
  doc.text('Nota y Garantía de Taller:', pageWidth / 2, y, { align: 'center' });

  y += 3.4;
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(100, 116, 139);
  const warrantyStr =
    settings.invoiceDisclaimer ||
    'Precios fijados en divisas USD y pagaderos en Bolívares a la tasa oficial BCV vigente al momento del pago. Este documento refleja el detalle técnico de servicios y repuestos realizados en taller.';
  const legalLines: string[] = doc.splitTextToSize(warrantyStr, contentWidth - 10);
  doc.text(legalLines, pageWidth / 2, y, { align: 'center' });

  return doc;
}

/**
 * Descarga directamente el archivo PDF de la factura de servicio de taller (culminada)
 */
export async function downloadServiceOrderPDF(
  order: ServiceOrder,
  settings: BusinessSettings
): Promise<void> {
  const doc = await generateServiceOrderInvoicePDF(order, settings);
  const fileName = `Factura_Servicio_${order.orderNumber}_MotoCristoc.pdf`;
  doc.save(fileName);
}

/**
 * Retorna el PDF de la orden de servicio en formato Blob para compartir o adjuntar por WhatsApp
 */
export async function getServiceOrderPDFBlob(
  order: ServiceOrder,
  settings: BusinessSettings
): Promise<Blob> {
  const doc = await generateServiceOrderInvoicePDF(order, settings);
  return doc.output('blob');
}

/**
 * Genera una Factura / Comprobante de Pago de Comisiones en PDF para un Técnico de Taller
 * Incluye detalle de órdenes/trabajos pagados, % aplicado, montos en USD y Bs (Tasa BCV),
 * método/referencia de pago y saldo total pendiente adeudado al técnico tras el abono.
 */
export function generateTechnicianPayoutPDF(
  payout: TechnicianPayout,
  settings: BusinessSettings
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const pageWidth = doc.internal.pageSize.getWidth();
  const pageHeight = doc.internal.pageSize.getHeight();
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  let y = 16;

  const ensureSpace = (neededHeight: number) => {
    if (y + neededHeight > pageHeight - 16) {
      doc.addPage();
      y = 16;
    }
  };

  const commercialName = String(settings?.commercialName || settings?.name || 'MotoCristoc');
  const rif = String(settings?.rif || 'V-19996141-8');
  const bizPhone = String(settings?.phone || settings?.whatsapp || '+584127860509');
  const address = String(settings?.address || '');
  const city = String(settings?.city || '');
  const state = String(settings?.state || '');
  const addressText =
    address && city
      ? address.includes(city)
        ? address
        : `${address}, ${city}${state ? ` - ${state}` : ''}`
      : address || `${city}${state ? ` - ${state}` : ''}` || 'Venezuela';

  const rate = Number(payout?.bcvRate) || Number(settings?.bcvRate) || 1;
  const parsedDate = new Date(payout?.createdAt || Date.now());
  const dateObj = Number.isNaN(parsedDate.getTime()) ? new Date() : parsedDate;
  const formattedDate = `${dateObj.toLocaleDateString('es-VE', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  })} ${dateObj.toLocaleTimeString('es-VE', {
    hour: '2-digit',
    minute: '2-digit',
  })}`;

  const payoutNumber = String(payout?.payoutNumber || 'LIQ-0001');
  const technicianName = String(payout?.technicianName || 'Técnico de Taller');
  const technicianDoc = String(payout?.technicianDocument || 'No registrada');
  const technicianPhone = String(payout?.technicianPhone || 'Sin teléfono');
  const paymentMethod = String(payout?.paymentMethod || 'Dólares Efectivo (USD)');
  const reference = String(payout?.reference || 'Pago directo en taquilla');
  const items = Array.isArray(payout?.commissionItems) ? payout.commissionItems : [];
  const amountUSD = Number(payout?.amountUSD) || 0;
  const amountBs = Number(payout?.amountBs) || amountUSD * rate;
  const remainingDebtUSD = Math.max(0, Number(payout?.remainingDebtUSD) || 0);
  const remainingDebtBs = Math.max(0, Number(payout?.remainingDebtBs) || remainingDebtUSD * rate);

  // --- HEADER ---
  doc.setFillColor(15, 23, 42); // slate-900
  doc.roundedRect(margin, y, 12, 12, 2, 2, 'F');
  doc.setTextColor(245, 158, 11); // amber-500
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.text('MC', margin + 6, y + 8, { align: 'center' });

  doc.setTextColor(15, 23, 42);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13.5);
  doc.text(commercialName, margin + 15, y + 4.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(71, 85, 105);
  doc.text(`RIF: ${rif}   ·   Tel: ${bizPhone}`, margin + 15, y + 9);
  const wrappedAddr: string[] = doc.splitTextToSize(addressText, 92);
  doc.text(wrappedAddr.slice(0, 2), margin + 15, y + 13);

  // Right Box: Document Title & Number
  const docBoxW = 68;
  const docBoxX = pageWidth - margin - docBoxW;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.roundedRect(docBoxX, y - 1, docBoxW, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(5, 150, 105); // emerald-600
  doc.text('FACTURA / LIQUIDACIÓN DE COMISIÓN', docBoxX + docBoxW / 2, y + 3.8, { align: 'center' });

  doc.setFontSize(11.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`#${payoutNumber}`, docBoxX + docBoxW / 2, y + 9.5, { align: 'center' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7);
  doc.setTextColor(100, 116, 139);
  doc.text(formattedDate, docBoxX + docBoxW / 2, y + 14.2, { align: 'center' });

  y += 23;

  // --- TECHNICIAN & PAYMENT INFO ---
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, 24, 2, 2, 'FD');

  const colLeftX = margin + 4;
  const colRightX = margin + contentWidth / 2 + 4;

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(100, 116, 139);
  doc.text('BENEFICIARIO / TÉCNICO DE TALLER', colLeftX, y + 5);
  doc.text('DETALLES DEL PAGO', colRightX, y + 5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(10);
  doc.setTextColor(15, 23, 42);
  doc.text(technicianName, colLeftX, y + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(
    `C.I.: ${technicianDoc}   ·   Tel: ${technicianPhone}`,
    colLeftX,
    y + 15.5
  );
  doc.text(`Órdenes cubiertas en este pago: ${items.length}`, colLeftX, y + 20);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`Método: ${paymentMethod}`, colRightX, y + 10.5);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text(`Tasa Oficial BCV: Bs. ${rate.toFixed(2)} / USD`, colRightX, y + 15.5);
  doc.text(`Ref. / Comprobante: ${reference}`, colRightX, y + 20);

  y += 29;

  // --- TABLE OF PAID COMMISSIONS ---
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.2);
  doc.setTextColor(15, 23, 42);
  doc.text('DETALLE DE ÓRDENES DE SERVICIO Y REPARACIONES LIQUIDADAS', margin, y);
  y += 3;

  // Table header
  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y, contentWidth, 8, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7);
  doc.setTextColor(255, 255, 255);

  const cOrd = margin + 3;
  const cWork = margin + 27;
  const cBase = margin + 102;
  const cPct = margin + 118;
  const cComm = margin + 140;
  const cPaid = pageWidth - margin - 3;

  doc.text('ORDEN', cOrd, y + 5.2);
  doc.text('MOTO / TRABAJO REALIZADO', cWork, y + 5.2);
  doc.text('BASE M.O.', cBase, y + 5.2, { align: 'right' });
  doc.text('%', cPct, y + 5.2, { align: 'right' });
  doc.text('COMISIÓN', cComm, y + 5.2, { align: 'right' });
  doc.text('PAGADO HOY', cPaid, y + 5.2, { align: 'right' });

  y += 8;

  items.forEach((item, idx) => {
    const motoLabel = String(item?.motorcycleLabel || '');
    const servDesc = String(item?.serviceDescription || 'Servicio de taller');
    const orderNum = String(item?.orderNumber || 'S/N');
    const baseAmt = Number(item?.baseAmountUSD) || 0;
    const commRate = Number(item?.commissionRate) || 0;
    const commAmt = Number(item?.commissionAmountUSD) || 0;
    const paidThis = Number(item?.amountPaidInThisPayoutUSD) || 0;

    const descText = `${motoLabel ? motoLabel + ' · ' : ''}${servDesc}`;
    const wrappedDesc: string[] = doc.splitTextToSize(descText, 56);
    const rowHeight = Math.max(9, wrappedDesc.length * 3.8 + 4);

    ensureSpace(rowHeight + 4);

    if (idx % 2 === 0) {
      doc.setFillColor(255, 255, 255);
    } else {
      doc.setFillColor(248, 250, 252);
    }
    doc.rect(margin, y, contentWidth, rowHeight, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, y + rowHeight, margin + contentWidth, y + rowHeight);

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.4);
    doc.setTextColor(15, 23, 42);
    doc.text(orderNum, cOrd, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.2);
    doc.setTextColor(51, 65, 85);
    doc.text(wrappedDesc, cWork, y + 4.8);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.text(formatUSD(baseAmt), cBase, y + 5, { align: 'right' });
    doc.text(`${commRate}%`, cPct, y + 5, { align: 'right' });
    doc.text(formatUSD(commAmt), cComm, y + 5, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.setTextColor(5, 150, 105);
    doc.text(formatUSD(paidThis), cPaid, y + 5, { align: 'right' });

    y += rowHeight;
  });

  if (items.length === 0) {
    doc.setFillColor(248, 250, 252);
    doc.rect(margin, y, contentWidth, 10, 'F');
    doc.setFont('helvetica', 'normal');
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text('Abono general aplicado a cuenta de comisiones pendientes.', margin + 4, y + 6.5);
    y += 10;
  }

  y += 6;

  // --- SUMMARY & REMAINING BALANCE CARD + VERIFICATION QR ---
  ensureSpace(48);

  const qrSize = 28;
  drawVectorQRCode(
    doc,
    `LIQ|${payoutNumber}|${technicianName}|PAGADO:${amountUSD.toFixed(2)}|DEUDA:${remainingDebtUSD.toFixed(2)}`,
    margin,
    y,
    qrSize
  );
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6.2);
  doc.setTextColor(100, 116, 139);
  doc.text('QR de Verificación', margin + qrSize / 2, y + qrSize + 4, { align: 'center' });

  const summaryX = margin + qrSize + 8;
  const summaryW = contentWidth - qrSize - 8;

  // Paid Now Box
  doc.setFillColor(236, 253, 245); // emerald-50
  doc.setDrawColor(16, 185, 129); // emerald-500
  doc.setLineWidth(0.45);
  doc.roundedRect(summaryX, y, summaryW, 18, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(6, 95, 70);
  doc.text('TOTAL PAGADO EN ESTA FACTURA / LIQUIDACIÓN:', summaryX + 4, y + 6.5);

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(13);
  doc.setTextColor(4, 120, 87);
  doc.text(formatUSD(amountUSD), summaryX + summaryW - 4, y + 7.2, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8.2);
  doc.setTextColor(6, 95, 70);
  doc.text(
    `Equivalente en Bolívares (BCV Bs. ${rate.toFixed(2)}): ${formatBs(amountBs)}`,
    summaryX + summaryW - 4,
    y + 13.5,
    { align: 'right' }
  );

  // Remaining Debt Box
  const debtY = y + 21;
  const hasDebt = remainingDebtUSD > 0.009;
  if (hasDebt) {
    doc.setFillColor(255, 251, 235); // amber-50
    doc.setDrawColor(245, 158, 11); // amber-500
  } else {
    doc.setFillColor(241, 245, 249); // slate-100
    doc.setDrawColor(148, 163, 184); // slate-400
  }
  doc.setLineWidth(0.4);
  doc.roundedRect(summaryX, debtY, summaryW, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.8);
  doc.setTextColor(hasDebt ? 146 : 51, hasDebt ? 64 : 65, hasDebt ? 14 : 85);
  doc.text(
    hasDebt
      ? 'SALDO PENDIENTE QUE SE LE DEBE AL TÉCNICO:'
      : 'ESTADO DE CUENTA DEL TÉCNICO:',
    summaryX + 4,
    debtY + 6
  );

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(11.5);
  doc.setTextColor(hasDebt ? 180 : 5, hasDebt ? 83 : 150, hasDebt ? 9 : 105);
  doc.text(
    hasDebt ? formatUSD(remainingDebtUSD) : '$0.00 (AL DÍA)',
    summaryX + summaryW - 4,
    debtY + 6.5,
    { align: 'right' }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(71, 85, 105);
  doc.text(
    hasDebt
      ? `Saldo pendiente en Bolívares: ${formatBs(remainingDebtBs)}`
      : 'Todas las comisiones registradas hasta la fecha han sido liquidadas.',
    summaryX + summaryW - 4,
    debtY + 12.2,
    { align: 'right' }
  );

  y = debtY + 22;

  if (payout?.notes) {
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Observaciones:', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    const noteLines: string[] = doc.splitTextToSize(String(payout.notes), contentWidth);
    doc.text(noteLines, margin, y);
    y += noteLines.length * 4 + 4;
  }

  // --- SIGNATURES ---
  ensureSpace(24);
  y += 8;
  doc.setDrawColor(148, 163, 184);
  doc.setLineWidth(0.3);
  doc.line(margin + 10, y, margin + 75, y);
  doc.line(pageWidth - margin - 75, y, pageWidth - margin - 10, y);

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.5);
  doc.setTextColor(71, 85, 105);
  doc.text(`Administración / ${commercialName}`, margin + 42.5, y + 4.5, { align: 'center' });
  doc.text(`Recibido Conforme: ${technicianName}`, pageWidth - margin - 42.5, y + 4.5, { align: 'center' });

  return doc;
}

/**
 * Descarga directamente la factura PDF de pago de comisiones al técnico
 */
export function downloadTechnicianPayoutPDF(
  payout: TechnicianPayout,
  settings: BusinessSettings
): void {
  const doc = generateTechnicianPayoutPDF(payout, settings);
  const safeName = String(payout?.technicianName || 'Tecnico')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 20);
  const safeNumber = String(payout?.payoutNumber || 'LIQ')
    .replace(/[^a-zA-Z0-9_-]/g, '_');
  const fileName = `Factura_Comision_${safeNumber}_${safeName}.pdf`;

  try {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      return;
    }
  } catch (err) {
    console.warn('Blob anchor download fallback to doc.save:', err);
  }

  doc.save(fileName);
}

/**
 * Retorna el PDF de pago de comisiones en formato Blob para compartir por WhatsApp
 */
export function getTechnicianPayoutPDFBlob(
  payout: TechnicianPayout,
  settings: BusinessSettings
): Blob {
  const doc = generateTechnicianPayoutPDF(payout, settings);
  return doc.output('blob');
}

/**
 * Genera el documento PDF de Orden de Compra / Estado de Deuda y Abonos para el Proveedor / Vendedor
 */
export function generatePurchaseOrderPDF(
  order: PurchaseOrder,
  settings: BusinessSettings
): jsPDF {
  const doc = new jsPDF({
    orientation: 'portrait',
    unit: 'mm',
    format: 'a4',
  });

  const totalUSD = Number(order.totalUSD || 0);
  const paidUSD = Number(order.paidAmountUSD || 0);
  const remainingUSD = Math.max(0, Math.round((totalUSD - paidUSD) * 100) / 100);
  const isCredit = order.paymentType === 'CREDITO';
  const isBsBcv = order.paymentCurrencyCondition === 'BS_BCV';

  const pageWidth = 210;
  const pageHeight = 297;
  const margin = 15;
  const contentWidth = pageWidth - margin * 2;
  const commercialName = settings.commercialName || settings.name || 'MotoCristoc';
  const cleanPhone = (settings.whatsapp || settings.phone || '+584127860509').replace(/[^\d+]/g, '');
  const qrTargetUrl = `https://wa.me/${cleanPhone.replace('+', '')}`;

  const drawPageHeader = (): number => {
    const headerY = 14;
    doc.setTextColor(15, 23, 42);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(16);
    doc.text(commercialName, margin, headerY + 4);

    doc.setFillColor(245, 158, 11);
    doc.circle(margin + doc.getTextWidth(commercialName) + 2.5, headerY + 2.5, 1.2, 'F');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(30, 41, 59);
    doc.text(`RIF: ${settings.rif || 'V-19996141-8'}`, margin, headerY + 9.5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    const addressStr =
      settings.address ||
      'Calle Kennedy con calle 2 de Campo de Oro casa #1-23. Frente a la torre 5 de, Mérida 5101, Mérida';
    const addressLines: string[] = doc.splitTextToSize(addressStr, 112);
    doc.text(addressLines, margin, headerY + 13.5);

    const contactY = headerY + 13.5 + addressLines.length * 3.5;
    doc.text(`Tel / WhatsApp: ${settings.phone || '+584127860509'}`, margin, contactY);
    doc.text(settings.email || 'servimotoscristocentro@gmail.com', margin, contactY + 3.8);

    // Document Box Top Right
    const docBoxW = 66;
    const docBoxX = pageWidth - margin - docBoxW;
    doc.setFillColor(248, 250, 252);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.45);
    doc.roundedRect(docBoxX, headerY, docBoxW, 20, 2, 2, 'FD');

    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.2);
    doc.setTextColor(180, 83, 9);
    doc.text(
      remainingUSD > 0.01 ? 'FACTURA / ORDEN POR PAGAR' : 'ORDEN DE COMPRA CANCELADA',
      docBoxX + docBoxW / 2,
      headerY + 5,
      { align: 'center' }
    );

    doc.setFontSize(11.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`#${order.orderNumber}`, docBoxX + docBoxW / 2, headerY + 11.2, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    const dateLabel = new Date(order.createdAt).toLocaleDateString('es-VE', {
      day: '2-digit',
      month: '2-digit',
      year: 'numeric',
    });
    doc.text(`Emisión: ${dateLabel}`, docBoxX + docBoxW / 2, headerY + 16.5, { align: 'center' });

    const dividerY = Math.max(headerY + 23, contactY + 7);
    doc.setDrawColor(15, 23, 42);
    doc.setLineWidth(0.4);
    doc.line(margin, dividerY, margin + contentWidth, dividerY);
    doc.setDrawColor(245, 158, 11);
    doc.setLineWidth(0.9);
    doc.line(margin, dividerY, margin + 32, dividerY);

    return dividerY + 5;
  };

  let y = drawPageHeader();

  const ensureSpace = (requiredHeight: number) => {
    if (y + requiredHeight > pageHeight - 24) {
      doc.addPage();
      y = drawPageHeader();
      y += 2;
    }
  };

  // --- SUPPLIER & TERMS INFO CARD ---
  const infoBoxH = 29;
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(226, 232, 240);
  doc.setLineWidth(0.3);
  doc.roundedRect(margin, y, contentWidth, infoBoxH, 2, 2, 'FD');

  const midX = margin + contentWidth / 2;
  doc.line(midX, y + 2, midX, y + infoBoxH - 2);

  // Left: Supplier & Vendor
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(180, 83, 9);
  doc.text('DATOS DEL PROVEEDOR Y VENDEDOR', margin + 4, y + 5);

  doc.setFontSize(8.8);
  doc.setTextColor(15, 23, 42);
  doc.text(
    doc.splitTextToSize(`${order.supplierName} (${order.supplierCode})`, contentWidth / 2 - 8)[0] || '',
    margin + 4,
    y + 10.5
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(51, 65, 85);
  doc.text(`Vendedor: ${order.vendorName || 'No registrado'}`, margin + 4, y + 15.8);
  doc.text(`Tel. Vendedor: ${order.vendorPhone || 'No registrado'}`, margin + 4, y + 20.5);
  if (order.supplierInvoiceNumber) {
    doc.setFont('helvetica', 'bold');
    doc.text(`Fact. Proveedor: #${order.supplierInvoiceNumber}`, margin + 4, y + 25.2);
  }

  // Right: Condition, Credit & Reception
  const rightX = midX + 4;
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(180, 83, 9);
  doc.text('CONDICIÓN, RECEPCIÓN Y PAGO', rightX, y + 5);

  doc.setFontSize(8.2);
  doc.setTextColor(15, 23, 42);
  doc.text(
    isCredit
      ? `Condición: A CRÉDITO (${order.creditDays || 15} días)`
      : 'Condición: DE CONTADO',
    rightX,
    y + 10.5
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.8);
  doc.setTextColor(51, 65, 85);
  if (isCredit) {
    doc.text(`Vencimiento: ${order.creditDueDate || 'A convenir'}`, rightX, y + 15.8);
  } else {
    doc.text(`Forma de Pago: ${order.initialPaymentMethod || 'Contado'}`, rightX, y + 15.8);
  }

  const receptionText =
    order.receivedStatus === 'RECIBIDA'
      ? `Mercancía: RECIBIDA${order.receivedDate ? ` (Llegó: ${order.receivedDate})` : ''}`
      : 'Mercancía: PENDIENTE POR LLEGAR';
  doc.text(receptionText, rightX, y + 20.5);
  doc.setFont('helvetica', 'bold');
  doc.text(
    `Moneda de Pago: ${isBsBcv ? 'Bs a Tasa BCV (día de pago)' : 'Divisas ($ USD)'}`,
    rightX,
    y + 25.2
  );

  y += infoBoxH + 6;

  // --- PURCHASED PARTS TABLE ---
  ensureSpace(24);
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8.5);
  doc.setTextColor(15, 23, 42);
  doc.text(`REPUESTOS COMPRADOS (${order.items.length})`, margin, y);
  y += 3;

  doc.setFillColor(15, 23, 42);
  doc.roundedRect(margin, y, contentWidth, 7.5, 1.5, 1.5, 'F');
  doc.setFont('helvetica', 'bold');
  doc.setFontSize(7.2);
  doc.setTextColor(255, 255, 255);

  const cSku = margin + 3;
  const cName = margin + 28;
  const cQty = margin + 122;
  const cCost = margin + 148;
  const cSub = pageWidth - margin - 3;

  doc.text('CÓD/SKU', cSku, y + 5);
  doc.text('REPUESTO / DESCRIPCIÓN', cName, y + 5);
  doc.text('CANT.', cQty, y + 5, { align: 'center' });
  doc.text('COSTO UNIT.', cCost, y + 5, { align: 'right' });
  doc.text('SUBTOTAL ($)', cSub, y + 5, { align: 'right' });
  y += 7.5;

  order.items.forEach((item, idx) => {
    const wrappedName: string[] = doc.splitTextToSize((item.name || '').toUpperCase(), 78);
    const rowH = Math.max(8.5, wrappedName.length * 3.8 + 3.5);
    ensureSpace(rowH + 2);

    doc.setFillColor(idx % 2 === 0 ? 255 : 248, idx % 2 === 0 ? 255 : 250, idx % 2 === 0 ? 255 : 252);
    doc.rect(margin, y, contentWidth, rowH, 'F');
    doc.setDrawColor(226, 232, 240);
    doc.setLineWidth(0.2);
    doc.line(margin, y + rowH, margin + contentWidth, y + rowH);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7);
    doc.setTextColor(100, 116, 139);
    doc.text((item.sku || 'EXT').slice(0, 14), cSku, y + 5);

    doc.setFont('helvetica', 'normal');
    doc.setFontSize(7.5);
    doc.setTextColor(15, 23, 42);
    doc.text(wrappedName, cName, y + 5);

    doc.setFont('helvetica', 'bold');
    doc.text(String(item.quantity), cQty, y + 5, { align: 'center' });

    doc.setFont('helvetica', 'normal');
    doc.text(formatUSD(item.unitCostUSD), cCost, y + 5, { align: 'right' });

    doc.setFont('helvetica', 'bold');
    doc.text(formatUSD(item.totalCostUSD), cSub, y + 5, { align: 'right' });

    y += rowH;
  });

  y += 6;

  // --- PAYMENTS / ABONOS HISTORY TABLE (IF ANY) ---
  if (order.payments && order.payments.length > 0) {
    ensureSpace(22);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(8.5);
    doc.setTextColor(15, 23, 42);
    doc.text(`HISTORIAL DE PAGOS Y ABONOS REGISTRADOS (${order.payments.length})`, margin, y);
    y += 3;

    doc.setFillColor(5, 150, 105);
    doc.roundedRect(margin, y, contentWidth, 7, 1.5, 1.5, 'F');
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7);
    doc.setTextColor(255, 255, 255);
    doc.text('FECHA', margin + 3, y + 4.7);
    doc.text('FORMA DE PAGO (DIVISAS / USDT / BS)', margin + 38, y + 4.7);
    doc.text('REFERENCIA', margin + 115, y + 4.7);
    doc.text('MONTO ($)', margin + 150, y + 4.7, { align: 'right' });
    doc.text('BS PAGADOS', pageWidth - margin - 3, y + 4.7, { align: 'right' });
    y += 7;

    order.payments.forEach((pay, idx) => {
      const rowH = 7.5;
      ensureSpace(rowH);
      doc.setFillColor(idx % 2 === 0 ? 255 : 240, idx % 2 === 0 ? 255 : 253, idx % 2 === 0 ? 255 : 244);
      doc.rect(margin, y, contentWidth, rowH, 'F');
      doc.setDrawColor(226, 232, 240);
      doc.line(margin, y + rowH, margin + contentWidth, y + rowH);

      const pDate = new Date(pay.date).toLocaleDateString('es-VE', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
      });
      doc.setFont('helvetica', 'normal');
      doc.setFontSize(7.2);
      doc.setTextColor(15, 23, 42);
      doc.text(pDate, margin + 3, y + 4.8);
      doc.text(doc.splitTextToSize(pay.paymentMethod || pay.currencyCategory, 72)[0] || '', margin + 38, y + 4.8);
      doc.setTextColor(100, 116, 139);
      doc.text((pay.reference || '-').slice(0, 18), margin + 115, y + 4.8);
      doc.setFont('helvetica', 'bold');
      doc.setTextColor(5, 150, 105);
      doc.text(formatUSD(pay.amountUSD), margin + 150, y + 4.8, { align: 'right' });
      doc.setFont('helvetica', 'normal');
      doc.setTextColor(71, 85, 105);
      doc.text(
        pay.currencyCategory === 'BS' && pay.amountBs ? formatBs(pay.amountBs) : '—',
        pageWidth - margin - 3,
        y + 4.8,
        { align: 'right' }
      );
      y += rowH;
    });

    y += 6;
  }

  // --- SUMMARY & BALANCE CARD + QR ---
  ensureSpace(46);
  const qrSize = 26;
  drawVectorQRCode(doc, qrTargetUrl, margin, y, qrSize);
  doc.setFont('helvetica', 'normal');
  doc.setFontSize(6);
  doc.setTextColor(100, 116, 139);
  doc.text('WhatsApp Administración', margin + qrSize / 2, y + qrSize + 3.8, { align: 'center' });

  const sumX = margin + qrSize + 8;
  const sumW = contentWidth - qrSize - 8;

  // Total & Paid Summary Box
  doc.setFillColor(248, 250, 252);
  doc.setDrawColor(203, 213, 225);
  doc.setLineWidth(0.35);
  doc.roundedRect(sumX, y, sumW, 17, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(51, 65, 85);
  doc.text('TOTAL DE LA COMPRA:', sumX + 4, y + 6);
  doc.setFontSize(11);
  doc.setTextColor(15, 23, 42);
  doc.text(formatUSD(totalUSD), sumX + sumW - 4, y + 6.3, { align: 'right' });

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(8);
  doc.setTextColor(5, 150, 105);
  doc.text('Total Abonado / Pagado:', sumX + 4, y + 12.8);
  doc.setFont('helvetica', 'bold');
  doc.text(`-${formatUSD(paidUSD)}`, sumX + sumW - 4, y + 12.8, { align: 'right' });

  // Remaining Debt Box
  const debtY = y + 20;
  const hasDebt = remainingUSD > 0.01;
  doc.setFillColor(hasDebt ? 255 : 236, hasDebt ? 251 : 253, hasDebt ? 235 : 245);
  doc.setDrawColor(hasDebt ? 245 : 16, hasDebt ? 158 : 185, hasDebt ? 11 : 129);
  doc.setLineWidth(0.5);
  doc.roundedRect(sumX, debtY, sumW, 16, 2, 2, 'FD');

  doc.setFont('helvetica', 'bold');
  doc.setFontSize(8);
  doc.setTextColor(hasDebt ? 146 : 6, hasDebt ? 64 : 95, hasDebt ? 14 : 70);
  doc.text(
    hasDebt ? 'SALDO PENDIENTE QUE SE DEBE:' : 'ESTADO DE LA FACTURA:',
    sumX + 4,
    debtY + 6.2
  );

  doc.setFontSize(12);
  doc.setTextColor(hasDebt ? 180 : 4, hasDebt ? 83 : 120, hasDebt ? 9 : 87);
  doc.text(
    hasDebt ? formatUSD(remainingUSD) : '$0.00 (PAGADA AL 100%)',
    sumX + sumW - 4,
    debtY + 6.5,
    { align: 'right' }
  );

  doc.setFont('helvetica', 'normal');
  doc.setFontSize(7.6);
  doc.setTextColor(71, 85, 105);
  doc.text(
    hasDebt
      ? isBsBcv
        ? 'Pago pactado en Bs a la tasa BCV vigente el día que se realice el pago.'
        : 'Pago pactado en Divisas ($ USD).'
      : 'Factura cancelada en su totalidad.',
    sumX + sumW - 4,
    debtY + 12.5,
    { align: 'right' }
  );

  y = debtY + 22;

  if (order.notes) {
    ensureSpace(14);
    doc.setFont('helvetica', 'bold');
    doc.setFontSize(7.5);
    doc.setTextColor(71, 85, 105);
    doc.text('Observaciones:', margin, y);
    y += 4;
    doc.setFont('helvetica', 'normal');
    const noteLines: string[] = doc.splitTextToSize(order.notes, contentWidth);
    doc.text(noteLines, margin, y);
  }

  return doc;
}

export function downloadPurchaseOrderPDF(
  order: PurchaseOrder,
  settings: BusinessSettings
): void {
  const doc = generatePurchaseOrderPDF(order, settings);
  const safeNum = String(order.orderNumber || 'OC').replace(/[^a-zA-Z0-9_-]/g, '_');
  const safeSupplier = String(order.supplierCode || order.supplierName || 'Proveedor')
    .replace(/[^a-zA-Z0-9_-]/g, '_')
    .slice(0, 20);
  const fileName = `Orden_Compra_${safeNum}_${safeSupplier}.pdf`;

  try {
    if (typeof window !== 'undefined' && typeof document !== 'undefined') {
      const blob = doc.output('blob');
      const blobUrl = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = blobUrl;
      link.download = fileName;
      link.style.display = 'none';
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      setTimeout(() => URL.revokeObjectURL(blobUrl), 15000);
      return;
    }
  } catch (err) {
    console.warn('Blob download fallback:', err);
  }
  doc.save(fileName);
}

export function getPurchaseOrderPDFBlob(
  order: PurchaseOrder,
  settings: BusinessSettings
): Blob {
  const doc = generatePurchaseOrderPDF(order, settings);
  return doc.output('blob');
}

