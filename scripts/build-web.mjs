import { CommandLineParser } from '@rushstack/ts-command-line';
import { createBuilder, createServer } from 'vite';
import { resolve } from 'node:path';

class BuildWebCommandLine extends CommandLineParser {
    constructor() {
        super({ toolFilename: 'build-web', toolDescription: 'Build the SvelteKit dashboard. Run with npm run build:web -- [options].' });
        this.watch = this.defineFlagParameter({ parameterLongName: '--watch', description: 'Run the SvelteKit development server with hot reload on http://127.0.0.1:5173. The dashboard API must run on port 9000.' });
    }

    async onExecuteAsync() {
        process.chdir(resolve('ui'));
        if (this.watch.value) {
            const server = await createServer();
            await server.listen();
            server.printUrls();
            const shutdown = async () => {
                await server.close();
                process.exit(0);
            };
            process.once('SIGINT', shutdown);
            process.once('SIGTERM', shutdown);
        } else {
            const builder = await createBuilder();
            await builder.buildApp();
        }
    }
}

await new BuildWebCommandLine().executeAsync();
