import { Router } from "express"
import { signupUser, getUsers, updateUser, deleteUser, getUser, signinUser, profile } from "../user/user.controller"
import { schemaValidation } from "../middlewares/schemaValidacion"
import { signupUserSchema, updateUserSchema, signinUserSchema } from "../schemas/schema.user"
import { checkAuthToken } from "../middlewares/authToken"
import { checkRoleAuth } from "../middlewares/checkRole"

const router = Router()

//ruta protegida 

router.put("/profile/:id", schemaValidation(updateUserSchema), updateUser)


router.get("/profile", checkAuthToken, checkRoleAuth(["user", "admin"]), profile)


router.post("/login", schemaValidation(signinUserSchema), signinUser)


router.post("/register", schemaValidation(signupUserSchema), signupUser)


router.get("/", checkRoleAuth(["admin"]), checkAuthToken, getUsers)



router.get("/:id", getUser)


router.delete("/:id", deleteUser)




export default router