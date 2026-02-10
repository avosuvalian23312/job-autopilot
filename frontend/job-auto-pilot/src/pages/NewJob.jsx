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
  FileText,
  ClipboardCheck,
  Wand2,
  Star,
  ScanSearch,
  Shield,
  ListChecks,
  Stars,
  GraduationCap as EduIcon,
  Award,
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

  const [resumes, setResumes] = useState([]);
  const [resumesLoading, setResumesLoading] = useState(true);

  // ✅ NEW: preview state (micro-previews + estimated time)
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

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
      "Azure",
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

  // ✅ NEW: frontend-safe fallback previews (if /api/jobs/preview fails)
  const buildPreviewFallback = ({
    jobTitle,
    company,
    keywords,
    studentMode: sm,
  }) => {
    const role = String(jobTitle || "this role").trim() || "this role";
    const org = String(company || "the company").trim() || "the company";
    const ks = Array.from(
      new Set((keywords || []).map((x) => String(x || "").trim()).filter(Boolean))
    ).slice(0, 6);

    const skillHint = ks.length ? ` (${ks.join(", ")})` : "";
    const studentHint = sm
      ? "projects, labs, and skills"
      : "experience, ownership, and measurable outcomes";

    return {
      estimatedSeconds: 15,
      resumePreview: {
        bullets: [
          `Tailored bullets to ${role} at ${org}${skillHint}, emphasizing ATS coverage + impact.`,
          `Reordered highlights to surface the most relevant ${studentHint} first for recruiter scan.`,
        ],
      },
      coverLetterPreview: {
        firstSentence: `I’m excited to apply for the ${role} role at ${org} and contribute quickly with reliable execution.`,
      },
      checklistPreview: {
        items: [
          ks.length
            ? `Ensure top keywords appear in Skills + Experience: ${ks
                .slice(0, 4)
                .join(", ")}.`
            : "Ensure top keywords appear in Skills + Experience sections.",
          sm
            ? "Add 1–2 quantified project outcomes (latency, uptime, automation, tickets)."
            : "Add 1–2 quantified wins (time saved, incidents reduced, SLA improved).",
        ],
      },
    };
  };

  // ✅ NEW: fetch micro-previews from backend
  const fetchPreviews = async ({
    jobTitle,
    company,
    keywords,
    jobDescription: jd,
    aiMode: mode,
    studentMode: sm,
  }) => {
    setPreviewLoading(true);
    try {
      const res = await fetch("/api/jobs/preview", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobTitle,
          company,
          keywords,
          jobDescription: jd,
          aiMode: mode,
          studentMode: sm,
        }),
      });

      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();

      // Light validation + normalize
      const bullets = Array.isArray(data?.resumePreview?.bullets)
        ? data.resumePreview.bullets.filter(Boolean).slice(0, 2)
        : [];
      const firstSentence =
        typeof data?.coverLetterPreview?.firstSentence === "string"
          ? data.coverLetterPreview.firstSentence
          : "";
      const items = Array.isArray(data?.checklistPreview?.items)
        ? data.checklistPreview.items.filter(Boolean).slice(0, 2)
        : [];

      const estimatedSeconds =
        typeof data?.estimatedSeconds === "number" &&
        Number.isFinite(data.estimatedSeconds)
          ? data.estimatedSeconds
          : 15;

      if (bullets.length < 2 || items.length < 2 || !firstSentence.trim()) {
        throw new Error("Preview payload incomplete");
      }

      setPreviewData({
        estimatedSeconds,
        resumePreview: { bullets },
        coverLetterPreview: { firstSentence },
        checklistPreview: { items },
      });
    } catch (e) {
      console.error(e);
      // fallback so UI still shows something
      setPreviewData(
        buildPreviewFallback({
          jobTitle,
          company,
          keywords,
          studentMode: sm,
        })
      );
    } finally {
      setPreviewLoading(false);
    }
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
      // reset previews on new analyze
      setPreviewData(null);

      const res = await fetch("/api/jobs/extract", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobDescription }),
      });

      if (!res.ok) throw new Error(await res.text());
      const extracted = await res.json();

      const nextExtracted = {
        jobTitle: extracted.jobTitle || "Position",
        company: extracted.company || "Company",
        website: extracted.website || null,
        location: extracted.location || null,
        seniority: extracted.seniority || null,
        keywords: Array.isArray(extracted.keywords) ? extracted.keywords : [],

        // pay
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

        // chips
        employmentType: extracted.employmentType || null,
        workModel: extracted.workModel || null,
        experienceLevel: extracted.experienceLevel || null,
        complianceTags: Array.isArray(extracted.complianceTags)
          ? extracted.complianceTags
          : [],

        // requirements (optional)
        requirements:
          extracted.requirements && typeof extracted.requirements === "object"
            ? {
                skillsRequired: Array.isArray(extracted.requirements.skillsRequired)
                  ? extracted.requirements.skillsRequired
                  : [],
                skillsPreferred: Array.isArray(extracted.requirements.skillsPreferred)
                  ? extracted.requirements.skillsPreferred
                  : [],
                educationRequired:
                  typeof extracted.requirements.educationRequired === "string"
                    ? extracted.requirements.educationRequired
                    : null,
                yearsExperienceMin:
                  typeof extracted.requirements.yearsExperienceMin === "number" &&
                  Number.isFinite(extracted.requirements.yearsExperienceMin)
                    ? extracted.requirements.yearsExperienceMin
                    : null,
                certificationsPreferred: Array.isArray(
                  extracted.requirements.certificationsPreferred
                )
                  ? extracted.requirements.certificationsPreferred
                  : [],
                workModelRequired:
                  typeof extracted.requirements.workModelRequired === "string"
                    ? extracted.requirements.workModelRequired
                    : null,
              }
            : null,
      };

      setExtractedData(nextExtracted);
      setShowConfirm(true);

      // ✅ NEW: fetch micro-previews after extraction (does not block UI)
      fetchPreviews({
        jobTitle: nextExtracted.jobTitle,
        company: nextExtracted.company,
        keywords: nextExtracted.keywords,
        jobDescription,
        aiMode,
        studentMode,
      });
    } catch (e) {
      console.error(e);
      const fallback = extractJobDetails(jobDescription);

      const nextExtracted = {
        ...fallback,
        payText: "Unknown",
        employmentType: null,
        workModel: null,
        experienceLevel: null,
        complianceTags: [],
        requirements: null,
      };

      setExtractedData(nextExtracted);
      setShowConfirm(true);

      // ✅ NEW: still attempt previews (fallback will fill)
      fetchPreviews({
        jobTitle: nextExtracted.jobTitle,
        company: nextExtracted.company,
        keywords: nextExtracted.keywords,
        jobDescription,
        aiMode,
        studentMode,
      });

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

  // ---------------------------
  // Job Autopilot Brand System
  // ---------------------------
  const pageBg =
    "bg-[radial-gradient(1100px_700px_at_10%_-10%,rgba(99,102,241,0.22),transparent_55%),radial-gradient(900px_600px_at_95%_0%,rgba(34,211,238,0.16),transparent_60%),radial-gradient(900px_650px_at_50%_110%,rgba(168,85,247,0.18),transparent_55%),linear-gradient(180deg,hsl(240,10%,6%),hsl(240,12%,5%))]";
  const surface =
    "bg-[linear-gradient(180deg,rgba(255,255,255,0.055),rgba(255,255,255,0.02))]";
  const edge =
    "border border-white/10 ring-1 ring-white/5"; // crisp edges
  const brandRing =
    "ring-1 ring-violet-400/20 border-violet-400/20"; // subtle brand identity
  const cardShadow = "shadow-[0_18px_60px_rgba(0,0,0,0.55)]";
  const ambient =
    "shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_18px_55px_rgba(0,0,0,0.60)]";
  const neonLine =
    "bg-gradient-to-r from-cyan-400/70 via-violet-400/55 to-indigo-400/70";

  // Interactive motion (unified)
  const hoverLift =
    "transition-transform duration-200 will-change-transform hover:scale-[1.012] hover:-translate-y-[1px]";
  const pressFx = "active:scale-[0.99]";
  const glowHover =
    "transition-shadow duration-200 hover:shadow-[0_0_0_1px_rgba(167,139,250,0.22),0_18px_60px_rgba(0,0,0,0.55),0_0_40px_rgba(34,211,238,0.10)]";

  const pill =
    "px-4 py-2 rounded-full text-sm font-medium bg-white/[0.06] text-white/85 border border-white/10";
  const pillBrand =
    "px-4 py-2 rounded-full text-sm font-semibold bg-violet-500/15 text-violet-100 border border-violet-400/25";
  const pillGood =
    "px-4 py-2 rounded-full text-sm font-semibold bg-emerald-500/14 text-emerald-100 border border-emerald-400/25";
  const pillWarn =
    "px-4 py-2 rounded-full text-sm font-semibold bg-amber-500/14 text-amber-100 border border-amber-400/25";

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
    const top = Math.round(100 - extractedData.payPercentile);
    return `Top ${top}% pay`;
  };

  // default resume detection (star)
  const isDefaultResume = (r) =>
    r?.isDefault === true || r?.default === true || r?.is_default === true;

  const req = extractedData?.requirements || null;
  const hasReq =
    !!req &&
    (req.skillsRequired?.length ||
      req.skillsPreferred?.length ||
      req.educationRequired ||
      req.yearsExperienceMin != null ||
      req.certificationsPreferred?.length ||
      req.workModelRequired);

  // ✅ NEW: preview blur styles (micro-previews)
  const previewBlurLine =
    "text-xs text-white/65 leading-relaxed blur-sm select-none";
  const previewBlurBlock =
    "mt-2 space-y-1 rounded-xl border border-white/10 bg-black/20 px-3 py-2 shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]";

  const previewSafe = previewData || null;
  const estSeconds =
    typeof previewSafe?.estimatedSeconds === "number" &&
    Number.isFinite(previewSafe.estimatedSeconds)
      ? Math.round(previewSafe.estimatedSeconds)
      : 15;

  const resumePreviewBullets = Array.isArray(previewSafe?.resumePreview?.bullets)
    ? previewSafe.resumePreview.bullets.slice(0, 2)
    : [];
  const coverPreviewSentence =
    typeof previewSafe?.coverLetterPreview?.firstSentence === "string"
      ? previewSafe.coverLetterPreview.firstSentence
      : "";
  const checklistPreviewItems = Array.isArray(previewSafe?.checklistPreview?.items)
    ? previewSafe.checklistPreview.items.slice(0, 2)
    : [];

  return (
    <div className={`min-h-screen ${pageBg} text-white`}>
      {/* Branded Header */}
      <header className="sticky top-0 z-50">
        <div className="border-b border-white/10 bg-black/35 backdrop-blur-xl">
          <div className={`h-[3px] ${neonLine}`} />
          <div className="w-full px-6 h-16 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div
                className={[
                  "w-10 h-10 rounded-xl",
                  "bg-[radial-gradient(circle_at_30%_20%,rgba(34,211,238,0.35),transparent_55%),radial-gradient(circle_at_70%_30%,rgba(167,139,250,0.35),transparent_55%),linear-gradient(180deg,rgba(99,102,241,0.28),rgba(0,0,0,0.15))]",
                  "border border-white/10 ring-1 ring-white/10",
                  "shadow-[0_12px_35px_rgba(0,0,0,0.6)]",
                ].join(" ")}
              >
                <div className="w-full h-full flex items-center justify-center">
                  <Rocket className="w-5 h-5 text-white" />
                </div>
              </div>

              <div className="flex flex-col leading-tight">
                <span className="font-bold tracking-tight text-white text-lg">
                  Job Autopilot
                </span>
                <span className="text-xs text-white/60">
                  Premium packet generation • ATS-safe workflow
                </span>
              </div>
            </div>

            {/* Reduced “exit anxiety” but still visible */}
            <Button
              variant="ghost"
              onClick={() => navigate(createPageUrl("AppHome"))}
              className={[
                "h-10 px-4 rounded-xl",
                "border border-white/10 text-white/60",
                "hover:text-white hover:bg-white/5 hover:border-white/15",
                "transition-all",
                hoverLift,
                pressFx,
              ].join(" ")}
            >
              Close
            </Button>
          </div>
        </div>
      </header>

      <div className="w-full px-6 py-8 min-h-[calc(100vh-4rem)]">
        {/* Analyzing Modal */}
        {isAnalyzing && (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/75 backdrop-blur-md">
            <div
              className={[
                "rounded-2xl p-10 max-w-md w-full mx-4",
                surface,
                edge,
                brandRing,
                ambient,
              ].join(" ")}
            >
              <div className="text-center">
                <div className="w-20 h-20 rounded-2xl bg-white/[0.04] flex items-center justify-center mx-auto mb-6 border border-white/10 ring-1 ring-violet-400/15 shadow-[0_0_45px_rgba(167,139,250,0.12)]">
                  <Loader2 className="w-10 h-10 text-violet-200 animate-spin" />
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">
                  Scanning job post…
                </h2>
                <p className="text-white/65 mb-7">
                  Building your packet blueprint
                </p>

                <div className="space-y-3 text-left">
                  <div className="flex items-center gap-3 text-sm text-white/85">
                    <div className="w-6 h-6 rounded-full bg-emerald-500/25 border border-emerald-400/25 flex items-center justify-center">
                      <Check className="w-4 h-4 text-emerald-100" />
                    </div>
                    <span className="flex items-center gap-2">
                      <ScanSearch className="w-4 h-4 text-cyan-200" />
                      Parsing structure + sections
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-sm text-white/85">
                    <div className="w-6 h-6 rounded-full bg-violet-500/18 border border-violet-400/20 flex items-center justify-center">
                      <Loader2 className="w-3.5 h-3.5 text-violet-100 animate-spin" />
                    </div>
                    <span className="flex items-center gap-2">
                      <DollarSign className="w-4 h-4 text-violet-200" />
                      Detecting role, company & pay
                    </span>
                  </div>

                  <div className="flex items-center gap-3 text-sm text-white/65">
                    <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      <Tag className="w-3.5 h-3.5 text-white/55" />
                    </div>
                    Extracting skills & requirements
                  </div>

                  <div className="flex items-center gap-3 text-sm text-white/65">
                    <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      <Shield className="w-3.5 h-3.5 text-white/55" />
                    </div>
                    Checking constraints (visa / on-site / seniority)
                  </div>

                  <div className="flex items-center gap-3 text-sm text-white/65">
                    <div className="w-6 h-6 rounded-full bg-white/5 border border-white/10 flex items-center justify-center">
                      <ListChecks className="w-3.5 h-3.5 text-white/55" />
                    </div>
                    Preparing packet draft
                  </div>

                  <div className="mt-5 pt-5 border-t border-white/10 flex items-center justify-center gap-2 text-xs text-white/60">
                    <Stars className="w-4 h-4 text-violet-200" />
                    AI mode:{" "}
                    <span className="font-semibold text-white/85">
                      {aiMode === "elite" ? "Elite" : "Standard"}
                    </span>
                    • Student mode:{" "}
                    <span className="font-semibold text-white/85">
                      {studentMode ? "On" : "Off"}
                    </span>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Confirmation Screen */}
        {showConfirm && extractedData && (
          <div className="w-full">
            <div className="mb-7 text-center">
              <h1 className="text-5xl font-bold text-white mb-2 tracking-tight">
                Confirm details
              </h1>
              <p className="text-lg text-white/70">
                Review extracted info before generating
              </p>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
              {/* Left */}
              <div
                className={[
                  "lg:col-span-2 rounded-2xl overflow-hidden",
                  surface,
                  edge,
                  brandRing,
                  cardShadow,
                ].join(" ")}
              >
                <div className={`h-1.5 ${neonLine}`} />
                <div className="p-8 md:p-10">
                  <div className="flex items-start justify-between gap-6">
                    <div className="min-w-0 flex-1">
                      <label className="text-sm text-white/60 mb-2 block">
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
                          className="bg-black/30 border-white/12 text-white h-12 text-lg rounded-xl focus-visible:ring-2 focus-visible:ring-cyan-300/40 focus-visible:ring-offset-0"
                        />
                      ) : (
                        <p className="text-3xl font-semibold text-white tracking-tight">
                          {extractedData.jobTitle}
                        </p>
                      )}

                      <div className="mt-6">
                        <label className="text-sm text-white/60 mb-2 block">
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
                            className="bg-black/30 border-white/12 text-white h-12 text-lg rounded-xl focus-visible:ring-2 focus-visible:ring-cyan-300/40 focus-visible:ring-offset-0"
                          />
                        ) : (
                          <p className="text-xl text-white/90 font-medium">
                            {extractedData.company}
                          </p>
                        )}
                      </div>

                      <div className="mt-5 space-y-3">
                        {extractedData.website && (
                          <div className="flex items-center gap-3 text-base text-white/80">
                            <Globe className="w-5 h-5 text-white/55" />
                            {editMode ? (
                              <Input
                                value={extractedData.website}
                                onChange={(e) =>
                                  setExtractedData({
                                    ...extractedData,
                                    website: e.target.value,
                                  })
                                }
                                className="bg-black/30 border-white/12 text-white h-11 text-base flex-1 rounded-xl focus-visible:ring-2 focus-visible:ring-cyan-300/40 focus-visible:ring-offset-0"
                              />
                            ) : (
                              <span className="truncate">{extractedData.website}</span>
                            )}
                          </div>
                        )}

                        {extractedData.location && (
                          <div className="flex items-center gap-3 text-base text-white/80">
                            <MapPin className="w-5 h-5 text-white/55" />
                            <span>{extractedData.location}</span>
                          </div>
                        )}

                        {extractedData.seniority && (
                          <div className="flex items-center gap-3 text-base text-white/80">
                            <BarChart2 className="w-5 h-5 text-white/55" />
                            <span>{extractedData.seniority}</span>
                          </div>
                        )}
                      </div>

                      <div className="mt-7">
                        <label className="text-sm text-white/60 mb-3 block flex items-center gap-2">
                          <Tag className="w-4 h-4" />
                          Job Details
                        </label>
                        <div className="flex flex-wrap gap-3">
                          {extractedData.employmentType && (
                            <span className={`${pill} flex items-center gap-2`}>
                              <Briefcase className="w-4 h-4 text-white/60" />
                              {extractedData.employmentType}
                            </span>
                          )}
                          {extractedData.workModel && (
                            <span className={`${pill} flex items-center gap-2`}>
                              <Building2 className="w-4 h-4 text-white/60" />
                              {extractedData.workModel}
                            </span>
                          )}
                          {extractedData.experienceLevel && (
                            <span className={`${pill} flex items-center gap-2`}>
                              <Clock className="w-4 h-4 text-white/60" />
                              {extractedData.experienceLevel}
                            </span>
                          )}
                          {Array.isArray(extractedData.complianceTags) &&
                            extractedData.complianceTags.slice(0, 6).map((tag, i) => (
                              <span key={i} className={`${pillBrand} flex items-center gap-2`}>
                                <ShieldCheck className="w-4 h-4 text-violet-100" />
                                {tag}
                              </span>
                            ))}
                        </div>
                      </div>

                      {(extractedData.payText ||
                        extractedData.payMin != null ||
                        extractedData.payMax != null ||
                        extractedData.payAnnualizedMin != null ||
                        extractedData.payAnnualizedMax != null) && (
                        <div className="mt-8">
                          <label className="text-sm text-white/60 mb-3 block flex items-center gap-2">
                            <DollarSign className="w-4 h-4" />
                            Compensation
                          </label>

                          <div className="flex flex-wrap gap-3">
                            {renderPayPrimary() && (
                              <span className={pillGood}>{renderPayPrimary()}</span>
                            )}
                            {renderConfidence() && (
                              <span className={pill}>{renderConfidence()}</span>
                            )}
                            {renderAnnual() && (
                              <span className={pillWarn}>{renderAnnual()}</span>
                            )}
                            {renderTopPay() && (
                              <span className={`${pillBrand} flex items-center gap-2`}>
                                <Percent className="w-4 h-4" />
                                {renderTopPay()}
                              </span>
                            )}
                          </div>

                          {typeof extractedData.payPercentile === "number" &&
                            extractedData.payPercentileSource && (
                              <p className="text-sm text-white/45 mt-3">
                                Percentile is an estimate ({extractedData.payPercentileSource})
                              </p>
                            )}
                        </div>
                      )}

                      {hasReq && (
                        <div className="mt-8">
                          <label className="text-sm text-white/60 mb-3 block flex items-center gap-2">
                            <ListChecks className="w-4 h-4" />
                            Requirements
                          </label>

                          <div className="space-y-4">
                            {(req?.educationRequired ||
                              req?.yearsExperienceMin != null ||
                              req?.workModelRequired) && (
                              <div className="flex flex-wrap gap-3">
                                {req?.educationRequired && (
                                  <span className={`${pill} flex items-center gap-2`}>
                                    <EduIcon className="w-4 h-4 text-white/60" />
                                    {req.educationRequired}
                                  </span>
                                )}
                                {req?.yearsExperienceMin != null && (
                                  <span className={`${pill} flex items-center gap-2`}>
                                    <Clock className="w-4 h-4 text-white/60" />
                                    {req.yearsExperienceMin}+ yrs
                                  </span>
                                )}
                                {req?.workModelRequired && (
                                  <span className={`${pillBrand} flex items-center gap-2`}>
                                    <Building2 className="w-4 h-4" />
                                    {req.workModelRequired} required
                                  </span>
                                )}
                              </div>
                            )}

                            {Array.isArray(req?.skillsRequired) && req.skillsRequired.length > 0 && (
                              <div>
                                <div className="text-xs uppercase tracking-wide text-white/55 mb-2">
                                  Required skills
                                </div>
                                <div className="flex flex-wrap gap-3">
                                  {req.skillsRequired.slice(0, 16).map((s, i) => (
                                    <span key={i} className={pillBrand}>
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {Array.isArray(req?.skillsPreferred) && req.skillsPreferred.length > 0 && (
                              <div>
                                <div className="text-xs uppercase tracking-wide text-white/55 mb-2">
                                  Preferred skills
                                </div>
                                <div className="flex flex-wrap gap-3">
                                  {req.skillsPreferred.slice(0, 12).map((s, i) => (
                                    <span key={i} className={pill}>
                                      {s}
                                    </span>
                                  ))}
                                </div>
                              </div>
                            )}

                            {Array.isArray(req?.certificationsPreferred) &&
                              req.certificationsPreferred.length > 0 && (
                                <div>
                                  <div className="text-xs uppercase tracking-wide text-white/55 mb-2">
                                    Certifications (preferred)
                                  </div>
                                  <div className="flex flex-wrap gap-3">
                                    {req.certificationsPreferred.slice(0, 12).map((c, i) => (
                                      <span key={i} className={`${pill} flex items-center gap-2`}>
                                        <Award className="w-4 h-4 text-white/60" />
                                        {c}
                                      </span>
                                    ))}
                                  </div>
                                </div>
                              )}
                          </div>
                        </div>
                      )}

                      {extractedData.keywords?.length > 0 && (
                        <div className="mt-8">
                          <label className="text-sm text-white/60 mb-3 block flex items-center gap-2">
                            <Tag className="w-4 h-4" />
                            Key Skills Detected
                          </label>
                          <div className="flex flex-wrap gap-3">
                            {extractedData.keywords.slice(0, 16).map((keyword, i) => (
                              <span key={i} className={pill}>
                                {keyword}
                              </span>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>

                    {!editMode && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setEditMode(true)}
                        className={[
                          "text-white/65 hover:text-white hover:bg-white/5 rounded-xl",
                          hoverLift,
                          pressFx,
                        ].join(" ")}
                      >
                        <Edit2 className="w-5 h-5" />
                      </Button>
                    )}
                  </div>

                  {editMode && (
                    <div className="mt-8 flex justify-end">
                      <Button
                        onClick={() => setEditMode(false)}
                        className={[
                          "h-12 px-7 text-lg font-semibold rounded-xl",
                          "bg-gradient-to-r from-violet-500/90 via-indigo-500/80 to-cyan-500/60",
                          "hover:from-violet-500 hover:via-indigo-500 hover:to-cyan-500/80",
                          "shadow-[0_18px_60px_rgba(0,0,0,0.55)]",
                          hoverLift,
                          pressFx,
                        ].join(" ")}
                      >
                        Save Changes
                      </Button>
                    </div>
                  )}
                </div>
              </div>

              {/* Right */}
              <div
                className={[
                  "rounded-2xl overflow-hidden",
                  surface,
                  edge,
                  brandRing,
                  cardShadow,
                ].join(" ")}
              >
                <div className={`h-1.5 ${neonLine}`} />
                <div className="p-8">
                  <h3 className="text-xl font-bold text-white mb-2 tracking-tight">
                    Packet preview
                  </h3>
                  <p className="text-sm text-white/60 mb-6">
                    What you’ll generate from this job post.
                  </p>

                  <div className="space-y-4">
                    <div
                      className={[
                        "flex items-start gap-3 p-4 rounded-2xl",
                        "bg-black/25 border border-white/10 ring-1 ring-white/5",
                        glowHover,
                        hoverLift,
                        pressFx,
                      ].join(" ")}
                    >
                      <FileText className="w-5 h-5 text-cyan-200 mt-0.5" />
                      <div className="w-full">
                        <p className="font-semibold text-white">Tailored Resume</p>
                        <p className="text-sm text-white/60">
                          Optimized bullets + keywords for ATS.
                        </p>

                        {/* ✅ NEW: Resume micro-preview */}
                        <div className={previewBlurBlock}>
                          {previewLoading && !previewSafe ? (
                            <>
                              <div className="h-3 rounded bg-white/10 w-[92%]" />
                              <div className="h-3 rounded bg-white/10 w-[84%]" />
                            </>
                          ) : (
                            <>
                              <div className={previewBlurLine}>
                                • {resumePreviewBullets?.[0] || "Tailored bullet line preview…"}
                              </div>
                              <div className={previewBlurLine}>
                                • {resumePreviewBullets?.[1] || "Second bullet line preview…"}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      className={[
                        "flex items-start gap-3 p-4 rounded-2xl",
                        "bg-black/25 border border-white/10 ring-1 ring-white/5",
                        glowHover,
                        hoverLift,
                        pressFx,
                      ].join(" ")}
                    >
                      <Wand2 className="w-5 h-5 text-violet-200 mt-0.5" />
                      <div className="w-full">
                        <p className="font-semibold text-white">Cover Letter</p>
                        <p className="text-sm text-white/60">
                          Matching tone to role + company.
                        </p>

                        {/* ✅ NEW: Cover letter micro-preview */}
                        <div className={previewBlurBlock}>
                          {previewLoading && !previewSafe ? (
                            <div className="h-3 rounded bg-white/10 w-[88%]" />
                          ) : (
                            <div className={previewBlurLine}>
                              {coverPreviewSentence || "First sentence preview…"}
                            </div>
                          )}
                        </div>
                      </div>
                    </div>

                    <div
                      className={[
                        "flex items-start gap-3 p-4 rounded-2xl",
                        "bg-black/25 border border-white/10 ring-1 ring-white/5",
                        glowHover,
                        hoverLift,
                        pressFx,
                      ].join(" ")}
                    >
                      <ClipboardCheck className="w-5 h-5 text-indigo-200 mt-0.5" />
                      <div className="w-full">
                        <p className="font-semibold text-white">Checklist</p>
                        <p className="text-sm text-white/60">
                          Next steps + quick apply notes.
                        </p>

                        {/* ✅ NEW: Checklist micro-preview */}
                        <div className={previewBlurBlock}>
                          {previewLoading && !previewSafe ? (
                            <>
                              <div className="h-3 rounded bg-white/10 w-[78%]" />
                              <div className="h-3 rounded bg-white/10 w-[86%]" />
                            </>
                          ) : (
                            <>
                              <div className={previewBlurLine}>
                                • {checklistPreviewItems?.[0] || "Checklist item preview…"}
                              </div>
                              <div className={previewBlurLine}>
                                • {checklistPreviewItems?.[1] || "Second checklist item preview…"}
                              </div>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* ✅ NEW: Estimated generation time */}
                  <div className="mt-5 flex items-center gap-2 text-xs text-white/60">
                    <Clock className="w-4 h-4 text-cyan-200" />
                    Generates in ~{estSeconds} seconds
                  </div>

                  <div
                    className={[
                      "mt-6 p-4 rounded-2xl",
                      "bg-[linear-gradient(180deg,rgba(167,139,250,0.12),rgba(34,211,238,0.06))]",
                      "border border-white/10 ring-1 ring-violet-400/15",
                      glowHover,
                      hoverLift,
                      pressFx,
                    ].join(" ")}
                  >
                    <p className="text-sm text-white/85">
                      Mode:{" "}
                      <span className="font-semibold text-white">
                        {aiMode === "elite" ? "Elite" : "Standard"}
                      </span>
                    </p>
                    <p className="text-sm text-white/60 mt-1">
                      Student mode:{" "}
                      <span className="font-semibold text-white/85">
                        {studentMode ? "On" : "Off"}
                      </span>
                    </p>
                  </div>
                </div>
              </div>
            </div>

            {/* Bottom buttons */}
            <div className="mt-7 flex flex-col sm:flex-row gap-4">
              <Button
                onClick={() => {
                  setShowConfirm(false);
                  setExtractedData(null);
                  // ✅ reset previews when leaving confirm
                  setPreviewData(null);
                }}
                variant="outline"
                className={[
                  "flex-1 h-14 rounded-2xl text-lg",
                  "bg-black/20 border border-white/10 text-white/80",
                  "hover:bg-white/5 hover:text-white hover:border-white/15",
                  hoverLift,
                  pressFx,
                ].join(" ")}
              >
                Back to Edit
              </Button>
              <Button
                onClick={handleGenerate}
                className={[
                  "flex-1 h-14 rounded-2xl text-lg font-semibold",
                  "bg-gradient-to-r from-violet-500/90 via-indigo-500/80 to-cyan-500/60",
                  "hover:from-violet-500 hover:via-indigo-500 hover:to-cyan-500/80",
                  "shadow-[0_18px_60px_rgba(0,0,0,0.55)]",
                  hoverLift,
                  pressFx,
                ].join(" ")}
              >
                Looks good — Generate Packet
              </Button>
            </div>
          </div>
        )}

        {/* Main Form */}
        {!showConfirm && (
          <div className="max-w-[1180px] mx-auto">
            <div className="mb-5 text-center">
              <h1 className="text-5xl font-bold mb-2 text-white tracking-tight">
                Create a new job packet
              </h1>
              <p className="text-lg text-white/70">
                Paste a job description — we’ll extract details automatically
              </p>
            </div>

            <div
              className={[
                "rounded-2xl p-7",
                surface,
                edge,
                brandRing,
                ambient,
              ].join(" ")}
            >
              {/* Top row */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
                {/* Resume selector */}
                <div
                  className={[
                    "rounded-2xl p-5",
                    "bg-black/25",
                    edge,
                    "ring-1 ring-violet-400/12",
                    glowHover,
                    hoverLift,
                    pressFx,
                  ].join(" ")}
                >
                  <label className="block text-lg font-semibold mb-2 text-white">
                    Resume <span className="text-rose-300">*</span>
                  </label>

                  {resumesLoading ? (
                    <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] text-center">
                      <p className="mb-0 text-sm text-white/60">Loading resumes…</p>
                    </div>
                  ) : hasResumes ? (
                    <Select value={selectedResume} onValueChange={setSelectedResume}>
                      <SelectTrigger
                        className={[
                          "h-14 text-lg rounded-2xl",
                          "bg-black/30 border-white/10 text-white",
                          "ring-1 ring-white/5",
                          "focus-visible:ring-2 focus-visible:ring-cyan-300/40 focus-visible:ring-offset-0",
                          hoverLift,
                          pressFx,
                        ].join(" ")}
                      >
                        <SelectValue placeholder="Select resume" />
                      </SelectTrigger>

                      <SelectContent className="bg-black border border-white/10 text-white shadow-2xl">
                        {resumes.map((resume) => {
                          const star = isDefaultResume(resume);
                          return (
                            <SelectItem
                              key={resume.id}
                              value={resume.id.toString()}
                              className={[
                                "text-white/90 rounded-md",
                                "focus:bg-violet-500/20 focus:text-white",
                                "data-[highlighted]:bg-violet-500/20 data-[highlighted]:text-white",
                                "hover:bg-violet-500/15",
                                "transition-transform duration-150 hover:scale-[1.01]",
                              ].join(" ")}
                            >
                              <span className="flex items-center gap-2">
                                {star && (
                                  <Star className="w-4 h-4 text-amber-200 fill-amber-200" />
                                )}
                                <span className="truncate">{resume.name}</span>
                              </span>
                            </SelectItem>
                          );
                        })}
                      </SelectContent>
                    </Select>
                  ) : (
                    <div className="p-4 rounded-2xl border border-white/10 bg-white/[0.03] text-center">
                      <p className="mb-3 text-sm text-white/60">No resumes found</p>
                      <Button
                        onClick={() => navigate(createPageUrl("Resumes"))}
                        className={[
                          "rounded-2xl",
                          "bg-gradient-to-r from-violet-500/90 via-indigo-500/80 to-cyan-500/60",
                          hoverLift,
                          pressFx,
                        ].join(" ")}
                      >
                        Upload Resume
                      </Button>
                    </div>
                  )}
                </div>

                {/* Student mode */}
                <div
                  className={[
                    "rounded-2xl p-5 flex items-start gap-3",
                    "bg-black/25",
                    edge,
                    "ring-1 ring-violet-400/12",
                    glowHover,
                    hoverLift,
                    pressFx,
                  ].join(" ")}
                >
                  <button
                    onClick={() => setStudentMode(!studentMode)}
                    className={[
                      "w-12 h-6 rounded-full transition-all relative",
                      "border border-white/10",
                      studentMode
                        ? "bg-gradient-to-r from-violet-500/80 to-cyan-500/50"
                        : "bg-white/10",
                    ].join(" ")}
                    aria-label="Toggle student mode"
                  >
                    <div
                      className={[
                        "absolute top-0.5 w-5 h-5 rounded-full bg-white",
                        "shadow-[0_10px_25px_rgba(0,0,0,0.45)] transition-all",
                        studentMode ? "left-6" : "left-0.5",
                      ].join(" ")}
                    />
                  </button>

                  <div className="flex-1">
                    <div className="flex items-center gap-2 mb-1">
                      <GraduationCap className="w-5 h-5 text-white/75" />
                      <span className="text-base font-medium text-white">
                        No experience / Student mode
                      </span>
                    </div>
                    <p className="text-sm text-white/60">
                      Emphasizes projects, coursework, and skills instead of work experience.
                    </p>

                    <div className="mt-3 text-xs text-white/60 flex items-center gap-2">
                      <Sparkles className="w-4 h-4 text-cyan-200" />
                      Built for interns, freshmen, and project-based resumes.
                    </div>
                  </div>
                </div>
              </div>

              {/* AI mode */}
              <div>
                <label className="block text-lg font-semibold mb-1 text-white">
                  AI Mode <span className="text-rose-300">*</span>
                </label>
                <p className="text-sm mb-3 text-white/65">
                  Choose how AI handles your resume content.
                </p>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <button
                    onClick={() => setAiMode("standard")}
                    className={[
                      "p-6 rounded-2xl border-2 text-left relative",
                      "transition-all",
                      hoverLift,
                      pressFx,
                      glowHover,
                      aiMode === "standard"
                        ? "border-emerald-400/35 bg-emerald-500/10 ring-1 ring-emerald-400/20"
                        : "border-white/10 bg-black/25 ring-1 ring-white/5 hover:border-white/15",
                    ].join(" ")}
                    style={{ minHeight: "200px" }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-emerald-500/12 border border-emerald-400/20 flex items-center justify-center">
                        <Check className="w-5 h-5 text-emerald-100" />
                      </div>
                      <span className="font-bold text-xl text-white">Standard</span>
                    </div>
                    <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-emerald-500/12 text-emerald-100 mb-3 font-semibold border border-emerald-400/20">
                      Recommended • Safe & ATS-friendly
                    </span>
                    <ul className="text-base leading-relaxed space-y-1 text-white/75">
                      <li>• Improves clarity and impact of your existing bullets</li>
                      <li>• Rewrites descriptions to match the job</li>
                      <li>• Optimizes wording and keywords</li>
                      <li className="font-semibold text-emerald-100/90">
                        • Does NOT create fake experience
                      </li>
                    </ul>
                  </button>

                  <button
                    onClick={() => setAiMode("elite")}
                    className={[
                      "p-6 rounded-2xl border-2 text-left relative",
                      "transition-all",
                      hoverLift,
                      pressFx,
                      glowHover,
                      aiMode === "elite"
                        ? "border-amber-400/35 bg-amber-500/10 ring-1 ring-amber-400/20"
                        : "border-white/10 bg-black/25 ring-1 ring-white/5 hover:border-white/15",
                    ].join(" ")}
                    style={{ minHeight: "200px" }}
                  >
                    <div className="flex items-center gap-3 mb-2">
                      <div className="w-10 h-10 rounded-xl bg-amber-500/12 border border-amber-400/20 flex items-center justify-center">
                        <Sparkles className="w-5 h-5 text-amber-100" />
                      </div>
                      <span className="font-bold text-xl text-white">Elite</span>
                    </div>
                    <span className="inline-block text-xs px-2.5 py-1 rounded-full bg-amber-500/12 text-amber-100 mb-3 font-semibold border border-amber-400/20">
                      Advanced • Use with discretion
                    </span>
                    <ul className="text-base leading-relaxed space-y-1 mb-2 text-white/75">
                      <li>• May create or enhance experience bullets</li>
                      <li>• Can infer responsibilities from context</li>
                      <li>• Designed to maximize callbacks</li>
                      <li className="font-semibold text-amber-100/90">
                        • Higher risk if verified by employer
                      </li>
                    </ul>

                    {aiMode === "elite" && (
                      <div className="mt-3 pt-3 border-t border-amber-400/15">
                        <p className="text-xs text-amber-100/90 flex items-start gap-2">
                          <span className="text-amber-100 font-bold">⚠</span>
                          <span>
                            Elite mode may generate inferred or mock experience. Use responsibly.
                          </span>
                        </p>
                      </div>
                    )}
                  </button>
                </div>
              </div>

              {/* Job description */}
              <div className="mt-4">
                <label className="block text-lg font-semibold mb-2 text-white">
                  Job Description <span className="text-rose-300">*</span>
                </label>
                <Textarea
                  value={jobDescription}
                  onChange={(e) => setJobDescription(e.target.value)}
                  placeholder=""
                  className={[
                    "min-h-[220px] resize-none text-base rounded-2xl",
                    "bg-black/30 border-white/10 text-white",
                    "leading-relaxed",
                    "shadow-[inset_0_1px_0_rgba(255,255,255,0.06)]",
                    "focus-visible:ring-2 focus-visible:ring-cyan-300/40 focus-visible:ring-offset-0",
                  ].join(" ")}
                />
                <p className="text-sm mt-2 text-white/60">
                  Paste the full job description. We’ll extract title, company, pay, and requirements.
                </p>
              </div>

              {/* CTA */}
              <div className="pt-3">
                <Button
                  onClick={handleAnalyze}
                  disabled={!selectedResume || !jobDescription.trim()}
                  className={[
                    "w-full h-14 rounded-2xl text-xl font-bold",
                    "bg-gradient-to-r from-violet-500/90 via-indigo-500/80 to-cyan-500/60",
                    "hover:from-violet-500 hover:via-indigo-500 hover:to-cyan-500/80",
                    "disabled:opacity-40 disabled:cursor-not-allowed",
                    "shadow-[0_18px_60px_rgba(0,0,0,0.55)]",
                    hoverLift,
                    pressFx,
                  ].join(" ")}
                >
                  Generate Packet
                </Button>
                <p className="text-center text-sm mt-2 text-white/60">
                  Uses 1 credit
                </p>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
