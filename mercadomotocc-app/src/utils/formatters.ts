export function formatUSD(amount: number): string {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount);
}

export function formatBs(amount: number): string {
  return `Bs. ${new Intl.NumberFormat('es-VE', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(amount)}`;
}

export function cleanPhone(phone: string): string {
  return phone.replace(/\D/g, '');
}

export function buildWhatsAppLink(phone: string, text: string): string {
  const numeric = phone.replace(/\D/g, '').replace(/^0/, '58');
  return `https://api.whatsapp.com/send?phone=${numeric}&text=${encodeURIComponent(text)}`;
}
