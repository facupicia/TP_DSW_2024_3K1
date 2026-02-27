# Solución de Problemas de Google OAuth en Safari Mobile

Este documento describe la solución implementada para el problema de autenticación con Google en dispositivos iOS (Safari Mobile) y cómo funciona.

## Resumen de la Solución

El problema principal es que Safari en iOS tiene restricciones severas con:
1. **Bloqueo de popups** - Safari en móviles bloquea ventanas emergentes más agresivamente
2. **Intelligent Tracking Prevention (ITP)** - Limita cookies de terceros y almacenamiento
3. **Cross-origin communication** - Restricciones en comunicación entre ventanas

La solución implementada detecta automáticamente Safari en iOS y utiliza estrategias alternativas:

### Estrategia para Safari iOS

1. **Detección automática**: El componente detecta Safari en iOS/iPadOS mediante user-agent
2. **FedCM primero**: Intenta usar FedCM (Federated Credential Management), la API moderna de Google
3. **Fallback a redirect**: Si FedCM no está disponible, usa `ux_mode: 'redirect'` en lugar de popup
4. **Botón personalizado**: Renderiza un botón personalizado optimizado para Safari

### Para otros navegadores

- Se mantiene el modo `popup` que funciona correctamente
- Se usa `itp_support: true` como medida preventiva

---

## Configuración Requerida

### 1. Google Cloud Console

En [Google Cloud Console](https://console.cloud.google.com/apis/credentials):

**Orígenes de JavaScript autorizados:**
- Producción: `https://event-life.netlify.app` (tu dominio de frontend)
- Desarrollo: `http://localhost:4200`

**URI de redirección autorizados:**
- `https://event-life.netlify.app` (o tu dominio)
- `http://localhost:4200`
- **IMPORTANTE**: Agrega también `https://event-life.netlify.app/login` si usas modo redirect

### 2. Backend (Headers COOP)

El backend ya está configurado con:

```typescript
app.use(helmet({ 
  crossOriginOpenerPolicy: { policy: "same-origin-allow-popups" } 
}));
```

Esto es necesario para permitir que la ventana de Google se comunique con la aplicación.

---

## Cómo Funciona la Implementación

### Flujo para Safari iOS:

```
1. Usuario hace clic en "Continuar con Google"
2. Se marca flag en sessionStorage: google_auth_in_progress = true
3. Se llama a g.accounts.id.prompt() o redirect a Google
4. Usuario completa autenticación en Google
5. Google redirige de vuelta a la app
6. El componente detecta el regreso (ngOnInit)
7. Procesa el credential y completa el login
```

### Detección de Safari iOS:

```typescript
const ua = window.navigator.userAgent.toLowerCase();
const isIOS = /iphone|ipad|ipod/.test(ua);
const isSafari = /safari/.test(ua) && !/chrome|crios|crmo/.test(ua);
const isSafariIOS = isIOS && isSafari;
```

---

## Debugging en Safari iOS

### Usar Web Inspector en Mac:

1. Conecta el iPhone/iPad a tu Mac con cable
2. En el dispositivo: **Ajustes → Safari → Avanzado → Inspector Web** (activar)
3. En Safari Mac: Menú **Desarrollo → [Tu dispositivo] → [Página activa]**
4. Revisa la consola para mensajes como:
   - `Inicializando Google Auth - Modo: redirect, Safari iOS: true`
   - `Botón personalizado para Safari iOS renderizado`

### Errores comunes:

| Error | Causa | Solución |
|-------|-------|----------|
| `popup_blocked_by_browser` | Safari bloqueó el popup | Se soluciona automáticamente con modo redirect |
| `invalid_client` | Client ID incorrecto | Verificar en Google Cloud Console |
| `redirect_uri_mismatch` | URI no autorizada | Agregar la URL en credenciales de Google |
| `disallowed_useragent` | WebView no permitida | Asegurar que es Safari nativo, no WebView |

---

## Notas Técnicas

### FedCM (Federated Credential Management)

FedCM es una API del navegador que permite autenticación federada sin cookies de terceros. Google la usa automáticamente cuando está disponible.

```typescript
use_fedcm_for_prompt: true
```

**Compatibilidad:**
- Chrome 108+ ✅
- Safari: En desarrollo por Apple
- Firefox: En consideración

### Modo Redirect vs Popup

| Característica | Popup | Redirect |
|---------------|-------|----------|
| Safari iOS | ❌ Bloqueado | ✅ Funciona |
| Chrome Desktop | ✅ Funciona | ✅ Funciona |
| UX | Mejor (no recarga) | Requiere recarga |
| Implementación | Simple | Requiere manejar callback |

---

## Actualizaciones Futuras

### Cuando FedCM esté ampliamente soportado:

1. Se podrá usar el mismo código para todos los navegadores
2. El modo popup funcionará incluso en Safari
3. No será necesario el botón personalizado

### Para mantener:

1. Monitorear el soporte de FedCM en Safari
2. Probar periódicamente en dispositivos iOS reales
3. Mantener actualizadas las URIs en Google Cloud Console

---

## Referencias

- [Google Identity Services - FedCM](https://developers.google.com/identity/gsi/web/guides/fedcm)
- [Safari Intelligent Tracking Prevention](https://webkit.org/blog/9521/intelligent-tracking-prevention-2-3/)
- [FedCM API Draft](https://fedidcg.github.io/FedCM/)
