import './hud.css'
import { Inventory } from './Inventory'
import { AudioToggle } from './AudioToggle'
import { PlayerHud } from './PlayerHud'

export function Hud() {
  return (
    <div className="hud">
      <PlayerHud />
      <AudioToggle />
      <Inventory />
    </div>
  )
}
