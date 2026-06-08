// GET /api/users/:userId/settings — nested dynamic directory
export default async (ctx: any) => {
  const { userId } = ctx.params
  ctx.res.body = { userId, theme: 'dark', notifications: true }
}
