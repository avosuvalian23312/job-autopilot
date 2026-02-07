import React, { useState } from "react";
import { Target, TrendingUp, MessageSquare, Trophy } from "lucide-react";
import { Slider } from "@/components/ui/slider";

export default function GoalProgress({ applicationCount = 12 }) {
  const [goal, setGoal] = useState(100);
  const progress = Math.min((applicationCount / goal) * 100, 100);
  const circumference = 2 * Math.PI * 52;
  const offset = circumference - (progress / 100) * circumference;

  const stats = [
    { label: "Applied", value: applicationCount, icon: Target, color: "text-purple-400" },
    { label: "Interviews", value: 5, icon: MessageSquare, color: "text-cyan-400" },
    { label: "Offers", value: 2, icon: Trophy, color: "text-emerald-400" },
  ];

  return (
    <div className="glass-card rounded-2xl p-6">
      <div className="flex items-center gap-2 mb-6">
        <TrendingUp className="w-4 h-4 text-purple-400" />
        <h3 className="text-sm font-medium text-white/70">Goal Progress</h3>
      </div>

      <div className="flex justify-center mb-6">
        <div className="relative">
          <svg width="128" height="128" className="-rotate-90">
            <circle cx="64" cy="64" r="52" fill="none" stroke="hsl(240,10%,12%)" strokeWidth="8" />
            <circle
              cx="64" cy="64" r="52" fill="none"
              stroke="url(#gradient)"
              strokeWidth="8"
              strokeLinecap="round"
              strokeDasharray={circumference}
              strokeDashoffset={offset}
              className="transition-all duration-700 ease-out"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#8b5cf6" />
                <stop offset="100%" stopColor="#06b6d4" />
              </linearGradient>
            </defs>
          </svg>
          <div className="absolute inset-0 flex flex-col items-center justify-center">
            <span className="text-2xl font-bold text-white">{Math.round(progress)}%</span>
            <span className="text-[10px] text-white/30">{applicationCount}/{goal}</span>
          </div>
        </div>
      </div>

      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/40">Goal</span>
          <span className="text-xs text-white/60 font-medium">{goal} applications</span>
        </div>
        <Slider
          value={[goal]}
          onValueChange={([v]) => setGoal(v)}
          min={10}
          max={500}
          step={10}
          className="[&_[role=slider]]:bg-purple-500 [&_[role=slider]]:border-purple-500 [&_.bg-primary]:bg-purple-500"
        />
      </div>

      <div className="space-y-3">
        {stats.map((s) => (
          <div key={s.label} className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <s.icon className={`w-3.5 h-3.5 ${s.color}`} />
              <span className="text-xs text-white/50">{s.label}</span>
            </div>
            <span className="text-sm font-semibold text-white">{s.value}</span>
          </div>
        ))}
      </div>
    </div>
  );
}