import { useState, type CSSProperties } from "react"
import {
  ShoppingBasket,
  Utensils,
  Coffee,
  Bus,
  HeartPulse,
  House,
  Laptop,
  Gamepad2,
  GraduationCap,
  Plane,
  PawPrint,
  Tag,
  Wifi,
  Zap,
  Droplets,
  Clapperboard,
} from "lucide-react"
import {
  categoryIcon,
  categoryIconKeys,
  brandIconKeys,
  normalizeIconName,
  type IconKey,
} from "../../shared/icons"
import type { Category } from "../../shared/domain"
import youtube from "../assets/brands/youtube.svg"
import spotify from "../assets/brands/spotify.svg"
import netflix from "../assets/brands/netflix.svg"
import twitch from "../assets/brands/twitch.svg"
import discord from "../assets/brands/discord.svg"
import "../visual-icons.css"

const catalog = {
  shopping: {
    label: "Compras",
    Icon: ShoppingBasket,
    color: "#25815b",
    light: "#216b4d",
    dark: "#82ddaf",
  },
  food: {
    label: "Comida",
    Icon: Utensils,
    color: "#bc6831",
    light: "#8f461e",
    dark: "#ffc08e",
  },
  coffee: {
    label: "Café",
    Icon: Coffee,
    color: "#8460b4",
    light: "#684390",
    dark: "#c8afff",
  },
  transport: {
    label: "Transporte",
    Icon: Bus,
    color: "#347fba",
    light: "#246696",
    dark: "#9bceff",
  },
  health: {
    label: "Salud",
    Icon: HeartPulse,
    color: "#b34f70",
    light: "#963c5a",
    dark: "#ffacc6",
  },
  home: {
    label: "Hogar",
    Icon: House,
    color: "#34856b",
    light: "#246b54",
    dark: "#88dfbd",
  },
  technology: {
    label: "Tecnología",
    Icon: Laptop,
    color: "#536bbb",
    light: "#405699",
    dark: "#aebfff",
  },
  entertainment: {
    label: "Entretenimiento",
    Icon: Clapperboard,
    color: "#3879bd",
    light: "#29629d",
    dark: "#a0c9ff",
  },
  gaming: {
    label: "Gaming",
    Icon: Gamepad2,
    color: "#8a4b9c",
    light: "#6d3a7a",
    dark: "#d0a0e0",
  },
  education: {
    label: "Educación",
    Icon: GraduationCap,
    color: "#9067b4",
    light: "#754d99",
    dark: "#d8b5ff",
  },
  travel: {
    label: "Viajes",
    Icon: Plane,
    color: "#29848a",
    light: "#226b70",
    dark: "#8adfe6",
  },
  pets: {
    label: "Mascotas",
    Icon: PawPrint,
    color: "#ad7340",
    light: "#87572f",
    dark: "#efc18e",
  },
  general: {
    label: "General",
    Icon: Tag,
    color: "#6c7b91",
    light: "#526279",
    dark: "#b8c7de",
  },
  wifi: {
    label: "Internet",
    Icon: Wifi,
    color: "#287db8",
    light: "#206496",
    dark: "#91d0ff",
  },
  electricity: {
    label: "Electricidad",
    Icon: Zap,
    color: "#a17820",
    light: "#795a17",
    dark: "#f1d17e",
  },
  water: {
    label: "Agua",
    Icon: Droplets,
    color: "#27839b",
    light: "#216a7d",
    dark: "#92dced",
  },
  youtube: {
    label: "YouTube",
    src: youtube,
    color: "#d52936",
    light: "#b51d29",
    dark: "#ff8992",
  },
  spotify: {
    label: "Spotify",
    src: spotify,
    color: "#168640",
    light: "#126d34",
    dark: "#72e59c",
  },
  netflix: {
    label: "Netflix",
    src: netflix,
    color: "#cf2633",
    light: "#b11e29",
    dark: "#ff8c95",
  },
  twitch: {
    label: "Twitch",
    src: twitch,
    color: "#9146ff",
    light: "#7135c9",
    dark: "#c6a0ff",
  },
  discord: {
    label: "Discord",
    src: discord,
    color: "#5865f2",
    light: "#4550c2",
    dark: "#aeb5ff",
  },
}
export function VisualIcon({
  iconKey = "general",
  small = false,
}: {
  iconKey?: IconKey
  small?: boolean
}) {
  const entry =
    catalog[iconKey === "category" ? "general" : iconKey] ?? catalog.general
  return (
    <span
      className={`visual-icon${small ? " visual-icon-small" : ""}`}
      data-icon={iconKey}
      aria-hidden='true'
      style={
        {
          "--icon-color": entry.color,
          "--icon-light": entry.light,
          "--icon-dark": entry.dark,
        } as CSSProperties
      }
    >
      {"Icon" in entry ? (
        <entry.Icon />
      ) : (
        <img src={entry.src} alt='' width='28' height='28' />
      )}
    </span>
  )
}
export function CategoryIcon({
  category,
  small,
}: {
  category?: Category | null
  small?: boolean
}) {
  return <VisualIcon iconKey={categoryIcon(category)} small={small} />
}
export function IconPicker({
  value,
  onChange,
  brands = false,
  inherited = "general",
  disabled = false,
}: {
  value: IconKey
  onChange: (key: IconKey) => void
  brands?: boolean
  inherited?: IconKey
  disabled?: boolean
}) {
  const [search, setSearch] = useState("")
  const keys = [...categoryIconKeys, ...(brands ? brandIconKeys : [])]
  const visible = keys.filter((key) =>
    normalizeIconName(catalog[key].label).includes(normalizeIconName(search)),
  )
  return (
    <fieldset className='icon-picker' disabled={disabled}>
      <legend>Ícono</legend>
      <div className='icon-preview'>
        <VisualIcon iconKey={value === "category" ? inherited : value} />
        <span>
          {value === "category" ? "Usar categoría" : catalog[value].label}
        </span>
      </div>
      <label className='field'>
        Buscar íconos
        <input
          type='search'
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder='Café, hogar, Spotify…'
        />
      </label>
      {brands && (
        <button
          type='button'
          className='inherit-icon'
          aria-pressed={value === "category"}
          onClick={() => onChange("category")}
        >
          Usar ícono de la categoría
        </button>
      )}
      <div className='icon-picker-grid' role='group' aria-label='Elegir ícono'>
        {visible.map((key) => (
          <button
            type='button'
            key={key}
            aria-label={catalog[key].label}
            aria-pressed={value === key}
            onClick={() => onChange(key)}
          >
            <VisualIcon iconKey={key} small />
            <span>{catalog[key].label}</span>
          </button>
        ))}
      </div>
      {!visible.length && (
        <p className='muted small'>No encontramos íconos con ese nombre.</p>
      )}
    </fieldset>
  )
}
