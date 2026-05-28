export function Inventory() {
  return (
    <div className="inv-panel">
      <div className="inv-title">INVENTORY</div>
      <div className="inv-grid">
        <div className="inv-slot">⚔</div>
        <div className="inv-slot">🛡</div>
        <div className="inv-slot">⛑</div>
        <div className="inv-slot">
          🧪<span className="count">3</span>
        </div>
        {Array.from({ length: 12 }).map((_, i) => (
          <div key={i} className="inv-slot" />
        ))}
      </div>
    </div>
  )
}
