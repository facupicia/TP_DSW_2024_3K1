import jwt from 'jsonwebtoken'
import { User } from "../../user/user.entity";


export const verifyToken = async (token: string) => {
    try {
        return jwt.verify(token, process.env.SECRET_KEY!)
    } catch (error) {
        return null
    }
};


export const tokenSing = async (user: User) => {
    if (!process.env.SECRET_KEY) {
        throw new Error("SECRET_KEY is missing in environment variables");
    }
    return jwt.sign(
        {
            id: user.id,
            roles: user.roles || ['user']
        },
        process.env.SECRET_KEY,
        {
            expiresIn: '24h'
        }
    );
}
