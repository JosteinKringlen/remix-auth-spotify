# Remix Auth - Spotify Strategy

The Spotify strategy is used to authenticate users against a Spotify account. It extends the OAuth2Strategy.

The strategy supports refreshing expired access tokens. The logic for this is ~~stolen from~~ heavily inspired by [remix-auth-supabase](https://github.com/mitchelvanbever/remix-auth-supabase) – thanks [@mitchelvanbever](https://github.com/mitchelvanbever)!

## Supported runtimes

| Runtime    | Has Support |
| ---------- | ----------- |
| Node.js    | ✅           |
| Cloudflare | ✅           |

## How to use

### Create application in Spotify developer dashboard

1. Go to the [Spotify developer dashboard](https://developer.spotify.com/dashboard/applications) and sign in with your account
2. Click `Create an app` and give the application a suitable name and description
3. Click `Edit settings` and add
   - `http://localhost:3000` under `Website`
   - `http://localhost:3000/auth/spotify/callback` under `Redirect URIs` (remember to hit `Add`)
4. Hit `Save` at the bottom of the modal
5. Grab your client ID and secret from the dashboard overview, and save them as env variables

Remember to update `Website` and `Redirect URIs` if/when deploying your app.

### Install remix-auth and the Spotify strategy

``` bash
npm install remix-auth remix-auth-spotify
# or
yarn add remix-auth remix-auth-spotify
```

### Setup env variables, sessionStorage, strategy and authenticator

```bash
# .env
SPOTIFY_CLIENT_ID="your client id"
SPOTIFY_CLIENT_SECRET="your client secret"
SPOTIFY_CALLBACK_URL="your callback url" # e.g. http://localhost:3000/auth/spotify/callback
```

```TypeScript
// app/services/session.server.ts
import { createCookieSessionStorage } from '@remix-run/node';

export const sessionStorage = createCookieSessionStorage({
    cookie: {
        name: '_session', // use any name you want here
        sameSite: 'lax',
        path: '/',
        httpOnly: true,
        secrets: ['s3cr3t'], // replace this with an actual secret from env variable
        secure: process.env.NODE_ENV === 'production', // enable this in prod only
    },
});

export const { getSession, commitSession, destroySession } = sessionStorage;
```

```TypeScript
// app/services/auth.server.ts
import { Authenticator } from 'remix-auth';
import { SpotifyStrategy } from 'remix-auth-spotify';

import { sessionStorage } from '~/services/session.server';

if (!process.env.SPOTIFY_CLIENT_ID) {
    throw new Error('Missing SPOTIFY_CLIENT_ID env');
}

if (!process.env.SPOTIFY_CLIENT_SECRET) {
    throw new Error('Missing SPOTIFY_CLIENT_SECRET env');
}

if (!process.env.SPOTIFY_CALLBACK_URL) {
    throw new Error('Missing SPOTIFY_CALLBACK_URL env');
}

// See https://developer.spotify.com/documentation/general/guides/authorization/scopes
const scopes = ['user-read-email'].join(' ');

export const spotifyStrategy = new SpotifyStrategy(
    {
        clientID: process.env.SPOTIFY_CLIENT_ID,
        clientSecret: process.env.SPOTIFY_CLIENT_SECRET,
        callbackURL: process.env.SPOTIFY_CALLBACK_URL,
        sessionStorage,
        scope: scopes,
    },
    async ({ accessToken, refreshToken, extraParams, profile }) => ({
        accessToken,
        refreshToken,
        expiresAt: Date.now() + extraParams.expiresIn * 1000,
        tokenType: extraParams.tokenType,
        user: {
            id: profile.id,
            email: profile.emails[0].value,
            name: profile.displayName,
            image: profile.__json.images?.[0].url,
        },
    }),
);

export const authenticator = new Authenticator(sessionStorage, {
    sessionKey: spotifyStrategy.sessionKey,
    sessionErrorKey: spotifyStrategy.sessionErrorKey,
});

authenticator.use(spotifyStrategy);
```

### Setup authentication routes

```TSX
// app/routes/auth/spotify.tsx
import type { ActionFunction, LoaderFunction } from '@remix-run/node';
import { redirect } from '@remix-run/node';

import { authenticator } from '~/services/auth.server';

export const loader: LoaderFunction = () => redirect('/login');

export const action: ActionFunction = async ({ request }) => {
    return await authenticator.authenticate('spotify', request);
};
```

```TSX
// app/routes/auth/spotify.callback.tsx
import type { LoaderFunction } from '@remix-run/node';
import { authenticator } from '~/services/auth.server';

export const loader: LoaderFunction = ({ request }) => {
    return authenticator.authenticate('spotify', request, {
        successRedirect: '/',
        failureRedirect: '/login',
    });
};
```

```TSX
// app/routes/logout.tsx
import type { ActionFunction, LoaderFunction } from '@remix-run/node';
import { json, redirect } from '@remix-run/node';

import { destroySession, getSession } from '~/services/session.server';

export const action: ActionFunction = async ({ request }) => {
    return redirect('/', {
        headers: {
            'Set-Cookie': await destroySession(
                await getSession(request.headers.get('cookie')),
            ),
        },
    });
};

export const loader: LoaderFunction = () => {
    throw json({}, { status: 404 });
};
```

### Use the strategy

> `spotifyStrategy.getSession()` works similar to `authenticator.isAuthenticated()`, only it handles refreshing tokens. If you don't need to refresh tokens in your app, feel free to use `authenticator.isAuthenticated()` instead.

```TSX
// app/routes/index.tsx
import type { LoaderFunction } from '@remix-run/node';
import { Form, useLoaderData } from '@remix-run/react';
import type { Session } from 'remix-auth-spotify';

import { spotifyStrategy } from '~/services/auth.server';

export const loader: LoaderFunction = async ({ request }) => {
    return spotifyStrategy.getSession(request);
};

export default function Index() {
    const data = useLoaderData<Session>();
    const user = data?.user;

    return (
        <div style={{ textAlign: 'center', padding: 20 }}>
            <h2>Welcome to Remix!</h2>
            <p>
                <a href="https://docs.remix.run">Check out the docs</a> to get
                started.
            </p>
            {user ? (
                <p>You are logged in as: {user?.email}</p>
            ) : (
                <p>You are not logged in yet!</p>
            )}
            <Form action={user ? '/logout' : '/auth/spotify'} method="post">
                <button>{user ? 'Logout' : 'Log in with Spotify'}</button>
            </Form>
        </div>
    );
}

```
