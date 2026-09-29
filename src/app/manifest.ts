import type { MetadataRoute } from "next"

// Lets students and staff install LICET Things on their phone's home screen.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "LICET Things — Department of CSE",
    short_name: "LICET Things",
    description: "Academic portal of the Department of Computer Science & Engineering, Loyola-ICAM College of Engineering and Technology",
    start_url: "/dashboard",
    scope: "/",
    display: "standalone",
    background_color: "#1A0C4E",
    theme_color: "#1A0C4E",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  }
}
