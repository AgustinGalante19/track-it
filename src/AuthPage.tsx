import { financeStore } from './lib/finance-client'
import { holdUpdate } from './lib/update-safety'
import { useEffect, useState } from "react"
import { useNavigate, useSearchParams } from "react-router-dom"
import {
  ArrowRight,
  Sparkles,
  Eye,
  EyeOff,
  LoaderCircle,
} from "lucide-react"
import { Button } from "./components/ui/button"
import { api, send } from "./lib/api"
import { authClient } from "./lib/auth-client"
import {
  authErrorMessage,
  localEmail,
  usernameSchema,
  type AuthConfig,
} from "../shared/auth"
import { GoogleIcon } from "./components/GoogleIcon"

export function AuthPage() {
  const navigate = useNavigate()
  const [params] = useSearchParams()
  const [config, setConfig] = useState<AuthConfig | null>(null)
  const [signup, setSignup] = useState(false),
    [showPassword, setShowPassword] = useState(false)
  const [busy, setBusy] = useState<"password" | "google" | "demo" | null>(null)
  const [dirty, setDirty] = useState(false)
  useEffect(() => dirty || busy ? holdUpdate() : undefined, [dirty, busy])
  const [error, setError] = useState(() =>
    params.has("error") ? authErrorMessage(params.get("error") || "") : "",
  )
  useEffect(() => {
    api<AuthConfig>("/config")
      .then((value) => {
        // El callback y la cookie de OAuth deben usar el mismo origen.
        if (
          value.googleEnabled &&
          value.authOrigin !== window.location.origin
        ) {
          window.location.replace(
            new URL(`/acceso${window.location.search}`, value.authOrigin),
          )
          return
        }
        setConfig(value)
      })
      .catch(() =>
        setError(
          "No pudimos conectar con el servidor. Recargá la página para volver a intentar.",
        ),
      )
  }, [])

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setBusy("password")
    setError("")
    const values = new FormData(event.currentTarget)
    try {
      const parsed = usernameSchema.safeParse(values.get("username"))
      if (!parsed.success) throw new Error(parsed.error.issues[0].message)
      const input = {
        username: parsed.data,
        password: String(values.get("password")),
      }
      const result = signup
        ? await authClient.signUp.email({
            ...input,
            email: localEmail(input.username),
            name: String(values.get("name")).trim(),
          })
        : await authClient.signIn.username(input)
      if (result.error) throw new Error(authErrorMessage(result.error.code))
      financeStore.resetSession()
      navigate("/", { replace: true })
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No pudimos iniciar sesión.",
      )
    } finally {
      setBusy(null)
    }
  }
  async function google() {
    setBusy("google")
    setError("")
    try {
      const result = await authClient.signIn.social({
        provider: "google",
        callbackURL: "/",
        errorCallbackURL: "/acceso",
      })
      if (result.error) throw new Error(authErrorMessage(result.error.code))
    } catch (error) {
      console.log(error)
      setError(
        error instanceof Error
          ? error.message
          : "No pudimos conectar con Google.",
      )
      setBusy(null)
    }
  }
  async function demo() {
    setBusy("demo")
    setError("")
    try {
      await send("/demo", {})
      const result = await authClient.signIn.username({
        username: "demo",
        password: "SoloDemo2026!",
      })
      if (result.error) throw new Error(authErrorMessage(result.error.code))
      financeStore.resetSession()
      navigate("/", { replace: true })
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "No pudimos abrir el ejemplo.",
      )
    } finally {
      setBusy(null)
    }
  }
  return (
    <main className='auth-page'>
      <section className='auth-intro'>
        <div className='brand'>
          <span className='brand-mark'>
            <img src="/icon-192.png" width="37" height="37" alt="" />
          </span>
          <span>
            Track-It
          </span>
        </div>
        <div>
          <span className='eyebrow'>UN POCO DE ORDEN, MUCHA TRANQUILIDAD</span>
          <h1>
            Tu mes,
            <br />
            con claridad.
          </h1>
          <p>
            Gastos cotidianos, próximos pagos y tus cuentas.
            <br />
            Todo en un lugar, a tu ritmo.
          </p>
          <div className='auth-illustration' aria-hidden='true'>
            <span>🛒</span>
            <span>📶</span>
            <span>💳</span>
            <span>🌿</span>
          </div>
        </div>
        <span className='muted small'>Una compra a la vez.</span>
      </section>
      <section className='auth-card'>
        <span className='eyebrow'>TU ESPACIO PERSONAL</span>
        <h2>
          {signup ? "Empecemos por tu cuenta" : "Qué bueno verte de nuevo"}
        </h2>
        <p className='muted'>
          {signup
            ? "Elegí tu usuario. Después agregamos tus cuentas."
            : "Ingresá para ver cómo viene tu mes."}
        </p>
        {config?.googleEnabled && (
          <>
            <Button
              className='google-signin'
              variant='outline'
              disabled={!!busy}
              onClick={google}
            >
              {busy === "google" ? (
                <LoaderCircle className='spin' size={18} />
              ) : (
                <GoogleIcon />
              )}
              Continuar con Google
            </Button>
            <div className='auth-divider'>
              <span>o con tu usuario</span>
            </div>
          </>
        )}
        {error && (
          <p className='form-error auth-error' role='alert'>
            {error}
          </p>
        )}
        <form onSubmit={submit} onChange={() => setDirty(true)} className='form-stack'>
          {signup && (
            <label className='field'>
              Tu nombre
              <input
                name='name'
                autoComplete='name'
                required
                maxLength={80}
                placeholder='¿Cómo te llamás?'
                disabled={!!busy}
              />
            </label>
          )}
          <label className='field'>
            Usuario
            <input
              name='username'
              autoComplete='username'
              autoCapitalize='none'
              spellCheck={false}
              minLength={3}
              maxLength={30}
              required
              placeholder='tu_usuario'
              disabled={!config || !!busy}
            />
            {signup && (
              <span className='field-hint'>
                Entre 3 y 30 caracteres: letras, números, puntos o guion bajo.
              </span>
            )}
          </label>
          <label className='field'>
            Contraseña
            <div className='password-field'>
              <input
                name='password'
                type={showPassword ? "text" : "password"}
                autoComplete={signup ? "new-password" : "current-password"}
                minLength={signup ? 10 : undefined}
                maxLength={128}
                required
                placeholder={
                  signup ? "Al menos 10 caracteres" : "Tu contraseña"
                }
                disabled={!config || !!busy}
              />
              <button
                type='button'
                onClick={() => setShowPassword(!showPassword)}
                aria-label={
                  showPassword ? "Ocultar contraseña" : "Mostrar contraseña"
                }
              >
                {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
              </button>
            </div>
          </label>
          <Button disabled={!config || !!busy} type='submit'>
            {busy === "password" ? (
              <LoaderCircle className='spin' size={18} />
            ) : (
              <ArrowRight size={18} />
            )}
            {signup ? "Crear mi cuenta" : "Ingresar"}
          </Button>
        </form>
        {config?.signupEnabled && (
          <p className='auth-switch'>
            {signup ? "¿Ya tenés cuenta?" : "¿Primera vez por acá?"}{" "}
            <button
              disabled={!!busy}
              onClick={() => {
                setSignup(!signup)
                setError("")
              }}
            >
              {signup ? "Ingresar" : "Crear una cuenta"}
            </button>
          </p>
        )}
        {config?.demoEnabled && (
          <div className='demo-entry'>
            <Button variant='outline' disabled={!!busy} onClick={demo}>
              {busy === "demo" ? (
                <LoaderCircle className='spin' size={17} />
              ) : (
                <Sparkles size={17} />
              )}
              Explorar con datos de ejemplo
            </Button>
            <p className='muted small'>
              Un espacio de prueba separado de tu cuenta.
            </p>
          </div>
        )}
      </section>
    </main>
  )
}
