export interface Usuario {
  id?: number;
  email: string;
  firstname: string;
  lastname: string;
  password?: string;
  phone: string;
  pais?: string;
  provincia?: string;
  ciudad?: string;
  birth: string;
  roles?: string[];
  rol?: string;
  imgPerfil?: string;
  active?: boolean;
  address?: string;
}

/**
 * Role hierarchy levels (higher number = more permissions)
 * admin > organizer > scanner > rrpp > user
 */
export const ROLE_HIERARCHY: Record<string, number> = {
  'user': 1,
  'rrpp': 2,
  'scanner': 3,
  'organizer': 4,
  'admin': 5
};

/**
 * Get the highest role from a list of roles
 */
export const getHighestRole = (roles: string[] = ['user']): string => {
  return roles.reduce((highest, role) => {
    return (ROLE_HIERARCHY[role] || 0) > (ROLE_HIERARCHY[highest] || 0) ? role : highest;
  }, 'user');
};

/**
 * Check if user has a specific role level or higher
 * An admin can access resources requiring organizer, scanner, etc.
 */
export const hasRoleLevel = (userRoles: string[], requiredRole: string): boolean => {
  const userLevel = Math.max(...userRoles.map(r => ROLE_HIERARCHY[r] || 0));
  const requiredLevel = ROLE_HIERARCHY[requiredRole] || 0;
  return userLevel >= requiredLevel;
};

/**
 * Check if user has exact role (for endpoints that require specific role)
 */
export const hasExactRole = (userRoles: string[], role: string): boolean => {
  return userRoles.includes(role);
};
