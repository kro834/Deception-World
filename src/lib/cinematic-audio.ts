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
      master.gain.value = isMuted ? 0 : 0.85;
      master.connect(ctx.destination);
      const t0 = ctx.currentTime;
      const droneGain = ctx.createGain();
      droneGain.gain.setValueAtTime(0, t0);
      droneGain.gain.linearRampToValueAtTime(0.14, t0 + 7.5);
      droneGain.gain.linearRampToValueAtTime(0.08, t0 + 14);
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
      const rumble = ctx.createBufferSource();
      rumble.buffer = makeBrownNoise(ctx, 20);
      rumble.loop = true;
      const rumbleFilter = ctx.createBiquadFilter();
      rumbleFilter.type = "lowpass";
      rumbleFilter.frequency.value = 90;
      rumbleFilter.Q.value = 0.7;
      const rumbleGain = ctx.createGain();
      rumbleGain.gain.setValueAtTime(0, t0);
      rumbleGain.gain.linearRampToValueAtTime(0.22, t0 + 5);
      rumbleGain.gain.linearRampToValueAtTime(0.1, t0 + 13);
      rumble.connect(rumbleFilter);
      rumbleFilter.connect(rumbleGain);
      rumbleGain.connect(master);
      rumble.start(t0);
      sources.push(rumble);
      nodes.push(rumbleFilter, rumbleGain);
      const whoosh = ctx.createBufferSource();
      whoosh.buffer = makeWhiteNoise(ctx, 2.4);
      const whooshFilter = ctx.createBiquadFilter();
      whooshFilter.type = "bandpass";
      whooshFilter.Q.value = 0.85;
      whooshFilter.frequency.setValueAtTime(180, t0 + 5.3);
      whooshFilter.frequency.exponentialRampToValueAtTime(2400, t0 + 6.8);
      const whooshGain = ctx.createGain();
      whooshGain.gain.setValueAtTime(0, t0 + 5.3);
      whooshGain.gain.linearRampToValueAtTime(0.18, t0 + 5.9);
      whooshGain.gain.exponentialRampToValueAtTime(0.001, t0 + 7.7);
      whoosh.connect(whooshFilter);
      whooshFilter.connect(whooshGain);
      whooshGain.connect(master);
      whoosh.start(t0 + 5.3);
      sources.push(whoosh);
      nodes.push(whooshFilter, whooshGain);
      const shimmerGain = ctx.createGain();
      shimmerGain.gain.setValueAtTime(0, t0 + 8.0);
      shimmerGain.gain.linearRampToValueAtTime(0.09, t0 + 8.4);
      shimmerGain.gain.exponentialRampToValueAtTime(0.001, t0 + 12.0);
      shimmerGain.connect(master);
      nodes.push(shimmerGain);
      for (const freq of [784, 1176, 1568]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(shimmerGain);
        osc.start(t0 + 8.0);
        osc.stop(t0 + 12.5);
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
        try { osc.stop(); } catch { /* already stopped */ }
      }
      for (const src of sources) {
        try { src.stop(); } catch { /* already stopped */ }
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
      master.gain.setTargetAtTime(muted ? 0 : 0.85, ctx.currentTime, 0.05);
    }
  }

  return { unlock, start, stop, setMuted, muted: () => isMuted };
}
