import type { Game } from '../core/Game';
import './ui.css';

type ScreenName = 'menu' | 'pause' | 'dead' | 'settings';

/** Delay before the game-over screen appears, so the death itself is visible first. */
const DEAD_SCREEN_DELAY_MS = 450;
/** Seconds per number of the resume countdown (must match Game's RESUME_COUNTDOWN / 3). */
const COUNT_STEP = 0.6;

function el<T extends HTMLElement>(id: string): T {
  return document.getElementById(id) as T;
}

/**
 * DOM layer: HUD, menus and transitions. It only reads Game state and calls Game's public
 * methods; the simulation never depends on it. One delegated listener handles every button.
 */
export class UI {
  private readonly root = el('ui');
  private readonly hud = el('hud');
  private readonly screens: Record<ScreenName, HTMLElement> = {
    menu: el('screen-menu'),
    pause: el('screen-pause'),
    dead: el('screen-dead'),
    settings: el('screen-settings'),
  };
  private readonly countdownEl = el('countdown');
  private readonly hudScore = el('hud-score');
  private readonly hudBest = el('hud-best');
  private readonly hudCoins = el('hud-coins');
  private readonly hudLevel = el('hud-level');

  private settingsOpen = false;
  private deadTimer = 0;
  private deadVisible = false;
  // Last values written to the DOM, to touch it only when something changed.
  private lastScore = -1;
  private lastBest = -1;
  private lastCoins = -1;
  private lastLevel = -1;
  private lastCount = 0;

  constructor(private readonly game: Game) {
    this.root.addEventListener('click', this.onClick);
    this.root.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('keydown', this.onKey);
    game.onState = () => this.sync();
    game.onFrame = () => this.updateHud();
    this.refreshToggles();
    this.sync();
  }

  /** Make the screens/HUD match the game state. */
  private sync(): void {
    const g = this.game;
    window.clearTimeout(this.deadTimer);
    this.deadVisible = false;
    if (g.state === 'dead') {
      this.deadTimer = window.setTimeout(() => {
        if (g.state !== 'dead') return;
        this.fillDead();
        this.deadVisible = true;
        this.applyScreen();
      }, DEAD_SCREEN_DELAY_MS);
    }
    if (g.state === 'menu') el('menu-best').textContent = String(g.best);
    this.hud.dataset.show = String(g.state !== 'menu' && g.state !== 'dead');
    this.applyScreen();
  }

  private baseScreen(): ScreenName | null {
    switch (this.game.state) {
      case 'menu':
        return 'menu';
      case 'paused':
        return 'pause';
      case 'dead':
        return this.deadVisible ? 'dead' : null;
      default:
        return null;
    }
  }

  private applyScreen(): void {
    const active: ScreenName | null = this.settingsOpen ? 'settings' : this.baseScreen();
    for (const name of Object.keys(this.screens) as ScreenName[]) {
      this.screens[name].dataset.show = String(name === active);
    }
    this.hud.dataset.show = String(
      !this.settingsOpen && this.game.state !== 'menu' && this.game.state !== 'dead',
    );
  }

  private fillDead(): void {
    const g = this.game;
    el('dead-score').textContent = String(g.score);
    el('dead-best').textContent = String(g.best);
    el('dead-coins').textContent = String(g.coins);
    el('dead-record').hidden = !g.newRecord;
  }

  /** Called every rendered frame: cheap, only writes changed values. */
  private updateHud(): void {
    const g = this.game;
    if (g.score !== this.lastScore) {
      this.lastScore = g.score;
      this.hudScore.textContent = String(g.score);
    }
    const best = Math.max(g.best, g.score);
    if (best !== this.lastBest) {
      this.lastBest = best;
      this.hudBest.textContent = String(best);
    }
    if (g.coins !== this.lastCoins) {
      this.lastCoins = g.coins;
      this.hudCoins.textContent = String(g.coins);
    }
    if (g.level !== this.lastLevel) {
      this.lastLevel = g.level;
      this.hudLevel.textContent = String(g.level);
    }
    this.updateCountdown();
  }

  private updateCountdown(): void {
    const n = this.game.state === 'countdown' ? Math.max(1, Math.ceil(this.game.countdown / COUNT_STEP)) : 0;
    if (n === this.lastCount) return;
    this.lastCount = n;
    const c = this.countdownEl;
    c.classList.remove('tick');
    c.textContent = n ? String(n) : '';
    if (n) {
      void c.offsetWidth; // restart the CSS animation
      c.classList.add('tick');
    }
  }

  private refreshToggles(): void {
    const d = this.game.save.data;
    this.root
      .querySelector('[data-action="toggle-music"]')
      ?.setAttribute('aria-checked', String(d.music));
    this.root.querySelector('[data-action="toggle-sfx"]')?.setAttribute('aria-checked', String(d.sfx));
  }

  /** Retry fires on pointerdown (not click) so game over → running again feels instant. */
  private onPointerDown = (e: PointerEvent): void => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (target?.dataset.action === 'retry') {
      e.preventDefault();
      this.game.audio.sfx('click');
      this.game.retry();
    }
  };

  private onClick = (e: MouseEvent): void => {
    const target = (e.target as HTMLElement).closest<HTMLElement>('[data-action]');
    if (!target) return;
    const g = this.game;
    // UI feedback sound (the retry tap has its own path through pointerdown).
    g.audio.sfx('click');
    switch (target.dataset.action) {
      case 'play':
        g.play();
        break;
      case 'pause':
        g.pause();
        break;
      case 'resume':
        g.resume();
        break;
      case 'menu':
        g.toMenu();
        break;
      case 'settings':
        this.settingsOpen = true;
        this.applyScreen();
        break;
      case 'back':
        this.settingsOpen = false;
        this.applyScreen();
        break;
      case 'toggle-music':
        g.save.data.music = !g.save.data.music;
        g.save.flush();
        g.audio.refresh();
        this.refreshToggles();
        break;
      case 'toggle-sfx':
        g.save.data.sfx = !g.save.data.sfx;
        g.save.flush();
        g.audio.refresh();
        this.refreshToggles();
        break;
    }
    // Keep keyboard focus off the buttons so Space always means "jump", never "click again".
    (document.activeElement as HTMLElement | null)?.blur();
  };

  private onKey = (e: KeyboardEvent): void => {
    if (e.code !== 'Escape' && e.code !== 'KeyP') return;
    if (this.settingsOpen) {
      this.settingsOpen = false;
      this.applyScreen();
    } else {
      this.game.togglePause();
    }
  };
}
