import createNextIntlPlugin from "next-intl/plugin";

const withNextIntl = createNextIntlPlugin("./src/i18n/request.ts");

/** @type {import('next').NextConfig} */
const nextConfig = {
  output: "standalone",
  reactStrictMode: true,
  // Workspace-Pakete werden als TypeScript-Quellcode konsumiert.
  transpilePackages: ["@len-len/api-client"],
};

export default withNextIntl(nextConfig);
