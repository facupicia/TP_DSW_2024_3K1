import { Router } from "express";
import { createCategory, deleteCategory, getCategories, getCategoryByID } from "../category/category.controller";
import { createCategorySchema } from "../schemas/schema.category";
import { checkAuthToken } from "../middlewares/authToken";
import { checkRoleAuth } from "../middlewares/checkRole";
import { schemaValidation } from "../middlewares/schemaValidacion";

const router = Router()

router.post("/new", schemaValidation(createCategorySchema), checkAuthToken, checkRoleAuth(["admin"]), createCategory)
router.get("/", checkAuthToken,checkRoleAuth(["user", "admin", "scanner", "organizer"]), getCategories)
router.delete("/:id", checkAuthToken, checkRoleAuth(["admin"]), deleteCategory)
router.get("/:id", getCategoryByID)

export default router;