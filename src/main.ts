import './style.css';
import { Game } from './core/Game';

const canvas = document.getElementById('game') as HTMLCanvasElement;
const game = new Game(canvas);
game.start();
if (game.debug) (window as unknown as { game: Game }).game = game;
