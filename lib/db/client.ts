import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import * as authSchema from "./auth-schema";
import * as domainSchema from "./schema";

// Pool único de Postgres + instancia Drizzle con TODO el schema (auth + dominio).
// better-auth corre sobre este mismo `db` (ver lib/auth.ts).
export const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

export const schema = { ...authSchema, ...domainSchema };

export const db = drizzle(pool, { schema });
