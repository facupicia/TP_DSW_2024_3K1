export interface Usuario {
  id?: number;
  email: string;
  firstname: string;
  lastname: string;
  password: string;
  phone: string;
  location?: string;  // Optional for backward compatibility
  pais: string;
  provincia: string;
  ciudad: string;
  birth: string;
  roles?: string[];  // Array of roles: user can have multiple roles
  rol?: string;      // Backward compatibility: highest role
  imgPerfil?: string;
  active?: boolean;
  address: string;
}

// NOTE: Role hierarchy logic (getHighestRole, hasRoleLevel, hasExactRole)
// has been removed from the frontend. The backend is the single source of
// truth for role validation. Guards and components should use direct
// Array.prototype.includes checks against user.roles.
