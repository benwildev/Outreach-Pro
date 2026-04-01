export default function DeniedPage() {
  return (
    <main className="flex min-h-screen flex-col items-center justify-center gap-6 p-8 bg-gradient-to-br from-slate-50 via-blue-50 to-indigo-50">
      <div className="bg-white rounded-2xl shadow-lg border border-red-100 px-10 py-12 flex flex-col items-center gap-4 max-w-sm w-full text-center">
        <div className="w-14 h-14 rounded-full bg-red-50 flex items-center justify-center mb-2">
          <svg
            className="w-8 h-8 text-red-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 9v2m0 4h.01M10.29 3.86L1.82 18a2 2 0 001.71 3h16.94a2 2 0 001.71-3L13.71 3.86a2 2 0 00-3.42 0z"
            />
          </svg>
        </div>
        <h1 className="text-2xl font-bold text-gray-900">Access Denied</h1>
        <p className="text-sm text-gray-500 leading-relaxed">
          Your IP address is not authorized to access this application. Please
          contact your administrator if you believe this is a mistake.
        </p>
        <div className="mt-2 px-3 py-1.5 rounded-lg bg-red-50 border border-red-100 text-xs text-red-600 font-semibold tracking-wide">
          403 Forbidden
        </div>
      </div>
    </main>
  );
}
