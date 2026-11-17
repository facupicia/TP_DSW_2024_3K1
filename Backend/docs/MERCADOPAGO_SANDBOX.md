# Checkout Pro con vendedor de prueba

La configuración local del 2 de octubre de 2026 usa `MP_MODE=sandbox`.
El vendedor de `MP_ACCESS_TOKEN` fue verificado con `/users/me`: tiene el tag `test_user`.
No se copiaron credenciales a este documento ni al repositorio.

En este modo el checkout usa el vendedor de prueba de la plataforma, omite la comisión
de marketplace y conserva precios, reservas y cargos de servicio. Antes de crear la
preferencia verifica que el vendedor siga siendo una cuenta de prueba. El webhook
consulta únicamente esa cuenta y exige que el `collector_id` del pago sea el vendedor
de prueba verificado. Checkout Pro puede devolver `live_mode=true` para esas cuentas;
ese indicador no se utiliza para distinguirlas de vendedores reales. Las firmas siguen siendo
obligatorias. Esto valida ventas de plataforma; el OAuth y reparto de marketplace
necesitan una prueba posterior con vendedor conectado de prueba.

En la prueba integrada del 2 de octubre se confirmó un pago aprobado del vendedor
`test_user` con `live_mode=true`. El worker se corrigió para verificar `collector_id`
contra `/users/me` en vez de rechazar ese indicador. Las notificaciones firmadas
recibidas quedan en la outbox y pueden recuperarse sin volver a cobrar.

El proveedor de correo respondió `401: API Key is not enabled` al consultar su cuenta.
Hasta habilitar una clave Brevo válida, los emails quedan pendientes con reintentos;
las entradas emitidas siguen disponibles en Mis entradas. Las direcciones
`@testuser.com` son cuentas de prueba de MercadoPago: para comprobar recepción de
correo usar un email real accesible en el usuario de EventLife.

La creación de eventos y la pantalla de configuración reconocen este modo y muestran
un aviso. El organizador no queda conectado artificialmente en la DB: el estado
`sandboxReady` se informa separado de `connected`. Iniciar OAuth en este modo devuelve
un mensaje explicativo; en producción sigue siendo obligatorio vincular al organizador.

## Ejecutar

1. En `Backend`, ejecutar `npm run dev`.
2. En `Frontend`, ejecutar `npm start` y abrir `http://localhost:4200`.
3. Ejecutar `ngrok http 3000`. Colocar su URL HTTPS más `/api/payment/webhook`
   en `MP_NOTIFICATION_URL` de `Backend/.env`. Reiniciar el backend después de cambiarla.
4. En MercadoPago Developers, configurar esa URL para notificaciones de pagos
   en pruebas y guardar el secreto correspondiente en `MP_WEBHOOK_SECRET`.
5. Comprar una entrada usando una cuenta **comprador de prueba diferente del vendedor**
   y las tarjetas de prueba oficiales. Abrir el checkout en incógnito para evitar
   que se use una sesión personal de MercadoPago.
6. Comprobar pago, emisión de tickets, stock, correo y escaneo. El retorno a la app
   no confirma el pago por sí mismo: debe llegar el webhook y completar la emisión.

La URL ngrok anterior respondió 404 al verificar su health check; no se confirmó un
túnel operativo. No se crearon preferencias ni se realizaron pagos en esta configuración.
El backend conserva los datos y los tokens de organizadores existentes, pero el checkout
de pruebas no los utiliza. Las suscripciones tienen credenciales separadas y este modo
no las configura: esta prueba corresponde a la compra de entradas.

Para publicar ventas reales usar `MP_MODE=production`, credenciales apropiadas, URLs
de producción y el flujo OAuth del organizador. No publicar el `.env` local.

Fuentes: [cuentas de prueba](https://www.mercadopago.com.ar/developers/en/docs/checkout-pro-orders/resources/your-integrations/test/accounts?scope=prod)
y [compras de prueba](https://www.mercadopago.com.ar/developers/es/docs/checkout-pro-preferences/integration-test/test-purchases).
