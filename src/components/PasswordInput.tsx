import { useId, useState, type InputHTMLAttributes } from 'react'
import { Eye, EyeOff } from 'lucide-react'

export default function PasswordInput(props: Omit<InputHTMLAttributes<HTMLInputElement>, 'type'>) {
  const generatedId = useId()
  const id = props.id || generatedId
  const [visible, setVisible] = useState(false)
  return <span className="password-input"><input {...props} id={id} type={visible ? 'text' : 'password'} /><button type="button" className="icon-btn" disabled={props.disabled} aria-controls={id} aria-pressed={visible} aria-label={visible ? 'הסתרת סיסמה' : 'הצגת סיסמה'} onClick={() => setVisible(value => !value)}>{visible ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></span>
}
