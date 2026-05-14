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

const TAG_OPTIONS = ["gamma", "delta", "omega", "sigma"];

export default function Home() {
  const [status, setStatus] = createSignal<"idle" | "working" | "done">("idle");
  const [tags, setTags] = createSignal<string[]>(["alpha", "beta"]);
  const [profile, setProfile] = createSignal({ name: "Aki", role: "editor" });
  const addTag = () => {
    const next = TAG_OPTIONS.find((tag) => !tags().includes(tag));
    if (next) setTags((current) => [...current, next]);
  };

  return (
    <main style={{ "min-height": "100vh", margin: 0, display: "flex", "flex-direction": "column", "justify-content": "center", "align-items": "center", "text-align": "center" }}>
      <h1>SolidStart example</h1>
      <p class="secret">このテキストは難読化されます。Hello World</p>
      <p>
        以下のクライアント状態は平文表示です。数値カウンタは client-side の関係性が強すぎるため、この例では intentionally omitted としています。middleware が返却HTMLを変換した部分のみ難読化されます。
      </p>

      <h2>1) 通常文字列の難読化</h2>
      <p class="secret">通常文字列も middleware で難読化されます。</p>

      <h2>2) 文字列状態</h2>

      <div>
        <button style={btn} onClick={() => setStatus("working")}>Start</button>
        <button style={btn} onClick={() => setStatus("done")}>Done</button>
        <button style={btn} onClick={() => setStatus("idle")}>Reset</button>
      </div>
      <p>status: {status()}</p>
      <div>
        <button style={btn} onClick={addTag}>Add tag</button>
        <button
          style={btn}
          onClick={() => setProfile((p) => ({ ...p, role: p.role === "editor" ? "admin" : "editor" }))}
        >
          Toggle role
        </button>
      </div>
      <p>tags: {tags().join(", ")}</p>
      <p>profile: {profile().name} ({profile().role})</p>
    </main>
  );
}
