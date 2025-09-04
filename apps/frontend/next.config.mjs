/** @type {import('next').NextConfig} */
const nextConfig = {
reactStrictMode: true,
typescript: { ignoreBuildErrors: process.env.CI ? false : true },
eslint: { ignoreDuringBuilds: process.env.CI ? false : true },
};
export default nextConfig;