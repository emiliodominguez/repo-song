// Builds assets/, the instrument pack shipped in the npm package: every VCSL recording the catalog uses, from the pinned
// commit, as lossless FLAC, piano sustains cut to what the sampler can ever read. Each file is decoded back and compared
// with its source sample for sample, so the pack sounds exactly like the original recordings.
//   pnpm assets:pack [--source <dir>]     (needs ffmpeg; downloads the 255 MB of sources into .cache/ unless --source)

import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, renameSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { parseArgs } from "node:util";

import { readFlac } from "../src/audio/flac.ts";
import { readWav } from "../src/audio/wav.ts";
import { PACK_SUSTAIN_SECONDS, SAMPLED, type SampledName, VCSL } from "../src/instruments/catalog.ts";
import manifest from "./vcsl-manifest.json" with { type: "json" };

interface SourceFile {
	path: string;
	size: number;
}

const root = fileURLToPath(new URL("..", import.meta.url));

const { values } = parseArgs({ options: { source: { type: "string", default: join(root, ".cache", `vcsl-${VCSL.commit.slice(0, 7)}`) } } });

const source = values.source;
const out = join(root, "assets");

/**
 * Downloads one source file from the pinned commit, retrying transient failures.
 *
 * @param file - Manifest entry.
 */
async function download(file: SourceFile): Promise<void> {
	const url = `https://raw.githubusercontent.com/${VCSL.repo}/${VCSL.commit}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
	const target = join(source, file.path);

	for (let attempt = 0; attempt < 3; attempt++) {
		const res = await fetch(url).catch(function failed() {
			return undefined;
		});

		if (res?.ok) {
			const bytes = new Uint8Array(await res.arrayBuffer());

			if (bytes.length === file.size) {
				mkdirSync(dirname(target), { recursive: true });
				writeFileSync(`${target}.part`, bytes);
				renameSync(`${target}.part`, target);

				return;
			}
		}
	}

	throw new Error(`could not download ${file.path}`);
}

/**
 * Narrows a catalog key.
 *
 * @param key - Object key of SAMPLED.
 * @returns Whether it names an instrument.
 */
function isSampledName(key: string): key is SampledName {
	return key in SAMPLED;
}

/**
 * The catalog entry a source file belongs to.
 *
 * @param path - Path inside VCSL.
 * @returns Instrument name.
 */
function instrumentOf(path: string): SampledName {
	const dir = dirname(path);
	const name = basename(path);

	for (const key of Object.keys(SAMPLED)) {
		if (isSampledName(key) && SAMPLED[key].dir === dir && SAMPLED[key].pattern.test(name)) {
			return key;
		}
	}

	throw new Error(`${path} matches no catalog entry; run pnpm assets:manifest`);
}

const missing = manifest.files.filter(function absent(f) {
	const p = join(source, f.path);

	return !existsSync(p) || statSync(p).size !== f.size;
});

if (missing.length) {
	process.stderr.write(`downloading ${missing.length} source files into ${source}\n`);

	const queue = [...missing];

	/**
	 * Pulls files off the shared queue until it is empty.
	 */
	async function worker(): Promise<void> {
		for (let file = queue.shift(); file; file = queue.shift()) {
			await download(file);
		}
	}

	await Promise.all(Array.from({ length: 8 }, worker));
}

rmSync(out, { recursive: true, force: true });

let bytes = 0;

for (const file of manifest.files) {
	const name = instrumentOf(file.path);
	const input = join(source, file.path);
	const target = join(out, name, basename(file.path).replace(/\.wav$/u, ".flac"));
	const trim = name === "piano" ? ["-t", String(PACK_SUSTAIN_SECONDS)] : [];

	mkdirSync(dirname(target), { recursive: true });
	execFileSync("ffmpeg", ["-v", "error", "-y", "-i", input, ...trim, "-map_metadata", "-1", "-c:a", "flac", "-compression_level", "8", target]);

	const original = readWav(input);
	const packed = readFlac(target);
	const frames = trim.length ? Math.min(original.data[0].length, Math.round(PACK_SUSTAIN_SECONDS * original.sampleRate)) : original.data[0].length;

	if (packed.sampleRate !== original.sampleRate || packed.data[0].length !== frames) {
		throw new Error(`${target}: ${packed.data[0].length} frames at ${packed.sampleRate} Hz, expected ${frames} at ${original.sampleRate}`);
	}

	for (let c = 0; c < 2; c++) {
		for (let i = 0; i < frames; i++) {
			if (packed.data[c][i] !== original.data[c][i]) {
				throw new Error(`${target}: channel ${c} differs from the source at frame ${i}`);
			}
		}
	}

	bytes += statSync(target).size;
}

const count = readdirSync(out, { recursive: true }).filter(function flac(f) {
	return String(f).endsWith(".flac");
}).length;

process.stderr.write(`${count} files, ${(bytes / 1e6).toFixed(1)} MB, every one identical to its source\n`);
