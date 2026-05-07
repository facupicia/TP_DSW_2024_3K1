import { z } from "zod";

export const Roles = z.enum(["user", "admin", "scanner", "organizer", "rrpp"]);

// Schema for multiple roles
export const RolesArray = z.array(Roles).default(["user"]);

// Helper to check role hierarchy
const ROLE_HIERARCHY: Record<string, number> = {
    'user': 1,
    'rrpp': 2,
    'scanner': 3,
    'organizer': 4,
    'admin': 5
};

export const hasRoleLevel = (userRoles: string[], requiredLevel: number): boolean => {
    const userLevel = Math.max(...userRoles.map(r => ROLE_HIERARCHY[r] || 0));
    return userLevel >= requiredLevel;
};

export const getHighestRole = (roles: string[]): string => {
    return roles.reduce((highest, role) => {
        return (ROLE_HIERARCHY[role] || 0) > (ROLE_HIERARCHY[highest] || 0) ? role : highest;
    }, 'user');
};

export const signupUserSchema = z.object({
    body: z.object({
        firstname: z.string().min(1, "Firstname is required"),
        lastname: z.string().min(1, "Lastname is required"),
        email: z.string().email("Invalid email format"),
        password: z.string().min(8, "Password must be at least 8 characters long"),
        phone: z
            .string()
            .regex(/^\+?[0-9\s\-()]{6,15}$/, {
                message: "El número de teléfono no es válido.",
            }),
        pais: z.string().min(1, "Pais is required"),    
        provincia: z.string().min(1, "Provincia is required"),
        ciudad: z.string().min(1, "Ciudad is required"),
        address: z.string().min(1, "Address is required"),
        birth: z.string().refine(date => !isNaN(Date.parse(date)), "Fecha inválida"),
    })
})


export const updateUserSchema = z.object({
    body: z.object({
        firstname: z.string().min(1, "Firstname is required").optional(),
        lastname: z.string().min(1, "Lastname is required").optional(),
        email: z.string().email("Invalid email format").optional(),
        password: z.string().min(6, "Password must be at least 6 characters long").optional(),
        phone: z
            .string()
            .regex(/^\+?[0-9\s\-()]{6,15}$/, {
                message: "El número de teléfono no es válido.",
            })
            .optional(),
        pais: z.string().min(1, "Pais is required").optional(),
        provincia: z.string().min(1, "Provincia is required").optional(),
        ciudad: z.string().min(1, "Ciudad is required").optional(),
        address: z.string().min(1, "Address is required").optional(),
        birth: z.string().refine(date => !isNaN(Date.parse(date)), "Fecha inválida").optional(),
        imgPerfil: z.string().optional(),
    }),
    params: z.object({
        id: z.string().min(1),
    })
})

export const signinUserSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email format"),
        password: z.string().min(8, "Password must be at least 8 characters long"),

    })
})

export const updateUserRoleSchema = z.object({
    params: z.object({
        id: z.string().min(1),
    }),
    body: z.object({
        roles: RolesArray,
        action: z.enum(['set', 'add', 'remove']).default('set')
    })
})

export const googleSigninSchema = z.object({
    body: z.object({
        credential: z.string().min(1, "Google credential is required")
    })
})

export const requestAccountClaimSchema = z.object({
    body: z.object({
        email: z.string().email("Invalid email format")
    })
})

export const validateAccountClaimSchema = z.object({
    query: z.object({
        token: z.string().min(20, "Token is required")
    })
})

export const completeAccountClaimSchema = z.object({
    body: z.object({
        token: z.string().min(20, "Token is required"),
        password: z.string().min(6, "Password must be at least 6 characters long")
    })
})
