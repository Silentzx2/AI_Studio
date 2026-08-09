interface CacheEntry<T = unknown> {
  data: T;
  timestamp: number;
  ttl: number;
}

interface CacheOptions {
  ttl?: number;
  maxEntries?: number;
  staleWhileRevalidate?: boolean;
}

const DEFAULT_TTL = 60000;
const DEFAULT_MAX_ENTRIES = 100;

class CacheService {
  private cache: Map<string, CacheEntry> = new Map();
  private maxEntries: number;
  private defaultTtl: number;

  constructor(options: CacheOptions = {}) {
    this.defaultTtl = options.ttl ?? DEFAULT_TTL;
    this.maxEntries = options.maxEntries ?? DEFAULT_MAX_ENTRIES;
  }

  private normalizeKey(key: string): string {
    return key.trim().toLowerCase();
  }

  private evictIfNeeded(): void {
    if (this.cache.size >= this.maxEntries) {
      const entries = Array.from(this.cache.entries());
      const sorted = entries.sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = sorted.slice(0, Math.ceil(sorted.length / 4));
      for (const [key] of toRemove) {
        this.cache.delete(key);
      }
    }
  }

  get<T = unknown>(key: string): T | null {
    const normalizedKey = this.normalizeKey(key);
    const entry = this.cache.get(normalizedKey);

    if (!entry) return null;

    const isExpired = Date.now() - entry.timestamp > entry.ttl;
    if (isExpired) {
      this.cache.delete(normalizedKey);
      return null;
    }

    return entry.data as T;
  }

  set<T = unknown>(key: string, data: T, ttl?: number): void {
    const normalizedKey = this.normalizeKey(key);
    this.evictIfNeeded();

    this.cache.set(normalizedKey, {
      data,
      timestamp: Date.now(),
      ttl: ttl ?? this.defaultTtl,
    });
  }

  has(key: string): boolean {
    return this.get(key) !== null;
  }

  delete(key: string): void {
    this.cache.delete(this.normalizeKey(key));
  }

  clear(): void {
    this.cache.clear();
  }

  keys(): string[] {
    return Array.from(this.cache.keys());
  }

  size(): number {
    return this.cache.size;
  }

  prune(): number {
    const now = Date.now();
    let pruned = 0;
    for (const [key, entry] of this.cache.entries()) {
      if (now - entry.timestamp > entry.ttl) {
        this.cache.delete(key);
        pruned++;
      }
    }
    return pruned;
  }
}

let cacheServiceInstance: CacheService | null = null;

export function getCacheService(): CacheService {
  if (!cacheServiceInstance) {
    cacheServiceInstance = new CacheService();
  }
  return cacheServiceInstance;
}

export function useCacheService(): CacheService {
  return getCacheService();
}

export async function cachedFetch<T>(
  key: string,
  fetchFn: () => Promise<T>,
  options: CacheOptions = {}
): Promise<T> {
  const cache = getCacheService();
  const cached = cache.get<T>(key);

  if (cached !== null) {
    return cached;
  }

  const data = await fetchFn();
  cache.set(key, data, options.ttl);
  return data;
}