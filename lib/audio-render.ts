export type RenderTrack = {
  name: string;
  instrument: string;
  muted: boolean;
  solo: boolean;
  volume: number;
  pan: number;
  midi_data: Array<{ pitch: number; start: number; duration: number; velocity: number }>;
};

function writeAscii(view: DataView, offset: number, value: string) {
  for (let i = 0; i < value.length; i++) view.setUint8(offset + i, value.charCodeAt(i));
}

function encodeWav(left: Float32Array, right: Float32Array, sampleRate: number): Blob {
  const frames = left.length;
  const buffer = new ArrayBuffer(44 + frames * 4);
  const view = new DataView(buffer);
  writeAscii(view, 0, "RIFF");
  view.setUint32(4, 36 + frames * 4, true);
  writeAscii(view, 8, "WAVE");
  writeAscii(view, 12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 2, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 4, true);
  view.setUint16(32, 4, true);
  view.setUint16(34, 16, true);
  writeAscii(view, 36, "data");
  view.setUint32(40, frames * 4, true);
  let offset = 44;
  for (let i = 0; i < frames; i++) {
    const l = Math.max(-1, Math.min(1, left[i]));
    const r = Math.max(-1, Math.min(1, right[i]));
    view.setInt16(offset, l < 0 ? l * 32768 : l * 32767, true);
    view.setInt16(offset + 2, r < 0 ? r * 32768 : r * 32767, true);
    offset += 4;
  }
  return new Blob([buffer], { type: "audio/wav" });
}

/** Offline-render editable MIDI tracks to a downloadable stereo PCM WAV. */
export async function renderMidiToWav(tracks: RenderTrack[], bpm: number): Promise<Blob> {
  const audible = tracks.filter((track) => !track.muted && track.midi_data.length > 0);
  if (!audible.length) throw new Error("Add MIDI notes before rendering audio.");
  const soloed = audible.some((track) => track.solo);
  const selected = soloed ? audible.filter((track) => track.solo) : audible;
  const secondsPerStep = 60 / Math.max(30, Math.min(300, bpm)) / 4;
  const endSeconds = Math.max(
    1,
    ...selected.flatMap((track) =>
      track.midi_data.map((note) => (note.start + note.duration) * secondsPerStep + 0.6),
    ),
  );
  const sampleRate = 44100;
  const context = new OfflineAudioContext(2, Math.ceil(endSeconds * sampleRate), sampleRate);
  const master = context.createGain();
  master.gain.value = 0.72;
  master.connect(context.destination);

  for (const track of selected) {
    for (const note of track.midi_data) {
      const start = Math.max(0, note.start * secondsPerStep);
      const duration = Math.max(0.04, note.duration * secondsPerStep);
      const velocity = Math.max(0.02, Math.min(1, note.velocity));
      const frequency = 440 * Math.pow(2, (note.pitch - 69) / 12);
      const osc = context.createOscillator();
      const gain = context.createGain();
      const pan = context.createStereoPanner();
      const level = Math.max(0, Math.min(2, track.volume));
      pan.pan.value = Math.max(-1, Math.min(1, track.pan));
      osc.type = track.instrument === "bass" ? "triangle" :
        track.instrument === "synth" || track.instrument === "guitar" ? "sawtooth" : "sine";
      osc.frequency.setValueAtTime(frequency, start);
      gain.gain.setValueAtTime(0.0001, start);
      gain.gain.linearRampToValueAtTime(Math.min(0.8, velocity * level * 0.22), start + 0.012);
      gain.gain.setTargetAtTime(0.0001, start + Math.max(0.02, duration - 0.04), 0.035);
      osc.connect(gain);
      gain.connect(pan);
      pan.connect(master);
      osc.start(start);
      osc.stop(start + duration + 0.18);
    }
  }
  const rendered = await context.startRendering();
  return encodeWav(rendered.getChannelData(0), rendered.getChannelData(1), sampleRate);
}
