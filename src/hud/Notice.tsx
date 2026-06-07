import { useEffect, useState } from 'react'
import { getNotice, subscribeNotice, clearNotice } from '../world/noticeStore'

const SHOW_MS = 3500

/** One transient system line, top-center. Used for automatic changes the player
 *  should know about (e.g. the adaptive quality downgrade). Auto-fades. */
export function Notice() {
  const [notice, setNotice] = useState(getNotice())

  useEffect(() => subscribeNotice(() => setNotice({ ...getNotice() })), [])

  useEffect(() => {
    if (!notice.message) return
    const t = setTimeout(clearNotice, SHOW_MS)
    return () => clearTimeout(t)
  }, [notice.message, notice.born])

  if (!notice.message) return null
  return <div className="notice" role="status">{notice.message}</div>
}
