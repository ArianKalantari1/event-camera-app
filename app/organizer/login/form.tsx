'use client';

import { useActionState } from 'react';
import { useFormStatus } from 'react-dom';
import { requestSignInLink, type LoginResult } from '../actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Sending…' : 'Email me a link'}
    </button>
  );
}

export function LoginForm() {
  const [result, action] = useActionState<LoginResult | null, FormData>(requestSignInLink, null);

  if (result?.sent) {
    return (
      <div className="card stack" role="status">
        <h2 style={{ margin: 0 }}>Check your email</h2>
        <p className="muted" style={{ margin: 0 }}>
          If that address belongs to an organizer, a sign-in link is on its way. It works once and
          expires in 15 minutes.
        </p>
      </div>
    );
  }

  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Email</span>
        <input
          name="email"
          type="email"
          inputMode="email"
          autoComplete="email"
          autoCapitalize="none"
          autoCorrect="off"
          required
          autoFocus
          aria-describedby={result?.error ? 'login-error' : undefined}
          aria-invalid={result?.error ? true : undefined}
          style={{
            font: 'inherit',
            fontSize: 17,
            padding: '14px 12px',
            minHeight: 52,
            borderRadius: 10,
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            color: 'var(--ink)',
          }}
        />
      </label>
      {result?.error ? (
        <p id="login-error" role="alert" style={{ color: 'var(--bad)', margin: 0, fontSize: 14 }}>
          {result.error}
        </p>
      ) : null}
      <Submit />
    </form>
  );
}
