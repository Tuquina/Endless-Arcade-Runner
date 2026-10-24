import type { Game } from '../core/Game';
import { SKINS, type Skin } from '../core/skins';
import './ui.css';

type ScreenName = 'menu' | 'pause' | 'dead' | 'settings' | 'skins';

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
    skins: el('screen-skins'),
  };
  private readonly toast = el('toast');
  private toastTimer = 0;
  private skinsOpen = false;
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
    game.onUnlock = (skin) => this.showToast(skin);
    this.buildSkins();
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
    if (g.state === 'menu') {
      el('menu-best').textContent = String(g.best);
      this.refreshGoal();
    }
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
    const active: ScreenName | null = this.settingsOpen ? 'settings' : this.skinsOpen ? 'skins' : this.baseScreen();
    for (const name of Object.keys(this.screens) as ScreenName[]) {
      this.screens[name].dataset.show = String(name === active);
    }
    this.hud.dataset.show = String(
      !this.settingsOpen && !this.skinsOpen && this.game.state !== 'menu' && this.game.state !== 'dead',
    );
  }

  private fillDead(): void {
    const g = this.game;
    el('dead-score').textContent = String(g.score);
    el('dead-best').textContent = String(g.best);
    el('dead-coins').textContent = String(g.coins);
    el('dead-record').hidden = !g.newRecord;

    const badge = el('dead-unlock');
    badge.hidden = g.unlockedNow.length === 0;
    badge.textContent = `¡Aspecto desbloqueado: ${g.unlockedNow.map((s) => s.name).join(', ')}!`;
    const next = g.nextReward;
    el('dead-next').textContent = next
      ? `Próximo aspecto: ${next.name} · ${next.goal} m (tu mejor: ${g.maxDist} m)`
      : '';
  }

  /** Menu progress bar towards the next skin. */
  private refreshGoal(): void {
    const g = this.game;
    const next = g.nextReward;
    if (!next) {
      el('goal-label').textContent = '¡Todos los aspectos desbloqueados!';
      el('goal-num').textContent = '';
      el('goal-fill').style.width = '100%';
      return;
    }
    el('goal-label').textContent = `Próximo: ${next.name}`;
    el('goal-num').textContent = `${Math.min(g.maxDist, next.goal)} / ${next.goal} m`;
    el('goal-fill').style.width = `${Math.min(100, (g.maxDist / next.goal) * 100)}%`;
  }

  private showToast(skin: Skin): void {
    this.toast.textContent = `¡${skin.goal} m! Aspecto desbloqueado: ${skin.name}`;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), 3200);
  }

  /** Cards are created once; `refreshSkins` only flips their state. */
  private buildSkins(): void {
    const grid = el('skin-grid');
    for (const s of SKINS) {
      const card = document.createElement('button');
      card.className = 'skin-card';
      card.dataset.action = 'select-skin';
      card.dataset.skin = s.id;
      const cube = document.createElement('div');
      cube.className = `skin-cube${s.accessory ? ` acc-${s.accessory}` : ''}${s.rainbow ? ' rainbow' : ''}`;
      cube.style.setProperty('--c', s.color);
      cube.style.setProperty('--s', s.shade);
      cube.append(document.createElement('i'), document.createElement('i'));
      const name = document.createElement('span');
      name.className = 'skin-name';
      name.textContent = s.name;
      const note = document.createElement('span');
      note.className = 'skin-note';
      card.append(cube, name, note);
      grid.append(card);
    }
    this.refreshSkins();
  }

  private refreshSkins(): void {
    const g = this.game;
    for (const card of el('skin-grid').children as HTMLCollectionOf<HTMLElement>) {
      const skin = SKINS.find((s) => s.id === card.dataset.skin)!;
      const unlocked = g.isUnlocked(skin.id);
      card.dataset.locked = String(!unlocked);
      card.setAttribute('aria-pressed', String(unlocked && g.skin.id === skin.id));
      card.setAttribute('aria-label', unlocked ? skin.name : `${skin.name}, bloqueado: llegá a ${skin.goal} m`);
      card.lastElementChild!.textContent = unlocked ? (g.skin.id === skin.id ? 'Elegido' : '') : `🔒 ${skin.goal} m`;
    }
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
      case 'skins':
        this.skinsOpen = true;
        this.refreshSkins();
        this.applyScreen();
        break;
      case 'back':
        this.settingsOpen = false;
        this.skinsOpen = false;
        this.applyScreen();
        break;
      case 'select-skin':
        g.selectSkin(target.dataset.skin ?? '');
        this.refreshSkins();
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
    if (this.settingsOpen || this.skinsOpen) {
      this.settingsOpen = false;
      this.skinsOpen = false;
      this.applyScreen();
    } else {
      this.game.togglePause();
    }
  };
}
