export interface NoteInfo {
  time: number; // Time in seconds when the note should be hit
  lane: "left" | "right"; // Which lane the note appears in
  type: "tap" | "hold"; // Type of note
}

export class BeatMapGenerator {
  private bpm: number;
  private offset: number;
  private firstBar: number;

  constructor(beatInfo: { bpm: number; offset: number; firstBar: number }) {
    this.bpm = beatInfo.bpm;
    this.offset = beatInfo.offset;
    this.firstBar = beatInfo.firstBar;
  }

  generateBeatMap(duration: number): NoteInfo[] {
    const notes: NoteInfo[] = [];
    const beatInterval = 60 / this.bpm;

    let currentTime = this.firstBar + this.offset;

    while (currentTime < duration) {
      const noteGenerationProbability =
        this.calculateNoteProbability(currentTime);

      if (Math.random() < noteGenerationProbability) {
        notes.push({
          time: currentTime,
          lane: Math.random() > 0.5 ? "left" : "right",
          type: Math.random() > 0.8 ? "hold" : "tap",
        });
      }

      const subdivisions = [0.25, 0.5, 1];
      const subdivision =
        subdivisions[Math.floor(Math.random() * subdivisions.length)];
      currentTime += beatInterval * subdivision;
    }

    return notes.sort((a, b) => a.time - b.time);
  }

  private calculateNoteProbability(time: number): number {
    const baseProbability = 0.6;

    const rhythmicVariation = Math.sin((time * Math.PI) / 2) * 0.2;

    return Math.min(1, Math.max(0.2, baseProbability + rhythmicVariation));
  }
}
