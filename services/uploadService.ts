import { apiClient } from './apiClient';
import { MAX_IMAGE_SIZE_BYTES, SUPPORTED_IMAGE_FORMATS } from '@/constants';
import type { UploadedImage } from '@/types';

export interface UploadProgress {
  loaded: number;
  total: number;
  percent: number;
}

export const uploadService = {
  validateFile(file: File): { valid: boolean; error?: string } {
    const ext = '.' + file.name.split('.').pop()?.toLowerCase();
    if (!SUPPORTED_IMAGE_FORMATS.includes(ext as '.png' | '.jpg' | '.jpeg' | '.webp')) {
      return { valid: false, error: `Unsupported format. Use: ${SUPPORTED_IMAGE_FORMATS.join(', ')}` };
    }
    if (file.size > MAX_IMAGE_SIZE_BYTES) {
      return { valid: false, error: `File too large. Max size: ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB` };
    }
    return { valid: true };
  },

  async upload(file: File): Promise<{ url: string; width: number; height: number }> {
    const result = await apiClient.uploadFile<
      { url: string; width: number; height: number } |
      { data: { url: string; width: number; height: number } }
    >(
      '/api/v1/upload/image',
      file
    );
    return 'data' in result ? result.data : result;
  },

  /** Upload with real progress tracking via XMLHttpRequest with cancellation support */
  uploadWithProgress(
    file: File,
    onProgress: (progress: UploadProgress) => void,
    endpoint: '/api/v1/upload/image' | '/api/v1/upload/model' = '/api/v1/upload/image'
  ): { promise: Promise<{ url: string; width?: number; height?: number; filename?: string; size?: number; format?: string; thumbnail_url?: string }>; cancel: () => void } {
    let xhr: XMLHttpRequest;
    const promise = new Promise<{ url: string; width?: number; height?: number; filename?: string; size?: number; format?: string; thumbnail_url?: string }>((resolve, reject) => {
      xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          onProgress({
            loaded: e.loaded,
            total: e.total,
            percent: Math.round((e.loaded / e.total) * 100),
          });
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const json = JSON.parse(xhr.responseText);
            const data = json?.data ?? json;
            resolve({
              url: data.url,
              width: data.width,
              height: data.height,
              filename: data.filename,
              size: data.size,
              format: data.format,
              thumbnail_url: data.thumbnail_url,
            });
          } catch {
            reject(new Error('Invalid response from server'));
          }
        } else {
          try {
            const json = JSON.parse(xhr.responseText);
            const detail = json?.message || json?.detail || json?.errors;
            if (Array.isArray(detail)) {
              reject(new Error(detail.map((item: any) => item?.msg || item?.message || String(item)).join('; ')));
              return;
            }
            if (typeof detail === 'string' && detail.trim()) {
              reject(new Error(detail));
              return;
            }
          } catch {
            // Fall back to the HTTP status text below.
          }
          reject(new Error(`Upload failed: ${xhr.status} ${xhr.statusText}`));
        }
      });

      xhr.addEventListener('error', () => reject(new Error('Network error during upload')));
      xhr.addEventListener('abort', () => reject(new Error('Upload cancelled')));

      xhr.open('POST', endpoint);
      xhr.send(formData);
    });

    return {
      promise,
      cancel: () => {
        if (xhr) xhr.abort();
      }
    };
  },

  createPreview(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  },

  getImageDimensions(img: HTMLImageElement): { width: number; height: number } {
    return { width: img.naturalWidth, height: img.naturalHeight };
  },
};

export function validateImageFile(file: File): string | null {
  const ext = '.' + file.name.split('.').pop()?.toLowerCase();
  if (!SUPPORTED_IMAGE_FORMATS.includes(ext as '.png' | '.jpg' | '.jpeg' | '.webp')) {
    return `Unsupported format. Use: ${SUPPORTED_IMAGE_FORMATS.join(', ')}`;
  }
  if (file.size > MAX_IMAGE_SIZE_BYTES) {
    return `File too large. Max size: ${MAX_IMAGE_SIZE_BYTES / 1024 / 1024}MB`;
  }
  return null;
}

function getImageSizeFromFile(file: File): Promise<{ width: number; height: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(img.src);
    };
    img.onerror = (err) => {
      URL.revokeObjectURL(img.src);
      reject(err);
    };
    img.src = URL.createObjectURL(file);
  });
}

export async function processImageFile(file: File): Promise<UploadedImage> {
  const preview = await uploadService.createPreview(file);
  const { width, height } = await getImageSizeFromFile(file);
  return { file, preview, width, height };
}
