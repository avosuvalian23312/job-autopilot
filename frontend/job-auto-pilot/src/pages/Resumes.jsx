import React, { useState } from "react";
import AppNav from "@/components/app/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { FileText, Upload, Edit2, Trash2, Star, Calendar, Plus, X } from "lucide-react";
import { motion } from "framer-motion";
import { toast } from "sonner";
import { format } from "date-fns";

export default function Resumes() {
  const [resumes, setResumes] = useState([
    {
      id: 1,
      name: "Software Engineer Resume",
      content: "Sample resume content...",
      isDefault: true,
      updated_date: "2026-02-05"
    },
    {
      id: 2,
      name: "Product Manager Resume",
      content: "Sample resume content...",
      isDefault: false,
      updated_date: "2026-01-28"
    },
  ]);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedResume, setSelectedResume] = useState(null);
  const [uploadMethod, setUploadMethod] = useState("file"); // "file" or "text"
  const [resumeText, setResumeText] = useState("");
  const [resumeName, setResumeName] = useState("");

  const handleUpload = () => {
    if (!resumeName.trim()) {
      toast.error("Please enter a resume name");
      return;
    }
    
    const newResume = {
      id: Date.now(),
      name: resumeName,
      content: resumeText || "Uploaded file content",
      isDefault: resumes.length === 0,
      updated_date: new Date().toISOString().split('T')[0]
    };
    
    setResumes([newResume, ...resumes]);
    toast.success("Resume uploaded successfully");
    setUploadOpen(false);
    setResumeName("");
    setResumeText("");
  };

  const handleEdit = () => {
    if (!resumeName.trim()) {
      toast.error("Please enter a resume name");
      return;
    }
    
    setResumes(resumes.map(r => 
      r.id === selectedResume.id 
        ? { ...r, name: resumeName, updated_date: new Date().toISOString().split('T')[0] }
        : r
    ));
    toast.success("Resume updated");
    setEditOpen(false);
    setResumeName("");
    setSelectedResume(null);
  };

  const handleDelete = () => {
    setResumes(resumes.filter(r => r.id !== selectedResume.id));
    toast.success("Resume deleted");
    setDeleteOpen(false);
    setSelectedResume(null);
  };

  const handleSetDefault = (id) => {
    setResumes(resumes.map(r => ({ ...r, isDefault: r.id === id })));
    toast.success("Default resume updated");
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
              <div className="border-2 border-dashed border-white/10 rounded-xl p-8 text-center hover:border-purple-500/30 transition-colors cursor-pointer">
                <Upload className="w-10 h-10 text-white/20 mx-auto mb-3" />
                <p className="text-sm text-white/60 mb-1">Click to upload or drag and drop</p>
                <p className="text-xs text-white/30">PDF or DOCX (max 5MB)</p>
              </div>
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