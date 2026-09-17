'use client';

import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { Folder, FolderOpen, FileText, ChevronRight, HardDrive, Cpu } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOTION_FAST, MOTION_BASE } from '@/lib/motion';

export interface FileTreeNode {
  id: string;
  name: string;
  type: 'folder' | 'file';
  size?: string;
  status?: string;
  category?: string;
  children?: FileTreeNode[];
}

export interface FileTreeProps {
  data: FileTreeNode[];
  onSelectNode?: (node: FileTreeNode) => void;
  selectedId?: string;
  className?: string;
  defaultExpanded?: boolean;
}

const TreeItem: React.FC<{
  node: FileTreeNode;
  depth: number;
  onSelectNode?: (node: FileTreeNode) => void;
  selectedId?: string;
  defaultExpanded?: boolean;
}> = ({ node, depth, onSelectNode, selectedId, defaultExpanded = true }) => {
  const prefersReducedMotion = useReducedMotion();
  const [isExpanded, setIsExpanded] = React.useState(defaultExpanded);
  const isFolder = node.type === 'folder' && node.children && node.children.length > 0;
  const isSelected = selectedId === node.id;

  const handleClick = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (isFolder) {
      setIsExpanded((prev) => !prev);
    }
    onSelectNode?.(node);
  };

  return (
    <div className="select-none text-xs">
      <div
        onClick={handleClick}
        style={{ paddingLeft: `${depth * 14 + 6}px` }}
        className={cn(
          'flex items-center justify-between py-1.5 pr-2 rounded-lg cursor-pointer transition-colors group',
          isSelected
            ? 'bg-primary/15 text-primary font-semibold border border-primary/25'
            : 'hover:bg-white/[0.05] text-zinc-300 hover:text-white'
        )}
      >
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          {/* Chevron */}
          {isFolder ? (
            <motion.span
              animate={!prefersReducedMotion ? { rotate: isExpanded ? 90 : 0 } : undefined}
              transition={MOTION_FAST}
              className="text-zinc-500 group-hover:text-zinc-300 w-3.5 h-3.5 flex items-center justify-center flex-shrink-0"
            >
              <ChevronRight className="w-3.5 h-3.5" />
            </motion.span>
          ) : (
            <span className="w-3.5 h-3.5 flex-shrink-0" />
          )}

          {/* Icon */}
          {isFolder ? (
            isExpanded ? (
              <FolderOpen className="w-3.5 h-3.5 text-primary flex-shrink-0" />
            ) : (
              <Folder className="w-3.5 h-3.5 text-primary/70 flex-shrink-0" />
            )
          ) : (
            <FileText className="w-3.5 h-3.5 text-zinc-400 flex-shrink-0" />
          )}

          {/* Node Name */}
          <span className="truncate text-xs">{node.name}</span>
        </div>

        {/* Secondary Info: Size or Status Badge */}
        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
          {node.size && (
            <span className="text-[10px] font-mono text-zinc-400">{node.size}</span>
          )}
          {node.status && (
            <span className="px-1.5 py-0.2 rounded text-[9px] font-bold bg-white/[0.06] text-zinc-300 border border-white/[0.08]">
              {node.status}
            </span>
          )}
        </div>
      </div>

      {/* Children with smooth height expansion */}
      {isFolder && (
        <AnimatePresence initial={false}>
          {isExpanded && (
            <motion.div
              initial={prefersReducedMotion ? { opacity: 1 } : { height: 0, opacity: 0 }}
              animate={{ height: 'auto', opacity: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { height: 0, opacity: 0 }}
              transition={MOTION_BASE}
              className="overflow-hidden border-l border-white/[0.06] ml-3"
            >
              {node.children!.map((child) => (
                <TreeItem
                  key={child.id}
                  node={child}
                  depth={depth + 1}
                  onSelectNode={onSelectNode}
                  selectedId={selectedId}
                  defaultExpanded={defaultExpanded}
                />
              ))}
            </motion.div>
          )}
        </AnimatePresence>
      )}
    </div>
  );
};

export const FileTree: React.FC<FileTreeProps> = ({
  data,
  onSelectNode,
  selectedId,
  className = '',
  defaultExpanded = true,
}) => {
  return (
    <div
      className={cn(
        'rounded-xl border border-white/[0.08] bg-surface-1 p-2 space-y-0.5 overflow-hidden',
        className
      )}
    >
      {data.map((node) => (
        <TreeItem
          key={node.id}
          node={node}
          depth={0}
          onSelectNode={onSelectNode}
          selectedId={selectedId}
          defaultExpanded={defaultExpanded}
        />
      ))}
    </div>
  );
};
