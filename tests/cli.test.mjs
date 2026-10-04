import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';
import { require } from './helpers.mjs';

const exec = promisify(execFile);
const { EvaluationCommandLine } = require('../dist/evaluation/EvaluationCommandLine.js');
const { evaluationOptions } = require('../dist/evaluation/schedule.js');
const commands = ['dist/evaluation/index.js', 'scripts/build-web.mjs', 'scripts/profile-movement.mjs'];

test('evaluation CLI preserves defaults, typed options and output environment precedence', async t => {
    const previous = process.env.EVALUATION_DIRECTORY;
    t.after(() => {
        if (previous === undefined) {
            delete process.env.EVALUATION_DIRECTORY;
        } else {
            process.env.EVALUATION_DIRECTORY = previous;
        }
    });
    delete process.env.EVALUATION_DIRECTORY;
    let received;
    const run = async (options, directory) => { received = { options, directory }; };
    await new EvaluationCommandLine(run).executeWithoutErrorHandlingAsync([]);
    assert.deepEqual(received, { options: evaluationOptions(), directory: resolve('evaluations') });
    process.env.EVALUATION_DIRECTORY = 'environment reports';
    await new EvaluationCommandLine(run).executeWithoutErrorHandlingAsync([]);
    assert.equal(received.directory, resolve('environment reports'));
    await new EvaluationCommandLine(run).executeWithoutErrorHandlingAsync([
        '--snakes', 'rando, projectz', '--rounds', '2', '--seed', '-42', '--width', '9', '--height', '13',
        '--timeout', '250', '--concurrency', '2', '--max-seconds', '120', '--keep-replays', '--output', 'cli reports',
    ]);
    assert.deepEqual(received, { options: { snakes: ['Rando', 'ProjectZ'], rounds: 2, seed: -42, width: 9, height: 13,
        timeout: 250, concurrency: 2, maxSeconds: 120, keepReplays: true }, directory: resolve('cli reports') });
});

test('evaluation CLI rejects invalid arguments before running games', async () => {
    for (const args of [
        ['--rounds', '1.5'], ['--rounds', '2oops'], ['--seed', 'abc'], ['--width', '10'], ['--max-seconds', '0'],
        ['--seed', '9007199254740992'], ['--snakes', 'unknown,rando'], ['--rounds'], ['--typo'], ['extra'],
    ]) {
        let ran = false;
        await assert.rejects(new EvaluationCommandLine(async () => { ran = true; }).executeWithoutErrorHandlingAsync(args));
        assert.equal(ran, false, args.join(' '));
    }
});

test('all tooling CLIs generate help and return a nonzero status for unknown flags', async () => {
    for (const command of commands) {
        const { stdout } = await exec(process.execPath, [command, '--help']);
        assert.match(stdout, /usage:/i);
        assert.match(stdout, /--help/);
        assert.doesNotMatch(stdout, /Server listening|medianMs/);
        await assert.rejects(exec(process.execPath, [command, '--unknown-flag']), error => {
            assert.notEqual(error.code, 0);
            assert.match(error.stderr, /unrecognized arguments/i);
            return true;
        });
    }
});

test('evaluation CLI reports a missing engine as failure without an unhandled rejection', async () => {
    await assert.rejects(exec(process.execPath, ['dist/evaluation/index.js', '--snakes', 'ProjectZ,Rando'], {
        env: { ...process.env, BATTLESNAKE_CLI: '/missing/battlesnake-cli-test' },
    }), error => {
        assert.equal(error.code, 1);
        assert.match(error.stderr, /Rules CLI|ENOENT/);
        assert.doesNotMatch(error.stderr, /UnhandledPromiseRejection/);
        return true;
    });
});

test('browser build CLI starts Vite, updates served modules and shuts down cleanly', { timeout: 15000 }, async t => {
    const directory = await mkdtemp(join(tmpdir(), 'snake-build-cli-'));
    const ui = join(directory, 'ui');
    await mkdir(ui);
    const source = join(ui, 'entry.js');
    await writeFile(join(ui, 'vite.config.mjs'), 'export default { server: { host: "127.0.0.1", port: 0 } };');
    await writeFile(join(ui, 'index.html'), '<script type="module" src="/entry.js"></script>');
    await writeFile(source, 'console.log("first-build");');
    const child = spawn(process.execPath, [resolve('scripts/build-web.mjs'), '--watch'], { cwd: directory, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    child.stdout.on('data', chunk => { output += chunk; }); child.stderr.resume();
    const exited = new Promise((resolve, reject) => {
        child.once('error', reject);
        child.once('exit', (code, signal) => resolve({ code, signal }));
    });
    t.after(async () => {
        if (child.exitCode === null && child.signalCode === null) {
            child.kill('SIGKILL');
        }
        await exited;
        await rm(directory, { recursive: true, force: true });
    });
    const waitForModule = async text => {
        for (let attempt = 0; attempt < 100; attempt++) {
            const url = output.match(/http:\/\/127\.0\.0\.1:\d+/)?.[0];
            if (url && (await (await fetch(url + '/entry.js')).text()).includes(text)) {
                return;
            }
            await delay(50);
        }
        assert.fail(`No module containing ${text}`);
    };
    await waitForModule('first-build');
    await writeFile(source, 'console.log("rebuilt-file");');
    await waitForModule('rebuilt-file');
    child.kill('SIGTERM');
    const result = await exited;
    assert.equal(result.signal, null);
    // Vite uses the conventional 128 + SIGTERM exit status after closing.
    assert.ok(result.code === 0 || result.code === 143);
});
