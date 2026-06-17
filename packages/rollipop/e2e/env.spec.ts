import { describe, expect, it } from 'vite-plus/test';

import { build } from './helpers';

describe('environment variables', () => {
  describe('.env loading', () => {
    it('loads ROLLIPOP_ prefixed variables from .env and exposes via import.meta.env', async () => {
      const chunk = await build('env/basic');

      expect(chunk.code).toContain('https://api.example.com');
      expect(chunk.code).toContain('my-app');
    });

    it('does not expose variables without ROLLIPOP_ prefix', async () => {
      const chunk = await build('env/basic');

      // SECRET_KEY should not be replaced (stays as import.meta.env.SECRET_KEY)
      expect(chunk.code).not.toContain('should-not-be-included');
    });

    it('exposes MODE via import.meta.env.MODE', async () => {
      const chunk = await build('env/basic');

      expect(chunk.code).toContain('"production"');
    });
  });

  describe('mode-specific .env files', () => {
    it('loads .env.production in production mode', async () => {
      const chunk = await build('env/mode', { mode: 'production' });

      expect(chunk.code).toContain('from-production');
      expect(chunk.code).not.toContain('"base"');
    });

    it('loads .env.development in development mode', async () => {
      const chunk = await build('env/mode', { mode: 'development' }, { dev: true });

      expect(chunk.code).toContain('from-development');
      expect(chunk.code).not.toContain('"base"');
    });
  });

  describe('prefix filtering', () => {
    it('only includes variables matching envPrefix', async () => {
      const chunk = await build('env/prefix-filter');

      expect(chunk.code).toContain('visible');
      expect(chunk.code).not.toContain('hidden');
      expect(chunk.code).not.toContain('postgres://secret');
    });

    it('custom envPrefix filters differently', async () => {
      const chunk = await build('env/prefix-filter', { envPrefix: 'APP_' });

      // Now APP_ prefixed vars are included instead
      expect(chunk.code).toContain('hidden');
      expect(chunk.code).not.toContain('visible');
    });
  });

  describe('missing .env files are skipped gracefully', () => {
    it('loads only existing mode-specific file when base .env is missing', async () => {
      // This fixture has only .env.production, no .env or .env.local
      const chunk = await build('env/missing-files', { mode: 'production' });

      expect(chunk.code).toContain('only-production-file');
    });

    it('produces no env vars when no .env files exist for the mode', async () => {
      // development mode but only .env.production exists
      const chunk = await build('env/missing-files', { mode: 'development' }, { dev: true });

      // ROLLIPOP_FROM_MODE should remain unreplaced
      expect(chunk.code).not.toContain('only-production-file');
    });
  });

  describe('process.env precedence', () => {
    it('process.env takes precedence over .env file values', async () => {
      const original = process.env.ROLLIPOP_OVERRIDE_ME;
      try {
        process.env.ROLLIPOP_OVERRIDE_ME = 'from-process-env';
        const chunk = await build('env/process-env-precedence');

        expect(chunk.code).toContain('from-process-env');
        expect(chunk.code).not.toContain('from-file');
      } finally {
        if (original === undefined) {
          delete process.env.ROLLIPOP_OVERRIDE_ME;
        } else {
          process.env.ROLLIPOP_OVERRIDE_ME = original;
        }
      }
    });

    it('falls back to .env file value when process.env is not set', async () => {
      const original = process.env.ROLLIPOP_OVERRIDE_ME;
      try {
        delete process.env.ROLLIPOP_OVERRIDE_ME;
        const chunk = await build('env/process-env-precedence');

        expect(chunk.code).toContain('from-file');
      } finally {
        if (original !== undefined) {
          process.env.ROLLIPOP_OVERRIDE_ME = original;
        }
      }
    });
  });

  describe('variable expansion', () => {
    it('expands ${VAR} references in .env values', async () => {
      const chunk = await build('env/expansion');

      expect(chunk.code).toContain('http://localhost:3000');
    });
  });

  describe('built-in defines', () => {
    it('__DEV__ is false in production, true in development', async () => {
      const prod = await build('env/basic');
      const dev = await build('env/basic', { mode: 'development' }, { dev: true });

      // __DEV__ is defined in the intro global vars
      expect(prod.code).toContain('var __DEV__ = false');
      expect(dev.code).toContain('var __DEV__ = true');
    });

    it('process.env.NODE_ENV reflects mode', async () => {
      const prod = await build('env/basic');
      const dev = await build('env/basic', { mode: 'development' }, { dev: true });

      expect(prod.code).toContain('NODE_ENV = process.env.NODE_ENV || "production"');
      expect(dev.code).toContain('NODE_ENV = process.env.NODE_ENV || "development"');
    });
  });
});
