import React, { useMemo, useState } from 'react';
import { useApp } from '../../context/AppContext';
import {
  PaymentMethod,
  ServiceCommission,
  ServiceOrder,
  Technician,
  TechnicianPayout,
  TechnicianPayoutItem,
} from '../../types';
import {
  buildTechnicianPayoutWhatsAppMessage,
  formatBs,
  formatUSD,
  hasValidWhatsAppPhone,
} from '../../utils/whatsapp';
import { downloadTechnicianPayoutPDF } from '../../utils/pdfInvoice';
import {
  BadgePercent,
  Banknote,
  CheckCircle2,
  ClipboardCheck,
  Clock,
  Edit3,
  ExternalLink,
  FileDown,
  History,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
  Wallet,
  Wrench,
  X,
  AlertCircle,
} from 'lucide-react';

type CommissionsTab = 'tecnicos_saldos' | 'comisiones' | 'pagos' | 'directorio';

const PAYMENT_METHODS: PaymentMethod[] = [
  'Dólares Efectivo (USD)',
  'Pago Móvil',
  'Transferencia Bancaria Bs',
  'Binance Pay (USDT)',
  'Punto de Venta (Bs)',
];

const SPECIALTIES = [
  'Mecánica General',
  'Tapicería y Asientos',
  'Sistema Eléctrico',
  'Frenos y Suspensión',
  'Mantenimiento Preventivo',
  'Personalización y Modificación',
];

export const CommissionsView: React.FC = () => {
  const {
    technicians,
    addTechnician,
    updateTechnician,
    deleteTechnician,
    serviceCommissions,
    addServiceCommission,
    updateServiceCommission,
    deleteServiceCommission,
    syncServiceOrderToCommission,
    syncAllPendingServiceOrdersToCommissions,
    technicianPayouts,
    payTechnicianCommissions,
    deleteTechnicianPayout,
    pendingTechniciansCommissionUSD,
    pendingTechniciansCommissionBs,
    serviceOrders,
    settings,
    setWhatsappModalData,
  } = useApp();

  const [activeTab, setActiveTab] = useState<CommissionsTab>('tecnicos_saldos');
  const [searchTerm, setSearchTerm] = useState('');
  const [filterTechId, setFilterTechId] = useState<string>('ALL');
  const [filterStatus, setFilterStatus] = useState<'ALL' | 'PENDIENTE' | 'PARCIAL' | 'PAGADO'>('ALL');
  const [feedbackBanner, setFeedbackBanner] = useState<{
    type: 'success' | 'warning';
    text: string;
  } | null>(null);

  // Sync banner default rate
  const [syncDefaultRate, setSyncDefaultRate] = useState<string>('50');

  // --- Technician Modal State ---
  const [isTechModalOpen, setIsTechModalOpen] = useState(false);
  const [editingTech, setEditingTech] = useState<Technician | null>(null);
  const [techForm, setTechForm] = useState({
    name: '',
    phone: '',
    documentId: '',
    specialty: 'Mecánica General',
    commissionRate: '50',
    active: true,
    notes: '',
    applyRateToPending: false,
  });

  // --- Commission Modal State (Create / Edit) ---
  const [isCommModalOpen, setIsCommModalOpen] = useState(false);
  const [editingComm, setEditingComm] = useState<ServiceCommission | null>(null);
  const [commForm, setCommForm] = useState({
    sourceType: 'ORDER' as 'ORDER' | 'MANUAL',
    serviceOrderId: '',
    orderNumber: '',
    technicianId: '',
    motorcycleLabel: '',
    customerName: '',
    serviceDescription: '',
    baseAmountUSD: '',
    commissionRate: '50',
    workDate: new Date().toISOString().split('T')[0],
    notes: '',
  });

  // --- Payout Modal State ---
  const [payoutModalTechId, setPayoutModalTechId] = useState<string | null>(null);
  const [selectedCommIds, setSelectedCommIds] = useState<string[]>([]);
  const [payoutMode, setPayoutMode] = useState<'SELECTED' | 'CUSTOM'>('SELECTED');
  const [customPayoutAmountUSD, setCustomPayoutAmountUSD] = useState<string>('');
  const [payoutMethod, setPayoutMethod] = useState<PaymentMethod>('Dólares Efectivo (USD)');
  const [payoutReference, setPayoutReference] = useState('');
  const [payoutNotes, setPayoutNotes] = useState('');
  const [payoutTechPhone, setPayoutTechPhone] = useState('');
  const [payoutModalError, setPayoutModalError] = useState<string | null>(null);

  // --- Confirm Delete States ---
  const [confirmDeleteTech, setConfirmDeleteTech] = useState<Technician | null>(null);
  const [confirmDeleteComm, setConfirmDeleteComm] = useState<ServiceCommission | null>(null);
  const [confirmDeletePayout, setConfirmDeletePayout] = useState<TechnicianPayout | null>(null);

  const bcvRate = settings.bcvRate || 1;

  // Derived Totals
  const totalGeneratedUSD = useMemo(
    () =>
      Math.round(
        serviceCommissions.reduce((acc, c) => acc + c.commissionAmountUSD, 0) * 100
      ) / 100,
    [serviceCommissions]
  );

  const totalPaidUSD = useMemo(
    () =>
      Math.round(
        serviceCommissions.reduce((acc, c) => acc + c.paidAmountUSD, 0) * 100
      ) / 100,
    [serviceCommissions]
  );

  const pendingCommissionsCount = useMemo(
    () =>
      serviceCommissions.filter(
        (c) => Math.max(0, c.commissionAmountUSD - c.paidAmountUSD) > 0.01
      ).length,
    [serviceCommissions]
  );

  const activeTechsCount = useMemo(
    () => technicians.filter((t) => t.active).length,
    [technicians]
  );

  // Detect existing serviceOrders that do NOT have a registered ServiceCommission yet
  const unregisteredOrders = useMemo(() => {
    const linkedIds = new Set(
      serviceCommissions.map((c) => c.serviceOrderId).filter(Boolean)
    );
    return serviceOrders.filter((o) => {
      if (o.skipCommissionSync) return false;
      if (linkedIds.has(o.id)) return false;
      const servicesSum = Array.isArray(o.servicesList)
        ? o.servicesList.reduce((acc, s) => acc + (Number(s.cost) || 0), 0)
        : 0;
      const base = Math.max(Number(o.laborCost) || 0, servicesSum);
      return base > 0;
    });
  }, [serviceOrders, serviceCommissions]);

  const completedUnregisteredCount = useMemo(
    () =>
      unregisteredOrders.filter(
        (o) =>
          (o.status === 'CULMINADA' || o.status === 'ENTREGADA') &&
          Boolean((o.assignedTechnician || '').trim())
      ).length,
    [unregisteredOrders]
  );

  // Aggregate metrics per technician
  const techSummaries = useMemo(() => {
    const map = new Map<
      string,
      {
        technician: Technician;
        totalCommissionsCount: number;
        pendingCount: number;
        paidCount: number;
        totalGeneratedUSD: number;
        totalPaidUSD: number;
        totalPendingUSD: number;
        lastPayoutAt?: string;
      }
    >();

    for (const tech of technicians) {
      map.set(tech.id, {
        technician: tech,
        totalCommissionsCount: 0,
        pendingCount: 0,
        paidCount: 0,
        totalGeneratedUSD: 0,
        totalPaidUSD: 0,
        totalPendingUSD: 0,
      });
    }

    for (const comm of serviceCommissions) {
      let bucket = map.get(comm.technicianId);
      if (!bucket) {
        // Handle commissions whose technician was deleted or created before directory
        const fallbackTech: Technician = {
          id: comm.technicianId,
          name: comm.technicianName,
          phone: comm.technicianPhone || '',
          commissionRate: comm.commissionRate,
          active: true,
          createdAt: comm.createdAt,
        };
        bucket = {
          technician: fallbackTech,
          totalCommissionsCount: 0,
          pendingCount: 0,
          paidCount: 0,
          totalGeneratedUSD: 0,
          totalPaidUSD: 0,
          totalPendingUSD: 0,
        };
        map.set(comm.technicianId, bucket);
      }

      const pending = Math.max(0, comm.commissionAmountUSD - comm.paidAmountUSD);
      bucket.totalCommissionsCount += 1;
      bucket.totalGeneratedUSD =
        Math.round((bucket.totalGeneratedUSD + comm.commissionAmountUSD) * 100) / 100;
      bucket.totalPaidUSD =
        Math.round((bucket.totalPaidUSD + comm.paidAmountUSD) * 100) / 100;
      bucket.totalPendingUSD =
        Math.round((bucket.totalPendingUSD + pending) * 100) / 100;
      if (pending > 0.01) {
        bucket.pendingCount += 1;
      } else {
        bucket.paidCount += 1;
      }
    }

    for (const payout of technicianPayouts) {
      const bucket = map.get(payout.technicianId);
      if (bucket && (!bucket.lastPayoutAt || payout.createdAt > bucket.lastPayoutAt)) {
        bucket.lastPayoutAt = payout.createdAt;
      }
    }

    return Array.from(map.values()).sort((a, b) => {
      if (b.totalPendingUSD !== a.totalPendingUSD) {
        return b.totalPendingUSD - a.totalPendingUSD;
      }
      return a.technician.name.localeCompare(b.technician.name);
    });
  }, [technicians, serviceCommissions, technicianPayouts]);

  // Filtered Commissions Table
  const filteredCommissions = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return serviceCommissions.filter((c) => {
      if (filterTechId !== 'ALL' && c.technicianId !== filterTechId) return false;
      if (filterStatus !== 'ALL' && c.status !== filterStatus) return false;
      if (q) {
        const hay = `${c.orderNumber} ${c.technicianName} ${c.motorcycleLabel} ${c.customerName || ''} ${c.serviceDescription}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [serviceCommissions, filterTechId, filterStatus, searchTerm]);

  // Filtered Payouts
  const filteredPayouts = useMemo(() => {
    const q = searchTerm.trim().toLowerCase();
    return technicianPayouts.filter((p) => {
      if (filterTechId !== 'ALL' && p.technicianId !== filterTechId) return false;
      if (q) {
        const hay = `${p.payoutNumber} ${p.technicianName} ${p.reference || ''} ${p.paymentMethod}`.toLowerCase();
        if (!hay.includes(q)) return false;
      }
      return true;
    });
  }, [technicianPayouts, filterTechId, searchTerm]);

  const showToast = (text: string, type: 'success' | 'warning' = 'success') => {
    setFeedbackBanner({ type, text });
    setTimeout(() => setFeedbackBanner(null), 5500);
  };

  // --- Handlers: Technician CRUD ---
  const openCreateTechnicianModal = () => {
    setEditingTech(null);
    setTechForm({
      name: '',
      phone: '',
      documentId: '',
      specialty: 'Mecánica General',
      commissionRate: '50',
      active: true,
      notes: '',
      applyRateToPending: false,
    });
    setIsTechModalOpen(true);
  };

  const openEditTechnicianModal = (tech: Technician) => {
    setEditingTech(tech);
    setTechForm({
      name: tech.name,
      phone: tech.phone || '',
      documentId: tech.documentId || '',
      specialty: tech.specialty || 'Mecánica General',
      commissionRate: String(tech.commissionRate),
      active: tech.active,
      notes: tech.notes || '',
      applyRateToPending: false,
    });
    setIsTechModalOpen(true);
  };

  const handleSaveTechnician = (e: React.FormEvent) => {
    e.preventDefault();
    if (!techForm.name.trim()) return;
    const parsedRate = Math.min(100, Math.max(0, parseFloat(techForm.commissionRate) || 0));

    if (editingTech) {
      updateTechnician(
        editingTech.id,
        {
          name: techForm.name.trim(),
          phone: techForm.phone.trim(),
          documentId: techForm.documentId.trim() || undefined,
          specialty: techForm.specialty.trim() || 'Mecánica General',
          commissionRate: parsedRate,
          active: techForm.active,
          notes: techForm.notes.trim() || undefined,
        },
        techForm.applyRateToPending
      );
      showToast(`Técnico "${techForm.name.trim()}" actualizado (${parsedRate}%).`);
    } else {
      const created = addTechnician({
        name: techForm.name.trim(),
        phone: techForm.phone.trim(),
        documentId: techForm.documentId.trim() || undefined,
        specialty: techForm.specialty.trim() || 'Mecánica General',
        commissionRate: parsedRate,
        active: techForm.active,
        notes: techForm.notes.trim() || undefined,
      });
      // Automatically offer/sync any matching completed service orders for this new technician
      const matchingOrders = unregisteredOrders.filter(
        (o) =>
          (o.status === 'CULMINADA' || o.status === 'ENTREGADA') &&
          (o.assignedTechnician || '').trim().toLowerCase() === created.name.trim().toLowerCase()
      );
      let syncedCount = 0;
      matchingOrders.forEach((ord) => {
        if (
          syncServiceOrderToCommission(ord, {
            technicianId: created.id,
            technicianName: created.name,
            commissionRate: created.commissionRate,
          })
        ) {
          syncedCount++;
        }
      });
      showToast(
        syncedCount > 0
          ? `Técnico "${created.name}" registrado (${parsedRate}%) y se importaron ${syncedCount} órdenes de taller.`
          : `Técnico "${created.name}" registrado con ${parsedRate}% de comisión.`
      );
    }

    setIsTechModalOpen(false);
    setEditingTech(null);
  };

  // --- Handlers: Commission Create / Edit ---
  const openCreateCommissionModal = (preselectedTechId?: string) => {
    setEditingComm(null);
    const defaultTech =
      (preselectedTechId && technicians.find((t) => t.id === preselectedTechId)) ||
      technicians.find((t) => t.active) ||
      technicians[0];

    const firstUnreg = unregisteredOrders[0];
    const orderBase = firstUnreg
      ? Math.max(
          Number(firstUnreg.laborCost) || 0,
          (firstUnreg.servicesList || []).reduce((acc, s) => acc + (Number(s.cost) || 0), 0)
        )
      : 0;

    setCommForm({
      sourceType: unregisteredOrders.length > 0 ? 'ORDER' : 'MANUAL',
      serviceOrderId: firstUnreg ? firstUnreg.id : '',
      orderNumber: firstUnreg ? firstUnreg.orderNumber : `MAN-${String(serviceCommissions.length + 1).padStart(4, '0')}`,
      technicianId: defaultTech ? defaultTech.id : '',
      motorcycleLabel: firstUnreg
        ? `${firstUnreg.motorcycle.brand} ${firstUnreg.motorcycle.model} · ${firstUnreg.motorcycle.plate}`
        : '',
      customerName: firstUnreg ? firstUnreg.customerName : '',
      serviceDescription: firstUnreg
        ? (firstUnreg.servicesList && firstUnreg.servicesList.length > 0
            ? firstUnreg.servicesList.map((s) => s.name).join(', ')
            : firstUnreg.reportedIssue)
        : '',
      baseAmountUSD: firstUnreg && orderBase > 0 ? String(orderBase) : '',
      commissionRate: defaultTech ? String(defaultTech.commissionRate) : '50',
      workDate: new Date().toISOString().split('T')[0],
      notes: '',
    });
    setIsCommModalOpen(true);
  };

  const openEditCommissionModal = (comm: ServiceCommission) => {
    setEditingComm(comm);
    setCommForm({
      sourceType: comm.serviceOrderId ? 'ORDER' : 'MANUAL',
      serviceOrderId: comm.serviceOrderId || '',
      orderNumber: comm.orderNumber,
      technicianId: comm.technicianId,
      motorcycleLabel: comm.motorcycleLabel,
      customerName: comm.customerName || '',
      serviceDescription: comm.serviceDescription,
      baseAmountUSD: String(comm.baseAmountUSD),
      commissionRate: String(comm.commissionRate),
      workDate: (comm.workDate || comm.createdAt).split('T')[0],
      notes: comm.notes || '',
    });
    setIsCommModalOpen(true);
  };

  const handleSelectOrderInCommForm = (orderId: string) => {
    const ord = serviceOrders.find((o) => o.id === orderId);
    if (!ord) {
      setCommForm((prev) => ({ ...prev, serviceOrderId: orderId }));
      return;
    }
    const base = Math.max(
      Number(ord.laborCost) || 0,
      (ord.servicesList || []).reduce((acc, s) => acc + (Number(s.cost) || 0), 0)
    );
    const matchedTech = technicians.find(
      (t) => t.name.trim().toLowerCase() === (ord.assignedTechnician || '').trim().toLowerCase()
    );
    setCommForm((prev) => ({
      ...prev,
      serviceOrderId: ord.id,
      orderNumber: ord.orderNumber,
      technicianId: matchedTech ? matchedTech.id : prev.technicianId,
      commissionRate: matchedTech ? String(matchedTech.commissionRate) : prev.commissionRate,
      motorcycleLabel: `${ord.motorcycle.brand} ${ord.motorcycle.model} · ${ord.motorcycle.plate}`,
      customerName: ord.customerName,
      serviceDescription:
        ord.servicesList && ord.servicesList.length > 0
          ? ord.servicesList.map((s) => s.name).join(', ')
          : ord.reportedIssue || ord.serviceType,
      baseAmountUSD: String(base),
      workDate: (ord.updatedAt || ord.createdAt).split('T')[0],
    }));
  };

  const handleSelectTechInCommForm = (techId: string) => {
    const tech = technicians.find((t) => t.id === techId);
    setCommForm((prev) => ({
      ...prev,
      technicianId: techId,
      commissionRate: tech ? String(tech.commissionRate) : prev.commissionRate,
    }));
  };

  const handleSaveCommission = (e: React.FormEvent) => {
    e.preventDefault();
    const tech = technicians.find((t) => t.id === commForm.technicianId);
    if (!tech) {
      showToast('Debes seleccionar o registrar primero un técnico.', 'warning');
      return;
    }
    const baseUSD = Math.max(0, parseFloat(commForm.baseAmountUSD) || 0);
    const rate = Math.min(100, Math.max(0, parseFloat(commForm.commissionRate) || 0));
    if (baseUSD <= 0) {
      showToast('El monto base de mano de obra debe ser mayor a $0.00.', 'warning');
      return;
    }

    if (editingComm) {
      updateServiceCommission(editingComm.id, {
        orderNumber: commForm.orderNumber.trim() || editingComm.orderNumber,
        technicianId: tech.id,
        technicianName: tech.name,
        technicianPhone: tech.phone,
        motorcycleLabel: commForm.motorcycleLabel.trim(),
        customerName: commForm.customerName.trim() || undefined,
        serviceDescription: commForm.serviceDescription.trim() || 'Servicio de taller',
        baseAmountUSD: baseUSD,
        commissionRate: rate,
        workDate: commForm.workDate ? new Date(`${commForm.workDate}T12:00:00`).toISOString() : editingComm.workDate,
        notes: commForm.notes.trim() || undefined,
      });
      showToast(`Comisión #${commForm.orderNumber} actualizada correctamente.`);
    } else {
      addServiceCommission({
        serviceOrderId: commForm.sourceType === 'ORDER' && commForm.serviceOrderId ? commForm.serviceOrderId : undefined,
        orderNumber:
          commForm.orderNumber.trim() || `MAN-${String(serviceCommissions.length + 1).padStart(4, '0')}`,
        technicianId: tech.id,
        technicianName: tech.name,
        technicianPhone: tech.phone,
        motorcycleLabel: commForm.motorcycleLabel.trim() || 'Reparación de taller',
        customerName: commForm.customerName.trim() || undefined,
        serviceDescription: commForm.serviceDescription.trim() || 'Mano de obra / reparación',
        baseAmountUSD: baseUSD,
        commissionRate: rate,
        workDate: commForm.workDate
          ? new Date(`${commForm.workDate}T12:00:00`).toISOString()
          : new Date().toISOString(),
        notes: commForm.notes.trim() || undefined,
      });
      showToast(`Comisión registrada para ${tech.name} (${formatUSD(baseUSD * (rate / 100))}).`);
    }
    setIsCommModalOpen(false);
    setEditingComm(null);
  };

  // --- Handlers: Import Existing Unregistered Workshop Orders ---
  const handleSyncAllOrders = () => {
    const rate = Math.min(100, Math.max(0, parseFloat(syncDefaultRate) || 50));
    const res = syncAllPendingServiceOrdersToCommissions(rate);
    if (res.created > 0) {
      showToast(
        `Sincronización completada: ${res.created} orden(es) registradas en comisiones${
          res.createdTechnicians > 0 ? ` y ${res.createdTechnicians} técnico(s) agregados al directorio` : ''
        }.`
      );
    } else {
      showToast('No hay nuevas órdenes culminadas o entregadas pendientes por importar.', 'warning');
    }
  };

  const handleQuickSyncOrder = (order: ServiceOrder) => {
    const rate = Math.min(100, Math.max(0, parseFloat(syncDefaultRate) || 50));
    const created = syncServiceOrderToCommission(order, { commissionRate: rate });
    if (created) {
      showToast(
        `Orden #${order.orderNumber} registrada a ${created.technicianName} (${created.commissionRate}% = ${formatUSD(created.commissionAmountUSD)}).`
      );
    }
  };

  // --- Handlers: Payout & Simultaneous PDF + WhatsApp Notification ---
  const openPayoutModal = (technicianId: string, singleCommissionId?: string) => {
    const techSummary = techSummaries.find((s) => s.technician.id === technicianId);
    const pendingForTech = serviceCommissions
      .filter(
        (c) =>
          c.technicianId === technicianId &&
          Math.max(0, c.commissionAmountUSD - c.paidAmountUSD) > 0.005
      )
      .sort((a, b) => (a.workDate || a.createdAt).localeCompare(b.workDate || b.createdAt));

    const initialSelection = singleCommissionId
      ? [singleCommissionId]
      : pendingForTech.map((c) => c.id);

    setPayoutModalTechId(technicianId);
    setSelectedCommIds(initialSelection);
    setPayoutMode('SELECTED');
    const sumSelected = pendingForTech
      .filter((c) => initialSelection.includes(c.id))
      .reduce((acc, c) => acc + Math.max(0, c.commissionAmountUSD - c.paidAmountUSD), 0);
    setCustomPayoutAmountUSD((Math.round(sumSelected * 100) / 100).toFixed(2));
    setPayoutMethod('Dólares Efectivo (USD)');
    setPayoutReference('');
    setPayoutNotes('');
    setPayoutTechPhone(techSummary?.technician.phone || '');
    setPayoutModalError(null);
  };

  const payoutModalTech = useMemo(() => {
    if (!payoutModalTechId) return null;
    const summary = techSummaries.find((s) => s.technician.id === payoutModalTechId);
    return summary || null;
  }, [payoutModalTechId, techSummaries]);

  const payoutModalPendingComms = useMemo(() => {
    if (!payoutModalTechId) return [];
    return serviceCommissions
      .filter(
        (c) =>
          c.technicianId === payoutModalTechId &&
          Math.max(0, c.commissionAmountUSD - c.paidAmountUSD) > 0.005
      )
      .sort((a, b) => (a.workDate || a.createdAt).localeCompare(b.workDate || b.createdAt));
  }, [payoutModalTechId, serviceCommissions]);

  const totalPendingForModalTechUSD = useMemo(
    () =>
      Math.round(
        payoutModalPendingComms.reduce(
          (acc, c) => acc + Math.max(0, c.commissionAmountUSD - c.paidAmountUSD),
          0
        ) * 100
      ) / 100,
    [payoutModalPendingComms]
  );

  const selectedPendingSumUSD = useMemo(
    () =>
      Math.round(
        payoutModalPendingComms
          .filter((c) => selectedCommIds.includes(c.id))
          .reduce((acc, c) => acc + Math.max(0, c.commissionAmountUSD - c.paidAmountUSD), 0) * 100
      ) / 100,
    [payoutModalPendingComms, selectedCommIds]
  );

  const effectivePayNowUSD = useMemo(() => {
    if (payoutMode === 'SELECTED') return selectedPendingSumUSD;
    const normalized = String(customPayoutAmountUSD || '').replace(',', '.').trim();
    const parsed = parseFloat(normalized) || 0;
    return Math.min(totalPendingForModalTechUSD, Math.max(0, Math.round(parsed * 100) / 100));
  }, [payoutMode, selectedPendingSumUSD, customPayoutAmountUSD, totalPendingForModalTechUSD]);

  const projectedRemainingDebtUSD = Math.max(
    0,
    Math.round((totalPendingForModalTechUSD - effectivePayNowUSD) * 100) / 100
  );

  const nextPayoutNumber = useMemo(() => {
    const year = new Date().getFullYear();
    const maxSeq = technicianPayouts.reduce((max, p) => {
      const match = String(p.payoutNumber || '').match(/(\d+)$/);
      const num = match ? parseInt(match[1], 10) : 0;
      return num > max ? num : max;
    }, technicianPayouts.length);
    return `LIQ-${year}-${String(maxSeq + 1).padStart(4, '0')}`;
  }, [technicianPayouts]);

  const previewPayoutForWhatsApp = useMemo<TechnicianPayout | null>(() => {
    if (!payoutModalTech || effectivePayNowUSD <= 0) return null;

    const eligible =
      payoutMode === 'SELECTED'
        ? payoutModalPendingComms.filter((c) => selectedCommIds.includes(c.id))
        : payoutModalPendingComms;

    let remaining = effectivePayNowUSD;
    const items: TechnicianPayoutItem[] = [];
    for (const comm of eligible) {
      if (remaining <= 0.005) break;
      const pendingThis = Math.max(0, comm.commissionAmountUSD - comm.paidAmountUSD);
      const roundedPay = Math.round(Math.min(pendingThis, remaining) * 100) / 100;
      if (roundedPay <= 0) continue;
      const newPaid = Math.min(comm.commissionAmountUSD, Math.round((comm.paidAmountUSD + roundedPay) * 100) / 100);
      items.push({
        commissionId: comm.id,
        orderNumber: comm.orderNumber,
        motorcycleLabel: comm.motorcycleLabel,
        serviceDescription: comm.serviceDescription,
        baseAmountUSD: comm.baseAmountUSD,
        commissionRate: comm.commissionRate,
        commissionAmountUSD: comm.commissionAmountUSD,
        amountPaidInThisPayoutUSD: roundedPay,
        previousPaidUSD: comm.paidAmountUSD,
        remainingAfterPayoutUSD: Math.max(0, Math.round((comm.commissionAmountUSD - newPaid) * 100) / 100),
      });
      remaining = Math.round((remaining - roundedPay) * 100) / 100;
    }

    return {
      id: 'preview-payout',
      payoutNumber: nextPayoutNumber,
      technicianId: payoutModalTech.technician.id,
      technicianName: payoutModalTech.technician.name,
      technicianPhone: payoutTechPhone.trim() || payoutModalTech.technician.phone || '',
      technicianDocument: payoutModalTech.technician.documentId,
      amountUSD: effectivePayNowUSD,
      bcvRate,
      amountBs: Math.round(effectivePayNowUSD * bcvRate * 100) / 100,
      paymentMethod: payoutMethod,
      reference: payoutReference.trim() || undefined,
      notes: payoutNotes.trim() || undefined,
      commissionItems: items,
      totalPaidToTechnicianAfterPayoutUSD:
        Math.round((payoutModalTech.totalPaidUSD + effectivePayNowUSD) * 100) / 100,
      remainingDebtUSD: projectedRemainingDebtUSD,
      remainingDebtBs: Math.round(projectedRemainingDebtUSD * bcvRate * 100) / 100,
      createdAt: new Date().toISOString(),
    };
  }, [
    payoutModalTech,
    effectivePayNowUSD,
    payoutMode,
    payoutModalPendingComms,
    selectedCommIds,
    nextPayoutNumber,
    payoutTechPhone,
    bcvRate,
    payoutMethod,
    payoutReference,
    payoutNotes,
    projectedRemainingDebtUSD,
  ]);

  const previewWhatsAppLink = useMemo(() => {
    if (!previewPayoutForWhatsApp) return { message: '', url: '' };
    return buildTechnicianPayoutWhatsAppMessage(previewPayoutForWhatsApp, settings);
  }, [previewPayoutForWhatsApp, settings]);

  const triggerPayoutWhatsAppAndPdf = (payout: TechnicianPayout, autoDownloadPdfNow: boolean = false) => {
    if (autoDownloadPdfNow) {
      try {
        downloadTechnicianPayoutPDF(payout, settings);
      } catch (err) {
        console.warn('Error generando PDF de liquidación:', err);
      }
    }
    const { message, url } = buildTechnicianPayoutWhatsAppMessage(payout, settings);
    setWhatsappModalData({
      title: `Notificar Pago #${payout.payoutNumber}`,
      message,
      url,
      phone: payout.technicianPhone || '',
      recipientName: payout.technicianName,
      isTechnician: true,
      technicianPayout: payout,
      pdfFileName: `Factura_Comision_${payout.payoutNumber}.pdf`,
    });
  };

  const executePayoutCreation = (customNumber?: string): TechnicianPayout | null => {
    if (!payoutModalTechId) {
      setPayoutModalError('No se identificó el técnico seleccionado.');
      return null;
    }
    if (effectivePayNowUSD <= 0) {
      setPayoutModalError(
        payoutMode === 'SELECTED'
          ? 'Selecciona al menos una orden pendiente para pagar.'
          : 'Ingresa un monto válido mayor a $0.00.'
      );
      return null;
    }

    const createdPayout = payTechnicianCommissions({
      technicianId: payoutModalTechId,
      commissionIds: payoutMode === 'SELECTED' ? selectedCommIds : undefined,
      amountUSD: effectivePayNowUSD,
      paymentMethod: payoutMethod,
      reference: payoutReference.trim() || undefined,
      notes: payoutNotes.trim() || undefined,
      customPayoutNumber: customNumber,
      technicianPhoneOverride: payoutTechPhone.trim() || undefined,
    });

    if (!createdPayout) {
      setPayoutModalError(
        'No se pudo procesar el pago. Verifica que las órdenes seleccionadas tengan saldo pendiente.'
      );
      return null;
    }

    return createdPayout;
  };

  const handlePayAndDownloadPdfOnly = () => {
    setPayoutModalError(null);
    const createdPayout = executePayoutCreation();
    if (!createdPayout) return;

    setPayoutModalTechId(null);

    let pdfOk = true;
    try {
      downloadTechnicianPayoutPDF(createdPayout, settings);
    } catch (err) {
      pdfOk = false;
      console.error('Error descargando PDF de comisión:', err);
    }

    showToast(
      pdfOk
        ? `Pago #${createdPayout.payoutNumber} (${formatUSD(createdPayout.amountUSD)}) registrado y factura PDF descargada.`
        : `Pago #${createdPayout.payoutNumber} (${formatUSD(createdPayout.amountUSD)}) registrado correctamente. Puedes reintentar descargar el PDF desde Historial de Pagos.`,
      pdfOk ? 'success' : 'warning'
    );
  };

  const handlePayDownloadAndWhatsApp = (e: React.MouseEvent<HTMLAnchorElement>) => {
    setPayoutModalError(null);
    const createdPayout = executePayoutCreation(nextPayoutNumber);
    if (!createdPayout) {
      e.preventDefault();
      return;
    }

    setPayoutModalTechId(null);

    let pdfOk = true;
    try {
      downloadTechnicianPayoutPDF(createdPayout, settings);
    } catch (err) {
      pdfOk = false;
      console.error('Error descargando PDF de comisión:', err);
    }

    showToast(
      pdfOk
        ? `Pago #${createdPayout.payoutNumber} (${formatUSD(createdPayout.amountUSD)}) registrado. Factura PDF descargada y WhatsApp abierto para ${createdPayout.technicianName}.`
        : `Pago #${createdPayout.payoutNumber} (${formatUSD(createdPayout.amountUSD)}) registrado y WhatsApp abierto.`
    );
  };

  const previewNewCommUSD = useMemo(() => {
    const base = parseFloat(commForm.baseAmountUSD) || 0;
    const rate = parseFloat(commForm.commissionRate) || 0;
    return Math.round(base * (rate / 100) * 100) / 100;
  }, [commForm.baseAmountUSD, commForm.commissionRate]);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight font-display flex items-center gap-2.5">
            <BadgePercent className="w-7 h-7 text-amber-500 shrink-0" />
            <span>Comisiones de Técnicos y Taller</span>
          </h1>
          <p className="text-slate-500 text-sm mt-1">
            Control de técnicos, porcentajes por reparación, saldos pagados y pendientes, notificaciones WhatsApp y comprobantes en PDF.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={openCreateTechnicianModal}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-white border border-slate-300 hover:bg-slate-50 text-slate-800 text-xs font-bold shadow-2xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <UserPlus className="w-4 h-4 text-amber-600" />
            <span>Nuevo Técnico</span>
          </button>

          <button
            type="button"
            onClick={() => openCreateCommissionModal()}
            className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white text-xs font-bold shadow-sm transition-colors cursor-pointer whitespace-nowrap shrink-0"
          >
            <Plus className="w-4 h-4 text-amber-400" />
            <span>Registrar Comisión</span>
          </button>
        </div>
      </div>

      {/* Feedback Banner */}
      {feedbackBanner && (
        <div
          className={`rounded-xl px-4 py-3 border text-xs font-medium flex items-center justify-between gap-3 ${
            feedbackBanner.type === 'success'
              ? 'bg-emerald-50 border-emerald-200 text-emerald-900'
              : 'bg-amber-50 border-amber-200 text-amber-900'
          }`}
        >
          <div className="flex items-center gap-2">
            {feedbackBanner.type === 'success' ? (
              <CheckCircle2 className="w-4 h-4 text-emerald-600 shrink-0" />
            ) : (
              <AlertCircle className="w-4 h-4 text-amber-600 shrink-0" />
            )}
            <span>{feedbackBanner.text}</span>
          </div>
          <button
            type="button"
            onClick={() => setFeedbackBanner(null)}
            className="p-1 rounded hover:bg-black/5 cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Pendiente por Pagar</span>
            <Clock className="w-4 h-4 text-amber-600" />
          </div>
          <p className="text-2xl font-bold text-amber-700 font-mono tabular-nums mt-2">
            {formatUSD(pendingTechniciansCommissionUSD)}
          </p>
          <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500">
            <span className="font-mono tabular-nums">{formatBs(pendingTechniciansCommissionBs)}</span>
            <span className="font-semibold text-amber-700">
              {pendingCommissionsCount} orden(es)
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Total Pagado en Comisiones</span>
            <CheckCircle2 className="w-4 h-4 text-emerald-600" />
          </div>
          <p className="text-2xl font-bold text-emerald-700 font-mono tabular-nums mt-2">
            {formatUSD(totalPaidUSD)}
          </p>
          <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500">
            <span className="font-mono tabular-nums">{formatBs(totalPaidUSD * bcvRate)}</span>
            <span className="font-semibold text-emerald-700">
              {technicianPayouts.length} recibo(s)
            </span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Comisiones Generadas</span>
            <Wrench className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {formatUSD(totalGeneratedUSD)}
          </p>
          <div className="flex items-center justify-between mt-1.5 text-[11px] text-slate-500">
            <span className="font-mono tabular-nums">{formatBs(totalGeneratedUSD * bcvRate)}</span>
            <span>{serviceCommissions.length} registradas</span>
          </div>
        </div>

        <div className="bg-white rounded-2xl p-5 border border-slate-200 shadow-2xs">
          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
            <span>Técnicos Registrados</span>
            <Users className="w-4 h-4 text-slate-600" />
          </div>
          <p className="text-2xl font-bold text-slate-900 font-mono tabular-nums mt-2">
            {activeTechsCount} <span className="text-xs font-normal text-slate-400">/ {technicians.length} total</span>
          </p>
          <div className="mt-1.5 text-[11px] text-slate-500 flex items-center justify-between">
            <span>Tasa BCV: Bs. {bcvRate.toFixed(2)}</span>
            <button
              type="button"
              onClick={() => setActiveTab('directorio')}
              className="text-amber-700 font-semibold hover:underline cursor-pointer"
            >
              Ver técnicos
            </button>
          </div>
        </div>
      </div>

      {/* Sync Existing Service Orders Banner */}
      {unregisteredOrders.length > 0 && (
        <div className="bg-amber-50/90 border border-amber-200 rounded-2xl p-4 sm:p-5 space-y-3">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-800 flex items-center justify-center shrink-0">
                <RefreshCw className="w-5 h-5" />
              </div>
              <div>
                <h3 className="text-sm font-bold text-slate-900">
                  {unregisteredOrders.length} orden(es) de taller aún sin comisión registrada
                </h3>
                <p className="text-xs text-slate-600 mt-0.5">
                  Detectamos órdenes con mano de obra en taller ({completedUnregisteredCount} culminadas/entregadas). Impórtalas automáticamente asignando un porcentaje inicial o regístralas una por una.
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center gap-2 shrink-0">
              <label className="text-xs font-semibold text-slate-700 flex items-center gap-1.5 bg-white border border-amber-200 rounded-lg px-2.5 py-1.5">
                <span>% Inicial:</span>
                <input
                  type="number"
                  min="1"
                  max="100"
                  step="1"
                  value={syncDefaultRate}
                  onChange={(e) => setSyncDefaultRate(e.target.value)}
                  className="w-12 text-right font-mono font-bold text-slate-900 focus:outline-hidden"
                />
                <span>%</span>
              </label>

              <button
                type="button"
                onClick={handleSyncAllOrders}
                disabled={completedUnregisteredCount === 0}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer whitespace-nowrap"
              >
                <ClipboardCheck className="w-4 h-4" />
                <span>Importar Culminadas ({completedUnregisteredCount})</span>
              </button>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-2 pt-1">
            {unregisteredOrders.slice(0, 4).map((ord) => {
              const servicesSum = Array.isArray(ord.servicesList)
                ? ord.servicesList.reduce((acc, s) => acc + (Number(s.cost) || 0), 0)
                : 0;
              const base = Math.max(Number(ord.laborCost) || 0, servicesSum);
              return (
                <div
                  key={ord.id}
                  className="bg-white rounded-xl px-3.5 py-2.5 border border-amber-200/80 flex items-center justify-between gap-2 text-xs"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-mono font-bold text-slate-900">{ord.orderNumber}</span>
                      <span className="px-1.5 py-0.5 rounded bg-slate-100 text-slate-600 text-[10px] font-semibold">
                        {ord.status}
                      </span>
                    </div>
                    <p className="text-slate-600 truncate mt-0.5">
                      {ord.assignedTechnician?.trim() || 'Sin técnico'} · {ord.motorcycle.brand} {ord.motorcycle.model} · Base{' '}
                      <strong className="font-mono text-slate-900">{formatUSD(base)}</strong>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => handleQuickSyncOrder(ord)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white text-[11px] font-bold shrink-0 cursor-pointer whitespace-nowrap"
                  >
                    + Asignar Comisión
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Navigation Tabs + Filters */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3 border-b border-slate-200 pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          {[
            { id: 'tecnicos_saldos' as const, label: 'Saldos por Técnico', icon: Wallet },
            { id: 'comisiones' as const, label: `Órdenes y Comisiones (${serviceCommissions.length})`, icon: ClipboardCheck },
            { id: 'pagos' as const, label: `Historial de Pagos y PDF (${technicianPayouts.length})`, icon: History },
            { id: 'directorio' as const, label: `Técnicos y % (${technicians.length})`, icon: Users },
          ].map((tab) => {
            const Icon = tab.icon;
            const active = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                type="button"
                onClick={() => setActiveTab(tab.id)}
                className={`inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl text-xs font-bold transition-colors cursor-pointer whitespace-nowrap ${
                  active
                    ? 'bg-slate-900 text-white shadow-xs'
                    : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                }`}
              >
                <Icon className={`w-3.5 h-3.5 ${active ? 'text-amber-400' : 'text-slate-400'}`} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        {(activeTab === 'comisiones' || activeTab === 'pagos') && (
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="w-3.5 h-3.5 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder="Buscar orden, moto o técnico..."
                className="pl-8 pr-3 py-1.5 text-xs bg-white border border-slate-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-amber-500 w-52"
              />
            </div>

            <select
              value={filterTechId}
              onChange={(e) => setFilterTechId(e.target.value)}
              className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-medium text-slate-700"
            >
              <option value="ALL">Todos los técnicos</option>
              {technicians.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name} ({t.commissionRate}%)
                </option>
              ))}
            </select>

            {activeTab === 'comisiones' && (
              <select
                value={filterStatus}
                onChange={(e) => setFilterStatus(e.target.value as any)}
                className="px-2.5 py-1.5 text-xs bg-white border border-slate-200 rounded-lg font-medium text-slate-700"
              >
                <option value="ALL">Todos los estados</option>
                <option value="PENDIENTE">Pendientes</option>
                <option value="PARCIAL">Con Abono Parcial</option>
                <option value="PAGADO">Pagadas</option>
              </select>
            )}
          </div>
        )}
      </div>

      {/* TAB 1: SALDOS POR TÉCNICO */}
      {activeTab === 'tecnicos_saldos' && (
        <div className="space-y-4">
          {techSummaries.length === 0 ? (
            <div className="bg-white rounded-2xl border border-dashed border-slate-300 p-10 text-center space-y-3">
              <Users className="w-10 h-10 text-slate-300 mx-auto" />
              <h3 className="text-base font-bold text-slate-900">
                Aún no hay técnicos registrados
              </h3>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Registra a cada mecánico o tapicero del taller, asigna su porcentaje de comisión y su WhatsApp para llevar el control exacto de lo pagado y pendiente.
              </p>
              <button
                type="button"
                onClick={openCreateTechnicianModal}
                className="inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-amber-500 hover:bg-amber-600 text-slate-950 text-xs font-bold cursor-pointer"
              >
                <UserPlus className="w-4 h-4" />
                <span>Registrar Primer Técnico</span>
              </button>
            </div>
          ) : (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {techSummaries.map((item) => {
                const { technician, totalGeneratedUSD: gen, totalPaidUSD: paid, totalPendingUSD: pend } = item;
                const hasPending = pend > 0.01;
                const hasPhone = hasValidWhatsAppPhone(technician.phone);

                return (
                  <div
                    key={technician.id}
                    className="bg-white rounded-2xl border border-slate-200 p-5 shadow-2xs flex flex-col justify-between gap-4"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex items-center gap-2 flex-wrap">
                          <h3 className="text-base font-bold text-slate-900 truncate">
                            {technician.name}
                          </h3>
                          <span className="px-2 py-0.5 rounded-md bg-slate-900 text-amber-400 font-mono text-xs font-bold shrink-0">
                            {technician.commissionRate}% comisión
                          </span>
                          {!technician.active && (
                            <span className="px-2 py-0.5 rounded-md bg-slate-100 text-slate-500 text-[10px] font-semibold">
                              Inactivo
                            </span>
                          )}
                        </div>
                        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 mt-1">
                          <span>{technician.specialty || 'Mecánica General'}</span>
                          <span className="flex items-center gap-1 font-mono">
                            <Phone className="w-3 h-3" />
                            {hasPhone ? (
                              <span className="text-slate-700">{technician.phone}</span>
                            ) : (
                              <span className="text-amber-700 font-sans font-medium">Sin WhatsApp</span>
                            )}
                          </span>
                        </div>
                      </div>

                      <span
                        className={`px-2.5 py-1 rounded-lg text-[11px] font-bold shrink-0 ${
                          hasPending
                            ? 'bg-amber-100 text-amber-800'
                            : 'bg-emerald-100 text-emerald-800'
                        }`}
                      >
                        {hasPending ? `${item.pendingCount} por pagar` : 'Al día'}
                      </span>
                    </div>

                    {/* Financial Summary Strip */}
                    <div className="grid grid-cols-3 gap-2.5 bg-slate-50 rounded-xl p-3 border border-slate-200/70">
                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-slate-500 block">
                          Generado ({item.totalCommissionsCount})
                        </span>
                        <span className="text-sm font-bold text-slate-900 font-mono tabular-nums">
                          {formatUSD(gen)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-mono block truncate">
                          {formatBs(gen * bcvRate)}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-emerald-700 block">
                          Ya Pagado
                        </span>
                        <span className="text-sm font-bold text-emerald-700 font-mono tabular-nums">
                          {formatUSD(paid)}
                        </span>
                        <span className="text-[10px] text-emerald-600/80 font-mono block truncate">
                          {formatBs(paid * bcvRate)}
                        </span>
                      </div>

                      <div>
                        <span className="text-[10px] uppercase tracking-wider font-semibold text-amber-700 block">
                          Pendiente (Deuda)
                        </span>
                        <span
                          className={`text-sm font-bold font-mono tabular-nums ${
                            hasPending ? 'text-amber-700' : 'text-slate-400'
                          }`}
                        >
                          {formatUSD(pend)}
                        </span>
                        <span className="text-[10px] text-amber-700/80 font-mono block truncate">
                          {formatBs(pend * bcvRate)}
                        </span>
                      </div>
                    </div>

                    {/* Actions */}
                    <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => openEditTechnicianModal(technician)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                          <span>Editar %</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => openCreateCommissionModal(technician.id)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 text-xs font-semibold cursor-pointer whitespace-nowrap"
                        >
                          <Plus className="w-3.5 h-3.5 text-amber-600" />
                          <span>Agregar Trabajo</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setFilterTechId(technician.id);
                            setActiveTab('comisiones');
                          }}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-100 text-xs font-medium cursor-pointer whitespace-nowrap"
                        >
                          Ver detalle
                        </button>
                      </div>

                      <button
                        type="button"
                        disabled={!hasPending}
                        onClick={() => openPayoutModal(technician.id)}
                        className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-700 disabled:bg-slate-200 disabled:text-slate-400 text-white text-xs font-bold shadow-xs transition-colors cursor-pointer disabled:cursor-not-allowed whitespace-nowrap"
                      >
                        <Banknote className="w-4 h-4" />
                        <span>Pagar Comisión ({formatUSD(pend)})</span>
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 2: ÓRDENES Y COMISIONES DETALLADAS */}
      {activeTab === 'comisiones' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {filteredCommissions.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <ClipboardCheck className="w-9 h-9 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-800">No hay comisiones que coincidan</p>
              <p className="text-xs text-slate-500">
                Registra una comisión manualmente o importa órdenes de servicio desde el banner superior.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Orden / Fecha</th>
                    <th className="py-3 px-4">Técnico (%)</th>
                    <th className="py-3 px-4">Moto / Trabajo Realizado</th>
                    <th className="py-3 px-4 text-right">Base M.O.</th>
                    <th className="py-3 px-4 text-right">Comisión</th>
                    <th className="py-3 px-4 text-right">Pagado</th>
                    <th className="py-3 px-4 text-right">Pendiente</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredCommissions.map((comm) => {
                    const pending = Math.max(
                      0,
                      Math.round((comm.commissionAmountUSD - comm.paidAmountUSD) * 100) / 100
                    );
                    const dateStr = new Date(comm.workDate || comm.createdAt).toLocaleDateString(
                      'es-VE',
                      { day: '2-digit', month: '2-digit', year: 'numeric' }
                    );
                    return (
                      <tr key={comm.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-900 block">
                            {comm.orderNumber}
                          </span>
                          <span className="text-[11px] text-slate-400">{dateStr}</span>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-900 block">
                            {comm.technicianName}
                          </span>
                          <span className="inline-block px-1.5 py-0.5 rounded bg-slate-100 text-slate-700 font-mono text-[10px] font-bold mt-0.5">
                            {comm.commissionRate}%
                          </span>
                        </td>

                        <td className="py-3 px-4 max-w-xs">
                          <span className="font-semibold text-slate-800 block truncate">
                            {comm.motorcycleLabel}
                          </span>
                          <span className="text-[11px] text-slate-500 line-clamp-1">
                            {comm.serviceDescription}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-600 whitespace-nowrap">
                          {formatUSD(comm.baseAmountUSD)}
                        </td>

                        <td className="py-3 px-4 text-right font-mono tabular-nums font-bold text-slate-900 whitespace-nowrap">
                          {formatUSD(comm.commissionAmountUSD)}
                        </td>

                        <td className="py-3 px-4 text-right font-mono tabular-nums font-semibold text-emerald-700 whitespace-nowrap">
                          {formatUSD(comm.paidAmountUSD)}
                        </td>

                        <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className={`font-bold block ${pending > 0.01 ? 'text-amber-700' : 'text-slate-400'}`}>
                            {formatUSD(pending)}
                          </span>
                          {pending > 0.01 && (
                            <span className="text-[10px] text-slate-400 block">
                              {formatBs(pending * bcvRate)}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-center whitespace-nowrap">
                          <span
                            className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                              comm.status === 'PAGADO'
                                ? 'bg-emerald-100 text-emerald-800'
                                : comm.status === 'PARCIAL'
                                ? 'bg-sky-100 text-sky-800'
                                : 'bg-amber-100 text-amber-800'
                            }`}
                          >
                            {comm.status}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1">
                            {pending > 0.01 && (
                              <button
                                type="button"
                                onClick={() => openPayoutModal(comm.technicianId, comm.id)}
                                className="px-2.5 py-1 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                                title="Pagar esta comisión"
                              >
                                Pagar
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => openEditCommissionModal(comm)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-slate-800 hover:bg-slate-100 cursor-pointer"
                              title="Editar comisión o %"
                            >
                              <Edit3 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteComm(comm)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Eliminar comisión"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: HISTORIAL DE PAGOS Y FACTURAS PDF */}
      {activeTab === 'pagos' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {filteredPayouts.length === 0 ? (
            <div className="p-10 text-center space-y-2">
              <History className="w-9 h-9 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-800">Sin pagos de comisiones registrados aún</p>
              <p className="text-xs text-slate-500">
                Al pagar a un técnico se genera automáticamente su factura en PDF y notificación WhatsApp con el saldo pendiente restante.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Factura / Fecha</th>
                    <th className="py-3 px-4">Técnico</th>
                    <th className="py-3 px-4">Método / Referencia</th>
                    <th className="py-3 px-4">Órdenes Pagadas</th>
                    <th className="py-3 px-4 text-right">Pagado ($ / Bs)</th>
                    <th className="py-3 px-4 text-right">Deuda Restante Tras Pago</th>
                    <th className="py-3 px-4 text-right">PDF & WhatsApp</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredPayouts.map((payout) => {
                    const dateStr = new Date(payout.createdAt).toLocaleString('es-VE', {
                      day: '2-digit',
                      month: '2-digit',
                      year: 'numeric',
                      hour: '2-digit',
                      minute: '2-digit',
                    });
                    const hasDebt = payout.remainingDebtUSD > 0.01;
                    return (
                      <tr key={payout.id} className="hover:bg-slate-50/80 transition-colors">
                        <td className="py-3 px-4 whitespace-nowrap">
                          <span className="font-mono font-bold text-slate-900 block">
                            #{payout.payoutNumber}
                          </span>
                          <span className="text-[11px] text-slate-400">{dateStr}</span>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-semibold text-slate-900 block">
                            {payout.technicianName}
                          </span>
                          <span className="text-[11px] text-slate-500 font-mono">
                            {payout.technicianPhone || 'Sin teléfono'}
                          </span>
                        </td>

                        <td className="py-3 px-4">
                          <span className="font-medium text-slate-800 block">
                            {payout.paymentMethod}
                          </span>
                          {payout.reference && (
                            <span className="text-[11px] text-slate-500 font-mono">
                              Ref: {payout.reference}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4">
                          <span className="text-slate-700 font-medium block">
                            {payout.commissionItems.length} orden(es)
                          </span>
                          <span className="text-[11px] text-slate-400 line-clamp-1">
                            {payout.commissionItems.map((i) => i.orderNumber).join(', ')}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <span className="font-bold text-emerald-700 block">
                            {formatUSD(payout.amountUSD)}
                          </span>
                          <span className="text-[10px] text-slate-500 block">
                            {formatBs(payout.amountBs)}
                          </span>
                        </td>

                        <td className="py-3 px-4 text-right font-mono tabular-nums whitespace-nowrap">
                          <span
                            className={`font-bold block ${
                              hasDebt ? 'text-amber-700' : 'text-emerald-600'
                            }`}
                          >
                            {hasDebt ? formatUSD(payout.remainingDebtUSD) : '$0.00 (Al día)'}
                          </span>
                          {hasDebt && (
                            <span className="text-[10px] text-slate-400 block">
                              {formatBs(payout.remainingDebtBs)}
                            </span>
                          )}
                        </td>

                        <td className="py-3 px-4 text-right whitespace-nowrap">
                          <div className="inline-flex items-center gap-1.5">
                            <button
                              type="button"
                              onClick={() => triggerPayoutWhatsAppAndPdf(payout, false)}
                              className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                              title="Abrir notificación WhatsApp y descargar factura PDF"
                            >
                              <MessageSquare className="w-3.5 h-3.5" />
                              <span>WhatsApp + PDF</span>
                            </button>
                            <button
                              type="button"
                              onClick={() => {
                                try {
                                  downloadTechnicianPayoutPDF(payout, settings);
                                } catch (err) {
                                  console.error('Error descargando PDF:', err);
                                  showToast('No se pudo generar el PDF de este comprobante.', 'warning');
                                }
                              }}
                              className="p-1.5 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 cursor-pointer"
                              title="Descargar solo factura PDF"
                            >
                              <FileDown className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => setConfirmDeletePayout(payout)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                              title="Anular comprobante y revertir saldo pagado"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: DIRECTORIO DE TÉCNICOS */}
      {activeTab === 'directorio' && (
        <div className="bg-white rounded-2xl border border-slate-200 shadow-2xs overflow-hidden">
          {technicians.length === 0 ? (
            <div className="p-10 text-center space-y-3">
              <UserCheck className="w-9 h-9 text-slate-300 mx-auto" />
              <p className="text-sm font-bold text-slate-800">Directorio de Técnicos Vacío</p>
              <button
                type="button"
                onClick={openCreateTechnicianModal}
                className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-slate-900 text-white text-xs font-bold cursor-pointer"
              >
                <Plus className="w-4 h-4 text-amber-400" />
                <span>Registrar Técnico</span>
              </button>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 uppercase text-[10px] font-bold tracking-wider">
                  <tr>
                    <th className="py-3 px-4">Técnico</th>
                    <th className="py-3 px-4">Especialidad</th>
                    <th className="py-3 px-4">WhatsApp / Cédula</th>
                    <th className="py-3 px-4 text-center">% Comisión Asignado</th>
                    <th className="py-3 px-4 text-center">Estado</th>
                    <th className="py-3 px-4 text-right">Acciones</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {technicians.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-50/80 transition-colors">
                      <td className="py-3 px-4 font-bold text-slate-900">{t.name}</td>
                      <td className="py-3 px-4 text-slate-600">{t.specialty || 'Mecánica General'}</td>
                      <td className="py-3 px-4">
                        <span className="font-mono text-slate-800 block">
                          {t.phone || 'Sin teléfono'}
                        </span>
                        {t.documentId && (
                          <span className="text-[11px] text-slate-400 font-mono">{t.documentId}</span>
                        )}
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span className="px-2.5 py-1 rounded-lg bg-amber-100 text-amber-900 font-mono font-bold">
                          {t.commissionRate}%
                        </span>
                      </td>
                      <td className="py-3 px-4 text-center">
                        <span
                          className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                            t.active ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-500'
                          }`}
                        >
                          {t.active ? 'Activo' : 'Inactivo'}
                        </span>
                      </td>
                      <td className="py-3 px-4 text-right whitespace-nowrap">
                        <div className="inline-flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => openEditTechnicianModal(t)}
                            className="px-2.5 py-1 rounded-lg bg-white border border-slate-200 hover:bg-slate-50 text-slate-700 font-semibold cursor-pointer"
                          >
                            Editar
                          </button>
                          <button
                            type="button"
                            onClick={() => setConfirmDeleteTech(t)}
                            className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
                            title="Eliminar técnico"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* MODAL: CREAR / EDITAR TÉCNICO */}
      {isTechModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <UserPlus className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base">
                  {editingTech ? 'Editar Técnico y Porcentaje' : 'Registrar Nuevo Técnico'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsTechModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveTechnician} className="p-6 space-y-4 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Nombre Completo del Técnico *
                </label>
                <input
                  type="text"
                  required
                  value={techForm.name}
                  onChange={(e) => setTechForm({ ...techForm, name: e.target.value })}
                  placeholder="Ej. Nestor Toro"
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Porcentaje de Comisión (%) *
                  </label>
                  <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 px-3">
                    <input
                      type="number"
                      required
                      min="0"
                      max="100"
                      step="any"
                      value={techForm.commissionRate}
                      onChange={(e) => setTechForm({ ...techForm, commissionRate: e.target.value })}
                      className="w-full py-2.5 bg-transparent font-mono font-bold text-slate-900 focus:outline-none"
                    />
                    <span className="font-mono font-bold text-amber-600">%</span>
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    WhatsApp (Notificaciones)
                  </label>
                  <input
                    type="tel"
                    value={techForm.phone}
                    onChange={(e) => setTechForm({ ...techForm, phone: e.target.value })}
                    placeholder="Ej. 0414-1234567"
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-amber-500"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Cédula</label>
                  <input
                    type="text"
                    value={techForm.documentId}
                    onChange={(e) => setTechForm({ ...techForm, documentId: e.target.value })}
                    placeholder="V-12345678"
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Especialidad</label>
                  <select
                    value={techForm.specialty}
                    onChange={(e) => setTechForm({ ...techForm, specialty: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50"
                  >
                    {SPECIALTIES.map((sp) => (
                      <option key={sp} value={sp}>
                        {sp}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div className="flex items-center justify-between bg-slate-50 p-3 rounded-xl border border-slate-200">
                <span className="font-semibold text-slate-700">Técnico Activo en Taller</span>
                <input
                  type="checkbox"
                  checked={techForm.active}
                  onChange={(e) => setTechForm({ ...techForm, active: e.target.checked })}
                  className="w-4 h-4 accent-amber-500 cursor-pointer"
                />
              </div>

              {editingTech && (
                <label className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 p-3 rounded-xl cursor-pointer">
                  <input
                    type="checkbox"
                    checked={techForm.applyRateToPending}
                    onChange={(e) =>
                      setTechForm({ ...techForm, applyRateToPending: e.target.checked })
                    }
                    className="w-4 h-4 mt-0.5 accent-amber-600"
                  />
                  <span className="text-[11px] text-amber-900 leading-snug">
                    Actualizar también este nuevo porcentaje ({techForm.commissionRate}%) en sus órdenes pendientes sin abonos previos.
                  </span>
                </label>
              )}

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsTechModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                >
                  {editingTech ? 'Guardar Cambios' : 'Registrar Técnico'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: REGISTRAR / EDITAR COMISIÓN */}
      {isCommModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden max-h-[92vh] flex flex-col">
            <div className="bg-slate-900 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-2.5">
                <BadgePercent className="w-5 h-5 text-amber-400" />
                <h3 className="font-bold text-base">
                  {editingComm ? `Editar Comisión #${editingComm.orderNumber}` : 'Registrar Comisión de Servicio / Reparación'}
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setIsCommModalOpen(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-white cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveCommission} className="p-6 space-y-4 text-xs overflow-y-auto">
              {!editingComm && (
                <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                  <button
                    type="button"
                    onClick={() => setCommForm((p) => ({ ...p, sourceType: 'ORDER' }))}
                    className={`py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                      commForm.sourceType === 'ORDER'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Desde Orden de Taller
                  </button>
                  <button
                    type="button"
                    onClick={() => setCommForm((p) => ({ ...p, sourceType: 'MANUAL', serviceOrderId: '' }))}
                    className={`py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                      commForm.sourceType === 'MANUAL'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600'
                    }`}
                  >
                    Registro Manual / Reparación
                  </button>
                </div>
              )}

              {!editingComm && commForm.sourceType === 'ORDER' && (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Seleccionar Orden de Servicio
                  </label>
                  <select
                    value={commForm.serviceOrderId}
                    onChange={(e) => handleSelectOrderInCommForm(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-medium"
                  >
                    <option value="">-- Selecciona una orden --</option>
                    {unregisteredOrders.map((o) => {
                      const base = Math.max(
                        Number(o.laborCost) || 0,
                        (o.servicesList || []).reduce((a, s) => a + (Number(s.cost) || 0), 0)
                      );
                      return (
                        <option key={o.id} value={o.id}>
                          {o.orderNumber} · {o.motorcycle.brand} {o.motorcycle.model} · {o.assignedTechnician || 'Sin técnico'} · Base {formatUSD(base)}
                        </option>
                      );
                    })}
                  </select>
                </div>
              )}

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Técnico *</label>
                  <select
                    required
                    value={commForm.technicianId}
                    onChange={(e) => handleSelectTechInCommForm(e.target.value)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold"
                  >
                    <option value="">-- Seleccionar técnico --</option>
                    {technicians.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.commissionRate}%)
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Nº de Orden / Referencia</label>
                  <input
                    type="text"
                    required
                    value={commForm.orderNumber}
                    onChange={(e) => setCommForm({ ...commForm, orderNumber: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono font-bold"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Moto / Placa</label>
                  <input
                    type="text"
                    value={commForm.motorcycleLabel}
                    onChange={(e) => setCommForm({ ...commForm, motorcycleLabel: e.target.value })}
                    placeholder="Ej. Empire Horse · AA1B23"
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Fecha del Trabajo</label>
                  <input
                    type="date"
                    value={commForm.workDate}
                    onChange={(e) => setCommForm({ ...commForm, workDate: e.target.value })}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">
                  Descripción del Servicio / Reparación
                </label>
                <input
                  type="text"
                  required
                  value={commForm.serviceDescription}
                  onChange={(e) => setCommForm({ ...commForm, serviceDescription: e.target.value })}
                  placeholder="Ej. Reparación de motor, cambio de embrague y ajuste"
                  className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Base Mano de Obra (USD) *
                  </label>
                  <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 px-3">
                    <span className="font-mono font-bold text-slate-400 mr-1">$</span>
                    <input
                      type="number"
                      required
                      min="0"
                      step="any"
                      value={commForm.baseAmountUSD}
                      onChange={(e) => setCommForm({ ...commForm, baseAmountUSD: e.target.value })}
                      className="w-full py-2.5 bg-transparent font-mono font-bold text-slate-900 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    % Comisión Aplicado *
                  </label>
                  <div className="flex items-center border border-slate-200 rounded-xl bg-slate-50 px-3">
                    <input
                      type="number"
                      required
                      min="0"
                      max="100"
                      step="any"
                      value={commForm.commissionRate}
                      onChange={(e) => setCommForm({ ...commForm, commissionRate: e.target.value })}
                      className="w-full py-2.5 bg-transparent font-mono font-bold text-slate-900 focus:outline-none"
                    />
                    <span className="font-mono font-bold text-amber-600">%</span>
                  </div>
                </div>
              </div>

              {/* Commission Live Calculation */}
              <div className="bg-amber-50 border border-amber-200 rounded-xl p-3.5 flex items-center justify-between">
                <div>
                  <span className="text-[11px] font-bold text-amber-900 block">
                    Comisión Calculada para el Técnico
                  </span>
                  <span className="text-[11px] text-amber-700 font-mono">
                    {formatBs(previewNewCommUSD * bcvRate)} (BCV {bcvRate.toFixed(2)})
                  </span>
                </div>
                <span className="text-lg font-bold font-mono tabular-nums text-amber-900">
                  {formatUSD(previewNewCommUSD)}
                </span>
              </div>

              <div className="flex items-center justify-end gap-2 pt-2 border-t border-slate-100">
                <button
                  type="button"
                  onClick={() => setIsCommModalOpen(false)}
                  className="px-4 py-2 rounded-xl text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 rounded-xl bg-slate-900 hover:bg-slate-800 text-white font-bold cursor-pointer"
                >
                  {editingComm ? 'Guardar Cambios' : 'Registrar Comisión'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: PAGAR COMISIÓN AL TÉCNICO + PDF + NOTIFICACIÓN WHATSAPP */}
      {payoutModalTechId && payoutModalTech && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl overflow-hidden max-h-[92vh] flex flex-col">
            <div className="bg-emerald-600 px-6 py-4 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-white/15 flex items-center justify-center">
                  <Banknote className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-base leading-tight">
                    Pagar Comisión a {payoutModalTech.technician.name}
                  </h3>
                  <p className="text-emerald-100 text-xs mt-0.5">
                    Deuda total actual: <strong className="font-mono">{formatUSD(totalPendingForModalTechUSD)}</strong> ({formatBs(totalPendingForModalTechUSD * bcvRate)})
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPayoutModalTechId(null)}
                className="p-1.5 rounded-lg text-emerald-100 hover:text-white hover:bg-emerald-700 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-6 space-y-4 text-xs overflow-y-auto flex-1">
              {/* Mode switcher */}
              <div className="grid grid-cols-2 gap-2 bg-slate-100 p-1 rounded-xl">
                <button
                  type="button"
                  onClick={() => setPayoutMode('SELECTED')}
                  className={`py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                    payoutMode === 'SELECTED'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  Seleccionar Órdenes ({selectedCommIds.length})
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPayoutMode('CUSTOM');
                    setCustomPayoutAmountUSD(String(totalPendingForModalTechUSD));
                  }}
                  className={`py-2 rounded-lg font-bold transition-colors cursor-pointer ${
                    payoutMode === 'CUSTOM'
                      ? 'bg-white text-slate-900 shadow-2xs'
                      : 'text-slate-600'
                  }`}
                >
                  Monto Personalizado / Abono
                </button>
              </div>

              {payoutMode === 'SELECTED' ? (
                <div className="space-y-2 max-h-48 overflow-y-auto pr-1">
                  {payoutModalPendingComms.map((c) => {
                    const pend = Math.max(0, c.commissionAmountUSD - c.paidAmountUSD);
                    const checked = selectedCommIds.includes(c.id);
                    return (
                      <label
                        key={c.id}
                        className={`flex items-center justify-between gap-3 p-3 rounded-xl border cursor-pointer transition-colors ${
                          checked
                            ? 'bg-emerald-50/70 border-emerald-300'
                            : 'bg-slate-50 border-slate-200 hover:bg-slate-100/70'
                        }`}
                      >
                        <div className="flex items-start gap-2.5 min-w-0">
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedCommIds((prev) => [...prev, c.id]);
                              } else {
                                setSelectedCommIds((prev) => prev.filter((id) => id !== c.id));
                              }
                            }}
                            className="w-4 h-4 mt-0.5 accent-emerald-600"
                          />
                          <div className="min-w-0">
                            <span className="font-mono font-bold text-slate-900 block">
                              {c.orderNumber} · {c.motorcycleLabel}
                            </span>
                            <span className="text-[11px] text-slate-500 block truncate">
                              {c.serviceDescription} ({c.commissionRate}% sobre {formatUSD(c.baseAmountUSD)})
                            </span>
                          </div>
                        </div>
                        <span className="font-mono font-bold text-emerald-700 shrink-0">
                          {formatUSD(pend)}
                        </span>
                      </label>
                    );
                  })}
                </div>
              ) : (
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Monto del Abono / Pago en USD (Máximo {formatUSD(totalPendingForModalTechUSD)})
                  </label>
                  <div className="flex items-center border border-slate-300 rounded-xl bg-slate-50 px-3">
                    <span className="font-mono font-bold text-slate-500 mr-1.5">$</span>
                    <input
                      type="text"
                      inputMode="decimal"
                      value={customPayoutAmountUSD}
                      onChange={(e) => {
                        setPayoutModalError(null);
                        setCustomPayoutAmountUSD(e.target.value);
                      }}
                      placeholder="0.00"
                      className="w-full py-2.5 bg-transparent font-mono font-bold text-base text-slate-900 focus:outline-none"
                    />
                  </div>
                  <p className="text-[11px] text-slate-500 mt-1">
                    Se descontará automáticamente de las órdenes más antiguas hasta cubrir el monto ingresado.
                  </p>
                </div>
              )}

              {/* Payment method + reference */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Método de Pago</label>
                  <select
                    value={payoutMethod}
                    onChange={(e) => setPayoutMethod(e.target.value as PaymentMethod)}
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-semibold"
                  >
                    {PAYMENT_METHODS.map((m) => (
                      <option key={m} value={m}>
                        {m}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    Nº Referencia / Comprobante
                  </label>
                  <input
                    type="text"
                    value={payoutReference}
                    onChange={(e) => setPayoutReference(e.target.value)}
                    placeholder="Opcional (ej. Pago Móvil #8412)"
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">
                    WhatsApp del Técnico (para notificación)
                  </label>
                  <input
                    type="tel"
                    value={payoutTechPhone}
                    onChange={(e) => setPayoutTechPhone(e.target.value)}
                    placeholder="Ej: 0412-1234567"
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50 font-mono"
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Notas del Pago (opcional)</label>
                  <input
                    type="text"
                    value={payoutNotes}
                    onChange={(e) => setPayoutNotes(e.target.value)}
                    placeholder="Ej. Liquidación semanal de taller"
                    className="w-full p-2.5 rounded-xl border border-slate-200 bg-slate-50"
                  />
                </div>
              </div>

              {/* Live Preview of Paid Now vs Remaining Owed */}
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-slate-600">Total a pagar hoy (#{nextPayoutNumber}):</span>
                  <div className="text-right font-mono tabular-nums">
                    <span className="text-base font-bold text-emerald-700 block">
                      {formatUSD(effectivePayNowUSD)}
                    </span>
                    <span className="text-[11px] text-slate-500">
                      {formatBs(effectivePayNowUSD * bcvRate)}
                    </span>
                  </div>
                </div>
                <div className="border-t border-slate-200 pt-2 flex items-center justify-between">
                  <span className="font-semibold text-slate-600">
                    Saldo que se le seguirá debiendo:
                  </span>
                  <div className="text-right font-mono tabular-nums">
                    <span
                      className={`text-sm font-bold block ${
                        projectedRemainingDebtUSD > 0.01 ? 'text-amber-700' : 'text-emerald-700'
                      }`}
                    >
                      {projectedRemainingDebtUSD > 0.01
                        ? formatUSD(projectedRemainingDebtUSD)
                        : '$0.00 (Cuenta al día)'}
                    </span>
                    {projectedRemainingDebtUSD > 0.01 && (
                      <span className="text-[11px] text-amber-700/80">
                        {formatBs(projectedRemainingDebtUSD * bcvRate)}
                      </span>
                    )}
                  </div>
                </div>
              </div>

              {payoutModalError && (
                <div className="rounded-xl border border-rose-200 bg-rose-50 px-3.5 py-2.5 text-rose-800 flex items-center gap-2 font-medium">
                  <AlertCircle className="w-4 h-4 text-rose-600 shrink-0" />
                  <span>{payoutModalError}</span>
                </div>
              )}
            </div>

            <div className="p-4 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-2">
              <button
                type="button"
                onClick={handlePayAndDownloadPdfOnly}
                className={`px-3.5 py-2.5 rounded-xl border border-slate-300 bg-white hover:bg-slate-50 text-slate-800 text-xs font-bold cursor-pointer inline-flex items-center gap-1.5 ${
                  effectivePayNowUSD <= 0 ? 'opacity-50' : ''
                }`}
              >
                <FileDown className="w-4 h-4 text-slate-600" />
                <span>Pagar y Descargar PDF</span>
              </button>

              {effectivePayNowUSD > 0 && previewWhatsAppLink.url ? (
                <a
                  href={previewWhatsAppLink.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  onClick={handlePayDownloadAndWhatsApp}
                  className="px-4 py-2.5 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold shadow-sm cursor-pointer inline-flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Pagar, Descargar PDF y Enviar WhatsApp</span>
                  <ExternalLink className="w-3.5 h-3.5 opacity-80" />
                </a>
              ) : (
                <button
                  type="button"
                  onClick={() =>
                    setPayoutModalError(
                      payoutMode === 'SELECTED'
                        ? 'Selecciona al menos una orden pendiente para pagar.'
                        : 'Ingresa un monto válido mayor a $0.00.'
                    )
                  }
                  className="px-4 py-2.5 rounded-xl bg-emerald-600/50 text-white text-xs font-bold cursor-not-allowed inline-flex items-center gap-2"
                >
                  <MessageSquare className="w-4 h-4" />
                  <span>Pagar, Descargar PDF y Enviar WhatsApp</span>
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE TECHNICIAN */}
      {confirmDeleteTech && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6 space-y-4 text-xs">
            <h4 className="text-base font-bold text-slate-900">¿Eliminar Técnico?</h4>
            <p className="text-slate-600 leading-relaxed">
              Vas a eliminar a <strong>{confirmDeleteTech.name}</strong> del directorio de técnicos. Sus comisiones ya registradas conservarán el historial.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteTech(null)}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteTechnician(confirmDeleteTech.id);
                  setConfirmDeleteTech(null);
                  showToast('Técnico eliminado del directorio.');
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE COMMISSION */}
      {confirmDeleteComm && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6 space-y-4 text-xs">
            <h4 className="text-base font-bold text-slate-900">¿Eliminar Registro de Comisión?</h4>
            <p className="text-slate-600 leading-relaxed">
              Se eliminará la comisión de la orden <strong>{confirmDeleteComm.orderNumber}</strong> ({confirmDeleteComm.technicianName}).
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteComm(null)}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteServiceCommission(confirmDeleteComm.id);
                  setConfirmDeleteComm(null);
                  showToast('Registro de comisión eliminado.');
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
              >
                Sí, eliminar
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRM DELETE PAYOUT */}
      {confirmDeletePayout && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-xl border border-slate-200 max-w-sm w-full p-6 space-y-4 text-xs">
            <h4 className="text-base font-bold text-slate-900">¿Anular Comprobante #{confirmDeletePayout.payoutNumber}?</h4>
            <p className="text-slate-600 leading-relaxed">
              Al anular este pago de <strong>{formatUSD(confirmDeletePayout.amountUSD)}</strong> a {confirmDeletePayout.technicianName}, las órdenes cubiertas volverán a figurar como pendientes por pagar.
            </p>
            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => setConfirmDeletePayout(null)}
                className="px-4 py-2 rounded-lg text-slate-600 hover:bg-slate-100 font-semibold cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={() => {
                  deleteTechnicianPayout(confirmDeletePayout.id, true);
                  setConfirmDeletePayout(null);
                  showToast('Pago anulado y saldos pendientes restaurados.');
                }}
                className="px-4 py-2 rounded-lg bg-rose-600 hover:bg-rose-700 text-white font-bold cursor-pointer"
              >
                Sí, anular pago
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
