import React, { useState } from "react";
import { useEffect, useState as useReactState } from "react";
import AppNav from "@/components/app/AppNav";
import ApplicationCard from "@/components/app/ApplicationCard";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Search, FileText, Building2, Calendar, Sparkles } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { format } from "date-fns";
import { motion } from "framer-motion";

export default function Applications() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState(null);
  const [applications, setApplications] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    // Mock data with more entries
    setApplications([
      { id: 1, job_title: "Senior Frontend Engineer", company: "Stripe", status: "interview", created_date: "2026-02-01" },
      { id: 2, job_title: "Staff Software Engineer", company: "Vercel", status: "applied", created_date: "2026-02-03" },
      { id: 3, job_title: "Engineering Manager", company: "Notion", status: "offer", created_date: "2026-01-28" },
      { id: 4, job_title: "Full Stack Developer", company: "Linear", status: "generated", created_date: "2026-02-05" },
      { id: 5, job_title: "Senior Product Engineer", company: "Figma", status: "rejected", created_date: "2026-01-25" },
      { id: 6, job_title: "Principal Engineer", company: "Datadog", status: "applied", created_date: "2026-02-02" },
      { id: 7, job_title: "Frontend Tech Lead", company: "Shopify", status: "interview", created_date: "2026-01-30" },
      { id: 8, job_title: "Backend Engineer", company: "Airbnb", status: "applied", created_date: "2026-01-20" },
      { id: 9, job_title: "DevOps Engineer", company: "GitHub", status: "interview", created_date: "2026-01-18" },
      { id: 10, job_title: "Senior Full Stack Engineer", company: "Atlassian", status: "generated", created_date: "2026-02-06" },
      { id: 11, job_title: "Software Engineer", company: "Twilio", status: "applied", created_date: "2026-01-15" },
      { id: 12, job_title: "Lead Frontend Developer", company: "Coinbase", status: "offer", created_date: "2026-01-22" },
      { id: 13, job_title: "Platform Engineer", company: "Heroku", status: "rejected", created_date: "2026-01-12" },
      { id: 14, job_title: "Senior Backend Engineer", company: "Spotify", status: "interview", created_date: "2026-01-26" },
      { id: 15, job_title: "Machine Learning Engineer", company: "OpenAI", status: "applied", created_date: "2026-02-04" },
      { id: 16, job_title: "iOS Developer", company: "Uber", status: "generated", created_date: "2026-02-07" },
      { id: 17, job_title: "Android Developer", company: "Lyft", status: "applied", created_date: "2026-01-29" },
      { id: 18, job_title: "Data Engineer", company: "Snowflake", status: "interview", created_date: "2026-01-24" },
      { id: 19, job_title: "Site Reliability Engineer", company: "Netflix", status: "offer", created_date: "2026-01-19" },
      { id: 20, job_title: "Security Engineer", company: "Cloudflare", status: "applied", created_date: "2026-01-16" },
      { id: 21, job_title: "Product Engineer", company: "Slack", status: "rejected", created_date: "2026-01-10" },
      { id: 22, job_title: "Senior Developer", company: "Square", status: "generated", created_date: "2026-02-01" },
      { id: 23, job_title: "Full Stack Engineer", company: "Discord", status: "applied", created_date: "2026-01-27" },
      { id: 24, job_title: "Frontend Architect", company: "Dropbox", status: "interview", created_date: "2026-01-23" },
      { id: 25, job_title: "Infrastructure Engineer", company: "Splunk", status: "applied", created_date: "2026-01-14" },
      { id: 26, job_title: "Senior DevOps Engineer", company: "Elastic", status: "offer", created_date: "2026-01-21" },
      { id: 27, job_title: "Technical Lead", company: "MongoDB", status: "interview", created_date: "2026-01-17" },
      { id: 28, job_title: "Software Development Engineer", company: "Salesforce", status: "generated", created_date: "2026-02-03" },
      { id: 29, job_title: "React Developer", company: "Meta", status: "applied", created_date: "2026-01-11" },
      { id: 30, job_title: "Cloud Engineer", company: "HashiCorp", status: "rejected", created_date: "2026-01-08" },
      { id: 31, job_title: "Senior Solutions Architect", company: "Adobe", status: "interview", created_date: "2026-01-31" },
      { id: 32, job_title: "QA Engineer", company: "Asana", status: "applied", created_date: "2026-01-13" },
      { id: 33, job_title: "Staff Engineer", company: "Zoom", status: "generated", created_date: "2026-02-02" },
      { id: 34, job_title: "Principal Software Engineer", company: "Okta", status: "offer", created_date: "2026-01-25" },
      { id: 35, job_title: "Backend Developer", company: "Auth0", status: "applied", created_date: "2026-01-09" },
    ]);
    setIsLoading(false);
  }, []);

  const updateStatus = (id, status) => {
    setApplications(prev => prev.map(app => app.id === id ? { ...app, status } : app));
  };

  const filtered = applications.filter((app) => {
    const matchesSearch =
      app.job_title?.toLowerCase().includes(search.toLowerCase()) ||
      app.company?.toLowerCase().includes(search.toLowerCase());
    const matchesStatus = statusFilter === "all" || app.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <AppNav currentPage="Applications" />
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
      >
        <div className="mb-8 text-center">
          <h1 className="text-2xl md:text-3xl font-bold text-white mb-3">Applications</h1>
          <div className="flex items-center justify-center gap-2">
            <div className="w-8 h-8 rounded-full bg-purple-600/20 border border-purple-500/30 flex items-center justify-center">
              <span className="text-sm font-bold text-purple-400">{applications.length}</span>
            </div>
            <span className="text-white/40 text-sm">total applications tracked</span>
          </div>
        </div>

        {/* Filters */}
        <div className="flex flex-col sm:flex-row gap-4 mb-8">
          <div className="relative flex-1 transition-all duration-200 hover:scale-[1.01]">
            <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-white/30" />
            <Input
              placeholder="Search by role or company…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="bg-white/[0.03] border-white/10 text-white placeholder:text-white/30 pl-12 py-6 rounded-xl text-base hover:bg-white/[0.05] hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-200"
            />
          </div>
          <div className="transition-all duration-200 hover:scale-[1.01]">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-48 bg-white/[0.03] border-white/10 text-white/70 rounded-xl py-6 text-base hover:bg-white/[0.05] hover:border-purple-500/40 hover:shadow-lg hover:shadow-purple-500/10 transition-all duration-200">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All Status</SelectItem>
                <SelectItem value="generated">Generated</SelectItem>
                <SelectItem value="applied">Applied</SelectItem>
                <SelectItem value="interview">Interview</SelectItem>
                <SelectItem value="offer">Offer</SelectItem>
                <SelectItem value="rejected">Rejected</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {/* Full-width list */}
        <div className="space-y-0 [&>*:nth-child(even)>div]:bg-white/[0.01]">
          {isLoading ? (
            Array(5).fill(0).map((_, i) => (
              <div key={i} className="glass-card rounded-xl p-6">
                <Skeleton className="h-5 w-64 bg-white/5 mb-3" />
                <Skeleton className="h-4 w-40 bg-white/5" />
              </div>
            ))
          ) : filtered.length === 0 ? (
            <div className="glass-card rounded-2xl p-16 text-center">
              <FileText className="w-14 h-14 text-white/10 mx-auto mb-4" />
              <p className="text-white/40 text-lg">No applications found</p>
            </div>
          ) : (
            filtered.map((app, index) => (
              <motion.div
                key={app.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: index * 0.03, duration: 0.2 }}
              >
                <ApplicationCard
                  application={app}
                  onStatusChange={updateStatus}
                />
              </motion.div>
            ))
          )}
        </div>
      </motion.div>
    </div>
  );
}