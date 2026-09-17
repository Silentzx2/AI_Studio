'use client';

import * as React from 'react';
import { motion, AnimatePresence, useReducedMotion } from 'framer-motion';
import { ZoomIn, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { MOTION_BASE, MOTION_SPRING } from '@/lib/motion';

export interface ImageZoomProps {
  src: string;
  alt?: string;
  className?: string;
  thumbnailClassName?: string;
  aspectRatio?: string;
  isOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
  children?: React.ReactNode;
}

export const ImageZoom: React.FC<ImageZoomProps> = ({
  src,
  alt = 'Preview image',
  className = '',
  thumbnailClassName = '',
  isOpen: controlledIsOpen,
  onOpenChange,
  children,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const [internalIsOpen, setInternalIsOpen] = React.useState(false);
  const isControlled = controlledIsOpen !== undefined;
  const isOpen = isControlled ? controlledIsOpen : internalIsOpen;

  const setIsOpen = (value: boolean) => {
    if (!isControlled) {
      setInternalIsOpen(value);
    }
    onOpenChange?.(value);
  };

  React.useEffect(() => {
    if (!isOpen) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setIsOpen(false);
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [isOpen]);

  return (
    <>
      {children ? (
        <div onClick={() => setIsOpen(true)} className={cn('cursor-pointer', className)}>
          {children}
        </div>
      ) : (
        /* Thumbnail with hover zoom icon */
        <div
          onClick={() => setIsOpen(true)}
          className={cn(
            'relative group overflow-hidden rounded-xl cursor-pointer border border-white/[0.08] bg-surface-0',
            className
          )}
        >
          <img
            src={src}
            alt={alt}
            className={cn('w-full h-full object-cover transition-transform duration-300 group-hover:scale-105', thumbnailClassName)}
          />
          <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center pointer-events-none">
            <div className="p-1.5 rounded-full bg-black/60 text-white border border-white/20 shadow-lg">
              <ZoomIn className="w-4 h-4" />
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal with spring animation */}
      <AnimatePresence>
        {isOpen && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 sm:p-8">
            {/* Backdrop */}
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={MOTION_BASE}
              onClick={() => setIsOpen(false)}
              className="absolute inset-0 bg-black/85 backdrop-blur-md cursor-pointer"
            />

            {/* Expanded Image Card */}
            <motion.div
              initial={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={prefersReducedMotion ? { opacity: 0 } : { opacity: 0, scale: 0.9 }}
              transition={MOTION_SPRING}
              className="relative z-10 max-w-4xl max-h-[85vh] rounded-2xl overflow-hidden border border-white/[0.12] bg-surface-1 shadow-2xl flex flex-col"
            >
              {/* Close button */}
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="absolute top-3 right-3 z-20 p-1.5 rounded-full bg-black/60 hover:bg-black/90 text-white border border-white/20 transition-colors cursor-pointer"
                title="Close preview"
              >
                <X className="w-4 h-4" />
              </button>

              <img
                src={src}
                alt={alt}
                className="w-full h-full object-contain max-h-[80vh]"
              />
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </>
  );
};
