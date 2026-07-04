import js from '@eslint/js'
import tseslint from 'typescript-eslint'

export default [
  { ignores: ['dist/**', 'release/**', 'asar-temp/**'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-empty-object-type': ['error', { allowInterfaces: 'always' }],
    },
  },
]
