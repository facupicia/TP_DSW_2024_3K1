/**
 * Stats Cache Service
 * Provides Redis-based caching for statistics endpoints
 */
import { getRedis } from "../../config/redis";

const DEFAULT_TTL = 300; // 5 minutes in seconds
const LONG_TTL = 600; // 10 minutes for expensive queries

/**
 * Generate cache key for stats
 */
function generateKey(prefix: string, params: Record<string, any>): string {
    const sortedParams = Object.keys(params)
        .sort()
        .map(k => `${k}:${params[k]}`)
        .join("|");
    return `stats:${prefix}:${sortedParams || 'default'}`;
}

/**
 * Get cached stats or compute them
 */
export async function getCachedStats<T>(
    prefix: string,
    params: Record<string, any>,
    computeFn: () => Promise<T>,
    ttl: number = DEFAULT_TTL
): Promise<T> {
    const redis = await getRedis();
    const key = generateKey(prefix, params);

    // Try to get from cache
    if (redis) {
        try {
            const cached = await redis.get(key);
            if (cached) {
                return JSON.parse(cached);
            }
        } catch (err) {
            // If cache fails, continue to compute
            console.warn('Redis get error:', err);
        }
    }

    // Compute stats
    const result = await computeFn();

    // Store in cache
    if (redis) {
        try {
            await redis.setEx(key, ttl, JSON.stringify(result));
        } catch (err) {
            console.warn('Redis set error:', err);
        }
    }

    return result;
}

/**
 * Invalidate stats cache by pattern
 */
export async function invalidateStatsCache(pattern: string): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;

    try {
        // Find all keys matching pattern
        const keys = await redis.keys(`stats:${pattern}*`);
        if (keys.length > 0) {
            await redis.del(keys);
        }
    } catch (err) {
        console.warn('Redis invalidate error:', err);
    }
}

/**
 * Invalidate all stats cache
 */
export async function invalidateAllStatsCache(): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;

    try {
        const keys = await redis.keys('stats:*');
        if (keys.length > 0) {
            await redis.del(keys);
        }
    } catch (err) {
        console.warn('Redis invalidate all error:', err);
    }
}

/**
 * Pre-warm cache for expensive queries
 */
export async function prewarmCache<T>(
    prefix: string,
    params: Record<string, any>,
    computeFn: () => Promise<T>,
    ttl: number = LONG_TTL
): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;

    const key = generateKey(prefix, params);

    try {
        // Only prewarm if not already cached
        const exists = await redis.exists(key);
        if (!exists) {
            const result = await computeFn();
            await redis.setEx(key, ttl, JSON.stringify(result));
        }
    } catch (err) {
        console.warn('Redis prewarm error:', err);
    }
}

// Export TTL constants
export { DEFAULT_TTL, LONG_TTL };
