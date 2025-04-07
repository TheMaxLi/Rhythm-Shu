<script lang="ts">
  import RhythmGame from "../components/RhythmGame.svelte";

  let audioFile: File | null = null;

  function handleFileUpload(event: Event) {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    if (file && file.type.startsWith("audio/")) {
      audioFile = file;
    }
    console.log(file);
  }
</script>

<div class="App bg-gray-900 w-[350px] h-[450px]">
  {#if !audioFile}
    <div class="flex flex-col items-center w-[350px] h-[450px]">
      <input
        type="file"
        accept="audio/*"
        on:change={handleFileUpload}
        class="text-white"
      />
      <p class="text-white mt-4">
        Upload an audio file to start the rhythm game
      </p>
    </div>
  {:else}
    <RhythmGame {audioFile} />
  {/if}
</div>
