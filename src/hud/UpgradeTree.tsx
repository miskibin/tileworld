import { useEffect, useState, type CSSProperties } from 'react'
import { getGold, subscribeGold } from '../world/playerStore'
import { getStone, subscribeResources } from '../world/resourceStore'
import { isUnlimitedMoney, subscribeUnlimitedMoney } from '../world/debugStore'
import { isTreeOpen, closeTree, subscribeTree } from '../world/townHallStore'
import {
  UPGRADE_NODES,
  canBuy,
  isPurchased,
  purchase,
  subscribeUpgrades,
  type UpgradeBranch,
  type UpgradeNode,
} from '../world/upgradeStore'

// The four expansion charters, each its own heraldic banner. Kept in this file
// (presentation only) — the node data + effects all live in upgradeStore.
const BRANCHES: { id: UpgradeBranch; label: string; sigil: string }[] = [
  { id: 'economy', label: 'Prosperity', sigil: '🌾' },
  { id: 'defense', label: 'Bulwark', sigil: '🛡️' },
  { id: 'hero', label: 'Champion', sigil: '⚔️' },
  { id: 'arsenal', label: 'Armoury', sigil: '🏪' },
]

// How many prereqs deep a node sits — used to indent it under its requirement so
// the column reads as a dependency tree rather than a flat list.
const NODE_BY_ID = new Map(UPGRADE_NODES.map((n) => [n.id, n]))
function prereqDepth(node: UpgradeNode): number {
  let depth = 0
  let cur: UpgradeNode | undefined = node
  while (cur?.prereqId) {
    depth++
    cur = NODE_BY_ID.get(cur.prereqId)
  }
  return depth
}

export function UpgradeTree() {
  const [open, setOpen] = useState(isTreeOpen())
  const [gold, setGold] = useState(getGold())
  const [stone, setStone] = useState(getStone())
  const [unlimited, setUnlimited] = useState(isUnlimitedMoney())
  const [, force] = useState(0)

  useEffect(() => subscribeTree(setOpen), [])
  useEffect(() => subscribeGold(setGold), [])
  useEffect(() => subscribeResources((r) => setStone(r.stone)), [])
  useEffect(() => subscribeUnlimitedMoney(setUnlimited), [])
  useEffect(() => subscribeUpgrades(() => force((n) => n + 1)), [])

  // Esc closes the tree.
  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.code === 'Escape') {
        e.preventDefault()
        closeTree()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  const nodeState = (node: UpgradeNode): 'owned' | 'locked' | 'poor' | 'buy' => {
    if (isPurchased(node.id)) return 'owned'
    if (node.prereqId && !isPurchased(node.prereqId)) return 'locked'
    return canBuy(node) ? 'buy' : 'poor'
  }

  return (
    <div className="keep-plan-screen">
      <div className="keep-plan" role="dialog" aria-label="Keep expansion">
        <header className="keep-plan-head">
          <div className="keep-plan-titles">
            <span className="keep-plan-kicker">Castellan's Plans</span>
            <h2 className="keep-plan-title">Expand the Keep</h2>
          </div>
          <div className="keep-treasury">
            <span className="keep-tally keep-tally-gold">
              <i className="keep-tally-mark">★</i>
              {unlimited ? '∞' : gold}
            </span>
            <span className="keep-tally keep-tally-stone">
              <i className="keep-tally-mark">🪨</i>
              {unlimited ? '∞' : stone}
            </span>
          </div>
        </header>

        <div className="keep-plan-board">
          {BRANCHES.map((br) => (
            <section className="keep-charter" data-branch={br.id} key={br.id}>
              <div className="keep-charter-banner">
                <span className="keep-charter-sigil">{br.sigil}</span>
                <span className="keep-charter-name">{br.label}</span>
              </div>

              <div className="keep-charter-nodes">
                {UPGRADE_NODES.filter((n) => n.branch === br.id).map((node) => {
                  const st = nodeState(node)
                  const depth = prereqDepth(node)
                  return (
                    <button
                      key={node.id}
                      className={`keep-node is-${st}`}
                      data-depth={depth}
                      style={{ '--depth': depth } as CSSProperties}
                      disabled={st !== 'buy'}
                      onClick={() => purchase(node)}
                    >
                      <span className="keep-node-medallion">{node.icon}</span>
                      <span className="keep-node-text">
                        <span className="keep-node-name">{node.name}</span>
                        <span className="keep-node-desc">{node.desc}</span>
                      </span>
                      <span className="keep-node-cost">
                        {st === 'owned' ? (
                          <span className="keep-seal" aria-label="built">
                            ✓
                          </span>
                        ) : st === 'locked' ? (
                          <span className="keep-lock" aria-label="locked">
                            🔒
                          </span>
                        ) : (
                          <>
                            <span className="keep-cost-gold">{node.cost} ★</span>
                            {node.stoneCost ? (
                              <span className="keep-cost-stone">{node.stoneCost} 🪨</span>
                            ) : null}
                          </>
                        )}
                      </span>
                    </button>
                  )
                })}
              </div>
            </section>
          ))}
        </div>

        <footer className="keep-plan-foot">
          <span className="keep-foot-hint">Decreed at the war table</span>
          <button className="keep-leave" onClick={() => closeTree()}>
            Seal the Plans <kbd>Esc</kbd>
          </button>
        </footer>
      </div>
    </div>
  )
}
