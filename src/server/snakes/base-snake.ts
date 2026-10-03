import { BTData, SnakeAppearance } from '../../types/BTData';
import { Color } from '../../types/Color';

export class BaseSnake {
    public info: { name: string; ops?: string[] } = { name: this.constructor.name };
    public readonly appearance: SnakeAppearance = { color: Color.GREY, head: 'default', tail: 'default' };

    start(_data: BTData): void {
        // Stateless strategies need no game initialization.
    }
}
