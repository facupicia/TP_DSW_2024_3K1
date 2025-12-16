import { User } from "./user.entity"
import { Request, Response } from "express"
import bcrypt from "bcrypt"
import jwt from 'jsonwebtoken';
import { tokenSing } from "../lib/generateToken"
import { CustomRequest } from "../middlewares/authToken";
import { Roles } from "../schemas/schema.user";


export const signupUser = async (req: Request, res: Response) => {
  try {
    const { firstname, lastname, email, password, phone, location, birth } = req.body;

    // Encriptar password
    const hashedPassword = await bcrypt.hash(password, 10);

    const user = new User();
    user.phone = phone
    user.birth = birth
    user.location = location
    user.firstname = firstname;
    user.lastname = lastname;
    user.email = email;
    user.password = hashedPassword;

    await user.save();
    res.status(201).json({ mensaje: 'Registro guardado correctamente' });
  } catch (error: any) {
    return res.status(500).json({ message: error.message || 'Internal server error' });
  }
};

export const getUsers = async (req: Request, res: Response) => {
  try {
    const users = await User.find({
      select: {
        id: true,
        firstname: true,
        lastname: true,
        email: true,
        rol: true,
        imgPerfil: true,
        active: true
      }
    })
    return res.status(200).json(users)
  } catch (error) {
    return res.status(500).json({ message: error })
  }
}

export const getUser = async (req: Request, res: Response) => {
  try {
    const { id } = req.params;
    const user = await User.findOneBy({ id: parseInt(id) });

    if (!user) return res.status(404).json({ message: "User not found" });

    return res.json(user);
  } catch (error) {
    if (error instanceof Error) {
      return res.status(500).json({ message: error.message });
    }
  }
};

export const updateUser = async (req: Request, res: Response) => {
  try {
    const { firstname, lastname, email, password, rol, phone, birth, location, imgPerfil } = req.body
    const user = await User.findOneBy({ id: parseInt(req.params.id) })

    if (!user) return res.status(404).json({ message: "User does not exist" })
    user.firstname = firstname
    user.phone = phone
    user.birth = birth
    user.location = location
    user.imgPerfil = imgPerfil
    user.lastname = lastname
    user.email = email
    if (password) {
      user.password = await bcrypt.hash(password, 10);
    }
    if (rol) {
      if (!Roles.options.includes(rol as any)) {
        return res.status(400).json({ code: "INVALID_ROLE", message: "Rol no válido" });
      }
      user.rol = rol
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
    const result = await User.delete({ id: parseInt(id) });

    if (result.affected === 0)
      return res.status(404).json({ message: "User not found" });

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
      select: ["id", "password", "email", "rol", "firstname", "lastname"]
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

    return res.status(200).json({ "token": tokenSession })

  } catch (error: any) {
    console.error('Login error:', error);
    return res.status(500).json({ message: error.message || 'Internal Server Error' });
  }
};





export const profile = async (req: CustomRequest, res: Response) => {
  try {
    const id = req.user!.id


    const user = await User.findOneBy({ id: id });
    if (!user) return res.status(404).json('No User found');


    return res.json({
      id: user.id,
      firstname: user.firstname,
      lastname: user.lastname,
      email: user.email,
      phone: user.phone,
      location: user.location,
      birth: user.birth,
      imgPerfil: user.imgPerfil,
      rol: user.rol

    });
  } catch (error) {
    return res.status(500).json({ message: 'Internal server error' });
  }

};

export const updateUserRole = async (req: CustomRequest, res: Response) => {
  try {
    const targetId = parseInt(req.params.id);
    const { rol } = req.body as { rol: string };
    if (!req.user || !req.user.id) {
      return res.status(401).json({ code: "AUTH_NO_USER", message: "Authentication required" });
    }
    // Admin cannot demote or change own role via this endpoint to avoid lockout risk
    if (req.user.id === targetId) {
      return res.status(400).json({ code: "SELF_ROLE_CHANGE_FORBIDDEN", message: "No puedes cambiar tu propio rol aquí" });
    }
    if (!Roles.options.includes(rol as any)) {
      return res.status(400).json({ code: "INVALID_ROLE", message: "Rol no válido" });
    }
    const dataSource = (await import("../db")).default;
    if (!dataSource.isInitialized) {
      await dataSource.initialize();
    }
    const userRepo = dataSource.getRepository(User);
    const target = await userRepo.findOneBy({ id: targetId });
    if (!target) {
      return res.status(404).json({ code: "USER_NOT_FOUND", message: "User not found" });
    }
    const prevRole = target.rol;
    if (prevRole === rol) {
      return res.status(200).json({ message: "Sin cambios", rol });
    }
    // Concurrency-safe update using compare-and-set
    const result = await userRepo.createQueryBuilder()
      .update(User)
      .set({ rol })
      .where("id = :id AND rol = :prevRole", { id: targetId, prevRole })
      .execute();
    if (result.affected && result.affected > 0) {
      // Audit log
      await logRoleChange(req.user.id, targetId, prevRole, rol, req.ip);
      return res.status(200).json({ message: "Rol actualizado", prevRole, rol });
    }
    // If concurrent change occurred, re-fetch and report
    const refreshed = await userRepo.findOneBy({ id: targetId });
    return res.status(409).json({ code: "ROLE_CONFLICT", message: "Rol cambiado por otro proceso", currentRole: refreshed?.rol });
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
