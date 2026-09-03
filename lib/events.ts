import 'server-only';
import { and, asc, eq, inArray } from 'drizzle-orm';
import { db } from '@/lib/db';
import { auditEvents, eventResources, events, type Event, type EventResource } from '@/lib/db/schema';
import { eventState, type EventState } from '@/lib/domain/event-state';
import { scopesFor, type Visibility } from '@/lib/domain/scopes';

export interface LoadedEvent {
  event: Event;
  state: EventState;
}

export async function findEventBySlug(slug: string, now = new Date()): Promise<LoadedEvent | null> {
  const [row] = await db().select().from(events).where(eq(events.slug, slug)).limit(1);
  if (!row) return null;
  return { event: row, state: eventState(row, now) };
}

/**
 * Resources are filtered by scope in the query, not after it.
 *
 * Fetching everything and hiding some in the template is how private fields end
 * up in a server-rendered payload that a reader can open in view-source.
 */
export async function listResources(
  eventId: string,
  scopes: Visibility[],
): Promise<EventResource[]> {
  if (scopes.length === 0) return [];
  return db()
    .select()
    .from(eventResources)
    .where(and(eq(eventResources.eventId, eventId), inArray(eventResources.visibility, scopes)))
    .orderBy(asc(eventResources.sort), asc(eventResources.createdAt));
}

export { scopesFor };
export type { Visibility };

export async function recordAudit(entry: {
  eventId?: string | null;
  actorType: 'organizer' | 'attendee' | 'system';
  actorId?: string | null;
  action: string;
  target?: string | null;
  meta?: unknown;
}): Promise<void> {
  await db()
    .insert(auditEvents)
    .values({
      eventId: entry.eventId ?? null,
      actorType: entry.actorType,
      actorId: entry.actorId ?? null,
      action: entry.action,
      target: entry.target ?? null,
      meta: (entry.meta ?? null) as never,
    });
}
