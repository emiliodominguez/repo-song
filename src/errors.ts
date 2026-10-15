// Errors carry a code and params; the CLI turns them into localised text (see src/i18n).

export const ERROR_CODES = ["not_a_repo", "no_commits", "assets_missing", "invalid_seconds", "write_failed"] as const;

export type ErrorCode = (typeof ERROR_CODES)[number];

/**
 * A failure the user can act on.
 */
export class RepoSongError extends Error {
	readonly code: ErrorCode;
	readonly params: Record<string, string | number>;

	/**
	 * Creates an error.
	 *
	 * @param code - Machine-readable code.
	 * @param params - Values interpolated into the localised message.
	 */
	constructor(code: ErrorCode, params: Record<string, string | number> = {}) {
		super(`${code} ${JSON.stringify(params)}`);
		this.name = "RepoSongError";
		this.code = code;
		this.params = params;
	}
}
