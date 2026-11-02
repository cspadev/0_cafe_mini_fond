import { useEffect, useState } from 'react';
import { FleetRow } from './FleetRow';
import { ComparisonCard, type ComparisonState } from './Comparison';
import { crate, hazardIcon, statusDot } from './art/shapes';
import { ShapeSvg } from './art/ShapeSvg';
import { finalRate, type GameState } from './model/game';
import { summarizeGame } from './model/summary';
import type { Comparison } from './model/telemetry';
import { KIND_NAME } from './StatsCard';
import { Gold, Header, MuteButton, lodi, num, pct } from './ui';

interface Props {
  state: GameState;
  /** sends the game to the statistics server and resolves to the comparison with other players (null when unavailable) */
  comparison: () => Promise<Comparison | null>;
  onContinue: () => void;
  /** starts a completely new game without the tutorial */
  onReplay: () => void;
}

const ENDING_TEXT = {
  completed: 'Odplul jsi všechna kola.',
  gaveUp: 'Vzdal ses. Nehraná kola se počítají jako nula.',
  bankrupt: 'Přišel jsi o všechny lodě. Podnikání skončilo.',
} as const;

const STATUS_LABEL = { short: 'chybělo', enough: 'stačilo', surplus: 'přebytek' } as const;

export function Summary({ state, comparison, onContinue, onReplay }: Props) {
  const [sent, setSent] = useState(false);
  const [compared, setCompared] = useState<ComparisonState>('loading');
  useEffect(() => {
    let live = true;
    void comparison().then((c) => live && setCompared(c));
    return () => {
      live = false;
    };
    // the game is sent once, when the summary appears
  }, []);
  const { cfg, init } = state;
  const rate = finalRate(state);
  const n0 = init.ships;
  const sum = summarizeGame(state.records, n0, init.rounds, cfg);
  const shipsWorth = state.ships * cfg.economy.shipValue;
  const used = init.retries - state.retriesLeft;
  const rows = Array.from({ length: init.rounds }, (_, i) => state.records.find((r) => r.round === i + 1) ?? null);
  return (
    <div className="screen">
      <Header title="Souhrn">
        <MuteButton />
      </Header>
      <main className="content">
        <section className="card center">
          <p>{ENDING_TEXT[state.ending ?? 'gaveUp']}</p>
          <p className="muted small">Zlato v bance</p>
          <p className="huge tnum">
            <Gold n={state.bank} />
          </p>
          <p className="tnum" aria-label={`Úspěšnost ${pct(rate)}`}>
            {pct(rate)} maxima
          </p>
          <table className="score-table tnum">
            <thead>
              <tr>
                <td />
                <th scope="col">Máš</th>
                <th scope="col">Maximum</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <th scope="row">Zlato</th>
                <td>
                  <Gold n={state.bank} />
                </td>
                <td>
                  <Gold n={sum.targetProfit} />
                </td>
              </tr>
              <tr>
                <th scope="row">Hodnota lodí</th>
                <td>
                  <Gold n={shipsWorth} />
                </td>
                <td>
                  <Gold n={sum.targetShips} />
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr>
                <th scope="row">Celkem</th>
                <td>
                  <Gold n={state.bank + shipsWorth} />
                </td>
                <td>
                  <Gold n={sum.targetProfit + sum.targetShips} />
                </td>
              </tr>
            </tfoot>
          </table>
        </section>

        {state.ending !== 'gaveUp' && <ComparisonCard state={compared} />}

        <section className="card">
          <h2>Flotila</h2>
          <p className="small muted">Na začátku: {n0} {lodi(n0)}</p>
          <FleetRow arrived={n0} repaired={0} lost={0} ghosts={0} size={20} label={`Na začátku ${n0} ${lodi(n0)}`} />
          <p className="small muted">Na konci: {state.ships} {lodi(state.ships)}</p>
          <FleetRow arrived={state.ships} repaired={0} lost={n0 - state.ships} ghosts={0} size={20} label={`Na konci ${state.ships} ${lodi(state.ships)}, ztraceno ${n0 - state.ships}`} />
        </section>

        <section className="card">
          <h2>Kola</h2>
          <table className="rounds-table tnum">
            <thead>
              <tr>
                <th scope="col">Kolo</th>
                <th scope="col">Fond</th>
                <th scope="col">Pojistné</th>
                <th scope="col">
                  <ShapeSvg shape={crate('fund')} size={18} label="Fond ve zlatých" />
                </th>
                <th scope="col">Ztraceno</th>
                <th scope="col">Výsledek</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r, i) => (
                <tr key={i}>
                  <th scope="row">{i + 1}</th>
                  {r ? (
                    <>
                      <td>
                        <ShapeSvg shape={statusDot(r.settlement.fundStatus)} size={18} label={STATUS_LABEL[r.settlement.fundStatus]} />
                      </td>
                      <td>{r.settlement.premium}</td>
                      <td>{num(r.settlement.fund)}</td>
                      <td>{r.settlement.lost}</td>
                      <td>{num(r.settlement.value)}</td>
                    </>
                  ) : (
                    <td colSpan={5} className="muted">
                      nehráno
                    </td>
                  )}
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <h2>Překážky</h2>
          <table className="rounds-table tnum">
            <thead>
              <tr>
                <th scope="col">Překážka</th>
                <th scope="col">Počet</th>
                <th scope="col">Přežilo</th>
                <th scope="col">Úspěšnost</th>
              </tr>
            </thead>
            <tbody>
              {sum.kinds.map((k) => (
                <tr key={k.kind}>
                  <th scope="row">
                    <ShapeSvg shape={hazardIcon(k.kind)} size={18} label={KIND_NAME[k.kind]} /> {KIND_NAME[k.kind]}
                  </th>
                  <td>{k.rows}</td>
                  <td>{k.rate === null ? '–' : `${k.survived} z ${k.entered}`}</td>
                  <td>{k.rate === null ? '–' : pct(k.rate)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </section>

        <section className="card">
          <dl className="totals">
            <div>
              <dt>Odehraná kola</dt>
              <dd className="tnum">
                {sum.played} z {init.rounds}
              </dd>
            </div>
            {sum.best && sum.worst && sum.played > 1 && (
              <>
                <div>
                  <dt>Nejlepší kolo</dt>
                  <dd className="tnum">
                    {sum.best.round}. (<Gold n={sum.best.settlement.value} sign />)
                  </dd>
                </div>
                <div>
                  <dt>Nejhorší kolo</dt>
                  <dd className="tnum">
                    {sum.worst.round}. (<Gold n={sum.worst.settlement.value} sign />)
                  </dd>
                </div>
              </>
            )}
            <div>
              <dt>Ztroskotalo / opraveno / ztraceno</dt>
              <dd className="tnum">
                {sum.wrecked} / {sum.repaired} / {sum.lost}
              </dd>
            </div>
            <div>
              <dt>Perly</dt>
              <dd className="tnum">{num(sum.pearls)}</dd>
            </div>
            <div>
              <dt>Využití opakování</dt>
              <dd className="tnum">
                {used} z {init.retries}
              </dd>
            </div>
          </dl>
        </section>
      </main>
      <footer className="actions">
        <button type="button" className="btn" disabled={sent} onClick={onReplay}>
          Hrát znovu
        </button>
        <button
          type="button"
          className="btn primary"
          disabled={sent}
          onClick={() => {
            setSent(true);
            onContinue();
          }}
        >
          Pokračovat
        </button>
      </footer>
    </div>
  );
}
