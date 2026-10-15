// English is the primary catalog; every other locale must provide the same keys (enforced by the Messages type).

export const en = {
	help: [
		"Usage: repo-song [path] [options]",
		"",
		"Turns a git repository's history into a lofi song played on real sampled instruments.",
		"",
		"Options:",
		"  -o, --out <file>      Output WAV file (default: <repo>.wav)",
		"  -s, --seconds <n>     Approximate length in seconds, 30 to 300 (default: 90)",
		"      --seed <text>     Use this seed instead of the repo's root commit",
		"  -h, --help            Show this help",
		"  -v, --version         Show the version",
	].join("\n"),
	reading: "Reading {path}",
	repo: "{name} · {commits} · seed {seed}",
	commits: { one: "{count} commit", other: "{count} commits" },
	composing: "Composing in {key} {mode}, {bpm} BPM, {duration}",
	mode: { major: "major", minor: "minor" },
	notesTitle: "Liner notes",
	section: { intro: "intro", verse: "verse", chorus: "chorus", breakdown: "breakdown", outro: "outro" },
	period: "{from} – {to}",
	peak: "busiest stretch",
	quiet: "quiet stretch",
	newAuthors: { one: "{count} new contributor", other: "{count} new contributors" },
	releases: { one: "release {names}", other: "releases {names}" },
	rendering: "Rendering",
	wrote: "Wrote {file} ({ms} ms)",
	errors: {
		not_a_repo: "{path} is not inside a git repository.",
		no_commits: "{path} has no commits yet, so there is no history to play.",
		assets_missing: "Instrument recordings are missing at {path}. Reinstall repo-song, or point REPO_SONG_ASSETS at a copy of its assets folder.",
		invalid_seconds: "--seconds must be a number from 30 to 300 (got {value}).",
		write_failed: "Could not write {file}: {reason}",
		unexpected: "Something went wrong: {reason}",
	},
};

export type Messages = typeof en;
