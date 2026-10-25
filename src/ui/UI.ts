import type { Game } from '../core/Game';
import { DIFFICULTY_INFO, GAME_MODES, type GameMode } from '../core/modes';
import { TIER_NAMES } from '../rhythm/levels';
import { GRAVITY_CREDITS } from '../rhythm/gravityLevels';
import { gradeOf, popcount } from '../rhythm/RhythmRun';
import { DIFFICULTY_IDS, type DifficultyId } from '../world/Difficulty';
import { GOAL_UNIT, SKINS, goalText, type Skin } from '../core/skins';
import { SkinPreview } from './SkinPreview';
import { TapCounter } from './tapCounter';
import './ui.css';

type ScreenName = 'menu' | 'pause' | 'dead' | 'settings' | 'skins' | 'levels' | 'rdead' | 'complete';

/** Delay before the game-over screen appears, so the death itself is visible first. */
const DEAD_SCREEN_DELAY_MS = 450;
/** Taps on the menu character that unlock everything for the session (the easter egg). */
const SECRET_TAPS = 11;
/** The results of a finished level wait for the confetti a moment longer. */
const COMPLETE_SCREEN_DELAY_MS = 900;
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
    levels: el('screen-levels'),
    rdead: el('screen-rdead'),
    complete: el('screen-complete'),
  };
  private levelsOpen = false;
  private readonly secretTaps = new TapCounter();
  private lastPct = -1;
  private lastTrack = '';
  private lastCombo = -1;
  private readonly toast = el('toast');
  private toastTimer = 0;
  private skinsOpen = false;
  /** One preview per skin card, plus the big one in the main menu. */
  private readonly previews = new Map<string, SkinPreview>();
  private menuPreview: SkinPreview | null = null;
  private previewRaf = 0;
  private previewLast = 0;
  private readonly countdownEl = el('countdown');
  private readonly hudScore = el('hud-score');
  private readonly hudBest = el('hud-best');
  private readonly hudDist = el('hud-dist');
  private readonly hudGoal = el('hud-goal');
  private goalPreview: SkinPreview | null = null;
  private lastGoalTarget: Skin | null = null;
  private lastGoalValue = -1;
  private lastDist = -1;
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
    el('menu-skin').addEventListener('pointerdown', this.onCharacterTap);
    window.addEventListener('keydown', this.onKey);
    game.onState = () => this.sync();
    game.onFrame = () => this.updateHud();
    game.onUnlock = (skin) => this.showToast(skin);
    this.buildSkins();
    this.buildModes();
    this.buildLevels();
    this.menuPreview = new SkinPreview(el<HTMLCanvasElement>('menu-skin'), game.skin);
    this.goalPreview = new SkinPreview(el<HTMLCanvasElement>('hud-goal-skin'), game.skin);
    this.refreshToggles();
    this.sync();
  }

  /** Make the screens/HUD match the game state. */
  private sync(): void {
    const g = this.game;
    window.clearTimeout(this.deadTimer);
    this.deadVisible = false;
    if (g.state === 'dead' || g.state === 'complete') {
      const state = g.state;
      this.deadTimer = window.setTimeout(() => {
        if (g.state !== state) return;
        if (state === 'complete') this.fillComplete();
        else if (g.musical) this.fillRDead();
        else this.fillDead();
        this.deadVisible = true;
        this.applyScreen();
      }, state === 'complete' ? COMPLETE_SCREEN_DELAY_MS : DEAD_SCREEN_DELAY_MS);
    }
    el('cheat-badge').hidden = !g.cheats;
    if (g.state === 'menu') {
      this.refreshModes();
      this.refreshGoal();
      if (this.levelsOpen) this.refreshLevels();
    }
    if (g.state !== 'menu') this.levelsOpen = false;
    this.hud.dataset.mode = g.mode;
    el('hud-practice').hidden = !g.rhythm.practice;
    el('hud-track-name').textContent = g.musical ? g.trackName : '';
    this.lastTrack = '';
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
        return this.deadVisible ? (this.game.musical ? 'rdead' : 'dead') : null;
      case 'complete':
        return this.deadVisible ? 'complete' : null;
      default:
        return null;
    }
  }

  private applyScreen(): void {
    const active: ScreenName | null = this.settingsOpen
      ? 'settings'
      : this.skinsOpen
        ? 'skins'
        : this.levelsOpen && this.game.state === 'menu'
          ? 'levels'
          : this.baseScreen();
    for (const name of Object.keys(this.screens) as ScreenName[]) {
      this.screens[name].dataset.show = String(name === active);
    }
    const st = this.game.state;
    this.hud.dataset.show = String(!this.settingsOpen && !this.skinsOpen && st !== 'menu' && st !== 'dead' && st !== 'complete');
    this.updatePreviewLoop(active);
  }

  /** Animate the skin previews only while one of them is on screen. */
  private updatePreviewLoop(active: ScreenName | null): void {
    const wanted = active === 'skins' || active === 'menu';
    if (!wanted) {
      cancelAnimationFrame(this.previewRaf);
      this.previewRaf = 0;
      return;
    }
    if (this.previewRaf) return;
    this.previewLast = performance.now();
    const frame = (now: number): void => {
      const dt = Math.min(0.05, (now - this.previewLast) / 1000);
      this.previewLast = now;
      if (this.skinsOpen && !this.settingsOpen) {
        for (const p of this.previews.values()) {
          p.fit();
          p.tick(dt);
        }
      } else {
        this.menuPreview?.fit();
        this.menuPreview?.tick(dt);
      }
      this.previewRaf = requestAnimationFrame(frame);
    };
    this.previewRaf = requestAnimationFrame(frame);
  }

  private fillDead(): void {
    const g = this.game;
    el('dead-score').textContent = String(g.score);
    el('dead-dist').textContent = String(g.distance);
    el('dead-best').textContent = String(g.best);
    el('dead-diff').textContent = `${GAME_MODES[0]!.name} · ${DIFFICULTY_INFO[g.difficultyId].name}`;
    el('dead-coins').textContent = String(g.coins);
    el('dead-record').hidden = !g.newRecord;

    const badge = el('dead-unlock');
    badge.hidden = g.unlockedNow.length === 0;
    badge.textContent = `¡Aspecto desbloqueado: ${g.unlockedNow.map((s) => s.name).join(', ')}!`;
    const next = g.nextReward;
    el('dead-next').textContent = next
      ? `Próximo aspecto: ${next.name} · ${goalText(next.goal)} (${Math.min(g.progressOf(next), next.goal.n)}/${next.goal.n})`
      : '';
  }

  private fillRDead(): void {
    const g = this.game;
    if (g.mode === 'secret') {
      el('rdead-name').textContent = g.trackName;
      el('rdead-pct').textContent = `${g.distance} m`;
      el('rdead-fill').style.width = `${Math.min(100, (g.distance / Math.max(1, g.secretBest)) * 100)}%`;
      el('rdead-best').textContent = `${g.secretBest} m`;
      el('rdead-attempt').textContent = `${(g.zone?.index ?? 0) + 1} (zona)`;
      el('rdead-best-badge').hidden = !g.rhythmNewBest;
      el('rdead-tip').textContent = 'Cada intento genera un recorrido nuevo: zonas de saltos, gravedad, bola, nave y onda.';
      return;
    }
    const rec = g.levelRecord(g.rhythm.index);
    el('rdead-name').textContent = g.levels[g.rhythm.index]!.name;
    el('rdead-pct').textContent = `${g.rhythmProgress}%`;
    el('rdead-fill').style.width = `${g.rhythmProgress}%`;
    el('rdead-best').textContent = `${rec.best}%`;
    el('rdead-attempt').textContent = String(rec.attempts);
    el('rdead-best-badge').hidden = !g.rhythmNewBest;
    el('rdead-tip').textContent =
      rec.attempts >= 8 && !rec.done && !g.save.data.practice ? 'Probá el modo Práctica en Niveles: reaparecés en puntos de control.' : 'Escuchá el bombo: los saltos caen en la música.';
  }

  private fillComplete(): void {
    const g = this.game;
    const r = g.rhythm;
    const rec = g.levelRecord(r.index);
    const practice = r.practice;
    el('complete-title').textContent = practice ? '¡Práctica completada!' : '¡Nivel completado!';
    const acc = r.accuracy;
    el('complete-grade').textContent = practice ? '✓' : gradeOf(acc);
    el('complete-grade').dataset.grade = practice ? 'P' : gradeOf(acc);
    el('complete-acc').textContent = `${acc}%`;
    const c = r.counts;
    el('complete-counts').textContent = `${c.perfect} perfectos · ${c.good} bien · ${c.ok} ok${c.miss ? ` · ${c.miss} sin tocar` : ''}`;
    const discos = el('complete-discos');
    discos.replaceChildren();
    for (let i = 0; i < 3; i++) {
      const d = document.createElement('i');
      d.className = 'disco-dot big';
      const now = (r.discoMask >> i) & 1;
      const before = (rec.discos >> i) & 1;
      d.dataset.state = now ? 'new' : before && !practice ? 'old' : 'none';
      discos.append(d);
    }
    discos.append(document.createTextNode(practice ? ' Los discos y récords solo cuentan fuera de práctica.' : ` ${popcount(rec.discos)}/3 discos`));
    const next = r.index + 1;
    const levels = g.levels;
    const hasNext = next < levels.length && g.isLevelUnlocked(next);
    const btn = el('btn-next-level');
    btn.hidden = practice || !hasNext;
    el('complete-next-note').textContent = practice
      ? 'Ahora intentalo sin puntos de control para completarlo de verdad.'
      : next >= levels.length
        ? '¡Completaste toda la gira!'
        : `Desbloqueado: ${levels[next]!.name}`;
    const badge = el('complete-unlock');
    badge.hidden = g.unlockedNow.length === 0;
    badge.textContent = `¡Aspecto desbloqueado: ${g.unlockedNow.map((s) => s.name).join(', ')}!`;
  }

  /** Level cards of the current campaign; rebuilt when the campaign changes, otherwise only refreshed. */
  private builtFor = '';

  private buildLevels(): void {
    const g = this.game;
    if (this.builtFor === g.mode) return;
    this.builtFor = g.mode;
    const gravity = g.mode === 'gravity';
    el('levels-title').textContent = gravity ? 'Modo Gravedad' : 'Modo Ritmo';
    el('levels-sub').textContent = gravity
      ? 'Clásicos de dominio público, remezclados: portales de gravedad, una bola que salta al techo y una nave.'
      : 'Saltá al compás: cada obstáculo cae justo en una nota. Completá un nivel para abrir el siguiente.';
    const list = el('level-list');
    list.replaceChildren();
    g.levels.forEach((lv, i) => {
      const credit = GRAVITY_CREDITS[lv.id];
      const card = document.createElement('button');
      card.className = 'level-card';
      card.dataset.action = 'play-level';
      card.dataset.level = String(i);
      card.innerHTML =
        `<span class="level-num">${i + 1}</span>` +
        `<span class="level-main"><b class="level-name">${lv.name}</b><small class="level-meta">${credit ? `${credit} · ` : ''}${lv.song.bpm} BPM · ${TIER_NAMES[lv.tier]} · ${lv.blurb}</small>` +
        `<i class="level-bar"><b></b></i></span>` +
        `<span class="level-side"><b class="level-pct"></b><span class="level-discos"></span></span>`;
      card.dataset.tier = String(lv.tier);
      list.append(card);
    });
  }

  private refreshLevels(): void {
    const g = this.game;
    this.buildLevels();
    this.root.querySelector('[data-action="toggle-practice"]')?.setAttribute('aria-checked', String(g.save.data.practice));
    for (const card of el('level-list').children as HTMLCollectionOf<HTMLElement>) {
      const i = Number(card.dataset.level);
      const rec = g.levelRecord(i);
      const open = g.isLevelUnlocked(i);
      card.dataset.locked = String(!open);
      card.dataset.done = String(rec.done);
      card.querySelector<HTMLElement>('.level-bar b')!.style.width = `${rec.best}%`;
      card.querySelector<HTMLElement>('.level-pct')!.textContent = !open ? '🔒' : rec.done ? gradeOf(rec.acc) : `${rec.best}%`;
      const d = card.querySelector<HTMLElement>('.level-discos')!;
      d.replaceChildren();
      for (let k = 0; k < 3; k++) {
        const dot = document.createElement('i');
        dot.className = 'disco-dot';
        dot.dataset.state = (rec.discos >> k) & 1 ? 'old' : 'none';
        d.append(dot);
      }
      card.setAttribute(
        'aria-label',
        open ? `Nivel ${i + 1}, ${g.levels[i]!.name}: ${rec.done ? 'completado' : `${rec.best}%`}` : `Nivel ${i + 1} bloqueado: completá el anterior`,
      );
    }
  }

  /** Game-mode chips (the unavailable ones are shown but disabled) and the difficulty selector. */
  private buildModes(): void {
    const row = el('mode-row');
    for (const m of GAME_MODES) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'mode-chip';
      b.dataset.action = 'select-mode';
      b.dataset.mode = m.id;
      b.disabled = !m.available;
      b.textContent = m.tab;
      b.setAttribute('aria-label', `${m.name}: ${m.available ? m.blurb : 'próximamente'}`);
      row.append(b);
    }
    const seg = el('diff-row');
    for (const id of DIFFICULTY_IDS) {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'seg-btn';
      b.dataset.action = 'select-difficulty';
      b.dataset.difficulty = id;
      b.setAttribute('role', 'radio');
      b.textContent = DIFFICULTY_INFO[id].name;
      seg.append(b);
    }
  }

  private refreshModes(): void {
    const g = this.game;
    for (const b of el('mode-row').querySelectorAll<HTMLElement>('.mode-chip')) {
      b.setAttribute('aria-pressed', String(b.dataset.mode === g.mode));
      if (b.dataset.mode === 'secret') b.hidden = !g.cheats;
    }
    const rhythm = g.musical;
    this.screens.menu.dataset.mode = g.mode;
    el('play-label').textContent = g.mode === 'secret' ? 'Jugar Ω' : rhythm ? 'Elegir nivel' : 'Jugar';
    // One headline number per mode under the logo: what the player is chasing there.
    el('menu-stat').innerHTML =
      g.mode === 'secret'
        ? `RÉCORD Ω <b>${g.secretBest} m</b>`
        : rhythm
          ? `NIVELES <b>${g.campaignDone}/${g.levels.length}</b> · DISCOS <b>${g.campaignDiscos}/${g.levels.length * 3}</b>`
          : `RÉCORD <b>${g.best}</b>`;
    el('mode-card').textContent = GAME_MODES.find((m) => m.id === g.mode)?.detail ?? '';
    for (const b of el('diff-row').querySelectorAll<HTMLElement>('.seg-btn')) {
      b.setAttribute('aria-checked', String(b.dataset.difficulty === g.difficultyId));
    }
    el('diff-hint').textContent = DIFFICULTY_INFO[g.difficultyId].blurb;
  }

  private refreshGoal(): void {
    const g = this.game;
    const next = g.nextReward;
    const card = el('goal-card');
    if (!next) {
      el('goal-label').textContent = '¡Todos desbloqueados!';
      el('goal-num').textContent = '';
      el('goal-fill').style.width = '100%';
      card.setAttribute('aria-label', 'Aspectos: todos desbloqueados');
      return;
    }
    const value = Math.min(g.progressOf(next), next.goal.n);
    const num = `${value}/${next.goal.n} ${GOAL_UNIT[next.goal.type]}`;
    el('goal-label').textContent = `Próximo: ${next.name} · ${goalText(next.goal)}`;
    el('goal-num').textContent = num;
    el('goal-fill').style.width = `${(value / next.goal.n) * 100}%`;
    card.setAttribute('aria-label', `Aspectos. Próximo: ${next.name}, ${goalText(next.goal)} (${num})`);
    this.menuPreview?.setSkin(g.skin);
  }

  private showToast(skin: Skin): void {
    this.showMessage(`¡Aspecto desbloqueado: ${skin.name}! ${goalText(skin.goal)}`);
  }

  private showMessage(text: string, ms = 3200): void {
    this.toast.textContent = text;
    this.toast.classList.add('show');
    window.clearTimeout(this.toastTimer);
    this.toastTimer = window.setTimeout(() => this.toast.classList.remove('show'), ms);
  }

  /** Cards are created once; `refreshSkins` only flips their state. */
  private buildSkins(): void {
    const grid = el('skin-grid');
    for (const s of SKINS) {
      const card = document.createElement('button');
      card.className = 'skin-card';
      card.dataset.action = 'select-skin';
      card.dataset.skin = s.id;
      const art = document.createElement('canvas');
      art.className = 'skin-art';
      const name = document.createElement('span');
      name.className = 'skin-name';
      name.textContent = s.name;
      const blurb = document.createElement('span');
      blurb.className = 'skin-blurb';
      blurb.textContent = s.blurb;
      const note = document.createElement('span');
      note.className = 'skin-note';
      const bar = document.createElement('i');
      bar.className = 'skin-bar';
      bar.append(document.createElement('b'));
      card.append(art, name, blurb, note, bar);
      grid.append(card);
      this.previews.set(s.id, new SkinPreview(art, s));
    }
    this.refreshSkins();
  }

  private refreshSkins(): void {
    const g = this.game;
    for (const card of el('skin-grid').children as HTMLCollectionOf<HTMLElement>) {
      const skin = SKINS.find((s) => s.id === card.dataset.skin)!;
      const unlocked = g.isUnlocked(skin.id);
      const note = card.querySelector<HTMLElement>('.skin-note')!;
      const fill = card.querySelector<HTMLElement>('.skin-bar b')!;
      card.dataset.locked = String(!unlocked);
      card.setAttribute('aria-pressed', String(unlocked && g.skin.id === skin.id));
      if (unlocked) {
        card.setAttribute('aria-label', `${skin.name}. ${skin.blurb}`);
        note.textContent = g.skin.id === skin.id ? 'Elegido' : '';
        fill.style.width = '0';
      } else {
        const value = Math.min(g.progressOf(skin), skin.goal.n);
        card.setAttribute('aria-label', `${skin.name}, bloqueado: ${goalText(skin.goal)} (${value} de ${skin.goal.n})`);
        note.textContent = `🔒 ${goalText(skin.goal)} · ${value}/${skin.goal.n}`;
        fill.style.width = `${(value / skin.goal.n) * 100}%`;
      }
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
    if (g.distance !== this.lastDist) {
      this.lastDist = g.distance;
      this.hudDist.textContent = String(g.distance);
    }
    this.updateGoalPill();
    if (g.coins !== this.lastCoins) {
      this.lastCoins = g.coins;
      this.hudCoins.textContent = String(g.coins);
      el('hud-discos').textContent = String(g.coins);
    }
    if (g.mode === 'secret') {
      // Metres instead of %, and the bar shows how far through the current zone the runner is.
      if (g.distance !== this.lastPct) {
        this.lastPct = g.distance;
        el('hud-pct').textContent = `${g.distance} m`;
        const z = g.zone;
        const f = z ? (g.player.x - z.x0) / (z.x1 - z.x0) : 0;
        el('hud-progress-fill').style.transform = `scaleX(${Math.max(0, Math.min(1, f)).toFixed(3)})`;
      }
      const name = g.trackName;
      if (name !== this.lastTrack) {
        this.lastTrack = name;
        el('hud-track-name').textContent = name;
      }
    } else if (g.musical) {
      if (g.rhythmProgress !== this.lastPct) {
        this.lastPct = g.rhythmProgress;
        el('hud-pct').textContent = `${g.rhythmProgress}%`;
        el('hud-progress-fill').style.transform = `scaleX(${g.rhythmProgress / 100})`;
      }
    }
    if (g.musical) {
      const combo = g.rhythm.combo;
      if (combo !== this.lastCombo) {
        this.lastCombo = combo;
        el('hud-combo').textContent = combo >= 4 ? `COMBO ×${combo}` : '';
      }
    }
    if (g.level !== this.lastLevel) {
      this.lastLevel = g.level;
      this.hudLevel.textContent = String(g.level);
    }
    this.updateCountdown();
  }

  /** Live progress towards the skin closest to being earned (same bar as the menu, in miniature). */
  private updateGoalPill(): void {
    const g = this.game;
    const target = g.goalTarget;
    if (target !== this.lastGoalTarget) {
      this.lastGoalTarget = target;
      this.lastGoalValue = -1;
      this.hudGoal.hidden = !target;
      if (target) {
        el('hud-goal-label').textContent = target.name;
        this.goalPreview?.setSkin(target);
        this.goalPreview?.fit();
        this.goalPreview?.tick(0.001); // one still frame is enough for a 30 px icon
      }
    }
    if (!target) return;
    const value = Math.min(g.goalProgress, target.goal.n);
    if (value !== this.lastGoalValue) {
      this.lastGoalValue = value;
      const num = el('hud-goal-num');
      num.textContent = `${value} / ${target.goal.n}`;
      num.dataset.unit = ` ${GOAL_UNIT[target.goal.type]}`; // shown by CSS, dropped on very narrow screens
      el('hud-goal-fill').style.transform = `scaleX(${(value / target.goal.n).toFixed(3)})`;
    }
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
    el('latency-val').textContent = `${d.latency > 0 ? '+' : ''}${d.latency} ms`;
  }

  /** Easter egg: tapping the menu character quickly 11 times unlocks everything for this session. */
  private onCharacterTap = (e: PointerEvent): void => {
    const g = this.game;
    if (g.state !== 'menu' || this.levelsOpen || this.skinsOpen || this.settingsOpen) return;
    e.preventDefault();
    const n = this.secretTaps.tap(performance.now());
    const art = el('menu-skin');
    art.classList.remove('poke');
    void art.offsetWidth; // restart the squash animation
    art.classList.add('poke');
    if (g.cheats) return;
    g.audio.sfx('coin', n);
    if (n >= SECRET_TAPS) {
      this.secretTaps.reset();
      g.setCheats(true);
      this.refreshSkins();
      this.showMessage('¡Modo secreto! Todos los aspectos y niveles desbloqueados en esta sesión.');
    } else if (n >= 6) {
      this.showMessage(`${SECRET_TAPS - n}…`, 600);
    }
  };

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
        if (g.musical && g.mode !== 'secret') {
          this.levelsOpen = true;
          this.refreshLevels();
          this.applyScreen();
        } else {
          g.play();
        }
        break;
      case 'cheats-off':
        g.setCheats(false);
        this.refreshSkins();
        this.menuPreview?.setSkin(g.skin);
        this.showMessage('Modo secreto desactivado: volviste a tu progreso real.');
        break;
      case 'select-mode':
        g.setMode((target.dataset.mode ?? 'endless') as GameMode);
        break;
      case 'play-level':
        if (g.isLevelUnlocked(Number(target.dataset.level))) {
          this.levelsOpen = false;
          g.playLevel(Number(target.dataset.level));
        }
        break;
      case 'toggle-practice':
        g.setPractice(!g.save.data.practice);
        this.refreshLevels();
        break;
      case 'next-level':
        g.nextLevel();
        break;
      case 'replay':
        g.play();
        break;
      case 'levels':
        g.toMenu();
        this.levelsOpen = true;
        this.refreshLevels();
        this.applyScreen();
        break;
      case 'latency-minus':
      case 'latency-plus':
        g.setLatency(g.save.data.latency + (target.dataset.action === 'latency-plus' ? 10 : -10));
        this.refreshToggles();
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
        if (this.settingsOpen) this.settingsOpen = false;
        else if (this.skinsOpen) this.skinsOpen = false;
        else this.levelsOpen = false;
        this.applyScreen();
        break;
      case 'select-difficulty':
        g.setDifficulty((target.dataset.difficulty ?? 'normal') as DifficultyId);
        break;
      case 'select-skin':
        g.selectSkin(target.dataset.skin ?? '');
        this.refreshSkins();
        this.menuPreview?.setSkin(g.skin);
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
    if (this.settingsOpen || this.skinsOpen || (this.levelsOpen && this.game.state === 'menu')) {
      if (this.settingsOpen) this.settingsOpen = false;
      else if (this.skinsOpen) this.skinsOpen = false;
      else this.levelsOpen = false;
      this.applyScreen();
    } else {
      this.game.togglePause();
    }
  };
}
