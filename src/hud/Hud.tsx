import './hud.css'
import { QuickBar } from './QuickBar'
import { InventoryPanel } from './InventoryPanel'
import { AudioToggle } from './AudioToggle'
import { DebugToggle } from './DebugToggle'
import { DebugMoneyToggle } from './DebugMoneyToggle'
import { PauseMenu } from './PauseMenu'
import { PlayerHud } from './PlayerHud'
import { ShopPanel } from './ShopPanel'
import { UpgradeTree } from './UpgradeTree'
import { Objective } from './Objective'
import { StartScreen } from './StartScreen'
import { BuffBar } from './BuffBar'
import { ItemToasts } from './ItemToasts'

export function Hud() {
  return (
    <div className="hud">
      <StartScreen />
      <PlayerHud />
      <Objective />
      <BuffBar />
      <ItemToasts />
      <AudioToggle />
      <DebugToggle />
      <DebugMoneyToggle />
      <QuickBar />
      <ShopPanel />
      <UpgradeTree />
      <InventoryPanel />
      <PauseMenu />
    </div>
  )
}
