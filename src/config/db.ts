import pg from "pg";
import dotenv from "dotenv";

dotenv.config();

const { Pool } = pg;

// Inicializa el pool de conexiones de PostgreSQL utilizando las variables de entorno
const pool = new Pool({
  user: process.env.DB_USER || "postgres",
  host: process.env.DB_HOST || "localhost",
  database: process.env.DB_DATABASE || "spot_db",
  password: process.env.DB_PASSWORD || "my_secure_password",
  port: parseInt(process.env.DB_PORT || "5432"),
});

// Oyente de conexiones para reportar errores en el pool de fondo
pool.on("error", (err) => {
  console.error("Error inesperado en el pool de conexiones PostgreSQL:", err);
});

export default {
  /**
   * Ejecuta una consulta SQL genérica en la base de datos.
   * @param text Sentencia SQL (ej. SELECT * FROM users WHERE id = $1)
   * @param params Parámetros dinámicos para evitar SQL Injection
   */
  query: (text: string, params?: any[]) => {
    return pool.query(text, params);
  },
  pool
};
