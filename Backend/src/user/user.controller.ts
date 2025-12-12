import { User } from "./user.entity"
import { Request, Response } from "express"
import bcrypt from "bcrypt"
import jwt from 'jsonwebtoken';
import { tokenSing } from "../lib/generateToken"
import { CustomRequest } from "../middlewares/authToken";


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
    user.rol = rol

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