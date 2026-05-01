<template>
  <main style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
    <h1>Nuxt example</h1>
    <p class="secret">このテキストは難読化されます。Hello World</p>
    <div>
      <button onclick="if(c<_pre.length-1)c++;el.textContent=_pre[_preIdx[c]]">Count</button>
      <button onclick="c=0;el.textContent=_pre[_preIdx[0]]">Reset</button>
    </div>
    <p id="cnt" class="secret">0</p>
  </main>
</template>

<style>
button { padding: 0.45rem 0.8rem; margin: 0.24rem; border: 1px solid #d1d5db; border-radius: 0.45rem; background: #fff; color: #111827; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
button:hover { border-color: #9ca3af; }
button:active { background: #f3f4f6; }
</style>
