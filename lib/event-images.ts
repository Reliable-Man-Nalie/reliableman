export type EventImage = { src: string; label: string }

export const EVENT_IMAGE_LIBRARY: EventImage[] = [
  { src: '/event-default.png', label: 'Default' },
]

export const SHARED_DEFAULT_IMAGE = '/event-default.png'

export function eventImage(e: { id: string; thumbnailImage?: string; coverImage?: string }): string {
  for (const src of [e.thumbnailImage, e.coverImage]) {
    if (src) return src
  }
  return SHARED_DEFAULT_IMAGE
}
