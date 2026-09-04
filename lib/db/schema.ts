import { sql } from 'drizzle-orm';
import {
  index,
  integer,
  jsonb,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

/**
 * Six tables (docs/mvp-prd.md §6).
 *
 * Two shapes in here are deliberate and load-bearing:
 *
 * 1. `events.lifecycle` stores only what a human decides — draft, published,
 *    archived. Whether an event is currently accepting uploads or showing its
 *    gallery is NOT stored: it is derived from the window columns at request
 *    time (see lib/domain/event-state.ts). A boolean flipped by a scheduled job
 *    is a boolean that is wrong whenever the job is late.
 *
 * 2. Access scope is an explicit column, never inferred from another field.
 *    `event_resources.visibility` and `media_assets.state` decide who may see a
 *    row, and every read path filters on them.
 */

const now = sql`now()`;
const newId = sql`gen_random_uuid()`;

/** Editorial lifecycle. Set by a person; never advanced by a timer. */
export const eventLifecycle = pgEnum('event_lifecycle', ['draft', 'published', 'archived']);

/** Who may see a resource. Checked on every read; never inferred. */
export const resourceVisibility = pgEnum('resource_visibility', [
  'public',
  'attendee',
  'organizer',
]);

export const resourceKind = pgEnum('resource_kind', [
  'action',
  'resource',
  'schedule',
  'note',
]);

/**
 * Media lifecycle.
 *
 * `awaiting_upload` exists because the row is created when the upload URL is
 * signed, before any bytes arrive — a row stuck in this state is an abandoned
 * upload, not a contribution, and never appears anywhere.
 *
 * Only `approved` is ever visible to an attendee.
 */
export const mediaState = pgEnum('media_state', [
  'awaiting_upload',
  'pending',
  'approved',
  'rejected',
  'removed',
]);

export const actorType = pgEnum('actor_type', ['organizer', 'attendee', 'system']);

/**
 * Organization roles.
 *
 * `owner` can change the event and its access; `moderator` can only act on
 * media. An event's moderation queue is often staffed by volunteers on the day,
 * and handing them the ability to rotate the event code or delete the event is
 * not a favour to anybody.
 */
export const orgRole = pgEnum('org_role', ['owner', 'moderator']);

export const organizations = pgTable('organizations', {
  id: uuid('id').primaryKey().default(newId),
  name: text('name').notNull(),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
});

export const organizerUsers = pgTable(
  'organizer_users',
  {
    id: uuid('id').primaryKey().default(newId),
    email: text('email').notNull(),
    name: text('name'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    lastLoginAt: timestamp('last_login_at', { withTimezone: true }),
  },
  // Addresses are stored already lower-cased, so this index is the uniqueness
  // rule rather than merely a lookup: Ari@x and ari@x must not be two accounts.
  (t) => [uniqueIndex('organizer_users_email_key').on(t.email)],
);

export const organizationMembers = pgTable(
  'organization_members',
  {
    id: uuid('id').primaryKey().default(newId),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),
    userId: uuid('user_id')
      .notNull()
      .references(() => organizerUsers.id, { onDelete: 'cascade' }),
    role: orgRole('role').notNull().default('moderator'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('organization_members_org_user_key').on(t.orgId, t.userId),
    index('organization_members_user_idx').on(t.userId),
  ],
);

/**
 * Single-use sign-in links.
 *
 * Only the hash is stored, and `consumedAt` is set by a conditional update, so
 * a link forwarded or captured in a mail log cannot be redeemed twice.
 */
export const loginTokens = pgTable(
  'login_tokens',
  {
    id: uuid('id').primaryKey().default(newId),
    email: text('email').notNull(),
    tokenHash: text('token_hash').notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    consumedAt: timestamp('consumed_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [
    uniqueIndex('login_tokens_token_key').on(t.tokenHash),
    index('login_tokens_email_idx').on(t.email),
  ],
);

export const organizerSessions = pgTable(
  'organizer_sessions',
  {
    id: uuid('id').primaryKey().default(newId),
    userId: uuid('user_id')
      .notNull()
      .references(() => organizerUsers.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().default(now),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [uniqueIndex('organizer_sessions_token_key').on(t.tokenHash)],
);

export const events = pgTable(
  'events',
  {
    id: uuid('id').primaryKey().default(newId),
    orgId: uuid('org_id')
      .notNull()
      .references(() => organizations.id, { onDelete: 'cascade' }),

    /** Appears in the URL and therefore on printed QR posters. */
    slug: text('slug').notNull(),

    title: text('title').notNull(),
    description: text('description'),
    startsAt: timestamp('starts_at', { withTimezone: true }).notNull(),
    endsAt: timestamp('ends_at', { withTimezone: true }).notNull(),
    timezone: text('timezone').notNull().default('UTC'),
    location: text('location'),
    bannerKey: text('banner_key'),
    contactName: text('contact_name'),
    contactEmail: text('contact_email'),

    lifecycle: eventLifecycle('lifecycle').notNull().default('draft'),

    /**
     * Shared event code, stored as `scrypt$<salt>$<hash>`. Rotatable by the
     * organizer. A forwarded code is a known and accepted property of this
     * design — see docs/mvp-prd.md §8.
     */
    codeHash: text('code_hash'),
    codeRotatedAt: timestamp('code_rotated_at', { withTimezone: true }),

    // The four independent windows. Null means "not bounded on this side".
    uploadsOpenAt: timestamp('uploads_open_at', { withTimezone: true }),
    uploadsCloseAt: timestamp('uploads_close_at', { withTimezone: true }),
    galleryOpenAt: timestamp('gallery_open_at', { withTimezone: true }),
    galleryCloseAt: timestamp('gallery_close_at', { withTimezone: true }),
    retentionUntil: timestamp('retention_until', { withTimezone: true }),

    publishedAt: timestamp('published_at', { withTimezone: true }),
    archivedAt: timestamp('archived_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [uniqueIndex('events_slug_key').on(t.slug)],
);

export const eventResources = pgTable(
  'event_resources',
  {
    id: uuid('id').primaryKey().default(newId),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    kind: resourceKind('kind').notNull().default('resource'),
    label: text('label').notNull(),
    detail: text('detail'),
    url: text('url'),
    /** Schedule items carry a time; everything else leaves this null. */
    startsAt: timestamp('starts_at', { withTimezone: true }),
    visibility: resourceVisibility('visibility').notNull().default('attendee'),
    sort: integer('sort').notNull().default(0),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('event_resources_event_sort_idx').on(t.eventId, t.sort)],
);

/**
 * A device that entered the correct event code. Pseudonymous by design: no
 * account, no email, and the profile fields are optional.
 *
 * Only the HMAC of the cookie value is stored, so a database leak does not hand
 * over working sessions.
 */
export const eventSessions = pgTable(
  'event_sessions',
  {
    id: uuid('id').primaryKey().default(newId),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    displayName: text('display_name'),
    team: text('team'),
    linkedinUrl: text('linkedin_url'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    lastSeenAt: timestamp('last_seen_at', { withTimezone: true }).notNull().default(now),
    revokedAt: timestamp('revoked_at', { withTimezone: true }),
  },
  (t) => [
    uniqueIndex('event_sessions_token_key').on(t.tokenHash),
    index('event_sessions_event_idx').on(t.eventId),
  ],
);

export const mediaAssets = pgTable(
  'media_assets',
  {
    id: uuid('id').primaryKey().default(newId),
    eventId: uuid('event_id')
      .notNull()
      .references(() => events.id, { onDelete: 'cascade' }),
    /** Null for organizer-supplied media, which has no attendee session. */
    sessionId: uuid('session_id').references(() => eventSessions.id, { onDelete: 'set null' }),

    storageKey: text('storage_key').notNull(),
    originalFilename: text('original_filename'),
    mime: text('mime').notNull(),
    bytes: integer('bytes'),
    width: integer('width'),
    height: integer('height'),

    state: mediaState('state').notNull().default('awaiting_upload'),
    moderatedBy: text('moderated_by'),
    moderatedAt: timestamp('moderated_at', { withTimezone: true }),
    rejectReason: text('reject_reason'),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }),
  },
  (t) => [
    index('media_assets_event_state_idx').on(t.eventId, t.state, t.createdAt),
    index('media_assets_session_idx').on(t.sessionId),
    uniqueIndex('media_assets_storage_key_key').on(t.storageKey),
  ],
);

export const auditEvents = pgTable(
  'audit_events',
  {
    id: uuid('id').primaryKey().default(newId),
    eventId: uuid('event_id').references(() => events.id, { onDelete: 'cascade' }),
    actorType: actorType('actor_type').notNull(),
    actorId: text('actor_id'),
    action: text('action').notNull(),
    target: text('target'),
    meta: jsonb('meta'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().default(now),
  },
  (t) => [index('audit_events_event_created_idx').on(t.eventId, t.createdAt)],
);

export type Organization = typeof organizations.$inferSelect;
export type Event = typeof events.$inferSelect;
export type NewEvent = typeof events.$inferInsert;
export type EventResource = typeof eventResources.$inferSelect;
export type EventSession = typeof eventSessions.$inferSelect;
export type MediaAsset = typeof mediaAssets.$inferSelect;
export type AuditEvent = typeof auditEvents.$inferSelect;
export type OrganizerUser = typeof organizerUsers.$inferSelect;
export type OrganizationMember = typeof organizationMembers.$inferSelect;
export type OrganizerSession = typeof organizerSessions.$inferSelect;
export type OrgRole = (typeof orgRole.enumValues)[number];
