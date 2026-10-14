# The sound

The goal is a track that holds up next to human-made lofi, generated offline, deterministically, with no native tools. This page records what the renderer does and how it was tuned, so changes can be judged the same way.

## Signal chain

| Part              | Source                                                                                                                      | Processing                                                                                                   |
| ----------------- | --------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| Melody (lead)     | **Yamaha upright piano**, VCSL: 3 velocity layers, up to 3 round robins, sampled every 4th/5th, plus release samples        | High shelf −1.5 dB @ 4.5 kHz, −3 dB @ 900 Hz, low shelf −2 dB @ 200 Hz                                       |
| Chords (keys)     | **Modelled Rhodes**: 2-op FM tine, velocity-dependent index, 7.1× "ding" partial, two-stage decay, asymmetric tanh pickup   | Suitcase tremolo 3.8 Hz / 22 %, lowpass 5.2 kHz, −3 dB @ 350 Hz                                              |
| Pad               | 3 detuned band-limited saws per note (−9/0/+8 cents), 1.1 s attack                                                          | HP 180 Hz, LP 2.6 kHz, −4 dB @ 850 Hz                                                                        |
| Bass              | **Modal string**: 24 harmonics, each decaying faster than the last, pluck-position comb, slight inharmonicity, finger thump | LP 1.4 kHz, compressor 4:1                                                                                   |
| Kick              | Sine with exponential pitch drop (49 Hz rest, +95 Hz punch), filtered click                                                 | On the drum bus                                                                                              |
| Snare, side-stick | **VCSL Modern Snare 1**: 5 layers × 2 round robins, pitched down 1.5 semitones                                              | Drum bus: LP 12 kHz → **26.04 kHz / 12-bit crunch** → LP 10 kHz → +2 dB @ 220 Hz → tanh 1.8 → compressor 4:1 |
| Hats, shaker      | **VCSL hi-hat** (4 layers × 2 rr), open hat, small shaker                                                                   | Skip the crunch: HP 400 Hz, LP 14 kHz, tanh 1.3                                                              |

**Mix.** Each part is set to a loudness target (gated RMS: lead −27, keys −27, pad −33, bass −20.5, drums −19 dB) instead of fixed gains, because recordings and models differ wildly in output level. Bass, pad and keys duck under each kick (sidechain, 25 % / 18 %). Lead, keys, pad and drums feed **one shared room**: a generated stereo IR (RT60 1.9 s, 22 ms pre-delay, highs decaying first) convolved by FFT, high-passed at 250 Hz and low-passed at 6.5 kHz.

**Master.** HP 30 Hz → tape wow 0.42 Hz / flutter 6.2 Hz → low shelf +2 dB @ 120 Hz → −2.5 dB @ 1 kHz → high shelf −1.5 dB @ 7 kHz → compressor 2.2:1 → tanh 1.25 → **matching EQ** (3 passes, 75 % strength, ±7 dB) toward the reference curve → vinyl hiss (−46 dBFS) and crackle (2.5/s) → loudness to −16 dB gated RMS → look-ahead limiter at −1.5 dBFS → 0.8 s fade-in, 4 s fade-out.

## How it was tuned

You can't judge "sounds real" from a spectrum, but you can catch most mix mistakes with one, so tuning alternated between measurements and listening.

**Reference curve.** Two CC-BY lofi masters, "Lazy Daze" (Shane Ivers) and "Trade Controls" (tcarisland), measured as octave-band energy relative to total energy (8192-point FFT, Hann window, 50 % overlap, first 45 s). Their mean is `LOFI_TONE` in `src/dsp/tone.ts`. The two references differ from each other by up to ±7 dB per band, so a render within about ±4 dB counts as "in range".

**What the numbers caught.**

| Version                | 31   | 63   | 125  | 250  | 500  | 1k        | 2k   | 4k   | 8k    | 16k   |
| ---------------------- | ---- | ---- | ---- | ---- | ---- | --------- | ---- | ---- | ----- | ----- |
| First sample-based mix | −0.2 | −5.3 | −6.7 | +2.4 | +4.3 | **+10.2** | −1.8 | −8.7 | −12.6 | −21.5 |
| Current (quebracho)    | −2.1 | +1.1 | +0.6 | −0.4 | −1.1 | +0.5      | −4.7 | −3.4 | −1.4  | −3.4  |

The first mix was boxy (the piano melody sat right on 1 kHz and too far forward), thin in the low end, and dark (three stacked high cuts plus a 7.5 kHz drum lowpass). Rebalancing the parts, letting the hats skip the crunch and adding the matching EQ brought four test repos within about ±3 dB.

**What the numbers can't judge.** Meta's audiobox-aesthetics model was tried as an automatic "production quality" score and rejected: it rated the two human-made references _lower_ (6.5 and 7.3) than the synthetic renders (about 7.9). It rewards clean, bright audio and penalises the lofi texture itself.

**Measure a change.** `pnpm analyze <repo>` prints the band deltas (same FFT method), gated RMS, peak and per-part levels. Then listen; ears decide.

## Known limits

- The composition is the weakest link now: block-chord comping, a basic boom-bap pattern, no sections (loudness range is about 2.5 LU). See the roadmap.
- The matching EQ measures with a biquad band split while the reference was measured by FFT; the methods disagree most at 31 Hz. It works (the FFT measurement lands in range), but the target should be re-measured with the same method. That changes every song, so it waits for a deliberate sound update.
- The Rhodes is modelled, not sampled; up close it is the part most likely to read as synthetic.
