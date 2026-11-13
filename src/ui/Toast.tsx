import { useEffect, useState } from 'react'
import { createPortal } from 'react-dom'

interface ToastItem {
  id: number
  text: string
  action?: { label: string; run: () => void }
}

let listeners: ((t: ToastItem | null) => void)[] = []
let seq = 0

/** نمایش پیام کوتاه با دکمهٔ اختیاری (مثلاً «بازگردانی») */
export function toast(text: string, action?: ToastItem['action']) {
  const t = { id: ++seq, text, action }
  listeners.forEach((l) => l(t))
}

export function Toaster() {
  const [item, setItem] = useState<ToastItem | null>(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const l = (t: ToastItem | null) => {
      setItem(t)
      requestAnimationFrame(() => setShown(true))
    }
    listeners.push(l)
    return () => {
      listeners = listeners.filter((x) => x !== l)
    }
  }, [])

  useEffect(() => {
    if (!item) return
    let t: ReturnType<typeof setTimeout>
    const start = () => {
      t = setTimeout(() => setShown(false), item.action ? 5000 : 2600)
    }
    // در پس‌زمینه زمان‌سنج متوقف می‌شود
    const vis = () => (document.hidden ? clearTimeout(t) : start())
    start()
    document.addEventListener('visibilitychange', vis)
    return () => {
      clearTimeout(t)
      document.removeEventListener('visibilitychange', vis)
    }
  }, [item])

  if (!item) return null
  return createPortal(
    <div className="pointer-events-none fixed inset-x-0 bottom-[calc(84px+env(safe-area-inset-bottom))] z-[60] flex justify-center px-4">
      <div
        className="toast-enter pointer-events-auto flex max-w-md items-center gap-3 rounded-2xl bg-ink px-4 py-3 text-sm text-bg shadow-lg"
        style={{ transform: shown ? 'translateY(0)' : 'translateY(16px)', opacity: shown ? 1 : 0 }}
        onTransitionEnd={() => !shown && setItem(null)}
      >
        <span>{item.text}</span>
        {item.action && (
          <button
            className="press font-bold text-accent-soft"
            onClick={() => {
              item.action!.run()
              setShown(false)
            }}
          >
            {item.action.label}
          </button>
        )}
      </div>
    </div>,
    document.body,
  )
}
