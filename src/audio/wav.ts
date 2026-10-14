// WAV reading (PCM 16/24/32-bit, float 32/64, WAVE_FORMAT_EXTENSIBLE) and 24-bit PCM writing.

import { readFileSync } from "node:fs";

import type { Stereo } from "../types.ts";

/**
 * Reads a WAV file into float channels.
 *
 * @param path - File path.
 * @returns Sample rate and stereo data (mono is duplicated into both channels).
 */
export function readWav(path: string): { sampleRate: number; data: Stereo } {
	const buf = readFileSync(path);
	const view = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);

	if (buf.toString("ascii", 0, 4) !== "RIFF" || buf.toString("ascii", 8, 12) !== "WAVE") {
		throw new Error(`not a WAV file: ${path}`);
	}

	let format = 1,
		channels = 2,
		sampleRate = 44100,
		bits = 16,
		dataOffset = -1,
		dataSize = 0;

	for (let p = 12; p + 8 <= buf.length;) {
		const id = buf.toString("ascii", p, p + 4);
		const size = view.getUint32(p + 4, true);

		if (id === "fmt ") {
			format = view.getUint16(p + 8, true);
			channels = view.getUint16(p + 10, true);
			sampleRate = view.getUint32(p + 12, true);
			bits = view.getUint16(p + 22, true);

			if (format === 0xfffe) {
				format = view.getUint16(p + 32, true);
			}
		} else if (id === "data") {
			dataOffset = p + 8;
			dataSize = Math.min(size, buf.length - dataOffset);
		}

		p += 8 + size + (size & 1);
	}

	if (dataOffset < 0) {
		throw new Error(`no data chunk: ${path}`);
	}

	const bytes = bits / 8;
	const frames = Math.floor(dataSize / (bytes * channels));

	const out = Array.from({ length: channels }, function channel() {
		return new Float32Array(frames);
	});

	for (let i = 0; i < frames; i++) {
		for (let c = 0; c < channels; c++) {
			const o = dataOffset + (i * channels + c) * bytes;
			let v: number;

			if (format === 3) {
				v = bits === 64 ? view.getFloat64(o, true) : view.getFloat32(o, true);
			} else if (bits === 16) {
				v = view.getInt16(o, true) / 32768;
			} else if (bits === 24) {
				v = (view.getUint8(o) | (view.getUint8(o + 1) << 8) | (view.getInt8(o + 2) << 16)) / 8388608;
			} else if (bits === 32) {
				v = view.getInt32(o, true) / 2147483648;
			} else {
				throw new Error(`unsupported ${bits}-bit WAV: ${path}`);
			}

			(out[c] as Float32Array)[i] = v;
		}
	}

	const left = out[0] as Float32Array;

	return { sampleRate, data: channels === 1 ? [left, left] : [left, out[1]] };
}

/**
 * Encodes stereo float audio as a 24-bit PCM WAV, with TPDF dither from a fixed-seed generator so output stays deterministic.
 *
 * @param pcm - Audio in [-1, 1] (values beyond are clipped).
 * @param sampleRate - Sample rate in Hz.
 * @returns WAV file bytes.
 */
export function encodeWav24(pcm: Stereo, sampleRate: number): Uint8Array {
	const frames = pcm[0].length;
	const dataSize = frames * 2 * 3;
	const out = new Uint8Array(44 + dataSize);
	const view = new DataView(out.buffer);
	const ascii = new TextEncoder();
	const full = 8388607;
	let state = 0x9e3779b9;

	/**
	 * Uniform noise in [0, 1) from a xorshift32 generator.
	 *
	 * @returns Noise sample.
	 */
	function noise(): number {
		state ^= state << 13;
		state ^= state >>> 17;
		state ^= state << 5;

		return (state >>> 0) / 4294967296;
	}

	out.set(ascii.encode("RIFF"), 0);
	view.setUint32(4, 36 + dataSize, true);
	out.set(ascii.encode("WAVEfmt "), 8);
	view.setUint32(16, 16, true);
	view.setUint16(20, 1, true);
	view.setUint16(22, 2, true);
	view.setUint32(24, sampleRate, true);
	view.setUint32(28, sampleRate * 6, true);
	view.setUint16(32, 6, true);
	view.setUint16(34, 24, true);
	out.set(ascii.encode("data"), 36);
	view.setUint32(40, dataSize, true);

	let o = 44;

	for (let i = 0; i < frames; i++) {
		for (const ch of pcm) {
			const dither = noise() - noise();
			const v = Math.max(-full - 1, Math.min(full, Math.round(ch[i] * full + dither)));

			out[o++] = v & 0xff;
			out[o++] = (v >> 8) & 0xff;
			out[o++] = (v >> 16) & 0xff;
		}
	}

	return out;
}
