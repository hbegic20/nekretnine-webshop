import { env, isProduction } from './env.js'

/**
 * A deliberately tiny logger.
 *
 * We chose not to add `pino` (ARCHITECTURE.md §10). The reason a logging
 * *library* is usually worth it is structured output — machine-readable lines
 * you can filter by request or user when something breaks in production. That
 * part is about twenty lines, so here it is.
 *
 * The point of routing every log through this module rather than calling
 * console.log directly is that swapping in pino later becomes a one-file
 * change instead of a find-and-replace across the codebase.
 */
type Level = 'debug' | 'info' | 'warn' | 'error'
type Fields = Record<string, unknown>

const LEVEL_ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 }
const MIN_LEVEL: Level = env.NODE_ENV === 'test' ? 'warn' : isProduction ? 'info' : 'debug'

function emit(level: Level, message: string, fields?: Fields): void {
  if (LEVEL_ORDER[level] < LEVEL_ORDER[MIN_LEVEL]) return

  if (isProduction) {
    // One JSON object per line: greppable, and parseable by any log platform.
    process.stdout.write(JSON.stringify({ level, time: new Date().toISOString(), message, ...fields }) + '\n')
    return
  }

  // Human-readable while developing.
  const suffix = fields && Object.keys(fields).length > 0 ? ' ' + JSON.stringify(fields) : ''
  const line = `${new Date().toISOString().slice(11, 23)} ${level.toUpperCase().padEnd(5)} ${message}${suffix}`
  if (level === 'error' || level === 'warn') console.error(line)
  else console.log(line)
}

export const log = {
  debug: (message: string, fields?: Fields) => emit('debug', message, fields),
  info: (message: string, fields?: Fields) => emit('info', message, fields),
  warn: (message: string, fields?: Fields) => emit('warn', message, fields),
  error: (message: string, fields?: Fields) => emit('error', message, fields),
}
