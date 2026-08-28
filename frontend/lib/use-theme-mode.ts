'use client'

import { useSyncExternalStore } from 'react'

export type ThemeMode = 'light' | 'dark'

/**
 * Which theme is actually showing, resolved the same way globals.css resolves
 * it: an explicit choice on the root element wins, otherwise the OS preference.
 *
 * CSS handles this on its own for anything styled with tokens — this hook is
 * for the things CSS cannot reach. The map is one: its basemap is a URL, not a
 * colour, so something has to decide *in JavaScript* which style to load and
 * notice when that answer changes.
 *
 * Both sources have to be watched. `matchMedia` covers the OS switching, and a
 * MutationObserver covers our own toggle writing `data-theme` on <html> — a
 * media query listener alone would sit there silently while the page changed
 * around it.
 */
function subscribe(onChange: () => void): () => void {
  const query = window.matchMedia('(prefers-color-scheme: dark)')
  query.addEventListener('change', onChange)

  const observer = new MutationObserver(onChange)
  observer.observe(document.documentElement, {
    attributes: true,
    attributeFilter: ['data-theme'],
  })

  return () => {
    query.removeEventListener('change', onChange)
    observer.disconnect()
  }
}

function getSnapshot(): ThemeMode {
  const chosen = document.documentElement.dataset.theme
  if (chosen === 'dark' || chosen === 'light') return chosen
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * The server cannot know, and says so.
 *
 * Everything using this hook is loaded with `ssr: false`, so this is never
 * actually rendered — it exists so the hook cannot become a hydration mismatch
 * the day something else calls it.
 */
function getServerSnapshot(): ThemeMode {
  return 'light'
}

export function useThemeMode(): ThemeMode {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot)
}
