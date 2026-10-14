// The lofi composer: seed -> key, scale, tempo, chord progression, Rhodes comping, bass, a motif-based melody and a boom-bap groove.
// Ported from music-radio's compose() keeping every RNG draw in the same order, so a seed yields the same song in both.
// Timing is quantised to MIDI ticks (480 ppq) exactly as the original, which matters for that compatibility.

import type { Note, Role, Song } from "../types.ts";
import { makeRng, type Rng } from "./rng.ts";
import { intervalAtDegree, NOTE_NAMES, type ScaleName, SCALES } from "./theory.ts";

const PROFILE = {
	bpm: [68, 84],
	// [scale, weight] in the original's key order, which the weighted draw depends on
	scales: [
		["minor", 3],
		["dorian", 3],
		["major", 2],
		["mixolydian", 2],
		["pentaMinor", 1],
	] satisfies [ScaleName, number][],
	seventh: 0.75,
	swing: 0.18,
	density: 0.6,
};

const PPQ = 480;
const DRUM = { kick: 36, snare: 38, hatC: 42, hatO: 46 };
const ROLE_CH: Record<Role, number> = { pad: 0, keys: 1, lead: 2, bass: 3, drums: 9 };

interface Pending {
	role: Role;
	n: number;
	vel: number;
	on: number;
	off: number;
}

interface Chord {
	start: number;
	end: number;
	degree: number;
}

/**
 * Chord tones (semitones from the key root) for the diatonic chord on `degree`, optionally with its 7th.
 *
 * @param scale - Scale intervals.
 * @param degree - Scale degree of the chord root.
 * @param withSeventh - Stack the 7th (only on 7-note scales; on pentatonics it lands a cluttered minor 10th).
 * @returns Chord offsets.
 */
function chordOffsets(scale: readonly number[], degree: number, withSeventh: boolean): number[] {
	const offs = [intervalAtDegree(scale, degree), intervalAtDegree(scale, degree + 2), intervalAtDegree(scale, degree + 4)];

	if (withSeventh && scale.length >= 7) {
		offs.push(intervalAtDegree(scale, degree + 6));
	}

	return offs;
}

/**
 * Laid-back boom-bap: kick on 1 plus an optional pickup, snare on 2 and 4, swung 8th hats, an occasional open hat.
 *
 * @param rng - Seeded RNG.
 * @param bars - Number of bars.
 * @param secPerBeat - Beat length.
 * @param swing - Fraction of a 16th that odd steps are delayed by.
 * @returns Hits with times in seconds.
 */
function lofiDrums(rng: Rng, bars: number, secPerBeat: number, swing: number): { note: number; vel: number; tSec: number; dur: number }[] {
	const stepDur = secPerBeat / 4;
	const hits: { note: number; vel: number; tSec: number; dur: number }[] = [];

	/**
	 * Places one hit on a 16th-note step.
	 *
	 * @param note - GM drum note.
	 * @param bar - Bar index.
	 * @param step - 16th step in the bar.
	 * @param vel - Velocity.
	 */
	function hit(note: number, bar: number, step: number, vel: number): void {
		let t = bar * 4 * secPerBeat + step * stepDur;

		if (swing && step % 2 === 1) {
			t += swing * stepDur;
		}

		hits.push({ note, vel, tSec: t, dur: 0.5 * stepDur });
	}

	for (let b = 0; b < bars; b++) {
		hit(DRUM.kick, b, 0, rng.int(86, 104));

		if (rng.chance(0.6)) {
			hit(DRUM.kick, b, rng.pick([6, 7, 10]), rng.int(70, 92));
		}

		hit(DRUM.snare, b, 4, rng.int(80, 98));
		hit(DRUM.snare, b, 12, rng.int(80, 98));

		for (let s = 0; s < 16; s += 2) {
			if (rng.chance(0.85)) {
				hit(DRUM.hatC, b, s, rng.int(40, 66));
			}
		}

		if (rng.chance(0.15)) {
			hit(DRUM.hatO, b, 14, rng.int(50, 70));
		}
	}

	return hits;
}

/**
 * A phrased melody: one motif (rhythm + contour) reused through the piece, moving mostly by step, landing on chord tones
 * on strong beats, resolving at each phrase end, and leaving whole phrases empty so it breathes.
 *
 * @param rng - Seeded RNG.
 * @param scale - Scale intervals.
 * @param baseMidi - Key root in the chord register.
 * @param chords - Chord timeline.
 * @param secPerBeat - Beat length.
 * @param seconds - Song length.
 * @param place - Receives each melody note.
 */
function melody(
	rng: Rng,
	scale: readonly number[],
	baseMidi: number,
	chords: Chord[],
	secPerBeat: number,
	seconds: number,
	place: (n: number, vel: number, startSec: number, durSec: number) => void,
): void {
	const len = scale.length;

	/**
	 * Pitch of a scale-degree index, an octave above the chords.
	 *
	 * @param idx - Degree index.
	 * @returns MIDI note.
	 */
	function pitchOf(idx: number): number {
		return baseMidi + intervalAtDegree(scale, idx) + 12;
	}

	/**
	 * Chord degree sounding at a time.
	 *
	 * @param sec - Time.
	 * @returns Degree.
	 */
	function degAt(sec: number): number {
		for (const c of chords) {
			if (sec >= c.start && sec < c.end) {
				return c.degree;
			}
		}

		return chords.length ? chords[chords.length - 1].degree : 0;
	}

	/**
	 * Nearest chord-tone (1-3-5) degree index to `idx` across nearby octaves.
	 *
	 * @param idx - Current degree index.
	 * @param d - Chord degree.
	 * @returns Degree index.
	 */
	function nearestTone(idx: number, d: number): number {
		const tones: number[] = [];

		for (let o = -len; o <= 2 * len; o += len) {
			tones.push(d + o, d + 2 + o, d + 4 + o);
		}

		return tones.reduce(function closer(b, c) {
			return Math.abs(c - idx) < Math.abs(b - idx) ? c : b;
		});
	}

	const rhythmCells = [
		[1, 1, 2],
		[0.5, 0.5, 1, 1, 1],
		[1, 0.5, 0.5, 2],
		[1.5, 0.5, 1, 1],
		[0.5, 0.5, 1, 0.5, 0.5, 1],
		[2, 1, 1],
		[1, 1, 0.5, 0.5, 1],
	];

	const rhythm = rng.pick(rhythmCells);

	const contour = rhythm.map(function step(_, i) {
		return i === 0 ? 0 : rng.weighted([-2, -1, 1, 2, 3], [2, 4, 4, 2, 1]);
	});

	const PH = 8;
	const playChance = 0.55 + PROFILE.density * 0.35;
	const totalBeats = seconds / secPerBeat;
	let prevIdx = 0;

	for (let pStart = 0; pStart < totalBeats; pStart += PH) {
		const phraseSec = pStart * secPerBeat;

		if (phraseSec >= seconds) {
			break;
		}

		if (!rng.chance(playChance)) {
			continue;
		}

		const d = degAt(phraseSec);
		let idx = nearestTone(prevIdx || d + 2, d);
		let beat = 0;
		const vary = rng.chance(0.5);

		for (let s = 0; s < rhythm.length; s++) {
			if (beat >= PH - 0.5) {
				break;
			}

			const tSec = phraseSec + beat * secPerBeat;

			if (tSec >= seconds) {
				break;
			}

			const dur = rhythm[s];

			if (s > 0 && rng.chance(0.12)) {
				beat += dur;
				continue;
			}

			if (beat % 2 < 1e-6) {
				idx = nearestTone(idx, degAt(tSec));
			}

			const vel = Math.min(95, rng.int(52, 76) + (s === 0 ? 10 : 0));

			place(pitchOf(idx), vel, tSec, dur * secPerBeat * 0.92);

			let step = contour[s % contour.length];

			if (vary && s === rhythm.length - 1) {
				step = -step;
			}

			idx += step;

			if (idx > len + 5) {
				idx -= len;
			}

			if (idx < -2) {
				idx += len;
			}

			beat += dur;
		}

		prevIdx = nearestTone(idx, degAt(phraseSec + (PH - 1) * secPerBeat));
		place(pitchOf(prevIdx), rng.int(48, 66), phraseSec + (PH - 1.5) * secPerBeat, secPerBeat * 1.2);
	}
}

/**
 * Composes a lofi song from a seed.
 *
 * @param seed - Song seed (e.g. a repo's root commit).
 * @param seconds - Length.
 * @returns The song.
 */
export function composeLofi(seed: string, seconds: number): Song {
	const rng = makeRng(`lofi:${seed}`);
	const rootPc = rng.int(0, 11);

	const scaleName = rng.weighted(
		PROFILE.scales.map(function name([n]) {
			return n;
		}),
		PROFILE.scales.map(function weight([, w]) {
			return w;
		}),
	);

	const scale = SCALES[scaleName];
	const bpm = Math.round(rng.range(PROFILE.bpm[0], PROFILE.bpm[1]));
	const baseMidi = 48 + rootPc;
	const secPerBeat = 60 / bpm;
	const tps = (PPQ * bpm) / 60;
	const secPerTick = 60 / bpm / PPQ;

	// music-radio drew a GM program and a reverb send for each of the four melodic channels here (unused by this renderer)
	for (let i = 0; i < 8; i++) {
		rng.float();
	}

	const pending: Pending[] = [];

	/**
	 * Queues a humanised note, quantised to ticks; out-of-range pitches are dropped before any draw.
	 *
	 * @param role - Part.
	 * @param n - MIDI note.
	 * @param vel - Velocity.
	 * @param startSec - Onset.
	 * @param durSec - Length.
	 */
	function note(role: Role, n: number, vel: number, startSec: number, durSec: number): void {
		if (n < 21 || n > 104) {
			return;
		}

		const on = Math.max(0, Math.round(startSec * tps) + Math.round(rng.gauss() * 0.018 * tps));
		const off = on + Math.max(2, Math.round(durSec * tps));

		pending.push({ role, n, vel: Math.max(1, Math.min(127, vel | 0)), on, off });
	}

	let degree = rng.int(0, 6);
	let tSec = 0;
	const chords: Chord[] = [];

	while (tSec < seconds) {
		const beats = rng.weighted([2, 4, 8], [0, 3, 2]);
		const dur = beats * secPerBeat;
		const offs = chordOffsets(scale, degree, rng.chance(PROFILE.seventh));
		const top = offs[offs.length - 1];

		chords.push({ start: tSec, end: tSec + dur, degree });

		for (const o of offs) {
			note("pad", baseMidi + o, rng.int(46, 64), tSec, dur + 0.3);
		}

		if (rng.chance(0.5)) {
			note("pad", baseMidi + top + 12, rng.int(38, 54), tSec, dur + 0.3);
		}

		const comps = rng.int(1, 3);

		for (let c = 0; c < comps; c++) {
			const at = tSec + rng.range(0, dur * 0.75);

			note("keys", baseMidi + rng.pick(offs), rng.int(56, 86), at, rng.range(0.5, 1.6));

			if (rng.chance(0.5)) {
				note("keys", baseMidi + rng.pick(offs) + 12, rng.int(48, 76), at, rng.range(0.4, 1.0));
			}
		}

		note("bass", baseMidi - 24 + offs[0], rng.int(74, 98), tSec, dur * rng.range(0.4, 0.7));

		const bsteps = rng.int(0, 2);

		for (let s = 1; s <= bsteps; s++) {
			note("bass", baseMidi - 24 + rng.pick(offs), rng.int(64, 90), tSec + (s / (bsteps + 1)) * dur, secPerBeat * 0.4);
		}

		const step = rng.weighted([-3, -2, -1, 1, 2, 3], [2, 3, 4, 4, 3, 2]);

		degree = (((degree + step) % 7) + 7) % 7;
		tSec += dur;
	}

	melody(rng, scale, baseMidi, chords, secPerBeat, seconds, function placeLead(n, vel, startSec, durSec) {
		note("lead", n, vel, startSec, durSec);
	});

	for (const d of lofiDrums(rng, Math.ceil(seconds / (4 * secPerBeat)), secPerBeat, PROFILE.swing)) {
		if (d.tSec < seconds) {
			note("drums", d.note, d.vel, d.tSec, d.dur);
		}
	}

	return { seed, seconds, bpm, key: NOTE_NAMES[rootPc], scale: scaleName, parts: finalize(pending, secPerTick) };
}

/**
 * Merges overlapping same-pitch notes per part (drums excepted, retriggers are fine), then orders each part by onset.
 * Emission order and the stable sort mirror the original MIDI event path, which the renderer's RNG draws depend on.
 *
 * @param pending - Queued notes in ticks.
 * @param secPerTick - Seconds per tick.
 * @returns Notes per part, in seconds.
 */
function finalize(pending: Pending[], secPerTick: number): Record<Role, Note[]> {
	const groups = new Map<number, Pending[]>();

	for (const nt of pending) {
		const key = ROLE_CH[nt.role] * 128 + nt.n;
		const list = groups.get(key) ?? [];

		list.push(nt);
		groups.set(key, list);
	}

	const emitted: Pending[] = [];

	for (const list of groups.values()) {
		if (list[0].role === "drums") {
			emitted.push(...list);
			continue;
		}

		list.sort(function byOn(a, b) {
			return a.on - b.on;
		});

		let cur: Pending | undefined;

		for (const nt of list) {
			if (cur && nt.on < cur.off) {
				cur.off = Math.max(cur.off, nt.off);
				cur.vel = Math.max(cur.vel, nt.vel);
			} else {
				if (cur) {
					emitted.push(cur);
				}

				cur = { ...nt };
			}
		}

		if (cur) {
			emitted.push(cur);
		}
	}

	emitted.sort(function byOnset(a, b) {
		return a.on - b.on;
	});

	const parts: Record<Role, Note[]> = { pad: [], keys: [], lead: [], bass: [], drums: [] };

	for (const nt of emitted) {
		parts[nt.role].push({ note: nt.n, vel: nt.vel, start: nt.on * secPerTick, end: nt.off * secPerTick });
	}

	return parts;
}
