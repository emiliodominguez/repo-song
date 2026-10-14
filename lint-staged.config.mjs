export default {
	"*.{js,mjs,cjs,ts}": ["oxlint --deny-warnings", "prettier --check"],
	"*.{json,jsonc,yaml,yml,md}": "prettier --check",
};
