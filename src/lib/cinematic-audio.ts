export type CinematicScore = {
  unlock: () => Promise<void>;
  start: () => void;
  stop: () => void;
  setMuted: (muted: boolean) => void;
  muted: () => boolean;
};

function makeBrownNoise(ctx: AudioContext, seconds: number) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  let last = 0;
  for (let i = 0; i < length; i++) {
    const white = Math.random() * 2 - 1;
    last = (last + 0.02 * white) / 1.02;
    data[i] = last * 3.2;
  }
  return buffer;
}

function makeWhiteNoise(ctx: AudioContext, seconds: number) {
  const length = Math.floor(ctx.sampleRate * seconds);
  const buffer = ctx.createBuffer(1, length, ctx.sampleRate);
  const data = buffer.getChannelData(0);
  for (let i = 0; i < length; i++) data[i] = Math.random() * 2 - 1;
  return buffer;
}

export function createCinematicScore(): CinematicScore {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let started = false;
  let isMuted = false;
  const nodes: AudioNode[] = [];
  const oscillators: OscillatorNode[] = [];
  const sources: AudioBufferSourceNode[] = [];

  async function unlock() {
    if (typeof AudioContext === "undefined") return;
    if (!ctx) ctx = new AudioContext();
    if (ctx.state === "suspended") await ctx.resume();
  }

  function start() {
    if (started) return;
    started = true;
    void (async () => {
      await unlock();
      if (!ctx) return;

      master = ctx.createGain();
      master.gain.value = isMuted ? 0 : 0.82;
      master.connect(ctx.destination);

      const t0 = ctx.currentTime;

      // Sub drone with slow beating
      const droneGain = ctx.createGain();
      droneGain.gain.setValueAtTime(0, t0);
      droneGain.gain.linearRampToValueAtTime(0.12, t0 + 2.8);
      droneGain.gain.linearRampToValueAtTime(0.075, t0 + 5.75);
      droneGain.connect(master);
      nodes.push(droneGain);

      for (const freq of [42, 42.35, 63]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(droneGain);
        osc.start(t0);
        oscillators.push(osc);
      }

      // Low rumble (brown noise through a lowpass)
      const rumble = ctx.createBufferSource();
      rumble.buffer = makeBrownNoise(ctx, 4);
      rumble.loop = true;
      const rumbleFilter = ctx.createBiquadFilter();
      rumbleFilter.type = "lowpass";
      rumbleFilter.frequency.value = 90;
      rumbleFilter.Q.value = 0.7;
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.setValueAtTime(0, t0);
      rumbleGain.gain.linearRampToValueAtTime(0.2, t0 + 2.5);
      rumbleGain.gain.linearRampToValueAtTime(0.08, t0 + 5.7);
      rumble.connect(rumbleFilter);
      rumbleFilter.connect(rumbleGain);
      rumbleGain.connect(master);
      rumble.start(t0);
      sources.push(rumble);
      nodes.push(rumbleFilter, rumbleGain);

      // Whoosh at the reveal
      const whoosh = ctx.createBufferSource();
      whoosh.buffer = makeWhiteNoise(ctx, 1.8);
      const whooshFilter = ctx.createBiquadFilter();
      whooshFilter.type = "bandpass";
      whooshFilter.Q.value = 0.85;
      whooshFilter.frequency.setValueAtTime(180, t0 + 1.35);
      whooshFilter.frequency.exponentialRampToValueAtTime(2900, t0 + 2.65);
      const whooshGain = ctx.createGain();
      whooshGain.gain.setValueAtTime(0, t0 + 1.35);
      whooshGain.gain.linearRampToValueAtTime(0.17, t0 + 1.82);
      whooshGain.gain.exponentialRampToValueAtTime(0.001, t0 + 3.05);
      whoosh.connect(whooshFilter);
      whooshFilter.connect(whooshGain);
      whooshGain.connect(master);
      whoosh.start(t0 + 1.35);
      sources.push(whoosh);
      nodes.push(whooshFilter, whooshGain);

      // A compact logo-impact transient: a low body hit followed by a crisp
      // filtered spark. Both are synthesized so startup stays asset-free.
      const impact = ctx.createOscillator();
      impact.type = "sine";
      impact.frequency.setValueAtTime(86, t0 + 1.5);
      impact.frequency.exponentialRampToValueAtTime(38, t0 + 2.22);
      const impactGain = ctx.createGain();
      impactGain.gain.setValueAtTime(0, t0 + 1.5);
      impactGain.gain.linearRampToValueAtTime(0.24, t0 + 1.56);
      impactGain.gain.exponentialRampToValueAtTime(0.001, t0 + 2.25);
      impact.connect(impactGain);
      impactGain.connect(master);
      impact.start(t0 + 1.5);
      impact.stop(t0 + 2.3);
      oscillators.push(impact);
      nodes.push(impactGain);

      const spark = ctx.createBufferSource();
      spark.buffer = makeWhiteNoise(ctx, 0.52);
      const sparkFilter = ctx.createBiquadFilter();
      sparkFilter.type = "bandpass";
      sparkFilter.frequency.value = 1280;
      sparkFilter.Q.value = 1.4;
      const sparkGain = ctx.createGain();
      sparkGain.gain.setValueAtTime(0, t0 + 1.52);
      sparkGain.gain.linearRampToValueAtTime(0.11, t0 + 1.57);
      sparkGain.gain.exponentialRampToValueAtTime(0.001, t0 + 2.02);
      spark.connect(sparkFilter);
      sparkFilter.connect(sparkGain);
      sparkGain.connect(master);
      spark.start(t0 + 1.52);
      sources.push(spark);
      nodes.push(sparkFilter, sparkGain);

      // Metallic shimmer / bell at full reveal
      const shimmerGain = ctx.createGain();
      shimmerGain.gain.setValueAtTime(0, t0 + 3.15);
      shimmerGain.gain.linearRampToValueAtTime(0.075, t0 + 3.42);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, t0 + 5.65);
      shimmerGain.connect(master);
      nodes.push(shimmerGain);
      for (const freq of [784, 1176, 1568]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(shimmerGain);
        osc.start(t0 + 3.15);
        osc.stop(t0 + 5.72);
        oscillators.push(osc);
      }
    })();
  }

  function stop() {
    started = false;
    const fadeAt = ctx?.currentTime ?? 0;
    if (master && ctx) {
      master.gain.cancelScheduledValues(fadeAt);
      master.gain.setValueAtTime(master.gain.value, fadeAt);
      master.gain.linearRampToValueAtTime(0, fadeAt + 0.4);
    }
    window.setTimeout(() => {
      for (const osc of oscillators) {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
      }
      for (const src of sources) {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      }
      oscillators.length = 0;
      sources.length = 0;
      nodes.length = 0;
      master = null;
    }, 450);
  }

  function setMuted(muted: boolean) {
    isMuted = muted;
    if (master && ctx) {
      master.gain.setTargetAtTime(muted ? 0 : 0.82, ctx.currentTime, 0.05);
    }
  }

  return {
    unlock,
    start,
    stop,
    setMuted,
    muted: () => isMuted,
  };
}
