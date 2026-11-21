import React, { useState, useEffect } from 'react';
import { Upload, X, FileText, CheckCircle2, AlertCircle, Loader2, Sparkles, Trash2 } from 'lucide-react';
import { DeckSummary, FormatType } from '../types';

interface ImportExportModalProps {
  isOpen: boolean;
  onClose: () => void;
  decks: DeckSummary[];
  locations: string[];
  onImportComplete: (deckId?: number | null) => void;
}

const SAMPLE_LIST = `Commander
1 Atraxa, Praetors' Voice (2XM) 190 *F*

Deck
1 Sol Ring (CMM) 410
1 Arcane Signet (CMM) 367
1 Rhystic Study (WOT) 25
1 Smothering Tithe (2X2) 31
1 Swords to Plowshares (CMR) 387
1 Counterspell (MH2) 267
1 Birds of Paradise (RVR) 133 *F*
1 Breeding Pool (RVR) 275`;

export const ImportExportModal: React.FC<ImportExportModalProps> = ({
  isOpen,
  onClose,
  decks,
  locations,
  onImportComplete
}) => {
  const [target, setTarget] = useState<'inventory' | 'deck'>('inventory');
  const [location, setLocation] = useState('Main Binder');
  const [replaceExisting, setReplaceExisting] = useState(false);
  const [deckMode, setDeckMode] = useState<'new' | 'existing'>('new');
  const [selectedDeckId, setSelectedDeckId] = useState<number>(decks[0]?.id || 1);
  const [newDeckName, setNewDeckName] = useState('Imported Commander Deck');
  const [newDeckFormat, setNewDeckFormat] = useState<FormatType>('commander');

  const [rawText, setRawText] = useState('');
  const [uploadedFileName, setUploadedFileName] = useState<string | null>(null);
  const [uploadedLineCount, setUploadedLineCount] = useState<number>(0);

  const [loading, setLoading] = useState(false);
  const [progress, setProgress] = useState<{
    phase: string;
    processedBatches: number;
    totalBatches: number;
    resolvedCards: number;
    totalRows: number;
    message: string;
  } | null>(null);

  const [result, setResult] = useState<{
    resolvedCount: number;
    parsedRowCount?: number;
    scryfallMatchedCount?: number;
    fallbackCreatedCount?: number;
    unresolved: string[];
    deckId?: number;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!loading) {
      setProgress(null);
      return;
    }
    const interval = setInterval(async () => {
      try {
        const res = await fetch('/api/import/progress');
        if (res.ok) {
          const data = await res.json();
          if (data.active) {
            setProgress(data);
          }
        }
      } catch {
        // ignore polling error
      }
    }, 450);

    return () => clearInterval(interval);
  }, [loading]);

  if (!isOpen) return null;

  async function handleFileUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    const lineCount = text.split(/\r?\n/).filter(l => l.trim().length > 0).length;
    setUploadedFileName(file.name);
    setUploadedLineCount(Math.max(0, lineCount - 1));
    setRawText(text);
    setResult(null);
    setError(null);
  }

  function handleClearFile() {
    setUploadedFileName(null);
    setUploadedLineCount(0);
    setRawText('');
    setResult(null);
    setError(null);
  }

  async function handleImport() {
    if (!rawText.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);

    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          text: rawText,
          target,
          location,
          replaceExisting,
          deckId: target === 'deck' && deckMode === 'existing' ? selectedDeckId : null,
          newDeckName,
          newDeckFormat
        })
      });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error || 'Import failed');
      setResult(json);
      onImportComplete(json.deckId);
    } catch (err: any) {
      setError(err.message || 'Failed to import cards');
    } finally {
      setLoading(false);
    }
  }

  const allLocations = Array.from(
    new Set(['Main Binder', 'Staples Binder', 'Trade Binder', 'Commander Box', 'Lands Binder', 'Imported Binder', ...locations])
  );

  const isLargeUpload = rawText.length > 25000 || uploadedFileName !== null;
  const pct =
    progress && progress.totalBatches > 0
      ? Math.min(98, Math.round((progress.processedBatches / progress.totalBatches) * 100))
      : 15;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/80 backdrop-blur-sm p-4">
      <div className="bg-slate-900 border border-slate-700/80 rounded-2xl max-w-3xl w-full max-h-[90vh] flex flex-col shadow-2xl overflow-hidden">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800">
          <div className="flex items-center gap-2.5">
            <div className="p-2 rounded-xl bg-amber-500/15 border border-amber-500/30 text-amber-400">
              <Upload className="w-5 h-5" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-slate-100">
                High-Volume CSV & Decklist Importer (10,000+ Cards Supported)
              </h3>
              <p className="text-xs text-slate-400">
                Supports Moxfield, ManaBox, DragonShield, Archidekt, TCGplayer, Deckbox, & Arena with automatic rate-limit retry
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-100 hover:bg-slate-800 transition cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-6 overflow-y-auto space-y-4 flex-1">
          {/* Destination Toggle */}
          <div className="grid grid-cols-2 gap-3">
            <button
              type="button"
              onClick={() => setTarget('inventory')}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                target === 'inventory'
                  ? 'bg-amber-500/15 border-amber-400 text-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-bold text-sm">Import into Collection Inventory</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Add owned cards into your Vault (preserves CSV Binder/Folder names automatically)
              </div>
            </button>

            <button
              type="button"
              onClick={() => setTarget('deck')}
              className={`p-3 rounded-xl border text-left transition cursor-pointer ${
                target === 'deck'
                  ? 'bg-amber-500/15 border-amber-400 text-slate-100'
                  : 'bg-slate-950 border-slate-800 text-slate-400 hover:border-slate-700'
              }`}
            >
              <div className="font-bold text-sm">Import as a Decklist</div>
              <div className="text-xs text-slate-400 mt-0.5">
                Create a new deck or append to an existing deck & check missing cards
              </div>
            </button>
          </div>

          {/* Target Settings */}
          {target === 'inventory' ? (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-2.5 text-xs">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-2.5">
                  <span className="text-slate-400 font-medium">Default Binder (if CSV has no Binder column):</span>
                  <select
                    value={location}
                    onChange={e => setLocation(e.target.value)}
                    className="px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100 font-semibold"
                  >
                    {allLocations.map(loc => (
                      <option key={loc} value={loc}>{loc}</option>
                    ))}
                  </select>
                </div>
              </div>

              <label className="inline-flex items-center gap-2 pt-1 text-amber-300 font-medium cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={replaceExisting}
                  onChange={e => setReplaceExisting(e.target.checked)}
                  className="rounded border-slate-700 text-amber-500 focus:ring-amber-500"
                />
                <span>Replace existing collection before importing (wipes old/partial collection first so nothing is double-counted)</span>
              </label>
            </div>
          ) : (
            <div className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-3 text-xs">
              <div className="flex items-center gap-4">
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={deckMode === 'new'}
                    onChange={() => setDeckMode('new')}
                  />
                  <span className="font-semibold text-slate-200">Create New Deck</span>
                </label>
                <label className="inline-flex items-center gap-1.5 cursor-pointer">
                  <input
                    type="radio"
                    checked={deckMode === 'existing'}
                    onChange={() => setDeckMode('existing')}
                  />
                  <span className="font-semibold text-slate-200">Add to Existing Deck</span>
                </label>
              </div>

              {deckMode === 'new' ? (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-slate-400 mb-1">New Deck Name</label>
                    <input
                      type="text"
                      value={newDeckName}
                      onChange={e => setNewDeckName(e.target.value)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                    />
                  </div>
                  <div>
                    <label className="block text-slate-400 mb-1">Format</label>
                    <select
                      value={newDeckFormat}
                      onChange={e => setNewDeckFormat(e.target.value as FormatType)}
                      className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                    >
                      <option value="commander">Commander / EDH (100-Card Singleton)</option>
                      <option value="standard">Standard (60-Card)</option>
                      <option value="pioneer">Pioneer (60-Card)</option>
                      <option value="modern">Modern (60-Card)</option>
                      <option value="legacy">Legacy (60-Card)</option>
                      <option value="pauper">Pauper (60-Card Commons)</option>
                      <option value="freeform">Freeform</option>
                    </select>
                  </div>
                </div>
              ) : (
                <div>
                  <label className="block text-slate-400 mb-1">Select Existing Deck</label>
                  <select
                    value={selectedDeckId}
                    onChange={e => setSelectedDeckId(Number(e.target.value))}
                    className="w-full px-3 py-1.5 rounded-lg bg-slate-900 border border-slate-700 text-slate-100"
                  >
                    {decks.map(d => (
                      <option key={d.id} value={d.id}>{d.name} ({d.format.toUpperCase()})</option>
                    ))}
                  </select>
                </div>
              )}
            </div>
          )}

          {/* File upload or Paste area */}
          <div>
            <div className="flex items-center justify-between mb-1.5">
              <label className="text-xs font-semibold text-slate-300">
                Upload CSV / TXT File or Paste Card List
              </label>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUploadedFileName(null);
                    setRawText(SAMPLE_LIST);
                  }}
                  className="text-xs text-amber-400 hover:underline flex items-center gap-1 cursor-pointer"
                >
                  <Sparkles className="w-3 h-3" /> Load Sample List
                </button>
                <label className="px-3 py-1.5 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-xs font-bold text-amber-300 cursor-pointer flex items-center gap-1.5 transition">
                  <FileText className="w-3.5 h-3.5 text-amber-400" />
                  Select .CSV / .TXT File
                  <input type="file" accept=".csv,.txt,.tsv" onChange={handleFileUpload} className="hidden" />
                </label>
              </div>
            </div>

            {isLargeUpload ? (
              <div className="p-5 rounded-xl bg-slate-950 border border-amber-500/40 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3">
                  <div className="p-2.5 rounded-xl bg-amber-500/15 text-amber-400">
                    <FileText className="w-6 h-6" />
                  </div>
                  <div>
                    <div className="font-bold text-sm text-slate-100">
                      {uploadedFileName || 'Large Card List Loaded'}
                    </div>
                    <div className="text-xs text-slate-400 mt-0.5">
                      Approx. <strong className="text-amber-300">{uploadedLineCount.toLocaleString()}</strong> rows ready for high-speed batch import ({Math.round(rawText.length / 1024).toLocaleString()} KB)
                    </div>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={handleClearFile}
                  className="px-3 py-1.5 rounded-lg bg-slate-800 hover:bg-rose-950 text-slate-300 hover:text-rose-200 text-xs font-semibold flex items-center gap-1 cursor-pointer"
                >
                  <Trash2 className="w-3.5 h-3.5" />
                  Clear File
                </button>
              </div>
            ) : (
              <textarea
                rows={8}
                value={rawText}
                onChange={e => setRawText(e.target.value)}
                placeholder={`Examples supported:\n1 Atraxa, Praetors' Voice (2XM) 190 *F*\n4x Counterspell [MH2]\n1 Sol Ring\n\nOr click "Select .CSV / .TXT File" above to upload a 9,000+ card CSV export from ManaBox, Moxfield, DragonShield, TCGplayer, or Archidekt.`}
                className="w-full p-3.5 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-200 focus:outline-none focus:border-amber-400"
              />
            )}
          </div>

          {/* Live Progress Bar during large imports */}
          {loading && (
            <div className="p-4 rounded-xl bg-slate-950 border border-sky-500/40 space-y-2.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-sky-300 flex items-center gap-2">
                  <Loader2 className="w-4 h-4 animate-spin text-sky-400" />
                  {progress?.message || 'Processing CSV rows & resolving Scryfall printings...'}
                </span>
                {progress && progress.totalBatches > 0 && (
                  <span className="font-mono text-slate-300">
                    Batch {progress.processedBatches}/{progress.totalBatches}
                  </span>
                )}
              </div>
              <div className="w-full h-2.5 rounded-full bg-slate-800 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-amber-400 transition-all duration-300"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <p className="text-[11px] text-slate-400">
                Large 9,000-card collections take ~15–35 seconds on first upload while Scryfall batches are fetched at safe rate limits and cached into your local SQLite database.
              </p>
            </div>
          )}

          {error && (
            <div className="p-3 rounded-xl bg-rose-950/60 border border-rose-500/40 text-rose-200 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {result && (
            <div className="p-4 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-emerald-200 text-xs space-y-1.5">
              <div className="flex items-center gap-2 font-bold text-sm">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                Successfully imported {Number(result.resolvedCount || 0).toLocaleString()} total cards across {Number(result.parsedRowCount || 0).toLocaleString()} CSV rows!
              </div>
              <div className="text-emerald-300/90">
                • Matched with full Scryfall imagery & live pricing: <strong>{Number(result.scryfallMatchedCount || 0).toLocaleString()}</strong> cards
                {Boolean(result.fallbackCreatedCount && result.fallbackCreatedCount > 0) && (
                  <>
                    <br />• Imported using CSV metadata directly (custom/special rows): <strong>{Number(result.fallbackCreatedCount).toLocaleString()}</strong> cards
                  </>
                )}
              </div>
            </div>
          )}
        </div>

        <div className="px-6 py-4 border-t border-slate-800 flex items-center justify-end gap-3 bg-slate-950/60">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-slate-300 cursor-pointer"
          >
            Close
          </button>
          <button
            type="button"
            disabled={loading || !rawText.trim()}
            onClick={handleImport}
            className="px-5 py-2 rounded-xl bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-slate-950 text-xs font-bold flex items-center gap-2 cursor-pointer"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                Importing Cards...
              </>
            ) : (
              <>
                <Upload className="w-4 h-4" />
                Run Bulk Import
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
