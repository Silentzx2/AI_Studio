'use client';

import { motion, AnimatePresence } from 'framer-motion';
import { X } from 'lucide-react';

interface KeyboardShortcutsProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

interface ShortcutEntry {
  keys: string[];
  action: string;
}

const SHORTCUTS_BY_CATEGORY: Record<string, { label: string; shortcuts: ShortcutEntry[] }> = {
  General: {
    label: 'General',
    shortcuts: [
      { keys: ['⌘/Ctrl', 'K'], action: 'Open Command Palette' },
      { keys: ['Escape'], action: 'Close Dialog/Panel' },
      { keys: ['⌘/Ctrl', 'Z'], action: 'Undo' },
      { keys: ['⌘/Ctrl', 'Shift', 'Z'], action: 'Redo' },
    ],
  },
  Generation: {
    label: 'Generation',
    shortcuts: [
      { keys: ['⌘/Ctrl', 'Enter'], action: 'Generate 3D Model' },
    ],
  },
  Layout: {
    label: 'Layout',
    shortcuts: [
      { keys: ['⌘/Ctrl', '\\'], action: 'Toggle Left Panel' },
      { keys: ['⌘/Ctrl', '.'], action: 'Toggle Right Panel' },
      { keys: ['⌘/Ctrl', 'B'], action: 'Toggle Bottom Dock' },
    ],
  },
  View: {
    label: 'View',
    shortcuts: [
      { keys: ['F11'], action: 'Toggle Fullscreen' },
      { keys: ['⌘/Ctrl', 'Shift', 'F'], action: 'Toggle Fullscreen' },
    ],
  },
  Inspector: {
    label: 'Inspector',
    shortcuts: [
      { keys: ['1', '-', '6'], action: 'Switch Inspector Tab' },
    ],
  },
};

const categoryOrder = ['General', 'Generation', 'Layout', 'View', 'Inspector'];

function KeyBadge({ label }: { label: string }) {
  return (
    <span className="inline-flex px-2 py-1 rounded-md bg-[hsl(var(--surface-2))] border border-[hsl(var(--border)/0.4)] font-mono text-xs text-foreground/80">
      {label}
    </span>
  );
}

export function KeyboardShortcuts({ open, onOpenChange }: KeyboardShortcutsProps) {
  return (
    <AnimatePresence>
      {open && (
        <motion.div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          transition={{ duration: 0.2 }}
          onClick={() => onOpenChange(false)}
        >
          <motion.div
            className="relative w-full max-w-md glass-ultra glow-border shadow-premium-lg rounded-2xl p-6 mx-4"
            initial={{ scale: 0.92, opacity: 0 }}
            animate={{ scale: 1, opacity: 1 }}
            exit={{ scale: 0.92, opacity: 0 }}
            transition={{ type: 'spring', damping: 25, stiffness: 350 }}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
              <h2 className="text-lg font-semibold text-gradient">Keyboard Shortcuts</h2>
              <button
                onClick={() => onOpenChange(false)}
                className="flex items-center justify-center w-8 h-8 rounded-lg text-muted-foreground hover:text-foreground hover:bg-white/5 transition-all duration-200"
                aria-label="Close keyboard shortcuts"
              >
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Shortcuts List */}
            <div className="space-y-1 max-h-[60vh] overflow-y-auto pr-1 custom-scrollbar">
              {categoryOrder.map((category, catIdx) => {
                const group = SHORTCUTS_BY_CATEGORY[category];
                if (!group) return null;

                return (
                  <div key={category}>
                    {catIdx > 0 && <div className="section-divider my-3" />}
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground/60 mb-2">
                      {group.label}
                    </p>
                    <div className="space-y-1.5">
                      {group.shortcuts.map((shortcut, sIdx) => (
                        <div
                          key={`${category}-${sIdx}`}
                          className="flex items-center justify-between gap-3 py-1.5 px-2 rounded-lg hover:bg-white/[0.03] transition-colors duration-150"
                        >
                          <span className="text-sm text-foreground/80">{shortcut.action}</span>
                          <div className="flex items-center gap-1 shrink-0">
                            {shortcut.keys.map((key, kIdx) => (
                              <span key={kIdx} className="flex items-center gap-1">
                                <KeyBadge label={key} />
                                {kIdx < shortcut.keys.length - 1 && (
                                  <span className="text-[10px] text-muted-foreground/50 mx-0.5">+</span>
                                )}
                              </span>
                            ))}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </motion.div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}