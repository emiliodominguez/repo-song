// The lofi composer. The root commit fixes the song's identity (key, tempo, swing, progressions, themes); the rest of
// the history shapes its form (see story.ts). Each concern draws from its own seeded stream, so changing one part of
// the arrangement doesn't reshuffle the others.

import type { History } from "../history.ts";
import type { Note, Role, Song, TimedSection } from "../types.ts";
import { drumBar, type Hit, pickKickPattern, pulseBar, swingOffset } from "./groove.ts";
import { type Chord, type ParentScale, pickProgressions, voiceChord } from "./harmony.ts";
import { makeMotif, playPhrase } from "./melody.ts";
import { makeRng, type Rng } from "./rng.ts";
import { planSections, type Section, songShape } from "./story.ts";

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];

/**
 * Rhodes comping figures for one bar: [start beat, length in beats, plays the next bar's chord early].
 */
const COMPS: Record<"whole" | "push" | "anticipate" | "busy", [number, number, boolean][]> = {
	whole: [[0, 3.9, false]],
	push: [
		[0, 1.5, false],
		[2.5, 1.4, false],
	],
	anticipate: [
		[0, 2.4, false],
		[3.5, 1.6, true],
	],
	busy: [
		[0, 0.8, false],
		[1.5, 0.6, false],
		[2.5, 0.9, false],
		[3.5, 1.4, true],
	],
};

interface Bar {
	section: Section;
	/**
	 * Bar index inside its section.
	 */
	index: number;
	chord: Chord;
	scale: ParentScale;
	start: number;
}

/**
 * Bass pitch for a chord root: the octave between G1 and F#2, where lofi bass sits.
 *
 * @param tonic - Key tonic pitch class.
 * @param root - Chord root, semitones above the tonic.
 * @returns MIDI note.
 */
function bassRoot(tonic: number, root: number): number {
	let n = 24 + ((tonic + root) % 12);

	while (n < 31) {
		n += 12;
	}

	return n;
}

/**
 * Merges overlapping notes of the same pitch (a re-struck pad note becomes one long note), then sorts by onset.
 *
 * @param notes - Notes.
 * @returns Merged notes.
 */
function mergeSustained(notes: Note[]): Note[] {
	const byPitch = new Map<number, Note[]>();

	for (const n of notes) {
		byPitch.set(n.note, [...(byPitch.get(n.note) ?? []), n]);
	}

	const out: Note[] = [];

	for (const list of byPitch.values()) {
		list.sort(byOnset);

		let cur: Note | undefined;

		for (const n of list) {
			if (cur && n.start <= cur.end + 0.02) {
				cur.end = Math.max(cur.end, n.end);
			} else {
				if (cur) {
					out.push(cur);
				}

				cur = { ...n };
			}
		}

		if (cur) {
			out.push(cur);
		}
	}

	return out.sort(byOnset);
}

/**
 * Orders notes by onset, then pitch, so every part is in a stable order.
 *
 * @param x - A note.
 * @param y - Another note.
 * @returns Sort order.
 */
function byOnset(x: Note, y: Note): number {
	return x.start - y.start || x.note - y.note;
}

/**
 * Converts drum hits to notes.
 *
 * @param hits - Hits.
 * @returns Notes (drums ignore note length).
 */
function hitsToNotes(hits: Hit[]): Note[] {
	return hits.map(function toNote(h) {
		return { note: h.note, vel: h.vel, start: h.time, end: h.time + 0.25 };
	});
}

/**
 * Composes a lofi song from a repository's history.
 *
 * @param history - Root commit (identity), commits and tags (form).
 * @param seconds - Approximate length; rounded to whole bars and phrases.
 * @returns The song.
 */
export function composeLofi(history: Pick<History, "root" | "commits" | "tags">, seconds: number): Song {
	const seed = history.root;
	const identity = makeRng(`identity:${seed}`);
	const tonic = identity.int(0, 11);
	const bpm = identity.int(70, 86);
	const swing = identity.range(0.1, 0.2);
	const { a, b } = pickProgressions(makeRng(`harmony:${seed}`));
	const tonicChord: Chord = { root: 0, quality: a.family === "major" ? "maj9" : "m9" };
	const secPerBeat = 60 / bpm;
	const barSec = 4 * secPerBeat;
	const sections = planSections(history, songShape(seconds, bpm));
	const bars: Bar[] = [];

	for (const section of sections) {
		const prog = section.progression === "a" ? a : b;

		for (let i = 0; i < section.bars; i++) {
			const last = i === section.bars - 1;
			const resolves = last && (section.kind === "outro" || section.releases.length > 0);

			bars.push({
				section,
				index: i,
				chord: resolves ? tonicChord : (prog.chords[i % prog.chords.length] ?? tonicChord),
				scale: prog.scale,
				start: (section.startBar + i) * barSec,
			});
		}
	}

	const parts: Record<Role, Note[]> = { pad: [], keys: [], lead: [], bass: [], drums: [] };
	const kickSteps = drums(makeRng(`groove:${seed}`), bars, secPerBeat, swing, parts.drums);

	const voicings = comp(makeRng(`comp:${seed}`), bars, tonic, secPerBeat, swing, parts.keys);

	pad(bars, voicings, barSec, parts.pad);
	bassLine(makeRng(`bass:${seed}`), bars, kickSteps, tonic, secPerBeat, swing, parts.bass);
	melodyLine(
		makeRng(`melody:${seed}`),
		bars,
		sections,
		tonic,
		secPerBeat,
		swing,
		tonicChord,
		voicings.at(-1) ?? [],
		[...parts.keys, ...parts.pad],
		parts.lead,
	);

	parts.pad = mergeSustained(parts.pad);

	for (const role of ["keys", "lead", "bass", "drums"] as const) {
		parts[role].sort(byOnset);
	}

	const timed: TimedSection[] = sections.map(function place(s) {
		return { ...s, startSec: s.startBar * barSec, endSec: (s.startBar + s.bars) * barSec };
	});

	return { seed, seconds: bars.length * barSec, bpm, key: NOTE_NAMES[tonic] ?? "C", mode: a.family, sections: timed, parts };
}

/**
 * Drums for every bar: silent intro, grooves by phrase energy, pulses in breakdowns, a fade-out groove in the outro.
 *
 * @param rng - Groove RNG.
 * @param bars - Bars.
 * @param secPerBeat - Beat length.
 * @param swing - Swing amount.
 * @param out - Receives drum notes.
 * @returns The kick's 16th steps per bar (empty where no kick plays).
 */
function drums(rng: Rng, bars: Bar[], secPerBeat: number, swing: number, out: Note[]): number[][] {
	const kicks: number[][] = [];
	let pattern = 0;

	for (const [i, bar] of bars.entries()) {
		const { section } = bar;
		const next = bars[i + 1]?.section;
		const lastOfSection = bar.index === section.bars - 1;

		if (bar.index === 0) {
			pattern = pickKickPattern(rng, section.energy);
		}

		if (section.kind === "intro" || (section.kind === "outro" && bar.index >= Math.ceil(section.bars / 2))) {
			kicks.push([]);
			continue;
		}

		if (section.kind === "breakdown") {
			out.push(...hitsToNotes(pulseBar(rng, bar.start, secPerBeat)));
			kicks.push([]);
			continue;
		}

		const stops = lastOfSection && (section.releases.length > 0 || next?.kind === "breakdown" || next?.kind === "outro");
		const fill = stops ? "stop" : lastOfSection && rng.chance(0.6) ? "ghosts" : "none";
		const energy = section.kind === "outro" ? 0.4 : section.energy;
		const { hits, kickSteps } = drumBar(rng, bar.start, secPerBeat, swing, { kickPattern: pattern, energy, fill });

		out.push(...hitsToNotes(hits));
		kicks.push(kickSteps);
	}

	return kicks;
}

/**
 * Rhodes comping: voice-led rootless voicings, rolled slightly, with figures that get busier with energy and push
 * into the next chord early.
 *
 * @param rng - Comping RNG.
 * @param bars - Bars.
 * @param tonic - Key tonic pitch class.
 * @param secPerBeat - Beat length.
 * @param swing - Swing amount.
 * @param out - Receives Rhodes notes.
 * @returns The voicing of each bar.
 */
function comp(rng: Rng, bars: Bar[], tonic: number, secPerBeat: number, swing: number, out: Note[]): number[][] {
	const range = { lo: 52, hi: 74, center: 62 };
	const voicings: number[][] = [];
	let prev: number[] | undefined;

	for (const bar of bars) {
		prev = voiceChord(bar.chord, tonic, prev, range);
		voicings.push(prev);
	}

	let figure: keyof typeof COMPS = "whole";
	let anticipated = false;

	for (const [i, bar] of bars.entries()) {
		const { section } = bar;

		if (bar.index === 0) {
			const sparse = section.kind === "intro" || section.kind === "breakdown" || section.kind === "outro";

			figure = sparse
				? "whole"
				: section.energy > 0.8
					? "busy"
					: section.energy > 0.5
						? rng.pick(["anticipate", "push"] as const)
						: rng.pick(["whole", "push"] as const);
		}

		const lastBar = i === bars.length - 1;
		const hits: [number, number, boolean][] = lastBar ? [[0, 8, false]] : COMPS[figure];

		for (const [at, len, early] of hits) {
			if (at === 0 && anticipated) {
				continue;
			}

			const voicing = (early ? voicings[i + 1] : undefined) ?? voicings[i] ?? [];
			const start = bar.start + at * secPerBeat + swingOffset(at * 4, secPerBeat / 4, swing);
			const vel = 50 + section.energy * 16;

			for (const [k, n] of voicing.entries()) {
				out.push({
					note: n,
					vel: Math.round(vel + (k === voicing.length - 1 ? 5 : 0) + rng.gauss() * 4),
					start: start + k * 0.007 + Math.abs(rng.gauss()) * 0.003,
					end: start + len * secPerBeat,
				});
			}
		}

		anticipated = !lastBar && hits.some((h) => h[2]);
	}

	return voicings;
}

/**
 * A soft pad doubling the lower three notes of the Rhodes voicing an octave down, so it thickens the harmony without
 * adding new intervals to rub against.
 *
 * @param bars - Bars.
 * @param voicings - Rhodes voicing per bar.
 * @param barSec - Bar length.
 * @param out - Receives pad notes.
 */
function pad(bars: Bar[], voicings: number[][], barSec: number, out: Note[]): void {
	for (const [i, bar] of bars.entries()) {
		const sparse = bar.section.kind !== "verse" && bar.section.kind !== "chorus";
		const hold = i === bars.length - 1 ? barSec * 2 : barSec + 0.3;

		for (const n of (voicings[i] ?? []).slice(0, 3)) {
			out.push({ note: n - 12, vel: sparse ? 50 : 46, start: bar.start, end: bar.start + hold });
		}
	}
}

/**
 * Bass locked to the kick: roots on the kick hits, octaves and fifths for movement, chromatic or scale approaches
 * into the next chord, long roots where the drums drop out.
 *
 * @param rng - Bass RNG.
 * @param bars - Bars.
 * @param kickSteps - Kick 16th steps per bar.
 * @param tonic - Key tonic pitch class.
 * @param secPerBeat - Beat length.
 * @param swing - Swing amount.
 * @param out - Receives bass notes.
 */
function bassLine(rng: Rng, bars: Bar[], kickSteps: number[][], tonic: number, secPerBeat: number, swing: number, out: Note[]): void {
	const s16 = secPerBeat / 4;

	for (const [i, bar] of bars.entries()) {
		const { section } = bar;
		const root = bassRoot(tonic, bar.chord.root);
		const lastBar = i === bars.length - 1;

		if (section.kind === "intro") {
			continue;
		}

		const steps = kickSteps[i] ?? [];

		if (!steps.length || lastBar) {
			// the drums are out: hold the root
			out.push({ note: root, vel: 74, start: bar.start, end: bar.start + (lastBar ? 8 : 3.6) * secPerBeat });
			continue;
		}

		const nextRoot = bassRoot(tonic, bars[i + 1]?.chord.root ?? bar.chord.root);

		const events = steps.map(function onKick(step, k) {
			const move = k === 0 ? 0 : rng.weighted([0, 12, 7], [5, 2, 2]);

			return { step, note: root + move <= 50 ? root + move : root, vel: k === 0 ? rng.int(90, 102) : rng.int(78, 92) };
		});

		const lastStep = Math.max(...steps);

		if (section.energy > 0.45 && nextRoot !== root && lastStep < 14 && rng.chance(0.55)) {
			events.push({ step: 14, note: rng.chance(0.6) ? nextRoot - 1 : nextRoot + 2, vel: rng.int(72, 84) });
		}

		for (const [k, e] of events.entries()) {
			const nextStep = events[k + 1]?.step ?? 16;
			const start = bar.start + e.step * s16 + swingOffset(e.step, s16, swing);
			const len = Math.min(nextStep - e.step - 0.4, 8) * s16;

			out.push({ note: e.note, vel: e.vel, start, end: start + Math.max(s16, len) });
		}
	}
}

/**
 * The piano: the A theme over A phrases, the B theme over B phrases, a fragment in breakdowns and the outro, and a
 * rolled tonic chord to close.
 *
 * @param rng - Melody RNG.
 * @param bars - Bars.
 * @param sections - Sections.
 * @param tonic - Key tonic pitch class.
 * @param secPerBeat - Beat length.
 * @param swing - Swing amount.
 * @param tonicChord - Home chord.
 * @param finalVoicing - The Rhodes voicing of the last chord; the piano doubles it an octave up to close.
 * @param harmony - The chord notes already written (Rhodes and pad), to keep the melody from rubbing against them.
 * @param out - Receives piano notes.
 */
function melodyLine(
	rng: Rng,
	bars: Bar[],
	sections: Section[],
	tonic: number,
	secPerBeat: number,
	swing: number,
	tonicChord: Chord,
	finalVoicing: number[],
	harmony: Note[],
	out: Note[],
): void {
	/**
	 * Half-step or minor-ninth rubs between a held pitch and the chord notes overlapping it.
	 *
	 * @param pitch - Candidate melody note.
	 * @param from - Note start.
	 * @param to - Note end.
	 * @returns Whether it clashes.
	 */
	function clashes(pitch: number, from: number, to: number): boolean {
		return harmony.some((h) => h.start < to - 0.03 && h.end > from + 0.03 && [1, 13, 25].includes(Math.abs(pitch - h.note)));
	}

	const themeA = makeMotif(rng);
	const themeB = makeMotif(rng, themeA.index);
	const repeats = { a: 0, b: 0 };
	let last = 72;
	let entered = false;

	for (const section of sections) {
		const first = bars[section.startBar];

		if (section.kind === "intro" || !first) {
			continue;
		}

		const theme = section.progression;
		// the B theme sits a little higher than wherever the A theme left off
		const startPitch = theme === "b" && repeats.b === 0 ? last + 4 : last;

		const phrase = playPhrase(
			rng,
			(theme === "a" ? themeA : themeB).motif,
			{
				start: first.start,
				secPerBeat,
				swing,
				tonic,
				scale: first.scale,
				chordAt(beat) {
					return bars[section.startBar + Math.min(section.bars - 1, Math.floor(beat / 4))]?.chord ?? tonicChord;
				},
				energy: section.energy,
				harmonize: section.newAuthors > 0 || section.peak,
				callOnly: section.kind === "breakdown" || section.kind === "outro",
				resolveToTonic: section.releases.length > 0,
				responseOnly: !entered && section.kind !== "breakdown",
				repeat: repeats[theme],
				clashes,
			},
			startPitch,
		);

		entered = true;
		repeats[theme]++;
		out.push(...phrase.notes);
		last = phrase.last;
	}

	// the last chord, rolled from the bass up on the piano and left to ring
	const end = bars[bars.length - 1];

	if (end) {
		const ring = end.start + 8 * secPerBeat;
		// the root goes in the highest octave that sits clear of the pad and Rhodes
		const root = [48, 36, 24].map((o) => o + tonic).find((n) => !clashes(n, end.start, ring)) ?? 36 + tonic;
		// doubling a voicing that spans a major seventh an octave up would land a minor ninth over its top note
		const upper = finalVoicing.map((n) => n + 12).filter((n) => !clashes(n, end.start, ring));
		const notes = [root, ...upper].sort((x, y) => x - y);

		for (const [k, n] of notes.entries()) {
			out.push({ note: n, vel: 56 - k * 2, start: end.start + k * 0.045, end: end.start + 8 * secPerBeat });
		}
	}
}
