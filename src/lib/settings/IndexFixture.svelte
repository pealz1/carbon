<script lang="ts">
  // Test fixture (index.svelte.test.ts): two categories of rows around one index, built the way
  // the Settings page builds them. Its texts are data, so translation leaves them alone.
  import Toggle from "$lib/components/Toggle.svelte";
  import Category from "./Category.svelte";
  import Group from "./Group.svelte";
  import { provideIndex } from "./index.svelte";
  import Row from "./Row.svelte";

  let { late = false, tip = null }: { late?: boolean; tip?: string | null } = $props();

  const text = { people: "People", name: "Display name", region: "Radio region", session: "Private session", looks: "Looks", theme: "Theme", pick: "Pick" };
  export const index = provideIndex();
</script>

<Category id="account" current="account">
  <Group heading={text.people}>
    <Row label={text.name} keywords="greeting" />
    {#if late}<Row label={text.region} />{/if}
    <Toggle label={text.session} checked={false} onchange={() => {}} />
  </Group>
</Category>
<Category id="appearance" current="account">
  <Group heading={text.looks}>
    <Row label={text.theme} description={tip}><button>{text.pick}</button></Row>
  </Group>
</Category>
