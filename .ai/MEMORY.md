# Project Memory & Knowledge Base — Banca

## 💡 Patterns & Decisions

- **Custodia ≠ reglas**: el Vault custodia y mueve fondos; los Markets aplican reglas. El Vault nunca decide precio ni ganador; los Markets nunca tocan USDC directamente.
- **Frontera Stellar dura**: todo el SDK de Stellar vive en `src/lib/stellar/`. El resto del código habla en lenguaje de dominio ("pozo", "boleto", "tu parte"). Si la jerga cripto se filtra a la UI, está roto.
- **Reservas virtuales del pool**: las `R_i` del AMM son enteros en el estado del Market, no shares reales en el Vault. Solo las shares de usuarios/LP son saldos reales. Menos cross-contract calls, misma solvencia.
- **Single-LP**: el creador es el único proveedor de liquidez del mercado público (100%). Elimina toda la matemática de LP shares en el MVP.
- **Pari-mutuel para privados**: el creador NO siembra plata; todos apuestan al lado que creen; payout proporcional a lo apostado a la opción ganadora.
- **Construcción en capas con compuertas**: cada capa debe quedar verde y demostrable antes de empezar la siguiente. Convierte un "todo o nada" en "piso garantizado + stretch".

## ⚠️ Gotchas (aprendidos diseñando — NO repetir errores)

- **Invariante de solvencia FASEADO**: `locked == total_supply[opción_i] para cada i` solo vale en ACTIVE. Post-RESOLVED solo vale para la opción ganadora (las perdedoras quedan con supply congelado porque nadie las quema). Chequear la versión "para cada opción" después de un claim hace **PANIC**. El invariante que vale siempre es la **conservación**: `usdc_in == locked + treasury + payouts`.
- **Redondeo del AMM va HACIA ABAJO para el usuario**: `outcome_out` floor (equivale a `R_final` ceil). Si redondeás `R_final` hacia abajo, el usuario recibe MÁS shares → fuga de valor del LP al trader y posible insolvencia. (Un doc externo afirmaba lo contrario; estaba mal en dos sentidos.)
- **Fee ANTES de mintear**: `mint == gross - fee`. Mintear sobre el gross y después descontar el fee rompe la solvencia.
- **Overflow de `k` en multi-opción**: calcular `k = R1*R2*...*Rn` overflowea i128 con 5+ opciones / reservas grandes. Usar cálculo secuencial por ratios (`R_final = R_inicial × ∏(R_otra_inicial/R_otra_nueva)`). Para binario + 3 opciones con reservas modestas NO hace overflow — no over-engineer en Capa 1.
- **Quemar ANTES de pagar** en claim: garantiza no-doble-claim (el saldo queda en 0).
- **Sin venta secundaria** → `locked` es monótono (solo sube en ACTIVE, solo baja en RESOLVED). Mata bugs de reentrancy y de "retiré justo antes del cierre".

## 🛠️ Setup & Tooling

- **Toolchain Soroban**: requiere rustup (NO el Rust de Homebrew, que no maneja targets) + `stellar-cli` + target `wasm32-unknown-unknown`. Dos Rust en paralelo = conflictos de PATH silenciosos.
- **Token de demo**: mock USDC propio desplegado en testnet → controlamos el mint para sembrar saldos. "Mock USDC" y "testnet" no son opuestos: testnet es la cadena, el token es una elección que igual vive en testnet. Evitar faucet externo (frágil en demo) y XLM nativo (pierde el "se siente como plata").
- **Friendbot** fondea cuentas testnet gratis. Custodial keys cifradas server-side.
- **pnpm** siempre (nunca npm/yarn). **No correr build** salvo pedido explícito.

## ⚛️ Next 16 — especificidades (leídas de node_modules/next/dist/docs)

- **`params` es una Promise**: en páginas dinámicas (`markets/[id]/page.tsx`) hay que `const { id } = await params`. Igual `searchParams`.
- **Server Functions/Actions** (`'use server'`): async, corren en server, pueden usar secretos (claves custodiales, RPC). Son nuestro vehículo para todo lo que toca Stellar/DB. Se invocan desde forms (`action={fn}`), `formAction`, o event handlers/useEffect en client components vía import.
- **SEGURIDAD**: las Server Actions son alcanzables por POST directo, no solo desde la UI. Verificar auth/autorización DENTRO de cada action (relevante para claim/submit_result).
- **Refrescar tras mutación**: `refresh()` de `next/cache` (refresca el router del cliente). Para datos tagueados: `revalidateTag`/`updateTag` o `revalidatePath`. `redirect()` de `next/navigation` lanza control-flow (el código posterior no corre).
- **Server vs Client**: layouts/pages son Server Components por default. `'use client'` solo en componentes interactivos (BuyPanel, BetPanel, theme switch). `'use client'` marca una frontera: todo lo importado debajo entra al bundle cliente.
- **Env vars**: solo `NEXT_PUBLIC_*` llegan al cliente; el resto se reemplaza por string vacío en el bundle. Las claves custodiales y el RPC van SIN prefijo. Reforzar `src/lib/stellar/` con el paquete `server-only`.
- Hint del propio doc: para navegaciones instantáneas, Suspense no alcanza — exportar `unstable_instant` de la route (no prioritario para MVP).

## 🚩 Out of scope (MVP) — roadmap para el pitch

- Multi-LP / LP shares de terceros (público es single-LP por ahora).
- Multi-opción con LMSR (usamos producto constante; multi-opción es Capa 3, stretch).
- Disputas / re-votación / oráculos descentralizados.
- Voto de resolución on-chain (vive en Postgres en el MVP).
- Auth real (usuario anónimo con handle).
- Cancelación después de ACTIVE.
