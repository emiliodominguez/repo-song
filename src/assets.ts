// The instrument pack ships inside the npm package (assets/, about 25 MB of lossless FLAC), so a song needs no network.

import { fileURLToPath } from "node:url";

/**
 * Directory holding the pack: `REPO_SONG_ASSETS`, else `assets/` next to `src/` or `dist/`.
 *
 * @returns Absolute path.
 */
export function assetsDir(): string {
	return process.env["REPO_SONG_ASSETS"] || fileURLToPath(new URL("../assets/", import.meta.url));
}
