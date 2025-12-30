# Solución a Problemas de Autenticación en Safari y Menú Hamburguesa

## Resumen de Cambios

Se han implementado correcciones críticas para solucionar problemas de autenticación con Google Auth0 en Safari y la reactividad del menú de usuario.

### 1. Problema de Autenticación en Safari (Frozen Login)

**Causa:**
El SDK de Google Identity Services ejecuta sus callbacks fuera de la "Zona" de Angular (`NgZone`). Esto causaba que, aunque la autenticación fuera exitosa en el backend, la interfaz de usuario no se actualizara (spinner congelado) y la navegación no se disparara visualmente.

**Solución:**
- Se implementó `NgZone.run()` en el callback `onGoogleCredential` y en la inicialización del botón. Esto fuerza a Angular a detectar los cambios y procesar la navegación inmediatamente.
- Se agregó una lógica de **reintento (retry)** para la inicialización del objeto `google`. Esto soluciona condiciones de carrera en conexiones lentas o Safari donde el script `async` carga después de que el componente se monta.
- Se añadió la configuración `itp_support: true` (Intelligent Tracking Prevention) para mejorar la compatibilidad con las restricciones de cookies de Safari.

### 2. Sincronización de Estado (Menú Hamburguesa)

**Causa:**
El menú no actualizaba su estado (de "Iniciar sesión" a "Perfil") correctamente porque la navegación ocurría antes de que el perfil del usuario se cargara completamente. Además, la suscripción al estado del usuario no siempre forzaba el repintado en dispositivos móviles.

**Solución:**
- **Encadenamiento de Observables (`switchMap`):** En `AuthService`, los métodos `login` y `loginWithGoogle` ahora esperan a que `getProfile()` complete exitosamente antes de emitir el valor de retorno. Esto garantiza que cuando el componente `Login` navega al `Home`, el estado del usuario ya está actualizado en el `currentUserSubject`.
- **Detección de Cambios Explícita:** En `HeaderComponent`, se inyectó `ChangeDetectorRef` para forzar la actualización de la vista (`detectChanges()`) cada vez que cambia el usuario. Esto asegura que el menú hamburguesa refleje el estado correcto inmediatamente.
- **Manejo de Errores:** Se agregó lógica para cerrar sesión automáticamente (`logout`) si la obtención del perfil falla (ej. token expirado o inválido), previniendo estados inconsistentes.

### 3. Validación y Compatibilidad

- **Safari iOS/macOS:** Las correcciones abordan específicamente el manejo de ITP y la ejecución de scripts asíncronos.
- **Chrome/Firefox:** Las mejoras en `NgZone` y el encadenamiento de observables benefician a todos los navegadores, haciendo la aplicación más robusta y rápida.

## Archivos Modificados

1.  `Frontend/src/app/pages/login/login.component.ts`: Lógica de zona, reintentos y configuración de Google.
2.  `Frontend/src/app/services/auth.service.ts`: Flujo de autenticación atómico (Login + Profile) y manejo de errores.
3.  `Frontend/src/app/components/header/header.component.ts`: Reactividad mejorada del menú.

## Verificación

Para verificar la solución:
1. Abrir la aplicación en Safari (o modo incógnito).
2. Navegar a `/login`.
3. Usar el botón de Google.
4. El spinner debe aparecer y luego redirigir fluidamente al Home.
5. El header debe mostrar inmediatamente el avatar del usuario y no los botones de Login/Register.
