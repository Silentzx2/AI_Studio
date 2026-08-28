"use client";

import React, { useEffect, useState, useRef, useCallback, useMemo } from "react";
import {
  Terminal, Search, Trash2, Info, AlertTriangle, XCircle, CheckCircle, Bug,
  RefreshCw, Copy, Pause, Play, WrapText, Download,
  ArrowDown, Check, X, ShieldAlert
} from "lucide-react";
import { adminService } from "@/services/adminService";
import type { AdminLog } from "@/types";
import { toast } from "sonner";

type LevelKey = "all" | "info" | "success" | "warn" | "error" | "debug";

const LEVEL_STYLE: Record<string, { badge: string; text: string; label: string }> = {
  info:    { badge: "bg-[#0284c7]/20 text-[#38bdf8] border-[#0284c7]/40", text: "text-[#38bdf8]", label: "INFO" },
  success: { badge: "bg-[#16a34a]/20 text-[#4ade80] border-[#16a34a]/40", text: "text-[#4ade80]", label: "OK  " },
  warn:    { badge: "bg-[#d97706]/20 text-[#fbbf24] border-[#d97706]/40", text: "text-[#fbbf24]", label: "WARN" },
  error:   { badge: "bg-[#dc2626]/20 text-[#f87171] border-[#dc2626]/40", text: "text-[#f87171]", label: "ERR " },
  debug:   { badge: "bg-[#9333ea]/20 text-[#c084fc] border-[#9333ea]/40", text: "text-[#c084fc]", label: "DBG " },
};

function formatTime(ts: string): string {
  if (!ts) return "--:--:--";
  const d = new Date(ts.includes("T") ? ts : ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return ts.slice(11, 19) || ts;
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

function formatFullTs(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts.includes("T") ? ts : ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return ts;
  return `${d.toISOString().slice(0, 10)} ${d.toLocaleTimeString("en-GB", { hour12: false })}.${String(d.getMilliseconds()).padStart(3, "0")}`;
}

export function LogsTab() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<LevelKey>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [isClearing, setIsClearing] = useState(false);
  const [live, setLive] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [copied, setCopied] = useState(false);

  const terminalRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const seenIds = useRef<Set<string>>(new Set());
  const isAutoScrollRef = useRef(autoScroll);
  isAutoScrollRef.current = autoScroll;

  // Load initial logs
  const fetchLogs = useCallback(async () => {
    setLoading(true);
    try {
      const data = await adminService.getLogs(1000, level === "all" ? undefined : level);
      setLogs(data);
      seenIds.current = new Set(data.map((l) => l.id || `${l.timestamp}-${l.source}-${l.message}`));
    } catch {
      toast.error("Failed to load backend logs");
    } finally {
      setLoading(false);
    }
  }, [level]);

  // Initial fetch on mount or level filter change
  useEffect(() => {
    void fetchLogs();
  }, [fetchLogs]);

  // Live SSE stream handler
  useEffect(() => {
    if (!live) return;
    const unsubscribe = adminService.streamAdminLogs((entry) => {
      const key = entry.id || `${entry.timestamp}-${entry.source}-${entry.message}`;
      if (seenIds.current.has(key)) return;
      seenIds.current.add(key);

      setLogs((prev) => {
        const next = [...prev, entry];
        if (next.length > 2500) {
          return next.slice(-2000);
        }
        return next;
      });
    }, 100);

    return () => {
      unsubscribe();
    };
  }, [live]);

  // Scroll listener for detecting user manual scroll vs auto-scroll
  const handleScroll = useCallback(() => {
    const el = terminalRef.current;
    if (!el) return;
    const isAtBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
    if (isAtBottom) {
      setAutoScroll(true);
      setShowJumpToLatest(false);
    } else {
      setAutoScroll(false);
      setShowJumpToLatest(true);
    }
  }, []);

  // Auto-scroll when new logs arrive if enabled
  useEffect(() => {
    if (autoScroll) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  // Derived available sources
  const sources = useMemo(() => {
    const s = new Set(logs.map((l) => l.source).filter(Boolean));
    return ["all", ...Array.from(s).sort()];
  }, [logs]);

  // Filter logs by search, level, and source
  const filteredLogs = useMemo(() => {
    const q = search.trim().toLowerCase();
    return logs.filter((l) => {
      if (level !== "all" && l.level !== level) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (q) {
        const msgMatch = l.message?.toLowerCase().includes(q);
        const srcMatch = l.source?.toLowerCase().includes(q);
        if (!msgMatch && !srcMatch) return false;
      }
      return true;
    });
  }, [logs, level, sourceFilter, search]);

  // Level counts
  const counts = useMemo(() => {
    const c = { all: logs.length, info: 0, success: 0, warn: 0, error: 0, debug: 0 };
    for (const l of logs) {
      if (l.level in c) {
        c[l.level as keyof typeof c]++;
      }
    }
    return c;
  }, [logs]);

  // Copy logs
  const handleCopy = async () => {
    if (filteredLogs.length === 0) {
      toast.info("No logs to copy");
      return;
    }
    try {
      const text = filteredLogs
        .map((l) => `[${formatFullTs(l.timestamp)}] [${(l.level || 'info').toUpperCase()}] [${l.source || 'sys'}] ${l.message}`)
        .join("\n");
      await navigator.clipboard.writeText(text);
      setCopied(true);
      toast.success(`Copied ${filteredLogs.length} log lines to clipboard`);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      toast.error("Failed to copy logs");
    }
  };

  // Download logs
  const handleDownload = () => {
    if (filteredLogs.length === 0) {
      toast.info("No logs to download");
      return;
    }
    try {
      const text = filteredLogs
        .map((l) => `[${formatFullTs(l.timestamp)}] [${(l.level || 'info').toUpperCase()}] [${l.source || 'sys'}] ${l.message}`)
        .join("\n");
      const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `ai3d-studio-logs-${new Date().toISOString().slice(0, 19).replace(/:/g, "-")}.log`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Downloaded ${filteredLogs.length} log lines`);
    } catch {
      toast.error("Failed to download logs");
    }
  };

  // Clear logs via backend DELETE endpoint
  const handleClear = async () => {
    setIsClearing(true);
    try {
      await adminService.clearLogs();
      setLogs([]);
      seenIds.current.clear();
      toast.success("All logs cleared successfully");
    } catch {
      toast.error("Failed to clear backend logs");
    } finally {
      setIsClearing(false);
    }
  };

  const jumpToBottom = () => {
    setAutoScroll(true);
    setShowJumpToLatest(false);
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const highlightMatch = (text: string, query: string) => {
    if (!query) return text;
    const idx = text.toLowerCase().indexOf(query.toLowerCase());
    if (idx === -1) return text;
    return (
      <>
        {text.slice(0, idx)}
        <span className="bg-[#f59e0b]/40 text-[#fde68a] font-bold px-0.5 rounded">
          {text.slice(idx, idx + query.length)}
        </span>
        {text.slice(idx + query.length)}
      </>
    );
  };

  return (
    <div id="page-terminal-logs" className="flex flex-col h-[calc(100vh-130px)] min-h-[550px] bg-[#07080b] rounded-xl border border-[#1d2029] overflow-hidden text-xs select-none">
      {/* ── Terminal Title Bar ── */}
      <div className="flex items-center justify-between px-3.5 py-2 bg-[#0d0e14] border-b border-[#1c1f28]">
        {/* Terminal dots & command path */}
        <div className="flex items-center gap-2.5 min-w-0">
          <div className="flex items-center gap-1.5">
            <span className="w-2.5 h-2.5 rounded-full bg-[#ef4444]/80 border border-[#ef4444]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#f59e0b]/80 border border-[#f59e0b]" />
            <span className="w-2.5 h-2.5 rounded-full bg-[#22c55e]/80 border border-[#22c55e]" />
          </div>
          <div className="flex items-center gap-1.5 font-mono text-[11px] text-[#9ca3af] truncate">
            <Terminal className="w-3.5 h-3.5 text-[#38bdf8]" />
            <span className="text-[#38bdf8] font-semibold">fastapi@studio</span>
            <span className="text-[#64748b]">:</span>
            <span className="text-[#e2e8f0]">~/logs</span>
            <span className="text-[#64748b]">$</span>
            <span className="text-[#cbd5e1] font-normal">tail -f app.log</span>
          </div>
        </div>

        {/* Live Stream Status & Action Controls */}
        <div className="flex items-center gap-1.5 flex-shrink-0">
          {/* Live / Paused toggle */}
          <button
            onClick={() => setLive((v) => !v)}
            className={`px-2.5 py-1 rounded-md text-[11px] font-mono font-semibold flex items-center gap-1.5 transition-all ${
              live
                ? "bg-[#22c55e]/15 text-[#4ade80] border border-[#22c55e]/30 shadow-sm"
                : "bg-[#334155]/20 text-[#94a3b8] border border-[#475569]/30"
            }`}
            title={live ? "Click to pause live streaming" : "Click to resume live streaming"}
          >
            {live ? (
              <>
                <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e] animate-pulse" />
                <span>LIVE</span>
              </>
            ) : (
              <>
                <Pause className="w-3 h-3" />
                <span>PAUSED</span>
              </>
            )}
          </button>

          {/* Copy */}
          <button
            onClick={handleCopy}
            className="px-2 py-1 rounded-md bg-[#13151c] hover:bg-[#1a1d26] border border-[#232733] text-[#cbd5e1] hover:text-[#ffffff] flex items-center gap-1 transition-colors"
            title="Copy filtered logs"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-[#22c55e]" /> : <Copy className="w-3.5 h-3.5" />}
            <span className="font-mono text-[10.5px]">Copy</span>
          </button>

          {/* Download */}
          <button
            onClick={handleDownload}
            className="px-2 py-1 rounded-md bg-[#13151c] hover:bg-[#1a1d26] border border-[#232733] text-[#cbd5e1] hover:text-[#ffffff] flex items-center gap-1 transition-colors"
            title="Download log file"
          >
            <Download className="w-3.5 h-3.5" />
            <span className="font-mono text-[10.5px]">Export</span>
          </button>

          {/* Clear */}
          <button
            onClick={handleClear}
            disabled={isClearing}
            className="px-2 py-1 rounded-md bg-[#1f1316] hover:bg-[#2d171b] border border-[#451e24] text-[#fca5a5] hover:text-[#f87171] flex items-center gap-1 transition-colors disabled:opacity-50"
            title="Clear all application logs"
          >
            <Trash2 className="w-3.5 h-3.5" />
            <span className="font-mono text-[10.5px]">Clear</span>
          </button>

          {/* Refresh */}
          <button
            onClick={() => fetchLogs()}
            disabled={loading}
            className="p-1 rounded-md bg-[#13151c] hover:bg-[#1a1d26] border border-[#232733] text-[#9ca3af] hover:text-[#f3f4f6] transition-colors"
            title="Refresh logs from server"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? "animate-spin text-[#38bdf8]" : ""}`} />
          </button>
        </div>
      </div>

      {/* ── Filter & Search Toolbar ── */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-2 bg-[#090a0f] border-b border-[#171922]">
        {/* Level Badges */}
        <div className="flex items-center gap-1 flex-wrap">
          {(["all", "info", "success", "warn", "error", "debug"] as LevelKey[]).map((lvl) => {
            const isSelected = level === lvl;
            const count = lvl === "all" ? counts.all : counts[lvl as keyof typeof counts] || 0;
            return (
              <button
                key={lvl}
                onClick={() => setLevel(lvl)}
                className={`px-2 py-0.5 rounded text-[10.5px] font-mono uppercase font-semibold transition-all flex items-center gap-1 ${
                  isSelected
                    ? "bg-[#2563eb] text-white shadow-sm"
                    : "bg-[#11131a] text-[#8e95a5] hover:bg-[#181b24] hover:text-[#cbd5e1] border border-[#1e222d]"
                }`}
              >
                <span>{lvl}</span>
                <span className={`text-[9px] px-1 py-0.2 rounded ${
                  isSelected ? "bg-black/30 text-white" : "bg-[#191d26] text-[#6b7280]"
                }`}>
                  {count}
                </span>
              </button>
            );
          })}
        </div>

        {/* Search, Source Filter & Wrap Toggle */}
        <div className="flex items-center gap-2">
          {/* Source dropdown */}
          <div className="flex items-center gap-1">
            <span className="text-[10px] text-[#64748b] font-mono">SRC:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="bg-[#11131a] border border-[#1e222d] rounded px-1.5 py-0.5 text-[10.5px] font-mono text-[#cbd5e1] focus:outline-none focus:border-[#38bdf8]"
            >
              {sources.map((s) => (
                <option key={s} value={s} className="bg-[#11131a] text-[#cbd5e1]">
                  {s.toUpperCase()}
                </option>
              ))}
            </select>
          </div>

          {/* Search box */}
          <div className="relative">
            <Search className="w-3 h-3 text-[#64748b] absolute left-2 top-1/2 -translate-y-1/2" />
            <input
              type="text"
              placeholder="Search logs..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-6 pr-5 py-0.5 w-36 lg:w-48 bg-[#11131a] border border-[#1e222d] rounded text-[11px] font-mono text-[#e2e8f0] placeholder-[#475569] focus:outline-none focus:border-[#38bdf8]"
            />
            {search && (
              <button
                onClick={() => setSearch("")}
                className="absolute right-1.5 top-1/2 -translate-y-1/2 text-[#64748b] hover:text-[#e2e8f0]"
              >
                <X className="w-2.5 h-2.5" />
              </button>
            )}
          </div>

          {/* Wrap toggle */}
          <button
            onClick={() => setWrap((w) => !w)}
            className={`px-1.5 py-0.5 rounded text-[10.5px] font-mono flex items-center gap-1 border transition-colors ${
              wrap
                ? "bg-[#38bdf8]/15 border-[#38bdf8]/40 text-[#38bdf8]"
                : "bg-[#11131a] border-[#1e222d] text-[#64748b] hover:text-[#94a3b8]"
            }`}
            title="Toggle word wrap"
          >
            <WrapText className="w-3 h-3" />
            <span>Wrap</span>
          </button>
        </div>
      </div>

      {/* ── Main Terminal Log Stream Area ── */}
      <div
        ref={terminalRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto overflow-x-auto p-3 font-mono text-[11.5px] leading-relaxed bg-[#050608] text-[#cbd5e1] space-y-0.5 scrollbar-thin scrollbar-thumb-[#1e222d]"
      >
        {loading && logs.length === 0 ? (
          <div className="flex items-center justify-center h-48 text-[#64748b] font-mono">
            <RefreshCw className="w-4 h-4 animate-spin mr-2 text-[#38bdf8]" />
            <span>Streaming logs from backend...</span>
          </div>
        ) : filteredLogs.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-48 text-[#64748b] font-mono space-y-1">
            <Terminal className="w-6 h-6 text-[#334155]" />
            <span>No log entries match the current filter.</span>
            <span className="text-[10px] text-[#475569]">Try clearing search or changing the log level.</span>
          </div>
        ) : (
          filteredLogs.map((l, index) => {
            const levelStyle = LEVEL_STYLE[l.level?.toLowerCase()] || LEVEL_STYLE.info;
            return (
              <div
                key={l.id || `${l.timestamp}-${index}`}
                className={`flex items-start gap-2 px-1.5 py-0.5 rounded hover:bg-[#10121a] transition-colors ${
                  wrap ? "flex-wrap" : "whitespace-pre"
                }`}
              >
                {/* Line number */}
                <span className="text-[#475569] select-none text-[10px] w-8 text-right flex-shrink-0 font-mono">
                  {index + 1}
                </span>

                {/* Timestamp */}
                <span
                  className="text-[#64748b] select-none flex-shrink-0 font-mono text-[10.5px]"
                  title={formatFullTs(l.timestamp)}
                >
                  {formatTime(l.timestamp)}
                </span>

                {/* Level badge */}
                <span
                  className={`px-1 py-0.1 rounded text-[9.5px] font-bold tracking-wider flex-shrink-0 border ${levelStyle.badge}`}
                >
                  {levelStyle.label}
                </span>

                {/* Source tag */}
                <span className="text-[#a78bfa] font-semibold flex-shrink-0">
                  [{l.source || "sys"}]
                </span>

                {/* Log message content */}
                <span className={`text-[#e2e8f0] flex-1 ${wrap ? "break-words" : ""}`}>
                  {highlightMatch(l.message, search)}
                </span>
              </div>
            );
          })
        )}
        <div ref={endRef} />
      </div>

      {/* ── Floating Jump to Bottom Button ── */}
      {showJumpToLatest && (
        <div className="relative">
          <button
            onClick={jumpToBottom}
            className="absolute bottom-3 right-4 px-3 py-1.5 rounded-full bg-[#38bdf8] hover:bg-[#0ea5e9] text-[#0f172a] font-mono font-bold text-[11px] shadow-lg flex items-center gap-1.5 animate-bounce z-10 transition-transform active:scale-95"
          >
            <ArrowDown className="w-3.5 h-3.5" />
            <span>Jump to latest</span>
          </button>
        </div>
      )}

      {/* ── Terminal Status Bar Footer ── */}
      <div className="flex items-center justify-between px-3.5 py-1.5 bg-[#090a0f] border-t border-[#171922] font-mono text-[10.5px] text-[#64748b]">
        <div className="flex items-center gap-3">
          <span>
            LINES: <strong className="text-[#cbd5e1]">{filteredLogs.length}</strong> / {logs.length}
          </span>
          <span>
            AUTO-SCROLL: <strong className={autoScroll ? "text-[#4ade80]" : "text-[#94a3b8]"}>{autoScroll ? "ON" : "OFF"}</strong>
          </span>
          <span>
            WRAP: <strong className={wrap ? "text-[#38bdf8]" : "text-[#94a3b8]"}>{wrap ? "ON" : "OFF"}</strong>
          </span>
        </div>

        <div className="flex items-center gap-3">
          <span className="flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-[#22c55e]" />
            <span className="text-[#94a3b8]">Uvicorn / FastAPI Log Sink</span>
          </span>
          <span className="text-[#475569]">UTF-8</span>
        </div>
      </div>
    </div>
  );
}
