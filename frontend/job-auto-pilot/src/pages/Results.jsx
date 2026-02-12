import React, { useState, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import AppNav from "@/components/app/AppNav";
import { Button } from "@/components/ui/button";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import {
  ArrowLeft,
  Copy,
  Download,
  FileText,
  CheckCircle2,
  Loader2,
  Sparkles,
  BookmarkPlus,
} from "lucide-react";
import { toast } from "sonner";

export default function Results() {
  const navigate = useNavigate();
  const urlParams = new URLSearchParams(window.location.search);
  const id = urlParams.get("id");

  const [copied, setCopied] = useState(null);
  const [application, setApplication] = useState(null);
  const [isLoading, setIsLoading] = useState(true);

  const apiFetch = async (path, options = {}) => {
    const res = await fetch(path, {
      ...options,
      credentials: "include",
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    const text = await res.text().catch(() => "");
    let data = null;
    try {
      data = text ? JSON.parse(text) : null;
    } catch {
      data = { raw: text };
    }

    if (!res.ok) {
      const msg =
        data?.error ||
        data?.message ||
        data?.detail ||
        (typeof data?.raw === "string" ? data.raw : "") ||
        text ||
        `Request failed (${res.status})`;

      const err = new Error(msg);
      err.status = res.status;
      err.data = data;
      throw err;
    }

    return data;
  };

  const normalizeJobToApplication = (job) => {
    const outputs = job?.outputs || {};
    const coverObj =
      outputs?.coverLetter || outputs?.cover_letter || job?.coverLetter || job?.cover_letter || {};
    const resumeObj =
      outputs?.resumeBullets ||
      outputs?.resume_bullets ||
      outputs?.resume ||
      job?.resumeBullets ||
      job?.resume_bullets ||
      job?.resume ||
      {};

    const jobTitle = job?.jobTitle || job?.job_title || job?.title || "Job";
    const company = job?.company || job?.company_name || "Company";

    const coverText =
      typeof coverObj?.text === "string"
        ? coverObj.text
        : typeof job?.cover_letter === "string"
        ? job.cover_letter
        : "";

    const resumeText =
      typeof resumeObj?.text === "string"
        ? resumeObj.text
        : typeof job?.resume_bullets === "string"
        ? job.resume_bullets
        : "";

    return {
      job_title: jobTitle,
      company,
      status: job?.status || job?.state || "unknown",
      job_link: job?.jobLink || job?.job_link || job?.website || job?.link || null,
      cover_letter: coverText,
      resume_bullets: resumeText,
      __outputs: {
        cover: coverObj,
        resume: resumeObj,
      },
      __rawJob: job,
    };
  };

  useEffect(() => {
    let cancelled = false;

    const run = async () => {
      if (!id) {
        setIsLoading(false);
        setApplication(null);
        return;
      }

      setIsLoading(true);

      try {
        const payload = await apiFetch(`/api/jobs/${encodeURIComponent(id)}`, {
          method: "GET",
        });

        const job = payload?.job || payload;
        if (!job) throw new Error("Missing job payload");

        // ✅ If not ready, send them to Packet page (which handles generate+poll)
        if (job.status && job.status !== "completed") {
          navigate(`/packet?id=${encodeURIComponent(id)}`);
          return;
        }

        const normalized = normalizeJobToApplication(job);

        if (!cancelled) {
          setApplication(normalized);
          setIsLoading(false);
        }
      } catch (e) {
        console.error(e);

        if (e?.status === 401) {
          toast.error("Session expired, please log in.");
          navigate("/login");
          return;
        }

        if (!cancelled) {
          setApplication(null);
          setIsLoading(false);
        }
      }
    };

    run();

    return () => {
      cancelled = true;
    };
  }, [id, navigate]);

  const handleCopy = (text, type) => {
    const t = String(text || "");
    if (!t.trim()) return toast.error("Nothing to copy yet");
    navigator.clipboard.writeText(t);
    setCopied(type);
    toast.success(`${type} copied to clipboard`);
    setTimeout(() => setCopied(null), 2000);
  };

  const handleDownload = (text, filename) => {
    const t = String(text || "");
    if (!t.trim()) return toast.error("No document available");

    const blob = new Blob([t], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    toast.success("File downloaded");
  };

  if (isLoading) {
    return (
      <div className="min-h-screen bg-[hsl(240,10%,4%)]">
        <AppNav currentPage="AppHome" />
        <div className="flex items-center justify-center h-[70vh]">
          <Loader2 className="w-8 h-8 text-purple-500 animate-spin" />
        </div>
      </div>
    );
  }

  if (!application) {
    return (
      <div className="min-h-screen bg-[hsl(240,10%,4%)]">
        <AppNav currentPage="AppHome" />
        <div className="flex flex-col items-center justify-center h-[70vh] text-center">
          <FileText className="w-12 h-12 text-white/20 mb-4" />
          <h2 className="text-xl font-semibold text-white mb-2">Result not found</h2>
          <p className="text-white/40 mb-6">This application may have been removed.</p>
          <Link to={createPageUrl("AppHome")}>
            <Button className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-6">
              Go back home
            </Button>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <AppNav currentPage="AppHome" />
      <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Link to={createPageUrl("AppHome")}>
            <Button
              variant="ghost"
              size="icon"
              className="text-white/40 hover:text-white hover:bg-white/5 rounded-xl"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-white">{application.job_title}</h1>
            <p className="text-white/40 text-sm">{application.company}</p>
          </div>
          <div className="ml-auto hidden sm:flex items-center gap-2">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-emerald-500/10 text-emerald-400 text-xs font-medium">
              <CheckCircle2 className="w-3.5 h-3.5" />
              Generated
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Main content */}
          <div className="lg:col-span-2">
            <Tabs defaultValue="cover_letter" className="w-full">
              <TabsList className="bg-white/5 border border-white/5 rounded-xl p-1 mb-6">
                <TabsTrigger
                  value="cover_letter"
                  className="rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white text-white/50 px-6"
                >
                  Cover Letter
                </TabsTrigger>
                <TabsTrigger
                  value="resume_bullets"
                  className="rounded-lg data-[state=active]:bg-purple-600 data-[state=active]:text-white text-white/50 px-6"
                >
                  Resume Bullets
                </TabsTrigger>
              </TabsList>

              <TabsContent value="cover_letter">
                <div className="glass-card rounded-2xl p-6 md:p-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium text-white/60">AI-Generated Cover Letter</span>
                  </div>
                  <div className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap font-light">
                    {application.cover_letter}
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="resume_bullets">
                <div className="glass-card rounded-2xl p-6 md:p-8">
                  <div className="flex items-center gap-2 mb-4">
                    <Sparkles className="w-4 h-4 text-purple-400" />
                    <span className="text-sm font-medium text-white/60">AI-Generated Resume Bullets</span>
                  </div>
                  <div className="text-white/80 text-sm leading-relaxed whitespace-pre-wrap font-light">
                    {application.resume_bullets}
                  </div>
                </div>
              </TabsContent>
            </Tabs>
          </div>

          {/* Action sidebar */}
          <div className="space-y-4">
            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-medium text-white/60 mb-4">Quick Actions</h3>
              <div className="space-y-3">
                <Button
                  onClick={() => handleCopy(application.cover_letter, "Cover letter")}
                  className="w-full justify-start bg-white/5 hover:bg-white/10 text-white/70 rounded-xl py-5 border border-white/5"
                >
                  {copied === "Cover letter" ? (
                    <CheckCircle2 className="w-4 h-4 mr-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 mr-3" />
                  )}
                  Copy Cover Letter
                </Button>
                <Button
                  onClick={() => handleCopy(application.resume_bullets, "Resume bullets")}
                  className="w-full justify-start bg-white/5 hover:bg-white/10 text-white/70 rounded-xl py-5 border border-white/5"
                >
                  {copied === "Resume bullets" ? (
                    <CheckCircle2 className="w-4 h-4 mr-3 text-emerald-400" />
                  ) : (
                    <Copy className="w-4 h-4 mr-3" />
                  )}
                  Copy Resume Bullets
                </Button>
                <div className="border-t border-white/5 pt-3">
                  <Button
                    onClick={() =>
                      handleDownload(application.cover_letter, `${application.company}_cover_letter.txt`)
                    }
                    className="w-full justify-start bg-white/5 hover:bg-white/10 text-white/70 rounded-xl py-5 border border-white/5"
                  >
                    <Download className="w-4 h-4 mr-3" />
                    Download .txt
                  </Button>
                </div>
                <Button
                  onClick={() =>
                    handleDownload(application.cover_letter, `${application.company}_cover_letter.docx`)
                  }
                  className="w-full justify-start bg-white/5 hover:bg-white/10 text-white/70 rounded-xl py-5 border border-white/5"
                >
                  <Download className="w-4 h-4 mr-3" />
                  Download .docx
                </Button>
              </div>
            </div>

            <div className="glass-card rounded-2xl p-6">
              <h3 className="text-sm font-medium text-white/60 mb-4">Application Info</h3>
              <div className="space-y-3 text-sm">
                <div className="flex justify-between">
                  <span className="text-white/30">Job Title</span>
                  <span className="text-white/70 font-medium">{application.job_title}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/30">Company</span>
                  <span className="text-white/70 font-medium">{application.company}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-white/30">Status</span>
                  <span className="text-purple-400 font-medium capitalize">{application.status}</span>
                </div>
                {application.job_link && (
                  <a
                    href={application.job_link}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-purple-400 hover:text-purple-300 text-xs underline block"
                  >
                    View original posting →
                  </a>
                )}
              </div>
            </div>




            <Link to={createPageUrl("Applications")}>
              <Button className="w-full py-5 bg-purple-600 hover:bg-purple-500 text-white rounded-xl">
                <BookmarkPlus className="w-4 h-4 mr-2" />
                View All Applications
              </Button>
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
