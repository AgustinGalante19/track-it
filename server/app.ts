import { Hono } from "hono"
import { HTTPException } from "hono/http-exception"
import { bodyLimit } from "hono/body-limit"
import { secureHeaders } from "hono/secure-headers"
import { z } from "zod"
import type { AuthUser } from "../shared/auth"
import { and, eq } from "drizzle-orm"
import { auth, trustedOrigins, signupEnabled, googleEnabled, authOrigin } from "./auth"
import { db } from "./db/client"
import * as schema from "./db/schema"
import * as service from "./service"
import { createCategory, editCategory, deleteCategory } from "./categories"
import { demoEnabled, prepareDemo } from "./demo"
import { exportBackup, restoreBackup } from "./backup"
import {
  accountInputSchema,
  accountColorSchema,
  expenseInputSchema,
  incomeInputSchema,
  recurringInputSchema,
  planInputSchema,
  chargeInputSchema,
  monthSchema,
  categoryInputSchema,
  idSchema,
  today,
} from "../shared/domain"

type Env = { Variables: { userId: string; sessionCreatedAt: number; user: AuthUser } }
export const app = new Hono<Env>()
app.use("/api/*", secureHeaders())
app.use(
  "/api/*",
  bodyLimit({
    maxSize: 3 * 1024 * 1024,
    onError: (c) =>
      c.json({ error: "El archivo supera el límite de 3 MB." }, 413),
  }),
)
app.use("/api/*", async (c, next) => {
  c.header("Cache-Control", "no-store")
  await next()
})
app.get("/api/health", (c) => c.json({ ok: true }))
app.get("/api/config", (c) =>
  c.json({
    signupEnabled,
    demoEnabled,
    googleEnabled,
    authOrigin,
  }),
)
app.post("/api/demo", async (c) => {
  await prepareDemo()
  return c.json({ ok: true })
})
app.on(["GET", "POST", "PATCH", "DELETE"], "/api/auth/*", (c) =>
  auth.handler(c.req.raw),
)
app.use("/api/*", async (c, next) => {
  const session = await auth.api.getSession({ headers: c.req.raw.headers })
  if (!session)
    return c.json({ error: "Tu sesión venció. Volvé a ingresar." }, 401)
  c.set("userId", session.user.id)
  const { name, email, username, image } = session.user
  c.set("user", { name, email, username, image })
  c.set("sessionCreatedAt", session.session.createdAt.getTime())
  if (!["GET", "HEAD"].includes(c.req.method)) {
    const origin = c.req.header("Origin")
    const allowed = new Set(trustedOrigins)
    if (origin && !allowed.has(origin))
      return c.json({ error: "Origen no permitido." }, 403)
  }
  await next()
})
async function body<T extends z.ZodType>(
  request: { json: () => Promise<unknown> },
  validator: T,
): Promise<z.infer<T>> {
  let input: unknown
  try {
    input = await request.json()
  } catch {
    throw new service.DomainError("El contenido de la solicitud no es válido.")
  }
  return validator.parse(input)
}
app.post("/api/password", async (c) => {
  // setPassword valida la sesión, pero agregar otro método de acceso exige volver a autenticarse.
  if (Date.now() - c.get("sessionCreatedAt") >= 10 * 60 * 1000)
    return c.json({ code: "SESSION_NOT_FRESH", error: "Volvé a ingresar para habilitar una contraseña." }, 403)
  return auth.api.setPassword({
    body: await body(c.req, z.object({ newPassword: z.string().min(10).max(128) })),
    headers: c.req.raw.headers,
    asResponse: true,
  })
})
app.get("/api/bootstrap", async (c) => {
  const month = monthSchema.parse(c.req.query("month") || today().slice(0, 7))
  if (month < "2000-01" || month > "2100-12")
    throw new service.DomainError("Mes fuera de rango.")
  return c.json({
    data: await service.getSnapshot(db, c.get("userId"), month),
    user: c.get("user"),
  })
})
app.get("/api/snapshot", async (c) => {
  const month = monthSchema.parse(c.req.query("month") || today().slice(0, 7))
  if (month < "2000-01" || month > "2100-12")
    throw new service.DomainError("Mes fuera de rango.")
  return c.json(await service.getSnapshot(db, c.get("userId"), month))
})
app.post("/api/accounts", async (c) =>
  c.json(
    await service.createAccount(
      db,
      c.get("userId"),
      await body(c.req, accountInputSchema),
    ),
    201,
  ),
)
app.patch("/api/accounts/:id", async (c) =>
  c.json(
    await service.editAccount(
      db,
      c.get("userId"),
      c.req.param("id"),
      await body(
        c.req,
        z.object({
          name: z.string().trim().min(1).max(80),
          emoji: z.string().min(1).max(16),
          color: accountColorSchema,
          archived: z.boolean(),
          version: z.number().int().min(1),
        }),
      ),
    ),
  ),
)
app.get("/api/accounts/:id/history", async (c) =>
  c.json(await service.accountHistory(db, c.get("userId"), c.req.param("id"))),
)
app.delete("/api/accounts/:id", async (c) => {
  const input = await body(c.req, z.object({ version: z.number().int().min(1) }))
  return c.json(await service.deleteAccount(db, c.get("userId"), c.req.param("id"), input.version))
})
app.post("/api/expenses", async (c) =>
  c.json(
    await service.createExpense(
      db,
      c.get("userId"),
      await body(c.req, expenseInputSchema),
    ),
    201,
  ),
)
app.put("/api/expenses/:id", async (c) =>
  c.json(
    await service.editExpense(
      db,
      c.get("userId"),
      c.req.param("id"),
      await body(
        c.req,
        expenseInputSchema.extend({ version: z.number().int().min(1) }),
      ),
    ),
  ),
)
app.post("/api/incomes", async (c) =>
  c.json(
    await service.createIncome(
      db,
      c.get("userId"),
      await body(c.req, incomeInputSchema),
    ),
    201,
  ),
)
app.post("/api/movements/:id/void", async (c) => {
  const input = await body(
    c.req,
    z.object({ version: z.number().int().min(1) }),
  )
  return c.json(
    await service.voidMovement(
      db,
      c.get("userId"),
      c.req.param("id"),
      input.version,
    ),
  )
})
app.post("/api/recurring", async (c) =>
  c.json(
    await service.createRecurring(
      db,
      c.get("userId"),
      await body(c.req, recurringInputSchema),
    ),
    201,
  ),
)
app.put("/api/recurring/:id", async (c) =>
  c.json(
    await service.updateRecurring(
      db,
      c.get("userId"),
      c.req.param("id"),
      await body(
        c.req,
        recurringInputSchema.extend({
          active: z.boolean(),
          version: z.number().int().min(1),
        }),
      ),
    ),
  ),
)
app.delete("/api/recurring/:id", async (c) => {
  const input = await body(c.req, z.object({ version: z.number().int().min(1) }))
  return c.json(await service.deleteRecurring(db, c.get("userId"), c.req.param("id"), input.version))
})
app.post("/api/occurrences/:id/charge", async (c) =>
  c.json(
    await service.chargeOccurrence(
      db,
      c.get("userId"),
      c.req.param("id"),
      await body(c.req, chargeInputSchema),
    ),
    201,
  ),
)
app.post("/api/occurrences/:id/skip", async (c) =>
  c.json(await service.skipOccurrence(db, c.get("userId"), c.req.param("id"))),
)
app.post("/api/plans", async (c) =>
  c.json(
    await service.createPlan(
      db,
      c.get("userId"),
      await body(c.req, planInputSchema),
    ),
    201,
  ),
)
app.post("/api/installments/:id/charge", async (c) =>
  c.json(
    await service.chargeInstallment(
      db,
      c.get("userId"),
      c.req.param("id"),
      await body(c.req, chargeInputSchema),
    ),
    201,
  ),
)
app.post("/api/plans/:id/cancel", async (c) => {
  const input = await body(
    c.req,
    z.object({ version: z.number().int().min(1) }),
  )
  return c.json(
    await service.cancelPlan(
      db,
      c.get("userId"),
      c.req.param("id"),
      input.version,
    ),
  )
})
app.post("/api/categories", async (c) => {
  return c.json(await createCategory(db, c.get("userId"), await body(c.req, categoryInputSchema)), 201)
})
app.patch("/api/categories/:id", async (c) => {
  const input = await body(c.req, categoryInputSchema.extend({ version: z.number().int().min(1) }))
  return c.json(await editCategory(db, c.get("userId"), c.req.param("id"), input))
})
app.delete("/api/categories/:id", async (c) => {
  const input = await body(c.req, z.object({ version: z.number().int().min(1), replacementId: idSchema.nullable().default(null) }))
  return c.json(await deleteCategory(db, c.get("userId"), c.req.param("id"), input))
})
app.get("/api/backup", async (c) =>
  c.json(await exportBackup(db, c.get("userId"))),
)
app.post("/api/backup/restore", async (c) =>
  c.json(await restoreBackup(db, c.get("userId"), await c.req.json())),
)
app.onError((error, c) => {
  if (error instanceof z.ZodError)
    return c.json(
      { error: error.issues[0]?.message || "Revisá los datos ingresados." },
      400,
    )
  if (error instanceof service.DomainError)
    return c.json({ error: error.message }, error.status as 400 | 404 | 409)
  if (error instanceof HTTPException)
    return c.json({ error: "Solicitud no válida." }, error.status)
  console.error("[api]", error.name, error.message)
  return c.json(
    {
      error:
        "No pudimos completar la operación. Tus datos anteriores se conservan.",
    },
    500,
  )
})
app.notFound((c) => c.json({ error: "Ruta no encontrada." }, 404))
