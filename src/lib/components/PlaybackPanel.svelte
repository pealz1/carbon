<script lang="ts">
  // Settings → Playback: how Carbon shuffles and queues, the sleep timer, and what it skips.
  import { onMount } from "svelte";
  import { parseVersions } from "$lib/blocklist";
  import { blocklist } from "$lib/blocklist.svelte";
  import Icon from "$lib/components/Icon.svelte";
  import Toggle from "$lib/components/Toggle.svelte";
  import { formatDuration } from "$lib/format";
  import { t } from "$lib/i18n/locale.svelte";
  import type { LikeRule } from "$lib/native";
  import { player } from "$lib/player.svelte";
  import { prefs } from "$lib/preferences.svelte";
  import { services } from "$lib/services.svelte";
  import Group from "$lib/settings/Group.svelte";
  import Row from "$lib/settings/Row.svelte";
  import { SLEEP_PRESETS, sleepTimer } from "$lib/sleep-timer.svelte";

  const LIKE_RULES: { id: LikeRule; label: string }[] = [
    { id: "off", label: "Off" },
    { id: "liked", label: "Liked songs" },
    { id: "unliked", label: "Unliked songs" },
  ];
  const SKIP_AFTER = [0, 2, 3, 5, 10];

  const s = $derived(prefs.value);
  const items = $derived(blocklist.data.items);
  const versions = $derived((blocklist.data.skipVersions ?? []).join(", "));
  const genres = $derived((blocklist.data.skipGenres ?? []).join(", "));
  const likeRule = $derived(blocklist.data.skipByLike ?? "off");
  const skipAfter = $derived(blocklist.data.skipAfter ?? 0);
  const remaining = $derived(sleepTimer.remainingMs);
  const pausingIn = $derived(remaining === null ? null : `${t("Pausing in")} ${formatDuration(remaining)}`);

  onMount(() => void blocklist.load());
</script>

{#snippet blocked()}
  <ul class="items blocked">
    {#each items as item (item.kind + item.uri + item.name)}
      <li>
        <span class="kind" aria-hidden="true"><Icon name={item.kind === "artist" ? "artist" : "note"} size={15} /></span>
        <span class="who">
          <span class="name">{item.name}</span>
          <span class="sub">{item.kind === "artist" ? "Artist" : item.by ? `Song · ${item.by}` : "Song"}</span>
        </span>
        <button class="pill" onclick={() => blocklist.unblock(item)} aria-label="Unblock {item.name}">Unblock</button>
      </li>
    {/each}
  </ul>
{/snippet}

<Group heading="Queue and sleep timer">
  {#if s}
    <Toggle checked={s.smartShuffle} label="Smart shuffle" description="No artist twice in a row." keywords="random order" onchange={(v) => prefs.update({ smartShuffle: v })} />
    <Toggle checked={s.warnQueue} label="Warn before replacing your queue" keywords="confirm ask" onchange={(v) => prefs.update({ warnQueue: v })} />
    {#if services.active.youtube}
      <Toggle
        checked={s.autoplay}
        label="Autoplay on YouTube Music"
        description="Continues with radio when a list ends."
        keywords="radio continue endless"
        onchange={(v) => prefs.update({ autoplay: v })}
      />
    {/if}
  {/if}
  <Row
    label="Sleep timer"
    description="Pauses the music. Nothing fades."
    message={sleepTimer.current?.kind === "song" ? "Pausing at the end of this song" : pausingIn}
    keywords="stop pause later bedtime"
  >
    {#each SLEEP_PRESETS as minutes (minutes)}
      <button class="pill" onclick={() => sleepTimer.start(minutes)}>{minutes === 60 ? "1h" : `${minutes}m`}</button>
    {/each}
    <button class="pill" disabled={!player.track} onclick={() => sleepTimer.endOfSong()}>End of song</button>
    {#if sleepTimer.current}<button class="pill ghost" onclick={() => sleepTimer.cancel()}>Turn off</button>{/if}
  </Row>
</Group>

<Group heading="Skipping">
  <Toggle checked={blocklist.data.skipExplicit} label="Skip explicit songs" keywords="clean profanity" onchange={(v) => blocklist.setSkipExplicit(v)} />
  {#if s && services.active.youtube}
    <Toggle
      checked={s.sponsorBlock}
      label="Skip non-music parts of videos"
      description="Uses SponsorBlock's community markers."
      keywords="sponsorblock intro outro skit credits youtube"
      onchange={(on) => prefs.update({ sponsorBlock: on })}
    />
  {/if}
  <Row as="label" label="Skip versions" description="Matched in brackets or after a dash." keywords="live remix acoustic remaster">
    <input class="input" value={versions} placeholder="live, remix, acoustic" spellcheck="false" onchange={(e) => blocklist.setSkipVersions(parseVersions(e.currentTarget.value))} />
  </Row>
  <Row as="label" label="Skip genres" description="Spotify songs only." keywords="genre style">
    <input class="input" value={genres} placeholder="country, metal" spellcheck="false" onchange={(e) => blocklist.setSkipGenres(parseVersions(e.currentTarget.value))} />
  </Row>
  <Row label="Skip by likes" keywords="liked favourites favorites heart">
    <div class="segmented" role="radiogroup" aria-label="Skipping by likes">
      {#each LIKE_RULES as rule (rule.id)}
        <button role="radio" aria-checked={likeRule === rule.id} class:active={likeRule === rule.id} onclick={() => blocklist.setSkipByLike(rule.id)}>{t(rule.label)}</button>
      {/each}
    </div>
  </Row>
  <Row label="Auto-skip a song after this many skips" description="Counts presses of Next early in a song." keywords="skip count tired">
    <div class="segmented" role="radiogroup" aria-label="Auto-skip a song after this many skips">
      {#each SKIP_AFTER as count (count)}
        <button role="radio" aria-checked={skipAfter === count} class:active={skipAfter === count} onclick={() => blocklist.setSkipAfter(count)}>{count || t("Off")}</button>
      {/each}
    </div>
  </Row>
</Group>

<Group heading="Blocked">
  <Row
    label="Blocked songs and artists"
    value={String(items.length)}
    message={items.length ? undefined : "Block a song or artist from its menu"}
    keywords="blocklist ban hide never play"
    below={items.length ? blocked : undefined}
  />
</Group>

<style>
  .blocked {
    max-height: 320px;
    overflow-y: auto;
  }

  .kind {
    display: grid;
    flex: none;
    place-items: center;
    color: var(--text-muted);
  }

  .who {
    display: flex;
    flex: 1;
    flex-direction: column;
    min-width: 0;
  }

  .name,
  .sub {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }

  .name {
    font-weight: 600;
  }

  .sub {
    color: var(--text-muted);
    font-size: var(--fs-small);
  }
</style>
