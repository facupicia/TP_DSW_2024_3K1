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
