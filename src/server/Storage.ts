export class Storage {
    private data = {};

    public start(gameId: string, snakeId: string) {
        this.data[gameId + ':' + snakeId] = {};
    }

    public move(gameId: string, snakeId: string) {
        return this.data[gameId + ':' + snakeId];
    }

    public end(gameId: string, snakeId: string) {
        const storage = this.data[gameId + ':' + snakeId];
        delete this.data[gameId + ':' + snakeId];
        return storage;
    }
}
