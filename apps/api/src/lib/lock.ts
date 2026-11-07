// One API process owns the local volume; serialize mutations with worker commits.
export class Lock {
  private tail: Promise<unknown> = Promise.resolve();
  async run<T>(work: () => Promise<T>): Promise<T> {
    const next = this.tail.then(work, work);
    this.tail = next.catch(() => {});
    return next;
  }
}
