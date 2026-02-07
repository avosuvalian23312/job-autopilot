import React, { useState } from "react";
import AppNav from "@/components/app/AppNav";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { User, CreditCard, FileText, Check, Sparkles, Plus, Trash2, Link2, MapPin, Coins, Mail, Bug } from "lucide-react";
import { toast } from "sonner";
import { motion } from "framer-motion";

export default function AppSettings() {
  const [profile, setProfile] = useState({
    name: "Alex Johnson",
    email: "alex@example.com",
    phone: "+1 (555) 123-4567",
    location: "San Francisco, CA",
    linkedin: "linkedin.com/in/alexjohnson",
    portfolio: "alexjohnson.dev",
  });

  const [resumeProfile, setResumeProfile] = useState({
    currentTitle: "Senior Software Engineer",
    yearsExp: "8",
    skills: ["React", "TypeScript", "Node.js", "Python", "AWS", "System Design"],
    experience: [
      "Led cross-functional team of 8 engineers delivering mission-critical platform redesign",
      "Architected scalable microservices infrastructure handling 10M+ daily requests",
      "Reduced infrastructure costs by 35% through containerization strategy",
    ],
    education: "BS Computer Science, Stanford University",
    certifications: ["AWS Solutions Architect", "Google Cloud Professional"],
  });

  const [newSkill, setNewSkill] = useState("");
  const [newExp, setNewExp] = useState("");
  const [newCert, setNewCert] = useState("");

  const handleSave = () => {
    toast.success("Settings saved successfully");
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <AppNav currentPage="AppSettings" />
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        exit={{ opacity: 0, x: -20 }}
        transition={{ duration: 0.3 }}
        className="max-w-7xl mx-auto px-4 sm:px-6 py-8"
      >
        <div className="mb-8">
          <h1 className="text-3xl font-bold" style={{ color: '#F5F5F7' }}>Settings</h1>
          <p style={{ color: '#B3B3B8' }}>Manage your profile, resume data, and billing</p>
        </div>

        <Tabs defaultValue="profile" className="w-full">
          <TabsList className="bg-transparent border-b border-white/10 rounded-none mb-12 w-full justify-start h-auto p-0">
            <TabsTrigger 
              value="profile" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-500 data-[state=active]:bg-transparent data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20 px-6 py-4 text-base font-semibold transition-all hover:scale-[1.03]"
              style={{ color: '#B3B3B8' }}
              data-state-active-style={{ color: '#F5F5F7' }}
            >
              <User className="w-5 h-5 mr-2" />
              Profile
            </TabsTrigger>
            <TabsTrigger 
              value="resume" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-500 data-[state=active]:bg-transparent data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20 px-6 py-4 text-base font-semibold transition-all hover:scale-[1.03]"
              style={{ color: '#B3B3B8' }}
            >
              <FileText className="w-5 h-5 mr-2" />
              Resume
            </TabsTrigger>
            <TabsTrigger 
              value="billing" 
              className="rounded-none border-b-2 border-transparent data-[state=active]:border-purple-500 data-[state=active]:bg-transparent data-[state=active]:shadow-lg data-[state=active]:shadow-purple-500/20 px-6 py-4 text-base font-semibold transition-all hover:scale-[1.03]"
              style={{ color: '#B3B3B8' }}
            >
              <CreditCard className="w-5 h-5 mr-2" />
              Billing
            </TabsTrigger>
          </TabsList>

            <TabsContent value="profile" className="max-w-4xl">
              <div className="space-y-12">
                <div>
                  <h3 className="text-xl font-semibold mb-8 pb-4 border-b border-white/10" style={{ color: '#F5F5F7' }}>Personal Information</h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm mb-3 block font-medium" style={{ color: '#B3B3B8' }}>Full Name</label>
                      <Input
                        value={profile.name}
                        onChange={(e) => setProfile({ ...profile, name: e.target.value })}
                        className="border-white/12 text-white py-6 rounded-xl text-base"
                        style={{ background: '#141414' }}
                      />
                    </div>
                    <div>
                      <label className="text-sm mb-3 block font-medium" style={{ color: '#B3B3B8' }}>Email Address</label>
                      <Input
                        value={profile.email}
                        onChange={(e) => setProfile({ ...profile, email: e.target.value })}
                        className="border-white/12 text-white py-6 rounded-xl text-base"
                        style={{ background: '#141414' }}
                      />
                    </div>
                    <div>
                      <label className="text-sm mb-3 block font-medium" style={{ color: '#B3B3B8' }}>Phone Number</label>
                      <Input
                        value={profile.phone}
                        onChange={(e) => setProfile({ ...profile, phone: e.target.value })}
                        className="border-white/12 text-white py-6 rounded-xl text-base"
                        style={{ background: '#141414' }}
                      />
                    </div>
                    <div>
                      <label className="text-sm mb-3 block font-medium" style={{ color: '#B3B3B8' }}>Location</label>
                      <div className="relative">
                        <MapPin className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#8A8A92' }} />
                        <Input
                          value={profile.location}
                          onChange={(e) => setProfile({ ...profile, location: e.target.value })}
                          className="border-white/12 text-white py-6 rounded-xl pl-12 text-base"
                          style={{ background: '#141414' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-8 pb-4 border-b border-white/10" style={{ color: '#F5F5F7' }}>Links</h3>
                  <div className="grid md:grid-cols-2 gap-6">
                    <div>
                      <label className="text-sm mb-3 block font-medium" style={{ color: '#B3B3B8' }}>LinkedIn URL</label>
                      <div className="relative">
                        <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#8A8A92' }} />
                        <Input
                          value={profile.linkedin}
                          onChange={(e) => setProfile({ ...profile, linkedin: e.target.value })}
                          className="border-white/12 text-white py-6 rounded-xl pl-12 text-base"
                          style={{ background: '#141414' }}
                        />
                      </div>
                    </div>
                    <div>
                      <label className="text-sm mb-3 block font-medium" style={{ color: '#B3B3B8' }}>Portfolio URL</label>
                      <div className="relative">
                        <Link2 className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5" style={{ color: '#8A8A92' }} />
                        <Input
                          value={profile.portfolio}
                          onChange={(e) => setProfile({ ...profile, portfolio: e.target.value })}
                          className="border-white/12 text-white py-6 rounded-xl pl-12 text-base"
                          style={{ background: '#141414' }}
                        />
                      </div>
                    </div>
                  </div>
                </div>

                <div>
                  <h3 className="text-xl font-semibold mb-8 pb-4 border-b border-white/10" style={{ color: '#F5F5F7' }}>Support</h3>
                  <div className="space-y-4">
                    <Button
                      onClick={() => window.location.href = 'mailto:support@jobautopilot.com'}
                      className="w-full bg-white/[0.03] hover:bg-white/[0.05] border border-white/12 text-white py-6 rounded-xl text-base font-medium hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/20 transition-all"
                      style={{ justifyContent: 'flex-start' }}
                    >
                      <Mail className="w-5 h-5 mr-3" />
                      Contact Support
                    </Button>
                    <Button
                      onClick={() => toast.info('Bug report form coming soon')}
                      className="w-full bg-white/[0.03] hover:bg-white/[0.05] border border-white/12 text-white py-6 rounded-xl text-base font-medium hover:scale-[1.02] hover:shadow-lg hover:shadow-purple-500/20 transition-all"
                      style={{ justifyContent: 'flex-start' }}
                    >
                      <Bug className="w-5 h-5 mr-3" />
                      Report a Bug
                    </Button>
                  </div>
                </div>

                <div className="pt-8 mt-8 border-t border-white/10">
                  <Button 
                    onClick={handleSave} 
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-6 px-8 text-lg font-semibold premium-button shadow-lg hover:shadow-purple-500/30 hover:scale-[1.02]"
                  >
                    <Check className="w-5 h-5 mr-2" />
                    Save Changes
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="resume" className="max-w-4xl">
              <div className="space-y-12">
                <div className="flex items-start gap-4 p-6 rounded-xl bg-purple-500/5 border border-purple-500/30">
                  <Sparkles className="w-6 h-6 text-purple-400 shrink-0 mt-1" />
                  <p className="text-base leading-relaxed" style={{ color: '#B3B3B8' }}>
                    This information helps our AI generate more accurate, personalized cover letters and resume bullets tailored to each job.
                  </p>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div>
                    <label className="text-sm mb-3 block font-medium" style={{ color: '#B3B3B8' }}>Current Job Title</label>
                    <Input
                      value={resumeProfile.currentTitle}
                      onChange={(e) => setResumeProfile({ ...resumeProfile, currentTitle: e.target.value })}
                      className="border-white/12 text-white py-6 rounded-xl text-base"
                      style={{ background: '#141414' }}
                    />
                  </div>
                  <div>
                    <label className="text-sm mb-3 block font-medium" style={{ color: '#B3B3B8' }}>Years of Experience</label>
                    <Input
                      value={resumeProfile.yearsExp}
                      onChange={(e) => setResumeProfile({ ...resumeProfile, yearsExp: e.target.value })}
                      className="border-white/12 text-white py-6 rounded-xl text-base"
                      style={{ background: '#141414' }}
                    />
                  </div>
                </div>

                <div>
                  <label className="text-sm mb-3 block font-medium" style={{ color: '#B3B3B8' }}>Skills</label>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {resumeProfile.skills.map((skill, i) => (
                      <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-purple-500/10 border border-purple-500/20 text-purple-300 text-sm font-medium">
                        {skill}
                        <button onClick={() => setResumeProfile({ ...resumeProfile, skills: resumeProfile.skills.filter((_, idx) => idx !== i) })} className="hover:text-purple-200">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a skill"
                      value={newSkill}
                      onChange={(e) => setNewSkill(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newSkill.trim()) {
                          setResumeProfile({ ...resumeProfile, skills: [...resumeProfile.skills, newSkill] });
                          setNewSkill("");
                        }
                      }}
                      className="border-white/12 text-white py-6 rounded-xl text-base"
                      style={{ background: '#141414' }}
                    />
                    <Button
                      onClick={() => {
                        if (newSkill.trim()) {
                          setResumeProfile({ ...resumeProfile, skills: [...resumeProfile.skills, newSkill] });
                          setNewSkill("");
                        }
                      }}
                      className="bg-white/[0.03] hover:bg-white/[0.05] text-white border border-white/12 rounded-xl px-6 py-6"
                    >
                      <Plus className="w-5 h-5" />
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm mb-3 block font-medium" style={{ color: '#B3B3B8' }}>Key Experience Bullets</label>
                  <div className="space-y-3 mb-4">
                    {resumeProfile.experience.map((exp, i) => (
                      <div key={i} className="flex items-start gap-3 p-4 rounded-lg border border-white/10" style={{ background: '#141414' }}>
                        <span className="text-sm flex-1 leading-relaxed" style={{ color: '#B3B3B8' }}>{exp}</span>
                        <button onClick={() => setResumeProfile({ ...resumeProfile, experience: resumeProfile.experience.filter((_, idx) => idx !== i) })} className="text-white/30 hover:text-white/60">
                          <Trash2 className="w-4 h-4" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Textarea
                      placeholder="Add an experience bullet"
                      value={newExp}
                      onChange={(e) => setNewExp(e.target.value)}
                      rows={2}
                      className="border-white/12 text-white rounded-xl resize-none text-base"
                      style={{ background: '#141414' }}
                    />
                    <Button
                      onClick={() => {
                        if (newExp.trim()) {
                          setResumeProfile({ ...resumeProfile, experience: [...resumeProfile.experience, newExp] });
                          setNewExp("");
                        }
                      }}
                      className="bg-white/[0.03] hover:bg-white/[0.05] text-white border border-white/12 rounded-xl px-6"
                    >
                      <Plus className="w-5 h-5" />
                    </Button>
                  </div>
                </div>

                <div>
                  <label className="text-sm mb-3 block font-medium" style={{ color: '#B3B3B8' }}>Education</label>
                  <Textarea
                    value={resumeProfile.education}
                    onChange={(e) => setResumeProfile({ ...resumeProfile, education: e.target.value })}
                    rows={2}
                    className="border-white/12 text-white rounded-xl resize-none text-base"
                    style={{ background: '#141414' }}
                  />
                </div>

                <div>
                  <label className="text-sm mb-3 block font-medium" style={{ color: '#B3B3B8' }}>Certifications</label>
                  <div className="flex flex-wrap gap-2 mb-4">
                    {resumeProfile.certifications.map((cert, i) => (
                      <div key={i} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-emerald-500/10 border border-emerald-500/20 text-emerald-300 text-sm font-medium">
                        {cert}
                        <button onClick={() => setResumeProfile({ ...resumeProfile, certifications: resumeProfile.certifications.filter((_, idx) => idx !== i) })} className="hover:text-emerald-200">
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2">
                    <Input
                      placeholder="Add a certification"
                      value={newCert}
                      onChange={(e) => setNewCert(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" && newCert.trim()) {
                          setResumeProfile({ ...resumeProfile, certifications: [...resumeProfile.certifications, newCert] });
                          setNewCert("");
                        }
                      }}
                      className="border-white/12 text-white py-6 rounded-xl text-base"
                      style={{ background: '#141414' }}
                    />
                    <Button
                      onClick={() => {
                        if (newCert.trim()) {
                          setResumeProfile({ ...resumeProfile, certifications: [...resumeProfile.certifications, newCert] });
                          setNewCert("");
                        }
                      }}
                      className="bg-white/[0.03] hover:bg-white/[0.05] text-white border border-white/12 rounded-xl px-6 py-6"
                    >
                      <Plus className="w-5 h-5" />
                    </Button>
                  </div>
                </div>

                <div className="pt-8 mt-8 border-t border-white/10">
                  <Button 
                    onClick={handleSave} 
                    className="w-full bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-6 px-8 text-lg font-semibold premium-button shadow-lg hover:shadow-purple-500/30 hover:scale-[1.02]"
                  >
                    <Check className="w-5 h-5 mr-2" />
                    Save Profile
                  </Button>
                </div>
              </div>
            </TabsContent>

            <TabsContent value="billing" className="max-w-5xl">
              <div className="space-y-8">
                <div className="flex items-center justify-between pb-6 border-b border-white/10">
                  <div>
                    <h3 className="text-xl font-semibold mb-1" style={{ color: '#F5F5F7' }}>Current Plan</h3>
                    <p className="text-sm" style={{ color: '#B3B3B8' }}>You're on the Power plan</p>
                  </div>
                  <div className="flex items-center gap-3 px-6 py-3 rounded-xl bg-purple-500/10 border border-purple-500/20">
                    <Sparkles className="w-5 h-5 text-purple-400" />
                    <span className="text-base font-semibold text-purple-300">Power — $19.99/mo</span>
                  </div>
                </div>

                <div className="grid md:grid-cols-2 gap-6">
                  <div className="rounded-xl p-6 border border-white/12" style={{ background: '#141414' }}>
                    <div className="flex items-center gap-3 mb-4">
                      <Coins className="w-6 h-6 text-purple-400" />
                      <span className="text-sm font-medium" style={{ color: '#B3B3B8' }}>Credits Remaining</span>
                    </div>
                    <div className="text-4xl font-bold mb-2" style={{ color: '#F5F5F7' }}>387</div>
                    <div className="text-sm mb-4" style={{ color: '#8A8A92' }}>out of 500 credits</div>
                    <div className="h-2.5 bg-white/5 rounded-full overflow-hidden">
                      <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full" style={{ width: "77%" }} />
                    </div>
                  </div>
                  <div className="rounded-xl p-6 border border-white/12" style={{ background: '#141414' }}>
                    <div className="text-sm mb-2 font-medium" style={{ color: '#B3B3B8' }}>Need more credits?</div>
                    <div className="text-2xl font-bold mb-5" style={{ color: '#F5F5F7' }}>$5 = 20 credits</div>
                    <Button className="w-full bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-3.5 premium-button font-semibold shadow-lg hover:shadow-purple-500/30 hover:scale-[1.02]">
                      <Plus className="w-5 h-5 mr-2" />
                      Buy Credits
                    </Button>
                  </div>
                </div>

                <div className="space-y-1">
                  <div className="flex items-center justify-between py-4 text-base border-b border-white/10">
                    <span style={{ color: '#B3B3B8' }}>Billing period</span>
                    <span style={{ color: '#F5F5F7' }} className="font-medium">Monthly</span>
                  </div>
                  <div className="flex items-center justify-between py-4 text-base border-b border-white/10">
                    <span style={{ color: '#B3B3B8' }}>Next billing date</span>
                    <span style={{ color: '#F5F5F7' }} className="font-medium">March 7, 2026</span>
                  </div>
                  <div className="flex items-center justify-between py-4 text-base">
                    <span style={{ color: '#B3B3B8' }}>Payment method</span>
                    <span style={{ color: '#F5F5F7' }} className="font-medium">•••• 4242</span>
                  </div>
                </div>

                <div className="flex flex-col sm:flex-row gap-4 pt-4">
                  <Button className="flex-1 bg-white/[0.03] hover:bg-white/[0.05] border border-white/12 rounded-xl py-4 text-base font-semibold hover:scale-[1.02] transition-all" style={{ color: '#F5F5F7' }}>
                    Change Plan
                  </Button>
                  <Button variant="ghost" className="flex-1 text-red-400/70 hover:text-red-400 hover:bg-red-500/5 rounded-xl py-4 text-base font-semibold">
                    Cancel Subscription
                  </Button>
                </div>
              </div>
            </TabsContent>
        </Tabs>
      </motion.div>
    </div>
  );
}