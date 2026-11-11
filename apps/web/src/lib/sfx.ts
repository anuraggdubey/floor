"use client";

import { useCallback, useEffect, useRef, useState } from "react";

/**
 * Small synthesised cues for the demo: a thud when someone dumps, a low alarm when the gate shuts, a bright
 * two-note chime when a payout lands. Generated with WebAudio, so there are no files to load and nothing to
 * license. Off by default — browsers block audio until a gesture, and nobody wants a surprise.
 */
export type Cue = "dump" | "gate" | "tier" | "paid" | "tick" | "buy";

const KEY = "floor.sound";

export function useSound() {
  const [on, setOn] = useState(false);
  const ctxRef = useRef<AudioContext | null>(null);
  const onRef = useRef(false);

  useEffect(() => {
    try {
      const v = localStorage.getItem(KEY) === "1";
      setOn(v);
      onRef.current = v;
    } catch {
      /* private mode */
    }
  }, []);

  const ensure = useCallback((): AudioContext | null => {
    if (typeof window === "undefined") return null;
    if (!ctxRef.current) {
      const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
      if (!AC) return null;
      ctxRef.current = new AC();
    }
    if (ctxRef.current.state === "suspended") void ctxRef.current.resume();
    return ctxRef.current;
  }, []);

  const toggle = useCallback(() => {
    const next = !onRef.current;
    onRef.current = next;
    setOn(next);
    try {
      localStorage.setItem(KEY, next ? "1" : "0");
    } catch {
      /* ignore */
    }
    if (next) {
      const c = ensure();
      if (c) blip(c, 660, 0.05, "sine", 0.05); // confirms sound is on
    }
  }, [ensure]);

  const play = useCallback(
    (cue: Cue) => {
      if (!onRef.current) return;
      const c = ensure();
      if (!c) return;
      switch (cue) {
        case "dump": {
          // a falling pitch with a burst of noise: something heavy hitting water
          sweep(c, 170, 42, 0.55, "sine", 0.34);
          noise(c, 0.35, 0.22, 900);
          break;
        }
        case "gate": {
          sweep(c, 330, 200, 0.5, "sawtooth", 0.1);
          blip(c, 110, 0.7, "square", 0.07);
          break;
        }
        case "tier": {
          blip(c, 220, 0.18, "triangle", 0.12);
          break;
        }
        case "paid": {
          // a bright major third, then the fifth: unmistakably good news
          blip(c, 784, 0.45, "sine", 0.16, 0);
          blip(c, 988, 0.5, "sine", 0.14, 0.11);
          blip(c, 1175, 0.8, "sine", 0.12, 0.23);
          noise(c, 0.25, 0.04, 7000, 0.05);
          break;
        }
        case "buy": {
          blip(c, 523, 0.14, "sine", 0.1);
          blip(c, 659, 0.2, "sine", 0.1, 0.08);
          break;
        }
        case "tick": {
          blip(c, 1400, 0.03, "square", 0.03);
          break;
        }
      }
    },
    [ensure],
  );

  return { on, toggle, play };
}

// ------------------------------------------------------------------- voices
function blip(c: AudioContext, freq: number, dur: number, type: OscillatorType, vol: number, delay = 0) {
  const o = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime + delay;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.012);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function sweep(c: AudioContext, from: number, to: number, dur: number, type: OscillatorType, vol: number) {
  const o = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime;
  o.type = type;
  o.frequency.setValueAtTime(from, t0);
  o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(0.0001, t0);
  g.gain.exponentialRampToValueAtTime(vol, t0 + 0.015);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.05);
}

function noise(c: AudioContext, dur: number, vol: number, cutoff: number, delay = 0) {
  const len = Math.max(1, Math.floor(c.sampleRate * dur));
  const buf = c.createBuffer(1, len, c.sampleRate);
  const d = buf.getChannelData(0);
  for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * (1 - i / len);
  const src = c.createBufferSource();
  src.buffer = buf;
  const f = c.createBiquadFilter();
  f.type = "lowpass";
  f.frequency.value = cutoff;
  const g = c.createGain();
  const t0 = c.currentTime + delay;
  g.gain.setValueAtTime(vol, t0);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
}
