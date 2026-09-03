import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { env, resetEnvCache } from './env';

const BASE = {
  SESSION_SECRET: 'a-sufficiently-long-secret',
  DATABASE_URL: 'postgres://localhost/test',
  ORGANIZER_CONSOLE_KEY: 'console-key',
};

let saved: NodeJS.ProcessEnv;

beforeEach(() => {
  saved = process.env;
  process.env = { ...BASE } as unknown as NodeJS.ProcessEnv;
  resetEnvCache();
});

afterEach(() => {
  process.env = saved;
  resetEnvCache();
});

describe('env', () => {
  it('applies defaults when optional values are absent', () => {
    const e = env();
    expect(e.APP_URL).toBe('http://localhost:3000');
    expect(e.STORAGE_DRIVER).toBe('local');
    expect(e.S3_FORCE_PATH_STYLE).toBe(false);
  });

  it('rejects a short session secret', () => {
    process.env.SESSION_SECRET = 'tooshort';
    expect(() => env()).toThrow(/SESSION_SECRET/);
  });

  it('requires credentials when the s3 driver is selected', () => {
    process.env.STORAGE_DRIVER = 's3';
    expect(() => env()).toThrow(/S3_BUCKET/);
  });

  it('accepts the s3 driver once credentials are present', () => {
    Object.assign(process.env, {
      STORAGE_DRIVER: 's3',
      S3_BUCKET: 'bucket',
      S3_ACCESS_KEY_ID: 'key',
      S3_SECRET_ACCESS_KEY: 'secret',
    });
    expect(env().STORAGE_DRIVER).toBe('s3');
  });

  it('memoises so repeated reads do not re-validate', () => {
    expect(env()).toBe(env());
  });
});
