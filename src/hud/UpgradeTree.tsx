import { useEffect, useState } from 'react'
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

const BRANCHES: { id: UpgradeBranch; label: string; icon: string }[] = [
  { id: 'economy', label: 'Economy', icon: '🌾' },
  { id: 'defense', label: 'Defense', icon: '🛡️' },
  { id: 'hero', label: 'Hero', icon: '⚔️' },
  { id: 'arsenal', label: 'Arsenal', icon: '🏪' },
]

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
    <div className="shop-screen">
      <div className="shop-card upgrade-card">
        <div className="shop-header">
          <div className="shop-title">Keep — Upgrades</div>
          <div className="shop-gold">{unlimited ? '∞' : gold} ★ · {unlimited ? '∞' : stone} 🪨</div>
        </div>

        <div className="upgrade-branches">
          {BRANCHES.map((br) => (
            <div className="upgrade-col" key={br.id}>
              <div className="upgrade-col-title">
                <span>{br.icon}</span> {br.label}
              </div>
              {UPGRADE_NODES.filter((n) => n.branch === br.id).map((node) => {
                const st = nodeState(node)
                return (
                  <button
                    key={node.id}
                    className={`upgrade-node is-${st}`}
                    disabled={st !== 'buy'}
                    onClick={() => purchase(node)}
                  >
                    <span className="upgrade-node-icon">{node.icon}</span>
                    <span className="upgrade-node-body">
                      <span className="upgrade-node-name">{node.name}</span>
                      <span className="upgrade-node-desc">{node.desc}</span>
                    </span>
                    <span className="upgrade-node-cost">
                      {st === 'owned'
                        ? '✓'
                        : st === 'locked'
                          ? '🔒'
                          : `${node.cost} ★${node.stoneCost ? ` + ${node.stoneCost} 🪨` : ''}`}
                    </span>
                  </button>
                )
              })}
            </div>
          ))}
        </div>

        <button className="shop-close" onClick={() => closeTree()}>Leave (Esc)</button>
      </div>
    </div>
  )
}
