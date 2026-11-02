import { useEffect, useState } from 'react';
import { Game } from './Game';
import { config } from './config';
import { hookAudioUnlock } from './engine/audio';
import { fail, startMinihra } from './minihra-protokol';
import { applyInit, resolveInit, type InitParams } from './model/init';
import type { Config } from './types';

interface Session {
  init: InitParams;
  cfg: Config;
  key: number;
}

export default function App() {
  const [session, setSession] = useState<Session | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    hookAudioUnlock();
    // Every INIT (also a repeated one) starts a new game from the beginning.
    const reject = (code: Parameters<typeof fail>[0], message: string) => {
      fail(code, message);
      setSession(null);
      setFailed(true);
    };
    startMinihra((level, payload) => {
      try {
        const r = resolveInit(level, payload, config, () => Math.random() * 4294967296);
        if (!r.ok) return reject(r.code, r.message);
        setFailed(false);
        setSession((s) => ({ init: r.init, cfg: applyInit(config, r.init), key: (s?.key ?? 0) + 1 }));
      } catch (e) {
        reject('INTERNAL', e instanceof Error ? e.message : String(e));
      }
    });
  }, []);

  if (failed) return <div className="status">Zadání hry se nepodařilo načíst.</div>;
  if (!session) return <div className="status">Načítám…</div>;
  return <Game key={session.key} cfg={session.cfg} init={session.init} />;
}
