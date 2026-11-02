import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import type { InitParams } from '../src/model/init.ts';
import type { Config, Level } from '../src/types.ts';

export interface TokenPayload {
  /** unique id of the game; the database accepts every id once */
  id: string;
  /** issue time, ms since epoch */
  iat: number;
  /** the setup of the game the token was issued for */
  init: InitParams;
}

const b64 = (b: Buffer): string => b.toString('base64url');

export const newGameId = (): string => b64(randomBytes(12));

const mac = (body: string, secret: string): Buffer => createHmac('sha256', secret).update(body).digest();

/** `<base64url(json)>.<base64url(hmac-sha256)>`: the server stores nothing between starting and finishing a game. */
export function signToken(payload: TokenPayload, secret: string): string {
  const body = b64(Buffer.from(JSON.stringify(payload)));
  return `${body}.${b64(mac(body, secret))}`;
}

export function verifyToken(token: unknown, secret: string): TokenPayload | null {
  if (typeof token !== 'string' || token.length > 2000) return null;
  const [body, sig, ...rest] = token.split('.');
  if (!body || !sig || rest.length > 0) return null;
  const given = Buffer.from(sig, 'base64url');
  const expected = mac(body, secret);
  if (given.length !== expected.length || !timingSafeEqual(given, expected)) return null;
  try {
    const p = JSON.parse(Buffer.from(body, 'base64url').toString('utf8')) as TokenPayload;
    return typeof p.id === 'string' && Number.isFinite(p.iat) && p.init && typeof p.init === 'object' ? p : null;
  } catch {
    return null;
  }
}

const isInt = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v);
const inRange = (v: unknown, [lo, hi]: [number, number]): v is number => isInt(v) && v >= lo && v <= hi;

/** Strict version of resolveInit: the client sends the already resolved setup, so anything out of range is an error. */
export function parseInit(v: unknown, cfg: Config): InitParams | null {
  if (!v || typeof v !== 'object' || Array.isArray(v)) return null;
  const o = v as Record<string, unknown>;
  const l = cfg.limits;
  if (!isInt(o.level) || o.level < 1 || o.level > 3) return null;
  if (!inRange(o.rounds, l.rounds) || !inRange(o.ships, l.ships) || !inRange(o.capitalPerShip, l.capitalPerShip)) return null;
  if (!inRange(o.retries, l.retries) || typeof o.tutorial !== 'boolean' || !Number.isSafeInteger(o.seed)) return null;
  return {
    level: o.level as Level,
    rounds: o.rounds,
    ships: o.ships,
    capitalPerShip: o.capitalPerShip,
    tutorial: o.tutorial,
    retries: o.retries,
    seed: o.seed as number,
  };
}
