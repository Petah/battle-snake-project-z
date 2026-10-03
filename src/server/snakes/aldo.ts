import { StrategyRequest } from '../../types/BTData';
import { ProjectZ } from './project-z';
import { KeepAway } from './keep-away';
import { Rando } from './rando';
import { Tak } from './tak';
import { TailChase } from './tail-chase';
import { BaseSnake } from './base-snake';
import { ISnake } from './snake-interface';
import { Color } from '../../types/Color';
import { HeadType } from '../../types/HeadType';
import { TailType } from '../../types/TailType';
import { MoveDirection } from '../../types/MoveDirection';
import { ServerMoveResponse } from '../Server';


export class Aldo extends BaseSnake implements ISnake {
    public port: number = 9006;

    public color = Color.POMEGRANATE;
    public headType = HeadType.TONGUE;
    public tailType = TailType.SKINNY;

    public move(request: StrategyRequest): ServerMoveResponse | null {
        // if (!request.storage.xDirection) {
        //     if (y % 2 === 0) {
        //         request.storage.xDirection = request.storage.xDirection || MoveDirection.RIGHT;
        //     } else {
        //         request.storage.xDirection = request.storage.xDirection || MoveDirection.LEFT;
        //     }
        // }
        // request.storage.yDirection = request.storage.yDirection || MoveDirection.DOWN;
        // request.storage.turning = request.storage.turning || false;
        // request.storage.loopingBack = request.storage.loopingBack || false;
        request.storage.switch = request.storage.switch || false;
        request.storage.gameOver = request.storage.gameOver || false;

        const { x, y } = request.body.you.body[0];
        const top = 0;
        const left = 0;
        const bottom = request.body.board.height - 1;
        const right = request.body.board.width - 1;
        const even = y % 2 === 0;
        if (request.storage.gameOver || request.body.board.width * request.body.board.height - (request.body.you.body.length + 1) == request.body.board.width - 2) {
            request.storage.gameOver = true;
            request.log('game over');
            if (x == right && y == bottom - 1) {
                return {
                    move: MoveDirection.UP,
                };
            }
            if (x == left + 2) {
                if (y == bottom - 1) {
                    return {
                        move: MoveDirection.RIGHT,
                    };
                }
                if (y == bottom) {
                    return {
                        move: MoveDirection.DOWN,
                    };
                }
            }
            if (y == bottom) {
                return {
                    move: MoveDirection.LEFT,
                };
            }
        }
        return this.moveLeftGap(request, x, y, top, left, bottom, right, even);

        // if (x == left && y == top) {
        //     request.storage.switch = true;
        //     return {
        //         move: MoveDirection.RIGHT,
        //     };
        // }

        // if (x == right && y == top) {
        //     request.storage.switch = false;
        //     return {
        //         move: MoveDirection.LEFT,
        //     };
        // }

        // if (request.storage.switch) {
        //     if (x == right) {
        //         return {
        //             move: MoveDirection.DOWN,
        //         };
        //     }

        //     if (y == bottom) {
        //         return {
        //             move: MoveDirection.RIGHT,
        //         };
        //     }

        //     if (even) {
        //         if (x == right - 1) {
        //             return {
        //                 move: MoveDirection.UP,
        //             };
        //         }
        //         return {
        //             move: MoveDirection.RIGHT,
        //         };
        //     } else {
        //         if (x == left + 1) {
        //             return {
        //                 move: MoveDirection.UP,
        //             };
        //         }
        //         return {
        //             move: MoveDirection.LEFT,
        //         };
        //     }
        // } else {
        //     if (x == left) {
        //         return {
        //             move: MoveDirection.DOWN,
        //         };
        //     }

        //     if (y == bottom) {
        //         return {
        //             move: MoveDirection.LEFT,
        //         };
        //     }

        //     if (even) {
        //         if (x == left + 1) {
        //             return {
        //                 move: MoveDirection.UP,
        //             };
        //         }
        //         return {
        //             move: MoveDirection.LEFT,
        //         };
        //     } else {
        //         if (x == right - 1) {
        //             return {
        //                 move: MoveDirection.UP,
        //             };
        //         }
        //         return {
        //             move: MoveDirection.RIGHT,
        //         };
        //     }
        // }

        return this.moveLeftGap(request, x, y, top, left, bottom, right, even);

        // if (request.storage.switch) {
        //     return this.moveLeftGap(request, top, left, bottom, right, even);
        // } else {
        //     return this.moveRightGap(request, top, left, bottom, right, even);
        // }

        // if (request.body.board.height % 2 === 0) {
        //     return this.moveRightGap(request, top, left, bottom, right, even);
        // } else {
        //     return this.moveLeftGap(request, top, left, bottom, right, even);
        // }
    }

    private moveRightGap(request: StrategyRequest, x: number, y: number, top: number, left: number, bottom: number, right: number, even: boolean) {

        if (x == right && y != top) {
            request.log('right up');
            return {
                move: MoveDirection.DOWN,
            };
        }

        if (y == bottom) {
            // if (x == right) {
            //     request.log('bottom right up');
            //     return {
            //         move: MoveDirection.DOWN,
            //     };
            // }
            request.log('bottom right');
            return {
                move: MoveDirection.RIGHT,
            };
        }

        if (y == bottom) {
            if (x == left) {
                request.log('top left down');
                return {
                    move: MoveDirection.UP,
                };
            }
            request.log('top left');
            return {
                move: MoveDirection.LEFT,
            };
        }

        if (even) {
            if (x == left) {
                request.log('even down');
                return {
                    move: MoveDirection.UP,
                };
            }
            request.log('even left');
            return {
                move: MoveDirection.LEFT,
            };
        } else {
            if (x == right - 1) {
                request.log('odd down');
                return {
                    move: MoveDirection.UP,
                };
            }
            request.log('odd right');
            return {
                move: MoveDirection.RIGHT,
            };
        }
    }

    private moveLeftGap(request: StrategyRequest, x: number, y: number, top: number, left: number, bottom: number, right: number, even: boolean) {

        if (x == left && y != top) {
            request.log('left up');
            return {
                move: MoveDirection.DOWN,
            };
        }

        if (y == bottom) {
            // if (x == left) {
            //     request.log('bottom left up');
            //     return {
            //         move: MoveDirection.DOWN,
            //     };
            // }
            request.log('bottom left');
            return {
                move: MoveDirection.LEFT,
            };
        }

        // if (y == bottom) {
        //     if (x == left) {
        //         request.log('top left down');
        //         return {
        //             move: MoveDirection.UP,
        //         };
        //     }
        //     request.log('top left');
        //     return {
        //         move: MoveDirection.LEFT,
        //     };
        // }

        if (even) {
            if (x == right) {
                request.log('even down');
                return {
                    move: MoveDirection.UP,
                };
            }
            request.log('even right', x, right);
            return {
                move: MoveDirection.RIGHT,
            };
        } else {
            if (x == left + 1) {
                request.log('odd down');
                return {
                    move: MoveDirection.UP,
                };
            }
            request.log('odd left');
            return {
                move: MoveDirection.LEFT,
            };
        }
    }
}
