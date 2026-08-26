/** @type {import('next').NextConfig} */
const nextConfig = {
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
