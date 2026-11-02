// Minimal typings for Node's built-in test runner and a few Node globals, so no @types/node dependency is needed.
declare module 'node:test' {
  export function test(name: string, fn: () => void | Promise<void>): void;
  export function describe(name: string, fn: () => void): void;
  export function it(name: string, fn: () => void | Promise<void>): void;
  export function before(fn: () => void | Promise<void>): void;
  export function after(fn: () => void | Promise<void>): void;
}
declare module 'node:assert/strict' {
  const assert: {
    (value: unknown, message?: string): void;
    equal(actual: unknown, expected: unknown, message?: string): void;
    notEqual(actual: unknown, expected: unknown, message?: string): void;
    deepEqual(actual: unknown, expected: unknown, message?: string): void;
    notDeepEqual(actual: unknown, expected: unknown, message?: string): void;
    ok(value: unknown, message?: string): asserts value;
    throws(fn: () => unknown): void;
  };
  export default assert;
}
declare module 'node:fs' {
  export function readFileSync(path: string, encoding: 'utf8'): string;
}
declare module 'node:url' {
  export function fileURLToPath(url: string | URL): string;
}
declare module 'node:crypto' {
  export function createHmac(algorithm: string, key: string): { update(data: string): { digest(): Buffer } };
  export function randomBytes(size: number): Buffer;
  export function timingSafeEqual(a: Buffer, b: Buffer): boolean;
}
declare module 'node:http' {
  interface IncomingMessage extends AsyncIterable<unknown> {
    method?: string;
    url?: string;
  }
  interface ServerResponse {
    writeHead(status: number, headers?: Record<string, string>): ServerResponse;
    end(body?: Buffer): void;
  }
  export function createServer(handler: (req: IncomingMessage, res: ServerResponse) => void): { listen(port: number, onListen?: () => void): void };
}
declare class Buffer {
  readonly length: number;
  static from(data: string | Buffer, encoding?: 'utf8' | 'base64url'): Buffer;
  static from(data: ArrayBuffer): Buffer;
  static concat(list: Buffer[]): Buffer;
  toString(encoding?: 'utf8' | 'base64url'): string;
}
declare const process: {
  argv: string[];
  env: Record<string, string | undefined>;
  exit(code?: number): never;
  exitCode?: number;
  stdout: { write(s: string): void };
};
