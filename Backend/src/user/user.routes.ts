/**
 * User Routes
 * All endpoints related to user management and authentication
 */
import { Router } from "express"
import { signupUser, getUsers, updateUser, deleteUser, getUser, signinUser, profile, updateUserRole, googleSignin } from "./user.controller"
import { schemaValidation } from "../common/middleware/schemaValidacion"
import { signupUserSchema, updateUserSchema, signinUserSchema, updateUserRoleSchema, googleSigninSchema } from "../schemas/schema.user"
import { checkAuthToken } from "../common/middleware/authToken"
import { checkRoleAuth } from "../common/middleware/checkRole"

const router = Router()

router.put("/profile/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer"]), schemaValidation(updateUserSchema), updateUser)


router.get("/profile", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer"]), profile)


router.post("/login", schemaValidation(signinUserSchema), signinUser)

router.post("/google", schemaValidation(googleSigninSchema), googleSignin)

router.post("/register", schemaValidation(signupUserSchema), signupUser)


router.get("/", checkAuthToken, checkRoleAuth(["admin"]), getUsers)



router.get("/:id", getUser)


router.delete("/:id", checkAuthToken, checkRoleAuth(["admin"]), deleteUser)

// Admin: actualizar rol de usuario
router.put("/:id/role", checkAuthToken, checkRoleAuth(["admin"]), schemaValidation(updateUserRoleSchema), updateUserRole)
export default router
