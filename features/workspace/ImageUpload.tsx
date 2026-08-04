"use client";


import { useCallback, useState } from 'react';
import { useDropzone, FileRejection } from 'react-dropzone';
import { motion, AnimatePresence } from 'framer-motion';
import { Upload, X, ImageIcon, AlertCircle, ZoomIn } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { useGenerationStore } from '@/stores/useGenerationStore';
import { validateImageFile, processImageFile } from '@/services/uploadService';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

export function ImageUpload() {
  const { uploadedImage, setUploadedImage } = useGenerationStore();
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [preview, setPreview] = useState(false);

  const onDrop = useCallback(async (accepted: File[], rejected: FileRejection[]) => {
    setError(null);
    if (rejected.length > 0) { setError('File rejected. Please use PNG, JPG, JPEG, or WEBP under 20MB.'); return; }
    const file = accepted[0];
    if (!file) return;
    const validationError = validateImageFile(file);
    if (validationError) { setError(validationError); return; }
    setUploading(true);
    try {
      const processed = await processImageFile(file);
      setUploadedImage(processed);
      toast.success('Image uploaded', { description: `${processed.width}×${processed.height}px` });
    } catch {
      setError('Failed to process image. Please try again.');
    } finally {
      setUploading(false);
    }
  }, [setUploadedImage]);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    onDrop,
    accept: { 'image/png': [], 'image/jpeg': [], 'image/webp': [] },
    maxFiles: 1,
    maxSize: 20 * 1024 * 1024,
  });

  const remove = () => { setUploadedImage(null); setError(null); };

  if (uploadedImage) {
    return (
      <div className="space-y-2">
        <div className="relative rounded-xl overflow-hidden card-premium group">
          {/* Subtle reflection/glow below */}
          <div className="absolute -bottom-3 left-4 right-4 h-6 bg-gradient-to-b from-[hsl(var(--neon-purple)/0.06)] to-transparent rounded-b-[100%] blur-sm pointer-events-none z-0" />
          <div className="relative aspect-video w-full z-10">
            <Image src={uploadedImage.preview} alt="Reference image" fill className="object-contain" unoptimized />
            {/* Premium glass hover overlay */}
            <div className="absolute inset-0 bg-black/0 group-hover:bg-[hsl(var(--surface-0)/0.6)] backdrop-blur-[2px] transition-all duration-300 flex items-center justify-center gap-2.5 opacity-0 group-hover:opacity-100">
              <button onClick={() => setPreview(true)} className="chip bg-black/40 backdrop-blur-md border-white/15 text-white hover:bg-black/60 hover:border-white/25 hover:shadow-[0_0_12px_hsl(var(--neon-purple)/0.15)]">
                <ZoomIn className="w-3 h-3" /> Preview
              </button>
              <button onClick={remove} className="chip bg-destructive/20 backdrop-blur-md border-destructive/20 text-destructive hover:bg-destructive/30 hover:border-destructive/35 hover:shadow-[0_0_12px_hsl(var(--destructive)/0.15)]">
                <X className="w-3 h-3" /> Remove
              </button>
            </div>
          </div>
          <div className="px-3 py-2.5 flex items-center justify-between border-t border-[hsl(var(--border)/0.15)] relative z-10">
            <div className="flex items-center gap-2 min-w-0">
              <ImageIcon className="w-3.5 h-3.5 text-[hsl(var(--neon-purple)/0.5)] shrink-0" />
              <span className="text-xs text-muted-foreground/60 truncate">{uploadedImage.file.name}</span>
            </div>
            <span className="text-[10px] text-muted-foreground/40 font-mono shrink-0 ml-2">{uploadedImage.width}×{uploadedImage.height}</span>
          </div>
        </div>
        <AnimatePresence>
          {preview && (
            <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="fixed inset-0 z-50 bg-[hsl(var(--surface-0)/0.8)] backdrop-blur-sm flex items-center justify-center p-8" onClick={() => setPreview(false)}>
              <div className="relative max-w-3xl max-h-full" onClick={(e) => e.stopPropagation()}>
                <Image src={uploadedImage.preview} alt="Preview" width={uploadedImage.width} height={uploadedImage.height} className="object-contain max-h-[80vh] rounded-xl shadow-premium-lg" unoptimized />
                <button onClick={() => setPreview(false)} className="absolute top-3 right-3 chip bg-black/50 backdrop-blur-md border-white/15 text-white hover:bg-black/70"><X className="w-4 h-4" /></button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        {...getRootProps()}
        className={cn(
          'relative flex flex-col items-center justify-center gap-3 p-6 rounded-xl border-2 border-dashed transition-all duration-300 cursor-pointer overflow-hidden',
          isDragActive
            ? 'border-[hsl(var(--neon-purple)/0.5)] bg-[hsl(var(--neon-purple)/0.04)] scale-[1.01] shadow-[0_0_40px_hsl(var(--neon-purple)/0.12)]'
            : 'border-[hsl(var(--border)/0.25)] hover:border-[hsl(var(--neon-purple)/0.3)] hover:bg-[hsl(var(--surface-2)/0.15)] hover:shadow-[0_0_24px_hsl(var(--neon-purple)/0.06)]',
          uploading && 'pointer-events-none opacity-50'
        )}
      >
        {/* Animated gradient on drag */}
        {isDragActive && (
          <div className="absolute inset-0 bg-gradient-to-br from-[hsl(var(--neon-purple)/0.06)] via-transparent to-[hsl(var(--neon-blue)/0.04)] animate-[gradient-pan_3s_ease_infinite] pointer-events-none" />
        )}
        <input {...getInputProps()} />
        <div className={cn(
          'flex items-center justify-center w-12 h-12 rounded-xl transition-all duration-300 relative z-10',
          isDragActive
            ? 'bg-[hsl(var(--neon-purple)/0.12)] text-[hsl(var(--neon-purple))] shadow-[0_0_24px_hsl(var(--neon-purple)/0.2)] border border-[hsl(var(--neon-purple)/0.2)] scale-110'
            : 'bg-[hsl(var(--surface-2)/0.4)] text-muted-foreground/50 border border-[hsl(var(--border)/0.15)] hover:border-[hsl(var(--neon-purple)/0.15)] hover:text-[hsl(var(--neon-purple)/0.7)]'
        )}>
          {uploading ? <div className="w-5 h-5 border-2 border-[hsl(var(--neon-purple)/0.2)] border-t-[hsl(var(--neon-purple))] rounded-full animate-spin" /> : <Upload className="w-5 h-5 transition-all duration-300" style={{ filter: isDragActive ? 'drop-shadow(0 0 6px hsl(var(--neon-purple)/0.6))' : undefined }} />}
        </div>
        <div className="text-center relative z-10">
          <p className="text-sm font-medium text-foreground/80">{isDragActive ? 'Drop to upload' : uploading ? 'Processing...' : 'Click or drag & drop'}</p>
          <p className="text-[11px] text-muted-foreground/35 mt-1">PNG, JPG, JPEG, WEBP · Max 20MB</p>
        </div>
      </div>
      {error && (
        <motion.div initial={{ opacity: 0, y: -4 }} animate={{ opacity: 1, y: 0 }} className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-destructive/5 border border-destructive/15 shadow-[0_0_16px_hsl(var(--destructive)/0.06)]">
          <div className="w-6 h-6 rounded-lg bg-destructive/10 flex items-center justify-center shrink-0">
            <AlertCircle className="w-3.5 h-3.5 text-destructive/70" />
          </div>
          <p className="text-xs text-destructive/80">{error}</p>
        </motion.div>
      )}
    </div>
  );
}