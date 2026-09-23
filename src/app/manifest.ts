import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Walker App",
    short_name: "Walker",
    description: "Run your dog walking business from one place.",
    start_url: "/?source=home-screen",
    scope: "/",
    display: "standalone",
    background_color: "#fafaf7",
    theme_color: "#2f7d5b",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
