import { Router } from "express"
import { signupUser, getUsers, updateUser, deleteUser, getUser, signinUser, profile, updateUserRole, googleSignin } from "../user/user.controller"
import { schemaValidation } from "../middlewares/schemaValidacion"
import { signupUserSchema, updateUserSchema, signinUserSchema, updateUserRoleSchema, googleSigninSchema } from "../schemas/schema.user"
import { checkAuthToken } from "../middlewares/authToken"
import { checkRoleAuth } from "../middlewares/checkRole"

const router = Router()

//ruta protegida 

router.put("/profile/:id", checkAuthToken, checkRoleAuth(["user", "admin"]), schemaValidation(updateUserSchema), updateUser)


router.get("/profile", checkAuthToken, checkRoleAuth(["user", "admin"]), profile)


router.post("/login", schemaValidation(signinUserSchema), signinUser)

router.post("/google", schemaValidation(googleSigninSchema), googleSignin)

router.post("/register", schemaValidation(signupUserSchema), signupUser)


router.get("/", checkAuthToken, checkRoleAuth(["admin"]), getUsers)



router.get("/:id", getUser)


router.delete("/:id", deleteUser)

// Admin: actualizar rol de usuario
router.put("/:id/role", checkAuthToken, checkRoleAuth(["admin"]), schemaValidation(updateUserRoleSchema), updateUserRole)



export default router
