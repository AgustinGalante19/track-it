import { z } from 'zod';

export const usernameSchema = z.string().trim().min(3, 'Usá al menos 3 caracteres.').max(30, 'Usá hasta 30 caracteres.')
  .regex(/^[a-zA-Z0-9_.]+$/, 'Usá letras, números, puntos o guion bajo.').transform((value) => value.toLowerCase());

// Better Auth necesita un email interno incluso para cuentas que solo usan usuario.
// .invalid no recibe correo y nunca se usa para enviar mensajes ni verificar identidad.
export function localEmail(username: string) {
  const encoded = Array.from(username.toLowerCase(), (character) => character.charCodeAt(0).toString(16).padStart(2, '0')).join('');
  return `u+${encoded}@cuentas.invalid`;
}

export type AuthUser = { name: string; email: string; username?: string | null; image?: string | null };
export type AuthConfig = { signupEnabled: boolean; demoEnabled: boolean; googleEnabled: boolean; authOrigin: string };

export function authErrorMessage(code?: string, fallback = 'No pudimos iniciar sesión. Volvé a intentarlo.') {
  switch (code?.toLowerCase()) {
    case 'invalid_username_or_password': case 'invalid_email_or_password': return 'El usuario o la contraseña no son correctos.';
    case 'username_is_already_taken': case 'user_already_exists': case 'user_already_exists_use_another_email': return 'Ese usuario ya está en uso. Elegí otro.';
    case 'username_too_short': case 'username_too_long': case 'invalid_username': return 'El usuario debe tener entre 3 y 30 letras, números, puntos o guion bajo.';
    case 'password_too_short': return 'La contraseña debe tener al menos 10 caracteres.';
    case 'password_too_long': return 'La contraseña es demasiado larga.';
    case 'too_many_requests': return 'Hubo muchos intentos seguidos. Esperá unos segundos y probá de nuevo.';
    case 'session_not_fresh': case 'session_expired': return 'Volvé a ingresar para confirmar este cambio en tu acceso.';
    case 'password_already_set': return 'Tu cuenta ya tiene una contraseña habilitada.';
    case 'account_not_linked': return 'Ya tenés una cuenta. Ingresá con tu usuario y conectá Google desde Configuración para conservar tus datos.';
    case 'access_denied': return 'El acceso con Google fue cancelado o no se autorizó. Podés volver a intentarlo.';
    case 'signup_disabled': case 'sign_up_disabled': return 'El registro no está disponible en este momento.';
    case 'email_not_verified': return 'Google debe confirmar el email de tu cuenta para poder ingresar.';
    case 'state_mismatch': case 'state_not_found': case 'state_expired': return 'El acceso con Google venció. Volvé a intentarlo desde esta página.';
    default: return fallback;
  }
}
