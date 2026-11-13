import { useEffect, useMemo, useState } from 'react'
import { useLiveQuery } from 'dexie-react-hooks'
import { Bar, Line } from 'react-chartjs-2'
import { Activity, Settings2 } from 'lucide-react'
import { db, getSetting, setSetting } from '../db/db'
import { addDaysKey, diffDays, jDayMonth, jLong, todayKey, rangeKeys } from '../lib/date'
import { fa, num } from '../lib/format'
import { baseOptions, css } from '../lib/chart'
import { Button, Card, Empty, Label, NumberField, PageHeader, Progress, Segmented, Stat } from '../ui/kit'
import { Sheet } from '../ui/Sheet'
import { HealthQuick, CheckIn } from './health-shared'
import { useStagger } from '../lib/anim'
import { DateField } from '../ui/DatePicker'

type Range = '7' | '30' | '90' | '365' | 'all'

function bmiLabel(b: number) {
  if (b < 18.5) return 'کمبود وزن'
  if (b < 25) return 'نرمال'
  if (b < 30) return 'اضافه وزن'
  return 'چاقی'
}

export default function Health() {
  const [range, setRange] = useState<Range>('30')
  const [profileOpen, setProfileOpen] = useState(false)
  const all = useLiveQuery(() => db.health.orderBy('date').toArray(), []) || []
  const profile = useLiveQuery(async () => ({
    height: await getSetting<number | undefined>('height', undefined),
    target: await getSetting<number | undefined>('targetWeight', undefined),
    targetDate: await getSetting<string | undefined>('targetDate', undefined),
  }), [])
  const ref = useStagger<HTMLDivElement>([])

  const today = todayKey()
  const data = useMemo(() => {
    const weights = all.filter((h) => h.weight)
    const first = all[0]?.date || today
    const from = range === 'all' ? first : addDaysKey(today, -Number(range) + 1)
    const keys = rangeKeys(from < first && range === 'all' ? first : from, today)
    const map = new Map(all.map((h) => [h.date, h]))
    const w = keys.map((k) => map.get(k)?.weight ?? null)
    // میانگین متحرک ۷ روزه روی داده‌های موجود
    const ma = keys.map((k) => {
      const win = rangeKeys(addDaysKey(k, -6), k).map((x) => map.get(x)?.weight).filter((x): x is number => !!x)
      return win.length ? win.reduce((s, x) => s + x, 0) / win.length : null
    })
    const pai = keys.map((k) => map.get(k)?.pai ?? 0)
    const latest = weights.at(-1)?.weight
    const weekAgo = weights.filter((h) => h.date <= addDaysKey(today, -7)).at(-1)?.weight
    const monthAgo = weights.filter((h) => h.date <= addDaysKey(today, -30)).at(-1)?.weight
    const pai7 = rangeKeys(addDaysKey(today, -6), today).reduce((s, k) => s + (map.get(k)?.pai ?? 0), 0)
    const paiDays30 = rangeKeys(addDaysKey(today, -29), today).map((k) => map.get(k)?.pai).filter((x): x is number => x !== undefined)
    // روند خطی ۳۰ روز اخیر (کیلو در روز)
    const recent = weights.filter((h) => h.date >= addDaysKey(today, -30))
    let slope: number | undefined
    if (recent.length >= 5) {
      const xs = recent.map((h) => diffDays(h.date, today))
      const ys = recent.map((h) => h.weight!)
      const mx = xs.reduce((a, b) => a + b, 0) / xs.length
      const my = ys.reduce((a, b) => a + b, 0) / ys.length
      const den = xs.reduce((s, x) => s + (x - mx) ** 2, 0)
      slope = den ? xs.reduce((s, x, i) => s + (x - mx) * (ys[i] - my), 0) / den : undefined
    }
    const startWeight = weights[0]?.weight
    return { keys, w, ma, pai, latest, weekAgo, monthAgo, pai7, paiAvg: paiDays30.length ? paiDays30.reduce((a, b) => a + b, 0) / paiDays30.length : undefined, slope, startWeight, hasData: weights.length > 0 || all.some((h) => h.pai) }
  }, [all, range, today])

  const target = profile?.target
  const bmi = data.latest && profile?.height ? data.latest / (profile.height / 100) ** 2 : undefined
  let forecast: string | undefined
  if (target && data.latest && data.slope && Math.sign(target - data.latest) === Math.sign(data.slope) && Math.abs(data.slope) > 0.005) {
    const days = Math.round((target - data.latest) / data.slope)
    if (days > 0 && days < 1500) forecast = addDaysKey(today, days)
  }
  const progress = target && data.startWeight && data.latest && data.startWeight !== target ? (data.startWeight - data.latest) / (data.startWeight - target) : undefined

  const labels = data.keys.map((k) => jDayMonth(k))
  const opt = baseOptions()
  const accent = css('--accent')
  const muted = css('--muted')
  const warn = css('--warn')

  return (
    <div>
      <PageHeader
        title="سلامت"
        sub="وزن، PAI و حال روزانه"
        back
        action={
          <button className="press grid size-10 place-items-center rounded-full bg-surface-2" onClick={() => setProfileOpen(true)} aria-label="تنظیمات سلامت">
            <Settings2 size={19} />
          </button>
        }
      />
      <div ref={ref} className="space-y-3">
        <Card title="ثبت امروز">
          <HealthQuick />
        </Card>

        {!data.hasData ? (
          <Card>
            <Empty icon={<Activity />} title="هنوز داده‌ای ثبت نشده" text="از امروز وزن و PAI ساعتت را وارد کن. بعد از چند روز، نمودار و روندت اینجا نمایش داده می‌شود." />
          </Card>
        ) : (
          <>
            <Card>
              <div className="grid grid-cols-3 gap-3">
                <Stat label="آخرین وزن" value={data.latest ? fa(data.latest) : '—'} sub="کیلوگرم" />
                <Stat
                  label="تغییر هفتگی"
                  value={data.latest && data.weekAgo ? `${data.latest - data.weekAgo > 0 ? '+' : ''}${fa((data.latest - data.weekAgo).toFixed(1))}` : '—'}
                  tone={data.latest && data.weekAgo ? (data.latest - data.weekAgo <= 0 ? 'good' : 'bad') : undefined}
                  sub="نسبت به ۷ روز پیش"
                />
                <Stat
                  label="تغییر ماهانه"
                  value={data.latest && data.monthAgo ? `${data.latest - data.monthAgo > 0 ? '+' : ''}${fa((data.latest - data.monthAgo).toFixed(1))}` : '—'}
                  tone={data.latest && data.monthAgo ? (data.latest - data.monthAgo <= 0 ? 'good' : 'bad') : undefined}
                  sub="نسبت به ۳۰ روز پیش"
                />
              </div>
              {target && progress !== undefined && (
                <div className="mt-4">
                  <div className="mb-1.5 flex justify-between text-xs">
                    <span className="text-muted">تا وزن هدف ({fa(target)} کیلو)</span>
                    <span className="font-bold">{data.latest ? `${fa(Math.abs(data.latest - target).toFixed(1))} کیلو مانده` : ''}</span>
                  </div>
                  <Progress value={progress} />
                  {forecast && <p className="mt-2 text-xs text-muted">با روند ۳۰ روز اخیر، حدود <b className="text-ink">{jLong(forecast)}</b> به هدف می‌رسی.</p>}
                </div>
              )}
              {bmi && (
                <p className="mt-3 text-sm">
                  شاخص تودهٔ بدنی: <b className="tnum">{fa(bmi.toFixed(1))}</b> <span className="text-muted">({bmiLabel(bmi)})</span>
                </p>
              )}
            </Card>

            <Segmented
              value={range}
              onChange={setRange}
              options={[
                { value: '7', label: '۷ روز' },
                { value: '30', label: '۳۰ روز' },
                { value: '90', label: '۹۰ روز' },
                { value: '365', label: 'سال' },
                { value: 'all', label: 'همه' },
              ]}
            />

            <Card title="نمودار وزن">
              <div className="h-56">
                <Line
                  data={{
                    labels,
                    datasets: [
                      { label: 'وزن', data: data.w, borderColor: muted, backgroundColor: muted, pointRadius: data.keys.length > 60 ? 0 : 2.5, borderWidth: 1, spanGaps: true, tension: 0.3 },
                      { label: 'میانگین ۷ روزه', data: data.ma, borderColor: accent, borderWidth: 2.5, pointRadius: 0, spanGaps: true, tension: 0.4 },
                      ...(target ? [{ label: 'هدف', data: data.keys.map(() => target), borderColor: warn, borderDash: [5, 5], borderWidth: 1.5, pointRadius: 0 }] : []),
                    ],
                  }}
                  options={{ ...opt, scales: { ...opt.scales, y: { ...opt.scales.y, grace: '5%' } } }}
                />
              </div>
              <div className="mt-2 flex gap-4 text-xs text-muted">
                <span className="flex items-center gap-1.5"><i className="size-2 rounded-full" style={{ background: muted }} />وزن روزانه</span>
                <span className="flex items-center gap-1.5"><i className="h-0.5 w-3 rounded" style={{ background: accent }} />میانگین ۷ روزه</span>
                {target && <span className="flex items-center gap-1.5"><i className="h-0.5 w-3 rounded" style={{ background: warn }} />هدف</span>}
              </div>
            </Card>

            <Card title="PAI">
              <div className="mb-3 grid grid-cols-2 gap-3">
                <Stat label="مجموع ۷ روز اخیر" value={num(data.pai7)} sub={data.pai7 >= 100 ? 'به هدف ۱۰۰ رسیدی' : `${num(100 - data.pai7)} تا هدف ۱۰۰`} tone={data.pai7 >= 100 ? 'good' : undefined} />
                <Stat label="میانگین روزانه (۳۰ روز)" value={data.paiAvg !== undefined ? num(data.paiAvg, 1) : '—'} />
              </div>
              <Progress value={data.pai7 / 100} className="mb-4" />
              <div className="h-44">
                <Bar
                  data={{ labels, datasets: [{ label: 'PAI', data: data.pai, backgroundColor: accent, borderRadius: 4, maxBarThickness: 18 }] }}
                  options={opt}
                />
              </div>
            </Card>
          </>
        )}

        <Card title="چک‌این امروز">
          <CheckIn />
        </Card>

        <HealthHistory />
      </div>

      <ProfileSheet open={profileOpen} onClose={() => setProfileOpen(false)} profile={profile} />
    </div>
  )
}

function HealthHistory() {
  const rows = useLiveQuery(() => db.health.orderBy('date').reverse().limit(14).toArray(), []) || []
  if (!rows.length) return null
  return (
    <Card title="ثبت‌های اخیر">
      <div className="divide-y divide-line text-sm">
        {rows.map((r) => (
          <div key={r.date} className="flex items-center justify-between py-2.5">
            <span className="text-muted">{jDayMonth(r.date)}</span>
            <span className="tnum flex gap-4">
              <span>{r.weight ? `${fa(r.weight)} کیلو` : '—'}</span>
              <span className="w-16 text-start text-muted">PAI {r.pai !== undefined ? fa(r.pai) : '—'}</span>
            </span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function ProfileSheet({ open, onClose, profile }: { open: boolean; onClose: () => void; profile?: { height?: number; target?: number; targetDate?: string } }) {
  const [h, setH] = useState<number | undefined>()
  const [t, setT] = useState<number | undefined>()
  const [d, setD] = useState<string | undefined>()
  useEffect(() => {
    if (!open) return
    setH(profile?.height)
    setT(profile?.target)
    setD(profile?.targetDate)
  }, [open, profile])
  return (
    <Sheet
      open={open}
      onClose={onClose}
      title="مشخصات سلامت"
      footer={
        <Button
          block
          onClick={async () => {
            await setSetting('height', h)
            await setSetting('targetWeight', t)
            await setSetting('targetDate', d)
            onClose()
          }}
        >
          ذخیره
        </Button>
      }
    >
      <div>
        <Label>قد</Label>
        <NumberField value={h} onChange={setH} suffix="سانتی‌متر" placeholder="۱۷۵" />
        <Label hint="برای نوار پیشرفت و پیش‌بینی">وزن هدف</Label>
        <NumberField value={t} onChange={setT} suffix="کیلو" placeholder="۷۰" />
        <Label hint="اختیاری">تاریخ هدف</Label>
        {d ? <DateField value={d} onChange={setD} /> : <Button variant="soft" block onClick={() => setD(addDaysKey(todayKey(), 90))}>تعیین تاریخ</Button>}
      </div>
    </Sheet>
  )
}
