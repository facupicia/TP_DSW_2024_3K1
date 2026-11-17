/**
 * Development Environment Configuration
 *
 * Para testing con MercadoPago en sandbox:
 * 1. Backend: MP_MODE=sandbox y MP_ACCESS_TOKEN del vendedor de prueba.
 *    Checkout Pro también usa tokens APP_USR- de cuentas de prueba e init_point.
 * 2. Si usás ngrok, actualizar apiUrl temporalmente:
 *    apiUrl: 'https://abc123.ngrok.io/api'
 */
export const environment = {
    production: false,
    apiUrl: 'http://localhost:3000/api',
    googleClientId: '888552149844-ufefr5ea14s34ammk6kbo4j6rkfg4nhq.apps.googleusercontent.com'
};
