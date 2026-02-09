import React, { useState } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Textarea } from "@/components/ui/textarea";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { toast } from "sonner";

/**
 * Pull the app JWT from localStorage.
 * Accepts multiple key names so it works with whatever your auth UI saved.
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
 *
 * Returns: { ok: boolean, status: number, data: any }
 */
async function apiFetch(path, opts = {}) {
  const method = opts.method || "GET";

  // ✅ Always prefer your *app* JWT (signed by APP_JWT_SECRET)
  const token =
    opts.token ||
    getStoredAppToken() ||
    null;

  const headers = {
    ...(opts.headers || {}),
    ...(opts.body ? { "Content-Type": "application/json" } : {}),
    ...(token ? { Authorization: `Bearer ${String(token).replace(/^Bearer\s+/i, "").trim()}` } : {}),
  };

  const res = await fetch(path, {
    method,
    headers,
    credentials: "include",
    body: opts.body ? JSON.stringify(opts.body) : undefined,
  });

  const text = await res.text();
  let data;
  try {
    data = text ? JSON.parse(text) : {};
  } catch {
    data = { raw: text };
  }

  return { ok: res.ok, status: res.status, data };
}

export default function Setup() {
  const navigate = useNavigate();

  const [resumeSource, setResumeSource] = useState("upload"); // "upload" | "paste"
  const [uploadedFile, setUploadedFile] = useState(null);
  const [pastedResume, setPastedResume] = useState("");
  const [tone, setTone] = useState("professional"); // "professional" | "casual" | "confident" | "friendly"
  const [role, setRole] = useState("");
  const [location, setLocation] = useState("");
  const [keywords, setKeywords] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const onFileChange = (e) => {
    const f = e.target.files?.[0] || null;
    setUploadedFile(f);
  };

  const onSubmit = async () => {
    if (submitting) return;
    setSubmitting(true);

    try {
      const preferences = {
        role,
        location,
        keywords,
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
          const msg =
            sasResp.data?.error ||
            `Failed to get upload URL (HTTP ${sasResp.status})`;
          toast.error(msg);
          return;
        }

        const { uploadUrl, blobName } = sasResp.data;

        // 2) Upload directly to Blob using PUT
        const putResp = await fetch(uploadUrl, {
          method: "PUT",
          headers: {
            "x-ms-blob-type": "BlockBlob",
            "Content-Type": uploadedFile.type || "application/octet-stream",
          },
          body: uploadedFile,
        });

        if (!putResp.ok) {
          toast.error(`Upload failed (HTTP ${putResp.status})`);
          return;
        }

        // 3) Tell backend where the resume is stored (Cosmos)
        const saveResp = await apiFetch("/api/resume/save", {
          method: "POST",
          token,
          body: {
            resumeSource: "upload",
            blobName,
            fileName: uploadedFile.name,
            contentType: uploadedFile.type || "application/octet-stream",
            preferences,
          },
        });

        if (!saveResp.ok || !saveResp.data?.ok) {
          const msg =
            saveResp.data?.error ||
            `Failed to save resume (HTTP ${saveResp.status})`;
          toast.error(msg);
          return;
        }
      }

      // ✅ Paste mode: save text directly
      if (resumeSource === "paste") {
        if (!pastedResume.trim()) {
          toast.error("Please paste your resume text");
          return;
        }

        const token = getStoredAppToken();
        if (!token) {
          toast.error("You're not logged in. Please sign in again.");
          return;
        }

        const saveResp = await apiFetch("/api/resume/save", {
          method: "POST",
          token,
          body: {
            resumeSource: "paste",
            resumeText: pastedResume,
            preferences,
          },
        });

        if (!saveResp.ok || !saveResp.data?.ok) {
          const msg =
            saveResp.data?.error ||
            `Failed to save resume (HTTP ${saveResp.status})`;
          toast.error(msg);
          return;
        }
      }

      toast.success("Setup complete!");
      navigate(createPageUrl("Dashboard"));
    } catch (e) {
      toast.error(e?.message || "Setup failed");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="min-h-screen w-full flex items-center justify-center p-4">
      <Card className="w-full max-w-2xl">
        <CardHeader>
          <CardTitle>Setup</CardTitle>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* Resume Source */}
          <div className="space-y-2">
            <Label>Resume Source</Label>
            <RadioGroup
              value={resumeSource}
              onValueChange={setResumeSource}
              className="flex gap-6"
            >
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="upload" id="upload" />
                <Label htmlFor="upload">Upload</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="paste" id="paste" />
                <Label htmlFor="paste">Paste</Label>
              </div>
            </RadioGroup>
          </div>

          {resumeSource === "upload" ? (
            <div className="space-y-2">
              <Label htmlFor="resumeFile">Upload your resume</Label>
              <Input
                id="resumeFile"
                type="file"
                accept=".pdf,.doc,.docx,.txt"
                onChange={onFileChange}
              />
            </div>
          ) : (
            <div className="space-y-2">
              <Label htmlFor="resumeText">Paste resume text</Label>
              <Textarea
                id="resumeText"
                value={pastedResume}
                onChange={(e) => setPastedResume(e.target.value)}
                placeholder="Paste your resume here..."
                className="min-h-[180px]"
              />
            </div>
          )}

          {/* Preferences */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label htmlFor="role">Target Role</Label>
              <Input
                id="role"
                value={role}
                onChange={(e) => setRole(e.target.value)}
                placeholder="e.g., IT Help Desk"
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="location">Location</Label>
              <Input
                id="location"
                value={location}
                onChange={(e) => setLocation(e.target.value)}
                placeholder="e.g., Dallas, TX"
              />
            </div>
            <div className="space-y-2 md:col-span-2">
              <Label htmlFor="keywords">Keywords</Label>
              <Input
                id="keywords"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
                placeholder="e.g., Azure, Active Directory, Windows"
              />
            </div>
          </div>

          {/* Tone */}
          <div className="space-y-2">
            <Label>Application Tone</Label>
            <RadioGroup value={tone} onValueChange={setTone} className="flex flex-wrap gap-6">
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="professional" id="professional" />
                <Label htmlFor="professional">Professional</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="confident" id="confident" />
                <Label htmlFor="confident">Confident</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="friendly" id="friendly" />
                <Label htmlFor="friendly">Friendly</Label>
              </div>
              <div className="flex items-center space-x-2">
                <RadioGroupItem value="casual" id="casual" />
                <Label htmlFor="casual">Casual</Label>
              </div>
            </RadioGroup>
          </div>

          <Button className="w-full" onClick={onSubmit} disabled={submitting}>
            {submitting ? "Saving..." : "Finish setup"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
