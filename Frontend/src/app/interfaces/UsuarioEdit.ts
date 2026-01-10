export interface UsuarioEdit {
  id: number;
  firstname: string;
  lastname: string;
  phone: string;
  pais?: string;
  provincia?: string;
  ciudad?: string;
  birth: string;
  imgPerfil: string;
  address?: string;
}