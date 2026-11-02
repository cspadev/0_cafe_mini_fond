import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { hazardIcon } from '../art/shapes';
import { ShapeSvg } from '../art/ShapeSvg';
import { BarChart, BoxPlot, Legend, LineChart } from '../charts';
import { config } from '../config';
import type { DataStats, FormationStat, LeaderboardOrder, Quantiles, SetupInfo, SetupKey, SurvivalCount } from '../model/dataset';
import { HISTOGRAM_BINS } from '../model/telemetry';
import type { Kind } from '../types';
import { num, pct } from '../ui';

const KIND_NAME: Record<Kind, string> = { pirates: 'Piráti', kraken: 'Kraken', storm: 'Bouře' };
const KIND_ORDER: Record<Kind, number> = { pirates: 0, kraken: 1, storm: 2 };
const FEW_GAMES = 30;

const setupLabel = (s: SetupKey): string => `Úroveň ${s.level} · ${s.rounds} kol · ${s.ships} lodí · kapitál ${s.capital}`;
const queryOf = (s: SetupKey): string => `level=${s.level}&rounds=${s.rounds}&ships=${s.ships}&capital=${s.capital}`;
const rate = (c: SurvivalCount): number => (c.entered > 0 ? c.survived / c.entered : 0);
const range = (q: Quantiles): string => `${num(q.p25)} – ${num(q.p75)}`;

type Load = { state: 'loading' } | { state: 'error'; status: number } | { state: 'ok'; stats: DataStats };

function useStats(query: string): Load {
  const [load, setLoad] = useState<Load>({ state: 'loading' });
  useEffect(() => {
    const ctl = new AbortController();
    setLoad({ state: 'loading' });
    fetch(`/api/stats${query ? `?${query}` : ''}`, { signal: ctl.signal })
      .then(async (r) => setLoad(r.ok ? { state: 'ok', stats: (await r.json()) as DataStats } : { state: 'error', status: r.status }))
      .catch((e: unknown) => {
        if (!ctl.signal.aborted) setLoad({ state: 'error', status: e instanceof Error ? 0 : -1 });
      });
    return () => ctl.abort();
  }, [query]);
  return load;
}

export function DataPage() {
  const [query, setQuery] = useState(() => window.location.search.replace(/^\?/, ''));
  const load = useStats(query);
  const choose = (s: SetupKey) => {
    const q = queryOf(s);
    window.history.replaceState(null, '', `?${q}`);
    setQuery(q);
  };

  return (
    <main className="data-page">
      <header className="data-head">
        <div>
          <h1>Lodní fond – data hráčů</h1>
          <p className="note">Anonymní souhrn odehraných her (verze skóre {load.state === 'ok' ? load.stats.scoreVersion : '…'}, starší verze se nepočítají). Do statistik se počítá jen poslední pokus každého kola.</p>
        </div>
        {load.state === 'ok' && load.stats.setup && load.stats.setups.length > 0 && (
          <label>
            <span className="visually-hidden">Zadání hry</span>
            <select value={queryOf(load.stats.setup)} onChange={(e) => choose(parseQuery(e.target.value))}>
              {setupOptions(load.stats).map((s) => (
                <option key={queryOf(s)} value={queryOf(s)}>
                  {setupLabel(s)} ({s.games} her)
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      {load.state === 'loading' && <p className="status">Načítám…</p>}
      {load.state === 'error' && (
        <p className="status">{load.status === 503 ? 'Statistiky nejsou na serveru nastavené (DATABASE_URL, SCORE_SECRET).' : 'Data se nepodařilo načíst.'}</p>
      )}
      {load.state === 'ok' && <Dashboard stats={load.stats} />}
    </main>
  );
}

/** The setups to choose from; a setup asked for in the address that nobody played yet is listed too. */
function setupOptions(stats: DataStats): SetupInfo[] {
  const { setup, setups } = stats;
  return !setup || setups.some((s) => queryOf(s) === queryOf(setup)) ? setups : [...setups, { ...setup, games: 0, finished: 0 }];
}

function parseQuery(q: string): SetupKey {
  const p = new URLSearchParams(q);
  return { level: Number(p.get('level')), rounds: Number(p.get('rounds')), ships: Number(p.get('ships')), capital: Number(p.get('capital')) };
}

function Card({ title, children, wide }: { title: string; children: ReactNode; wide?: boolean }) {
  return (
    <section className={`card${wide ? ' wide' : ''}`}>
      <h2>{title}</h2>
      {children}
    </section>
  );
}

function Dashboard({ stats }: { stats: DataStats }) {
  const [tab, setTab] = useState<(typeof TABS)[number]['id']>('overview');
  const info: SetupInfo | undefined = useMemo(
    () => stats.setups.find((s) => stats.setup && queryOf(s) === queryOf(stats.setup)),
    [stats],
  );
  if (!stats.setup || stats.games.total === 0) {
    return <p className="status">Pro toto zadání zatím nejsou žádná data.</p>;
  }
  const finished = info?.finished ?? stats.games.total - stats.games.gaveUp;
  return (
    <>
      <div className="segmented" role="tablist" aria-label="Část stránky">
        {TABS.map((t) => (
          <button key={t.id} type="button" role="tab" aria-selected={tab === t.id} className={`seg${tab === t.id ? ' on' : ''}`} onClick={() => setTab(t.id)}>
            {t.label}
          </button>
        ))}
      </div>
      {tab === 'leaderboard' ? (
        <Leaderboard stats={stats} />
      ) : (
        <Overview stats={stats} finished={finished} />
      )}
    </>
  );
}

const TABS = [
  { id: 'overview', label: 'Přehled' },
  { id: 'leaderboard', label: 'Žebříček nejlepších' },
] as const;

function Overview({ stats, finished }: { stats: DataStats; finished: number }) {
  return (
    <>
      <section className="card">
        <dl className="stat-tiles tnum">
          <div>
            <dt>Odehraných her</dt>
            <dd>{num(stats.games.total)}</dd>
          </div>
          <div>
            <dt>Dohraných</dt>
            <dd>{num(finished)}</dd>
          </div>
          <div>
            <dt>Vzdaných</dt>
            <dd>{num(stats.games.gaveUp)}</dd>
          </div>
          <div>
            <dt>Zkrachovalých</dt>
            <dd>{num(stats.games.bankrupt)}</dd>
          </div>
        </dl>
        {stats.games.total < FEW_GAMES && <p className="note">Her je zatím málo, hodnoty jsou jen orientační.</p>}
      </section>
      <div className="data-grid">
        <ScoreCard stats={stats} />
        <SurvivalByKind stats={stats} />
        <Formations stats={stats} />
        <ShipsPerRound stats={stats} />
        <PremiumCards stats={stats} />
        <Retries stats={stats} />
      </div>
    </>
  );
}

const ORDERS: { id: LeaderboardOrder; label: string }[] = [
  { id: 'total', label: 'Celkové skóre' },
  { id: 'profit', label: 'Zlato v bance' },
  { id: 'fleet', label: 'Hodnota lodí' },
];

const dateOf = (iso: string): string =>
  new Date(iso).toLocaleString('cs-CZ', { day: 'numeric', month: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit' });
const minutes = (s: number): string => `${Math.floor(s / 60)}:${String(Math.round(s % 60)).padStart(2, '0')}`;

function Leaderboard({ stats }: { stats: DataStats }) {
  const [order, setOrder] = useState<LeaderboardOrder>('total');
  const rows = stats.leaderboard[order];
  return (
    <Card title="Nejlepších 20 her" wide>
      <div className="segmented" role="tablist" aria-label="Řazení žebříčku">
        {ORDERS.map((o) => (
          <button key={o.id} type="button" role="tab" aria-selected={order === o.id} className={`seg${order === o.id ? ' on' : ''}`} onClick={() => setOrder(o.id)}>
            {o.label}
          </button>
        ))}
      </div>
      {rows.length === 0 ? (
        <p className="note">Zatím není žádná dohraná hra.</p>
      ) : (
        <div className="table-scroll">
          <table className="leaderboard tnum">
            <thead>
              <tr>
                <th>#</th>
                <th>Odehráno</th>
                <th className={order === 'total' ? 'sorted' : ''}>Celkem</th>
                <th className={order === 'profit' ? 'sorted' : ''}>Zlato</th>
                <th className={order === 'fleet' ? 'sorted' : ''}>Lodě (hodnota)</th>
                <th>Lodí na konci</th>
                <th>Kola</th>
                <th>Pojistné ø</th>
                <th>Z maxima</th>
                <th>Perly</th>
                <th>Opakování</th>
                <th>Čas</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={`${r.playedAt}-${r.rank}`}>
                  <td>{r.rank}</td>
                  <td>{dateOf(r.playedAt)}</td>
                  <td className={order === 'total' ? 'sorted' : ''}>{num(r.total)}</td>
                  <td className={order === 'profit' ? 'sorted' : ''}>{num(r.profit)}</td>
                  <td className={order === 'fleet' ? 'sorted' : ''}>{num(r.fleet)}</td>
                  <td>{num(r.finalShips)}</td>
                  <td>
                    {r.roundsPlayed}/{r.plannedRounds}
                    {r.ending === 'bankrupt' && <span className="muted"> krach</span>}
                  </td>
                  <td>{r.avgPremium === null ? '–' : num(r.avgPremium)}</td>
                  <td>{pct(r.successRate)}</td>
                  <td>{num(r.pearls)}</td>
                  <td>{r.retriesUsed}</td>
                  <td>{minutes(r.durationS)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <p className="note">
        Dohrané hry tohoto zadání (verze skóre {stats.scoreVersion}); při shodě je výš dřívější hra.         Celkem = zlato v bance + hodnota lodí. Z maxima je celkové skóre jako podíl teoretického maxima ({num(stats.reference)}), pojistné je průměr na loď
                přes odehraná kola.
      </p>
    </Card>
  );
}

function ScoreCard({ stats }: { stats: DataStats }) {
  const s = stats.score;
  return (
    <Card title="Celkové skóre">
      {s ? (
        <>
          <BarChart
            values={s.bins}
            ends={['0', num(stats.reference)]}
            titles={s.bins.map((n, i) => `${num((i * stats.reference) / HISTOGRAM_BINS)} – ${num(((i + 1) * stats.reference) / HISTOGRAM_BINS)}: ${n} her`)}
            label={`Rozdělení celkového skóre ${s.n} dohraných her`}
          />
          <p className="tnum">
            Medián <strong>{num(s.q.p50)}</strong>, průměr {num(s.mean)}. Prostředních 80 % her: {num(s.q.p10)} – {num(s.q.p90)}.
          </p>
          <p className="tnum">
            Medián zlata v bance {num(s.profit.p50)} ({num(s.profit.p10)} – {num(s.profit.p90)}), medián hodnoty lodí {num(s.fleet.p50)} ({num(s.fleet.p10)} –{' '}
            {num(s.fleet.p90)}). Hra trvá typicky {minutes(s.durationMedian)} min.
          </p>
          <p className="note">Zlato v bance + hodnota lodí na konci, dohrané hry. Vpravo je teoretické maximum ({num(stats.reference)}).</p>
        </>
      ) : (
        <p className="note">Zatím není žádná dohraná hra.</p>
      )}
    </Card>
  );
}

function SurvivalRow({ name, icon, c }: { name: string; icon?: ReactNode; c: SurvivalCount }) {
  const r = rate(c);
  return (
    <li className="bar-row">
      <span className="name">
        {icon}
        {name}
      </span>
      <span className={`track${r < 0.6 ? ' low' : ''}`} role="img" aria-label={`Přežije ${pct(r)}`}>
        <span style={{ width: `${r * 100}%` }} />
      </span>
      <span className="value tnum">
        {pct(r)} <span className="muted">({num(c.survived)} z {num(c.entered)})</span>
      </span>
    </li>
  );
}

function SurvivalByKind({ stats }: { stats: DataStats }) {
  return (
    <Card title="Přežití podle druhu překážky">
      <ul className="bars">
        {[...stats.kinds]
          .sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind])
          .map((k) => (
            <SurvivalRow key={k.kind} name={KIND_NAME[k.kind]} icon={<ShapeSvg shape={hazardIcon(k.kind)} size={20} />} c={k} />
          ))}
      </ul>
      <p className="note">Podíl lodí, které uskupení daného druhu přežily, ze všech lodí, které do něj vplouvaly.</p>
    </Card>
  );
}

function Glyph({ id, kind }: { id: string; kind: Kind }) {
  const rows = config.formations.find((f) => f.id === id)?.rows ?? [];
  return (
    <div className="glyph" role="img" aria-label={`Uskupení ${id}: ${rows.join(', ')}`}>
      {rows.map((row, i) => (
        <div className="line" key={i}>
          {row.split('').map((c, j) => (
            <span key={j} className={`cell${c === '.' ? ' free' : ''}`}>
              {c !== '.' && <ShapeSvg shape={hazardIcon(kind)} size={16} />}
            </span>
          ))}
        </div>
      ))}
    </div>
  );
}

function Formations({ stats }: { stats: DataStats }) {
  const sorted = [...stats.formations].sort((a, b) => KIND_ORDER[a.kind] - KIND_ORDER[b.kind] || rate(a) - rate(b));
  return (
    <Card title="Přežití podle uskupení překážek" wide>
      <div className="data-grid">
        {sorted.map((f: FormationStat) => (
          <div key={f.formation} className="formation">
            <Glyph id={f.formation} kind={f.kind} />
            <ul className="bars">
              <SurvivalRow name={f.formation} c={f} />
              {f.rows.length > 1 && (
                <li className="rows-detail tnum">
                  {f.rows.map((r, i) => (
                    <span key={i}>
                      {i + 1}. řada {pct(rate(r))}
                    </span>
                  ))}
                </li>
              )}
              <li className="note">
                {KIND_NAME[f.kind]}, {num(f.instances)}× na trati
              </li>
            </ul>
          </div>
        ))}
      </div>
      <p className="note">Uskupení jsou seřazená podle druhu a od nejnebezpečnějšího. U víceřadých je vidět přežití v každé řadě zvlášť.</p>
    </Card>
  );
}

function ShipsPerRound({ stats }: { stats: DataStats }) {
  if (stats.ships.length === 0) return null;
  return (
    <Card title="Počet lodí na začátku kola">
      <BoxPlot
        label="Rozdělení počtu lodí na začátku jednotlivých kol"
        items={stats.ships.map((r) => ({
          label: `${r.round}.`,
          min: r.min,
          p10: r.q.p10,
          p25: r.q.p25,
          p50: r.q.p50,
          p75: r.q.p75,
          p90: r.q.p90,
          max: r.max,
          title: `Kolo ${r.round}: medián ${num(r.q.p50)}, průměr ${num(r.mean)}, ${num(r.n)} her`,
        }))}
      />
      <p className="note">Krabice: prostředních 50 % her, čárky: 10.–90. percentil, čára: medián, tečky: minimum a maximum.</p>
    </Card>
  );
}

function PremiumCards({ stats }: { stats: DataStats }) {
  const { perGame, perRound, best } = stats.premium;
  const buckets = useMemo(() => {
    if (perGame.length === 0) return null;
    const width = perGame[0].width;
    const from = perGame[0].from;
    const count = (perGame[perGame.length - 1].from - from) / width + 1;
    return Array.from({ length: count }, (_, i) => perGame.find((b) => b.from === from + i * width) ?? null).map((b, i) => ({ b, from: from + i * width, width }));
  }, [perGame]);
  const premiums = useMemo(() => {
    if (perRound.length === 0) return null;
    const lo = perRound[0].premium;
    const hi = perRound[perRound.length - 1].premium;
    return Array.from({ length: hi - lo + 1 }, (_, i) => ({ premium: lo + i, row: perRound.find((r) => r.premium === lo + i) ?? null }));
  }, [perRound]);

  return (
    <>
      <Card title="Pojistné a celkové skóre">
        {buckets ? (
          <>
            <BarChart
              values={buckets.map((x) => x.b?.median ?? 0)}
              marks={buckets.map((x) => x.b?.p90 ?? null)}
              ends={[`${buckets[0].from}`, `${buckets[buckets.length - 1].from + buckets[0].width}`]}
              titles={buckets.map((x) => (x.b ? `Průměrné pojistné ${x.from}–${x.from + x.width - 1}: medián ${num(x.b.median)}, 90. percentil ${num(x.b.p90)}, ${x.b.n} her` : 'žádná hra'))}
              label="Medián celkového skóre podle průměrného pojistného hráče"
            />
            <p className="note">
              Pojistné na loď, průměr přes kola hry (zlatých), proti celkovému skóre dohraných her. Sloupec je medián, zlatá čárka 90. percentil.
            </p>
          </>
        ) : (
          <p className="note">Zatím žádná data.</p>
        )}
      </Card>
      <Card title="Nejlepší desetina hráčů">
        {best ? (
          <>
            <dl className="stat-tiles tnum">
              <div>
                <dt>Hranice skóre</dt>
                <dd>{num(best.threshold)}</dd>
              </div>
              <div>
                <dt>Z cíle</dt>
                <dd>{pct(best.thresholdRate)}</dd>
              </div>
              <div>
                <dt>Typické pojistné</dt>
                <dd>{num(best.premium.p50)}</dd>
              </div>
            </dl>
            <p className="tnum">
              K nejlepší desetině ({num(best.games)} her) patří celkové skóre od {num(best.threshold)} zlatých. Volí pojistné na loď nejčastěji kolem{' '}
              <strong>{num(best.premium.p50)}</strong> zlatých (prostředních 50 % kol: {range(best.premium)}).
            </p>
            <LineChart
              labels={best.byRound.map((r) => `${r.round}.`)}
              series={[
                { name: 'best', cls: 'a', values: best.byRound.map((r) => r.best) },
                { name: 'all', cls: 'b', values: best.byRound.map((r) => r.all) },
              ]}
              label="Medián pojistného v jednotlivých kolech, nejlepší desetina a všichni hráči"
            />
            <Legend items={[{ cls: 'a', text: 'nejlepší desetina' }, { cls: 'b', text: 'všechny dohrané hry' }]} />
          </>
        ) : (
          <p className="note">Zatím není žádná dohraná hra.</p>
        )}
      </Card>
      {premiums && (
        <Card title="Výsledek kola podle zvoleného pojistného" wide>
          <BarChart
            values={premiums.map((p) => Math.max(0, p.row?.meanValue ?? 0))}
            ends={[`${premiums[0].premium}`, `${premiums[premiums.length - 1].premium}`]}
            titles={premiums.map((p) =>
              p.row ? `Pojistné ${p.premium}: průměrný výsledek kola ${num(p.row.meanValue)}, ztroskotá ${pct(p.row.wreckRate)} lodí, ${num(p.row.n)} kol` : `Pojistné ${p.premium}: nevoleno`,
            )}
            label="Průměrný výsledek kola podle zvoleného pojistného na loď"
            width={960}
            height={160}
          />
          <p className="note">Průměrný výsledek kola (zisk včetně ceny ztracených lodí) podle pojistného na loď zvoleného v tom kole. Záporné hodnoty se v grafu neukazují, najeď myší na sloupec.</p>
        </Card>
      )}
    </>
  );
}

function Retries({ stats }: { stats: DataStats }) {
  const r = stats.retries;
  if (r.distribution.length === 0) return null;
  const max = r.distribution[r.distribution.length - 1].used;
  const counts = Array.from({ length: max + 1 }, (_, i) => r.distribution.find((d) => d.used === i)?.games ?? 0);
  return (
    <Card title="Opakování kol">
      <BarChart
        values={counts}
        ends={['0', `${max}`]}
        titles={counts.map((n, i) => `${i} opakování: ${n} her`)}
        label="Počet her podle počtu využitých opakování kola"
        height={100}
      />
      <p className="tnum">
        Zahozených pokusů: <strong>{num(r.discardedAttempts)}</strong>
        {r.meanDiscardedValue !== null && r.meanKeptValue !== null && (
          <>
            . Zahozený pokus vynesl průměrně {num(r.meanDiscardedValue)}, ten, který ho nahradil, {num(r.meanKeptValue)}.
          </>
        )}
      </p>
      <p className="note">Zahozené pokusy se ukládají zvlášť a do ostatních statistik se nepočítají.</p>
    </Card>
  );
}
