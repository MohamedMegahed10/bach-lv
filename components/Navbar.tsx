"use client";

import Link from "next/link";
import { Zap } from "lucide-react";

export default function Navbar() {
  return (
    <nav className="w-full flex items-center justify-between px-6 py-4
                    bg-slate-900 border-b border-white/10 shrink-0 z-50">
      <div className="flex items-center gap-2">
        <Zap size={20} className="text-yellow-400" />
        <span className="font-bold text-white text-sm tracking-wide">
          AR Panel Detector
        </span>
      </div>
      <Link
        href="/scan"
        className="px-4 py-2 bg-red-500 hover:bg-red-600 text-white text-sm
                   font-semibold rounded-lg transition-colors"
      >
        Launch Scanner
      </Link>
    </nav>
  );
}
