import * as esbuild from 'esbuild';

const options = {
    entryPoints: ['src/web.ts'],
    bundle: true,
    platform: 'browser',
    target: 'es2022',
    outfile: 'debug/bundle.js',
    sourcemap: true,
    logLevel: 'info',
};

if (process.argv.includes('--watch')) {
    const context = await esbuild.context(options);
    await context.watch();
    const shutdown = async () => {
        await context.dispose();
        process.exit(0);
    };
    process.once('SIGINT', shutdown);
    process.once('SIGTERM', shutdown);
} else {
    await esbuild.build(options);
}
