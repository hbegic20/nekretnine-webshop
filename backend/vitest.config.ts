import { configDefaults, defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    /**
     * Unit tests only — pure functions, no infrastructure, milliseconds.
     *
     * The integration suite lives in `*.itest.ts` files and runs from
     * `vitest.integration.config.ts` (`npm run test:api`), because it needs a
     * Postgres to connect to. Excluded by name rather than left to the default
     * `*.test.ts` pattern not matching: relying on that is relying on nobody
     * ever naming a file `foo.test.ts` that talks to a database.
     *
     * `dist` is excluded because `npm run build` compiles the test files too,
     * and vitest was happily running both copies — every unit test twice, the
     * second time against whatever the last build happened to contain. It
     * passed, which is why nobody noticed: a stale compiled test that no
     * longer matches its source is a test that lies in either direction.
     */
    exclude: [...configDefaults.exclude, 'dist/**', '**/*.itest.ts'],

    /**
     * Environment for tests, so they do not depend on a .env file existing.
     *
     * env.ts validates configuration at import time and calls process.exit(1)
     * if anything required is missing. That is the right behaviour for a
     * server — fail loudly at boot rather than mysteriously at request time —
     * but it means any test whose import chain reaches env.ts dies instantly
     * on a machine without a .env.
     *
     * That machine is CI. The suite passed locally purely because a .env
     * happened to be sitting there, which is exactly the kind of hidden
     * dependency that turns a first CI run into an hour of confusion.
     *
     * These values are deliberately fake. Nothing here connects to a database:
     * the current tests are all pure functions, and they only reach env.ts
     * because a module they import does.
     */
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgres://test:test@localhost:5432/test',
      STORAGE_DRIVER: 'disk',
      MAIL_DRIVER: 'console',
    },
  },
})
