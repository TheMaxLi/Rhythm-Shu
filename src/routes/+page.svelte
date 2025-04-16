<script lang="ts">
  import RhythmGame from "../components/RhythmGame.svelte";

  let audioFile: File | null = $state(null);
  let audioContext: HTMLInputElement | null = $state(null);

  function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file && file.type.startsWith("audio/")) {
      audioFile = file;
    }
    console.log(file);
  }
</script>

<div class="App bg-gray-900 w-[350px] h-[600px]">
  {#if !audioFile}
    <div class="flex flex-col items-center w-[350px] h-[600px] justify-center">
      <input
        bind:this={audioContext}
        type="file"
        accept="audio/*"
        onchange={handleFileUpload}
        class="hidden"
      />
      <button
        class="border cursor-pointer text-white p-2"
        onclick={() => audioContext?.click()}
      >
        Upload file
      </button>
      <p class="text-white mt-4">
        Upload an audio file to start the rhythm game
      </p>
    </div>
  {:else}
    <RhythmGame {audioFile} />
  {/if}
</div>
