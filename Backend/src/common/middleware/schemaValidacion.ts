import { NextFunction, Request, Response } from "express";
import { logger } from "../services/logger";
import { AnyZodObject, ZodError } from "zod";


// Función que devuelve un middleware para validar esquemas
export const schemaValidation =
  (schema: AnyZodObject) =>
  (req: Request, res: Response, next: NextFunction) => {
    try { 
      // Validar el body, params, y query de la solicitud
      const parsed = schema.parse({
        body: req.body,
        params: req.params,
        query: req.query,
      });

      if (parsed.body !== undefined) req.body = parsed.body;
      if (parsed.params !== undefined) req.params = parsed.params;
      if (parsed.query !== undefined) req.query = parsed.query;
      
      next(); // Continúa al siguiente middleware/controlador
    } catch (error) {
      // Manejo de errores de validación de Zod
      if (error instanceof ZodError) {
        return res.status(400).json(
          error.issues.map((issue) => ({
            path: issue.path,
            message: issue.message,
          }))
        );
      }

      // Manejo de otros errores inesperados
      logger.error(error);
      return res.status(500).json({ message: "Internal server error" });
    }
  };
