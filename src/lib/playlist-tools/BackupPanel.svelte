<script lang="ts">
  // Settings → Updates and data: the whole library in one JSON file, and adding back from such a
  // file whatever is missing. A restore shows what it would add and waits for a yes; it never
  // removes or replaces anything.
  import { onDestroy } from "svelte";
  import Icon from "$lib/components/Icon.svelte";
  import { describeError } from "$lib/errors";
  import { t } from "$lib/i18n/locale.svelte";
  import { organizer } from "$lib/organizer.svelte";
  import { services } from "$lib/services.svelte";
  import Group from "$lib/settings/Group.svelte";
  import Row from "$lib/settings/Row.svelte";
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
    progress = { label: t("Starting…") };
    try {
      await job(controller.signal);
    } catch (e) {
      if (e instanceof Stopped) return void (notice = t("Stopped. Nothing was changed."));
      console.error("[backup]", e);
      error = `${t(failure)} ${describeError(e)}`;
    } finally {
      progress = null;
    }
  }

  const backUp = () =>
    work(async (signal) => {
      const backup = await collectBackup(spotify, step, signal);
      step(t("Saving the file…"));
      const saved = await backupSave(datedName("Carbon library"), JSON.stringify(backup, null, 1));
      if (saved) notice = `${t("Saved")} ${saved}`;
    }, "Couldn't make the backup.");

  const choose = () =>
    work(async (signal) => {
      pending = null;
      step(t("Waiting for you to pick a backup…"));
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

<Group heading="Library backup" id="backup" message={spotify ? undefined : "Spotify is off: Carbon playlists and folders only"}>
  {#if progress}
    <div class="block">
      <ProgressBar {...progress} />
      <button class="pill" onclick={() => controller?.abort()}>Stop</button>
    </div>
  {:else if pending && adds}
    <div class="block" role="group" aria-label="What the restore will add">
      <p>
        Backup from {new Date(pending.backup.createdAt).toLocaleDateString(undefined, { dateStyle: "long" })}.
        {toAdd ? "Restoring adds what's missing. Nothing is removed." : "Everything in it is already in your library."}
      </p>
      <table>
        <thead>
          <tr><th scope="col">In the backup</th><th scope="col">To add</th><th scope="col">Already there</th></tr>
        </thead>
        <tbody>
          {#each CATEGORIES as c (c)}
            <tr><th scope="row">{t(LABELS[c])}</th><td class="tabular">{count(adds[c])}</td><td class="tabular">{count(pending.plan.present[c])}</td></tr>
          {/each}
          <tr><th scope="row">Folders, tags and pins</th><td class="tabular">{count(pending.organizing)}</td><td></td></tr>
        </tbody>
      </table>
      <p class="fine">Local files in Spotify playlists can't be restored.</p>
      <div class="actions">
        <button class="pill accent" onclick={restore} disabled={!toAdd}>
          <Icon name="restore" size={16} />Restore {count(toAdd)} {toAdd === 1 ? "item" : "items"}
        </button>
        <button class="pill" onclick={() => (pending = null)}>Cancel</button>
      </div>
    </div>
  {:else}
    <Row label="Back up your library" description="Names and links, never audio." keywords="export save file json playlists liked">
      <button class="pill accent" onclick={backUp}><Icon name="export" size={16} />Back up…</button>
    </Row>
    <Row label="Restore from a backup" description="Adds what's missing. Removes nothing." keywords="import file json">
      <button class="pill" onclick={choose}><Icon name="import" size={16} />Choose a backup…</button>
    </Row>
  {/if}

  {#if outcome}
    <div class="block" role="status">
      <p>{outcome.stopped ? "Stopped. What was added before that stays." : "Restore finished."}</p>
      <table>
        <thead>
          <tr><th scope="col">Restored</th><th scope="col">Added</th><th scope="col">Already there</th><th scope="col">Failed</th></tr>
        </thead>
        <tbody>
          {#each CATEGORIES as c (c)}
            <tr>
              <th scope="row">{t(LABELS[c])}</th>
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
        <p class="warn">Some items failed. Restore again to retry them.</p>
      {/if}
    </div>
  {/if}
  {#if notice}<p class="note" role="status">{notice}</p>{/if}
  {#if error}<p class="note warn" role="alert">{error}</p>{/if}
</Group>

<style>
  .block {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--sp-3);
    padding: var(--sp-3) 0;
  }

  .block > :global(.progress) {
    align-self: stretch;
  }

  p {
    margin: 0;
    max-width: 72ch;
    line-height: 1.5;
  }

  .fine {
    color: var(--text-faint);
    font-size: var(--fs-small);
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
