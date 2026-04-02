const nextConfig = {
  reactStrictMode: true,
  output: "standalone",

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
