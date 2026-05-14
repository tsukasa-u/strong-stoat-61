<script setup lang="ts">
import { ref } from "vue";

const status = ref<"idle" | "working" | "done">("idle");
const tags = ref<string[]>(["alpha", "beta"]);
const profile = ref({ name: "Aki", role: "editor" });
const tagOptions = ["gamma", "delta", "omega", "sigma"];

function addTag() {
  const next = tagOptions.find((tag) => !tags.value.includes(tag));
  if (next) tags.value = [...tags.value, next];
}
</script>

<template>
  <main style="min-height:100vh;display:flex;flex-direction:column;justify-content:center;align-items:center;text-align:center">
    <h1>Nuxt example</h1>
    <p>Open <a href="/protected">/protected</a> to see the obfuscated HTML route.</p>
    <p>以下のクライアント状態は平文表示です。数値カウンタは client-side の関係性が強すぎるため、この例では intentionally omitted としています。adapter が変換したサーバーHTMLのみ難読化されます。</p>
    <div>
      <button @click="status = 'working'">Start</button>
      <button @click="status = 'done'">Done</button>
      <button @click="status = 'idle'">Reset</button>
    </div>
    <p>status: {{ status }}</p>
    <div>
      <button @click="addTag">Add tag</button>
      <button @click="profile = { ...profile, role: profile.role === 'editor' ? 'admin' : 'editor' }">Toggle role</button>
    </div>
    <p>tags: {{ tags.join(', ') }}</p>
    <p>profile: {{ profile.name }} ({{ profile.role }})</p>
  </main>
</template>

<style>
button { padding: 0.45rem 0.8rem; margin: 0.24rem; border: 1px solid #d1d5db; border-radius: 0.45rem; background: #fff; color: #111827; font-size: 0.9rem; font-weight: 600; cursor: pointer; }
button:hover { border-color: #9ca3af; }
button:active { background: #f3f4f6; }
</style>
