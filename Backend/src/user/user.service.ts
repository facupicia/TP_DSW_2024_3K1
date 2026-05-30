import bcrypt from "bcrypt";
import crypto from "crypto";
import { Brackets, IsNull } from "typeorm";
import { OAuth2Client } from "google-auth-library";
import { User } from "./user.entity";
import { RefreshToken } from "./refreshToken.entity";
import { getRoleNames, findRolesByNames } from "./role.entity";
import { tokenSing } from "../common/services/generateToken";
import { issueRefreshToken } from "../common/services/sessionTokens";
import { createAccountClaimToken, consumeAccountClaimToken, findValidAccountClaimToken } from "./accountClaim.service";
import { sendAccountClaimEmail } from "../common/services/mailer";
import { logger } from "../common/services/logger";
import { env } from "../config/env";
import AppDataSource from "../db";
import { Roles } from "../schemas/schema.user";

export interface RegisterData {
  firstname: string;
  lastname: string;
  email: string;
  password: string;
  phone?: string;
  pais?: string;
  provincia?: string;
  ciudad?: string;
  birth?: Date;
  address?: string;
}

export interface UpdateUserData {
  firstname?: string;
  lastname?: string;
  email?: string;
  password?: string;
  phone?: string;
  birth?: Date;
  pais?: string;
  provincia?: string;
  ciudad?: string;
  imgPerfil?: string;
  address?: string;
}

export interface UserSearchParams {
  page?: number;
  limit?: number;
  search?: string;
  role?: string;
  active?: 'true' | 'false';
}

export interface Paginated<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface UserSummary {
  id: number;
  firstname: string;
  lastname: string;
  email: string;
  imgPerfil: string | null;
  active: boolean;
  roles: string[];
}

export function validatePassword(password: string): { valid: boolean; message?: string } {
  const trimmed = (password || "").trim();
  if (!trimmed || trimmed.length < 8) {
    return { valid: false, message: "La contraseña debe tener al menos 8 caracteres." };
  }
  return { valid: true };
}

export async function register(data: RegisterData): Promise<User> {
  const normalizedEmail = data.email.toLowerCase().trim();

  const existing = await User.findOne({ where: { email: normalizedEmail }, select: ['id'] });
  if (existing) {
    const err = new Error("EMAIL_ALREADY_EXISTS") as any;
    err.code = "EMAIL_ALREADY_EXISTS";
    throw err;
  }

  const hashedPassword = await bcrypt.hash(data.password, 12);
  const defaultRoles = await findRolesByNames(['user']);

  const user = new User();
  user.firstname = data.firstname;
  user.lastname = data.lastname;
  user.email = normalizedEmail;
  user.password = hashedPassword;
  user.phone = data.phone || "";
  user.address = data.address || "";
  user.pais = data.pais || "";
  user.provincia = data.provincia || "";
  user.ciudad = data.ciudad || "";
  user.birth = data.birth || new Date("1970-01-01");
  user.roles = defaultRoles;

  await user.save();
  return user;
}

export async function search(params: UserSearchParams): Promise<Paginated<UserSummary>> {
  const { getPagination } = await import("../common/services/pagination");
  const { page, limit, skip, take } = getPagination({ page: params.page, limit: params.limit }, 20, 50);
  const search = (params.search || "").trim();
  const role = (params.role || "").trim();
  const activeQuery = (params.active || "").toLowerCase();
  const validRole = role && Roles.safeParse(role).success ? role : '';
  const isNumericSearch = /^\d+$/.test(search);
  const hasSearch = isNumericSearch || search.length >= 2;
  const hasRoleFilter = Boolean(validRole);

  if (!hasSearch && !hasRoleFilter) {
    const err = new Error("QUERY_REQUIRED") as any;
    err.code = "QUERY_REQUIRED";
    err.payload = {
      data: [], total: 0, page, limit, totalPages: 1, queryRequired: true,
      message: "Usá búsqueda por email, nombre, ID o filtrá por rol para consultar usuarios."
    };
    throw err;
  }

  if (search && !hasSearch) {
    const err = new Error("SEARCH_TOO_SHORT") as any;
    err.code = "SEARCH_TOO_SHORT";
    err.payload = {
      data: [], total: 0, page, limit, totalPages: 1,
      message: "La búsqueda debe tener al menos 2 caracteres o ser un ID numérico."
    };
    throw err;
  }

  const qb = User.createQueryBuilder("user")
    .leftJoinAndSelect("user.roles", "role")
    .select(["user.id", "user.firstname", "user.lastname", "user.email", "user.imgPerfil", "user.active", "role.id", "role.name"])
    .where("user.deletedAt IS NULL")
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

  return {
    data: usersWithRoleNames,
    total,
    page,
    limit,
    totalPages: Math.max(1, Math.ceil(total / limit))
  };
}

export async function findById(id: number): Promise<User | null> {
  return User.findOne({
    where: { id },
    relations: ['roles'],
    select: { id: true, firstname: true, lastname: true, imgPerfil: true, active: true }
  });
}

export async function update(targetId: number, data: UpdateUserData): Promise<User> {
  const user = await User.findOneBy({ id: targetId });
  if (!user) {
    const err = new Error("USER_NOT_FOUND") as any;
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  if (data.firstname !== undefined) user.firstname = data.firstname;
  if (data.lastname !== undefined) user.lastname = data.lastname;
  if (data.phone !== undefined) user.phone = data.phone;
  if (data.birth !== undefined) user.birth = data.birth;
  if (data.pais !== undefined) user.pais = data.pais;
  if (data.provincia !== undefined) user.provincia = data.provincia;
  if (data.ciudad !== undefined) user.ciudad = data.ciudad;
  if (data.address !== undefined) user.address = data.address;
  if (data.imgPerfil !== undefined) user.imgPerfil = data.imgPerfil;

  if (data.email !== undefined) {
    const normalizedEmail = data.email.toLowerCase().trim();
    if (normalizedEmail !== user.email) {
      const existing = await User.findOne({ where: { email: normalizedEmail }, select: ['id'] });
      if (existing) {
        const err = new Error("EMAIL_ALREADY_EXISTS") as any;
        err.code = "EMAIL_ALREADY_EXISTS";
        throw err;
      }
      user.email = normalizedEmail;
    }
  }

  if (data.password) {
    const validation = validatePassword(data.password);
    if (!validation.valid) {
      const err = new Error("INVALID_PASSWORD") as any;
      err.code = "INVALID_PASSWORD";
      err.message = validation.message;
      throw err;
    }
    user.password = await bcrypt.hash(data.password, 12);
  }

  await user.save();
  return user;
}

export async function remove(id: number): Promise<void> {
  const user = await User.findOneBy({ id });
  if (!user) {
    const err = new Error("USER_NOT_FOUND") as any;
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  user.active = false;
  await user.save();
  await User.softRemove(user);

  await RefreshToken.update(
    { userId: user.id, revokedAt: IsNull() },
    { revokedAt: new Date() }
  );
}

export async function authenticate(email: string, password: string): Promise<{ user: User; token: string }> {
  const normalizedEmail = String(email).toLowerCase().trim();

  // Must use QueryBuilder with addSelect because password has @Column({ select: false })
  const user = await User.createQueryBuilder("user")
    .leftJoinAndSelect("user.roles", "role")
    .addSelect("user.password")
    .where("user.email = :email", { email: normalizedEmail })
    .andWhere("user.active = true")
    .getOne();

  if (!user) {
    await bcrypt.compare(password, '$2b$12$dummy.hash.for.timing.mitigation.only');
    const err = new Error("INVALID_CREDENTIALS") as any;
    err.code = "INVALID_CREDENTIALS";
    throw err;
  }

  const isPasswordValid = await bcrypt.compare(password, user.password);
  if (!isPasswordValid) {
    const err = new Error("INVALID_CREDENTIALS") as any;
    err.code = "INVALID_CREDENTIALS";
    throw err;
  }

  const token = await tokenSing(user);
  return { user, token };
}

export async function requestAccountClaim(email: string): Promise<void> {
  const normalizedEmail = email.trim().toLowerCase();
  const user = await User.findOne({ where: { email: normalizedEmail }, relations: ['roles'] });

  if (!user || !user.active || !user.isGuestAccount) return;

  const claim = await createAccountClaimToken(user);
  await sendAccountClaimEmail(
    user.email,
    `${user.firstname || ""} ${user.lastname || ""}`.trim(),
    claim.claimUrl
  );
}

export async function validateAccountClaim(token: string) {
  const claimToken = await findValidAccountClaimToken(token);
  if (!claimToken) return null;

  return {
    valid: true,
    email: claimToken.user.email,
    firstname: claimToken.user.firstname,
    lastname: claimToken.user.lastname,
    expiresAt: claimToken.expiresAt
  };
}

export async function completeAccountClaim(token: string, password: string): Promise<{ user: User; token: string }> {
  const validation = validatePassword(password);
  if (!validation.valid) {
    const err = new Error("INVALID_PASSWORD") as any;
    err.code = "INVALID_PASSWORD";
    err.message = validation.message;
    throw err;
  }

  const user = await consumeAccountClaimToken(token);
  if (!user) {
    const err = new Error("CLAIM_TOKEN_INVALID") as any;
    err.code = "CLAIM_TOKEN_INVALID";
    throw err;
  }

  user.password = await bcrypt.hash(password, 12);
  user.isGuestAccount = false;
  user.claimedAt = new Date();
  await User.save(user);

  const tokenSession = await tokenSing(user);
  return { user, token: tokenSession };
}

export async function getProfile(userId: number) {
  const user = await User.findOne({ where: { id: userId }, relations: ['roles'] });
  if (!user) {
    const err = new Error("USER_NOT_FOUND") as any;
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  let userRoles = getRoleNames(user);
  if (userRoles.length === 0) userRoles = ['user'];

  return {
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
    roles: userRoles
  };
}

export async function updateRoles(
  targetId: number,
  roles: string[],
  action: 'set' | 'add' | 'remove',
  adminId: number,
  ip: string
) {
  const invalidRoles = roles.filter(r => !Roles.options.includes(r as any));
  if (invalidRoles.length > 0) {
    const err = new Error("INVALID_ROLE") as any;
    err.code = "INVALID_ROLE";
    err.message = `Roles no válidos: ${invalidRoles.join(', ')}`;
    throw err;
  }

  const userRepo = AppDataSource.getRepository(User);
  const target = await userRepo.findOne({ where: { id: targetId }, relations: ['roles'] });

  if (!target) {
    const err = new Error("USER_NOT_FOUND") as any;
    err.code = "USER_NOT_FOUND";
    throw err;
  }

  const prevRoles = getRoleNames(target).length > 0 ? getRoleNames(target) : ['user'];
  let newRoleNames: string[];

  switch (action) {
    case 'add':
      newRoleNames = [...new Set([...prevRoles, ...roles])];
      break;
    case 'remove':
      newRoleNames = prevRoles.filter(r => !roles.includes(r));
      if (newRoleNames.length === 0) newRoleNames = ['user'];
      break;
    case 'set':
    default:
      newRoleNames = roles;
      break;
  }

  if (JSON.stringify(prevRoles.sort()) === JSON.stringify(newRoleNames.sort())) {
    const err = new Error("NO_CHANGES") as any;
    err.code = "NO_CHANGES";
    err.payload = { message: "Sin cambios", roles: newRoleNames };
    throw err;
  }

  const roleEntities = await findRolesByNames(newRoleNames);
  target.roles = roleEntities;
  await userRepo.save(target);

  await logRoleChange(adminId, targetId, prevRoles.join(','), newRoleNames.join(','), ip);

  return { prevRoles, roles: newRoleNames, action };
}

async function logRoleChange(adminId: number, userId: number, prevRole: string, newRole: string, ip: string) {
  const { RoleAudit } = await import("./roleAudit.entity");
  const audit = new RoleAudit();
  audit.adminId = adminId;
  audit.userId = userId;
  audit.prevRole = prevRole;
  audit.newRole = newRole;
  audit.ip = ip;
  await audit.save();
}

export async function authenticateGoogle(credential: string, clientIP?: string): Promise<{ user: User; token: string; isNewUser: boolean }> {
  const clientId = env.ID_CLIENT_GOOGLE_OAUTH;
  if (!clientId) {
    const err = new Error("GOOGLE_OAUTH_NOT_CONFIGURED") as any;
    err.code = "GOOGLE_OAUTH_NOT_CONFIGURED";
    throw err;
  }
  if (!credential) {
    const err = new Error("MISSING_CREDENTIAL") as any;
    err.code = "MISSING_CREDENTIAL";
    throw err;
  }

  const client = new OAuth2Client(clientId);
  const ticket = await client.verifyIdToken({ idToken: credential, audience: clientId });
  const payload = ticket.getPayload();
  if (!payload) {
    const err = new Error("INVALID_TOKEN") as any;
    err.code = "INVALID_TOKEN";
    throw err;
  }

  const iss = payload.iss;
  if (iss !== "https://accounts.google.com" && iss !== "accounts.google.com") {
    const err = new Error("INVALID_ISSUER") as any;
    err.code = "INVALID_ISSUER";
    throw err;
  }

  const email = payload.email;
  const emailVerified = payload.email_verified;
  if (!email || emailVerified === false) {
    const err = new Error("EMAIL_NOT_VERIFIED") as any;
    err.code = "EMAIL_NOT_VERIFIED";
    throw err;
  }

  const firstname = (payload.given_name || "").trim() || "Usuario";
  const lastname = (payload.family_name || "").trim() || "Google";
  const picture = payload.picture || undefined;

  const repo = AppDataSource.getRepository(User);
  let user = await repo.findOne({ where: { email, active: true } });
  let isNewUser = false;

  if (!user) {
    isNewUser = true;
    const { getClientIP, getReadableLocationFromIP } = await import("../common/services/geolocation");
    const resolvedIP = clientIP || '127.0.0.1';
    const location = getReadableLocationFromIP(resolvedIP);

    logger.info(`[Google Signin] New user from IP: ${resolvedIP}`, location);

    user = new User();
    user.firstname = firstname;
    user.lastname = lastname;
    user.email = email;
    user.imgPerfil = picture || undefined;
    user.phone = "";
    user.address = "";
    user.birth = new Date("1970-01-01");
    user.password = await bcrypt.hash(crypto.randomBytes(32).toString("hex"), 12);
    user.pais = location.pais || "";
    user.provincia = location.provincia || "";
    user.ciudad = location.ciudad || "";

    const defaultRoles = await findRolesByNames(['user']);
    user.roles = defaultRoles;

    await repo.save(user);
  } else {
    let shouldSave = false;

    if (user.isGuestAccount) {
      user.isGuestAccount = false;
      user.claimedAt = new Date();
      shouldSave = true;
    }

    if (picture && picture !== user.imgPerfil) {
      user.imgPerfil = picture;
      shouldSave = true;
    }

    if (shouldSave) {
      await repo.save(user);
    }
  }

  const token = await tokenSing(user);
  return { user, token, isNewUser };
}
