import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  experimental: {
    // Going back to a tab seen in the last 30 seconds shows it at once instead of
    // asking the server again. revalidatePath() in a save, or router.refresh(), clears it.
    staleTimes: { dynamic: 30 },
  },
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
