import React, { useState, useCallback } from 'react';
import {
  X,
  Search,
  Copy,
  Check,
  AlertTriangle,
  CheckCircle2,
  FileBox,
  Send,
  Reply,
  Lightbulb
} from 'lucide-react';
import {
  diagnoseUpload,
  createSampleGlbFile,
  formatReport,
  type DiagnosticResult
} from '../lib/uploadDiagnostics';

interface UploadDiagnosticModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialFile?: File | null;
}

export const UploadDiagnosticModal: React.FC<UploadDiagnosticModalProps> = ({
  isOpen,
  onClose,
  initialFile
}) => {
  const [result, setResult] = useState<DiagnosticResult | null>(null);
  const [running, setRunning] = useState(false);
  const [copied, setCopied] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(initialFile || null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) setSelectedFile(file);
  };

  const runDiagnostic = useCallback(async () => {
    setRunning(true);
    setResult(null);
    try {
      const file = selectedFile || createSampleGlbFile();
      if (!selectedFile) setSelectedFile(file);
      const diagResult = await diagnoseUpload(file);
      setResult(diagResult);
    } catch (err) {
      setResult({
        success: false,
        timestamp: new Date().toISOString(),
        file: { name: 'unknown', size: 0, type: 'unknown', lastModified: 0 },
        request: { url: '', method: '', headers: {}, formDataEntries: [], apiBaseUrl: '' },
        response: null,
        errors: [err instanceof Error ? err.message : String(err)],
        recommendations: [],
      });
    } finally {
      setRunning(false);
    }
  }, [selectedFile]);

  const copyReport = useCallback(async () => {
    if (!result) return;
    const report = formatReport(result);
    try {
      await navigator.clipboard.writeText(report);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Fallback for environments without clipboard API
      const textarea = document.createElement('textarea');
      textarea.value = report;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }, [result]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4 select-none animate-in fade-in duration-200">
      <div className="w-full max-w-2xl max-h-[85vh] rounded-2xl bg-[#14161c] border border-[#2e3342] shadow-2xl overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 bg-[#181b22] border-b border-[#292e3c]">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-[#202532] border border-[#32394a] flex items-center justify-center text-[#f5c518]">
              <Search className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-sm text-[#f3f4f6]">Upload Diagnostics</h3>
              <p className="text-[11px] text-[#8e95a5]">Diagnose GLB upload failures and HTML token errors</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-lg text-[#9ca3af] hover:text-[#f3f4f6] hover:bg-[#252936]"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 space-y-4 text-xs">
          {/* File Selection */}
          <div className="space-y-2">
            <label className="font-medium text-[#cbd5e1]">File to Diagnose</label>
            <div className="flex gap-2">
              <label className="flex-1 flex items-center gap-2 px-3 py-2 rounded-xl bg-[#101115] border border-[#2a2e3c] cursor-pointer hover:border-[#f5c518]/50 transition-colors">
                <FileBox className="w-4 h-4 text-[#8e95a5]" />
                <span className="text-[#e5e7eb] truncate">
                  {selectedFile ? `${selectedFile.name} (${(selectedFile.size / 1024).toFixed(1)} KB)` : 'Select a GLB file...'}
                </span>
                <input
                  type="file"
                  accept=".glb,.gltf"
                  onChange={handleFileSelect}
                  className="hidden"
                />
              </label>
            </div>
            <p className="text-[10px] text-[#6b7280]">
              No file selected? Click "Run Diagnostic" to test with a sample GLB.
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex gap-2">
            <button
              onClick={runDiagnostic}
              disabled={running}
              className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-xl bg-[#f5c518] hover:bg-[#eab308] disabled:opacity-50 text-[#111216] font-bold text-xs transition-colors"
            >
              {running ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-[#111216]/30 border-t-[#111216] rounded-full animate-spin" />
                  <span>Running...</span>
                </>
              ) : (
                <>
                  <Search className="w-3.5 h-3.5" />
                  <span>Run Diagnostic</span>
                </>
              )}
            </button>
            {result && (
              <button
                onClick={copyReport}
                className="flex items-center gap-1.5 px-4 py-2.5 rounded-xl bg-[#222734] hover:bg-[#2c3345] border border-[#384154] text-[#cbd5e1] font-medium text-xs transition-colors"
              >
                {copied ? <Check className="w-3.5 h-3.5 text-[#22c55e]" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? 'Copied!' : 'Copy Report'}</span>
              </button>
            )}
          </div>

          {/* Results */}
          {result && (
            <div className="space-y-3 pt-2">
              {/* Status Banner */}
              <div className={`p-3 rounded-xl border flex items-center gap-2.5 ${
                result.success
                  ? 'bg-[#15231c] border-[#22c55e]/40'
                  : 'bg-[#231515] border-[#ef4444]/40'
              }`}>
                {result.success
                  ? <CheckCircle2 className="w-4 h-4 text-[#22c55e] flex-shrink-0" />
                  : <AlertTriangle className="w-4 h-4 text-[#ef4444] flex-shrink-0" />
                }
                <span className={`text-xs font-medium ${result.success ? 'text-[#86efac]' : 'text-[#fca5a5]'}`}>
                  {result.success ? 'Upload succeeded' : 'Upload failed — see details below'}
                </span>
              </div>

              {/* Request Section */}
              <div className="rounded-xl border border-[#232732] overflow-hidden">
                <div className="px-3 py-2 bg-[#111216] border-b border-[#232732] flex items-center gap-2">
                  <Send className="w-3.5 h-3.5 text-[#f5c518]" />
                  <span className="font-semibold text-[#cbd5e1]">Request</span>
                </div>
                <div className="p-3 space-y-2 bg-[#0f1014]">
                  <div className="flex gap-2">
                    <span className="text-[#8e95a5] w-16 flex-shrink-0">URL</span>
                    <span className="text-[#e5e7eb] font-mono break-all">{result.request.url || '(relative)'}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[#8e95a5] w-16 flex-shrink-0">Method</span>
                    <span className="text-[#e5e7eb] font-mono">{result.request.method}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="text-[#8e95a5] w-16 flex-shrink-0">API Base</span>
                    <span className="text-[#e5e7eb] font-mono">{result.request.apiBaseUrl || '(empty — relative URL)'}</span>
                  </div>
                  <div>
                    <span className="text-[#8e95a5]">Headers</span>
                    <div className="mt-1 pl-2 border-l-2 border-[#232732] space-y-0.5">
                      {(Object.entries(result.request.headers) as [string, string | null][]).map(([key, value]) => (
                        <div key={key} className="flex gap-2">
                          <span className="text-[#9ca3af] font-mono">{key}:</span>
                          <span className="text-[#e5e7eb] font-mono">{value ?? '(not set)'}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                  <div>
                    <span className="text-[#8e95a5]">FormData</span>
                    <div className="mt-1 pl-2 border-l-2 border-[#232732] space-y-0.5">
                      {result.request.formDataEntries.map((entry, i) => (
                        <div key={i} className="text-[#e5e7eb] font-mono">{entry}</div>
                      ))}
                    </div>
                  </div>
                </div>
              </div>

              {/* Response Section */}
              {result.response && (
                <div className="rounded-xl border border-[#232732] overflow-hidden">
                  <div className="px-3 py-2 bg-[#111216] border-b border-[#232732] flex items-center gap-2">
                    <Reply className="w-3.5 h-3.5 text-[#f5c518]" />
                    <span className="font-semibold text-[#cbd5e1]">Response</span>
                    {result.response.isHtml && (
                      <span className="ml-auto px-2 py-0.5 rounded-md bg-[#ef4444]/20 text-[#fca5a5] text-[10px] font-bold">
                        HTML DETECTED
                      </span>
                    )}
                  </div>
                  <div className="p-3 space-y-2 bg-[#0f1014]">
                    <div className="flex gap-2">
                      <span className="text-[#8e95a5] w-16 flex-shrink-0">Status</span>
                      <span className={`font-mono font-bold ${
                        result.response.status >= 200 && result.response.status < 300
                          ? 'text-[#22c55e]'
                          : 'text-[#ef4444]'
                      }`}>
                        {result.response.status} {result.response.statusText}
                      </span>
                    </div>
                    <div>
                      <span className="text-[#8e95a5]">Headers</span>
                      <div className="mt-1 pl-2 border-l-2 border-[#232732] space-y-0.5">
                        {(Object.entries(result.response.headers) as [string, string][]).map(([key, value]) => (
                          <div key={key} className="flex gap-2">
                            <span className="text-[#9ca3af] font-mono">{key}:</span>
                            <span className="text-[#e5e7eb] font-mono break-all">{value}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-[#8e95a5]">Body</span>
                        {result.response.bodyTruncated && (
                          <span className="text-[10px] text-[#6b7280]">(first 500 chars)</span>
                        )}
                      </div>
                      <pre className="mt-1 p-2 rounded-lg bg-[#0a0b0e] border border-[#1a1d26] text-[#e5e7eb] font-mono text-[10px] whitespace-pre-wrap break-all max-h-40 overflow-y-auto">
                        {result.response.body || '(empty)'}
                      </pre>
                    </div>
                  </div>
                </div>
              )}

              {/* Errors */}
              {result.errors.length > 0 && (
                <div className="rounded-xl border border-[#ef4444]/30 bg-[#1a1015] p-3 space-y-1">
                  <div className="flex items-center gap-2 text-[#fca5a5] font-semibold">
                    <AlertTriangle className="w-3.5 h-3.5" />
                    <span>Errors</span>
                  </div>
                  {result.errors.map((error, i) => (
                    <div key={i} className="text-[#fca5a5] pl-5">{error}</div>
                  ))}
                </div>
              )}

              {/* Recommendations */}
              {result.recommendations.length > 0 && (
                <div className="rounded-xl border border-[#f5c518]/30 bg-[#1a1810] p-3 space-y-1">
                  <div className="flex items-center gap-2 text-[#f5c518] font-semibold">
                    <Lightbulb className="w-3.5 h-3.5" />
                    <span>Recommendations</span>
                  </div>
                  {result.recommendations.map((rec, i) => (
                    <div key={i} className="text-[#e5e7eb] pl-5">{rec}</div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2.5 px-5 py-3.5 bg-[#181b22] border-t border-[#292e3c]">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-[#222631] text-[#cbd5e1] hover:bg-[#2b303e] font-medium text-xs transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
