/**
 * Match a route against a filter pattern.
 *
 * Pattern formats:
 * - Path only (matches all methods): '/api/users', '/api/admin/*'
 * - Method + path (matches specific method): 'GET /api/users', 'POST /api/auth/login'
 *
 * Path matching rules:
 * - Exact match (with or without prefix): '/users' matches '/api/users'
 * - Wildcard suffix: '/api/admin/*' matches '/api/admin/foo' and '/api/admin/foo/bar' but NOT '/api/admin' itself
 */
import { HTTP_METHODS } from './constants'

export const HTTP_METHODS_UPPER = HTTP_METHODS.map(m => m.toUpperCase()) as readonly string[]

export function matchesFilter(
  routePath: string,
  routeMethod: string,
  pattern: string,
  prefix?: string
): boolean {
  let patternMethod: string | undefined
  let pathPattern = pattern

  const spaceIndex = pattern.indexOf(' ')
  if (spaceIndex !== -1) {
    const maybeMethod = pattern.slice(0, spaceIndex).toUpperCase()
    if (HTTP_METHODS_UPPER.includes(maybeMethod)) {
      patternMethod = maybeMethod
      pathPattern = pattern.slice(spaceIndex + 1)
    }
  }

  if (patternMethod && patternMethod !== routeMethod.toUpperCase()) {
    return false
  }

  const isWildcard = pathPattern.endsWith('/*')
  const basePattern = isWildcard ? pathPattern.slice(0, -2) : pathPattern

  const candidatePaths: string[] = [routePath]
  if (prefix && routePath.startsWith(prefix)) {
    const stripped = routePath.slice(prefix.length) || '/'
    candidatePaths.push(stripped)
  }

  for (const candidate of candidatePaths) {
    if (isWildcard) {
      if (candidate.startsWith(basePattern + '/')) {
        return true
      }
    } else {
      if (candidate === basePattern) {
        return true
      }
    }
  }
  return false
}