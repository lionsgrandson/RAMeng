import { useEffect, useMemo, useRef, useState } from 'react'
import { Loader2, MapPin } from 'lucide-react'
import { integrationsApi } from '../lib/api'

const directPhotonSuggestions = async (query: string) => {
  const url = new URL('https://photon.komoot.io/api/')
  url.searchParams.set('q', query)
  url.searchParams.set('limit', '7')
  url.searchParams.set('bbox', '34.2,29.4,35.95,33.4')
  url.searchParams.set('lat', '31.95')
  url.searchParams.set('lon', '34.90')
  const response = await fetch(url.toString(), { headers: { accept: 'application/json' } })
  if (!response.ok) return []
  const body = await response.json().catch(() => ({ features: [] })) as { features?: Array<{ properties?: Record<string, string> }> }
  const seen = new Set<string>()
  return (body.features || []).map((feature) => {
    const props = feature.properties || {}
    const street = [props.street || props.name, props.housenumber].filter(Boolean).join(' ').trim()
    const locality = props.city || props.town || props.village || props.locality || props.district || props.county
    const label = [street, locality, props.state, props.postcode, props.country].filter(Boolean).filter((value, index, array) => array.indexOf(value) === index).join(', ')
    return { label, value: label }
  }).filter((item) => item.value && !seen.has(item.value.toLowerCase()) && seen.add(item.value.toLowerCase())).slice(0, 7)
}

type AddressAutocompleteProps = {
  name?: string
  value?: string
  defaultValue?: string
  placeholder?: string
  required?: boolean
  disabled?: boolean
  existingAddresses?: string[]
  onValueChange?: (value: string) => void
  ariaLabel?: string
}

export default function AddressAutocomplete({
  name = 'address',
  value,
  defaultValue = '',
  placeholder = 'התחילו להקליד כתובת',
  required = false,
  disabled = false,
  existingAddresses = [],
  onValueChange,
  ariaLabel = 'כתובת',
}: AddressAutocompleteProps) {
  const [draft, setDraft] = useState(value ?? defaultValue)
  const [remote, setRemote] = useState<{ label: string; value: string }[]>([])
  const [open, setOpen] = useState(false)
  const [loading, setLoading] = useState(false)
  const focused = useRef(false)
  const requestId = useRef(0)

  useEffect(() => {
    if (!focused.current && value !== undefined) setDraft(value)
  }, [value])

  const local = useMemo(() => {
    const query = draft.trim().toLowerCase()
    if (query.length < 2) return []
    return [...new Set(existingAddresses.map((address) => address.trim()).filter(Boolean))]
      .filter((address) => address.toLowerCase().includes(query) && address.toLowerCase() !== query)
      .slice(0, 4)
      .map((address) => ({ label: address, value: address }))
  }, [draft, existingAddresses])

  useEffect(() => {
    const query = draft.trim()
    if (!focused.current || query.length < 2) {
      setRemote([])
      setLoading(false)
      return
    }
    const id = ++requestId.current
    const timer = window.setTimeout(() => {
      setLoading(true)
      void integrationsApi.addressSuggestions(query)
        .then(async (result) => {
          if (requestId.current !== id) return
          const suggestions = result.suggestions || []
          if (suggestions.length) {
            setRemote(suggestions)
            return
          }
          const fallback = await directPhotonSuggestions(query).catch(() => [])
          if (requestId.current === id) setRemote(fallback)
        })
        .catch(async () => {
          const fallback = await directPhotonSuggestions(query).catch(() => [])
          if (requestId.current === id) setRemote(fallback)
        })
        .finally(() => {
          if (requestId.current === id) setLoading(false)
        })
    }, 320)
    return () => window.clearTimeout(timer)
  }, [draft])

  const suggestions = useMemo(() => {
    const seen = new Set<string>()
    return [...local, ...remote].filter((item) => {
      const key = item.value.trim().toLowerCase()
      if (!key || seen.has(key)) return false
      seen.add(key)
      return true
    }).slice(0, 7)
  }, [local, remote])

  const choose = (next: string) => {
    setDraft(next)
    setOpen(false)
    onValueChange?.(next)
  }

  const commit = () => {
    const next = draft.trim()
    if (next) {
      setDraft(next)
      onValueChange?.(next)
    } else if (value) {
      setDraft(value)
    }
  }

  return <div className="address-autocomplete">
    <div className="address-input-wrap">
      <MapPin aria-hidden="true" />
      <input
        name={name}
        value={draft}
        required={required}
        disabled={disabled}
        placeholder={placeholder}
        autoComplete="street-address"
        aria-label={ariaLabel}
        aria-autocomplete="list"
        aria-expanded={open && (loading || suggestions.length > 0)}
        onFocus={() => { focused.current = true; setOpen(true) }}
        onChange={(event) => { setDraft(event.target.value); setOpen(true) }}
        onBlur={() => {
          focused.current = false
          window.setTimeout(() => { commit(); setOpen(false) }, 130)
        }}
      />
      {loading && <Loader2 className="address-loading" aria-label="טוען הצעות כתובת" />}
    </div>
    {open && draft.trim().length >= 2 && (loading || suggestions.length > 0) && <div className="address-suggestions" role="listbox">
      {suggestions.map((item) => <button type="button" role="option" key={item.value} onMouseDown={(event) => event.preventDefault()} onClick={() => choose(item.value)}><MapPin /><span>{item.label}</span></button>)}
      {loading && !suggestions.length && <div className="address-suggestion-loading">מחפש כתובות…</div>}
      <small>הצעות כתובת מבוססות OpenStreetMap / Photon</small>
    </div>}
  </div>
}
