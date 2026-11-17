# MercadoPago: migración de configuración desde Render

Fecha: 17/11/2026. Se instalaron las credenciales suministradas por el usuario en la configuración privada del servidor y en los archivos locales ignorados `.env` y `portainer.env`. Ningún valor secreto se incluye en este documento ni en Git.

## URLs vigentes

| Uso | URL |
|---|---|
| Backend público, `APP_URL`, `BACKEND_URL` y `MP_SUBSCRIPTION_BACK_URL` | `https://api.vidaeventofiesta.site` |
| Notificaciones de pagos | `https://api.vidaeventofiesta.site/api/payment/webhook` |
| Notificaciones de suscripciones | `https://api.vidaeventofiesta.site/api/subscription/webhook` |
| Redirect URI de OAuth de organizadores | `https://api.vidaeventofiesta.site/api/payment/mp/callback` |
| Retorno de suscripciones generado por el backend | `https://api.vidaeventofiesta.site/api/subscription/callback` |
| Retornos de checkout de entradas | `https://event-life.netlify.app/checkout/success`, `/checkout/failure`, `/checkout/pending` |

Las URLs del contenedor ya apuntaban al backend actual antes de este cambio. Sus credenciales eran diferentes de las suministradas por el usuario y fueron reemplazadas después de validarlas.

## Validación de credenciales

- Token de plataforma: `/users/me` respondió 200, sitio MLA, vendedor marcado por MercadoPago como `test_user`.
- Token de suscripciones: `/users/me` respondió 200, sitio MLA, cuenta sin etiqueta de usuario de prueba.
- Client ID/Secret OAuth de la aplicación `7076772318823623`: el flujo `client_credentials` respondió 200 y `live_mode=true`. La cuenta coincide con la del token de suscripciones.
- El prefijo `APP_USR` del token de plataforma no demuestra que la cuenta sea real. `MP_MODE=production` conserva el flujo marketplace con cuentas OAuth de organizadores; no convierte ese vendedor de prueba en uno real.

## Publicación y aceptación

Se recreó solamente el backend con la imagen ya validada `eventlife-backend:smtp-20261117-1345`, commit de aplicación `018edfe`. El cambio es de configuración: no requiere compilar otra imagen ni aplicar migraciones.

El release `/home/facu/eventlife-releases/20261117-1400-mp/` contiene entorno privado, inspección anterior, Compose de publicación, Compose de rollback y evidencia de los endpoints públicos. Se conservaron Redis, claves de sesión, cifrado y SMTP vigentes. El contenedor quedó healthy, con cero reinicios, `MAIL_PROVIDER=smtp`, `DB_SYNC=false` y verificación de mailer aprobada.

Pruebas por HTTPS:

- Health y catálogo: 200.
- Callback OAuth sin parámetros: 302 al frontend, con error de parámetros faltantes, sin intercambiar tokens de organizadores.
- Callback de suscripciones: 302 al frontend correcto.
- Ambos webhooks sin firma: 401.
- Ambos webhooks con las firmas nuevas: 200 para un tópico diagnóstico ignorado. Esto comprueba las claves activas y la ruta pública; no demuestra que un pago real termine correctamente.

No se crearon cobros, suscripciones ni devoluciones. No se iniciaron conexiones OAuth de organizadores. Las pruebas unitarias y CI corresponden a la imagen sin cambios de código de aplicación: 45 pruebas aprobadas en la publicación SMTP.

## Registro externo verificado

La configuración privada del backend no modifica automáticamente las URLs registradas en MercadoPago. Se revisaron ambas aplicaciones desde la sesión iniciada por el titular en el navegador integrado. No se regeneraron claves de firma ni se cambiaron permisos.

El usuario inició sesión en el navegador integrado de Codex y se pudo inspeccionar la aplicación `eventlife-marketplace` (`7076772318823623`). Su configuración productiva ya tenía guardada la URL de pagos indicada arriba, con el evento Pagos (legacy) activo. La firma secreta del panel se comparó en memoria con la configurada en el backend y coincidió, sin registrarla en el documento ni regenerarla. No fue necesario volver a guardar esa configuración.

El titular aprobó la validación de identidad por QR. En la aplicación marketplace se reemplazaron el sitio de producción de Render por `https://event-life.netlify.app` y la Redirect URI antigua por `https://api.vidaeventofiesta.site/api/payment/mp/callback`. MercadoPago confirmó el guardado y ambos valores se comprobaron al volver a abrir la configuración. Se conservaron los permisos existentes y la opción de PKCE.

En `suscripciones-event-life` (`4144203999004496`) se verificaron la URL productiva `https://api.vidaeventofiesta.site/api/subscription/webhook`, el evento Planes y suscripciones activo y la coincidencia de su firma secreta con el backend. El sitio de producción ya era Netlify. La URL de notificaciones del modo de prueba todavía apuntaba a Render: se actualizó al mismo endpoint de suscripciones y se comprobó su persistencia tras recargar.

`MP_NOTIFICATION_URL_SUSCRIPCION` se conserva en entorno, pero el código actual de creación de preapproval no envía ese valor al proveedor. El endpoint queda registrado directamente mediante Webhooks en el panel. La verificación de configuración y firmas no sustituye una prueba completa del ciclo de una suscripción real ni de una compra con la cuenta de un organizador.

## Variables heredadas

Se conservó el valor suministrado `PLATFORM_SERVICE_FEE_PERCENT=0` en entorno. El código actual toma comisión y cargo de servicio de los planes de PostgreSQL, no de esa variable; este cambio no elimina cargos ni altera precios de planes. La Public Key suministrada se conserva en la configuración privada, pero Checkout Pro redirige al `init_point` del backend y no consume esa variable en el frontend actual.

## Recuperación

```sh
docker compose -p backend-eventlife \
  -f /home/facu/eventlife-releases/20261117-1400-mp/compose.rollback.json \
  up -d --no-deps backend
```

El rollback restaura el entorno SMTP anterior, incluidas las credenciales previas de MercadoPago; no revierte cambios que se hayan guardado por separado en su panel.

Referencias oficiales: [datos de integración y Redirect URI](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/additional-content/your-integrations/application-details), [notificaciones](https://www.mercadopago.com.ar/developers/es/docs/subscriptions/additional-content/your-integrations/notifications/webhooks), [OAuth](https://www.mercadopago.com.ar/developers/es/docs/security/oauth/creation), [creación de preapproval](https://www.mercadopago.com.ar/developers/en/reference/online-payments/subscriptions/create-preapproval/post).
