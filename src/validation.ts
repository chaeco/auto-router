/**
 * Shared file-name and directory-name validation for auto-router.
 */
import { HTTP_METHODS } from './constants.js'
import { validateRouteName } from './parse-route.js'

export interface FileNameValidation {
  valid: boolean
  method?: string
  error?: string
}

/**
 * Validate a route file name.
 *
 * Accepts:
 * - Exact HTTP method (e.g. `get.ts`, `post.ts`)
 * - Method-prefixed with dash (e.g. `get-users.ts`, `post-[id].ts`)
 * Rejects:
 * - Wrong-cased method prefix (e.g. `GET-users.ts`, `Post-users.ts`)
 * - Malformed [param] syntax (e.g. `get-[].ts`, `get-[a][b].ts`)
 * - Unknown file names
 */
export function validateFileName(fileName: string): FileNameValidation {
  const nameWithoutExt = fileName.replace(/\.(ts|js)$/, '')

  if ((HTTP_METHODS as readonly string[]).includes(nameWithoutExt)) {
    return { valid: true, method: nameWithoutExt }
  }

  let matchedMethod: string | undefined
  for (const method of HTTP_METHODS) {
    if (nameWithoutExt.startsWith(method + '-')) {
      matchedMethod = method
      break
    }
  }

  if (!matchedMethod) {
    const wrongCasedMethod = HTTP_METHODS.find(method => nameWithoutExt.toLowerCase().startsWith(method + '-'))
    if (wrongCasedMethod) {
      return {
        valid: false,
        error: `File name uses "${nameWithoutExt.slice(0, wrongCasedMethod.length)}" — HTTP method prefix must be lowercase, e.g. "${wrongCasedMethod}-..."`,
      }
    }
    return {
      valid: false,
      error: `File name must be a valid HTTP method or start with method- (${HTTP_METHODS.join('|')})`,
    }
  }

  const routeName = nameWithoutExt === matchedMethod ? '' : nameWithoutExt.substring(matchedMethod.length + 1)
  if (routeName) {
    try {
      validateRouteName(routeName)
    } catch (err) {
      return {
        valid: false,
        error: err instanceof Error ? err.message : String(err),
      }
    }
  }

  return { valid: true, method: matchedMethod }
}

/** Check whether a directory name is an HTTP method keyword (case-insensitive). */
export function isHttpMethodKeyword(name: string): boolean {
  return (HTTP_METHODS as readonly string[]).includes(name.toLowerCase())
}