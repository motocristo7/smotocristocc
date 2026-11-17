import React, { useState, useMemo } from 'react';
import { useApp } from '../../context/AppContext';
import { Product, ProductCategory } from '../../types';
import { formatUSD, formatBs } from '../../utils/whatsapp';
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
  Filter,
  ArrowUpDown,
  X,
  PackageCheck,
  TrendingDown,
  TrendingUp,
  Image as ImageIcon,
  Sparkles,
  ExternalLink,
  HelpCircle,
  FileSpreadsheet,
  Download,
  UploadCloud,
  Barcode,
  MapPin,
} from 'lucide-react';
import { normalizeImageUrl, isGoogleDriveUrl, PRESET_PRODUCT_IMAGES } from '../../utils/imageUrl';
import { downloadInventoryTemplate, exportInventoryToExcel, ParsedProductRow } from '../../utils/excelInventory';
import { ImportExcelModal } from './ImportExcelModal';

export const InventoryView: React.FC = () => {
  const {
    products,
    categories,
    addCategory,
    addProduct,
    updateProduct,
    deleteProduct,
    deleteProducts,
    adjustStock,
    bulkImportProducts,
    settings,
  } = useApp();

  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState<string>('all');
  const [filterStockStatus, setFilterStockStatus] = useState<'all' | 'low' | 'out'>('all');

  // Modals state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [isImportModalOpen, setIsImportModalOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);
  const [productToDelete, setProductToDelete] = useState<Product | null>(null);
  const [selectedProductIds, setSelectedProductIds] = useState<string[]>([]);
  const [isBatchDeleteModalOpen, setIsBatchDeleteModalOpen] = useState(false);
  const [toastMessage, setToastMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const rate = settings.bcvRate;

  const handleBulkImportConfirmed = (parsedRows: ParsedProductRow[]) => {
    const result = bulkImportProducts(parsedRows);
    showToast(`✓ Carga completada: ${result.added} repuestos nuevos creados, ${result.updated} actualizados.`);
  };

  // Form State in USD
  const initialFormState = {
    sku: '',
    barcode: '',
    name: '',
    category: 'Frenos' as ProductCategory,
    description: '',
    costPrice: 0,
    salePrice: 0,
    stock: 10,
    minStock: 2,
    brand: '',
    compatibility: '',
    warehouseLocation: '',
    imageUrl: '',
  };
  const [formData, setFormData] = useState(initialFormState);
  const [isAddingCategory, setIsAddingCategory] = useState(false);
  const [newCategoryName, setNewCategoryName] = useState('');

  const filteredProducts = useMemo(() => {
    return products.filter((p) => {
      if (selectedCategory !== 'all' && p.category !== selectedCategory) return false;
      if (filterStockStatus === 'low' && p.stock > p.minStock) return false;
      if (filterStockStatus === 'out' && p.stock > 0) return false;

      if (searchTerm.trim()) {
        const q = searchTerm.toLowerCase();
        return (
          p.name.toLowerCase().includes(q) ||
          p.sku.toLowerCase().includes(q) ||
          (p.barcode && p.barcode.toLowerCase().includes(q)) ||
          (p.warehouseLocation && p.warehouseLocation.toLowerCase().includes(q)) ||
          p.brand.toLowerCase().includes(q) ||
          p.compatibility.toLowerCase().includes(q)
        );
      }

      return true;
    });
  }, [products, selectedCategory, filterStockStatus, searchTerm]);

  const [imagePreviewError, setImagePreviewError] = useState(false);

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

  const allFilteredSelected =
    filteredProducts.length > 0 &&
    filteredProducts.every((p) => selectedProductIds.includes(p.id));

  const handleToggleSelectAll = () => {
    if (allFilteredSelected) {
      const filteredIdSet = new Set(filteredProducts.map((p) => p.id));
      setSelectedProductIds((prev) => prev.filter((id) => !filteredIdSet.has(id)));
    } else {
      const newIds = new Set([...selectedProductIds, ...filteredProducts.map((p) => p.id)]);
      setSelectedProductIds(Array.from(newIds));
    }
  };

  const handleToggleSelectOne = (id: string) => {
    setSelectedProductIds((prev) =>
      prev.includes(id) ? prev.filter((item) => item !== id) : [...prev, id]
    );
  };

  const handleStartEdit = (product: Product) => {
    setEditingProduct(product);
    setImagePreviewError(false);
    setFormError(null);
    setIsAddingCategory(false);
    setNewCategoryName('');
    setFormData({
      sku: product.sku,
      barcode: product.barcode || '',
      name: product.name,
      category: product.category,
      description: product.description,
      costPrice: product.costPrice,
      salePrice: product.salePrice,
      stock: product.stock,
      minStock: product.minStock,
      brand: product.brand,
      compatibility: product.compatibility,
      warehouseLocation: product.warehouseLocation || '',
      imageUrl: normalizeImageUrl(product.imageUrl),
    });
  };

  const handleImageUrlChange = (val: string) => {
    setImagePreviewError(false);
    const converted = normalizeImageUrl(val);
    setFormData((prev) => ({ ...prev, imageUrl: converted }));
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

    const rawImage = formData.imageUrl.trim();
    let finalImageUrl = normalizeImageUrl(rawImage);
    if (!finalImageUrl && trimmedName.toLowerCase().includes('maleta')) {
      finalImageUrl = PRESET_PRODUCT_IMAGES.maletaParaMoto;
    }
    if (!finalImageUrl) {
      finalImageUrl = PRESET_PRODUCT_IMAGES.brakeKit;
    }

    const sanitizedBarcode = formData.barcode.trim() || undefined;
    const sanitizedLocation = formData.warehouseLocation.trim() || undefined;

    if (editingProduct) {
      updateProduct(editingProduct.id, {
        ...formData,
        category: categoryToSave,
        name: trimmedName,
        sku: trimmedSku,
        barcode: sanitizedBarcode,
        warehouseLocation: sanitizedLocation,
        imageUrl: finalImageUrl,
      });
      showToast(`✓ Repuesto "${trimmedName}" actualizado.`);
      setEditingProduct(null);
    } else {
      addProduct({
        ...formData,
        category: categoryToSave,
        name: trimmedName,
        sku: trimmedSku,
        barcode: sanitizedBarcode,
        warehouseLocation: sanitizedLocation,
        imageUrl: finalImageUrl,
      });
      showToast(`✓ Nuevo repuesto "${trimmedName}" registrado.`);
      setIsAddModalOpen(false);
    }

    setFormData(initialFormState);
    setIsAddingCategory(false);
    setNewCategoryName('');
    setImagePreviewError(false);
  };

  const totalValueAtSaleUSD = products.reduce((sum, p) => sum + p.salePrice * p.stock, 0);
  const totalValueAtCostUSD = products.reduce((sum, p) => sum + p.costPrice * p.stock, 0);
  const outOfStockCount = products.filter((p) => p.stock === 0).length;

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
            Valores en dólares calculados a tasa oficial BCV (Bs. {rate.toFixed(2)}). Los ítems con stock &gt; 0 se muestran en la tienda online y los agotados se ocultan.
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

          {/* Nuevo Repuesto Individual */}
          <button
            onClick={() => {
              setFormData(initialFormState);
              setFormError(null);
              setIsAddingCategory(false);
              setNewCategoryName('');
              setIsAddModalOpen(true);
            }}
            className="px-3.5 py-2 bg-slate-900 hover:bg-slate-800 text-white font-semibold text-xs rounded-xl shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5 text-amber-400" />
            <span>Nuevo Repuesto ($)</span>
          </button>
        </div>
      </div>

      {/* KPI Stats on Inventory */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            Catálogo Activo en Tienda
          </span>
          <p className="text-xl font-bold font-mono text-emerald-600 mt-1">
            {products.length - outOfStockCount}{' '}
            <span className="text-xs font-normal text-slate-500">visibles para clientes</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Con existencias en almacén</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            Agotados / Ocultos de Tienda
          </span>
          <p className="text-xl font-bold font-mono text-rose-600 mt-1">
            {outOfStockCount}{' '}
            <span className="text-xs font-normal text-slate-500">ítems en 0</span>
          </p>
          <p className="text-[11px] text-slate-400 mt-1">Ocultos de la tienda automáticamente</p>
        </div>

        <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-2xs">
          <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider">
            Valorización del Inventario
          </span>
          <p className="text-xl font-bold font-mono text-slate-900 mt-1">
            {formatUSD(totalValueAtSaleUSD)}
          </p>
          <p className="text-[11px] font-semibold text-emerald-700 font-mono mt-0.5">
            Equiv. {formatBs(totalValueAtSaleUSD * rate)} (BCV)
          </p>
        </div>
      </div>

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

          <div className="flex items-center gap-2">
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
              value={filterStockStatus}
              onChange={(e) => setFilterStockStatus(e.target.value as any)}
              className="text-xs p-2 rounded-lg border border-slate-200 bg-slate-50 font-medium"
            >
              <option value="all">Todo el stock</option>
              <option value="low">Stock bajo / crítico</option>
              <option value="out">Agotados (Stock 0)</option>
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
            <span className="text-[11px] text-slate-500 hidden sm:inline">
              (puedes eliminarlos todos a la vez)
            </span>
          </div>

          <div className="flex items-center gap-2">
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

      {/* Table of Products */}
      <div className="bg-white rounded-xl border border-slate-200 shadow-2xs overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 border-b border-slate-200 text-slate-500 font-semibold uppercase text-[10px] tracking-wider">
              <tr>
                <th className="py-3 px-3 w-10 text-center">
                  <input
                    type="checkbox"
                    checked={allFilteredSelected}
                    onChange={handleToggleSelectAll}
                    className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer w-4 h-4"
                    title={allFilteredSelected ? 'Deseleccionar todos' : 'Seleccionar todos los visibles'}
                  />
                </th>
                <th className="py-3 px-4">Ítem / SKU</th>
                <th className="py-3 px-3">Categoría & Marca</th>
                <th className="py-3 px-3">Ubicación Almacén</th>
                <th className="py-3 px-3">Compatibilidad</th>
                <th className="py-3 px-3 text-right">Precio ($ USD / Bs)</th>
                <th className="py-3 px-3 text-center">Stock Actual</th>
                <th className="py-3 px-3 text-center">Estado Tienda</th>
                <th className="py-3 px-4 text-right">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredProducts.length === 0 ? (
                <tr>
                  <td colSpan={9} className="py-8 text-center text-slate-400">
                    No se encontraron repuestos con los filtros seleccionados.
                  </td>
                </tr>
              ) : (
                filteredProducts.map((product) => {
                  const isOutOfStock = product.stock === 0;
                  const isLowStock = product.stock > 0 && product.stock <= product.minStock;
                  const priceBs = product.salePrice * rate;
                  const isSelected = selectedProductIds.includes(product.id);

                  return (
                    <tr
                      key={product.id}
                      className={`hover:bg-slate-50/70 transition-colors ${
                        isSelected ? 'bg-amber-50/40' : ''
                      }`}
                    >
                      {/* Checkbox */}
                      <td className="py-3 px-3 text-center">
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelectOne(product.id)}
                          className="rounded border-slate-300 text-amber-500 focus:ring-amber-500 cursor-pointer w-4 h-4"
                        />
                      </td>

                      {/* Name & SKU */}
                      <td className="py-3 px-4">
                        <div className="flex items-center gap-3">
                          {product.imageUrl ? (
                            <img
                              src={normalizeImageUrl(product.imageUrl)}
                              alt={product.name}
                              className="w-10 h-10 rounded-lg object-cover bg-slate-100 shrink-0 border border-slate-200"
                              referrerPolicy="no-referrer"
                              onError={(e) => {
                                const target = e.currentTarget;
                                if (product.name.toLowerCase().includes('maleta')) {
                                  target.src = PRESET_PRODUCT_IMAGES.maletaParaMoto;
                                } else {
                                  target.src = PRESET_PRODUCT_IMAGES.brakeKit;
                                }
                              }}
                            />
                          ) : (
                            <div className="w-10 h-10 rounded-lg bg-slate-100 flex items-center justify-center text-slate-400 shrink-0">
                              <Boxes className="w-4 h-4" />
                            </div>
                          )}
                          <div>
                            <p className="font-bold text-slate-900 line-clamp-1">{product.name}</p>
                            <div className="flex items-center gap-1.5 flex-wrap mt-0.5">
                              <span className="font-mono text-[10px] text-slate-500 bg-slate-100 px-1.5 py-0.5 rounded">
                                SKU: {product.sku}
                              </span>
                              {product.barcode && (
                                <span
                                  className="font-mono text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200/60 px-1.5 py-0.5 rounded inline-flex items-center gap-1"
                                  title="Código de barra"
                                >
                                  <Barcode className="w-3 h-3 text-indigo-500" />
                                  <span>{product.barcode}</span>
                                </span>
                              )}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category & Brand */}
                      <td className="py-3 px-3 text-slate-600">
                        <p className="font-medium text-slate-800">{product.category}</p>
                        <p className="text-[10px] text-slate-400">{product.brand}</p>
                      </td>

                      {/* Warehouse Location */}
                      <td className="py-3 px-3">
                        {product.warehouseLocation ? (
                          <span
                            className="inline-flex items-center gap-1 font-mono text-[11px] font-semibold text-amber-900 bg-amber-50 border border-amber-200 px-2 py-0.5 rounded-md max-w-[160px] truncate"
                            title={`Ubicación: ${product.warehouseLocation}`}
                          >
                            <MapPin className="w-3 h-3 text-amber-600 shrink-0" />
                            <span className="truncate">{product.warehouseLocation}</span>
                          </span>
                        ) : (
                          <span className="text-[11px] text-slate-400 italic">Sin asignar</span>
                        )}
                      </td>

                      {/* Compatibility */}
                      <td className="py-3 px-3 text-slate-500 max-w-[180px]">
                        <p className="truncate" title={product.compatibility}>
                          {product.compatibility}
                        </p>
                      </td>

                      {/* Price in USD and Bs */}
                      <td className="py-3 px-3 text-right">
                        <span className="font-mono font-bold text-slate-900 block tabular-nums">
                          {formatUSD(product.salePrice)}
                        </span>
                        <span className="font-mono text-[10px] font-semibold text-emerald-700 block tabular-nums">
                          {formatBs(priceBs)}
                        </span>
                      </td>

                      {/* Stock Stepper */}
                      <td className="py-3 px-3 text-center">
                        <div className="inline-flex items-center border border-slate-200 rounded-lg bg-slate-50 overflow-hidden">
                          <button
                            onClick={() => adjustStock(product.id, -1)}
                            className="px-2 py-1 hover:bg-slate-200 text-slate-600"
                            title="Restar 1"
                          >
                            -
                          </button>
                          <span
                            className={`px-2.5 font-mono font-bold text-xs ${
                              isOutOfStock
                                ? 'text-rose-600 bg-rose-50'
                                : isLowStock
                                ? 'text-amber-700 bg-amber-50'
                                : 'text-slate-900'
                            }`}
                          >
                            {product.stock}
                          </span>
                          <button
                            onClick={() => adjustStock(product.id, 1)}
                            className="px-2 py-1 hover:bg-slate-200 text-slate-600"
                            title="Sumar 1"
                          >
                            +
                          </button>
                        </div>
                      </td>

                      {/* Store Visibility */}
                      <td className="py-3 px-3 text-center">
                        {!isOutOfStock ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded border border-emerald-200">
                            <Eye className="w-3 h-3" />
                            <span>Visible</span>
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-rose-700 bg-rose-50 px-2 py-0.5 rounded border border-rose-200">
                            <EyeOff className="w-3 h-3" />
                            <span>Oculto (Stock 0)</span>
                          </span>
                        )}
                      </td>

                      {/* Actions */}
                      <td className="py-3 px-4 text-right">
                        <div className="flex items-center justify-end gap-1.5">
                          <button
                            onClick={() => handleStartEdit(product)}
                            className="p-1.5 text-slate-500 hover:text-slate-900 hover:bg-slate-100 rounded transition-colors"
                            title="Editar Repuesto"
                          >
                            <Edit2 className="w-3.5 h-3.5" />
                          </button>
                          <button
                            onClick={() => setProductToDelete(product)}
                            className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded transition-colors cursor-pointer"
                            title="Eliminar repuesto"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Product Modal */}
      {(isAddModalOpen || editingProduct) && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs">
          <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between">
              <h3 className="font-bold text-sm font-display">
                {editingProduct ? 'Editar Repuesto de Motocicleta' : 'Registrar Nuevo Repuesto en Inventario'}
              </h3>
              <button
                type="button"
                onClick={() => {
                  setIsAddModalOpen(false);
                  setEditingProduct(null);
                  setIsAddingCategory(false);
                  setNewCategoryName('');
                }}
                className="p-1 text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <form onSubmit={handleSaveProduct} className="p-6 overflow-y-auto space-y-4 text-xs">
              {formError && (
                <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl flex items-center gap-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 text-rose-500" />
                  <span>{formError}</span>
                </div>
              )}
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

              <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Precio Costo ($ USD)</label>
                  <input
                    type="number"
                    step="0.5"
                    value={formData.costPrice}
                    onChange={(e) => setFormData({ ...formData, costPrice: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Precio Venta ($ USD) *</label>
                  <input
                    type="number"
                    step="0.5"
                    required
                    value={formData.salePrice}
                    onChange={(e) => setFormData({ ...formData, salePrice: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono font-bold"
                  />
                  <span className="text-[10px] text-emerald-700 font-mono">
                    = {formatBs(formData.salePrice * rate)}
                  </span>
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Stock Inicial *</label>
                  <input
                    type="number"
                    required
                    value={formData.stock}
                    onChange={(e) => setFormData({ ...formData, stock: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono"
                  />
                </div>

                <div>
                  <label className="block font-semibold text-slate-700 mb-1">Stock Mínimo</label>
                  <input
                    type="number"
                    value={formData.minStock}
                    onChange={(e) => setFormData({ ...formData, minStock: Number(e.target.value) })}
                    className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50 font-mono"
                  />
                </div>
              </div>

              <div className="space-y-2 bg-slate-50 p-3.5 rounded-xl border border-slate-200">
                <div className="flex items-center justify-between">
                  <label className="block font-semibold text-slate-800">
                    Imagen del Repuesto (Enlace directo o Google Drive)
                  </label>
                  {isGoogleDriveUrl(formData.imageUrl) && (
                    <span className="inline-flex items-center gap-1 text-[10px] bg-emerald-100 text-emerald-800 px-2 py-0.5 rounded-full font-medium">
                      <CheckCircle2 className="w-3 h-3 text-emerald-600" />
                      Google Drive Detectado
                    </span>
                  )}
                </div>

                <div className="relative">
                  <input
                    type="text"
                    value={formData.imageUrl}
                    onChange={(e) => handleImageUrlChange(e.target.value)}
                    placeholder="Pega enlace de Google Drive (drive.google.com/file/d/...) o URL de imagen"
                    className="w-full p-2.5 rounded-lg border border-slate-300 bg-white font-mono text-[11px] focus:border-amber-500 focus:outline-hidden"
                  />
                </div>

                {/* Google Drive Notice and Helpers */}
                {isGoogleDriveUrl(formData.imageUrl) && (
                  <div className="text-[11px] bg-amber-50 border border-amber-200 rounded-lg p-2.5 text-amber-900 space-y-1">
                    <p className="font-semibold flex items-center gap-1.5 text-amber-800">
                      <HelpCircle className="w-3.5 h-3.5 shrink-0 text-amber-600" />
                      <span>Requisito para imágenes de Google Drive:</span>
                    </p>
                    <p className="text-[10px] text-amber-800 leading-relaxed">
                      El enlace fue transformado automáticamente a formato de visualización web directa.
                      Para que la imagen se vea sin bloqueos, asegúrate de que en Google Drive el archivo tenga: <strong>Acceso general: "Cualquier persona que tenga el vínculo" (Lector)</strong>.
                    </p>
                  </div>
                )}

                {/* Live Image Preview */}
                {formData.imageUrl && (
                  <div className="flex items-start gap-3 pt-1">
                    <div className="w-16 h-16 rounded-lg bg-white border border-slate-200 overflow-hidden shrink-0 relative flex items-center justify-center">
                      <img
                        src={formData.imageUrl}
                        alt="Vista previa"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                        onLoad={() => setImagePreviewError(false)}
                        onError={() => setImagePreviewError(true)}
                      />
                    </div>
                    <div className="flex-1 text-xs">
                      {imagePreviewError ? (
                        <div className="text-rose-600 space-y-0.5">
                          <p className="font-bold flex items-center gap-1 text-[11px]">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-500" />
                            No se pudo visualizar la imagen del enlace
                          </p>
                          <p className="text-[10px] text-slate-500 leading-normal">
                            Si es de Google Drive, verifica que los permisos del archivo no estén en "Restringido".
                          </p>
                        </div>
                      ) : (
                        <div className="text-emerald-700">
                          <p className="font-semibold flex items-center gap-1 text-[11px]">
                            <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                            Vista previa cargada con éxito
                          </p>
                          <p className="text-[10px] text-slate-400 truncate max-w-xs">{formData.imageUrl}</p>
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Quick Presets for Products, especially Maleta para Moto */}
                <div className="pt-2 border-t border-slate-200">
                  <span className="text-[10px] uppercase font-bold text-slate-500 tracking-wider block mb-1.5">
                    ¿Quieres usar la imagen oficial del catálogo?
                  </span>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <button
                      type="button"
                      onClick={() => {
                        setFormData((prev) => ({
                          ...prev,
                          imageUrl: PRESET_PRODUCT_IMAGES.maletaParaMoto,
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
                        setFormData((prev) => ({
                          ...prev,
                          imageUrl: PRESET_PRODUCT_IMAGES.helmet,
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
                        setFormData((prev) => ({
                          ...prev,
                          imageUrl: PRESET_PRODUCT_IMAGES.brakeKit,
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
                        setFormData((prev) => ({
                          ...prev,
                          imageUrl: PRESET_PRODUCT_IMAGES.exhaust,
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
                        setFormData((prev) => ({
                          ...prev,
                          imageUrl: PRESET_PRODUCT_IMAGES.upholsterySeat,
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
              </div>

              <div>
                <label className="block font-semibold text-slate-700 mb-1">Descripción y Detalles Técnicos</label>
                <textarea
                  rows={2}
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Materiales, especificaciones, garantía..."
                  className="w-full p-2.5 rounded-lg border border-slate-200 bg-slate-50"
                />
              </div>

              <div className="pt-4 border-t border-slate-200 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setIsAddModalOpen(false);
                    setEditingProduct(null);
                  }}
                  className="px-4 py-2 text-slate-600 hover:bg-slate-100 rounded-lg"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="px-5 py-2.5 bg-slate-900 hover:bg-slate-800 text-white font-bold rounded-lg"
                >
                  {editingProduct ? 'Guardar Cambios' : 'Registrar en Inventario'}
                </button>
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
                    src={normalizeImageUrl(productToDelete.imageUrl)}
                    alt={productToDelete.name}
                    className="w-12 h-12 rounded-lg object-cover bg-white shrink-0 border border-slate-200"
                    referrerPolicy="no-referrer"
                    onError={(e) => {
                      e.currentTarget.src = PRESET_PRODUCT_IMAGES.brakeKit;
                    }}
                  />
                ) : (
                  <div className="w-12 h-12 rounded-lg bg-slate-200 flex items-center justify-center text-slate-500 shrink-0">
                    <Boxes className="w-5 h-5" />
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="font-bold text-slate-900 truncate text-sm">
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
                        <p className="font-semibold text-slate-900 truncate">{p.name}</p>
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
