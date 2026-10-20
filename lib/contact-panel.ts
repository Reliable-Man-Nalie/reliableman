import type { ContactCardContact } from '@/components/ContactCard'

export interface ContactPanelPayload {
  contact: ContactCardContact

  onSaveField?: (patch: Partial<ContactCardContact>) => void
}

type Listener = (p: ContactPanelPayload | null) => void

let listener: Listener | null = null

export function openContactPanel(contact: ContactCardContact, onSaveField?: (patch: Partial<ContactCardContact>) => void) {
  listener?.({ contact, onSaveField })
}

export function closeContactPanel() {
  listener?.(null)
}

export function registerContactPanel(cb: Listener): () => void {
  listener = cb
  return () => { if (listener === cb) listener = null }
}
