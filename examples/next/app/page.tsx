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

const TAG_OPTIONS = ["gamma", "delta", "omega", "sigma"];

export default function HomePage() {
  const [status, setStatus] = useState<"idle" | "working" | "done">("idle");
  const [tags, setTags] = useState<string[]>(["alpha", "beta"]);
  const [profile, setProfile] = useState({ name: "Aki", role: "editor" });
  const addTag = () => {
    setTags((current) => {
      const next = TAG_OPTIONS.find((tag) => !current.includes(tag));
      return next ? [...current, next] : current;
    });
  };

  return (
    <main style={{ minHeight: "100vh", margin: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <h1>Next example</h1>
      <p>Open <a href="/protected">/protected</a> to see the obfuscated HTML route.</p>
      <p>
        Client-side state updates below are intentionally plain text.
        Numeric counters are intentionally omitted because client-side arithmetic makes those relationships too obvious.
        Only server-rendered HTML transformed by the adapter is obfuscated.
      </p>
      <div>
        <button style={btn} onClick={() => setStatus("working")}>Start</button>
        <button style={btn} onClick={() => setStatus("done")}>Done</button>
        <button style={btn} onClick={() => setStatus("idle")}>Reset</button>
      </div>
      <p>status: {status}</p>
      <div>
        <button style={btn} onClick={addTag}>Add tag</button>
        <button style={btn} onClick={() => setProfile((p) => ({ ...p, role: p.role === "editor" ? "admin" : "editor" }))}>Toggle role</button>
      </div>
      <p>tags: {tags.join(", ")}</p>
      <p>profile: {profile.name} ({profile.role})</p>
    </main>
  );
}
