/**
 * Event Cache Service
 * Provides Redis-based caching for hot event endpoints
 * Pattern: cache-aside (read-through with TTL)
 */
import { getRedis } from "./redis";
import { logger } from "./logger";

const LIST_TTL = 30;    // 30 seconds for public event listing
const DETAIL_TTL = 60;  // 60 seconds for event detail
const PRICING_TTL = 300; // 5 minutes for checkout pricing
const LIST_KEYS_SET = 'event:list:keys';  // Redis Set tracking all list cache keys

function generateListKey(page: number, limit: number): string {
    return `event:list:${page}:${limit}`;
}

function generateDetailKey(eventId: number): string {
    return `event:detail:${eventId}`;
}

function generatePricingKey(userId: number): string {
    return `event:pricing:${userId}`;
}

async function getFromCache<T>(key: string): Promise<T | null> {
    const redis = await getRedis();
    if (!redis) return null;
    try {
        const cached = await redis.get(key);
        if (cached) {
            return JSON.parse(cached) as T;
        }
    } catch (err) {
        logger.warn('[EventCache] Redis get error', { key, error: (err as Error).message });
    }
    return null;
}

async function setCache<T>(key: string, data: T, ttl: number): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;
    try {
        await redis.setEx(key, ttl, JSON.stringify(data));
    } catch (err) {
        logger.warn('[EventCache] Redis set error', { key, error: (err as Error).message });
    }
}

/**
 * Get cached public events listing
 */
export async function getCachedEventList<T>(
    page: number,
    limit: number,
    computeFn: () => Promise<T>
): Promise<T> {
    const key = generateListKey(page, limit);
    const cached = await getFromCache<T>(key);
    if (cached) {
        logger.debug('[EventCache] LIST CACHE HIT', { key });
        return cached;
    }

    logger.debug('[EventCache] LIST CACHE MISS', { key });
    const result = await computeFn();
    await setCache(key, result, LIST_TTL);
    // Track this key in a Redis Set for efficient bulk invalidation
    const redis = await getRedis();
    if (redis) {
        try { await redis.sAdd(LIST_KEYS_SET, key); } catch { /* non-critical */ }
    }
    return result;
}

/**
 * Get cached event detail
 */
export async function getCachedEventDetail<T>(
    eventId: number,
    computeFn: () => Promise<T | null>
): Promise<T | null> {
    const key = generateDetailKey(eventId);
    const cached = await getFromCache<T>(key);
    if (cached) {
        logger.debug('[EventCache] DETAIL CACHE HIT', { eventId });
        return cached;
    }

    logger.debug('[EventCache] DETAIL CACHE MISS', { eventId });
    const result = await computeFn();
    if (result) {
        await setCache(key, result, DETAIL_TTL);
    }
    return result;
}

/**
 * Get cached checkout pricing
 */
export async function getCachedCheckoutPricing<T>(
    userId: number,
    computeFn: () => Promise<T>
): Promise<T> {
    const key = generatePricingKey(userId);
    const cached = await getFromCache<T>(key);
    if (cached) return cached;

    const result = await computeFn();
    await setCache(key, result, PRICING_TTL);
    return result;
}

/**
 * Invalidate event list cache (all pages)
 */
export async function invalidateEventListCache(): Promise<void> {
    const redis = await getRedis();
    if (!redis) {
        logger.warn('[EventCache] invalidateEventListCache: Redis not available');
        return;
    }

    try {
        const keys = await redis.sMembers(LIST_KEYS_SET);
        if (keys.length > 0) {
            await redis.del(keys);
        }
        await redis.del(LIST_KEYS_SET);
        logger.info('[EventCache] Event list cache invalidated (Set-based)', { keysDeleted: keys.length });
    } catch (err) {
        logger.warn('[EventCache] Redis invalidate error', { pattern: 'event:list:*', error: (err as Error).message });
    }
}

/**
 * Invalidate specific event detail cache
 */
export async function invalidateEventDetailCache(eventId: number): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;

    try {
        await redis.del(generateDetailKey(eventId));
        logger.info('[EventCache] Event detail cache invalidated', { eventId });
    } catch (err) {
        logger.warn('[EventCache] Redis del error', { eventId, error: (err as Error).message });
    }
}

/**
 * Invalidate checkout pricing cache for a user
 */
export async function invalidateCheckoutPricingCache(userId: number): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;

    try {
        await redis.del(generatePricingKey(userId));
    } catch (err) {
        logger.warn('[EventCache] Redis del error', { userId, error: (err as Error).message });
    }
}

/**
 * Invalidate ALL event-related caches
 */
export async function invalidateAllEventCaches(): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;

    try {
        // Invalidate list caches via the tracked Set
        const listKeys = await redis.sMembers(LIST_KEYS_SET);
        const keysToDelete = [...listKeys, LIST_KEYS_SET];

        // Also scan for detail and pricing keys (these are few and bounded)
        for await (const key of redis.scanIterator({ MATCH: 'event:detail:*', COUNT: 100 })) {
            keysToDelete.push(key);
        }
        for await (const key of redis.scanIterator({ MATCH: 'event:pricing:*', COUNT: 100 })) {
            keysToDelete.push(key);
        }

        if (keysToDelete.length > 0) {
            await redis.del(keysToDelete);
        }
        logger.info('[EventCache] All event caches invalidated');
    } catch (err) {
        logger.warn('[EventCache] Redis invalidate error', { pattern: 'event:*', error: (err as Error).message });
    }
}

export { LIST_TTL, DETAIL_TTL, PRICING_TTL };
