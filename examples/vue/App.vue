<template>
  <main class="page">
    <h1>Vue SSR example</h1>
    <p>This sample is SSR-only and does not hydrate client state.</p>
    <p>Only the server-rendered HTML transformed in the response is obfuscated.</p>

    <h2>1) 通常文字列の難読化</h2>
    <p class="secret">このテキストは難読化されます。Hello World</p>

    <h2>2) サーバー描画値の難読化</h2>
    <p class="secret">現在値: 42</p>
    <p class="secret">status: working</p>
    <p class="secret">tags: alpha, beta</p>
    <p class="secret">profile: Aki (editor)</p>

    <h2>3) 事前エンコード済み状態</h2>
    <p class="secret">secure-state: c3</p>
  </main>
</template>

<style scoped>
.page {
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  justify-content: center;
  align-items: center;
  text-align: center;
}
</style>
