// Sounds are synthesised with WebAudio, no files. The context is created on the first player gesture (never before),
// and every sound has a visible counterpart (grafika.md chapter 8). The game is fully playable muted.
export type Sound = 'wreck' | 'coin' | 'pearl' | 'gust';

let ctx: AudioContext | null = null;
let master: GainNode | null = null;
let ambient: { src: AudioBufferSourceNode; gain: GainNode } | null = null;
let muted = false;
const listeners = new Set<() => void>();
let unlockHooked = false;

export const isMuted = (): boolean => muted;

export function subscribeMute(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

export function setMuted(m: boolean): void {
  muted = m;
  if (master) master.gain.value = m ? 0 : 0.6;
  listeners.forEach((f) => f());
}

export function unlockAudio(): void {
  if (ctx) {
    if (ctx.state === 'suspended') void ctx.resume();
    return;
  }
  try {
    ctx = new AudioContext();
    master = ctx.createGain();
    master.gain.value = muted ? 0 : 0.6;
    master.connect(ctx.destination);
  } catch {
    ctx = null;
  }
}

/** Unlocks audio on the first touch, click or key press; nothing sounds before that. */
export function hookAudioUnlock(): void {
  if (unlockHooked) return;
  unlockHooked = true;
  const once = () => {
    unlockAudio();
    window.removeEventListener('pointerdown', once, true);
    window.removeEventListener('keydown', once, true);
  };
  window.addEventListener('pointerdown', once, true);
  window.addEventListener('keydown', once, true);
}

export function setAmbient(on: boolean): void {
  if (!ctx || !master) return;
  if (!on) {
    if (ambient) {
      const old = ambient;
      old.gain.gain.setTargetAtTime(0, ctx.currentTime, 0.2);
      setTimeout(() => old.src.stop(), 800);
      ambient = null;
    }
    return;
  }
  if (ambient) return;
  const len = ctx.sampleRate * 2;
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let last = 0;
  for (let i = 0; i < len; i++) {
    last = (last + 0.02 * (Math.random() * 2 - 1)) / 1.02;
    data[i] = last * 3.5;
  }
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const gain = ctx.createGain();
  gain.gain.value = 0;
  gain.gain.setTargetAtTime(0.3, ctx.currentTime, 0.4);
  const lfo = ctx.createOscillator();
  const lfoGain = ctx.createGain();
  lfo.frequency.value = 0.13;
  lfoGain.gain.value = 0.1;
  lfo.connect(lfoGain).connect(gain.gain);
  lfo.start();
  src.connect(gain).connect(master);
  src.start();
  ambient = { src, gain };
}

function tone(freq: number, start: number, dur: number, type: OscillatorType, vol: number, slideTo?: number): void {
  if (!ctx || !master) return;
  const t0 = ctx.currentTime + start;
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (slideTo) o.frequency.exponentialRampToValueAtTime(slideTo, t0 + dur);
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(master);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

function noiseBurst(dur: number, vol: number, freq: number, sweepTo?: number): void {
  if (!ctx || !master) return;
  const len = Math.floor(ctx.sampleRate * dur);
  const buf = ctx.createBuffer(1, len, ctx.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.sin((Math.PI * i) / len);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  const f = ctx.createBiquadFilter();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(freq, ctx.currentTime);
  if (sweepTo) f.frequency.exponentialRampToValueAtTime(sweepTo, ctx.currentTime + dur);
  const g = ctx.createGain();
  g.gain.value = vol;
  src.connect(f).connect(g).connect(master);
  src.start();
}

export function playSound(kind: Sound): void {
  if (!ctx || muted) return;
  switch (kind) {
    case 'wreck':
      noiseBurst(0.35, 0.5, 700);
      tone(110, 0, 0.3, 'triangle', 0.35, 50);
      break;
    case 'gust':
      noiseBurst(0.6, 0.45, 500, 2200);
      break;
    case 'coin':
      tone(988, 0, 0.1, 'square', 0.1);
      tone(1319, 0.08, 0.22, 'square', 0.1);
      break;
    case 'pearl':
      tone(660, 0, 0.12, 'sine', 0.25);
      tone(880, 0.1, 0.12, 'sine', 0.25);
      tone(1320, 0.2, 0.3, 'sine', 0.25);
      break;
  }
}
