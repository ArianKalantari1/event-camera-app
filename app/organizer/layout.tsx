import Link from 'next/link';
import { currentOrganizer } from '@/lib/organizer';
import { signOut } from './actions';

/**
 * Chrome for every organizer page. The pages themselves each re-check access —
 * a layout is not an authorization boundary, and treating it as one is how a
 * route ends up reachable because someone added it without reading this file.
 */
export default async function OrganizerLayout({ children }: { children: React.ReactNode }) {
  const user = await currentOrganizer();

  return (
    <>
      {user ? (
        <div
          style={{
            borderBottom: '1px solid var(--line)',
            background: 'var(--surface)',
          }}
        >
          <div
            style={{
              maxWidth: 900,
              margin: '0 auto',
              padding: '10px 16px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              gap: 12,
              fontSize: 14,
            }}
          >
            <Link href="/organizer" style={{ fontWeight: 600, textDecoration: 'none' }}>
              Your events
            </Link>
            <form action={signOut} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <span className="muted">{user.email}</span>
              <button
                type="submit"
                style={{
                  background: 'none',
                  border: 0,
                  padding: 0,
                  font: 'inherit',
                  color: 'var(--accent)',
                  cursor: 'pointer',
                }}
              >
                Sign out
              </button>
            </form>
          </div>
        </div>
      ) : null}
      {children}
    </>
  );
}
