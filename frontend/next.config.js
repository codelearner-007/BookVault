const nextConfig = {
  // Agent/test servers set NEXT_DIST_DIR (e.g. .next-agent) so they never lock the dev server's .next folder.
  distDir: process.env.NEXT_DIST_DIR || '.next',
  reactStrictMode: true,
  output: "standalone",

  images: {
    remotePatterns: [
      {
        protocol: 'https',
        hostname: 'oakcwujixfakldsuryqx.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },

  // The old Platform area now lives in the Admin Panel tab of the one admin interface.
  async redirects() {
    return [
      { source: "/super-admin/profile", destination: "/admin/profile", permanent: true },
      { source: "/super-admin", destination: "/admin/panel", permanent: true },
      { source: "/super-admin/:path*", destination: "/admin/panel/:path*", permanent: true },
    ];
  },

  async rewrites() {
    // FastAPI backend URL
    const apiUrl =
      process.env.NEXT_PUBLIC_API_URL || "http://127.0.0.1:8000";

    return [
      {
        source: "/api/v1/:path*",
        destination: `${apiUrl}/api/v1/:path*`,
      },
    ];
  },
};

export default nextConfig;
