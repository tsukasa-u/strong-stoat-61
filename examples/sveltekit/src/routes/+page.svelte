<script lang="ts">
  let status = $state<"idle" | "working" | "done">("idle");
  let tags = $state<string[]>(["alpha", "beta"]);
  let profile = $state({ name: "Aki", role: "editor" });
  const tagOptions = ["gamma", "delta", "omega", "sigma"];

  function addTag() {
    const next = tagOptions.find((tag) => !tags.includes(tag));
    if (next) tags = [...tags, next];
  }
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
  <p>以下のクライアント状態は平文表示です。数値カウンタは client-side の関係性が強すぎるため、この例では intentionally omitted としています。hooks.server で変換したHTMLのみ難読化されます。</p>
  <div>
    <button onclick={() => (status = "working")}>Start</button>
    <button onclick={() => (status = "done")}>Done</button>
    <button onclick={() => (status = "idle")}>Reset</button>
  </div>
  <p>status: {status}</p>
  <div>
    <button onclick={addTag}>Add tag</button>
    <button onclick={() => (profile = { ...profile, role: profile.role === "editor" ? "admin" : "editor" })}>Toggle role</button>
  </div>
  <p>tags: {tags.join(", ")}</p>
  <p>profile: {profile.name} ({profile.role})</p>
</div>
