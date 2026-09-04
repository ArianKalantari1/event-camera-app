import { env } from '@/lib/env';

/**
 * Mail, behind an interface.
 *
 * The plan keeps provider choices reversible, and email providers are the ones
 * teams change most often. Nothing outside this folder knows how a message is
 * sent, and adding a provider is one file.
 *
 * The console driver is not a stub for testing — it is how the product runs in
 * development and how a demo runs before anyone has signed up for a mail
 * service. It prints the link to the server log, which is exactly enough.
 *
 * Deliberately not marked `server-only`. That marker throws in any plain Node
 * context, not just in a client bundle, and the retention job sends mail from a
 * scheduled CLI run. `server-only` belongs on the Next-specific modules that
 * read cookies and headers, not on shared infrastructure a job also uses.
 */

export interface Message {
  to: string;
  subject: string;
  text: string;
}

export interface Mailer {
  readonly name: string;
  send(message: Message): Promise<void>;
}

class ConsoleMailer implements Mailer {
  readonly name = 'console';
  async send(message: Message): Promise<void> {
    console.log(
      [
        '',
        '─'.repeat(72),
        `  to:      ${message.to}`,
        `  subject: ${message.subject}`,
        '',
        message.text.split('\n').map((l) => `  ${l}`).join('\n'),
        '─'.repeat(72),
        '',
      ].join('\n'),
    );
  }
}

/**
 * One concrete provider, over plain fetch so it adds no dependency. It is an
 * implementation of the interface above, not a commitment: swapping to Postmark,
 * SES or SMTP means writing a sibling class.
 */
class ResendMailer implements Mailer {
  readonly name = 'resend';
  constructor(
    private readonly apiKey: string,
    private readonly from: string,
  ) {}

  async send(message: Message): Promise<void> {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${this.apiKey}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        from: this.from,
        to: [message.to],
        subject: message.subject,
        text: message.text,
      }),
    });

    if (!res.ok) {
      // The body can contain the recipient address; keep it out of the log.
      throw new Error(`mail provider rejected the message (${res.status})`);
    }
  }
}

let cached: Mailer | null = null;

export function mailer(): Mailer {
  if (cached) return cached;
  const e = env();
  cached =
    e.MAIL_DRIVER === 'resend'
      ? new ResendMailer(e.MAIL_API_KEY!, e.MAIL_FROM)
      : new ConsoleMailer();
  return cached;
}

/** Test helper. */
export function resetMailerCache(): void {
  cached = null;
}
