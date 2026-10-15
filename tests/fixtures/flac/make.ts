// Regenerates the FLAC decoder fixtures from flacSignal with ffmpeg: node tests/fixtures/flac/make.ts

import { execFileSync } from "node:child_process";
import { writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { flacSignal } from "../../unit/fixtures.ts";

export const FLAC_FIXTURES = [
	{ file: "s24-stereo-lpc.flac", bits: 24, channels: 2, args: ["-compression_level", "8"] },
	{ file: "s24-stereo-fixed.flac", bits: 24, channels: 2, args: ["-compression_level", "0"] },
	{ file: "s16-mono-lpc32.flac", bits: 16, channels: 1, args: ["-compression_level", "12"] },
	{ file: "s16-stereo-odd-blocks.flac", bits: 16, channels: 2, args: ["-compression_level", "5", "-frame_size", "1000"] },
] as const;

export const FLAC_FRAMES = 11025;

if (import.meta.main) {
	for (const f of FLAC_FIXTURES) {
		const pcm = flacSignal(f.bits, f.channels, FLAC_FRAMES);
		const raw = join(tmpdir(), "repo-song-flac.raw");
		const bytes = Buffer.alloc(pcm.length * (f.bits / 8));

		pcm.forEach(function put(v, i) {
			bytes.writeIntLE(v, i * (f.bits / 8), f.bits / 8);
		});

		writeFileSync(raw, bytes);

		const format = f.bits === 24 ? "s24le" : "s16le";

		execFileSync("ffmpeg", [
			"-v",
			"error",
			"-y",
			"-f",
			format,
			"-ar",
			"44100",
			"-ac",
			String(f.channels),
			"-i",
			raw,
			"-map_metadata",
			"-1",
			"-c:a",
			"flac",
			...f.args,
			new URL(f.file, import.meta.url).pathname,
		]);
	}
}
