import { serve } from "@hono/node-server"
import { app } from "./app"
import { db } from "./db/client"
import { migrateDatabase } from "./migrate"
import { startReminderScheduler } from "./reminder-job"

const hostname = process.env.HOST || "127.0.0.1"
const port = Number(process.env.PORT || 3001)

await migrateDatabase()
startReminderScheduler(db)

serve({ fetch: app.fetch, hostname, port }, (info) => {
  console.log(`API lista en http://${hostname}:${info.port}`)
})
