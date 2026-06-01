import './hud.css'
import { Inventory } from './Inventory'
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

export function Hud() {
  return (
    <div className="hud">
      <StartScreen />
      <PlayerHud />
      <Objective />
      <BuffBar />
      <AudioToggle />
      <DebugToggle />
      <DebugMoneyToggle />
      <Inventory />
      <ShopPanel />
      <UpgradeTree />
      <PauseMenu />
    </div>
  )
}
