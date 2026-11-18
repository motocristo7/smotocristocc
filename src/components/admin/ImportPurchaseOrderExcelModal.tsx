import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  CheckCircle2,
  Download,
  FileSpreadsheet,
  FileText,
  Info,
  PlusCircle,
  RefreshCw,
  UploadCloud,
  X,
} from 'lucide-react';
import {
  downloadPurchaseOrderTemplate,
  parsePurchaseOrderExcelFile,
  ParsedPOExcelItem,
  ParsedPOHeaderMetadata,
  ParsedPurchaseOrderExcelResult,
} from '../../utils/excelPurchaseOrder';
import { Product, Supplier } from '../../types';
import { formatUSD } from '../../utils/whatsapp';

interface ImportPurchaseOrderExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingProducts: Product[];
  suppliers: Supplier[];
  hasExistingOrderItems: boolean;
  onImportConfirmed: (payload: {
    items: ParsedPOExcelItem[];
    headerMetadata: ParsedPOHeaderMetadata | null;
    applyHeaderMetadata: boolean;
    mode: 'append' | 'replace';
  }) => void;
}

export const ImportPurchaseOrderExcelModal: React.FC<ImportPurchaseOrderExcelModalProps> = ({
  isOpen,
  onClose,
  existingProducts,
  suppliers,
  hasExistingOrderItems,
  onImportConfirmed,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParsedPurchaseOrderExcelResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'valid' | 'invalid'>('valid');
  const [applyHeaderMetadata, setApplyHeaderMetadata] = useState(true);
  const [importMode, setImportMode] = useState<'append' | 'replace'>('replace');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleReset = () => {
    setFile(null);
    setParseResult(null);
    setParseError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleProcessFile = async (selectedFile: File) => {
    const name = selectedFile.name.toLowerCase();
    if (!name.endsWith('.xlsx') && !name.endsWith('.xls') && !name.endsWith('.csv')) {
      setParseError('Por favor selecciona un archivo de Excel válido (.xlsx, .xls) o CSV.');
      return;
    }

    setFile(selectedFile);
    setIsParsing(true);
    setParseError(null);
    setParseResult(null);

    try {
      const result = await parsePurchaseOrderExcelFile(selectedFile, existingProducts, suppliers);
      setParseResult(result);
      setApplyHeaderMetadata(Boolean(result.headerMetadata));
      setImportMode(hasExistingOrderItems ? 'append' : 'replace');
      if (result.validItems.length === 0 && result.invalidRows.length > 0) {
        setActiveTab('invalid');
      } else {
        setActiveTab('valid');
      }
    } catch (err: any) {
      setParseError(err?.message || 'Error al procesar el archivo de Excel.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      void handleProcessFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const dropped = e.dataTransfer.files?.[0];
    if (dropped) {
      void handleProcessFile(dropped);
    }
  };

  const handleConfirm = () => {
    if (!parseResult || parseResult.validItems.length === 0) return;
    onImportConfirmed({
      items: parseResult.validItems,
      headerMetadata: parseResult.headerMetadata,
      applyHeaderMetadata,
      mode: hasExistingOrderItems ? importMode : 'replace',
    });
    handleReset();
    onClose();
  };

  const handleClose = () => {
    handleReset();
    onClose();
  };

  const detectedSupplier =
    parseResult?.headerMetadata?.supplierId
      ? suppliers.find((s) => s.id === parseResult.headerMetadata?.supplierId)
      : undefined;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-4 bg-slate-900/70 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-slate-900 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                Importar Orden de Compra desde Excel
              </h2>
              <p className="text-xs text-slate-300">
                Carga repuestos, cantidades, costos de compra y precios de venta para inventario en segundos
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={handleClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-4 text-xs text-slate-700">
          {/* Template download prompt */}
          <div className="bg-amber-500/10 border border-amber-300/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900 text-xs">
                  Plantilla Oficial de Orden de Compra (.xlsx)
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Incluye las columnas de costo de compra, precio de venta, ubicación y hoja opcional para datos de proveedor y condición de pago.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={downloadPurchaseOrderTemplate}
              className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs shadow-2xs transition-colors shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar Plantilla Excel</span>
            </button>
          </div>

          {/* Dropzone */}
          {!file && (
            <div
              onDrop={handleDrop}
              onDragOver={(e) => {
                e.preventDefault();
                setIsDragging(true);
              }}
              onDragLeave={() => setIsDragging(false)}
              onClick={() => fileInputRef.current?.click()}
              className={`border-2 border-dashed rounded-2xl p-8 text-center transition-all cursor-pointer ${
                isDragging
                  ? 'border-emerald-500 bg-emerald-50/50 scale-[0.99]'
                  : 'border-slate-300 hover:border-emerald-500 hover:bg-slate-50/60'
              }`}
            >
              <input
                ref={fileInputRef}
                type="file"
                accept=".xlsx, .xls, .csv"
                onChange={handleFileChange}
                className="hidden"
              />
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-3">
                <UploadCloud className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-slate-900">
                Arrastra tu archivo Excel aquí o haz clic para seleccionarlo
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Formatos compatibles: .xlsx, .xls o .csv
              </p>
              <div className="inline-flex items-center gap-1.5 mt-4 px-3 py-1 bg-slate-100 text-slate-700 font-semibold rounded-full text-[11px]">
                <FileText className="w-3 h-3 text-slate-500" />
                <span>Ej: Plantilla_Orden_Compra_Servimotos.xlsx</span>
              </div>
            </div>
          )}

          {/* Parsing spinner */}
          {isParsing && (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
              <p className="font-bold text-slate-900">Analizando orden de compra en Excel...</p>
              <p className="text-xs text-slate-500 mt-0.5">
                Validando SKUs, cantidades, costos de compra y precios de venta para inventario.
              </p>
            </div>
          )}

          {/* Error */}
          {parseError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">No se pudo leer el archivo</p>
                <p className="text-xs mt-0.5">{parseError}</p>
                <button
                  type="button"
                  onClick={handleReset}
                  className="mt-2 text-xs font-semibold text-rose-700 hover:underline cursor-pointer"
                >
                  Intentar con otro archivo
                </button>
              </div>
            </div>
          )}

          {/* Results */}
          {parseResult && (
            <div className="space-y-4">
              {/* File info bar */}
              <div className="flex flex-wrap items-center justify-between gap-2 p-3 bg-slate-100 rounded-xl">
                <div className="flex items-center gap-2">
                  <FileSpreadsheet className="w-4 h-4 text-emerald-600" />
                  <span className="font-bold text-slate-900">{file?.name}</span>
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-500">{parseResult.stats.totalRows} filas leídas</span>
                </div>
                <button
                  type="button"
                  onClick={handleReset}
                  className="text-xs text-slate-600 hover:text-slate-900 font-semibold hover:underline cursor-pointer"
                >
                  Cambiar archivo
                </button>
              </div>

              {/* KPI cards */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold uppercase text-slate-500 block">
                    Total Factura (Solo Costos)
                  </span>
                  <span className="text-lg font-extrabold font-mono text-slate-900">
                    {formatUSD(parseResult.stats.totalCostUSD)}
                  </span>
                </div>
                <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold uppercase text-emerald-700 block">
                    Repuestos Válidos
                  </span>
                  <span className="text-lg font-extrabold font-mono text-emerald-900">
                    {parseResult.stats.validCount}
                  </span>
                </div>
                <div className="bg-amber-50 border border-amber-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold uppercase text-amber-700 block">
                    Nuevos en Inventario
                  </span>
                  <span className="text-lg font-extrabold font-mono text-amber-900">
                    {parseResult.stats.newCount}
                  </span>
                </div>
                <div className="bg-blue-50 border border-blue-200 rounded-xl p-3">
                  <span className="text-[10px] font-bold uppercase text-blue-700 block">
                    Enlazados a Existentes
                  </span>
                  <span className="text-lg font-extrabold font-mono text-blue-900">
                    {parseResult.stats.existingCount}
                  </span>
                </div>
              </div>

              {/* Optional header metadata preview */}
              {parseResult.headerMetadata && (
                <div className="bg-indigo-50/70 border border-indigo-200 rounded-xl p-3 space-y-2">
                  <label className="flex items-center gap-2 cursor-pointer font-bold text-indigo-950">
                    <input
                      type="checkbox"
                      checked={applyHeaderMetadata}
                      onChange={(e) => setApplyHeaderMetadata(e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <span>
                      Aplicar datos generales detectados en la hoja &quot;Datos_Orden_Opcional&quot;
                    </span>
                  </label>
                  <div className="flex flex-wrap gap-2 text-[11px] text-indigo-900 pl-6">
                    {detectedSupplier ? (
                      <span className="px-2 py-0.5 rounded bg-white border border-indigo-200">
                        Proveedor: <strong>[{detectedSupplier.code}] {detectedSupplier.name}</strong>
                      </span>
                    ) : parseResult.headerMetadata.supplierCodeHint ? (
                      <span className="px-2 py-0.5 rounded bg-amber-100 border border-amber-300 text-amber-900">
                        Código proveedor no encontrado: {parseResult.headerMetadata.supplierCodeHint} (selecciónalo manual)
                      </span>
                    ) : null}
                    {parseResult.headerMetadata.supplierInvoiceNumber && (
                      <span className="px-2 py-0.5 rounded bg-white border border-indigo-200 font-mono">
                        Factura: {parseResult.headerMetadata.supplierInvoiceNumber}
                      </span>
                    )}
                    {parseResult.headerMetadata.paymentType && (
                      <span className="px-2 py-0.5 rounded bg-white border border-indigo-200">
                        {parseResult.headerMetadata.paymentType}
                        {parseResult.headerMetadata.creditDays
                          ? ` (${parseResult.headerMetadata.creditDays}d)`
                          : ''}
                      </span>
                    )}
                    {parseResult.headerMetadata.paymentCurrencyCondition && (
                      <span className="px-2 py-0.5 rounded bg-white border border-indigo-200">
                        Moneda:{' '}
                        {parseResult.headerMetadata.paymentCurrencyCondition === 'BS_BCV'
                          ? 'Bs a BCV'
                          : 'Divisas ($)'}
                      </span>
                    )}
                  </div>
                </div>
              )}

              {/* Append vs Replace if current order already has items */}
              {hasExistingOrderItems && parseResult.validItems.length > 0 && (
                <div className="bg-slate-50 border border-slate-200 rounded-xl p-3 flex flex-wrap items-center justify-between gap-2">
                  <span className="font-bold text-slate-800">
                    La orden actual ya tiene repuestos cargados. ¿Qué deseas hacer?
                  </span>
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setImportMode('append')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                        importMode === 'append'
                          ? 'bg-slate-900 text-amber-400 border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      Sumar a los actuales
                    </button>
                    <button
                      type="button"
                      onClick={() => setImportMode('replace')}
                      className={`px-3 py-1 rounded-lg text-xs font-bold border cursor-pointer ${
                        importMode === 'replace'
                          ? 'bg-slate-900 text-amber-400 border-slate-900'
                          : 'bg-white text-slate-700 border-slate-300'
                      }`}
                    >
                      Reemplazar lista
                    </button>
                  </div>
                </div>
              )}

              {/* Tabs */}
              <div className="flex items-center gap-2 border-b border-slate-200">
                <button
                  type="button"
                  onClick={() => setActiveTab('valid')}
                  className={`px-3 py-2 font-bold text-xs border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'valid'
                      ? 'border-emerald-600 text-emerald-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Válidos ({parseResult.stats.validCount})</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('invalid')}
                  className={`px-3 py-2 font-bold text-xs border-b-2 transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'invalid'
                      ? 'border-rose-600 text-rose-700'
                      : 'border-transparent text-slate-500 hover:text-slate-700'
                  }`}
                >
                  <AlertTriangle className="w-3.5 h-3.5" />
                  <span>Con Errores ({parseResult.stats.invalidCount})</span>
                </button>
              </div>

              {/* Valid table */}
              {activeTab === 'valid' && (
                <div className="max-h-64 overflow-auto border border-slate-200 rounded-xl">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-100 text-slate-600 uppercase text-[10px] sticky top-0">
                      <tr>
                        <th className="p-2">Estado</th>
                        <th className="p-2">SKU</th>
                        <th className="p-2">Repuesto</th>
                        <th className="p-2">Categoría</th>
                        <th className="p-2 text-center">Cant.</th>
                        <th className="p-2 text-right">Costo Unit</th>
                        <th className="p-2 text-right">P. Venta (Inv.)</th>
                        <th className="p-2 text-right">Subt. Costo</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {parseResult.validItems.map((item) => (
                        <tr key={item.id} className="hover:bg-slate-50">
                          <td className="p-2">
                            {item.matchStatus === 'new' ? (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-amber-100 text-amber-800 text-[10px] font-bold">
                                <PlusCircle className="w-2.5 h-2.5" />
                                Nuevo
                              </span>
                            ) : (
                              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-blue-100 text-blue-800 text-[10px] font-bold">
                                <RefreshCw className="w-2.5 h-2.5" />
                                Existente
                              </span>
                            )}
                          </td>
                          <td className="p-2 font-mono text-[11px] font-semibold">{item.sku}</td>
                          <td className="p-2 font-medium text-slate-900">
                            {item.name}
                            {item.warehouseLocation && (
                              <span className="block text-[10px] text-slate-400">
                                Ubic: {item.warehouseLocation}
                              </span>
                            )}
                          </td>
                          <td className="p-2 text-slate-600">{item.category}</td>
                          <td className="p-2 text-center font-mono font-bold">{item.quantity}</td>
                          <td className="p-2 text-right font-mono">{formatUSD(item.unitCostUSD)}</td>
                          <td className="p-2 text-right font-mono font-bold text-emerald-700">
                            {formatUSD(item.salePriceUSD || 0)}
                          </td>
                          <td className="p-2 text-right font-mono font-bold text-slate-900">
                            {formatUSD(item.totalCostUSD)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Invalid table */}
              {activeTab === 'invalid' && (
                <div className="max-h-64 overflow-auto border border-rose-200 rounded-xl">
                  {parseResult.invalidRows.length === 0 ? (
                    <div className="p-6 text-center text-slate-500">
                      ¡Excelente! Todas las filas del archivo son válidas.
                    </div>
                  ) : (
                    <table className="w-full text-left border-collapse text-xs">
                      <thead className="bg-rose-50 text-rose-800 uppercase text-[10px] sticky top-0">
                        <tr>
                          <th className="p-2">Fila Excel</th>
                          <th className="p-2">Motivo del error</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100">
                        {parseResult.invalidRows.map((err) => (
                          <tr key={err.rowNumber}>
                            <td className="p-2 font-mono font-bold text-rose-700">
                              Fila {err.rowNumber}
                            </td>
                            <td className="p-2 text-rose-900">{err.reason}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 bg-slate-50 border-t border-slate-200 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={handleClose}
            className="px-4 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-200 rounded-xl cursor-pointer"
          >
            Cancelar
          </button>
          <button
            type="button"
            disabled={!parseResult || parseResult.validItems.length === 0}
            onClick={handleConfirm}
            className="inline-flex items-center gap-1.5 px-5 py-2.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white text-xs font-bold rounded-xl shadow-sm cursor-pointer"
          >
            <span>
              Cargar {parseResult?.stats.validCount || 0} Repuestos a la Orden
            </span>
            <ArrowRight className="w-4 h-4 text-amber-400" />
          </button>
        </div>
      </div>
    </div>
  );
};
