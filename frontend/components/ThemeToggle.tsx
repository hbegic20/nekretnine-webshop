'use client'

import { useEffect, useSyncExternalStore } from 'react'

type Theme = 'light' | 'dark' | 'system'

const STORAGE_KEY = 'theme'
/** Fired when this tab changes the theme; `storage` only fires in other tabs. */
const CHANGE_EVENT = 'nekretnine:theme'

/**
 * Three states, not two.
 *
 * "System" is a real choice and the default one — it means "follow the OS", and
 * it is stored by removing the key rather than by writing a value, so the media
 * query in globals.css takes over again. A two-state toggle quietly turns
 * everyone's first visit into a decision they never made.
 *
 * The stored preference is read through `useSyncExternalStore` rather than into
 * state inside an effect. localStorage is an external store that the server
 * cannot see, and this is the hook built for exactly that: the server snapshot
 * is "system", so the HTML never claims to know, and React swaps in the real
 * value right after hydration without a mismatch. Reading it with
 * `useState` + `useEffect` would either mismatch during hydration or trip
 * React's rule against setting state synchronously in an effect.
 */
function subscribe(onChange: () => void): () => void {
  window.addEventListener('storage', onChange)
  window.addEventListener(CHANGE_EVENT, onChange)
  return () => {
    window.removeEventListener('storage', onChange)
    window.removeEventListener(CHANGE_EVENT, onChange)
  }
}

function readTheme(): Theme {
  try {
    const saved = localStorage.getItem(STORAGE_KEY)
    return saved === 'dark' || saved === 'light' ? saved : 'system'
  } catch {
    // Storage blocked (private mode, or site data turned off). Follow the OS.
    return 'system'
  }
}

/** What the server renders, and what the client hydrates against. */
function serverTheme(): Theme {
  return 'system'
}

const OPTIONS: Array<{ value: Theme; glyph: string; title: string }> = [
  { value: 'light', glyph: '☀', title: 'Svijetla tema' },
  { value: 'dark', glyph: '☾', title: 'Tamna tema' },
  { value: 'system', glyph: '◐', title: 'Prati sistem' },
]

export function ThemeToggle() {
  const theme = useSyncExternalStore(subscribe, readTheme, serverTheme)

  /*
   * The effect is what touches the document, deliberately. Writing to
   * `documentElement.dataset` from the click handler is mutating something
   * outside React's world during an event, which React 19's lint rules reject
   * and which can disagree with what the component last rendered. An effect
   * keyed on the current theme keeps the DOM a function of state.
   *
   * The inline script in layout.tsx has already applied the right attribute
   * before first paint; this only keeps it in step afterwards.
   */
  useEffect(() => {
    const root = document.documentElement
    if (theme === 'system') delete root.dataset.theme
    else root.dataset.theme = theme
  }, [theme])

  function choose(next: Theme): void {
    try {
      if (next === 'system') localStorage.removeItem(STORAGE_KEY)
      else localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // Cannot remember it; the effect below still applies it to this page.
    }
    // Tells useSyncExternalStore to re-read, which re-renders and runs the
    // effect. Storage events do not fire in the tab that made the change.
    window.dispatchEvent(new Event(CHANGE_EVENT))
  }

  return (
    <div
      className="inline-flex overflow-hidden rounded-full border border-hairline"
      role="group"
      aria-label="Tema"
    >
      {OPTIONS.map((option) => (
        <button
          key={option.value}
          type="button"
          onClick={() => choose(option.value)}
          title={option.title}
          aria-label={option.title}
          aria-pressed={theme === option.value}
          /*
           * 44px on a phone, compact on a pointer device. The guideline exists
           * because a fingertip is about 10mm across; the 26px this used to be
           * meant three targets inside one thumb.
           */
          className={`flex h-11 w-11 items-center justify-center text-sm transition-colors
                      sm:h-auto sm:w-auto sm:px-2 sm:py-1 sm:text-xs ${
                        theme === option.value
                          ? 'bg-accent text-on-accent'
                          : 'text-muted hover:text-foreground'
                      }`}
        >
          <span aria-hidden>{option.glyph}</span>
        </button>
      ))}
    </div>
  )
}
