import { useMemo, useState } from 'react';
import { FleetLegend, FleetRow } from './FleetRow';
import { PremiumCard, PremiumHelp } from './PremiumCard';
import { FundRules } from './Rules';
import { GestureHint, SailScreen } from './Sail';
import { StatsCard, StatsHelp } from './StatsCard';
import { stateShip, statusDot } from './art/shapes';
import { ShapeSvg } from './art/ShapeSvg';
import { settleRound } from './model/economy';
import { combine } from './model/forecast';
import type { InitParams } from './model/init';
import { averageShip, makeShips } from './model/ships';
import { tutorialTrack } from './model/track';
import type { Config, SailResult } from './types';
import { Explain, GiveUpDialog, Header, HelpButton, MuteButton, lodi } from './ui';
import { STATUS_TEXT } from './Evaluate';

type Step = 'intro' | 'solo' | 'soloEnd' | 'fundIntro' | 'fundSail' | 'fundEval';

interface Props {
  cfg: Config;
  init: InitParams;
  onDone: () => void;
}

/** Unscored tutorial (spec 3.1): first one ship without a fund, then a small fleet with a fund. Fully player-controlled. */
export function Tutorial({ cfg, init, onDone }: Props) {
  const [step, setStep] = useState<Step>('intro');
  const [premium, setPremium] = useState(() => Math.min(cfg.defaults.capitalPerShip, Math.ceil(cfg.economy.repairCost / cfg.tutorial.ships)));
  const [result, setResult] = useState<SailResult | null>(null);
  const [skip, setSkip] = useState(false);
  const [explain, setExplain] = useState(false);
  const track1 = useMemo(() => tutorialTrack(cfg, 1), [cfg]);
  const track2 = useMemo(() => tutorialTrack(cfg, 2), [cfg]);
  const solo = useMemo(() => [averageShip(cfg, init.level)], [cfg, init.level]);
  const fleet = useMemo(() => makeShips(cfg, init.level, init.seed, cfg.tutorial.ships), [cfg, init.level, init.seed]);
  const sample = useMemo(
    () => combine([{ kind: 'kraken', rows: 1, sLo: 0.91, sHi: 0.97, sObs: 0.94, passes: 10 }], cfg.economy.repairCost),
    [cfg.economy.repairCost],
  );

  if (step === 'intro') {
    return (
      <div className="screen">
        <Header title="Tutoriál">
          <MuteButton />
        </Header>
        <main className="content">
          <section className="card center">
            <h2>Nejdřív si zkusíš ovládání</h2>
            <p><strong>Jde o tréninkové kolo, které se nepočítá do výsledku.</strong></p>
            <p>Poplujeme s jednou lodí, která je tvoje firma. Na cestě jsou překážky a ty je odfukuješ z cesty větrem.</p>
            <p>
              Ovládání: <GestureHint />
            </p>
            <p>Až budeš připravený, začni plavbu.</p>
          </section>
        </main>
        <footer className="actions">
          <button type="button" className="btn primary" onClick={() => setStep('solo')}>
            Začít tutoriál
          </button>
          <button type="button" className="btn" onClick={() => setSkip(true)}>
            Přeskočit tutoriál
          </button>
        </footer>
        {skip && <GiveUpDialog tutorial onCancel={() => setSkip(false)} onConfirm={onDone} />}
      </div>
    );
  }

  if (step === 'solo') {
    const t = [track1.rows[0].t, track1.rows[1].t, track1.rows[2].t];
    return (
      <SailScreen
        key="solo"
        cfg={cfg}
        track={track1}
        traits={solo}
        seed={init.seed}
        label="Tutoriál: jedna loď"
        tutorial
        waitForGust
        caption={(hud) =>
          hud.t === 0 ? (
            <>
              Zkus to: odfoukni loď do strany. Překážky se objeví, až to zkusíš. <GestureHint />
            </>
          ) : hud.t < t[0] - 1 ? (
            'Výborně! Za chvíli se objeví první překážky.'
          ) : hud.t < t[1] - 0.2 ? (
            'Piráti hlídají kraje, střed je volný. Za chvíli se objeví kraken, který zavře střed.'
          ) : hud.t < t[2] - 0.3 ? (
            'Kraken je ve středu, odfoukni loď na stranu!'
          ) : hud.t < t[2] + 0.5 ? (
            'Tuhle překážku přes celou šířku nejde obeplout…'
          ) : null
        }
        onDone={() => setStep('soloEnd')}
        onLeave={onDone}
      />
    );
  }

  if (step === 'soloEnd') {
    return (
      <div className="screen">
        <Header title="Konec podnikání">
          <MuteButton />
        </Header>
        <main className="content">
          <section className="card center">
            <ShapeSvg shape={stateShip('lost')} size={96} label="Zničená loď" />
            <h2>Loď se rozbila a firma zbankrotovala.</h2>
            <p>Jedna loď je jedna firma. Když se rozbije a není pojištěná, firma skončí. Co kdyby se firmy pojistily společně?</p>
          </section>
        </main>
        <footer className="actions">
          <button
            type="button"
            className="btn primary"
            onClick={() => {
              setStep('fundIntro');
              setExplain(true);
            }}
          >
            Dál
          </button>
          <button type="button" className="btn" onClick={() => setSkip(true)}>
            Přeskočit tutoriál
          </button>
        </footer>
        {skip && <GiveUpDialog tutorial onCancel={() => setSkip(false)} onConfirm={onDone} />}
      </div>
    );
  }

  if (step === 'fundIntro') {
    const ships = cfg.tutorial.ships;
    return (
      <div className="screen">
        <Header title="Společný fond">
          <HelpButton title="Jak to funguje?">
            <FundRules />
          </HelpButton>
          <MuteButton />
        </Header>
        <main className="content">
          <section className="card">
            <h2>Co kdyby se firmy spojily?</h2>
            <FleetRow arrived={ships} repaired={0} lost={0} ghosts={0} size={24} label={`Flotila má ${ships} ${lodi(ships)}`} />
          </section>
          <StatsCard forecast={sample} level={1} ships={ships} />
          <PremiumCard cfg={cfg} ships={ships} premium={premium} onChange={setPremium} />
        </main>
        <footer className="actions">
          <button type="button" className="btn primary" onClick={() => setStep('fundSail')}>
            Vyplout
          </button>
          <button type="button" className="btn" onClick={() => setSkip(true)}>
            Přeskočit tutoriál
          </button>
        </footer>
        {skip && <GiveUpDialog tutorial onCancel={() => setSkip(false)} onConfirm={onDone} />}
        {explain && (
          <Explain
            onClose={() => setExplain(false)}
            pages={[
              { title: 'Cíl hry', body: <FundRules /> },
              { title: 'Statistika překážek', body: <StatsHelp level={1} /> },
              { title: 'Pojistné a fond', body: <PremiumHelp /> },
            ]}
          />
        )}
      </div>
    );
  }

  if (step === 'fundSail') {
    const last = track2.rows[track2.rows.length - 1].t;
    return (
      <SailScreen
        key="fund"
        cfg={cfg}
        track={track2}
        traits={fleet}
        seed={init.seed}
        label="Tutoriál: flotila"
        tutorial
        caption={(hud) =>
          hud.t < track2.rows[0].t - 0.5 ? (
            <>
              Plují {cfg.tutorial.ships} {lodi(cfg.tutorial.ships)} a ty máš fond. Foukej a zachraň, co jde. <GestureHint />
            </>
          ) : hud.t < last + 0.5 ? (
            'Drž flotilu pohromadě, ať se vejde do průchodu. Uvidíme, co udělá fond.'
          ) : null
        }
        onDone={(r) => {
          setResult(r);
          setStep('fundEval');
        }}
        onLeave={onDone}
      />
    );
  }

  const s = settleRound(premium, cfg.tutorial.ships, result?.wrecked ?? 0, result?.pearls ?? 0, cfg);
  return (
    <div className="screen">
      <Header title="Co udělal fond">
        <MuteButton />
      </Header>
      <main className="content">
        <section className="card">
          <h2>
            Ztroskotalo {s.wrecked} {lodi(s.wrecked)}
          </h2>
          <FleetRow arrived={s.ships - s.wrecked} repaired={s.repaired} lost={s.lost} ghosts={s.unusedRepairs} size={28} />
          <FleetLegend show={{ repaired: s.repaired > 0, lost: s.lost > 0, ghost: s.unusedRepairs > 0 }} />
          <div className="status-line">
            <ShapeSvg shape={statusDot(s.fundStatus)} size={26} />
            <span>{STATUS_TEXT(s)}</span>
          </div>
          <p>{s.lost === 0 ? 'Fond pokryl škodu, všechny lodě pokračují.' : 'Jedna loď je navždy ztracena. V hře dej do fondu víc.'}</p>
        </section>
      </main>
      <footer className="actions">
        <button type="button" className="btn primary" onClick={onDone}>
          Začít hru
        </button>
      </footer>
    </div>
  );
}
