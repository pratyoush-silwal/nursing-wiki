import bcrypt from 'bcryptjs';
import { SignJWT, jwtVerify } from 'jose';
import { credentialsSchema, loginSchema } from '@wiki/shared';
import type { Admin, Repository } from '../models/repository.ts';
import { HttpError } from '../lib/errors.ts';
import { Lock } from '../lib/lock.ts';

export class AuthService {
  private lock = new Lock();
  constructor(private repo: Repository, private secret: string | undefined) {}
  private key() {
    if (!this.secret || this.secret.startsWith('replace-') || Buffer.byteLength(this.secret) < 32) throw new HttpError(503, 'Owner authentication is not configured');
    return new TextEncoder().encode(this.secret);
  }
  async login(input: unknown) {
    const body = loginSchema.parse(input);
    const key = this.key();
    const admin = await this.repo.admin();
    if (!admin || admin.username !== body.username || !await bcrypt.compare(body.password, admin.passwordHash)) throw new HttpError(401, 'Invalid username or password');
    return { token: await new SignJWT({ owner: true, role: 'admin', version: admin.tokenVersion }).setProtectedHeader({ alg: 'HS256' }).setSubject('owner').setIssuer('nursing-wiki').setAudience('nursing-wiki-admin').setIssuedAt().setExpirationTime('7d').sign(key) };
  }
  async authorize(header: string | undefined): Promise<Admin> {
    if (!header?.startsWith('Bearer ')) throw new HttpError(401, 'Owner authentication required');
    const key = this.key();
    let payload;
    try { ({ payload } = await jwtVerify(header.slice(7), key, { algorithms: ['HS256'], issuer: 'nursing-wiki', audience: 'nursing-wiki-admin' })); }
    catch { throw new HttpError(401, 'Session expired or invalid; sign in again'); }
    if (payload.role !== 'admin' || payload.owner !== true || payload.sub !== 'owner') throw new HttpError(403, 'Owner access required');
    const admin = await this.repo.admin();
    if (!admin || payload.version !== admin.tokenVersion) throw new HttpError(401, 'Session revoked; sign in again');
    return admin;
  }
  async change(input: unknown) {
    const body = credentialsSchema.parse(input);
    await this.lock.run(async () => {
      const admin = await this.repo.admin();
      if (!admin || !await bcrypt.compare(body.currentPassword, admin.passwordHash)) throw new HttpError(401, 'Current password is incorrect');
      await this.repo.saveAdmin({ ...admin, username: body.username, passwordHash: await bcrypt.hash(body.password, 12), tokenVersion: admin.tokenVersion + 1, updatedAt: new Date().toISOString() });
    });
  }
}
export async function seedAdmin(repo: Repository, username?: string, password?: string) {
  if (await repo.admin()) return;
  if (!username || !password) return;
  if (password.startsWith('replace-')) throw new Error('Replace the example owner password before seeding');
  credentialsSchema.parse({ currentPassword: password, username, password });
  await repo.seedAdmin({ _id: 'owner', username, passwordHash: await bcrypt.hash(password, 12), tokenVersion: 0, updatedAt: new Date().toISOString() });
}
