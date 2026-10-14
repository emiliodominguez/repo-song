// Reads what the song is built from: the repository's git history.

import { execFileSync } from "node:child_process";
import { basename } from "node:path";

import { RepoSongError } from "./errors.ts";

export interface History {
	/**
	 * Repository directory name, used for the default output file.
	 */
	name: string;
	/**
	 * The root commit: the song's seed, so a repo keeps its song as it grows.
	 */
	root: string;
	commits: number;
}

/**
 * Runs git in a directory.
 *
 * @param dir - Working directory.
 * @param args - Git arguments.
 * @returns Trimmed stdout.
 */
function git(dir: string, args: string[]): string {
	return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).trim();
}

/**
 * Reads the history summary of the repository containing `dir`.
 *
 * @param dir - Any path inside the repository.
 * @returns Summary.
 */
export function readHistory(dir: string): History {
	let top: string;

	try {
		top = git(dir, ["rev-parse", "--show-toplevel"]);
	} catch {
		throw new RepoSongError("not_a_repo", { path: dir });
	}

	let roots: string;

	try {
		roots = git(top, ["rev-list", "--max-parents=0", "HEAD"]);
	} catch {
		throw new RepoSongError("no_commits", { path: top });
	}

	const root = roots.split("\n")[0] ?? "";

	if (!root) {
		throw new RepoSongError("no_commits", { path: top });
	}

	return { name: basename(top), root, commits: Number(git(top, ["rev-list", "--count", "HEAD"])) };
}
