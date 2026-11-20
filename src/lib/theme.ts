import { useEffect, useState } from 'react'

/** حالت روشنایی */
export type Theme = 'system' | 'light' | 'dark'
/** تم ظاهری (رنگ و طراحی) */
export type Skin = 'forest' | 'ocean' | 'sunset' | 'mono' | 'hana'

export const SKINS: { id: Skin; name: string; desc: string; swatch: string[] }[] = [
  { id: 'forest', name: 'جنگل', desc: 'سبز آرام؛ طراحی پیش‌فرض', swatch: ['#f4f3ef', '#15803d', '#dcfce7', '#1c1b19'] },
  { id: 'ocean', name: 'اقیانوس', desc: 'آبی و فیروزه‌ای، گوشه‌های نرم', swatch: ['#eef5f8', '#0369a1', '#e0f2fe', '#0f2533'] },
  { id: 'sunset', name: 'غروب', desc: 'نارنجی و کهربایی گرم', swatch: ['#fbf4ec', '#c2410c', '#ffedd5', '#2b1a10'] },
  { id: 'mono', name: 'مینیمال', desc: 'سیاه و سفید، خطوط تیز، بدون سایه', swatch: ['#ffffff', '#111111', '#f1f1f1', '#111111'] },
  { id: 'hana', name: 'حنا', desc: 'صورتی، گرد و گوگولی 🎀', swatch: ['#fff0f6', '#ec4899', '#fce7f3', '#6b2147'] },
]

const readTheme = (): Theme => {
  try {
    return (localStorage.getItem('theme') as Theme) || 'system'
  } catch {
    return 'system'
  }
}
const readSkin = (): Skin => {
  try {
    return (localStorage.getItem('skin') as Skin) || 'forest'
  } catch {
    return 'forest'
  }
}

function syncMeta() {
  // رنگ نوار بالای گوشی با پس‌زمینهٔ تم یکی می‌شود
  requestAnimationFrame(() => {
    const bg = getComputedStyle(document.documentElement).getPropertyValue('--bg').trim()
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', bg || '#f4f3ef')
  })
}

export function applyTheme(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  syncMeta()
}

export function applySkin(s: Skin) {
  document.documentElement.dataset.skin = s
  syncMeta()
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(readTheme)
  const [skin, setSkinState] = useState<Skin>(readSkin)
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])
  useEffect(() => applySkin(skin), [skin])
  const save = (k: string, v: string) => {
    try {
      localStorage.setItem(k, v)
    } catch {
      /* حافظهٔ مرورگر در دسترس نیست */
    }
    window.dispatchEvent(new Event('themechange'))
  }
  const setTheme = (t: Theme) => {
    setThemeState(t)
    save('theme', t)
  }
  const setSkin = (s: Skin) => {
    setSkinState(s)
    save('skin', s)
  }
  useEffect(() => {
    const on = () => {
      setThemeState(readTheme())
      setSkinState(readSkin())
    }
    window.addEventListener('themechange', on)
    return () => window.removeEventListener('themechange', on)
  }, [])
  return { theme, setTheme, skin, setSkin }
}

export const isDark = () => document.documentElement.classList.contains('dark')
export const currentSkin = () => (document.documentElement.dataset.skin as Skin) || 'forest'
