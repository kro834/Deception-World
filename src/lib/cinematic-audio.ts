export type CinematicScore = {
  unlock: () => Promise<boolean>;
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
  let generation = 0;
  let isMuted = false;
  const nodes: AudioNode[] = [];
  const oscillators: OscillatorNode[] = [];
  const sources: AudioBufferSourceNode[] = [];

  async function unlock() {
    if (typeof AudioContext === "undefined") return false;
    try {
      if (!ctx || ctx.state === "closed") ctx = new AudioContext();
      const pendingContext = ctx;
      // WebKit can also interrupt audio after calls or app switching.
      if (pendingContext.state !== "running") await pendingContext.resume();
      return ctx === pendingContext && pendingContext.state === "running";
    } catch {
      // Audio refusal must not reject the pointer/keyboard gesture or block
      // the visual opening. A later user gesture may try again.
      return false;
    }
  }

  function start() {
    if (started) return;
    started = true;
    const runGeneration = ++generation;
    void (async () => {
      const ready = await unlock();
      if (!ready || !ctx || !started || runGeneration !== generation) {
        if (runGeneration === generation) started = false;
        return;
      }

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

      // The burn (about 2.6 s to 6.1 s): a low roar that swells with the
      // flames, and scattered crackles, all from the same synthesized noise.
      const roar = ctx.createBufferSource();
      roar.buffer = makeBrownNoise(ctx, 4);
      roar.loop = true;
      const roarFilter = ctx.createBiquadFilter();
      roarFilter.type = "lowpass";
      roarFilter.frequency.setValueAtTime(180, t0 + 2.6);
      roarFilter.frequency.linearRampToValueAtTime(420, t0 + 4.2);
      roarFilter.frequency.linearRampToValueAtTime(200, t0 + 6.3);
      const roarGain = ctx.createGain();
      roarGain.gain.setValueAtTime(0, t0 + 2.6);
      roarGain.gain.linearRampToValueAtTime(0.16, t0 + 3.9);
      roarGain.gain.exponentialRampToValueAtTime(0.001, t0 + 6.6);
      roar.connect(roarFilter);
      roarFilter.connect(roarGain);
      roarGain.connect(master);
      roar.start(t0 + 2.6);
      roar.stop(t0 + 6.7);
      sources.push(roar);
      nodes.push(roarFilter, roarGain);

      const crackle = ctx.createBufferSource();
      crackle.buffer = makeWhiteNoise(ctx, 4);
      const crackleFilter = ctx.createBiquadFilter();
      crackleFilter.type = "bandpass";
      crackleFilter.frequency.value = 2400;
      crackleFilter.Q.value = 0.9;
      const crackleGain = ctx.createGain();
      crackleGain.gain.setValueAtTime(0, t0 + 2.7);
      for (let i = 0; i < 46; i += 1) {
        const at = t0 + 2.75 + Math.random() * 3.2;
        const peak = 0.04 + Math.random() * 0.08;
        crackleGain.gain.setValueAtTime(0, at);
        crackleGain.gain.linearRampToValueAtTime(peak, at + 0.004);
        crackleGain.gain.exponentialRampToValueAtTime(0.001, at + 0.03 + Math.random() * 0.05);
      }
      crackle.connect(crackleFilter);
      crackleFilter.connect(crackleGain);
      crackleGain.connect(master);
      crackle.start(t0 + 2.7);
      crackle.stop(t0 + 6.1);
      sources.push(crackle);
      nodes.push(crackleFilter, crackleGain);

      // The prism logo rises from the ash (about 6.1 s): a second, brighter chime.
      const prismGain = ctx.createGain();
      prismGain.gain.setValueAtTime(0, t0 + 6.05);
      prismGain.gain.linearRampToValueAtTime(0.06, t0 + 6.3);
      prismGain.gain.exponentialRampToValueAtTime(0.001, t0 + 7.9);
      prismGain.connect(master);
      nodes.push(prismGain);
      for (const freq of [988, 1480, 1976]) {
        const osc = ctx.createOscillator();
        osc.type = "sine";
        osc.frequency.value = freq;
        osc.connect(prismGain);
        osc.start(t0 + 6.05);
        osc.stop(t0 + 8);
        oscillators.push(osc);
      }
    })().catch(() => {
      if (runGeneration === generation) stop();
    });
  }

  function stop() {
    generation += 1;
    started = false;
    // Retire only this run. A new start owns a fresh context/graph, so this
    // run's fade timer cannot stop the next opening or clear its mute control.
    const retiredContext = ctx;
    const retiredMaster = master;
    const retiredOscillators = oscillators.splice(0);
    const retiredSources = sources.splice(0);
    const retiredNodes = nodes.splice(0);
    ctx = null;
    master = null;
    if (!retiredContext) return;
    const fadeAt = retiredContext.currentTime;
    if (retiredMaster && retiredContext.state !== "closed") {
      retiredMaster.gain.cancelScheduledValues(fadeAt);
      retiredMaster.gain.setValueAtTime(retiredMaster.gain.value, fadeAt);
      retiredMaster.gain.linearRampToValueAtTime(0, fadeAt + 0.4);
    }
    const release = () => {
      for (const osc of retiredOscillators) {
        try {
          osc.stop();
        } catch {
          /* already stopped */
        }
      }
      for (const src of retiredSources) {
        try {
          src.stop();
        } catch {
          /* already stopped */
        }
      }
      for (const node of [...retiredOscillators, ...retiredSources, ...retiredNodes]) {
        node.disconnect();
      }
      retiredMaster?.disconnect();
      if (retiredContext.state !== "closed") void retiredContext.close().catch(() => undefined);
    };
    if (retiredMaster) window.setTimeout(release, 450);
    else release();
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
