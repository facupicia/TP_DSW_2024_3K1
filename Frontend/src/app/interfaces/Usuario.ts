export interface Usuario {
  id?: number;
  email: string;
  firstname: string;
  lastname: string;
  password: string;
  phone: string;
  location: string;
  birth: string;
  rol?: 'user' | 'admin' | 'scanner';
  imgPerfil?: string;
  active?: boolean;
}
