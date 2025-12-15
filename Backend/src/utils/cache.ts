type CacheEntry<T> = { value: T; expiresAt: number };

export class TTLCache<T> {
    private store = new Map<string, CacheEntry<T>>();
    constructor(private defaultTtlMs = 60000) { }
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
        this.store.set(key, { value, expiresAt: Date.now() + (ttlMs ?? this.defaultTtlMs) });
    }
    clear(prefix?: string): void {
        if (!prefix) {
            this.store.clear();
            return;
        }
        for (const k of this.store.keys()) if (k.startsWith(prefix)) this.store.delete(k);
    }
}

export const globalCache = new TTLCache<any>(60000);

