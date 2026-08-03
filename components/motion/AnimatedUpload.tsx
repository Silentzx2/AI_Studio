"use client";

import { motion, AnimatePresence } from 'framer-motion';
import { useThemeStore, getAnimationDuration, getEasing } from '@/stores/useThemeStore';
import { useCallback, useRef, useState } from 'react';
import { cn } from '@/lib/utils';
import { Upload, Check, AlertCircle, FileUp } from 'lucide-react';

// ─── Props ───────────────────────────────────────────────────────────────────

interface AnimatedUploadProps {
  onFileSelect: (file: File) => void;
  accept?: string;
  maxSize?: number;
  label?: string;
  className?: string;
  disabled?: boolean;
}

type UploadState = 'idle' | 'dragging' | 'uploading' | 'success' | 'error';

// ─── Component ───────────────────────────────────────────────────────────────

export function AnimatedUpload({
  onFileSelect,
  accept,
  maxSize,
  label = 'Drop files here or click to upload',
  className,
  disabled,
}: AnimatedUploadProps) {
  const { accentColor, accentColorSecondary, animations, borderRadius, neonGlowIntensity } =
    useThemeStore();
  const progressBarStyle = animations.progressBar;

  const [state, setState] = useState<UploadState>('idle');
  const [progress, setProgress] = useState(0);
  const [errorMsg, setErrorMsg] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  const dragCounter = useRef(0);

  const dur = (ms: number) => getAnimationDuration(ms) / 1000;
  const ease = getEasing();

  // ── File processing (declared first so other handlers can reference it) ──

  const processFile = useCallback(
    (file: File) => {
      if (maxSize && file.size > maxSize) {
        setState('error');
        setErrorMsg(`File exceeds maximum size (${(maxSize / 1024 / 1024).toFixed(1)} MB)`);
        return;
      }

      if (accept) {
        const acceptedTypes = accept.split(',').map((t) => t.trim().toLowerCase());
        const fileExt = '.' + file.name.split('.').pop()?.toLowerCase();
        const fileMime = file.type.toLowerCase();
        const matches = acceptedTypes.some(
          (t) => t === fileExt || t === fileMime || (t.endsWith('/*') && fileMime.startsWith(t.replace('/*', '/'))),
        );
        if (!matches) {
          setState('error');
          setErrorMsg('File type not accepted');
          return;
        }
      }

      setState('uploading');
      setProgress(0);

      let p = 0;
      const interval = setInterval(() => {
        p += Math.random() * 15 + 5;
        if (p >= 100) {
          p = 100;
          clearInterval(interval);
          setState('success');
          onFileSelect(file);
        }
        setProgress(Math.min(Math.round(p), 100));
      }, 120);
    },
    [maxSize, accept, onFileSelect],
  );

  // ── Drag handlers ──

  const handleDragEnter = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current++;
    if ((e.currentTarget as HTMLElement).dataset.state !== 'uploading' && (e.currentTarget as HTMLElement).dataset.state !== 'success') {
      setState('dragging');
    }
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    dragCounter.current--;
    if (dragCounter.current <= 0) {
      dragCounter.current = 0;
      if ((e.currentTarget as HTMLElement).dataset.state !== 'uploading' && (e.currentTarget as HTMLElement).dataset.state !== 'success') {
        setState('idle');
      }
    }
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      e.stopPropagation();
      dragCounter.current = 0;

      const file = e.dataTransfer.files[0];
      if (!file) {
        setState('error');
        setErrorMsg('No file received');
        return;
      }
      processFile(file);
    },
    [processFile],
  );

  // ── Click to browse ──

  const handleClick = useCallback(() => {
    if (disabled) return;
    inputRef.current?.click();
  }, [disabled]);

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      if (file) processFile(file);
      e.target.value = '';
    },
    [processFile],
  );

  // ── Progress bar styles ──

  const getProgressBarStyle = (): React.CSSProperties => {
    const base: React.CSSProperties = {
      borderRadius: '9999px',
      height: '100%',
    };

    switch (progressBarStyle) {
      case 'shimmer':
        return {
          ...base,
          background: `linear-gradient(90deg, ${accentColor}, ${accentColorSecondary})`,
          backgroundSize: '200% 100%',
          animation: 'shimmer-sweep 1.5s ease-in-out infinite',
        };
      case 'gradient':
        return {
          ...base,
          background: `linear-gradient(90deg, ${accentColor}, ${accentColorSecondary})`,
        };
      case 'neon':
        return {
          ...base,
          background: accentColor,
          boxShadow: `0 0 ${8 + (neonGlowIntensity ?? 0.5) * 12}px ${accentColor}80`,
        };
      default:
        return {
          ...base,
          background: accentColor,
        };
    }
  };

  // ── State-based styling ──

  const borderClass =
    state === 'dragging'
      ? 'border-solid'
      : state === 'success'
        ? 'border-solid border-green-500'
        : state === 'error'
          ? 'border-solid border-red-500'
          : 'border-dashed border-border';

  const borderColor = state === 'dragging' ? accentColor : undefined;

  return (
    <div className={cn('w-full', className)}>
      <motion.div
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 rounded-lg border-2 p-8 cursor-pointer select-none',
          borderClass,
          disabled && 'opacity-50 pointer-events-none',
        )}
        data-state={state}
        style={{
          borderRadius,
          borderColor,
          backgroundColor: state === 'dragging' ? `${accentColor}08` : 'transparent',
        }}
        onClick={handleClick}
        onDragEnter={handleDragEnter}
        onDragLeave={handleDragLeave}
        onDragOver={handleDragOver}
        onDrop={handleDrop}
        animate={
          state === 'dragging'
            ? { scale: [1, 1.02, 1] }
            : state === 'error'
              ? { x: [0, -6, 6, -4, 4, 0] }
              : { scale: 1, x: 0 }
        }
        transition={{
          duration: dur(400),
          ease,
          repeat: state === 'dragging' ? Infinity : 0,
          repeatType: 'reverse',
        }}
      >
        <input
          ref={inputRef}
          type="file"
          accept={accept}
          className="hidden"
          onChange={handleInputChange}
        />

        {/* Icon */}
        <AnimatePresence mode="wait">
          <motion.div
            key={state}
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.8 }}
            transition={{ duration: dur(150), ease }}
          >
            {state === 'success' ? (
              <Check className="h-10 w-10 text-green-500" />
            ) : state === 'error' ? (
              <AlertCircle className="h-10 w-10 text-red-500" />
            ) : state === 'dragging' ? (
              <FileUp className="h-10 w-10" style={{ color: accentColor }} />
            ) : (
              <Upload className="h-10 w-10 text-muted-foreground" />
            )}
          </motion.div>
        </AnimatePresence>

        {/* Label */}
        <AnimatePresence mode="wait">
          <motion.p
            key={state}
            className="text-sm text-muted-foreground text-center"
            initial={{ opacity: 0, y: 4 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -4 }}
            transition={{ duration: dur(150), ease }}
          >
            {state === 'success'
              ? 'Upload complete!'
              : state === 'error'
                ? errorMsg
                : label}
          </motion.p>
        </AnimatePresence>

        {/* Progress bar */}
        {state === 'uploading' && (
          <div className="w-full max-w-xs">
            <div className="h-2 w-full rounded-full bg-secondary overflow-hidden">
              <motion.div
                className="h-full rounded-full"
                style={{ width: `${progress}%`, ...getProgressBarStyle() }}
                initial={{ width: '0%' }}
                animate={{ width: `${progress}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-center text-muted-foreground">{progress}%</p>
          </div>
        )}
      </motion.div>
    </div>
  );
}
