/**
 * Redis Configuration
 */
import { createClient } from "redis";
import { env } from "./env";

let client: ReturnType<typeof createClient> | null = null;

export async function getRedis() {
    if (!env.REDIS_URL) return null;
    if (!client) {
        client = createClient({ url: env.REDIS_URL });
        client.on("error", () => { /* ignore */ });
        await client.connect();
    }
    return client;
}
