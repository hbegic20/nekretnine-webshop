import js from '@eslint/js'
import tseslint from 'typescript-eslint'

/**
 * Backend lint rules.
 *
 * The set that earns its keep here is `recommendedTypeChecked` — rules that
 * need the type checker rather than just the syntax tree. They are slower to
 * run, and they catch the one category TypeScript alone does not:
 * `no-floating-promises`. An un-awaited database write compiles perfectly,
 * runs, and silently does nothing, and there is no way to notice except by
 * reading carefully or by a rule that reads for you.
 */
export default tseslint.config(
  {
    /*
     * Config files at the package root are excluded, and it is worth knowing
     * why rather than growing this list one filename at a time.
     *
     * The type-aware rules ask the TypeScript project service about every file
     * they lint. tsconfig.json only includes `src/**`, so anything at the root
     * — drizzle.config.ts, vitest.config.ts, this file — is unknown to it and
     * fails to parse rather than failing to lint. Adding them to tsconfig
     * instead would drag build config into the compiled output.
     *
     * Matched by pattern so the next config file added does not break CI the
     * way vitest.config.ts just did.
     */
    ignores: ['dist/**', 'src/db/migrations/**', '*.config.ts', '*.config.mjs', '*.config.js'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        // Uses the real tsconfig, so rules can ask actual type questions
        // instead of guessing from syntax.
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    rules: {
      /*
       * Unused variables are an error, not a warning — a warning in CI is a
       * line nobody reads. The underscore escape hatch is for the cases where
       * a parameter must exist to reach the one after it, which Express error
       * middleware requires: its four-argument signature is how Express
       * recognises it, so `_next` has to stay.
       */
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrors: 'none' },
      ],

      /*
       * Off, deliberately. Async Express handlers return a promise that
       * Express 5 handles itself, and the rule cannot tell that from a
       * genuinely dropped promise. Leaving it on would mean a void operator on
       * every route, which trains people to silence the rule everywhere —
       * including the places it is right.
       */
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { arguments: false, attributes: false } },
      ],
    },
  },
)
