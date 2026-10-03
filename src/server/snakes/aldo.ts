import { BTData } from '../../types/BTData';
import { ProjectZ } from './project-z';
import { KeepAway } from './keep-away';
import { Rando } from './rando';
import { Tak } from './tak';
import { TailChase } from './tail-chase';
import { BaseSnake } from './base-snake';

const CRC32 = require('crc-32');

export class Aldo extends BaseSnake {
    private options: any[];

    constructor() {
        super();
        this.options = [ProjectZ, KeepAway, Rando, Tak, TailChase];
    }

    move(data: BTData) {
        return this.snake(data).move(data);
    }

    private snake(data: BTData) {
        const crc = Math.abs(CRC32.str(data.you.id));
        return new this.options[crc % this.options.length]();
    }
}
