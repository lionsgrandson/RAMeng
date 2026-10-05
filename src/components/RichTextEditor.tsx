import { useEffect, useMemo, useState } from 'react'
import { EditorContent, useEditor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import Image from '@tiptap/extension-image'
import TextAlign from '@tiptap/extension-text-align'
import { TextStyleKit } from '@tiptap/extension-text-style'
import { safeMailHtml } from '../lib/mailHtml'

// The built-in resize view updates dimensions during dragging. Also reflect
// attributes changed by the numeric width control or restored from a draft.
const ResizableImage = Image.extend({
  addNodeView() {
    const renderer = this.parent?.()
    if (!renderer) return null
    return (props) => {
      const view = renderer(props)
      const update = view.update?.bind(view)
      view.update = (node, decorations, innerDecorations) => {
        const accepted = update ? update(node, decorations, innerDecorations) : true
        const image = (view.dom as HTMLElement).querySelector('img')
        if (accepted && image) {
          image.style.width = node.attrs.width ? `${node.attrs.width}px` : ''
          image.style.height = node.attrs.height ? `${node.attrs.height}px` : ''
        }
        return accepted
      }
      return view
    }
  },
})

export default function RichTextEditor({ value, onChange, label, disabled = false }: { value: string; onChange: (html: string, text: string) => void; label: string; disabled?: boolean }) {
  const [error, setError] = useState(''); const [link, setLink] = useState<string | null>(null)
  const extensions = useMemo(() => [StarterKit.configure({ link: { openOnClick: false } }), ResizableImage.configure({ allowBase64: true, resize: { enabled: true, directions: ['top-left', 'top-right', 'bottom-left', 'bottom-right'], minWidth: 40, minHeight: 20, alwaysPreserveAspectRatio: true } }), TextAlign.configure({ types: ['heading', 'paragraph'] }), TextStyleKit], [])
  const editor = useEditor({ shouldRerenderOnTransaction: true, extensions, content: value, editable: !disabled, editorProps: { attributes: { role: 'textbox', 'aria-label': label, 'aria-multiline': 'true', dir: 'auto' }, handlePaste: (_view, event) => { const files = Array.from(event.clipboardData?.files || []).filter((file) => file.type.startsWith('image/')); if (!files.length) return false; event.preventDefault(); void insertImages(files); return true } }, onUpdate: ({ editor }) => onChange(editor.getHTML(), editor.getText()) })
  useEffect(() => { if (editor && !editor.isDestroyed && editor.schema && editor.getHTML() !== value) editor.commands.setContent(safeMailHtml(value), { emitUpdate: false }) }, [value, editor])
  useEffect(() => { if (editor && !editor.isDestroyed && editor.schema) editor.setEditable(!disabled) }, [disabled, editor])
  const insertImages = async (files: File[]) => { setError(''); try { for (const file of files) { if (!/^image\/(png|jpeg|gif|webp)$/.test(file.type) || file.size > 2 * 1024 * 1024) throw new Error('בחרו תמונת PNG, JPG, GIF או WebP עד 2 MB'); const src = await new Promise<string>((resolve, reject) => { const reader = new FileReader(); reader.onload = () => resolve(String(reader.result)); reader.onerror = reject; reader.readAsDataURL(file) }); if (editor && !editor.isDestroyed && editor.schema) editor.chain().focus().setImage({ src, alt: file.name }).run() } } catch (e) { setError(e instanceof Error ? e.message : 'הוספת התמונה נכשלה') } }
  if (!editor || editor.isDestroyed || !editor.schema) return null
  const tool = (name: string, text: string, action: () => void, active = false) => <button type="button" aria-label={name} aria-pressed={active} disabled={disabled} onClick={action}>{text}</button>
  return <div className="rich-editor">
    <div className="rich-toolbar" role="toolbar" aria-label={`עיצוב ${label}`}>
      {tool('מודגש', 'B', () => { editor.chain().focus().toggleBold().run() }, editor.isActive('bold'))}
      {tool('נטוי', 'I', () => { editor.chain().focus().toggleItalic().run() }, editor.isActive('italic'))}
      {tool('קו תחתון', 'U', () => { editor.chain().focus().toggleUnderline().run() }, editor.isActive('underline'))}
      <select aria-label="גודל טקסט" disabled={disabled} defaultValue="16px" onChange={(e) => { editor.chain().focus().setFontSize(e.target.value).run() }}><option value="12px">קטן</option><option value="16px">רגיל</option><option value="20px">גדול</option><option value="28px">גדול מאוד</option></select>
      <select aria-label="גופן" disabled={disabled} defaultValue="Arial" onChange={(e) => { editor.chain().focus().setFontFamily(e.target.value).run() }}><option>Arial</option><option>Georgia</option><option>Tahoma</option><option>Verdana</option></select>
      <label title="צבע טקסט">צבע <input aria-label="צבע טקסט" type="color" disabled={disabled} onChange={(e) => { editor.chain().focus().setColor(e.target.value).run() }} /></label>
      {tool('יישור לימין', 'ימין', () => { editor.chain().focus().setTextAlign('right').run() })}{tool('יישור למרכז', 'מרכז', () => { editor.chain().focus().setTextAlign('center').run() })}{tool('יישור לשמאל', 'שמאל', () => { editor.chain().focus().setTextAlign('left').run() })}
      {tool('רשימת תבליטים', '• רשימה', () => { editor.chain().focus().toggleBulletList().run() }, editor.isActive('bulletList'))}{tool('רשימה ממוספרת', '1. רשימה', () => { editor.chain().focus().toggleOrderedList().run() }, editor.isActive('orderedList'))}
      {tool('הוספת קישור', 'קישור', () => setLink(editor.getAttributes('link').href || ''))}{tool('הסרת קישור', 'הסר קישור', () => { editor.chain().focus().unsetLink().run() })}
      <label className="file-label">תמונה<input aria-label={`הוספת תמונה ${label}`} type="file" accept="image/png,image/jpeg,image/gif,image/webp" multiple disabled={disabled} onChange={(e) => { void insertImages(Array.from(e.target.files || [])); e.target.value = '' }} /></label>
      {tool('ניקוי עיצוב', 'ניקוי עיצוב', () => { editor.chain().focus().unsetAllMarks().clearNodes().run() })}{tool('ביטול פעולה', '↶', () => { editor.chain().focus().undo().run() })}{tool('ביצוע חוזר', '↷', () => { editor.chain().focus().redo().run() })}
    </div>
    {editor.isActive('image') && <div className="rich-link-controls"><label>רוחב תמונה <input aria-label="רוחב תמונה בפיקסלים" type="number" min="40" max="1600" key={editor.getAttributes('image').width || 'auto'} defaultValue={editor.getAttributes('image').width || ''} placeholder="אוטומטי" disabled={disabled} onBlur={(event) => { const width = Number(event.target.value); if (width >= 40 && width <= 1600) editor.commands.updateAttributes('image', { width, height: null }) }} onKeyDown={(event) => { if (event.key === 'Enter') { event.preventDefault(); event.currentTarget.blur() } }} /></label><button type="button" disabled={disabled} onClick={() => editor.chain().focus().updateAttributes('image', { width: null, height: null }).run()}>גודל מקורי</button><small>ניתן גם לגרור את פינות התמונה</small></div>}
    {link !== null && <div className="rich-link-controls"><input aria-label="כתובת קישור" type="url" dir="ltr" value={link} onChange={(e) => setLink(e.target.value)} placeholder="https://" /><button type="button" disabled={disabled} onClick={() => { if (!/^(https?:\/\/|mailto:|tel:)/i.test(link)) { setError('יש להזין כתובת https, mailto או tel תקינה'); return } editor.chain().focus().extendMarkRange('link').setLink({ href: link }).run(); setLink(null); setError('') }}>החלת קישור</button><button type="button" onClick={() => setLink(null)}>ביטול</button></div>}
    {error && <div role="alert" className="error-banner">{error}</div>}
    <EditorContent editor={editor} />
    <small>ניתן להדביק תמונות ישירות · עד 2 MB לתמונה</small>
  </div>
}
