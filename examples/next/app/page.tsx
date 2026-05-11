"use client";
import { useState } from "react";
import type React from "react";

const btn: React.CSSProperties = {
  padding: "0.45rem 0.8rem",
  margin: "0.24rem",
  border: "1px solid #d1d5db",
  borderRadius: "0.45rem",
  background: "#fff",
  color: "#111827",
  fontSize: "0.9rem",
  fontWeight: 600,
  cursor: "pointer",
};

export default function HomePage() {
  const [count, setCount] = useState(0);
  const [status, setStatus] = useState<"idle" | "working" | "done">("idle");
  const [tags, setTags] = useState<string[]>(["alpha", "beta"]);
  const [profile, setProfile] = useState({ name: "Aki", role: "editor" });
  const [secureState, setSecureState] = useState({ encoded: ["a1", "b2", "c3", "d4"], indices: [2, 0, 3, 1], pos: 0 });
  const secureValue = secureState.encoded[secureState.indices[secureState.pos]] ?? "";
  return (
    <main style={{ minHeight: "100vh", margin: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <h1>Next example</h1>
      <p>Open <a href="/protected">/protected</a> to see the obfuscated HTML route.</p>
      <p>
        Client-side state updates below are intentionally plain text.
        Only server-rendered HTML transformed by the adapter is obfuscated.
      </p>
      <div>
        <button style={btn} onClick={() => setCount((c) => c + 1)}>Count</button>
        <button style={btn} onClick={() => setCount(0)}>Reset</button>
      </div>
      <p>{count}</p>
      <div>
        <button style={btn} onClick={() => setStatus("working")}>Start</button>
        <button style={btn} onClick={() => setStatus("done")}>Done</button>
      </div>
      <p>status: {status}</p>
      <div>
        <button style={btn} onClick={() => setTags((v) => [...v, `tag-${v.length + 1}`])}>Add tag</button>
        <button style={btn} onClick={() => setProfile((p) => ({ ...p, role: p.role === "editor" ? "admin" : "editor" }))}>Toggle role</button>
      </div>
      <p>tags: {tags.join(", ")}</p>
      <p>profile: {profile.name} ({profile.role})</p>
      <div>
        <button style={btn} onClick={() => setSecureState((s) => ({ ...s, pos: Math.min(s.pos + 1, s.indices.length - 1) }))}>Next Secure</button>
        <button style={btn} onClick={() => setSecureState((s) => ({ ...s, pos: 0 }))}>Reset Secure</button>
      </div>
      <p>secure-state: {secureValue}</p>
    </main>
  );
}
