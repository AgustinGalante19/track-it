import { serve } from "@hono/node-server"
import { app } from "./app"
import { migrateDatabase } from "./migrate"

const hostname = process.env.HOST || "127.0.0.1"
const port = Number(process.env.PORT || 3001)

await migrateDatabase()

serve({ fetch: app.fetch, hostname, port }, (info) => {
  console.log(`API lista en http://${hostname}:${info.port}`)
})
