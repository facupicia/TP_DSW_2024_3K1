type CacheEntry<T> = { value: T; expiresAt: number };

export class TTLCache<T> {
    private store = new Map<string, CacheEntry<T>>();
    constructor(private defaultTtlMs = 60000, private maxSize = 1000) {
        // Periodic cleanup every 60s
        setInterval(() => this.cleanup(), 60000);
    }
    get(key: string): T | undefined {
        const entry = this.store.get(key);
        if (!entry) return undefined;
        if (Date.now() > entry.expiresAt) {
            this.store.delete(key);
            return undefined;
        }
        return entry.value;
    }
    set(key: string, value: T, ttlMs?: number): void {
        if (this.store.size >= this.maxSize && !this.store.has(key)) {
            // Evict oldest entry
            const firstKey = this.store.keys().next().value;
            if (firstKey !== undefined) this.store.delete(firstKey);
        }
        this.store.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
    }
    clear(prefix?: string): void {
        if (!prefix) {
            this.store.clear();
            return;
        }
        for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
    }
    private cleanup(): void {
        const now = Date.now();
        for (const [k, v] of this.store.entries()) {
            if (now > v.expiresAt) this.store.delete(k);
        }
    }
}

// Namespaced caches to avoid cross-module poisoning
export const paymentCache = new TTLCache<any>(60000);
export const statsCache = new TTLCache<any>(300000);
export const userCache = new TTLCache<any>(60000);
export const globalCache = new TTLCache<any>(60000);
