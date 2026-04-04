'use client'

import { useState } from 'react'
import { ShieldOff, Clock, Mail, Shield, BookOpen } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Card, CardContent } from '@/components/ui/card'

export default function BannedPage() {
    const [signingOut, setSigningOut] = useState(false)

    async function handleSignOut() {
        setSigningOut(true)
        try {
            await fetch('/api/auth/logout', { method: 'POST' })
        } catch {
            // ignore errors — still redirect
        } finally {
            window.location.href = '/auth/login'
        }
    }

    return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
            {/* Brand header */}
            <div className="flex items-center gap-2 mb-10">
                <div className="flex items-center justify-center w-9 h-9 rounded-lg bg-primary">
                    <BookOpen className="w-5 h-5 text-primary-foreground" />
                </div>
                <span className="text-xl font-bold text-foreground tracking-tight">
                    BookVault
                </span>
            </div>

            {/* Main card */}
            <Card className="w-full max-w-lg rounded-2xl border border-border bg-card shadow-xl">
                <CardContent className="p-8 flex flex-col items-center text-center gap-6">
                    {/* Icon */}
                    <div className="flex items-center justify-center w-20 h-20 rounded-full bg-destructive/10">
                        <ShieldOff className="w-10 h-10 text-destructive" />
                    </div>

                    {/* Heading & badge */}
                    <div className="flex flex-col items-center gap-3">
                        <h1 className="text-2xl font-bold text-foreground">
                            Account Suspended
                        </h1>
                        <Badge variant="destructive" className="text-xs px-3 py-1">
                            Access Restricted
                        </Badge>
                    </div>

                    {/* Description */}
                    <p className="text-muted-foreground text-sm leading-relaxed max-w-sm">
                        Your account has been suspended by an administrator. You cannot
                        access the platform until your account is reinstated.
                    </p>

                    {/* Divider */}
                    <div className="w-full border-t border-border" />

                    {/* Info rows */}
                    <div className="w-full flex flex-col gap-4">
                        <div className="flex items-start gap-3 text-left">
                            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0 mt-0.5">
                                <Clock className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    Suspension is in effect immediately
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Your access has been revoked across all sessions.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 text-left">
                            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0 mt-0.5">
                                <Mail className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    Contact your administrator to appeal
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    Reach out to request a review of this decision.
                                </p>
                            </div>
                        </div>

                        <div className="flex items-start gap-3 text-left">
                            <div className="flex items-center justify-center w-8 h-8 rounded-md bg-muted shrink-0 mt-0.5">
                                <Shield className="w-4 h-4 text-muted-foreground" />
                            </div>
                            <div>
                                <p className="text-sm font-medium text-foreground">
                                    All active sessions have been terminated
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                    You will need to sign in again once reinstated.
                                </p>
                            </div>
                        </div>
                    </div>

                    {/* Divider */}
                    <div className="w-full border-t border-border" />

                    {/* Actions */}
                    <div className="w-full flex flex-col gap-3">
                        <Button
                            className="w-full"
                            onClick={handleSignOut}
                            disabled={signingOut}
                        >
                            {signingOut ? 'Signing out...' : 'Sign Out'}
                        </Button>
                        <Button
                            variant="ghost"
                            className="w-full text-muted-foreground"
                            asChild
                        >
                            <a href="mailto:support@bookvault.com">Contact Support</a>
                        </Button>
                    </div>
                </CardContent>
            </Card>

            {/* Footer */}
            <p className="mt-8 text-xs text-muted-foreground text-center">
                BookVault &middot; If you believe this is a mistake, contact your system administrator.
            </p>
        </div>
    )
}
