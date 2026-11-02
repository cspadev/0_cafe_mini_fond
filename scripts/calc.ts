// `npm run calc -- ships=30 premium=8 survive=80 rounds=5` – expected-value calculator (spec 7.3).
// Uses the same model functions as the game. Optional: c= V= m= shipValue= pearlValue= maxPearls= pearls= rows=P.P,.K.,SS. level=2
import raw from '../game.config.json' with { type: 'json' };
import { configFromEcon, deterministicGame, econFromConfig, scoreCurve, scoreTable } from '../src/model/diagnostics.ts';
import { settleRound } from '../src/model/economy.ts';
import { forecast } from '../src/model/forecast.ts';
import { emptyHistory } from '../src/model/stats.ts';
import { parsePatterns, trackFromPatterns } from '../src/model/track.ts';
import type { Config, Level } from '../src/types.ts';

const cfg = raw as unknown as Config;
const args: Record<string, string> = {};
for (const a of process.argv.slice(2)) {
  const [k, v] = a.split('=');
  if (k && v !== undefined) args[k] = v;
}
const num = (k: string, d: number) => (args[k] !== undefined && Number.isFinite(Number(args[k])) ? Number(args[k]) : d);

const base = econFromConfig(cfg);
const e = {
  ...base,
  ships: num('ships', base.ships),
  capital: num('c', base.capital),
  repairCost: num('V', base.repairCost),
  cargoMultiplier: num('m', base.cargoMultiplier),
  shipValue: num('shipValue', base.shipValue),
  pearlValue: num('pearlValue', base.pearlValue),
  maxPearls: num('maxPearls', cfg.track.maxPearls),
  rounds: num('rounds', base.rounds),
};
const x = Math.min(1, Math.max(0, num('survive', 80) / 100));
const premium = Math.min(e.capital, Math.max(0, Math.round(num('premium', Math.round((1 - x) * e.repairCost)))));
const c = configFromEcon(cfg, e);
const out = (s = '') => process.stdout.write(`${s}\n`);
const pad = (v: string | number, n = 11) => String(v).padStart(n);
const pct = (v: number) => `${(v * 100).toFixed(0)} %`;

const wrecked = Math.round((1 - x) * e.ships);
const s = settleRound(premium, e.ships, wrecked, num('pearls', 0), c);
out(`One round: N=${e.ships} c=${e.capital} V=${e.repairCost} m=${e.cargoMultiplier}, premium p=${premium}, ${pct(x)} arrive (w=${wrecked})`);
out(`  fund F=${s.fund}   cargo K=${s.cargo}   budget B=${s.budget}`);
out(`  repaired r=${s.repaired}   lost L=${s.lost}   unused repairs U=${s.unusedRepairs}   fund returned=${s.fundLeft}`);
out(`  delivered cargo=${s.delivered}   revenue=${s.revenue}   round profit=${s.profit}`);
out(`  next fleet N'=${s.shipsAfter}   round value=${s.value}   fund status: ${s.fundStatus}`);
const ship = (ch: string, n: number) => ch.repeat(n);
out(`  fleet: ${ship('█', e.ships - wrecked)}${ship('▒', s.repaired)}${ship('✖', s.lost)}${ship('░', s.unusedRepairs)}  (█ arrived, ▒ repaired, ✖ lost, ░ unused repair)`);

const whole = deterministicGame(e, x, premium);
out(`\nWhole game (${e.rounds} rounds, ${pct(x)} each round, p=${premium}): profit=${whole.profit}, ships ${e.ships} → ${whole.shipsEnd}, T=${whole.total + e.ships * e.shipValue}, successRate=${Math.min(1, Math.max(0, whole.score)).toFixed(3)}`);

const curve = scoreCurve(e, x);
out(`Expected over binomial wrecks: best p=${curve.best.p} (score ${curve.best.score.toFixed(3)}), (1-S)·V=${curve.expectedDamage.toFixed(1)}, p=0 loses ${curve.dropZero.toFixed(3)}, p=c loses ${curve.dropFull.toFixed(3)}, -40 %/+40 % lose ${curve.below.drop.toFixed(3)}/${curve.above.drop.toFixed(3)}`);

out('\nScore (0–1) by share of arriving ships x');
out(`${pad('x', 5)}${pad('1r p=0')}${pad('1r (1-x)V')}${pad('1r p=c')}${pad('1r best')} |${pad('all p=0')}${pad('all (1-x)V')}${pad('all p=c')}${pad('all best')}${pad('best p')}`);
for (const r of scoreTable(e)) {
  const f = (v: number) => pad(v.toFixed(2));
  out(`${pad(pct(r.x), 5)}${f(r.oneRound.zero)}${f(r.oneRound.expected)}${f(r.oneRound.full)}${f(r.oneRound.best)} |${f(r.allRounds.zero)}${f(r.allRounds.expected)}${f(r.allRounds.full)}${f(r.allRounds.best)}${pad(r.bestP)}`);
}

if (args.rows) {
  const patterns = parsePatterns(args.rows);
  if (!patterns) {
    out('\nrows= must look like P.P,.K.,SS. (three of . P K S o per row)');
  } else {
    const level = (num('level', cfg.defaults.level) as Level);
    const f = forecast(trackFromPatterns(cfg, patterns), emptyHistory(), cfg, level);
    out(`\nForecast for ${patterns.join(' | ')} (level ${level}):`);
    for (const k of f.perKind) out(`  ${k.kind.padEnd(8)} x${k.rows}  prior ${pct(k.sLo)} – ${pct(k.sHi)}  observed ${k.sObs === null ? 'unknown' : pct(k.sObs)}`);
    out(`  S: low ${pct(f.S.lo)}, high ${pct(f.S.hi)}, observed ${pct(f.S.obs)}`);
    out(`  expected damage per ship: ${f.expectedDamage.lo.toFixed(1)} / ${f.expectedDamage.hi.toFixed(1)} / ${f.expectedDamage.obs.toFixed(1)} gold`);
  }
}
