<script lang="ts">
  import { onMount } from "svelte";
  import { describeError } from "$lib/errors";
  import { serverSession } from "$lib/servers/session.svelte";
  import { SERVER_NAMES, type ServerKind } from "$lib/servers/uri";

  // Settings → Your music servers: sign in to a Navidrome (or any Subsonic) server and a Jellyfin
  // server. The password is used once to sign in and never kept.
  const KINDS: { kind: ServerKind; title: string; hint: string; placeholder: string; token?: boolean }[] = [
    { kind: "subsonic", title: "Navidrome or Subsonic", hint: "Navidrome, Gonic, Airsonic, Ampache and other Subsonic-compatible servers.", placeholder: "http://192.168.1.10:4533" },
    { kind: "jellyfin", title: "Jellyfin", hint: "Jellyfin, and Emby servers that answer the same way.", placeholder: "http://192.168.1.10:8096" },
    {
      kind: "plex",
      title: "Plex",
      hint: "Your Plex Media Server's own address, and a token: in Plex, open any item's “Get Info”, choose “View XML” and copy what follows X-Plex-Token= in the address bar.",
      placeholder: "http://192.168.1.10:32400",
      token: true,
    },
  ];
  type Form = { url: string; username: string; password: string; busy: boolean; error: string | null };
  const blank = (): Form => ({ url: "", username: "", password: "", busy: false, error: null });
  let forms = $state<Record<ServerKind, Form>>({ subsonic: blank(), jellyfin: blank(), plex: blank() });

  onMount(() => void serverSession.load());

  async function connect(kind: ServerKind, event: SubmitEvent) {
    event.preventDefault();
    const form = forms[kind];
    form.busy = true;
    form.error = null;
    try {
      await serverSession.connect(kind, form.url, form.username, form.password);
      forms[kind] = blank();
    } catch (e) {
      console.error("[servers] connect", e);
      form.error = describeError(e);
      form.busy = false;
    }
  }

  const disconnect = (kind: ServerKind) => serverSession.disconnect(kind).catch((e) => (forms[kind].error = describeError(e)));
</script>

<section class="panel plate" id="servers">
  <h2>Your music servers</h2>
  <p class="muted">Play the music on a server you run. Carbon signs in once and keeps the session in Windows Credential Manager; your password isn't stored.</p>
  {#each KINDS as { kind, title, hint, placeholder, token } (kind)}
    {@const info = serverSession.of(kind)}
    {@const form = forms[kind]}
    <div class="server">
      <div class="head">
        <h3>{title}</h3>
        {#if info}<span class="state">Connected</span>{/if}
      </div>
      {#if info}
        <p class="muted">{token ? info.url : `${info.username} on ${info.url}`}</p>
        <div class="actions">
          <a class="pill accent" href="/server/{kind}">Open {SERVER_NAMES[kind]}</a>
          <button class="pill" onclick={() => disconnect(kind)}>Disconnect</button>
        </div>
      {:else}
        <p class="muted">{hint}</p>
        <form onsubmit={(e) => connect(kind, e)}>
          <input class="input address" bind:value={form.url} {placeholder} aria-label="{title} address" required spellcheck="false" autocomplete="off" />
          {#if !token}
            <input class="input" bind:value={form.username} placeholder="User name" aria-label="{title} user name" required spellcheck="false" autocomplete="off" />
          {/if}
          <input class="input" type="password" bind:value={form.password} placeholder={token ? "X-Plex-Token" : "Password"} aria-label="{title} {token ? 'token' : 'password'}" required={token} autocomplete="off" />
          <button class="pill accent" disabled={form.busy}>{form.busy ? "Connecting…" : "Connect"}</button>
        </form>
      {/if}
      {#if form.error}<p class="warn" role="alert">{form.error}</p>{/if}
    </div>
  {/each}
  {#if serverSession.error}<p class="warn" role="alert">{serverSession.error}</p>{/if}
</section>

<style>
  /* Matches the other Settings groups (stage plates). */
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

  .server {
    display: flex;
    flex-direction: column;
    gap: var(--sp-2);
    padding-top: var(--sp-3);
    box-shadow: inset 0 1px 0 var(--glass-edge);
  }

  .head {
    display: flex;
    align-items: baseline;
    gap: var(--sp-3);
  }

  h3 {
    font-size: var(--fs-body);
    font-weight: 700;
  }

  .state {
    color: var(--accent);
    font-size: var(--fs-micro);
    font-weight: 700;
    letter-spacing: 0.06em;
    text-transform: uppercase;
  }

  .muted {
    margin: 0;
    color: var(--text-muted);
    font-size: var(--fs-small);
    line-height: 1.5;
  }

  form,
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: var(--sp-2);
  }

  form .input {
    flex: 1 1 150px;
    min-width: 0;
  }

  form .address {
    flex: 2 1 240px;
  }

  .warn {
    margin: 0;
    color: var(--warning);
    font-size: var(--fs-small);
  }
</style>
