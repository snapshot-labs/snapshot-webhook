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

export const LAST_MCI_ID = 'last_mci';

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
    index('subscribers_space_idx')
      .on(table.space)
      .where(sql`${table.active}`)
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
  table => [primaryKey({ columns: [table.guild, table.channel, table.space] })]
);

// XMTP provider
export const xmtp = pgTable(
  'xmtp',
  {
    address: text().primaryKey(),
    status: boolean().notNull()
  },
  table => [index('xmtp_status_idx').on(table.status)]
);
