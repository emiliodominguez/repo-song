// FLAC decoding, so the instrument pack ships lossless at a tenth of the WAV size: every block size, verbatim, fixed and
// LPC subframes (any order), wasted bits, all stereo modes, 8 to 32 bits. CRCs are not checked; npm verifies the package.

import { readFileSync } from "node:fs";

import type { Stereo } from "../types.ts";

const FIXED: readonly (readonly number[])[] = [[], [1], [2, -1], [3, -3, 1], [4, -6, 4, -1]];

/**
 * Decodes a FLAC stream into float channels scaled like 16/24-bit PCM WAV reading (sample / 2^(bits-1)).
 *
 * @param bytes - File bytes.
 * @returns Sample rate and stereo data (mono is duplicated into both channels).
 */
export function decodeFlac(bytes: Uint8Array): { sampleRate: number; data: Stereo } {
	// padded so the 32-bit window never reads past the end
	const buf = new Uint8Array(bytes.length + 8);
	let pos = 0; // bit position

	buf.set(bytes);

	/**
	 * Reads an unsigned big-endian field of up to 32 bits.
	 *
	 * @param n - Width in bits.
	 * @returns Value.
	 */
	function bits(n: number): number {
		let v = 0;

		while (n > 0) {
			const off = pos & 7;
			const avail = 8 - off;
			const take = avail < n ? avail : n;

			v = v * (1 << take) + ((buf[pos >>> 3] >>> (avail - take)) & ((1 << take) - 1));
			pos += take;
			n -= take;
		}

		return v;
	}

	/**
	 * Reads a two's-complement field.
	 *
	 * @param n - Width in bits.
	 * @returns Value.
	 */
	function signed(n: number): number {
		if (n === 0) {
			return 0;
		}

		const v = bits(n);

		return v >= 2 ** (n - 1) ? v - 2 ** n : v;
	}

	/**
	 * Counts zero bits up to and including the next one bit.
	 *
	 * @returns Number of zeros.
	 */
	function unary(): number {
		let q = 0;

		for (;;) {
			const off = pos & 7;
			const byte = (buf[pos >>> 3] << off) & 0xff;

			if (byte === 0) {
				q += 8 - off;
				pos += 8 - off;

				if (pos >>> 3 >= buf.length) {
					throw new Error("FLAC: unterminated unary code");
				}

				continue;
			}

			const zeros = Math.clz32(byte) - 24;

			pos += zeros + 1;

			return q + zeros;
		}
	}

	/**
	 * Decodes the residual of a subframe into `out[order..]`.
	 *
	 * @param out - Subframe samples.
	 * @param order - Predictor order (warm-up samples already in place).
	 */
	function residual(out: Int32Array, order: number): void {
		const method = bits(2);
		const paramBits = method === 0 ? 4 : 5;
		const escape = method === 0 ? 15 : 31;
		const partitionOrder = bits(4);
		const partitions = 1 << partitionOrder;
		const size = out.length >> partitionOrder;
		let i = order;

		for (let p = 0; p < partitions; p++) {
			const end = (p + 1) * size;
			const k = bits(paramBits);

			if (k === escape) {
				const raw = bits(5);

				for (; i < end; i++) {
					out[i] = signed(raw);
				}

				continue;
			}

			// the hot loop: unary quotient plus k low bits, read through a 32-bit window with the position in a local
			const scale = 2 ** k;
			let bp = pos;

			for (; i < end; i++) {
				let q = 0;
				let byte = (buf[bp >>> 3] << (bp & 7)) & 0xff;

				while (byte === 0) {
					q += 8 - (bp & 7);
					bp = (bp | 7) + 1;

					if (bp >>> 3 >= buf.length) {
						throw new Error("FLAC: unterminated rice code");
					}

					byte = buf[bp >>> 3];
				}

				const zeros = Math.clz32(byte) - 24;

				bp += zeros + 1;
				q += zeros;

				let low = 0;

				if (k) {
					const at = bp >>> 3;
					const off = bp & 7;

					if (off + k <= 32) {
						const word = ((buf[at] << 24) | (buf[at + 1] << 16) | (buf[at + 2] << 8) | buf[at + 3]) >>> 0;

						low = (word << off) >>> (32 - k);
					} else {
						pos = bp;
						low = bits(k);
					}

					bp += k;
				}

				const u = q * scale + low;

				out[i] = u < 0x80000000 ? (u >>> 1) ^ -(u & 1) : u % 2 ? -(u + 1) / 2 : u / 2;
			}

			pos = bp;
		}
	}

	/**
	 * Decodes one subframe.
	 *
	 * @param out - Samples for this channel and block.
	 * @param depth - Bits per sample of this channel (one more for a side channel).
	 */
	function subframe(out: Int32Array, depth: number): void {
		bits(1);

		const type = bits(6);
		const wasted = bits(1) ? unary() + 1 : 0;
		const width = depth - wasted;
		const n = out.length;

		if (type === 0) {
			out.fill(signed(width));
		} else if (type === 1) {
			for (let i = 0; i < n; i++) {
				out[i] = signed(width);
			}
		} else if (type >= 8 && type <= 12) {
			const order = type - 8;
			const coefs = FIXED[order] ?? [];

			for (let i = 0; i < order; i++) {
				out[i] = signed(width);
			}

			residual(out, order);
			predict(out, coefs, 0);
		} else if (type >= 32) {
			const order = type - 31;

			for (let i = 0; i < order; i++) {
				out[i] = signed(width);
			}

			const precision = bits(4) + 1;
			const shift = signed(5);
			const coefs: number[] = [];

			for (let i = 0; i < order; i++) {
				coefs.push(signed(precision));
			}

			if (shift < 0) {
				throw new Error("FLAC: negative LPC shift");
			}

			residual(out, order);
			predict(out, coefs, shift);
		} else {
			throw new Error(`FLAC: reserved subframe type ${type}`);
		}

		if (wasted) {
			for (let i = 0; i < n; i++) {
				out[i] *= 2 ** wasted;
			}
		}
	}

	if (String.fromCharCode(buf[0], buf[1], buf[2], buf[3]) !== "fLaC") {
		throw new Error("not a FLAC stream");
	}

	pos = 32;

	let sampleRate = 0,
		channels = 0,
		depth = 0,
		total = 0;

	for (let last = 0; !last;) {
		last = bits(1);

		const type = bits(7);
		const length = bits(24);
		const next = pos + length * 8;

		if (type === 0) {
			bits(16 + 16 + 24 + 24);
			sampleRate = bits(20);
			channels = bits(3) + 1;
			depth = bits(5) + 1;
			total = bits(4) * 2 ** 32 + bits(32);
		}

		pos = next;
	}

	if (!sampleRate || !total) {
		throw new Error("FLAC: missing STREAMINFO or unknown length");
	}

	const out = Array.from({ length: channels }, function channel() {
		return new Int32Array(total);
	});

	let done = 0;

	while (done < total) {
		if (bits(14) !== 0x3ffe) {
			throw new Error(`FLAC: lost frame sync at byte ${pos >>> 3}`);
		}

		bits(2);

		const sizeCode = bits(4);
		const rateCode = bits(4);
		const assignment = bits(4);
		const depthCode = bits(3);

		bits(1);

		// frame or sample number, UTF-8 style: the leading ones of the first byte give the length
		const first = bits(8);

		for (let extra = Math.max(0, Math.clz32(~(first << 24)) - 1); extra > 0; extra--) {
			bits(8);
		}

		let size = sizeCode === 1 ? 192 : sizeCode <= 5 ? 576 * 2 ** (sizeCode - 2) : sizeCode >= 8 ? 256 * 2 ** (sizeCode - 8) : 0;

		if (sizeCode === 6) {
			size = bits(8) + 1;
		} else if (sizeCode === 7) {
			size = bits(16) + 1;
		}

		if (rateCode === 12) {
			bits(8);
		} else if (rateCode === 13 || rateCode === 14) {
			bits(16);
		}

		bits(8); // CRC-8

		const frameDepth = [depth, 8, 12, 0, 16, 20, 24, 32][depthCode] ?? depth;
		const count = Math.min(size, total - done);

		const blocks = Array.from({ length: channels }, function block() {
			return new Int32Array(size);
		});

		for (let c = 0; c < channels; c++) {
			const side = (assignment === 8 && c === 1) || (assignment === 9 && c === 0) || (assignment === 10 && c === 1);

			subframe(blocks[c], frameDepth + (side ? 1 : 0));
		}

		const a = blocks[0];
		const b = blocks[1];

		if (assignment === 8) {
			for (let i = 0; i < size; i++) {
				b[i] = a[i] - b[i];
			}
		} else if (assignment === 9) {
			for (let i = 0; i < size; i++) {
				a[i] += b[i];
			}
		} else if (assignment === 10) {
			for (let i = 0; i < size; i++) {
				const mid = a[i] * 2 + (b[i] & 1);

				a[i] = (mid + b[i]) >> 1;
				b[i] = (mid - b[i]) >> 1;
			}
		}

		for (let c = 0; c < channels; c++) {
			(out[c] as Int32Array).set((blocks[c] as Int32Array).subarray(0, count), done);
		}

		done += count;
		pos = ((pos + 7) >>> 3) * 8 + 16; // byte-align, skip CRC-16
	}

	const scale = 2 ** (depth - 1);

	const data = out.map(function toFloat(ch) {
		const f = new Float32Array(ch.length);

		for (let i = 0; i < ch.length; i++) {
			f[i] = ch[i] / scale;
		}

		return f;
	});

	const left = data[0] as Float32Array;

	return { sampleRate, data: channels === 1 ? [left, left] : [left, data[1]] };
}

/**
 * Runs a linear predictor over a block in place: `out[i] += Σ coefs[j] · out[i-1-j] >> shift` after the warm-up.
 *
 * @param out - Warm-up samples followed by residuals; becomes the signal.
 * @param coefs - Predictor coefficients, most recent sample first.
 * @param shift - Quantisation shift of the coefficients.
 */
function predict(out: Int32Array, coefs: readonly number[], shift: number): void {
	const order = coefs.length;
	const c = Float64Array.from(coefs);
	const div = 2 ** shift;

	// sums of 24-bit samples times 15-bit coefficients exceed 32 bits but stay exact in doubles
	for (let i = order; i < out.length; i++) {
		let sum = 0;

		for (let j = 0, at = i - 1; j < order; j++, at--) {
			sum += c[j] * out[at];
		}

		out[i] += Math.floor(sum / div);
	}
}

/**
 * Reads a FLAC file.
 *
 * @param path - File path.
 * @returns Sample rate and stereo data.
 */
export function readFlac(path: string): { sampleRate: number; data: Stereo } {
	return decodeFlac(readFileSync(path));
}
