import { createClient } from "redis";
import { env } from "../../config/env";

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
                    reconnectStrategy: (retries) => {
                        if (retries > 5) {
                            console.warn(`[Redis] Max reconnection attempts reached. Giving up.`);
                            return new Error("Max retries");
                        }
                        const delay = Math.min(retries * 100, 3000);
                        console.log(`[Redis] Reconnecting in ${delay}ms (attempt ${retries})`);
                        return delay;
                    }
                }
            });

            newClient.on("error", (err) => {
                // Silently ignore common reconnection errors to avoid noise,
                // but log unexpected ones
                if (!(err as any).message?.includes('ECONNREFUSED')) {
                    console.error("[Redis] Client error:", (err as any).message);
                }
            });

            newClient.on("connect", () => {
                console.log("[Redis] Connected successfully");
            });

            await newClient.connect();
            client = newClient;
            return client;
        } catch (err) {
            console.error("[Redis] Failed to connect:", (err as Error).message);
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
        console.log("[Redis] Connection closed gracefully");
    }
    client = null;
}
