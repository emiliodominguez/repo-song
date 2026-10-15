import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import manifest from "../../scripts/vcsl-manifest.json" with { type: "json" };
import { assetsDir } from "../../src/assets.ts";
import { decodeFlac } from "../../src/audio/flac.ts";
import { composeLofi } from "../../src/compose/lofi.ts";
import { PACK_SUSTAIN_SECONDS, SAMPLED } from "../../src/instruments/catalog.ts";
import { FLAC_FIXTURES, FLAC_FRAMES } from "../fixtures/flac/make.ts";
import { fixtureHistory, flacSignal } from "./fixtures.ts";

describe("decodeFlac", () => {
	for (const f of FLAC_FIXTURES) {
		it(`decodes ${f.file} bit for bit`, () => {
			const { sampleRate, data } = decodeFlac(readFileSync(new URL(`../fixtures/flac/${f.file}`, import.meta.url)));
			const expected = flacSignal(f.bits, f.channels, FLAC_FRAMES);
			const scale = 2 ** (f.bits - 1);
			let mismatches = 0;

			expect(sampleRate).toBe(44100);
			expect(data[0]).toHaveLength(FLAC_FRAMES);

			for (let i = 0; i < FLAC_FRAMES; i++) {
				for (let c = 0; c < f.channels; c++) {
					const channel = c === 0 ? data[0] : data[1];

					if (channel[i] !== expected[i * f.channels + c] / scale) {
						mismatches++;
					}
				}
			}

			expect(mismatches).toBe(0);
			// mono is duplicated into both channels, like readWav
			expect(f.channels === 2 || data[1] === data[0]).toBe(true);
		});
	}

	it("rejects other formats", () => {
		expect(() => decodeFlac(new TextEncoder().encode("RIFF....WAVE"))).toThrow(/not a FLAC/u);
	});
});

describe("instrument pack", () => {
	it("holds every recording of the manifest, per instrument", () => {
		for (const [name, { dir, pattern }] of Object.entries(SAMPLED)) {
			const sources = manifest.files.filter(function inDir(f) {
				return f.path.startsWith(`${dir}/`) && pattern.test(f.path.slice(dir.length + 1));
			});

			const packed = readdirSync(join(assetsDir(), name)).filter(function matches(file) {
				return file.endsWith(".flac") && pattern.test(file);
			});

			expect(sources.length, name).toBeGreaterThan(0);
			expect(packed, name).toHaveLength(sources.length);
		}
	});

	it("keeps enough of each piano sustain for the longest note the composer writes", () => {
		const hold = 0.15; // render/lofi.ts holds lead notes this much past their end
		const damper = 0.1 * Math.log(1e4); // the sampler stops when the damper envelope falls below -80 dB
		const fastest = 2 ** (3 / 12) * (44100 / 48000); // nearest-root zones pitch up by at most three semitones
		let longest = 0;

		for (let s = 0; s < 24; s++) {
			const song = composeLofi({ ...fixtureHistory(), root: `seed-${s}` }, s % 2 ? 30 : 300);

			for (const n of song.parts.lead) {
				longest = Math.max(longest, (n.end + hold - n.start + damper) * fastest);
			}
		}

		expect(longest).toBeGreaterThan(5);
		expect(longest).toBeLessThan(PACK_SUSTAIN_SECONDS);
	});
});
