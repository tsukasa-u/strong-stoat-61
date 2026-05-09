<script lang="ts">
  let count = $state(0);
  let status = $state<"idle" | "working" | "done">("idle");
  let tags = $state<string[]>(["alpha", "beta"]);
  let profile = $state({ name: "Aki", role: "editor" });
  let secure = $state({ encoded: ["a1", "b2", "c3", "d4"], indices: [2, 0, 3, 1], pos: 0 });
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
    <button onclick={() => count++}>Count</button>
    <button onclick={() => (count = 0)}>Reset</button>
  </div>
  <p class="secret">{count}</p>
  <div>
    <button onclick={() => (status = "working")}>Start</button>
    <button onclick={() => (status = "done")}>Done</button>
  </div>
  <p class="secret">status: {status}</p>
  <div>
    <button onclick={() => (tags = [...tags, `tag-${tags.length + 1}`])}>Add tag</button>
    <button onclick={() => (profile = { ...profile, role: profile.role === "editor" ? "admin" : "editor" })}>Toggle role</button>
  </div>
  <p class="secret">tags: {tags.join(", ")}</p>
  <p class="secret">profile: {profile.name} ({profile.role})</p>
  <div>
    <button onclick={() => (secure = { ...secure, pos: Math.min(secure.pos + 1, secure.indices.length - 1) })}>Next Secure</button>
    <button onclick={() => (secure = { ...secure, pos: 0 })}>Reset Secure</button>
  </div>
  <p class="secret">secure-state: {secure.encoded[secure.indices[secure.pos]]}</p>
</div>
