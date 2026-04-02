import AccessDenied from '@/components/common/AccessDenied';

export const dynamic = 'force-dynamic';

export default async function ForbiddenPage({ searchParams }) {
  const { returnTo, returnLabel, message } = await searchParams;

  return (
    <AccessDenied
      message={message || 'You do not have permission to access this page.'}
      returnTo={returnTo || '/app'}
      returnLabel={returnLabel || 'Back'}
    />
  );
}
