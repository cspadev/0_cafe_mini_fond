import { useMemo, useReducer, useRef, useState } from 'react';
import { Evaluate } from './Evaluate';
import { Prepare } from './Prepare';
import { SailScreen } from './Sail';
import { Summary } from './Summary';
import { Tutorial } from './Tutorial';
import { buildOutput, finalRate, initialState, reduce } from './model/game';
import type { InitParams } from './model/init';
import { makeShips } from './model/ships';
import { buildReport } from './model/telemetry';
import { generateTrack } from './model/track';
import { finish } from './minihra-protokol';
import { createRun, type Run } from './telemetry';
import type { Config } from './types';

interface Props {
  /** config with the effective game parameters applied (applyInit) */
  cfg: Config;
  init: InitParams;
}

/** State machine of the game (spec 3): tutorial → prepare → sail → evaluate → (prepare | summary). */
export function Game({ cfg, init }: Props) {
  const [replay, setReplay] = useState<{ n: number; init: InitParams } | null>(null);
  const again = () => setReplay((r) => ({ n: (r?.n ?? 0) + 1, init: { ...init, tutorial: false, seed: (Math.random() * 4294967296) >>> 0 } }));
  return <Round key={replay?.n ?? 0} cfg={cfg} init={replay?.init ?? init} onReplay={again} />;
}

function Round({ cfg, init, onReplay }: Props & { onReplay: () => void }) {
  const [state, dispatch] = useReducer(reduce, undefined, () => initialState(cfg, init));
  const run = useRef<Run | null>(null);
  run.current ??= createRun(init);

  const track = useMemo(() => generateTrack(cfg, init.level, init.seed, state.round, state.attempt), [cfg, init.level, init.seed, state.round, state.attempt]);
  const shipsAtStart = state.snapshot.ships;
  const traits = useMemo(() => makeShips(cfg, init.level, init.seed, shipsAtStart), [cfg, init.level, init.seed, shipsAtStart]);

  switch (state.phase) {
    case 'tutorial':
      return <Tutorial cfg={cfg} init={init} onDone={() => dispatch({ type: 'tutorialDone' })} />;
    case 'prepare':
      return (
        <Prepare
          state={state}
          track={track}
          onPremium={(premium) => dispatch({ type: 'setPremium', premium })}
          onSail={() => dispatch({ type: 'startSail' })}
          onGiveUp={() => dispatch({ type: 'giveUp' })}
        />
      );
    case 'sail':
      return (
        <SailScreen
          key={`${state.round}-${state.attempt}`}
          cfg={cfg}
          track={track}
          traits={traits}
          seed={init.seed}
          round={state.round}
          label={`Kolo ${state.round} z ${init.rounds}`}
          onDone={(result) => dispatch({ type: 'sailDone', result, track })}
          onLeave={() => dispatch({ type: 'giveUp' })}
        />
      );
    case 'evaluate':
      return (
        <Evaluate
          state={state}
          onNext={() => dispatch({ type: 'nextRound' })}
          onRetry={() => dispatch({ type: 'retry' })}
          onGiveUp={() => dispatch({ type: 'giveUp' })}
        />
      );
    case 'summary':
      return (
        <Summary
          state={state}
          comparison={() => run.current!.submit(buildReport(state))}
          onContinue={() => finish(finalRate(state), buildOutput(state))}
          onReplay={onReplay}
        />
      );
  }
}
