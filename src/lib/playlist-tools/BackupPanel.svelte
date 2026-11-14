<script lang="ts">
  // Settings → Back up your library: everything in one JSON file, and adding back from such a
  // file whatever is missing. A restore shows what it would add and waits for a yes; it never
  // removes or replaces anything.
  import { onDestroy } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { describeError } from "$lib/errors";
  import { organizer } from "$lib/organizer.svelte";
  import { services } from "$lib/services.svelte";
  import { collectBackup, readCurrent, runRestore, type Report } from "./backup";
  import { mergeOrganizer, parseBackup, planCounts, planRestore, planSize, type Backup, type Category, type RestorePlan } from "./backup-format";
  import { datedName } from "./combine";
  import { Stopped } from "./copy";
  import { backupOpen, backupSave } from "./files";
  import ProgressBar from "./ProgressBar.svelte";

  const LABELS: Record<Category, string> = {
    liked: "Liked songs",
    albums: "Saved albums",
    artists: "Followed artists",
    playlists: "Playlists",
    carbon: "Carbon playlists",
    smart: "Smart playlists",
  };
  const CATEGORIES = Object.keys(LABELS) as Category[];
  const SPOTIFY_PARTS = { liked: [], albums: [], artists: [], playlists: [] } satisfies Partial<Backup>;

  interface Pending {
    backup: Backup;
    plan: RestorePlan;
    /** Folders, tags and pins the backup has and the library lacks. */
    organizing: number;
  }

  let progress = $state<{ label: string; done?: number; total?: number | null } | null>(null);
  let pending = $state.raw<Pending | null>(null);
  let outcome = $state.raw<(Report & { present: RestorePlan["present"] }) | null>(null);
  let notice = $state<string | null>(null);
  let error = $state<string | null>(null);
  let controller: AbortController | null = null;

  const spotify = $derived(services.active.spotify);
  const adds = $derived(pending ? planCounts(pending.plan) : null);
  const toAdd = $derived(pending ? planSize(pending.plan) + pending.organizing : 0);
  const step = (label: string, done?: number, total?: number | null) => (progress = { label, done, total });
  const count = (n: number) => n.toLocaleString();

  onDestroy(() => controller?.abort());

  /** Runs one job with progress and Stop. Stopping while reading isn't an error: nothing was changed yet. */
  async function work(job: (signal: AbortSignal) => Promise<void>, failure: string) {
    controller = new AbortController();
    error = notice = null;
    outcome = null;
    progress = { label: "Starting…" };
    try {
      await job(controller.signal);
    } catch (e) {
      if (e instanceof Stopped) return void (notice = "Stopped. Nothing was changed.");
      console.error("[backup]", e);
      error = `${failure} ${describeError(e)}`;
    } finally {
      progress = null;
    }
  }

  const describe = (b: Backup) =>
    `${count(b.liked.length)} liked songs, ${count(b.albums.length)} albums, ${count(b.artists.length)} artists, ${count(b.playlists.length)} playlists and ${count(b.carbonPlaylists.length)} Carbon playlists`;

  const backUp = () =>
    work(async (signal) => {
      const backup = await collectBackup(spotify, step, signal);
      step("Saving the file…");
      const saved = await backupSave(datedName("Carbon library"), JSON.stringify(backup, null, 1));
      if (saved) notice = `Saved ${saved}: ${describe(backup)}, with your smart playlists, folders, tags and pins.`;
    }, "Couldn't make the backup.");

  const choose = () =>
    work(async (signal) => {
      pending = null;
      step("Waiting for you to pick a backup…");
      const text = await backupOpen();
      if (!text) return;
      const read = parseBackup(text);
      // Without Spotify connected only the Carbon side can be compared and restored.
      const backup = spotify ? read : { ...read, ...SPOTIFY_PARTS };
      const plan = planRestore(backup, await readCurrent(spotify, step, signal));
      pending = { backup, plan, organizing: mergeOrganizer(organizer.data, backup.organizer).added };
    }, "Couldn't read that backup.");

  function restore() {
    const job = pending;
    if (!job) return;
    pending = null;
    return work(async (signal) => {
      outcome = { ...(await runRestore(job.backup, job.plan, step, signal)), present: job.plan.present };
    }, "The restore didn't finish.");
  }
</script>

<section class="panel plate" id="backup">
  <h2>Back up your library</h2>
  <p class="muted">
    Saves one file with your Liked Songs, saved albums, followed artists, every playlist you own or follow, your Carbon playlists, smart playlists and
    your folders, tags and pins. It holds names and links, never audio.
  </p>
  {#if !spotify}<p class="fine">Spotify isn't connected, so only your Carbon playlists, smart playlists, folders, tags and pins are backed up or restored.</p>{/if}

  {#if progress}
    <ProgressBar {...progress} />
    <div class="actions"><button class="pill" onclick={() => controller?.abort()}>Stop</button></div>
  {:else if pending && adds}
    <div class="review" role="group" aria-label="What the restore will add">
      <p>
        Backup from {new Date(pending.backup.createdAt).toLocaleDateString(undefined, { dateStyle: "long" })}.
        {toAdd ? "Restoring adds what's missing and leaves everything else as it is. Nothing is removed." : "Everything in it is already in your library."}
      </p>
      <table>
        <thead>
          <tr><th scope="col">In the backup</th><th scope="col">To add</th><th scope="col">Already there</th></tr>
        </thead>
        <tbody>
          {#each CATEGORIES as c (c)}
            <tr><th scope="row">{LABELS[c]}</th><td class="tabular">{count(adds[c])}</td><td class="tabular">{count(pending.plan.present[c])}</td></tr>
          {/each}
          <tr><th scope="row">Folders, tags and pins</th><td class="tabular">{count(pending.organizing)}</td><td></td></tr>
        </tbody>
      </table>
      <p class="fine">
        Your own playlists come back as new playlists with their songs in order; playlists you followed are followed again. Local files inside Spotify
        playlists can't be put back by apps like Carbon.
      </p>
      <div class="actions">
        <button class="pill accent" onclick={restore} disabled={!toAdd}>
          <Icon name="restore" size={16} />Restore {count(toAdd)} {toAdd === 1 ? "item" : "items"}
        </button>
        <button class="pill" onclick={() => (pending = null)}>Cancel</button>
      </div>
    </div>
  {:else}
    <div class="actions">
      <button class="pill accent" onclick={backUp}><Icon name="export" size={16} />Back up…</button>
      <button class="pill" onclick={choose}><Icon name="import" size={16} />Restore from a backup…</button>
    </div>
  {/if}

  {#if outcome}
    <div class="review" role="status">
      <p>{outcome.stopped ? "Stopped. What was added before that stays." : "Restore finished."}</p>
      <table>
        <thead>
          <tr><th scope="col">Restored</th><th scope="col">Added</th><th scope="col">Already there</th><th scope="col">Failed</th></tr>
        </thead>
        <tbody>
          {#each CATEGORIES as c (c)}
            <tr>
              <th scope="row">{LABELS[c]}</th>
              <td class="tabular">{count(outcome.done[c].added)}</td>
              <td class="tabular">{count(outcome.present[c])}</td>
              <td class="tabular" class:failed={outcome.done[c].failed > 0}>{count(outcome.done[c].failed)}</td>
            </tr>
          {/each}
          <tr>
            <th scope="row">Folders, tags and pins</th>
            <td class="tabular">{count(outcome.done.organizer.added)}</td>
            <td></td>
            <td class="tabular" class:failed={outcome.done.organizer.failed > 0}>{count(outcome.done.organizer.failed)}</td>
          </tr>
        </tbody>
      </table>
      {#if CATEGORIES.some((c) => outcome!.done[c].failed > 0)}
        <p class="warn">Some things couldn't be added. Restore from the same backup again to retry just those; the details are in the log.</p>
      {/if}
    </div>
  {/if}
  {#if notice}<p class="fine" role="status">{notice}</p>{/if}
  {#if error}<p class="warn" role="alert">{error}</p>{/if}
</section>

<style>
  .panel {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
    padding: var(--sp-5);
  }

  h2 {
    margin-bottom: var(--sp-1);
    font-size: var(--fs-section);
    font-weight: 700;
  }

  p {
    margin: 0;
    max-width: 72ch;
    line-height: 1.5;
  }

  .muted,
  .fine {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }

  .fine {
    color: var(--text-faint);
  }

  .warn {
    color: var(--warning);
    font-size: var(--fs-small);
  }

  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  .review {
    display: flex;
    flex-direction: column;
    gap: var(--sp-3);
  }

  table {
    width: 100%;
    max-width: 560px;
    border-collapse: collapse;
    font-size: var(--fs-small);
  }

  th,
  td {
    padding: var(--sp-2);
    text-align: right;
  }

  th:first-child {
    text-align: left;
  }

  thead th {
    color: var(--text-faint);
    font-weight: 600;
  }

  tbody th {
    font-weight: 600;
  }

  tbody tr:nth-child(odd) {
    background: var(--row-stripe);
  }

  .failed {
    color: var(--warning);
    font-weight: 600;
  }
</style>
