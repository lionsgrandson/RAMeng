import DOMPurify from 'dompurify'

export function safeMailHtml(html: string, images = true) {
  const clean = DOMPurify.sanitize(html, { FORBID_TAGS: ['style', 'form', 'input', 'button', 'iframe', 'video', 'audio'], FORBID_ATTR: ['srcset'] })
  const doc = new DOMParser().parseFromString(clean, 'text/html')
  doc.querySelectorAll('a').forEach((link) => { link.target = '_blank'; link.rel = 'noopener noreferrer' })
  doc.querySelectorAll('img').forEach((img) => { if (!images || !/^(https:\/\/|data:image\/(png|jpeg|gif|webp);base64,)/i.test(img.getAttribute('src') || '')) img.remove() })
  doc.querySelectorAll('[style]').forEach((element) => { const style = element.getAttribute('style') || ''; element.setAttribute('style', style.split(';').filter((rule) => /^\s*(color|background-color|font-size|font-family|font-weight|font-style|text-align|text-decoration|width|max-width|height|margin|padding|border[^:]*)\s*:/i.test(rule) && !/url\(|expression|position/i.test(rule)).join(';')) })
  return doc.body.innerHTML
}

