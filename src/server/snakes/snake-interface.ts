import { StrategyRequest } from '../../types/BTData';
import { Server, ServerMoveResponse } from '../Server';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';

export interface ISnake {
    name: string;
    port: number;
    color: Color;
    headType: HeadType;
    tailType: TailType;
    wins: number;
    enabled: boolean;
    server: Server,
    info: any,
    config: {
        name: string,
        url: string,
    },
    start: (request: StrategyRequest) => void,
    move: (request: StrategyRequest) => ServerMoveResponse,
}
