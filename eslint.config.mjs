import tseslint from 'typescript-eslint';
import svelte from 'eslint-plugin-svelte';

export default [
    { ignores: ['dist/**', 'debug/**', 'public/**', 'engine/**', '**/node_modules/**', 'ui/.svelte-kit/**', 'dashboard-dist/**', 'index.js', 'handlers.js', 'web.js'] },
    ...tseslint.configs.recommended,
    ...svelte.configs['flat/recommended'],
    {
        rules: {
            curly: ['error', 'all'],
            'brace-style': ['error', '1tbs', { allowSingleLine: false }],
            indent: ['error', 4, { SwitchCase: 1 }],
        },
    },
    {
        files: ['src/**/*.ts', 'ui/**/*.ts'],
        rules: {
            // Keep the legacy types and CommonJS imports during the staged migration.
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },
    {
        files: ['ui/**/*.svelte'],
        languageOptions: { parserOptions: { parser: tseslint.parser } },
        rules: {
            indent: 'off',
            'svelte/indent': ['error', { indent: 4 }],
        },
    },
];
