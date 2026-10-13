import { createHash, generateKeyPairSync, sign } from "node:crypto"
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest"
import type { app as Application } from "../server/app"
import type { client as Client } from "../server/db/client"

let app: typeof Application, client: typeof Client
const origin = "https://tunnel-test.ngrok-free.dev"
const apiKey = "ClaveFicticiaSoloParaPruebasDelDashboard"
const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" })
const publicJwk = { ...publicKey.export({ format: "jwk" }), kid: "dashboard-test", alg: "ES256", use: "sig" }
const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
  const url = input instanceof Request ? input.url : String(input)
  if (url === "https://dash.better-auth.com/api/auth/jwks") {
    return Response.json({ keys: [publicJwk] })
  }
  throw new Error(`Solicitud externa inesperada durante las pruebas: ${new URL(url).pathname}`)
})
function token(key = apiKey) {
  const issuedAt = Math.floor(Date.now() / 1000)
  const header = Buffer.from(JSON.stringify({ alg: "ES256", kid: "dashboard-test" })).toString("base64url")
  const payload = Buffer.from(JSON.stringify({
    apiKeyHash: createHash("sha256").update(key).digest("hex"), iat: issuedAt, exp: issuedAt + 300,
  })).toString("base64url")
  const message = `${header}.${payload}`
  const signature = sign("sha256", Buffer.from(message), { key: privateKey, dsaEncoding: "ieee-p1363" }).toString("base64url")
  return `${message}.${signature}`
}
beforeAll(async () => {
  vi.stubEnv("DATABASE_URL", ":memory:")
  vi.stubEnv("DATABASE_AUTH_TOKEN", "")
  vi.stubEnv("OWNER_EMAIL", "")
  vi.stubEnv("OWNER_USERNAME", "")
  vi.stubEnv("GOOGLE_CLIENT_ID", "")
  vi.stubEnv("GOOGLE_CLIENT_SECRET", "")
  vi.stubEnv("BETTER_AUTH_URL", origin)
  vi.stubEnv("BETTER_AUTH_SECRET", "SecretoExclusivoDePruebasSinUsoReal2026")
  vi.stubEnv("BETTER_AUTH_API_KEY", apiKey)
  vi.stubGlobal("fetch", fetchMock)
  ;({ client } = await import("../server/db/client"))
  await (await import("../server/migrate")).migrateDatabase()
  ;({ app } = await import("../server/app"))
})
afterAll(() => { client?.close(); vi.unstubAllGlobals(); vi.unstubAllEnvs() })

describe("Conexión autenticada con Better Auth Dashboard", () => {
  it("registra /dash/validate y exige el JWT del dashboard", async () => {
    const response = await app.request(`${origin}/api/auth/dash/validate`)
    expect(response.status).toBe(401)
    expect(fetchMock).not.toHaveBeenCalled()
  })
  it("acepta un JWT firmado con el hash de la API key configurada", async () => {
    const response = await app.request(`${origin}/api/auth/dash/validate`, { headers: { Authorization: `Bearer ${token()}` } })
    expect(response.status).toBe(200)
    expect(await response.json()).toEqual({ valid: true })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
  it("rechaza un JWT de otro proyecto aunque su firma sea válida", async () => {
    const response = await app.request(`${origin}/api/auth/dash/validate`, { headers: { Authorization: `Bearer ${token("OtraClaveFicticia")}` } })
    expect(response.status).toBe(401)
  })
})
