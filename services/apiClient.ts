import type { ApiResponse } from '@/types';

// ponytail: cache disabled — returns null until a caching strategy is implemented
function getCacheService(): { get: <T>(k: string) => T | null; set: <T>(k: string, v: T) => void; keys: () => string[]; delete: (k: string) => void; clear: () => void } | null { return null; }

/**
 * API Client for backend communication
 *
 * IMPORTANT: NEXT_PUBLIC_API_URL should be EMPTY for proper Docker networking.
 *
 * When empty, all requests use relative URLs (e.g., /api/v1/...), which are:
 * 1. Sent from browser to Next.js frontend server
 * 2. Intercepted by the API proxy route at app/api/v1/[...path]/route.ts
 * 3. Forwarded to the backend using BACKEND_URL (read at runtime)
 *
 * This ensures:
 * - Docker: requests go to http://api:8000 (service name)
 * - Local dev: requests go to http://localhost:8000
 *
 * The proxy reads BACKEND_URL at REQUEST time, not build time.
 */
const PLACEHOLDER_API_URLS = new Set([
  'undefined',
  'null',
  'your-api-url',
  'your-api-url-here',
  'https://your-api-url.com',
  'http://your-api-url.com',
]);

function normalizeApiUrl(value: string | undefined): string {
  const trimmed = value?.trim() ?? '';
  if (!trimmed || PLACEHOLDER_API_URLS.has(trimmed.toLowerCase())) return '';
  return trimmed.replace(/\/+$/, '');
}

// Base URL for API calls - mutable for runtime updates
let API_URL = normalizeApiUrl(process.env.NEXT_PUBLIC_API_URL);

// Export for use in components that need to resolve URLs
export const getApiUrl = () => API_URL;

async function parseErrorMessage(res: Response): Promise<string> {
  const contentType = res.headers.get('content-type') || '';
  if (contentType.includes('application/json')) {
    try {
      const json = await res.json();
      return json?.message || json?.detail || `HTTP ${res.status}`;
    } catch {
      // fall through
    }
  }
  return `HTTP ${res.status}: ${res.statusText || 'Request failed'}`;
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000);
  try {
    const res = await fetch(`${API_URL}${path}`, {
      ...init,
      signal: controller.signal,
      headers: { 'Content-Type': 'application/json', ...init?.headers },
    });
    clearTimeout(timeoutId);
    if (!res.ok) {
      const msg = await parseErrorMessage(res);
      throw new Error(msg);
    }
    // Handle empty responses
    const text = await res.text();
    if (!text) return {} as T;
    const json = JSON.parse(text);
    if (json?.success === false) {
      throw new Error(json?.message || 'Request failed');
    }
    return json;
  } catch (err) {
    clearTimeout(timeoutId);
    if (err instanceof DOMException && err.name === 'AbortError') {
      throw new Error('Request timed out – backend may be unreachable');
    }
    throw err;
  }
}

// Request with retry logic and exponential backoff
async function requestWithRetry<T>(
  path: string,
  init?: RequestInit,
  maxRetries: number = 3,
  signal?: AbortSignal,
): Promise<T> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    try {
      return await request<T>(path, { ...init, signal });
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));

      // Don't retry on 4xx errors (except 429)
      if (lastError.message.includes('HTTP 4') && !lastError.message.includes('429')) {
        throw lastError;
      }

      // Exponential backoff with jitter: 100ms, 200ms, 400ms
      if (attempt < maxRetries - 1) {
        const delay = 100 * Math.pow(2, attempt) + Math.random() * 100;
        await new Promise(resolve => setTimeout(resolve, delay));
      }
    }
  }

  throw lastError || new Error('Max retries exceeded');
}

// Request with circuit breaker pattern for critical operations
async function requestWithCircuitBreaker<T>(
  path: string,
  init?: RequestInit,
  maxRetries: number = 3,
  timeout: number = 5000
): Promise<T> {
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  // Create a promise that rejects after timeout
  const timeoutPromise = new Promise<never>((_, reject) => {
    timeoutId = setTimeout(() => {
      controller.abort();
      reject(new Error('Request timeout'));
    }, timeout);
  });

  try {
    // Race the request against the timeout
    return await Promise.race([
      requestWithRetry<T>(path, init, maxRetries, controller.signal),
      timeoutPromise
    ]);
  } finally {
    // FE-011 FIX: the loser of the race would otherwise keep a timer alive
    // until timeout after the winner resolved — clear it as soon as the race settles.
    if (timeoutId !== undefined) clearTimeout(timeoutId);
  }
}

export const apiClient = {
  get: <T>(path: string, useCache: boolean = true, retry: boolean = true) => {
    const cache = getCacheService();
    const cacheKey = `GET:${path}`;
    if (useCache && cache) {
      const cached = cache.get<T>(cacheKey);
      if (cached !== null) return Promise.resolve(cached);
    }
    const makeRequest = retry ? requestWithRetry : request;
    return makeRequest<T>(path).then((data) => {
      if (useCache && cache) cache.set(cacheKey, data);
      return data;
    });
  },
  post: <T>(path: string, body?: unknown) =>
    requestWithRetry<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),
  put: <T>(path: string, body?: unknown) =>
    requestWithRetry<T>(path, { method: 'PUT', body: body ? JSON.stringify(body) : undefined }),
  delete: <T>(path: string) => requestWithRetry<T>(path, { method: 'DELETE' }),

  // Methods with circuit breaker for critical operations
  getCritical: <T>(path: string) => requestWithCircuitBreaker<T>(path),
  postCritical: <T>(path: string, body?: unknown) =>
    requestWithCircuitBreaker<T>(path, { method: 'POST', body: body ? JSON.stringify(body) : undefined }),

  // uploadFile: Omit Content-Type header so browser sets multipart boundary
  // Uses XMLHttpRequest for real-time upload progress support
  uploadFile: <T>(
    path: string,
    file: File,
    onProgress?: (loaded: number, total: number) => void
  ): Promise<T> => {
    return new Promise((resolve, reject) => {
      const xhr = new XMLHttpRequest();
      const formData = new FormData();
      formData.append('file', file);

      // Progress tracking
      if (onProgress) {
        xhr.upload.onprogress = (e) => {
          if (e.lengthComputable) {
            onProgress(e.loaded, e.total);
          }
        };
      }

      xhr.onload = () => {
        if (xhr.status >= 200 && xhr.status < 300) {
          try {
            const text = xhr.responseText;
            if (!text) return resolve({} as T);
            const json = JSON.parse(text);
            if (json?.success === false) {
              return reject(new Error(json.message || 'Upload failed'));
            }
            const result = json?.data ?? json;
            return resolve(result);
          } catch (err) {
            return reject(new Error('Invalid JSON response'));
          }
        } else {
          reject(new Error(`HTTP ${xhr.status}: ${xhr.statusText || 'Upload failed'}`));
        }
      };

      xhr.onerror = () => reject(new Error('Upload failed - network error'));
      xhr.ontimeout = () => reject(new Error('Upload timeout - file may be too large'));

      xhr.open('POST', `${API_URL}${path}`);
      xhr.timeout = 120000; // 2 minutes for large files
      xhr.send(formData);
    });
  },

  // streamEvents: SSE via API proxy route
  // The proxy forwards SSE connections to backend and streams responses back
  streamEvents: (path: string, onEvent: (data: unknown) => void, onDone?: () => void) => {
    let es: EventSource | null = null;
    let isClosed = false;

    try {
      const url = API_URL ? `${API_URL}${path}` : path;
      es = new EventSource(url);

      es.onmessage = (e) => {
        if (isClosed) return;
        try {
          onEvent(JSON.parse(e.data));
        } catch {
          // Ignore JSON parse errors
        }
      };

      es.onerror = () => {
        if (isClosed) return;
        isClosed = true;
        if (es) {
          es.close();
          es = null;
        }
        onDone?.();
      };
    } catch (err) {
      isClosed = true;
      onDone?.();
      console.error('Failed to create EventSource:', err);
    }

    // Return cleanup function
    return () => {
      if (!isClosed && es) {
        isClosed = true;
        es.close();
        es = null;
      }
    };
  },

  // Invalidate cache for a given path prefix
  invalidateCache: (pathPrefix?: string) => {
    const cache = getCacheService();
    if (!cache) return;
    if (pathPrefix) {
      const prefix = `GET:${pathPrefix}`;
      for (const key of cache.keys()) {
        if (key.startsWith(prefix)) {
          cache.delete(key);
        }
      }
    } else {
      cache.clear();
    }
  },

  // Get/set base URL for API calls
  getBaseUrl: () => API_URL,
  setBaseUrl: (url: string) => {
    API_URL = normalizeApiUrl(url || undefined);
  },
};