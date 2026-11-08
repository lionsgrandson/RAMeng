import { useRef, useState, type DragEvent } from 'react'
import { GripVertical } from 'lucide-react'
import { reorderColumn } from '../lib/columnOrder'

export function useColumnReorder<T extends { key: string; label: string }>(columns: T[], onChange: (columns: T[]) => void, disabled = false, rtl = true) {
  const source = useRef<string | null>(null)
  const [over, setOver] = useState<string | null>(null)
  const [message, setMessage] = useState('')
  const clear = () => { source.current = null; setOver(null) }
  const move = (key: string, target: string) => {
    const next = reorderColumn(columns, key, target)
    if (next === columns) return
    onChange(next)
    setMessage(`${columns.find(column => column.key === key)?.label} — מיקום ${next.findIndex(column => column.key === key) + 1}`)
  }
  return {
    message,
    dropProps: (key: string) => ({
      'data-column-drop': over === key || undefined,
      onDragOver: (event: DragEvent) => { if (!disabled && source.current && source.current !== key) { event.preventDefault(); event.dataTransfer.dropEffect = 'move'; setOver(key) } },
      onDrop: (event: DragEvent) => { if (!disabled && source.current) { event.preventDefault(); move(source.current, key) } clear() },
      onDragLeave: () => setOver(current => current === key ? null : current),
    }),
    handle: (column: T) => <button type="button" className="icon-btn column-drag-handle" disabled={disabled} draggable={!disabled}
      aria-label={`הזזת עמודה ${column.label}`} title="גרירה לשינוי סדר; במקלדת השתמשו בחצים. Home להתחלה, End לסוף"
      onDragStart={event => { if (disabled) return; source.current = column.key; event.dataTransfer.effectAllowed = 'move'; event.dataTransfer.setData('text/plain', column.key) }}
      onDragEnd={clear}
      onKeyDown={event => {
        if (disabled) return
        const index = columns.findIndex(item => item.key === column.key)
        const previous = event.key === 'ArrowUp' || event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')
        const next = event.key === 'ArrowDown' || event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')
        const target = event.key === 'Home' ? columns[0] : event.key === 'End' ? columns.at(-1) : columns[index + (previous ? -1 : next ? 1 : 0)]
        if (previous || next || event.key === 'Home' || event.key === 'End') { event.preventDefault(); if (target) move(column.key, target.key) }
      }}><GripVertical aria-hidden="true" /></button>,
  }
}
