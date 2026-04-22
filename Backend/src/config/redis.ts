/**
 * Re-export Redis client from centralized service module.
 * Kept for backward compatibility with imports from config/redis.
 */
export { getRedis, closeRedis } from "../common/services/redis";
