/**
 * Access scopes.
 *
 * Pure, and deliberately in the domain layer rather than beside the queries:
 * "who may see this" is the rule most worth testing in isolation, and a module
 * that drags in a database connection cannot be.
 */

export type Visibility = 'public' | 'attendee' | 'organizer';
export type ViewerLevel = 'public' | 'attendee' | 'organizer';

/** Scopes a viewer at this level may read. Strictly widening as the level rises. */
export function scopesFor(level: ViewerLevel): Visibility[] {
  switch (level) {
    case 'organizer':
      return ['public', 'attendee', 'organizer'];
    case 'attendee':
      return ['public', 'attendee'];
    default:
      return ['public'];
  }
}
