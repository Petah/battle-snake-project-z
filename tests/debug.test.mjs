import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { runInNewContext } from 'node:vm';
import { load } from 'cheerio';
import { fixture } from './helpers.mjs';

const bundle = await readFile(new URL('../debug/bundle.js', import.meta.url), 'utf8');

function dashboard() {
    const $ = load('<div class="grid"></div><div class="data"></div><div class="log"></div>');
    $.fn.css = function (styles) {
        this.each((_index, node) => {
            $(node).attr('style', Object.entries(styles).map(([name, value]) => `${name}:${value}`).join(';'));
        });
        return this;
    };
    const window = {};
    runInNewContext(bundle, {
        window, $, console: { log() {}, error() {} },
        angular: { module() { return { controller() {} }; } },
    });
    return { $, window };
}

test('browser bundle renders API v1 coordinates, hazards, and body arrows', () => {
    const { $, window } = dashboard();
    const body = fixture();
    body.board.hazards = [{ x: 2, y: 2 }];
    window.loadGrid({ body, storage: {}, logs: [], coordinateSystem: 'bottom-left' });
    assert.deepEqual($('.grid-row').toArray().map(row => $(row).attr('data-y')), ['2', '1', '0']);
    assert.equal($('.grid-row[data-y="0"] .grid-col').eq(1).find('.snake').text(), '↑');
    assert.match($('.grid-row[data-y="2"] .grid-col').eq(2).attr('style'), /#ff0000/);
});

test('browser bundle accepts an empty selection and retains legacy top-left coordinates', () => {
    const { $, window } = dashboard();
    window.loadGrid(null);
    assert.equal($('.grid-row').length, 0);
    const body = fixture();
    delete body.game.ruleset;
    window.loadGrid({ body, storage: {}, logs: [], coordinateSystem: 'top-left' });
    assert.deepEqual($('.grid-row').toArray().map(row => $(row).attr('data-y')), ['0', '1', '2']);
    assert.equal($('.grid-row[data-y="0"] .grid-col').eq(1).find('.snake').text(), '↓');
});
