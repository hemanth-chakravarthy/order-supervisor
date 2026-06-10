import Link from 'next/link';

export default function NotFound() {
  return (
    <div className="flex flex-col items-center justify-center min-h-[60vh] text-center font-mono-dev">
      <h2 className="text-sm font-black text-red-600 uppercase tracking-widest">404 // Resource Not Found</h2>
      <p className="text-[11px] text-[#9ca3af] mt-2 uppercase tracking-wider">The requested execution run or template was not found.</p>
      <Link
        href="/"
        className="mt-6 inline-block px-4 py-2 border border-[#0d0d0d] bg-[#0d0d0d] text-white text-xs font-bold hover:bg-[#1a1a1a] uppercase tracking-widest transition-all"
      >
        Return to Dashboard
      </Link>
    </div>
  );
}
