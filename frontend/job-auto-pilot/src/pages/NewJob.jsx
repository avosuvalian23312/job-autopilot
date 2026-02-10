import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Rocket,
  Loader2,
  Sparkles,
  GraduationCap,
  Check,
  Edit2,
  Globe,
  MapPin,
  BarChart2,
  Tag,
  DollarSign,
  Percent,
  Briefcase,
  Building2,
  ShieldCheck,
  Clock,
} from "lucide-react";
import { toast } from "sonner";

export default function NewJob() {
  const navigate = useNavigate();
  const [selectedResume, setSelectedResume] = useState("");
  const [aiMode, setAiMode] = useState("standard");
  const [studentMode, setStudentMode] = useState(false);
  const [jobDescription, setJobDescription] = useState("");
  const [isAnalyzing, setIsAnalyzing] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [extractedData, setExtractedData] = useState(null);
  const [editMode, setEditMode] = useState(false);

  // ✅ NEW: resumes come from Cosmos (via backend) instead of localStorage
  const [resumes, setResumes] = useState([]);
  const [resumesLoading, setResumesLoading] = useState(true);

  // -----------------------------
  // API helper (SWA => Functions)
  // -----------------------------
  const apiFetch = async (path, options = {}) => {
    const res = await fetch(path, {
      ...options,
      headers: {
        "Content-Type": "application/json",
        ...(options.headers || {}),
      },
    });

    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const t = await res.text();
        if (t) msg = t;
      } catch {}
      throw new Error(msg);
    }

    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  // ✅ Load resumes from Cosmos
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setResumesLoading(true);

        const data = await apiFetch("/api/resume/list", { method: "GET" });
        const list = Array.isArray(data) ? data : data?.resumes || [];

        if (cancelled) return;

        setResumes(list);

        const defaultResume =
          list.find((r) => r?.isDefault === true) ||
          list.find((r) => r?.default === true) ||
          list.find((r) => r?.is_default === true) ||
          null;

        const pick = defaultResume || list[0] || null;
        if (pick?.id != null) setSelectedResume(String(pick.id));
      } catch (e) {
        if (cancelled) return;

        console.error(e);
        toast.error(
          "Could not load resumes from cloud. Falling back to local resumes."
        );

        const local = JSON.parse(localStorage.getItem("resumes") || "[]");
        setResumes(local);

        const localDefault =
          local.find((r) => r?.isDefault === true) ||
          local.find((r) => r?.default === true) ||
          local[0] ||
          null;

        if (localDefault?.id != null) setSelectedResume(String(localDefault.id));
      } finally {
        if (!cancelled) setResumesLoading(false);
      }
    };

    load();
    return () => {
      cancelled = true;
    };
  }, []);

  // (kept for fallback)
  const extractJobDetails = (description) => {
    const titlePatterns = [
      /(?:position|role|job title|title):\s*([^\n]+)/i,
      /(?:hiring|seeking|looking for)\s+(?:a|an)?\s*([^\n,]+?)(?:\s+at|\s+to|\s+in|\s*\n)/i,
      /^([A-Z][^\n]{10,60}?)(?:\s+at|\s+-|\s*\n)/m,
    ];
    let jobTitle = null;
    for (const pattern of titlePatterns) {
      const match = description.match(pattern);
      if (match) {
        jobTitle = match[1].trim();
        break;
      }
    }

    const companyPatterns = [
      /(?:company|employer|organization):\s*([^\n]+)/i,
      /(?:at|@)\s+([A-Z][a-zA-Z0-9\s&.]+?)(?:\s+is|\s+we|\s+-|\s*\n)/,
      /About\s+([A-Z][a-zA-Z0-9\s&.]+?)(?:\s*\n|:)/i,
    ];
    let company = null;
    for (const pattern of companyPatterns) {
      const match = description.match(pattern);
      if (match) {
        company = match[1].trim();
        break;
      }
    }

    const urlMatch = description.match(/https?:\/\/[^\s]+/);
    let website = urlMatch ? urlMatch[0] : null;
    if (!website && company) {
      website = `www.${company.toLowerCase().replace(/\s+/g, "")}.com`;
    }

    const locationPatterns = [
      /(?:location|based in|office in):\s*([^\n]+)/i,
      /(?:in|at)\s+([A-Z][a-z]+,\s*[A-Z]{2})/,
      /(?:Remote|Hybrid|On-site)(?:\s+in\s+)?([A-Z][a-z]+(?:,\s*[A-Z]{2})?)/,
    ];
    let location = null;
    for (const pattern of locationPatterns) {
      const match = description.match(pattern);
      if (match) {
        location = match[1].trim();
        break;
      }
    }

    const seniorityKeywords = {
      Intern: /intern|internship|co-op/i,
      Junior: /junior|entry.level|early.career/i,
      "Mid-Level": /mid.level|experienced|3\+?\s*years/i,
      Senior: /senior|lead|principal|staff|10\+?\s*years/i,
    };
    let seniority = null;
    for (const [level, pattern] of Object.entries(seniorityKeywords)) {
      if (pattern.test(description)) {
        seniority = level;
        break;
      }
    }

    const skills = new Set();
    const commonSkills = [
      "React",
      "Python",
      "JavaScript",
      "AWS",
      "Docker",
      "SQL",
      "Node.js",
      "Java",
      "C\\+\\+",
      "TypeScript",
      "Git",
    ];
    commonSkills.forEach((skill) => {
      if (new RegExp(`\\b${skill}\\b`, "i").test(description)) {
        skills.add(skill.replace(/\\\+/g, "+"));
      }
    });

    return {
      jobTitle: jobTitle || "Position",
      company: company || "Company",
      website,
      location,
      seniority,
      keywords: Array.from(skills).slice(0, 8),
    };
  };

  const handleAnalyze = async () => {
    if (!selectedResume) {
      toast.error("Please select a resume");
      return;
    }
    if (!jobDescription.trim()) {
      toast.error("Please enter a job description");
      return;
    }

    setIsAnalyzing(true);

    try {
      const res = await fetch("/api/jobs/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      });

      if (!res.ok) throw new Error(await res.text());
      const extracted = await res.json();

      setExtractedData({
        jobTitle: extracted.jobTitle || "Position",
        company: extracted.company || "Company",
        website: extracted.website || null,
        location: extracted.location || null,
        seniority: extracted.seniority || null,
        keywords: extracted.keywords || [],

        // pay fields
        payText: extracted.payText || null,
        payMin:
          typeof extracted.payMin === "number" && Number.isFinite(extracted.payMin)
            ? extracted.payMin
            : null,
        payMax:
          typeof extracted.payMax === "number" && Number.isFinite(extracted.payMax)
            ? extracted.payMax
            : null,
        payCurrency: extracted.payCurrency || "USD",
        payPeriod: extracted.payPeriod || null,
        payConfidence:
          typeof extracted.payConfidence === "number" &&
          Number.isFinite(extracted.payConfidence)
            ? extracted.payConfidence
            : null,
        payAnnualizedMin:
          typeof extracted.payAnnualizedMin === "number" &&
          Number.isFinite(extracted.payAnnualizedMin)
            ? extracted.payAnnualizedMin
            : null,
        payAnnualizedMax:
          typeof extracted.payAnnualizedMax === "number" &&
          Number.isFinite(extracted.payAnnualizedMax)
            ? extracted.payAnnualizedMax
            : null,
        payPercentile:
          typeof extracted.payPercentile === "number" &&
          Number.isFinite(extracted.payPercentile)
            ? extracted.payPercentile
            : null,
        payPercentileSource: extracted.payPercentileSource || null,

        // extra chips (optional fields from backend if present)
        employmentType: extracted.employmentType || null, // Full-time / Contract / Part-time / Internship
        workModel: extracted.workModel || null, // Remote / Hybrid / On-site
        experienceBand: extracted.experienceBand || null, // "0–2 yrs" etc
        visaClearance: extracted.visaClearance || null, // "No sponsorship" etc
      });

      setShowConfirm(true);
    } catch (e) {
      console.error(e);
      const fallback = extractJobDetails(jobDescription);
      setExtractedData(fallback);
      setShowConfirm(true);
      toast.error("AI extract failed — used fallback extraction.");
    } finally {
      setIsAnalyzing(false);
    }
  };

  const handleGenerate = async () => {
    try {
      const userId = localStorage.getItem("userId") || "demo-user";

      const payload = {
        userId,
        resumeId: selectedResume,
        jobTitle: extractedData.jobTitle,
        company: extractedData.company,
        website: extractedData.website,
        location: extractedData.location,
        seniority: extractedData.seniority,
        keywords: extractedData.keywords,
        jobDescription,
        aiMode,
        studentMode,
      };

      const res = await fetch("/api/jobs", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });

      if (!res.ok) throw new Error(await res.text());
      const job = await res.json();

      localStorage.setItem("latestJobId", job.id);
      localStorage.setItem("latestUserId", userId);
      navigate(createPageUrl("Packet"));
    } catch (e) {
      console.error(e);
      toast.error("Failed to create job.");
    }
  };

  const hasResumes = useMemo(() => resumes.length > 0, [resumes]);

  // -----------------------------
  // UI helpers (no backend changes)
  // -----------------------------
  const chipBase =
    "px-3 py-1.5 rounded-full text-xs font-medium border border-white/10 bg-white/[0.06] text-white/80";
  const chipNeon =
    "px-3 py-1.5 rounded-full text-xs font-medium border border-purple-500/20 bg-purple-600/15 text-purple-200";
  const chipGreen =
    "px-3 py-1.5 rounded-full text-xs font-medium border border-emerald-500/20 bg-emerald-600/15 text-emerald-200";
  const chipAmber =
    "px-3 py-1.5 rounded-full text-xs font-medium border border-amber-500/20 bg-amber-600/15 text-amber-200";

  const fmtMoney = (n) =>
    typeof n === "number"
      ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : null;

  const renderPayPrimary = () => {
    const cur = extractedData?.payCurrency || "USD";
    const symbol = cur === "USD" ? "$" : `${cur} `;

    const periodMap = {
      hour: "/hr",
      year: "/yr",
      month: "/mo",
      week: "/wk",
      day: "/day",
    };
    const suffix = extractedData?.payPeriod
      ? periodMap[extractedData.payPeriod] || ""
      : "";

    const min = fmtMoney(extractedData?.payMin);
    const max = fmtMoney(extractedData?.payMax);

    // If period missing but annualized exists, prefer showing annual too.
    if (min && max) {
      return min === max
        ? `${symbol}${min}${suffix}`
        : `${symbol}${min} – ${symbol}${max}${suffix}`;
    }
    if (extractedData?.payText) return extractedData.payText;
    return null;
  };

  const renderAnnual = () => {
    const min = fmtMoney(extractedData?.payAnnualizedMin);
    const max = fmtMoney(extractedData?.payAnnualizedMax);

    if (min && max) return `Est. $${min} – $${max} /yr`;
    if (min) return `Est. $${min} /yr`;
    if (max) return `Est. $${max} /yr`;
    return null;
  };

  const renderConfidence = () => {
    if (typeof extractedData?.payConfidence !== "number") return null;
    const c = extractedData.payConfidence;
    if (c >= 0.8) return "High confidence";
    if (c >= 0.5) return "Medium confidence";
    return "Low confidence";
  };

  const renderTopPay = () => {
    if (typeof extractedData?.payPercentile !== "number") return null;
    // existing heuristic uses percentile where higher = higher pay
    const top = Math.round(100 - extractedData.payPercentile);
    return `Top ${top}% pay`;
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,6%)]">
      {/* Header */}
      <header className="border-b border-white/10 bg-[hsl(240,10%,6%)]/85 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-[1200px] mx-auto px-5 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-lg bg-purple-600/90 flex items-center justify-center shadow-lg shadow-purple-600/20">
              <Rocket className="w-4.5 h-4.5 text-white" />
            </div>
            <div className="flex flex-col leading-tight">
              <span className="font-bold text-white text-lg">Job Autopilot</span>
              <span className="text-xs text-white/45">
                Paste a JD → verify → generate packet
              </span>
            </div>
          </div>
          <Button
            variant="ghost"
            onClick={() => navigate(createPageUrl("AppHome"))}
            className="text-white/70 hover:text-white hover:bg-white/10 transition-all"
          >
            Close
          </Button>
        </div>
      </header>

      <div className="max-w-[1200px] mx-auto px-5 sm:px-6 py-10 min-h-[calc(100vh-4rem)] flex flex-col justify-center">
        {/* Analyzing Modal */}
        {isAnalyzing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md">
            <div className="rounded-2xl p-10 max-w-md w-full mx-4 border border-white/10 bg-[hsl(240,10%,10%)] shadow-2xl">
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-purple-600/20 flex items-center justify-center mx-auto mb-6 border border-purple-500/15">
                  <Loader2 className="w-10 h-10 text-purple-300 animate-spin" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Analyzing job description…
                </h2>
                <p className="text-white/55 mb-7">
                  Extracting title, company, pay, and requirements
                </p>

                <div className="space-y-3 text-left">
                  <div className="flex items-center gap-3 text-sm text-white/70">
                    <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center shadow shadow-purple-600/25">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                    Parsing job post
                  </div>
                  <div className="flex items-center gap-3 text-sm text-white/70">
                    <div className="w-6 h-6 rounded-full bg-purple-600/55 flex items-center justify-center">
                      <Loader2 className="w-3 h-3 text-white animate-spin" />
                    </div>
                    Detecting role, company & pay
                  </div>
                  <div className="flex items-center gap-3 text-sm text-white/45">
                    <div className="w-6 h-6 rounded-full bg-white/10" />
                    Extracting skills & constraints
                  </div>
                  <div className="flex items-center gap-3 text-sm text-white/45">
                    <div className="w-6 h-6 rounded-full bg-white/10" />
                    Preparing packet draft
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Screen */}
        {showConfirm && extractedData && (
          <div className="w-full">
            <div className="mb-6 text-center">
              <h1 className="text-4xl md:text-[44px] font-bold text-white mb-2">
                Confirm details
              </h1>
              <p className="text-base md:text-lg text-white/55">
                Review extracted info before generating
              </p>
            </div>

            <div className="rounded-2xl border border-white/12 bg-[hsl(240,10%,10%)] shadow-xl shadow-black/35">
              {/* top glow bar */}
              <div className="h-1.5 rounded-t-2xl bg-gradient-to-r from-purple-600/70 via-fuchsia-500/40 to-purple-600/70" />

              <div className="p-7 md:p-8">
                {/* Layout: on wide screens, keep things centered + bigger */}
                <div className="flex items-start justify-between gap-6">
                  <div className="min-w-0 flex-1">
                    {/* Title row */}
                    <div className="flex items-start justify-between gap-4">
                      <div className="flex-1 min-w-0">
                        <label className="text-xs text-white/55 mb-1 block">
                          Job Title
                        </label>
                        {editMode ? (
                          <Input
                            value={extractedData.jobTitle}
                            onChange={(e) =>
                              setExtractedData({
                                ...extractedData,
                                jobTitle: e.target.value,
                              })
                            }
                            className="bg-white/7 border-white/12 text-white h-11 text-base"
                          />
                        ) : (
                          <p className="text-xl md:text-2xl font-semibold text-white truncate">
                            {extractedData.jobTitle}
                          </p>
                        )}
                      </div>

                      {!editMode && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setEditMode(true)}
                          className="text-white/60 hover:text-white hover:bg-white/10"
                        >
                          <Edit2 className="w-4 h-4" />
                        </Button>
                      )}
                    </div>

                    {/* Company */}
                    <div className="mt-5">
                      <label className="text-xs text-white/55 mb-1 block">
                        Company
                      </label>
                      {editMode ? (
                        <Input
                          value={extractedData.company}
                          onChange={(e) =>
                            setExtractedData({
                              ...extractedData,
                              company: e.target.value,
                            })
                          }
                          className="bg-white/7 border-white/12 text-white h-11 text-base"
                        />
                      ) : (
                        <p className="text-white/90 text-lg md:text-xl font-medium">
                          {extractedData.company}
                        </p>
                      )}
                    </div>

                    {/* meta line */}
                    <div className="mt-4 space-y-2">
                      {extractedData.website && (
                        <div className="flex items-center gap-2 text-sm text-white/70">
                          <Globe className="w-4 h-4 text-white/50" />
                          {editMode ? (
                            <Input
                              value={extractedData.website}
                              onChange={(e) =>
                                setExtractedData({
                                  ...extractedData,
                                  website: e.target.value,
                                })
                              }
                              className="bg-white/7 border-white/12 text-white h-10 text-sm flex-1"
                            />
                          ) : (
                            <span className="truncate">{extractedData.website}</span>
                          )}
                        </div>
                      )}

                      {extractedData.location && (
                        <div className="flex items-center gap-2 text-sm text-white/70">
                          <MapPin className="w-4 h-4 text-white/50" />
                          <span>{extractedData.location}</span>
                        </div>
                      )}

                      {extractedData.seniority && (
                        <div className="flex items-center gap-2 text-sm text-white/70">
                          <BarChart2 className="w-4 h-4 text-white/50" />
                          <span>{extractedData.seniority}</span>
                        </div>
                      )}
                    </div>

                    {/* Job detail chips row */}
                    <div className="mt-5">
                      <label className="text-xs text-white/55 mb-2 block flex items-center gap-2">
                        <Tag className="w-3.5 h-3.5" />
                        Job Details
                      </label>
                      <div className="flex flex-wrap gap-2">
                        {extractedData.employmentType && (
                          <span className={`${chipBase} flex items-center gap-1.5`}>
                            <Briefcase className="w-3.5 h-3.5 text-white/55" />
                            {extractedData.employmentType}
                          </span>
                        )}
                        {extractedData.workModel && (
                          <span className={`${chipBase} flex items-center gap-1.5`}>
                            <Building2 className="w-3.5 h-3.5 text-white/55" />
                            {extractedData.workModel}
                          </span>
                        )}
                        {extractedData.experienceBand && (
                          <span className={`${chipBase} flex items-center gap-1.5`}>
                            <Clock className="w-3.5 h-3.5 text-white/55" />
                            {extractedData.experienceBand}
                          </span>
                        )}
                        {extractedData.visaClearance && (
                          <span className={`${chipBase} flex items-center gap-1.5`}>
                            <ShieldCheck className="w-3.5 h-3.5 text-white/55" />
                            {extractedData.visaClearance}
                          </span>
                        )}
                      </div>
                    </div>

                    {/* Compensation */}
                    {(extractedData.payText ||
                      extractedData.payMin != null ||
                      extractedData.payMax != null ||
                      extractedData.payAnnualizedMin != null ||
                      extractedData.payAnnualizedMax != null) && (
                      <div className="mt-6">
                        <label className="text-xs text-white/55 mb-2 block flex items-center gap-2">
                          <DollarSign className="w-3.5 h-3.5" />
                          Compensation
                        </label>

                        <div className="flex flex-wrap gap-2">
                          {/* Primary pay */}
                          {renderPayPrimary() && (
                            <span className={`${chipGreen}`}>
                              {renderPayPrimary()}
                            </span>
                          )}

                          {/* Confidence */}
                          {renderConfidence() && (
                            <span className={`${chipBase}`}>{renderConfidence()}</span>
                          )}

                          {/* Annualized */}
                          {renderAnnual() && (
                            <span className={`${chipAmber}`}>{renderAnnual()}</span>
                          )}

                          {/* Top X% pay */}
                          {renderTopPay() && (
                            <span
                              className={`${chipNeon} flex items-center gap-1.5`}
                            >
                              <Percent className="w-3.5 h-3.5" />
                              {renderTopPay()}
                            </span>
                          )}
                        </div>

                        {typeof extractedData.payPercentile === "number" &&
                          extractedData.payPercentileSource && (
                            <p className="text-xs text-white/40 mt-2">
                              Percentile is an estimate (
                              {extractedData.payPercentileSource})
                            </p>
                          )}
                      </div>
                    )}

                    {/* Skills */}
                    {extractedData.keywords?.length > 0 && (
                      <div className="mt-6">
                        <label className="text-xs text-white/55 mb-2 block flex items-center gap-2">
                          <Tag className="w-3.5 h-3.5" />
                          Key Skills Detected
                        </label>
                        <div className="flex flex-wrap gap-2">
                          {extractedData.keywords.map((keyword, i) => (
                            <span
                              key={i}
                              className="px-3 py-1.5 rounded-full bg-purple-600/20 text-purple-200 text-xs font-medium border border-purple-500/20"
                            >
                              {keyword}
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                </div>

                {editMode && (
                  <div className="mt-7 flex justify-end">
                    <Button
                      onClick={() => setEditMode(false)}
                      className="bg-purple-600 hover:bg-purple-500 text-white h-11 px-6 text-base font-semibold shadow-lg shadow-purple-600/20"
                    >
                      Save Changes
                    </Button>
                  </div>
                )}
              </div>
            </div>

            {/* Actions */}
            <div className="mt-6 flex flex-col sm:flex-row gap-3 sm:gap-4">
              <Button
                onClick={() => {
                  setShowConfirm(false);
                  setExtractedData(null);
                }}
                variant="outline"
                className="flex-1 h-12 bg-white/5 border-white/15 text-white hover:bg-white/10 text-base"
              >
                Back to Edit
              </Button>
              <Button
                onClick={handleGenerate}
                className="flex-1 h-12 bg-purple-600 hover:bg-purple-500 text-white text-base font-semibold shadow-lg shadow-purple-600/25"
              >
                Looks good — Generate Packet
              </Button>
            </div>
          </div>
        )}

        {/* Main Form */}
        {!showConfirm && (
          <>
            <div className="mb-8 text-center">
              <h1 className="text-4xl md:text-[46px] font-bold mb-3 text-white">
                Create a new job packet
              </h1>
              <p className="text-lg md:text-xl text-white/60">
                Paste a job description — we’ll extract details automatically
              </p>
            </div>

            <div className="rounded-2xl p-7 md:p-9 space-y-7 max-w-[980px] mx-auto border border-white/12 bg-[hsl(240,10%,10%)] shadow-xl shadow-black/35">
              {/* Resume Selector */}
              <div>
                <label className="block text-base font-semibold mb-3 text-white">
                  Resume <span className="text-red-400">*</span>
                </label>

                {resumesLoading ? (
                  <div
                    className="p-5 rounded-xl border border-white/12 text-center bg-white/[0.04]"
                  >
                    <p className="mb-0 text-sm text-white/60">Loading resumes…</p>
                  </div>
                ) : hasResumes ? (
                  <Select value={selectedResume} onValueChange={setSelectedResume}>
                    <SelectTrigger className="border-white/12 text-white h-12 text-base bg-white/[0.04]">
                      <SelectValue placeholder="Select resume" />
                    </SelectTrigger>
                    <SelectContent>
                      {resumes.map((resume) => (
                        <SelectItem key={resume.id} value={resume.id.toString()}>
                          {resume.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <div className="p-5 rounded-xl border border-white/12 text-center bg-white/[0.04]">
                    <p className="mb-3 text-sm text-white/60">No resumes found</p>
                    <Button
                      onClick={() => navigate(createPageUrl("Resumes"))}
                      className="bg-purple-600 hover:bg-purple-500 text-white hover:scale-[1.02] transition-all"
                    >
                      Upload Resume
                    </Button>
                  </div>
                )}
              </div>

              {/* AI Mode Selector */}
              <div>
                <label className="block text-base font-semibold mb-2 text-white">
                  AI Mode <span className="text-red-400">*</span>
                </label>
                <p className="text-sm mb-4 text-white/55">
                  Choose how AI handles your resume content.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setAiMode("standard")}
                    className={`p-7 rounded-xl border-2 transition-all text-left hover:scale-[1.01] relative ${
                      aiMode === "standard"
                        ? "border-green-500/50 bg-green-500/10 shadow-lg shadow-green-500/20"
                        : "border-white/12 bg-white/[0.03] hover:border-white/20 hover:shadow-lg hover:shadow-green-500/10"
                    }`}
                    style={{ minHeight: "220px" }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                        <Check className="w-5 h-5 text-green-300" />
                      </div>
                      <span className="font-bold text-lg text-white">Standard</span>
                    </div>
                    <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-green-500/20 text-green-200 mb-4 font-semibold border border-green-500/20">
                      Recommended • Safe & ATS-friendly
                    </span>
                    <ul className="text-sm leading-relaxed space-y-1.5 text-white/70">
                      <li>• Improves clarity and impact of your existing bullets</li>
                      <li>• Rewrites descriptions to match the job</li>
                      <li>• Optimizes wording and keywords</li>
                      <li className="font-semibold text-green-200/90">
                        • Does NOT create fake experience
                      </li>
                    </ul>
                  </button>

                  <button
                    onClick={() => setAiMode("elite")}
                    className={`p-7 rounded-xl border-2 transition-all text-left hover:scale-[1.01] relative ${
                      aiMode === "elite"
                        ? "border-amber-500/50 bg-amber-500/10 shadow-lg shadow-amber-500/20"
                        : "border-white/12 bg-white/[0.03] hover:border-white/20 hover:shadow-lg hover:shadow-amber-500/10"
                    }`}
                    style={{ minHeight: "220px" }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-amber-200" />
                      </div>
                      <span className="font-bold text-lg text-white">Elite</span>
                    </div>
                    <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-200 mb-4 font-semibold border border-amber-500/20">
                      Advanced • Use with caution
                    </span>
                    <ul className="text-sm leading-relaxed space-y-1.5 mb-3 text-white/70">
                      <li>• May create or enhance experience bullets</li>
                      <li>• Can infer responsibilities from context</li>
                      <li>• Designed to maximize callbacks</li>
                      <li className="font-semibold text-amber-200/90">
                        • Higher risk if verified by employer
                      </li>
                    </ul>
                    {aiMode === "elite" && (
                      <div className="mt-4 pt-4 border-t border-amber-500/20">
                        <p className="text-xs text-amber-200/90 flex items-start gap-2">
                          <span className="text-amber-200 font-bold">⚠</span>
                          <span>
                            Elite mode may generate inferred or mock experience.
                            Use responsibly.
                          </span>
                        </p>
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Student Mode Toggle */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-white/[0.04] border border-white/12">
                <button
                  onClick={() => setStudentMode(!studentMode)}
                  className={`w-12 h-6 rounded-full transition-all relative ${
                    studentMode ? "bg-purple-600" : "bg-white/25"
                  }`}
                >
                  <div
                    className={`absolute top-0.5 w-5 h-5 rounded-full bg-white transition-all ${
                      studentMode ? "left-6" : "left-0.5"
                    }`}
                  />
                </button>
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-1">
                    <GraduationCap className="w-4 h-4 text-white/70" />
                    <span className="text-sm font-medium text-white">
                      No experience / Student mode
                    </span>
                  </div>
                  <p className="text-xs text-white/50">
                    Emphasizes projects, coursework, and skills instead of work
                    experience.
                  </p>
                </div>
              </div>

              {/* Job Description */}
              <div>
                <label className="block text-base font-semibold mb-3 text-white">
                  Job Description <span className="text-red-400">*</span>
                </label>
                <Textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                 
                  className="min-h-[320px] border-white/12 text-white resize-none text-base bg-white/[0.04]"
                />
                <p className="text-xs mt-2 text-white/50">
                  Paste the full job description. We’ll extract title, company,
                  pay, and requirements.
                </p>
              </div>

              {/* Generate Button */}
              <div className="pt-2">
                <Button
                  onClick={handleAnalyze}
                  disabled={!selectedResume || !jobDescription.trim()}
                  className="w-full h-14 bg-purple-600 hover:bg-purple-500 text-white text-lg font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.01] hover:shadow-lg hover:shadow-purple-500/30 transition-all"
                >
                  Generate Packet
                </Button>
                <p className="text-center text-sm mt-3 text-white/50">
                  Uses 1 credit
                </p>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
