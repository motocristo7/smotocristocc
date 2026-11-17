import React, { useState, useRef } from 'react';
import {
  FileSpreadsheet,
  UploadCloud,
  CheckCircle2,
  AlertTriangle,
  X,
  Download,
  RefreshCw,
  FileText,
  PlusCircle,
  ArrowRight,
  Info,
} from 'lucide-react';
import {
  parseInventoryExcelFile,
  downloadInventoryTemplate,
  ParsedExcelResult,
  ParsedProductRow,
} from '../../utils/excelInventory';
import { Product } from '../../types';
import { formatUSD } from '../../utils/whatsapp';

interface ImportExcelModalProps {
  isOpen: boolean;
  onClose: () => void;
  existingProducts: Product[];
  onImportConfirmed: (parsedRows: ParsedProductRow[]) => void;
}

export const ImportExcelModal: React.FC<ImportExcelModalProps> = ({
  isOpen,
  onClose,
  existingProducts,
  onImportConfirmed,
}) => {
  const [file, setFile] = useState<File | null>(null);
  const [isParsing, setIsParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [parseResult, setParseResult] = useState<ParsedExcelResult | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [activeTab, setActiveTab] = useState<'valid' | 'invalid'>('valid');
  const fileInputRef = useRef<HTMLInputElement>(null);

  if (!isOpen) return null;

  const handleProcessFile = async (selectedFile: File) => {
    // Check extension
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
      const result = await parseInventoryExcelFile(selectedFile, existingProducts);
      setParseResult(result);
      if (result.validRows.length === 0 && result.invalidRows.length > 0) {
        setActiveTab('invalid');
      } else {
        setActiveTab('valid');
      }
    } catch (err: any) {
      setParseError(err.message || 'Error al procesar el archivo de Excel.');
    } finally {
      setIsParsing(false);
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0];
    if (selected) {
      handleProcessFile(selected);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const droppedFile = e.dataTransfer.files?.[0];
    if (droppedFile) {
      handleProcessFile(droppedFile);
    }
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleReset = () => {
    setFile(null);
    setParseResult(null);
    setParseError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleConfirm = () => {
    if (!parseResult || parseResult.validRows.length === 0) return;
    onImportConfirmed(parseResult.validRows);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs overflow-y-auto">
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden my-auto animate-in fade-in zoom-in-95 duration-200">
        {/* Header */}
        <div className="p-4 sm:p-5 bg-gradient-to-r from-emerald-950 via-slate-900 to-slate-950 text-white flex items-center justify-between shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-400/30 flex items-center justify-center text-emerald-400">
              <FileSpreadsheet className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold">
                Carga Masiva de Inventario desde Excel
              </h2>
              <p className="text-xs text-slate-300">
                Importa o actualiza productos masivamente con archivos .xlsx o .csv
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            className="w-8 h-8 rounded-lg bg-white/10 hover:bg-white/20 text-slate-300 hover:text-white flex items-center justify-center transition-colors cursor-pointer"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-5 overflow-y-auto flex-1 space-y-5 text-xs text-slate-700">
          {/* Top Quick Actions */}
          <div className="bg-amber-500/10 border border-amber-300/80 rounded-xl p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2.5">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-bold text-slate-900 text-xs">
                  ¿No tienes el formato oficial de carga?
                </p>
                <p className="text-[11px] text-slate-600 mt-0.5">
                  Descarga nuestra plantilla oficial con columnas configuradas, ejemplos reales de repuestos y categorías válidas.
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={downloadInventoryTemplate}
              className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-amber-500 hover:bg-amber-600 text-slate-950 font-bold rounded-lg text-xs shadow-2xs transition-colors shrink-0 cursor-pointer"
            >
              <Download className="w-3.5 h-3.5" />
              <span>Descargar Plantilla Excel</span>
            </button>
          </div>

          {/* File Upload / Drag Zone */}
          {!file && (
            <div
              onDrop={handleDrop}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
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
              <div className="w-14 h-14 rounded-2xl bg-emerald-100 text-emerald-700 mx-auto flex items-center justify-center mb-3 shadow-inner">
                <UploadCloud className="w-7 h-7" />
              </div>
              <p className="text-sm font-bold text-slate-900">
                Arrastra tu archivo Excel aquí o haz clic para seleccionarlo
              </p>
              <p className="text-xs text-slate-500 mt-1">
                Formatos compatibles: .xlsx, .xls o .csv (hasta 5,000 registros por archivo)
              </p>
              <div className="inline-flex items-center gap-1.5 mt-4 px-3 py-1 bg-slate-100 text-slate-700 font-semibold rounded-full text-[11px]">
                <FileText className="w-3 h-3 text-slate-500" />
                <span>Ej: Plantilla_Inventario_Servimotos.xlsx</span>
              </div>
            </div>
          )}

          {/* Loading parsing */}
          {isParsing && (
            <div className="p-8 text-center bg-slate-50 rounded-2xl border border-slate-200">
              <RefreshCw className="w-8 h-8 text-emerald-600 animate-spin mx-auto mb-2" />
              <p className="font-bold text-slate-900">Analizando y validando archivo...</p>
              <p className="text-xs text-slate-500 mt-0.5">Comprobando columnas, SKUs, categorías y precios.</p>
            </div>
          )}

          {/* Parse error */}
          {parseError && (
            <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl text-rose-800 flex items-start gap-2.5">
              <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
              <div className="flex-1">
                <p className="font-bold">Error en la lectura del archivo</p>
                <p className="text-xs mt-0.5">{parseError}</p>
                <button
                  onClick={handleReset}
                  className="mt-2 text-xs font-semibold text-rose-700 hover:underline cursor-pointer"
                >
                  Intentar con otro archivo
                </button>
              </div>
            </div>
          )}

          {/* Parse Result Summary */}
          {parseResult && (
            <div className="space-y-4">
              {/* File Info Bar */}
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

              {/* Stats Counters */}
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <div className="bg-emerald-50 border border-emerald-200 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                    Válidos para Carga
                  </span>
                  <p className="text-xl font-mono font-bold text-emerald-700 mt-0.5">
                    {parseResult.stats.validCount}
                  </p>
                </div>

                <div className="bg-blue-50 border border-blue-200 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-blue-800">
                    Nuevos Repuestos
                  </span>
                  <p className="text-xl font-mono font-bold text-blue-700 mt-0.5">
                    {parseResult.stats.newCount}
                  </p>
                </div>

                <div className="bg-amber-50 border border-amber-200 p-3 rounded-xl">
                  <span className="text-[10px] font-bold uppercase tracking-wider text-amber-800">
                    Actualizaciones (SKU)
                  </span>
                  <p className="text-xl font-mono font-bold text-amber-700 mt-0.5">
                    {parseResult.stats.updateCount}
                  </p>
                </div>

                <div className={`p-3 rounded-xl border ${parseResult.stats.invalidCount > 0 ? 'bg-rose-50 border-rose-200 text-rose-800' : 'bg-slate-50 border-slate-200 text-slate-500'}`}>
                  <span className="text-[10px] font-bold uppercase tracking-wider">
                    Filas con Error
                  </span>
                  <p className={`text-xl font-mono font-bold mt-0.5 ${parseResult.stats.invalidCount > 0 ? 'text-rose-700' : 'text-slate-700'}`}>
                    {parseResult.stats.invalidCount}
                  </p>
                </div>
              </div>

              {/* Tabs for preview */}
              <div className="flex items-center gap-2 border-b border-slate-200 pb-1">
                <button
                  type="button"
                  onClick={() => setActiveTab('valid')}
                  className={`px-3 py-1.5 font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                    activeTab === 'valid'
                      ? 'bg-emerald-600 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-slate-100'
                  }`}
                >
                  <CheckCircle2 className="w-3.5 h-3.5" />
                  <span>Repuestos a Importar ({parseResult.stats.validCount})</span>
                </button>

                {parseResult.stats.invalidCount > 0 && (
                  <button
                    type="button"
                    onClick={() => setActiveTab('invalid')}
                    className={`px-3 py-1.5 font-bold rounded-lg transition-colors cursor-pointer flex items-center gap-1.5 ${
                      activeTab === 'invalid'
                        ? 'bg-rose-600 text-white shadow-2xs'
                        : 'text-rose-700 hover:bg-rose-50'
                    }`}
                  >
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Filas Omitidas / Errores ({parseResult.stats.invalidCount})</span>
                  </button>
                )}
              </div>

              {/* Valid Rows Preview Table */}
              {activeTab === 'valid' && (
                <div className="border border-slate-200 rounded-xl overflow-hidden shadow-2xs">
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left border-collapse">
                      <thead className="bg-slate-100 text-[11px] font-bold text-slate-700 sticky top-0 border-b border-slate-200">
                        <tr>
                          <th className="p-2.5">Acción</th>
                          <th className="p-2.5">SKU</th>
                          <th className="p-2.5">Repuesto</th>
                          <th className="p-2.5">Categoría</th>
                          <th className="p-2.5 text-right">PVP ($)</th>
                          <th className="p-2.5 text-center">Stock</th>
                          <th className="p-2.5">Marca / Moto</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100 text-[11px]">
                        {parseResult.validRows.map((row) => (
                          <tr key={`${row.sku}-${row.rowNumber}`} className="hover:bg-slate-50/80">
                            <td className="p-2.5">
                              {row.action === 'new' ? (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-blue-100 text-blue-800 rounded font-bold text-[10px]">
                                  <PlusCircle className="w-3 h-3" />
                                  Nuevo
                                </span>
                              ) : (
                                <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-amber-100 text-amber-800 rounded font-bold text-[10px]">
                                  <RefreshCw className="w-3 h-3" />
                                  Actualiza
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 font-mono">
                              <span className="font-semibold text-slate-900 block">{row.sku}</span>
                              {row.barcode && (
                                <span className="text-[10px] text-indigo-700 bg-indigo-50 border border-indigo-200/50 px-1 py-0.2 rounded font-mono inline-block mt-0.5">
                                  Barra: {row.barcode}
                                </span>
                              )}
                            </td>
                            <td className="p-2.5 font-medium text-slate-900 max-w-[200px] truncate" title={row.name}>
                              {row.name}
                            </td>
                            <td className="p-2.5">
                              <span className="bg-slate-100 text-slate-700 px-1.5 py-0.5 rounded font-medium">
                                {row.category}
                              </span>
                            </td>
                            <td className="p-2.5 text-right font-mono font-bold text-slate-900">
                              {formatUSD(row.salePrice)}
                            </td>
                            <td className="p-2.5 text-center font-mono">
                              <span className={row.stock > 0 ? 'text-emerald-700 font-bold' : 'text-rose-600 font-bold'}>
                                {row.stock}
                              </span>
                            </td>
                            <td className="p-2.5 text-slate-500 max-w-[170px]">
                              <span className="truncate block">
                                {row.brand} · {row.compatibility}
                              </span>
                              {row.warehouseLocation && (
                                <span className="text-[10px] font-mono text-amber-800 bg-amber-50 border border-amber-200 px-1.5 py-0.2 rounded inline-block mt-0.5">
                                  📍 {row.warehouseLocation}
                                </span>
                              )}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}

              {/* Invalid Rows Preview */}
              {activeTab === 'invalid' && parseResult.stats.invalidCount > 0 && (
                <div className="border border-rose-200 rounded-xl overflow-hidden bg-rose-50/30">
                  <div className="max-h-60 overflow-y-auto">
                    <table className="w-full text-left border-collapse text-[11px]">
                      <thead className="bg-rose-100/70 text-rose-900 font-bold sticky top-0 border-b border-rose-200">
                        <tr>
                          <th className="p-2.5">Fila Excel</th>
                          <th className="p-2.5">Motivo del Error</th>
                          <th className="p-2.5">Datos Detectados</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-rose-100">
                        {parseResult.invalidRows.map((inv, idx) => (
                          <tr key={idx} className="hover:bg-rose-50">
                            <td className="p-2.5 font-mono font-bold text-rose-900">
                              Fila #{inv.rowNumber}
                            </td>
                            <td className="p-2.5 text-rose-700 font-semibold">
                              {inv.reason}
                            </td>
                            <td className="p-2.5 font-mono text-slate-600 truncate max-w-[300px]" title={JSON.stringify(inv.data)}>
                              {JSON.stringify(inv.data)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="p-4 bg-slate-50 border-t border-slate-200 flex items-center justify-between gap-3 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 text-xs font-semibold text-slate-700 hover:text-slate-900 hover:bg-slate-200 rounded-xl transition-colors cursor-pointer"
          >
            Cancelar
          </button>

          <button
            type="button"
            disabled={!parseResult || parseResult.validRows.length === 0}
            onClick={handleConfirm}
            className={`px-5 py-2.5 rounded-xl text-xs font-bold transition-all shadow-xs flex items-center gap-2 cursor-pointer ${
              parseResult && parseResult.validRows.length > 0
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white shadow-emerald-600/20'
                : 'bg-slate-200 text-slate-400 cursor-not-allowed'
            }`}
          >
            <CheckCircle2 className="w-4 h-4" />
            <span>
              {parseResult && parseResult.validRows.length > 0
                ? `Confirmar Carga de ${parseResult.validRows.length} Repuestos`
                : 'Cargar Repuestos'}
            </span>
          </button>
        </div>
      </div>
    </div>
  );
};
