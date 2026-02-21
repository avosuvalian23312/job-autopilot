import React from "react";
import { Zap } from "lucide-react";

export default function FooterSection() {
  return (
    <footer className="border-t border-white/5 py-12 px-4">
      <div className="max-w-6xl mx-auto">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-8 mb-12">
          <div className="col-span-2 md:col-span-1">
            <div className="flex items-center gap-2 mb-4">
              <div className="grid h-8 w-8 place-items-center rounded-lg border border-cyan-300/35 bg-gradient-to-br from-cyan-400/95 to-teal-400/85 shadow-[inset_0_1px_0_rgba(255,255,255,0.45),0_10px_26px_rgba(6,182,212,0.32)]">
                <Zap className="h-4 w-4 text-slate-950" />
              </div>
              <span className="font-bold text-white">Job Autopilot</span>
            </div>
            <p className="text-sm text-white/30 leading-relaxed">
              AI-powered job application assistant. Land interviews faster.
            </p>
          </div>
          <div>
            <h4 className="text-sm font-medium text-white/60 mb-4">Product</h4>
            <ul className="space-y-2 text-sm text-white/30">
              <li className="hover:text-white/50 cursor-pointer transition-colors">Features</li>
              <li className="hover:text-white/50 cursor-pointer transition-colors">Pricing</li>
              <li className="hover:text-white/50 cursor-pointer transition-colors">Changelog</li>
              <li className="hover:text-white/50 cursor-pointer transition-colors">Roadmap</li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium text-white/60 mb-4">Company</h4>
            <ul className="space-y-2 text-sm text-white/30">
              <li className="hover:text-white/50 cursor-pointer transition-colors">About</li>
              <li className="hover:text-white/50 cursor-pointer transition-colors">Blog</li>
              <li className="hover:text-white/50 cursor-pointer transition-colors">Careers</li>
              <li className="hover:text-white/50 cursor-pointer transition-colors">Contact</li>
            </ul>
          </div>
          <div>
            <h4 className="text-sm font-medium text-white/60 mb-4">Legal</h4>
            <ul className="space-y-2 text-sm text-white/30">
              <li className="hover:text-white/50 cursor-pointer transition-colors">Privacy</li>
              <li className="hover:text-white/50 cursor-pointer transition-colors">Terms</li>
              <li className="hover:text-white/50 cursor-pointer transition-colors">Security</li>
            </ul>
          </div>
        </div>
        <div className="border-t border-white/5 pt-8 flex flex-col md:flex-row items-center justify-between text-xs text-white/20">
          <span>© 2026 Job Autopilot. All rights reserved.</span>
          <span className="mt-2 md:mt-0">Crafted with AI for humans who want great careers.</span>
        </div>
      </div>
    </footer>
  );
}
