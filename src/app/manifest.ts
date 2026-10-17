import type { MetadataRoute } from "next";

/** Lets customers "Add to Home screen" — the site then opens like an app. */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Salad Stories",
    short_name: "Salad Stories",
    description: "Order fresh, protein-focused salads and bowls in Chennai.",
    start_url: "/menu?source=homescreen",
    scope: "/",
    display: "standalone",
    background_color: "#fffdf7",
    theme_color: "#1f6b3a",
    categories: ["food", "shopping", "health"],
    icons: [
      { src: "/icon-192.png", sizes: "192x192", type: "image/png" },
      { src: "/icon-512.png", sizes: "512x512", type: "image/png" },
      { src: "/icon-maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    shortcuts: [
      { name: "Menu", url: "/menu" },
      { name: "My orders", url: "/account#orders" },
    ],
  };
}
