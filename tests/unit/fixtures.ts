// A deterministic synthetic history: two years, a busy launch, a quiet summer, a release, contributors joining.

import type { Commit, History, Tag } from "../../src/history.ts";

const DAY = 86400;
const T0 = 1_640_995_200; // 2022-01-01

/**
 * Builds the fixture history.
 *
 * @returns History with a burst, a lull, three tags and five authors.
 */
export function fixtureHistory(): Pick<History, "root" | "commits" | "tags"> {
	const commits: Commit[] = [];
	const authors = ["ada@x.dev", "ben@x.dev", "cy@x.dev", "di@x.dev", "eve@x.dev"];

	for (let d = 0; d < 730; d++) {
		// launch burst in the first two months, near-silence in the summer of year one, steady afterwards
		const perDay = d < 60 ? 6 : d > 150 && d < 260 ? (d % 20 === 0 ? 1 : 0) : d % 2;
		const team = d < 100 ? 1 : d < 400 ? 3 : 5;

		for (let k = 0; k < perDay; k++) {
			commits.push({ time: T0 + d * DAY + k * 3600, author: authors[(d + k) % team] ?? "ada@x.dev" });
		}
	}

	const tags: Tag[] = [
		{ name: "v0.1.0", time: T0 + 58 * DAY },
		{ name: "v1.0.0", time: T0 + 420 * DAY },
		{ name: "v1.1.0", time: T0 + 700 * DAY },
	];

	return { root: "df6110d5dfbd74d79e1e4aa0b9baa8167cad46e5", commits, tags };
}
