import { animate, stagger } from 'animejs'
import { useEffect, useLayoutEffect, useRef, useState, type RefObject } from 'react'

export const reduced = () =>
  typeof matchMedia !== 'undefined' && matchMedia('(prefers-reduced-motion: reduce)').matches

/** ورود پلکانی فرزندان یک ظرف؛ کوتاه چون صفحه‌ها بارها در روز باز می‌شوند */
export function useStagger<T extends HTMLElement>(deps: unknown[] = []): RefObject<T | null> {
  const ref = useRef<T>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    const kids = Array.from(el.children).slice(0, 10) as HTMLElement[]
    if (!kids.length) return
    if (reduced()) {
      animate(kids, { opacity: [0, 1], duration: 160, ease: 'linear' })
      return
    }
    animate(kids, {
      opacity: [0, 1],
      translateY: [8, 0],
      duration: 360,
      delay: stagger(35),
      ease: 'outQuart',
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps)
  return ref
}

/** بازخورد «پاپ» هنگام تیک خوردن */
export function pop(el: Element | null) {
  if (!el || reduced()) return
  animate(el, { scale: [0.82, 1], duration: 420, ease: 'outBack(2.2)' })
}

/** لرزش کوتاه برای خطا */
export function shake(el: Element | null) {
  if (!el || reduced()) return
  animate(el, { translateX: [0, -6, 6, -4, 4, 0], duration: 320, ease: 'inOutSine' })
}

/** شمارش عدد از مقدار قبلی تا مقدار جدید */
export function useCountUp(value: number, duration = 650) {
  const [shown, setShown] = useState(value)
  const prev = useRef(value)
  useEffect(() => {
    const from = prev.current
    prev.current = value
    if (reduced() || from === value) {
      setShown(value)
      return
    }
    const o = { v: from }
    const a = animate(o, {
      v: value,
      duration,
      ease: 'outQuart',
      onUpdate: () => setShown(o.v),
    })
    return () => {
      a.pause()
    }
  }, [value, duration])
  return shown
}

/** لرزش اندروید برای تأیید لمسی */
export const haptic = (ms = 8) => {
  try {
    navigator.vibrate?.(ms)
  } catch {
    /* پشتیبانی نمی‌شود */
  }
}
