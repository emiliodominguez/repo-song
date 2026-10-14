// Regenerates src/assets-manifest.json: every VCSL file the catalog uses, with its size, at the pinned commit.
//   pnpm assets:manifest            (set GITHUB_TOKEN to avoid the anonymous API rate limit)

import { writeFileSync } from "node:fs";

import { SAMPLED, VCSL } from "../src/instruments/catalog.ts";

interface TreeEntry {
	path: string;
	type: string;
	size?: number;
}

const headers: Record<string, string> = { accept: "application/vnd.github+json" };

if (process.env["GITHUB_TOKEN"]) {
	headers["authorization"] = `Bearer ${process.env["GITHUB_TOKEN"]}`;
}

const res = await fetch(`https://api.github.com/repos/${VCSL.repo}/git/trees/${VCSL.commit}?recursive=1`, { headers });

if (!res.ok) {
	throw new Error(`GitHub API ${res.status}: ${await res.text()}`);
}

const body: unknown = await res.json();

/**
 * Narrows the GitHub tree response.
 *
 * @param value - Parsed JSON.
 * @returns Whether it has a tree array.
 */
function isTree(value: unknown): value is { tree: TreeEntry[]; truncated: boolean } {
	return typeof value === "object" && value !== null && "tree" in value && Array.isArray(value.tree);
}

if (!isTree(body)) {
	throw new Error("unexpected GitHub API response");
}

const { tree, truncated } = body;

if (truncated) {
	throw new Error("GitHub returned a truncated tree; the manifest would be incomplete");
}

const files = tree
	.filter(function used(entry) {
		if (entry.type !== "blob") {
			return false;
		}

		const slash = entry.path.lastIndexOf("/");
		const dir = entry.path.slice(0, slash);
		const name = entry.path.slice(slash + 1);

		return Object.values(SAMPLED).some(function matches(s) {
			return s.dir === dir && s.pattern.test(name);
		});
	})
	.map(function entry(e) {
		return { path: e.path, size: e.size ?? 0 };
	})
	.sort(function byPath(a, b) {
		return a.path.localeCompare(b.path);
	});

writeFileSync(new URL("../src/assets-manifest.json", import.meta.url), `${JSON.stringify({ source: VCSL, files }, null, "\t")}\n`);
process.stderr.write(`${files.length} files, ${(files.reduce((s, f) => s + f.size, 0) / 1e6).toFixed(1)} MB\n`);
