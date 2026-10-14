// The song's form, read from the repo's history: an intro, one four-bar phrase per slice of the project's life, an outro.
// Busy stretches play fuller, quiet stretches break down, releases land on the tonic, new contributors add a voice.

import type { Commit, History, Tag } from "../history.ts";

export type SectionKind = "intro" | "verse" | "chorus" | "breakdown" | "outro";

export interface Section {
	kind: SectionKind;
	startBar: number;
	bars: number;
	/**
	 * Arrangement intensity, 0 (sparse) to 1 (full).
	 */
	energy: number;
	/**
	 * Which progression the section plays.
	 */
	progression: "a" | "b";
	/**
	 * The slice of history this phrase stands for (unix seconds); absent for intro and outro.
	 */
	period?: { from: number; to: number };
	commits: number;
	/**
	 * Authors whose first commit falls in this slice.
	 */
	newAuthors: number;
	/**
	 * Tags created in this slice.
	 */
	releases: string[];
	/**
	 * The busiest slice of the project.
	 */
	peak: boolean;
}

export const PHRASE_BARS = 4;

const SEMVER = /^v?(\d+)\.(\d+)(?:\.(\d+))?$/u;

/**
 * The tags worth a moment in the song. A handful of tags are all milestones; with many, only major releases count
 * (x.0.0, or 0.x.0 for projects that never reached 1.0), never pre-releases.
 *
 * @param tags - All tags, by time.
 * @returns Milestone tags.
 */
export function milestones(tags: Tag[]): Tag[] {
	if (tags.length <= 6) {
		return tags;
	}

	const releases = tags.flatMap(function parse(t) {
		const m = SEMVER.exec(t.name);

		return m ? [{ tag: t, major: Number(m[1]), minor: Number(m[2]), patch: Number(m[3] ?? 0) }] : [];
	});

	const majors = releases.filter((r) => r.major >= 1 && r.minor === 0 && r.patch === 0);
	const picked = majors.length ? majors : releases.filter((r) => r.major === 0 && r.patch === 0);

	return picked.map((r) => r.tag);
}

/**
 * How many bars the song gets for a target length, rounded to whole phrases.
 *
 * @param seconds - Requested length.
 * @param bpm - Tempo.
 * @returns Intro, outro and middle-phrase counts.
 */
export function songShape(seconds: number, bpm: number): { introBars: number; outroBars: number; phrases: number } {
	const barSec = 240 / bpm;
	const total = Math.round(seconds / barSec);
	const edge = total >= 26 ? 4 : 2;
	const phrases = Math.max(2, Math.round((total - 2 * edge) / PHRASE_BARS));

	return { introBars: edge, outroBars: edge, phrases };
}

/**
 * Commit counts, first-time authors and tags per equal time slice of the history.
 *
 * @param commits - Commits, oldest first.
 * @param tags - Tags.
 * @param slices - Number of slices.
 * @returns One summary per slice.
 */
function sliceHistory(
	commits: Commit[],
	tags: Tag[],
	slices: number,
): { from: number; to: number; commits: number; newAuthors: number; releases: string[] }[] {
	const first = commits[0]?.time ?? 0;
	const last = commits[commits.length - 1]?.time ?? first;
	const span = Math.max(1, last - first);

	const out = Array.from({ length: slices }, function slice(_, i) {
		return { from: first + (span * i) / slices, to: first + (span * (i + 1)) / slices, commits: 0, newAuthors: 0, releases: [] as string[] };
	});

	const seen = new Set<string>();

	/**
	 * Slice index for a timestamp.
	 *
	 * @param t - Unix seconds.
	 * @returns Index, clamped into range.
	 */
	function indexOf(t: number): number {
		return Math.min(slices - 1, Math.max(0, Math.floor(((t - first) / span) * slices)));
	}

	for (const c of commits) {
		const s = out[indexOf(c.time)];

		s.commits++;

		if (!seen.has(c.author)) {
			seen.add(c.author);

			// the founder doesn't count as "new"
			if (seen.size > 1) {
				s.newAuthors++;
			}
		}
	}

	for (const t of tags) {
		if (t.time >= first && t.time <= last + 86400) {
			out[indexOf(t.time)].releases.push(t.name);
		}
	}

	return out;
}

/**
 * Plans the song's sections from its history.
 *
 * @param history - Repo history.
 * @param shape - Bar counts from `songShape`.
 * @returns Sections in order, covering every bar.
 */
export function planSections(history: Pick<History, "commits" | "tags">, shape: ReturnType<typeof songShape>): Section[] {
	const slices = sliceHistory(history.commits, milestones(history.tags), shape.phrases);
	const mean = Math.max(1e-9, history.commits.length / shape.phrases);
	const activity = slices.map((s) => (history.commits.length < shape.phrases * 2 ? 1 : s.commits / mean));
	const peakIndex = activity.indexOf(Math.max(...activity));
	const quietIndex = activity.indexOf(Math.min(...activity));

	const sections: Section[] = [
		{ kind: "intro", startBar: 0, bars: shape.introBars, energy: 0.2, progression: "a", commits: 0, newAuthors: 0, releases: [], peak: false },
	];

	let bar = shape.introBars;

	for (const [i, s] of slices.entries()) {
		// log-scaled activity (twice as busy is clearly fuller, ten times is not ten times louder), blended with a musical
		// arc that builds toward the last third, so a project that peaked early still has a song that lands
		const fromHistory = 0.55 + 0.22 * Math.log2(Math.max(0.05, activity[i]));
		const arc = 0.45 + 0.4 * Math.sin(Math.PI * Math.min(1, (i + 0.5) / (slices.length * 0.75)) * 0.5);
		const raw = 0.7 * fromHistory + 0.3 * arc;
		const breakdown = i === quietIndex && i > 0 && i < slices.length - 1 && activity[i] < 0.5;
		const energy = breakdown ? 0.15 : Math.min(1, Math.max(0.3, raw));
		// A/B form in pairs of phrases: A A B B A A …
		const progression = Math.floor(i / 2) % 2 === 0 ? "a" : "b";

		sections.push({
			kind: breakdown ? "breakdown" : progression === "a" ? "verse" : "chorus",
			startBar: bar,
			bars: PHRASE_BARS,
			energy,
			progression,
			period: { from: s.from, to: s.to },
			commits: s.commits,
			newAuthors: s.newAuthors,
			releases: s.releases,
			peak: i === peakIndex && activity[i] > 1.2,
		});

		bar += PHRASE_BARS;
	}

	sections.push({
		kind: "outro",
		startBar: bar,
		bars: shape.outroBars,
		energy: 0.25,
		progression: "a",
		commits: 0,
		newAuthors: 0,
		releases: [],
		peak: false,
	});

	return sections;
}
