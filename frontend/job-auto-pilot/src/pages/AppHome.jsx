import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import AppNav from "@/components/app/AppNav";
import { Button } from "@/components/ui/button";
import { Plus, FileText, BarChart3, TrendingUp, Clock } from "lucide-react";
import { motion } from "framer-motion";

const CircularMetric = ({ value, label, color = "purple" }) => {
  const percentage = Math.min(value / 20 * 100, 100); // Max out at 20 for visual purposes
  const circumference = 2 * Math.PI * 45;
  const strokeDashoffset = circumference - (percentage / 100) * circumference;

  const colorClasses = {
    purple: { stroke: "stroke-purple-500", text: "text-purple-400", bg: "bg-purple-500/10" },
    cyan: { stroke: "stroke-cyan-500", text: "text-cyan-400", bg: "bg-cyan-500/10" },
    green: { stroke: "stroke-green-500", text: "text-green-400", bg: "bg-green-500/10" }
  };

  const colors = colorClasses[color];

  return (
    <div className="flex flex-col items-center">
      <div className="relative w-32 h-32">
        <svg className="w-32 h-32 transform -rotate-90">
          <circle
            cx="64"
            cy="64"
            r="45"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className="text-white/5"
          />
          <circle
            cx="64"
            cy="64"
            r="45"
            stroke="currentColor"
            strokeWidth="8"
            fill="none"
            className={colors.stroke}
            strokeDasharray={circumference}
            strokeDashoffset={strokeDashoffset}
            strokeLinecap="round"
            style={{ transition: "stroke-dashoffset 1s ease-out" }}
          />
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-3xl font-bold text-white">{value}</span>
        </div>
      </div>
      <p className="text-sm text-white/60 mt-3">{label}</p>
      <p className="text-xs text-white/30 mt-1">vs last week</p>
    </div>
  );
};

export default function AppHome() {
  const navigate = useNavigate();
  const [recentActivity] = useState([
    { id: 1, type: "job_added", text: "Added Software Engineer at Google", time: "2 hours ago" },
    { id: 2, type: "doc_generated", text: "Generated cover letter for Product Manager role", time: "5 hours ago" },
    { id: 3, type: "status_changed", text: "Application status updated to Interview", time: "1 day ago" },
    { id: 4, type: "job_added", text: "Added Senior Developer at Meta", time: "2 days ago" },
    { id: 5, type: "doc_generated", text: "Generated resume bullets for Designer position", time: "3 days ago" }
  ]);

  const handleNewJob = () => {
    navigate(createPageUrl("NewJob"));
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <AppNav currentPage="AppHome" />
      
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
      >
        {/* Header */}
        <div className="flex items-center justify-between mb-12">
          <h1 className="text-3xl font-bold text-white">Dashboard</h1>
        </div>

        {/* Main Hero Action */}
        <div className="max-w-4xl mx-auto mb-32">
          <button
            onClick={handleNewJob}
            className="relative w-full p-20 rounded-3xl bg-gradient-to-br from-purple-600/20 to-purple-600/5 border-2 border-purple-500/30 hover:border-purple-500/50 hover:shadow-2xl hover:shadow-purple-500/20 hover:-translate-y-2 transition-all group overflow-hidden"
          >
            <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/5 to-transparent animate-shimmer" style={{ backgroundSize: '200% 100%' }} />
            <div className="relative flex flex-col items-center gap-8">
              <div className="w-40 h-40 rounded-3xl bg-purple-600 flex items-center justify-center group-hover:scale-110 transition-transform shadow-2xl shadow-purple-500/40">
                <Plus className="w-20 h-20 text-white" />
              </div>
              <div>
                <h3 className="text-4xl font-bold text-white mb-4">New Job</h3>
                <p className="text-white/50 text-lg">Add a job and generate tailored documents</p>
              </div>
            </div>
          </button>
        </div>

        {/* Analytics Section - Below the fold */}
        <div className="max-w-5xl mx-auto mt-24">
          <div className="glass-card rounded-2xl p-12">
            <h2 className="text-2xl font-bold text-white mb-12 text-center">This Week</h2>
            
            <div className="grid grid-cols-1 md:grid-cols-3 gap-12">
              <CircularMetric value={12} label="Applications" color="purple" />
              <CircularMetric value={5} label="Interviews" color="cyan" />
              <CircularMetric value={2} label="Offers" color="green" />
            </div>
          </div>
        </div>

        {/* Recent Activity */}
        <div className="max-w-5xl mx-auto mt-12">
          <div className="glass-card rounded-2xl p-8">
          <div className="flex items-center justify-between mb-6">
            <h2 className="text-xl font-bold text-white">Recent Activity</h2>
            <Clock className="w-5 h-5 text-white/40" />
          </div>
          
          {recentActivity.length > 0 ? (
            <div className="space-y-4">
              {recentActivity.map((activity) => (
                <div
                  key={activity.id}
                  className="flex items-start gap-4 p-4 rounded-xl bg-white/5 hover:bg-white/10 transition-colors"
                >
                  <div className={`w-10 h-10 rounded-lg flex items-center justify-center ${
                    activity.type === "job_added" ? "bg-purple-500/10" :
                    activity.type === "doc_generated" ? "bg-cyan-500/10" :
                    "bg-green-500/10"
                  }`}>
                    {activity.type === "job_added" && <Plus className="w-5 h-5 text-purple-400" />}
                    {activity.type === "doc_generated" && <FileText className="w-5 h-5 text-cyan-400" />}
                    {activity.type === "status_changed" && <TrendingUp className="w-5 h-5 text-green-400" />}
                  </div>
                  <div className="flex-1">
                    <p className="text-sm text-white/80">{activity.text}</p>
                    <p className="text-xs text-white/40 mt-1">{activity.time}</p>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-center py-12">
              <p className="text-white/40 mb-4">No activity yet</p>
              <Button
                onClick={handleNewJob}
                className="bg-purple-600 hover:bg-purple-500 text-white"
              >
                <Plus className="w-4 h-4 mr-2" />
                Add Your First Job
              </Button>
            </div>
          )}
          </div>
          </div>
          </motion.div>
    </div>
  );
}