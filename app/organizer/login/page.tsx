import { redirect } from 'next/navigation';
import { currentOrganizer } from '@/lib/organizer';
import { LoginForm } from './form';

interface Props {
  searchParams: Promise<{ expired?: string }>;
}

export const metadata = { title: 'Organizer sign in' };

export default async function LoginPage({ searchParams }: Props) {
  if (await currentOrganizer()) redirect('/organizer');

  const { expired } = await searchParams;

  return (
    <main className="page stack">
      <p className="label">Organizers</p>
      <h1>Sign in</h1>

      {expired ? (
        <div
          className="card"
          role="status"
          style={{ borderLeft: '3px solid var(--warn)', borderRadius: '0 10px 10px 0' }}
        >
          <p style={{ margin: 0, fontSize: 14 }}>
            That sign-in link has already been used or has expired. Links work once and last 15
            minutes — ask for a new one below.
          </p>
        </div>
      ) : null}

      <p className="muted">
        We will email you a link. There is no password to forget and nothing to install.
      </p>
      <LoginForm />
    </main>
  );
}
