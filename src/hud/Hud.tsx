import { useEffect, useState } from 'react'
import './hud.css'
import { QuickBar } from './QuickBar'
import { InventoryPanel } from './InventoryPanel'
import { AudioToggle } from './AudioToggle'
import { DebugToggle } from './DebugToggle'
import { DebugMoneyToggle } from './DebugMoneyToggle'
import { PauseMenu } from './PauseMenu'
import { SettingsPanel } from './SettingsPanel'
import { LoadingScreen } from './LoadingScreen'
import { PlayerHud } from './PlayerHud'
import { ShopPanel } from './ShopPanel'
import { UpgradeTree } from './UpgradeTree'
import { Objective } from './Objective'
import { StartScreen } from './StartScreen'
import { BuffBar } from './BuffBar'
import { ItemToasts } from './ItemToasts'
import { Notice } from './Notice'
import { AutoSave } from './AutoSave'
import { isStarted, subscribePhase } from '../world/gameStore'

export function Hud() {
  // The in-game HUD (HP/gold/quickbar/toggles) only belongs once a run is live —
  // on the title screen it would bleed over the menu. The menu/system overlays
  // (start, pause, settings, loading) render in every phase and self-gate.
  const [started, setStarted] = useState<boolean>(isStarted())
  useEffect(() => subscribePhase(() => setStarted(isStarted())), [])

  return (
    <div className="hud">
      {/* Auto-checkpoint driver (logic only, no UI) — persists across run remounts. */}
      <AutoSave />

      {/* Menu + system overlays — always mounted, each self-gates by phase. */}
      <StartScreen />
      <PauseMenu />
      <SettingsPanel />
      <LoadingScreen />

      {/* In-game HUD — only while a run is underway (incl. victory/defeat). */}
      {started && (
        <>
          <PlayerHud />
          <Objective />
          <BuffBar />
          <ItemToasts />
          <Notice />
          <AudioToggle />
          <DebugToggle />
          <DebugMoneyToggle />
          <QuickBar />
          <ShopPanel />
          <UpgradeTree />
          <InventoryPanel />
        </>
      )}
    </div>
  )
}
