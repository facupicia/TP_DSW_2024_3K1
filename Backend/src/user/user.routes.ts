/**
 * User Routes
 * All endpoints related to user management and authentication
 */
import { Router } from "express"
import { signupUser, getUsers, updateUser, deleteUser, getUser, signinUser, profile, updateUserRole, googleSignin, refreshSession, logoutUser, requestAccountClaim, validateAccountClaim, completeAccountClaim } from "./user.controller"
import { schemaValidation } from "../common/middleware/schemaValidacion"
import { signupUserSchema, updateUserSchema, signinUserSchema, updateUserRoleSchema, googleSigninSchema, requestAccountClaimSchema, validateAccountClaimSchema, completeAccountClaimSchema } from "../schemas/schema.user"
import { checkAuthToken } from "../common/middleware/authToken"
import { checkRoleAuth } from "../common/middleware/checkRole"
import { authRateLimiter } from "../common/middleware/rateLimit"

const router = Router()

router.put("/profile/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer", "rrpp"]), schemaValidation(updateUserSchema), updateUser)


router.get("/profile", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer", "rrpp"]), profile)


router.post("/login", authRateLimiter, schemaValidation(signinUserSchema), signinUser)

router.post("/google", authRateLimiter, schemaValidation(googleSigninSchema), googleSignin)

router.post("/refresh", refreshSession)

router.post("/logout", logoutUser)

router.post("/register", schemaValidation(signupUserSchema), signupUser)

router.post("/claim/request", authRateLimiter, schemaValidation(requestAccountClaimSchema), requestAccountClaim)

router.get("/claim/validate", schemaValidation(validateAccountClaimSchema), validateAccountClaim)

router.post("/claim/complete", authRateLimiter, schemaValidation(completeAccountClaimSchema), completeAccountClaim)


router.get("/", checkAuthToken, checkRoleAuth(["admin"]), getUsers)



router.get("/:id", checkAuthToken, getUser)


router.delete("/:id", checkAuthToken, checkRoleAuth(["admin"]), deleteUser)

// Admin: actualizar rol de usuario
router.put("/:id/role", checkAuthToken, checkRoleAuth(["admin"]), schemaValidation(updateUserRoleSchema), updateUserRole)
export default router
