export default function Home() {
  return (
    <div className="min-h-screen bg-orange-50 flex items-center justify-center p-4">
      <div className="text-center">
        <div className="text-6xl mb-4">🍜</div>
        <h1 className="text-2xl font-bold text-gray-800 mb-2">Warung Order System</h1>
        <p className="text-gray-500 mb-6">Scan QR code di meja kamu untuk memesan</p>
        <a
          href="/meja/1"
          className="bg-orange-500 text-white px-6 py-3 rounded-full font-semibold hover:bg-orange-600 transition"
        >
          Coba Demo — Meja 1
        </a>
      </div>
    </div>
  );
}
