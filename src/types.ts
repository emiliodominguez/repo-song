/**
 * A stereo buffer: [left, right].
 */
export type Stereo = [Float32Array, Float32Array];

/**
 * A note with times in seconds. `note` may be fractional (detuned drum hits).
 */
export interface Note {
	note: number;
	vel: number;
	start: number;
	end: number;
}

/**
 * The parts of a lofi arrangement.
 */
export type Role = "pad" | "keys" | "lead" | "bass" | "drums";

/**
 * A composed song: notes per role plus the musical facts a listener might want to see.
 */
export interface Song {
	seed: string;
	seconds: number;
	bpm: number;
	key: string;
	scale: string;
	parts: Record<Role, Note[]>;
}
