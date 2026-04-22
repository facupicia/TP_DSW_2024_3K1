import 'reflect-metadata'
import app from "./app";
import AppDataSource from "./db";
import dotenv from "dotenv";
import { verifyMailer } from "./common/services/mailer";
import { getMPConfig } from "./payment/mp.config";
import { migrateLegacyRoles } from "./user/migrate-roles";
import { closeRedis } from "./common/services/redis";

dotenv.config();
const PORT = process.env.PORT || 3000;

let server: ReturnType<typeof app.listen> | null = null;

async function main() {
  try {
    // Verificar configuración de MercadoPago
    console.log("Verificando configuración de MercadoPago...");
    const mpConfig = getMPConfig();

    console.log("✓ MercadoPago configurado");
    console.log(`  Token: ${mpConfig.accessToken.substring(0, 10)}...`);
    console.log(`  Webhooks: ${mpConfig.webhookSecret ? 'Con secret' : 'Sin secret'}`);

    await AppDataSource.initialize();
    console.log("✓ Base de datos conectada");

    await migrateLegacyRoles();

    server = app.listen(PORT, () => {
      console.log(`✓ Servidor iniciado en puerto ${PORT}`);
    });

    const mailOk = await verifyMailer();
    console.log(`✓ Mailer: ${mailOk ? 'Listo' : 'No disponible'}`);
  } catch (error) {
    console.error("❌ Error al iniciar:", error);
    process.exit(1);
  }
}

main();

/* ========== Graceful Shutdown ========== */

async function gracefulShutdown(signal: string) {
  console.log(`\n${signal} recibido. Iniciando shutdown graceful...`);

  // Stop accepting new connections
  if (server) {
    server.close(() => {
      console.log('✓ Servidor HTTP cerrado');
    });
  }

  try {
    // Close Redis
    await closeRedis();

    // Close database connection pool
    if (AppDataSource.isInitialized) {
      await AppDataSource.destroy();
      console.log('✓ Conexión a base de datos cerrada');
    }

    console.log('✓ Shutdown graceful completado');
    process.exit(0);
  } catch (err) {
    console.error('❌ Error durante shutdown:', err);
    process.exit(1);
  }
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

process.on('unhandledRejection', (reason: any) => {
  console.error('UNHANDLED_REJECTION', { reason });
});

process.on('uncaughtException', (err: any) => {
  console.error('UNCAUGHT_EXCEPTION', { err });
});
