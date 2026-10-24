/** Minimal object pool: objects are created lazily, then recycled so the game loop never allocates. */
export class Pool<T> {
  private free: T[] = [];

  constructor(private readonly create: () => T) {}

  acquire(): T {
    return this.free.pop() ?? this.create();
  }

  release(item: T): void {
    this.free.push(item);
  }
}
