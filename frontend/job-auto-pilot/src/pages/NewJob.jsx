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

    // Handle non-2xx with useful message
    if (!res.ok) {
      let msg = `Request failed (${res.status})`;
      try {
        const t = await res.text();
        if (t) msg = t;
      } catch {}
      throw new Error(msg);
    }

    // Some endpoints may return empty
    const text = await res.text();
    return text ? JSON.parse(text) : null;
  };

  // ✅ Load resumes from Cosmos
  useEffect(() => {
    let cancelled = false;

    const load = async () => {
      try {
        setResumesLoading(true);

        // Your backend route in index.js is: route: "resume/list"
        // In SWA, functions are usually under /api/*
        const data = await apiFetch("/api/resume/list", { method: "GET" });

        // Accept a couple possible shapes safely:
        // - { resumes: [...] }
        // - [...] directly
        const list = Array.isArray(data) ? data : data?.resumes || [];

        if (cancelled) return;

        setResumes(list);

        // ✅ Auto-select default resume from Cosmos
        // Common field options people use: isDefault / default / is_default
        const defaultResume =
          list.find((r) => r?.isDefault === true) ||
          list.find((r) => r?.default === true) ||
          list.find((r) => r?.is_default === true) ||
          null;

        // If no explicit default, pick first
        const pick = defaultResume || list[0] || null;

        // Your Select expects value to be resume.id as string
        if (pick?.id != null) {
          setSelectedResume(String(pick.id));
        }
      } catch (e) {
        if (cancelled) return;

        // Fallback: keep the app usable even if API fails
        console.error(e);
        toast.error("Could not load resumes from cloud. Falling back to local resumes.");

        const local = JSON.parse(localStorage.getItem("resumes") || "[]");
        setResumes(local);

        // Try to select a local default if present
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

    await new Promise((resolve) => setTimeout(resolve, 2000));

    const extracted = extractJobDetails(jobDescription);
    setExtractedData(extracted);
    setIsAnalyzing(false);
    setShowConfirm(true);
  };

 const handleGenerate = async () => {
  try {
    const userId = localStorage.getItem("userId") || "demo-user";

    const payload = {
      userId,
      resumeId: selectedResume, // ✅ important
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
    localStorage.setItem("latestUserId", userId); // ✅ needed for PK=/userId

    navigate(createPageUrl("Packet"));
  } catch (e) {
    console.error(e);
    toast.error("Failed to create job.");
  }
};



    navigate(createPageUrl("Packet"));
  };

  // (Optional) keep existing UI identical; this only ensures the selector has data
  const hasResumes = useMemo(() => resumes.length > 0, [resumes]);

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
          <Button
            variant="ghost"
            onClick={() => navigate(createPageUrl("AppHome"))}
            className="text-white/60 hover:text-white/90 hover:bg-white/5 transition-all"
          >
            Close
          </Button>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-12 min-h-[calc(100vh-4rem)] flex flex-col justify-center">
        {/* Analyzing Modal */}
        {isAnalyzing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="glass-card rounded-2xl p-12 max-w-md w-full mx-4">
              <div className="text-center">
                <div className="w-20 h-20 rounded-full bg-purple-600/20 flex items-center justify-center mx-auto mb-6">
                  <Loader2 className="w-10 h-10 text-purple-400 animate-spin" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-3">
                  Analyzing job description…
                </h2>
                <p className="text-white/40 mb-8">
                  Extracting role, company, website, and key requirements
                </p>

                <div className="space-y-4 text-left">
                  <div className="flex items-center gap-3 text-sm text-white/60">
                    <div className="w-6 h-6 rounded-full bg-purple-600 flex items-center justify-center">
                      <Check className="w-4 h-4 text-white" />
                    </div>
                    Parsing job post
                  </div>
                  <div className="flex items-center gap-3 text-sm text-white/60">
                    <div className="w-6 h-6 rounded-full bg-purple-600/50 flex items-center justify-center">
                      <Loader2 className="w-3 h-3 text-white animate-spin" />
                    </div>
                    Detecting role & company
                  </div>
                  <div className="flex items-center gap-3 text-sm text-white/30">
                    <div className="w-6 h-6 rounded-full bg-white/10" />
                    Extracting skills & keywords
                  </div>
                  <div className="flex items-center gap-3 text-sm text-white/30">
                    <div className="w-6 h-6 rounded-full bg-white/10" />
                    Preparing packet
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Screen */}
        {showConfirm && extractedData && (
          <div>
            <div className="mb-8 text-center">
              <h1 className="text-4xl font-bold text-white mb-3">
                Confirm details
              </h1>
              <p className="text-lg text-white/40">
                Review extracted information before generating
              </p>
            </div>

            <div className="glass-card rounded-2xl p-8 mb-6">
              <div className="space-y-4">
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1">
                    <label className="text-xs text-white/40 mb-1 block">
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
                        className="bg-white/5 border-white/10 text-white"
                      />
                    ) : (
                      <p className="text-lg font-semibold text-white">
                        {extractedData.jobTitle}
                      </p>
                    )}
                  </div>
                  {!editMode && (
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => setEditMode(true)}
                      className="text-white/40 hover:text-white"
                    >
                      <Edit2 className="w-4 h-4" />
                    </Button>
                  )}
                </div>

                <div>
                  <label className="text-xs text-white/40 mb-1 block">
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
                      className="bg-white/5 border-white/10 text-white"
                    />
                  ) : (
                    <p className="text-white">{extractedData.company}</p>
                  )}
                </div>

                {extractedData.website && (
                  <div className="flex items-center gap-2">
                    <Globe className="w-4 h-4 text-white/40" />
                    {editMode ? (
                      <Input
                        value={extractedData.website}
                        onChange={(e) =>
                          setExtractedData({
                            ...extractedData,
                            website: e.target.value,
                          })
                        }
                        className="bg-white/5 border-white/10 text-white flex-1"
                      />
                    ) : (
                      <p className="text-sm text-white/60">
                        {extractedData.website}
                      </p>
                    )}
                  </div>
                )}

                {extractedData.location && (
                  <div className="flex items-center gap-2">
                    <MapPin className="w-4 h-4 text-white/40" />
                    <p className="text-sm text-white/60">
                      {extractedData.location}
                    </p>
                  </div>
                )}

                {extractedData.seniority && (
                  <div className="flex items-center gap-2">
                    <BarChart2 className="w-4 h-4 text-white/40" />
                    <p className="text-sm text-white/60">
                      {extractedData.seniority}
                    </p>
                  </div>
                )}

                {extractedData.keywords?.length > 0 && (
                  <div>
                    <label className="text-xs text-white/40 mb-2 block flex items-center gap-2">
                      <Tag className="w-3 h-3" />
                      Key Skills Detected
                    </label>
                    <div className="flex flex-wrap gap-2">
                      {extractedData.keywords.map((keyword, i) => (
                        <span
                          key={i}
                          className="px-3 py-1 rounded-full bg-purple-600/20 text-purple-400 text-xs"
                        >
                          {keyword}
                        </span>
                      ))}
                    </div>
                  </div>
                )}
              </div>

              {editMode && (
                <div className="mt-6 flex justify-end">
                  <Button
                    onClick={() => setEditMode(false)}
                    className="bg-purple-600 hover:bg-purple-500 text-white"
                  >
                    Save Changes
                  </Button>
                </div>
              )}
            </div>

            <div className="flex gap-4">
              <Button
                onClick={() => {
                  setShowConfirm(false);
                  setExtractedData(null);
                }}
                variant="outline"
                className="flex-1 py-6 bg-white/5 border-white/10 text-white hover:bg-white/10"
              >
                Back to Edit
              </Button>
              <Button
                onClick={handleGenerate}
                className="flex-1 py-6 bg-purple-600 hover:bg-purple-500 text-white text-lg font-semibold"
              >
                Looks good — Generate Packet
              </Button>
            </div>
          </div>
        )}

        {/* Main Form */}
        {!showConfirm && (
          <>
            <div className="mb-10 text-center">
              <h1
                className="text-5xl font-bold mb-4"
                style={{ color: "#F5F5F7" }}
              >
                Create a new job packet
              </h1>
              <p className="text-xl" style={{ color: "#B3B3B8" }}>
                This will save you time
              </p>
            </div>

            <div className="glass-card rounded-2xl p-10 space-y-8 max-w-4xl mx-auto border border-white/10">
              {/* Resume Selector */}
              <div>
                <label
                  className="block text-base font-semibold mb-3"
                  style={{ color: "#F5F5F7" }}
                >
                  Resume <span className="text-red-400">*</span>
                </label>

                {resumesLoading ? (
                  <div
                    className="p-6 rounded-xl border border-white/12 text-center"
                    style={{ background: "#141414" }}
                  >
                    <p className="mb-0 text-sm" style={{ color: "#B3B3B8" }}>
                      Loading resumes…
                    </p>
                  </div>
                ) : hasResumes ? (
                  <Select value={selectedResume} onValueChange={setSelectedResume}>
                    <SelectTrigger
                      className="border-white/12 text-white py-6 text-base"
                      style={{ background: "#141414" }}
                    >
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
                  <div
                    className="p-6 rounded-xl border border-white/12 text-center"
                    style={{ background: "#141414" }}
                  >
                    <p className="mb-3 text-sm" style={{ color: "#B3B3B8" }}>
                      No resumes found
                    </p>
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
                <label
                  className="block text-base font-semibold mb-2"
                  style={{ color: "#F5F5F7" }}
                >
                  AI Mode <span className="text-red-400">*</span>
                </label>
                <p className="text-sm mb-5" style={{ color: "#8A8A92" }}>
                  Choose how AI handles your resume content.
                </p>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                  <button
                    onClick={() => setAiMode("standard")}
                    className={`p-8 rounded-xl border-2 transition-all text-left hover:scale-[1.02] relative ${
                      aiMode === "standard"
                        ? "border-green-500/50 bg-green-500/10 shadow-lg shadow-green-500/20"
                        : "border-white/12 bg-white/[0.03] hover:border-white/20 hover:shadow-lg hover:shadow-green-500/10"
                    }`}
                    style={{ minHeight: "240px" }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-green-600/20 flex items-center justify-center">
                        <Check className="w-5 h-5 text-green-400" />
                      </div>
                      <span
                        className="font-bold text-lg"
                        style={{ color: "#F5F5F7" }}
                      >
                        Standard
                      </span>
                    </div>
                    <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-green-500/20 text-green-400 mb-4 font-semibold">
                      Recommended • Safe & ATS-friendly
                    </span>
                    <ul
                      className="text-sm leading-relaxed space-y-1.5"
                      style={{ color: "#B3B3B8" }}
                    >
                      <li>• Improves clarity and impact of your existing bullets</li>
                      <li>• Rewrites descriptions to match the job</li>
                      <li>• Optimizes wording and keywords</li>
                      <li className="font-semibold text-green-400/80">
                        • Does NOT create fake experience
                      </li>
                    </ul>
                  </button>

                  <button
                    onClick={() => setAiMode("elite")}
                    className={`p-8 rounded-xl border-2 transition-all text-left hover:scale-[1.02] relative ${
                      aiMode === "elite"
                        ? "border-amber-500/50 bg-amber-500/10 shadow-lg shadow-amber-500/20"
                        : "border-white/12 bg-white/[0.03] hover:border-white/20 hover:shadow-lg hover:shadow-amber-500/10"
                    }`}
                    style={{ minHeight: "240px" }}
                  >
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-10 h-10 rounded-lg bg-amber-600/20 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-amber-400" />
                      </div>
                      <span
                        className="font-bold text-lg"
                        style={{ color: "#F5F5F7" }}
                      >
                        Elite
                      </span>
                    </div>
                    <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-amber-500/20 text-amber-400 mb-4 font-semibold">
                      Advanced • Use with caution
                    </span>
                    <ul
                      className="text-sm leading-relaxed space-y-1.5 mb-3"
                      style={{ color: "#B3B3B8" }}
                    >
                      <li>• May create or enhance experience bullets</li>
                      <li>• Can infer responsibilities from context</li>
                      <li>• Designed to maximize callbacks</li>
                      <li className="font-semibold text-amber-400/80">
                        • Higher risk if verified by employer
                      </li>
                    </ul>
                    {aiMode === "elite" && (
                      <div className="mt-4 pt-4 border-t border-amber-500/20">
                        <p className="text-xs text-amber-400/90 flex items-start gap-2">
                          <span className="text-amber-400 font-bold">⚠</span>
                          <span>
                            Elite mode may generate inferred or mock experience. Use responsibly.
                          </span>
                        </p>
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Student Mode Toggle */}
              <div className="flex items-start gap-3 p-4 rounded-xl bg-white/5 border border-white/10">
                <button
                  onClick={() => setStudentMode(!studentMode)}
                  className={`w-12 h-6 rounded-full transition-all relative ${
                    studentMode ? "bg-purple-600" : "bg-white/20"
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
                    <GraduationCap className="w-4 h-4 text-white/60" />
                    <span className="text-sm font-medium text-white">
                      No experience / Student mode
                    </span>
                  </div>
                  <p className="text-xs text-white/40">
                    Emphasizes projects, coursework, and skills instead of work experience.
                  </p>
                </div>
              </div>

              {/* Job Description */}
              <div>
                <label
                  className="block text-base font-semibold mb-3"
                  style={{ color: "#F5F5F7" }}
                >
                  Job Description <span className="text-red-400">*</span>
                </label>
                <Textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder={`Paste the full job description here...

Example:
We are looking for a Software Engineer to join our team...

Requirements:
- 3+ years of experience with React
- Strong problem-solving skills...`}
                  className="min-h-[320px] border-white/12 text-white resize-none text-base"
                  style={{ background: "#141414" }}
                />
                <p className="text-xs mt-2" style={{ color: "#8A8A92" }}>
                  Paste the full job description. We'll automatically extract role, company, and requirements.
                </p>
              </div>

              {/* Generate Button */}
              <div className="pt-4">
                <Button
                  onClick={handleAnalyze}
                  disabled={!selectedResume || !jobDescription.trim()}
                  className="w-full py-7 bg-purple-600 hover:bg-purple-500 text-white text-lg font-bold rounded-xl disabled:opacity-40 disabled:cursor-not-allowed hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/30 transition-all"
                >
                  Generate Packet
                </Button>
                <p className="text-center text-sm mt-3" style={{ color: "#8A8A92" }}>
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
