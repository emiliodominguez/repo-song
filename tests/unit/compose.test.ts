import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { composeLofi } from "../../src/compose/lofi.ts";
import { makeRng } from "../../src/compose/rng.ts";

// quebracho's root commit; any 40-char hash works, this one is the song the sound was tuned on
const SEED = "df6110d5dfbd74d79e1e4aa0b9baa8167cad46e5";

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

describe("composeLofi", () => {
	it("gives a repo the same song every time (golden fingerprint)", () => {
		const song = composeLofi(SEED, 45);
		const hash = createHash("sha256").update(JSON.stringify(song)).digest("hex");

		expect([song.key, song.scale, song.bpm]).toEqual(["G", "pentaMinor", 70]);
		// changing this hash changes every repo's song; only update it on purpose, and say so in the changelog
		expect(hash).toBe("7fd357b6c3008a41c0a0e4bc5ff5b23e9a99bfb7e2790e574d210ebe1532de90");
	});

	it("gives different repos different songs", () => {
		const a = composeLofi("90ed002cfc8bc525b5ef09c31f01d2a5c13132b6", 45);
		const b = composeLofi(SEED, 45);

		expect(JSON.stringify(a.parts)).not.toBe(JSON.stringify(b.parts));
	});

	it("keeps every note musical and inside the song", () => {
		const song = composeLofi("any seed", 60);

		for (const [role, notes] of Object.entries(song.parts)) {
			expect(notes.length, role).toBeGreaterThan(0);

			for (const n of notes) {
				expect(n.note).toBeGreaterThanOrEqual(21);
				expect(n.note).toBeLessThanOrEqual(104);
				expect(n.vel).toBeGreaterThanOrEqual(1);
				expect(n.vel).toBeLessThanOrEqual(127);
				expect(n.end).toBeGreaterThan(n.start);
				expect(n.start).toBeLessThan(61);
			}
		}
	});

	it("orders each part by onset", () => {
		for (const notes of Object.values(composeLofi(SEED, 45).parts)) {
			for (let i = 1; i < notes.length; i++) {
				expect(notes[i].start).toBeGreaterThanOrEqual(notes[i - 1].start);
			}
		}
	});
});
