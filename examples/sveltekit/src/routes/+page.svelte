<script>
  let count = $state(0);
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
    <button onclick={() => count = 0}>Reset</button>
  </div>
  <p class="secret">{count}</p>
</div>
