import { ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { InjectModel } from '@nestjs/mongoose';
import { PassportStrategy } from '@nestjs/passport';
import { Model } from 'mongoose';
import { Strategy, ExtractJwt } from 'passport-jwt';
import { User } from '../shared/schemas/user.schema';
import { TokenInfo } from '../shared/dto/token-info.dto';
import { FeatureEndpointMap } from '../shared/schemas/FeatureEndpointMap.schema';
import { UserRoles } from '../shared/constant/roles.constant';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
  constructor(
    @InjectModel(User.name)
    private userModel: Model<User>,
    @InjectModel(FeatureEndpointMap.name)
    private endPointModel: Model<FeatureEndpointMap>,
  ) {
    super({
      jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
      secretOrKey: process.env.JWT_SECRET,
      passReqToCallback: true,
    });
  }

  async validate(req: Request, payload: TokenInfo) {

    const user = await this.userModel.findOne({_id: payload.UserId});
    let currentApiRoute = req.url.toLowerCase().substring(1);
    // console.log(currentApiRoute);
    if(currentApiRoute.indexOf('?') > -1) {
      currentApiRoute = currentApiRoute.split('?')[0];
    }
    const permissionCount = await this.endPointModel.countDocuments({RoleName:{$in:payload.Roles}, 
      APIToAccess:{$regex: new RegExp(currentApiRoute, 'i')}});

    if (!user) {
      console.log('inside unauthorised section');
      throw new UnauthorizedException('Login first to access this endpoint.');
    }

    if (this.isTokenExpired(payload.exp)) {
      throw new UnauthorizedException('Token Expired');
    }

    if(permissionCount==0 && !this.hasFallbackPermission(payload, currentApiRoute)) {
      throw new ForbiddenException('Forbidden');
    }
    console.log('successfully validate endpoint: '+ req.url)
    return user;
  }

  private hasFallbackPermission(payload: TokenInfo, currentApiRoute: string): boolean {
    if (!payload?.Roles?.includes(UserRoles.WholeSaler)) {
      return false;
    }

    return [
      'business/getinvoice',
      'business/getdashboarddata',
    ].includes(currentApiRoute);
  }

  isTokenExpired(exp: number): boolean {
    const currentTime = Math.floor(Date.now() / 1000); // Get current time in seconds since Unix epoch
    return currentTime > exp;
  }
}
