import React, { useState } from "react";
import { Sparkles, Link2, Building2, Briefcase, FileText, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";

export default function JobInputForm({ onGenerate, isGenerating }) {
  const [form, setForm] = useState({
    job_link: "",
    job_title: "",
    company: "",
    job_description: "",
    resume_id: "",
  });

  const handleChange = (field, value) => {
    setForm((prev) => ({ ...prev, [field]: value }));
  };

  const handleSubmit = (e) => {
    e.preventDefault();
    if (!form.job_description.trim()) return;
    onGenerate(form);
  };

  return (
    <div className="glass-card rounded-2xl p-6 md:p-8">
      <div className="flex items-center gap-2 mb-6">
        <div className="w-8 h-8 rounded-lg bg-purple-600/20 flex items-center justify-center">
          <Sparkles className="w-4 h-4 text-purple-400" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-white">Generate Documents</h2>
          <p className="text-xs text-white/30">Paste a job description to get started</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Resume Selection */}
        <div className="space-y-3">
          <label className="text-sm text-white/70 font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-400" />
            Resume
          </label>
          <div className="flex gap-3">
            <Select
              value={form.resume_id}
              onValueChange={(value) => handleChange("resume_id", value)}
            >
              <SelectTrigger className="flex-1 bg-white/[0.03] border-white/8 text-white/60 rounded-xl py-5">
                <SelectValue placeholder="No resume selected" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No resume selected</SelectItem>
                <SelectItem value="1">Software Engineer Resume</SelectItem>
                <SelectItem value="2">Product Manager Resume</SelectItem>
              </SelectContent>
            </Select>
            <Button
              type="button"
              className="bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl px-5"
            >
              <Upload className="w-4 h-4 mr-2" />
              Upload
            </Button>
          </div>
          <p className="text-xs text-white/30">Choose a resume so we can tailor bullets to your experience.</p>
        </div>

        <div className="border-t border-white/5" />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="relative">
            <Link2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <Input
              placeholder="Job posting URL (optional)"
              value={form.job_link}
              onChange={(e) => handleChange("job_link", e.target.value)}
              className="bg-white/[0.03] border-white/8 text-white placeholder:text-white/25 pl-10 py-5 rounded-xl focus:border-purple-500/50 focus:ring-purple-500/20"
            />
          </div>
          <div className="relative">
            <Briefcase className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
            <Input
              placeholder="Job title (optional)"
              value={form.job_title}
              onChange={(e) => handleChange("job_title", e.target.value)}
              className="bg-white/[0.03] border-white/8 text-white placeholder:text-white/25 pl-10 py-5 rounded-xl focus:border-purple-500/50 focus:ring-purple-500/20"
            />
          </div>
        </div>

        <div className="relative">
          <Building2 className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-white/20" />
          <Input
            placeholder="Company name (optional)"
            value={form.company}
            onChange={(e) => handleChange("company", e.target.value)}
            className="bg-white/[0.03] border-white/8 text-white placeholder:text-white/25 pl-10 py-5 rounded-xl focus:border-purple-500/50 focus:ring-purple-500/20"
          />
        </div>

        <div className="space-y-3">
          <label className="text-sm text-white/70 font-semibold flex items-center gap-2">
            <FileText className="w-4 h-4 text-purple-400" />
            Job Description
          </label>
          <Textarea
            placeholder="Paste the full job description here..."
            value={form.job_description}
            onChange={(e) => handleChange("job_description", e.target.value)}
            rows={8}
            className="bg-white/[0.03] border-white/8 text-white placeholder:text-white/25 rounded-xl resize-none focus:border-purple-500/50 focus:ring-purple-500/20 leading-relaxed"
          />
        </div>

        <div className="space-y-2">
          <Button
            type="submit"
            disabled={!form.job_description.trim() || isGenerating}
            className="w-full py-6 bg-purple-600 hover:bg-purple-500 disabled:bg-purple-600/30 disabled:text-white/40 text-white rounded-xl text-base transition-all duration-300 glow-purple hover:scale-[1.01]"
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-5 h-5 mr-2 animate-spin" />
                Generating...
              </>
            ) : (
              <>
                <Sparkles className="w-5 h-5 mr-2" />
                Generate Documents
              </>
            )}
          </Button>
          <p className="text-xs text-white/30 text-center">Uses 1 credit per generation</p>
        </div>
      </form>
    </div>
  );
}