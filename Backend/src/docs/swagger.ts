import swaggerJsdoc from "swagger-jsdoc";
import swaggerUi from "swagger-ui-express";
import { Express } from "express";

const options: swaggerJsdoc.Options = {
  definition: {
    openapi: "3.0.3",
    info: {
      title: "Event Life API",
      version: "1.0.0",
      description: "API documentation",
    },
    servers: [
      { url: "http://localhost:3000", description: "Local" },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: "http",
          scheme: "bearer",
          bearerFormat: "JWT",
        },
      },
      schemas: {
        UpdateUserRole: {
          type: "object",
          properties: {
            rol: { type: "string", enum: ["user", "admin", "scanner"] },
          },
          required: ["rol"],
        },
      },
    },
    security: [{ bearerAuth: [] }],
  },
  apis: [], // Using programmatic registration below
};

const specs = swaggerJsdoc(options) as any;

export function setupSwagger(app: Express) {
  const doc: any = specs;
  doc.paths = doc.paths || {};
  doc.paths["/api/user/{id}/role"] = {
    put: {
      tags: ["User"],
      summary: "Actualizar rol de usuario",
      parameters: [
        {
          in: "path",
          name: "id",
          required: true,
          schema: { type: "integer" },
        },
      ],
      requestBody: {
        required: true,
        content: {
          "application/json": {
            schema: { $ref: "#/components/schemas/UpdateUserRole" },
          },
        },
      },
      responses: {
        200: { description: "Rol actualizado" },
        400: { description: "Datos inválidos" },
        401: { description: "No autenticado" },
        403: { description: "No autorizado" },
        404: { description: "Usuario no encontrado" },
        409: { description: "Conflicto por concurrencia" },
      },
    },
  };
  doc.paths["/api/user/{id}"] = {
    get: {
      tags: ["User"],
      summary: "Obtener usuario por ID (admin)",
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
      responses: {
        200: { description: "Usuario" },
        401: { description: "No autenticado" },
        403: { description: "No autorizado" },
        404: { description: "Usuario no encontrado" }
      }
    },
    delete: {
      tags: ["User"],
      summary: "Eliminar usuario por ID (admin)",
      parameters: [{ in: "path", name: "id", required: true, schema: { type: "integer" } }],
      responses: {
        204: { description: "Eliminado" },
        401: { description: "No autenticado" },
        403: { description: "No autorizado" },
        404: { description: "Usuario no encontrado" }
      }
    }
  };
  doc.paths["/api/payment/webhook"] = {
    post: {
      tags: ["Payment"],
      summary: "Webhook de MercadoPago con firma HMAC",
      responses: {
        200: { description: "Recibido" },
        401: { description: "Firma inválida" },
        500: { description: "Error interno" }
      }
    }
  };
  app.use("/docs", swaggerUi.serve, swaggerUi.setup(specs));
}
