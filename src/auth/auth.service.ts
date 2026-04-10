import {
  BadRequestException,
  Injectable,
  Logger,
  UnauthorizedException,
} from '@nestjs/common';
import { CreateAuthDto } from './dto/create-auth.dto';
import { UserService } from 'src/user/user.service';
import { JwtService } from '@nestjs/jwt';
import * as bcrypt from 'bcryptjs';

interface Usuario {
  nombre: string;
  correo: string;
  id: number;
  rol: string;
  activo: boolean;
  sucursalId: number;
}

@Injectable()
export class AuthService {
  private readonly logger = new Logger(AuthService.name);
  constructor(
    private readonly userService: UserService,
    private readonly jwtService: JwtService,
  ) {}

  async validarUsuario(correo: string, contrasena: string): Promise<any> {
    const usuario = await this.userService.findByGmail(correo);

    if (usuario && (await bcrypt.compare(contrasena, usuario.contrasena))) {
      return usuario;
    }
    throw new UnauthorizedException('Usuario no autorizado');
  }

  async login(correo: string, contrasena: string) {
    try {
      const usuario: Usuario = await this.validarUsuario(correo, contrasena);

      const payload = {
        nombre: usuario.nombre,
        correo: usuario.correo,
        sub: usuario.id,
        rol: usuario.rol,
        activo: usuario.activo,
        sucursalId: usuario.sucursalId,
      };
      return {
        access_token: this.jwtService.sign(payload),
      };
    } catch (error) {
      this.logger.error('Error generado en login auth: ', error);
      throw new UnauthorizedException('Credenciales incorrectas');
    }
  }

  async register(createAuthDto: CreateAuthDto) {
    try {
      const salt = await bcrypt.genSalt(10);
      const hashedPassword = await bcrypt.hash(createAuthDto.contrasena, salt);
      const { nombre, rol, correo, sucursalId } = createAuthDto;

      const nuevoUsuario = await this.userService.create({
        nombre,
        contrasena: hashedPassword,
        rol,
        correo,
        activo: true,
        sucursalId,
      });

      const payload = {
        nombre: nuevoUsuario.nombre,
        correo: nuevoUsuario.correo,
        sub: nuevoUsuario.id,
        rol: nuevoUsuario.rol,
        activo: nuevoUsuario.activo,
        sucursalId: nuevoUsuario.sucursalId,
      };

      const token = this.jwtService.sign(payload);
      return {
        usuario: nuevoUsuario,
        access_token: token,
      };
    } catch (error) {
      this.logger.error('Error al registrar usuario: ', error);
      throw new BadRequestException(
        'Error inesperado en registrar usuario modulo',
      );
    }
  }
}
