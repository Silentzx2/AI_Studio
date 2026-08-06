"use client";

import { useEffect, useState, useRef, useCallback, useMemo } from "react";
import { motion } from "framer-motion";
import {
  Terminal, Search, Trash2, Info, AlertTriangle, XCircle, CheckCircle, Bug,
  RefreshCw, Copy, ChevronDown, Zap, Pause, Play, WrapText, Filter,
  Download, ArrowDownToLine, BarChart3,
} from "lucide-react";
import { GlassCard } from "@/components/premium/GlassCard";
import { NeonButton } from "@/components/premium/NeonButton";
import { Spinner } from "@/components/premium/Spinner";
import { adminService } from "@/services/adminService";
import type { AdminLog } from "@/types";
import { cn } from "@/lib/utils";
import { toast } from "sonner";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";

type LevelKey = "all" | "info" | "warn" | "error" | "debug" | "success";

const LEVELS: LevelKey[] = ["all", "info", "success", "warn", "error", "debug"];

const LEVEL_STYLE: Record<string, { color: string; icon: React.ComponentType<{ className?: string }>; tag: string }> = {
  info:    { color: "text-[hsl(var(--neon-blue))]",    icon: Info,    tag: "INFO" },
  success: { color: "text-[hsl(var(--neon-green))]",  icon: CheckCircle, tag: "OK" },
  warn:    { color: "text-[hsl(var(--neon-amber))]",  icon: AlertTriangle, tag: "WARN" },
  error:   { color: "text-[hsl(var(--destructive))]", icon: XCircle, tag: "ERR" },
  debug:   { color: "text-[hsl(var(--neon-purple))]", icon: Bug,     tag: "DBG" },
};

const SOURCE_COLORS: Record<string, string> = {
  backend:  "bg-[hsl(var(--neon-blue)/0.2)] text-[hsl(var(--neon-blue))]",
  frontend: "bg-[hsl(var(--neon-green)/0.2)] text-[hsl(var(--neon-green))]",
  downloads:"bg-[hsl(var(--neon-amber)/0.2)] text-[hsl(var(--neon-amber))]",
  models:   "bg-[hsl(var(--neon-purple)/0.2)] text-[hsl(var(--neon-purple))]",
  database: "bg-[hsl(var(--neon-cyan)/0.2)] text-[hsl(var(--neon-cyan))]",
  workers:  "bg-[hsl(var(--neon-pink)/0.2)] text-[hsl(var(--neon-pink))]",
  pipelines:"bg-[hsl(var(--neon-orange)/0.2)] text-[hsl(var(--neon-orange))]",
  system:   "bg-[hsl(var(--muted-foreground)/0.2)] text-[hsl(var(--muted-foreground))]",
};

function getSourceColor(source: string): string {
  const key = source.toLowerCase();
  for (const [prefix, cls] of Object.entries(SOURCE_COLORS)) {
    if (key.includes(prefix)) return cls;
  }
  return "bg-[hsl(var(--muted-foreground)/0.15)] text-[hsl(var(--muted-foreground))]";
}

function formatTime(ts: string): string {
  if (!ts) return "--:--:--";
  const d = new Date(ts.includes("T") ? ts : ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return ts;
  return d.toLocaleTimeString("en-GB", { hour12: false });
}

function formatDate(ts: string): string {
  if (!ts) return "";
  const d = new Date(ts.includes("T") ? ts : ts.replace(" ", "T"));
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" });
}

function highlight(text: string, query: string): React.ReactNode {
  if (!query) return text;
  const idx = text.toLowerCase().indexOf(query.toLowerCase());
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark className="bg-[hsl(var(--neon-amber)/0.35)] text-foreground rounded-sm px-0.5">
        {text.slice(idx, idx + query.length)}
      </mark>
      {text.slice(idx + query.length)}
    </>
  );
}

const ITEM_HEIGHT = 28;
const VIRTUAL_BUFFER = 15;

export function LogsTab() {
  const [logs, setLogs] = useState<AdminLog[]>([]);
  const [search, setSearch] = useState("");
  const [level, setLevel] = useState<LevelKey>("all");
  const [sourceFilter, setSourceFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [live, setLive] = useState(true);
  const [wrap, setWrap] = useState(false);
  const [autoScroll, setAutoScroll] = useState(true);
  const [showJumpToLatest, setShowJumpToLatest] = useState(false);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerHeight, setContainerHeight] = useState(0);
  const scrollRef = useRef<HTMLDivElement>(null);
  const endRef = useRef<HTMLDivElement>(null);
  const seen = useRef<Set<string>>(new Set());
  const rafRef = useRef<number>(0);
  const statsRef = useRef<HTMLDivElement>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const data = await adminService.getLogs(500, level === "all" ? undefined : level);
    if (data.length > 0 || !loading) {
      setLogs(data);
      seen.current = new Set(data.map((l) => `${l.timestamp}|${l.source}|${l.message}`));
    }
    setLoading(false);
  }, [level, loading]);

  useEffect(() => {
    void load();
  }, [load]);

  useEffect(() => {
    if (!live) return;
    const stop = adminService.streamAdminLogs((entry) => {
      const key = `${entry.timestamp}|${entry.source}|${entry.message}`;
      if (seen.current.has(key)) return;
      seen.current.add(key);
      setLogs((prev) => [...prev.slice(-1500), entry]);
    }, 100);
    return () => stop();
  }, [live]);

  const handleScroll = useCallback(() => {
    if (rafRef.current) cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(() => {
      const el = scrollRef.current;
      if (!el) return;
      setScrollTop(el.scrollTop);
      setContainerHeight(el.clientHeight);
      const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
      if (nearBottom && !autoScroll) {
        setAutoScroll(true);
      }
      if (!nearBottom && autoScroll) {
        setAutoScroll(false);
      }
    });
  }, [autoScroll]);

  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    el.addEventListener("scroll", handleScroll, { passive: true });
    return () => {
      el.removeEventListener("scroll", handleScroll);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [handleScroll]);

  useEffect(() => {
    if (autoScroll) {
      endRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [logs, autoScroll]);

  useEffect(() => {
    if (!autoScroll && logs.length > 0) {
      const el = scrollRef.current;
      if (el) {
        const nearBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 120;
        if (!nearBottom) {
          setShowJumpToLatest(true);
        }
      }
    }
  }, [logs, autoScroll]);

  const sources = useMemo(() => {
    const s = new Set(logs.map((l) => l.source));
    return ["all", ...Array.from(s).filter(Boolean).sort().slice(0, 40)];
  }, [logs]);

  const filtered = useMemo(() => {
    const q = search.toLowerCase();
    return logs.filter((l) => {
      if (level !== "all" && l.level !== level) return false;
      if (sourceFilter !== "all" && l.source !== sourceFilter) return false;
      if (q && !l.message.toLowerCase().includes(q) && !l.source.toLowerCase().includes(q)) return false;
      return true;
    });
  }, [logs, level, sourceFilter, search]);

  const counts = useMemo(() => {
    const c: Record<string, number> = { info: 0, success: 0, warn: 0, error: 0, debug: 0 };
    for (const l of logs) if (c[l.level] !== undefined) c[l.level]++;
    return c;
  }, [logs]);

  const sourceCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const l of logs) {
      c[l.source] = (c[l.source] ?? 0) + 1;
    }
    return c;
  }, [logs]);

  const stats = useMemo(() => {
    const total = logs.length;
    const byLevel = { ...counts };
    const bySource: Record<string, number> = {};
    for (const l of logs) {
      bySource[l.source] = (bySource[l.source] ?? 0) + 1;
    }
    const topSources = Object.entries(bySource)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 8);
    const oldest = logs.length > 0 ? logs[0].timestamp : null;
    const newest = logs.length > 0 ? logs[logs.length - 1].timestamp : null;
    return { total, byLevel, topSources, oldest, newest };
  }, [logs, counts]);

  const groupedBySource = useMemo(() => {
    const groups: Record<string, AdminLog[]> = {};
    for (const l of filtered) {
      if (!groups[l.source]) groups[l.source] = [];
      groups[l.source].push(l);
    }
    return groups;
  }, [filtered]);

  const sortedSources = useMemo(() => {
    return Object.keys(groupedBySource).sort((a, b) => {
      return (groupedBySource[b]?.length ?? 0) - (groupedBySource[a]?.length ?? 0);
    });
  }, [groupedBySource]);

  const virtualItems = useMemo(() => {
    if (sortedSources.length === 0) return [];
    const items: Array<{ type: "header"; source: string; count: number } | { type: "entry"; log: AdminLog }> = [];
    for (const source of sortedSources) {
      const entries = groupedBySource[source];
      items.push({ type: "header", source, count: entries.length });
      for (const entry of entries) {
        items.push({ type: "entry", log: entry });
      }
    }
    return items;
  }, [sortedSources, groupedBySource]);

  const visibleRange = useMemo(() => {
    const totalHeight = virtualItems.length * ITEM_HEIGHT;
    const startIdx = Math.max(0, Math.floor(scrollTop / ITEM_HEIGHT) - VIRTUAL_BUFFER);
    const endIdx = Math.min(
      virtualItems.length,
      Math.ceil((scrollTop + containerHeight) / ITEM_HEIGHT) + VIRTUAL_BUFFER
    );
    return { startIdx, endIdx, totalHeight };
  }, [virtualItems, scrollTop, containerHeight]);

  const handleCopy = async () => {
    try {
      const text = filtered
        .map((l) => `[${formatTime(l.timestamp)}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`)
        .join("\n");
      await navigator.clipboard.writeText(text);
      toast.success("Logs copied to clipboard");
    } catch {
      toast.error("Failed to copy logs");
    }
  };

  const handleDownload = async () => {
    try {
      const text = filtered
        .map((l) => `[${formatTime(l.timestamp)}] [${l.level.toUpperCase()}] [${l.source}] ${l.message}`)
        .join("\n");
      const blob = new Blob([text], { type: "text/plain" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `logs-${new Date().toISOString().slice(0, 10)}.log`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success("Logs downloaded");
    } catch {
      toast.error("Failed to download logs");
    }
  };

  const handleClear = async () => {
    try {
      await adminService.clearLogs();
      setLogs([]);
      seen.current.clear();
      toast.success("Logs cleared");
    } catch {
      toast.error("Failed to clear logs");
    }
  };

  const handleJumpToLatest = () => {
    setAutoScroll(true);
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const totalFiltered = filtered.length;

  return (
    <div className="p-4 lg:p-6 space-y-4 max-w-[1800px] mx-auto">
      {/* ── Header ── */}
      <div className="flex flex-col lg:flex-row items-start lg:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold tracking-tight flex items-center gap-2">
            <Terminal className="w-5 h-5 text-[hsl(var(--neon-green))]" />
            System Logs
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Full application activity — startup, downloads, installs, database, model lifecycle, API requests, warnings &amp; errors.
          </p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <button
            onClick={() => setLive((v) => !v)}
            className={cn(
              "px-3 py-1.5 rounded-xl text-xs font-medium border transition-all flex items-center gap-1.5",
              live
                ? "bg-[hsl(var(--neon-green)/0.15)] text-foreground border-[hsl(var(--neon-green)/0.3)]"
                : "glass text-muted-foreground border-[hsl(var(--border)/0.5)]"
            )}
            title={live ? "Live streaming on" : "Live streaming paused"}
          >
            {live ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
            {live ? "Live" : "Paused"}
          </button>
          <NeonButton variant="secondary" size="sm" onClick={handleCopy} disabled={filtered.length === 0}>
            <Copy className="w-3.5 h-3.5" /> Copy
          </NeonButton>
          <NeonButton variant="secondary" size="sm" onClick={handleDownload} disabled={filtered.length === 0}>
            <Download className="w-3.5 h-3.5" /> Download
          </NeonButton>
          <NeonButton variant="secondary" size="sm" onClick={() => load()}>
            <RefreshCw className="w-3.5 h-3.5" /> Refresh
          </NeonButton>
          <NeonButton variant="destructive" size="sm" onClick={handleClear}>
            <Trash2 className="w-3.5 h-3.5" /> Clear
          </NeonButton>
        </div>
      </div>

      {/* ── Statistics ── */}
      <GlassCard className="p-3" delay={0.05}>
        <div className="flex items-center gap-2 mb-2">
          <BarChart3 className="w-3.5 h-3.5 text-[hsl(var(--neon-purple))]" />
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Statistics</span>
          <span className="ml-auto text-xs font-mono text-muted-foreground/60">
            {stats.total} total entries
            {stats.oldest && ` · oldest ${formatTime(stats.oldest)}`}
            {stats.newest && ` · latest ${formatTime(stats.newest)}`}
          </span>
        </div>
        <div className="flex items-center gap-3 flex-wrap">
          {LEVELS.filter((lv) => lv !== "all").map((lv) => {
            const style = LEVEL_STYLE[lv];
            const Icon = style.icon;
            return (
              <div key={lv} className="flex items-center gap-1.5 px-2 py-1 rounded-lg glass text-xs">
                <Icon className={cn("w-3 h-3", style.color)} />
                <span className={cn("font-semibold", style.color)}>{counts[lv] ?? 0}</span>
                <span className="text-muted-foreground capitalize">{lv}</span>
              </div>
            );
          })}
          <div className="w-px h-5 bg-[hsl(var(--border)/0.3)]" />
          {stats.topSources.map(([src, cnt]) => (
            <div key={src} className="flex items-center gap-1.5 px-2 py-1 rounded-lg glass text-xs">
              <span className={cn("w-1.5 h-1.5 rounded-full shrink-0", getSourceColor(src))} />
              <span className="text-foreground font-medium">{cnt}</span>
              <span className="text-muted-foreground truncate max-w-[120px]">{src}</span>
            </div>
          ))}
        </div>
      </GlassCard>

      {/* ── Filters ── */}
      <GlassCard className="p-3" delay={0.05}>
        <div className="flex flex-col gap-3">
          <div className="flex flex-col md:flex-row items-stretch md:items-center gap-3">
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search messages & sources…"
                className="w-full h-9 pl-9 pr-4 rounded-xl glass text-sm border border-[hsl(var(--border)/0.5)] focus:border-[hsl(var(--neon-purple)/0.4)] focus:outline-none font-mono"
              />
            </div>
            <div className="flex items-center gap-1.5 overflow-x-auto scrollbar-thin">
              <Filter className="w-3.5 h-3.5 text-muted-foreground shrink-0" />
              {LEVELS.map((lv) => (
                <button
                  key={lv}
                  onClick={() => setLevel(lv)}
                  className={cn(
                    "px-2.5 py-1.5 rounded-lg text-xs font-semibold capitalize transition-all border whitespace-nowrap",
                    level === lv
                      ? "bg-[hsl(var(--neon-purple)/0.18)] text-foreground border-[hsl(var(--neon-purple)/0.35)]"
                      : "glass text-muted-foreground border-[hsl(var(--border)/0.5)] hover:text-foreground"
                  )}
                >
                  {lv === "all" ? `All (${logs.length})` : `${lv} ${counts[lv] ?? 0}`}
                </button>
              ))}
            </div>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-xs text-muted-foreground">Source:</span>
            <select
              value={sourceFilter}
              onChange={(e) => setSourceFilter(e.target.value)}
              className="h-8 rounded-lg glass text-xs border border-[hsl(var(--border)/0.5)] px-2 focus:outline-none max-w-[220px]"
            >
              {sources.map((s) => (
                <option key={s} value={s} className="bg-[hsl(var(--card))]">
                  {s === "all" ? "All sources" : `${s} (${sourceCounts[s] ?? 0})`}
                </option>
              ))}
            </select>
            <button
              onClick={() => setWrap((v) => !v)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all flex items-center gap-1.5",
                wrap
                  ? "bg-[hsl(var(--neon-purple)/0.15)] text-foreground border-[hsl(var(--neon-purple)/0.3)]"
                  : "glass text-muted-foreground border-[hsl(var(--border)/0.5)]"
              )}
            >
              <WrapText className="w-3.5 h-3.5" /> Wrap
            </button>
            <button
              onClick={() => setAutoScroll((v) => !v)}
              className={cn(
                "px-2.5 py-1.5 rounded-lg text-xs font-medium border transition-all",
                autoScroll
                  ? "bg-[hsl(var(--neon-purple)/0.15)] text-foreground border-[hsl(var(--neon-purple)/0.3)]"
                  : "glass text-muted-foreground border-[hsl(var(--border)/0.5)]"
              )}
            >
              {autoScroll ? "Auto-scroll: On" : "Auto-scroll: Off"}
            </button>
          </div>
        </div>
      </GlassCard>

      {/* ── Terminal ── */}
      <GlassCard className="p-0 overflow-hidden" delay={0.1}>
        <div className="flex items-center gap-2 px-4 py-2 border-b border-[hsl(var(--border)/0.3)] bg-[hsl(var(--surface-0)/0.4)]">
          <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--destructive)/0.7)]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--neon-amber)/0.7)]" />
          <span className="w-2.5 h-2.5 rounded-full bg-[hsl(var(--neon-green)/0.7)]" />
          <span className="ml-2 text-xs font-mono text-muted-foreground">
            studio@ai-3d:~/logs$ tail -f app.log
          </span>
          <span className="ml-auto text-xs font-mono text-muted-foreground/70">
            {totalFiltered} / {logs.length} lines
          </span>
        </div>

        <div
          ref={scrollRef}
          className={cn(
            "bg-[#0a0e14] text-[hsl(var(--foreground))] font-mono text-[12.5px] leading-relaxed",
            "max-h-[64vh] overflow-y-auto scrollbar-thin p-3"
          )}
        >
          {loading && logs.length === 0 ? (
            <div className="flex items-center justify-center py-20">
              <Spinner size="md" />
            </div>
          ) : totalFiltered === 0 ? (
            <div className="flex flex-col items-center justify-center py-20 text-muted-foreground/50">
              <Terminal className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No log entries match the current filter</p>
            </div>
          ) : (
            <div style={{ height: `${virtualItems.length * ITEM_HEIGHT}px`, position: "relative" }}>
              <div style={{ transform: `translateY(${visibleRange.startIdx * ITEM_HEIGHT}px)` }}>
                {virtualItems.slice(visibleRange.startIdx, visibleRange.endIdx).map((item, i) => {
                  if (item.type === "header") {
                    const color = getSourceColor(item.source);
                    return (
                      <div
                        key={`header-${item.source}`}
                        className="sticky top-0 z-10 flex items-center gap-2 px-2 py-1.5 mt-1 mb-0.5 rounded-md bg-[#0a0e14]/95 backdrop-blur-sm border-b border-[hsl(var(--border)/0.2)]"
                        style={{ height: `${ITEM_HEIGHT}px`, boxSizing: "border-box" }}
                      >
                        <ChevronDown className="w-3 h-3 text-muted-foreground shrink-0" />
                        <span className={cn("w-2 h-2 rounded-full shrink-0", color)} />
                        <span className="text-[hsl(var(--foreground))] font-semibold text-xs">{item.source}</span>
                        <span className="text-[hsl(var(--muted-foreground))] text-xs">{item.count} entries</span>
                        <span className="ml-auto text-[hsl(var(--muted-foreground)/0.4)] text-[10px] font-mono">
                          {formatDate(logs.find((l) => l.source === item.source)?.timestamp ?? "")}
                        </span>
                      </div>
                    );
                  }
                  const log = item.log;
                  const style = LEVEL_STYLE[log.level] || LEVEL_STYLE.info;
                  const Icon = style.icon;
                  return (
                    <div
                      key={`${log.timestamp}-${log.id}-${i}`}
                      className={cn(
                        "group flex items-start gap-2 px-1.5 py-0.5 rounded hover:bg-white/[0.04] transition-colors",
                        !wrap && "whitespace-nowrap"
                      )}
                      style={{ height: `${ITEM_HEIGHT}px`, boxSizing: "border-box" }}
                    >
                      <span className="text-[hsl(var(--muted-foreground)/0.45)] shrink-0 select-none tabular-nums text-[11px]">
                        {formatTime(log.timestamp)}
                      </span>
                      <Icon className={cn("w-3 h-3 mt-0.5 shrink-0", style.color)} />
                      <span className={cn("shrink-0 font-bold w-9 select-none text-[11px]", style.color)}>
                        {style.tag}
                      </span>
                      <span className={cn("shrink-0 select-none text-[11px] px-1.5 py-0.5 rounded-full font-medium", getSourceColor(log.source))}>
                        {log.source}
                      </span>
                      <span className={cn("flex-1 min-w-0", wrap ? "break-words" : "truncate", log.level === "error" ? "text-[hsl(var(--destructive))]" : "")}>
                        {highlight(log.message, search)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
          <div ref={endRef} />
        </div>

        {!autoScroll && (
          <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            className="sticky bottom-0 z-20 flex items-center justify-center py-2 bg-[#0a0e14]/90 backdrop-blur-sm border-t border-[hsl(var(--border)/0.3)]"
          >
            <NeonButton
              variant="primary"
              size="sm"
              onClick={handleJumpToLatest}
              className="text-xs"
            >
              <ArrowDownToLine className="w-3 h-3 mr-1.5" />
              Jump to Latest
            </NeonButton>
          </motion.div>
        )}
      </GlassCard>

      <p className="text-xs text-muted-foreground/60 flex items-center gap-1.5">
        <Zap className="w-3 h-3 text-[hsl(var(--neon-amber))]" />
        Logs persist to <code className="font-mono">logs/app.log</code> and stream live. Restart the backend to see startup diagnostics appear here.
      </p>
    </div>
  );
}