import { betterAuth } from "better-auth";
import { username } from "better-auth/plugins";
import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { db } from "./db/client";
import { user, session, account, verification } from "./db/auth-schema";

// Auth del MVP: usuario + contraseña, SIN verificación de email.
// better-auth corre sobre Drizzle. El esquema de auth se genera con
// `npx @better-auth/cli generate` (lib/db/auth-schema.ts) y se migra con drizzle-kit.
export const auth = betterAuth({
  database: drizzleAdapter(db, {
    provider: "pg",
    schema: { user, session, account, verification },
  }),
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false,
  },
  plugins: [username()],
  user: {
    additionalFields: {
      handle: { type: "string", required: false },
      // Campos custodiales — nunca los setea el cliente (input: false).
      // El keypair se genera en un hook post-signup cuando exista lib/stellar/keys.
      stellarPubkey: { type: "string", required: false, input: false },
      stellarSecretEnc: { type: "string", required: false, input: false },
      role: { type: "string", required: false, defaultValue: "user", input: false },
    },
  },
});
