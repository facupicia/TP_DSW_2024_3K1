/**
 * Category Routes
 * Endpoints for event category management
 */
import { Router } from "express";
import { createCategory, deleteCategory, getCategories, getCategoryByID } from "./category.controller";
import { createCategorySchema } from "../schemas/schema.category";
import { checkAuthToken } from "../common/middleware/authToken";
import { checkRoleAuth } from "../common/middleware/checkRole";
import { schemaValidation } from "../common/middleware/schemaValidacion";
import { globalRateLimiter } from "../common/middleware/rateLimit";

const router = Router()


router.post("/new", checkAuthToken, checkRoleAuth(["admin"]), schemaValidation(createCategorySchema), createCategory)
router.get("/", globalRateLimiter, getCategories)
router.delete("/:id", checkAuthToken, checkRoleAuth(["admin"]), deleteCategory)
router.get("/:id", checkAuthToken, checkRoleAuth(["admin"]), getCategoryByID)

export default router;
