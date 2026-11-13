import type { Goal, GoalLevel, HealthEntry, Task } from '../db/types'

export const LEVELS: { value: GoalLevel; label: string; hint: string }[] = [
  { value: 'vision', label: 'بلندمدت', hint: 'چشم‌انداز ۳ تا ۵ سال' },
  { value: 'year', label: 'سالانه', hint: 'تا پایان سال' },
  { value: 'quarter', label: 'فصلی', hint: 'سه ماه' },
  { value: 'month', label: 'ماهانه', hint: 'این ماه' },
  { value: 'week', label: 'هفتگی', hint: 'این هفته' },
]
export const levelLabel = (l: GoalLevel) => LEVELS.find((x) => x.value === l)!.label
export const parentLevel = (l: GoalLevel): GoalLevel | undefined => {
  const i = LEVELS.findIndex((x) => x.value === l)
  return i > 0 ? LEVELS[i - 1].value : undefined
}

export const STATUS = { active: 'فعال', done: 'انجام شد', paused: 'متوقف', dropped: 'رها شد' } as const

export interface GoalCtx {
  goals: Goal[]
  tasks: Task[]
  latestWeight?: number
  balances: Map<number, number>
}

export function goalProgress(g: Goal, ctx: GoalCtx, depth = 0): number {
  if (g.status === 'done') return 1
  const m = g.metric
  switch (m.kind) {
    case 'check':
      return m.done ? 1 : 0
    case 'number': {
      const start = m.start ?? 0
      const span = (m.target ?? 0) - start
      return span ? ((m.current ?? start) - start) / span : 0
    }
    case 'tasks': {
      const ts = ctx.tasks.filter((t) => t.goalId === g.id && t.status !== 'dropped')
      return ts.length ? ts.filter((t) => t.status === 'done').length / ts.length : 0
    }
    case 'children': {
      if (depth > 6) return 0
      const kids = ctx.goals.filter((x) => x.parentId === g.id && x.status !== 'dropped')
      return kids.length ? kids.reduce((s, k) => s + clamp01(goalProgress(k, ctx, depth + 1)), 0) / kids.length : 0
    }
    case 'weight': {
      if (ctx.latestWeight === undefined || m.start === undefined || m.target === undefined) return 0
      const span = m.start - m.target
      return span ? (m.start - ctx.latestWeight) / span : 0
    }
    case 'account': {
      if (m.accountId === undefined || !m.target) return 0
      return (ctx.balances.get(m.accountId) ?? 0) / m.target
    }
  }
}

export const clamp01 = (v: number) => Math.max(0, Math.min(1, v || 0))

export function latestWeight(h: HealthEntry[]) {
  for (let i = h.length - 1; i >= 0; i--) if (h[i].weight) return h[i].weight
  return undefined
}

export const METRICS: { value: Goal['metric']['kind']; label: string; hint: string }[] = [
  { value: 'check', label: 'انجام شد / نشد', hint: 'یک تیک ساده' },
  { value: 'number', label: 'عدد', hint: 'مثل ۲۰ کتاب یا ۱۰۰ کیلومتر' },
  { value: 'tasks', label: 'تسک‌های متصل', hint: 'درصد تسک‌های انجام‌شدهٔ این هدف' },
  { value: 'children', label: 'زیرهدف‌ها', hint: 'میانگین پیشرفت زیرهدف‌ها' },
  { value: 'weight', label: 'وزن', hint: 'خودکار از نمودار وزن' },
  { value: 'account', label: 'پس‌انداز', hint: 'خودکار از موجودی یک حساب' },
]
