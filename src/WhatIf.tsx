import { Fragment, useMemo } from 'react';
import { whatIf, type WhatIf, type WhatIfScenario } from './model/whatif';
import type { Config, RoundSettlement } from './types';
import { Gold, lodi, num } from './ui';

const TAG_NAME: Record<WhatIfScenario['tags'][number], string> = {
  played: 'Tvoje volba',
  less: 'Méně peněz ve fondu',
  more: 'Více peněz ve fondu',
  best: 'Nejlepší volba',
  lowestSafe: 'Nejmenší fond bez ztrát',
};

const W = 320;
const H = 170;
const PAD = { l: 8, r: 8, t: 12, b: 24 };

/** Round value for every premium, with the played and the best choice marked and the area where ships are lost shaded. */
function Chart({ data }: { data: WhatIf }) {
  const { points, steps, played, best, lowestSafe } = data;
  const top = points.length - 1;
  const values = points.map((p) => p.settlement.value);
  const lo = Math.min(0, ...values);
  const hi = Math.max(0, ...values);
  const span = hi - lo || 1;
  const x = (p: number) => PAD.l + (p / Math.max(1, top)) * (W - PAD.l - PAD.r);
  const y = (v: number) => PAD.t + ((hi - v) / span) * (H - PAD.t - PAD.b);
  const line = steps.map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.premium).toFixed(1)} ${y(p.settlement.value).toFixed(1)}`).join('');
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((k) => Math.round(k * top));
  const label = `Výsledek kola vč. lodí podle pojistného na loď. Tvoje volba ${played.premium}: ${num(played.settlement.value)}. Nejlepší volba ${best.premium}: ${num(best.settlement.value)}.`;
  return (
    <svg className="whatif-chart" viewBox={`0 0 ${W} ${H}`} role="img" aria-label={label}>
      {lowestSafe.premium > 0 && <rect className="wi-loss" x={x(0)} y={PAD.t} width={x(lowestSafe.premium) - x(0)} height={H - PAD.t - PAD.b} />}
      <line className="wi-zero" x1={x(0)} x2={x(top)} y1={y(0)} y2={y(0)} />
      <path className="wi-line" d={line} />
      <line className="wi-played" x1={x(played.premium)} x2={x(played.premium)} y1={PAD.t} y2={H - PAD.b} />
      <circle className="wi-dot best" cx={x(best.premium)} cy={y(best.settlement.value)} r={5} />
      <circle className="wi-dot played" cx={x(played.premium)} cy={y(played.settlement.value)} r={5} />
      {ticks.map((t) => (
        <Fragment key={t}>
          <line className="wi-tick" x1={x(t)} x2={x(t)} y1={H - PAD.b} y2={H - PAD.b + 4} />
          <text className="wi-text" x={x(t)} y={H - 8} textAnchor={t === 0 ? 'start' : t === top ? 'end' : 'middle'}>
            {t}
          </text>
        </Fragment>
      ))}
    </svg>
  );
}

export function WhatIfPanel({ settlement, cfg }: { settlement: RoundSettlement; cfg: Config }) {
  const data = useMemo(() => whatIf(settlement, cfg), [settlement, cfg]);
  const { played, best } = data;
  const gain = best.settlement.value - played.settlement.value;
  let advice: string;
  if (gain <= 0) advice = 'Pro tuhle plavbu jsi zvolil nejlepší možný fond.';
  else if (played.settlement.lost > 0) advice = `Fond nestačil. S vyšším fondem by se opravily všechny lodě a kolo by vyšlo lépe o`;
  else advice = `Část fondu zbyla a nevydělala jako zboží. S menším fondem by kolo vyšlo lépe o`;
  const wrecked = settlement.wrecked;
  return (
    <div className="detail" role="tabpanel">
      <div className="card-head">
        <h3>Co kdyby</h3>
      </div>
      <p className="small muted">
        Stejná plavba (ztroskotalo {wrecked} {lodi(wrecked)}), jiné pojistné na loď. Čára ukazuje výsledek kola vč. lodí při každém pojistném (osa x); červená oblast je fond, který nestačí na všechny opravy.
      </p>
      <Chart data={data} />
      <div className="wi-legend small">
        <span className="wi-key played" /> tvoje volba <span className="wi-key best" /> nejlepší <span className="wi-key loss" /> ztráta lodí
      </div>
      <table className="whatif-table">
        <thead>
          <tr>
            <th scope="col">Varianta</th>
            <th scope="col">Pojistné</th>
            <th scope="col">Ztraceno</th>
            <th scope="col">Výsledek vč. lodí</th>
          </tr>
        </thead>
        <tbody>
          {data.scenarios.map((s) => {
            const mine = s.tags.includes('played');
            return (
              <tr key={s.point.premium} className={mine ? 'mine' : undefined}>
                <th scope="row">{s.tags.map((t) => TAG_NAME[t]).join(' · ')}</th>
                <td className="tnum">{s.point.premium}</td>
                <td className="tnum">{s.point.settlement.lost > 0 ? `−${s.point.settlement.lost} ${lodi(s.point.settlement.lost)}` : '0'}</td>
                <td>
                  <Gold n={s.point.settlement.value} />
                  {!mine && (
                    <span className={`wi-delta ${s.delta >= 0 ? 'up' : 'down'}`}>
                      {' '}
                      ({s.delta > 0 ? '+' : ''}
                      {num(s.delta)})
                    </span>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p>
        {advice}
        {gain > 0 && (
          <>
            {' '}
            <strong>
              <Gold n={gain} sign />
            </strong>
            {' '}(pojistné {best.premium}).
          </>
        )}
      </p>
      <p className="small muted">Příště bude škoda jiná. Hledej fond, který pokryje typickou škodu, ne jen tuhle; k tomu pomůže záložka Pozorování.</p>
    </div>
  );
}
