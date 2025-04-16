<script lang="ts">
  import BeatDetect from "$lib/BeatDetect";
  import { BeatMapGenerator, type NoteInfo } from "$lib/BeatMapGenerator";
  import { onMount, onDestroy } from "svelte";

  export let audioFile: File;

  type AccuracyRating = "Miss" | "Good" | "Perfect" | "Excellent";

  let beatMap: NoteInfo[] = [];
  let currentTime = 0;
  let score = 0;
  let combo = 0;
  let maxCombo = 0;
  let isPlaying = false;
  let gameStatus: "waiting" | "playing" | "finished" = "waiting";

  let audioContext: AudioContext | null = null;
  let audioSource: AudioBufferSourceNode | null = null;
  let animationFrameId: number | null = null;
  let startTime = 0;

  let lastAccuracy: AccuracyRating | null = null;

  onMount(() => {
    let reader = new FileReader();
    let ctx = new AudioContext();

    const beatDetect = new BeatDetect({
      sampleRate: 44100,
      log: false,
      perf: false,
      round: false,
      float: 4,
      lowPassFreq: 150,
      highPassFreq: 100,
      bpmRange: [90, 180],
      timeSignature: 4,
    });

    const objectURL = window.URL.createObjectURL(audioFile);

    beatDetect
      .getBeatInfo({ url: objectURL })
      .then((beatInfo) => {
        reader.onload = (e) => {
          ctx.decodeAudioData(e.target?.result as ArrayBuffer, (buffer) => {
            const generator = new BeatMapGenerator(beatInfo);
            beatMap = generator.generateBeatMap(buffer.duration);
          });
        };
        reader.readAsArrayBuffer(audioFile);
      })
      .catch((error) => {
        console.error("Beat detection error:", error);
      });
  });

  function startGame() {
    let reader = new FileReader();
    let ctx = new AudioContext();

    if (!audioContext) {
      audioContext = ctx;

      reader.onload = (e) => {
        ctx.decodeAudioData(e.target?.result as ArrayBuffer, (buffer) => {
          const source = ctx.createBufferSource();
          source.buffer = buffer;
          source.connect(ctx.destination);
          source.start();
          audioSource = source;

          isPlaying = true;
          gameStatus = "playing";

          // Start tracking time
          startTime = ctx.currentTime;

          function updateTime() {
            if (isPlaying) {
              const elapsed = ctx.currentTime - startTime;
              currentTime = elapsed;

              // End game if no more notes and song finished
              if (beatMap.length === 0 && elapsed >= buffer.duration) {
                endGame();
              }

              animationFrameId = requestAnimationFrame(updateTime);
            }
          }
          updateTime();
        });
      };
      reader.readAsArrayBuffer(audioFile);
    }
  }

  function endGame() {
    isPlaying = false;
    gameStatus = "finished";

    if (audioSource) {
      audioSource.stop();
    }

    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
  }

  function calculateAccuracy(
    noteTime: number,
    currentTime: number
  ): AccuracyRating {
    const timeDiff = Math.abs(noteTime - currentTime);

    const accuracyWindows = {
      excellent: 0.04,
      perfect: 0.1,
      good: 0.25,
    };

    if (timeDiff <= accuracyWindows.excellent) return "Excellent";
    if (timeDiff <= accuracyWindows.perfect) return "Perfect";
    if (timeDiff <= accuracyWindows.good) return "Good";
    return "Miss";
  }

  function handleKeyPress(event: KeyboardEvent) {
    if (!isPlaying) return;

    const tolerance = 0.25; // 300ms hit window
    let hitNote = false;

    beatMap = beatMap.filter((note) => {
      const isHit =
        Math.abs(note.time - currentTime) <= tolerance &&
        ((event.key === "d" && note.lane === "left") ||
          (event.key === "k" && note.lane === "right"));

      if (isHit) {
        hitNote = true;
        const accuracy = calculateAccuracy(note.time, currentTime);
        lastAccuracy = accuracy;
        const accuracyScores = {
          Excellent: { points: 50, comboMultiplier: 1.5 },
          Perfect: { points: 30, comboMultiplier: 1.2 },
          Good: { points: 10, comboMultiplier: 1 },
          Miss: { points: -20, comboMultiplier: 0 },
        };

        const accuracyData = accuracyScores[accuracy];
        score += accuracyData.points;

        if (accuracyData.comboMultiplier > 0) {
          combo++;
        } else {
          combo = 0;
        }

        maxCombo = Math.max(maxCombo, combo);
      }

      return !isHit;
    });

    if (!hitNote) {
      score = Math.max(0, score - 5);
      combo = 0;
      lastAccuracy = "Miss";
    }
  }

  onMount(() => {
    window.addEventListener("keydown", handleKeyPress);
    return () => {
      window.removeEventListener("keydown", handleKeyPress);
    };
  });

  onDestroy(() => {
    if (audioSource) {
      audioSource.stop();
    }
    if (animationFrameId) {
      cancelAnimationFrame(animationFrameId);
    }
  });
</script>

<div
  class="rhythm-game bg-gray-900 text-white flex flex-col items-center justify-center"
>
  <div
    class="game-container relative w-full max-w-md h-[600px] bg-gray-800 overflow-hidden"
  >
    <div class="lanes flex absolute bottom-20 w-full">
      <div class="left-lane w-1/2 h-5 bg-blue-500 opacity-50 mx-1"></div>
      <div class="right-lane w-1/2 h-5 bg-red-500 opacity-50 mx-1"></div>
    </div>

    {#each beatMap as note, index (index)}
      <div
        class="absolute note w-4 h-4 {note.lane === 'left'
          ? 'bg-blue-500'
          : 'bg-red-500'}"
        style="
      left: {note.lane === 'left' ? '25%' : '75%'};
      bottom: {Math.max(0, (note.time - currentTime + 1) * 100)}px;
      opacity: {Math.max(0, 1 - Math.abs(note.time - currentTime) / 1)};
      transform: translateX(-50%)
    "
      ></div>
    {/each}

    <!-- Score and Combo Display -->
    <div class="absolute top-4 left-4 text-xl">
      Combo: {combo} (Max: {maxCombo})
    </div>
    <div class="score absolute top-4 right-4 text-xl">
      Score: {score}
    </div>

    <!-- Accuracy Display -->
    {#if lastAccuracy}
      <div
        class="absolute top-16 left-1/2 transform -translate-x-1/2
               text-2xl font-bold
               {lastAccuracy === 'Excellent'
          ? 'text-green-400'
          : lastAccuracy === 'Perfect'
            ? 'text-blue-400'
            : lastAccuracy === 'Good'
              ? 'text-yellow-400'
              : 'text-red-400'}"
      >
        {lastAccuracy}
      </div>
    {/if}

    {#if gameStatus === "waiting"}
      <button
        on:click={startGame}
        class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 bg-green-500 px-6 py-3 rounded"
      >
        Start Game
      </button>
    {/if}

    {#if gameStatus === "finished"}
      <div
        class="absolute top-1/2 left-1/2 transform -translate-x-1/2 -translate-y-1/2 text-center"
      >
        <h2 class="text-3xl mb-4">Game Over</h2>
        <p class="text-xl">Final Score: {score}</p>
      </div>
    {/if}
  </div>
</div>
