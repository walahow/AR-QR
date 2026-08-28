/** @type {import('next').NextConfig} */
const nextConfig = {
  turbopack: {
    resolveAlias: {
      fs: { browser: "./lib/empty.js" },
    },
  },
  async headers() {
    return [
      {
        source: "/uploads/:path*.glb",
        headers: [{ key: "Content-Type", value: "model/gltf-binary" }],
      },
      {
        source: "/uploads/:path*.usdz",
        headers: [{ key: "Content-Type", value: "model/vnd.usdz+zip" }],
      },
    ];
  },
};

export default nextConfig;
