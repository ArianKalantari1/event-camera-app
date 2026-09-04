'use server';

import { redirect } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@/lib/db';
import { loginTokens, organizerUsers } from '@/lib/db/schema';
import { clientKey } from '@/lib/auth';
import { checkRateLimit, type RateLimitRule } from '@/lib/domain/rate-limit';
import { hashSessionToken, mintSessionToken, LOGIN_TOKEN_TTL_MS } from '@/lib/domain/session';
import { env } from '@/lib/env';
import { mailer } from '@/lib/mail';
import { endOrganizerSession, normalizeEmail } from '@/lib/organizer';
import { recordAudit } from '@/lib/events';
import { absolute } from '@/lib/routes';

export interface LoginResult {
  sent?: boolean;
  error?: string;
}

const BY_ADDRESS: RateLimitRule = { limit: 5, windowMs: 15 * 60 * 1000 };
const BY_CLIENT: RateLimitRule = { limit: 15, windowMs: 15 * 60 * 1000 };

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * Sends a sign-in link.
 *
 * The response never depends on whether the address has an account. Saying "no
 * such organizer" turns this form into a way to find out who runs which events,
 * so an unknown address gets the same confirmation and no email.
 *
 * Limited on both the address and the client, because either alone is trivially
 * worked around: one address from many clients is mailbombing, many addresses
 * from one client is enumeration.
 */
export async function requestSignInLink(
  _prev: LoginResult | null,
  formData: FormData,
): Promise<LoginResult> {
  const email = normalizeEmail(String(formData.get('email') ?? ''));
  if (!EMAIL.test(email)) return { error: 'Enter an email address.' };

  const client = await clientKey('login');
  if (!checkRateLimit(client, BY_CLIENT).allowed || !checkRateLimit(`login:${email}`, BY_ADDRESS).allowed) {
    // Deliberately the same message as success. A distinct "too many attempts"
    // still tells an enumerator that this address is worth attacking.
    return { sent: true };
  }

  const [user] = await db()
    .select()
    .from(organizerUsers)
    .where(eq(organizerUsers.email, email))
    .limit(1);

  if (user) {
    const token = mintSessionToken();
    await db().insert(loginTokens).values({
      email,
      tokenHash: hashSessionToken(token, env().SESSION_SECRET),
      expiresAt: new Date(Date.now() + LOGIN_TOKEN_TTL_MS),
    });

    const link = absolute(`/organizer/verify?token=${encodeURIComponent(token)}`);
    await mailer().send({
      to: email,
      subject: 'Your sign-in link',
      text: [
        'Use this link to sign in to the event hub. It works once and expires in 15 minutes.',
        '',
        link,
        '',
        'If you did not ask for this, you can ignore it — nobody can sign in without the link.',
      ].join('\n'),
    });

    await recordAudit({ actorType: 'organizer', actorId: user.id, action: 'auth.link_sent' });
  }

  return { sent: true };
}

export async function signOut(): Promise<void> {
  await endOrganizerSession();
  redirect('/organizer/login');
}
