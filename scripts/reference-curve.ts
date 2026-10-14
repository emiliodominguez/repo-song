// Measures the reference lofi masters and prints LOFI_REFERENCE (min/mean/max per octave band) for src/dsp/tone.ts,
// plus each track's loudness range. Downloads the CC-BY/CC0 references into .cache/refs; needs ffmpeg to decode MP3.
//   pnpm reference-curve

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";

import { readWav } from "../src/audio/wav.ts";
import { toneBands } from "../src/dsp/tone.ts";

const REFERENCES = [
	{ name: "lazy-daze", url: "https://www.silvermansound.com/wp-content/uploads/lazy-daze.mp3", credit: "Lazy Daze, Shane Ivers, CC BY 4.0" },
	{ name: "trade-controls", url: "https://opengameart.org/sites/default/files/tradecontrols.mp3", credit: "Trade Controls, tcarisland, CC BY 4.0" },
	{
		name: "diminishing-returns",
		url: "https://opengameart.org/sites/default/files/diminishingreturnsinstr_0.mp3",
		credit: "Diminishing Returns, tcarisland, CC BY 4.0",
	},
	{ name: "chill-lofi", url: "https://opengameart.org/sites/default/files/ChillLofiR_0.mp3", credit: "Chill lofi inspired, omfgdude, CC0" },
];

const dir = new URL("../.cache/refs/", import.meta.url).pathname;

mkdirSync(dir, { recursive: true });

const rows: number[][] = [];

for (const ref of REFERENCES) {
	const mp3 = join(dir, `${ref.name}.mp3`);
	const wav = join(dir, `${ref.name}.wav`);

	if (!existsSync(mp3)) {
		const res = await fetch(ref.url);

		if (!res.ok) {
			throw new Error(`${ref.url}: ${res.status}`);
		}

		writeFileSync(mp3, new Uint8Array(await res.arrayBuffer()));
	}

	if (!existsSync(wav)) {
		execFileSync("ffmpeg", ["-y", "-loglevel", "error", "-i", mp3, "-ar", "48000", "-ac", "2", "-c:a", "pcm_s24le", wav]);
	}

	const { data, sampleRate } = readWav(wav);
	const bands = toneBands(data, sampleRate);

	rows.push(bands);
	console.info(`${ref.credit.padEnd(44)} ${bands.map((v) => v.toFixed(1).padStart(6)).join("")}`);
}

/**
 * Applies a reducer per band across all references.
 *
 * @param pick - Reducer over one band's values.
 * @returns One value per band, rounded to 0.1 dB.
 */
function perBand(pick: (values: number[]) => number): number[] {
	return rows[0].map(function band(_, i) {
		return Math.round(pick(rows.map((r) => r[i])) * 10) / 10;
	});
}

console.info(`\nmin:  [${perBand((v) => Math.min(...v)).join(", ")}]`);
console.info(`mean: [${perBand((v) => v.reduce((s, x) => s + x, 0) / v.length).join(", ")}]`);
console.info(`max:  [${perBand((v) => Math.max(...v)).join(", ")}]`);
