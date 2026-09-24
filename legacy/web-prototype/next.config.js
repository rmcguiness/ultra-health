/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Increase timeout for large file processing
  api: {
    responseLimit: false,
  },
}

module.exports = nextConfig

