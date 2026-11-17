import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['node_modules/', '.claude-plugin/types/', 'eval/out/'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['src/**/*.ts', 'hooks/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        {
          name: 'fetch',
          message:
            'Take a Fetch as an argument: this code also runs where there is no global fetch.',
        },
        { name: 'setTimeout', message: 'Take a sleep function as an argument.' },
        { name: 'process', message: 'No Node built-ins under src/ or hooks/.' },
        { name: 'Buffer', message: 'No Node built-ins under src/ or hooks/.' },
      ],
      'no-restricted-imports': [
        'error',
        { patterns: [{ group: ['node:*'], message: 'No Node built-ins under src/ or hooks/.' }] },
      ],
    },
  },
);
