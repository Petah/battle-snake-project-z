import { defineConfig } from 'vite';
import { sveltekit } from '@sveltejs/kit/vite';
import adapter from '@sveltejs/adapter-static';

export default defineConfig({
    plugins: [sveltekit({
        adapter: adapter({ pages: '../dashboard-dist', assets: '../dashboard-dist' }),
        csp: { mode: 'hash', directives: { 'script-src': ['self'] } },
    })],
    // The Express backend uses cookie 0.x; bundle Kit's cookie 2.x for prerendering.
    ssr: { noExternal: ['cookie'] },
    server: {
        host: '127.0.0.1', port: 5173, strictPort: true,
        // Preserve Host and Origin so the API's same-origin checks still apply.
        proxy: { '/api': { target: 'http://127.0.0.1:9000', changeOrigin: false } },
    },
});
