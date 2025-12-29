import { Injectable, UnauthorizedException } from '@nestjs/common';
import { JwtService } from '@nestjs/jwt';
import { ConfigService } from '@nestjs/config';
import { LoginDto } from './dto/login.dto';
import { JwtPayload } from './jwt.strategy';

@Injectable()
export class AuthService {
  constructor(
    private jwtService: JwtService,
    private configService: ConfigService,
  ) {}

  async login(loginDto: LoginDto) {
    const { username, password } = loginDto;

    // 환경 변수에서 사용자 정보 가져오기
    const validUsername = this.configService.get<string>('AUTH_USERNAME') || 'admin';
    const validPassword = this.configService.get<string>('AUTH_PASSWORD') || 'admin123';

    // 간단한 사용자 검증 (실제 프로덕션에서는 DB 조회 및 bcrypt 사용)
    if (username !== validUsername || password !== validPassword) {
      throw new UnauthorizedException('Invalid credentials');
    }

    // JWT 토큰 생성
    const payload: JwtPayload = {
      sub: username,
      username: username,
    };

    return {
      access_token: this.jwtService.sign(payload),
      username,
    };
  }

  async validateToken(token: string): Promise<any> {
    try {
      return this.jwtService.verify(token);
    } catch (error) {
      throw new UnauthorizedException('Invalid token');
    }
  }
}
