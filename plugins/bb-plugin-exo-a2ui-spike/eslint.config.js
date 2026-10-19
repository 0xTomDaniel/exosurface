// Counted lint gate (just check): typescript-eslint strictTypeChecked over every TypeScript file,
// typed by the package's own settings (tsconfig.lint.json).
import {defineConfig} from 'eslint/config';
import tseslint from 'typescript-eslint';

export default defineConfig(
  {ignores: ['node_modules/**', '**/*.js', '**/*.mjs', '**/*.cjs']},
  {
    files: ['**/*.ts', '**/*.tsx', '**/*.mts'],
    extends: [tseslint.configs.strictTypeChecked],
    languageOptions: {parserOptions: {project: './tsconfig.lint.json', tsconfigRootDir: import.meta.dirname}},
  },
);
