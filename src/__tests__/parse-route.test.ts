import { parseRouteName, parseDirSegment, validateRouteName, validateDirSegment, normalizeParamNames } from '../parse-route.js'

describe('parseRouteName', () => {
  it('converts [param] to :param (case preserved)', () => {
    expect(parseRouteName('[id]')).toBe(':id')
    expect(parseRouteName('[userId]')).toBe(':userId')
    expect(parseRouteName('[UserID]')).toBe(':UserID')
  })

  it('converts [param1]-[param2] to :param1/:param2 (case preserved)', () => {
    expect(parseRouteName('[a]-[b]')).toBe(':a/:b')
    expect(parseRouteName('[userId]-[postId]')).toBe(':userId/:postId')
  })

  it('converts [param]-static to :param/static (case preserved)', () => {
    expect(parseRouteName('[userId]-posts')).toBe(':userId/posts')
    expect(parseRouteName('[org]-settings')).toBe(':org/settings')
  })

  it('converts static-[param] to static/:param (case preserved)', () => {
    expect(parseRouteName('users-[id]')).toBe('users/:id')
    expect(parseRouteName('posts-[postId]')).toBe('posts/:postId')
  })

  it('converts [a]-[b]-[c] to :a/:b/:c', () => {
    expect(parseRouteName('[a]-[b]-[c]')).toBe(':a/:b/:c')
  })

  it('converts underscore params and preserves case', () => {
    expect(parseRouteName('[user_id]')).toBe(':user_id')
    expect(parseRouteName('[user_id]-posts')).toBe(':user_id/posts')
    expect(parseRouteName('[ABC]')).toBe(':ABC')
  })

  it('converts param-static-param chains', () => {
    expect(parseRouteName('x-[a]-y')).toBe('x/:a/y')
    expect(parseRouteName('[a]-b')).toBe(':a/b')
  })

  it('rejects a trailing dash after a param (unbalanced segment)', () => {
    expect(() => parseRouteName('[a]-[b]-[c]-')).toThrow()
  })

  it('converts [org]-settings-[key] to :org/settings/:key (case preserved)', () => {
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
    expect(result).toBe(':userId/:postId')
  })
})

describe('parseDirSegment', () => {
  it('converts [param] to :param (case preserved)', () => {
    expect(parseDirSegment('[userId]')).toBe(':userId')
    expect(parseDirSegment('[PostId]')).toBe(':PostId')
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

  it('rejects a param glued to static text (no dash separator)', () => {
    expect(() => validateRouteName('[a]x')).toThrow(/Invalid parameter syntax/)
    expect(() => validateRouteName('x[a]')).toThrow(/Invalid parameter syntax/)
    expect(() => validateRouteName('a-[b]x')).toThrow(/Invalid parameter syntax/)
  })

  it('rejects a trailing or leading dash that unbalances the segment list', () => {
    expect(() => validateRouteName('[a]-')).toThrow(/Invalid parameter syntax/)
    expect(() => validateRouteName('[a]-[b]-[c]-')).toThrow(/Invalid parameter syntax/)
  })

  it('accepts pure-static hyphens and leading/trailing dashes (static text)', () => {
    expect(() => validateRouteName('user-info')).not.toThrow()
    expect(() => validateRouteName('a--b')).not.toThrow()
    expect(() => validateRouteName('a-')).not.toThrow()
    expect(() => validateRouteName('-a')).not.toThrow()
  })

  it('accepts case and underscore variants as valid names', () => {
    expect(() => validateRouteName('[user_id]')).not.toThrow()
    expect(() => validateRouteName('[ABC]')).not.toThrow()
    expect(() => validateRouteName('[a]-[b]')).not.toThrow()
  })
})

describe('validateDirSegment', () => {
  it('accepts a whole-segment [param] and plain names', () => {
    expect(() => validateDirSegment('[userId]')).not.toThrow()
    expect(() => validateDirSegment('[user_id]')).not.toThrow()
    expect(() => validateDirSegment('[ABC]')).not.toThrow()
    expect(() => validateDirSegment('users')).not.toThrow()
    expect(() => validateDirSegment('user-posts')).not.toThrow()
  })

  it('rejects empty brackets', () => {
    expect(() => validateDirSegment('[]')).toThrow(/without spaces|single \[id\] segment/)
  })

  it('rejects params glued to static text or multiple params', () => {
    expect(() => validateDirSegment('users[id]')).toThrow(/single \[id\] segment/)
    expect(() => validateDirSegment('[a][b]')).toThrow(/single \[id\] segment/)
  })

  it('rejects names with spaces or empty inner brackets', () => {
    expect(() => validateDirSegment('[ a]')).toThrow(/without spaces/)
    expect(() => validateDirSegment('[a ]')).toThrow(/without spaces/)
    expect(() => validateDirSegment('[]')).toThrow(/without spaces/)
  })

  it('rejects non-ASCII or hyphenated parameter names', () => {
    expect(() => validateDirSegment('[用户名]')).toThrow(/only ASCII/)
    expect(() => validateDirSegment('[user-id]')).toThrow(/only ASCII/)
  })

  it('rejects a param glued to static text', () => {
    expect(() => validateDirSegment('[a]x')).toThrow(/single \[id\] segment/)
  })
})

describe('normalizeParamNames', () => {
  it('folds param-name casing for duplicate detection', () => {
    expect(normalizeParamNames('/api/users/:UserId')).toBe('/api/users/:userid')
    expect(normalizeParamNames('/api/users/:USERID')).toBe('/api/users/:userid')
    expect(normalizeParamNames('/api/users/:userId/posts/:PostId')).toBe('/api/users/:userid/posts/:postid')
  })

  it('does NOT fold underscore variants — user_id is a distinct name', () => {
    expect(normalizeParamNames('/api/users/:user_id')).toBe('/api/users/:user_id')
    expect(normalizeParamNames(':user_id')).not.toBe(':userid')
  })

  it('accepts both bracket and colon param forms', () => {
    expect(normalizeParamNames('[UserId]-[PostId]')).toBe('[userid]-[postid]')
    expect(normalizeParamNames(':UserId/posts/:PostId')).toBe(':userid/posts/:postid')
  })

  it('leaves static text untouched', () => {
    expect(normalizeParamNames('/api/users/posts')).toBe('/api/users/posts')
    expect(normalizeParamNames('/api/user-info')).toBe('/api/user-info')
  })
})
