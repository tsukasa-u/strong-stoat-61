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
  return (
    <main style={{ "min-height": "100vh", margin: 0, display: "flex", "flex-direction": "column", "justify-content": "center", "align-items": "center", "text-align": "center" }}>
      <h1>SolidStart example</h1>
      <p class="secret">このテキストは難読化されます。Hello World</p>
      <div>
        <button style={btn} onclick="if(c<_pre.length-1)c++;el.textContent=_pre[c]">Count</button>
        <button style={btn} onclick="c=0;el.textContent=_pre[0]">Reset</button>
      </div>
      <p id="cnt" class="secret">0</p>
    </main>
  );
}
