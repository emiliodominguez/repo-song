// Renders a repo's song and prints the numbers the mix was tuned against: tonal balance vs the reference curve,
// loudness, peak and per-part levels. Use it before and after any sound change, then listen.
//   pnpm analyze [repo path] [seconds]

import { assetsDir } from "../src/assets.ts";
import { composeLofi } from "../src/compose/lofi.ts";
import { gatedRmsDb } from "../src/dsp/dynamics.ts";
import { LOFI_TONE, spectrumBands } from "../src/dsp/tone.ts";
import { readHistory } from "../src/history.ts";
import { loadKit } from "../src/instruments/vcsl.ts";
import { renderLofi, SAMPLE_RATE } from "../src/render/lofi.ts";

const BANDS = ["31", "63", "125", "250", "500", "1k", "2k", "4k", "8k", "16k"];
const history = readHistory(process.argv[2] ?? ".");
const song = composeLofi(history.root, Number(process.argv[3] ?? 45));
const started = performance.now();
const stems: string[] = [];

const pcm = renderLofi(song, loadKit(assetsDir()), {
	onStem(role, stem, gain) {
		stems.push(`${role} ${(gatedRmsDb(stem, SAMPLE_RATE) + 20 * Math.log10(gain)).toFixed(1)} dB`);
	},
});

const ms = Math.round(performance.now() - started);
let peak = 0;

for (const ch of pcm) {
	for (const x of ch) {
		peak = Math.max(peak, Math.abs(x));
	}
}

const bands = spectrumBands(pcm, SAMPLE_RATE);

console.info(`${history.name}: ${song.key} ${song.scale} ${song.bpm} BPM, rendered in ${ms} ms`);
console.info(`gated RMS ${gatedRmsDb(pcm, SAMPLE_RATE).toFixed(1)} dBFS, peak ${(20 * Math.log10(peak)).toFixed(2)} dBFS`);
console.info(`parts: ${stems.join(", ")}`);
console.info(`band   ${BANDS.map((b) => b.padStart(6)).join("")}`);
console.info(
	`delta  ${bands.map((v, i) => `${v - LOFI_TONE[i] >= 0 ? "+" : ""}${(v - LOFI_TONE[i]).toFixed(1)}`.padStart(6)).join("")}  (dB vs reference; within ±4 is in range)`,
);
