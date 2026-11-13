import {
  BarController, BarElement, CategoryScale, Chart, Filler, Legend, LinearScale, LineController,
  LineElement, PointElement, Tooltip, ArcElement, DoughnutController,
} from 'chart.js'
import { fa } from './format'

Chart.register(BarController, BarElement, CategoryScale, Filler, Legend, LinearScale, LineController, LineElement, PointElement, Tooltip, ArcElement, DoughnutController)

Chart.defaults.font.family = "'Vazirmatn Variable', sans-serif"
Chart.defaults.font.size = 11
Chart.defaults.animation = { duration: 500, easing: 'easeOutQuart' }

export const css = (v: string) => getComputedStyle(document.documentElement).getPropertyValue(v).trim()

export function baseOptions() {
  const muted = css('--muted')
  const line = css('--line')
  Chart.defaults.color = muted
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: { mode: 'index' as const, intersect: false },
    plugins: {
      legend: { display: false },
      tooltip: {
        rtl: true,
        textDirection: 'rtl',
        padding: 10,
        cornerRadius: 10,
        callbacks: {
          label: (c: { dataset: { label?: string }; parsed: { y: number | null } }) =>
            `${c.dataset.label ?? ''}: ${c.parsed.y === null ? '—' : fa(Math.round(c.parsed.y * 10) / 10)}`,
        },
      },
    },
    scales: {
      x: { grid: { display: false }, border: { display: false }, ticks: { maxRotation: 0, autoSkip: true, maxTicksLimit: 6 } },
      y: {
        position: 'right' as const,
        grid: { color: line },
        border: { display: false },
        ticks: { maxTicksLimit: 5, callback: (v: string | number) => fa(v) },
      },
    },
  }
}
