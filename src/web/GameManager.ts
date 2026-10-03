import { Game } from './Game';

export class GameManager {
    public games: Game[] = [];

    public getRunningGames() {
        return this.games.filter(game => game.pending || !game.finished);
    }

    public getGame(gameId: string): Game {
        return this.games.find(g => g.id == gameId);
    }

    public initGame(gameId: string) {
        let game = this.getGame(gameId);
        if (!game) {
            game = new Game(this.games.length, gameId);
            this.games.push(game);
        }
        return game;
    }
}
