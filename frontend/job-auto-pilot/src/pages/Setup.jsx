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
const seniorityLevels = ["Intern", "Junior", "Mid-Level", "Senior", "Lead", "Manager", "Director", "Executive"];
const locationPrefs = ["Remote", "Hybrid", "On-site", "No preference"];
const tones = ["Professional", "Conversational", "Bold", "Friendly", "Minimal"];

/**
 * Simple helper for calling your SWA API with JSON.
 * Auth is handled by Azure Static Web Apps automatically (x-ms-client-principal).
 * Do NOT send Authorization headers / JWTs from the frontend.
 */
async function apiFetch(path, { method = "GET", body } = {}) {
  const res = await fetch(path, {
    method,
    headers: { "Content-Type": "application/json" },
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

async function uploadToSasUrl(uploadUrl, file) {
  try {
    const res = await fetch(uploadUrl, {
      method: "PUT",
      headers: {
        "x-ms-blob-type": "BlockBlob",
        "Content-Type": file.type || "application/octet-stream",
      },
      body: file,
    });
    return { ok: res.ok, status: res.status };
  } catch (e) {
    return { ok: false, status: 0, error: e?.message || "Upload failed" };
  }
}

export default function Setup() {
  const navigate = useNavigate();

  const [step, setStep] = useState(1);
  const [fullName, setFullName] = useState("");
  const [targetRole, setTargetRole] = useState(targetRoles[0]);
  const [customRole, setCustomRole] = useState("");
  const [seniority, setSeniority] = useState(seniorityLevels[1]);
  const [locationPref, setLocationPref] = useState(locationPrefs[0]);
  const [preferredCity, setPreferredCity] = useState("");
  const [tone, setTone] = useState(tones[0]);

  const [resumeSource, setResumeSource] = useState("upload"); // upload | paste | build
  const [resumeText, setResumeText] = useState("");
  const [uploadedFile, setUploadedFile] = useState(null);

  const [jobTitle, setJobTitle] = useState("");
  const [company, setCompany] = useState("");
  const [jobDesc, setJobDesc] = useState("");

  const [loading, setLoading] = useState(false);

  const next = () => setStep((s) => Math.min(3, s + 1));
  const prev = () => setStep((s) => Math.max(1, s - 1));

  const handleFile = (e) => {
    const f = e.target.files?.[0];
    if (!f) return;
    setUploadedFile(f);
  };

  const handleComplete = async () => {
    if (!fullName.trim()) {
      toast.error("Please enter your name");
      return;
    }

    setLoading(true);
    try {
      const role = targetRole === "Other" ? customRole.trim() : targetRole;

      const preferences = {
        fullName: fullName.trim(),
        role: role || "Other",
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

        // 1) Ask backend for SAS upload URL (NO JWT)
        const sasResp = await apiFetch("/api/resume/upload-url", {
          method: "POST",
          body: {
            fileName: uploadedFile.name,
            contentType: uploadedFile.type || "application/octet-stream",
          },
        });

        if (!sasResp.ok || !sasResp.data?.ok) {
          const msg =
            sasResp.data?.error ||
            (sasResp.status === 401
              ? "You're not logged in. Please sign in and try again."
              : `Failed to get upload URL (HTTP ${sasResp.status})`);
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

        // 3) Save resume metadata into user doc (Cosmos) (NO JWT)
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
            (saveResp.status === 401
              ? "You're not logged in. Please sign in and try again."
              : `Failed to save resume (HTTP ${saveResp.status})`);
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
      }

      // Save job info locally for now
      if (jobTitle.trim() || company.trim() || jobDesc.trim()) {
        localStorage.setItem(
          "latestJob",
          JSON.stringify({
            title: jobTitle.trim(),
            company: company.trim(),
            description: jobDesc.trim(),
            created: new Date().toISOString(),
          })
        );
      }

      toast.success("Setup complete!");
      navigate(createPageUrl("Home"));
    } catch (e) {
      toast.error(e?.message || "Something went wrong");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto px-4 py-8">
      <div className="flex items-start justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Get Started</h1>
          <p className="text-muted-foreground mt-1">
            Tell us what you’re applying for and add your resume.
          </p>
        </div>
        <div className="flex items-center gap-2 text-sm text-muted-foreground">
          <span className={`inline-flex items-center gap-1 ${step >= 1 ? "text-foreground" : ""}`}>
            <Check className="w-4 h-4" /> Preferences
          </span>
          <ChevronRight className="w-4 h-4" />
          <span className={`inline-flex items-center gap-1 ${step >= 2 ? "text-foreground" : ""}`}>
            <Check className="w-4 h-4" /> Resume
          </span>
          <ChevronRight className="w-4 h-4" />
          <span className={`inline-flex items-center gap-1 ${step >= 3 ? "text-foreground" : ""}`}>
            <Check className="w-4 h-4" /> Job
          </span>
        </div>
      </div>

      {/* UI BELOW UNCHANGED */}
      <div className="space-y-6">
        {step === 1 && (
          <div className="rounded-xl border p-6 space-y-6">
            <div className="flex items-center gap-2">
              <Rocket className="w-5 h-5" />
              <h2 className="text-xl font-semibold">Preferences</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Full name</label>
                <Input value={fullName} onChange={(e) => setFullName(e.target.value)} placeholder="Your name" />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Target role</label>
                <Select value={targetRole} onValueChange={setTargetRole}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    {targetRoles.map((r) => (
                      <SelectItem key={r} value={r}>
                        {r}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {targetRole === "Other" && (
                  <Input value={customRole} onChange={(e) => setCustomRole(e.target.value)} placeholder="Enter role" />
                )}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Seniority</label>
                <Select value={seniority} onValueChange={setSeniority}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select level" />
                  </SelectTrigger>
                  <SelectContent>
                    {seniorityLevels.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">Location preference</label>
                <Select value={locationPref} onValueChange={setLocationPref}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select location preference" />
                  </SelectTrigger>
                  <SelectContent>
                    {locationPrefs.map((l) => (
                      <SelectItem key={l} value={l}>
                        {l}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                {(locationPref === "Hybrid" || locationPref === "On-site") && (
                  <Input value={preferredCity} onChange={(e) => setPreferredCity(e.target.value)} placeholder="City (optional)" />
                )}
              </div>

              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Tone</label>
                <Select value={tone} onValueChange={setTone}>
                  <SelectTrigger>
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
              </div>
            </div>

            <div className="flex justify-end">
              <Button onClick={next}>Continue</Button>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="rounded-xl border p-6 space-y-6">
            <div className="flex items-center gap-2">
              <Upload className="w-5 h-5" />
              <h2 className="text-xl font-semibold">Resume</h2>
            </div>

            <Tabs value={resumeSource} onValueChange={setResumeSource}>
              <TabsList className="grid grid-cols-3 w-full">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="paste">Paste</TabsTrigger>
                <TabsTrigger value="build">Build</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="pt-4 space-y-3">
                <Input type="file" accept=".pdf,.doc,.docx,.txt" onChange={handleFile} />
                {uploadedFile && (
                  <div className="text-sm text-muted-foreground">
                    Selected: <span className="font-medium">{uploadedFile.name}</span>
                  </div>
                )}
              </TabsContent>

              <TabsContent value="paste" className="pt-4">
                <Textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste your resume text here..."
                  className="min-h-[220px]"
                />
              </TabsContent>

              <TabsContent value="build" className="pt-4">
                <Textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Write a quick summary of your experience, skills, and projects..."
                  className="min-h-[220px]"
                />
              </TabsContent>
            </Tabs>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={prev}>
                Back
              </Button>
              <Button onClick={next}>Continue</Button>
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="rounded-xl border p-6 space-y-6">
            <div className="flex items-center gap-2">
              <Briefcase className="w-5 h-5" />
              <h2 className="text-xl font-semibold">Job</h2>
            </div>

            <div className="grid md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">Job title</label>
                <Input value={jobTitle} onChange={(e) => setJobTitle(e.target.value)} placeholder="e.g., Software Engineer" />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-medium">Company</label>
                <Input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="e.g., Microsoft" />
              </div>
              <div className="space-y-2 md:col-span-2">
                <label className="text-sm font-medium">Job description (optional)</label>
                <Textarea
                  value={jobDesc}
                  onChange={(e) => setJobDesc(e.target.value)}
                  placeholder="Paste the job description here..."
                  className="min-h-[220px]"
                />
              </div>
            </div>

            <div className="flex items-center justify-between">
              <Button variant="outline" onClick={prev}>
                Back
              </Button>
              <Button onClick={handleComplete} disabled={loading}>
                {loading ? "Saving..." : "Finish"}
              </Button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
