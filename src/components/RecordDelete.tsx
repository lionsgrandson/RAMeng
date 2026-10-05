import { useState } from 'react'
import { Trash2 } from 'lucide-react'
import { Modal } from './common'

export default function DeleteButton({ label = 'מחיקה', message, onConfirm }: { label?: string; message: string; onConfirm: () => void }) {
  const [confirming, setConfirming] = useState(false)
  return <>
    <button type="button" className="secondary danger" onClick={() => setConfirming(true)}><Trash2 /> {label}</button>
    {confirming && <Modal title="אישור מחיקה" onClose={() => setConfirming(false)}>
      <p>{message}</p>
      <div className="form-actions">
        <button type="button" className="secondary" onClick={() => setConfirming(false)}>ביטול</button>
        <button type="button" className="primary danger" onClick={() => { setConfirming(false); onConfirm() }}>אישור מחיקה</button>
      </div>
    </Modal>}
  </>
}
