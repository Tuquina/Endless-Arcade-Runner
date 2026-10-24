import './style.css';
import { Game } from './core/Game';
import { UI } from './ui/UI';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
new UI(game);
game.start();
if (game.debug) (window as unknown as { game: Game }).game = game;
