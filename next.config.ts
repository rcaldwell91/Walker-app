import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Pets used to live at /dogs; old links (and old notifications) still work.
  async redirects() {
    return [
      { source: "/dogs/:id", destination: "/pets/:id", permanent: true },
      { source: "/my/dogs/:id", destination: "/my/pets/:id", permanent: true },
    ];
  },
  images: {
    remotePatterns: [
      { protocol: "https", hostname: "*.supabase.co", pathname: "/storage/v1/object/public/**" },
    ],
  },
};

export default nextConfig;
