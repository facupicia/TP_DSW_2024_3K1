import { trustedOrigin } from '../common/middleware/trustedOrigin';
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
import { authRateLimiter, refreshRateLimiter } from "../common/middleware/rateLimit"

import {requestPasswordReset,completePasswordReset} from './passwordReset.service';
const router = Router()
router.post('/password/request', authRateLimiter, schemaValidation(requestAccountClaimSchema), async(req,res,next)=>{
    try {await requestPasswordReset(req.body.email);res.json({message:'Si la cuenta existe, recibirás un enlace por correo.'});} catch(error){next(error);}
});
router.post('/password/complete', authRateLimiter, schemaValidation(completeAccountClaimSchema), async(req,res,next)=>{
    try {const ok=await completePasswordReset(req.body.token,req.body.password);res.status(ok?200:400).json({success:ok,message:ok?'Contraseña actualizada. Iniciá sesión.':'Enlace inválido, vencido o contraseña insuficiente.'});} catch(error){next(error);}
});

router.put("/profile/:id", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer", "rrpp"]), schemaValidation(updateUserSchema), updateUser)


router.get("/profile", checkAuthToken, checkRoleAuth(["user", "admin", "scanner", "organizer", "rrpp"]), profile)


router.post("/login", authRateLimiter, trustedOrigin, schemaValidation(signinUserSchema), signinUser)

router.post("/google", authRateLimiter, trustedOrigin, schemaValidation(googleSigninSchema), googleSignin)

router.post("/refresh", refreshRateLimiter, trustedOrigin, refreshSession)

router.post("/logout", trustedOrigin, checkAuthToken, logoutUser)

router.post("/register", authRateLimiter, schemaValidation(signupUserSchema), signupUser)

router.post("/claim/request", authRateLimiter, schemaValidation(requestAccountClaimSchema), requestAccountClaim)

router.get("/claim/validate", schemaValidation(validateAccountClaimSchema), validateAccountClaim)

router.post("/claim/complete", authRateLimiter, trustedOrigin, schemaValidation(completeAccountClaimSchema), completeAccountClaim)


router.get("/", checkAuthToken, checkRoleAuth(["admin"]), getUsers)



router.get("/:id", checkAuthToken, getUser)


router.delete("/:id", checkAuthToken, checkRoleAuth(["admin"]), deleteUser)

// Admin: actualizar rol de usuario
router.put("/:id/role", checkAuthToken, checkRoleAuth(["admin"]), schemaValidation(updateUserRoleSchema), updateUserRole)
export default router
