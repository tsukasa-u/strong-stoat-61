<script setup lang="ts">
import { computed, ref } from "vue";

const count = ref(0);
const status = ref<"idle" | "working" | "done">("idle");
const tags = ref<string[]>(["alpha", "beta"]);
const profile = ref({ name: "Aki", role: "editor" });

const secure = ref({
  encoded: ["a1", "b2", "c3", "d4"],
  indices: [2, 0, 3, 1],
  pos: 0,
});

const secureValue = computed(() => {
  const idx = secure.value.indices[secure.value.pos] ?? secure.value.indices[0] ?? 0;
  return secure.value.encoded[idx] ?? "";
});

const increment = () => {
  count.value = Math.min(count.value + 1, 99);
};

const resetCount = () => {
  count.value = 0;
};

const startStatus = () => {
  status.value = "working";
};

const doneStatus = () => {
  status.value = "done";
};

const addTag = () => {
  tags.value = [...tags.value, `tag-${tags.value.length + 1}`];
};

const toggleRole = () => {
  profile.value = {
    ...profile.value,
    role: profile.value.role === "editor" ? "admin" : "editor",
  };
};

const nextSecure = () => {
  secure.value.pos = Math.min(secure.value.pos + 1, secure.value.indices.length - 1);
};

const resetSecure = () => {
  secure.value.pos = 0;
};
</script>

<template>
  <main class="page">
    <h1>Vue SSR example</h1>

    <h2>1) 通常文字列の難読化</h2>
    <p class="secret">このテキストは難読化されます。Hello World</p>

    <h2>2) 数値カウント</h2>
    <div>
      <button @click="increment">Count</button>
      <button @click="resetCount">Reset</button>
    </div>
    <p class="secret">{{ count }}</p>

    <div>
      <button @click="startStatus">Start</button>
      <button @click="doneStatus">Done</button>
    </div>
    <p class="secret">status: {{ status }}</p>

    <div>
      <button @click="addTag">Add tag</button>
      <button @click="toggleRole">Toggle role</button>
    </div>
    <p class="secret">tags: {{ tags.join(", ") }}</p>
    <p class="secret">profile: {{ profile.name }} ({{ profile.role }})</p>

    <h2>3) 事前エンコード済み状態</h2>
    <div>
      <button @click="nextSecure">Next Secure</button>
      <button @click="resetSecure">Reset Secure</button>
    </div>
    <p class="secret">secure-state: {{ secureValue }}</p>
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

button {
  padding: 0.45rem 0.8rem;
  margin: 0.24rem;
  border: 1px solid #d1d5db;
  border-radius: 0.45rem;
  background: #fff;
  color: #111827;
  font-size: 0.9rem;
  font-weight: 600;
  cursor: pointer;
}

button:hover {
  border-color: #9ca3af;
}

button:active {
  background: #f3f4f6;
}
</style>
