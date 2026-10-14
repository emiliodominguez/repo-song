// Deterministic seeded RNG: one seed reproduces a whole song. Ported from music-radio unchanged, so seeds stay compatible.

/**
 * Seeded random source. Every method consumes exactly one draw except `gauss` (four).
 */
export interface Rng {
	seed: string;
	float(): number;
	range(a: number, b: number): number;
	int(a: number, b: number): number;
	pick<T>(arr: readonly T[]): T;
	chance(p: number): boolean;
	weighted<T>(items: readonly T[], weights: readonly number[]): T;
	gauss(): number;
}

/**
 * 32-bit FNV-1a hash of a string.
 *
 * @param str - Input.
 * @returns Unsigned 32-bit hash.
 */
function xfnv1a(str: string): number {
	let h = 2166136261 >>> 0;

	for (let i = 0; i < str.length; i++) {
		h = Math.imul(h ^ str.charCodeAt(i), 16777619);
	}

	return h >>> 0;
}

/**
 * Mulberry32 PRNG.
 *
 * @param seed - 32-bit state.
 * @returns A function yielding floats in [0, 1).
 */
function mulberry32(seed: number): () => number {
	let a = seed;

	return function next() {
		a |= 0;
		a = (a + 0x6d2b79f5) | 0;

		let t = Math.imul(a ^ (a >>> 15), 1 | a);

		t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;

		return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
	};
}

/**
 * Creates a seeded RNG.
 *
 * @param seed - Any string or number.
 * @returns The RNG.
 */
export function makeRng(seed: string | number): Rng {
	const seedStr = String(seed);
	const next = mulberry32(xfnv1a(seedStr));

	return {
		seed: seedStr,
		float: next,
		range(a, b) {
			return a + (b - a) * next();
		},
		int(a, b) {
			return Math.floor(a + (b - a + 1) * next());
		},
		pick(arr) {
			return arr[Math.floor(next() * arr.length)];
		},
		chance(p) {
			return next() < p;
		},
		weighted(items, weights) {
			const total = weights.reduce(function sum(s, w) {
				return s + w;
			}, 0);

			if (total <= 0) {
				return items[Math.floor(next() * items.length)];
			}

			let r = next() * total;

			for (let i = 0; i < items.length; i++) {
				r -= weights[i];

				if (r < 0) {
					return items[i];
				}
			}

			return items[items.length - 1];
		},
		gauss() {
			return (next() + next() + next() + next() - 2) / 2;
		},
	};
}
