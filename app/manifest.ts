import type { MetadataRoute } from "next";

// Home-screen install. Colors are the kit's ground (--wjerk-white).
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Wjaffle",
    short_name: "Wjaffle",
    description: "Take a picture. Get recipes.",
    start_url: "/",
    display: "standalone",
    background_color: "#F8FAE7",
    theme_color: "#F8FAE7",
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
  };
}
