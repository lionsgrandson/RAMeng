import sanitizeHtml from 'sanitize-html'

export function cleanMailHtml(html) {
  return sanitizeHtml(String(html || ''), {
    allowedTags: ['p', 'div', 'span', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'a', 'img', 'ul', 'ol', 'li', 'blockquote', 'hr', 'h1', 'h2', 'h3', 'table', 'tbody', 'tr', 'td', 'th'],
    allowedAttributes: { '*': ['dir', 'style'], a: ['href'], img: ['src', 'alt', 'width', 'height'] },
    allowedSchemes: ['https', 'http', 'mailto', 'tel'], allowedSchemesByTag: { img: ['https', 'cid', 'data'] },
    allowedStyles: { '*': { color: [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d.,%\s]+\)$/, /^[a-z]+$/i], 'background-color': [/^#[0-9a-f]{3,8}$/i, /^rgba?\([\d.,%\s]+\)$/], 'font-size': [/^\d+(px|pt)$/], 'font-family': [/^[a-z ,"'-]+$/i], 'text-align': [/^(left|right|center|justify)$/], 'font-weight': [/^(bold|normal|[1-9]00)$/], 'font-style': [/^(normal|italic)$/], 'text-decoration': [/^(underline|line-through|none)$/], width: [/^\d+(px|%)$/], height: [/^\d+px$/], 'max-width': [/^\d+(px|%)$/] } },
    exclusiveFilter: (frame) => frame.tag === 'img' && !/^(https:\/\/|cid:|data:image\/(png|jpeg|gif|webp);base64,[A-Za-z0-9+/]+=*$)/i.test(frame.attribs.src || ''),
  })
}

export function mailContent(html) {
  const inline = []
  const cleaned = cleanMailHtml(html).replace(/<img\b([^>]*)>/gi, (_match, attributes) => {
    const width = Math.min(600, Math.max(40, Number(attributes.match(/\bwidth="(\d+)"/i)?.[1] || attributes.match(/width:\s*(\d+)px/i)?.[1] || 180)))
    const remaining = attributes.replace(/\s(?:width|height|style)="[^"]*"/gi, '')
    return `<img${remaining} width="${width}" style="display:inline-block;vertical-align:middle;width:${width}px;max-width:100%;height:auto;border:0;margin:8px 0;" />`
  }).replace(/src="data:(image\/(?:png|jpeg|gif|webp));base64,([A-Za-z0-9+/]+=*)"/gi, (_match, type, data) => {
    const id = `${crypto.randomUUID()}@rameng`; inline.push({ id, type, data }); return `src="cid:${id}"`
  })
  const rtl = /[\u0590-\u05ff]/.test(cleaned.replace(/<[^>]*>/g, ''))
  return { html: cleaned ? `<div dir="${rtl ? 'rtl' : 'ltr'}" style="direction:${rtl ? 'rtl' : 'ltr'};text-align:${rtl ? 'right' : 'left'};font-family:Arial,Helvetica,sans-serif;font-size:16px;line-height:1.5;max-width:640px;width:100%;">${cleaned}</div>` : '', inline }
}
