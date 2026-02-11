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
    credentials: "include", // ✅ REQUIRED for SWA auth
    headers: {
      "Content-Type": "application/json",
      ...(options.headers || {}),
    },
  });

  const data = await readJsonSafe(res);
  if (!res.ok) {
    const msg =
      data?.error ||
      data?.message ||
      data?.detail ||
      `Request failed (${res.status})`;
    throw new Error(msg);
  }
  return data;
}

function normalizeResume(doc) {
  const id = doc.id || doc._id || String(Date.now());
  const name = doc.name || "Resume";
  const updated =
    doc.updated_date || doc.uploadedAt || doc.createdAt || new Date().toISOString();

  return {
    id,
    name,
    isDefault: Boolean(doc.isDefault),
    updated_date: String(updated).includes("T")
      ? String(updated).split("T")[0]
      : String(updated),
    // preview fields will be filled by /api/resume/read-url on demand
    blobUrl: "",
    contentType: "",
    originalName: "",
    content: doc.content || doc.text || "",
    _raw: doc,
  };
}

export default function Resumes() {
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

  // ✅ NEW: prevents "button does nothing" issues + double clicks, and makes upload reliable
  const [uploading, setUploading] = useState(false);

  // preview state (NO UI changes)
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewResume, setPreviewResume] = useState(null);
  const [previewLoading, setPreviewLoading] = useState(false);

  const loadResumes = async () => {
    try {
      const data = await apiJson("/api/resume/list", { method: "GET" });
      const items = data?.resumes || [];
      const normalized = Array.isArray(items) ? items.map(normalizeResume) : [];
      setResumes(normalized);
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

  const resetUploadState = () => {
    setResumeName("");
    setResumeText("");
    setSelectedFile(null);
    setUploading(false);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleUpload = async () => {
    if (uploading) return;

    if (!resumeName.trim()) {
      toast.error("Please enter a resume name");
      return;
    }

    // Validate before setting uploading=true (so you don't lock the UI on validation errors)
    if (uploadMethod === "text") {
      if (!resumeText.trim()) {
        toast.error("Please paste your resume text");
        return;
      }
    } else {
      if (!selectedFile) {
        toast.error("Please choose a file");
        return;
      }
      const maxBytes = 5 * 1024 * 1024;
      if (selectedFile.size > maxBytes) {
        toast.error("File too large (max 5MB)");
        return;
      }
    }

    setUploading(true);
    try {
      if (uploadMethod === "text") {
        const payload = {
          name: resumeName,
          content: resumeText,
          contentType: "text/plain",
          size: resumeText.length,
          blobName: `text:${Date.now()}`,
        };

        await apiJson("/api/resume/save", {
          method: "POST",
          body: JSON.stringify(payload),
        });

        toast.success("Resume uploaded successfully");
        setUploadOpen(false);
        resetUploadState();
        await loadResumes();
        return;
      }

      // file upload flow (SAS)
      const uploadUrlResp = await apiJson("/api/resume/upload-url", {
        method: "POST",
        body: JSON.stringify({
          name: resumeName,
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

      const putRes = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "x-ms-blob-type": "BlockBlob",
          // Keep Content-Type to match what backend signed/expected
          "Content-Type": selectedFile.type || "application/octet-stream",
        },
        body: selectedFile,
      });

      if (!putRes.ok) {
        const errText = await putRes.text().catch(() => "");
        throw new Error(errText || `Blob upload failed (${putRes.status})`);
      }

      const savePayload = {
        name: resumeName,
        blobName,
        originalName: selectedFile.name,
        fileName: selectedFile.name,
        contentType: selectedFile.type || "application/octet-stream",
        size: selectedFile.size || 0,
      };

      await apiJson("/api/resume/save", {
        method: "POST",
        body: JSON.stringify(savePayload),
      });

      toast.success("Resume uploaded successfully");
      setUploadOpen(false);
      resetUploadState();
      await loadResumes();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Upload failed");
    } finally {
      setUploading(false);
    }
  };

  const handleEdit = async () => {
    if (!resumeName.trim()) {
      toast.error("Please enter a resume name");
      return;
    }

    try {
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

      await apiJson("/api/resume/rename", {
        method: "POST",
        body: JSON.stringify({ id: selectedResume.id, name: resumeName }),
      });

      toast.success("Resume updated");
      setEditOpen(false);
      setResumeName("");
      setSelectedResume(null);
      await loadResumes();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Rename failed");
      await loadResumes();
    }
  };

  const handleDelete = async () => {
    try {
      const id = selectedResume?.id;
      setResumes(resumes.filter((r) => r.id !== id));

      await apiJson("/api/resume/delete", {
        method: "POST",
        body: JSON.stringify({ id }),
      });

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
      setResumes(resumes.map((r) => ({ ...r, isDefault: r.id === id })));

      await apiJson("/api/resume/set-default", {
        method: "POST",
        body: JSON.stringify({ id }),
      });

      toast.success("Default resume updated");
      await loadResumes();
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Failed to set default");
      await loadResumes();
    }
  };

  // ✅ NEW: preview loads the SAS url by ID
  const openPreview = async (resume) => {
    if (!resume?.id) return;

    // If text resume exists locally, open immediately
    if ((resume.content || "").trim()) {
      setPreviewResume(resume);
      setPreviewOpen(true);
      return;
    }

    try {
      setPreviewLoading(true);
      setPreviewOpen(true);
      setPreviewResume({ ...resume, blobUrl: "" });

      const data = await apiJson("/api/resume/read-url", {
        method: "POST",
        body: JSON.stringify({ id: resume.id }),
      });

      const url = data?.url;
      if (!url) {
        throw new Error("No preview URL returned");
      }

      setPreviewResume({
        ...resume,
        blobUrl: url,
        contentType: data?.contentType || resume.contentType || "",
        originalName: data?.originalName || resume.originalName || "",
      });
    } catch (e) {
      console.error(e);
      toast.error(e?.message || "Preview failed");
      setPreviewOpen(false);
      setPreviewResume(null);
    } finally {
      setPreviewLoading(false);
    }
  };

  const previewSrc = (() => {
    const r = previewResume;
    if (!r?.blobUrl) return "";
    const ct = (r.contentType || "").toLowerCase();
    const name = (r.originalName || "").toLowerCase();

    // PDF: native
    if (ct.includes("pdf") || name.endsWith(".pdf")) return r.blobUrl;

    // Office docs: office viewer (SAS works)
    if (
      ct.includes("word") ||
      ct.includes("officedocument") ||
      name.endsWith(".doc") ||
      name.endsWith(".docx") ||
      name.endsWith(".ppt") ||
      name.endsWith(".pptx") ||
      name.endsWith(".xls") ||
      name.endsWith(".xlsx")
    ) {
      return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(
        r.blobUrl
      )}`;
    }

    return r.blobUrl;
  })();

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
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Resumes
            </h1>
            <p className="text-white/40 mt-1">Manage your resume library</p>
          </div>
          <Button
            type="button"
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
            <h3 className="text-xl font-bold text-white mb-2">
              Upload your first resume
            </h3>
            <p className="text-white/40 mb-6 max-w-md mx-auto">
              Upload your resume to generate tailored cover letters and resume
              bullets for each job application
            </p>
            <Button
              type="button"
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
                // ✅ Hover "popup" effect (lift + subtle ring + tooltip)
                className="relative glass-card rounded-2xl p-6 hover:bg-white/[0.04] transition-all group cursor-pointer will-change-transform transform-gpu hover:-translate-y-1 hover:scale-[1.01] hover:ring-1 hover:ring-purple-500/25 hover:shadow-[0_12px_40px_rgba(0,0,0,0.45)]"
                onClick={() => openPreview(resume)}
              >
                {/* hover tooltip/popup */}
                <div className="pointer-events-none absolute -top-3 left-6 opacity-0 group-hover:opacity-100 transition-opacity">
                  <div className="px-3 py-1 rounded-xl bg-black/70 border border-white/10 text-xs text-white/80 backdrop-blur">
                    Click to preview
                  </div>
                </div>

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

                <h3 className="text-lg font-semibold text-white mb-2 line-clamp-1">
                  {resume.name}
                </h3>
                <div className="flex items-center gap-2 text-xs text-white/30 mb-6">
                  <Calendar className="w-3 h-3" />
                  Updated {format(new Date(resume.updated_date), "MMM d, yyyy")}
                </div>

                <div className="flex items-center gap-2">
                  {!resume.isDefault && (
                    <Button
                      type="button"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleSetDefault(resume.id);
                      }}
                      variant="ghost"
                      className="flex-1 text-xs text-white/50 hover:text-white hover:bg-white/5 py-2 rounded-lg"
                    >
                      <Star className="w-3 h-3 mr-1" />
                      Set Default
                    </Button>
                  )}
                  <Button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
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
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
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

      {/* Preview Dialog (same Dialog, no UI redesign) */}
      <Dialog
        open={previewOpen}
        onOpenChange={(open) => {
          setPreviewOpen(open);
          if (!open) setPreviewResume(null);
        }}
      >
        <DialogContent className="bg-[hsl(240,10%,6%)] border-white/10 text-white max-w-5xl h-[80vh] flex flex-col">
          <DialogHeader className="shrink-0">
            <DialogTitle className="text-xl font-bold">
              {previewResume?.name}
            </DialogTitle>
            <DialogDescription className="text-white/40">
              Resume Preview
            </DialogDescription>
          </DialogHeader>

          {/* Body fills remaining space */}
          <div className="flex-1 min-h-0">
            {previewLoading ? (
              <div className="flex items-center justify-center h-full text-white/40">
                Loading preview…
              </div>
            ) : (previewResume?.content || "").trim() ? (
              <div className="w-full h-full rounded-xl border border-white/10 bg-white/[0.02] overflow-auto p-4">
                <pre className="whitespace-pre-wrap text-sm text-white/80">
                  {previewResume.content}
                </pre>
              </div>
            ) : previewResume?.blobUrl ? (
              <iframe
                title="Resume Preview"
                src={previewSrc}
                className="w-full h-full rounded-xl border border-white/10"
              />
            ) : (
              <div className="flex items-center justify-center h-full text-white/40">
                No preview available
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* Upload Dialog */}
      <Dialog
        open={uploadOpen}
        onOpenChange={(open) => {
          setUploadOpen(open);
          if (!open) resetUploadState();
        }}
      >
        <DialogContent className="bg-[hsl(240,10%,6%)] border-white/10 text-white max-w-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-bold">Upload Resume</DialogTitle>
            <DialogDescription className="text-white/40">
              Upload a PDF/DOCX file or paste your resume text
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-6 mt-4">
            <div>
              <label className="text-sm text-white/60 mb-2 block font-medium">
                Resume Name
              </label>
              <Input
                placeholder="e.g., Software Engineer Resume"
                value={resumeName}
                onChange={(e) => setResumeName(e.target.value)}
                className="bg-white/[0.03] border-white/8 text-white placeholder:text-white/25 py-5 rounded-xl"
              />
            </div>

            <div className="flex gap-2 p-1 bg-white/5 rounded-xl">
              <button
                type="button"
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
                type="button"
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
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".pdf,.doc,.docx,application/pdf,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                  className="hidden"
                  onChange={(e) => {
                    const f = e.target.files?.[0] || null;
                    setSelectedFile(f);
                    if (f) {
                      if (!resumeName.trim()) {
                        const base = f.name.replace(/\.[^/.]+$/, "");
                        setResumeName(base || "Resume");
                      }
                      toast.success(`Selected: ${f.name}`);
                    }
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
                      if (!resumeName.trim()) {
                        const base = f.name.replace(/\.[^/.]+$/, "");
                        setResumeName(base || "Resume");
                      }
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
                <label className="text-sm text-white/60 mb-2 block font-medium">
                  Resume Text
                </label>
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
                type="button"
                onClick={() => setUploadOpen(false)}
                variant="ghost"
                disabled={uploading}
                className="flex-1 border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5 disabled:opacity-60 disabled:cursor-not-allowed"
              >
                Cancel
              </Button>

              <Button
                type="button"
                onClick={handleUpload}
                disabled={uploading}
                className="flex-1 bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 font-semibold premium-button disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Upload className="w-4 h-4 mr-2" />
                {uploading ? "Uploading..." : "Upload Resume"}
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
                type="button"
                onClick={() => setEditOpen(false)}
                variant="ghost"
                className="flex-1 border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5"
              >
                Cancel
              </Button>
              <Button
                type="button"
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
              Are you sure you want to delete "{selectedResume?.name}"? This
              action cannot be undone.
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-3 mt-4">
            <Button
              type="button"
              onClick={() => setDeleteOpen(false)}
              variant="ghost"
              className="flex-1 border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5"
            >
              Cancel
            </Button>
            <Button
              type="button"
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
