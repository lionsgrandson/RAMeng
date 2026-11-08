import type { DocumentColumn } from '../types'
import { documentColumns } from '../lib/documentColumns'
import { useColumnReorder } from './ColumnReorder'

export default function DocumentColumns({ value, defaults, onChange, disabled = false }: { value?: DocumentColumn[]; defaults: DocumentColumn[]; onChange: (columns: DocumentColumn[]) => void; disabled?: boolean }) {
  const columns = documentColumns(value, defaults)
  const reorder = useColumnReorder(columns, onChange, disabled)
  const move = (index: number, direction: number) => {
    const next = columns.map(column => ({ ...column }))
    const target = index + direction
    if (target < 0 || target >= next.length) return
    ;[next[index], next[target]] = [next[target], next[index]]
    onChange(next)
  }
  return <details className="document-columns report-template-controls"><summary>עמודות להפקה — בחירה וסדר</summary><p>הבחירה נשמרת במסמך ומשמשת להדפסה ולייצוא. הסתרה אינה מוחקת תוכן.</p><div>{columns.map((column, index) => <div className="document-column-row" key={column.key} {...reorder.dropProps(column.key)}>{reorder.handle(column)}<label><input type="checkbox" checked={column.visible} disabled={disabled || (column.visible && columns.filter(item => item.visible).length === 1)} onChange={event => onChange(columns.map(item => item.key === column.key ? { ...item, visible: event.target.checked } : item))} />{column.label}</label><button type="button" className="secondary" aria-label={`הקדמת ${column.label}`} disabled={disabled || index === 0} onClick={() => move(index, -1)}>↑</button><button type="button" className="secondary" aria-label={`העברת ${column.label} לסוף`} disabled={disabled || index === columns.length - 1} onClick={() => move(index, 1)}>↓</button></div>)}</div><span className="column-reorder-status" role="status" aria-live="polite">{reorder.message}</span></details>
}
