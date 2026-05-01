<script>
  let c = 0;

  function readPre() {
    const pre = globalThis._pre;
    return Array.isArray(pre) ? pre : [];
  }

  function applyCount() {
    const el = document.getElementById("cnt");
    const pre = readPre();
    const idx = (globalThis as any)._preIdx as number[] | undefined;
    if (!el || pre.length === 0) return;
    const pos = idx ? (idx[c] ?? c) : c;
    el.textContent = pre[pos] ?? pre[0];
  }

  function onCount() {
    const pre = readPre();
    if (pre.length === 0) return;
    if (c < pre.length - 1) c++;
    applyCount();
  }

  function onReset() {
    c = 0;
    applyCount();
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
  <div>
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button on:click={onCount}>Count</button>
    <!-- svelte-ignore a11y_consider_explicit_label -->
    <button on:click={onReset}>Reset</button>
  </div>
  <p id="cnt" class="secret">0</p>
</div>
