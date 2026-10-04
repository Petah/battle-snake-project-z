import { Server, ServerMoveResponse } from '../Server';
import { StrategyRequest } from '../../types/BTData';
import { MoveDirection } from '../../types/MoveDirection';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';

export interface StateFunction {
    (request: StrategyRequest): MoveDirection
}

export abstract class BaseSnake {
    public info: any = {};
    public server: Server;
    public wins: number = 0;
    public enabled: boolean = false;
    public port: number;

    protected states: StateFunction[] = [];
    public color = Color.GREY;
    public headType: HeadType | 'default' = 'default';
    public tailType: TailType | 'default' = 'default';

    public get appearance() {
        return { color: this.color, head: this.headType, tail: this.tailType };
    }

    constructor() {
        this.info.name = this.name;
    }

    public start(_request: StrategyRequest): void {
    }

    public move(request: StrategyRequest): ServerMoveResponse | null {
        let direction;
        for (const state of this.states) {
            if (direction = state.call(this, request)) {
                request.log(state.name);
                return {
                    move: direction,
                    shout: state.name,
                };
            }
        }
        return null;
    }

    public get name() {
        return this.constructor.name;
    }

    public get config() {
        return {
            name: this.name,
            url: `http://localhost:${this.port}/`,
        };
    }
}
