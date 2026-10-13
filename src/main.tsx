import React from "react"
import ReactDOM from "react-dom/client"
import {
  createBrowserRouter,
  RouterProvider,
  redirect,
  useRouteError,
  Link,
} from "react-router-dom"
import { api } from "./lib/api"
import { loadFinance, shouldReloadFinance } from "./lib/route-data"
import { Layout, Loading } from "./Layout"
import { UpdatePrompt } from "./components/UpdatePrompt"
import "./styles.css"
import "./navigation.css"

const AuthPage = React.lazy(() =>
  import("./AuthPage").then((module) => ({ default: module.AuthPage })),
)

function RouteError() {
  const error = useRouteError()
  return (
    <main className='error-page'>
      <span>🌿</span>
      <h1>No pudimos cargar tus datos</h1>
      <p>
        {error instanceof Error
          ? error.message
          : "Revisá tu conexión y volvé a intentarlo."}
      </p>
      <button
        className='btn btn-primary'
        onClick={() => window.location.reload()}
      >
        Volver a intentar
      </button>
      <Link to='/acceso'>Ir al acceso</Link>
    </main>
  )
}
const router = createBrowserRouter([
  {
    path: "/acceso",
    element: (
      <React.Suspense fallback={<Loading />}>
        <AuthPage />
      </React.Suspense>
    ),
  },
  {
    path: "/",
    element: <Layout />,
    errorElement: <RouteError />,
    HydrateFallback: Loading,
    loader: loadFinance,
    shouldRevalidate: shouldReloadFinance,
    children: [
      {
        index: true,
        lazy: async () => ({
          Component: (await import("./pages")).ExpensesPage,
        }),
      },
      {
        path: "recurrentes",
        lazy: async () => ({
          Component: (await import("./pages")).RecurringPage,
        }),
      },
      {
        path: "categorias",
        lazy: async () => ({
          Component: (await import("./CategoriesPage")).CategoriesPage,
        }),
      },
      {
        path: "ajustes",
        lazy: async () => ({
          Component: (await import("./SettingsPage")).SettingsPage,
        }),
      },
      {
        path: "cuentas",
        lazy: async () => ({
          Component: (await import("./AccountsPage")).AccountsPage,
        }),
      },
      {
        path: "cuentas/:id",
        lazy: async () => ({
          Component: (await import("./pages")).AccountPage,
        }),
        loader: ({ params, request }) => api(`/accounts/${params.id}/history`, { signal: request.signal }),
      },
      { path: "*", loader: () => redirect("/") },
    ],
  },
])
ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <RouterProvider router={router} />
    <UpdatePrompt />
  </React.StrictMode>,
)
