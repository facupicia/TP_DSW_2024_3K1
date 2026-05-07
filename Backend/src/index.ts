import 'reflect-metadata'
import app from "./app";
import AppDataSource from "./db";
import dotenv from "dotenv";
import { verifyMailer } from "./common/services/mailer";
import { getMPConfig } from "./payment/mp.config";
import { migrateLegacyRoles } from "./user/migrate-roles";
import { closeRedis } from "./common/services/redis";
import { logger } from "./common/services/logger";

dotenv.config();
const PORT = Number(process.env.PORT) || 3000;

let server: ReturnType<typeof app.listen> | null = null;

async function main() {
  try {
    logger.info("STARTUP_VERIFYING_MP");
    const mpConfig = getMPConfig();
    const mpConfigured = !!(mpConfig.accessToken && mpConfig.accessToken.length > 10);
    logger.info("STARTUP_MP_STATUS", { configured: mpConfigured, hasWebhookSecret: !!mpConfig.webhookSecret });

    await AppDataSource.initialize();
    logger.info("STARTUP_DB_CONNECTED");

    await migrateLegacyRoles();

    server = app.listen(PORT, () => {
      logger.info("STARTUP_SERVER_LISTENING", { port: PORT });
    });

    const mailOk = await verifyMailer();
    logger.info("STARTUP_MAILER_STATUS", { ready: mailOk });
  } catch (error) {
    logger.error("STARTUP_FATAL_ERROR", { error: (error as Error).message });
    process.exit(1);
  }
}

main();

/* ========== Graceful Shutdown ========== */

async function gracefulShutdown(signal: string) {
  logger.info("SHUTDOWN_RECEIVED", { signal });

  const forceExit = setTimeout(() => {
    logger.error("SHUTDOWN_FORCE_EXIT");
    process.exit(1);
  }, 10000);

  try {
    // Stop accepting new connections and close existing keep-alive connections
    if (server) {
      await new Promise<void>((resolve) => {
        server?.close(() => {
          logger.info("SHUTDOWN_HTTP_CLOSED");
          resolve();
        });
      });
      // Node 18.2+ - close keep-alive connections
      if (typeof (server as any).closeAllConnections === "function") {
        (server as any).closeAllConnections();
      }
    }

    await closeRedis();

    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      logger.info("SHUTDOWN_DB_CLOSED");
    }

    clearTimeout(forceExit);
    logger.info("SHUTDOWN_GRACEFUL_COMPLETE");
    process.exit(0);
  } catch (err) {
    logger.error("SHUTDOWN_ERROR", { error: (err as Error).message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: any) => {
  logger.error('UNHANDLED_REJECTION', { reason: String(reason) });
  gracefulShutdown('UNHANDLED_REJECTION');
});

process.on('uncaughtException', (err: any) => {
  logger.error('UNCAUGHT_EXCEPTION', { error: err?.message, stack: err?.stack });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});
