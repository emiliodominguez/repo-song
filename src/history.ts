// Reads what the song is built from: the repository's git history.

import { execFileSync } from "node:child_process";
import { basename } from "node:path";

import { RepoSongError } from "./errors.ts";

export interface Commit {
	/**
	 * Commit time, unix seconds.
	 */
	time: number;
	/**
	 * Author email, lowercased.
	 */
	author: string;
}

export interface Tag {
	name: string;
	/**
	 * Tag (or tagged commit) time, unix seconds.
	 */
	time: number;
}

export interface History {
	/**
	 * Repository directory name, used for the default output file.
	 */
	name: string;
	/**
	 * The root commit: the song's seed, so a repo keeps its key, tempo and themes as it grows.
	 */
	root: string;
	/**
	 * Commits on HEAD, oldest first.
	 */
	commits: Commit[];
	tags: Tag[];
}

/**
 * Runs git in a directory.
 *
 * @param dir - Working directory.
 * @param args - Git arguments.
 * @returns Trimmed stdout.
 */
function git(dir: string, args: string[]): string {
	return execFileSync("git", ["-C", dir, ...args], { encoding: "utf8", stdio: ["ignore", "pipe", "ignore"], maxBuffer: 1 << 30 }).trim();
}

/**
 * Parses `git log --format=%at%x09%aE` output.
 *
 * @param out - Raw output, one commit per line.
 * @returns Commits in the order given.
 */
export function parseLog(out: string): Commit[] {
	const commits: Commit[] = [];

	for (const line of out.split("\n")) {
		const tab = line.indexOf("\t");
		const time = Number(line.slice(0, tab));

		if (tab > 0 && Number.isFinite(time)) {
			commits.push({ time, author: line.slice(tab + 1).toLowerCase() });
		}
	}

	return commits;
}

/**
 * Reads the history of the repository containing `dir`.
 *
 * @param dir - Any path inside the repository.
 * @returns History.
 */
export function readHistory(dir: string): History {
	let top: string;
	let name: string;

	try {
		if (git(dir, ["rev-parse", "--is-bare-repository"]) === "true") {
			// bare clones (mirrors, CI caches) have no working tree; name them after the directory, minus ".git"
			top = git(dir, ["rev-parse", "--absolute-git-dir"]);
			name = basename(top).replace(/\.git$/u, "");
		} else {
			top = git(dir, ["rev-parse", "--show-toplevel"]);
			name = basename(top);
		}
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

	const commits = parseLog(git(top, ["log", "--reverse", "--format=%at%x09%aE", "HEAD"]));
	const tags: Tag[] = [];

	for (const line of git(top, ["for-each-ref", "--format=%(creatordate:unix)%09%(refname:short)", "refs/tags"]).split("\n")) {
		const [time, tag] = line.split("\t");

		if (time && tag && Number.isFinite(Number(time))) {
			tags.push({ name: tag, time: Number(time) });
		}
	}

	tags.sort(function byTime(a, b) {
		return a.time - b.time;
	});

	return { name, root, commits, tags };
}
