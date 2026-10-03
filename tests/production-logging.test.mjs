import test from 'node:test';
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { fixture } from './helpers.mjs';
const run = promisify(execFile);
for (const requestLogs of [false, true]) {
    test(`production logging keeps errors and ${requestLogs ? 'allows opt-in request logs' : 'omits successful requests'}`, async () => {
        const script = `
            const {Server}=require('./dist/server/Server');
            const {BaseSnake}=require('./dist/server/snakes/base-snake');
            class Broken extends BaseSnake { move(){throw new Error('test strategy failure');} }
            const server=new Server(0,()=>new Broken(),{host:'127.0.0.1'});
            server.httpServer.once('listening',async()=>{
                try {
                    const base='http://127.0.0.1:'+server.httpServer.address().port;
                    await (await fetch(base+'/')).text();
                    await (await fetch(base+'/not-found')).text();
                    await (await fetch(base+'/move',{method:'POST',headers:{'Content-Type':'application/json'},body:${JSON.stringify(JSON.stringify(fixture()))}})).text();
                }finally{await server.close();}
            });`;
        const { stdout, stderr } = await run(process.execPath, ['-e', script], { env: { ...process.env, NODE_ENV: 'production', REQUEST_LOGS: requestLogs ? 'true' : 'false' }, timeout: 5000 });
        assert.match(stdout, /GET \/not-found 404/);
        assert.match(stderr, /Strategy failed; using fallback move/);
        if (requestLogs) assert.match(stdout, /GET \/ 200/);
        else { assert.doesNotMatch(stdout, /GET \/ 200/); assert.doesNotMatch(stdout, /POST \/move 200/); }
    });
}
