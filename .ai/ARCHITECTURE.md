# Architecture Guide — Banca (MVP)

**AGENT INSTRUCTION**: Este documento es la Fuente Única de Verdad (SSoT) técnica para **Banca**. Antes de proponer cambios, validá que tu solución sea compatible con las definiciones aquí descritas. Si algo contradice esto, frená y consultá.

## 0. Qué es Banca

App de **mercados de predicción entre amigos** sobre la blockchain de **Stellar (testnet)**. Alguien crea un mercado sobre un evento, la gente apuesta, y quien acierta cobra. La plata y las reglas viven en Stellar — nadie custodia el dinero de nadie, el pago es automático.

Contexto: deadline **viernes 2026-05-29 19:00**.

**Ideathon Stellar x Puna Tech** (reglamento leído). Es "propuesta SIN código". Entregables OBLIGATORIOS (sin uno NO se califica): deck de slides, video pitch ≤5 min, validación de mercado, nombre + logo. El **MVP (código) es BONUS**, no obligatorio. Pesos: Integración con Stellar **20%**, Problema/solución 15%, Modelo de negocio 15%, Validación de mercado 15%, Impacto/escala 15%, Innovación 10%, Pitch 10%. Premios: 300/200/100 USD, pago en USDC. Jurado: BAF.
> Implicancia: el código sirve como bonus del Ideathon y para el track técnico, pero los 4 obligatorios (deck/video/validación/logo) son la condición de calificación — no descuidarlos.

**Criterio clave (20%)**: la blockchain debe ser **NECESARIA, no decorativa**. Por eso el diseño pone en Stellar exactamente lo que no se puede confiar a un tercero (custodia del pozo, apuestas, resultado, payout) — esa es la tesis "la confianza la pone el sistema, no el organizador".

### Regla de marca INNEGOCIABLE — esconder la cripto

La UI **nunca** dice: wallet, blockchain, transacción, cripto, token, shares, gas, hash, Stellar.
La UI **siempre** usa: "mercado/predicción", "boleto" (públicos), "pozo" y "tu parte" (privados), "bancá a tu equipo", "cobrar", "armá un mercado", "votá el resultado", "tu saldo". Los precios se muestran como **probabilidad** ("Argentina 66%"), no como decimales.

## 1. Stack

- **Framework**: Next.js 16 (App Router). ATENCIÓN: tiene breaking changes vs versiones previas — leer `node_modules/next/dist/docs/` antes de escribir routes/server actions (lo exige AGENTS.md).
- **UI**: React 19 + Tailwind CSS 4 (CSS variables nativas, sin PostCSS).
- **Package manager**: pnpm (NUNCA npm/yarn).
- **DB**: PostgreSQL local llamada `banca` (ya corriendo) + **Drizzle ORM** (schema en TS, migraciones con `drizzle-kit push`). Driver `pg`.
- **Auth**: **better-auth** — usuario + contraseña, SIN verificación de email (MVP). Gestiona las tablas de auth (user/session/account) y sus migraciones.
- **Blockchain**: Stellar testnet + contratos Soroban (Rust).
- **Token**: mock USDC propio desplegado en testnet (controlamos el mint para sembrar saldos de demo).
- **Custodia**: claves custodiales server-side (cifradas). El usuario nunca ve una wallet.

### Auth e identidad (better-auth)
- **Login**: usuario + contraseña. `requireEmailVerification: false` (MVP, sin verificación). Sin OAuth por ahora.
- **better-auth es dueño del esquema de auth**: genera/migra `user`, `session`, `account`, `verification` con su CLI. NO los manejamos a mano. El `users` hand-written en `schema.sql` es provisional y se RECONCILIA con el modelo de better-auth.
- **Extensión del modelo user** (vía `additionalFields` de better-auth): `handle`, `stellar_pubkey`, `stellar_secret_enc`, `role['user'|'oracle']`.
- **Keypair custodial al signup**: en un hook post-creación de usuario (`databaseHooks.user.create`), `lib/stellar/keys` genera el keypair Stellar, cifra el secret y lo guarda en el user. El usuario nunca ve esto.
- **FKs del dominio**: `markets.creator_id`, `bets.user_id`, etc. referencian el `id` del user de better-auth (tipo según better-auth, por defecto `text`). Ajustar los FK del schema a ese tipo al integrar.

## 2. Arquitectura on-chain — 3 contratos Soroban

Separación: custodia ≠ reglas. El Vault protege la solvencia; los Markets protegen las reglas.

```
            VAULT  (ledger único de fondos: custodia USDC, mintea/quema shares, paga claims)
            ▲                          ▲
   llama    │                          │  llama
       PUBLIC MARKET (AMM)        PRIVATE MARKET (pari-mutuel)
```

### Vault (custodia compartida)
- Estado: `admin`, `token`, `treasury`, `authorized_markets`, `locked` por mercado, `shares` por (mercado, opción, dueño), `total_supply` por (mercado, opción).
- Funciones: `init`, `register_market`, `lock_and_mint`, `burn_and_pay`, `collect_fee`.
- Solo acepta llamadas de `authorized_markets`. NUNCA decide precio ni ganador.

### Public Market (mercado de predicción con AMM)
- Modelo Polymarket. Producto constante. **Binario primero**, multi-opción después.
- Sin venta secundaria (los boletos no se devuelven antes del cierre). Fee 1% **tomado antes de mintear** (mint sobre net, nunca gross).
- Funciones: `create`, `get_price` (view), `get_quote` (view), `buy_option`, `close`, `submit_result` (solo resolver), `claim`, `claim_lp`.
- **Single-LP**: el creador es el único proveedor de liquidez (100% del pool). Sin multi-LP, sin LP_share_percentage. El creador ve un cartel de riesgo al crear.
- **Reservas virtuales**: las reservas del pool `R_i` viven como enteros en el estado del Market, no como shares reales en el Vault. Solo las shares de usuarios/LP son saldos reales. Reduce cross-contract calls; la solvencia se mantiene exacta.

### Private Market (la vaquita — pari-mutuel)
- Sin AMM, sin shares, sin LP. El creador NO siembra plata; todos apuestan al lado que creen.
- Payout: `mi_payout = (mi_apuesta_a_W / total_apostado_a_W) * pot_total`.
- Funciones: `create`, `place_bet`, `close`, `submit_result`, `claim`.

### Resolución — quién elige el ganador y cuándo (por tipo)

**El tipo de mercado y su regla de resolución se eligen al CREAR y son visibles para todos ANTES de que nadie apueste. No se pueden cambiar después de la primera apuesta.** El reparto del pozo, una vez fijado el resultado, es idéntico para los dos tipos.

**Ciclo de vida (CUÁNDO):**
```
created → active → closed → resolving → resolved → (claims abiertos)
  crear    apuestas  llega    se juntan    el resolver fija     ganadores
           abiertas  close_at  los votos    el resultado on-chain  cobran
```
- `active → closed`: automático al llegar `close_at` (o el creador llama `close()`). Desde acá NO se acepta más apuesta/compra.
- `closed → resolving`: se habilita la votación del resultado.
- `resolving → resolved`: cuando se alcanza la regla del tipo (ver abajo), la plataforma (resolver) firma `submit_result(W)` on-chain. Eso fija el ganador y abre los claims.

**QUIÉN vota y con qué regla (la única diferencia entre los dos tipos):**

| | PRIVADO (cerrado / la vaquita) | PÚBLICO (abierto / AMM) |
|---|---|---|
| Habilitados a votar | los que apostaron + el creador | usuarios con rol **ORÁCULO** + el creador |
| Apostadores comunes votan? | sí | **no** |
| Regla | umbral de aceptación (`resolution_threshold`, default **70%**): el resultado queda firme cuando ≥ umbral de los votos coinciden en la misma opción | mayoría simple / **N votos coincidentes** entre los habilitados |
| `resolution_mode` | `consensus` | `oracle` |
| Confianza | buena fe intra-grupo | el rol oráculo ES la verificación |

- **Oráculo** = atributo del usuario otorgado por la plataforma (en MVP se setea a mano, `users.role = 'oracle'`). Un oráculo puede votar en CUALQUIER mercado público, sin asignación previa.
- **El creador siempre puede votar** en su mercado (en ambos tipos).

**CÓMO (flujo off-chain → on-chain):**
1. Cada voto se registra en Postgres (`resolution_votes`, un voto por persona por mercado).
2. Un tally (server action / job) cuenta los votos según la regla del tipo.
3. Al alcanzar el umbral/mayoría → la plataforma (la `resolver_address` registrada al crear) firma `submit_result(W)` en el contrato.
4. El contrato **no conoce la regla de votación** — solo confía en el resolver para el resultado final. Defendible en el pitch: "v1 mueve el voto on-chain con Soroban storage".

**Si NO se alcanza la regla**: el mercado queda en `resolving` (pendiente), no se fija resultado, no se paga. MVP lo deja pendiente; disputa / re-votación / override del creador = roadmap. (No tenemos estado `DISPUTED` en el MVP.)

## 3. Invariantes de seguridad (CRÍTICO — van como assert en el contrato + tests)

### Invariante maestro (testear tras CADA operación, vale en toda fase)
```
usdc_in == locked + treasury + payouts      (conservación: ni se crea ni se destruye plata)
locked >= 0 ; todo saldo de shares >= 0
```

### Invariantes por fase (la "==" simple NO vale post-resolución)
```
ACTIVE:    locked == total_supply[i]  para TODA opción i
           (total_supply[i] = shares_de_usuarios[i] + reserva_pool_R_i)
RESOLVED:  locked == Σ winning_shares pendientes (usuarios + pool); las perdedoras dejan de importar
```
> Razón del faseo: al resolver, nadie quema las shares perdedoras (valen 0), así que su `total_supply` queda congelado mientras `locked` baja con cada claim. Chequear la "== para cada opción" post-resolución hace PANIC.

### Invariantes de operación / autorización
```
buy:    mint == gross - fee ; outcome_out redondea HACIA ABAJO (R_final hacia arriba/ceil)
claim:  quemar ANTES de pagar ; paga 1 USDC por winning share
fee:    treasury solo crece, nunca entra a locked
authz:  solo authorized_markets llaman mint/burn/pay ; solo resolver llama submit_result
estado: claim solo si RESOLVED ; mint PROHIBIDO si status != ACTIVE
doble-claim: imposible (al quemar, el saldo queda en 0)
```

### Restricción de retiro
Durante ACTIVE no sale NADA del colateral (sin venta secundaria, sin retiro de liquidez). El colateral solo sale por `claim` (post-RESOLVED) o `refund` (solo durante FUNDING; no hay cancel después de ACTIVE). Consecuencia: `locked` es **monótono** — solo crece en ACTIVE, solo decrece en RESOLVED. Elimina toda una clase de bugs de reentrancy.

## 4. Matemática y cálculos (cómo se calcula CADA operación)

### 4.0 Unidades y redondeo (base de todo)
- 1 USDC = 10.000.000 unidades (7 decimales en Stellar). **Todo es entero, sin floats.**
- 1 share = misma unidad que el USDC → 1 winning share paga exactamente 1 USDC (en unidades, 1:1).
- **Dirección de redondeo** (regla: nunca a favor del usuario si crea deuda):
  - `outcome_out` (shares al usuario) → **floor**
  - `R_final` (reserva que queda en el pool) → **ceil**
  - `payout` (pari-mutuel) → **floor** (el dust queda en el contrato)
  - `fee` → floor; lo único innegociable es `mint == net == gross - fee`.

### 4.1 Cálculo del fee (público, fee_bps = 100 = 1%)
```
fee = floor(gross * fee_bps / 10000)
net = gross - fee
treasury += fee        # NO entra a locked
# se mintea sobre net, NUNCA sobre gross
```

### 4.2 PÚBLICO — compra binaria, paso a paso
Estado del mercado: `R_YES`, `R_NO`, y `k` (producto constante, fijado al crear = liquidez_inicial²).
Usuario compra YES con `gross`:
```
1. fee/net          : fee = floor(gross*100/10000) ; net = gross - fee ; treasury += fee
2. lock_and_mint    : locked += net ; se mintean net shares de CADA opción:
                      R_YES += net ; R_NO += net          (mantiene "1 USDC = 1 share de cada opción")
3. AMM (preservar k): R_NO no se toca (es la opción NO comprada). Se retira de YES:
                      R_YES_final = ceil(k / R_NO)        # k = el de SIEMPRE (constante del mercado)
                      outcome_out = R_YES_actual - R_YES_final     # = (R_YES_previo + net) - R_YES_final
4. entrega          : R_YES = R_YES_final ; usuario recibe outcome_out shares YES
                      (las otras net-outcome_out shares YES + las net shares NO quedan en el pool)
```
Comprar NO es simétrico (se retira de R_NO usando `ceil(k / R_YES)`).
Invariante tras el paso: `R_YES * R_NO == k` (vuelve a la curva). Comprar YES sube el precio de YES.

### 4.3 PÚBLICO — precio / probabilidad mostrada
```
Binario:    price_YES = R_NO / (R_YES + R_NO)          # NO sobre el total
            pct_YES   = round(price_YES * 100)          # lo que ve el usuario: "Argentina 66%"
Entero UI:  price_YES_x10000 = R_NO * 10000 / (R_YES + R_NO)
```

### 4.4 PÚBLICO — quote / preview (sin ejecutar, para el panel de compra)
`get_quote(opción, gross)` corre los pasos 4.1–4.3 SIN mutar estado y devuelve:
```
boletos        = outcome_out
cobro_si_ganás = outcome_out          # cada winning share = 1 USDC
```
UI: "Con $gross recibís ~boletos boletos · si ganás cobrás ~boletos USDC".

### 4.5 PÚBLICO — claim ganador
Mercado RESOLVED con `winning_option = W`. Usuario tiene `s` shares de W:
```
quemar s shares de W (su saldo → 0)     # quemar ANTES de pagar
pagar  s unidades USDC ; locked -= s
```
Doble-claim imposible (al quemar, el saldo queda en 0).

### 4.6 PÚBLICO — claim del LP (creador, único LP)
Al resolver, el pool tiene `R_W` winning shares (la reserva de la opción ganadora):
```
payout_LP = R_W
quemar R_W del pool ; pagar R_W ; locked -= R_W
```
Cierre exacto: `Σ user_winning + R_W == total_supply[W] == locked` → tras todos los claims, `locked == 0`.

### 4.7 PÚBLICO — multi-opción (Capa 3; para binario NO se necesita)
Generalización: `R1*R2*...*Rn = k`. Para evitar overflow al calcular `k`, cálculo secuencial por ratios (idéntico):
```
R_final = R_inicial × ∏(R_otra_inicial / R_otra_nueva)
# integer-safe: multiplicar y DESPUÉS dividir en cada paso; R_final con ceil al final
```
> Alcance: con binario + 3 opciones y reservas modestas, `k` directo en i128 NO hace overflow (3 opciones a 10⁹ = 10²⁷ << 10³⁸). El secuencial recién importa con 5+ opciones / reservas gigantes.

### 4.8 PÚBLICO — barreras anti-ballena (desde Capa 1)
```
A. net <= R_comprada / 5             # tope de orden: una compra no mueve más del ~20%
B. R_final >= MINIMUM_RESERVE (1 USDC)  # la clave; patrón MINIMUM_LIQUIDITY de Uniswap
C. outcome_out < R_nueva             # nunca drenar la reserva a 0
```

### 4.9 PRIVADO — apuesta y pozo (pari-mutuel, sin AMM)
```
place_bet(opción, amount):
   transfiere amount al contrato
   bets[(user, opción)] += amount
   totals[opción]       += amount
   pot_total            += amount
# MVP: sin fee en privados (la vaquita es pura). Fee opcional → roadmap.
```

### 4.10 PRIVADO — payout (reparto proporcional)
Mercado RESOLVED con `winning_option = W`. Usuario apostó `b = bets[(user, W)]`:
```
payout = floor(b * pot_total / totals[W])
```
- Los que apostaron a opciones perdedoras cobran 0.
- `floor` → el dust (`pot_total - Σ payouts`) queda en el contrato (despreciable, residual).
- **Edge case**: si `totals[W] == 0` (nadie le apostó a la ganadora) → no hay ganadores → se reembolsa a todos su apuesta (regla de seguridad para no trabar fondos).

Ejemplo: pozo 100, a W se apostaron 40, yo puse 10 a W → `floor(10*100/40) = 25`.

### 4.11 Refund (privado, solo durante FUNDING)
Si el fondeo no se completa antes del deadline (CANCELLED en FUNDING): cada participante recupera su apuesta exacta `bets[(user, *)]`. `Σ refunds == pot_total` → contrato vuelve a 0. (No hay cancel después de ACTIVE.)

## 5. Caso de prueba canónico del Vault (binario)
```
LP siembra 100 (la liquidez no paga fee).
User compra YES gross 100 → fee 1 (treasury), net 99 → locked 199, supply[YES]=supply[NO]=199.
AMM da ~148 YES (floored), pool retiene 51.
Resuelve YES. User reclama 148 → paga 148, locked 51.
LP reclama los 51 del pool → paga 51, locked 0.
Conservación en cada paso: usdc_in 200 == locked + treasury 1 + payouts.
Resultado: comprador puso 100 cobró 148 (+48); LP puso 100 recuperó 51 (-49, el riesgo del LP).
```

## 6. Modelo de datos (Postgres)

Stellar = verdad de la plata. Postgres = caché + metadata + coordinación.

```
-- user (AUTH): lo maneja better-auth (lib/db/auth-schema.ts). id=text. Campos extra: handle, stellar_pubkey, stellar_secret_enc, role
markets(id, on_chain_id, contract_address, kind['public'|'private'], creator_id→text, title, description,
        status['created'|'active'|'closed'|'resolving'|'resolved'], close_at, resolver_address,
        winning_option_id, created_at;  public: initial_liquidity, fee_bps;  private: resolution_mode, resolution_threshold)
market_options(id, market_id, onchain_key, label, order_index)
trades(id, market_id, user_id, option_id, gross, net, fee, shares_received, price_at_trade, tx_hash, created_at)  -- PUBLIC
positions(id, market_id, user_id, option_id, shares, updated_at)  -- caché de saldo on-chain
bets(id, market_id, user_id, option_id, amount, tx_hash, created_at)  -- PRIVATE
resolution_votes(id, market_id, voter_id, option_id, created_at, unique(market_id, voter_id))
claims(id, market_id, user_id, kind['winner'|'lp'], amount, tx_hash, created_at)
```

> **Auth (HECHO)**: better-auth maneja `user`/`session`/`account`/`verification` (Drizzle, `lib/db/auth-schema.ts`). El `user.id` es **text**, y TODAS las FK de usuario del dominio (`creator_id`, `user_id`, `voter_id`) son `text REFERENCES "user"(id)`. El `user` ya trae los campos extra `handle`, `stellar_pubkey`, `stellar_secret_enc`, `role`. Migrado con `drizzle-kit push`. Pendiente: hook post-signup para generar el keypair custodial (necesita `lib/stellar/keys`). Ojo: better-auth deja `email NOT NULL UNIQUE` aunque uses username → el signup debe proveer email (o auto-generar `{usuario}@banca.local`).

### Qué vive dónde
- **Stellar**: saldo del pozo, apuestas/compras, resultado final, payouts. Lo que necesita garantía criptográfica.
- **Postgres**: perfiles, rol oráculo, títulos/labels, votos de resolución (coordinación), cachés (positions/trades/tx) para el feed rápido. Resolver = address registrada al crear; la plataforma firma `submit_result` según el consenso off-chain en Postgres.

## 7. Folder map

```
app/                      # rutas y layouts (leer docs de Next 16 antes de tocar)
  (public)/page.tsx       # landing del pitch
  markets/page.tsx        # feed
  markets/new/page.tsx    # crear
  markets/[id]/page.tsx   # detalle + apostar
  markets/[id]/vote/page.tsx
  me/page.tsx             # mis apuestas/cobros
  globals.css             # tokens del design system
# NOTA: el proyecto es root-level (app/ en la raíz, NO src/). Alias @/* → ./*
features/markets/         # components (MarketCard, BuyPanel, BetPanel, VotePanel, CreateForm), actions, queries, logic (amm, tally, payout), types
features/identity/        # usuario, custodial keys, rol oráculo
lib/
  auth.ts                 # config de better-auth (drizzleAdapter, username, sin verificación)
  db/
    client.ts             # Pool pg + instancia Drizzle (db) con todo el schema
    schema.ts             # schema de DOMINIO en Drizzle (markets, bets, trades, ...)
    auth-schema.ts        # schema de AUTH en Drizzle (generado por better-auth CLI)
    migrations/           # drizzle-kit
  stellar/                # FRONTERA DURA — nadie afuera importa el SDK: client, vault, publicMarket, privateMarket, keys
  money/                  # stroops/units <-> display
design-system/            # tokens.css, primitives/
drizzle.config.ts         # config de drizzle-kit
contracts/
  vault/  public-market/  private-market/    # cada uno: src/lib.rs, Cargo.toml
```

## 8. Invariantes técnicos (no negociables)

- **Frontera Stellar**: nada fuera de `src/lib/stellar/` importa el SDK de Stellar. El resto habla de "pozo/boleto/tu parte".
- **Vocabulario**: ver regla de marca §0. Si un texto de UI tiene jerga cripto, está mal.
- **Enteros**: toda la plata en unidades mínimas (USDC = 7 decimales en Stellar). Sin floats en el contrato. Redondeo defensivo (nunca a favor del usuario si crea deuda).
- **Single source of truth de la plata**: el contrato. Postgres es caché; ante duda, link al explorer (oculto como "ver comprobante").

## 9. Decisiones clave (log)

- **Ruta A** (3 contratos, público AMM + privado pari-mutuel) elegida sobre la recomendación B. Mitigación: construir en capas, cada checkpoint demostrable; compuerta de aborto al mediodía del viernes si el público binario no está verde.
- **Single-LP** (creador) + **reservas virtuales** en el Market: aceptadas para ahorrar tiempo sin perder solvencia.
- **Sin cancel** después de ACTIVE.
- **Token mock USDC** propio en testnet (no faucet externo, no XLM nativo).
- **Postgres `banca`** existente (no docker).
- **Toolchain**: rustup (no Rust de Homebrew) + stellar-cli + target wasm32.
- **Modelo freemium**: públicos cobran 1% (a treasury), privados gratis (motor de adopción). Ver §11.

## 10. Plan por capas (con compuertas de tiempo)

```
Capa 0  Cimientos          → checkpoint: server action invoca el contract y recibe respuesta tipada
Capa 1  Vault + Public BINARIO → checkpoint: mercado SÍ/NO completo on-chain  (= Ruta B, piso impresionante)
Capa 2  Private pari-mutuel    → checkpoint: vaquita completa
Capa 3  Public MULTI-opción    → checkpoint: mercado de 3 opciones (= Ruta A completa)
Capa 4  Pulido + deploy + demo
```
Regla: no se empieza una capa sin la anterior verde. Si el reloj aprieta, se para en el último checkpoint verde y se demuestra ESO.

## 11. Modelo de ingresos (freemium)

**La plataforma gana por FACILITAR, nunca por custodiar.** El que acumula ingresos es la **treasury** (address de la plataforma), NO "el emisor del token": emitir el mock USDC no genera ingresos por sí solo (ese sería el modelo de float/reservas de un emisor de stablecoin tipo Circle — no es el nuestro).

| Tipo de mercado | Fee | Va a |
|---|---|---|
| **PÚBLICO** (AMM) | **1%** por compra (`fee_bps=100`), tomado ANTES de mintear (§4.1) | treasury |
| **PRIVADO** (vaquita) | **0%** — gratis (decisión A) | — |

- **Públicos = monetización**: ingreso recurrente, proporcional al volumen de trading, sin riesgo de contraparte.
- **Privados = motor de adopción**: gratis a propósito. La vaquita entre amigos es el loop de viralidad (amigos traen amigos). La plataforma NO gana acá, y está bien.
- **Por qué cierra en Stellar (criterio 20%)**: el costo de transacción ínfimo de Stellar hace **rentable facilitar micro-mercados** que en otras cadenas serían inviables por gas. El modelo de fees chicos sobre alto volumen SOLO funciona en una cadena barata → justifica "por qué Stellar y no otra".
- **Treasury**: en MVP es la address admin de la plataforma; en v1 sería multisig/DAO. On-chain y auditable.
- **Roadmap de ingresos**: oráculos premium, mercados destacados, white-label para comunidades, yield sobre el float de la treasury.
