import { Request, Response } from "express";
import { logger } from "../common/services/logger";
import { CustomRequest } from "../common/middleware/authToken";
import { issueRefreshToken, revokeRefreshToken, rotateRefreshToken } from "../common/services/sessionTokens";
import { getHighestRole } from "../schemas/schema.user";
import { getRoleNames } from "./role.entity";
import * as userService from "./user.service";

function handleServiceError(error: any, res: Response) {
  const code = error?.code || "INTERNAL_ERROR";
  const message = error?.message || "Internal server error";

  const statusMap: Record<string, number> = {
    EMAIL_ALREADY_EXISTS: 409,
    USER_NOT_FOUND: 404,
    INVALID_PASSWORD: 400,
    INVALID_CREDENTIALS: 401,
    CLAIM_TOKEN_INVALID: 400,
    GOOGLE_OAUTH_NOT_CONFIGURED: 500,
    MISSING_CREDENTIAL: 400,
    INVALID_TOKEN: 401,
    INVALID_ISSUER: 401,
    EMAIL_NOT_VERIFIED: 401,
    INVALID_ROLE: 400,
    NO_CHANGES: 200,
    QUERY_REQUIRED: 200,
    SEARCH_TOO_SHORT: 400
  };

  const status = statusMap[code] || 500;
  if (status >= 500) {
    logger.error("SERVICE_ERROR", { code, message });
  }

  if (code === "NO_CHANGES" || code === "QUERY_REQUIRED") {
    return res.status(status).json(error.payload || { code, message });
  }

  return res.status(status).json({ code, message });
}

export const signupUser = async (req: Request, res: Response) => {
  try {
    await userService.register(req.body);
    return res.status(201).json({ mensaje: "Registro guardado correctamente" });
  } catch (error: any) {
    return handleServiceError(error, res);
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const result = await userService.search({
      page: Number(req.query.page) || undefined,
      limit: Number(req.query.limit) || undefined,
      search: typeof req.query.search === "string" ? req.query.search : undefined,
      role: typeof req.query.role === "string" ? req.query.role : undefined,
      active: req.query.active as any
    });
    return res.status(200).json(result);
  } catch (error: any) {
    return handleServiceError(error, res);
  }
};

export const getUser = async (req: CustomRequest, res: Response) => {
  try {
    const targetId = parseInt(req.params.id);
    const requesterId = req.user?.id;
    const isAdmin = (req.user?.roles || []).includes("admin");

    if (!requesterId) {
      return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
    }
    if (isNaN(targetId) || targetId <= 0) {
      return res.status(400).json({ code: "INVALID_USER_ID", message: "ID de usuario inválido" });
    }
    if (requesterId !== targetId && !isAdmin) {
      return res.status(403).json({ code: "FORBIDDEN_USER_LOOKUP", message: "No puedes consultar otros usuarios" });
    }

    const user = await userService.findById(targetId);
    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      id: user.id,
      firstname: user.firstname,
      lastname: user.lastname,
      imgPerfil: user.imgPerfil,
      active: user.active,
      roles: getRoleNames(user)
    });
  } catch (error: any) {
    return handleServiceError(error, res);
  }
};

export const updateUser = async (req: CustomRequest, res: Response) => {
  try {
    const targetId = parseInt(req.params.id);
    const requesterId = req.user?.id;
    const isAdmin = (req.user?.roles || []).includes("admin");

    if (!requesterId) {
      return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
    }
    if (isNaN(targetId) || targetId <= 0) {
      return res.status(400).json({ code: "INVALID_USER_ID", message: "ID de usuario inválido" });
    }
    if (requesterId !== targetId && !isAdmin) {
      return res.status(403).json({ code: "FORBIDDEN_PROFILE", message: "No puedes editar el perfil de otro usuario" });
    }

    await userService.update(targetId, req.body);
    return res.status(200).json({ message: "User updated" });
  } catch (error: any) {
    return handleServiceError(error, res);
  }
};

export const deleteUser = async (req: Request, res: Response) => {
  try {
    await userService.remove(parseInt(req.params.id));
    return res.sendStatus(204);
  } catch (error: any) {
    return handleServiceError(error, res);
  }
};

export const signinUser = async (req: Request, res: Response) => {
  try {
    const { email, password } = req.body;
    const result = await userService.authenticate(email, password);
    await issueRefreshToken(res, result.user);
    return res.status(200).json({ token: result.token });
  } catch (error: any) {
    return handleServiceError(error, res);
  }
};

export const refreshSession = async (req: Request, res: Response) => {
  try {
    const tokenSession = await rotateRefreshToken(req, res);
    if (!tokenSession) {
      return res.status(401).json({ code: "REFRESH_INVALID", message: "Sesión expirada o inválida" });
    }
    return res.status(200).json({ token: tokenSession });
  } catch (error: any) {
    return res.status(500).json({ code: "REFRESH_ERROR", message: error.message || "Internal Server Error" });
  }
};

export const logoutUser = async (req: Request, res: Response) => {
  try {
    await revokeRefreshToken(req, res);
    return res.status(204).send();
  } catch (error: any) {
    return res.status(500).json({ code: "LOGOUT_ERROR", message: error.message || "Internal Server Error" });
  }
};

export const requestAccountClaim = async (req: Request, res: Response) => {
  try {
    const email = String(req.body?.email || "").trim().toLowerCase();
    await userService.requestAccountClaim(email);
    return res.status(200).json({
      message: "Si existe una cuenta invitada con ese correo, enviaremos un enlace para reclamarla."
    });
  } catch (error: any) {
    return handleServiceError(error, res);
  }
};

export const validateAccountClaim = async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || "");
    const result = await userService.validateAccountClaim(token);

    if (!result) {
      return res.status(400).json({ valid: false, message: "El enlace no es válido o expiró." });
    }

    return res.status(200).json(result);
  } catch (error: any) {
    return handleServiceError(error, res);
  }
};

export const completeAccountClaim = async (req: Request, res: Response) => {
  try {
    const rawToken = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    const result = await userService.completeAccountClaim(rawToken, password);
    await issueRefreshToken(res, result.user);
    return res.status(200).json({ token: result.token });
  } catch (error: any) {
    return handleServiceError(error, res);
  }
};

export const profile = async (req: CustomRequest, res: Response) => {
  try {
    const id = req.user?.id;
    if (!id) {
      return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
    }

    const profileData = await userService.getProfile(id);
    return res.json({
      ...profileData,
      rol: getHighestRole(profileData.roles)
    });
  } catch (error: any) {
    return handleServiceError(error, res);
  }
};

export const updateUserRole = async (req: CustomRequest, res: Response) => {
  try {
    const targetId = parseInt(req.params.id);
    const { roles, action = "set" } = req.body as { roles: string[]; action: "set" | "add" | "remove" };
    const adminId = req.user?.id;

    if (!adminId) {
      return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
    }
    if (isNaN(targetId) || targetId <= 0) {
      return res.status(400).json({ code: "INVALID_USER_ID", message: "ID de usuario inválido" });
    }
    if (adminId === targetId) {
      return res.status(400).json({ code: "SELF_ROLE_CHANGE_FORBIDDEN", message: "No puedes cambiar tu propio rol aquí" });
    }

    const result = await userService.updateRoles(targetId, roles, action, adminId, req.ip || "");
    return res.status(200).json({
      message: "Roles actualizados",
      prevRoles: result.prevRoles,
      roles: result.roles,
      action: result.action
    });
  } catch (error: any) {
    return handleServiceError(error, res);
  }
};

export const googleSignin = async (req: Request, res: Response) => {
  try {
    const credential = (req.body as any)?.credential;
    const result = await userService.authenticateGoogle(credential);
    await issueRefreshToken(res, result.user);
    return res.status(200).json({ token: result.token, isNewUser: result.isNewUser });
  } catch (error: any) {
    return handleServiceError(error, res);
  }
};
