log = (...args) => {
    for (const arg of args) {
        if (typeof arg === 'string' || arg instanceof String) {
            process.stdout.write(arg);
            process.stdout.write(' ');
        } else if (!isNaN(arg)) {
            process.stdout.write(arg.toString());
            process.stdout.write(' ');
        } else {
            process.stdout.write(JSON.stringify(arg, null, 4));
            process.stdout.write(' ');
        }
    }
    process.stdout.write('\n');
};