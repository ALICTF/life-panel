import { useEffect, useState } from 'react'

export type Theme = 'system' | 'light' | 'dark'

const read = (): Theme => {
  try {
    return (localStorage.getItem('theme') as Theme) || 'system'
  } catch {
    return 'system'
  }
}

export function applyTheme(t: Theme) {
  const dark = t === 'dark' || (t === 'system' && matchMedia('(prefers-color-scheme: dark)').matches)
  document.documentElement.classList.toggle('dark', dark)
  const meta = document.querySelector('meta[name="theme-color"]')
  meta?.setAttribute('content', dark ? '#0e0f0e' : '#f4f3ef')
}

export function useTheme() {
  const [theme, setThemeState] = useState<Theme>(read)
  useEffect(() => {
    applyTheme(theme)
    if (theme !== 'system') return
    const mq = matchMedia('(prefers-color-scheme: dark)')
    const on = () => applyTheme('system')
    mq.addEventListener('change', on)
    return () => mq.removeEventListener('change', on)
  }, [theme])
  const setTheme = (t: Theme) => {
    try {
      localStorage.setItem('theme', t)
    } catch {
      /* حافظهٔ مرورگر در دسترس نیست */
    }
    setThemeState(t)
    window.dispatchEvent(new Event('themechange'))
  }
  useEffect(() => {
    const on = () => setThemeState(read())
    window.addEventListener('themechange', on)
    return () => window.removeEventListener('themechange', on)
  }, [])
  return { theme, setTheme }
}

export const isDark = () => document.documentElement.classList.contains('dark')
