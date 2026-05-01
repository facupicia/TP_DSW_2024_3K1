import { User } from "./user.entity"
import { Request, Response } from "express"
import bcrypt from "bcrypt"
import jwt from 'jsonwebtoken';
import { Brackets } from "typeorm";
import { tokenSing } from "../common/services/generateToken"
import { CustomRequest } from "../common/middleware/authToken";
import { Roles, getHighestRole } from "../schemas/schema.user";
import { OAuth2Client } from "google-auth-library";
import { getRoleNames, findRolesByNames } from "./role.entity";
import { issueRefreshToken, revokeRefreshToken, rotateRefreshToken } from "../common/services/sessionTokens";
import { createAccountClaimToken, consumeAccountClaimToken, findValidAccountClaimToken } from "./accountClaim.service";
import { sendAccountClaimEmail } from "../common/services/mailer";


export const signupUser = async (req: Request, res: Response) => {
  try {
    const { firstname, lastname, email, password, phone, pais, provincia, ciudad, birth, address } = req.body;

    // Encriptar password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User();
    user.phone = phone;
    user.birth = birth;
    user.address = address;
    user.pais = pais;
    user.provincia = provincia;
    user.ciudad = ciudad;
    user.firstname = firstname;
    user.lastname = lastname;
    user.email = email;
    user.password = hashedPassword;

    const defaultRoles = await findRolesByNames(['user']);
    user.roles = defaultRoles;

    await user.save();
    res.status(201).json({ mensaje: 'Registro guardado correctamente' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const { getPagination } = await import("../common/services/pagination");
    const { page, limit, skip, take } = getPagination(req.query, 20, 50);
    const search = typeof req.query.search === 'string' ? req.query.search.trim() : '';
    const role = typeof req.query.role === 'string' ? req.query.role.trim() : '';
    const activeQuery = typeof req.query.active === 'string' ? req.query.active.trim().toLowerCase() : '';
    const validRole = role && Roles.safeParse(role).success ? role : '';
    const isNumericSearch = /^\d+$/.test(search);
    const hasSearch = isNumericSearch || search.length >= 2;
    const hasRoleFilter = Boolean(validRole);

    if (!hasSearch && !hasRoleFilter) {
      return res.status(200).json({
        data: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        queryRequired: true,
        message: "Usá búsqueda por email, nombre, ID o filtrá por rol para consultar usuarios."
      });
    }

    if (search && !hasSearch) {
      return res.status(400).json({
        data: [],
        total: 0,
        page,
        limit,
        totalPages: 1,
        message: "La búsqueda debe tener al menos 2 caracteres o ser un ID numérico."
      });
    }

    const qb = User.createQueryBuilder("user")
      .leftJoinAndSelect("user.roles", "role")
      .select([
        "user.id",
        "user.firstname",
        "user.lastname",
        "user.email",
        "user.imgPerfil",
        "user.active",
        "role.id",
        "role.name"
      ])
      .orderBy("user.createdAt", "DESC")
      .addOrderBy("user.id", "DESC")
      .skip(skip)
      .take(take);

    if (search) {
      qb.andWhere(
        new Brackets((subQb) => {
          const normalizedSearch = `%${search.toLowerCase()}%`;
          subQb.where("LOWER(user.firstname) LIKE :search", { search: normalizedSearch })
            .orWhere("LOWER(user.lastname) LIKE :search", { search: normalizedSearch })
            .orWhere("LOWER(user.email) LIKE :search", { search: normalizedSearch });

          if (isNumericSearch) {
            subQb.orWhere("user.id = :userId", { userId: Number(search) });
          }
        })
      );
    }

    if (validRole) {
      qb.innerJoin("user.roles", "roleFilter", "roleFilter.name = :roleName", { roleName: validRole });
    }

    if (activeQuery === 'true' || activeQuery === 'false') {
      qb.andWhere("user.active = :active", { active: activeQuery === 'true' });
    }

    const [users, total] = await qb.getManyAndCount();
    const usersWithRoleNames = users.map(u => ({
      id: u.id,
      firstname: u.firstname,
      lastname: u.lastname,
      email: u.email,
      imgPerfil: u.imgPerfil,
      active: u.active,
      roles: getRoleNames(u)
    }));
    return res.status(200).json({
      data: usersWithRoleNames,
      total,
      page,
      limit,
      totalPages: Math.max(1, Math.ceil(total / limit))
    })
  } catch (error: any) {
    console.error("Error fetching users:", error);
    return res.status(500).json({
      code: "USERS_SEARCH_ERROR",
      message: error?.message || "Error al buscar usuarios"
    })
  }
}

export const getUser = async (req: CustomRequest, res: Response) => {
  try {
    const { id } = req.params;
    const targetId = parseInt(id);
    const requesterId = req.user?.id;
    const requesterRoles = req.user?.roles || [];
    const isAdmin = requesterRoles.includes('admin');

    if (!requesterId) {
      return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
    }

    if (isNaN(targetId) || targetId <= 0) {
      return res.status(400).json({ code: "INVALID_USER_ID", message: "ID de usuario inválido" });
    }

    if (requesterId !== targetId && !isAdmin) {
      return res.status(403).json({ code: "FORBIDDEN_USER_LOOKUP", message: "No puedes consultar otros usuarios" });
    }

    const user = await User.findOne({
      where: { id: targetId },
      relations: ['roles'],
      select: {
        id: true,
        firstname: true,
        lastname: true,
        imgPerfil: true,
        active: true
      }
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json({
      id: user.id,
      firstname: user.firstname,
      lastname: user.lastname,
      imgPerfil: user.imgPerfil,
      active: user.active,
      roles: getRoleNames(user)
    });
  } catch (error) {
    if (error instanceof Error) {
      return res.status(500).json({ message: error.message });
    }
  }
};

export const updateUser = async (req: CustomRequest, res: Response) => {
  try {
    const targetId = parseInt(req.params.id)
    const requesterId = req.user?.id
    const requesterRoles = req.user?.roles || []
    const isAdmin = requesterRoles.includes('admin')

    if (!requesterId) {
      return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" })
    }

    if (isNaN(targetId) || targetId <= 0) {
      return res.status(400).json({ code: "INVALID_USER_ID", message: "ID de usuario inválido" })
    }

    if (requesterId !== targetId && !isAdmin) {
      return res.status(403).json({ code: "FORBIDDEN_PROFILE", message: "No puedes editar el perfil de otro usuario" })
    }

    const { firstname, lastname, email, password, phone, birth, pais, provincia, ciudad, imgPerfil, address } = req.body
    const user = await User.findOneBy({ id: targetId })

    if (!user) return res.status(404).json({ message: "User does not exist" })
    if (firstname !== undefined) user.firstname = firstname
    if (phone !== undefined) user.phone = phone
    if (birth !== undefined) user.birth = birth
    if (pais !== undefined) user.pais = pais
    if (provincia !== undefined) user.provincia = provincia
    if (ciudad !== undefined) user.ciudad = ciudad
    if (address !== undefined) user.address = address
    if (imgPerfil !== undefined) user.imgPerfil = imgPerfil
    if (lastname !== undefined) user.lastname = lastname
    if (email !== undefined) user.email = email
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }

    await user.save()

    return res.status(200).json({ message: "User updated" })
  } catch (error) {
    return res.status(500).json({ message: error })
  }
}

export const deleteUser = async (req: Request, res: Response) => {
  const { id } = req.params;
  try {
    const user = await User.findOneBy({ id: parseInt(id) });

    if (!user)
      return res.status(404).json({ message: "User not found" });

    user.active = false;
    await user.save();
    await User.softRemove(user);

    return res.sendStatus(204);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(500).json({ message: error.message });
    }
  }
};

export const signinUser = async (req: Request, res: Response) => {
  const { email, password } = req.body;

  try {
    // Validar email
    const user = await User.findOne({
      where: { email },
      relations: ['roles'],
      select: ["id", "password", "email", "firstname", "lastname"]
    });
    if (!user) {
      return res.status(400).json({ message: 'Invalid email or password' });
    }

    // Validar contraseña
    const isPasswordValid = await bcrypt.compare(password, user.password);
    if (!isPasswordValid) {
      return res.status(401).json({ message: 'Invalid email or password' });
    }

    // Generar token con id
    const tokenSession = await tokenSing(user)

    await issueRefreshToken(res, user);

    return res.status(200).json({ "token": tokenSession })

  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ message: error.message || 'Internal Server Error' });
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
    const genericResponse = {
      message: "Si existe una cuenta invitada con ese correo, enviaremos un enlace para reclamarla."
    };

    const user = await User.findOne({
      where: { email },
      relations: ['roles']
    });

    if (!user || !user.active || !user.isGuestAccount) {
      return res.status(200).json(genericResponse);
    }

    const claim = await createAccountClaimToken(user);
    await sendAccountClaimEmail(
      user.email,
      `${user.firstname || ""} ${user.lastname || ""}`.trim(),
      claim.claimUrl
    );

    return res.status(200).json(genericResponse);
  } catch (error: any) {
    return res.status(500).json({ code: "CLAIM_REQUEST_ERROR", message: error.message || "Internal Server Error" });
  }
};

export const validateAccountClaim = async (req: Request, res: Response) => {
  try {
    const token = String(req.query.token || "");
    const claimToken = await findValidAccountClaimToken(token);

    if (!claimToken) {
      return res.status(400).json({
        valid: false,
        message: "El enlace no es válido o expiró."
      });
    }

    return res.status(200).json({
      valid: true,
      email: claimToken.user.email,
      firstname: claimToken.user.firstname,
      lastname: claimToken.user.lastname,
      expiresAt: claimToken.expiresAt
    });
  } catch (error: any) {
    return res.status(500).json({ code: "CLAIM_VALIDATE_ERROR", message: error.message || "Internal Server Error" });
  }
};

export const completeAccountClaim = async (req: Request, res: Response) => {
  try {
    const rawToken = String(req.body?.token || "");
    const password = String(req.body?.password || "");
    const user = await consumeAccountClaimToken(rawToken);

    if (!user) {
      return res.status(400).json({
        code: "CLAIM_TOKEN_INVALID",
        message: "El enlace no es válido o expiró."
      });
    }

    user.password = await bcrypt.hash(password, 10);
    user.isGuestAccount = false;
    user.claimedAt = new Date();
    await User.save(user);

    const tokenSession = await tokenSing(user);
    await issueRefreshToken(res, user);

    return res.status(200).json({ token: tokenSession });
  } catch (error: any) {
    return res.status(500).json({ code: "CLAIM_COMPLETE_ERROR", message: error.message || "Internal Server Error" });
  }
};





export const profile = async (req: CustomRequest, res: Response) => {
  try {
    const id = req.user!.id


    const user = await User.findOne({ where: { id }, relations: ['roles'] });
    if (!user) return res.status(404).json('No User found');

    // Merge roles: if roles array is incomplete compared to legacy rol, add it
    let userRoles = getRoleNames(user);
    if (userRoles.length === 0) userRoles = ['user'];
    const legacyRol = (user as any).rol; // Still might exist in DB

    // If legacy rol exists and is higher than current roles, include it
    if (legacyRol && !userRoles.includes(legacyRol)) {
      const ROLE_HIERARCHY: Record<string, number> = {
        'user': 1, 'rrpp': 2, 'scanner': 3, 'organizer': 4, 'admin': 5
      };
      const currentHighestLevel = Math.max(...userRoles.map(r => ROLE_HIERARCHY[r] || 0));
      const legacyLevel = ROLE_HIERARCHY[legacyRol] || 0;

      if (legacyLevel > currentHighestLevel) {
        userRoles = [...userRoles, legacyRol];
      }
    }

    return res.json({
      id: user.id,
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email,
      phone: user.phone,
      address: user.address,
      pais: user.pais,
      provincia: user.provincia,
      ciudad: user.ciudad,
      birth: user.birth,
      imgPerfil: user.imgPerfil,
      isGuestAccount: user.isGuestAccount,
      claimedAt: user.claimedAt,
      roles: userRoles,
      rol: getHighestRole(userRoles) // Backward compatibility
    });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }

};

export const updateUserRole = async (req: CustomRequest, res: Response) => {
  try {
    const targetId = parseInt(req.params.id);
    const { roles, action = 'set' } = req.body as { roles: string[], action: 'set' | 'add' | 'remove' };

    if (!req.user || !req.user.id) {
      return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
    }

    if (isNaN(targetId) || targetId <= 0) {
      return res.status(400).json({ code: "INVALID_USER_ID", message: "ID de usuario inválido" });
    }

    // Admin cannot demote or change own role via this endpoint to avoid lockout risk
    if (req.user.id === targetId) {
      return res.status(400).json({ code: "SELF_ROLE_CHANGE_FORBIDDEN", message: "No puedes cambiar tu propio rol aquí" });
    }

    // Validate all roles
    const invalidRoles = roles.filter(r => !Roles.options.includes(r as any));
    if (invalidRoles.length > 0) {
      return res.status(400).json({ code: "INVALID_ROLE", message: `Roles no válidos: ${invalidRoles.join(', ')}` });
    }

    const dataSource = (await import("../db")).default;
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
    const userRepo = dataSource.getRepository(User);
    const target = await userRepo.findOne({ where: { id: targetId }, relations: ['roles'] });

    if (!target) {
      return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });
    }

    const prevRoles = getRoleNames(target).length > 0 ? getRoleNames(target) : ['user'];
    let newRoleNames: string[];

    switch (action) {
      case 'add':
        newRoleNames = [...new Set([...prevRoles, ...roles])];
        break;
      case 'remove':
        newRoleNames = prevRoles.filter(r => !roles.includes(r));
        if (newRoleNames.length === 0) newRoleNames = ['user']; // Always keep at least 'user'
        break;
      case 'set':
      default:
        newRoleNames = roles;
        break;
    }

    if (JSON.stringify(prevRoles.sort()) === JSON.stringify(newRoleNames.sort())) {
      return res.status(200).json({ message: "Sin cambios", roles: newRoleNames });
    }

    // Resolve Role entities and update
    const roleEntities = await findRolesByNames(newRoleNames);
    target.roles = roleEntities;
    await userRepo.save(target);

    // Audit log
    await logRoleChange(req.user.id, targetId, prevRoles.join(','), newRoleNames.join(','), req.ip);

    return res.status(200).json({
      message: "Roles actualizados",
      prevRoles,
      roles: newRoleNames,
      action
    });

  } catch (error: any) {
    return res.status(500).json({ code: "INTERNAL_ERROR", message: error.message || "Internal server error" });
  }
}

async function logRoleChange(adminId: number, userId: number, prevRole: string, newRole: string, ip: string) {
  const dataSource = (await import("../db")).default;
  if (!dataSource.isInitialized) {
    await dataSource.initialize();
  }
  const { RoleAudit } = await import("./roleAudit.entity");
  const audit = new RoleAudit();
  audit.adminId = adminId;
  audit.userId = userId;
  audit.prevRole = prevRole;
  audit.newRole = newRole;
  audit.ip = ip;
  await audit.save();
}

export const googleSignin = async (req: Request, res: Response) => {
  try {
    const credential = (req.body as any)?.credential;
    const clientId = process.env.ID_CLIENT_GOOGLE_OAUTH;
    if (!clientId) {
      return res.status(500).json({ code: "GOOGLE_OAUTH_NOT_CONFIGURED", message: "OAuth no configurado" });
    }
    if (!credential) {
      return res.status(400).json({ code: "MISSING_CREDENTIAL", message: "Falta credencial de Google" });
    }
    const client = new OAuth2Client(clientId);
    const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
    const payload = ticket.getPayload();
    if (!payload) {
      return res.status(401).json({ code: "INVALID_TOKEN", message: "Token inválido" });
    }
    const iss = payload.iss;
    if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") {
      return res.status(401).json({ code: "INVALID_ISSUER", message: "Emisor inválido" });
    }
    const email = payload.email;
    const emailVerified = payload.email_verified;
    const firstname = (payload.given_name || "").trim() || "Usuario";
    const lastname = (payload.family_name || "").trim() || "Google";
    const picture = payload.picture || undefined;
    if (!email || emailVerified === false) {
      return res.status(401).json({ code: "EMAIL_NOT_VERIFIED", message: "Email no verificado" });
    }
    const dataSource = (await import("../db")).default;
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
    const repo = dataSource.getRepository(User);
    let user = await repo.findOne({ where: { email } });
    let isNewUser = false;

    if (!user) {
      isNewUser = true;
      // New user - try to get location from IP
      const { getClientIP, getReadableLocationFromIP } = await import("../common/services/geolocation");
      const clientIP = getClientIP(req);
      const location = getReadableLocationFromIP(clientIP);

      console.log(`[Google Signin] New user from IP: ${clientIP}`, location);

      user = new User();
      user.firstname = firstname;
      user.lastname = lastname;
      user.email = email;
      user.imgPerfil = picture || user.imgPerfil;
      user.phone = "";
      user.address = "";
      user.birth = new Date("1970-01-01");
      user.password = await bcrypt.hash(jwt.sign({ email }, clientId), 10);

      // Auto-fill location from IP if available
      user.pais = location.pais || "";
      user.provincia = location.provincia || "";
      user.ciudad = location.ciudad || "";

      const defaultRoles = await findRolesByNames(['user']);
      user.roles = defaultRoles;

      await repo.save(user);
    } else {
      if (picture && picture !== user.imgPerfil) {
        user.imgPerfil = picture;
        await repo.save(user);
      }
    }
    const tokenSession = await tokenSing(user);
    await issueRefreshToken(res, user);
    return res.status(200).json({ token: tokenSession, isNewUser });
  } catch (error: any) {
    return res.status(500).json({ code: "GOOGLE_AUTH_ERROR", message: error.message || "Error interno" });
  }
}
