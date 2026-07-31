import { parseRouteName, parseDirSegment, validateRouteName, validateDirSegment } from '../parse-route.js'

describe('parseRouteName', () => {
  it('converts [param] to :param (lowercased)', () => {
    expect(parseRouteName('[id]')).toBe(':id')
    expect(parseRouteName('[userId]')).toBe(':userid')
    expect(parseRouteName('[UserID]')).toBe(':userid')
  })

  it('converts [param1]-[param2] to :param1/:param2 (lowercased)', () => {
    expect(parseRouteName('[a]-[b]')).toBe(':a/:b')
    expect(parseRouteName('[userId]-[postId]')).toBe(':userid/:postid')
  })

  it('converts [param]-static to :param/static (lowercased)', () => {
    expect(parseRouteName('[userId]-posts')).toBe(':userid/posts')
    expect(parseRouteName('[org]-settings')).toBe(':org/settings')
  })

  it('converts static-[param] to static/:param (lowercased)', () => {
    expect(parseRouteName('users-[id]')).toBe('users/:id')
    expect(parseRouteName('posts-[postId]')).toBe('posts/:postid')
  })

  it('converts [a]-[b]-[c] to :a/:b/:c', () => {
    expect(parseRouteName('[a]-[b]-[c]')).toBe(':a/:b/:c')
  })

  it('converts [org]-settings-[key] to :org/settings/:key (lowercased)', () => {
    expect(parseRouteName('[org]-settings-[key]')).toBe(':org/settings/:key')
  })

  it('preserves static names without params', () => {
    expect(parseRouteName('users')).toBe('users')
    expect(parseRouteName('login')).toBe('login')
  })

  it('preserves hyphens in static text (not adjacent to params)', () => {
    expect(parseRouteName('user-info')).toBe('user-info')
    expect(parseRouteName('my-api-v2')).toBe('my-api-v2')
  })

  it('handles empty string', () => {
    expect(parseRouteName('')).toBe('')
  })

  it('applies transformations in correct order (step 2 before step 3)', () => {
    // Regression guard: if step 3 ran before step 2, [a]-[b] would become :a-:b → :a/:b (wrong intermediate)
    // Correct order: [a]-[b] → :a-:b → :a/:b (step 2) → :a/:b (step 3 no-op)
    const result = parseRouteName('[userId]-[postId]')
    expect(result).toBe(':userid/:postid')
  })
})

describe('parseDirSegment', () => {
  it('converts [param] to :param (lowercased)', () => {
    expect(parseDirSegment('[userId]')).toBe(':userid')
    expect(parseDirSegment('[PostId]')).toBe(':postid')
  })

  it('preserves plain names', () => {
    expect(parseDirSegment('users')).toBe('users')
    expect(parseDirSegment('admin')).toBe('admin')
  })

  it('does not convert hyphens to slashes (directory segments are single units)', () => {
    expect(parseDirSegment('user-posts')).toBe('user-posts')
  })
})

describe('validateRouteName', () => {
  it('accepts valid param syntax', () => {
    expect(() => validateRouteName('[id]')).not.toThrow()
    expect(() => validateRouteName('[userId]-posts')).not.toThrow()
    expect(() => validateRouteName('users-[id]')).not.toThrow()
    expect(() => validateRouteName('[a]-[b]-[c]')).not.toThrow()
    expect(() => validateRouteName('[org]-settings-[key]')).not.toThrow()
    expect(() => validateRouteName('user-info')).not.toThrow()
    expect(() => validateRouteName('users')).not.toThrow()
  })

  it('rejects empty parameter brackets []', () => {
    expect(() => validateRouteName('[]')).toThrow(/Empty parameters/)
    expect(() => validateRouteName('[a]-[]')).toThrow(/Empty parameters/)
  })

  it('rejects adjacent params without a separator', () => {
    expect(() => validateRouteName('[a][b]')).toThrow(/Invalid parameter syntax/)
  })

  it('rejects unpaired brackets', () => {
    expect(() => validateRouteName('[id')).toThrow(/Invalid parameter syntax/)
    expect(() => validateRouteName('id]')).toThrow(/Invalid parameter syntax/)
  })

  it('rejects non-ASCII parameter names', () => {
    expect(() => validateRouteName('[用户名]')).toThrow(/only ASCII/)
  })

  it('rejects hyphens or dots inside a parameter name', () => {
    expect(() => validateRouteName('[user-id]')).toThrow(/only ASCII/)
    expect(() => validateRouteName('[v1.2]')).toThrow(/only ASCII/)
  })
})

describe('validateDirSegment', () => {
  it('accepts a whole-segment [param] and plain names', () => {
    expect(() => validateDirSegment('[userId]')).not.toThrow()
    expect(() => validateDirSegment('users')).not.toThrow()
    expect(() => validateDirSegment('user-posts')).not.toThrow()
  })

  it('rejects empty brackets', () => {
    expect(() => validateDirSegment('[]')).toThrow(/single \[id\] segment/)
  })

  it('rejects params glued to static text or multiple params', () => {
    expect(() => validateDirSegment('users[id]')).toThrow(/single \[id\] segment/)
    expect(() => validateDirSegment('[a][b]')).toThrow(/single \[id\] segment/)
  })

  it('rejects non-ASCII or hyphenated parameter names', () => {
    expect(() => validateDirSegment('[用户名]')).toThrow(/only ASCII/)
    expect(() => validateDirSegment('[user-id]')).toThrow(/only ASCII/)
  })
})
