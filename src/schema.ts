import { sql } from 'drizzle-orm';
import {
  bigint,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  serial,
  text,
  uniqueIndex,
  varchar
} from 'drizzle-orm/pg-core';

export const metadatas = pgTable('_metadatas', {
  id: varchar({ length: 20 }).primaryKey(),
  value: varchar({ length: 128 }).notNull()
});

export const events = pgTable(
  'events',
  {
    id: varchar({ length: 256 }).notNull(),
    event: varchar({ length: 64 }).notNull(),
    space: varchar({ length: 256 }).notNull(),
    expire: bigint({ mode: 'number' }).notNull()
  },
  table => [
    primaryKey({ columns: [table.id, table.event] }),
    index('events_space_idx').on(table.space),
    index('events_expire_idx').on(table.expire)
  ]
);

// Webhook provider
export const subscribers = pgTable(
  'subscribers',
  {
    id: serial().primaryKey(),
    owner: varchar({ length: 256 }).notNull(),
    url: text().notNull(),
    method: varchar({ length: 5 }).notNull().default('POST'),
    space: varchar({ length: 256 }).notNull(),
    active: integer().notNull().default(1),
    created: bigint({ mode: 'number' })
      .notNull()
      .default(sql`(extract(epoch from now()))::bigint`)
  },
  table => [
    uniqueIndex('subscribers_url_space_idx').on(table.url, table.space),
    index('subscribers_owner_idx').on(table.owner),
    index('subscribers_space_idx').on(table.space),
    index('subscribers_active_idx').on(table.active),
    index('subscribers_created_idx').on(table.created)
  ]
);

// Discord provider
export const subscriptions = pgTable(
  'subscriptions',
  {
    guild: varchar({ length: 64 }).notNull(),
    channel: varchar({ length: 64 }).notNull(),
    space: varchar({ length: 256 }).notNull(),
    mention: varchar({ length: 64 }).notNull(),
    events: jsonb()
      .$type<string[]>()
      .notNull()
      .default(sql`'["proposal/start"]'::jsonb`),
    created: varchar({ length: 64 }).notNull(),
    updated: varchar({ length: 64 }).notNull()
  },
  table => [
    primaryKey({ columns: [table.guild, table.channel, table.space] }),
    index('subscriptions_created_idx').on(table.created),
    index('subscriptions_updated_idx').on(table.updated)
  ]
);

// XMTP provider
export const xmtp = pgTable(
  'xmtp',
  {
    address: varchar({ length: 256 }).primaryKey(),
    status: integer().notNull()
  },
  table => [index('xmtp_status_idx').on(table.status)]
);
