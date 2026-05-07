import swaggerJsdoc from "swagger-jsdoc";

const options: swaggerJsdoc.Options = {
    definition: {
        openapi: "3.0.0",
        info: {
            title: "EventLife API",
            version: "1.0.0",
            description: "API REST para la plataforma EventLife - Gestión de eventos y venta de entradas",
        },
        servers: [
            {
                url: process.env.API_URL || "http://localhost:3000/api",
                description: "Servidor de desarrollo",
            },
        ],
        components: {
            securitySchemes: {
                bearerAuth: {
                    type: "http",
                    scheme: "bearer",
                    bearerFormat: "JWT",
                },
                tokenAuth: {
                    type: "apiKey",
                    in: "header",
                    name: "token",
                },
            },
        },
        security: [
            {
                bearerAuth: [],
            },
        ],
    },
    apis: process.env.NODE_ENV === 'production'
        ? ["./dist/**/*.routes.js", "./dist/**/*.controller.js", "./dist/**/*.entity.js"]
        : ["./src/**/*.routes.ts", "./src/**/*.controller.ts", "./src/**/*.entity.ts"],
};

export const swaggerSpec = swaggerJsdoc(options);
