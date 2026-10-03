import registry from '../server/snakes';

export default Object.values(registry).map(SnakeType => new SnakeType());
