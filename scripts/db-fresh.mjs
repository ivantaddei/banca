// Resetea la DB: borra TODO el schema public y lo recrea vacío.
// Lo usa `pnpm fresh`, que después corre `pnpm migrate` para reconstruir.
// Env vía Node nativo: `node --env-file=.env scripts/db-fresh.mjs`.
import { Pool } from "pg";

const url = process.env.DATABASE_URL;
if (!url) {
  console.error("Falta DATABASE_URL (revisá .env)");
  process.exit(1);
}

const pool = new Pool({ connectionString: url });
console.log("Borrando schema public...");
await pool.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public;");
await pool.end();
console.log("Schema public reseteado. Corriendo migrate...");
