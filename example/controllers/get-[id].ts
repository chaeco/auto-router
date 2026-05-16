export default async function (ctx) {
  const id = ctx.params?.id
  ctx.res.body = { message: 'User details for ID: ' + id, user: { id, name: 'User ' + id } }
}
