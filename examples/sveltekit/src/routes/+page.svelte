<script lang="ts">
  let count = 0;
  let status: "idle" | "working" | "done" = "idle";
  let tags = ["alpha", "beta"];
  let profile = { name: "Aki", role: "editor" };
  let secure = { encoded: ["a1", "b2", "c3", "d4"], indices: [2, 0, 3, 1], pos: 0 };
</script>

<svelte:head>
  <title>SvelteKit Example</title>
</svelte:head>

<style>
  button { padding: 0.45rem 0.8rem; margin: 0.24rem; border: 1px solid #d1d5db; border-radius: 0.45rem; background: #fff; color: #111827; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
  button:hover { border-color: #9ca3af; }
  button:active { background: #f3f4f6; }
</style>

<div style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
  <h1>SvelteKit example</h1>
  <p class="secret">このテキストは難読化されます。Hello World</p>
  <div>
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button on:click={() => count++}>Count</button>
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button on:click={() => (count = 0)}>Reset</button>
  </div>
  <p class="secret">{count}</p>
  <div>
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button on:click={() => (status = "working")}>Start</button>
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button on:click={() => (status = "done")}>Done</button>
  </div>
  <p class="secret">status: {status}</p>
  <div>
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button on:click={() => (tags = [...tags, `tag-${tags.length + 1}`])}>Add tag</button>
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button on:click={() => (profile = { ...profile, role: profile.role === "editor" ? "admin" : "editor" })}>Toggle role</button>
  </div>
  <p class="secret">tags: {tags.join(", ")}</p>
  <p class="secret">profile: {profile.name} ({profile.role})</p>
  <div>
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button on:click={() => (secure = { ...secure, pos: Math.min(secure.pos + 1, secure.indices.length - 1) })}>Next Secure</button>
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button on:click={() => (secure = { ...secure, pos: 0 })}>Reset Secure</button>
  </div>
  <p class="secret">secure-state: {secure.encoded[secure.indices[secure.pos]]}</p>
</div>
