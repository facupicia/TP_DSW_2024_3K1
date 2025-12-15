
import app from "./app";
import AppDataSource from "./db";
import dotenv from "dotenv";





dotenv.config();
const PORT = process.env.PORT || 3000;

async function main() {
  try {
    await AppDataSource.initialize();
    console.log("DB connect");
    app.listen(PORT);
    console.log("Server on port", PORT);
  } catch (error) {
    console.error(error);
  }
}

main();

process.on('unhandledRejection', (reason: any) => {
  console.error('UNHANDLED_REJECTION', { reason });
});

process.on('uncaughtException', (err: any) => {
  console.error('UNCAUGHT_EXCEPTION', { err });
});
