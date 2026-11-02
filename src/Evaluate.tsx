import { useEffect, useState, type ReactNode } from 'react';
import { FleetLegend, FleetRow } from './FleetRow';
import { crate, hazardIcon, pearl, stateShip, statusDot } from './art/shapes';
import { ShapeSvg } from './art/ShapeSvg';
import { playSound } from './engine/audio';
import { prefersReducedMotion } from './engine/motion';
import { mistakeCost } from './model/economy';
import { currentRecord, type GameState } from './model/game';
import { observedSurvival } from './model/stats';
import { KIND_INFO, KIND_NAME, observedText } from './StatsCard';
import { KINDS, type RoundSettlement } from './types';
import { WhatIfPanel } from './WhatIf';
import { Gold, GiveUpDialog, Header, HelpButton, Modal, MuteButton, Tip, lodi, num, pct } from './ui';

interface Props {
  state: GameState;
  onNext: () => void;
  onRetry: () => void;
  onGiveUp: () => void;
}

export const STATUS_TEXT = (e: RoundSettlement): string =>
  e.fundStatus === 'short' ? `Fond nestačil, ztraceno ${e.lost} ${lodi(e.lost)}.` : e.fundStatus === 'enough' ? 'Fond stačil.' : 'Fond stačil s přebytkem.';

type Tab = 'breakdown' | 'whatif' | 'observed';

/** Amount with an explicit sign, so a column of rows visibly adds up. */
function Signed({ n }: { n: number }) {
  return (
    <span className={n < 0 ? 'loss' : undefined}>
      <Gold n={n} sign />
    </span>
  );
}

const TABS: { id: Tab; name: string }[] = [
  { id: 'breakdown', name: 'Rozpis' },
  { id: 'whatif', name: 'Co kdyby' },
  { id: 'observed', name: 'Pozorování' },
];

/** One line of a detail panel: icon, short label, value. */
function Row({ icon, label, children }: { icon: ReactNode; label: string; children: ReactNode }) {
  return (
    <div className="stat-row">
      {icon}
      <span className="stat-label">{label}</span>
      <span className="stat-value">{children}</span>
    </div>
  );
}

export function Evaluate({ state, onNext, onRetry, onGiveUp }: Props) {
  const rec = currentRecord(state);
  const [step, setStep] = useState(0);
  const [progress, setProgress] = useState(0);
  const [tab, setTab] = useState<Tab | null>(null);
  const [retryAsk, setRetryAsk] = useState(false);
  const [giveUp, setGiveUp] = useState(false);
  const reduced = prefersReducedMotion();
  const e = rec?.settlement;
  const wreckedTotal = e ? e.wrecked + e.repaired + e.unusedRepairs : 0;
  const fleetMs = Math.min(1500, 30 * wreckedTotal);

  useEffect(() => {
    if (!e) return;
    if (reduced) {
      setProgress(Infinity);
      setStep(3);
      return;
    }
    setProgress(0);
    setStep(0);
    const timers: number[] = [];
    const perShip = wreckedTotal > 0 ? fleetMs / wreckedTotal : 0;
    for (let i = 1; i <= wreckedTotal; i++) timers.push(window.setTimeout(() => setProgress(i), i * perShip));
    timers.push(window.setTimeout(() => setProgress(Infinity), fleetMs + 20));
    for (let s = 1; s <= 3; s++) timers.push(window.setTimeout(() => setStep(s), fleetMs + 300 + (s - 1) * 400));
    return () => timers.forEach((t) => window.clearTimeout(t));
  }, [e, reduced, wreckedTotal, fleetMs]);

  useEffect(() => {
    if (step === 3 && !reduced) playSound('coin');
  }, [step, reduced]);

  if (!rec || !e) return null;
  const cfg = state.cfg;
  const m = cfg.economy.cargoMultiplier;
  const cost = mistakeCost(e, cfg);
  const lastRound = state.round >= state.init.rounds;
  const bankrupt = state.ships <= 0;
  const bad = bankrupt || e.shipsAfter < e.ships / 2;
  const kinds = KINDS.filter((k) => rec.obstacles[k] > 0);
  const nextLabel = lastRound || bankrupt ? 'Zobrazit souhrn' : 'Další kolo';
  const canRetry = state.retriesLeft > 0;
  const shown = (n: number) => step >= n;
  const statusLabel = e.fundStatus === 'short' ? 'Chybělo' : e.fundStatus === 'enough' ? 'Stačilo' : 'Přebytek';

  return (
    <div className="screen">
      <Header title={`Vyhodnocení kola ${state.round}`}>
        <MuteButton />
      </Header>
      <main className="content">
        <section className="card" aria-live="polite">
          <h2>
            Ztroskotalo {e.wrecked} {lodi(e.wrecked)}
          </h2>
          <FleetRow arrived={e.ships - e.wrecked} repaired={e.repaired} lost={e.lost} ghosts={e.unusedRepairs} progress={progress} size={20} />
          <FleetLegend show={{ repaired: e.repaired > 0, lost: e.lost > 0, ghost: e.unusedRepairs > 0 }} />
          {shown(1) && (
            <ul className="tally">
              {kinds.map((k) => (
                <li key={k}>
                  <Tip
                    label={`${KIND_NAME[k]}: ztraceno ${rec.wreckedByKind[k]}`}
                    tip={
                      <>
                        <strong>{KIND_NAME[k]}</strong>
                        <br />
                        {KIND_INFO[k]}
                        <br />
                        Ztraceno {rec.wreckedByKind[k]} z {e.ships} {lodi(e.ships)}.
                      </>
                    }
                  >
                    <ShapeSvg shape={hazardIcon(k)} size={28} />
                    <strong className="tnum">{rec.wreckedByKind[k]}</strong>
                  </Tip>
                </li>
              ))}
              {e.pearls > 0 && (
                <li>
                  <Tip label={`Perly: ${e.pearls}`} tip={`Sebrané perly: ${e.pearls}`}>
                    <ShapeSvg shape={pearl()} size={28} />
                    <strong className="tnum">{e.pearls}</strong>
                  </Tip>
                </li>
              )}
            </ul>
          )}
        </section>

        {shown(2) && (
          <section className="card">
            <div className="status-line">
              <ShapeSvg shape={statusDot(e.fundStatus)} size={26} label={statusLabel} />
              <span>{STATUS_TEXT(e)}</span>
            </div>
            {bankrupt && <p className="cost">Přišel jsi o všechny lodě. Podnikání skončilo.</p>}
          </section>
        )}

        {shown(3) && (
          <section className="card profit-card">
            <h2>Výsledek kola</h2>
            <p className="big" style={{ color: e.value >= 0 ? 'var(--ok)' : 'var(--danger)' }}>
              <Gold n={e.value} sign />
            </p>
            {e.lost > 0 && (
              <div className="result-parts">
                <Row icon={<ShapeSvg shape={crate('profit')} size={22} />} label="Zlato do banku">
                  <Signed n={e.profit} />
                </Row>
                <Row icon={<ShapeSvg shape={stateShip('lost')} size={22} />} label={`Ztraceno ${e.lost} ${lodi(e.lost)}`}>
                  <Signed n={-cost.lostShips} />
                </Row>
              </div>
            )}
            <p className="stat-inline">
              <ShapeSvg shape={stateShip('arrived')} size={20} />
              <strong className="tnum">
                {e.shipsAfter} {lodi(e.shipsAfter)}
              </strong>
              <span className="muted small">do dalšího kola</span>
            </p>
          </section>
        )}

        {shown(3) && (
          <section className="card detail-card">
            <div className="segmented" role="tablist" aria-label="Podrobnosti kola">
              {TABS.map((t) => (
                <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`seg${tab === t.id ? ' on' : ''}`} onClick={() => setTab(tab === t.id ? null : t.id)}>
                  {t.name}
                </button>
              ))}
            </div>

            {tab === 'breakdown' && (
              <div className="detail" role="tabpanel">
                <div className="card-head">
                  <h3>Rozpis kola</h3>
                  <HelpButton title="Rozpis kola">
                    <p>Všechny řádky dohromady dávají výsledek kola. Zlato, které z kola vyjde, jde do banku; lodě se v bance nepočítají, proto je ztráta lodí vedená zvlášť.</p>
                    <p>Zboží ztroskotané lodi je ztraceno, i když se loď opraví. Prodává se jen zboží lodí, které doplouly.</p>
                  </HelpButton>
                </div>

                <h4 className="small muted">Zboží</h4>
                <Row icon={<ShapeSvg shape={crate('cargo')} size={24} />} label="Nákup zboží">
                  <Signed n={-e.cargo} />
                </Row>
                <Row icon={<ShapeSvg shape={crate('cargo')} size={24} />} label={`Prodej zboží (${num(e.delivered)} × ${String(m).replace('.', ',')})`}>
                  <Signed n={Math.round(m * e.delivered)} />
                </Row>
                {e.pearls > 0 && (
                  <Row icon={<ShapeSvg shape={pearl()} size={24} />} label={`Perly ${e.pearls} × ${cfg.economy.pearlValue}`}>
                    <Signed n={e.pearls * cfg.economy.pearlValue} />
                  </Row>
                )}

                <h4 className="small muted">Fond na opravy</h4>
                <Row icon={<ShapeSvg shape={crate('fund')} size={24} />} label="Vloženo do fondu">
                  <Signed n={-e.fund} />
                </Row>
                {e.fundLeft > 0 && (
                  <Row icon={<ShapeSvg shape={crate('fund')} size={24} />} label={`Zbytek fondu (opravy ${num(e.repairCost)})`}>
                    <Signed n={e.fundLeft} />
                  </Row>
                )}

                <Row icon={<ShapeSvg shape={crate('profit')} size={24} />} label="Zlato do banku">
                  <strong>
                    <Signed n={e.profit} />
                  </strong>
                </Row>

                <h4 className="small muted">Lodě</h4>
                {e.lost > 0 ? (
                  <Row icon={<ShapeSvg shape={stateShip('lost')} size={24} />} label={`Ztraceno ${e.lost} ${lodi(e.lost)} × ${num(cfg.economy.shipValue)}`}>
                    <Signed n={-cost.lostShips} />
                  </Row>
                ) : (
                  <Row icon={<ShapeSvg shape={stateShip('arrived')} size={24} />} label="Žádná loď ztracena">
                    <Signed n={0} />
                  </Row>
                )}

                <Row icon={<ShapeSvg shape={crate('profit')} size={24} />} label="Výsledek vč. lodí">
                  <strong>
                    <Signed n={e.value} />
                  </strong>
                </Row>
              </div>
            )}

            {tab === 'whatif' && <WhatIfPanel settlement={e} cfg={cfg} />}

            {tab === 'observed' && (
              <div className="detail" role="tabpanel">
                <div className="card-head">
                  <h3>Pozorované přežití překážky</h3>
                  <HelpButton title="Pozorované přežití">
                    <p>Kolik procent lodí překážku dosud přežilo, včetně zahozených pokusů. Čím víc plaveb, tím spolehlivější číslo.</p>
                  </HelpButton>
                </div>
                {kinds.map((k) => {
                  const o = observedSurvival(state.history, k);
                  return (
                    <div key={k} className="obs-row">
                      <Tip label={`${KIND_NAME[k]}: ${observedText(o, state.history[k].passes)}`} tip={observedText(o, state.history[k].passes)}>
                        <ShapeSvg shape={hazardIcon(k)} size={28} />
                      </Tip>
                      <div className="bar" aria-hidden="true">
                        <span style={{ width: `${Math.round((o ?? 0) * 100)}%` }} />
                      </div>
                      <strong className="tnum obs-pct">{o === null ? '?' : pct(o)}</strong>
                    </div>
                  );
                })}
              </div>
            )}
          </section>
        )}
      </main>
      <footer className="actions">
        <button type="button" className={`btn${canRetry && bad ? '' : ' primary'}`} onClick={onNext}>
          {nextLabel}
        </button>
        {canRetry && (
          <button type="button" className={`btn${bad ? ' primary' : ''}`} onClick={() => setRetryAsk(true)}>
            Zkusit znovu ({state.retriesLeft})
          </button>
        )}
        <button type="button" className="btn danger" onClick={() => setGiveUp(true)}>
          Vzdát se
        </button>
      </footer>
      {retryAsk && (
        <Modal
          title="Zkusit kolo znovu?"
          warn
          onEscape={() => setRetryAsk(false)}
          actions={(ref) => (
            <>
              <button type="button" className="btn primary" ref={ref} onClick={() => setRetryAsk(false)}>
                Ponechat výsledek
              </button>
              <button
                type="button"
                className="btn danger"
                onClick={() => {
                  setRetryAsk(false);
                  onRetry();
                }}
              >
                Zkusit znovu
              </button>
            </>
          )}
        >
          <p>Nový pokus nahradí současný výsledek, i když dopadne hůř.</p>
          <p>
            Výsledek kola vč. lodí: <strong><Gold n={e.value} sign /></strong>. Zbývá opakování: <strong>{state.retriesLeft}</strong>.
          </p>
        </Modal>
      )}
      {giveUp && <GiveUpDialog onCancel={() => setGiveUp(false)} onConfirm={onGiveUp} />}
    </div>
  );
}
