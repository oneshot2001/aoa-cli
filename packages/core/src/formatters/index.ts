import Table from 'cli-table3'
import yaml from 'js-yaml'

export type OutputFormat = 'table' | 'json' | 'jsonl' | 'csv' | 'yaml'

/**
 * Format an array of flat objects (or a single object) into the requested output format.
 * All commands should call this instead of doing inline formatting.
 */
export function formatOutput(
  data: Record<string, unknown> | Record<string, unknown>[],
  fmt: string
): string {
  const rows = Array.isArray(data) ? data : [data]

  switch (fmt) {
    case 'json':
      return JSON.stringify(rows.length === 1 ? rows[0] : rows, null, 2)

    case 'jsonl':
      return rows.map((r) => JSON.stringify(r)).join('\n')

    case 'csv':
      return formatCsv(rows)

    case 'yaml':
      return yaml.dump(rows.length === 1 ? rows[0] : rows, { lineWidth: 120 }).trimEnd()

    case 'table':
    default:
      return formatTable(rows)
  }
}

function formatTable(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return '(no data)'
  const first = rows[0]!
  const keys = Object.keys(first)
  const table = new Table({ head: keys })
  for (const row of rows) {
    table.push(keys.map((k) => String(row[k] ?? '')))
  }
  return table.toString()
}

function formatCsv(rows: Record<string, unknown>[]): string {
  if (rows.length === 0) return ''
  const first = rows[0]!
  const keys = Object.keys(first)
  const escape = (v: unknown) => {
    const s = String(v ?? '')
    return s.includes(',') || s.includes('"') || s.includes('\n')
      ? `"${s.replace(/"/g, '""')}"`
      : s
  }
  const header = keys.map(escape).join(',')
  const lines = rows.map((r) => keys.map((k) => escape(r[k])).join(','))
  return [header, ...lines].join('\n')
}
