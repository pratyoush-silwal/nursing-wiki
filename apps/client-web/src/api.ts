export type Call = <T>(path: string, options?: RequestInit) => Promise<T>;
export const json = (method: string, body: unknown) => ({ method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
