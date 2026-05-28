# Session State — Banca

## Current Goal

Construir el MVP de Banca para el Ideathon Stellar x Puna Tech (deadline **viernes 2026-05-29 19:00**). Ver `.ai/ARCHITECTURE.md` para el diseño completo.

## ⚠️ Entregables del Ideathon (reglamento leído 2026-05-28)

El Ideathon es "SIN código". OBLIGATORIOS (sin uno → NO califica):
- [ ] Deck de slides (propuesta completa)
- [ ] Video pitch ≤5 min (problema, validación, solución, modelo de negocio, uso de Stellar)
- [ ] Validación de mercado (encuestas/entrevistas/wireframes/landing/análisis)
- [ ] Nombre + logo

El MVP (contratos + app) es **BONUS**, no obligatorio. Entrega vía formulario Typeform antes del viernes 19:00.
**RIESGO**: si todo el tiempo va al código, los obligatorios quedan sin hacer → descalificación. Alguien debe armar deck/video/validación EN PARALELO. Pendiente confirmar si hay un track técnico separado que sí exija código.

## Where we are (2026-05-28)

- **Diseño cerrado**: 3 contratos (Vault + Public AMM + Private pari-mutuel), Ruta A en capas con compuertas de tiempo. Invariantes de seguridad definidos y corregidos. Modelo de datos y folder map definidos.
- **Decisiones tomadas**: single-LP (creador), reservas virtuales, sin cancel post-ACTIVE, token mock USDC en testnet, Postgres `banca` existente, custodial keys server-side, resolver firmado por plataforma según consenso en Postgres, **auth con better-auth (usuario+contraseña, sin verificación)**.
- **Prompt de diseño**: entregado al usuario (mobile + web) para generar las vistas con su design system propio. Pendiente que vuelvan las vistas.
- **Recon de toolchain hecha**: Node 22 + pnpm 10 OK. rustup instalado (rustc 1.96, gana PATH sobre Homebrew), stellar-cli 26.1.0, target wasm32 OK.
- **Auth + DB HECHO**: better-auth (usuario+contraseña, sin verificación) sobre **Drizzle ORM** (driver `pg`). Schema de auth generado (`lib/db/auth-schema.ts`) + dominio (`lib/db/schema.ts`), 11 tablas en la DB vía `drizzle-kit push`. `user.id`=text; FKs de dominio reconciliadas a text. Archivos: `lib/auth.ts`, `lib/db/client.ts`, `drizzle.config.ts`, `.env`. Proyecto es root-level (no src/).
- **Pendiente auth**: hook post-signup para generar keypair custodial Stellar; el signup debe proveer email (better-auth lo exige aunque uses username).

## Next Steps (Capa 0)

1. Instalar toolchain: desinstalar Rust de Homebrew → rustup → `stellar-cli` → target `wasm32-unknown-unknown`. (tarea #1)
2. Crear cuentas testnet con Friendbot (admin/plataforma + usuarios de demo). (tarea #2)
3. Leer `node_modules/next/dist/docs/` antes de escribir código. (tarea #3)
4. Conectar a Postgres `banca` y crear el schema. (tarea #4)
5. Deploy hello-world + invocar desde una server action de Next = **checkpoint verde de Capa 0**. (tarea #5)

Después de Capa 0: Capa 1 = Vault + Public Market binario (la prioridad, el money shot para el track Stellar).

## Open questions

- ~~Rust Homebrew~~ → RESUELTO: no se pudo desinstalar (lo usa `okapi`); rustup quedó instalado y gana el PATH (fix en ~/.zprofile).
- ~~Librería de Postgres~~ → RESUELTO: **Drizzle ORM** + driver `pg`. better-auth corre sobre el `drizzleAdapter`.
- Pendiente estratégica: ¿hay track técnico separado del Ideathon que exija código?
- Pendiente técnica: traer doc oficial de developers.stellar.org antes del primer contrato Rust.

## Relevant Files

- `.ai/ARCHITECTURE.md` — SSoT técnica
- `.ai/MEMORY.md` — patrones, gotchas, decisiones
- `package.json` — Next 16, React 19, Tailwind 4, pnpm
- `AGENTS.md` / `CLAUDE.md` — Next 16 tiene breaking changes, leer docs antes de codear
