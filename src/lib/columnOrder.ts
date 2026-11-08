// Keep unknown/new columns in their existing order and ignore obsolete saved keys.
export function orderedColumns<T extends { key: string }>(columns: T[], order: string[]) {
  const rank = new Map(order.map((key, index) => [key, index]))
  return [...columns].sort((a, b) => (rank.get(a.key) ?? order.length) - (rank.get(b.key) ?? order.length))
}

export function reorderColumn<T extends { key: string }>(columns: T[], source: string, target: string) {
  const from = columns.findIndex(column => column.key === source)
  const to = columns.findIndex(column => column.key === target)
  if (from < 0 || to < 0 || from === to) return columns
  const next = [...columns]
  const [column] = next.splice(from, 1)
  next.splice(to, 0, column)
  return next
}
