// Flat ESLint config. Three layers on top of the defaults, each catching a
// class of bug the others miss:
//   - typescript-eslint  → type-aware sloppiness (unused vars, bad awaits)
//   - react-hooks        → dependency-array and rules-of-hooks violations
//   - jsx-a11y           → the accessibility floor CLAUDE.md promises
// Run via `npm run lint` (or `npm run check`, which also typechecks + knips).
import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import jsxA11y from 'eslint-plugin-jsx-a11y';

export default tseslint.config(
  { ignores: ['dist', 'coverage', 'node_modules', '.claude/worktrees', 'public'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      jsxA11y.flatConfigs.recommended,
    ],
    languageOptions: {
      ecmaVersion: 2021,
      globals: globals.browser,
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }],

      // These three ship as errors in eslint-plugin-react-hooks v6, where
      // they enforce React Compiler readiness. This app is React 18 with no
      // compiler, and the bulk of the hits are the deliberate game-loop
      // pattern: a ref holds mutable per-frame state (kart physics, unicorn
      // score) that the animation loop writes and the HUD reads. Rewriting
      // that as state would re-render every frame.
      //
      // They stay on as warnings — each one is a real question to answer if
      // we ever adopt the compiler — but they don't block the gate today.
      // `rules-of-hooks` and `exhaustive-deps` keep their defaults; those
      // catch actual bugs.
      'react-hooks/refs': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
      'react-hooks/immutability': 'warn',
      // Underscore-prefixed args are the project's existing "intentionally
      // unused" convention (three.js callbacks, event handlers).
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      // Stray debug logging shouldn't ship in a PWA the family installs;
      // genuine error reporting (ErrorBoundary, rejected peer messages) may.
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    // Tests reach into internals and stub browser APIs that don't exist in
    // jsdom; the strictness that protects app code is noise here.
    files: ['**/*.test.{ts,tsx}', 'src/test/**/*.ts'],
    languageOptions: { globals: { ...globals.browser, ...globals.node } },
    rules: {
      '@typescript-eslint/no-explicit-any': 'off',
      '@typescript-eslint/no-empty-function': 'off',
    },
  },
  {
    // Identity is set at the gate and the booth, never inside a game — the
    // players design's "no game writes a name" rule, enforced at the import
    // boundary rather than by convention.
    files: ['src/games/**/*.{ts,tsx}'],
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['**/useIdentity', '@shared/profile/useIdentity'],
              message:
                'Games read the ticket through useProfile(); only the gate, the booth, PlayingAs and the seat pickers change who is signed in.',
            },
          ],
        },
      ],
    },
  },
  {
    // Node-side config files.
    files: ['*.config.{ts,js}', '.claude/hooks/*.mjs'],
    languageOptions: { globals: globals.node },
  },
);
