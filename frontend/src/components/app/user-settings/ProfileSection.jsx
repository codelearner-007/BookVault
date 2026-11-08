'use client';

import { useState, useEffect } from 'react';
import Image from 'next/image';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  CardDescription,
} from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { useGlobal } from '@/lib/context/GlobalContext';
import { useUser } from '@/lib/hooks/useUser';
import { ProfileForm } from '@/components/forms/user/ProfileForm';
import {
  CheckCircle,
  Edit2,
} from 'lucide-react';

export function ProfileSection() {
  const { user, refreshUser } = useGlobal();
  const { profile, fetchProfile, updateProfile, loading } = useUser();
  const [isEditing, setIsEditing] = useState(false);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    fetchProfile();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleSubmit = async (data) => {
    const result = await updateProfile(data);
    if (result.success) {
      setSuccess(true);
      setIsEditing(false);
      setTimeout(() => setSuccess(false), 5000);
      await refreshUser();
    }
  };

  const handleCancel = () => {
    setIsEditing(false);
  };

  const formatDate = (date) => {
    if (!date) return 'N/A';
    return new Date(date).toLocaleDateString('en-US', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  };

  const roleName = user?.app_metadata?.user_role;

  const isProfileLoading = loading && !profile;

  return (
    <div className="space-y-6">
      {success && (
        <Alert className="bg-ok-soft text-ok [&>svg]:text-ok">
          <CheckCircle />
          <AlertDescription>
            Profile updated successfully!
          </AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              {isProfileLoading ? (
                <Skeleton className="size-20 shrink-0 rounded-full" />
              ) : profile?.avatar_url ? (
                <Image
                  src={profile.avatar_url}
                  alt="Profile"
                  width={80}
                  height={80}
                  unoptimized
                  className="size-20 rounded-full border border-card-border object-cover"
                />
              ) : (
                <div className="flex size-20 shrink-0 items-center justify-center rounded-full bg-mono">
                  <span className="text-2xl font-semibold text-mono-foreground">
                    {user?.email ? user.email.charAt(0).toUpperCase() : '?'}
                  </span>
                </div>
              )}
              <div className="space-y-1">
                {isProfileLoading ? (
                  <>
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="mt-1 h-4 w-52" />
                    <Skeleton className="mt-2 h-pill w-16 rounded-full" />
                  </>
                ) : (
                  <>
                    <CardTitle className="text-lg">{profile?.full_name || 'Unnamed User'}</CardTitle>
                    <CardDescription className="mt-1">{user?.email}</CardDescription>
                    <div className="flex items-center gap-2 mt-2">
                      {roleName && (
                        <Badge variant="role" className="capitalize">
                          {roleName.replace('_', ' ')}
                        </Badge>
                      )}
                    </div>
                  </>
                )}
              </div>
            </div>
            {!isEditing && !isProfileLoading && (
              <Button variant="secondary" onClick={() => setIsEditing(true)}>
                <Edit2 />
                Edit Profile
              </Button>
            )}
          </div>
        </CardHeader>
        <CardContent>
          {isProfileLoading ? (
            <div className="grid gap-6 sm:grid-cols-2 pt-2">
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-4 w-36" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-4 w-48" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-20" />
                <Skeleton className="h-4 w-28" />
              </div>
              <div className="space-y-1.5">
                <Skeleton className="h-3.5 w-24" />
                <Skeleton className="h-4 w-32" />
              </div>
              <div className="space-y-1.5 sm:col-span-2">
                <Skeleton className="h-3.5 w-14" />
                <Skeleton className="h-8 w-72" />
              </div>
            </div>
          ) : isEditing ? (
            <div className="max-w-prose border-t border-border pt-4">
              <ProfileForm
                defaultValues={{
                  full_name: profile?.full_name || '',
                  avatar_url: profile?.avatar_url || '',
                  department: profile?.department || '',
                }}
                onSubmit={handleSubmit}
                onCancel={handleCancel}
                loading={loading}
              />
            </div>
          ) : (
            <div className="grid gap-6 sm:grid-cols-2 pt-2">
              <div className="space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Full Name</div>
                <div className="text-sm font-medium">{profile?.full_name || 'Not set'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Email Address</div>
                <div className="text-sm font-medium">{user?.email || 'Not set'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Department</div>
                <div className="text-sm font-medium">{profile?.department || 'Not set'}</div>
              </div>
              <div className="space-y-1">
                <div className="text-sm font-medium text-muted-foreground">Member Since</div>
                <div className="text-sm font-medium">{formatDate(user?.registered_at)}</div>
              </div>
              <div className="space-y-1 sm:col-span-2">
                <div className="text-sm font-medium text-muted-foreground">User ID</div>
                <div className="inline-block rounded-control bg-muted p-2 font-mono text-sm">
                  {user?.id || 'N/A'}
                </div>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
