import type { Family } from "./compose/harmony.ts";
import type { Section } from "./compose/story.ts";

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
 * A section placed in time.
 */
export interface TimedSection extends Section {
	startSec: number;
	endSec: number;
}

/**
 * A composed song: notes per part, its form, and the musical facts a listener might want to see.
 */
export interface Song {
	seed: string;
	/**
	 * Length of the music up to the end of the last bar (the final chord rings on past it).
	 */
	seconds: number;
	bpm: number;
	/**
	 * Tonic name, e.g. "F#".
	 */
	key: string;
	mode: Family;
	sections: TimedSection[];
	parts: Record<Role, Note[]>;
}
