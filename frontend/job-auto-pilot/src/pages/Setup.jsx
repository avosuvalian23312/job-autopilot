import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Rocket, Upload, FileText, Briefcase, Check, ChevronRight } from "lucide-react";
import { toast } from "sonner";

const targetRoles = ["Software Engineer", "Product Manager", "Designer", "Data Scientist", "Marketing Manager", "Sales", "Customer Success", "Other"];
const seniorityLevels = ["Intern", "Junior", "Mid-Level", "Senior", "Lead", "Principal"];
const locationPrefs = ["Remote", "Hybrid", "On-site"];
const tones = ["Professional", "Confident", "Concise"];

/**
 * Reads your stored app JWT from localStorage.
 * Supports multiple key names so it works with whatever your auth UI saved.
 */
function getStoredAppToken() {
  const keys = ["APP_TOKEN", "appToken", "app_token", "appJwt", "authToken", "token"];
  for (const k of keys) {
    let v = localStorage.getItem(k);
    if (!v || typeof v !== "string") continue;

    // strip accidental quotes
    v = v.replace(/^"|"$/g, "").trim();

    // strip accidental "Bearer "
    v = v.replace(/^Bearer\s+/i, "").trim();

    if (v) return v;
  }
  return null;
}

/**
 * Simple helper for calling your SWA API with JSON + Bearer token.
 * IMPORTANT: include credentials so cookie-based auth (if present) also works.
 */
async function apiFetch(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };

  if (token) {
    const clean = String(token).replace(/^Bearer\s+/i, "").trim();
    headers["Authorization"] = `Bearer ${clean}`;
  }

  export async function apiFetch(path, opts = {}) {
  const method = opts.method || "GET";

  // ✅ always prefer your app JWT
  const appToken =
    opts.token ||
    localStorage.getItem("APP_TOKEN") ||
    localStorage.getItem("appToken") ||
    null;

  const headers = {
    ...(opts.headers || {}),
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(appToken ? { Authorization: `Bearer ${appToken}` } : {}),
  };

  const res = await fetch(path, {
    method,
    headers,
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data;
  try { data = text ? JSON.parse(text) : {}; } catch { data = { raw: text }; }

  if (!res.ok) {
    throw new Error(data?.error || `HTTP ${res.status}`);
  }
  return data;
}

/**
 * Uploads the file to Azure Blob using the SAS URL returned by your backend.
 */
async function uploadToSasUrl(uploadUrl, file) {
  const res = await fetch(uploadUrl, {
    method: "PUT",
    headers: {
      "x-ms-blob-type": "BlockBlob",
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
  const [workExperience, setWorkExperience] = useState([{ company: "", role: "", dates: "", bullets: "" }]);
  const [education, setEducation] = useState([{ school: "", degree: "", dates: "" }]);
  const [skills, setSkills] = useState("");

  // Preferences
  const [selectedRoles, setSelectedRoles] = useState([]);
  const [seniority, setSeniority] = useState("");
  const [locationPref, setLocationPref] = useState("");
  const [preferredCity, setPreferredCity] = useState("");
  const [tone, setTone] = useState("Professional");

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      setUploadedFile(file);
    }
  };

  const addWorkExperience = () => {
    setWorkExperience([...workExperience, { company: "", role: "", dates: "", bullets: "" }]);
  };

  const updateWorkExperience = (index, field, value) => {
    const updated = [...workExperience];
    updated[index][field] = value;
    setWorkExperience(updated);
  };

  const generateResumeText = () => {
    const workSection = workExperience
      .filter(w => w.company && w.role)
      .map(w => `${w.role} at ${w.company} (${w.dates})\n${w.bullets}`)
      .join("\n\n");

    const eduSection = education
      .filter(e => e.school && e.degree)
      .map(e => `${e.degree}, ${e.school} (${e.dates})`)
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
    setSelectedRoles(prev =>
      prev.includes(role) ? prev.filter(r => r !== role) : [...prev, role]
    );
  };

  const handleFinish = async () => {
    try {
      const preferences = {
        targetRoles: selectedRoles,
        seniority,
        locationPreference: locationPref,
        preferredCity,
        tone
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

        const token = getStoredAppToken();
        if (!token) {
          toast.error("You're not logged in. Please sign in again.");
          return;
        }

        // 1) Ask backend for SAS upload URL
        const sasResp = await apiFetch("/api/resume/upload-url", {
          method: "POST",
          token,
          body: {
            fileName: uploadedFile.name,
            contentType: uploadedFile.type || "application/octet-stream",
          },
        });

        if (!sasResp.ok || !sasResp.data?.ok) {
          const msg = sasResp.data?.error || `Failed to get upload URL (HTTP ${sasResp.status})`;
          toast.error(msg);
          return;
        }

        const { uploadUrl, blobName } = sasResp.data;

        // 2) Upload directly to Blob using SAS
        const up = await uploadToSasUrl(uploadUrl, uploadedFile);
        if (!up.ok) {
          toast.error(`Upload failed (HTTP ${up.status}). Try PDF/DOCX and re-upload.`);
          return;
        }

        // 3) Save resume metadata into user doc (Cosmos)
        const saveResp = await apiFetch("/api/resume/save", {
          method: "POST",
          token,
          body: {
            blobName,
            originalName: uploadedFile.name,
            contentType: uploadedFile.type || "application/octet-stream",
            size: uploadedFile.size || 0,
          },
        });

        if (!saveResp.ok || !saveResp.data?.ok) {
          const msg = saveResp.data?.error || `Failed to save resume (HTTP ${saveResp.status})`;
          toast.error(msg);
          return;
        }

        // Optional local cache so UI remains smooth
        const resumeData = {
          id: Date.now(),
          name: uploadedFile.name,
          source: "upload",
          blobName,
          created: new Date().toISOString()
        };

        localStorage.setItem("resumes", JSON.stringify([resumeData]));
        localStorage.setItem("defaultResumeId", resumeData.id.toString());

        toast.success("Resume uploaded and saved to your account.");
      } else {
        // Paste/build are still local-only for now (no UI changes)
        const resumeData = {
          id: Date.now(),
          name: resumeSource === "paste"
            ? "Pasted Resume"
            : `${fullName} Resume`,
          content: resumeText,
          source: resumeSource,
          created: new Date().toISOString()
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
          <div className="flex items-center gap-6">
            <div className="px-3 py-1.5 rounded-lg bg-amber-500/10 border border-amber-500/20">
              <p className="text-xs text-amber-400">Testing Mode: Setup shown every login</p>
            </div>
            <div className="flex items-center gap-2 text-sm text-white/40">
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 1 ? 'bg-purple-600 text-white' : 'bg-white/5'}`}>1</div>
              <div className="w-8 h-0.5 bg-white/10" />
              <div className={`w-8 h-8 rounded-full flex items-center justify-center ${step >= 2 ? 'bg-purple-600 text-white' : 'bg-white/5'}`}>2</div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-4xl mx-auto px-4 py-16">
        <div className="text-center mb-12">
          <h1 className="text-4xl font-bold text-white mb-3">Let's set up your profile</h1>
          <p className="text-lg text-white/40">This takes ~60 seconds. It helps us tailor documents to you.</p>
        </div>

        {/* Step 1: Add Resume */}
        {step === 1 && (
          <div className="glass-card rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6">Step 1: Add your resume</h2>

            <Tabs value={resumeSource} onValueChange={setResumeSource} className="mb-6">
              <TabsList className="grid w-full grid-cols-3 bg-white/5 p-1 rounded-xl border border-white/10">
                <TabsTrigger
                  value="upload"
                  className="data-[state=active]:bg-purple-600 data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/30 data-[state=active]:border data-[state=active]:border-purple-400/50 transition-all duration-300 data-[state=active]:scale-105"
                >
                  Upload
                </TabsTrigger>
                <TabsTrigger
                  value="paste"
                  className="data-[state=active]:bg-purple-600 data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/30 data-[state=active]:border data-[state=active]:border-purple-400/50 transition-all duration-300 data-[state=active]:scale-105"
                >
                  Paste Text
                </TabsTrigger>
                <TabsTrigger
                  value="build"
                  className="data-[state=active]:bg-purple-600 data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/30 data-[state=active]:border data-[state=active]:border-purple-400/50 transition-all duration-300 data-[state=active]:scale-105"
                >
                  Build
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-6">
                <div className="border-2 border-dashed border-white/10 rounded-2xl p-8 text-center hover:border-purple-500/50 transition-colors duration-300">
                  <Upload className="w-10 h-10 text-purple-500 mx-auto mb-4" />
                  <h3 className="text-lg font-semibold text-white mb-2">Upload your resume</h3>
                  <p className="text-sm text-white/40 mb-4">PDF or DOCX. We'll store it securely on your account.</p>
                  <Input
                    type="file"
                    accept=".pdf,.doc,.docx"
                    onChange={handleFileUpload}
                    className="max-w-sm mx-auto bg-white/5 border-white/10 text-white"
                  />
                  {uploadedFile && (
                    <div className="mt-4 flex items-center justify-center gap-2 text-sm text-white/60">
                      <FileText className="w-4 h-4" />
                      <span>{uploadedFile.name}</span>
                      <Check className="w-4 h-4 text-green-500" />
                    </div>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="paste" className="mt-6">
                <Textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste your resume text here..."
                  className="min-h-[300px] bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </TabsContent>

              <TabsContent value="build" className="mt-6 space-y-6">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Full Name" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  <Input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone (optional)" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  <Input value={location} onChange={(e) => setLocation(e.target.value)} placeholder="Location (optional)" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                  <Input value={linkedin} onChange={(e) => setLinkedin(e.target.value)} placeholder="LinkedIn (optional)" className="bg-white/5 border-white/10 text-white placeholder:text-white/30 md:col-span-2" />
                </div>

                <div>
                  <h4 className="text-lg font-semibold text-white mb-3 flex items-center gap-2">
                    <Briefcase className="w-5 h-5 text-purple-500" />
                    Work Experience
                  </h4>
                  <div className="space-y-4">
                    {workExperience.map((w, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input value={w.company} onChange={(e) => updateWorkExperience(idx, "company", e.target.value)} placeholder="Company" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                          <Input value={w.role} onChange={(e) => updateWorkExperience(idx, "role", e.target.value)} placeholder="Role" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                          <Input value={w.dates} onChange={(e) => updateWorkExperience(idx, "dates", e.target.value)} placeholder="Dates (e.g., 2023–2025)" className="bg-white/5 border-white/10 text-white placeholder:text-white/30 md:col-span-2" />
                        </div>
                        <Textarea value={w.bullets} onChange={(e) => updateWorkExperience(idx, "bullets", e.target.value)} placeholder="Key achievements (bullet points)..." className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                      </div>
                    ))}
                    <Button onClick={addWorkExperience} variant="secondary" className="bg-white/5 hover:bg-white/10 text-white border border-white/10">
                      Add another role
                    </Button>
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-semibold text-white mb-3">Education</h4>
                  <div className="space-y-4">
                    {education.map((e, idx) => (
                      <div key={idx} className="p-4 rounded-xl bg-white/5 border border-white/10 space-y-3">
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                          <Input value={e.school} onChange={(ev) => {
                            const updated = [...education];
                            updated[idx].school = ev.target.value;
                            setEducation(updated);
                          }} placeholder="School" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                          <Input value={e.degree} onChange={(ev) => {
                            const updated = [...education];
                            updated[idx].degree = ev.target.value;
                            setEducation(updated);
                          }} placeholder="Degree" className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                          <Input value={e.dates} onChange={(ev) => {
                            const updated = [...education];
                            updated[idx].dates = ev.target.value;
                            setEducation(updated);
                          }} placeholder="Dates" className="bg-white/5 border-white/10 text-white placeholder:text-white/30 md:col-span-2" />
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div>
                  <h4 className="text-lg font-semibold text-white mb-3">Skills</h4>
                  <Textarea value={skills} onChange={(e) => setSkills(e.target.value)} placeholder="Skills (comma-separated)..." className="bg-white/5 border-white/10 text-white placeholder:text-white/30" />
                </div>
              </TabsContent>
            </Tabs>
          </div>
        )}

        {/* Step 2: Preferences */}
        {step === 2 && (
          <div className="glass-card rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6">Step 2: Your preferences</h2>

            <div className="space-y-8">
              <div>
                <h3 className="text-lg font-semibold text-white mb-3">Target roles</h3>
                <div className="flex flex-wrap gap-2">
                  {targetRoles.map(role => (
                    <button
                      key={role}
                      onClick={() => toggleRole(role)}
                      className={`px-4 py-2 rounded-xl text-sm border transition-all duration-300 ${
                        selectedRoles.includes(role)
                          ? "bg-purple-600 text-white border-purple-400/50 shadow-lg shadow-purple-500/20"
                          : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                      }`}
                    >
                      {role}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Seniority</h3>
                  <Select value={seniority} onValueChange={setSeniority}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select seniority" />
                    </SelectTrigger>
                    <SelectContent>
                      {seniorityLevels.map(level => (
                        <SelectItem key={level} value={level}>{level}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div>
                  <h3 className="text-lg font-semibold text-white mb-3">Location preference</h3>
                  <Select value={locationPref} onValueChange={setLocationPref}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select preference" />
                    </SelectTrigger>
                    <SelectContent>
                      {locationPrefs.map(pref => (
                        <SelectItem key={pref} value={pref}>{pref}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>

                <div className="md:col-span-2">
                  <h3 className="text-lg font-semibold text-white mb-3">Preferred city (optional)</h3>
                  <Input
                    value={preferredCity}
                    onChange={(e) => setPreferredCity(e.target.value)}
                    placeholder="e.g., Dallas, TX"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  />
                </div>

                <div className="md:col-span-2">
                  <h3 className="text-lg font-semibold text-white mb-3">Tone for documents</h3>
                  <Select value={tone} onValueChange={setTone}>
                    <SelectTrigger className="bg-white/5 border-white/10 text-white">
                      <SelectValue placeholder="Select tone" />
                    </SelectTrigger>
                    <SelectContent>
                      {tones.map(t => (
                        <SelectItem key={t} value={t}>{t}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="flex items-center justify-between pt-4 border-t border-white/10">
                <Button onClick={handleSkip} variant="ghost" className="text-white/50 hover:text-white hover:bg-white/5">
                  Skip
                </Button>
                <Button onClick={handleFinish} className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20">
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
            className="text-white/50 hover:text-white hover:bg-white/5 disabled:opacity-30"
          >
            Back
          </Button>

          {step === 1 && (
            <Button
              onClick={handleNext}
              className="bg-purple-600 hover:bg-purple-700 text-white shadow-lg shadow-purple-500/20"
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
