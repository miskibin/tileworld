import './hud.css'
import { Inventory } from './Inventory'
import { AudioToggle } from './AudioToggle'
import { DebugToggle } from './DebugToggle'
import { PauseMenu } from './PauseMenu'
import { PlayerHud } from './PlayerHud'
import { ShopPanel } from './ShopPanel'
import { Objective } from './Objective'
import { StartScreen } from './StartScreen'

export function Hud() {
  return (
    <div className="hud">
      <StartScreen />
      <PlayerHud />
      <Objective />
      <AudioToggle />
      <DebugToggle />
      <Inventory />
      <ShopPanel />
      <PauseMenu />
    </div>
  )
}
