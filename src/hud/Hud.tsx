import './hud.css'
import { Inventory } from './Inventory'
import { AudioToggle } from './AudioToggle'
import { DebugToggle } from './DebugToggle'
import { PauseMenu } from './PauseMenu'
import { PlayerHud } from './PlayerHud'

export function Hud() {
  return (
    <div className="hud">
      <PlayerHud />
      <AudioToggle />
      <DebugToggle />
      <Inventory />
      <PauseMenu />
    </div>
  )
}
