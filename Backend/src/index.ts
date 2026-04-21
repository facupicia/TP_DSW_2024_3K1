
import 'reflect-metadata'
import app from "./app";
import AppDataSource from "./db";
import dotenv from "dotenv";
import { verifyMailer } from "./common/services/mailer";
import { getMPConfig } from "./payment/mp.config";

dotenv.config();
const PORT = process.env.PORT || 3000;

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
    
    app.listen(PORT);
    console.log(`✓ Servidor iniciado en puerto ${PORT}`);
    
    const mailOk = await verifyMailer();
    console.log(`✓ Mailer: ${mailOk ? 'Listo' : 'No disponible'}`);
  } catch (error) {
    console.error("❌ Error al iniciar:", error);
    process.exit(1);
  }
}

main();

process.on('unhandledRejection', (reason: any) => {
  console.error('UNHANDLED_REJECTION', { reason });
});

process.on('uncaughtException', (err: any) => {
  console.error('UNCAUGHT_EXCEPTION', { err });
});
