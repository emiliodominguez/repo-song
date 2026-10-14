#!/usr/bin/env node
// repo-song CLI: read the repo, compose from its root commit, render with real instruments, write a WAV.

import { readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";
import { parseArgs } from "node:util";

import { assetsBytes, ensureAssets, missingAssets } from "./assets.ts";
import { encodeWav24 } from "./audio/wav.ts";
import { composeLofi } from "./compose/lofi.ts";
import { RepoSongError } from "./errors.ts";
import { readHistory } from "./history.ts";
import { CATALOGS, detectLocale, format, plural } from "./i18n/index.ts";
import { loadKit } from "./instruments/vcsl.ts";
import { renderLofi, SAMPLE_RATE } from "./render/lofi.ts";
import type { Song } from "./types.ts";

const locale = detectLocale();
const msg = CATALOGS[locale];

/**
 * Writes a status line to stderr, keeping stdout clean.
 *
 * @param text - Line.
 */
function status(text: string): void {
	process.stderr.write(`${text}\n`);
}

/**
 * Formats seconds as m:ss.
 *
 * @param sec - Seconds.
 * @returns Clock text.
 */
function clock(sec: number): string {
	const s = Math.floor(sec);

	return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
}

/**
 * The song's liner notes: each section, when it starts, and the stretch of history it plays.
 *
 * @param song - Composition.
 * @returns Lines of text.
 */
function linerNotes(song: Song): string {
	const span = (song.sections.at(-2)?.period?.to ?? 0) - (song.sections[1]?.period?.from ?? 0);

	// date precision follows the history: days for a weekend project, months for a year, years for a decade
	const dates = new Intl.DateTimeFormat(
		locale,
		span < 90 * 86400 ? { month: "short", day: "numeric" } : span < 4 * 365 * 86400 ? { month: "short", year: "numeric" } : { year: "numeric" },
	);

	const lines = [msg.notesTitle];

	for (const s of song.sections) {
		const facts: string[] = [];

		if (s.period) {
			const from = dates.format(s.period.from * 1000);
			const to = dates.format(s.period.to * 1000);

			facts.push(from === to ? from : format(msg.period, { from, to }));
			facts.push(plural(locale, msg.commits, s.commits));
		}

		if (s.peak) {
			facts.push(msg.peak);
		}

		if (s.kind === "breakdown") {
			facts.push(msg.quiet);
		}

		if (s.newAuthors) {
			facts.push(plural(locale, msg.newAuthors, s.newAuthors));
		}

		if (s.releases.length) {
			const shown = s.releases.slice(0, 3);
			const names = new Intl.ListFormat(locale, { type: "unit" }).format(s.releases.length > 3 ? [...shown, "…"] : shown);

			facts.push(plural(locale, msg.releases, s.releases.length, { names }));
		}

		lines.push(`  ${clock(s.startSec).padStart(5)}  ${msg.section[s.kind].padEnd(10)} ${facts.join(" · ")}`.trimEnd());
	}

	return lines.join("\n");
}

/**
 * Runs the CLI.
 *
 * @param argv - Arguments after the executable and script.
 */
async function main(argv: string[]): Promise<void> {
	const { values, positionals } = parseArgs({
		args: argv,
		allowPositionals: true,
		options: {
			out: { type: "string", short: "o" },
			seconds: { type: "string", short: "s", default: "90" },
			seed: { type: "string" },
			help: { type: "boolean", short: "h" },
			version: { type: "boolean", short: "v" },
		},
	});

	if (values.help) {
		process.stdout.write(`${msg.help}\n`);

		return;
	}

	if (values.version) {
		const pkg: unknown = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
		const version = typeof pkg === "object" && pkg && "version" in pkg ? String(pkg.version) : "unknown";

		process.stdout.write(`${version}\n`);

		return;
	}

	const seconds = Number(values.seconds);

	if (!Number.isFinite(seconds) || seconds < 30 || seconds > 300) {
		throw new RepoSongError("invalid_seconds", { value: values.seconds });
	}

	const dir = resolve(positionals[0] ?? ".");

	status(format(msg.reading, { path: dir }));

	const history = readHistory(dir);
	const seed = values.seed ?? history.root;

	status(format(msg.repo, { name: history.name, commits: plural(locale, msg.commits, history.commits.length), seed: seed.slice(0, 12) }));

	const missing = missingAssets();

	if (missing.length) {
		status(format(msg.downloading, { size: Math.max(1, Math.round(assetsBytes(missing) / 1e6)) }));
	}

	let lastPercent = -1;

	const assets = await ensureAssets(function progress(done, total) {
		const percent = Math.floor((done / total) * 10) * 10;

		if (percent !== lastPercent) {
			lastPercent = percent;
			status(format(msg.progress, { percent }));
		}
	});

	const started = performance.now();
	const song = composeLofi({ ...history, root: seed }, seconds);

	status(format(msg.composing, { key: song.key, mode: msg.mode[song.mode], bpm: song.bpm, duration: clock(song.seconds) }));
	process.stdout.write(`\n${linerNotes(song)}\n\n`);
	status(msg.rendering);

	const pcm = renderLofi(song, loadKit(assets));
	const file = resolve(values.out ?? `${history.name}.wav`);

	try {
		writeFileSync(file, encodeWav24(pcm, SAMPLE_RATE));
	} catch (error) {
		throw new RepoSongError("write_failed", { file, reason: error instanceof Error ? error.message : String(error) });
	}

	status(format(msg.wrote, { file, ms: Math.round(performance.now() - started) }));
}

try {
	await main(process.argv.slice(2));
} catch (error) {
	status(
		error instanceof RepoSongError
			? format(msg.errors[error.code], error.params)
			: format(msg.errors.unexpected, { reason: error instanceof Error ? error.message : String(error) }),
	);

	process.exitCode = 1;
}
