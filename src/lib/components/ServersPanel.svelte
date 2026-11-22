<script lang="ts">
  import { onMount } from "svelte";
  import { describeError } from "$lib/errors";
  import { t } from "$lib/i18n/locale.svelte";
  import { serverSession } from "$lib/servers/session.svelte";
  import { SERVER_NAMES, type ServerKind } from "$lib/servers/uri";
  import Group from "$lib/settings/Group.svelte";
  import Row from "$lib/settings/Row.svelte";

  // Settings → Services: sign in to a Navidrome (or any Subsonic) server, a Jellyfin server and a
  // Plex server. The password is used once to sign in and never kept.
  interface Kind {
    kind: ServerKind;
    title: string;
    /** Tooltip: what else answers the same way. */
    hint?: string;
    /** Shown: where the thing to paste is found. */
    steps?: string;
    placeholder: string;
    keywords: string;
    token?: boolean;
  }
  const KINDS: Kind[] = [
    { kind: "subsonic", title: "Navidrome or Subsonic", hint: "Also Gonic, Airsonic and Ampache.", placeholder: "http://192.168.1.10:4533", keywords: "gonic airsonic ampache" },
    { kind: "jellyfin", title: "Jellyfin", hint: "Emby works too.", placeholder: "http://192.168.1.10:8096", keywords: "emby" },
    {
      kind: "plex",
      title: "Plex",
      steps: "Token: an item's Get Info, View XML, then X-Plex-Token in the address",
      placeholder: "http://192.168.1.10:32400",
      keywords: "token media server",
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

<Group heading="Your music servers" id="servers">
  {#each KINDS as { kind, title, hint, steps, placeholder, keywords, token } (kind)}
    {@const info = serverSession.of(kind)}
    {@const form = forms[kind]}
    {#if info}
      <Row
        label={t(title)}
        value={t("Connected")}
        message={form.error ? form.error : token ? info.url : `${info.username} · ${info.url}`}
        warn={!!form.error}
        keywords="self-hosted server library {keywords}"
      >
        <a class="pill accent" href="/server/{kind}">Open {SERVER_NAMES[kind]}</a>
        <button class="pill" onclick={() => disconnect(kind)}>Disconnect</button>
      </Row>
    {:else}
      <Row
        label={t(title)}
        description={hint ? t(hint) : undefined}
        message={form.error ? form.error : steps ? t(steps) : undefined}
        warn={!!form.error}
        keywords="self-hosted server library connect {keywords}"
      >
        {#snippet below()}
          <form onsubmit={(e) => connect(kind, e)}>
            <input class="input address" bind:value={form.url} {placeholder} aria-label="{title} address" required spellcheck="false" autocomplete="off" />
            {#if !token}
              <input class="input" bind:value={form.username} placeholder="User name" aria-label="{title} user name" required spellcheck="false" autocomplete="off" />
            {/if}
            <input class="input" type="password" bind:value={form.password} placeholder={token ? "X-Plex-Token" : "Password"} aria-label="{title} {token ? 'token' : 'password'}" required={token} autocomplete="off" />
            <button class="pill accent" disabled={form.busy}>{form.busy ? "Connecting…" : "Connect"}</button>
          </form>
        {/snippet}
      </Row>
    {/if}
  {/each}
  {#if serverSession.error}<p class="note warn" role="alert">{serverSession.error}</p>{/if}
</Group>

<style>
  form {
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
</style>
