import { createAuthClient } from 'better-auth/react';
import { usernameClient } from 'better-auth/client/plugins';

export const authClient = createAuthClient({
  plugins: [usernameClient({ displayUsername: false })],
  // El loader autenticado de la app ya comprueba la sesión al actualizar datos.
  sessionOptions: { refetchOnWindowFocus: false },
});
