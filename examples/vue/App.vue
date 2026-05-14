<template>
  <main class="page">
    <h1>Vue SSR example</h1>
    <p>This sample is SSR-only and does not hydrate client state.</p>
    <p>Only the server-rendered HTML transformed in the response is obfuscated.</p>

    <h2>1) 通常文字列の難読化</h2>
    <p class="secret">このテキストは難読化されます。Hello World</p>

    <h2>2) サーバー描画状態の難読化</h2>
    <p class="secret">status: working</p>
    <p class="secret">tags: alpha, beta</p>
    <p class="secret">profile: Aki (editor)</p>
    <p>数値カウンタのような関係性の強い状態は、このサンプルでは intentionally omitted としています。</p>

    <h2>3) 事前エンコード済み文字列状態</h2>
    <p class="secret">workflow-state: cedar</p>
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
