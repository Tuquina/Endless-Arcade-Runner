/**
 * Collapses keyboard, mouse, touch and pen into one logical button.
 * The game polls it once per fixed step through `poll`.
 */
export class Input {
  private keys = 0;
  private pointers = new Set<number>();
  private pressLatch = false;
  private tapLatch = false;

  constructor(private readonly target: HTMLElement) {
    target.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    window.addEventListener('pointercancel', this.onPointerUp);
    window.addEventListener('keydown', this.onKeyDown);
    window.addEventListener('keyup', this.onKeyUp);
    window.addEventListener('blur', this.releaseAll);
    document.addEventListener('visibilitychange', this.releaseAll);
    // Block scroll / zoom gestures / context menu on the play area.
    target.addEventListener('contextmenu', (e) => e.preventDefault());
    target.addEventListener('touchstart', (e) => e.preventDefault(), { passive: false });
  }

  get down(): boolean {
    return this.keys !== 0 || this.pointers.size > 0;
  }

  /**
   * Read the button state for one simulation step.
   * `pressed` is true once per press (edge); `held` stays true for at least one step after a
   * press so even a very quick tap yields a minimum-height jump.
   */
  poll(out: { pressed: boolean; held: boolean }): void {
    out.pressed = this.pressLatch;
    out.held = this.down || this.tapLatch || this.pressLatch;
    this.tapLatch = this.pressLatch;
    this.pressLatch = false;
  }

  destroy(): void {
    this.target.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    window.removeEventListener('pointercancel', this.onPointerUp);
    window.removeEventListener('keydown', this.onKeyDown);
    window.removeEventListener('keyup', this.onKeyUp);
    window.removeEventListener('blur', this.releaseAll);
    document.removeEventListener('visibilitychange', this.releaseAll);
  }

  private press(): void {
    this.pressLatch = true;
  }

  private onPointerDown = (e: PointerEvent): void => {
    if (e.pointerType === 'mouse' && e.button !== 0) return;
    e.preventDefault();
    this.pointers.add(e.pointerId);
    this.press();
  };

  private onPointerUp = (e: PointerEvent): void => {
    this.pointers.delete(e.pointerId);
  };

  private keyBit(e: KeyboardEvent): number {
    if (e.code === 'Space') return 1;
    if (e.code === 'ArrowUp') return 2;
    return 0;
  }

  private onKeyDown = (e: KeyboardEvent): void => {
    const bit = this.keyBit(e);
    if (!bit) return;
    e.preventDefault();
    if (e.repeat) return;
    this.keys |= bit;
    this.press();
  };

  private onKeyUp = (e: KeyboardEvent): void => {
    this.keys &= ~this.keyBit(e);
  };

  private releaseAll = (): void => {
    this.keys = 0;
    this.pointers.clear();
  };
}
