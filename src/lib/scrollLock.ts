const holders = new Set<symbol>()
let previousOverflow = ''

// Overlapping dialogs/menus must not restore an outdated `hidden` value after
// another overlay has already closed. The last owner restores page scrolling.
export function lockPageScroll() {
  const owner = Symbol('scroll-lock')
  if (!holders.size) previousOverflow = document.body.style.overflow
  holders.add(owner)
  document.body.style.overflow = 'hidden'
  return () => {
    if (!holders.delete(owner)) return
    if (!holders.size) document.body.style.overflow = previousOverflow
  }
}
