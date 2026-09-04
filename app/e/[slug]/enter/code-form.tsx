'use client';

import { useActionState, useEffect, useRef } from 'react';
import { useFormStatus } from 'react-dom';
import { enterEvent, type GateResult } from './actions';

function Submit() {
  const { pending } = useFormStatus();
  return (
    <button className="btn" type="submit" disabled={pending}>
      {pending ? 'Checking…' : 'Enter'}
    </button>
  );
}

export function CodeForm({ slug }: { slug: string }) {
  const [result, action] = useActionState<GateResult | null, FormData>(enterEvent, null);
  const input = useRef<HTMLInputElement | null>(null);

  /*
   * After a wrong code, focus is on the submit button and autoFocus does not
   * fire again. Attempts here are limited, so put the person back in the field
   * with the error already associated with it rather than making them navigate
   * up to find out what went wrong.
   */
  useEffect(() => {
    if (result?.error) {
      input.current?.focus();
      input.current?.select();
    }
  }, [result]);

  return (
    <form action={action} className="stack" style={{ gap: 12 }}>
      <input type="hidden" name="slug" value={slug} />
      <label className="stack" style={{ gap: 6 }}>
        <span className="label">Event code</span>
        <input
          ref={input}
          name="code"
          /*
           * text, not a numeric mode: the code alphabet is alphanumeric, and a
           * numeric keypad would make most codes untypeable on a phone.
           */
          type="text"
          inputMode="text"
          autoCapitalize="characters"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          autoFocus
          maxLength={16}
          required
          aria-describedby={result?.error ? 'code-error' : undefined}
          aria-invalid={result?.error ? true : undefined}
          style={{
            font: 'inherit',
            fontSize: 22,
            letterSpacing: '0.28em',
            textTransform: 'uppercase',
            textAlign: 'center',
            padding: '14px 12px',
            minHeight: 56,
            borderRadius: 10,
            border: '1px solid var(--line)',
            background: 'var(--surface)',
            color: 'var(--ink)',
          }}
        />
      </label>

      {result?.error ? (
        <p id="code-error" role="alert" style={{ color: 'var(--bad)', margin: 0, fontSize: 14 }}>
          {result.error}
        </p>
      ) : null}

      <Submit />
    </form>
  );
}
