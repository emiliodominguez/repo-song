import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { assetsDir, missingAssets } from "../../src/assets.ts";
import { composeLofi } from "../../src/compose/lofi.ts";
import { gatedRmsDb } from "../../src/dsp/dynamics.ts";
import { loadKit } from "../../src/instruments/vcsl.ts";
import { renderLofi, SAMPLE_RATE } from "../../src/render/lofi.ts";
import { fixtureHistory } from "./fixtures.ts";

const haveAssets = missingAssets().length === 0;

// Needs the 255 MB of recordings (run `pnpm song` once, or point REPO_SONG_ASSETS at a copy). Skipped otherwise.
describe.skipIf(!haveAssets)("renderLofi (sound regression)", () => {
	const song = composeLofi(fixtureHistory(), 90);
	const pcm = renderLofi(song, loadKit(assetsDir()));

	it("renders the approved sound bit for bit", () => {
		const h = createHash("sha256");

		h.update(new Uint8Array(pcm[0].buffer));
		h.update(new Uint8Array(pcm[1].buffer));
		// Math.sin/exp/tanh are deterministic within a V8 version; a Node upgrade may legitimately move this hash.
		// When it does, listen to the render before re-pinning.
		expect(h.digest("hex")).toBe("468c7bd7f6ae1de2337bf447a6122766cc26123e40378658fbc04dd3bf89bc61");
	});

	it("is mastered: peaks at or below -1.5 dBFS, loudness in range", () => {
		let peak = 0;

		for (const ch of pcm) {
			for (const x of ch) {
				peak = Math.max(peak, Math.abs(x));
			}
		}

		expect(20 * Math.log10(peak)).toBeLessThanOrEqual(-1.5 + 1e-6);
		expect(gatedRmsDb(pcm, SAMPLE_RATE)).toBeGreaterThan(-20);
		expect(gatedRmsDb(pcm, SAMPLE_RATE)).toBeLessThan(-14);
	});

	it("moves with the arrangement: the intro and breakdown sit well below the busiest phrase", () => {
		/**
		 * RMS level of a time span.
		 *
		 * @param from - Start, seconds.
		 * @param to - End, seconds.
		 * @returns dB.
		 */
		function level(from: number, to: number): number {
			let e = 0;
			const a = Math.round(from * SAMPLE_RATE);
			const b = Math.round(to * SAMPLE_RATE);

			for (let i = a; i < b; i++) {
				e += (pcm[0][i] ** 2 + pcm[1][i] ** 2) / 2;
			}

			return 10 * Math.log10(e / (b - a));
		}

		const intro = song.sections[0];
		const peak = song.sections.find((s) => s.peak);
		const breakdown = song.sections.find((s) => s.kind === "breakdown");
		const peakLevel = level(peak?.startSec ?? 0, peak?.endSec ?? 1);

		expect(peakLevel - level(intro?.startSec ?? 0, intro?.endSec ?? 1)).toBeGreaterThan(4);
		expect(peakLevel - level(breakdown?.startSec ?? 0, breakdown?.endSec ?? 1)).toBeGreaterThan(3);
	});
});
