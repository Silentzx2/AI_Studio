import React, { useState, useEffect, useRef } from 'react';
import { Loader2, Check, AlertCircle, Save } from 'lucide-react';
import { motion, AnimatePresence } from 'framer-motion';

export type AutoSaveStatus = 'idle' | 'saving' | 'saved' | 'error' | 'modified';

export function useAutoSave<T>(
  data: T,
  saveAction: (data: T) => Promise<void> | void,
  delay: number = 800,
  skipInitial: boolean = true
) {
  const [status, setStatus] = useState<AutoSaveStatus>('idle');
  const [isModified, setIsModified] = useState(false);
  const initialRender = useRef(true);
  const saveActionRef = useRef(saveAction);
  const dataRef = useRef(data);
  const autoSaveEnabled =
    typeof window !== 'undefined'
      ? localStorage.getItem('ai3d:settings:autoSaveEnabled') !== 'false'
      : true;

  useEffect(() => {
    saveActionRef.current = saveAction;
  }, [saveAction]);

  useEffect(() => {
    dataRef.current = data;
  }, [data]);

  const isAutoSaveEnabled =
    typeof window !== 'undefined'
      ? localStorage.getItem('ai3d:settings:autoSaveEnabled') !== 'false'
      : true;

useEffect(() => {
    if (skipInitial && initialRender.current) {
        initialRender.current = false;
        return;
    }

    if (!isAutoSaveEnabled) {
        setIsModified(true);
        return;
    }

    // Handle manual modifications separately
}, [isAutoSaveEnabled]);

useEffect(() => {
    setStatus('saving');

    const handler = setTimeout(async () => {
        try {
            await saveActionRef.current(data);
            setStatus('saved');
        } catch {
            setStatus('error');
        } finally {
            setTimeout(() => {
                setStatus((current) =>
                    current === 'saved' || current === 'error' ? 'idle' : current
                );
            }, 2500);
        }
    }, delay);

    return () => clearTimeout(handler);
    // setStatus is stable from useState, adding to deps avoids lint warning
}, [data, delay, skipInitial, setStatus]);

  const handleManualSave = async () => {
    setStatus('saving');
    try {
      await saveActionRef.current(dataRef.current);
      setStatus('saved');
    } catch {
      setStatus('error');
    } finally {
      setTimeout(() => {
        setStatus((current) =>
          current === 'saved' || current === 'error' ? 'idle' : current
        );
      }, 2500);
    }
  };

  const Indicator = () => (
    <AutoSaveIndicator status={status} onSave={handleManualSave} />
  );

  return { status, save: handleManualSave, Indicator };
}

/**
 * Stable indicator component — defined at module scope so it is not
 * re-created on every render of the consuming component.
 */
export function AutoSaveIndicator({
  status,
  onSave,
}: {
  status: AutoSaveStatus;
  onSave: () => void;
}) {
  return (
    <AnimatePresence mode="wait">
      {status !== 'idle' && (
        <motion.div
          key={status}
          initial={{ opacity: 0, y: -5 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 5 }}
          className="fixed top-24 right-8 z-50 flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border shadow-lg text-xs font-medium"
        >
          {status === 'modified' && (
            <>
              <span className="text-[hsl(var(--neon-amber))] font-semibold">Unsaved changes</span>
              <button
                onClick={onSave}
                className="ml-2 flex items-center gap-1 bg-primary hover:bg-primary/90 text-primary-foreground px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer"
              >
                <Save className="w-3 h-3" /> Save
              </button>
            </>
          )}
          {status === 'saving' && (
            <>
              <Loader2 className="w-3.5 h-3.5 animate-spin text-muted-foreground" />
              <span className="text-muted-foreground">Saving changes...</span>
            </>
          )}
          {status === 'saved' && (
            <>
              <Check className="w-3.5 h-3.5 text-[hsl(var(--neon-green))]" />
              <span className="text-[hsl(var(--neon-green))]">Changes saved</span>
            </>
          )}
          {status === 'error' && (
            <>
              <AlertCircle className="w-3.5 h-3.5 text-destructive" />
              <span className="text-destructive">Error saving</span>
            </>
          )}
        </motion.div>
      )}
    </AnimatePresence>
  );
}
