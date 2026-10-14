// Convolution reverb: a generated room impulse response convolved with block FFTs (overlap-add).

import type { Rng } from "../compose/rng.ts";
import type { Stereo } from "../types.ts";

const twiddles = new Map<number, { cos: Float64Array; sin: Float64Array }>();

/**
 * Cosine/sine table for an FFT size, cached (exact values, no recurrence drift).
 *
 * @param n - FFT size.
 * @returns Tables of length n/2.
 */
function twiddleTable(n: number): { cos: Float64Array; sin: Float64Array } {
	let t = twiddles.get(n);

	if (!t) {
		t = { cos: new Float64Array(n / 2), sin: new Float64Array(n / 2) };

		for (let k = 0; k < n / 2; k++) {
			t.cos[k] = Math.cos((2 * Math.PI * k) / n);
			t.sin[k] = Math.sin((2 * Math.PI * k) / n);
		}

		twiddles.set(n, t);
	}

	return t;
}

/**
 * In-place iterative radix-2 complex FFT.
 *
 * @param re - Real parts (length a power of two).
 * @param im - Imaginary parts.
 * @param inverse - Inverse transform (scaled by 1/N).
 */
export function fft(re: Float64Array, im: Float64Array, inverse: boolean): void {
	const n = re.length;
	const { cos, sin } = twiddleTable(n);
	const sign = inverse ? 1 : -1;

	for (let i = 1, j = 0; i < n; i++) {
		let bit = n >> 1;

		for (; j & bit; bit >>= 1) {
			j ^= bit;
		}

		j ^= bit;

		if (i < j) {
			const tr = re[i];
			const ti = im[i];

			re[i] = re[j];
			im[i] = im[j];
			re[j] = tr;
			im[j] = ti;
		}
	}

	for (let len = 2; len <= n; len <<= 1) {
		const half = len >> 1;
		const step = n / len;

		for (let i = 0; i < n; i += len) {
			for (let k = 0; k < half; k++) {
				const wr = cos[k * step];
				const wi = sign * sin[k * step];
				const a = i + k;
				const b = a + half;
				const tr = re[b] * wr - im[b] * wi;
				const ti = re[b] * wi + im[b] * wr;

				re[b] = re[a] - tr;
				im[b] = im[a] - ti;
				re[a] += tr;
				im[a] += ti;
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
 * Convolves a stereo signal with a stereo IR (left with left, right with right) by overlap-add block FFTs, and
 * returns only the wet signal. Left and right ride one complex FFT (left real, right imaginary), halving the work.
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

	// the two IR spectra, unpacked from one transform
	const hr = new Float64Array(size);
	const hi = new Float64Array(size);

	hr.set(ir[0]);
	hi.set(ir[1]);
	fft(hr, hi, false);

	const hlr = new Float64Array(size);
	const hli = new Float64Array(size);
	const hrr = new Float64Array(size);
	const hri = new Float64Array(size);

	for (let k = 0; k < size; k++) {
		const m = (size - k) % size;

		// X_left = (Z[k] + conj Z[N-k]) / 2, X_right = (Z[k] - conj Z[N-k]) / 2i
		hlr[k] = (hr[k] + hr[m]) / 2;
		hli[k] = (hi[k] - hi[m]) / 2;
		hrr[k] = (hi[k] + hi[m]) / 2;
		hri[k] = -(hr[k] - hr[m]) / 2;
	}

	const wet: Stereo = [new Float32Array(len), new Float32Array(len)];
	const zr = new Float64Array(size);
	const zi = new Float64Array(size);
	const yr = new Float64Array(size);
	const yi = new Float64Array(size);

	for (let s = 0; s < len; s += block) {
		const n = Math.min(block, len - s);

		zr.fill(0);
		zi.fill(0);
		zr.set(dry[0].subarray(s, s + n));
		zi.set(dry[1].subarray(s, s + n));
		fft(zr, zi, false);

		for (let k = 0; k < size; k++) {
			const m = (size - k) % size;
			const lr = (zr[k] + zr[m]) / 2;
			const li = (zi[k] - zi[m]) / 2;
			const rr = (zi[k] + zi[m]) / 2;
			const ri = -(zr[k] - zr[m]) / 2;
			// Y_left and Y_right, then repack as Y_left + i·Y_right
			const ylr = lr * hlr[k] - li * hli[k];
			const yli = lr * hli[k] + li * hlr[k];
			const yrr = rr * hrr[k] - ri * hri[k];
			const yri = rr * hri[k] + ri * hrr[k];

			yr[k] = ylr - yri;
			yi[k] = yli + yrr;
		}

		fft(yr, yi, true);

		for (let k = 0; k < size && s + k < len; k++) {
			wet[0][s + k] += yr[k];
			wet[1][s + k] += yi[k];
		}
	}

	return wet;
}
