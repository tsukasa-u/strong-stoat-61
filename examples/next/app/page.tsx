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
  return (
    <main style={{ minHeight: "100vh", margin: 0, display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", textAlign: "center" }}>
      <h1>Next example</h1>
      <p>Open <a href="/protected">/protected</a> to see the obfuscated HTML route.</p>
      <div>
        <button style={btn} onClick={() => setCount((c) => c + 1)}>Count</button>
        <button style={btn} onClick={() => setCount(0)}>Reset</button>
      </div>
      <p>{count}</p>
    </main>
  );
}
