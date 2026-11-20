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
    // اگر صفحه در پس‌زمینه باشد انیمیشن اجرا نمی‌شود؛ عدد نهایی در هر حال نمایش داده می‌شود
    const done = setTimeout(() => setShown(value), duration + 150)
    return () => {
      a.pause()
      clearTimeout(done)
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

/** چند قلب کوچک که از دکمه بالا می‌روند (تم حنا) */
export function heartBurst(el: Element | null) {
  if (!el || reduced()) return
  const r = el.getBoundingClientRect()
  const cx = r.left + r.width / 2
  const cy = r.top + r.height / 2
  const hearts = Array.from({ length: 6 }, (_, i) => {
    const h = document.createElement('span')
    h.className = 'heart-burst'
    h.textContent = i % 3 === 0 ? '✿' : '♥'
    h.style.left = `${cx - 7}px`
    h.style.top = `${cy - 8}px`
    document.body.appendChild(h)
    setTimeout(() => h.remove(), 1200)
    return h
  })
  hearts.forEach((h, i) => {
    const angle = (-90 + (i - 2.5) * 28) * (Math.PI / 180)
    const dist = 26 + Math.random() * 18
    animate(h, {
      translateX: [0, Math.cos(angle) * dist],
      translateY: [0, Math.sin(angle) * dist - 10],
      scale: [0.4, 1.1, 0.8],
      opacity: [1, 1, 0],
      rotate: [0, (Math.random() - 0.5) * 60],
      duration: 650 + Math.random() * 200,
      ease: 'outQuart',
      onComplete: () => h.remove(),
    })
  })
}
