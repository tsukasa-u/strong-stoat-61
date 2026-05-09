import { createSignal } from "solid-js";
import { createStore } from "solid-js/store";

const btn = {
  padding: "0.45rem 0.8rem",
  margin: "0.24rem",
  border: "1px solid #d1d5db",
  "border-radius": "0.45rem",
  background: "#fff",
  color: "#111827",
  "font-size": "0.9rem",
  "font-weight": 600,
  cursor: "pointer",
};

export default function Home() {
  const [count, setCount] = createSignal(0);
  const [status, setStatus] = createSignal<"idle" | "working" | "done">("idle");
  const [tags, setTags] = createSignal<string[]>(["alpha", "beta"]);
  const [profile, setProfile] = createSignal({ name: "Aki", role: "editor" });
  const [secure, setSecure] = createStore({
    encoded: ["a1", "b2", "c3", "d4"],
    indices: [2, 0, 3, 1],
    pos: 0,
  });

  const secureValue = () => secure.encoded[secure.indices[secure.pos]] ?? "";

  return (
    <main style={{ "min-height": "100vh", margin: 0, display: "flex", "flex-direction": "column", "justify-content": "center", "align-items": "center", "text-align": "center" }}>
      <h1>SolidStart example</h1>
      <p class="secret">このテキストは難読化されます。Hello World</p>

      <h2>1) 通常文字列の難読化</h2>
      <p class="secret">通常文字列も middleware で難読化されます。</p>

      <h2>2) 数値カウント</h2>
      <div>
        <button style={btn} onClick={() => setCount((c) => c + 1)}>Count</button>
        <button style={btn} onClick={() => setCount(0)}>Reset</button>
      </div>
      <p class="secret">{count()}</p>

      <div>
        <button style={btn} onClick={() => setStatus("working")}>Start</button>
        <button style={btn} onClick={() => setStatus("done")}>Done</button>
      </div>
      <p class="secret">status: {status()}</p>
      <div>
        <button style={btn} onClick={() => setTags((v) => [...v, `tag-${v.length + 1}`])}>Add tag</button>
        <button
          style={btn}
          onClick={() => setProfile((p) => ({ ...p, role: p.role === "editor" ? "admin" : "editor" }))}
        >
          Toggle role
        </button>
      </div>
      <p class="secret">tags: {tags().join(", ")}</p>
      <p class="secret">profile: {profile().name} ({profile().role})</p>

      <h2>3) 事前難読化状態</h2>
      <div>
        <button
          style={btn}
          onClick={() => setSecure("pos", (p) => Math.min(p + 1, secure.indices.length - 1))}
        >
          Next Secure
        </button>
        <button style={btn} onClick={() => setSecure("pos", 0)}>Reset Secure</button>
      </div>
      <p class="secret">secure-state: {secureValue()}</p>
    </main>
  );
}
