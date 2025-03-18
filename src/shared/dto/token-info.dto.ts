export class AnnonymousTokenInfo {
    readonly Roles: string[]
    readonly exp?: number;
    readonly iat?: number;
}

export class TokenInfo extends AnnonymousTokenInfo {
    readonly UserId: string;
    readonly UserName: string;
}