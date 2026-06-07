import { useEffect } from 'react'

// Creature/character views build their tintable materials with useMemo — PER
// INSTANCE, on purpose, so a hurt flash colours only that one mob (a shared
// material would flash the whole species at once). R3F does NOT auto-dispose
// materials handed in via a `material={}` prop (only declarative <meshXMaterial/>
// children), so each mob that dies or culls out leaks its GPU material handles.
// This hook disposes the given per-instance objects once, on unmount.
//
// Pass ONLY per-instance useMemo materials/geometries — never the module-level
// shared ones (those live for the page and are reused across every instance).
export function useDisposeOnUnmount(...objects: { dispose(): void }[]): void {
  useEffect(() => {
    // The objects are stable useMemo refs; capture them and dispose on unmount.
    return () => {
      for (const o of objects) o.dispose()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
}
