// English is the primary catalog; every other locale must provide the same keys (enforced by the Messages type).

export const en = {
	help: [
		"Usage: repo-song [path] [options]",
		"",
		"Turns a git repository's history into a lofi song played on real sampled instruments.",
		"",
		"Options:",
		"  -o, --out <file>      Output WAV file (default: <repo>.wav)",
		"  -s, --seconds <n>     Song length in seconds, 15 to 300 (default: 45)",
		"      --seed <text>     Use this seed instead of the repo's root commit",
		"  -h, --help            Show this help",
		"  -v, --version         Show the version",
	].join("\n"),
	reading: "Reading {path}",
	repo: "{name} · {commits} commits · seed {seed}",
	downloading: "First run: downloading instrument recordings ({size} MB, cached for next time)",
	progress: "  {percent}%",
	composing: "Composing {key} {scale}, {bpm} BPM, {seconds}s",
	rendering: "Rendering",
	wrote: "Wrote {file} ({ms} ms)",
	errors: {
		not_a_repo: "{path} is not inside a git repository.",
		no_commits: "{path} has no commits yet, so there is no history to play.",
		assets_download_failed: "Could not download {path} ({status}). Check your connection and try again.",
		assets_missing: "Instrument recordings are missing at {path}. Delete the folder and run again to re-download.",
		invalid_seconds: "--seconds must be a number from 15 to 300 (got {value}).",
		write_failed: "Could not write {file}: {reason}",
		unexpected: "Something went wrong: {reason}",
	},
};

export type Messages = typeof en;
