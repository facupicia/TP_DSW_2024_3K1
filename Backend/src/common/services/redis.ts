import { createClient } from "redis";
import { env } from "../../config/env";
import { logger } from "./logger";

let client: ReturnType<typeof createClient> | null = null;
let connectionPromise: Promise<ReturnType<typeof createClient> | null> | null = null;

export async function getRedis() {
    if (!env.REDIS_URL) return null;
    if (client?.isOpen) return client;

    // Prevent concurrent connection attempts
    if (connectionPromise) return connectionPromise;

    connectionPromise = (async () => {
        try {
            const newClient = createClient({
                url: env.REDIS_URL,
                socket: {
                    connectTimeout: 5000,
                    keepAlive: 5000,
                    reconnectStrategy: (retries) => {
                        if (retries > 5) {
                            logger.warn(`[Redis] Max reconnection attempts reached. Giving up.`);
                            return new Error("Max retries");
                        }
                        const delay = Math.min(retries * 100, 3000);
                        logger.info(`[Redis] Reconnecting in ${delay}ms (attempt ${retries})`);
                        return delay;
                    }
                }
            });

            newClient.on("error", (err) => {
                logger.error("[Redis] Client error:", { message: (err as Error).message });
            });

            newClient.on("connect", () => {
                logger.info("[Redis] Connected successfully");
            });

            await newClient.connect();
            client = newClient;
            return client;
        } catch (err) {
            logger.error("[Redis] Failed to connect:", { message: (err as Error).message });
            client = null;
            return null;
        } finally {
            connectionPromise = null;
        }
    })();

    return connectionPromise;
}

const SSE_KEY_PREFIX = 'sse:connections';
const SSE_TTL_SECONDS = 60;
const SSE_STATS_KEY_PREFIX = 'sse:stats';
const SSE_STATS_TTL_SECONDS = 10;

export async function incrementSseConnection(userId: number): Promise<number> {
    const redis = await getRedis();
    if (!redis) return 0;
    const key = `${SSE_KEY_PREFIX}:${userId}`;
    const count = await redis.incr(key);
    await redis.expire(key, SSE_TTL_SECONDS);
    return count;
}

export async function decrementSseConnection(userId: number): Promise<number> {
    const redis = await getRedis();
    if (!redis) return 0;
    const key = `${SSE_KEY_PREFIX}:${userId}`;
    const count = await redis.decr(key);
    if (count <= 0) {
        await redis.del(key);
        return 0;
    }
    return count;
}

export async function getCachedSSEStats(userId: number): Promise<any | null> {
    const redis = await getRedis();
    if (!redis) return null;
    const key = `${SSE_STATS_KEY_PREFIX}:${userId}`;
    const data = await redis.get(key);
    return data ? JSON.parse(data) : null;
}

export async function setCachedSSEStats(userId: number, data: any): Promise<void> {
    const redis = await getRedis();
    if (!redis) return;
    const key = `${SSE_STATS_KEY_PREFIX}:${userId}`;
    await redis.setEx(key, SSE_STATS_TTL_SECONDS, JSON.stringify(data));
}

/**
 * Gracefully close Redis connection.
 * Call this during application shutdown.
 */
export async function closeRedis() {
    if (client?.isOpen) {
        await client.quit();
        logger.info("[Redis] Connection closed gracefully");
    }
    client = null;
}
