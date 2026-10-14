// Instrument recordings live outside the npm package: downloaded once from the pinned VCSL commit into a per-user cache.

import { existsSync, mkdirSync, renameSync, statSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";

import manifest from "./assets-manifest.json" with { type: "json" };
import { RepoSongError } from "./errors.ts";
import { VCSL } from "./instruments/catalog.ts";

export interface AssetFile {
	path: string;
	size: number;
}

export const ASSET_FILES: readonly AssetFile[] = manifest.files;

/**
 * Directory holding the recordings: `REPO_SONG_ASSETS`, else the platform cache directory.
 *
 * @returns Absolute path.
 */
export function assetsDir(): string {
	if (process.env["REPO_SONG_ASSETS"]) {
		return process.env["REPO_SONG_ASSETS"];
	}

	const base =
		process.platform === "darwin"
			? join(homedir(), "Library", "Caches")
			: process.platform === "win32"
				? (process.env["LOCALAPPDATA"] ?? join(homedir(), "AppData", "Local"))
				: (process.env["XDG_CACHE_HOME"] ?? join(homedir(), ".cache"));

	return join(base, "repo-song", `vcsl-${VCSL.commit.slice(0, 7)}`);
}

/**
 * Files not yet present (or truncated) in the cache.
 *
 * @param dir - Assets directory.
 * @returns Missing files.
 */
export function missingAssets(dir: string = assetsDir()): AssetFile[] {
	return ASSET_FILES.filter(function missing(f) {
		const p = join(dir, f.path);

		return !existsSync(p) || statSync(p).size !== f.size;
	});
}

/**
 * Downloads one file, retrying transient failures, and moves it into place only when complete.
 *
 * @param file - Manifest entry.
 * @param dir - Assets directory.
 */
async function download(file: AssetFile, dir: string): Promise<void> {
	const url = `https://raw.githubusercontent.com/${VCSL.repo}/${VCSL.commit}/${file.path.split("/").map(encodeURIComponent).join("/")}`;
	const target = join(dir, file.path);
	let status: number | string = 0;

	for (let attempt = 0; attempt < 3; attempt++) {
		try {
			const res = await fetch(url);

			status = res.status;

			if (res.ok) {
				const bytes = new Uint8Array(await res.arrayBuffer());

				if (bytes.length === file.size) {
					mkdirSync(dirname(target), { recursive: true });
					writeFileSync(`${target}.part`, bytes);
					renameSync(`${target}.part`, target);

					return;
				}

				status = `size ${bytes.length}`;
			}
		} catch (error) {
			status = error instanceof Error ? error.message : String(error);
		}
	}

	throw new RepoSongError("assets_download_failed", { path: file.path, status });
}

/**
 * Ensures every recording is cached, downloading what is missing with bounded concurrency.
 *
 * @param onProgress - Called after each file with bytes done and total bytes to fetch.
 * @returns The assets directory.
 */
export async function ensureAssets(onProgress?: (done: number, total: number) => void): Promise<string> {
	const dir = assetsDir();
	const queue = missingAssets(dir);

	const total = assetsBytes(queue);

	let done = 0;

	/**
	 * Pulls files off the shared queue until it is empty.
	 */
	async function worker(): Promise<void> {
		for (let file = queue.shift(); file; file = queue.shift()) {
			await download(file, dir);
			done += file.size;
			onProgress?.(done, total);
		}
	}

	await Promise.all(Array.from({ length: 8 }, worker));

	return dir;
}

/**
 * Total size of a set of recordings.
 *
 * @param files - Manifest entries (all of them by default).
 * @returns Bytes.
 */
export function assetsBytes(files: readonly AssetFile[] = ASSET_FILES): number {
	return files.reduce(function sum(s, f) {
		return s + f.size;
	}, 0);
}
