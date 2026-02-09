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
import { toast } from "sonner";
import { UploadCloud, FileText, ArrowRight, ShieldCheck } from "lucide-react";

const roles = [
  "Software Engineer",
  "Product Manager",
  "Designer",
  "Data Scientist",
  "Marketing Manager",
  "Sales",
  "Customer Success",
  "Other",
];

const seniorities = ["Intern", "Entry", "Mid", "Senior", "Lead", "Manager"];
const locationPrefs = ["Remote", "Hybrid", "On-site"];
const tones = ["Professional", "Confident", "Concise"];

/**
 * Normalizes whatever the frontend stored into a clean JWT string.
 * Handles: quotes, accidental 'Bearer ' prefix, whitespace/newlines.
 */
function normalizeToken(raw) {
  if (!raw || typeof raw !== "string") return null;
  let t = raw.trim();

  // Remove accidental JSON quotes
  t = t.replace(/^"|"$/g, "");

  // If token was stored with Bearer prefix, strip it
  t = t.replace(/^Bearer\s+/i, "");

  // If whitespace snuck in, take first chunk
  if (t.includes(" ")) t = t.split(/\s+/)[0];

  return t || null;
}

/**
 * Reads your stored app JWT from localStorage.
 * Supports multiple key names so it works with whatever your auth UI saved.
 */
function getStoredAppToken() {
  const keys = ["APP_TOKEN", "appToken", "app_token", "appJwt", "authToken", "token"];
  for (const k of keys) {
    const v = localStorage.getItem(k);
    const t = normalizeToken(v);
    if (t) return t;
  }
  return null;
}

/**
 * Simple helper for calling your SWA API with JSON + Bearer token.
 */
async function apiFetch(path, { method = "GET", token, body } = {}) {
  const headers = { "Content-Type": "application/json" };
  const t = normalizeToken(token);

  if (t) {
    // Basic sanity check: JWTs usually have 3 dot-separated parts
    const looksLikeJwt = t.split(".").length === 3;
    if (!looksLikeJwt) {
      console.warn(
        "[apiFetch] Token does not look like a JWT. Make sure you're storing the APP token from /auth/exchange (APP_TOKEN), not the Google/Microsoft provider token."
      );
    }
    headers["Authorization"] = `Bearer ${t}`;
  }

  const res = await fetch(path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  let data = null;
  try {
    data = await res.json();
  } catch {
    // ignore non-json
  }
  return { ok: res.ok, status: res.status, data };
}

export default function Setup() {
  const navigate = useNavigate();

  const [selectedRoles, setSelectedRoles] = useState(["Software Engineer"]);
  const [seniority, setSeniority] = useState("");
  const [locationPref, setLocationPref] = useState("");
  const [preferredCity, setPreferredCity] = useState("");
  const [tone, setTone] = useState("Professional");

  const [resumeSource, setResumeSource] = useState("upload"); // upload | paste | build
  const [uploadedFile, setUploadedFile] = useState(null);
  const [resumeText, setResumeText] = useState("");
  const [fullName, setFullName] = useState("");
  const [headline, setHeadline] = useState("");
  const [about, setAbout] = useState("");
  const [skills, setSkills] = useState("");

  const [loading, setLoading] = useState(false);

  const toggleRole = (role) => {
    setSelectedRoles((prev) =>
      prev.includes(role) ? prev.filter((r) => r !== role) : [...prev, role]
    );
  };

  const onFinish = async () => {
    try {
      setLoading(true);

      // Basic validation
      if (resumeSource === "upload" && !uploadedFile) {
        toast.error("Please upload a resume file");
        setLoading(false);
        return;
      }
      if (resumeSource === "paste" && !resumeText.trim()) {
        toast.error("Please paste your resume text");
        setLoading(false);
        return;
      }
      if (resumeSource === "build" && !fullName.trim()) {
        toast.error("Please enter at least your name");
        setLoading(false);
        return;
      }

      const preferences = {
        selectedRoles,
        seniority,
        locationPref,
        preferredCity,
        tone,
      };

      localStorage.setItem("preferences", JSON.stringify(preferences));
      localStorage.setItem("onboardingComplete", "true");

      // ✅ Upload mode: Blob + Cosmos (account-based)
      if (resumeSource === "upload") {
        const token = getStoredAppToken();
        if (!token) {
          toast.error("You must be logged in to upload a resume.");
          setLoading(false);
          return;
        }

        // 1) Get SAS upload URL from backend
        const sasResp = await apiFetch("/api/resume/upload-url", {
          method: "POST",
          token,
          body: {
            fileName: uploadedFile.name,
            contentType: uploadedFile.type || "application/octet-stream",
          },
        });

        if (!sasResp.ok) {
          const msg =
            sasResp.data?.error || `Failed to get upload URL (HTTP ${sasResp.status})`;
          toast.error(msg);
          setLoading(false);
          return;
        }

        const { uploadUrl, blobName } = sasResp.data;

        // 2) Upload to Blob directly (PUT to SAS)
        const putRes = await fetch(uploadUrl, {
          method: "PUT",
          headers: { "x-ms-blob-type": "BlockBlob" },
          body: uploadedFile,
        });

        if (!putRes.ok) {
          toast.error(`Upload failed (HTTP ${putRes.status})`);
          setLoading(false);
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
            size: uploadedFile.size,
            preferences,
          },
        });

        if (!saveResp.ok) {
          const msg =
            saveResp.data?.error || `Failed to save resume (HTTP ${saveResp.status})`;
          toast.error(msg);
          setLoading(false);
          return;
        }

        // Optional local cache
        const resumeData = {
          id: Date.now(),
          name: uploadedFile.name,
          uploadedAt: new Date().toISOString(),
          blobName,
        };
        localStorage.setItem("resumes", JSON.stringify([resumeData]));
        localStorage.setItem("defaultResumeId", resumeData.id.toString());

        toast.success("Resume uploaded and saved to your account.");
      } else {
        // ✅ Paste/build fallback: local only (for now)
        const resumeData = {
          id: Date.now(),
          name:
            resumeSource === "paste"
              ? "Pasted Resume"
              : `${fullName} Resume`,
          uploadedAt: new Date().toISOString(),
          source: resumeSource,
          content:
            resumeSource === "paste"
              ? resumeText
              : {
                  fullName,
                  headline,
                  about,
                  skills,
                },
        };

        localStorage.setItem("resumes", JSON.stringify([resumeData]));
        localStorage.setItem("defaultResumeId", resumeData.id.toString());
        toast.success("Setup complete! (Resume saved locally for now)");
      }

      navigate(createPageUrl("AppHome"));
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Something went wrong while saving your resume.");
    } finally {
      setLoading(false);
    }
  };

  const skip = () => {
    toast.error("Resume is required to continue. Please add your resume.");
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <header className="border-b border-white/5 bg-[hsl(240,10%,4%)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-purple-500 to-pink-500 flex items-center justify-center">
              <ShieldCheck className="w-5 h-5 text-white" />
            </div>
            <div>
              <div className="text-white font-semibold leading-tight">Autopilot</div>
              <div className="text-white/50 text-xs leading-tight">Profile setup</div>
            </div>
          </div>

          <div className="flex items-center gap-3">
            <span className="text-xs text-white/50 px-2 py-1 rounded-full border border-white/10">
              Testing Mode: Setup shown every login
            </span>
            <div className="flex items-center gap-2">
              <div className="w-7 h-7 rounded-full bg-purple-600/20 border border-purple-400/30 text-purple-200 flex items-center justify-center text-xs">
                1
              </div>
              <div className="w-10 h-[1px] bg-white/10" />
              <div className="w-7 h-7 rounded-full bg-purple-600 border border-purple-400/40 text-white flex items-center justify-center text-xs">
                2
              </div>
            </div>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-10">
        <h1 className="text-white text-4xl font-semibold tracking-tight text-center">
          Let's set up your profile
        </h1>
        <p className="text-white/60 text-center mt-2">
          This takes ~60 seconds. It helps us tailor documents to you.
        </p>

        <div className="mt-10 space-y-10">
          <section className="space-y-4">
            <h2 className="text-white text-xl font-semibold">Step 2: Your preferences</h2>

            <div className="space-y-2">
              <div className="text-white/80 text-sm">Target roles</div>
              <div className="flex flex-wrap gap-2">
                {roles.map((r) => {
                  const active = selectedRoles.includes(r);
                  return (
                    <button
                      key={r}
                      type="button"
                      onClick={() => toggleRole(r)}
                      className={`px-3 py-1.5 rounded-full text-sm border transition ${
                        active
                          ? "bg-white/10 border-white/20 text-white"
                          : "bg-transparent border-white/10 text-white/70 hover:bg-white/5"
                      }`}
                    >
                      {r}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="grid sm:grid-cols-2 gap-4 pt-2">
              <div className="space-y-2">
                <div className="text-white/80 text-sm">Seniority</div>
                <Select value={seniority} onValueChange={setSeniority}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Select seniority" />
                  </SelectTrigger>
                  <SelectContent>
                    {seniorities.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-2">
                <div className="text-white/80 text-sm">Location preference</div>
                <Select value={locationPref} onValueChange={setLocationPref}>
                  <SelectTrigger className="bg-white/5 border-white/10 text-white">
                    <SelectValue placeholder="Select preference" />
                  </SelectTrigger>
                  <SelectContent>
                    {locationPrefs.map((s) => (
                      <SelectItem key={s} value={s}>
                        {s}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="space-y-2 pt-2">
              <div className="text-white/80 text-sm">Preferred city (optional)</div>
              <Input
                value={preferredCity}
                onChange={(e) => setPreferredCity(e.target.value)}
                placeholder="e.g., Dallas, TX"
                className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
              />
            </div>

            <div className="space-y-2 pt-2">
              <div className="text-white/80 text-sm">Tone for documents</div>
              <Select value={tone} onValueChange={setTone}>
                <SelectTrigger className="bg-white/5 border-white/10 text-white">
                  <SelectValue />
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
          </section>

          <section className="space-y-4">
            <h2 className="text-white text-xl font-semibold">Step 1: Add your resume</h2>

            <Tabs value={resumeSource} onValueChange={setResumeSource}>
              <TabsList className="bg-white/5 border border-white/10">
                <TabsTrigger value="upload">Upload</TabsTrigger>
                <TabsTrigger value="paste">Paste</TabsTrigger>
                <TabsTrigger value="build">Build</TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="pt-4">
                <div className="border border-white/10 rounded-2xl p-4 bg-white/5">
                  <div className="flex items-center gap-3 text-white/80">
                    <UploadCloud className="w-5 h-5" />
                    <div className="text-sm">Upload a PDF/DOCX resume</div>
                  </div>

                  <div className="mt-4">
                    <Input
                      type="file"
                      accept=".pdf,.doc,.docx"
                      onChange={(e) => setUploadedFile(e.target.files?.[0] || null)}
                      className="bg-white/5 border-white/10 text-white"
                    />
                  </div>

                  {uploadedFile ? (
                    <div className="mt-3 text-xs text-white/60">
                      Selected: <span className="text-white/80">{uploadedFile.name}</span>
                    </div>
                  ) : null}
                </div>
              </TabsContent>

              <TabsContent value="paste" className="pt-4">
                <div className="border border-white/10 rounded-2xl p-4 bg-white/5">
                  <div className="flex items-center gap-3 text-white/80">
                    <FileText className="w-5 h-5" />
                    <div className="text-sm">Paste your resume text</div>
                  </div>

                  <Textarea
                    value={resumeText}
                    onChange={(e) => setResumeText(e.target.value)}
                    rows={10}
                    placeholder="Paste your resume here..."
                    className="mt-4 bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  />
                </div>
              </TabsContent>

              <TabsContent value="build" className="pt-4">
                <div className="border border-white/10 rounded-2xl p-4 bg-white/5 space-y-3">
                  <div className="text-white/80 text-sm">
                    Quick builder (saves locally for now)
                  </div>

                  <Input
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    placeholder="Full name"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  />
                  <Input
                    value={headline}
                    onChange={(e) => setHeadline(e.target.value)}
                    placeholder="Headline (e.g., CS student | Azure | DevOps)"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  />
                  <Textarea
                    value={about}
                    onChange={(e) => setAbout(e.target.value)}
                    rows={4}
                    placeholder="Short about you..."
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  />
                  <Textarea
                    value={skills}
                    onChange={(e) => setSkills(e.target.value)}
                    rows={3}
                    placeholder="Skills (comma separated)"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/40"
                  />
                </div>
              </TabsContent>
            </Tabs>
          </section>

          <div className="flex items-center justify-between pt-4">
            <button
              type="button"
              onClick={skip}
              className="text-white/60 hover:text-white text-sm"
            >
              Skip
            </button>

            <Button onClick={onFinish} disabled={loading} className="gap-2">
              Finish setup <ArrowRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </main>
    </div>
  );
}
