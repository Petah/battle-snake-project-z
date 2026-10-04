// This logger is shared with the browser bundle.
function inspect(value: unknown): string {
    const seen = new WeakSet<object>();
    return JSON.stringify(value, (_key, item) => {
        if (item && typeof item === 'object') {
            if (seen.has(item)) {
                return '[Circular]';
            }
            seen.add(item);
        }
        return item;
    }) ?? String(value);
}

export const Logger = {
    enabled: false,
    console: false,
    stdout: false,
};

export const logs = [];

export function log(...args: any[]) {
    if (!Logger.enabled) {
        return;
    }

    let line = '';
    for (const arg of args) {
        if (typeof arg === 'string') {
            line += arg;
        } else if (arg === null) {
            line += 'null';
        } else if (arg === undefined) {
            line += 'null';
        } else if (typeof arg === 'number' || typeof arg === 'boolean' || typeof arg === 'bigint') {
            line += arg.toString();
        } else {
            line += inspect(arg);
        }
        line += ' ';
    }
    logs.push(line);
    if (Logger.console) {
        console.log(line);
    } else if (Logger.stdout) {
        process.stdout.write(line + '\n');
    }
}

log.verbose = (..._args: any[]) => { };
