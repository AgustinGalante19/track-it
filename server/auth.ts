import { randomBytes } from "node:crypto"
import { mkdirSync, readFileSync, writeFileSync, existsSync } from "node:fs"
import { betterAuth } from "better-auth"
import { dash } from "@better-auth/infra"
import { drizzleAdapter } from "better-auth/adapters/drizzle"
import { APIError, createAuthMiddleware } from "better-auth/api"
import { username } from "better-auth/plugins/username"
import { localEmail, usernameSchema } from "../shared/auth"
import { db } from "./db/client"
import { user, session, account, verification, rateLimit } from "./db/schema"

const production = process.env.NODE_ENV === "production"
export const signupEnabled = true
const baseURL = process.env.BETTER_AUTH_URL || "http://localhost:5173"
export const authOrigin = new URL(baseURL).origin
const googleClientId = process.env.GOOGLE_CLIENT_ID?.trim()
const googleClientSecret = process.env.GOOGLE_CLIENT_SECRET?.trim()
export const googleEnabled = !!googleClientId && !!googleClientSecret
export const trustedOrigins = [
  new URL(baseURL).origin,
  ...(production ? [] : ["http://localhost:5173", "http://127.0.0.1:5173"]),
]
let secret = process.env.BETTER_AUTH_SECRET
if (
  production &&
  (!secret || secret.length < 32 || !process.env.BETTER_AUTH_URL)
)
  throw new Error(
    "Configurá BETTER_AUTH_SECRET (al menos 32 caracteres) y BETTER_AUTH_URL antes de publicar.",
  )
if (!secret) {
  mkdirSync(".data", { recursive: true })
  const path = ".data/auth-secret"
  if (!existsSync(path))
    writeFileSync(path, randomBytes(48).toString("base64url"), { mode: 0o600 })
  secret = readFileSync(path, "utf8")
}
export function createAuth(bootstrap = false) {
  const dashboardKey = process.env.BETTER_AUTH_API_KEY?.trim()
  return betterAuth({
    appName: "Track-It",
    secret,
    baseURL,
    plugins: [
      username({ displayUsername: false }),
      ...(dashboardKey ? [dash({ apiKey: dashboardKey, activityTracking: { enabled: false } })] : []),
    ],
    socialProviders: googleEnabled ? {
      google: { clientId: googleClientId!, clientSecret: googleClientSecret!, prompt: "select_account" },
    } : {},
    account: { accountLinking: { enabled: true, disableImplicitLinking: true, allowDifferentEmails: true } },
    user: {
      validateUserInfo: async ({ user: identity, source }) => {
        if (source.method !== "oauth") return
        if (source.oauth?.providerId !== "google" || !identity.emailVerified)
          return { error: "email_not_verified" }
      },
    },
    database: drizzleAdapter(db, {
      provider: "sqlite",
      schema: { user, session, account, verification, rateLimit },
    }),
    emailAndPassword: {
      enabled: true,
      disableSignUp: !signupEnabled && !bootstrap,
      minPasswordLength: 10,
    },
    trustedOrigins,
    rateLimit: { enabled: true, storage: "database", window: 60, max: 60 },
    hooks: {
      before: createAuthMiddleware(async (ctx) => {
        if (ctx.path === "/sign-up/email" && !bootstrap) {
          const parsed = usernameSchema.safeParse(ctx.body?.username)
          if (!parsed.success) throw new APIError("BAD_REQUEST", { code: "INVALID_USERNAME", message: parsed.error.issues[0].message })
          return { context: { body: { ...ctx.body, username: parsed.data, email: localEmail(parsed.data) } } }
        }
      }),
    },
  })
}
export const auth = createAuth()
