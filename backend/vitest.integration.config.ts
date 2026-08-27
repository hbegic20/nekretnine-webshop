import { defineConfig } from 'vitest/config'

/**
 * Integration tests: the real Express app, over real HTTP, against a real
 * Postgres.
 *
 * Deliberately a second config rather than a second project inside the first,
 * because the two suites have different requirements. `vitest.config.ts` runs
 * pure functions and needs nothing installed; this one needs a database, and
 * folding them together would mean `npm test` fails on a machine where Docker
 * is not running — which is most of the times you want a quick check.
 *
 * The split has a real cost: a suite only CI runs is a suite that rots. That
 * is why `npm run test:api` is one command with no arguments, and why CI runs
 * it on every pull request.
 */

/**
 * A separate database on the same Postgres you already run for development.
 *
 * Separate because every test truncates every table between cases, and
 * pointing that at `nekretnine` would delete the listings you have been
 * working on. Same server because the alternative — a throwaway container per
 * run — costs ten seconds of startup on every run to isolate tests that are
 * already isolated by the truncate.
 */
const DATABASE_URL =
  process.env.TEST_DATABASE_URL ?? 'postgres://nekretnine:nekretnine@localhost:5432/nekretnine_test'

export default defineConfig({
  test: {
    include: ['src/**/*.itest.ts'],

    // Creates the database and applies migrations, once, before any file runs.
    globalSetup: ['src/test/global-setup.ts'],
    // Per file: boots the server, truncates between cases, closes the pool.
    setupFiles: ['src/test/setup.ts'],

    /*
     * One file at a time. Every file shares the one test database, and a
     * truncate in one worker would delete the rows another worker is halfway
     * through asserting on. Schema-per-worker would buy back the parallelism;
     * at this suite size it would be machinery in exchange for a few seconds.
     */
    fileParallelism: false,

    /*
     * Real values, unlike the unit config's fakes — these tests connect.
     * NODE_ENV=test also switches the rate limiters off (see http/rate-limit.ts),
     * without which the twentieth login in a file would start returning 429.
     */
    env: {
      NODE_ENV: 'test',
      DATABASE_URL,
      STORAGE_DRIVER: 'disk',
      UPLOAD_DIR: './uploads',
      MAIL_DRIVER: 'console',
    },

    // argon2 is deliberately slow (~50ms a hash), and a migration run on a
    // cold database is slower still. The defaults are tight for both.
    testTimeout: 15_000,
    hookTimeout: 60_000,
  },
})
