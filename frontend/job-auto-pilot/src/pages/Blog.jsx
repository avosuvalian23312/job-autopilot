import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Rocket, Calendar, ArrowRight, BookOpen } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const posts = [
  {
    title: "How to Write ATS-Friendly Resume Bullets",
    excerpt: "Learn the exact formula to pass applicant tracking systems and land more interviews.",
    date: "Feb 5, 2026",
    readTime: "5 min read",
    category: "Resume Tips"
  },
  {
    title: "The Ultimate Job Application Tracker Template",
    excerpt: "Stay organized during your job search with our proven tracking system.",
    date: "Feb 1, 2026",
    readTime: "7 min read",
    category: "Productivity"
  },
  {
    title: "Why AI-Generated Cover Letters Work Better",
    excerpt: "Data shows AI-tailored applications get 3.2x more callbacks. Here's why.",
    date: "Jan 28, 2026",
    readTime: "6 min read",
    category: "AI Insights"
  },
];

export default function Blog() {
  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <header className="border-b border-white/5 bg-[hsl(240,10%,4%)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to={createPageUrl("Landing")} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg">Job Autopilot</span>
          </Link>
          <Link to={createPageUrl("Landing")}>
            <Button className="bg-purple-600 hover:bg-purple-500 text-white text-sm font-medium px-5 py-2 rounded-lg">
              Back to Home
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-16 md:py-24">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="text-center mb-16"
        >
          <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full bg-purple-500/10 border border-purple-500/20 text-purple-400 text-sm mb-6">
            <BookOpen className="w-4 h-4" />
            <span>Career Insights</span>
          </div>
          <h1 className="text-4xl md:text-5xl font-bold text-white mb-4">
            Job Search Resources & Insights
          </h1>
          <p className="text-lg text-white/40 max-w-2xl mx-auto">
            Expert advice, data-driven strategies, and proven tactics to accelerate your job search
          </p>
        </motion.div>

        <div className="space-y-6">
          {posts.map((post, i) => (
            <motion.div
              key={i}
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ delay: i * 0.1 }}
              className="glass-card rounded-2xl p-8 hover:bg-white/[0.04] transition-all cursor-pointer group"
            >
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 mb-4">
                <div className="inline-flex items-center gap-2 px-3 py-1 rounded-lg bg-purple-500/10 text-purple-400 text-xs font-medium w-fit">
                  {post.category}
                </div>
                <div className="flex items-center gap-4 text-xs text-white/30">
                  <span className="flex items-center gap-1">
                    <Calendar className="w-3 h-3" />
                    {post.date}
                  </span>
                  <span>{post.readTime}</span>
                </div>
              </div>
              <h2 className="text-2xl font-bold text-white mb-3 group-hover:text-purple-400 transition-colors">
                {post.title}
              </h2>
              <p className="text-white/50 leading-relaxed mb-4">{post.excerpt}</p>
              <div className="flex items-center gap-2 text-purple-400 text-sm font-medium">
                Read article
                <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
              </div>
            </motion.div>
          ))}
        </div>
      </div>
    </div>
  );
}