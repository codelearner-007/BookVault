'use client';

import { useState } from 'react';

import { authService } from '@/lib/services/auth.service';
import { Button } from '@/components/ui/button';
import { AUTH_UI_COPY } from '@/lib/copy/auth-ui';

const COPY = AUTH_UI_COPY.sso;

const PROVIDER_CONFIGS = {
    github: {
        name: 'GitHub',
        icon: (
            <svg viewBox="0 0 20 20" className="size-4" fill="currentColor">
                <path fillRule="evenodd" d="M10 0C4.477 0 0 4.484 0 10.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0110 4.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0020 10.017C20 4.484 15.522 0 10 0z" clipRule="evenodd" />
            </svg>
        ),
    },
    google: {
        name: 'Google',
        icon: (
            <svg viewBox="0 0 20 20" className="size-4" fill="currentColor">
                <path d="M19.6 10.23c0-.82-.1-1.42-.25-2.05H10v3.72h5.5c-.15.96-.74 2.31-2.04 3.22v2.45h3.16c1.89-1.73 2.98-4.3 2.98-7.34z" />
                <path d="M10 20c2.67 0 4.9-.89 6.57-2.43l-3.16-2.45c-.89.59-2.01.96-3.41.96-2.61 0-4.83-1.76-5.63-4.13H1.07v2.51C2.72 17.75 6.09 20 10 20z" />
                <path d="M4.37 11.95c-.2-.6-.31-1.24-.31-1.95s.11-1.35.31-1.95V5.54H1.07C.38 6.84 0 8.36 0 10s.38 3.16 1.07 4.46l3.3-2.51z" />
                <path d="M10 3.98c1.48 0 2.79.51 3.83 1.5l2.78-2.78C14.93 1.03 12.7 0 10 0 6.09 0 2.72 2.25 1.07 5.54l3.3 2.51C5.17 5.68 7.39 3.98 10 3.98z" />
            </svg>
        ),
    },
    facebook: {
        name: 'Facebook',
        icon: (
            <svg viewBox="0 0 20 20" className="size-4" fill="currentColor">
                <path fillRule="evenodd" d="M20 10c0-5.523-4.477-10-10-10S0 4.477 0 10c0 4.991 3.657 9.128 8.438 9.878v-6.987h-2.54V10h2.54V7.797c0-2.506 1.492-3.89 3.777-3.89 1.094 0 2.238.195 2.238.195v2.46h-1.26c-1.243 0-1.63.771-1.63 1.562V10h2.773l-.443 2.89h-2.33v6.988C16.343 19.128 20 14.991 20 10z" clipRule="evenodd" />
            </svg>
        ),
    },
    apple: {
        name: 'Apple',
        icon: (
            <svg viewBox="0 0 20 20" className="size-4" fill="currentColor">
                <path d="M12.44 4.33a3.63 3.63 0 00.88-2.64 3.7 3.7 0 00-2.5 1.27 3.48 3.48 0 00-.83 2.57 3.08 3.08 0 002.45-1.2zm2.1 6.2a3.76 3.76 0 011.8-3.17 3.88 3.88 0 00-3.05-1.67c-1.3-.13-2.5.76-3.2.76s-1.65-.74-2.75-.72a4.1 4.1 0 00-3.5 2.12c-1.46 2.55-.37 6.32 1.06 8.39.67 1 1.5 2.15 2.6 2.11s1.46-.69 2.73-.69 1.68.69 2.75.66 1.85-1.03 2.55-2.04a9.17 9.17 0 001.15-2.38 3.67 3.67 0 01-2.14-3.37z" />
            </svg>
        ),
    }
};

// Providers come from config (NEXT_PUBLIC_SSO_PROVIDERS), never a hardcoded list in the page.
function getEnabledProviders() {
    const providersStr = process.env.NEXT_PUBLIC_SSO_PROVIDERS || '';
    return providersStr
        .split(',')
        .map((provider) => provider.trim().toLowerCase())
        .filter((provider) => provider in PROVIDER_CONFIGS);
}

export default function SSOButtons() {
    const [error, setError] = useState('');
    const enabledProviders = getEnabledProviders();
    if (enabledProviders.length === 0) return null;

    const handleSSOLogin = async (provider) => {
        setError('');
        try {
            await authService.signInWithOAuth(provider);
        } catch {
            setError(COPY.failed);
        }
    };

    return (
        <div className="mt-6 grid gap-3">
            <p className="flex items-center gap-3 text-xs text-muted-foreground before:h-px before:flex-1 before:bg-border after:h-px after:flex-1 after:bg-border">
                {COPY.divider}
            </p>
            {enabledProviders.map((provider) => {
                const config = PROVIDER_CONFIGS[provider];
                return (
                    <Button key={provider} type="button" variant="secondary" className="w-full" onClick={() => handleSSOLogin(provider)}>
                        {config.icon}
                        {COPY.continueWith(config.name)}
                    </Button>
                );
            })}
            {error && <p role="alert" className="text-sm text-bad">{error}</p>}
        </div>
    );
}
