import { useEffect, useRef, useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { X } from 'lucide-react'

let sheetSeq = 0
const stack: number[] = []
let ignorePop = 0

interface Props {
  open: boolean
  onClose: () => void
  title?: ReactNode
  children: ReactNode
  footer?: ReactNode
  full?: boolean
}

/** برگهٔ پایینی با کشیدن برای بستن (با سرعت یا فاصله) */
export function Sheet({ open, onClose, title, children, footer, full }: Props) {
  const [mounted, setMounted] = useState(open)
  const [shown, setShown] = useState(false)
  const panel = useRef<HTMLDivElement>(null)
  const drag = useRef<{ y: number; t: number; dy: number; id: number } | null>(null)

  useEffect(() => {
    if (open) {
      setMounted(true)
      const r = requestAnimationFrame(() => requestAnimationFrame(() => setShown(true)))
      return () => cancelAnimationFrame(r)
    }
    setShown(false)
    const t = setTimeout(() => setMounted(false), 300)
    return () => clearTimeout(t)
  }, [open])

  // دکمهٔ برگشت اندروید برگه را می‌بندد
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!open) return
    const id = ++sheetSeq
    stack.push(id)
    history.pushState({ sheet: id }, '')
    const onPop = () => {
      if (ignorePop > 0) return
      if (stack[stack.length - 1] === id) {
        stack.pop()
        closeRef.current()
      }
    }
    window.addEventListener('popstate', onPop)
    return () => {
      window.removeEventListener('popstate', onPop)
      if (stack[stack.length - 1] === id) {
        stack.pop()
        if (history.state?.sheet === id) {
          ignorePop++
          history.back()
          setTimeout(() => ignorePop--, 400)
        }
      }
    }
  }, [open])

  useEffect(() => {
    if (!mounted) return
    const prev = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    return () => {
      document.body.style.overflow = prev
    }
  }, [mounted])

  if (!mounted) return null

  const onDown = (e: React.PointerEvent) => {
    if (drag.current) return
    drag.current = { y: e.clientY, t: Date.now(), dy: 0, id: e.pointerId }
    ;(e.currentTarget as HTMLElement).setPointerCapture(e.pointerId)
    if (panel.current) panel.current.style.transition = 'none'
  }
  const onMove = (e: React.PointerEvent) => {
    const d = drag.current
    if (!d || d.id !== e.pointerId || !panel.current) return
    let dy = e.clientY - d.y
    if (dy < 0) dy = -Math.sqrt(-dy) * 2 // اصطکاک به سمت بالا
    d.dy = dy
    panel.current.style.transform = `translateY(${dy}px)`
  }
  const onUp = () => {
    const d = drag.current
    drag.current = null
    if (!d || !panel.current) return
    panel.current.style.transition = ''
    panel.current.style.transform = ''
    const v = d.dy / Math.max(1, Date.now() - d.t)
    if (d.dy > 120 || v > 0.5) onClose()
  }

  return createPortal(
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true">
      <div
        className="sheet-backdrop absolute inset-0 bg-black/40"
        style={{ opacity: shown ? 1 : 0 }}
        onClick={onClose}
      />
      <div
        ref={panel}
        className={`sheet-panel absolute inset-x-0 bottom-0 mx-auto flex max-w-xl flex-col rounded-t-[28px] bg-surface ${full ? 'h-[94dvh]' : 'max-h-[92dvh]'}`}
        style={{ transform: shown ? 'translateY(0)' : 'translateY(100%)' }}
      >
        <div
          className="flex shrink-0 cursor-grab touch-none flex-col items-center pt-2.5"
          onPointerDown={onDown}
          onPointerMove={onMove}
          onPointerUp={onUp}
          onPointerCancel={onUp}
        >
          <div className="h-1.5 w-10 rounded-full bg-line" />
          {title !== undefined && (
            <div className="flex w-full items-center justify-between px-5 pt-3 pb-2">
              <h2 className="text-lg font-bold">{title}</h2>
              <button
                className="press -me-2 grid size-9 place-items-center rounded-full text-muted"
                onPointerDown={(e) => e.stopPropagation()}
                onClick={onClose}
                aria-label="بستن"
              >
                <X size={20} />
              </button>
            </div>
          )}
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-5 pb-4">{children}</div>
        {footer && <div className="safe-bottom shrink-0 border-t border-line px-5 pt-3 pb-3">{footer}</div>}
        {!footer && <div className="safe-bottom" />}
      </div>
    </div>,
    document.body,
  )
}
