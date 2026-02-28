import { Hoa } from 'hoa'
import { autoRouter } from 'auto-router'

const app = new Hoa()

// 使用自动路由插件
app.extend(
  autoRouter({
    dir: './controllers',
    prefix: '/api',
  })
)

// 启动服务器
const port = 3000
  ; (app as any).listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`)
    console.log(`📚 API endpoints:`)
    console.log(`   GET  /api/users`)
    console.log(`   POST /api/login`)
    console.log(`   GET  /api/:id`)
  })
