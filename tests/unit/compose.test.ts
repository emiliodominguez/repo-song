import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { DRUM, drumBar, swingOffset } from "../../src/compose/groove.ts";
import { chordPcs, chordScale, PROGRESSIONS, QUALITIES, voiceChord } from "../../src/compose/harmony.ts";
import { composeLofi } from "../../src/compose/lofi.ts";
import { makeRng } from "../../src/compose/rng.ts";
import { planSections, songShape } from "../../src/compose/story.ts";
import { fixtureHistory } from "./fixtures.ts";

const history = fixtureHistory();

describe("rng", () => {
	it("is deterministic per seed", () => {
		const a = makeRng("x");
		const b = makeRng("x");

		expect([a.float(), a.int(0, 9), a.gauss()]).toEqual([b.float(), b.int(0, 9), b.gauss()]);
	});

	it("matches music-radio's sequence for a known seed", () => {
		const rng = makeRng("lofi:demo");

		// values produced by music-radio/rng.mjs for the same seed
		expect([rng.int(0, 11), rng.float(), rng.gauss(), rng.pick(["a", "b", "c"])]).toEqual([2, 0.9349700377788395, -0.3306618578499183, "c"]);
	});
});

describe("harmony", () => {
	it("voices every progression's chords in range with smooth voice leading", () => {
		const range = { lo: 53, hi: 77, center: 65 };

		for (const prog of PROGRESSIONS) {
			for (let tonic = 0; tonic < 12; tonic++) {
				let prev: number[] | undefined;

				for (const chord of [...prog.chords, ...prog.chords]) {
					const v = voiceChord(chord, tonic, prev, range);

					expect(v.length).toBeGreaterThanOrEqual(3);
					expect(Math.min(...v)).toBeGreaterThanOrEqual(range.lo);
					expect(Math.max(...v)).toBeLessThanOrEqual(range.hi);

					const from = prev ?? v;
					const moved = v.reduce((s, n) => s + Math.min(...from.map((p) => Math.abs(p - n))), 0) / v.length;

					expect(moved).toBeLessThanOrEqual(4.5);

					prev = v;
				}
			}
		}
	});

	it("keeps avoid notes out of chord scales", () => {
		for (const prog of PROGRESSIONS) {
			for (const chord of prog.chords) {
				const tones = new Set(chordPcs(chord));

				for (const pc of chordScale(chord, prog.scale)) {
					expect(tones.has(pc) || !tones.has((pc + 11) % 12), `${chord.quality} on ${chord.root}: ${pc}`).toBe(true);
				}
			}
		}
	});

	it("only uses defined chord qualities", () => {
		for (const prog of PROGRESSIONS) {
			expect(prog.chords).toHaveLength(4);

			for (const chord of prog.chords) {
				expect(QUALITIES[chord.quality]).toBeDefined();
			}
		}
	});
});

describe("groove", () => {
	it("keeps the backbeat and stops dead after beat three on a stop fill", () => {
		const spb = 0.75;
		const { hits } = drumBar(makeRng("g"), 0, spb, 0.15, { kickPattern: 1, energy: 0.7, fill: "stop" });

		expect(hits.some((h) => h.note === DRUM.kick && h.time < 0.01)).toBe(true);
		expect(hits.filter((h) => h.note === DRUM.snare && h.vel > 60)).toHaveLength(1);
		expect(Math.max(...hits.map((h) => h.time))).toBeLessThan(2 * spb + 0.05);
	});

	it("swings off-beats late and leaves downbeats alone", () => {
		expect(swingOffset(0, 0.1, 0.2)).toBe(0);
		expect(swingOffset(2, 0.1, 0.2)).toBeCloseTo(0.02);
		expect(swingOffset(3, 0.1, 0.2)).toBeCloseTo(0.03);
	});
});

describe("story", () => {
	const shape = songShape(90, 78);
	const sections = planSections(history, shape);

	it("covers every bar with an intro, history phrases and an outro", () => {
		let bar = 0;

		for (const s of sections) {
			expect(s.startBar).toBe(bar);
			bar += s.bars;
		}

		expect(sections[0]?.kind).toBe("intro");
		expect(sections.at(-1)?.kind).toBe("outro");
		expect(sections.length - 2).toBe(shape.phrases);
	});

	it("reads the burst, the lull, the releases and the newcomers from the history", () => {
		const middle = sections.slice(1, -1);

		expect(middle[0]?.peak).toBe(true);
		expect(middle.some((s) => s.kind === "breakdown")).toBe(true);
		expect(middle.flatMap((s) => s.releases)).toEqual(["v0.1.0", "v1.0.0", "v1.1.0"]);
		expect(middle.reduce((n, s) => n + s.newAuthors, 0)).toBe(4);
		expect(middle[0]?.energy).toBeGreaterThan(middle.find((s) => s.kind === "breakdown")?.energy ?? 1);
	});
});

describe("composeLofi", () => {
	const song = composeLofi(history, 90);

	it("gives a repo the same song every time (golden fingerprint)", () => {
		const hash = createHash("sha256").update(JSON.stringify(song)).digest("hex");

		expect(song.seconds).toBeGreaterThan(80);
		// changing this hash changes every repo's song: only update it on purpose, after listening
		expect(hash).toBe("791c24b55e108bca967482f3978a9653f949a02014740dd58e12fd47d0c72ed3");
	});

	it("keeps the identity when the history grows", () => {
		const grown = composeLofi(
			{ ...history, commits: [...history.commits, { time: history.commits.at(-1)!.time + 86400, author: "new@x.dev" }] },
			90,
		);

		expect([grown.key, grown.mode, grown.bpm]).toEqual([song.key, song.mode, song.bpm]);
	});

	it("gives different repos different songs", () => {
		const other = composeLofi({ ...history, root: "90ed002cfc8bc525b5ef09c31f01d2a5c13132b6" }, 90);

		expect(JSON.stringify(other.parts)).not.toBe(JSON.stringify(song.parts));
	});

	it("keeps every part in its register and inside the song", () => {
		const ranges = { lead: [24, 98], keys: [52, 74], pad: [40, 62], bass: [28, 52], drums: [36, 70] } as const;

		for (const role of ["lead", "keys", "pad", "bass", "drums"] as const) {
			const notes = song.parts[role];

			expect(notes.length, role).toBeGreaterThan(0);

			for (const n of notes) {
				expect(n.note, role).toBeGreaterThanOrEqual(ranges[role][0]);
				expect(n.note, role).toBeLessThanOrEqual(ranges[role][1]);
				expect(n.vel).toBeGreaterThanOrEqual(1);
				expect(n.vel).toBeLessThanOrEqual(127);
				expect(n.end).toBeGreaterThan(n.start);
				expect(n.start).toBeGreaterThanOrEqual(0);
				expect(n.start).toBeLessThan(song.seconds + 0.5);
			}
		}
	});

	it("never lets the piano rub a half step or minor ninth against the chords under it", () => {
		for (const root of ["a", "b", "c", "d", "e", "f", "g", "h", "i", "j", "k", "l", "m", "n", "o", "p"]) {
			const s = composeLofi({ ...history, root }, 90);
			const harmony = [...s.parts.keys, ...s.parts.pad];

			for (const m of s.parts.lead) {
				const rub = harmony.find((h) => h.start < m.end - 0.03 && h.end > m.start + 0.03 && [1, 13, 25].includes(Math.abs(m.note - h.note)));

				expect(rub, `seed ${root}: piano ${m.note} at ${m.start.toFixed(2)} vs ${rub?.note}`).toBeUndefined();
			}
		}
	});

	it("leaves the intro without drums or bass", () => {
		const intro = song.sections[0];

		expect(song.parts.drums.filter((n) => n.start < (intro?.endSec ?? 0) - 0.05)).toHaveLength(0);
		expect(song.parts.bass.filter((n) => n.start < (intro?.endSec ?? 0) - 0.05)).toHaveLength(0);
	});
});
