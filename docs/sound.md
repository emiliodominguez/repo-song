# The sound

The goal is a track that holds up next to human-made lofi, generated offline, deterministically, with no native tools. This page records what the composer and renderer do and how they were tuned, so changes can be judged the same way.

## Writing

| Part    | What it plays                                                                                                                                                                                                                                                                                                                                                              |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Harmony | Two four-bar progressions (A and B) from a curated set of 12 in major or minor: I–vi–ii–V with maj9/m9/sus9, ii–V–I with a 13th, I–iii–IV–iv with the borrowed minor iv, i–iv–♭VII–♭III, a dorian i–IV vamp, ii°–V♭9–i and more. One chord per bar; milestone releases and the outro end on the tonic.                                                                     |
| Rhodes  | Rootless voicings (no root, no fifth when there are more than four tones) in close or drop-2 position, chosen for the smallest movement from the previous chord, between E3 and D5. Figures by phrase energy: held chords, a push on the "and" of 2, or an anticipation on the "and" of 4 that plays the next chord early. Rolled by 7 ms per note.                        |
| Pad     | The lower three notes of the Rhodes voicing an octave down, so it thickens the harmony without adding intervals.                                                                                                                                                                                                                                                           |
| Bass    | Roots on the kick hits, octaves and fifths for movement, a chromatic or scale approach into the next chord on the "and" of 4, long roots where the drums drop out.                                                                                                                                                                                                         |
| Drums   | Five kick patterns from sparse to busy; snare on 2 and 4, 14 ms late (side-stick in sparse phrases); ghost notes; 8th hats with the beat accented, 16th pickups and an open hat when busy; a 16th shaker at peak energy; ghost-note pickups or a dead stop at phrase ends.                                                                                                 |
| Swing   | Off-beat 8ths late by 10–20 % of a 16th, off-beat 16ths by 1.5× that; shared by every part.                                                                                                                                                                                                                                                                                |
| Piano   | Two motifs (A and B themes), each a two-bar call answered by a resolving response. Strong beats land on chord colour tones, other notes move by step through the chord's own scale. Enters halfway through the first phrase; repeats drop a note now and then; the B theme starts higher. A harmony line joins when new contributors do. Closes with a rolled tonic chord. |

**No rubbing.** Every piano note is checked against the Rhodes and pad notes that overlap it (including an anticipation arriving mid-note) and moved to the nearest clean scale note if it would sit a half step or minor ninth from one. Before this, 10–22 % of melody notes rubbed; now none do across a dozen repos and 16 test seeds.

## Signal chain

| Part              | Source                                                                                                                                    | Processing                                                                                        |
| ----------------- | ----------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| Piano             | **Yamaha upright**, VCSL: 3 velocity layers, up to 3 round robins, sampled every 4th/5th, release samples                                 | High shelf −1.5 dB @ 4.5 kHz, −3 dB @ 900 Hz, low shelf −2 dB @ 200 Hz                            |
| Rhodes            | **Modelled**: 2-op FM tine with velocity-dependent index, 7.1× "ding" partial, felt-hammer thump, two-stage decay, asymmetric tanh pickup | Suitcase tremolo 3.8 Hz / 22 %, LP 5.2 kHz, −3 dB @ 350 Hz                                        |
| Pad               | 3 detuned band-limited saws per note, 1.1 s attack                                                                                        | HP 180 Hz, LP 2.6 kHz, −4 dB @ 850 Hz                                                             |
| Bass              | **Modal string**: 24 harmonics decaying faster as they rise, pluck-position comb, inharmonicity, finger thump                             | LP 1.4 kHz, compressor 4:1                                                                        |
| Kick              | Sine with a pitch drop (49 Hz rest, +95 Hz punch), filtered click                                                                         | Drum bus                                                                                          |
| Snare, side-stick | **VCSL Modern Snare 1**, 5 layers × 2 round robins, down 1.5 semitones                                                                    | Drum bus: LP 12 kHz → **26.04 kHz / 12-bit crunch** → LP 10 kHz → +2 dB @ 220 Hz → tanh 1.8 → 4:1 |
| Hats, shaker      | **VCSL hi-hat** (4 layers × 2), open hat, small shaker                                                                                    | Skip the crunch: HP 400 Hz, LP 14 kHz, tanh 1.3                                                   |

**Mix.** Each part is set to a loudness target (gated RMS: piano −27, Rhodes −27, pad −33, bass −20.5, drums −19 dB), because recordings and models differ wildly in level. Bass, pad and Rhodes duck under each kick. Piano, Rhodes, pad and drums share **one room**: a generated stereo IR (RT60 1.9 s, 22 ms pre-delay, highs decaying first), FFT-convolved, HP 250 Hz, LP 6.5 kHz.

**Arrangement automation** on the music bus, from the sections: the intro opens from a 650 Hz lowpass and rises 7 dB; breakdowns close to 2.2 kHz and sit 4.5 dB back; busy phrases lean in by up to +1.6 dB; the outro closes to 1.4 kHz and falls 9 dB. Vinyl is added after, so the crackle stays while the music fades.

**Master.** HP 30 Hz → tape wow 0.42 Hz / flutter 6.2 Hz → +2 dB @ 120 Hz → −2.5 dB @ 1 kHz → −1.5 dB @ 7 kHz → compressor 1.6:1 at −14 dB (glue, not squash) → tanh 1.25 → **matching EQ** → vinyl hiss (−46 dBFS) and crackle (2.5/s) → loudness to −16 dB gated RMS → look-ahead limiter at −1.5 dBFS → short fades.

## How it is held to a standard

**Reference records.** Four lofi masters, measured whole: "Lazy Daze" (Shane Ivers, CC BY), "Trade Controls" and "Diminishing Returns" (tcarisland, CC BY), "Chill lofi inspired" (omfgdude, CC0). `pnpm reference-curve` downloads and measures them.

|                       | Integrated                       | Loudness range |
| --------------------- | -------------------------------- | -------------- |
| References            | −14.7 to −16.1 LUFS (one at −24) | 7.2 to 9.2 LU  |
| repo-song (quebracho) | −14.1 LUFS                       | 7.3 LU         |

**Tonal balance as a range, not a curve.** The references disagree with each other by up to 13 dB in the top octaves, so pulling a mix toward their average would over-EQ. `LOFI_REFERENCE` stores the min, mean and max per octave band; the matching EQ only corrects bands that fall outside the range (trimmed 25 % toward the mean), measured with the same band filters the reference was. Every repo tested lands inside the range.

**Dynamics.** A 3 s loudness spread of 8–11 dB across repos (the first arrangement-free versions had 2.5); the render test requires the intro and breakdown to sit at least 4 and 3 dB under the busiest phrase.

**What the numbers can't judge.** Meta's audiobox-aesthetics model was tried as an automatic "production quality" score and rejected: it rated the human-made references lower (6.5 and 7.3) than early synthetic renders (about 7.9). It rewards clean, bright audio and penalises the lofi texture itself. Ears decide.

**Measure a change.** `pnpm analyze <repo> [more repos]` prints tonal balance against the range, gated RMS, peak, loudness spread and part levels. Then listen.

## Known limits

- The Rhodes is modelled. No CC0 or CC-BY multisampled Rhodes exists (jRhodes3d's samples are CC BY-NC). Up close it is the part most likely to read as synthetic.
- Four references is still a thin basis for the tonal range; more CC-licensed lofi masters would make it sturdier.
- One genre. The engine would carry jazz, ambient or house with new writing rules and instrument maps.
