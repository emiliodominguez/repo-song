/**
 * Reject attribution trailers under the repository's commit policy.
 *
 * @param parsed - Parsed commit message.
 * @returns Validity and diagnostic.
 */
function noCoauthor(parsed) {
	return [!/^co-authored-by\s*:/imu.test(parsed.raw), "Co-author trailers are not allowed."];
}

export default {
	extends: ["@commitlint/config-conventional"],
	plugins: [{ rules: { "no-coauthor": noCoauthor } }],
	rules: {
		"subject-case": [2, "always", "sentence-case"],
		"scope-case": [2, "always", "kebab-case"],
		"type-case": [2, "always", "lower-case"],
		"no-coauthor": [2, "always"],
	},
};
