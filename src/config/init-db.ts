import fs from "fs";
import path from "path";
import fileURLToPath from "url";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Client } = pg;

// Obtiene la ruta del archivo schema.sql de forma dinámica compatible con ES Modules
const __filename = path.resolve(fileURLToPath.fileURLToPath(import.meta.url));
const __dirname = path.dirname(__filename);
const schemaPath = path.join(__dirname, "../../database/schema.sql");

async function initDatabase() {
  console.log("🔄 Conectando a PostgreSQL para inicializar base de datos...");

  // Configura conexión directa para la inicialización
  const client = new Client({
    user: process.env.DB_USER || "postgres",
    host: process.env.DB_HOST || "localhost",
    database: process.env.DB_DATABASE || "spot_db",
    password: process.env.DB_PASSWORD || "my_secure_password",
    port: parseInt(process.env.DB_PORT || "5432"),
  });

  try {
    await client.connect();
    console.log("✅ Conexión con PostgreSQL establecida con éxito.");

    if (!fs.existsSync(schemaPath)) {
      console.error(`❌ Archivo de esquema no encontrado en '${schemaPath}'.`);
      process.exit(1);
    }

    console.log("📖 Leyendo archivo 'database/schema.sql'...");
    const sql = fs.readFileSync(schemaPath, "utf8");

    console.log("⚙️ Ejecutando scripts SQL de base de datos (PostGIS, Tablas, Índices y Mocks)...");
    await client.query(sql);

    console.log("🎉 Base de datos de Spot inicializada exitosamente con datos de prueba.");
  } catch (error: any) {
    console.error("❌ Error de conexión o inicialización de base de datos:");
    console.error(error.message);
    console.log("\n💡 CONSEJOS DE RESOLUCIÓN:");
    console.log("1. Asegúrate de que tu servidor PostgreSQL esté corriendo en el puerto configurado.");
    console.log(`2. Verifica si la base de datos '${process.env.DB_DATABASE || "spot_db"}' existe. Puedes crearla con: CREATE DATABASE ${process.env.DB_DATABASE || "spot_db"};`);
    console.log("3. Comprueba las credenciales configuradas en tu archivo '.env'.");
  } finally {
    await client.end();
  }
}

initDatabase();
