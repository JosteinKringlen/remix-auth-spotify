import { createCookieSessionStorage } from '@remix-run/server-runtime';

import { SpotifyStrategy } from '../src';

describe(SpotifyStrategy, () => {
    let verify = jest.fn();
    // You will probably need a sessionStorage to test the strategy.
    let sessionStorage = createCookieSessionStorage({
        cookie: { secrets: ['s3cr3t'] },
    });

    const strategyConf = {
        clientID: 'CLIENT_ID',
        clientSecret: 'CLIENT_SECRET',
        callbackURL: 'https://example.app/callback',
        sessionStorage,
    };

    let request: Request;
    beforeEach(() => {
        jest.resetAllMocks();
        // jestFetchMock.resetMocks();
        request = new Request('https://example.app/auth/spotify');
    });

    it('should allow changing the scope', async () => {
        let strategy = new SpotifyStrategy(
            {
                ...strategyConf,
                scope: 'custom',
            },
            verify,
        );

        try {
            await strategy.authenticate(request, sessionStorage, {
                sessionKey: 'user',
            });
        } catch (error) {
            if (!(error instanceof Response)) throw error;
            let location = error.headers.get('Location');

            if (!location) throw new Error('No redirect header');

            let redirectUrl = new URL(location);

            expect(redirectUrl.searchParams.get('scope')).toBe('custom');
        }
    });

    it('should have the scope `user-read-email` as default', async () => {
        let strategy = new SpotifyStrategy(strategyConf, verify);

        try {
            await strategy.authenticate(request, sessionStorage, {
                sessionKey: 'user',
            });
        } catch (error) {
            if (!(error instanceof Response)) throw error;
            let location = error.headers.get('Location');

            if (!location) throw new Error('No redirect header');

            let redirectUrl = new URL(location);

            expect(redirectUrl.searchParams.get('scope')).toBe(
                'user-read-email',
            );
        }
    });

    it('should correctly format the authorization URL', async () => {
        let strategy = new SpotifyStrategy(strategyConf, verify);

        try {
            await strategy.authenticate(request, sessionStorage, {
                sessionKey: 'user',
            });
        } catch (error) {
            if (!(error instanceof Response)) throw error;

            let location = error.headers.get('Location');

            if (!location) throw new Error('No redirect header');

            let redirectUrl = new URL(location);

            expect(redirectUrl.hostname).toBe('accounts.spotify.com');
            expect(redirectUrl.pathname).toBe('/authorize');
        }
    });
});
