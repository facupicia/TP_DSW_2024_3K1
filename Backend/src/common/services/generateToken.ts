import jwt from 'jsonwebtoken'
import { User } from "../../user/user.entity";
import { getRoleNames } from "../../user/role.entity";


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
    let roleNames = getRoleNames(user);
    // If roles weren't loaded (eager removed), fetch them explicitly
    if (roleNames.length === 0 && user.id) {
        const refreshed = await User.findOne({ where: { id: user.id }, relations: ['roles'] });
        if (refreshed) {
            roleNames = getRoleNames(refreshed);
        }
    }
    return jwt.sign(
        {
            id: user.id,
            roles: roleNames.length > 0 ? roleNames : ['user']
        },
        process.env.SECRET_KEY,
        {
            expiresIn: process.env.JWT_ACCESS_EXPIRES_IN || '15m'
        }
    );
}
