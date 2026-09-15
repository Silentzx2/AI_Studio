'use client';

import * as React from 'react';
import { Copy, Check, Terminal } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';
import { cn } from '@/lib/utils';

export interface CodeBlockProps {
  code: string;
  language?: string;
  title?: string;
  maxHeight?: string;
  className?: string;
  showLineNumbers?: boolean;
}

export const CodeBlock: React.FC<CodeBlockProps> = ({
  code,
  language = 'bash',
  title,
  maxHeight = '320px',
  className = '',
  showLineNumbers = false,
}) => {
  const [copied, setCopied] = React.useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // ignore
    }
  };

  const lines = code.trim().split('\n');

  return (
    <div
      className={cn(
        'rounded-xl overflow-hidden border border-white/[0.08] bg-[#0E1013] text-xs font-mono shadow-md flex flex-col',
        className
      )}
    >
      {/* Header with Title and Copy button */}
      <div className="flex items-center justify-between px-3 py-1.5 bg-[#14161B] border-b border-white/[0.06] flex-shrink-0 select-none">
        <div className="flex items-center gap-2 text-zinc-400 text-[11px]">
          <Terminal className="w-3.5 h-3.5 text-[#F9CF00]" />
          <span className="font-semibold text-zinc-300">{title || language}</span>
        </div>

        <button
          type="button"
          onClick={handleCopy}
          className="p-1 rounded-md text-zinc-400 hover:text-white hover:bg-white/[0.08] transition-colors cursor-pointer flex items-center gap-1 text-[10px]"
          title="Copy code"
        >
          <AnimatePresence mode="wait" initial={false}>
            {copied ? (
              <motion.span
                key="check"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                className="text-emerald-400 flex items-center gap-1"
              >
                <Check className="w-3 h-3" />
                <span>Copied</span>
              </motion.span>
            ) : (
              <motion.span
                key="copy"
                initial={{ scale: 0.6, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.6, opacity: 0 }}
                className="flex items-center gap-1"
              >
                <Copy className="w-3 h-3" />
                <span>Copy</span>
              </motion.span>
            )}
          </AnimatePresence>
        </button>
      </div>

      {/* Code body */}
      <div
        className="p-3 overflow-auto text-zinc-200 leading-relaxed font-mono selection:bg-[#F9CF00]/30 selection:text-white"
        style={{ maxHeight }}
      >
        {lines.map((line, idx) => (
          <div key={idx} className="table-row">
            {showLineNumbers && (
              <span className="table-cell select-none pr-3 text-right text-zinc-600 text-[10px] w-6">
                {idx + 1}
              </span>
            )}
            <span className="table-cell whitespace-pre-wrap break-all">{line || ' '}</span>
          </div>
        ))}
      </div>
    </div>
  );
};
