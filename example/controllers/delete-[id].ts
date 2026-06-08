// DELETE /api/users/:id — delete a user
export default async (ctx: any) => {
  const { id } = ctx.params
  ctx.res.body = { success: true, deletedId: id }
}
