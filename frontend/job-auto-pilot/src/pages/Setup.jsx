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

  const handleFinish = () => {
    const resumeData = {
      id: Date.now(),
      name: resumeSource === "upload" 
        ? uploadedFile?.name 
        : resumeSource === "paste" 
        ? "Pasted Resume" 
        : `${fullName} Resume`,
      content: resumeText,
      source: resumeSource,
      created: new Date().toISOString()
    };

    const preferences = {
      targetRoles: selectedRoles,
      seniority,
      locationPreference: locationPref,
      preferredCity,
      tone
    };

    // Store data
    localStorage.setItem("resumes", JSON.stringify([resumeData]));
    localStorage.setItem("defaultResumeId", resumeData.id.toString());
    localStorage.setItem("preferences", JSON.stringify(preferences));
    localStorage.setItem("onboardingComplete", "true");

    toast.success("Setup complete! Welcome to Job Autopilot.");
    navigate(createPageUrl("AppHome"));
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
                  Build from Scratch
                </TabsTrigger>
              </TabsList>

              <TabsContent value="upload" className="mt-6">
                <div className="border-2 border-dashed border-white/10 rounded-xl p-12 text-center hover:border-purple-500/50 transition-colors">
                  <Upload className="w-12 h-12 text-white/40 mx-auto mb-4" />
                  <p className="text-white/60 mb-4">Drop your resume here or click to browse</p>
                  <input
                    type="file"
                    accept=".pdf,.docx,.doc"
                    onChange={handleFileUpload}
                    className="hidden"
                    id="resume-upload"
                  />
                  <label htmlFor="resume-upload">
                    <Button variant="outline" className="bg-white/5 border-white/10 text-white" asChild>
                      <span>Choose File</span>
                    </Button>
                  </label>
                  {uploadedFile && (
                    <p className="text-sm text-purple-400 mt-4">✓ {uploadedFile.name}</p>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="paste" className="mt-6">
                <Textarea
                  value={resumeText}
                  onChange={(e) => setResumeText(e.target.value)}
                  placeholder="Paste your resume text here...

Example:
John Doe
john@email.com | (555) 123-4567

EXPERIENCE
Software Engineer at Tech Co. (2020-2023)
• Built scalable APIs..."
                  className="min-h-[300px] bg-white/5 border-white/10 text-white placeholder:text-white/30 resize-none"
                />
              </TabsContent>

              <TabsContent value="build" className="mt-6 space-y-6">
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder="Full Name *"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                  />
                  <Input
                    placeholder="Email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>
                <div className="grid grid-cols-2 gap-4">
                  <Input
                    placeholder="Phone (optional)"
                    value={phone}
                    onChange={(e) => setPhone(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                  />
                  <Input
                    placeholder="Location (City, State)"
                    value={location}
                    onChange={(e) => setLocation(e.target.value)}
                    className="bg-white/5 border-white/10 text-white"
                  />
                </div>
                <Input
                  placeholder="LinkedIn URL (optional)"
                  value={linkedin}
                  onChange={(e) => setLinkedin(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />

                <div className="space-y-4">
                  <label className="text-sm text-white/60">Work Experience</label>
                  {workExperience.map((work, i) => (
                    <div key={i} className="space-y-3 p-4 rounded-xl bg-white/5 border border-white/10">
                      <div className="grid grid-cols-2 gap-3">
                        <Input
                          placeholder="Company"
                          value={work.company}
                          onChange={(e) => updateWorkExperience(i, "company", e.target.value)}
                          className="bg-white/5 border-white/10 text-white"
                        />
                        <Input
                          placeholder="Role"
                          value={work.role}
                          onChange={(e) => updateWorkExperience(i, "role", e.target.value)}
                          className="bg-white/5 border-white/10 text-white"
                        />
                      </div>
                      <Input
                        placeholder="Dates (e.g., 2020-2023)"
                        value={work.dates}
                        onChange={(e) => updateWorkExperience(i, "dates", e.target.value)}
                        className="bg-white/5 border-white/10 text-white"
                      />
                      <Textarea
                        placeholder="Key accomplishments (one per line)"
                        value={work.bullets}
                        onChange={(e) => updateWorkExperience(i, "bullets", e.target.value)}
                        className="bg-white/5 border-white/10 text-white resize-none"
                        rows={3}
                      />
                    </div>
                  ))}
                  <Button
                    type="button"
                    onClick={addWorkExperience}
                    variant="outline"
                    className="w-full bg-white/5 border-white/10 text-white"
                  >
                    + Add Experience
                  </Button>
                </div>

                <Input
                  placeholder="Skills (comma separated)"
                  value={skills}
                  onChange={(e) => setSkills(e.target.value)}
                  className="bg-white/5 border-white/10 text-white"
                />
              </TabsContent>
            </Tabs>

            <div className="flex justify-end">
              <Button
                onClick={handleNext}
                className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-6"
              >
                Continue
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}

        {/* Step 2: Complete Setup - Skip Preferences */}
        {step === 2 && (
          <div className="glass-card rounded-2xl p-8">
            <h2 className="text-2xl font-bold text-white mb-6">All Set!</h2>
            <p className="text-white/40 mb-8">Your resume has been uploaded. Click below to finish setup.</p>

            <div className="flex justify-between">
              <Button
                onClick={() => setStep(1)}
                variant="ghost"
                className="text-white/60"
              >
                Back
              </Button>
              <Button
                onClick={handleFinish}
                className="bg-purple-600 hover:bg-purple-500 text-white px-8 py-6"
              >
                Complete Setup
                <ChevronRight className="w-4 h-4 ml-2" />
              </Button>
            </div>
          </div>
        )}


      </div>
    </div>
  );
}