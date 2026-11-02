import { useMemo, useState } from 'react';
import { FleetRow } from './FleetRow';
import { FundRules } from './Rules';
import { PremiumCard } from './PremiumCard';
import { StatsCard } from './StatsCard';
import { forecast as makeForecast } from './model/forecast';
import type { GameState } from './model/game';
import type { Track } from './types';
import { Gold, GiveUpDialog, Header, HelpButton, MuteButton, lodi } from './ui';

interface Props {
  state: GameState;
  /** track of the round being prepared (the forecast reads its real rows) */
  track: Track;
  onPremium: (p: number) => void;
  onSail: () => void;
  onGiveUp: () => void;
}

export function Prepare({ state, track, onPremium, onSail, onGiveUp }: Props) {
  const { cfg, init, round, attempt } = state;
  const [confirm, setConfirm] = useState(false);
  const forecast = useMemo(() => makeForecast(track, state.history, cfg, init.level), [track, state.history, cfg, init.level]);
  const marks =
    init.level === 1
      ? {
          lo: Math.round(forecast.expectedDamage.lo),
          obs: Math.round(forecast.expectedDamage.obs),
          hi: Math.round(forecast.expectedDamage.hi),
        }
      : undefined;
  return (
    <div className="screen">
      <Header title={`Kolo ${round} z ${init.rounds}`}>
        <HelpButton title="Jak to funguje?">
          <FundRules />
        </HelpButton>
        <MuteButton />
      </Header>
      <main className="content">
        <section className="card status-card" aria-label="Stav flotily">
          <ul className="status-list">
            <li>
              <span className="muted">Flotila</span> <strong className="tnum">{state.ships} {lodi(state.ships)}</strong>
            </li>
            <li>
              <span className="muted">Zisk v banku</span> <strong><Gold n={state.bank} /></strong>
            </li>
            <li>
              <span className="muted">Opakování</span> <strong className="tnum">{state.retriesLeft}</strong>
            </li>
            {attempt > 1 && (
              <li>
                <span className="muted">Pokus</span> <strong className="tnum">{attempt}</strong>
              </li>
            )}
          </ul>
          <FleetRow arrived={state.ships} repaired={0} lost={0} ghosts={0} size={20} label={`Flotila má ${state.ships} ${lodi(state.ships)}`} />
          {state.discardedValue !== null && (
            <p className="notice small" role="status">
              Zahozený pokus: <Gold n={state.discardedValue} sign />
            </p>
          )}
        </section>
        <StatsCard forecast={forecast} level={init.level} ships={state.ships} />
        <PremiumCard cfg={cfg} ships={state.ships} premium={state.premium} onChange={onPremium} marks={marks} />
      </main>
      <footer className="actions">
        <button type="button" className="btn primary" onClick={onSail}>
          Vyplout
        </button>
        <button type="button" className="btn danger" onClick={() => setConfirm(true)}>
          Vzdát se
        </button>
      </footer>
      {confirm && <GiveUpDialog onCancel={() => setConfirm(false)} onConfirm={onGiveUp} />}
    </div>
  );
}
