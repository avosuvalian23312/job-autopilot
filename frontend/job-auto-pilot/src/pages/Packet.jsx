import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import {
  Rocket,
  Download,
  CheckCircle2,
  ArrowLeft,
  FileText,
  Loader2,
} from "lucide-react";
import { toast } from "sonner";

export default function Packet() {
  const navigate = useNavigate();
  const [packetData, setPacketData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(true);

  // ---------------------------
  // API helper (SWA cookies + safe JSON)
  // ---------------------------
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

  // ---------------------------
  // Download helpers
  // ---------------------------
  const downloadTextFile = (filename, text) => {
    if (!text) return toast.error("No document available");

    const blob = new Blob([text], { type: "text/plain;charset=utf-8" });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = filename || "document.txt";
    document.body.appendChild(a);
    a.click();
    a.remove();

    URL.revokeObjectURL(url);
    toast.success("Downloaded");
  };

  const downloadPdfFromUrl = async (url, filename) => {
    if (!url) return toast.error("No PDF available");

    try {
      // Try to fetch as blob (best UX: forces download)
      const res = await fetch(url, { method: "GET" });
      if (!res.ok) throw new Error(`PDF download failed (${res.status})`);

      const blob = await res.blob();
      const objUrl = URL.createObjectURL(blob);

      const a = document.createElement("a");
      a.href = objUrl;
      a.download = filename || "resume.pdf";
      document.body.appendChild(a);
      a.click();
      a.remove();

      URL.revokeObjectURL(objUrl);
      toast.success("Downloaded");
    } catch (e) {
      // If storage CORS blocks fetch, fall back to opening in new tab
      console.error(e);
      window.open(url, "_blank", "noopener,noreferrer");
      toast.message("Opened PDF in a new tab (download from there).");
    }
  };

  // ---------------------------
  // Main logic
  // ---------------------------
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);

    // NEW: allow Packet to run in "prepare mode"
    const mode = (urlParams.get("mode") || "").toLowerCase();

    // Old job pipeline id
    const jobId = urlParams.get("id") || localStorage.getItem("latestJobId");

    // If you used /api/apply/prepare, store its result here
    const prepareCacheRaw = localStorage.getItem("latestPrepareResult");
    let prepareCache = null;
    try {
      prepareCache = prepareCacheRaw ? JSON.parse(prepareCacheRaw) : null;
    } catch {
      prepareCache = null;
    }

    // ✅ If we’re in prepare mode, show results immediately from cache
    if (mode === "prepare") {
      if (prepareCache?.ok && (prepareCache?.tailoredResume || prepareCache?.coverLetter)) {
        setPacketData({ ...prepareCache, __mode: "prepare" });
        setIsGenerating(false);
        return;
      }

      toast.error("No prepared packet found. Please run Prepare again.");
      navigate(createPageUrl("AppHome"));
      return;
    }

    // If jobId looks like a coverLetter/resume id, it's NOT a job id.
    // Instead of polling /api/jobs/cl:..., tell the user to use prepare mode.
    if (jobId && (jobId.startsWith("cl:") || jobId.startsWith("resume:"))) {
      if (prepareCache?.ok) {
        // auto-switch to prepare cache if available
        setPacketData({ ...prepareCache, __mode: "prepare" });
        setIsGenerating(false);
        return;
      }

      toast.error("This link is not a job packet. Please generate again.");
      navigate(createPageUrl("AppHome"));
      return;
    }

    if (!jobId) {
      navigate(createPageUrl("AppHome"));
      return;
    }

    let cancelled = false;
    let timer = null;

    const goLogin = () => {
      toast.error("Session expired, please log in.");
      navigate("/login");
    };

    const poll = async () => {
      if (cancelled) return;

      try {
        const payload = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
          method: "GET",
        });

        const job = payload?.job || payload;
        if (!job) throw new Error("Missing job payload");

        if (job.status === "completed") {
          setPacketData(job);
          setIsGenerating(false);
          return;
        }

        if (job.status === "failed") {
          toast.error("Generation failed.");
          setIsGenerating(false);
          return;
        }

        timer = setTimeout(poll, 1200);
      } catch (e) {
        console.error(e);

        if (e?.status === 401) {
          goLogin();
          return;
        }

        if (e?.status === 404) {
          toast.error("Job not found.");
          setIsGenerating(false);
          navigate(createPageUrl("AppHome"));
          return;
        }

        toast.error(e?.message || "Status request failed.");
        setIsGenerating(false);
      }
    };

    const run = async () => {
      try {
        setIsGenerating(true);

        // First try to read job — avoid re-generating if already completed
        try {
          const payload = await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
            method: "GET",
          });
          const job = payload?.job || payload;

          if (job?.status === "completed") {
            setPacketData(job);
            setIsGenerating(false);
            return;
          }

          if (job?.status === "failed") {
            toast.error("Generation failed.");
            setIsGenerating(false);
            return;
          }
        } catch (e) {
          if (e?.status === 401) return goLogin();
          if (e?.status === 404) {
            toast.error("Job not found.");
            navigate(createPageUrl("AppHome"));
            return;
          }
          // Otherwise proceed to kickoff
        }

        // Kick off generation (idempotent-friendly)
        try {
          await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/generate`, {
            method: "POST",
            body: JSON.stringify({}),
          });
        } catch (e) {
          if (e?.status === 401) return goLogin();
          if (e?.status !== 409 && e?.status !== 423) throw e;
        }

        poll();
      } catch (e) {
        console.error(e);
        if (e?.status === 401) {
          goLogin();
          return;
        }
        toast.error(e?.message || "Could not start generation.");
        setIsGenerating(false);
      }
    };

    run();

    return () => {
      cancelled = true;
      if (timer) clearTimeout(timer);
    };
  }, [navigate]);

  // ---------------------------
  // Download handlers (supports both modes)
  // ---------------------------
  const handleDownloadResume = () => {
    // Prepare mode: download PDF from blobUrl
    if (packetData?.__mode === "prepare") {
      const url = packetData?.tailoredResume?.blobUrl;
      const name = packetData?.tailoredResume?.name || "tailored_resume.pdf";
      return downloadPdfFromUrl(url, name);
    }

    // Old job mode: text downloads
    const resume = packetData?.outputs?.resume || packetData?.outputs?.resumeBullets;
    downloadTextFile(resume?.fileName || "resume.txt", resume?.text || "");
  };

  const handleDownloadCoverLetter = () => {
    // Prepare mode: cover letter is text
    if (packetData?.__mode === "prepare") {
      const text = packetData?.coverLetter?.text || "";
      const name = "cover-letter.txt";
      return downloadTextFile(name, text);
    }

    const cover = packetData?.outputs?.coverLetter;
    downloadTextFile(cover?.fileName || "cover-letter.txt", cover?.text || "");
  };

  const handleDownloadBoth = () => {
    handleDownloadResume();
    handleDownloadCoverLetter();
  };

  const handleReturnHome = () => {
    navigate(createPageUrl("AppHome"));
  };

  // Generating state (UI unchanged)
  if (isGenerating && !packetData) {
    return (
      <div className="min-h-screen bg-[hsl(240,10%,4%)]">
        <header className="border-b border-white/5 bg-[hsl(240,10%,4%)]/80 backdrop-blur-xl sticky top-0 z-50">
          <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
                <Rocket className="w-4 h-4 text-white" />
              </div>
              <span className="font-bold text-white text-lg">Job Autopilot</span>
            </div>
          </div>
        </header>

        <div className="max-w-3xl mx-auto px-4 py-16 flex flex-col justify-center min-h-[calc(100vh-4rem)]">
          <div className="text-center">
            <div className="w-24 h-24 rounded-full bg-purple-600/10 flex items-center justify-center mx-auto mb-8">
              <Loader2 className="w-12 h-12 text-purple-400 animate-spin" />
            </div>
            <h1 className="text-4xl font-bold text-white mb-3">Generating your packet…</h1>
            <p className="text-lg text-white/40">This can take a few seconds</p>
          </div>
        </div>
      </div>
    );
  }

  if (!packetData) return null;

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      {/* Header */}
      <header className="border-b border-white/5 bg-[hsl(240,10%,4%)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg">Job Autopilot</span>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-16 flex flex-col justify-center min-h-[calc(100vh-4rem)]">
        {/* Success State */}
        <div className="text-center mb-12">
          <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-12 h-12 text-green-400" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">Your packet is ready</h1>
          <p className="text-xl text-white/40">Download your tailored documents below</p>
        </div>

        {/* Download Buttons */}
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Button
              onClick={handleDownloadResume}
              className="w-full py-8 bg-purple-600 hover:bg-purple-500 text-white text-xl font-bold rounded-2xl shadow-xl shadow-purple-600/20 hover:shadow-2xl hover:shadow-purple-600/30 transition-all hover:scale-[1.02]"
            >
              <FileText className="w-6 h-6 mr-3" />
              Download Resume
            </Button>

            <Button
              onClick={handleDownloadCoverLetter}
              className="w-full py-8 bg-purple-600 hover:bg-purple-500 text-white text-xl font-bold rounded-2xl shadow-xl shadow-purple-600/20 hover:shadow-2xl hover:shadow-purple-600/30 transition-all hover:scale-[1.02]"
            >
              <Download className="w-6 h-6 mr-3" />
              Download Cover Letter
            </Button>
          </div>

          <Button
            onClick={handleDownloadBoth}
            className="w-full py-8 bg-white/10 hover:bg-white/15 text-white text-xl font-bold rounded-2xl border-2 border-white/20 hover:border-white/30 transition-all hover:scale-[1.02]"
          >
            <Download className="w-6 h-6 mr-3" />
            Download Both
          </Button>

          <div className="pt-6">
            <Button
              onClick={handleReturnHome}
              className="w-full py-8 bg-white/5 hover:bg-white/10 text-white text-xl font-bold rounded-2xl transition-all hover:scale-[1.02]"
            >
              <ArrowLeft className="w-5 h-5 mr-3" />
              Return to Home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
