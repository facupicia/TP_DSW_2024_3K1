import { env } from "../config/env";
import IORedis from "ioredis";
import { logger } from "../common/services/logger";

let redisConnection: IORedis | null = null;

export function getBullMQConnection(): IORedis {
    if (redisConnection) return redisConnection;

    if (!env.REDIS_URL) {
        throw new Error("REDIS_URL is not configured. BullMQ requires Redis.");
    }

    redisConnection = new IORedis(env.REDIS_URL, {
        maxRetriesPerRequest: null,
        enableReadyCheck: false,
    });

    redisConnection.on("connect", () => {
        logger.info("[BullMQ] Redis connection established");
    });

    redisConnection.on("error", (err) => {
        logger.error("[BullMQ] Redis connection error:", { message: err.message });
    });

    redisConnection.on("close", () => {
        logger.warn("[BullMQ] Redis connection closed");
    });

    return redisConnection;
}

export async function closeBullMQConnection(): Promise<void> {
    if (redisConnection) {
        await redisConnection.quit();
        redisConnection = null;
        logger.info("[BullMQ] Redis connection closed gracefully");
    }
}
