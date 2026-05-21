/** @type {import('next').NextConfig} */
const nextConfig = {
  // Izinkan koneksi ke backend lokal
  async rewrites() {
    return [
      {
        source: '/api/:path*',
        destination: 'http://localhost:3000/api/:path*',
      },
    ];
  },
};

export default nextConfig;
