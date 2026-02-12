import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Rocket,
  Upload,
  FileText,
  Briefcase,
  Check,
  ChevronRight,
} from "lucide-react";
import { toast } from "sonner";

const targetRoles = [
  "Software Engineer",
  "Product Manager",
  "Designer",
  "Data Scientist",
  "Marketing Manager",
  "Sales",
  "Customer Success",
  "Other",
];
const seniorityLevels = [
  "Intern",
  "Junior",
  "Mid-Level",
  "Senior",
  "Lead",
  "Principal",
];
const locationPrefs = ["Remote", "Hybrid", "On-site"];
const tones = ["Professional", "Confident", "Concise"];

/**
 * ✅ SWA auth (NO JWT):
 * Call your /api/* endpoints normally. SWA uses cookies and injects identity headers server-side.
 */
async function apiFetch(path, { method = "GET", body } = {}) {
  const headers = { "Content-Type": "application/json" };

  const res = await fetch(path, {
    method,
    headers,
    credentials: "include", // ✅ important for SWA auth cookies
    body: body ? JSON.stringify(body) : undefined,
  });

  const text = await res.text();
  let data = null;
  try {
    data = text ? JSON.parse(text) : null;
  } catch {
    data = { raw: text };
  }

  return { ok: res.ok, status: res.status, data };
}

/**
 * Uploads the file to Azure Blob using the SAS URL returned by your backend.
 */
async function uploadToSasUrl(uploadUrl, file) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
      "x-ms-version": "2020-10-02",
      "Content-Type": file.type || "application/octet-stream",
    },
    body: file,
  });

  let text = "";
  try {
    text = await res.text();
  } catch {}

  return { ok: res.ok, status: res.status, text };
}

function StepDot({ active, label }) {
  return (
    <div className="flex items-center gap-3">
      <div
        className={`w-9 h-9 rounded-full flex items-center justify-center text-sm font-semibold transition-all ${
          active
            ? "bg-purple-600 text-white shadow-lg shadow-purple-500/25 ring-1 ring-purple-400/40"
            : "bg-white/5 text-white/50 border border-white/10"
        }`}
      >
        {label}
      </div>
    </div>
  );
}

function SectionCard({ title, icon: Icon, children, description }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-6">
      <div className="flex items-start gap-3 mb-4">
        {Icon ? (
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-purple-300" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-base md:text-lg font-semibold text-white">
            {title}
          </h3>
          {description ? (
            <p className="text-sm text-white/40 mt-1">{description}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function Setup() {
  const [step, setStep] = useState(1);
  const [resumeSource, setResumeSource] = useState("upload");
  const [uploadedFile, setUploadedFile] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const navigate = useNavigate();

  // Build from scratch fields
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [workExperience, setWorkExperience] = useState([
    { company: "", role: "", dates: "", bullets: "" },
  ]);
  const [education, setEducation] = useState([
    { school: "", degree: "", dates: "" },
  ]);
  const [skills, setSkills] = useState("");

  // Preferences
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [seniority, setSeniority] = useState("");
  const [locationPref, setLocationPref] = useState("");
  const [preferredCity, setPreferredCity] = useState("");
  const [tone, setTone] = useState("Professional");

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) setUploadedFile(file);
  };

  const addWorkExperience = () => {
    setWorkExperience([
      ...workExperience,
      { company: "", role: "", dates: "", bullets: "" },
    ]);
  };

  const updateWorkExperience = (index, field, value) => {
    const updated = [...workExperience];
    updated[index][field] = value;
    setWorkExperience(updated);
  };

  const generateResumeText = () => {
    const workSection = workExperience
      .filter((w) => w.company && w.role)
      .map((w) => `${w.role} at ${w.company} (${w.dates})\n${w.bullets}`)
      .join("\n\n");

    const eduSection = education
      .filter((e) => e.school && e.degree)
      .map((e) => `${e.degree}, ${e.school} (${e.dates})`)
      .join("\n");

    return `${fullName}
${email}${phone ? ` | ${phone}` : ""}${location ? ` | ${location}` : ""}
${linkedin ? `LinkedIn: ${linkedin}` : ""}

WORK EXPERIENCE

${workSection}

EDUCATION

${eduSection}

SKILLS
${skills}`;
  };

  const handleNext = () => {
    if (step === 1) {
      if (resumeSource === "upload" && !uploadedFile) {
        toast.error("Please upload a resume file");
        return;
      }
      if (resumeSource === "paste" && !resumeText.trim()) {
        toast.error("Please paste your resume text");
        return;
      }
      if (resumeSource === "build" && !fullName.trim()) {
        toast.error("Please enter at least your name");
        return;
      }
      if (resumeSource === "build") {
        setResumeText(generateResumeText());
      }
    }
    setStep(step + 1);
  };

  const toggleRole = (role) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const handleFinish = async () => {
    try {
      const preferences = {
        targetRoles: selectedRoles,
        seniority,
        locationPreference: locationPref,
        preferredCity,
        tone,
      };

      // Store preferences + onboarding flag like before (UI expects these)
      localStorage.setItem("preferences", JSON.stringify(preferences));
      localStorage.setItem("onboardingComplete", "true");

      // ✅ Upload mode: Blob + Cosmos (account-based)
      if (resumeSource === "upload") {
        if (!uploadedFile) {
          toast.error("Please upload a resume file");
          return;
        }

        // 1) Ask backend for SAS upload URL (SWA auth cookie will be used)
        const sasResp = await apiFetch("/api/resume/upload-url", {
          method: "POST",
          body: {
            fileName: uploadedFile.name,
            contentType: uploadedFile.type || "application/octet-stream",
          },
        });

        if (!sasResp.ok || !sasResp.data?.ok) {
          // Common case: not logged in -> backend returns 401
          if (sasResp.status === 401) {
            toast.error("You're not logged in. Please sign in again.");
            return;
          }
          const msg =
            sasResp.data?.error ||
            `Failed to get upload URL (HTTP ${sasResp.status})`;
          toast.error(msg);
          return;
        }

        const { uploadUrl, blobName } = sasResp.data;

        // 2) Upload directly to Blob using SAS
        const up = await uploadToSasUrl(uploadUrl, uploadedFile);
        if (!up.ok) {
          toast.error(
            `Upload failed (HTTP ${up.status}). Try PDF/DOCX and re-upload.`
          );
          return;
        }

        // 3) Save resume metadata into Cosmos (per-user, server derives userId)
        const saveResp = await apiFetch("/api/resume/save", {
          method: "POST",
          body: {
            blobName,
            originalName: uploadedFile.name,
            contentType: uploadedFile.type || "application/octet-stream",
            size: uploadedFile.size || 0,
          },
        });

        if (!saveResp.ok || !saveResp.data?.ok) {
          const msg =
            saveResp.data?.error ||
            `Failed to save resume (HTTP ${saveResp.status})`;
          toast.error(msg);
          return;
        }

        // Optional local cache so UI remains smooth
        const resumeData = {
          id: Date.now(),
          name: uploadedFile.name,
          source: "upload",
          blobName,
          created: new Date().toISOString(),
        };

        localStorage.setItem("resumes", JSON.stringify([resumeData]));
        localStorage.setItem("defaultResumeId", resumeData.id.toString());

        toast.success("Resume uploaded and saved to your account.");
      } else {
        // Paste/build are still local-only for now (no UI changes)
        const resumeData = {
          id: Date.now(),
          name: resumeSource === "paste" ? "Pasted Resume" : `${fullName} Resume`,
          content: resumeText,
          source: resumeSource,
          created: new Date().toISOString(),
        };

        localStorage.setItem("resumes", JSON.stringify([resumeData]));
        localStorage.setItem("defaultResumeId", resumeData.id.toString());

        toast.success("Setup complete! (Resume saved locally for now)");
      }

      navigate(createPageUrl("AppHome"));
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Something went wrong while saving your resume.");
    }
  };

  const handleSkip = () => {
    toast.error("Resume is required to continue. Please add your resume.");
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)] relative overflow-hidden">
      {/* subtle background accents */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-40 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full bg-purple-600/10 blur-3xl" />
        <div className="absolute -bottom-64 left-1/3 w-[700px] h-[420px] rounded-full bg-fuchsia-500/5 blur-3xl" />
      </div>

      {/* Header */}
      <header className="border-b border-white/5 bg-[hsl(240,10%,4%)]/70 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-purple-600 flex items-center justify-center shadow-lg shadow-purple-500/25 ring-1 ring-purple-400/20">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <div className="leading-tight">
              <div className="font-bold text-white text-[15px]">
                Job Autopilot
              </div>
              <div className="text-[11px] text-white/40">
                Profile setup • ~60 seconds
              </div>
            </div>
          </div>

          <div className="flex items-center gap-4">
            <div className="hidden sm:flex items-center gap-2 px-3 py-1.5 rounded-xl bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-400">
                Testing Mode: Setup shown every login
              </p>
            </div>

            <div className="flex items-center gap-2 text-sm text-white/40">
              <StepDot active={step >= 1} label="1" />
              <div className="w-10 h-px bg-white/10" />
              <StepDot active={step >= 2} label="2" />
            </div>
          </div>
        </div>

        {/* thin accent line */}
        <div className="h-px bg-gradient-to-r from-transparent via-purple-500/30 to-transparent" />
      </header>

      <div className="relative max-w-4xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <div className="text-center mb-10 sm:mb-12">
          <h1 className="text-3xl sm:text-4xl font-bold text-white tracking-tight">
            Let&apos;s set up your profile
          </h1>
          <p className="text-base sm:text-lg text-white/40 mt-3">
            Add your resume and preferences so we can tailor documents to you.
          </p>

          {/* progress bar */}
          <div className="mt-6 max-w-lg mx-auto">
            <div className="h-2 rounded-full bg-white/5 border border-white/10 overflow-hidden">
              <div
                className="h-full bg-purple-600/70"
                style={{ width: step === 1 ? "50%" : "100%" }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-xs text-white/40">
              <span className={step >= 1 ? "text-white/60" : ""}>
                Resume
              </span>
              <span className={step >= 2 ? "text-white/60" : ""}>
                Preferences
              </span>
            </div>
          </div>
        </div>

        {/* Step 1: Add Resume */}
        {step === 1 && (
          <div className="glass-card rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_80px_rgba(0,0,0,0.45)] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-6 mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  Step 1: Add your resume
                </h2>
                <p className="text-sm text-white/40 mt-1">
                  Upload a PDF/DOCX, paste text, or build quickly from scratch.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white/50">
                <span className="inline-block w-2 h-2 rounded-full bg-purple-400" />
                Secure • Account-linked
              </div>
            </div>

            <Tabs
              value={resumeSource}
              onValueChange={setResumeSource}
              className="mb-2"
            >
              <TabsList className="grid w-full grid-cols-3 bg-white/5 p-1.5 rounded-2xl border border-white/10">
                <TabsTrigger
                  value="upload"
                  className="rounded-xl data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/25 transition-all"
                >
                  <Upload className="w-4 h-4 mr-2" />
                  Upload
                </TabsTrigger>
                <TabsTrigger
                  value="paste"
                  className="rounded-xl data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/25 transition-all"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Paste Text
                </TabsTrigger>
                <TabsTrigger
                  value="build"
                  className="rounded-xl data-[state=active]:bg-purple-600 data-[state=active]:text-white data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/25 transition-all"
                >
                  <Briefcase className="w-4 h-4 mr-2" />
                  Build
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-6">
                <SectionCard
                  title="Upload your resume"
                  icon={Upload}
                  description="PDF or DOCX. Stored securely on your account."
                >
                  <div className="rounded-2xl border-2 border-dashed border-white/10 bg-black/10 p-6 sm:p-8 text-center hover:border-purple-500/40 transition-colors">
                    <div className="w-12 h-12 rounded-2xl bg-purple-500/10 border border-purple-500/10 flex items-center justify-center mx-auto mb-4">
                      <Upload className="w-6 h-6 text-purple-300" />
                    </div>

                    <p className="text-sm text-white/60">
                      Choose a file to upload
                    </p>
                    <p className="text-xs text-white/30 mt-1">
                      Best results: PDF or DOCX
                    </p>

                    <div className="mt-4 max-w-sm mx-auto">
                      <Input
                        type="file"
                        accept=".pdf,.doc,.docx"
                        onChange={handleFileUpload}
                        className="bg-white/5 border-white/10 text-white file:text-white file:bg-white/10 file:border-0 file:rounded-lg file:px-3 file:py-2 file:mr-3 hover:file:bg-white/15"
                      />
                    </div>

                    {uploadedFile && (
                      <div className="mt-5 inline-flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-sm text-white/70">
                        <FileText className="w-4 h-4 text-purple-300" />
                        <span className="max-w-[220px] truncate">
                          {uploadedFile.name}
                        </span>
                        <Check className="w-4 h-4 text-green-500" />
                      </div>
                    )}
                  </div>
                </SectionCard>
              </TabsContent>

              <TabsContent value="paste" className="mt-6">
                <SectionCard
                  title="Paste resume text"
                  icon={FileText}
                  description="Paste the full contents of your resume."
                >
                  <Textarea
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                    placeholder="Paste your resume text here..."
                    className="min-h-[320px] bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-2xl"
                  />
                  <div className="mt-3 text-xs text-white/35">
                    Tip: Keep section headers like “Experience”, “Education”, and
                    “Skills” for best parsing.
                  </div>
                </SectionCard>
              </TabsContent>

              <TabsContent value="build" className="mt-6 space-y-6">
                <SectionCard
                  title="Basic details"
                  icon={Briefcase}
                  description="Fill what you can—minimum required is your name."
                >
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="Full Name"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                    />
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="Email"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                    />
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="Phone (optional)"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                    />
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="Location (optional)"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                    />
                    <Input
                      value={linkedin}
                      onChange={(e) => setLinkedin(e.target.value)}
                      placeholder="LinkedIn (optional)"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl md:col-span-2"
                    />
                  </div>
                </SectionCard>

                <SectionCard
                  title="Work Experience"
                  icon={Briefcase}
                  description="Add roles and paste key bullet points."
                >
                  <div className="space-y-4">
                    {workExperience.map((w, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            value={w.company}
                            onChange={(e) =>
                              updateWorkExperience(idx, "company", e.target.value)
                            }
                            placeholder="Company"
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                          />
                          <Input
                            value={w.role}
                            onChange={(e) =>
                              updateWorkExperience(idx, "role", e.target.value)
                            }
                            placeholder="Role"
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                          />
                          <Input
                            value={w.dates}
                            onChange={(e) =>
                              updateWorkExperience(idx, "dates", e.target.value)
                            }
                            placeholder="Dates (e.g., 2023–2025)"
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl md:col-span-2"
                          />
                        </div>

                        <Textarea
                          value={w.bullets}
                          onChange={(e) =>
                            updateWorkExperience(idx, "bullets", e.target.value)
                          }
                          placeholder="Key achievements (bullet points)…"
                          className="mt-3 bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-2xl"
                        />
                      </div>
                    ))}

                    <Button
                      onClick={addWorkExperience}
                      variant="secondary"
                      className="bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl"
                    >
                      Add another role
                    </Button>
                  </div>
                </SectionCard>

                <SectionCard
                  title="Education"
                  icon={FileText}
                  description="Add your school, degree, and dates."
                >
                  <div className="space-y-4">
                    {education.map((e, idx) => (
                      <div
                        key={idx}
                        className="rounded-2xl border border-white/10 bg-white/[0.03] p-4"
                      >
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input
                            value={e.school}
                            onChange={(ev) => {
                              const updated = [...education];
                              updated[idx].school = ev.target.value;
                              setEducation(updated);
                            }}
                            placeholder="School"
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                          />
                          <Input
                            value={e.degree}
                            onChange={(ev) => {
                              const updated = [...education];
                              updated[idx].degree = ev.target.value;
                              setEducation(updated);
                            }}
                            placeholder="Degree"
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                          />
                          <Input
                            value={e.dates}
                            onChange={(ev) => {
                              const updated = [...education];
                              updated[idx].dates = ev.target.value;
                              setEducation(updated);
                            }}
                            placeholder="Dates"
                            className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl md:col-span-2"
                          />
                        </div>
                      </div>
                    ))}
                  </div>
                </SectionCard>

                <SectionCard
                  title="Skills"
                  icon={Check}
                  description="Comma-separated skills (e.g., React, Azure, SQL)."
                >
                  <Textarea
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    placeholder="Skills (comma-separated)…"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-2xl"
                  />
                </SectionCard>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Step 2: Preferences */}
        {step === 2 && (
          <div className="glass-card rounded-3xl border border-white/10 bg-white/[0.03] shadow-[0_20px_80px_rgba(0,0,0,0.45)] p-6 sm:p-8">
            <div className="flex items-start justify-between gap-6 mb-6">
              <div>
                <h2 className="text-xl sm:text-2xl font-bold text-white">
                  Step 2: Your preferences
                </h2>
                <p className="text-sm text-white/40 mt-1">
                  Helps generate cover letters and bullet points that match your
                  goals.
                </p>
              </div>
              <div className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-xl bg-white/5 border border-white/10 text-xs text-white/50">
                <span className="inline-block w-2 h-2 rounded-full bg-green-400" />
                Personalized outputs
              </div>
            </div>

            <div className="space-y-6">
              <SectionCard
                title="Target roles"
                icon={Briefcase}
                description="Pick what you want to apply for most often."
              >
                <div className="flex flex-wrap gap-2">
                  {targetRoles.map((role) => {
                    const active = selectedRoles.includes(role);
                    return (
                      <button
                        key={role}
                        onClick={() => toggleRole(role)}
                        className={`px-4 py-2 rounded-xl text-sm border transition-all duration-200 ${
                          active
                            ? "bg-purple-600 text-white border-purple-400/40 shadow-lg shadow-purple-500/20"
                            : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10 hover:text-white/75"
                        }`}
                      >
                        {role}
                      </button>
                    );
                  })}
                </div>
              </SectionCard>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <SectionCard title="Seniority" icon={Check}>
                  <Select value={seniority} onValueChange={setSeniority}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
                      <SelectValue placeholder="Select seniority" />
                    </SelectTrigger>
                    <SelectContent>
                      {seniorityLevels.map((level) => (
                        <SelectItem key={level} value={level}>
                          {level}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SectionCard>

                <SectionCard title="Location preference" icon={Check}>
                  <Select value={locationPref} onValueChange={setLocationPref}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
                      <SelectValue placeholder="Select preference" />
                    </SelectTrigger>
                    <SelectContent>
                      {locationPrefs.map((pref) => (
                        <SelectItem key={pref} value={pref}>
                          {pref}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </SectionCard>

                <div className="md:col-span-2">
                  <SectionCard
                    title="Preferred city"
                    icon={FileText}
                    description="Optional—used to prioritize nearby roles."
                  >
                    <Input
                      value={preferredCity}
                      onChange={(e) => setPreferredCity(e.target.value)}
                      placeholder="e.g., Dallas, TX"
                      className="bg-white/5 border-white/10 text-white placeholder:text-white/30 rounded-xl"
                    />
                  </SectionCard>
                </div>

                <div className="md:col-span-2">
                  <SectionCard
                    title="Tone for documents"
                    icon={FileText}
                    description="How your cover letters and bullets should sound."
                  >
                    <Select value={tone} onValueChange={setTone}>
                      <SelectTrigger className="bg-white/5 border-white/10 text-white rounded-xl">
                        <SelectValue placeholder="Select tone" />
                      </SelectTrigger>
                      <SelectContent>
                        {tones.map((t) => (
                          <SelectItem key={t} value={t}>
                            {t}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </SectionCard>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <Button
                  onClick={handleSkip}
                  variant="ghost"
                  className="text-white/50 hover:text-white hover:bg-white/5 rounded-xl"
                >
                  Skip
                </Button>

                <Button
                  onClick={handleFinish}
                  className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20 rounded-xl px-5"
                >
                  Finish setup
                  <ChevronRight className="w-4 h-4 ml-2" />
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Footer actions */}
        <div className="flex items-center justify-between mt-8">
          <Button
            onClick={() => setStep(Math.max(1, step - 1))}
            variant="ghost"
            disabled={step === 1}
            className="text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-30 rounded-xl"
          >
            Back
          </Button>

          {step === 1 && (
            <Button
              onClick={handleNext}
              className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20 rounded-xl px-5"
            >
              Continue
              <ChevronRight className="w-4 h-4 ml-2" />
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
