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
  const initialRender = useRef(true);
  const saveActionRef = useRef(saveAction);
  const dataRef = useRef(data);

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
      setStatus('modified');
      return;
    }

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
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, delay, skipInitial]);

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

  return { status, save: handleManualSave };
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
              <span className="text-amber-500 font-semibold">Unsaved changes</span>
              <button
                onClick={onSave}
                className="ml-2 flex items-center gap-1 bg-[#F5A623] hover:bg-[#D48C16] text-black px-2.5 py-1 rounded-md font-bold transition-all cursor-pointer"
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
              <Check className="w-3.5 h-3.5 text-emerald-500" />
              <span className="text-emerald-500">Changes saved</span>
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
