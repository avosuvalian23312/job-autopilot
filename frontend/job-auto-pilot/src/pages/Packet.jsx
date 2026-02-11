import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Rocket, Download, CheckCircle2, ArrowLeft, FileText, Loader2 } from "lucide-react";
import { toast } from "sonner";

export default function Packet() {
  const navigate = useNavigate();
  const [packetData, setPacketData] = useState(null);
  const [isGenerating, setIsGenerating] = useState(true);

 useEffect(() => {
  const jobId = localStorage.getItem("latestJobId");

  if (!jobId) {
    navigate(createPageUrl("AppHome"));
    return;
  }

  let cancelled = false;
  let timer = null;

  const readJsonSafe = async (res) => {
    const text = await res.text().catch(() => "");
    if (!text) return null;
    try {
      return JSON.parse(text);
    } catch {
      return { raw: text };
    }
  };

  const run = async () => {
    try {
      setIsGenerating(true);

      // ✅ Kick off generation (SWA cookies required)
      const startRes = await fetch(`/api/jobs/${encodeURIComponent(jobId)}/generate`, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
      });

      if (!startRes.ok) {
        const data = await readJsonSafe(startRes);
        const msg = data?.error || data?.raw || `Generation start failed (${startRes.status})`;

        // ✅ if session expired, send them to login
        if (startRes.status === 401) {
          toast.error("Session expired, please log in.");
          navigate("/login"); // or createPageUrl("Login") if you have it
          return;
        }

        throw new Error(msg);
      }

      // ✅ Poll job (NO userId query param, cookies included)
      const poll = async () => {
        if (cancelled) return;

        const r = await fetch(`/api/jobs/${encodeURIComponent(jobId)}`, {
          method: "GET",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
        });

        if (!r.ok) {
          const data = await readJsonSafe(r);
          const msg = data?.error || data?.raw || `Status request failed (${r.status})`;

          if (r.status === 401) {
            toast.error("Session expired, please log in.");
            navigate("/login");
            return;
          }

          throw new Error(msg);
        }

        const payload = await r.json().catch(() => null);
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
      };

      poll();
    } catch (e) {
      console.error(e);
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


  // ✅ Real downloads (for now: downloads as .txt from the saved job outputs)
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

  const handleDownloadResume = () => {
    const resume = packetData?.outputs?.resume;
    downloadTextFile(resume?.fileName || "resume.txt", resume?.text || "");
  };

  const handleDownloadCoverLetter = () => {
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

  // Show generating state (keeps your style, not a redesign)
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
