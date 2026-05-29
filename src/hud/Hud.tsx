import './hud.css'
import { Inventory } from './Inventory'
import { AudioToggle } from './AudioToggle'
import { DebugToggle } from './DebugToggle'
import { PauseMenu } from './PauseMenu'
import { PlayerHud } from './PlayerHud'
import { ShopPanel } from './ShopPanel'
import { Objective } from './Objective'

export function Hud() {
  return (
    <div className="hud">
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
