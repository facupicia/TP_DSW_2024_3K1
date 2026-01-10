export interface Usuario {
  id?: number;
  email: string;
  firstname: string;
  lastname: string;
  password: string;
  phone: string;
  location?: string;  // Optional for backward compatibility
  pais?: string;
  provincia?: string;
  ciudad?: string;
  birth: string;
  rol?: 'user' | 'admin' | 'scanner';
  imgPerfil?: string;
  active?: boolean;
  address?: string;
}
