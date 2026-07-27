import { parseRouteName, parseDirSegment } from '../parse-route.js'

describe('parseRouteName', () => {
  it('converts [param] to :param', () => {
    expect(parseRouteName('[id]')).toBe(':id')
    expect(parseRouteName('[userId]')).toBe(':userId')
  })

  it('converts [param1]-[param2] to :param1/:param2', () => {
    expect(parseRouteName('[a]-[b]')).toBe(':a/:b')
    expect(parseRouteName('[userId]-[postId]')).toBe(':userId/:postId')
  })

  it('converts [param]-static to :param/static', () => {
    expect(parseRouteName('[userId]-posts')).toBe(':userId/posts')
    expect(parseRouteName('[org]-settings')).toBe(':org/settings')
  })

  it('converts static-[param] to static/:param', () => {
    expect(parseRouteName('users-[id]')).toBe('users/:id')
    expect(parseRouteName('posts-[postId]')).toBe('posts/:postId')
  })

  it('converts [a]-[b]-[c] to :a/:b/:c', () => {
    expect(parseRouteName('[a]-[b]-[c]')).toBe(':a/:b/:c')
  })

  it('converts [org]-settings-[key] to :org/settings/:key', () => {
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
  it('converts [param] to :param', () => {
    expect(parseDirSegment('[userId]')).toBe(':userId')
    expect(parseDirSegment('[postId]')).toBe(':postId')
  })

  it('preserves plain names', () => {
    expect(parseDirSegment('users')).toBe('users')
    expect(parseDirSegment('admin')).toBe('admin')
  })

  it('does not convert hyphens to slashes (directory segments are single units)', () => {
    expect(parseDirSegment('user-posts')).toBe('user-posts')
  })
})
