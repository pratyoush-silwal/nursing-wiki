export class HttpError extends Error {
  constructor(public statusCode: number, message: string) { super(message); }
}
export function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException)?.code === 'ENOENT';
}
export function isFull(error: unknown): boolean {
  return ['ENOSPC', 'EDQUOT'].includes((error as NodeJS.ErrnoException)?.code ?? '');
}
