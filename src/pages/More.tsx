import { Link } from 'react-router-dom'
import { useLiveQuery } from 'dexie-react-hooks'
import { Activity, ChevronLeft, Compass, GraduationCap, NotebookPen, NotebookText, Settings } from 'lucide-react'
import { db } from '../db/db'
import { fa } from '../lib/format'
import { PageHeader } from '../ui/kit'
import { useStagger } from '../lib/anim'

export default function More() {
  const counts = useLiveQuery(async () => ({
    goals: await db.goals.where('status').equals('active').count(),
    notes: await db.notes.where('deleted').equals(0).count(),
    health: await db.health.count(),
    reviews: await db.reviews.count(),
    learn: await db.learn.where('status').equals('active').count(),
  }), [])
  const ref = useStagger<HTMLDivElement>([])
  const items = [
    { to: '/goals', icon: Compass, title: 'اهداف', sub: counts ? `${fa(counts.goals)} هدف فعال` : '', color: '#4f46e5' },
    { to: '/learn', icon: GraduationCap, title: 'یادگیری', sub: counts?.learn ? `${fa(counts.learn)} مورد فعال` : 'زبان، مهارت، کتاب', color: '#0d9488' },
    { to: '/health', icon: Activity, title: 'سلامت', sub: 'نمودار وزن و PAI', color: '#e11d48' },
    { to: '/notes', icon: NotebookText, title: 'یادداشت‌ها', sub: counts ? `${fa(counts.notes)} یادداشت` : '', color: '#ca8a04' },
    { to: '/reviews', icon: NotebookPen, title: 'مرورها', sub: 'هفتگی، ماهانه، سالانه', color: '#ea580c' },
    { to: '/settings', icon: Settings, title: 'تنظیمات', sub: 'ظاهر، دسته‌ها، پشتیبان', color: '#57534e' },
  ]
  return (
    <div>
      <PageHeader title="بیشتر" />
      <div ref={ref} className="grid grid-cols-2 gap-3">
        {items.map(({ to, icon: Icon, title, sub, color }, i) => (
          <Link key={to} to={to} className={`card press flex flex-col p-4 ${i === items.length - 1 ? 'col-span-2 flex-row items-center gap-3' : ''}`}>
            <span className="grid size-11 place-items-center rounded-2xl text-white" style={{ background: color }}>
              <Icon size={22} />
            </span>
            <span className={i === items.length - 1 ? 'flex-1' : 'mt-3'}>
              <span className="block font-bold">{title}</span>
              <span className="block text-xs text-muted">{sub}</span>
            </span>
            {i === items.length - 1 && <ChevronLeft size={18} className="text-muted" />}
          </Link>
        ))}
      </div>
    </div>
  )
}
