interface BeatDetectOptions {
  log?: boolean;
  perf?: boolean;
  sampleRate?: number;
  round?: boolean;
  float?: number;
  lowPassFreq?: number;
  highPassFreq?: number;
  bpmRange?: [number, number];
  timeSignature?: number;
}

interface PerformanceMarks {
  m0: number;
  m1: number;
  m2: number;
  m3: number;
}

interface BeatInfoOptions {
  url: string;
  name?: string;
  perf?: PerformanceMarks;
  response?: ArrayBuffer;
}

interface Peak {
  position: number;
  volume: number;
}

interface IntervalGroup {
  tempo: number;
  count: number;
  position: number;
  peaks: Peak[];
}

interface BeatInfo {
  bpm: number;
  offset: number;
  firstBar: number;
  perf?: {
    total: number;
    fetch: number;
    render: number;
    process: number;
  };
}

interface Offsets {
  offset: number;
  firstBar: number;
}

interface TapBpmOptions {
  element: HTMLElement;
  precision?: number;
  callback: (bpm: number | string) => void;
}

class BeatDetect {
  private readonly VERSION: string = "1.0.0";
  private _log!: boolean;
  private _perf!: boolean;
  private _sampleRate!: number;
  private _round!: boolean;
  private _float!: number;
  private _lowPassFreq!: number;
  private _highPassFreq!: number;
  private _bpmRange!: [number, number];
  private _timeSignature!: number;

  private count: number = 0;
  private _ts: {
    current: number;
    previous: number;
    first: number;
  } = {
    current: 0,
    previous: 0,
    first: 0,
  };
  private _tapResetId: number = -1;

  constructor(options: BeatDetectOptions = {}) {
    // Web Audio API type polyfill
    (window as any).AudioContext =
      (window as any).AudioContext || (window as any).webkitAudioContext;
    (window as any).OfflineContext =
      (window as any).OfflineAudioContext ||
      (window as any).webkitOfflineAudioContext;

    // Ensure Web Audio API support
    if (!(window as any).AudioContext || !(window as any).OfflineContext) {
      console.error(
        `BeatDetect.ERROR : Your browser doesn't support the WebAudio API.`
      );
      return;
    }

    this._log = options.log || false;
    this._perf = options.perf || false;
    this._sampleRate = options.sampleRate || 44100;
    this._round = options.round || false;
    this._float = options.float || 8;
    this._lowPassFreq = options.lowPassFreq || 150;
    this._highPassFreq = options.highPassFreq || 100;
    this._bpmRange = options.bpmRange || [90, 180];
    this._timeSignature = options.timeSignature || 4;
  }

  public getBeatInfo(options: BeatInfoOptions): Promise<BeatInfo> {
    options.perf = {
      m0: performance.now(),
      m1: 0,
      m2: 0,
      m3: 0,
    };

    return new Promise((resolve, reject) => {
      this._fetchRawTrack(options)
        .then(this._buildOfflineCtx.bind(this))
        .then(this._processRenderedBuffer.bind(this))
        .then(resolve)
        .catch(reject);
    });
  }

  private _fetchRawTrack(options: BeatInfoOptions): Promise<BeatInfoOptions> {
    return new Promise((resolve, reject) => {
      if (!options) {
        reject(
          "BeatDetect.ERROR : No options object sent to _fetchRawTrack method."
        );
        return;
      }
      if (
        !options.url ||
        !options.perf ||
        typeof options.url !== "string" ||
        typeof options.perf !== "object"
      ) {
        reject(
          "BeatDetect.ERROR : Options object sent to _fetchRawTrack method is invalid."
        );
        return;
      }

      this._logEvent(
        "log",
        `Fetch track${options.name ? " " + options.name : ""}.`
      );
      const request = new XMLHttpRequest();
      request.open("GET", options.url, true);
      request.responseType = "arraybuffer";
      request.onload = () => {
        if (request.status === 404) {
          reject("BeatDetect.ERROR : 404 File not found.");
          return;
        }

        options.perf!.m1 = performance.now();
        resolve(Object.assign(request, options));
      };
      request.onerror = reject;
      request.send();
    });
  }

  private _buildOfflineCtx(
    options: BeatInfoOptions
  ): Promise<BeatInfoOptions & { renderedBuffer: AudioBuffer }> {
    return new Promise((resolve, reject) => {
      if (!options) {
        reject(
          "BeatDetect.ERROR : No options object sent to _buildOfflineCtx method."
        );
        return;
      }
      if (
        !options.response ||
        !options.perf ||
        typeof options.response !== "object" ||
        typeof options.perf !== "object"
      ) {
        reject(
          "BeatDetect.ERROR : Options object sent to _buildOfflineCtx method is invalid."
        );
        return;
      }

      this._logEvent("log", "Offline rendering of the track.");
      const audioCtx = new AudioContext();
      audioCtx.decodeAudioData(
        options.response,
        (buffer) => {
          const offlineCtx = new (window as any).OfflineContext(
            2,
            buffer.duration * this._sampleRate,
            this._sampleRate
          );

          const source = offlineCtx.createBufferSource();
          source.buffer = buffer;

          const lowpass = offlineCtx.createBiquadFilter();
          lowpass.type = "lowpass";
          lowpass.frequency.value = this._lowPassFreq;
          lowpass.Q.value = 1;

          const highpass = offlineCtx.createBiquadFilter();
          highpass.type = "highpass";
          highpass.frequency.value = this._highPassFreq;
          highpass.Q.value = 1;

          source.connect(lowpass);
          lowpass.connect(highpass);
          highpass.connect(offlineCtx.destination);

          source.start(0);
          offlineCtx.startRendering();

          offlineCtx.oncomplete = (result: { renderedBuffer: AudioBuffer }) => {
            options.perf!.m2 = performance.now();
            resolve(Object.assign(result, options));
          };
          offlineCtx.onerror = reject;
        },
        (err) => {
          reject(`BeatDetect.ERROR : ${err}`);
        }
      );
    });
  }

  private _processRenderedBuffer(
    options: BeatInfoOptions & { renderedBuffer: AudioBuffer }
  ): Promise<BeatInfo> {
    return new Promise((resolve, reject) => {
      if (!options) {
        reject(
          "BeatDetect.ERROR : No options object sent to _processRenderedBuffer method."
        );
        return;
      }
      if (
        !options.renderedBuffer ||
        !options.perf ||
        typeof options.renderedBuffer !== "object" ||
        typeof options.perf !== "object"
      ) {
        reject(
          "BeatDetect.ERROR : Options object sent to _processRenderedBuffer method is invalid."
        );
        return;
      }

      this._logEvent("log", "Collect beat info.");
      const dataL = options.renderedBuffer.getChannelData(0);
      const dataR = options.renderedBuffer.getChannelData(1);
      const peaks = this._getPeaks([dataL, dataR]);
      const groups = this._getIntervals(peaks);

      const top = groups
        .sort((intA, intB) => intB.count - intA.count)
        .splice(0, 5);

      const offsets = this._getOffsets(dataL, top[0].tempo);
      options.perf!.m3 = performance.now();
      this._logEvent("log", "Analysis done.");

      const result: BeatInfo = {
        bpm: top[0].tempo,
        offset: this._floatRound(offsets.offset, this._float),
        firstBar: this._floatRound(offsets.firstBar, this._float),
      };

      if (this._perf) {
        result.perf = this._getPerfDuration(options.perf!);
      }

      resolve(result);
    });
  }

  private _getPerfDuration(perf: PerformanceMarks) {
    return {
      total: (perf.m3 - perf.m0) / 1000,
      fetch: (perf.m1 - perf.m0) / 1000,
      render: (perf.m2 - perf.m1) / 1000,
      process: (perf.m3 - perf.m2) / 1000,
    };
  }

  private _getPeaks(data: Float32Array[]): Peak[] {
    const partSize = this._sampleRate / 2;
    const parts = data[0].length / partSize;
    let peaks: Peak[] = [];

    for (let i = 0; i < parts; ++i) {
      let max: Peak = { position: 0, volume: 0 };
      for (let j = i * partSize; j < (i + 1) * partSize; ++j) {
        const volume = Math.max(Math.abs(data[0][j]), Math.abs(data[1][j]));
        if (!max || volume > max.volume) {
          max = { position: j, volume: volume };
        }
      }
      peaks.push(max);
    }

    peaks.sort((a, b) => b.volume - a.volume);
    peaks = peaks.splice(0, peaks.length * 0.5);
    peaks.sort((a, b) => a.position - b.position);

    return peaks;
  }

  private _getIntervals(peaks: Peak[]): IntervalGroup[] {
    const groups: IntervalGroup[] = [];

    peaks.forEach((peak, index) => {
      for (let i = 1; index + i < peaks.length && i < 10; ++i) {
        const group: IntervalGroup = {
          tempo:
            (60 * this._sampleRate) /
            (peaks[index + i].position - peak.position),
          count: 1,
          position: peak.position,
          peaks: [],
        };

        while (group.tempo <= this._bpmRange[0]) group.tempo *= 2;
        while (group.tempo > this._bpmRange[1]) group.tempo /= 2;

        group.tempo = this._round
          ? Math.round(group.tempo)
          : this._floatRound(group.tempo, this._float);

        const exists = groups.some((interval) => {
          if (interval.tempo === group.tempo) {
            interval.peaks.push(peak);
            ++interval.count;
            return true;
          }
          return false;
        });

        if (!exists) groups.push(group);
      }
    });

    return groups;
  }

  private _getOffsets(data: Float32Array, bpm: number): Offsets {
    const partSize = this._sampleRate / 2;
    const parts = data.length / partSize;
    const peaks: Peak[] = [];

    for (let i = 0; i < parts; ++i) {
      let max: Peak = { position: 0, volume: 0 };
      for (let j = i * partSize; j < (i + 1) * partSize; ++j) {
        const volume = data[j];
        if (!max || volume > max.volume) {
          max = {
            position: j - Math.round((60 / bpm) * 0.05 * this._sampleRate),
            volume: volume,
          };
        }
      }
      peaks.push(max);
    }

    const unsortedPeaks = [...peaks];
    peaks.sort((a, b) => b.volume - a.volume);

    const refOffset = this._getLowestTimeOffset(peaks[0].position, bpm);
    let mean = 0;
    let divider = 0;

    for (let i = 0; i < peaks.length; ++i) {
      const offset = this._getLowestTimeOffset(peaks[i].position, bpm);
      if (offset - refOffset < 0.05 || refOffset - offset > -0.05) {
        mean += offset;
        ++divider;
      }
    }

    let i = 0;
    while (unsortedPeaks[i].volume < 0.02) ++i;

    let firstBar = unsortedPeaks[i].position / this._sampleRate;

    if (firstBar > mean / divider && firstBar < 60 / bpm) {
      firstBar = mean / divider;
    }

    return {
      offset: mean / divider,
      firstBar: firstBar,
    };
  }

  private _getLowestTimeOffset(position: number, bpm: number): number {
    const bpmTime = 60 / bpm;
    const firstBeatTime = position / this._sampleRate;
    let offset = firstBeatTime;

    while (offset >= bpmTime) {
      offset -= bpmTime * this._timeSignature;
    }

    if (offset < 0) {
      while (offset < 0) {
        offset += bpmTime;
      }
    }

    return offset;
  }

  public tapBpm(options: TapBpmOptions): void {
    options.element.addEventListener(
      "click",
      this._tapBpm.bind(this, options),
      false
    );
  }

  private _tapBpm(options: TapBpmOptions): void {
    window.clearTimeout(this._tapResetId);

    this._ts.current = Date.now();
    if (this._ts.first === 0) {
      this._ts.first = this._ts.current;
    }

    if (this._ts.previous !== 0) {
      let bpm = (60000 * this.count) / (this._ts.current - this._ts.first);
      if (options.precision !== undefined) {
        bpm = this._floatRound(bpm, options.precision);
      }
      options.callback(bpm);
    }

    this._ts.previous = this._ts.current;
    ++this.count;

    this._tapResetId = window.setTimeout(() => {
      this.count = 0;
      this._ts.current = 0;
      this._ts.previous = 0;
      this._ts.first = 0;
      options.callback("--");
    }, 5000);
  }

  private _logEvent(level: keyof Console, string: string): void {
    if (this._log === true) {
      // console[level](`BeatDetect : ${string}`);
    }
  }

  private _floatRound(value: number, precision: number = 0): number {
    const multiplier = Math.pow(10, precision);
    return Math.round(value * multiplier) / multiplier;
  }

  // Setters
  set sampleRate(sampleRate: number) {
    this._sampleRate = sampleRate;
  }

  set log(log: boolean) {
    this._log = log;
  }

  set perf(perf: boolean) {
    this._perf = perf;
  }

  set round(round: boolean) {
    this._round = round;
  }

  set float(float: number) {
    this._float = float;
  }

  set lowPassFreq(lowPassFreq: number) {
    this._lowPassFreq = lowPassFreq;
  }

  set highPassFreq(highPassFreq: number) {
    this._highPassFreq = highPassFreq;
  }
}

export default BeatDetect;
