import 'reflect-metadata'
import http from "http";
import app from "./app";
import AppDataSource from "./db";
import { env } from "./config/env";
import { verifyMailer } from "./common/services/mailer";
import { getMPConfig } from "./payment/mp.config";
import { migrateLegacyRoles } from "./user/migrate-roles";
import { closeRedis } from "./common/services/redis";
import { logger } from "./common/services/logger";
import { startEmailWorker, closeEmailWorker } from "./queue/email.queue";

const PORT = env.PORT;

let server: http.Server | null = null;
let isShuttingDown = false;

function startServer(port: number): Promise<http.Server> {
  return new Promise((resolve, reject) => {
    const listener = http.createServer(app);

    const onError = (error: NodeJS.ErrnoException) => {
      listener.off("listening", onListening);
      reject(error);
    };

    const onListening = () => {
      listener.off("error", onError);
      logger.info("STARTUP_SERVER_LISTENING", { port });
      resolve(listener);
    };

    listener.once("error", onError);
    listener.once("listening", onListening);
    listener.listen(port);
  });
}

async function main() {
  try {
    logger.info("STARTUP_VERIFYING_MP");
    const mpConfig = getMPConfig();
    const mpConfigured = !!(mpConfig.accessToken && mpConfig.accessToken.length > 10);
    logger.info("STARTUP_MP_STATUS", { configured: mpConfigured, hasWebhookSecret: !!mpConfig.webhookSecret });

    await AppDataSource.initialize();
    logger.info("STARTUP_DB_CONNECTED");

    await migrateLegacyRoles();

    server = await startServer(PORT);

    startEmailWorker();

    const mailOk = await verifyMailer();
    logger.info("STARTUP_MAILER_STATUS", { ready: mailOk });
  } catch (error) {
    const startupError = error as NodeJS.ErrnoException;
    if (startupError.code === "EADDRINUSE") {
      logger.error("STARTUP_PORT_IN_USE", {
        port: PORT,
        hint: `Port ${PORT} is already in use. Stop the existing process or set PORT to another value.`,
      });
    } else {
      logger.error("STARTUP_FATAL_ERROR", { error: startupError.message });
    }
    await gracefulShutdown("STARTUP_FAILURE", 1);
  }
}

main();

/* ========== Graceful Shutdown ========== */

async function gracefulShutdown(signal: string, exitCode = 0) {
  if (isShuttingDown) {
    logger.warn("SHUTDOWN_ALREADY_IN_PROGRESS", { signal });
    return;
  }
  isShuttingDown = true;
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

    await closeEmailWorker();
    await closeRedis();

    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      logger.info("SHUTDOWN_DB_CLOSED");
    }

    clearTimeout(forceExit);
    logger.info("SHUTDOWN_GRACEFUL_COMPLETE");
    process.exit(exitCode);
  } catch (err) {
    logger.error("SHUTDOWN_ERROR", { error: (err as Error).message });
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));
process.on('SIGUSR2', () => gracefulShutdown('SIGUSR2'));

process.on('unhandledRejection', (reason: any) => {
  logger.error('UNHANDLED_REJECTION', { reason: String(reason) });
  gracefulShutdown('UNHANDLED_REJECTION');
});

process.on('uncaughtException', (err: any) => {
  logger.error('UNCAUGHT_EXCEPTION', { error: err?.message, stack: err?.stack });
  gracefulShutdown('UNCAUGHT_EXCEPTION');
});
