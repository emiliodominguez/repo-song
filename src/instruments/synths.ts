// Modelled instruments for the parts no CC0 library covers well: Rhodes, bass, kick and pad.
// Each renderer mixes one note into a stereo buffer; all randomness comes from the seeded RNG passed in.

import type { Rng } from "../compose/rng.ts";
import type { Note, Stereo } from "../types.ts";

const TAU = 2 * Math.PI;

/**
 * MIDI note to frequency.
 *
 * @param n - MIDI note.
 * @returns Hz.
 */
function hz(n: number): number {
	return 440 * 2 ** ((n - 69) / 12);
}

export interface RhodesOptions {
	/**
	 * Linear gain.
	 */
	gain?: number;
	/**
	 * Static pan, -1 (left) to 1 (right).
	 */
	pan?: number;
}

/**
 * Rhodes-style electric piano: a 2-operator FM tine whose index follows velocity, a fast inharmonic "ding",
 * a soft hammer thump, a two-stage decay, and an asymmetric pickup nonlinearity that adds bark when played hard.
 *
 * @param out - Output buffer.
 * @param sr - Sample rate.
 * @param n - Note.
 * @param opts - Level and static pan (-1..1).
 */
export function rhodes(out: Stereo, sr: number, n: Note, opts: RhodesOptions = {}): void {
	const { gain = 1, pan = 0 } = opts;
	const f = hz(n.note);
	const v = n.vel / 127;
	const start = Math.round(n.start * sr);
	const off = Math.round(n.end * sr);
	const tauLong = 3.2 * 2 ** (-(n.note - 48) / 30);
	const release = Math.exp(-1 / (0.09 * sr));
	const ding = Math.min(1, 9000 / (f * 7.1));
	const drive = 1 + 2.2 * v * v;
	const asym = 0.35;
	const bias = Math.tanh(asym);
	const norm = 1 / (Math.tanh(drive + asym) - bias);
	const level = 0.25 + 0.75 * v ** 1.4;
	const gl = gain * Math.sqrt((1 - pan) / 2) * level;
	const gr = gain * Math.sqrt((1 + pan) / 2) * level;
	const [l, r] = out;
	// decays as per-sample multipliers
	const m1 = Math.exp(-1 / (0.45 * sr));
	const m2 = Math.exp(-1 / (tauLong * sr));
	const mi = Math.exp(-1 / (0.28 * sr));
	const md = Math.exp(-1 / (0.035 * sr));
	const mt = Math.exp(-1 / (0.012 * sr));
	// rotating oscillators for the modulator and the ding partial
	const wf = (TAU * f) / sr;
	const cwf = Math.cos(wf);
	const swf = Math.sin(wf);
	const wd = (TAU * f * 7.1) / sr;
	const cwd = Math.cos(wd);
	const swd = Math.sin(wd);
	const indexDepth = 0.25 + 1.6 * v * v;
	const attack = 1 / (0.0015 * sr);

	let ms = 0,
		mc = 1,
		ds = 0,
		dc = 1,
		phase = 0,
		e1 = 1,
		e2 = 1,
		ie = 1,
		de = 1,
		te = 1,
		rel = 1,
		noise = (start * 2654435761) >>> 0 || 1,
		thump = 0;

	for (let i = start, k = 0; i < l.length; i++, k++) {
		if (i >= off) {
			rel *= release;

			if (rel < 1e-4) {
				break;
			}
		}

		let x = Math.sin(phase + ms * (indexDepth * ie + 0.18));

		if (de > 1e-4) {
			x += 0.22 * v * ding * de * ds;
		}

		const y = (Math.tanh(drive * x * 0.6 + asym) - bias) * norm;
		let s = y * (0.55 * e1 + 0.45 * e2) * Math.min(1, k * attack) * rel;

		// the felt hammer hitting the tine: a short burst of dark noise
		if (te > 1e-3) {
			noise ^= noise << 13;
			noise ^= noise >>> 17;
			noise ^= noise << 5;
			thump += 0.08 * ((noise >>> 0) / 2147483648 - 1 - thump);
			s += thump * te * 0.9 * v;
			te *= mt;
		}

		l[i] += s * gl;
		r[i] += s * gr;
		phase += wf;

		if (phase > TAU) {
			phase -= TAU;
		}

		const ms2 = ms * cwf + mc * swf;

		mc = mc * cwf - ms * swf;
		ms = ms2;

		const ds2 = ds * cwd + dc * swd;

		dc = dc * cwd - ds * swd;
		ds = ds2;
		e1 *= m1;
		e2 *= m2;
		ie *= mi;
		de *= md;
	}
}

export interface BassOptions {
	/**
	 * Linear gain.
	 */
	gain?: number;
	/**
	 * Tone, 0 (round) to 1 (bright).
	 */
	brightness?: number;
}

/**
 * Plucked electric bass as a modal string: each harmonic decays faster than the one below it, shaped by the pluck
 * position, with slight inharmonicity and a soft finger thump.
 *
 * @param out - Output buffer.
 * @param sr - Sample rate.
 * @param n - Note.
 * @param opts - Level and tone (0..1).
 */
export function bass(out: Stereo, sr: number, n: Note, opts: BassOptions = {}): void {
	const { gain = 1, brightness = 0.5 } = opts;
	const f = hz(n.note);
	const v = n.vel / 127;
	const start = Math.round(n.start * sr);
	const off = Math.round(n.end * sr);
	const pluck = 0.2;
	const parts: { amp: number; env: number; mul: number; s: number; c: number; cw: number; sw: number }[] = [];

	for (let k = 1; k <= 24 && f * k < 5000; k++) {
		const amp = (Math.abs(Math.sin(Math.PI * k * pluck)) / k ** (1.35 - 0.4 * brightness)) * (k === 1 ? 1.4 : 1);
		const fk = f * k * Math.sqrt(1 + 0.00012 * k * k);
		const decay = (1 + 0.55 * (k - 1) * (1.2 - brightness)) / 1.8;

		const w = (TAU * fk) / sr;

		parts.push({ amp, env: 1, mul: Math.exp(-decay / sr), s: 0, c: 1, cw: Math.cos(w), sw: Math.sin(w) });
	}

	const total = parts.reduce(function sum(s, p) {
		return s + p.amp;
	}, 0);

	const release = Math.exp(-1 / (0.06 * sr));
	const g = (gain * (0.4 + 0.6 * v)) / total;
	const [l, r] = out;
	const maxLen = Math.round((n.end - n.start + 0.5) * sr);
	let rel = 1;

	for (let i = start, k = 0; i < l.length && k < maxLen; i++, k++) {
		const t = k / sr;

		if (i >= off) {
			rel *= release;

			if (rel < 1e-4) {
				break;
			}
		}

		let s = 0;

		for (const p of parts) {
			s += p.amp * p.env * p.s;
			p.env *= p.mul;

			const next = p.s * p.cw + p.c * p.sw;

			p.c = p.c * p.cw - p.s * p.sw;
			p.s = next;
		}

		s *= Math.min(1, t / 0.004) * rel * g;

		if (t < 0.06) {
			s += 0.25 * v * g * total * Math.exp(-t / 0.008) * Math.sin(TAU * 90 * t);
		}

		l[i] += s;
		r[i] += s;
	}
}

export interface KickOptions {
	/**
	 * Linear gain.
	 */
	gain?: number;
	/**
	 * Resting pitch in Hz.
	 */
	tune?: number;
	/**
	 * Body decay time constant in seconds.
	 */
	decay?: number;
	/**
	 * Depth of the initial pitch drop in Hz.
	 */
	punch?: number;
}

/**
 * Kick drum: a sine with an exponential pitch drop, a short filtered click, and soft saturation.
 *
 * @param out - Output buffer.
 * @param sr - Sample rate.
 * @param n - Hit (only start and velocity are used).
 * @param rng - Seeded RNG for the click noise.
 * @param opts - Level, resting pitch, decay and pitch-drop depth.
 */
export function kick(out: Stereo, sr: number, n: Note, rng: Rng, opts: KickOptions = {}): void {
	const { gain = 1, tune = 50, decay = 0.32, punch = 120 } = opts;
	const v = n.vel / 127;
	const start = Math.round(n.start * sr);
	const len = Math.round((decay * 5 + 0.05) * sr);
	const [l, r] = out;
	let phase = 0;
	let lp = 0;

	for (let k = 0; k < len && start + k < l.length; k++) {
		const t = k / sr;
		const freq = tune + punch * Math.exp(-t / 0.032) + 40 * Math.exp(-t / 0.006);

		phase += (TAU * freq) / sr;
		lp += 0.25 * (rng.float() * 2 - 1 - lp);

		const body = Math.sin(phase) * Math.exp(-t / decay);
		const click = lp * Math.exp(-t / 0.0025) * 0.35;
		const s = Math.tanh((body + click) * 1.6) * gain * (0.45 + 0.55 * v);

		l[start + k] += s;
		r[start + k] += s;
	}
}

/**
 * Band-limited single-cycle saw with a spectral tilt, for wavetable playback.
 *
 * @param f - Fundamental (sets how many harmonics fit).
 * @param sr - Sample rate.
 * @param cutoff - Rolloff frequency in Hz.
 * @returns A 2048-sample table normalised to ±1.
 */
function sawTable(f: number, sr: number, cutoff: number): Float32Array {
	const N = 2048;
	const table = new Float32Array(N);

	for (let k = 1; f * k < Math.min(sr / 2.2, cutoff * 4); k++) {
		const amp = (1 / k) * Math.exp(-(f * k) / cutoff);

		for (let i = 0; i < N; i++) {
			table[i] += amp * Math.sin((TAU * k * i) / N);
		}
	}

	let peak = 0;

	for (const x of table) {
		peak = Math.max(peak, Math.abs(x));
	}

	for (let i = 0; i < N; i++) {
		table[i] /= peak || 1;
	}

	return table;
}

export interface PadOptions {
	/**
	 * Linear gain.
	 */
	gain?: number;
	/**
	 * Spectral rolloff in Hz.
	 */
	cutoff?: number;
	/**
	 * Fade-in time in seconds.
	 */
	attack?: number;
	/**
	 * Release time constant in seconds.
	 */
	releaseSec?: number;
}

/**
 * Warm analogue-style pad: three detuned band-limited saws per note spread across the stereo field, slow attack and release.
 *
 * @param out - Output buffer.
 * @param sr - Sample rate.
 * @param n - Note.
 * @param rng - Seeded RNG for start phases.
 * @param opts - Tone and envelope.
 */
export function pad(out: Stereo, sr: number, n: Note, rng: Rng, opts: PadOptions = {}): void {
	const { gain = 1, cutoff = 1400, attack = 0.9, releaseSec = 1.6 } = opts;
	const f = hz(n.note);
	const table = sawTable(f, sr, cutoff);
	const N = table.length;

	const voices = [-9, 0, 8].map(function voice(cents, idx) {
		return {
			inc: (N * f * 2 ** (cents / 1200)) / sr,
			pos: rng.float() * N,
			gl: Math.sqrt((1 - (idx - 1) * 0.8) / 2),
			gr: Math.sqrt((1 + (idx - 1) * 0.8) / 2),
		};
	});

	const start = Math.round(n.start * sr);
	const off = Math.round(n.end * sr);
	const relCoef = Math.exp(-1 / (releaseSec * sr));
	const g = (gain * (0.5 + 0.5 * (n.vel / 127))) / 3;
	const atk = 1 / (attack * sr);
	const [l, r] = out;
	let env = 0;

	for (let i = start; i < l.length; i++) {
		if (i < off) {
			env = Math.min(1, env + atk);
		} else {
			env *= relCoef;

			if (env < 1e-4) {
				break;
			}
		}

		let sl = 0,
			sr2 = 0;

		for (const vc of voices) {
			const j = Math.floor(vc.pos);
			const fr = vc.pos - j;
			const s = table[j % N] + (table[(j + 1) % N] - table[j % N]) * fr;

			sl += s * vc.gl;
			sr2 += s * vc.gr;
			vc.pos += vc.inc;

			if (vc.pos >= N) {
				vc.pos -= N;
			}
		}

		l[i] += sl * env * g;
		r[i] += sr2 * env * g;
	}
}
