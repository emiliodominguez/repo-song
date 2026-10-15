// Builds sampler instruments from the instrument pack (VCSL recordings as FLAC, see scripts/assets-pack.ts).

import { readdirSync } from "node:fs";
import { join } from "node:path";

import { readFlac } from "../audio/flac.ts";
import { readWav } from "../audio/wav.ts";
import { RepoSongError } from "../errors.ts";
import type { Stereo } from "../types.ts";
import { SAMPLED, type SampledName } from "./catalog.ts";
import type { Instrument, Zone } from "./sampler.ts";

const PC: Record<string, number> = { C: 0, D: 2, E: 4, F: 5, G: 7, A: 9, B: 11 };

/**
 * VCSL note names put C0 at MIDI 24 (verified by pitch detection: "C4" sounds at 523 Hz).
 *
 * @param name - e.g. "G3", "C#4".
 * @returns MIDI note.
 */
export function vcslNote(name: string): number {
	const m = /^([A-G])(#?)(-?\d)$/u.exec(name);

	if (!m) {
		throw new Error(`bad VCSL note name ${name}`);
	}

	return 24 + 12 * Number(m[3]) + PC[m[1]] + (m[2] ? 1 : 0);
}

/**
 * Reads a recording, FLAC or WAV by extension.
 *
 * @param path - File path.
 * @returns Sample rate and stereo data.
 */
function readAudio(path: string): { sampleRate: number; data: Stereo } {
	return path.endsWith(".flac") ? readFlac(path) : readWav(path);
}

/**
 * Loads every zone of one catalog entry. Drum hits without a note name sit at MIDI 60.
 *
 * @param assets - Pack directory.
 * @param name - Catalog entry.
 * @param fixedLayer - Force every zone into this layer (single-layer instruments).
 * @returns Zones in file-name order.
 */
function loadZones(assets: string, name: SampledName, fixedLayer?: number): Zone[] {
	const { pattern } = SAMPLED[name];
	const full = join(assets, name);
	let files: string[];

	try {
		files = readdirSync(full).sort();
	} catch {
		throw new RepoSongError("assets_missing", { path: full });
	}

	const zones: Zone[] = [];

	for (const file of files) {
		const g = pattern.exec(file)?.groups;

		if (!g) {
			continue;
		}

		const path = join(full, file);
		let audio: ReturnType<typeof readAudio> | undefined;

		/**
		 * Decodes the recording the first time the sampler plays it; most songs touch only part of the keyboard.
		 *
		 * @returns Sample rate and data.
		 */
		function load(): ReturnType<typeof readAudio> {
			audio ??= readAudio(path);

			return audio;
		}

		zones.push({
			root: g["note"] ? vcslNote(g["note"]) : 60,
			layer: fixedLayer ?? Number(g["layer"]),
			rr: Number(g["rr"] ?? 1),
			get sampleRate() {
				return load().sampleRate;
			},
			get data() {
				return load().data;
			},
		});
	}

	if (!zones.length) {
		throw new RepoSongError("assets_missing", { path: full });
	}

	return zones;
}

/**
 * Re-numbers the distinct velocity labels found in zones (e.g. v3, v5, v9) as consecutive layers 1..n.
 *
 * @param zones - Zones whose `layer` holds the raw label number; modified in place.
 * @returns Number of layers.
 */
function rankLayers(zones: Zone[]): number {
	const labels = [...new Set(zones.map((z) => z.layer))].sort(function asc(a, b) {
		return a - b;
	});

	for (const z of zones) {
		z.layer = labels.indexOf(z.layer) + 1;
	}

	return labels.length;
}

/**
 * The sampled instruments the lofi renderer plays.
 */
export interface Kit {
	piano: Instrument;
	snare: Instrument;
	stick: Instrument;
	hat: Instrument;
	openHat: Instrument;
	shaker: Instrument;
}

/**
 * Loads the full kit from the pack.
 *
 * @param assets - Pack directory.
 * @returns Instruments.
 */
export function loadKit(assets: string): Kit {
	const snare = loadZones(assets, "snare");
	const hat = loadZones(assets, "closedHat");

	return {
		piano: { zones: loadZones(assets, "piano"), releases: loadZones(assets, "pianoRelease"), layers: 3, damperSec: 0.1, releaseGain: 0.6 },
		snare: { zones: snare, layers: rankLayers(snare) },
		stick: { zones: loadZones(assets, "sideStick"), layers: 1 },
		hat: { zones: hat, layers: rankLayers(hat) },
		openHat: { zones: loadZones(assets, "openHat", 1), layers: 1 },
		shaker: { zones: loadZones(assets, "shaker", 1), layers: 1 },
	};
}
