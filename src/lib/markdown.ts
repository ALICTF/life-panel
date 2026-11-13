// تبدیل Markdown سبک به HTML امن (بدون HTML خام کاربر)

const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

function inline(s: string) {
  return esc(s)
    .replace(/`([^`]+)`/g, '<code>$1</code>')
    .replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*]+)\*/g, '$1<i>$2</i>')
    .replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener" class="text-accent underline">$1</a>')
    .replace(/(^|\s)#([\p{L}\p{N}_‌]+)/gu, '$1<span class="text-accent">#$2</span>')
}

export const CHECK_RE = /^(\s*)[-*] \[( |x|X)\] (.*)$/

/** HTML یادداشت؛ چک‌لیست‌ها با data-line برای تیک‌زدن مستقیم */
export function renderMd(src: string) {
  const lines = src.split('\n')
  const out: string[] = []
  let list: 'ul' | 'ol' | null = null
  const close = () => {
    if (list) out.push(`</${list}>`)
    list = null
  }
  lines.forEach((line, i) => {
    const c = line.match(CHECK_RE)
    if (c) {
      close()
      const done = c[2] !== ' '
      out.push(
        `<label class="flex items-start gap-2.5 py-1 cursor-pointer" data-line="${i}"><span class="mt-1 grid size-5 shrink-0 place-items-center rounded-md border-2 ${done ? 'border-accent bg-accent text-accent-ink' : 'border-line'}">${done ? '✓' : ''}</span><span class="${done ? 'text-muted line-through' : ''}" style="line-height:1.9">${inline(c[3])}</span></label>`,
      )
      return
    }
    const h = line.match(/^(#{1,3}) (.*)$/)
    if (h) {
      close()
      out.push(`<h${h[1].length}>${inline(h[2])}</h${h[1].length}>`)
      return
    }
    const ul = line.match(/^\s*[-*] (.*)$/)
    const ol = line.match(/^\s*\d+[.)] (.*)$/) || line.match(/^\s*[۰-۹]+[.)] (.*)$/)
    if (ul || ol) {
      const kind = ul ? 'ul' : 'ol'
      if (list !== kind) {
        close()
        out.push(`<${kind}>`)
        list = kind
      }
      out.push(`<li>${inline((ul || ol)![1])}</li>`)
      return
    }
    close()
    if (line.startsWith('> ')) out.push(`<blockquote>${inline(line.slice(2))}</blockquote>`)
    else if (!line.trim()) out.push('<div class="h-3"></div>')
    else out.push(`<p>${inline(line)}</p>`)
  })
  close()
  return out.join('')
}

export function toggleCheckLine(src: string, i: number) {
  const lines = src.split('\n')
  const m = lines[i]?.match(CHECK_RE)
  if (!m) return src
  lines[i] = `${m[1]}- [${m[2] === ' ' ? 'x' : ' '}] ${m[3]}`
  return lines.join('\n')
}

export function plain(src: string) {
  return src
    .replace(CHECK_RE, '$3')
    .replace(/^#{1,3} /gm, '')
    .replace(/[-*] \[( |x|X)\] /g, '☐ ')
    .replace(/\*\*|`/g, '')
}

export function checkStats(src: string) {
  let total = 0
  let done = 0
  for (const l of src.split('\n')) {
    const m = l.match(CHECK_RE)
    if (m) {
      total++
      if (m[2] !== ' ') done++
    }
  }
  return { total, done }
}
