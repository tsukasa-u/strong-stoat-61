<script setup lang="ts">
import { ref } from "vue";

const count = ref(0);
const status = ref<"idle" | "working" | "done">("idle");
const tags = ref<string[]>(["alpha", "beta"]);
const profile = ref({ name: "Aki", role: "editor" });
const secure = ref({ encoded: ["a1", "b2", "c3", "d4"], indices: [2, 0, 3, 1], pos: 0 });
</script>

<template>
  <main style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
    <h1>Nuxt example</h1>
    <p>Open <a href="/protected">/protected</a> to see the obfuscated HTML route.</p>
    <p>以下のクライアント状態は平文表示です。adapter が変換したサーバーHTMLのみ難読化されます。</p>
    <div>
      <button @click="count++">Count</button>
      <button @click="count = 0">Reset</button>
    </div>
    <p>{{ count }}</p>
    <div>
      <button @click="status = 'working'">Start</button>
      <button @click="status = 'done'">Done</button>
    </div>
    <p>status: {{ status }}</p>
    <div>
      <button @click="tags = [...tags, `tag-${tags.length + 1}`]">Add tag</button>
      <button @click="profile = { ...profile, role: profile.role === 'editor' ? 'admin' : 'editor' }">Toggle role</button>
    </div>
    <p>tags: {{ tags.join(', ') }}</p>
    <p>profile: {{ profile.name }} ({{ profile.role }})</p>
    <div>
      <button @click="secure = { ...secure, pos: Math.min(secure.pos + 1, secure.indices.length - 1) }">Next Secure</button>
      <button @click="secure = { ...secure, pos: 0 }">Reset Secure</button>
    </div>
    <p>secure-state: {{ secure.encoded[secure.indices[secure.pos]] }}</p>
  </main>
</template>

<style>
button { padding: 0.45rem 0.8rem; margin: 0.24rem; border: 1px solid #d1d5db; border-radius: 0.45rem; background: #fff; color: #111827; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
button:hover { border-color: #9ca3af; }
button:active { background: #f3f4f6; }
</style>
