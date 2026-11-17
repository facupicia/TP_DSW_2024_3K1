# Email transaccional: SMTP y Brevo

La clave de Brevo comprobada el 17/11/2026 respondió HTTP 401, `API Key is not enabled`. Se agregó selección explícita del proveedor mediante `MAIL_PROVIDER=brevo|smtp`; el valor predeterminado sigue siendo Brevo para conservar compatibilidad.

Para Gmail SMTP se requiere `MAIL_PROVIDER=smtp`, host `smtp.gmail.com`, puerto `465`, usuario, contraseña de aplicación y remitente en las variables `MAIL_*`. Los valores sensibles se conservan en archivos de entorno ignorados y configuración privada del servidor, nunca en este documento ni en Git.

El transporte SMTP valida certificados TLS, requiere STARTTLS cuando se usa un puerto distinto de 465 y deshabilita adjuntos provenientes de archivos o URLs. Tickets PDF, extras, recuperación/reclamo de cuenta e invitaciones usan el transporte seleccionado. Una entrega rechazada retorna fallo para conservar el reintento durable; no cambia de proveedor automáticamente.

`verifyMailer()` ahora comprueba conexión/autenticación SMTP o la cuenta de Brevo. La verificación de disponibilidad no envía mensajes y no implica que un destinatario ya haya recibido un email.

## Validación local y CI

- Commit de aplicación: `018edfe`.
- Compilación TypeScript aprobada.
- 45/45 pruebas aprobadas, incluyendo ocho casos nuevos de autenticación fallida, TLS, adjuntos, destinatarios rechazados y compatibilidad de plantillas/proveedor.
- Auditoría de dependencias de producción sin alertas conocidas.
- Backend Checks y Frontend Checks de GitHub Actions aprobados.
- Gmail autenticó desde el servidor con respuesta SMTP 235 y TLS validado.

## Publicación

Directorio de release: `/home/facu/eventlife-releases/20261117-1345-smtp/`. Contiene configuración privada y Compose de publicación y rollback; la versión previa permanece disponible. No hay cambios de esquema ni migraciones nuevas.

La imagen `eventlife-backend:smtp-20261117-1345`, identificador `sha256:7939a7ade7753ac5ed9795c1e8cb00826e017a4a8111ee63df174668c13b626b4`, quedó publicada con `MAIL_PROVIDER=smtp`, `DB_SYNC=false`, estado healthy y cero reinicios al comprobarla. La verificación previa dentro de la imagen aprobó y el proceso publicado registró `STARTUP_MAILER_STATUS` con `ready=true`. El endpoint público `/health` respondió 200.

El usuario autorizó un único email de prueba a la cuenta del remitente. A las 13:45 UTC Gmail aceptó el envío desde el contenedor, con PDF de 4419 bytes generado por la aplicación, identificado explícitamente como prueba sin validez. Message-ID: `<c0deb794-db4f-195c-8049-babda6579276@gmail.com>`. No se crearon compras, entradas válidas ni enlaces de recuperación. El destinatario confirmó expresamente que recibió el correo con el PDF: aceptación SMTP y recepción verificadas.

La evidencia y configuración privadas se conservaron en el directorio del release.

El catálogo público también respondió 200. Se conservaron dos emails anteriores en la outbox, con próximo intento automático a las 14:03 UTC; no se adelantaron ni se enviaron pruebas adicionales.

Para volver a la versión anterior, sin revertir datos:

```sh
docker compose -p backend-eventlife \
  -f /home/facu/eventlife-releases/20261117-1345-smtp/compose.rollback.json \
  up -d --no-deps backend
```

El rollback restaura también la configuración anterior del transporte; el soporte SMTP requiere la imagen nueva.

Documentación del transporte: [SMTP](https://nodemailer.com/smtp), [Gmail](https://nodemailer.com/guides/using-gmail).
