import { useEffect } from 'react'
import { consumeContinue } from './runStore'
import { loadGame } from './saveGame'

// Resume-from-dawn loader. Mounted inside <World>, so it remounts with the scene on
// every bumpRun(). When the defeat screen requested a continue (requestContinue +
// resetRun + bumpRun), this consumes the flag and restores the checkpoint.
//
// The restore is deferred a tick on purpose: loadGame() must run AFTER the fresh
// <World> tree has fully mounted and seeded (VillagerCrowd, City, etc. create their
// initial state in their own mount effects). A setTimeout(0) fires after this
// commit's passive-effect flush completes — so restore lands on a settled, clean
// world, reproducing the menu Continue's precondition without routing through the
// title screen. (setTimeout, not rAF: rAF pauses in a backgrounded tab, which would
// strand the load.) Until loadGame() flips the phase to 'prep', the defeat overlay
// stays up, so the brief fresh-default world is hidden.
//
// No clearTimeout cleanup ON PURPOSE: under StrictMode the effect runs
// mount→cleanup→mount, and cancelling here would kill the scheduled load while the
// second mount sees the flag already consumed — so nothing would fire. consumeContinue()
// is read-and-clear, so only the first mount schedules; letting that one timer run
// (it only restores stores + flips to prep) is the correct, StrictMode-safe behavior.
export function RunLoad() {
  useEffect(() => {
    if (!consumeContinue()) return
    setTimeout(() => loadGame(), 0)
  }, [])
  return null
}
