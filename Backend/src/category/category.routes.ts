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

const router = Router()


router.post("/new", schemaValidation(createCategorySchema), checkAuthToken, checkRoleAuth(["admin"]), createCategory)
router.get("/", getCategories)
router.delete("/:id", checkAuthToken, checkRoleAuth(["admin"]), deleteCategory)
router.get("/:id", getCategoryByID)

export default router;
