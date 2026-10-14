import { createHash } from "node:crypto";

import { describe, expect, it } from "vitest";

import { assetsDir, missingAssets } from "../../src/assets.ts";
import { composeLofi } from "../../src/compose/lofi.ts";
import { gatedRmsDb } from "../../src/dsp/dynamics.ts";
import { loadKit } from "../../src/instruments/vcsl.ts";
import { renderLofi, SAMPLE_RATE } from "../../src/render/lofi.ts";

const SEED = "df6110d5dfbd74d79e1e4aa0b9baa8167cad46e5";
const haveAssets = missingAssets().length === 0;

// Needs the 255 MB of recordings (run `pnpm song` once, or point REPO_SONG_ASSETS at a copy). Skipped otherwise.
describe.skipIf(!haveAssets)("renderLofi (sound regression)", () => {
	const pcm = renderLofi(composeLofi(SEED, 45), loadKit(assetsDir()));

	it("renders the approved v3 sound bit for bit", () => {
		const h = createHash("sha256");

		h.update(new Uint8Array(pcm[0].buffer));
		h.update(new Uint8Array(pcm[1].buffer));
		// Math.sin/exp/tanh are deterministic within a V8 version; a Node upgrade may legitimately move this hash.
		// When it does, listen to the render before re-pinning.
		expect(h.digest("hex")).toBe("fd7441acf2916ffa290c16ca662b7913d07cc307c66b0f74f4afde3d0b714a38");
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
});
