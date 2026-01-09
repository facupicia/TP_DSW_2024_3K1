# Solución de Problemas de Google OAuth en Safari Mobile

Este documento aborda los problemas comunes de autenticación con Google en dispositivos iOS (Safari Mobile) y explica cómo la configuración actual del proyecto maneja estos desafíos.

## 1. Verificación de Configuración en Google Cloud Console

Para que la autenticación funcione correctamente, verifica los siguientes puntos en la [Google Cloud Console](https://console.cloud.google.com/):

*   **Orígenes de JavaScript autorizados**:
    *   Deben coincidir **exactamente** con la URL de tu aplicación.
    *   Desarrollo: `http://localhost:4200` (y `http://localhost` si usas ese).
    *   Producción: `https://backend-eventlife.onrender.com` (o tu dominio de frontend si es diferente, ej. Netlify/Vercel). **Nota:** Si tu frontend está en un dominio distinto al backend, asegúrate de agregar EL DOMINIO DEL FRONTEND.
    *   **Importante:** No incluyas `/` al final de la URL.

*   **URI de redirección autorizados**:
    *   Aunque usamos `ux_mode: 'popup'`, es recomendable configurar la URI de redirección si en el futuro cambias a `redirect`.
    *   Formato: `https://tu-dominio.com` y `http://localhost:4200`.

*   **Usuarios de prueba (Test Users)**:
    *   Si tu aplicación está en estado "Testing" (Prueba) en la pantalla de consentimiento de OAuth, **SOLO** los usuarios agregados a la lista de usuarios de prueba podrán iniciar sesión.
    *   Si ves el error `403: access_denied`, verifica esto primero.

## 2. Enfoque de WebView y ASWebAuthenticationSession

El mensaje "Actualiza tu enfoque a ASWebAuthenticationSession" se refiere principalmente a aplicaciones nativas (iOS/Swift) o híbridas (Capacitor/Ionic).

**Para esta aplicación Angular (Web Pura):**
*   No podemos invocar `ASWebAuthenticationSession` directamente ya que corremos dentro del navegador Safari estándar.
*   **Nuestra Solución:** Utilizamos el SDK de Google Identity Services con `itp_support: true` (Intelligent Tracking Prevention). Esto permite que la cookie de sesión de Google se maneje correctamente incluso con las restricciones de privacidad de Safari.

**Si estás usando un Wrapper (Capacitor/Cordova):**
*   Debes instalar el plugin nativo de Google Auth para usar la autenticación nativa del sistema en lugar del flujo web.

## 3. Errores en Consola de Safari (Debugging)

Si el problema persiste en un iPhone real:
1.  **Conectar al Mac:** Usa un cable para conectar el iPhone a un Mac.
2.  **Habilitar Inspector Web:** En el iPhone: *Ajustes > Safari > Avanzado > Inspector Web*.
3.  **Safari en Mac:** Abre Safari, ve al menú *Desarrollo*, selecciona tu iPhone y la pestaña activa.
4.  **Revisar Red:** Busca errores `403` o `400` en las peticiones a `accounts.google.com`.
    *   `invalid_request`: Configuración de cliente ID o dominio incorrecta.
    *   `popup_blocked_by_browser`: El navegador bloqueó la ventana emergente. Asegúrate de que el clic sea directo del usuario.

## 4. HTTPS y Políticas de Seguridad

Google exige HTTPS para OAuth 2.0.

*   **Backend (`app.ts`)**: Hemos configurado `Cross-Origin-Opener-Policy` (COOP) a `same-origin-allow-popups`. Esto es crucial para que la ventana emergente de Google pueda comunicarse con la ventana principal de manera segura.
*   **Frontend**: Asegúrate de que `environment.ts` (producción) use `https://`.

## Resumen de la Implementación Actual (`LoginComponent`)

*   **`itp_support: true`**: Habilitado para Safari.
*   **`NgZone`**: Usado para asegurar que los callbacks de Google actualicen la UI de Angular (soluciona el "login congelado").
*   **Carga del Script**: Se verifica la carga del script `gsi/client` antes de intentar renderizar el botón.
