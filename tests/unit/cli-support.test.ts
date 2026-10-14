import { execFileSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { ASSET_FILES } from "../../src/assets.ts";
import { encodeWav24, readWav } from "../../src/audio/wav.ts";
import { stereo } from "../../src/dsp/buffers.ts";
import { ERROR_CODES, RepoSongError } from "../../src/errors.ts";
import { readHistory } from "../../src/history.ts";
import { CATALOGS, detectLocale, format, plural } from "../../src/i18n/index.ts";
import { SAMPLED } from "../../src/instruments/catalog.ts";

describe("wav", () => {
	it("round-trips 24-bit audio within dither noise", () => {
		const pcm = stereo(1000);

		for (let i = 0; i < 1000; i++) {
			pcm[0][i] = Math.sin(i / 10) * 0.8;
			pcm[1][i] = -pcm[0][i];
		}

		const dir = mkdtempSync(join(tmpdir(), "repo-song-"));
		const file = join(dir, "t.wav");

		writeFileSync(file, encodeWav24(pcm, 48_000));

		const { sampleRate, data } = readWav(file);

		expect(sampleRate).toBe(48_000);

		for (let i = 0; i < 1000; i++) {
			expect(Math.abs(data[0][i] - pcm[0][i])).toBeLessThan(3 / 8388608);
		}
	});
});

describe("i18n", () => {
	it("translates every error code in every locale", () => {
		for (const [locale, msg] of Object.entries(CATALOGS)) {
			for (const code of ERROR_CODES) {
				expect(msg.errors[code], `${locale}.${code}`).toBeTruthy();
			}
		}
	});

	it("keeps placeholders identical across locales", () => {
		/**
		 * Placeholder names in a template.
		 *
		 * @param s - Template.
		 * @returns Sorted names.
		 */
		function holes(s: string): string[] {
			return [...s.matchAll(/\{(\w+)\}/gu)].map((m) => m[1] ?? "").sort();
		}

		for (const key of ["help", "reading", "repo", "downloading", "progress", "composing", "rendering", "wrote"] as const) {
			expect(holes(CATALOGS.es[key]), key).toEqual(holes(CATALOGS.en[key]));
		}

		for (const code of [...ERROR_CODES, "unexpected"] as const) {
			expect(holes(CATALOGS.es.errors[code]), code).toEqual(holes(CATALOGS.en.errors[code]));
		}
	});

	it("detects Spanish from LANG and defaults to English", () => {
		expect(detectLocale({ LANG: "es_AR.UTF-8" })).toBe("es");
		expect(detectLocale({ LANG: "de_DE.UTF-8" })).toBe("en");
		expect(detectLocale({})).toBe("en");
		expect(format("{a} and {b}", { a: 1 })).toBe("1 and {b}");
		expect(plural("en", CATALOGS.en.commits, 1)).toBe("1 commit");
		expect(plural("es", CATALOGS.es.commits, 322)).toBe("322 commits");
	});
});

describe("history", () => {
	it("seeds from the root commit and rejects non-repos", () => {
		const dir = mkdtempSync(join(tmpdir(), "repo-song-git-"));

		/**
		 * Runs git in the temp repo with a throwaway identity and no hook templates.
		 *
		 * @param args - Git arguments.
		 * @returns Trimmed stdout.
		 */
		function git(...args: string[]): string {
			return execFileSync("git", ["-C", dir, "-c", "user.name=t", "-c", "user.email=t@t", ...args], { encoding: "utf8" }).trim();
		}

		git("init", "--template=", "-q");
		git("commit", "--allow-empty", "-q", "-m", "first");

		const root = git("rev-parse", "HEAD");

		git("commit", "--allow-empty", "-q", "-m", "second");
		expect(readHistory(dir)).toMatchObject({ root, commits: 2 });

		const empty = mkdtempSync(join(tmpdir(), "repo-song-none-"));

		expect(() => readHistory(empty)).toThrow(RepoSongError);
	});
});

describe("assets manifest", () => {
	it("covers every sampled instrument", () => {
		for (const [name, { dir, pattern }] of Object.entries(SAMPLED)) {
			const hits = ASSET_FILES.filter(function inDir(f) {
				return f.path.startsWith(`${dir}/`) && pattern.test(f.path.slice(dir.length + 1));
			});

			expect(hits.length, name).toBeGreaterThan(0);
		}
	});
});
