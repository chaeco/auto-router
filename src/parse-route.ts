/**
 * Convert a route name fragment (everything after `method-` in a file name)
 * to an Express-style path segment using three ordered regex passes.
 *
 * Pass order matters: step 2 must precede step 3 to avoid mis-converting
 * adjacent params like `[a]-[b]`.
 */
export function parseRouteName(rawName: string): string {
  return rawName
    .replace(/\[(\w+)\]/g, ':$1')  // [param] → :param
    .replace(/-:/g, '/:')           // -: → /: (dash before colon → slash)
    .replace(/:(\w+)-/g, ':$1/')    // :param- → :param/ (colon segment before dash → slash after)
}

/**
 * Convert a directory segment that may contain `[param]` brackets to
 * an Express-style `:param` segment. Only the bracket substitution applies —
 * no hyphen-to-slash logic since directory names are single segments.
 */
export function parseDirSegment(segment: string): string {
  return segment.replace(/\[(\w+)\]/g, ':$1')
}
