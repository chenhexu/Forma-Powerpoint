export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  constructor(
    public current: T,
    private limit = 60,
  ) {}
  commit(next: T) {
    this.past.push(this.current);
    if (this.past.length > this.limit) this.past.shift();
    this.current = next;
    this.future = [];
    return next;
  }
  undo() {
    if (!this.past.length) return this.current;
    this.future.push(this.current);
    return (this.current = this.past.pop()!);
  }
  redo() {
    if (!this.future.length) return this.current;
    this.past.push(this.current);
    return (this.current = this.future.pop()!);
  }
  rebase(transform: (value: T) => T, current: T) {
    this.past = this.past.map(transform);
    this.future = this.future.map(transform);
    this.current = current;
  }
  get canUndo() {
    return this.past.length > 0;
  }
  get canRedo() {
    return this.future.length > 0;
  }
}
