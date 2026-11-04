export type MusicNote = {
  id: string;
  pitch: number;
  start: number;
  duration: number;
  velocity: number;
};

const MAJOR = [0, 2, 4, 5, 7, 9, 11];
const MINOR = [0, 2, 3, 5, 7, 8, 10];
const CHORD_QUALITIES: Record<string, number[][]> = {
  major: [[0, 2, 4], [0, 2, 4], [0, 2, 4], [0, 2, 4], [0, 2, 4], [0, 2, 4], [0, 2, 4]],
  minor: [[0, 2, 4], [0, 2, 4], [0, 2, 4], [0, 2, 4], [0, 2, 4], [0, 2, 4], [0, 2, 4]],
};

export function keyToPitchClass(key: string): number {
  const names = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
  const normalized = key.replace("Db", "C#").replace("Eb", "D#").replace("Gb", "F#").replace("Ab", "G#").replace("Bb", "A#");
  const value = names.indexOf(normalized);
  return value < 0 ? 0 : value;
}

export function buildChordProgression(
  root: number,
  scale: "major" | "minor",
  degrees: number[],
  makeId: () => string,
): MusicNote[] {
  const intervals = scale === "minor" ? MINOR : MAJOR;
  const notes: MusicNote[] = [];
  degrees.forEach((degree, bar) => {
    const index = ((degree % 7) + 7) % 7;
    const chordRoot = 60 + root + intervals[index];
    const third = intervals[(index + 2) % 7] + (index + 2 >= 7 ? 12 : 0);
    const fifth = intervals[(index + 4) % 7] + (index + 4 >= 7 ? 12 : 0);
    const chordIntervals = CHORD_QUALITIES[scale][index];
    const pitches = [chordRoot, 60 + root + third, 60 + root + fifth];
    pitches.forEach((pitch, voice) => {
      notes.push({
        id: makeId(),
        pitch: Math.max(0, Math.min(127, pitch)),
        start: bar * 16,
        duration: 15,
        velocity: voice === 0 ? 0.78 : 0.68,
      });
    });
    void chordIntervals;
  });
  return notes;
}

export function buildBassline(
  root: number,
  scale: "major" | "minor",
  degrees: number[],
  makeId: () => string,
): MusicNote[] {
  const intervals = scale === "minor" ? MINOR : MAJOR;
  const notes: MusicNote[] = [];
  degrees.forEach((degree, bar) => {
    const index = ((degree % 7) + 7) % 7;
    const tonic = 36 + root + intervals[index];
    [0, 8, 12, 14].forEach((step, beat) => {
      const pitch = tonic + (beat === 2 ? 7 : beat === 3 ? 12 : 0);
      notes.push({
        id: makeId(),
        pitch: Math.max(0, Math.min(127, pitch)),
        start: bar * 16 + step,
        duration: beat === 3 ? 2 : 3,
        velocity: beat === 0 ? 0.9 : 0.7,
      });
    });
  });
  return notes;
}

export function quantizeNotes<T extends MusicNote>(notes: T[], grid: number): T[] {
  const safeGrid = Math.max(1, Math.floor(grid));
  return notes.map((note) => ({
    ...note,
    start: Math.max(0, Math.round(note.start / safeGrid) * safeGrid),
    duration: Math.max(safeGrid, Math.round(note.duration / safeGrid) * safeGrid),
  }));
}
