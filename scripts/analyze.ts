// Renders repos' songs and prints the numbers the mix is held to: tonal balance against the range of real lofi records,
// loudness, peak, per-part levels and how much the arrangement moves (spread of 3 s loudness). Use it before and after
// any sound change, then listen.
//   pnpm analyze <repo> [more repos…] [--seconds n]

import { parseArgs } from "node:util";

import { assetsDir } from "../src/assets.ts";
import { composeLofi } from "../src/compose/lofi.ts";
import { gatedRmsDb } from "../src/dsp/dynamics.ts";
import { bandTarget, TONE_BANDS, toneBands } from "../src/dsp/tone.ts";
import { readHistory } from "../src/history.ts";
import { loadKit } from "../src/instruments/vcsl.ts";
import { renderLofi, SAMPLE_RATE } from "../src/render/lofi.ts";
import type { Stereo } from "../src/types.ts";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { seconds: { type: "string", default: "90" } } });
const kit = loadKit(assetsDir());

/**
 * Loudness spread: 90th minus 10th percentile of 3-second RMS windows, a rough stand-in for EBU loudness range.
 *
 * @param pcm - Audio.
 * @returns dB.
 */
function spread(pcm: Stereo): number {
	const win = 3 * SAMPLE_RATE;
	const levels: number[] = [];

	for (let s = 0; s + win <= pcm[0].length; s += SAMPLE_RATE) {
		let e = 0;

		for (let i = s; i < s + win; i++) {
			e += (pcm[0][i] ** 2 + pcm[1][i] ** 2) / 2;
		}

		if (e > 0) {
			levels.push(10 * Math.log10(e / win));
		}
	}

	levels.sort((x, y) => x - y);

	return (levels[Math.floor(levels.length * 0.9)] ?? 0) - (levels[Math.floor(levels.length * 0.1)] ?? 0);
}

for (const repo of positionals.length ? positionals : ["."]) {
	const history = readHistory(repo);
	const song = composeLofi(history, Number(values.seconds));
	const started = performance.now();
	const stems: string[] = [];

	const pcm = renderLofi(song, kit, {
		onStem(role, stem, gain) {
			stems.push(`${role} ${(gatedRmsDb(stem, SAMPLE_RATE) + 20 * Math.log10(gain)).toFixed(1)}`);
		},
	});

	const ms = Math.round(performance.now() - started);
	let peak = 0;

	for (const ch of pcm) {
		for (const x of ch) {
			peak = Math.max(peak, Math.abs(x));
		}
	}

	const bands = toneBands(pcm, SAMPLE_RATE);
	const outside = bands.map((v, i) => v - bandTarget(v, i, 0));
	const worst = Math.max(...outside.map(Math.abs));

	console.info(`\n${history.name}: ${song.key} ${song.mode} ${song.bpm} BPM, ${song.seconds.toFixed(0)} s, rendered in ${ms} ms`);
	console.info(
		`  gated RMS ${gatedRmsDb(pcm, SAMPLE_RATE).toFixed(1)} dBFS, peak ${(20 * Math.log10(peak)).toFixed(2)} dBFS, loudness spread ${spread(pcm).toFixed(1)} dB`,
	);

	console.info(`  parts (dB): ${stems.join(", ")}`);
	console.info(`  band     ${TONE_BANDS.map((b) => String(b).padStart(6)).join("")}`);
	console.info(
		`  outside  ${outside.map((v) => (Math.abs(v) < 0.05 ? "·" : `${v > 0 ? "+" : ""}${v.toFixed(1)}`).padStart(6)).join("")}  (dB beyond the reference range; · = inside)`,
	);

	console.info(`  verdict  ${worst <= 1.5 ? "tonal balance inside the reference range" : `${worst.toFixed(1)} dB outside the reference range`}`);
}
