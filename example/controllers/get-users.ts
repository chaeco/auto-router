export default async function (ctx) {
  ctx.res.body = {
    message: 'Hello from auto-router!',
    users: [
      { id: 1, name: 'Alice' },
      { id: 2, name: 'Bob' },
    ],
  }
}
