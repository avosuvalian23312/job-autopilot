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

  // ✅ preview state (micro-previews + estimated time)
  const [previewData, setPreviewData] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  // ✅ SWA user cache
  const [swaUserId, setSwaUserId] = useState("");

  // ✅ Generate loading overlay (same UX as Packet)
  const [isGeneratingPacket, setIsGeneratingPacket] = useState(false);

  // ---------------------------
  // Helpers
  // ---------------------------
  const apiFetch = async (path, options = {}) => {
    const res = await fetch(path, {
      ...options,
      credentials: "include", // ✅ SWA auth cookie
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
      throw new Error(msg);
    }

    return data;
  };

  const getSwaUser = async () => {
    const res = await fetch("/.auth/me", { credentials: "include" });
    if (!res.ok) return null;

    const data = await res.json().catch(() => null);
    if (!data) return null;

    // SWA can return either:
    // 1) [{ clientPrincipal: {...} }]
    // 2) { clientPrincipal: {...} }
    const cp = Array.isArray(data)
      ? data?.[0]?.clientPrincipal
      : data?.clientPrincipal;

    const userId = cp?.userId || null;
    return userId;
  };

  // ✅ Use cached user id when possible (avoid repeated /.auth/me calls)
  const ensureUserId = async () => {
    if (swaUserId) return swaUserId;

    const id = await getSwaUser(); // reads /.auth/me
    if (!id) {
      toast.error("You must be logged in.");
      throw new Error("Not authenticated");
    }
    setSwaUserId(id);
    return id;
  };

  // 🔒 IMPORTANT: Prevent caching/using direct blob URLs (private storage requires SAS URLs).
  // We keep ids + metadata only, and strip any non-SAS blob URLs from cached objects.
  const scrubDirectBlobUrls = (value) => {
    if (!value) return value;

    if (Array.isArray(value)) {
      return value.map(scrubDirectBlobUrls);
    }

    if (typeof value === "object") {
      const obj = { ...value };
      for (const k of Object.keys(obj)) {
        const v = obj[k];

        // Remove explicit blobUrl keys
        if (k === "blobUrl" || k.toLowerCase() === "bloburl") {
          delete obj[k];
          continue;
        }

        // Remove any *Url fields that are direct blob links (no SAS query string)
        if (
          typeof v === "string" &&
          v.includes(".blob.core.windows.net/") &&
          !v.includes("?")
        ) {
          if (k === "url" || k.toLowerCase().endsWith("url")) {
            delete obj[k];
            continue;
          }
        }

        // Recurse
        if (v && typeof v === "object") {
          obj[k] = scrubDirectBlobUrls(v);
        }
      }
      return obj;
    }

    return value;
  };

  // ✅ CLEAN junk skills/keywords (Indeed UI strings etc)
  const cleanSkillTokens = (arr, { max = 16 } = {}) => {
    const raw = Array.isArray(arr) ? arr : [];
    const norm = raw
      .map((x) =>
        String(x ?? "")
          .replace(/&nbsp;|\u00a0/gi, " ")
          .trim()
          .replace(/\s+/g, " ")
      )
      .filter(Boolean);

    const isNoise = (s) => {
      const t = s.toLowerCase();

      // remove obvious UI / junk strings
      if (t.startsWith("+")) return true;
      if (t === "(required)" || t === "required" || t === "preferred")
        return true;
      if (t.includes("show more")) return true;
      if (t.includes("job details")) return true;
      if (
        t.includes("here's how") ||
        t.includes("heres how") ||
        t.includes("align with your profile")
      )
        return true;
      if (t.includes("do you have experience") || t.includes("do you know"))
        return true;
      if (t.includes("languages")) return true;

      // remove pay-related tokens from skills (pay should show in Compensation)
      if (t === "pay" || t.includes("salary") || t.includes("compensation"))
        return true;
      if (s.includes("$") || /\b\d+\s*-\s*\d+\b/.test(t)) return true;
      if (/\b(hour|hr|year|yr|mo|month|week|wk|day)\b/i.test(s) && /\d/.test(s))
        return true;

      // remove long sentences / questions
      if (s.includes("?")) return true;
      if (s.split(" ").length > 3) return true;
      if (/^\(.*\)$/.test(s)) return true;

      return false;
    };

    const cleaned = norm.filter((s) => !isNoise(s));

    // dedupe (case-insensitive)
    const seen = new Set();
    const out = [];
    for (const s of cleaned) {
      const k = s.toLowerCase();
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(s);
    }

    return out.slice(0, max);
  };

  // ✅ pay fallback (if extractor missed pay fields but pay exists in junk text/JD)
  const extractPayFromText = (text) => {
    const t = String(text ?? "");
    const toNum = (v) => {
      const n = Number(String(v).replace(/,/g, ""));
      return Number.isFinite(n) ? n : null;
    };
    const toPeriod = (p) => {
      const x = String(p ?? "").toLowerCase();
      if (["hour", "hr", "hrs", "hourly"].includes(x)) return "hour";
      if (["year", "yr", "yrs", "annual", "annually", "yearly"].includes(x))
        return "year";
      if (["month", "mo", "monthly"].includes(x)) return "month";
      if (["week", "wk", "weekly"].includes(x)) return "week";
      if (["day", "daily"].includes(x)) return "day";
      return null;
    };

    const range =
      /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:-|–|to)\s*\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:per\s*)?(hour|hr|hrs|year|yr|yrs|annual|annually|month|mo|week|wk|day)\b/i;
    const single =
      /\$?\s*(\d{1,3}(?:,\d{3})*(?:\.\d+)?)\s*(?:per\s*)?(hour|hr|hrs|year|yr|yrs|annual|annually|month|mo|week|wk|day)\b/i;

    let m = t.match(range);
    if (m) {
      const min = toNum(m[1]);
      const max = toNum(m[2]);
      const period = toPeriod(m[3]);
      if (min != null || max != null) {
        return {
          payMin: min,
          payMax: max,
          payPeriod: period,
          payCurrency: "USD",
          payText: null,
        };
      }
    }

    m = t.match(single);
    if (m) {
      const v = toNum(m[1]);
      const period = toPeriod(m[2]);
      if (v != null) {
        return {
          payMin: v,
          payMax: null,
          payPeriod: period,
          payCurrency: "USD",
          payText: null,
        };
      }
    }

    return null;
  };

  // ---------------------------
  // Strong frontend corrections for "wrong role / wrong website"
  // (does NOT change UI; only improves extractedData before confirm)
  // ---------------------------
  const isGenericTitle = (t) => {
    const s = String(t || "").trim().toLowerCase();
    if (!s) return true;
    const bad = new Set([
      "position",
      "role",
      "job",
      "candidate",
      "applicant",
      "individual",
      "individuals",
      "engineer", // too generic alone
      "support", // too generic alone
    ]);
    if (bad.has(s)) return true;
    if (s.length < 4) return true;
    return false;
  };

  const inferTitleFromJD = (jd) => {
    const text = String(jd || "");

    // e.g. "Technical Support Engineer- job post"
    let m = text.match(/^([^\n]{4,90}?)\s*-\s*job\s*post\b/im);
    if (m?.[1]) return m[1].trim();

    // e.g. "Job Title\n\nTechnical Support Engineer"
    m = text.match(/(?:job\s*title|title)\s*[:\n]+\s*([^\n]{4,90})/i);
    if (m?.[1]) return m[1].trim();

    // First strong-looking line that isn't a UI label
    const lines = text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 12);

    for (const line of lines) {
      const l = line.toLowerCase();
      if (
        l.includes("job details") ||
        l.includes("full job description") ||
        l.includes("profile insights")
      )
        continue;
      if (l.includes("apply") && l.includes("company")) continue;
      if (line.length >= 6 && line.length <= 80 && /[a-zA-Z]/.test(line)) {
        // avoid lines that look like pay
        if (line.includes("$")) continue;
        return line;
      }
    }
    return null;
  };

  const inferCompanyFromJD = (jd, maybeTitle) => {
    const text = String(jd || "");
    const lines = text
      .split("\n")
      .map((x) => x.trim())
      .filter(Boolean)
      .slice(0, 18);

    // If the first line is title, company is often next 1–2 lines
    if (maybeTitle) {
      const idx = lines.findIndex((l) => l === maybeTitle);
      if (idx !== -1) {
        const next = lines[idx + 1] || "";
        if (
          next &&
          next.length <= 70 &&
          !next.includes("$") &&
          /[a-zA-Z]/.test(next)
        ) {
          return next.trim();
        }
      }
    }

    // "Company\nApplied Software Inc."
    let m = text.match(
      /(?:company|employer|organization)\s*[:\n]+\s*([^\n]{2,80})/i
    );
    if (m?.[1]) return m[1].trim();

    return null;
  };

  const pickBestWebsiteFromText = (jd) => {
    const text = String(jd || "");

    // Prefer explicit Website: fields
    let m = text.match(
      /(?:website)\s*:\s*(https?:\/\/[^\s)]+|www\.[^\s)]+)/i
    );
    if (m?.[1]) return m[1].trim();

    // Pick first non-social, non-jobboard URL
    const urls = Array.from(text.matchAll(/https?:\/\/[^\s)]+/gi)).map(
      (x) => x[0]
    );
    const isBadDomain = (u) => {
      const s = String(u).toLowerCase();
      return (
        s.includes("youtube.com") ||
        s.includes("facebook.com") ||
        s.includes("twitter.com") ||
        s.includes("x.com/") ||
        s.includes("linkedin.com") ||
        s.includes("indeed.com") ||
        s.includes("glassdoor.com")
      );
    };

    const good = urls.find((u) => !isBadDomain(u));
    if (good) return good;

    return urls[0] || null;
  };

  const refineExtracted = (data, jd) => {
    const next = { ...(data || {}) };
    const inferredTitle = inferTitleFromJD(jd);
    if (isGenericTitle(next.jobTitle) && inferredTitle)
      next.jobTitle = inferredTitle;

    const inferredCompany = inferCompanyFromJD(
      jd,
      inferredTitle || next.jobTitle
    );
    const companyStr = String(next.company || "").trim();
    if (!companyStr || companyStr.toLowerCase() === "company") {
      if (inferredCompany) next.company = inferredCompany;
    }

    const inferredWebsite = pickBestWebsiteFromText(jd);
    const websiteStr = String(next.website || "").trim();
    if (!websiteStr && inferredWebsite) next.website = inferredWebsite;

    // If extractor picked a social link, replace with best website
    if (websiteStr) {
      const w = websiteStr.toLowerCase();
      const isSocial =
        w.includes("youtube.com") ||
        w.includes("facebook.com") ||
        w.includes("twitter.com") ||
        w.includes("x.com/") ||
        w.includes("linkedin.com");
      if (isSocial && inferredWebsite) next.website = inferredWebsite;
    }

    return next;
  };

  // Build JD sent to /api/apply/prepare with strong overrides (keeps UI same)
  const buildJobDescriptionForApi = (jdRaw, extracted) => {
    const title = String(extracted?.jobTitle || "").trim();
    const company = String(extracted?.company || "").trim();
    const website = String(extracted?.website || "").trim();
    const location = String(extracted?.location || "").trim();

    const header = [
      title ? `Job Title: ${title}` : null,
      company ? `Company: ${company}` : null,
      website ? `Website: ${website}` : null,
      location ? `Location: ${location}` : null,
    ].filter(Boolean);

    if (!header.length) return String(jdRaw || "");
    return `${header.join("\n")}\n\n${String(jdRaw || "")}`;
  };

  // ✅ Build a payload that works whether backend expects fields at top-level OR inside jobData
  const buildJobCreatePayload = ({
    extracted,
    preparedJobData,
    jdRaw,
    sourceResumeId,
    tailoredResumeId,
    coverLetterId,
  }) => {
    const ex = extracted && typeof extracted === "object" ? extracted : {};
    const jd =
      preparedJobData && typeof preparedJobData === "object"
        ? preparedJobData
        : {};

    const pick = (a, b, fallback = null) => {
      const va =
        a !== undefined && a !== null && String(a).trim() !== "" ? a : null;
      if (va !== null) return va;
      const vb =
        b !== undefined && b !== null && String(b).trim() !== "" ? b : null;
      if (vb !== null) return vb;
      return fallback;
    };

    const jobFields = {
      jobTitle: pick(ex.jobTitle, jd.jobTitle, "Position"),
      company: pick(ex.company, jd.company, "Company"),
      website: pick(ex.website, jd.website, null),
      location: pick(ex.location, jd.location, null),
      seniority: pick(ex.seniority, jd.seniority, null),

      keywords:
        Array.isArray(ex.keywords) && ex.keywords.length
          ? ex.keywords
          : Array.isArray(jd.keywords)
          ? jd.keywords
          : [],

      requirements:
        ex.requirements && typeof ex.requirements === "object"
          ? ex.requirements
          : jd.requirements && typeof jd.requirements === "object"
          ? jd.requirements
          : null,

      payText: pick(ex.payText, jd.payText, null),
      payMin:
        typeof ex.payMin === "number" && Number.isFinite(ex.payMin)
          ? ex.payMin
          : typeof jd.payMin === "number" && Number.isFinite(jd.payMin)
          ? jd.payMin
          : null,
      payMax:
        typeof ex.payMax === "number" && Number.isFinite(ex.payMax)
          ? ex.payMax
          : typeof jd.payMax === "number" && Number.isFinite(jd.payMax)
          ? jd.payMax
          : null,
      payPeriod: pick(ex.payPeriod, jd.payPeriod, null),
      payCurrency: pick(ex.payCurrency, jd.payCurrency, "USD"),

      payConfidence:
        typeof ex.payConfidence === "number" && Number.isFinite(ex.payConfidence)
          ? ex.payConfidence
          : typeof jd.payConfidence === "number" &&
            Number.isFinite(jd.payConfidence)
          ? jd.payConfidence
          : null,
      payAnnualizedMin:
        typeof ex.payAnnualizedMin === "number" &&
        Number.isFinite(ex.payAnnualizedMin)
          ? ex.payAnnualizedMin
          : typeof jd.payAnnualizedMin === "number" &&
            Number.isFinite(jd.payAnnualizedMin)
          ? jd.payAnnualizedMin
          : null,
      payAnnualizedMax:
        typeof ex.payAnnualizedMax === "number" &&
        Number.isFinite(ex.payAnnualizedMax)
          ? ex.payAnnualizedMax
          : typeof jd.payAnnualizedMax === "number" &&
            Number.isFinite(jd.payAnnualizedMax)
          ? jd.payAnnualizedMax
          : null,
      payPercentile:
        typeof ex.payPercentile === "number" && Number.isFinite(ex.payPercentile)
          ? ex.payPercentile
          : typeof jd.payPercentile === "number" &&
            Number.isFinite(jd.payPercentile)
          ? jd.payPercentile
          : null,
      payPercentileSource: pick(ex.payPercentileSource, jd.payPercentileSource, null),

      employmentType: pick(ex.employmentType, jd.employmentType, null),
      workModel: pick(ex.workModel, jd.workModel, null),
      experienceLevel: pick(ex.experienceLevel, jd.experienceLevel, null),
      complianceTags:
        Array.isArray(ex.complianceTags) && ex.complianceTags.length
          ? ex.complianceTags
          : Array.isArray(jd.complianceTags)
          ? jd.complianceTags
          : [],
    };

    // Provide both formats for backend compatibility
    return {
      ...jobFields,
      jobData: jobFields,
      jobDescription: String(jdRaw || ""),
      jobUrl: null,

      // links to generated artifacts
      sourceResumeId: sourceResumeId || null,
      resumeId: sourceResumeId || null, // some backends call it resumeId
      tailoredResumeId: tailoredResumeId || null,
      coverLetterId: coverLetterId || null,

      // status hint (safe if backend ignores it)
      status: "generated",
      createdFrom: "NewJob",
    };
  };

  // ---------------------------
  // Fallback extraction
  // ---------------------------
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

  // ---------------------------
  // Previews
  // ---------------------------
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
      const data = await apiFetch("/api/jobs/preview", {
        method: "POST",
        body: JSON.stringify({
          jobTitle,
          company,
          keywords,
          jobDescription: jd,
          aiMode: mode,
          studentMode: sm,
        }),
      });

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
      setPreviewData(
        buildPreviewFallback({ jobTitle, company, keywords, studentMode: sm })
      );
    } finally {
      setPreviewLoading(false);
    }
  };

  useEffect(() => {
    // warm SWA user id (non-blocking)
    (async () => {
      try {
        const id = await getSwaUser();
        if (id) setSwaUserId(id);
      } catch {
        // ignore
      }
    })();
  }, []);

  // ---------------------------
  // Load resumes
  // ---------------------------
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

  // ---------------------------
  // Analyze + Generate
  // ---------------------------
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
      setPreviewData(null);

      const extracted = await apiFetch("/api/jobs/extract", {
        method: "POST",
        body: JSON.stringify({ jobDescription }),
      });

      let nextExtracted = {
        jobTitle: extracted?.jobTitle || "Position",
        company: extracted?.company || "Company",
        website: extracted?.website || null,
        location: extracted?.location || null,
        seniority: extracted?.seniority || null,
        keywords: Array.isArray(extracted?.keywords) ? extracted.keywords : [],

        payText: extracted?.payText || null,
        payMin:
          typeof extracted?.payMin === "number" &&
          Number.isFinite(extracted.payMin)
            ? extracted.payMin
            : null,
        payMax:
          typeof extracted?.payMax === "number" &&
          Number.isFinite(extracted.payMax)
            ? extracted.payMax
            : null,
        payCurrency: extracted?.payCurrency || "USD",
        payPeriod: extracted?.payPeriod || null,
        payConfidence:
          typeof extracted?.payConfidence === "number" &&
          Number.isFinite(extracted.payConfidence)
            ? extracted.payConfidence
            : null,
        payAnnualizedMin:
          typeof extracted?.payAnnualizedMin === "number" &&
          Number.isFinite(extracted.payAnnualizedMin)
            ? extracted.payAnnualizedMin
            : null,
        payAnnualizedMax:
          typeof extracted?.payAnnualizedMax === "number" &&
          Number.isFinite(extracted.payAnnualizedMax)
            ? extracted.payAnnualizedMax
            : null,
        payPercentile:
          typeof extracted?.payPercentile === "number" &&
          Number.isFinite(extracted.payPercentile)
            ? extracted.payPercentile
            : null,
        payPercentileSource: extracted?.payPercentileSource || null,

        employmentType: extracted?.employmentType || null,
        workModel: extracted?.workModel || null,
        experienceLevel: extracted?.experienceLevel || null,
        complianceTags: Array.isArray(extracted?.complianceTags)
          ? extracted.complianceTags
          : [],

        requirements:
          extracted?.requirements && typeof extracted.requirements === "object"
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

      if (nextExtracted.payMin === 0 && (nextExtracted.payMax ?? 0) > 0)
        nextExtracted.payMin = null;
      if (
        nextExtracted.payAnnualizedMin === 0 &&
        (nextExtracted.payAnnualizedMax ?? 0) > 0
      )
        nextExtracted.payAnnualizedMin = null;

      // ✅ If pay fields are missing, try to extract from JD + extracted lists
      const payTextBlob = [
        jobDescription,
        ...(Array.isArray(extracted?.keywords) ? extracted.keywords : []),
        ...(Array.isArray(extracted?.requirements?.skillsRequired)
          ? extracted.requirements.skillsRequired
          : []),
        ...(Array.isArray(extracted?.requirements?.skillsPreferred)
          ? extracted.requirements.skillsPreferred
          : []),
      ].join(" ");
      const payFallback = extractPayFromText(payTextBlob);

      if (
        payFallback &&
        nextExtracted.payMin == null &&
        nextExtracted.payMax == null &&
        !String(nextExtracted.payText || "").trim()
      ) {
        nextExtracted = { ...nextExtracted, ...payFallback };
      }

      // ✅ Clean keywords + requirement skills to remove UI junk
      nextExtracted = {
        ...nextExtracted,
        keywords: cleanSkillTokens(nextExtracted.keywords, { max: 16 }),
        requirements: nextExtracted.requirements
          ? {
              ...nextExtracted.requirements,
              skillsRequired: cleanSkillTokens(
                nextExtracted.requirements.skillsRequired,
                { max: 16 }
              ),
              skillsPreferred: cleanSkillTokens(
                nextExtracted.requirements.skillsPreferred,
                { max: 12 }
              ),
            }
          : null,
      };

      // ✅ Fix wrong role name / wrong website using deterministic parsing
      nextExtracted = refineExtracted(nextExtracted, jobDescription);

      setExtractedData(nextExtracted);
      setShowConfirm(true);

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

      let nextExtracted = {
        ...fallback,
        keywords: cleanSkillTokens(fallback.keywords, { max: 16 }),
        payText: "Unknown",
        employmentType: null,
        workModel: null,
        experienceLevel: null,
        complianceTags: [],
        requirements: null,
      };

      const payFallback = extractPayFromText(jobDescription);
      if (payFallback) nextExtracted = { ...nextExtracted, ...payFallback };

      // ✅ Fix wrong role name / wrong website using deterministic parsing
      nextExtracted = refineExtracted(nextExtracted, jobDescription);

      setExtractedData(nextExtracted);
      setShowConfirm(true);

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

  const AI_MODE_BACKEND = {
    standard: "STANDARD",
    elite: "ELITE",
  };

  const handleGenerate = async () => {
    let toastId = null;

    try {
      if (!extractedData?.jobTitle || !jobDescription.trim()) {
        toast.error("Missing job title or job description.");
        return;
      }

      // ✅ show same loading UX while this button-driven API flow runs
      setIsGeneratingPacket(true);

      // ensure logged in (no fallback)
      await ensureUserId();

      // call /api/apply/prepare (generates tailored PDF + cover letter + returns jobData)
      const jdForApi = buildJobDescriptionForApi(jobDescription, extractedData);

      toastId = toast.loading("Generating tailored resume + cover letter…");

      const prepared = await apiFetch("/api/apply/prepare", {
        method: "POST",
        body: JSON.stringify({
          resumeId: selectedResume,
          jobDescription: jdForApi,
          jobUrl: null,

          // backend accepts STANDARD/ELITE but lowercases it anyway
          aiMode: AI_MODE_BACKEND[aiMode] || "STANDARD",

          // ✅ must be inside the JSON body
          studentMode: !!studentMode,
        }),
      });

      // ✅ CRITICAL: do NOT cache direct blob URLs anywhere (private storage => must use /api/resume/sas)
      localStorage.removeItem("latestTailoredResumeBlobUrl");
      localStorage.removeItem("latestTailoredResumePdfUrl");
      localStorage.removeItem("latestTailoredResumeUrl");

      const preparedSafe = scrubDirectBlobUrls(
        JSON.parse(JSON.stringify(prepared || {}))
      );

      localStorage.setItem("latestPrepareResult", JSON.stringify(preparedSafe));

      const jobData = preparedSafe?.jobData || null;
      const tailoredResume = preparedSafe?.tailoredResume || null;
      const coverLetter = preparedSafe?.coverLetter || null;

      if (tailoredResume?.id)
        localStorage.setItem("latestTailoredResumeId", String(tailoredResume.id));
      if (coverLetter?.id)
        localStorage.setItem("latestCoverLetterId", String(coverLetter.id));
      if (typeof coverLetter?.text === "string")
        localStorage.setItem("latestCoverLetterText", coverLetter.text);
      if (jobData) localStorage.setItem("latestJobData", JSON.stringify(jobData));
      localStorage.setItem("latestSourceResumeId", String(selectedResume || ""));

      // ✅ NEW: Save the job to DB via Jobs API (this was missing)
      // This is the fix for: "newjob isnt sending the jobs api to save it in the db"
      let savedJob = null;
      try {
        const payload = buildJobCreatePayload({
          extracted: extractedData,
          preparedJobData: jobData,
          jdRaw: jobDescription,
          sourceResumeId: selectedResume,
          tailoredResumeId: tailoredResume?.id || null,
          coverLetterId: coverLetter?.id || null,
        });

        // keep a local copy so you can inspect/retry if backend rejects
        const payloadSafe = scrubDirectBlobUrls(
          JSON.parse(JSON.stringify(payload || {}))
        );
        localStorage.setItem("latestJobCreatePayload", JSON.stringify(payloadSafe));

        // Primary create endpoint
        savedJob = await apiFetch("/api/jobs", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        if (savedJob?.id != null) {
          localStorage.setItem("latestJobId", String(savedJob.id));
        }
      } catch (saveErr) {
        console.error("Job save failed:", saveErr);
        // Do NOT block packet navigation; just notify.
        toast.error("Packet generated, but saving the job failed (see console).");
      }

      const packetTitle = String(
        extractedData?.jobTitle || jobData?.jobTitle || "Position"
      );
      const packetCompany = String(
        extractedData?.company || jobData?.company || "Company"
      );

      toast.success(`Packet generated: ${packetTitle} @ ${packetCompany}`, {
        id: toastId,
      });
      toastId = null;

      const qs = new URLSearchParams();
      qs.set("mode", "prepare");
      if (tailoredResume?.id) qs.set("resumeId", String(tailoredResume.id));
      if (coverLetter?.id) qs.set("coverLetterId", String(coverLetter.id));
      if (savedJob?.id != null) qs.set("jobId", String(savedJob.id)); // safe extra param

      navigate(`/packet?${qs.toString()}`);
    } catch (e) {
      console.error(e);
      if (toastId) toast.dismiss(toastId);
      toast.error(e?.message || "Failed to generate packet.");
    } finally {
      setIsGeneratingPacket(false);
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
  const edge = "border border-white/10 ring-1 ring-white/5";
  const brandRing = "ring-1 ring-violet-400/20 border-violet-400/20";
  const cardShadow = "shadow-[0_18px_60px_rgba(0,0,0,0.55)]";
  const ambient =
    "shadow-[0_0_0_1px_rgba(255,255,255,0.03),0_18px_55px_rgba(0,0,0,0.60)]";
  const neonLine =
    "bg-gradient-to-r from-cyan-400/70 via-violet-400/55 to-indigo-400/70";

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

  const normalizePayPeriod = (val) => {
    const p = String(val ?? "").trim().toLowerCase();
    if (!p) return null;

    if (["hour", "hourly", "hr", "/hr"].includes(p)) return "hour";
    if (["year", "yearly", "yr", "annual", "annually", "/yr"].includes(p))
      return "year";
    if (["month", "monthly", "mo", "/mo"].includes(p)) return "month";
    if (["week", "weekly", "wk", "/wk"].includes(p)) return "week";
    if (["day", "daily", "/day"].includes(p)) return "day";

    return p;
  };

  const fmtMoney = (n) =>
    typeof n === "number"
      ? n.toLocaleString(undefined, { maximumFractionDigits: 0 })
      : null;

  const renderPayPrimary = (job) => {
    const cur = job?.payCurrency || "USD";
    const symbol = cur === "USD" ? "$" : `${cur} `;

    const periodMap = {
      hour: "/hr",
      year: "/yr",
      month: "/mo",
      week: "/wk",
      day: "/day",
    };

    const periodKey = normalizePayPeriod(job?.payPeriod);
    const suffix = periodKey ? periodMap[periodKey] || "" : "";

    const minNum =
      typeof job?.payMin === "number" && Number.isFinite(job.payMin)
        ? job.payMin
        : null;

    const maxNum =
      typeof job?.payMax === "number" && Number.isFinite(job.payMax)
        ? job.payMax
        : null;

    // ✅ If one side is 0 and the other side is positive, treat 0 as "missing"
    const minFixed = minNum === 0 && (maxNum ?? 0) > 0 ? null : minNum;
    const maxFixed = maxNum === 0 && (minNum ?? 0) > 0 ? null : maxNum;

    const min = fmtMoney(minFixed);
    const max = fmtMoney(maxFixed);

    if (min && max) {
      return min === max
        ? `${symbol}${min}${suffix}`
        : `${symbol}${min} – ${symbol}${max}${suffix}`;
    }
    if (min) return `${symbol}${min}${suffix}`;
    if (max) return `${symbol}${max}${suffix}`;

    const t = typeof job?.payText === "string" ? job.payText.trim() : "";
    if (t) return t;

    return null;
  };

  const renderAnnual = (job) => {
    const minA =
      typeof job?.payAnnualizedMin === "number" ? job.payAnnualizedMin : null;
    const maxA =
      typeof job?.payAnnualizedMax === "number" ? job.payAnnualizedMax : null;

    const minAFixed = minA === 0 && (maxA ?? 0) > 0 ? null : minA;
    const maxAFixed = maxA === 0 && (minA ?? 0) > 0 ? null : maxA;

    const minS = fmtMoney(minAFixed);
    const maxS = fmtMoney(maxAFixed);

    if (minS && maxS) return `Est. $${minS} – $${maxS} /yr`;
    if (minS) return `Est. $${minS} /yr`;
    if (maxS) return `Est. $${maxS} /yr`;
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
  const checklistPreviewItems = Array.isArray(
    previewSafe?.checklistPreview?.items
  )
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

      <div className="w-full px-6 py-8 min-h-[calc(100vh-4rem)] relative">
        {/* ✅ Generate loading overlay (same UX as Packet) */}
        {isGeneratingPacket && (
          <div className="fixed inset-0 z-[60] flex items-center justify-center">
            <div className="absolute inset-0 bg-black/55 backdrop-blur-md" />
            <div className="relative z-10 flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/10 border border-white/15 shadow-2xl">
              <Loader2 className="w-5 h-5 text-white animate-spin" />
              <span className="text-white/85 text-sm font-medium">
                Generating packet…
              </span>
            </div>
          </div>
        )}

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
                    </span>{" "}
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
          <div className="w-full relative">
            {/* Blur content while generating */}
            <div
              className={
                isGeneratingPacket ? "pointer-events-none select-none blur-[1px]" : ""
              }
              aria-busy={isGeneratingPacket}
            >
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
                                <span className="truncate">
                                  {extractedData.website}
                                </span>
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
                              extractedData.complianceTags
                                .slice(0, 6)
                                .map((tag, i) => (
                                  <span
                                    key={i}
                                    className={`${pillBrand} flex items-center gap-2`}
                                  >
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
                              {renderPayPrimary(extractedData) && (
                                <span className={pillGood}>
                                  {renderPayPrimary(extractedData)}
                                </span>
                              )}
                              {renderConfidence() && (
                                <span className={pill}>{renderConfidence()}</span>
                              )}
                              {renderAnnual(extractedData) && (
                                <span className={pillWarn}>
                                  {renderAnnual(extractedData)}
                                </span>
                              )}
                              {renderTopPay() && (
                                <span
                                  className={`${pillBrand} flex items-center gap-2`}
                                >
                                  <Percent className="w-4 h-4" />
                                  {renderTopPay()}
                                </span>
                              )}
                            </div>

                            {typeof extractedData.payPercentile === "number" &&
                              extractedData.payPercentileSource && (
                                <p className="text-sm text-white/45 mt-3">
                                  Percentile is an estimate (
                                  {extractedData.payPercentileSource})
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
                                    <span
                                      className={`${pill} flex items-center gap-2`}
                                    >
                                      <EduIcon className="w-4 h-4 text-white/60" />
                                      {req.educationRequired}
                                    </span>
                                  )}
                                  {req?.yearsExperienceMin != null && (
                                    <span
                                      className={`${pill} flex items-center gap-2`}
                                    >
                                      <Clock className="w-4 h-4 text-white/60" />
                                      {req.yearsExperienceMin}+ yrs
                                    </span>
                                  )}
                                  {req?.workModelRequired && (
                                    <span
                                      className={`${pillBrand} flex items-center gap-2`}
                                    >
                                      <Building2 className="w-4 h-4" />
                                      {req.workModelRequired} required
                                    </span>
                                  )}
                                </div>
                              )}

                              {Array.isArray(req?.skillsRequired) &&
                                req.skillsRequired.length > 0 && (
                                  <div>
                                    <div className="text-xs uppercase tracking-wide text-white/55 mb-2">
                                      Required skills
                                    </div>
                                    <div className="flex flex-wrap gap-3">
                                      {req.skillsRequired
                                        .slice(0, 16)
                                        .map((s, i) => (
                                          <span key={i} className={pillBrand}>
                                            {s}
                                          </span>
                                        ))}
                                    </div>
                                  </div>
                                )}

                              {Array.isArray(req?.skillsPreferred) &&
                                req.skillsPreferred.length > 0 && (
                                  <div>
                                    <div className="text-xs uppercase tracking-wide text-white/55 mb-2">
                                      Preferred skills
                                    </div>
                                    <div className="flex flex-wrap gap-3">
                                      {req.skillsPreferred
                                        .slice(0, 12)
                                        .map((s, i) => (
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
                                      {req.certificationsPreferred
                                        .slice(0, 12)
                                        .map((c, i) => (
                                          <span
                                            key={i}
                                            className={`${pill} flex items-center gap-2`}
                                          >
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
                              {extractedData.keywords
                                .slice(0, 16)
                                .map((keyword, i) => (
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

                          <div className={previewBlurBlock}>
                            {previewLoading && !previewSafe ? (
                              <>
                                <div className="h-3 rounded bg-white/10 w-[92%]" />
                                <div className="h-3 rounded bg-white/10 w-[84%]" />
                              </>
                            ) : (
                              <>
                                <div className={previewBlurLine}>
                                  •{" "}
                                  {resumePreviewBullets?.[0] ||
                                    "Tailored bullet line preview…"}
                                </div>
                                <div className={previewBlurLine}>
                                  •{" "}
                                  {resumePreviewBullets?.[1] ||
                                    "Second bullet line preview…"}
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

                          <div className={previewBlurBlock}>
                            {previewLoading && !previewSafe ? (
                              <>
                                <div className="h-3 rounded bg-white/10 w-[78%]" />
                                <div className="h-3 rounded bg-white/10 w-[86%]" />
                              </>
                            ) : (
                              <>
                                <div className={previewBlurLine}>
                                  •{" "}
                                  {checklistPreviewItems?.[0] ||
                                    "Checklist item preview…"}
                                </div>
                                <div className={previewBlurLine}>
                                  •{" "}
                                  {checklistPreviewItems?.[1] ||
                                    "Second checklist item preview…"}
                                </div>
                              </>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>

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
                    setPreviewData(null);
                  }}
                  variant="outline"
                  disabled={isGeneratingPacket}
                  className={[
                    "flex-1 h-14 rounded-2xl text-lg",
                    "bg-black/20 border border-white/10 text-white/80",
                    "hover:bg-white/5 hover:text-white hover:border-white/15",
                    "disabled:opacity-60 disabled:cursor-not-allowed",
                    hoverLift,
                    pressFx,
                  ].join(" ")}
                >
                  Back to Edit
                </Button>
                <Button
                  onClick={handleGenerate}
                  disabled={isGeneratingPacket}
                  className={[
                    "flex-1 h-14 rounded-2xl text-lg font-semibold",
                    "bg-gradient-to-r from-violet-500/90 via-indigo-500/80 to-cyan-500/60",
                    "hover:from-violet-500 hover:via-indigo-500 hover:to-cyan-500/80",
                    "disabled:opacity-70 disabled:cursor-not-allowed",
                    "shadow-[0_18px_60px_rgba(0,0,0,0.55)]",
                    hoverLift,
                    pressFx,
                  ].join(" ")}
                >
                  {isGeneratingPacket ? (
                    <>
                      <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                      Generating…
                    </>
                  ) : (
                    "Looks good — Generate Packet"
                  )}
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Main Form */}
        {!showConfirm && (
          <div
            className={
              isAnalyzing ? "pointer-events-none select-none blur-[1px]" : ""
            }
            aria-busy={isAnalyzing}
          >
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
                className={["rounded-2xl p-7", surface, edge, brandRing, ambient].join(
                  " "
                )}
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
                      <Select
                        value={selectedResume}
                        onValueChange={setSelectedResume}
                      >
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
                        Emphasizes projects, coursework, and skills instead of work
                        experience.
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
                        <span className="font-bold text-xl text-white">
                          Standard
                        </span>
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
                              Elite mode may generate inferred or mock experience.
                              Use responsibly.
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
                    Paste the full job description. We’ll extract title, company,
                    pay, and requirements.
                  </p>
                </div>

                {/* CTA */}
                <div className="pt-3">
                  <Button
                    onClick={handleAnalyze}
                    disabled={!selectedResume || !jobDescription.trim() || isAnalyzing}
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
                    {isAnalyzing ? (
                      <>
                        <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                        Scanning…
                      </>
                    ) : (
                      "Generate Packet"
                    )}
                  </Button>
                  <p className="text-center text-sm mt-2 text-white/60">
                    Uses 1 credit
                  </p>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
