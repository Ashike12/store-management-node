import {
  Injectable,
  ServiceUnavailableException,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { OAuth2Client } from 'google-auth-library';

export interface GoogleIdentity {
  subject: string;
  email: string;
  firstName: string;
  lastName: string;
  displayName: string;
}

@Injectable()
export class GoogleIdentityService {
  private readonly client = new OAuth2Client();

  constructor(private readonly config: ConfigService) {}

  async verifyCredential(credential: string): Promise<GoogleIdentity> {
    const clientId = this.config.get<string>('GOOGLE_OAUTH_CLIENT_ID')?.trim();
    if (!clientId) {
      throw new ServiceUnavailableException('Google sign-in is not configured');
    }

    try {
      const ticket = await this.client.verifyIdToken({
        idToken: credential,
        audience: clientId,
      });
      const payload = ticket.getPayload();
      if (!payload?.sub || !payload.email || payload.email_verified !== true) {
        throw new UnauthorizedException('Google account could not be verified');
      }

      const email = payload.email.trim().toLowerCase();
      const fallbackName = email.split('@')[0] || 'Customer';
      const displayName = (payload.name || fallbackName).trim().slice(0, 120);
      const firstName = (payload.given_name || displayName).trim().slice(0, 60);
      const lastName = (payload.family_name || '').trim().slice(0, 60);

      return {
        subject: payload.sub,
        email,
        firstName,
        lastName,
        displayName,
      };
    } catch (error) {
      if (error instanceof UnauthorizedException) throw error;
      throw new UnauthorizedException('Google account could not be verified');
    }
  }
}
