import React, { useState, useMemo, useEffect, useRef } from 'react';
import { useApp } from '../../context/AppContext';
import {
  Product,
  ProductCategory,
  WholesaleDiscountTier,
  productTracksInventory,
  DEFAULT_PRODUCTION_TIME_LABEL,
  DEFAULT_PRODUCTION_TIME_NOTE,
  PRODUCT_UNIT_OF_MEASURE_OPTIONS,
  getProductUnitInfo,
  isPresetUnitOfMeasure,
} from '../../types';
import { formatUSD, formatBs } from '../../utils/whatsapp';
import {
  calculateProductPricing,
  suggestPriceFromTargetProfit,
  ProfitCalcMode,
  round2,
  round4,
} from '../../utils/pricing';
import {
  Boxes,
  Plus,
  Search,
  AlertTriangle,
  CheckCircle2,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  X,
  Image as ImageIcon,
  Sparkles,
  FileSpreadsheet,
  Download,
  UploadCloud,
  Barcode,
  MapPin,
  Camera,
  Upload,
  Loader2,
  Link2,
  Lock,
  Calculator,
  TrendingUp,
  Bike,
  Check,
  Star,
  ChevronLeft,
  ChevronRight,
  Clock,
  Percent,
  Ruler,
} from 'lucide-react';
import {
  normalizeImageUrl,
  isGoogleDriveUrl,
  isEmbeddedImageUrl,
  isFirebaseStorageImageUrl,
  isUploadedImageUrl,
  PRESET_PRODUCT_IMAGES,
  getFallbackProductImage,
  handleProductImageError,
  MAX_PRODUCT_IMAGES,
  getProductImages,
  hasAnyEmbeddedImage,
} from '../../utils/imageUrl';
import {
  uploadImageToFirebaseStorage,
  isBase64ImageUrl,
} from '../../services/storageService';
import { doesProductMatchModelCategory } from '../../utils/modelCategories';
import { downloadInventoryTemplate, exportInventoryToExcel, ParsedProductRow } from '../../utils/excelInventory';
import { ImportExcelModal } from './ImportExcelModal';
import {
  normalizeWholesaleTiers,
  productHasWholesaleTiers,
  SUGGESTED_WHOLESALE_TIERS,
} from '../../utils/wholesalePricing';
import { buildProductShareUrl, copyTextToClipboard } from '../../utils/productLinks';

export const InventoryView: React.FC = () => {
  const {
    products,
    categories,
    addCategory,
    modelCategories,
    addModelCategory,
    renameModelCategory,
    deleteModelCategory,
    assignModelCategoryToProducts,
    addProduct,
    updateProduct,
    deleteProduct,
    deleteProducts,
    adjustStock,
    bulkImportProducts,
    settings,
    exchangeGap,
    setCurrentView,
    publicStoreUrl,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [selectedModelCategory, setSelectedModelCategory] = useState<string>('all');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'low' | 'out' | 'made_to_order'>('all');
  const [filterPhotoStatus, setFilterPhotoStatus] = useState<'all' | 'missing' | 'uploaded'>('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [copiedLinkProductId, setCopiedLinkProductId] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const [isManageModelsModalOpen, setIsManageModelsModalOpen] = useState(false);
  const [newModelCategoryInput, setNewModelCategoryInput] = useState('');
  const [editingModelName, setEditingModelName] = useState<string | null>(null);
  const [editingModelDraft, setEditingModelDraft] = useState('');
  const [batchModelTarget, setBatchModelTarget] = useState<string>('');
  const [isAddingInlineModel, setIsAddingInlineModel] = useState(false);
  const [newInlineModelName, setNewInlineModelName] = useState('');

  const rate = settings.bcvRate;
  const usdtRate = exchangeGap.usdtRate;

  const handleBulkImportConfirmed = (parsedRows: ParsedProductRow[]) => {
    const result = bulkImportProducts(parsedRows);
    showToast(`✓ Carga completada: ${result.added} repuestos nuevos creados, ${result.updated} actualizados.`);
  };

  const handleCopyProductLink = async (product: Product) => {
    const url = buildProductShareUrl(product, publicStoreUrl);
    await copyTextToClipboard(url);
    setCopiedLinkProductId(product.id);
    showToast(`✓ Link copiado para "${product.name}"`);
    setTimeout(() => {
      setCopiedLinkProductId((prev) => (prev === product.id ? null : prev));
    }, 2200);
  };

  // Form State (un solo costo en Divisas + dos precios de venta: $ BCV Tienda y $ Ref. Divisas Solo Admin)
  const initialFormState = {
    sku: '',
    barcode: '',
    name: '',
    category: 'Frenos' as ProductCategory,
    description: '',
    costPrice: 0, // Costo único en divisas ($ USD)
    salePrice: 0, // Precio de Venta en Dólares a Tasa BCV (visible en Tienda Online y Facturas)
    salePriceRefUSD: 0, // SOLO ADMIN: Precio de Venta de Referencia en Divisas
    targetProfitPct: 30,
    unitOfMeasure: 'UNIDAD',
    customUnitOfMeasure: '',
    stock: 10,
    minStock: 2,
    tracksInventory: true,
    productionTimeLabel: DEFAULT_PRODUCTION_TIME_LABEL,
    productionTimeNote: DEFAULT_PRODUCTION_TIME_NOTE,
    brand: '',
    compatibility: '',
    modelCategories: [] as string[],
    warehouseLocation: '',
    imageUrl: '',
    imageUrls: [] as string[],
    wholesaleTiers: [] as WholesaleDiscountTier[],
  };
  const [formData, setFormData] = useState(initialFormState);
  const [newPhotoUrlInput, setNewPhotoUrlInput] = useState('');
  const [syncBsWithGap, setSyncBsWithGap] = useState(true);
  const [targetProfitMode, setTargetProfitMode] = useState<ProfitCalcMode>('margin');
  const [targetProfitInput, setTargetProfitInput] = useState<string>('30');
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const [sortOrder, setSortOrder] = useState<'asc' | 'desc'>('asc');

  const filteredProducts = useMemo(() => {
    const filtered = products.filter((p) => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (
        selectedModelCategory !== 'all' &&
        !doesProductMatchModelCategory(p, selectedModelCategory)
      ) {
        return false;
      }
      const tracksInv = productTracksInventory(p);
      if (filterStockStatus === 'low' && (!tracksInv || p.stock > p.minStock)) return false;
      if (filterStockStatus === 'out' && (!tracksInv || p.stock > 0)) return false;
      if (filterStockStatus === 'made_to_order' && tracksInv) return false;
      if (filterPhotoStatus === 'uploaded' && !hasAnyEmbeddedImage(p)) return false;
      if (filterPhotoStatus === 'missing' && hasAnyEmbeddedImage(p)) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        const modelMatch = Array.isArray(p.modelCategories)
          ? p.modelCategories.some((m) => m.toLowerCase().includes(q))
          : false;
        return (
          p.name.toLowerCase().includes(q) ||
          (p.description && p.description.toLowerCase().includes(q)) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.warehouseLocation && p.warehouseLocation.toLowerCase().includes(q)) ||
          p.brand.toLowerCase().includes(q) ||
          p.compatibility.toLowerCase().includes(q) ||
          modelMatch
        );
      }

      return true;
    });

    return [...filtered].sort((a, b) => {
      const cmp = a.name
        .trim()
        .localeCompare(b.name.trim(), 'es', { sensitivity: 'base', numeric: true });
      if (cmp !== 0) {
        return sortOrder === 'asc' ? cmp : -cmp;
      }
      return a.sku.trim().localeCompare(b.sku.trim(), 'es', { sensitivity: 'base', numeric: true });
    });
  }, [
    products,
    selectedCategory,
    selectedModelCategory,
    filterStockStatus,
    filterPhotoStatus,
    searchTerm,
    sortOrder,
  ]);

  // Paginación del inventario (25, 50, 75 o 100 artículos por página)
  const PAGE_SIZE_OPTIONS = [25, 50, 75, 100] as const;
  const [pageSize, setPageSize] = useState<number>(() => {
    try {
      const saved = Number(localStorage.getItem('servimotos_inventory_page_size'));
      return PAGE_SIZE_OPTIONS.includes(saved as (typeof PAGE_SIZE_OPTIONS)[number]) ? saved : 25;
    } catch {
      return 25;
    }
  });
  const [currentPage, setCurrentPage] = useState<number>(1);
  const inventoryListTopRef = useRef<HTMLDivElement | null>(null);

  const handleChangePageSize = (nextSize: number) => {
    setPageSize(nextSize);
    setCurrentPage(1);
    try {
      localStorage.setItem('servimotos_inventory_page_size', String(nextSize));
    } catch {
      // ignore storage errors
    }
  };

  useEffect(() => {
    setCurrentPage(1);
  }, [
    searchTerm,
    selectedCategory,
    selectedModelCategory,
    filterStockStatus,
    filterPhotoStatus,
    sortOrder,
  ]);

  const totalPages = Math.max(1, Math.ceil(filteredProducts.length / pageSize));
  const safeCurrentPage = Math.min(currentPage, totalPages);

  useEffect(() => {
    if (currentPage > totalPages) {
      setCurrentPage(totalPages);
    }
  }, [currentPage, totalPages]);

  const paginatedProducts = useMemo(() => {
    const startIdx = (safeCurrentPage - 1) * pageSize;
    return filteredProducts.slice(startIdx, startIdx + pageSize);
  }, [filteredProducts, safeCurrentPage, pageSize]);

  const pageRangeStart =
    filteredProducts.length === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1;
  const pageRangeEnd = Math.min(safeCurrentPage * pageSize, filteredProducts.length);

  const visiblePageNumbers = useMemo<(number | 'ellipsis')[]>(() => {
    if (totalPages <= 7) {
      return Array.from({ length: totalPages }, (_, i) => i + 1);
    }
    const pages: (number | 'ellipsis')[] = [1];
    const start = Math.max(2, safeCurrentPage - 1);
    const end = Math.min(totalPages - 1, safeCurrentPage + 1);
    if (start > 2) pages.push('ellipsis');
    for (let i = start; i <= end; i++) pages.push(i);
    if (end < totalPages - 1) pages.push('ellipsis');
    pages.push(totalPages);
    return pages;
  }, [totalPages, safeCurrentPage]);

  const handleGoToPage = (page: number, shouldScrollTop = true) => {
    const clamped = Math.max(1, Math.min(page, totalPages));
    setCurrentPage(clamped);
    if (shouldScrollTop && inventoryListTopRef.current) {
      inventoryListTopRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  };

  const [imagePreviewError, setImagePreviewError] = useState(false);
  const [isCompressingUpload, setIsCompressingUpload] = useState(false);
  const [quickUploadingId, setQuickUploadingId] = useState<string | null>(null);
  const [isDraggingPhoto, setIsDraggingPhoto] = useState(false);
  const [showUrlInputInModal, setShowUrlInputInModal] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const pendingOwnPhotoCount = useMemo(
    () => products.filter((p) => !hasAnyEmbeddedImage(p)).length,
    [products]
  );

  const showToast = (msg: string) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const handleConfirmSingleDelete = () => {
    if (!productToDelete) return;
    const deletedName = productToDelete.name;
    const deletedId = productToDelete.id;
    deleteProduct(deletedId);
    setSelectedProductIds((prev) => prev.filter((id) => id !== deletedId));
    setProductToDelete(null);
    showToast(`✓ Repuesto "${deletedName}" eliminado correctamente.`);
  };

  const handleConfirmBatchDelete = () => {
    if (selectedProductIds.length === 0) return;
    const count = selectedProductIds.length;
    deleteProducts(selectedProductIds);
    setSelectedProductIds([]);
    setIsBatchDeleteModalOpen(false);
    showToast(`✓ ${count} repuestos eliminados del inventario.`);
  };

  const allPageSelected =
    paginatedProducts.length > 0 &&
    paginatedProducts.every((p) => selectedProductIds.includes(p.id));

  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selectedProductIds.includes(p.id));

  const handleToggleSelectAllPage = () => {
    if (allPageSelected) {
      const pageIdSet = new Set(paginatedProducts.map((p) => p.id));
      setSelectedProductIds((prev) => prev.filter((id) => !pageIdSet.has(id)));
    } else {
      const newIds = new Set([...selectedProductIds, ...paginatedProducts.map((p) => p.id)]);
      setSelectedProductIds(Array.from(newIds));
    }
  };

  const handleSelectAllFiltered = () => {
    setSelectedProductIds(filteredProducts.map((p) => p.id));
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleStartEdit = (product: Product) => {
    const pricing = calculateProductPricing(product, rate, usdtRate);
    const normalizedDivisasCost =
      pricing.referenceCostUSD > 0 ? pricing.referenceCostUSD : product.costPrice;
    setEditingProduct(product);
    setImagePreviewError(false);
    setUploadError(null);
    setShowUrlInputInModal(false);
    setFormError(null);
    setIsAddingCategory(false);
    setNewCategoryName('');
    setIsAddingInlineModel(false);
    setNewInlineModelName('');
    setNewPhotoUrlInput('');
    setSyncBsWithGap(false);
    setTargetProfitInput(String(product.targetProfitPct ?? 30));
    const existingImages = getProductImages(product, false);
    const rawUnit = (product.unitOfMeasure || '').trim();
    const isPresetUnit = isPresetUnitOfMeasure(rawUnit);
    setFormData({
      sku: product.sku,
      barcode: product.barcode || '',
      name: product.name,
      category: product.category,
      description: product.description,
      costPrice: normalizedDivisasCost,
      salePrice: product.salePrice,
      salePriceRefUSD: pricing.salePriceRefUSD,
      targetProfitPct: product.targetProfitPct ?? 30,
      unitOfMeasure: isPresetUnit ? (rawUnit.toUpperCase() || 'UNIDAD') : 'CUSTOM',
      customUnitOfMeasure: isPresetUnit ? '' : rawUnit,
      stock: product.stock,
      minStock: product.minStock,
      tracksInventory: productTracksInventory(product),
      productionTimeLabel: product.productionTimeLabel || DEFAULT_PRODUCTION_TIME_LABEL,
      productionTimeNote: product.productionTimeNote || DEFAULT_PRODUCTION_TIME_NOTE,
      brand: product.brand,
      compatibility: product.compatibility,
      modelCategories: Array.isArray(product.modelCategories) ? [...product.modelCategories] : [],
      warehouseLocation: product.warehouseLocation || '',
      imageUrl: existingImages[0] || '',
      imageUrls: existingImages,
      wholesaleTiers: normalizeWholesaleTiers(product.wholesaleTiers),
    });
  };

  // Cálculo en tiempo real dentro del formulario Crear / Editar repuesto
  const formPricing = useMemo(() => {
    const costUSD = Math.max(0, Number(formData.costPrice) || 0);
    const saleUsdBcv = Math.max(0, Number(formData.salePrice) || 0);
    const saleBsBcv = round2(saleUsdBcv * rate);
    const analysis = calculateProductPricing(
      {
        costPrice: costUSD,
        costCurrencyOrigin: 'DIVISAS',
        costPriceBs: round2(costUSD * usdtRate),
        referenceCostUSD: costUSD,
        salePrice: saleUsdBcv,
        salePriceRefUSD: formData.salePriceRefUSD,
        salePriceBsBcv: saleBsBcv,
      },
      rate,
      usdtRate
    );
    return { costUSD, saleBsBcv, analysis };
  }, [formData.costPrice, formData.salePrice, formData.salePriceRefUSD, rate, usdtRate]);

  const handleSalePriceRefUsdChange = (raw: string) => {
    const val = Math.max(0, parseFloat(raw) || 0);
    setFormData((prev) => {
      if (syncBsWithGap) {
        const nextBs = round2(val * usdtRate);
        const nextUsdBcv = rate > 0 ? round2(nextBs / rate) : val;
        return {
          ...prev,
          salePriceRefUSD: val,
          salePrice: nextUsdBcv,
        };
      }
      return {
        ...prev,
        salePriceRefUSD: val,
      };
    });
  };

  const handleSalePriceUsdBcvChange = (raw: string) => {
    const usdBcv = Math.max(0, parseFloat(raw) || 0);
    const nextBs = round2(usdBcv * rate);
    const nextRefUsd = usdtRate > 0 ? round2(nextBs / usdtRate) : usdBcv;
    setFormData((prev) => ({
      ...prev,
      salePrice: usdBcv,
      ...(syncBsWithGap ? { salePriceRefUSD: nextRefUsd } : {}),
    }));
  };

  const handleApplyTargetProfitSuggestion = () => {
    const pct = parseFloat(targetProfitInput);
    if (isNaN(pct) || pct < 0) return;
    const suggested = suggestPriceFromTargetProfit({
      referenceCostUSD: formPricing.costUSD,
      targetPct: pct,
      mode: targetProfitMode,
      bcvRate: rate,
      usdtRate,
    });
    setFormData((prev) => ({
      ...prev,
      salePriceRefUSD: suggested.salePriceRefUSD,
      salePrice: suggested.salePriceUsdBcv,
      targetProfitPct: pct,
    }));
  };

  const syncFormPhotos = (nextPhotos: string[]) => {
    const cleaned = nextPhotos.filter(Boolean).slice(0, MAX_PRODUCT_IMAGES);
    setFormData((prev) => ({
      ...prev,
      imageUrls: cleaned,
      imageUrl: cleaned[0] || '',
    }));
  };

  const handleAddExternalPhotoUrl = () => {
    const converted = normalizeImageUrl(newPhotoUrlInput);
    if (!converted) return;
    setImagePreviewError(false);
    setUploadError(null);
    setFormData((prev) => {
      const current = Array.isArray(prev.imageUrls) && prev.imageUrls.length > 0
        ? prev.imageUrls
        : prev.imageUrl
        ? [prev.imageUrl]
        : [];
      if (current.length >= MAX_PRODUCT_IMAGES) {
        setUploadError(`Máximo ${MAX_PRODUCT_IMAGES} fotos por repuesto. Elimina una para agregar otra.`);
        return prev;
      }
      if (current.includes(converted)) {
        return prev;
      }
      const next = [...current, converted];
      return { ...prev, imageUrls: next, imageUrl: next[0] || '' };
    });
    setNewPhotoUrlInput('');
  };

  const processSelectedModalFiles = async (files: FileList | File[]) => {
    const fileArray = Array.from(files || []);
    if (fileArray.length === 0) return;

    const validImageFiles = fileArray.filter((f) => f.type.startsWith('image/'));
    if (validImageFiles.length === 0) {
      setUploadError('Selecciona archivos de imagen válidos (JPG, PNG o WebP).');
      return;
    }

    const currentPhotos =
      Array.isArray(formData.imageUrls) && formData.imageUrls.length > 0
        ? formData.imageUrls
        : formData.imageUrl
        ? [formData.imageUrl]
        : [];
    const remainingSlots = MAX_PRODUCT_IMAGES - currentPhotos.length;
    if (remainingSlots <= 0) {
      setUploadError(`Ya tienes el máximo de ${MAX_PRODUCT_IMAGES} fotos. Elimina una para agregar más.`);
      return;
    }

    const filesToProcess = validImageFiles.slice(0, remainingSlots);
    setUploadError(
      validImageFiles.length > remainingSlots
        ? `Solo se agregaron ${remainingSlots} foto(s) para respetar el límite de ${MAX_PRODUCT_IMAGES} por repuesto.`
        : null
    );
    setIsCompressingUpload(true);
    try {
      const uploadedUrls: string[] = [];
      const prefix = formData.sku.trim() || formData.name.trim() || editingProduct?.id || 'producto';
      for (const file of filesToProcess) {
        const storageUrl = await uploadImageToFirebaseStorage(file, 'products', prefix, 1080, 0.82);
        uploadedUrls.push(storageUrl);
      }
      setImagePreviewError(false);
      setFormData((prev) => {
        const base =
          Array.isArray(prev.imageUrls) && prev.imageUrls.length > 0
            ? prev.imageUrls
            : prev.imageUrl
            ? [prev.imageUrl]
            : [];
        const cleanBase = base.filter((u) => !isBase64ImageUrl(u));
        const merged = [...cleanBase, ...uploadedUrls].slice(0, MAX_PRODUCT_IMAGES);
        return {
          ...prev,
          imageUrls: merged,
          imageUrl: merged[0] || '',
        };
      });
    } catch (err: any) {
      setUploadError(err?.message || 'No se pudieron subir las fotos a Firebase Storage.');
    } finally {
      setIsCompressingUpload(false);
    }
  };

  const handleSetPrimaryPhoto = (index: number) => {
    const current =
      Array.isArray(formData.imageUrls) && formData.imageUrls.length > 0
        ? [...formData.imageUrls]
        : formData.imageUrl
        ? [formData.imageUrl]
        : [];
    if (index <= 0 || index >= current.length) return;
    const [picked] = current.splice(index, 1);
    syncFormPhotos([picked, ...current]);
  };

  const handleMovePhoto = (index: number, delta: -1 | 1) => {
    const current =
      Array.isArray(formData.imageUrls) && formData.imageUrls.length > 0
        ? [...formData.imageUrls]
        : formData.imageUrl
        ? [formData.imageUrl]
        : [];
    const target = index + delta;
    if (target < 0 || target >= current.length) return;
    [current[index], current[target]] = [current[target], current[index]];
    syncFormPhotos(current);
  };

  const handleRemovePhoto = (index: number) => {
    const current =
      Array.isArray(formData.imageUrls) && formData.imageUrls.length > 0
        ? [...formData.imageUrls]
        : formData.imageUrl
        ? [formData.imageUrl]
        : [];
    current.splice(index, 1);
    syncFormPhotos(current);
    setImagePreviewError(false);
    setUploadError(null);
  };

  const handleLocalImageUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;
    await processSelectedModalFiles(files);
  };

  const handleQuickRowImageUpload = async (
    product: Product,
    e: React.ChangeEvent<HTMLInputElement>
  ) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    e.target.value = '';
    if (files.length === 0) return;
    const validFiles = files.filter((f) => f.type.startsWith('image/'));
    if (validFiles.length === 0) {
      showToast('⚠️ Selecciona archivos de imagen válidos (JPG, PNG o WebP).');
      return;
    }

    const existingPhotos = getProductImages(product, false);
    const keepExisting = existingPhotos.filter(
      (u) => isFirebaseStorageImageUrl(u) && !isBase64ImageUrl(u)
    );
    const remainingSlots = MAX_PRODUCT_IMAGES - keepExisting.length;
    if (remainingSlots <= 0) {
      showToast(`⚠️ "${product.name}" ya tiene el máximo de ${MAX_PRODUCT_IMAGES} fotos. Edítalo para reemplazar o quitar alguna.`);
      return;
    }

    setQuickUploadingId(product.id);
    try {
      const uploaded: string[] = [];
      const prefix = product.sku || product.id || product.name;
      for (const file of validFiles.slice(0, remainingSlots)) {
        const storageUrl = await uploadImageToFirebaseStorage(file, 'products', prefix, 1080, 0.82);
        uploaded.push(storageUrl);
      }
      const nextImages = [...keepExisting, ...uploaded].slice(0, MAX_PRODUCT_IMAGES);
      updateProduct(product.id, {
        imageUrl: nextImages[0],
        imageUrls: nextImages,
      });
      showToast(
        uploaded.length === 1
          ? `✓ Foto subida a Firebase Storage para "${product.name}" (${nextImages.length} foto${nextImages.length > 1 ? 's' : ''}).`
          : `✓ ${uploaded.length} fotos subidas a Firebase Storage para "${product.name}" (${nextImages.length} en total).`
      );
    } catch (err: any) {
      showToast(`⚠️ ${err?.message || 'No se pudo subir la imagen a Firebase Storage.'}`);
    } finally {
      setQuickUploadingId((prev) => (prev === product.id ? null : prev));
    }
  };

  const normalizedFormSku = formData.sku.trim().toLowerCase();
  const duplicateSkuProduct = useMemo(() => {
    if (!normalizedFormSku) return null;
    return (
      products.find(
        (p) =>
          p.id !== editingProduct?.id &&
          (p.sku || '').trim().toLowerCase() === normalizedFormSku
      ) || null
    );
  }, [products, normalizedFormSku, editingProduct]);

  const handleCreateCategory = () => {
    const trimmed = newCategoryName.trim();
    if (!trimmed) return;
    const result = addCategory(trimmed);
    setFormData((prev) => ({ ...prev, category: result.category }));
    setIsAddingCategory(false);
    setNewCategoryName('');
    showToast(
      result.added
        ? `✓ Categoría "${result.category}" agregada y seleccionada.`
        : `✓ Categoría "${result.category}" seleccionada.`
    );
  };

  const handleToggleFormModelCategory = (modelName: string) => {
    setFormData((prev) => {
      const current = Array.isArray(prev.modelCategories) ? prev.modelCategories : [];
      const exists = current.some((m) => m.toLowerCase() === modelName.toLowerCase());
      const next = exists
        ? current.filter((m) => m.toLowerCase() !== modelName.toLowerCase())
        : [...current, modelName];
      return { ...prev, modelCategories: next };
    });
  };

  const handleCreateInlineModelCategory = () => {
    const trimmed = newInlineModelName.trim();
    if (!trimmed) return;
    const res = addModelCategory(trimmed);
    if (res.modelCategory) {
      setFormData((prev) => {
        const current = Array.isArray(prev.modelCategories) ? prev.modelCategories : [];
        if (current.some((m) => m.toLowerCase() === res.modelCategory.toLowerCase())) {
          return prev;
        }
        return { ...prev, modelCategories: [...current, res.modelCategory] };
      });
      showToast(
        res.added
          ? `✓ Modelo "${res.modelCategory}" creado y asignado al repuesto.`
          : `✓ Modelo "${res.modelCategory}" asignado al repuesto.`
      );
    }
    setNewInlineModelName('');
    setIsAddingInlineModel(false);
  };

  const handleAddModelFromManager = () => {
    const trimmed = newModelCategoryInput.trim();
    if (!trimmed) return;
    const res = addModelCategory(trimmed);
    setNewModelCategoryInput('');
    showToast(
      res.added
        ? `✓ Modelo "${res.modelCategory}" agregado al filtro de la tienda online.`
        : `El modelo "${res.modelCategory}" ya existe.`
    );
  };

  const handleSaveRenameModel = (oldName: string) => {
    const trimmed = editingModelDraft.trim();
    if (!trimmed) return;
    const res = renameModelCategory(oldName, trimmed);
    if (res.updated) {
      if (selectedModelCategory === oldName) {
        setSelectedModelCategory(res.modelCategory);
      }
      showToast(`✓ Modelo renombrado a "${res.modelCategory}".`);
    }
    setEditingModelName(null);
    setEditingModelDraft('');
  };

  const handleDeleteModelFromManager = (modelName: string) => {
    deleteModelCategory(modelName);
    if (selectedModelCategory === modelName) {
      setSelectedModelCategory('all');
    }
    showToast(`Modelo "${modelName}" eliminado del filtro.`);
  };

  const handleBatchAssignModel = () => {
    if (!batchModelTarget || selectedProductIds.length === 0) return;
    assignModelCategoryToProducts(selectedProductIds, batchModelTarget, 'add');
    showToast(
      `✓ Modelo "${batchModelTarget}" asignado a ${selectedProductIds.length} repuesto(s).`
    );
    setBatchModelTarget('');
  };

  const handleSaveProduct = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmedSku = formData.sku.trim();
    const trimmedName = formData.name.trim();

    if (!trimmedName || !trimmedSku) {
      setFormError('Por favor ingresa nombre y código SKU del repuesto.');
      return;
    }

    const existingDup = products.find(
      (p) =>
        p.id !== editingProduct?.id &&
        (p.sku || '').trim().toLowerCase() === trimmedSku.toLowerCase()
    );
    if (existingDup) {
      setFormError(
        `⚠️ El código SKU "${trimmedSku}" ya está registrado en el inventario (${existingDup.name} • Stock: ${existingDup.stock}). No se permiten códigos repetidos.`
      );
      return;
    }
    setFormError(null);

    let categoryToSave = formData.category;
    if (isAddingCategory && newCategoryName.trim()) {
      const catResult = addCategory(newCategoryName);
      categoryToSave = catResult.category;
    }

    const normalizedGallery = Array.from(
      new Set(
        [
          ...(Array.isArray(formData.imageUrls) ? formData.imageUrls : []),
          ...(formData.imageUrl.trim() ? [formData.imageUrl.trim()] : []),
        ]
          .map((u) => normalizeImageUrl(u))
          .filter((u) => Boolean(u) && !isBase64ImageUrl(u))
      )
    ).slice(0, MAX_PRODUCT_IMAGES);

    let finalImageUrl = normalizedGallery[0] || '';
    if (!finalImageUrl && trimmedName.toLowerCase().includes('maleta')) {
      finalImageUrl = PRESET_PRODUCT_IMAGES.maletaParaMoto;
    }
    if (!finalImageUrl) {
      finalImageUrl = PRESET_PRODUCT_IMAGES.brakeKit;
    }
    const finalImageUrls =
      normalizedGallery.length > 0 ? normalizedGallery : [finalImageUrl];

    const sanitizedBarcode = formData.barcode.trim() || undefined;
    const sanitizedLocation = formData.warehouseLocation.trim() || undefined;

    const finalCostDivisas = round2(Math.max(0, Number(formData.costPrice) || 0));
    const finalSalePriceUsdBcv = round4(Math.max(0, Number(formData.salePrice) || 0));
    const finalSalePriceBsBcv = round2(finalSalePriceUsdBcv * rate);
    const finalSalePriceRefUSD =
      formData.salePriceRefUSD > 0
        ? round2(formData.salePriceRefUSD)
        : usdtRate > 0
        ? round2(finalSalePriceBsBcv / usdtRate)
        : round2(finalSalePriceUsdBcv);

    const resolvedUnitOfMeasure =
      formData.unitOfMeasure === 'CUSTOM'
        ? formData.customUnitOfMeasure.trim() || 'UNIDAD'
        : formData.unitOfMeasure || 'UNIDAD';

    const payloadToSave: Omit<Product, 'id'> = {
      sku: trimmedSku,
      barcode: sanitizedBarcode,
      name: trimmedName,
      category: categoryToSave,
      description: formData.description,
      costPrice: finalCostDivisas,
      costCurrencyOrigin: 'DIVISAS',
      costPriceBs: round2(finalCostDivisas * usdtRate),
      referenceCostUSD: finalCostDivisas,
      salePrice: finalSalePriceUsdBcv,
      salePriceRefUSD: finalSalePriceRefUSD,
      salePriceBsBcv: finalSalePriceBsBcv,
      targetProfitPct: parseFloat(targetProfitInput) || formData.targetProfitPct,
      unitOfMeasure: resolvedUnitOfMeasure,
      tracksInventory: formData.tracksInventory,
      productionTimeLabel: !formData.tracksInventory
        ? (formData.productionTimeLabel || '').trim() || DEFAULT_PRODUCTION_TIME_LABEL
        : undefined,
      productionTimeNote: !formData.tracksInventory
        ? (formData.productionTimeNote || '').trim() || DEFAULT_PRODUCTION_TIME_NOTE
        : undefined,
      stock: formData.tracksInventory ? Math.max(0, Number(formData.stock) || 0) : 0,
      minStock: formData.tracksInventory ? Math.max(0, Number(formData.minStock) || 0) : 0,
      brand: formData.brand,
      compatibility: formData.compatibility,
      modelCategories:
        Array.isArray(formData.modelCategories) && formData.modelCategories.length > 0
          ? formData.modelCategories
          : [],
      warehouseLocation: sanitizedLocation,
      imageUrl: finalImageUrl,
      imageUrls: finalImageUrls,
      wholesaleTiers: normalizeWholesaleTiers(formData.wholesaleTiers),
    };

    if (editingProduct) {
      updateProduct(editingProduct.id, payloadToSave);
      showToast(`✓ Repuesto "${trimmedName}" actualizado.`);
      setEditingProduct(null);
    } else {
      addProduct(payloadToSave);
      showToast(`✓ Nuevo repuesto "${trimmedName}" registrado.`);
      setIsAddModalOpen(false);
    }

    setFormData(initialFormState);
    setNewPhotoUrlInput('');
    setIsAddingCategory(false);
    setNewCategoryName('');
    setIsAddingInlineModel(false);
    setNewInlineModelName('');
    setImagePreviewError(false);
  };

  const inventoryMetrics = useMemo(() => {
    let totalSaleBcvUSD = 0;
    let totalRefCostUSD = 0;
    let totalSaleRefUSD = 0;
    let lowOrNegMarginCount = 0;

    products.forEach((p) => {
      const pricing = calculateProductPricing(p, rate, usdtRate);
      if (productTracksInventory(p)) {
        totalSaleBcvUSD += p.salePrice * p.stock;
        totalRefCostUSD += pricing.referenceCostUSD * p.stock;
        totalSaleRefUSD += pricing.salePriceRefUSD * p.stock;
      }
      if (pricing.status === 'negative' || pricing.status === 'low') {
        lowOrNegMarginCount += 1;
      }
    });

    return {
      totalSaleBcvUSD,
      totalRefCostUSD,
      totalSaleRefUSD,
      lowOrNegMarginCount,
    };
  }, [products, rate, usdtRate]);

  const outOfStockCount = products.filter((p) => productTracksInventory(p) && p.stock === 0).length;
  const madeToOrderCount = products.filter((p) => !productTracksInventory(p)).length;

  return (
    <div className="space-y-6">
      {/* Header & Inventory Summary */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <span className="text-xs font-bold text-amber-600 uppercase tracking-wider">
            Control de Almacén y Sincronización
          </span>
          <h1 className="text-2xl font-bold font-display text-slate-900 mt-0.5">
            Inventario de Repuestos ($ USD y Bs BCV)
          </h1>
          <p className="text-xs text-slate-500">
            Valores en dólares calculados a tasa oficial BCV (Bs. {rate.toFixed(2)}). Los ítems con stock &gt; 0 y los artículos bajo pedido (sin inventario) se muestran en la tienda online; los agotados con inventario se ocultan.
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2 self-start sm:self-auto">
          {/* Exportar Plantilla Excel */}
          <button
            type="button"
            onClick={downloadInventoryTemplate}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Descargar plantilla de Excel preformateada para ingresar inventario"
          >
            <Download className="w-3.5 h-3.5 text-amber-600" />
            <span>Plantilla Excel</span>
          </button>

          {/* Exportar Inventario Actual */}
          <button
            type="button"
            onClick={() => exportInventoryToExcel(products, rate)}
            className="px-3 py-2 bg-white hover:bg-slate-50 text-slate-700 font-semibold text-xs rounded-xl border border-slate-200 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Exportar inventario actual a hoja de cálculo Excel (.xlsx)"
          >
            <FileSpreadsheet className="w-3.5 h-3.5 text-emerald-600" />
            <span>Exportar Excel</span>
          </button>

          {/* Carga Masiva desde Excel */}
          <button
            type="button"
            onClick={() => setIsImportModalOpen(true)}
            className="px-3 py-2 bg-emerald-600 hover:bg-emerald-700 text-white font-semibold text-xs rounded-xl shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Cargar repuestos masivamente con un archivo Excel (.xlsx o .csv)"
          >
            <UploadCloud className="w-3.5 h-3.5 text-emerald-200" />
            <span>Importar Excel</span>
          </button>

          {/* Gestionar Modelos de Motos Especializados */}
          <button
            type="button"
            onClick={() => {
              setEditingModelName(null);
              setNewModelCategoryInput('');
              setIsManageModelsModalOpen(true);
            }}
            className="px-3 py-2 bg-amber-50 hover:bg-amber-100 text-amber-900 font-bold text-xs rounded-xl border border-amber-300 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Gestionar los modelos de motos especializados para el filtro de la tienda online"
          >
            <Bike className="w-3.5 h-3.5 text-amber-600" />
            <span>Modelos de Motos ({modelCategories.length})</span>
          </button>

          {/* Configurar Precios al Mayor por Repuesto (Tienda Online) */}
          <button
            type="button"
            onClick={() => setCurrentView('admin_mayorista')}
            className="px-3 py-2 bg-emerald-50 hover:bg-emerald-100 text-emerald-900 font-bold text-xs rounded-xl border border-emerald-300 shadow-2xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Configurar descuentos por volumen (venta al mayor) por repuesto específico"
          >
            <Percent className="w-3.5 h-3.5 text-emerald-700" />
            <span>
              Precios al Mayor ({products.filter((p) => productHasWholesaleTiers(p)).length})
            </span>
          </button>

          {/* Nuevo Repuesto Individual */}
          <button
            onClick={() => {
              setFormData(initialFormState);
              setSyncBsWithGap(true);
              setTargetProfitInput('30');
              setFormError(null);
              setUploadError(null);
              setImagePreviewError(false);
              setShowUrlInputInModal(false);
              setIsAddingCategory(false);
              setNewCategoryName('');
              setIsAddingInlineModel(false);
              setNewInlineModelName('');
              setIsAddModalOpen(true);
            }}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Nuevo Repuesto ($)</span>
          </button>
        </div>
      </div>

      {/* KPI Stats & Brecha Cambiaria BCV vs Binance (Admin Only) */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-slate-900 text-white p-4 rounded-xl border border-amber-500/40 shadow-2xs">
          <div className="flex items-center justify-between">
            <span className="text-[10px] uppercase font-bold text-amber-300 tracking-wider">
              Brecha BCV vs Binance
            </span>
            <TrendingUp className="w-3.5 h-3.5 text-amber-400" />
          </div>
          <div className="flex items-baseline gap-2 mt-1">
            <span className="text-xl font-black font-mono text-amber-400">
              {exchangeGap.gapPct >= 0 ? '+' : ''}
              {exchangeGap.gapPct.toFixed(2)}%
            </span>
            <span className="text-[11px] font-mono text-slate-400">
              (×{exchangeGap.gapFactor.toFixed(3)})
            </span>
          </div>
          <p className="text-[11px] font-mono text-slate-300 mt-1">
            BCV {formatBs(rate)} · Binance {formatBs(usdtRate)}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            Catálogo Activo en Tienda
          </span>
          <p className="text-xl font-bold font-mono text-emerald-600 mt-1">
            {products.length - outOfStockCount}{' '}
            <span className="text-xs font-normal text-slate-500">visibles</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">
            {outOfStockCount} agotado(s) ocultos
            {madeToOrderCount > 0 ? ` · ${madeToOrderCount} bajo pedido` : ' automáticamente'}
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-emerald-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-emerald-700 tracking-wider">
            Valorización Venta (BCV · Tienda)
          </span>
          <p className="text-xl font-black font-mono text-emerald-800 mt-1">
            {formatUSD(inventoryMetrics.totalSaleBcvUSD)}{' '}
            <span className="text-[11px] font-bold text-emerald-600">BCV</span>
          </p>
          <p className="text-[11px] font-mono text-slate-500 mt-0.5">
            {formatBs(inventoryMetrics.totalSaleBcvUSD * rate)} ·{' '}
            <span className="text-amber-700 font-semibold">
              Ref. Admin: {formatUSD(inventoryMetrics.totalSaleRefUSD)}
            </span>
          </p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            Costo Total (Divisas) &amp; Margen
          </span>
          <p className="text-xl font-bold font-mono text-slate-900 mt-1">
            {formatUSD(inventoryMetrics.totalRefCostUSD)}
          </p>
          <p className="text-[11px] mt-0.5 font-medium">
            {inventoryMetrics.lowOrNegMarginCount > 0 ? (
              <span className="text-amber-700 font-semibold">
                {inventoryMetrics.lowOrNegMarginCount} ítem(s) con margen bajo/negativo
              </span>
            ) : (
              <span className="text-emerald-700 font-semibold">
                Todos los ítems en rango saludable
              </span>
            )}
          </p>
        </div>
      </div>

      {/* Direct Photo Upload Quick Tip */}
      {pendingOwnPhotoCount > 0 && (
        <div className="bg-slate-900 text-white rounded-xl p-3.5 shadow-2xs flex flex-wrap items-center justify-between gap-3 border border-slate-800">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-amber-500/20 border border-amber-400/30 flex items-center justify-center text-amber-400 shrink-0">
              <Camera className="w-4 h-4" />
            </div>
            <div className="text-xs">
              <p className="font-bold text-white">
                Sube las fotos directo a cada repuesto (sin depender de Google Drive)
              </p>
              <p className="text-[11px] text-slate-300">
                Haz clic en la miniatura o en el botón <strong className="text-amber-400">Subir foto</strong> de cualquier repuesto en la tabla. Se optimizan y guardan al instante para todos tus clientes.
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() =>
              setFilterPhotoStatus((prev) => (prev === 'missing' ? 'all' : 'missing'))
            }
            className={`px-3 py-1.5 rounded-lg text-[11px] font-bold transition-colors cursor-pointer shrink-0 ${
              filterPhotoStatus === 'missing'
                ? 'bg-amber-500 text-slate-950'
                : 'bg-white/10 hover:bg-white/20 text-amber-300 border border-white/15'
            }`}
          >
            {filterPhotoStatus === 'missing'
              ? `Mostrando pendientes (${pendingOwnPhotoCount}) • Ver todos`
              : `Filtrar pendientes de foto (${pendingOwnPhotoCount})`}
          </button>
        </div>
      )}

      {/* Filters & Search Toolbar */}
      <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-2xs space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="relative flex-1">
            <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por SKU, código de barra, nombre, marca, moto o ubicación en almacén..."
              className="w-full pl-10 pr-4 py-2 text-xs rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
            />
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 font-medium"
            >
              <option value="all">Todas las categorías</option>
              {categories.map((c) => (
                <option key={c} value={c}>
                  {c}
                </option>
              ))}
            </select>

            <select
              value={selectedModelCategory}
              onChange={(e) => setSelectedModelCategory(e.target.value)}
              className={`text-xs p-2 rounded-lg border font-medium ${
                selectedModelCategory !== 'all'
                  ? 'border-amber-400 bg-amber-50 text-amber-950 font-bold'
                  : 'border-slate-200 bg-slate-50 text-slate-700'
              }`}
            >
              <option value="all">Todos los modelos de moto</option>
              {modelCategories.map((mc) => (
                <option key={mc} value={mc}>
                  🏍️ {mc}
                </option>
              ))}
            </select>

            <select
              value={filterStockStatus}
              onChange={(e) => setFilterStockStatus(e.target.value as any)}
              className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 font-medium"
            >
              <option value="all">Todo el stock</option>
              <option value="low">Stock bajo / crítico</option>
              <option value="out">Agotados (Stock 0)</option>
              <option value="made_to_order">Bajo pedido / Sin inventario ({madeToOrderCount})</option>
            </select>

            <select
              value={filterPhotoStatus}
              onChange={(e) => setFilterPhotoStatus(e.target.value as any)}
              className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 font-medium"
            >
              <option value="all">Todas las fotos</option>
              <option value="missing">Sin foto subida ({pendingOwnPhotoCount})</option>
              <option value="uploaded">Con foto directa ({products.length - pendingOwnPhotoCount})</option>
            </select>
          </div>
        </div>
      </div>

      {/* Batch Selection Action Bar */}
      {selectedProductIds.length > 0 && (
        <div className="bg-amber-50 border border-amber-300 rounded-xl p-3 flex flex-wrap items-center justify-between gap-3 shadow-xs">
          <div className="flex items-center gap-2.5">
            <span className="w-6 h-6 rounded-full bg-amber-500 text-slate-950 font-bold text-xs flex items-center justify-center">
              {selectedProductIds.length}
            </span>
            <span className="text-xs font-bold text-slate-900">
              {selectedProductIds.length === 1
                ? '1 repuesto seleccionado'
                : `${selectedProductIds.length} repuestos seleccionados`}
            </span>
            {allPageSelected && !allFilteredSelected && filteredProducts.length > paginatedProducts.length && (
              <button
                type="button"
                onClick={handleSelectAllFiltered}
                className="text-xs font-bold text-amber-800 hover:text-amber-950 underline cursor-pointer"
              >
                Seleccionar todos los {filteredProducts.length} filtrados
              </button>
            )}
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Asignación masiva a Modelo de Moto */}
            <div className="flex items-center gap-1.5 bg-white border border-amber-300 rounded-lg p-1">
              <Bike className="w-3.5 h-3.5 text-amber-600 ml-1 shrink-0" />
              <select
                value={batchModelTarget}
                onChange={(e) => setBatchModelTarget(e.target.value)}
                className="text-xs bg-transparent font-medium text-slate-800 focus:outline-hidden pr-1"
              >
                <option value="">Asignar modelo de moto...</option>
                {modelCategories.map((mc) => (
                  <option key={mc} value={mc}>
                    {mc}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={handleBatchAssignModel}
                disabled={!batchModelTarget}
                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-[11px] rounded-md transition-colors cursor-pointer whitespace-nowrap"
              >
                Asignar
              </button>
            </div>

            <button
              onClick={() => setSelectedProductIds([])}
              className="px-3 py-1.5 text-xs text-slate-600 hover:text-slate-900 hover:bg-amber-100 rounded-lg transition-colors cursor-pointer font-medium"
            >
              Deseleccionar
            </button>
            <button
              onClick={() => setIsBatchDeleteModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-3.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-lg shadow-xs transition-colors cursor-pointer"
            >
              <Trash2 className="w-3.5 h-3.5" />
              <span>Eliminar seleccionados ({selectedProductIds.length})</span>
            </button>
          </div>
        </div>
      )}

      {/* Paginated Full-Visibility Inventory List (Zero Horizontal Scroll) */}
      <div
        ref={inventoryListTopRef}
        className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden"
      >
        {/* Top List Toolbar: Select Page, Sort, Range Counter & Page Size (25 / 50 / 75 / 100) */}
        <div className="px-4 py-3 bg-slate-50 border-b border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
          <div className="flex flex-wrap items-center gap-3">
            <label className="inline-flex items-center gap-2 cursor-pointer select-none font-semibold text-slate-700">
              <input
                type="checkbox"
                checked={allPageSelected}
                onChange={handleToggleSelectAllPage}
                className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer w-4 h-4"
                title={allPageSelected ? 'Deseleccionar esta página' : 'Seleccionar todos los artículos de esta página'}
              />
              <span>Página ({paginatedProducts.length})</span>
            </label>

            <span className="text-slate-300" aria-hidden="true">|</span>

            <button
              type="button"
              onClick={() => setSortOrder((prev) => (prev === 'asc' ? 'desc' : 'asc'))}
              className="inline-flex items-center gap-1.5 text-slate-700 hover:text-slate-950 transition-colors cursor-pointer font-semibold"
              title="Cambiar orden alfabético (A-Z / Z-A)"
            >
              <span>Orden:</span>
              <span className="px-1.5 py-0.5 rounded bg-amber-100 text-amber-900 font-bold text-[11px]">
                {sortOrder === 'asc' ? 'A-Z' : 'Z-A'}
              </span>
            </button>

            <span className="text-slate-300 hidden sm:inline" aria-hidden="true">|</span>

            <span className="text-slate-600 tabular-nums">
              Mostrando{' '}
              <strong className="text-slate-900">
                {pageRangeStart}–{pageRangeEnd}
              </strong>{' '}
              de <strong className="text-slate-900">{filteredProducts.length}</strong> artículos
            </span>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Selector de artículos por página: 25, 50, 75, 100 */}
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] font-semibold text-slate-500 whitespace-nowrap">
                Por página:
              </span>
              <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
                {PAGE_SIZE_OPTIONS.map((size) => (
                  <button
                    key={size}
                    type="button"
                    onClick={() => handleChangePageSize(size)}
                    className={`px-2.5 py-1 rounded-md text-xs font-mono font-bold transition-colors cursor-pointer tabular-nums ${
                      pageSize === size
                        ? 'bg-slate-900 text-white shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                    }`}
                    title={`Mostrar ${size} artículos por página`}
                  >
                    {size}
                  </button>
                ))}
              </div>
            </div>

            {/* Navegación rápida superior de páginas */}
            {totalPages > 1 && (
              <div className="flex items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleGoToPage(safeCurrentPage - 1, false)}
                  disabled={safeCurrentPage <= 1}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Página anterior"
                  title="Página anterior"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                </button>
                <span className="px-2 text-xs font-mono font-semibold text-slate-700 tabular-nums whitespace-nowrap">
                  Pág. {safeCurrentPage} / {totalPages}
                </span>
                <button
                  type="button"
                  onClick={() => handleGoToPage(safeCurrentPage + 1, false)}
                  disabled={safeCurrentPage >= totalPages}
                  className="p-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed cursor-pointer"
                  aria-label="Página siguiente"
                  title="Página siguiente"
                >
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
            )}
          </div>
        </div>

        {/* Column Header Guide (Desktop, zero horizontal overflow) */}
        <div className="hidden lg:grid lg:grid-cols-12 gap-3 px-4 py-2 bg-slate-50/70 border-b border-slate-200 text-[10px] font-bold uppercase tracking-wider text-slate-500">
          <div className="lg:col-span-5">Artículo, Descripción, Categoría, Ubicación y Modelos</div>
          <div className="lg:col-span-4 grid grid-cols-3 gap-2 text-right">
            <span>Costo Divisas</span>
            <span className="text-emerald-800">Venta BCV (Tienda)</span>
            <span>Utilidad Admin</span>
          </div>
          <div className="lg:col-span-3 text-right">Stock · Tienda · Acciones</div>
        </div>

        {/* Product Rows — Every single field visible without any horizontal scrollbar */}
        {paginatedProducts.length === 0 ? (
          <div className="py-12 px-4 text-center text-slate-400 text-xs">
            No se encontraron repuestos con los filtros seleccionados.
          </div>
        ) : (
          <div className="divide-y divide-slate-200">
            {paginatedProducts.map((product) => {
              const tracksInv = productTracksInventory(product);
              const unitInfo = getProductUnitInfo(product);
              const isOutOfStock = tracksInv && product.stock === 0;
              const isLowStock = tracksInv && product.stock > 0 && product.stock <= product.minStock;
              const pricing = calculateProductPricing(product, rate, usdtRate);
              const isSelected = selectedProductIds.includes(product.id);
              const embeddedCount = getProductImages(product, false).length;

              return (
                <div
                  key={product.id}
                  className={`px-3 sm:px-4 py-3.5 transition-colors hover:bg-slate-50/80 ${
                    isSelected ? 'bg-amber-50/50' : 'bg-white'
                  }`}
                >
                  <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-start">
                    {/* ZONE 1 (5 cols): Checkbox + Photo + Name + FULL Description + Metadata + Location + Models */}
                    <div className="lg:col-span-5 flex items-start gap-2.5 min-w-0">
                      <input
                        type="checkbox"
                        checked={isSelected}
                        onChange={() => handleToggleSelectOne(product.id)}
                        className="mt-1 rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer w-4 h-4 shrink-0"
                        aria-label={`Seleccionar ${product.name}`}
                      />

                      {/* Photo thumbnail + quick multi-photo upload */}
                      <label
                        className="relative group w-12 h-12 rounded-lg bg-slate-100 shrink-0 border border-slate-200 overflow-hidden cursor-pointer flex items-center justify-center mt-0.5"
                        title="Haz clic para subir o agregar fotos de este repuesto (puedes seleccionar varias)"
                      >
                        {quickUploadingId === product.id ? (
                          <Loader2 className="w-4 h-4 animate-spin text-amber-500" />
                        ) : (
                          <>
                            {product.imageUrl ? (
                              <img
                                src={
                                  normalizeImageUrl(product.imageUrl) ||
                                  getFallbackProductImage(product.name, product.category)
                                }
                                alt={product.name}
                                className="w-full h-full object-cover"
                                referrerPolicy="no-referrer"
                                onError={(e) => handleProductImageError(e, product)}
                              />
                            ) : (
                              <Boxes className="w-4 h-4 text-slate-400" />
                            )}
                            {embeddedCount > 1 && (
                              <span className="absolute bottom-0.5 right-0.5 bg-slate-950/85 text-amber-300 text-[9px] font-bold px-1 rounded leading-tight tabular-nums">
                                {embeddedCount}
                              </span>
                            )}
                            <div className="absolute inset-0 bg-slate-900/60 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                              <Camera className="w-4 h-4 text-white" />
                            </div>
                          </>
                        )}
                        <input
                          type="file"
                          accept="image/*"
                          multiple
                          onChange={(e) => handleQuickRowImageUpload(product, e)}
                          disabled={quickUploadingId === product.id}
                          className="hidden"
                        />
                      </label>

                      {/* Complete Text Info: Name, Full Description, SKU, Category, Brand, Location, Compatibility, Models */}
                      <div className="min-w-0 flex-1 space-y-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 gap-y-0.5">
                          <button
                            type="button"
                            onClick={() => handleStartEdit(product)}
                            className="text-left font-bold text-slate-900 hover:text-amber-700 text-[13px] leading-snug whitespace-normal break-words cursor-pointer transition-colors"
                            title="Haz clic para editar este repuesto"
                          >
                            {product.name}
                          </button>
                        </div>

                        {product.description && (
                          <p className="text-xs text-slate-600 whitespace-normal break-words leading-snug">
                            {product.description}
                          </p>
                        )}

                        {/* Clean unboxed metadata row: SKU · Categoría · Marca · Código de barra · Ubicación */}
                        <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                          <span className="font-mono font-semibold text-slate-700">
                            SKU: {product.sku}
                          </span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="font-semibold text-slate-700">{product.category}</span>
                          <span aria-hidden="true" className="text-slate-300">·</span>
                          <span className="font-semibold text-slate-700 inline-flex items-center gap-0.5">
                            <Ruler className="w-3 h-3 text-slate-400 shrink-0" />
                            <span>{unitInfo.label}</span>
                          </span>
                          {product.brand && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span>{product.brand}</span>
                            </>
                          )}
                          {product.barcode && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span className="font-mono text-indigo-700 inline-flex items-center gap-0.5">
                                <Barcode className="w-3 h-3 text-indigo-500 shrink-0" />
                                {product.barcode}
                              </span>
                            </>
                          )}
                          {product.warehouseLocation && (
                            <>
                              <span aria-hidden="true" className="text-slate-300">·</span>
                              <span className="inline-flex items-center gap-0.5 font-mono font-semibold text-amber-800">
                                <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
                                {product.warehouseLocation}
                              </span>
                            </>
                          )}
                        </div>

                        {product.compatibility && (
                          <p className="text-[11px] text-slate-500 whitespace-normal break-words leading-snug">
                            <span className="font-semibold text-slate-600">Compatibilidad:</span>{' '}
                            {product.compatibility}
                          </p>
                        )}

                        {/* Photo Quick Upload + Specialized Bike Models */}
                        <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                          <label
                            className={`text-[10px] px-2 py-0.5 rounded inline-flex items-center gap-1 font-semibold cursor-pointer transition-colors ${
                              hasAnyEmbeddedImage(product)
                                ? 'text-emerald-700 bg-emerald-50 hover:bg-emerald-100 border border-emerald-200'
                                : 'text-amber-800 bg-amber-50 hover:bg-amber-100 border border-amber-300'
                            }`}
                            title="Subir una o varias imágenes directamente desde tu dispositivo"
                          >
                            <Camera className="w-2.5 h-2.5 shrink-0" />
                            <span>
                              {quickUploadingId === product.id
                                ? 'Subiendo...'
                                : hasAnyEmbeddedImage(product)
                                ? embeddedCount > 1
                                  ? `${embeddedCount} fotos · + Agregar`
                                  : '1 foto · + Agregar'
                                : isGoogleDriveUrl(product.imageUrl)
                                ? 'Subir fotos (reemplazar Drive)'
                                : 'Subir fotos'}
                            </span>
                            <input
                              type="file"
                              accept="image/*"
                              multiple
                              onChange={(e) => handleQuickRowImageUpload(product, e)}
                              disabled={quickUploadingId === product.id}
                              className="hidden"
                            />
                          </label>

                          {Array.isArray(product.modelCategories) &&
                            product.modelCategories.map((mc) => (
                              <span
                                key={mc}
                                className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 border border-amber-200 text-[10px] font-semibold text-amber-900 leading-none"
                              >
                                <Bike className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                                <span>{mc}</span>
                              </span>
                            ))}
                        </div>
                      </div>
                    </div>

                    {/* ZONE 2 (4 cols): Costo Divisas + Precio Venta BCV (Tienda) + % Utilidad Admin */}
                    <div className="lg:col-span-4 grid grid-cols-3 gap-2 items-start pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                      {/* Costo Divisas */}
                      <div className="text-left lg:text-right min-w-0">
                        <span className="lg:hidden block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                          Costo
                        </span>
                        <span
                          className="font-mono font-bold text-slate-800 text-xs tabular-nums block"
                          title="Costo único del repuesto en divisas ($ USD)"
                        >
                          {formatUSD(pricing.referenceCostUSD)}
                        </span>
                        <span className="text-[10px] text-slate-400 font-medium block">
                          Divisas
                        </span>
                      </div>

                      {/* Precio Venta BCV (Tienda) + Ref. Divisas Solo Admin */}
                      <div className="text-left lg:text-right min-w-0 bg-emerald-50/50 border border-emerald-200/80 rounded-lg px-2 py-1.5">
                        <div className="flex items-baseline lg:justify-end gap-1 flex-wrap">
                          <span className="font-mono font-black text-emerald-800 text-sm leading-none tabular-nums">
                            {formatUSD(pricing.salePriceUsdBcv)}
                          </span>
                          <span className="text-[10px] font-bold text-slate-600">
                            {unitInfo.priceSuffix}
                          </span>
                          <span className="text-[9px] font-extrabold uppercase text-emerald-800">
                            BCV
                          </span>
                        </div>
                        <span className="font-mono text-[10px] font-semibold text-slate-600 block mt-0.5 tabular-nums truncate">
                          {formatBs(pricing.salePriceBsBcv)}
                        </span>
                        <span
                          className="inline-flex items-center lg:justify-end gap-0.5 text-[10px] text-amber-800 font-mono font-semibold tabular-nums mt-0.5"
                          title="Precio de Referencia en Divisas (Solo Admin)"
                        >
                          <Lock className="w-2.5 h-2.5 text-amber-600 shrink-0" />
                          <span>{formatUSD(pricing.salePriceRefUSD)}</span>
                        </span>
                        {pricing.isBsLaggingRef && (
                          <span
                            className="block text-[9px] font-bold text-amber-800 mt-0.5 tabular-nums"
                            title={`A tasa Binance actual (${formatBs(usdtRate)}), tu precio BCV equivale a ${formatUSD(pricing.realRevenueDivisasUSD)} en divisas`}
                          >
                            Bin: {formatUSD(pricing.realRevenueDivisasUSD)}
                          </span>
                        )}
                      </div>

                      {/* % Utilidad (Solo Admin) */}
                      <div className="text-left lg:text-right min-w-0">
                        <span className="lg:hidden block text-[10px] font-bold uppercase text-slate-400 mb-0.5">
                          Utilidad
                        </span>
                        {pricing.realProfitMarginPct !== null ? (
                          <div className="flex flex-col items-start lg:items-end gap-0.5">
                            <span
                              className={`inline-block px-1.5 py-0.5 rounded font-mono font-bold text-[11px] border tabular-nums ${
                                pricing.status === 'healthy'
                                  ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
                                  : pricing.status === 'low'
                                  ? 'bg-amber-50 text-amber-900 border-amber-300'
                                  : 'bg-rose-50 text-rose-700 border-rose-300'
                              }`}
                              title="Margen % sobre venta"
                            >
                              {pricing.realProfitMarginPct.toFixed(1)}%
                            </span>
                            {pricing.realProfitMarkupPct !== null && (
                              <span className="font-mono text-[10px] text-slate-500 tabular-nums">
                                s/C: {pricing.realProfitMarkupPct >= 0 ? '+' : ''}
                                {pricing.realProfitMarkupPct.toFixed(0)}%
                              </span>
                            )}
                            <span
                              className={`font-mono text-[10px] font-semibold tabular-nums ${
                                pricing.realProfitAmountUSD >= 0
                                  ? 'text-emerald-700'
                                  : 'text-rose-600'
                              }`}
                            >
                              {pricing.realProfitAmountUSD >= 0 ? '+' : ''}
                              {formatUSD(pricing.realProfitAmountUSD)}/{unitInfo.shortLabel}
                            </span>
                          </div>
                        ) : (
                          <span className="text-[10px] text-slate-400 italic">Sin costo</span>
                        )}
                      </div>
                    </div>

                    {/* ZONE 3 (3 cols): Stock Stepper + Visibilidad Tienda + Editar & Eliminar */}
                    <div className="lg:col-span-3 flex flex-wrap items-center justify-between lg:justify-end gap-2 pt-2 lg:pt-0 border-t lg:border-t-0 border-slate-100">
                      {/* Stock Stepper OR Made-to-Order Status + Visibility */}
                      <div className="flex items-center lg:flex-col lg:items-end gap-1.5">
                        {tracksInv ? (
                          <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50 overflow-hidden">
                            <button
                              type="button"
                              onClick={() => adjustStock(product.id, -1)}
                              className="px-2 py-1 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                              title="Restar 1"
                            >
                              -
                            </button>
                            <span
                              className={`px-2 py-1 font-mono font-bold text-xs tabular-nums ${
                                isOutOfStock
                                  ? 'text-rose-600 bg-rose-50'
                                  : isLowStock
                                  ? 'text-amber-700 bg-amber-50'
                                  : 'text-slate-900'
                              }`}
                              title={`Existencia en ${unitInfo.label.toLowerCase()}`}
                            >
                              {product.stock}
                              {!unitInfo.isDefaultUnit && (
                                <span className="text-[10px] font-semibold text-slate-500 ml-0.5">
                                  {unitInfo.pluralShort}
                                </span>
                              )}
                            </span>
                            <button
                              type="button"
                              onClick={() => adjustStock(product.id, 1)}
                              className="px-2 py-1 hover:bg-slate-200 text-slate-700 font-bold cursor-pointer"
                              title="Sumar 1"
                            >
                              +
                            </button>
                          </div>
                        ) : (
                          <div
                            className="text-left lg:text-right"
                            title={product.productionTimeNote || DEFAULT_PRODUCTION_TIME_NOTE}
                          >
                            <span className="block text-[11px] font-bold text-indigo-800">
                              Sin inventario · Bajo pedido
                            </span>
                            <span className="inline-flex items-center gap-1 text-[10px] font-medium text-amber-800">
                              <Clock className="w-3 h-3 shrink-0" />
                              <span>{product.productionTimeLabel || DEFAULT_PRODUCTION_TIME_LABEL}</span>
                            </span>
                          </div>
                        )}

                        {!isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700">
                            <Eye className="w-3 h-3 shrink-0" />
                            <span>Visible en tienda</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-rose-700">
                            <EyeOff className="w-3 h-3 shrink-0" />
                            <span>Oculto (Stock 0)</span>
                          </span>
                        )}
                      </div>

                      {/* Copiar Link, Editar y Eliminar siempre visibles a simple vista */}
                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => void handleCopyProductLink(product)}
                          className={`inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold border rounded-lg transition-colors cursor-pointer whitespace-nowrap ${
                            copiedLinkProductId === product.id
                              ? 'text-emerald-800 bg-emerald-50 border-emerald-300'
                              : 'text-slate-700 bg-white hover:bg-amber-50 hover:text-amber-900 border-slate-200 hover:border-amber-300'
                          }`}
                          title="Copiar link directo de este repuesto en la tienda online"
                        >
                          {copiedLinkProductId === product.id ? (
                            <>
                              <Check className="w-3.5 h-3.5 text-emerald-600 shrink-0" />
                              <span className="hidden sm:inline lg:hidden xl:inline">Copiado</span>
                            </>
                          ) : (
                            <>
                              <Link2 className="w-3.5 h-3.5 shrink-0" />
                              <span className="hidden sm:inline lg:hidden xl:inline">Link</span>
                            </>
                          )}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(product)}
                          className="inline-flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-slate-900 bg-slate-100 hover:bg-amber-500 hover:text-slate-950 border border-slate-200 hover:border-amber-500 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          title="Editar este artículo"
                        >
                          <Edit2 className="w-3.5 h-3.5 shrink-0" />
                          <span>Editar</span>
                        </button>
                        <button
                          type="button"
                          onClick={() => setProductToDelete(product)}
                          className="inline-flex items-center gap-1 px-2 py-1.5 text-xs font-semibold text-rose-600 bg-rose-50/70 hover:bg-rose-600 hover:text-white border border-rose-200 hover:border-rose-600 rounded-lg transition-colors cursor-pointer whitespace-nowrap"
                          title="Eliminar este artículo"
                        >
                          <Trash2 className="w-3.5 h-3.5 shrink-0" />
                          <span className="hidden sm:inline lg:hidden xl:inline">Eliminar</span>
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Bottom Pagination Footer Bar */}
        {filteredProducts.length > 0 && (
          <div className="px-4 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-3 text-xs">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-slate-600 tabular-nums">
                Mostrando{' '}
                <strong className="text-slate-900">
                  {pageRangeStart}–{pageRangeEnd}
                </strong>{' '}
                de <strong className="text-slate-900">{filteredProducts.length}</strong> artículos
              </span>

              <div className="flex items-center gap-1.5">
                <span className="text-[11px] font-semibold text-slate-500">Ver:</span>
                <div className="inline-flex items-center rounded-lg border border-slate-200 bg-white p-0.5">
                  {PAGE_SIZE_OPTIONS.map((size) => (
                    <button
                      key={size}
                      type="button"
                      onClick={() => handleChangePageSize(size)}
                      className={`px-2 py-0.5 rounded text-[11px] font-mono font-bold transition-colors cursor-pointer tabular-nums ${
                        pageSize === size
                          ? 'bg-slate-900 text-white'
                          : 'text-slate-600 hover:text-slate-900 hover:bg-slate-100'
                      }`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {totalPages > 1 && (
              <div className="flex flex-wrap items-center gap-1">
                <button
                  type="button"
                  onClick={() => handleGoToPage(1)}
                  disabled={safeCurrentPage <= 1}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer"
                >
                  Primera
                </button>
                <button
                  type="button"
                  onClick={() => handleGoToPage(safeCurrentPage - 1)}
                  disabled={safeCurrentPage <= 1}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer"
                >
                  <ChevronLeft className="w-3.5 h-3.5" />
                  <span>Anterior</span>
                </button>

                {visiblePageNumbers.map((item, idx) =>
                  item === 'ellipsis' ? (
                    <span key={`el-${idx}`} className="px-1.5 text-slate-400 font-mono">
                      …
                    </span>
                  ) : (
                    <button
                      key={item}
                      type="button"
                      onClick={() => handleGoToPage(item)}
                      className={`min-w-[32px] px-2.5 py-1.5 rounded-lg border font-mono font-bold tabular-nums transition-colors cursor-pointer ${
                        item === safeCurrentPage
                          ? 'bg-amber-500 border-amber-500 text-slate-950 shadow-2xs'
                          : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-100'
                      }`}
                    >
                      {item}
                    </button>
                  )
                )}

                <button
                  type="button"
                  onClick={() => handleGoToPage(safeCurrentPage + 1)}
                  disabled={safeCurrentPage >= totalPages}
                  className="inline-flex items-center gap-1 px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer"
                >
                  <span>Siguiente</span>
                  <ChevronRight className="w-3.5 h-3.5" />
                </button>
                <button
                  type="button"
                  onClick={() => handleGoToPage(totalPages)}
                  disabled={safeCurrentPage >= totalPages}
                  className="px-2.5 py-1.5 rounded-lg border border-slate-200 bg-white text-slate-700 hover:bg-slate-100 disabled:opacity-40 disabled:cursor-not-allowed font-semibold cursor-pointer"
                >
                  Última
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Add / Edit Product Full-Viewport Workspace Modal */}
      {(isAddModalOpen || editingProduct) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-0 sm:p-3 bg-slate-950/75 backdrop-blur-xs">
          <div className="bg-white sm:rounded-2xl shadow-2xl border border-slate-200 w-full h-full sm:max-w-[1400px] sm:h-[96vh] sm:max-h-[96vh] overflow-hidden flex flex-col">
            {/* Pinned Top Header */}
            <div className="px-4 sm:px-6 py-3.5 bg-slate-900 text-white flex items-center justify-between gap-3 shrink-0 border-b border-slate-800">
              <div className="min-w-0 flex items-center gap-3">
                <h3 className="font-bold text-sm sm:text-base font-display truncate">
                  {editingProduct ? 'Editar Repuesto de Motocicleta' : 'Registrar Nuevo Repuesto en Inventario'}
                </h3>
                {editingProduct && (
                  <span className="hidden sm:inline-block font-mono text-xs text-amber-300 bg-slate-800 border border-slate-700 px-2 py-0.5 rounded truncate max-w-[360px]">
                    {editingProduct.sku} · {editingProduct.name}
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2 shrink-0">
                {editingProduct && (
                  <button
                    type="button"
                    onClick={() => void handleCopyProductLink(editingProduct)}
                    className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      copiedLinkProductId === editingProduct.id
                        ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                        : 'bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700'
                    }`}
                    title="Copiar link directo de este repuesto para enviarlo a un cliente"
                  >
                    {copiedLinkProductId === editingProduct.id ? (
                      <>
                        <Check className="w-3.5 h-3.5 shrink-0" />
                        <span>¡Link copiado!</span>
                      </>
                    ) : (
                      <>
                        <Link2 className="w-3.5 h-3.5 shrink-0" />
                        <span>Copiar link</span>
                      </>
                    )}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingProduct(null);
                    setIsAddingCategory(false);
                    setNewCategoryName('');
                  }}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 transition-colors cursor-pointer text-xs font-semibold shrink-0"
                >
                  <X className="w-4 h-4" />
                  <span className="hidden sm:inline">Cerrar</span>
                </button>
              </div>
            </div>

            <form
              onSubmit={handleSaveProduct}
              className="flex-1 min-h-0 flex flex-col overflow-hidden text-xs"
            >
              <div className="flex-1 min-h-0 overflow-y-auto p-4 sm:p-6 bg-slate-50/50">
                {formError && (
                  <div className="mb-4 p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
                    <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                    <span>{formError}</span>
                  </div>
                )}

                <div className="grid grid-cols-1 xl:grid-cols-12 gap-5 items-start">
                  {/* Left Column: Datos Básicos, Modelos de Moto, Precios y Stock */}
                  <div className="xl:col-span-7 space-y-4">
                    <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3.5">
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Código / SKU *</label>
                  <input
                    type="text"
                    required
                    value={formData.sku}
                    onChange={(e) => {
                      setFormData({ ...formData, sku: e.target.value });
                      if (formError) setFormError(null);
                    }}
                    placeholder="Ej. FRN-DISC-01"
                    className={`w-full p-2.5 rounded-lg border font-mono ${
                      duplicateSkuProduct
                        ? 'border-rose-400 bg-rose-50 text-rose-900 focus:outline-hidden focus:border-rose-500'
                        : 'border-slate-200 bg-slate-50'
                    }`}
                  />
                  {duplicateSkuProduct && (
                    <p className="text-[10px] text-rose-600 font-semibold mt-1 flex items-center gap-1">
                      <AlertTriangle className="w-3 h-3 shrink-0" />
                      <span>Ya registrado: {duplicateSkuProduct.name}</span>
                    </p>
                  )}
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center justify-between">
                    <span className="flex items-center gap-1.5">
                      <Barcode className="w-3.5 h-3.5 text-indigo-600" />
                      <span>Código de Barra</span>
                    </span>
                    <span className="text-[10px] text-slate-400 font-normal">Opcional</span>
                  </label>
                  <input
                    type="text"
                    value={formData.barcode}
                    onChange={(e) => setFormData({ ...formData, barcode: e.target.value })}
                    placeholder="Ej. 7591234567890 (o lector)"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono text-indigo-950 focus:border-indigo-500 focus:bg-white"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="block font-semibold text-slate-700">Categoría *</label>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingCategory((prev) => !prev);
                        setNewCategoryName('');
                      }}
                      className="text-[11px] font-bold text-amber-700 hover:text-amber-800 inline-flex items-center gap-0.5 cursor-pointer"
                      title={isAddingCategory ? 'Volver a la lista' : 'Crear una categoría nueva'}
                    >
                      {isAddingCategory ? (
                        <>
                          <X className="w-3 h-3" />
                          <span>Cancelar</span>
                        </>
                      ) : (
                        <>
                          <Plus className="w-3 h-3" />
                          <span>Nueva</span>
                        </>
                      )}
                    </button>
                  </div>
                  {isAddingCategory ? (
                    <div className="flex items-center gap-1.5">
                      <input
                        type="text"
                        autoFocus
                        value={newCategoryName}
                        onChange={(e) => setNewCategoryName(e.target.value)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') {
                            e.preventDefault();
                            handleCreateCategory();
                          } else if (e.key === 'Escape') {
                            e.preventDefault();
                            setIsAddingCategory(false);
                            setNewCategoryName('');
                          }
                        }}
                        placeholder="Ej. Cascos, Filtros..."
                        className="w-full p-2.5 rounded-lg border border-amber-400 bg-amber-50/50 focus:bg-white focus:outline-hidden text-xs font-medium"
                      />
                      <button
                        type="button"
                        onClick={handleCreateCategory}
                        disabled={!newCategoryName.trim()}
                        className="px-2.5 py-2.5 bg-amber-600 hover:bg-amber-700 disabled:opacity-50 text-white font-bold rounded-lg text-xs shrink-0 cursor-pointer"
                      >
                        Agregar
                      </button>
                    </div>
                  ) : (
                    <select
                      value={formData.category}
                      onChange={(e) => {
                        if (e.target.value === '__ADD_NEW__') {
                          setIsAddingCategory(true);
                          setNewCategoryName('');
                        } else {
                          setFormData({ ...formData, category: e.target.value as ProductCategory });
                        }
                      }}
                      className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-medium"
                    >
                      {categories.map((c) => (
                        <option key={c} value={c}>
                          {c}
                        </option>
                      ))}
                      <option value="__ADD_NEW__">+ Agregar nueva categoría...</option>
                    </select>
                  )}
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Nombre del Repuesto *</label>
                <input
                  type="text"
                  required
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="Ej. Kit de Embrague Reforzado Bera SBR"
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Marca del Fabricante</label>
                  <input
                    type="text"
                    value={formData.brand}
                    onChange={(e) => setFormData({ ...formData, brand: e.target.value })}
                    placeholder="Ej. Brembo, Empire Genuine, Bera, D.I.D"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Motos Compatibles</label>
                  <input
                    type="text"
                    value={formData.compatibility}
                    onChange={(e) => setFormData({ ...formData, compatibility: e.target.value })}
                    placeholder="Ej. Bera SBR 150, Empire Horse, Universal"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1 flex items-center gap-1.5">
                    <MapPin className="w-3.5 h-3.5 text-amber-600" />
                    <span>Ubicación en Almacén</span>
                  </label>
                  <input
                    type="text"
                    value={formData.warehouseLocation}
                    onChange={(e) => setFormData({ ...formData, warehouseLocation: e.target.value })}
                    placeholder="Ej. Estante A-3, Gaveta 2, Vitrina 1"
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500"
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descripción y Detalles Técnicos</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Materiales, especificaciones, garantía..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white focus:border-amber-500"
                />
              </div>
                    </div>

              {/* Categorías de Modelos de Motos Especializados (Filtro Tienda Online) */}
              <div className="rounded-xl border border-amber-200/90 bg-amber-50/40 p-3.5 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <label className="font-bold text-slate-800 text-xs flex items-center gap-1.5">
                      <Bike className="w-3.5 h-3.5 text-amber-600" />
                      <span>Modelos de Moto Especializados (Filtro Tienda Online)</span>
                    </label>
                    <p className="text-[11px] text-slate-500 mt-0.5">
                      Selecciona uno o varios modelos específicos para que este repuesto aparezca al filtrar por moto en tu tienda online.
                    </p>
                  </div>
                  {!isAddingInlineModel && (
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingInlineModel(true);
                        setNewInlineModelName('');
                      }}
                      className="inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border border-amber-300 bg-white hover:bg-amber-50 text-amber-900 font-bold text-[11px] cursor-pointer shrink-0"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Nuevo modelo</span>
                    </button>
                  )}
                </div>

                {isAddingInlineModel && (
                  <div className="flex items-center gap-2 bg-white border border-amber-300 rounded-lg p-2">
                    <input
                      type="text"
                      value={newInlineModelName}
                      onChange={(e) => setNewInlineModelName(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') {
                          e.preventDefault();
                          handleCreateInlineModelCategory();
                        } else if (e.key === 'Escape') {
                          setIsAddingInlineModel(false);
                          setNewInlineModelName('');
                        }
                      }}
                      placeholder="Ej. Suzuki GN 125, Yamaha XT 250..."
                      autoFocus
                      className="flex-1 text-xs p-1.5 rounded border border-slate-200 bg-slate-50 focus:bg-white focus:outline-hidden focus:border-amber-500"
                    />
                    <button
                      type="button"
                      onClick={handleCreateInlineModelCategory}
                      disabled={!newInlineModelName.trim()}
                      className="px-3 py-1.5 rounded-md bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs cursor-pointer"
                    >
                      Agregar
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setIsAddingInlineModel(false);
                        setNewInlineModelName('');
                      }}
                      className="px-2 py-1.5 text-xs text-slate-500 hover:text-slate-800 cursor-pointer"
                    >
                      Cancelar
                    </button>
                  </div>
                )}

                <div className="flex flex-wrap gap-1.5">
                  {modelCategories.map((mc) => {
                    const isChecked = (formData.modelCategories || []).some(
                      (selected) => selected.toLowerCase() === mc.toLowerCase()
                    );
                    return (
                      <button
                        key={mc}
                        type="button"
                        onClick={() => handleToggleFormModelCategory(mc)}
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-lg border text-[11px] transition-all cursor-pointer ${
                          isChecked
                            ? 'bg-amber-500 border-amber-600 text-slate-950 font-bold shadow-2xs'
                            : 'bg-white border-slate-200 text-slate-700 font-medium hover:border-amber-300 hover:bg-amber-50'
                        }`}
                      >
                        {isChecked ? (
                          <Check className="w-3 h-3 text-slate-950 shrink-0" />
                        ) : (
                          <Plus className="w-3 h-3 text-slate-400 shrink-0" />
                        )}
                        <span>{mc}</span>
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* UNIDAD DE MEDIDA DE VENTA */}
              {(() => {
                const activeUnitInfo = getProductUnitInfo(
                  formData.unitOfMeasure === 'CUSTOM'
                    ? formData.customUnitOfMeasure || 'UNIDAD'
                    : formData.unitOfMeasure
                );
                return (
                  <div className="rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2">
                        <Ruler className="w-4 h-4 text-amber-600 shrink-0" />
                        <div>
                          <label className="block font-bold text-slate-900 text-xs">
                            Unidad de Medida de Venta *
                          </label>
                          <p className="text-[11px] text-slate-500">
                            Indica cómo se vende este artículo (por unidad, metros, centímetros, gramos, litros, etc.) para mostrarlo claramente junto al precio en la tienda.
                          </p>
                        </div>
                      </div>
                      <span className="text-[11px] font-mono font-semibold text-slate-700">
                        Vista tienda: {formatUSD(formPricing.analysis.salePriceUsdBcv)} {activeUnitInfo.priceSuffix}
                      </span>
                    </div>

                    {/* Accesos rápidos de unidades más usadas */}
                    <div className="flex flex-wrap gap-1.5">
                      {PRODUCT_UNIT_OF_MEASURE_OPTIONS.filter((opt) => opt.quickPreset).map((opt) => {
                        const isSelectedUnit = formData.unitOfMeasure === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() =>
                              setFormData((prev) => ({
                                ...prev,
                                unitOfMeasure: opt.id,
                                customUnitOfMeasure: '',
                              }))
                            }
                            className={`px-2.5 py-1.5 rounded-lg text-[11px] font-semibold border transition-colors cursor-pointer whitespace-nowrap ${
                              isSelectedUnit
                                ? 'bg-slate-900 text-white border-slate-900'
                                : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>

                    {/* Selector completo + opción personalizada */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                          Todas las unidades disponibles
                        </label>
                        <select
                          value={formData.unitOfMeasure}
                          onChange={(e) => {
                            const val = e.target.value;
                            setFormData((prev) => ({
                              ...prev,
                              unitOfMeasure: val,
                              ...(val !== 'CUSTOM' ? { customUnitOfMeasure: '' } : {}),
                            }));
                          }}
                          className="w-full p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white text-xs font-semibold text-slate-900 cursor-pointer"
                        >
                          {PRODUCT_UNIT_OF_MEASURE_OPTIONS.map((opt) => (
                            <option key={opt.id} value={opt.id}>
                              {opt.label} ({opt.priceSuffix})
                            </option>
                          ))}
                          <option value="CUSTOM">Otra unidad personalizada...</option>
                        </select>
                      </div>

                      {formData.unitOfMeasure === 'CUSTOM' ? (
                        <div>
                          <label className="block text-[11px] font-semibold text-slate-600 mb-1">
                            Escribe la unidad personalizada *
                          </label>
                          <input
                            type="text"
                            maxLength={32}
                            required
                            value={formData.customUnitOfMeasure}
                            onChange={(e) =>
                              setFormData((prev) => ({
                                ...prev,
                                customUnitOfMeasure: e.target.value,
                              }))
                            }
                            placeholder="Ej: 50 cm, 100 g, Docena, Cuarto de galón"
                            className="w-full p-2.5 rounded-lg border border-amber-400 bg-white text-xs font-semibold text-slate-900 focus:outline-hidden focus:ring-2 focus:ring-amber-400"
                          />
                        </div>
                      ) : (
                        <div className="flex items-end">
                          <p className="text-[11px] text-slate-600 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2.5 w-full">
                            El cliente verá en la tienda:{' '}
                            <strong className="text-slate-900">{activeUnitInfo.customerLabel}</strong>{' '}
                            <span className="font-mono text-emerald-700 font-bold">
                              ({formatUSD(formPricing.analysis.salePriceUsdBcv)} {activeUnitInfo.priceSuffix})
                            </span>
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                );
              })()}

              {/* BLOQUE FINANCIERO SIMPLIFICADO: 1 COSTO EN DIVISAS + 2 PRECIOS DE VENTA ($ BCV TIENDA Y REF. DIVISAS ADMIN) */}
              <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-4">
                <div className="flex flex-wrap items-center justify-between gap-2 pb-2 border-b border-slate-200">
                  <div className="flex items-center gap-2">
                    <Calculator className="w-4 h-4 text-amber-600" />
                    <span className="font-bold text-slate-900 text-xs">
                      Costo en Divisas y Precios de Venta (
                      {
                        getProductUnitInfo(
                          formData.unitOfMeasure === 'CUSTOM'
                            ? formData.customUnitOfMeasure || 'UNIDAD'
                            : formData.unitOfMeasure
                        ).customerLabel
                      }
                      )
                    </span>
                  </div>
                  <span className="font-mono text-[10px] font-bold bg-slate-900 text-amber-300 px-2.5 py-1 rounded">
                    BCV {formatBs(rate)} · Binance {formatBs(usdtRate)} · Brecha{' '}
                    {exchangeGap.gapPct >= 0 ? '+' : ''}
                    {exchangeGap.gapPct.toFixed(2)}%
                  </span>
                </div>

                {/* 1 Costo (Divisas) + 2 Precios de Venta ($ BCV Principal Tienda + $ Ref. Divisas Solo Admin) */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  {/* Costo Único en Divisas */}
                  <div className="bg-white border border-slate-300 rounded-xl p-3 flex flex-col justify-between">
                    <label className="flex items-center justify-between font-bold text-slate-700 mb-1.5">
                      <span>
                        Costo Divisas ($ {
                          getProductUnitInfo(
                            formData.unitOfMeasure === 'CUSTOM'
                              ? formData.customUnitOfMeasure || 'UNIDAD'
                              : formData.unitOfMeasure
                          ).priceSuffix
                        }) *
                      </span>
                      <span className="text-[9px] uppercase bg-slate-100 text-slate-600 px-1.5 py-0.5 rounded font-bold">
                        Único
                      </span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formData.costPrice}
                      onChange={(e) => {
                        const usdVal = Math.max(0, Number(e.target.value) || 0);
                        setFormData({
                          ...formData,
                          costPrice: usdVal,
                        });
                      }}
                      className="w-full p-2.5 rounded-lg border border-slate-300 bg-slate-50 focus:bg-white font-mono font-bold text-slate-900 text-sm"
                    />
                    <span className="text-[10px] text-slate-500 block mt-1.5">
                      Costo base en dólares / divisas
                    </span>
                  </div>

                  {/* Precio de Venta 1 (PRINCIPAL): Dólar a Tasa BCV (Tienda Online) */}
                  <div className="bg-emerald-50 border-2 border-emerald-400 rounded-xl p-3 shadow-2xs flex flex-col justify-between">
                    <label className="flex items-center justify-between font-extrabold text-emerald-950 mb-1.5">
                      <span>
                        Venta BCV ($ {
                          getProductUnitInfo(
                            formData.unitOfMeasure === 'CUSTOM'
                              ? formData.customUnitOfMeasure || 'UNIDAD'
                              : formData.unitOfMeasure
                          ).priceSuffix
                        }) *
                      </span>
                      <span className="text-[9px] uppercase bg-emerald-600 text-white px-1.5 py-0.5 rounded font-extrabold">
                        Tienda Online
                      </span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      required
                      value={formData.salePrice}
                      onChange={(e) => handleSalePriceUsdBcvChange(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-emerald-400 bg-white font-mono font-black text-emerald-900 text-base"
                    />
                    <div className="flex items-center justify-between gap-1 text-[10px] font-mono text-emerald-800 font-semibold mt-1.5">
                      <span>= {formatBs(formPricing.saleBsBcv)}</span>
                      <span className="text-emerald-700/80">
                        Binance: {formatUSD(formPricing.analysis.realRevenueDivisasUSD)}
                      </span>
                    </div>
                  </div>

                  {/* Precio de Venta 2 (SOLO ADMIN): Referencia en Divisas */}
                  <div className="bg-amber-50/70 border border-amber-300 rounded-xl p-3 flex flex-col justify-between">
                    <label className="flex items-center justify-between font-bold text-amber-950 mb-1.5">
                      <span className="inline-flex items-center gap-1">
                        <Lock className="w-3 h-3 text-amber-700" />
                        <span>Ref. Divisas ($)</span>
                      </span>
                      <span className="text-[9px] uppercase bg-amber-200 text-amber-950 px-1.5 py-0.5 rounded font-extrabold">
                        Solo Admin
                      </span>
                    </label>
                    <input
                      type="number"
                      step="any"
                      min="0"
                      value={formData.salePriceRefUSD}
                      onChange={(e) => handleSalePriceRefUsdChange(e.target.value)}
                      className="w-full p-2.5 rounded-lg border border-amber-400 bg-white font-mono font-bold text-amber-950 text-sm"
                    />
                    <span className="text-[10px] text-amber-800 block mt-1.5">
                      Solo visible en panel administrativo
                    </span>
                  </div>
                </div>

                {/* Calculadora rápida por % de Utilidad Objetivo + Sincronización con brecha */}
                <div className="bg-white rounded-lg border border-slate-200 p-3 flex flex-wrap items-end justify-between gap-2.5">
                  <div className="flex flex-wrap items-end gap-2">
                    <div>
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">
                        Sugerir Precios por % Utilidad
                      </label>
                      <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-0.5">
                        <button
                          type="button"
                          onClick={() => setTargetProfitMode('margin')}
                          className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
                            targetProfitMode === 'margin'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          Margen % (s/Venta)
                        </button>
                        <button
                          type="button"
                          onClick={() => setTargetProfitMode('markup')}
                          className={`px-2 py-1 rounded text-[10px] font-bold cursor-pointer ${
                            targetProfitMode === 'markup'
                              ? 'bg-slate-900 text-white'
                              : 'text-slate-600'
                          }`}
                        >
                          Markup % (s/Costo)
                        </button>
                      </div>
                    </div>
                    <div className="w-20">
                      <label className="block text-[10px] font-bold text-slate-600 mb-1">% Objetivo</label>
                      <input
                        type="number"
                        step="1"
                        min="0"
                        max={targetProfitMode === 'margin' ? 95 : 1000}
                        value={targetProfitInput}
                        onChange={(e) => setTargetProfitInput(e.target.value)}
                        className="w-full p-1.5 rounded-lg border border-slate-300 font-mono font-bold text-xs text-center"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleApplyTargetProfitSuggestion}
                      disabled={formPricing.costUSD <= 0}
                      className="px-3 py-1.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-40 text-slate-950 font-bold text-[11px] rounded-lg cursor-pointer transition-colors"
                    >
                      Calcular y Aplicar
                    </button>
                  </div>

                  <label className="inline-flex items-center gap-1.5 text-[11px] text-slate-600 font-medium cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={syncBsWithGap}
                      onChange={(e) => setSyncBsWithGap(e.target.checked)}
                      className="rounded border-slate-300 text-amber-600 focus:ring-amber-500"
                    />
                    <span>
                      Sincronizar $ BCV ↔ Ref. Divisas con brecha ({exchangeGap.gapPct >= 0 ? '+' : ''}
                      {exchangeGap.gapPct.toFixed(1)}%)
                    </span>
                  </label>
                </div>

                {/* Indicador en Tiempo Real de % de Utilidad (Solo Admin) */}
                <div
                  className={`rounded-xl p-3 border flex flex-wrap items-center justify-between gap-3 ${
                    formPricing.analysis.status === 'healthy'
                      ? 'bg-emerald-50 border-emerald-300 text-emerald-950'
                      : formPricing.analysis.status === 'low'
                      ? 'bg-amber-50 border-amber-300 text-amber-950'
                      : formPricing.analysis.status === 'negative'
                      ? 'bg-rose-50 border-rose-300 text-rose-950'
                      : 'bg-slate-100 border-slate-200 text-slate-700'
                  }`}
                >
                  <div>
                    <span className="text-[10px] uppercase tracking-wider font-extrabold flex items-center gap-1">
                      <Lock className="w-3 h-3" />
                      <span>% Utilidad Real en Divisas (Solo Admin)</span>
                    </span>
                    <div className="flex flex-wrap items-baseline gap-3 mt-0.5 font-mono">
                      <span className="text-base font-black">
                        Margen:{' '}
                        {formPricing.analysis.realProfitMarginPct !== null
                          ? `${formPricing.analysis.realProfitMarginPct.toFixed(2)}%`
                          : '—'}
                      </span>
                      <span className="text-xs font-bold opacity-85">
                        s/Costo:{' '}
                        {formPricing.analysis.realProfitMarkupPct !== null
                          ? `${formPricing.analysis.realProfitMarkupPct >= 0 ? '+' : ''}${formPricing.analysis.realProfitMarkupPct.toFixed(2)}%`
                          : '—'}
                      </span>
                      <span className="text-xs font-bold">
                        Ganancia: {formPricing.analysis.realProfitAmountUSD >= 0 ? '+' : ''}
                        {formatUSD(formPricing.analysis.realProfitAmountUSD)}/u
                      </span>
                    </div>
                  </div>
                  <div className="text-right text-[10px] leading-tight">
                    <span className="font-bold block">
                      {formPricing.analysis.status === 'healthy' && '✓ Margen saludable (≥20%)'}
                      {formPricing.analysis.status === 'low' && '⚠ Margen bajo (<20%)'}
                      {formPricing.analysis.status === 'negative' && '⛔ Pérdida / Utilidad negativa'}
                      {formPricing.analysis.status === 'unknown' && 'Ingresa costo y precio de venta'}
                    </span>
                    <span className="opacity-75 block">
                      Margen = (Venta − Costo) ÷ Venta · s/Costo = (Venta − Costo) ÷ Costo
                    </span>
                  </div>
                </div>
              </div>

              {/* Control de Inventario vs Fabricación bajo pedido */}
              <div className="bg-white rounded-xl border border-slate-200 p-4 space-y-3.5">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                  <div>
                    <label className="block font-bold text-slate-800 text-xs">
                      Control de Inventario
                    </label>
                    <p className="text-[11px] text-slate-500">
                      Elige si este artículo descuenta stock físico o se fabrica bajo pedido (como forros de asiento).
                    </p>
                  </div>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        tracksInventory: true,
                      }))
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      formData.tracksInventory
                        ? 'border-slate-900 bg-slate-900 text-white shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs">Usa inventario (Stock físico)</span>
                      <Boxes className={`w-4 h-4 shrink-0 ${formData.tracksInventory ? 'text-amber-400' : 'text-slate-400'}`} />
                    </div>
                    <p className={`text-[10px] mt-1 leading-snug ${formData.tracksInventory ? 'text-slate-300' : 'text-slate-500'}`}>
                      Controla existencias reales, alerta stock mínimo y oculta el producto en tienda al llegar a 0.
                    </p>
                  </button>

                  <button
                    type="button"
                    onClick={() =>
                      setFormData((prev) => ({
                        ...prev,
                        tracksInventory: false,
                        productionTimeLabel:
                          (prev.productionTimeLabel || '').trim() || DEFAULT_PRODUCTION_TIME_LABEL,
                        productionTimeNote:
                          (prev.productionTimeNote || '').trim() || DEFAULT_PRODUCTION_TIME_NOTE,
                      }))
                    }
                    className={`p-3 rounded-xl border text-left transition-all cursor-pointer ${
                      !formData.tracksInventory
                        ? 'border-indigo-700 bg-indigo-950 text-white shadow-xs'
                        : 'border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                    }`}
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className="font-bold text-xs">Sin inventario (Bajo pedido)</span>
                      <Clock className={`w-4 h-4 shrink-0 ${!formData.tracksInventory ? 'text-amber-400' : 'text-slate-400'}`} />
                    </div>
                    <p className={`text-[10px] mt-1 leading-snug ${!formData.tracksInventory ? 'text-indigo-200' : 'text-slate-500'}`}>
                      Ideal para forros de asiento fabricados por nosotros. Siempre visible en tienda y POS, con aviso de fabricación.
                    </p>
                  </button>
                </div>

                {formData.tracksInventory ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-1">
                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Stock Actual ({
                          getProductUnitInfo(
                            formData.unitOfMeasure === 'CUSTOM'
                              ? formData.customUnitOfMeasure || 'UNIDAD'
                              : formData.unitOfMeasure
                          ).pluralShort
                        }) *
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        required
                        value={formData.stock}
                        onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                        className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-700 mb-1">
                        Stock Mínimo ({
                          getProductUnitInfo(
                            formData.unitOfMeasure === 'CUSTOM'
                              ? formData.customUnitOfMeasure || 'UNIDAD'
                              : formData.unitOfMeasure
                          ).pluralShort
                        })
                      </label>
                      <input
                        type="number"
                        min={0}
                        step="any"
                        value={formData.minStock}
                        onChange={(e) => setFormData({ ...formData, minStock: Number(e.target.value) })}
                        className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 focus:bg-white font-mono"
                      />
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl bg-amber-50/70 border border-amber-200 p-3.5 space-y-3">
                    <div className="flex items-start gap-2">
                      <Clock className="w-4 h-4 text-amber-700 shrink-0 mt-0.5" />
                      <div>
                        <p className="text-xs font-bold text-amber-950">
                          Tiempo de fabricación visible para clientes y vendedores
                        </p>
                        <p className="text-[11px] text-amber-900/80">
                          Este artículo no descuenta inventario al venderse ni se oculta en la tienda online.
                        </p>
                      </div>
                    </div>

                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-1.5 mb-1">
                        <label className="block font-semibold text-slate-800 text-[11px]">
                          Tiempo estimado de fabricación *
                        </label>
                        <div className="flex items-center gap-1">
                          {['12 a 24 horas', '24 a 48 horas', '2 a 3 días'].map((preset) => (
                            <button
                              key={preset}
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  productionTimeLabel: preset,
                                  productionTimeNote: `Fabricación bajo pedido: tiempo estimado de ${preset} (sujeto a posibles retrasos por cortes de energía eléctrica).`,
                                }))
                              }
                              className={`px-2 py-0.5 rounded text-[10px] font-semibold transition-colors cursor-pointer ${
                                formData.productionTimeLabel === preset
                                  ? 'bg-slate-900 text-amber-400'
                                  : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-100'
                              }`}
                            >
                              {preset}
                            </button>
                          ))}
                        </div>
                      </div>
                      <input
                        type="text"
                        required
                        value={formData.productionTimeLabel}
                        onChange={(e) =>
                          setFormData({ ...formData, productionTimeLabel: e.target.value })
                        }
                        placeholder="Ej. 12 a 24 horas"
                        className="w-full p-2.5 rounded-lg border border-amber-300 bg-white focus:outline-hidden focus:border-amber-500 text-xs font-semibold text-slate-900"
                      />
                    </div>

                    <div>
                      <label className="block font-semibold text-slate-800 text-[11px] mb-1">
                        Aviso completo al cliente (incluye cortes de luz)
                      </label>
                      <textarea
                        rows={2}
                        value={formData.productionTimeNote}
                        onChange={(e) =>
                          setFormData({ ...formData, productionTimeNote: e.target.value })
                        }
                        placeholder={DEFAULT_PRODUCTION_TIME_NOTE}
                        className="w-full p-2.5 rounded-lg border border-amber-300 bg-white focus:outline-hidden focus:border-amber-500 text-xs text-slate-800"
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Precios al Mayor Individuales de este Repuesto (Opcional) */}
              <div className="p-3.5 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-2.5">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div>
                    <p className="font-bold text-emerald-950 text-xs flex items-center gap-1.5">
                      <Percent className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                      <span>Precios al Mayor de este Repuesto (Opcional)</span>
                    </p>
                    <p className="text-[11px] text-emerald-800 mt-0.5">
                      Define descuentos por cantidad exclusivos para este repuesto en la tienda online.
                    </p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => ({
                          ...prev,
                          wholesaleTiers: SUGGESTED_WHOLESALE_TIERS.map((t, idx) => ({
                            id: `wt-${Date.now()}-${idx}`,
                            minQty: t.minQty,
                            discountPct: t.discountPct,
                          })),
                        }))
                      }
                      className="px-2 py-1 rounded-md bg-white hover:bg-emerald-100 border border-emerald-300 text-emerald-900 text-[10px] font-bold cursor-pointer"
                    >
                      3+:5% · 6+:10% · 12+:15%
                    </button>
                    <button
                      type="button"
                      onClick={() =>
                        setFormData((prev) => {
                          const last = prev.wholesaleTiers[prev.wholesaleTiers.length - 1];
                          const nextQty = last ? last.minQty + 3 : 3;
                          const nextPct = last ? Math.min(80, last.discountPct + 5) : 5;
                          return {
                            ...prev,
                            wholesaleTiers: [
                              ...prev.wholesaleTiers,
                              {
                                id: `wt-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
                                minQty: nextQty,
                                discountPct: nextPct,
                              },
                            ],
                          };
                        })
                      }
                      className="px-2 py-1 rounded-md bg-emerald-600 hover:bg-emerald-700 text-white text-[10px] font-bold inline-flex items-center gap-1 cursor-pointer"
                    >
                      <Plus className="w-3 h-3" />
                      <span>Escala</span>
                    </button>
                  </div>
                </div>

                {formData.wholesaleTiers.length === 0 ? (
                  <p className="text-[11px] text-slate-500 bg-white border border-dashed border-emerald-200 rounded-lg px-3 py-2">
                    Sin descuento al mayor asignado (solo precio al detal). Haz clic en <strong>+ Escala</strong> para configurar cantidades y porcentajes.
                  </p>
                ) : (
                  <div className="space-y-1.5">
                    {formData.wholesaleTiers.map((tier, idx) => {
                      const baseSale = Math.max(0, Number(formData.salePrice) || 0);
                      const discUnitUSD = round2(baseSale * (1 - Math.min(90, Math.max(0, tier.discountPct)) / 100));
                      return (
                        <div
                          key={tier.id || idx}
                          className="grid grid-cols-12 gap-2 items-center bg-white border border-emerald-200/80 rounded-lg p-2"
                        >
                          <div className="col-span-4">
                            <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
                              Desde (uds)
                            </label>
                            <input
                              type="number"
                              min={2}
                              step={1}
                              value={tier.minQty}
                              onChange={(e) => {
                                const val = Math.max(2, parseInt(e.target.value, 10) || 2);
                                setFormData((prev) => ({
                                  ...prev,
                                  wholesaleTiers: prev.wholesaleTiers.map((t, i) =>
                                    i === idx ? { ...t, minQty: val } : t
                                  ),
                                }));
                              }}
                              className="w-full px-2 py-1 rounded border border-slate-200 text-xs font-mono font-bold text-slate-900 focus:outline-hidden focus:border-emerald-500"
                            />
                          </div>
                          <div className="col-span-3">
                            <label className="block text-[9px] font-bold uppercase text-slate-500 mb-0.5">
                              Desc. %
                            </label>
                            <input
                              type="number"
                              min={1}
                              max={90}
                              step={0.5}
                              value={tier.discountPct}
                              onChange={(e) => {
                                const val = Math.min(90, Math.max(0, parseFloat(e.target.value) || 0));
                                setFormData((prev) => ({
                                  ...prev,
                                  wholesaleTiers: prev.wholesaleTiers.map((t, i) =>
                                    i === idx ? { ...t, discountPct: val } : t
                                  ),
                                }));
                              }}
                              className="w-full px-2 py-1 rounded border border-slate-200 text-xs font-mono font-bold text-emerald-700 focus:outline-hidden focus:border-emerald-500"
                            />
                          </div>
                          <div className="col-span-4 text-right">
                            <span className="block text-[9px] font-bold uppercase text-slate-400">
                              Precio c/u
                            </span>
                            <span className="text-xs font-mono font-extrabold text-slate-900 tabular-nums">
                              {formatUSD(discUnitUSD)}
                            </span>
                            <span className="block text-[10px] font-mono text-emerald-700 tabular-nums leading-tight">
                              {formatBs(discUnitUSD * rate)}
                            </span>
                          </div>
                          <div className="col-span-1 flex justify-end">
                            <button
                              type="button"
                              onClick={() =>
                                setFormData((prev) => ({
                                  ...prev,
                                  wholesaleTiers: prev.wholesaleTiers.filter((_, i) => i !== idx),
                                }))
                              }
                              className="p-1 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded cursor-pointer"
                              title="Eliminar escala"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
                  </div>

                  {/* Right Column: Galería de Fotos del Repuesto (siempre visible al lado en pantalla grande) */}
                  <div className="xl:col-span-5 xl:sticky xl:top-0">
              <div
                onDragOver={(e) => {
                  e.preventDefault();
                  setIsDraggingPhoto(true);
                }}
                onDragLeave={() => setIsDraggingPhoto(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setIsDraggingPhoto(false);
                  if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                    void processSelectedModalFiles(e.dataTransfer.files);
                  }
                }}
                onPaste={(e) => {
                  const items = e.clipboardData?.items;
                  if (!items) return;
                  const pastedFiles: File[] = [];
                  for (let i = 0; i < items.length; i++) {
                    if (items[i].type.startsWith('image/')) {
                      const pastedFile = items[i].getAsFile();
                      if (pastedFile) pastedFiles.push(pastedFile);
                    }
                  }
                  if (pastedFiles.length > 0) {
                    e.preventDefault();
                    void processSelectedModalFiles(pastedFiles);
                  }
                }}
                className={`space-y-3 p-4 rounded-xl border-2 transition-colors ${
                  isDraggingPhoto
                    ? 'bg-amber-50 border-amber-400 border-dashed'
                    : 'bg-slate-50 border-slate-200'
                }`}
              >
                {(() => {
                  const modalPhotos =
                    Array.isArray(formData.imageUrls) && formData.imageUrls.length > 0
                      ? formData.imageUrls
                      : formData.imageUrl
                      ? [formData.imageUrl]
                      : [];
                  const cloudCount = modalPhotos.filter((url) => isFirebaseStorageImageUrl(url)).length;
                  const hasLegacyBase64 = modalPhotos.some((url) => isEmbeddedImageUrl(url));
                  const canAddMore = modalPhotos.length < MAX_PRODUCT_IMAGES;

                  return (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <label className="block font-semibold text-slate-800">
                          Galería de Fotos del Repuesto (Hasta {MAX_PRODUCT_IMAGES} fotos)
                        </label>
                        <div className="flex items-center gap-1.5">
                          <span className="inline-flex items-center gap-1 text-[10px] bg-slate-900 text-amber-300 px-2 py-0.5 rounded-full font-bold tabular-nums">
                            {modalPhotos.length} / {MAX_PRODUCT_IMAGES} fotos
                          </span>
                          {cloudCount > 0 && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-semibold">
                              <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                              Firebase Storage ({cloudCount})
                            </span>
                          )}
                          {hasLegacyBase64 && (
                            <span className="inline-flex items-center gap-1 text-[10px] bg-amber-100 text-amber-800 px-2 py-0.5 rounded-full font-semibold">
                              Sube foto nueva (reemplaza base64)
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Multi-Photo Grid */}
                      {modalPhotos.length > 0 ? (
                        <div className="grid grid-cols-2 sm:grid-cols-3 gap-2.5">
                          {modalPhotos.map((photoUrl, idx) => (
                            <div
                              key={`${idx}-${photoUrl.slice(0, 40)}`}
                              className={`relative rounded-xl bg-white border overflow-hidden shadow-2xs flex flex-col ${
                                idx === 0
                                  ? 'border-amber-400 ring-2 ring-amber-200'
                                  : 'border-slate-200'
                              }`}
                            >
                              <div className="relative aspect-4/3 bg-slate-100 overflow-hidden">
                                <img
                                  src={photoUrl}
                                  alt={`Foto ${idx + 1} del repuesto`}
                                  className="w-full h-full object-cover"
                                  referrerPolicy="no-referrer"
                                  onLoad={() => setImagePreviewError(false)}
                                  onError={() => setImagePreviewError(true)}
                                />
                                {idx === 0 && (
                                  <span className="absolute top-1.5 left-1.5 inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-500 text-slate-950 text-[9px] font-extrabold shadow-xs">
                                    <Star className="w-2.5 h-2.5 fill-slate-950" />
                                    Principal
                                  </span>
                                )}
                                <span className="absolute bottom-1 right-1 bg-slate-950/75 text-white text-[9px] font-mono font-bold px-1.5 py-0.5 rounded">
                                  #{idx + 1}
                                </span>
                              </div>

                              <div className="p-1.5 bg-white border-t border-slate-100 flex items-center justify-between gap-1">
                                <div className="flex items-center gap-0.5">
                                  {idx > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => handleSetPrimaryPhoto(idx)}
                                      className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-50 hover:bg-amber-100 border border-amber-200 text-amber-900 text-[10px] font-bold cursor-pointer"
                                      title="Usar como foto principal de portada"
                                    >
                                      <Star className="w-2.5 h-2.5 text-amber-600" />
                                      <span>Portada</span>
                                    </button>
                                  )}
                                  {idx > 0 && (
                                    <button
                                      type="button"
                                      onClick={() => handleMovePhoto(idx, -1)}
                                      className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                                      title="Mover a la izquierda"
                                    >
                                      <ChevronLeft className="w-3 h-3" />
                                    </button>
                                  )}
                                  {idx < modalPhotos.length - 1 && (
                                    <button
                                      type="button"
                                      onClick={() => handleMovePhoto(idx, 1)}
                                      className="p-1 rounded text-slate-500 hover:text-slate-900 hover:bg-slate-100 cursor-pointer"
                                      title="Mover a la derecha"
                                    >
                                      <ChevronRight className="w-3 h-3" />
                                    </button>
                                  )}
                                </div>
                                <button
                                  type="button"
                                  onClick={() => handleRemovePhoto(idx)}
                                  className="p-1 rounded text-rose-500 hover:text-rose-700 hover:bg-rose-50 cursor-pointer"
                                  title="Quitar esta foto"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            </div>
                          ))}

                          {canAddMore && (
                            <label className="aspect-4/3 rounded-xl border-2 border-dashed border-slate-300 hover:border-amber-400 bg-white/80 hover:bg-amber-50/50 transition-colors cursor-pointer flex flex-col items-center justify-center p-3 text-center text-slate-500 hover:text-amber-800">
                              {isCompressingUpload ? (
                                <Loader2 className="w-5 h-5 animate-spin text-amber-500 mb-1" />
                              ) : (
                                <Plus className="w-5 h-5 mb-1" />
                              )}
                              <span className="text-[11px] font-bold">
                                {isCompressingUpload ? 'Subiendo a la nube...' : 'Agregar más fotos'}
                              </span>
                              <span className="text-[10px] opacity-75">
                                Quedan {MAX_PRODUCT_IMAGES - modalPhotos.length}
                              </span>
                              <input
                                type="file"
                                accept="image/*"
                                multiple
                                onChange={handleLocalImageUpload}
                                disabled={isCompressingUpload}
                                className="hidden"
                              />
                            </label>
                          )}
                        </div>
                      ) : (
                        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3.5">
                          <div className="w-24 h-24 rounded-xl bg-white border border-slate-200 overflow-hidden shrink-0 flex items-center justify-center shadow-2xs">
                            <div className="text-center p-2 text-slate-400">
                              <ImageIcon className="w-6 h-6 mx-auto mb-1 opacity-60" />
                              <span className="text-[10px] block">Sin fotos</span>
                            </div>
                          </div>
                          <div className="flex-1 text-xs text-slate-500">
                            Sube hasta <strong>{MAX_PRODUCT_IMAGES} fotos</strong> del repuesto directamente a <strong>Firebase Storage</strong> (distintos ángulos, empaque, medidas o detalle).
                          </div>
                        </div>
                      )}

                      <div className="flex flex-wrap items-center gap-2 pt-1">
                        <label
                          className={`inline-flex items-center gap-1.5 px-3.5 py-2 font-bold text-xs rounded-lg transition-colors shadow-xs ${
                            canAddMore && !isCompressingUpload
                              ? 'bg-slate-900 hover:bg-slate-800 text-white cursor-pointer'
                              : 'bg-slate-300 text-slate-500 cursor-not-allowed'
                          }`}
                        >
                          {isCompressingUpload ? (
                            <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                          ) : (
                            <Upload className="w-4 h-4 text-amber-400" />
                          )}
                          <span>
                            {isCompressingUpload
                              ? 'Subiendo a Firebase Storage...'
                              : modalPhotos.length > 0
                              ? 'Subir más fotos a la nube'
                              : 'Subir fotos a la nube (varias a la vez)'}
                          </span>
                          <input
                            type="file"
                            accept="image/*"
                            multiple
                            onChange={handleLocalImageUpload}
                            disabled={isCompressingUpload || !canAddMore}
                            className="hidden"
                          />
                        </label>

                        {modalPhotos.length > 0 && (
                          <button
                            type="button"
                            onClick={() => {
                              syncFormPhotos([]);
                              setImagePreviewError(false);
                              setUploadError(null);
                            }}
                            className="px-2.5 py-2 text-[11px] font-semibold text-rose-600 hover:bg-rose-50 border border-rose-200 rounded-lg transition-colors cursor-pointer"
                          >
                            Quitar todas
                          </button>
                        )}
                      </div>

                      <p className="text-[11px] text-slate-500 leading-snug">
                        Puedes seleccionar <strong>varias fotos a la vez</strong>, arrastrarlas y soltarlas aquí o pegarlas con{' '}
                        <kbd className="px-1 py-0.5 bg-white border border-slate-300 rounded text-[10px]">Ctrl+V</kbd>. La foto #1 será la portada en el catálogo.
                      </p>

                      {uploadError && (
                        <p className="text-[11px] text-rose-600 font-semibold">{uploadError}</p>
                      )}
                      {imagePreviewError && (
                        <p className="text-[11px] text-rose-600 font-semibold flex items-center gap-1">
                          <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                          <span>Una imagen no cargó; sube una foto directa con el botón de arriba.</span>
                        </p>
                      )}

                      {/* Optional External URL toggle */}
                      <div className="pt-1">
                        <button
                          type="button"
                          onClick={() => setShowUrlInputInModal((prev) => !prev)}
                          className="inline-flex items-center gap-1 text-[11px] font-medium text-slate-500 hover:text-slate-800 cursor-pointer"
                        >
                          <Link2 className="w-3 h-3" />
                          <span>
                            {showUrlInputInModal
                              ? 'Ocultar campo de enlace web'
                              : 'Opcional: agregar foto mediante enlace web (URL)'}
                          </span>
                        </button>

                        {showUrlInputInModal && (
                          <div className="mt-2 flex items-center gap-1.5">
                            <input
                              type="text"
                              value={newPhotoUrlInput}
                              onChange={(e) => setNewPhotoUrlInput(e.target.value)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                  e.preventDefault();
                                  handleAddExternalPhotoUrl();
                                }
                              }}
                              placeholder="Pega aquí una URL directa (https://...)"
                              className="flex-1 p-2 rounded-lg border border-slate-300 bg-white font-mono text-[11px] focus:border-amber-500 focus:outline-hidden"
                            />
                            <button
                              type="button"
                              onClick={handleAddExternalPhotoUrl}
                              disabled={!newPhotoUrlInput.trim() || !canAddMore}
                              className="px-3 py-2 rounded-lg bg-slate-900 hover:bg-slate-800 disabled:opacity-40 text-white font-bold text-[11px] cursor-pointer shrink-0"
                            >
                              + Agregar
                            </button>
                          </div>
                        )}
                      </div>

                      {/* Quick Presets */}
                      <div className="pt-2 border-t border-slate-200">
                        <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1.5">
                          ¿Quieres usar una imagen oficial del catálogo?
                        </span>
                        <div className="flex flex-wrap items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => {
                              const nextPhotos = Array.from(
                                new Set([PRESET_PRODUCT_IMAGES.maletaParaMoto, ...modalPhotos])
                              ).slice(0, MAX_PRODUCT_IMAGES);
                              setFormData((prev) => ({
                                ...prev,
                                imageUrl: nextPhotos[0],
                                imageUrls: nextPhotos,
                                name: prev.name || 'Maleta para Moto Trasera Baúl 45L con Cerradura',
                                category: 'Accesorios',
                                brand: prev.brand || 'GIVI Style Pro',
                                compatibility: prev.compatibility || 'Universal con parrilla trasera',
                              }));
                              setImagePreviewError(false);
                            }}
                            className="inline-flex items-center gap-1 px-2.5 py-1 text-[11px] font-bold bg-amber-500 hover:bg-amber-400 text-slate-950 rounded-md transition-colors cursor-pointer shadow-2xs"
                          >
                            <Sparkles className="w-3 h-3" />
                            <span>📦 Usar foto de Maleta para Moto</span>
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const nextPhotos = Array.from(
                                new Set([PRESET_PRODUCT_IMAGES.helmet, ...modalPhotos])
                              ).slice(0, MAX_PRODUCT_IMAGES);
                              setFormData((prev) => ({
                                ...prev,
                                imageUrl: nextPhotos[0],
                                imageUrls: nextPhotos,
                                category: 'Accesorios',
                              }));
                              setImagePreviewError(false);
                            }}
                            className="px-2 py-1 text-[10px] font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            Casco
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const nextPhotos = Array.from(
                                new Set([PRESET_PRODUCT_IMAGES.brakeKit, ...modalPhotos])
                              ).slice(0, MAX_PRODUCT_IMAGES);
                              setFormData((prev) => ({
                                ...prev,
                                imageUrl: nextPhotos[0],
                                imageUrls: nextPhotos,
                                category: 'Frenos',
                              }));
                              setImagePreviewError(false);
                            }}
                            className="px-2 py-1 text-[10px] font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            Kit de Frenos
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const nextPhotos = Array.from(
                                new Set([PRESET_PRODUCT_IMAGES.exhaust, ...modalPhotos])
                              ).slice(0, MAX_PRODUCT_IMAGES);
                              setFormData((prev) => ({
                                ...prev,
                                imageUrl: nextPhotos[0],
                                imageUrls: nextPhotos,
                                category: 'Motor',
                              }));
                              setImagePreviewError(false);
                            }}
                            className="px-2 py-1 text-[10px] font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            Escape
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              const nextPhotos = Array.from(
                                new Set([PRESET_PRODUCT_IMAGES.upholsterySeat, ...modalPhotos])
                              ).slice(0, MAX_PRODUCT_IMAGES);
                              setFormData((prev) => ({
                                ...prev,
                                imageUrl: nextPhotos[0],
                                imageUrls: nextPhotos,
                                category: 'Tapicería',
                              }));
                              setImagePreviewError(false);
                            }}
                            className="px-2 py-1 text-[10px] font-medium bg-white hover:bg-slate-100 text-slate-700 border border-slate-200 rounded-md transition-colors cursor-pointer"
                          >
                            Asiento
                          </button>
                        </div>
                      </div>
                    </>
                  );
                })()}
              </div>
                  </div>
                </div>
              </div>

              {/* Pinned Bottom Action Bar (siempre visible sin necesidad de bajar) */}
              <div className="shrink-0 px-4 sm:px-6 py-3.5 bg-white border-t border-slate-200 flex flex-wrap items-center justify-between gap-3">
                <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600 tabular-nums">
                  {(() => {
                    const summaryUnit = getProductUnitInfo(
                      formData.unitOfMeasure === 'CUSTOM'
                        ? formData.customUnitOfMeasure || 'UNIDAD'
                        : formData.unitOfMeasure
                    );
                    return (
                      <>
                        <span className="font-semibold text-slate-900">
                          Venta BCV: {formatUSD(formPricing.analysis.salePriceUsdBcv)} {summaryUnit.priceSuffix}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        <span className="font-mono text-emerald-700 font-semibold">
                          {formatBs(formPricing.saleBsBcv)}
                        </span>
                        <span aria-hidden="true" className="text-slate-300">·</span>
                        {formData.tracksInventory ? (
                          <span>
                            Stock: <strong>{formData.stock} {summaryUnit.pluralShort}</strong>
                          </span>
                        ) : (
                          <span className="text-indigo-800 font-semibold">
                            Sin inventario · Fabricación: {formData.productionTimeLabel || DEFAULT_PRODUCTION_TIME_LABEL}
                          </span>
                        )}
                      </>
                    );
                  })()}
                  <span aria-hidden="true" className="text-slate-300">·</span>
                  <span>
                    Fotos:{' '}
                    <strong>
                      {Array.isArray(formData.imageUrls) && formData.imageUrls.length > 0
                        ? formData.imageUrls.length
                        : formData.imageUrl
                        ? 1
                        : 0}
                    </strong>
                    /{MAX_PRODUCT_IMAGES}
                  </span>
                </div>
                <div className="flex items-center gap-2.5 ml-auto">
                  <button
                    type="button"
                    onClick={() => {
                      setIsAddModalOpen(false);
                      setEditingProduct(null);
                      setIsAddingCategory(false);
                      setNewCategoryName('');
                    }}
                    className="px-4 py-2 text-slate-600 hover:text-slate-900 hover:bg-slate-100 font-semibold rounded-lg transition-colors cursor-pointer"
                  >
                    Cancelar
                  </button>
                  <button
                    type="submit"
                    className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg shadow-xs transition-colors cursor-pointer"
                  >
                    {editingProduct ? 'Guardar Cambios' : 'Registrar en Inventario'}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Single Product Delete Modal */}
      {productToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-md overflow-hidden">
            <div className="p-4 sm:p-5 bg-rose-50 border-b border-rose-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base font-display text-slate-900">
                  ¿Eliminar este repuesto del inventario?
                </h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  Esta acción no se puede deshacer.
                </p>
              </div>
              <button
                onClick={() => setProductToDelete(null)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-4 text-xs">
              <div className="flex items-center gap-3 p-3 bg-slate-50 rounded-xl border border-slate-200">
                {productToDelete.imageUrl ? (
                  <img
                    src={
                      normalizeImageUrl(productToDelete.imageUrl) ||
                      getFallbackProductImage(productToDelete.name, productToDelete.category)
                    }
                    alt={productToDelete.name}
                    className="w-12 h-12 rounded-lg object-cover bg-white shrink-0 border border-slate-200"
                    referrerPolicy="no-referrer"
                    onError={(e) => handleProductImageError(e, productToDelete)}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                    <Boxes className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 whitespace-normal break-words text-sm">
                    {productToDelete.name}
                  </p>
                  <p className="font-mono text-slate-500 text-[11px]">
                    SKU: {productToDelete.sku} • Stock: {productToDelete.stock} unds
                  </p>
                  <p className="text-slate-700 text-[11px] font-semibold mt-0.5">
                    {formatUSD(productToDelete.salePrice)} USD (equiv. {formatBs(productToDelete.salePrice * rate)})
                  </p>
                </div>
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px] leading-relaxed">
                <p className="font-semibold mb-0.5">⚠️ ¿Qué pasará al eliminarlo?</p>
                <ul className="list-disc list-inside space-y-0.5 text-amber-800">
                  <li>Se eliminará permanentemente de tu inventario.</li>
                  <li>Dejará de aparecer en la tienda online para tus clientes.</li>
                  <li>Se retirará de cualquier carrito de compra activo.</li>
                </ul>
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setProductToDelete(null)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmSingleDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sí, eliminar repuesto</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Batch Delete Confirmation Modal */}
      {isBatchDeleteModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-lg overflow-hidden">
            <div className="p-4 sm:p-5 bg-rose-50 border-b border-rose-100 flex items-start gap-3">
              <div className="w-10 h-10 rounded-full bg-rose-100 flex items-center justify-center shrink-0 text-rose-600">
                <AlertTriangle className="w-5 h-5" />
              </div>
              <div className="flex-1 min-w-0">
                <h3 className="font-bold text-base font-display text-slate-900">
                  ¿Eliminar {selectedProductIds.length} repuestos seleccionados?
                </h3>
                <p className="text-xs text-rose-700 mt-0.5">
                  Esta acción eliminará todos los repuestos marcados simultáneamente.
                </p>
              </div>
              <button
                onClick={() => setIsBatchDeleteModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 space-y-3 text-xs">
              <p className="text-slate-600 font-medium">
                Se eliminarán permanentemente los siguientes {selectedProductIds.length} artículos del inventario:
              </p>

              <div className="max-h-48 overflow-y-auto space-y-1.5 border border-slate-200 rounded-xl p-2 bg-slate-50">
                {products
                  .filter((p) => selectedProductIds.includes(p.id))
                  .map((p) => (
                    <div
                      key={p.id}
                      className="flex items-center justify-between p-2 bg-white rounded-lg border border-slate-100 text-xs"
                    >
                      <div className="min-w-0 flex-1 pr-2">
                        <p className="font-semibold text-slate-900 whitespace-normal break-words">{p.name}</p>
                        <span className="font-mono text-[10px] text-slate-400">SKU: {p.sku}</span>
                      </div>
                      <span className="text-[11px] font-mono font-bold text-slate-700 shrink-0">
                        Stock: {p.stock}
                      </span>
                    </div>
                  ))}
              </div>

              <div className="p-3 bg-amber-50 rounded-xl border border-amber-200 text-amber-900 text-[11px]">
                ⚠️ Todos estos artículos se retirarán del inventario y no se mostrarán más en la tienda online.
              </div>
            </div>

            <div className="p-4 bg-slate-50 border-t border-slate-100 flex items-center justify-end gap-2.5">
              <button
                type="button"
                onClick={() => setIsBatchDeleteModalOpen(false)}
                className="px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-200 rounded-lg transition-colors cursor-pointer"
              >
                Cancelar
              </button>
              <button
                type="button"
                onClick={handleConfirmBatchDelete}
                className="inline-flex items-center gap-1.5 px-4 py-2 text-xs font-bold bg-rose-600 hover:bg-rose-700 text-white rounded-lg shadow-2xs transition-colors cursor-pointer"
              >
                <Trash2 className="w-3.5 h-3.5" />
                <span>Sí, eliminar {selectedProductIds.length} repuestos</span>
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Manage Specialized Motorcycle Model Categories Modal */}
      {isManageModelsModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-xl max-h-[88vh] flex flex-col overflow-hidden animate-in fade-in zoom-in-95 duration-150">
            <div className="p-4 bg-slate-900 text-white flex items-center justify-between gap-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-500/20 border border-amber-400/30 text-amber-400 flex items-center justify-center shrink-0">
                  <Bike className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="font-bold text-sm font-display">
                    Modelos de Motos Especializados
                  </h3>
                  <p className="text-[11px] text-slate-300">
                    Aparecen como segundo filtro en tu Tienda Online. Agrega o edita modelos en cualquier momento.
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setIsManageModelsModalOpen(false)}
                className="p-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 cursor-pointer"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            <div className="p-4 border-b border-slate-200 bg-amber-50/50">
              <label className="block text-xs font-bold text-slate-800 mb-1.5">
                Agregar nuevo modelo de moto al catálogo online
              </label>
              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={newModelCategoryInput}
                  onChange={(e) => setNewModelCategoryInput(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddModelFromManager();
                    }
                  }}
                  placeholder="Ej. Suzuki GN 125 / Yamaha FZ16 / Empire TX 200..."
                  className="flex-1 px-3 py-2 rounded-lg border border-amber-300 bg-white text-xs text-slate-900 focus:outline-hidden focus:border-amber-500"
                />
                <button
                  type="button"
                  onClick={handleAddModelFromManager}
                  disabled={!newModelCategoryInput.trim()}
                  className="inline-flex items-center gap-1.5 px-3.5 py-2 rounded-lg bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 font-bold text-xs cursor-pointer shrink-0"
                >
                  <Plus className="w-3.5 h-3.5" />
                  <span>Agregar</span>
                </button>
              </div>
            </div>

            <div className="p-4 overflow-y-auto flex-1 space-y-2">
              {modelCategories.length === 0 ? (
                <p className="text-center text-xs text-slate-500 py-8">
                  No hay modelos configurados aún. Agrega el primero arriba.
                </p>
              ) : (
                modelCategories.map((mc) => {
                  const matchCount = products.filter((p) =>
                    doesProductMatchModelCategory(p, mc)
                  ).length;
                  const isEditingThis = editingModelName === mc;
                  return (
                    <div
                      key={mc}
                      className="flex items-center justify-between gap-2 p-2.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white transition-colors"
                    >
                      {isEditingThis ? (
                        <div className="flex items-center gap-1.5 flex-1">
                          <input
                            type="text"
                            value={editingModelDraft}
                            onChange={(e) => setEditingModelDraft(e.target.value)}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                e.preventDefault();
                                handleSaveRenameModel(mc);
                              } else if (e.key === 'Escape') {
                                setEditingModelName(null);
                                setEditingModelDraft('');
                              }
                            }}
                            autoFocus
                            className="flex-1 px-2.5 py-1.5 rounded-lg border border-amber-400 bg-white text-xs font-semibold text-slate-900 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            onClick={() => handleSaveRenameModel(mc)}
                            className="px-2.5 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-700 text-white text-[11px] font-bold cursor-pointer"
                          >
                            Guardar
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setEditingModelName(null);
                              setEditingModelDraft('');
                            }}
                            className="px-2 py-1.5 rounded-lg text-slate-500 hover:text-slate-800 text-[11px] font-semibold cursor-pointer"
                          >
                            Cancelar
                          </button>
                        </div>
                      ) : (
                        <>
                          <div className="flex items-center gap-2 min-w-0">
                            <Bike className="w-4 h-4 text-amber-600 shrink-0" />
                            <span className="text-xs font-bold text-slate-900 truncate">
                              {mc}
                            </span>
                            <button
                              type="button"
                              onClick={() => {
                                setSelectedModelCategory(mc);
                                setIsManageModelsModalOpen(false);
                              }}
                              className="px-2 py-0.5 rounded-md bg-amber-100 hover:bg-amber-200 text-amber-900 font-mono text-[10px] font-bold shrink-0 cursor-pointer"
                              title="Filtrar inventario por este modelo"
                            >
                              {matchCount} rep.
                            </button>
                          </div>

                          <div className="flex items-center gap-1 shrink-0">
                            <button
                              type="button"
                              onClick={() => {
                                setEditingModelName(mc);
                                setEditingModelDraft(mc);
                              }}
                              className="p-1.5 rounded-lg text-slate-500 hover:text-slate-900 hover:bg-slate-200/70 transition-colors cursor-pointer"
                              title="Renombrar modelo"
                            >
                              <Edit2 className="w-3.5 h-3.5" />
                            </button>
                            <button
                              type="button"
                              onClick={() => handleDeleteModelFromManager(mc)}
                              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-600 hover:bg-rose-50 transition-colors cursor-pointer"
                              title="Eliminar modelo del filtro"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>

            <div className="p-3.5 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-2 text-[11px] text-slate-500">
              <span>
                Tip: También puedes seleccionar varios repuestos en la tabla y asignarles un modelo en bloque.
              </span>
              <button
                type="button"
                onClick={() => setIsManageModelsModalOpen(false)}
                className="px-4 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 text-white font-bold text-xs cursor-pointer shrink-0"
              >
                Listo
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Import Excel Modal */}
      <ImportExcelModal
        isOpen={isImportModalOpen}
        onClose={() => setIsImportModalOpen(false)}
        existingProducts={products}
        onImportConfirmed={handleBulkImportConfirmed}
      />

      {/* Floating Toast Notification */}
      {toastMessage && (
        <div className="fixed bottom-6 right-6 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-2xl flex items-center gap-2.5 border border-slate-700 text-xs">
          <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
          <span className="font-medium">{toastMessage}</span>
          <button
            onClick={() => setToastMessage(null)}
            className="ml-2 text-slate-400 hover:text-white cursor-pointer"
          >
            <X className="w-3.5 h-3.5" />
          </button>
        </div>
      )}
    </div>
  );
};
