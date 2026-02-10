import React, { useEffect, useRef, useState } from "react";
import AppNav from "@/components/app/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  FileText,
  Upload,
  Edit2,
  Trash2,
  Star,
  Calendar,
  Plus,
} from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";

async function readJsonSafe(res) {
  const text = await res.text().catch(() => "");
  if (!text) return null;
  try {
    return JSON.parse(text);
  } catch {
    return { ok: false, error: text };
  }
}

async function apiJson(url, options = {}) {
  const res = await fetch(url, {
    ...options,
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });
  const data = await readJsonSafe(res);
  if (!res.ok) {
    const msg = data?.error || data?.message || `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function normalizeResume(doc) {
  // Support multiple possible backend shapes
  const id = doc.id || doc._id || doc.resumeId || doc.blobName || String(Date.now());
  const name =
    doc.name ||
    doc.resumeName ||
    doc.originalName ||
    doc.fileName ||
    "Resume";
  const updated =
    doc.updated_date ||
    doc.updatedDate ||
    doc.uploadedAt ||
    doc.createdAt ||
    new Date().toISOString();

  return {
    id,
    name,
    content: doc.content || doc.text || "",
    isDefault: Boolean(doc.isDefault) || Boolean(doc.default) || Boolean(doc.isCurrent),
    updated_date: String(updated).includes("T")
      ? String(updated).split("T")[0]
      : String(updated),
    // keep extra fields if needed later
    _raw: doc,
  };
}

export default function Resumes() {
  // ✅ removed dummy data; real data only
  const [resumes, setResumes] = useState([]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedResume, setSelectedResume] = useState(null);
  const [uploadMethod, setUploadMethod] = useState("file"); // "file" or "text"
  const [resumeText, setResumeText] = useState("");
  const [resumeName, setResumeName] = useState("");

  const fileInputRef = useRef(null);
  const [selectedFile, setSelectedFile] = useState(null);

  const loadResumes = async () => {
    try {
      // Prefer list endpoint if you add it later
      // If it doesn't exist yet, fall back to "current" behavior using /api/resume/save response patterns
      const tryList = await fetch("/api/resume/list");
      if (tryList.ok) {
        const data = await readJsonSafe(tryList);
        const items = data?.resumes || data?.items || data || [];
        const normalized = Array.isArray(items) ? items.map(normalizeResume) : [];
        setResumes(normalized);
        return;
      }

      // Fallback: try common "get current" endpoints (if you add one)
      const tryCurrent = await fetch("/api/resume/get");
      if (tryCurrent.ok) {
        const data = await readJsonSafe(tryCurrent);
        const doc = data?.resume || data?.item || data;
        if (doc) setResumes([normalizeResume(doc)]);
        else setResumes([]);
        return;
      }

      const tryCurrent2 = await fetch("/api/resume/current");
      if (tryCurrent2.ok) {
        const data = await readJsonSafe(tryCurrent2);
        const doc = data?.resume || data?.item || data;
        if (doc) setResumes([normalizeResume(doc)]);
        else setResumes([]);
        return;
      }

      // If nothing exists yet, just show empty
      setResumes([]);
    } catch (e) {
      console.error(e);
      toast.error("Failed to load resumes");
      setResumes([]);
    }
  };

  useEffect(() => {
    loadResumes();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleUpload = async () => {
    if (!resumeName.trim()) {
      toast.error("Please enter a resume name");
      return;
    }

    try {
      if (uploadMethod === "text") {
        if (!resumeText.trim()) {
          toast.error("Please paste your resume text");
          return;
        }

        // If you have a text-save endpoint, use it.
        // Otherwise store it as metadata/content in Cosmos via /api/resume/save (works for MVP).
        const payload = {
          name: resumeName,
          content: resumeText,
          contentType: "text/plain",
          size: resumeText.length,
          blobName: `text:${Date.now()}`, // placeholder
        };

        const saved = await apiJson("/api/resume/save", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        const doc = saved?.resume || payload;
        const normalized = normalizeResume({ ...doc, isDefault: resumes.length === 0 });
        setResumes([normalized, ...resumes]);

        toast.success("Resume uploaded successfully");
        setUploadOpen(false);
        setResumeName("");
        setResumeText("");
        return;
      }

      // uploadMethod === "file"
      if (!selectedFile) {
        toast.error("Please choose a file");
        return;
      }

      // 1) Get SAS upload URL
      const uploadUrlResp = await apiJson("/api/resume/upload-url", {
        method: "POST",
        body: JSON.stringify({
          originalName: selectedFile.name,
          fileName: selectedFile.name,
          contentType: selectedFile.type || "application/octet-stream",
          size: selectedFile.size || 0,
        }),
      });

      const uploadUrl = uploadUrlResp?.uploadUrl;
      const blobName = uploadUrlResp?.blobName || uploadUrlResp?.blobPath;

      if (!uploadUrl || !blobName) {
        toast.error("Upload URL failed");
        return;
      }

      // 2) PUT file to Blob using SAS
      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          "Content-Type": selectedFile.type || "application/octet-stream",
        },
        body: selectedFile,
      });

      if (!putRes.ok) {
        const errText = await putRes.text().catch(() => "");
        throw new Error(errText || `Blob upload failed (${putRes.status})`);
      }

      // 3) Save metadata to Cosmos
      const savePayload = {
        name: resumeName,
        blobName,
        originalName: selectedFile.name,
        fileName: selectedFile.name,
        contentType: selectedFile.type || "application/octet-stream",
        size: selectedFile.size || 0,
        uploadUrl, // backend strips SAS if it wants
      };

      const saved = await apiJson("/api/resume/save", {
        method: "POST",
        body: JSON.stringify(savePayload),
      });

      const doc = saved?.resume || savePayload;
      const normalized = normalizeResume({
        ...doc,
        isDefault: resumes.length === 0,
        updated_date: new Date().toISOString().split("T")[0],
      });

      setResumes([normalized, ...resumes]);

      toast.success("Resume uploaded successfully");
      setUploadOpen(false);
      setResumeName("");
      setResumeText("");
      setSelectedFile(null);
      if (fileInputRef.current) fileInputRef.current.value = "";
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Upload failed");
    }
  };

  const handleEdit = async () => {
    if (!resumeName.trim()) {
      toast.error("Please enter a resume name");
      return;
    }

    try {
      const prev = resumes;

      // optimistic UI (no UI changes)
      setResumes(
        resumes.map((r) =>
          r.id === selectedResume.id
            ? {
                ...r,
                name: resumeName,
                updated_date: new Date().toISOString().split("T")[0],
              }
            : r
        )
      );

      // Optional backend endpoint (recommended)
      // If you don't have it yet, this will 404; we quietly keep the optimistic rename.
      await apiJson("/api/resume/rename", {
        method: "POST",
        body: JSON.stringify({ id: selectedResume.id, name: resumeName }),
      }).catch(() => null);

      toast.success("Resume updated");
      setEditOpen(false);
      setResumeName("");
      setSelectedResume(null);

      // reload to stay in sync if backend supports it
      await loadResumes();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Rename failed");
      // best-effort reload
      await loadResumes();
    }
  };

  const handleDelete = async () => {
    try {
      const id = selectedResume?.id;
      const prev = resumes;

      // optimistic UI
      setResumes(resumes.filter((r) => r.id !== id));

      // Optional backend endpoint (recommended)
      await apiJson("/api/resume/delete", {
        method: "POST",
        body: JSON.stringify({ id }),
      }).catch(() => null);

      toast.success("Resume deleted");
      setDeleteOpen(false);
      setSelectedResume(null);

      await loadResumes();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Delete failed");
      await loadResumes();
    }
  };

  const handleSetDefault = async (id) => {
    try {
      // optimistic UI
      setResumes(resumes.map((r) => ({ ...r, isDefault: r.id === id })));

      // Optional backend endpoint (recommended)
      await apiJson("/api/resume/set-default", {
        method: "POST",
        body: JSON.stringify({ id }),
      }).catch(() => null);

      toast.success("Default resume updated");
      await loadResumes();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to set default");
      await loadResumes();
    }
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <AppNav currentPage="Resumes" />
      <motion.div
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        className="max-w-6xl mx-auto px-4 sm:px-6 py-8"
      >
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">Resumes</h1>
            <p className="text-white/40 mt-1">Manage your resume library</p>
          </div>
          <Button
            onClick={() => setUploadOpen(true)}
            className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-6 py-5 font-semibold premium-button"
          >
            <Plus className="w-4 h-4 mr-2" />
            Upload Resume
          </Button>
        </div>

        {resumes.length === 0 ? (
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card rounded-2xl p-16 text-center"
          >
            <div className="w-20 h-20 rounded-2xl bg-purple-500/10 flex items-center justify-center mx-auto mb-6">
              <FileText className="w-10 h-10 text-purple-400" />
            </div>
            <h3 className="text-xl font-bold text-white mb-2">Upload your first resume</h3>
            <p className="text-white/40 mb-6 max-w-md mx-auto">
              Upload your resume to generate tailored cover letters and resume bullets for each job application
            </p>
            <Button
              onClick={() => setUploadOpen(true)}
              className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-8 py-5 font-semibold premium-button"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload Resume
            </Button>
          </motion.div>
        ) : (
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
            {resumes.map((resume, i) => (
              <motion.div
                key={resume.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: i * 0.05 }}
                className="glass-card rounded-2xl p-6 hover:bg-white/[0.04] transition-all group"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="w-12 h-12 rounded-xl bg-purple-500/10 flex items-center justify-center">
                    <FileText className="w-6 h-6 text-purple-400" />
                  </div>
                  {resume.isDefault && (
                    <div className="flex items-center gap-1 px-2 py-1 rounded-lg bg-amber-500/10 text-amber-400 text-xs font-medium">
                      <Star className="w-3 h-3 fill-current" />
                      Default
                    </div>
                  )}
                </div>

                <h3 className="text-lg font-semibold text-white mb-2 line-clamp-1">{resume.name}</h3>
                <div className="flex items-center gap-2 text-xs text-white/30 mb-6">
                  <Calendar className="w-3 h-3" />
                  Updated {format(new Date(resume.updated_date), "MMM d, yyyy")}
                </div>

                <div className="flex items-center gap-2">
                  {!resume.isDefault && (
                    <Button
                      onClick={() => handleSetDefault(resume.id)}
                      variant="ghost"
                      className="flex-1 text-xs text-white/50 hover:text-white hover:bg-white/5 py-2 rounded-lg"
                    >
                      <Star className="w-3 h-3 mr-1" />
                      Set Default
                    </Button>
                  )}
                  <Button
                    onClick={() => {
                      setSelectedResume(resume);
                      setResumeName(resume.name);
                      setEditOpen(true);
                    }}
                    variant="ghost"
                    className="flex-1 text-xs text-white/50 hover:text-white hover:bg-white/5 py-2 rounded-lg"
                  >
                    <Edit2 className="w-3 h-3 mr-1" />
                    Rename
                  </Button>
                  <Button
                    onClick={() => {
                      setSelectedResume(resume);
                      setDeleteOpen(true);
                    }}
                    variant="ghost"
                    className="px-3 text-xs text-red-400/50 hover:text-red-400 hover:bg-red-500/5 py-2 rounded-lg"
                  >
                    <Trash2 className="w-3 h-3" />
                  </Button>
                </div>
              </motion.div>
            ))}
          </div>
        )}
      </motion.div>

      {/* Upload Dialog */}
      <Dialog open={uploadOpen} onOpenChange={setUploadOpen}>
        <DialogContent className="bg-[hsl(240,10%,6%)] border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Upload Resume</DialogTitle>
            <DialogDescription className="text-white/40">
              Upload a PDF/DOCX file or paste your resume text
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            <div>
              <label className="text-sm text-white/60 mb-2 block font-medium">Resume Name</label>
              <Input
                placeholder="e.g., Software Engineer Resume"
                value={resumeName}
                onChange={(e) => setResumeName(e.target.value)}
                className="bg-white/[0.03] border-white/8 text-white placeholder:text-white/25 py-5 rounded-xl"
              />
            </div>

            <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
              <button
                onClick={() => setUploadMethod("file")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  uploadMethod === "file"
                    ? "bg-purple-600 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                <Upload className="w-4 h-4 inline mr-2" />
                Upload File
              </button>
              <button
                onClick={() => setUploadMethod("text")}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                  uploadMethod === "text"
                    ? "bg-purple-600 text-white"
                    : "text-white/50 hover:text-white/70"
                }`}
              >
                <FileText className="w-4 h-4 inline mr-2" />
                Paste Text
              </button>
            </div>

            {uploadMethod === "file" ? (
              <>
                {/* hidden input (no UI change) */}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setSelectedFile(f);
                    if (f) toast.success(`Selected: ${f.name}`);
                  }}
                />
                <div
                  onClick={() => fileInputRef.current?.click()}
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault();
                    const f = e.dataTransfer.files?.[0] || null;
                    if (f) {
                      setSelectedFile(f);
                      toast.success(`Selected: ${f.name}`);
                    }
                  }}
                  className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-purple-500/30 transition-colors cursor-pointer"
                >
                  <Upload className="w-10 h-10 text-white/20 mx-auto mb-3" />
                  <p className="text-sm text-white/60 mb-1">
                    Click to upload or drag and drop
                  </p>
                  <p className="text-xs text-white/30">PDF or DOCX (max 5MB)</p>
                </div>
              </>
            ) : (
              <div>
                <label className="text-sm text-white/60 mb-2 block font-medium">Resume Text</label>
                <Textarea
                  placeholder="Paste your resume content here..."
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  rows={10}
                  className="bg-white/[0.03] border-white/8 text-white placeholder:text-white/25 rounded-xl resize-none"
                />
              </div>
            )}

            <div className="flex gap-3 pt-4">
              <Button
                onClick={() => setUploadOpen(false)}
                variant="ghost"
                className="flex-1 border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleUpload}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 font-semibold premium-button"
              >
                Upload Resume
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Edit Dialog */}
      <Dialog open={editOpen} onOpenChange={setEditOpen}>
        <DialogContent className="bg-[hsl(240,10%,6%)] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Rename Resume</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 mt-4">
            <Input
              placeholder="Resume name"
              value={resumeName}
              onChange={(e) => setResumeName(e.target.value)}
              className="bg-white/[0.03] border-white/8 text-white placeholder:text-white/25 py-5 rounded-xl"
            />
            <div className="flex gap-3">
              <Button
                onClick={() => setEditOpen(false)}
                variant="ghost"
                className="flex-1 border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5"
              >
                Cancel
              </Button>
              <Button
                onClick={handleEdit}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 font-semibold"
              >
                Save
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>

      {/* Delete Dialog */}
      <Dialog open={deleteOpen} onOpenChange={setDeleteOpen}>
        <DialogContent className="bg-[hsl(240,10%,6%)] border-white/10 text-white">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Delete Resume</DialogTitle>
            <DialogDescription className="text-white/40">
              Are you sure you want to delete "{selectedResume?.name}"? This action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button
              onClick={() => setDeleteOpen(false)}
              variant="ghost"
              className="flex-1 border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5"
            >
              Cancel
            </Button>
            <Button
              onClick={handleDelete}
              className="flex-1 bg-red-600/20 hover:bg-red-600/30 text-red-400 rounded-xl py-5 font-semibold border border-red-500/20"
            >
              Delete
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
