// Offline multisample player: nearest-root zone, velocity-layer crossfade, round robin, damper release and release samples.

import type { Note, Stereo } from "../types.ts";

/**
 * One recorded sample, mapped to a root note, a 1-based velocity layer and a round-robin slot.
 */
export interface Zone {
	root: number;
	layer: number;
	rr: number;
	sampleRate: number;
	data: Stereo;
}

export interface Instrument {
	zones: Zone[];
	/**
	 * Key-up noises (dampers falling), triggered at note-off.
	 */
	releases?: Zone[];
	layers: number;
	/**
	 * Damper time constant after note-off.
	 */
	damperSec?: number;
	releaseGain?: number;
	/**
	 * Global detune in semitones.
	 */
	tune?: number;
}

/**
 * Round-robin counters, one map per instrument.
 */
export type RoundRobin = Map<string, number>;

/**
 * 4-point cubic Hermite interpolation.
 *
 * @param d - Source samples.
 * @param pos - Fractional read position.
 * @returns Interpolated sample.
 */
function hermite(d: Float32Array, pos: number): number {
	const i = Math.floor(pos);
	const f = pos - i;
	const xm1 = i > 0 ? d[i - 1] : 0;
	const x0 = d[i] ?? 0;
	const x1 = d[i + 1] ?? 0;
	const x2 = d[i + 2] ?? 0;
	const c1 = 0.5 * (x1 - xm1);
	const c2 = xm1 - 2.5 * x0 + 2 * x1 - 0.5 * x2;
	const c3 = 0.5 * (x2 - xm1) + 1.5 * (x0 - x1);

	return ((c3 * f + c2) * f + c1) * f + x0;
}

/**
 * Distance used to pick a zone: semitones away, with a small penalty for pitching up (pitching down sounds more natural).
 *
 * @param z - Zone.
 * @param note - Target note.
 * @returns Distance.
 */
function zoneDistance(z: Zone, note: number): number {
	return Math.abs(z.root - note) + (z.root < note ? 0.1 : 0);
}

/**
 * Picks the nearest-root zone in a layer, rotating through its round robins.
 *
 * @param zones - Candidate zones.
 * @param note - MIDI note.
 * @param layer - Velocity layer.
 * @param rr - Round-robin counters.
 * @returns The zone, if the layer has any.
 */
function pickZone(zones: Zone[], note: number, layer: number, rr: RoundRobin): Zone | undefined {
	let best = Infinity;

	for (const z of zones) {
		if (z.layer === layer) {
			best = Math.min(best, zoneDistance(z, note));
		}
	}

	const candidates = zones.filter(function nearest(z) {
		return z.layer === layer && zoneDistance(z, note) === best;
	});

	if (!candidates.length) {
		return undefined;
	}

	const key = `${candidates[0].root}:${layer}`;
	const n = rr.get(key) ?? 0;

	rr.set(key, n + 1);

	return candidates.sort(function byRr(a, b) {
		return a.rr - b.rr;
	})[n % candidates.length];
}

/**
 * Mixes one zone into the output, pitched to `note`, fading with the damper after `offSec`.
 *
 * @param out - Output buffer.
 * @param outRate - Output sample rate.
 * @param zone - Sample zone.
 * @param note - MIDI note (may be fractional).
 * @param gain - Linear gain.
 * @param startSec - Onset.
 * @param offSec - Note-off time (Infinity lets the sample ring out).
 * @param damperSec - Release time constant.
 * @param tune - Detune in semitones.
 */
function mixZone(
	out: Stereo,
	outRate: number,
	zone: Zone,
	note: number,
	gain: number,
	startSec: number,
	offSec: number,
	damperSec: number,
	tune: number,
): void {
	const rate = (zone.sampleRate / outRate) * 2 ** ((note - zone.root + tune) / 12);
	const start = Math.round(startSec * outRate);
	const off = Number.isFinite(offSec) ? Math.round(offSec * outRate) : Infinity;
	const srcLen = zone.data[0].length;
	const damp = Math.exp(-1 / (damperSec * outRate));
	const [l, r] = out;
	let env = 1;

	for (let i = start, pos = 0; i < l.length && pos < srcLen - 2; i++, pos += rate) {
		if (i >= off) {
			env *= damp;

			if (env < 1e-4) {
				break;
			}
		}

		const g = gain * env;

		l[i] += hermite(zone.data[0], pos) * g;
		r[i] += hermite(zone.data[1], pos) * g;
	}
}

export interface PlayOptions {
	/**
	 * Extra linear gain.
	 */
	gain?: number;
	/**
	 * Ignore note-off and let the sample ring out (drums).
	 */
	ringOut?: boolean;
}

/**
 * Plays one note of a multisampled instrument, crossfading the two velocity layers nearest the note's velocity.
 *
 * @param out - Output buffer.
 * @param outRate - Output sample rate.
 * @param inst - Instrument.
 * @param rr - Round-robin counters for this instrument.
 * @param n - Note.
 * @param opts - Extra gain; `ringOut` ignores note-off (drums).
 */
export function playNote(out: Stereo, outRate: number, inst: Instrument, rr: RoundRobin, n: Note, opts: PlayOptions = {}): void {
	const { gain = 1, ringOut = false } = opts;
	const v = Math.min(1, Math.max(0, n.vel / 127));
	const x = v * (inst.layers - 1);
	const lo = Math.floor(x);
	const hi = Math.min(inst.layers - 1, lo + 1);
	const mixHi = x - lo;
	// the layers carry most of the dynamics; a gentle curve adds the rest
	const vg = gain * (0.35 + 0.65 * v ** 1.5);
	const off = ringOut ? Infinity : n.end;
	const damper = inst.damperSec ?? 0.12;
	const tune = inst.tune ?? 0;

	for (const [layer, w] of [
		[lo + 1, 1 - mixHi],
		[hi + 1, mixHi],
	] as const) {
		if (w < 0.02) {
			continue;
		}

		const zone = pickZone(inst.zones, n.note, layer, rr);

		if (zone) {
			mixZone(out, outRate, zone, n.note, vg * Math.sqrt(w), n.start, off, damper, tune);
		}
	}

	if (!ringOut && inst.releases?.length) {
		const held = n.end - n.start;
		const rel = pickZone(inst.releases, n.note, Math.round(x) + 1, rr);

		// release noise is louder when the string still has energy, i.e. after short notes
		if (rel) {
			mixZone(out, outRate, rel, n.note, vg * (inst.releaseGain ?? 0.5) * Math.exp(-held / 2.5), n.end, Infinity, 1, tune);
		}
	}
}
