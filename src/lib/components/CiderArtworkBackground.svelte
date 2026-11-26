<script lang="ts">
  import { onMount } from "svelte";

  let { image, paused, bpm }: { image: string; paused: boolean; bpm: number | null } = $props();
  let canvas: HTMLCanvasElement;
  let renderer = $state<Worker>();
  let ready = $state(false);
  let visible = $state(false);
  let requestId = 0;
  let painted = false;

  onMount(() => {
    if (!("gpu" in navigator) || typeof canvas.transferControlToOffscreen !== "function") return;
    let worker: Worker;
    try {
      worker = new Worker("/cider-ui/artwork-background.worker.js", { type: "module" });
    } catch {
      return;
    }
    const stop = () => {
      worker.terminate();
      renderer = undefined;
      ready = false;
      visible = false;
    };

    worker.addEventListener("error", stop);
    worker.addEventListener("message", ({ data }) => {
      if (data.type === "initialized") {
        if (data.success) ready = true;
        else stop();
      } else if (data.type === "firstFrame") {
        painted = true;
        visible = true;
      } else if (data.type === "error" && data.requestId === requestId) {
        visible = false;
      }
    });
    try {
      const surface = canvas.transferControlToOffscreen();
      renderer = worker;
      worker.postMessage({ type: "init", canvas: surface }, [surface]);
    } catch {
      stop();
    }
    return stop;
  });

  $effect(() => {
    if (!ready || !renderer) return;
    renderer.postMessage({ type: "setOptions", options: {
      resolution: 512, artworkSize: 380, imgScale: 2, maxFramerate: 40, bpm: bpm ?? 60,
      transitionDuration: 500, backgroundFramerate: 10, hdrEnabled: false,
    } });
  });

  $effect(() => {
    if (ready && renderer) renderer.postMessage({ type: "setPaused", paused });
  });

  $effect(() => {
    const worker = renderer;
    if (!ready || !worker) return;
    const id = ++requestId;
    const artwork = new Image();
    artwork.crossOrigin = "anonymous";
    artwork.src = image;

    void artwork.decode().then(async () => {
      const bitmap = await createImageBitmap(artwork, { resizeWidth: 512, resizeHeight: 512, resizeQuality: "high" });
      if (id !== requestId) {
        bitmap.close();
        return;
      }
      worker.postMessage({ type: "setImage", bitmap, requestId: id }, [bitmap]);
      visible = painted;
    }).catch(() => {
      if (id === requestId) visible = false;
    });
    return () => { requestId++; };
  });
</script>

<canvas bind:this={canvas} width="512" height="512" class:visible aria-hidden="true"></canvas>

<style>
  canvas {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    opacity: 0;
    transition: opacity 500ms ease;
    pointer-events: none;
  }

  canvas.visible { opacity: 1; }
</style>
