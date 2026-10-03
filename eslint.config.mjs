import tseslint from 'typescript-eslint';

export default [
    { ignores: ['dist/**', 'debug/**', 'public/**', 'engine/**', 'node_modules/**', 'index.js', 'handlers.js', 'web.js'] },
    ...tseslint.configs.recommended,
    {
        files: ['src/**/*.ts'],
        rules: {
            // Keep the legacy types and CommonJS imports during the staged migration.
            '@typescript-eslint/no-explicit-any': 'off',
            '@typescript-eslint/no-require-imports': 'off',
            '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
        },
    },
];
