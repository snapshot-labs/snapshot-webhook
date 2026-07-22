import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  text,
  uniqueIndex
} from 'drizzle-orm/pg-core';

export const DEFAULT_EVENTS = ['proposal/start'];

export const metadatas = pgTable('_metadatas', {
  id: text().primaryKey(),
  value: text().notNull()
});

export const events = pgTable(
  'events',
  {
    id: text().notNull(),
    event: text().notNull(),
    space: text().notNull(),
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
    id: integer().primaryKey().generatedAlwaysAsIdentity(),
    owner: text().notNull(),
    url: text().notNull(),
    method: text().notNull().default('POST'),
    space: text().notNull(),
    active: boolean().notNull().default(true),
    created: bigint({ mode: 'number' })
      .notNull()
      .default(sql`(extract(epoch from now()))::bigint`)
  },
  table => [
    uniqueIndex('subscribers_url_space_idx').on(table.url, table.space),
    index('subscribers_owner_idx').on(table.owner),
    index('subscribers_space_idx')
      .on(table.space)
      .where(sql`${table.active}`),
    index('subscribers_created_idx').on(table.created)
  ]
);

// Discord provider
export const subscriptions = pgTable(
  'subscriptions',
  {
    guild: text().notNull(),
    channel: text().notNull(),
    space: text().notNull(),
    mention: text().notNull(),
    events: jsonb().$type<string[]>().notNull().default(DEFAULT_EVENTS),
    created: bigint({ mode: 'number' }).notNull(),
    updated: bigint({ mode: 'number' }).notNull()
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
    address: text().primaryKey(),
    status: boolean().notNull()
  },
  table => [
    // ponytail: only serves the startup disabled-list query; delete if scanning is fine
    index('xmtp_disabled_idx')
      .on(table.address)
      .where(sql`not ${table.status}`)
  ]
);
