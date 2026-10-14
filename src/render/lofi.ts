// Lofi renderer: CC0 multisamples + modelled instruments, per-part processing, one shared convolution room, then mastering.
// The order of RNG draws here is part of the sound: changing it changes every song.

import { makeRng, type Rng } from "../compose/rng.ts";
import { addInto, applyGain, fade, stereo } from "../dsp/buffers.ts";
import { crunch, saturate, tapeWobble, tremolo, vinyl } from "../dsp/character.ts";
import { compress, gatedRmsDb, limit, sidechain } from "../dsp/dynamics.ts";
import { biquad } from "../dsp/filters.ts";
import { convolve, roomIR } from "../dsp/reverb.ts";
import { LOFI_TONE, matchTone } from "../dsp/tone.ts";
import { playNote, type RoundRobin } from "../instruments/sampler.ts";
import { bass, kick, pad, rhodes } from "../instruments/synths.ts";
import type { Kit } from "../instruments/vcsl.ts";
import type { Note, Role, Song, Stereo } from "../types.ts";

export const SAMPLE_RATE = 48_000;

const SR = SAMPLE_RATE;

/**
 * Per-part loudness target (gated RMS dB) and reverb send.
 */
const MIX: Record<Role, { level: number; send: number }> = {
	lead: { level: -27, send: 0.32 },
	keys: { level: -27, send: 0.22 },
	pad: { level: -33, send: 0.45 },
	bass: { level: -20.5, send: 0 },
	drums: { level: -19, send: 0.1 },
};

/**
 * Optional hooks for inspecting a render (used by the analysis tooling).
 */
export interface RenderHooks {
	/**
	 * Receives each part after levelling, before it is summed.
	 */
	onStem?: (role: Role, stem: Stereo, gain: number) => void;
}

/**
 * Drum part: a synthesised kick, sampled snare/side-stick pitched down a touch, then an SP-1200-style bus;
 * hats and shaker skip the crunch so the top end stays open.
 *
 * @param kit - Sampled instruments.
 * @param hits - Drum notes (GM numbers).
 * @param length - Samples.
 * @param rng - Seeded RNG.
 * @returns Stereo stem.
 */
function renderDrums(kit: Kit, hits: Note[], length: number, rng: Rng): Stereo {
	const out = stereo(length);
	const tops = stereo(length);
	const rr: RoundRobin = new Map();

	for (const h of hits) {
		const at = { ...h, end: h.start + 0.5 };

		if (h.note === 35 || h.note === 36) {
			kick(out, SR, h, rng, { tune: 49, decay: 0.26, punch: 95, gain: 1.4 });
		} else if (h.note === 38 || h.note === 40) {
			playNote(out, SR, kit.snare, rr, { ...at, note: 58.5 }, { ringOut: true, gain: 0.8 });
		} else if (h.note === 37) {
			playNote(out, SR, kit.stick, rr, { ...at, note: 59 }, { ringOut: true });
		} else if (h.note === 42 || h.note === 44) {
			playNote(tops, SR, kit.hat, rr, { ...at, note: 59, vel: h.vel * 0.9 }, { ringOut: true, gain: 0.85 });
		} else if (h.note === 46) {
			playNote(tops, SR, kit.openHat, rr, { ...at, note: 59 }, { ringOut: true, gain: 0.35 });
		} else if (h.note === 70) {
			playNote(tops, SR, kit.shaker, rr, { ...at, note: 60 }, { ringOut: true, gain: 0.4 });
		}
	}

	biquad(out, "lowpass", 12000, SR);
	crunch(out, SR, { rate: 26040, bits: 12 });
	biquad(out, "lowpass", 10000, SR);
	biquad(out, "peak", 220, SR, { gainDb: 2, q: 0.9 });
	saturate(out, 1.8);
	compress(out, SR, { thresholdDb: -16, ratio: 4, attackMs: 8, releaseMs: 120 });
	biquad(tops, "highpass", 400, SR);
	biquad(tops, "lowpass", 14000, SR);
	saturate(tops, 1.3);
	addInto(out, tops, 1);

	return out;
}

/**
 * Renders a lofi song to mastered stereo audio at 48 kHz.
 *
 * @param song - Composition.
 * @param kit - Sampled instruments.
 * @param hooks - Optional inspection hooks.
 * @returns Audio in [-1, 1], about -15.5 LUFS with peaks at or below -1.5 dBFS.
 */
export function renderLofi(song: Song, kit: Kit, hooks: RenderHooks = {}): Stereo {
	const { parts, bpm, seed } = song;
	const rng = makeRng(`render:${seed}`);
	const length = Math.ceil((song.seconds + 3) * SR);

	const kickTimes = parts.drums
		.filter(function isKick(n) {
			return n.note === 35 || n.note === 36;
		})
		.map(function onset(n) {
			return n.start;
		});

	// lead: the real upright, a little darker and less boxy, like a close-miked felt upright
	const leadStem = stereo(length);

	const pianoRR: RoundRobin = new Map();

	for (const n of parts.lead) {
		playNote(leadStem, SR, kit.piano, pianoRR, { ...n, end: n.end + 0.15 });
	}

	biquad(leadStem, "highshelf", 4500, SR, { gainDb: -1.5 });
	biquad(leadStem, "peak", 900, SR, { gainDb: -3, q: 0.8 });
	biquad(leadStem, "lowshelf", 200, SR, { gainDb: -2 });

	// keys: modelled Rhodes through a suitcase tremolo
	const keysStem = stereo(length);

	for (const n of parts.keys) {
		rhodes(keysStem, SR, n, { pan: (rng.float() - 0.5) * 0.4 });
	}

	tremolo(keysStem, SR, { rateHz: 3.8, depth: 0.22 });
	biquad(keysStem, "lowpass", 5200, SR);
	biquad(keysStem, "peak", 350, SR, { gainDb: -3, q: 0.9 });

	// pad: warm detuned saws, kept low and dark
	const padStem = stereo(length);

	for (const n of parts.pad) {
		pad(padStem, SR, n, rng, { cutoff: 1100, attack: 1.1, releaseSec: 1.8 });
	}

	biquad(padStem, "highpass", 180, SR);
	biquad(padStem, "lowpass", 2600, SR);
	biquad(padStem, "peak", 850, SR, { gainDb: -4, q: 0.7 });

	// bass: modal fingered bass, round and controlled
	const bassStem = stereo(length);

	for (const n of parts.bass) {
		bass(bassStem, SR, n, { brightness: 0.35 });
	}

	biquad(bassStem, "lowpass", 1400, SR);
	compress(bassStem, SR, { thresholdDb: -20, ratio: 4, attackMs: 12, releaseMs: 160 });

	const stems: Record<Role, Stereo> = {
		lead: leadStem,
		keys: keysStem,
		pad: padStem,
		bass: bassStem,
		drums: renderDrums(kit, parts.drums, length, rng),
	};

	const mix = stereo(length);
	const send = stereo(length);

	for (const role of ["lead", "keys", "pad", "bass", "drums"] as const) {
		const buf = stems[role];
		const raw = gatedRmsDb(buf, SR);

		if (raw < -100) {
			continue;
		}

		const g = 10 ** ((MIX[role].level - raw) / 20);

		if (role === "bass" || role === "pad" || role === "keys") {
			sidechain(buf, SR, kickTimes, { depth: role === "bass" ? 0.25 : 0.18, releaseMs: (60 / bpm) * 420 });
		}

		addInto(mix, buf, g);
		hooks.onStem?.(role, buf, g);

		if (MIX[role].send) {
			addInto(send, buf, g * MIX[role].send);
		}
	}

	// one shared room: everything sitting in the same space is much of what makes a mix sound real
	biquad(send, "highpass", 250, SR);

	const wet = convolve(send, roomIR(SR, makeRng(`room:${seed}`), { rt60: 1.9, preDelayMs: 22, damping: 0.75 }));

	biquad(wet, "lowpass", 6500, SR);
	addInto(mix, wet, 0.9);

	// master: tape, tone, glue, vinyl, loudness
	biquad(mix, "highpass", 30, SR);
	tapeWobble(mix, SR, { wowHz: 0.42, wowMs: 1.3, flutterHz: 6.2, flutterMs: 0.08 });
	biquad(mix, "lowshelf", 120, SR, { gainDb: 2 });
	biquad(mix, "peak", 1000, SR, { gainDb: -2.5, q: 0.7 });
	biquad(mix, "highshelf", 7000, SR, { gainDb: -1.5 });
	compress(mix, SR, { thresholdDb: -20, ratio: 2.2, attackMs: 25, releaseMs: 300 });
	saturate(mix, 1.25);
	matchTone(mix, SR, LOFI_TONE, { strength: 0.75, maxDb: 7, passes: 3 });
	vinyl(mix, SR, makeRng(`vinyl:${seed}`), { hissDb: -46, cracklesPerSec: 2.5 });
	applyGain(mix, 10 ** ((-16 - gatedRmsDb(mix, SR)) / 20));
	limit(mix, SR, { ceilingDb: -1.5 });
	fade(mix, SR, 0.8, 4);

	return mix;
}
