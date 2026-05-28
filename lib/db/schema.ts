import {
  pgTable,
  pgEnum,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  index,
  unique,
  type AnyPgColumn,
} from "drizzle-orm/pg-core";
import { user } from "./auth-schema";

// Schema de DOMINIO. Las tablas de auth viven en auth-schema.ts (better-auth).
// El rol de usuario ('user'|'oracle') vive en user.role (text), no acá.
// Montos en unidades mínimas (USDC 7 decimales).

export const marketKind = pgEnum("market_kind", ["public", "private"]);
export const marketStatus = pgEnum("market_status", [
  "created",
  "active",
  "closed",
  "resolving",
  "resolved",
]);
export const resolutionMode = pgEnum("resolution_mode", ["consensus", "creator", "oracle"]);
export const claimKind = pgEnum("claim_kind", ["winner", "lp"]);

export const markets = pgTable(
  "markets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    onChainId: text("on_chain_id").unique(),
    contractAddress: text("contract_address"),
    kind: marketKind("kind").notNull(),
    creatorId: text("creator_id")
      .notNull()
      .references(() => user.id),
    title: text("title").notNull(),
    description: text("description"),
    status: marketStatus("status").notNull().default("created"),
    closeAt: timestamp("close_at", { withTimezone: true }).notNull(),
    resolverAddress: text("resolver_address"),
    winningOptionId: uuid("winning_option_id").references((): AnyPgColumn => marketOptions.id),
    // public:
    initialLiquidity: bigint("initial_liquidity", { mode: "number" }),
    feeBps: integer("fee_bps").default(100),
    // private:
    resolutionMode: resolutionMode("resolution_mode"),
    resolutionThreshold: integer("resolution_threshold"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [
    index("idx_markets_status").on(t.status),
    index("idx_markets_kind").on(t.kind),
    index("idx_markets_close").on(t.closeAt),
  ],
);

export const marketOptions = pgTable(
  "market_options",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    onchainKey: text("onchain_key").notNull(),
    label: text("label").notNull(),
    orderIndex: integer("order_index").notNull().default(0),
  },
  (t) => [
    unique("uq_market_option").on(t.marketId, t.onchainKey),
    index("idx_options_market").on(t.marketId),
  ],
);

// PUBLIC: trades + positions (caché de saldo on-chain)
export const trades = pgTable(
  "trades",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    optionId: uuid("option_id")
      .notNull()
      .references(() => marketOptions.id),
    gross: bigint("gross", { mode: "number" }).notNull(),
    net: bigint("net", { mode: "number" }).notNull(),
    fee: bigint("fee", { mode: "number" }).notNull(),
    sharesReceived: bigint("shares_received", { mode: "number" }).notNull(),
    priceAtTrade: integer("price_at_trade"),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_trades_market").on(t.marketId), index("idx_trades_user").on(t.userId)],
);

export const positions = pgTable(
  "positions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    optionId: uuid("option_id")
      .notNull()
      .references(() => marketOptions.id),
    shares: bigint("shares", { mode: "number" }).notNull().default(0),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("uq_position").on(t.marketId, t.userId, t.optionId)],
);

// PRIVATE: bets (pari-mutuel)
export const bets = pgTable(
  "bets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    optionId: uuid("option_id")
      .notNull()
      .references(() => marketOptions.id),
    amount: bigint("amount", { mode: "number" }).notNull(),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_bets_market").on(t.marketId), index("idx_bets_user").on(t.userId)],
);

// Resolution votes (coordinación off-chain)
export const resolutionVotes = pgTable(
  "resolution_votes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    voterId: text("voter_id")
      .notNull()
      .references(() => user.id),
    optionId: uuid("option_id")
      .notNull()
      .references(() => marketOptions.id),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [unique("uq_vote").on(t.marketId, t.voterId)],
);

// Claims (caché de cobros on-chain)
export const claims = pgTable(
  "claims",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    marketId: uuid("market_id")
      .notNull()
      .references(() => markets.id, { onDelete: "cascade" }),
    userId: text("user_id")
      .notNull()
      .references(() => user.id),
    kind: claimKind("kind").notNull(),
    amount: bigint("amount", { mode: "number" }).notNull(),
    txHash: text("tx_hash"),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => [index("idx_claims_market").on(t.marketId), index("idx_claims_user").on(t.userId)],
);
