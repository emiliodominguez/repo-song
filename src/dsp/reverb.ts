// Convolution reverb: a generated room impulse response convolved with block FFTs (overlap-add).

import type { Rng } from "../compose/rng.ts";
import type { Stereo } from "../types.ts";

/**
 * In-place iterative radix-2 complex FFT.
 *
 * @param re - Real parts (length a power of two).
 * @param im - Imaginary parts.
 * @param inverse - Inverse transform (scaled by 1/N).
 */
export function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
	const n = re.length;

	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;

		for (; j & bit; bit >>= 1) {
			j ^= bit;
		}

		j ^= bit;

		if (i < j) {
			[re[i], re[j]] = [re[j], re[i]];
			[im[i], im[j]] = [im[j], im[i]];
		}
	}

	for (let len = 2; len <= n; len <<= 1) {
		const ang = ((inverse ? 2 : -2) * Math.PI) / len;
		const wr = Math.cos(ang);
		const wi = Math.sin(ang);

		for (let i = 0; i < n; i += len) {
			let cr = 1,
				ci = 0;

			for (let k = 0; k < len / 2; k++) {
				const a = i + k;
				const b = a + len / 2;
				const tr = re[b] * cr - im[b] * ci;
				const ti = re[b] * ci + im[b] * cr;

				re[b] = re[a] - tr;
				im[b] = im[a] - ti;
				re[a] += tr;
				im[a] += ti;
				[cr, ci] = [cr * wr - ci * wi, cr * wi + ci * wr];
			}
		}
	}

	if (inverse) {
		for (let i = 0; i < n; i++) {
			re[i] /= n;
			im[i] /= n;
		}
	}
}

export interface RoomOptions {
	/**
	 * Time for the tail to fall 60 dB, in seconds.
	 */
	rt60?: number;
	/**
	 * Gap before the first reflection.
	 */
	preDelayMs?: number;
	/**
	 * How fast the highs die relative to the lows, 0 to 1.
	 */
	damping?: number;
}

/**
 * Generates a stereo room impulse response: sparse early reflections, then decorrelated noise whose exponential
 * decay darkens as it ages (air and wall absorption take the highs first).
 *
 * @param sampleRate - Sample rate in Hz.
 * @param rng - Seeded RNG.
 * @param opts - Decay time (RT60), pre-delay, high-frequency damping (0..1).
 * @returns The IR.
 */
export function roomIR(sampleRate: number, rng: Rng, opts: RoomOptions = {}): Stereo {
	const { rt60 = 1.6, preDelayMs = 18, damping = 0.6 } = opts;
	const len = Math.round((rt60 * 1.1 + preDelayMs / 1000) * sampleRate);
	const pre = Math.round((preDelayMs / 1000) * sampleRate);
	const ir: Stereo = [new Float32Array(len), new Float32Array(len)];
	const decay = Math.log(1000) / rt60;

	for (const [c, ch] of ir.entries()) {
		for (let e = 0; e < 14; e++) {
			const at = pre + Math.round((0.002 + rng.float() * 0.045) * sampleRate);

			if (at < len) {
				ch[at] += (rng.float() < 0.5 ? -1 : 1) * (0.5 - e * 0.025) * (c === 0 ? 1 : 0.85);
			}
		}

		let lp = 0;

		for (let i = pre; i < len; i++) {
			const t = (i - pre) / sampleRate;
			const a = Math.max(0.02, 0.9 - damping * Math.min(1, t / rt60) * 0.88);

			lp += a * (rng.float() * 2 - 1 - lp);
			ch[i] += lp * Math.exp(-decay * t) * Math.min(1, t / 0.012) * 0.35;
		}
	}

	return ir;
}

/**
 * Convolves a stereo signal with a stereo IR (channel by channel) and returns only the wet signal.
 *
 * @param dry - Input.
 * @param ir - Impulse response.
 * @returns Wet signal, same length as the input.
 */
export function convolve(dry: Stereo, ir: Stereo): Stereo {
	const len = dry[0].length;
	const irLen = ir[0].length;
	const block = 65536;
	let size = 1;

	while (size < block + irLen) {
		size <<= 1;
	}

	const wet: Stereo = [new Float32Array(len), new Float32Array(len)];

	for (let c = 0; c < 2; c++) {
		const hr = new Float64Array(size);
		const hi = new Float64Array(size);
		const src = dry[c] as Float32Array;
		const out = wet[c] as Float32Array;

		hr.set(ir[c]);
		fft(hr, hi, false);

		for (let s = 0; s < len; s += block) {
			const xr = new Float64Array(size);
			const xi = new Float64Array(size);

			xr.set(src.subarray(s, Math.min(len, s + block)));
			fft(xr, xi, false);

			for (let k = 0; k < size; k++) {
				const r = xr[k] * hr[k] - xi[k] * hi[k];

				xi[k] = xr[k] * hi[k] + xi[k] * hr[k];
				xr[k] = r;
			}

			fft(xr, xi, true);

			for (let k = 0; k < size && s + k < len; k++) {
				out[s + k] += xr[k];
			}
		}
	}

	return wet;
}
