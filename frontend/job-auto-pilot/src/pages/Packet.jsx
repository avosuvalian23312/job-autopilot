import React, { useEffect, useState } from "react";
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

  // Button/API loading states (for any button that hits an API)
  const [isResumeApiLoading, setIsResumeApiLoading] = useState(false);
  const [isBothApiLoading, setIsBothApiLoading] = useState(false);

  const isAnyApiActionLoading = isResumeApiLoading || isBothApiLoading;

  // ---------------------------
  // API helper (SWA cookies + safe JSON + status)
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

  const openUrlDownload = (url) => {
    // best cross-origin behavior for SAS links
    const a = document.createElement("a");
    a.href = url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    document.body.appendChild(a);
    a.click();
    a.remove();
  };

  const getResumeSas = async (resumeId) => {
    // expects: { ok: true, url, fileName, expiresInSeconds }
    return await apiFetch(
      `/api/resume/sas?resumeId=${encodeURIComponent(resumeId)}`,
      { method: "GET" }
    );
  };

  // ---------------------------
  // Main load logic:
  // - mode=prepare => show cached prepare result (no polling)
  // - else => old polling /api/jobs/:jobId
  // ---------------------------
  useEffect(() => {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = String(urlParams.get("mode") || "").toLowerCase();

    const idParam = urlParams.get("id") || "";
    const jobId = idParam || localStorage.getItem("latestJobId") || "";

    // prepare cache
    let prepareCache = null;
    try {
      prepareCache = JSON.parse(
        localStorage.getItem("latestPrepareResult") || "null"
      );
    } catch {
      prepareCache = null;
    }

    // Detect prepare-mode automatically if the "id" is actually a doc id
    const looksLikeDocId =
      typeof jobId === "string" &&
      (jobId.startsWith("cl:") || jobId.startsWith("resume:"));

    const shouldUsePrepare = mode === "prepare" || looksLikeDocId;

    if (shouldUsePrepare) {
      if (
        prepareCache?.ok &&
        (prepareCache?.tailoredResume || prepareCache?.coverLetter)
      ) {
        setPacketData({ ...prepareCache, __mode: "prepare" });
        setIsGenerating(false);
        return;
      }

      toast.error("No prepared packet found. Generate again.");
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

        if (e?.status === 401) return goLogin();

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

        // First try to read job
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
          // otherwise proceed
        }

        // Kick off generation
        try {
          await apiFetch(`/api/jobs/${encodeURIComponent(jobId)}/generate`, {
            method: "POST",
            body: JSON.stringify({}),
          });
        } catch (e) {
          if (e?.status === 401) return goLogin();
          if (e?.status !== 409 && e?.status !== 423) throw e; // already running is ok
        }

        poll();
      } catch (e) {
        console.error(e);
        if (e?.status === 401) return goLogin();
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
  // Button handlers
  // ---------------------------

  // Internal helper so "Download Both" can reuse without double-loading toggles
  const downloadResumeMaybeApi = async ({ manageLoading = true } = {}) => {
    const needsApi = packetData?.__mode === "prepare";

    try {
      if (manageLoading && needsApi) setIsResumeApiLoading(true);

      // PREPARE MODE => download PDF via SAS (API)
      if (needsApi) {
        const urlParams = new URLSearchParams(window.location.search);
        const resumeIdFromQs = urlParams.get("resumeId");

        const resumeId =
          resumeIdFromQs ||
          packetData?.tailoredResume?.id ||
          localStorage.getItem("latestTailoredResumeId") ||
          "";

        if (!resumeId) return toast.error("Missing resumeId");

        const sas = await getResumeSas(resumeId);
        if (!sas?.url) return toast.error("SAS URL missing");

        openUrlDownload(sas.url);
        toast.success("Opened resume PDF");
        return;
      }

      // OLD JOB MODE => text download (no API)
      const resume =
        packetData?.outputs?.resume || packetData?.outputs?.resumeBullets;
      downloadTextFile(resume?.fileName || "resume.txt", resume?.text || "");
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Resume download failed.");
    } finally {
      if (manageLoading && needsApi) setIsResumeApiLoading(false);
    }
  };

  const handleDownloadResume = async () => {
    await downloadResumeMaybeApi({ manageLoading: true });
  };

  const handleDownloadCoverLetter = () => {
    // PREPARE MODE => cover letter text
    if (packetData?.__mode === "prepare") {
      const text =
        packetData?.coverLetter?.text ||
        localStorage.getItem("latestCoverLetterText") ||
        "";
      return downloadTextFile("cover-letter.txt", text);
    }

    // OLD JOB MODE => cover letter text
    const cover = packetData?.outputs?.coverLetter;
    downloadTextFile(cover?.fileName || "cover-letter.txt", cover?.text || "");
  };

  const handleDownloadBoth = async () => {
    const resumeNeedsApi = packetData?.__mode === "prepare";

    try {
      if (resumeNeedsApi) setIsBothApiLoading(true);

      // Resume first (may hit API in prepare mode)
      await downloadResumeMaybeApi({ manageLoading: false });

      // Then cover letter (no API)
      handleDownloadCoverLetter();
    } finally {
      if (resumeNeedsApi) setIsBothApiLoading(false);
    }
  };

  const handleReturnHome = () => {
    navigate(createPageUrl("AppHome"));
  };

  // ---------------------------
  // UI
  // ---------------------------
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
            <h1 className="text-4xl font-bold text-white mb-3">
              Generating your packet…
            </h1>
            <p className="text-lg text-white/40">This can take a few seconds</p>
          </div>
        </div>
      </div>
    );
  }

  if (!packetData) return null;

  const resumeButtonBusy = isResumeApiLoading || isBothApiLoading;
  const bothButtonBusy = isBothApiLoading || isResumeApiLoading;

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

      <div className="max-w-3xl mx-auto px-4 py-16 flex flex-col justify-center min-h-[calc(100vh-4rem)] relative">
        {/* API-action loading overlay (blur + spinner) */}
        {isAnyApiActionLoading && (
          <div className="absolute inset-0 z-20 flex items-center justify-center">
            <div className="absolute inset-0 bg-black/35 backdrop-blur-sm rounded-3xl" />
            <div className="relative z-10 flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/10 border border-white/15 shadow-2xl">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
              <span className="text-white/85 text-sm font-medium">
                Preparing download…
              </span>
            </div>
          </div>
        )}

        {/* Content (slightly blurred + non-interactive while overlay is up) */}
        <div
          className={
            isAnyApiActionLoading
              ? "pointer-events-none select-none blur-[1px]"
              : ""
          }
          aria-busy={isAnyApiActionLoading}
        >
          <div className="text-center mb-12">
            <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-8">
              <CheckCircle2 className="w-12 h-12 text-green-400" />
            </div>
            <h1 className="text-5xl font-bold text-white mb-4">
              Your packet is ready
            </h1>
            <p className="text-xl text-white/40">
              Download your tailored documents below
            </p>
          </div>

          <div className="space-y-5">
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
              <Button
                onClick={handleDownloadResume}
                disabled={resumeButtonBusy}
                className="w-full py-8 bg-purple-600 hover:bg-purple-500 text-white text-xl font-bold rounded-2xl shadow-xl shadow-purple-600/20 hover:shadow-2xl hover:shadow-purple-600/30 transition-all hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100 disabled:hover:bg-purple-600"
              >
                {resumeButtonBusy ? (
                  <Loader2 className="w-6 h-6 mr-3 animate-spin" />
                ) : (
                  <FileText className="w-6 h-6 mr-3" />
                )}
                {resumeButtonBusy ? "Preparing…" : "Download Resume"}
              </Button>

              <Button
                onClick={handleDownloadCoverLetter}
                disabled={isAnyApiActionLoading}
                className="w-full py-8 bg-purple-600 hover:bg-purple-500 text-white text-xl font-bold rounded-2xl shadow-xl shadow-purple-600/20 hover:shadow-2xl hover:shadow-purple-600/30 transition-all hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100 disabled:hover:bg-purple-600"
              >
                <Download className="w-6 h-6 mr-3" />
                Download Cover Letter
              </Button>
            </div>

            <Button
              onClick={handleDownloadBoth}
              disabled={bothButtonBusy}
              className="w-full py-8 bg-white/10 hover:bg-white/15 text-white text-xl font-bold rounded-2xl border-2 border-white/20 hover:border-white/30 transition-all hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100"
            >
              {bothButtonBusy ? (
                <Loader2 className="w-6 h-6 mr-3 animate-spin" />
              ) : (
                <Download className="w-6 h-6 mr-3" />
              )}
              {bothButtonBusy ? "Preparing…" : "Download Both"}
            </Button>

            <div className="pt-6">
              <Button
                onClick={handleReturnHome}
                disabled={isAnyApiActionLoading}
                className="w-full py-8 bg-white/5 hover:bg-white/10 text-white text-xl font-bold rounded-2xl transition-all hover:scale-[1.02] disabled:opacity-70 disabled:hover:scale-100"
              >
                <ArrowLeft className="w-5 h-5 mr-3" />
                Return to Home
              </Button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
