import js from '@eslint/js'
import globals from 'globals'
import reactHooks from 'eslint-plugin-react-hooks'
import reactRefresh from 'eslint-plugin-react-refresh'
import tseslint from 'typescript-eslint'
import { defineConfig, globalIgnores } from 'eslint/config'

export default defineConfig([
  globalIgnores(['dist']),
  {
    files: ['**/*.{ts,tsx}'],
    extends: [
      js.configs.recommended,
      tseslint.configs.recommended,
      reactHooks.configs.flat.recommended,
      reactRefresh.configs.vite,
    ],
    languageOptions: {
      globals: globals.browser,
    },
    rules: {
      // This is a react-three-fiber game: useFrame loops mutate refs and
      // module-level stores every frame by design, and the stores are
      // deliberately mutable singletons. The React-Compiler immutability rule
      // fights that pattern across the whole codebase, so disable it.
      'react-hooks/immutability': 'off',
      // Dev-only fast-refresh hints (constants exported beside components) —
      // keep as warnings, not build-failing errors.
      'react-refresh/only-export-components': 'warn',
      'react-hooks/set-state-in-effect': 'warn',
    },
  },
])
