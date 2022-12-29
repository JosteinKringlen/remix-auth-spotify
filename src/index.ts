import type { SessionStorage } from '@remix-run/server-runtime';
import type { AuthenticateOptions, StrategyVerifyCallback } from 'remix-auth';
import type {
    OAuth2Profile,
    OAuth2StrategyVerifyParams,
} from 'remix-auth-oauth2';
import { OAuth2Strategy } from 'remix-auth-oauth2';

export interface SpotifyStrategyOptions {
    clientID: string;
    clientSecret: string;
    callbackURL: string;
    scope?: string;
    sessionStorage: SessionStorage;
    sessionKey?: string;
    sessionStrategyKey?: string;
    sessionErrorKey?: string;
}

export interface SpotifyImage {
    url: string;
    height: number | null;
    width: number | null;
}

export interface SpotifyProfile extends OAuth2Profile {
    id: string;
    displayName: string;
    emails: [{ value: string }];
    photos?: [{ value: string }];
    __json: {
        id: string;
        display_name: string;
        email: string;
        country: string;
        explicit_content: {
            filter_enabled: boolean;
            filter_locked: boolean;
        };
        external_urls: {
            spotify: string;
        };
        followers: {
            href: string | null;
            total: number;
        };
        href: string;
        images: Array<SpotifyImage>;
        product: string;
        type: string;
        uri: string;
    };
}

export interface SpotifyExtraParams extends Record<string, string | number> {
    expiresIn: number;
    tokenType: string;
}

export interface User {
    id: string;
    email: string;
    name?: string;
    image?: string;
}
export interface Session {
    accessToken: string;
    expiresAt: number;
    refreshToken?: string;
    tokenType?: string;
    user: User | null;
}

export interface RefreshTokenResponse {
    access_token: string;
    token_type: string;
    expires_in: number;
    scope: string;
}

export type CheckOptions =
    | { successRedirect?: never; failureRedirect?: never }
    | { successRedirect: string; failureRedirect?: never }
    | { successRedirect?: never; failureRedirect: string };

export class SpotifyStrategy extends OAuth2Strategy<
    Session,
    SpotifyProfile,
    SpotifyExtraParams
> {
    name = 'spotify';

    private scope: string;
    private readonly userInfoURL = 'https://api.spotify.com/v1/me';
    private readonly sessionStorage: SessionStorage;
    readonly sessionKey: string;
    readonly sessionStrategyKey: string;
    readonly sessionErrorKey: string;

    constructor(
        {
            clientID,
            clientSecret,
            callbackURL,
            scope,
            sessionStorage,
            sessionKey,
            sessionStrategyKey,
            sessionErrorKey,
        }: SpotifyStrategyOptions,
        verify: StrategyVerifyCallback<
            Session,
            OAuth2StrategyVerifyParams<SpotifyProfile, SpotifyExtraParams>
        >,
    ) {
        super(
            {
                clientID,
                clientSecret,
                callbackURL,
                authorizationURL: 'https://accounts.spotify.com/authorize',
                tokenURL: 'https://accounts.spotify.com/api/token',
            },
            verify,
        );
        this.scope = scope ?? 'user-read-email';
        this.sessionStorage = sessionStorage;
        this.sessionKey = sessionKey ?? 'spotify:session';
        this.sessionStrategyKey = sessionStrategyKey ?? 'spotify';
        this.sessionErrorKey = sessionErrorKey ?? 'spotify:error';
    }

    protected authorizationParams(): URLSearchParams {
        return new URLSearchParams({
            scope: this.scope,
        });
    }

    protected async userProfile(accessToken: string): Promise<SpotifyProfile> {
        const response = await fetch(this.userInfoURL, {
            headers: {
                Accept: 'application/json',
                Authorization: `Bearer ${accessToken}`,
            },
        });

        const data: SpotifyProfile['__json'] = await response.json();

        const profile: SpotifyProfile = {
            provider: 'spotify',
            displayName: data.display_name,
            id: data.id,
            emails: [{ value: data.email }],
            photos:
                data.images.length > 0
                    ? [{ value: data.images[0].url }]
                    : undefined,
            __json: data,
        };

        return profile;
    }

    protected async getAccessToken(response: Response): Promise<{
        accessToken: string;
        refreshToken: string;
        extraParams: SpotifyExtraParams;
    }> {
        const {
            access_token: accessToken,
            token_type: tokenType,
            expires_in: expiresIn,
            refresh_token: refreshToken,
        } = await response.json();

        return {
            accessToken,
            refreshToken,
            extraParams: { tokenType, expiresIn },
        } as const;
    }

    private async refreshAccessToken(
        refreshToken: string,
    ): Promise<RefreshTokenResponse> {
        const url = `https://accounts.spotify.com/api/token?${new URLSearchParams(
            {
                grant_type: 'refresh_token',
                refresh_token: refreshToken,
            },
        )}`;

        const base64Token = Buffer.from(
            `${this.clientID}:${this.clientSecret}`,
        ).toString('base64');

        const response = await fetch(url, {
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
                Authorization: `Basic ${base64Token}`,
            },
            method: 'POST',
        });

        if (!response.ok) {
            throw new Error(response.statusText);
        }

        return response.json();
    }

    protected async handleResult(
        req: Request,
        options: AuthenticateOptions,
        result: string | Session | null,
        hasErrored = false,
    ): Promise<Session | null> {
        if (options.failureRedirect && hasErrored)
            return this.failure(
                result as string,
                req,
                this.sessionStorage,
                options,
            );

        if (hasErrored) return null;

        if (options.successRedirect && !hasErrored)
            return this.success(
                result as Session,
                req,
                this.sessionStorage,
                options,
            );

        return result as Session;
    }

    async getSession(
        req: Request,
        checkOptions: {
            successRedirect: string;
            failureRedirect?: never;
        },
    ): Promise<null>;

    async getSession(
        req: Request,
        checkOptions: {
            successRedirect?: never;
            failureRedirect: string;
        },
    ): Promise<Session>;

    async getSession(
        req: Request,
        checkOptions?: {
            successRedirect?: never;
            failureRedirect?: never;
        },
    ): Promise<Session | null>;

    async getSession(
        req: Request,
        checkOptions: CheckOptions = {},
    ): Promise<Session | null> {
        const sessionCookie = await this.sessionStorage.getSession(
            req.headers.get('Cookie'),
        );
        const session: Session | null = sessionCookie.get(this.sessionKey);
        const options = {
            sessionKey: this.sessionKey,
            sessionStrategyKey: this.sessionStrategyKey,
            sessionErrorKey: this.sessionErrorKey,
            ...checkOptions,
        };

        if (!session || !session.refreshToken || !session.accessToken) {
            return this.handleResult(
                req,
                options,
                'No session data found',
                true,
            );
        }

        if (Date.now() < session.expiresAt) {
            return this.handleResult(req, options, session);
        }

        try {
            const refreshedToken = await this.refreshAccessToken(
                session.refreshToken,
            );
            const currentPath = new URL(req.url).pathname;
            return this.success(
                {
                    ...session,
                    accessToken: refreshedToken.access_token,
                    expiresAt: Date.now() + refreshedToken.expires_in * 1000,
                },
                req,
                this.sessionStorage,
                {
                    ...options,
                    successRedirect: options?.successRedirect ?? currentPath,
                },
            );
        } catch (error) {
            console.log(error);
            return this.handleResult(
                req,
                options,
                'Could not refresh session',
                true,
            );
        }
    }
}
