// Synthesised sound effects via Web Audio API — no audio files, zero network cost.

export type SoundName = 'fold' | 'check' | 'call' | 'raise' | 'win' | 'deal' | 'yourTurn' | 'newRound';

let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  try {
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === 'suspended') ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

function tone(
  freq: number,
  dur: number,
  type: OscillatorType = 'sine',
  vol = 0.25,
  delay = 0,
  freqEnd?: number,
) {
  const c = getCtx();
  if (!c) return;
  const osc = c.createOscillator();
  const gain = c.createGain();
  osc.connect(gain);
  gain.connect(c.destination);
  osc.type = type;
  const t0 = c.currentTime + delay;
  osc.frequency.setValueAtTime(freq, t0);
  if (freqEnd !== undefined) osc.frequency.linearRampToValueAtTime(freqEnd, t0 + dur);
  gain.gain.setValueAtTime(vol, t0);
  gain.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  osc.start(t0);
  osc.stop(t0 + dur);
}

// Single poker chip hitting felt: short click + brief thud, no ring
function chip(delay = 0, vol = 0.32) {
  tone(2200, 0.018, 'square',   vol * 0.35, delay);          // click transient
  tone(310,  0.09,  'sine',     vol,         delay, 110);    // body thud
}

const SOUNDS: Record<SoundName, () => void> = {
  fold: () => {
    // Card sliding away: brief mid-freq sweep down
    tone(900, 0.18, 'triangle', 0.16, 0, 280);
    tone(500, 0.12, 'triangle', 0.09, 0.06, 200);
  },
  check: () => {
    // Gentle table knock
    tone(260, 0.09, 'sine', 0.28, 0, 100);
    tone(520, 0.04, 'triangle', 0.10, 0.01, 350);
  },
  call: () => {
    chip(0,    0.34);
    chip(0.05, 0.28);
  },
  raise: () => {
    chip(0,    0.35);
    chip(0.05, 0.33);
    chip(0.10, 0.31);
    chip(0.15, 0.29);
  },
  win: () => {
    // Fanfare
    [523, 659, 784, 1047].forEach((f, i) =>
      tone(f, 0.4, 'sine', 0.28, i * 0.09)
    );
    // Chip shower after fanfare
    ([0.48, 0.56, 0.52, 0.62, 0.58, 0.66, 0.54, 0.70] as number[]).forEach((d, i) =>
      chip(d, 0.18 - i * 0.01)
    );
  },
  deal: () => {
    tone(900, 0.04, 'triangle', 0.18, 0, 700);
    tone(600, 0.04, 'triangle', 0.12, 0.06, 400);
  },
  yourTurn: () => {
    tone(880,  0.09, 'sine', 0.22);
    tone(1100, 0.14, 'sine', 0.18, 0.10);
  },
  newRound: () => {
    tone(440, 0.12, 'triangle', 0.20);
    tone(550, 0.16, 'triangle', 0.20, 0.13);
  },
};

export function playSound(name: SoundName): void {
  try {
    SOUNDS[name]?.();
  } catch {
    // ignore on browsers that block AudioContext
  }
}
