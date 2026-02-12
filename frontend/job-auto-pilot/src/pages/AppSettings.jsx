import React, { useEffect, useMemo, useState } from "react";
import { useNavigate } from "react-router-dom";
import AppNav from "@/components/app/AppNav";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  User,
  FileText,
  CreditCard,
  Mail,
  Link as LinkIcon,
  Phone,
  MapPin,
  LifeBuoy,
  ShieldCheck,
  ExternalLink,
  Save,
  ArrowRight,
} from "lucide-react";
import { toast } from "sonner";

const STORAGE_KEY = "jobautopilot_profile_v1";

function Field({ label, icon: Icon, children, hint }) {
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <label className="text-xs sm:text-sm text-white/60 font-medium">
          {label}
        </label>
        {hint ? <span className="text-xs text-white/30">{hint}</span> : null}
      </div>
      <div className="relative">
        {Icon ? (
          <div className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-white/30">
            <Icon className="w-4 h-4" />
          </div>
        ) : null}
        <div className={Icon ? "pl-9" : ""}>{children}</div>
      </div>
    </div>
  );
}

function Section({ title, subtitle, children, icon: Icon }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-5 sm:p-6">
      <div className="flex items-start gap-3 mb-5">
        {Icon ? (
          <div className="w-10 h-10 rounded-xl bg-purple-500/10 border border-purple-500/10 flex items-center justify-center">
            <Icon className="w-5 h-5 text-purple-300" />
          </div>
        ) : null}
        <div className="min-w-0">
          <h3 className="text-base sm:text-lg font-semibold text-white">
            {title}
          </h3>
          {subtitle ? (
            <p className="text-sm text-white/40 mt-1">{subtitle}</p>
          ) : null}
        </div>
      </div>
      {children}
    </div>
  );
}

export default function Settings() {
  const navigate = useNavigate();
  const [tab, setTab] = useState("profile");
  const [saving, setSaving] = useState(false);

  // Profile
  const [fullName, setFullName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [location, setLocation] = useState("");
  const [linkedin, setLinkedin] = useState("");
  const [portfolio, setPortfolio] = useState("");

  const initialLoaded = useMemo(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  }, []);

  useEffect(() => {
    if (!initialLoaded) return;
    setFullName(initialLoaded.fullName || "");
    setEmail(initialLoaded.email || "");
    setPhone(initialLoaded.phone || "");
    setLocation(initialLoaded.location || "");
    setLinkedin(initialLoaded.linkedin || "");
    setPortfolio(initialLoaded.portfolio || "");
  }, [initialLoaded]);

  const isDirty = useMemo(() => {
    const base = initialLoaded || {};
    return (
      (fullName || "") !== (base.fullName || "") ||
      (email || "") !== (base.email || "") ||
      (phone || "") !== (base.phone || "") ||
      (location || "") !== (base.location || "") ||
      (linkedin || "") !== (base.linkedin || "") ||
      (portfolio || "") !== (base.portfolio || "")
    );
  }, [initialLoaded, fullName, email, phone, location, linkedin, portfolio]);

  const saveProfile = async () => {
    if (saving) return;

    // light validation (UI-only)
    const e = (email || "").trim();
    if (e && !/^\S+@\S+\.\S+$/.test(e)) {
      toast.error("Please enter a valid email address.");
      return;
    }

    setSaving(true);
    try {
      // ✅ production-safe: local persistence (no backend assumptions)
      // If you already have an API route, you can replace this block without changing UI.
      const payload = {
        fullName: fullName.trim(),
        email: e,
        phone: phone.trim(),
        location: location.trim(),
        linkedin: linkedin.trim(),
        portfolio: portfolio.trim(),
        updatedAt: new Date().toISOString(),
      };
      localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
      toast.success("Settings saved.");
    } catch (err) {
      console.error(err);
      toast.error("Failed to save settings.");
    } finally {
      setSaving(false);
    }
  };

  const openSupport = () => {
    // Replace with your support flow (Intercom, Zendesk, etc.)
    window.location.href = "mailto:support@yourdomain.com?subject=Job%20Autopilot%20Support";
  };

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)] relative overflow-hidden">
      {/* subtle background accents */}
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-44 left-1/2 -translate-x-1/2 w-[900px] h-[420px] rounded-full bg-purple-600/10 blur-3xl" />
        <div className="absolute -bottom-72 left-1/3 w-[760px] h-[420px] rounded-full bg-fuchsia-500/5 blur-3xl" />
      </div>

      <AppNav currentPage="Settings" />

      <div className="relative max-w-6xl mx-auto px-4 sm:px-6 py-8">
        {/* Header */}
        <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl md:text-3xl font-bold text-white">
              Settings
            </h1>
            <p className="text-white/40 mt-1">
              Manage your profile, resume data, and billing
            </p>
          </div>

          <div className="flex items-center gap-2">
            {tab === "profile" && (
              <Button
                type="button"
                onClick={saveProfile}
                disabled={!isDirty || saving}
                className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-5 py-5 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
              >
                <Save className="w-4 h-4 mr-2" />
                {saving ? "Saving..." : "Save changes"}
              </Button>
            )}
          </div>
        </div>

        {/* Tabs */}
        <div className="rounded-2xl border border-white/10 bg-white/[0.02] backdrop-blur-xl">
          <Tabs value={tab} onValueChange={setTab}>
            <div className="px-4 sm:px-6 pt-4">
              <TabsList className="bg-transparent p-0 gap-1 sm:gap-2">
                <TabsTrigger
                  value="profile"
                  className="rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-white/[0.04] data-[state=active]:text-white data-[state=active]:shadow-none text-white/60 hover:text-white/80"
                >
                  <User className="w-4 h-4 mr-2" />
                  Profile
                </TabsTrigger>
                <TabsTrigger
                  value="resume"
                  className="rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-white/[0.04] data-[state=active]:text-white data-[state=active]:shadow-none text-white/60 hover:text-white/80"
                >
                  <FileText className="w-4 h-4 mr-2" />
                  Resume
                </TabsTrigger>
                <TabsTrigger
                  value="billing"
                  className="rounded-xl px-4 py-2.5 text-sm data-[state=active]:bg-white/[0.04] data-[state=active]:text-white data-[state=active]:shadow-none text-white/60 hover:text-white/80"
                >
                  <CreditCard className="w-4 h-4 mr-2" />
                  Billing
                </TabsTrigger>
              </TabsList>

              <div className="mt-4 h-px bg-white/10" />
            </div>

            {/* Profile */}
            <TabsContent value="profile" className="p-4 sm:p-6 space-y-6">
              <Section
                title="Personal Information"
                subtitle="Used to personalize documents and application materials."
                icon={ShieldCheck}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="Full Name" icon={User}>
                    <Input
                      value={fullName}
                      onChange={(e) => setFullName(e.target.value)}
                      placeholder="e.g., Alex Johnson"
                      className="bg-white/[0.03] border-white/10 text-white placeholder:text-white/25 rounded-xl py-5"
                    />
                  </Field>

                  <Field label="Email Address" icon={Mail}>
                    <Input
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="e.g., alex@example.com"
                      className="bg-white/[0.03] border-white/10 text-white placeholder:text-white/25 rounded-xl py-5"
                    />
                  </Field>

                  <Field label="Phone Number" icon={Phone} hint="Optional">
                    <Input
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="e.g., +1 (555) 123-4567"
                      className="bg-white/[0.03] border-white/10 text-white placeholder:text-white/25 rounded-xl py-5"
                    />
                  </Field>

                  <Field label="Location" icon={MapPin} hint="Optional">
                    <Input
                      value={location}
                      onChange={(e) => setLocation(e.target.value)}
                      placeholder="e.g., Dallas, TX"
                      className="bg-white/[0.03] border-white/10 text-white placeholder:text-white/25 rounded-xl py-5"
                    />
                  </Field>
                </div>
              </Section>

              <Section
                title="Links"
                subtitle="Optional links that can be referenced in cover letters."
                icon={LinkIcon}
              >
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                  <Field label="LinkedIn URL" icon={LinkIcon} hint="Optional">
                    <Input
                      value={linkedin}
                      onChange={(e) => setLinkedin(e.target.value)}
                      placeholder="linkedin.com/in/yourname"
                      className="bg-white/[0.03] border-white/10 text-white placeholder:text-white/25 rounded-xl py-5"
                    />
                  </Field>

                  <Field label="Portfolio URL" icon={LinkIcon} hint="Optional">
                    <Input
                      value={portfolio}
                      onChange={(e) => setPortfolio(e.target.value)}
                      placeholder="yourdomain.dev"
                      className="bg-white/[0.03] border-white/10 text-white placeholder:text-white/25 rounded-xl py-5"
                    />
                  </Field>
                </div>

                <div className="mt-4 flex flex-col sm:flex-row sm:items-center gap-3">
                  <Button
                    type="button"
                    variant="ghost"
                    onClick={() => {
                      const url = (linkedin || "").trim();
                      if (!url) return toast.error("Add a LinkedIn URL first.");
                      window.open(
                        url.startsWith("http") ? url : `https://${url}`,
                        "_blank",
                        "noopener,noreferrer"
                      );
                    }}
                    className="justify-center sm:justify-start border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5"
                  >
                    <ExternalLink className="w-4 h-4 mr-2" />
                    Open LinkedIn
                  </Button>

                  <div className="text-xs text-white/30">
                    Tip: You can leave these blank—nothing breaks.
                  </div>
                </div>
              </Section>

              <Section
                title="Support"
                subtitle="Having issues? Reach out and we’ll help."
                icon={LifeBuoy}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-sm text-white/50">
                    Contact support for account, resume upload, or billing help.
                  </div>
                  <Button
                    type="button"
                    onClick={openSupport}
                    className="bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl py-5 px-5"
                  >
                    <Mail className="w-4 h-4 mr-2" />
                    Contact Support
                  </Button>
                </div>
              </Section>

              {/* mobile save */}
              <div className="sm:hidden pt-2">
                <Button
                  type="button"
                  onClick={saveProfile}
                  disabled={!isDirty || saving}
                  className="w-full bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 font-semibold disabled:opacity-60 disabled:cursor-not-allowed"
                >
                  <Save className="w-4 h-4 mr-2" />
                  {saving ? "Saving..." : "Save changes"}
                </Button>
              </div>
            </TabsContent>

            {/* Resume */}
            <TabsContent value="resume" className="p-4 sm:p-6 space-y-6">
              <Section
                title="Resume Library"
                subtitle="Manage uploads, defaults, and previews."
                icon={FileText}
              >
                <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
                  <div className="text-sm text-white/50">
                    Upload and manage multiple resumes from the Resumes page.
                  </div>
                  <Button
                    type="button"
                    onClick={() => navigate(createPageUrl("Resumes"))}
                    className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 px-5 font-semibold"
                  >
                    <ArrowRight className="w-4 h-4 mr-2" />
                    Go to Resumes
                  </Button>
                </div>
              </Section>

              <Section
                title="Tip"
                subtitle="Best parsing results come from clean PDF/DOCX formatting."
                icon={ShieldCheck}
              >
                <ul className="text-sm text-white/50 space-y-2 list-disc pl-5">
                  <li>Use clear section headers (Experience, Education, Skills).</li>
                  <li>Avoid heavy graphics-only resumes (images of text).</li>
                  <li>Keep filenames simple (e.g., “Avo_Suvalian_Resume.pdf”).</li>
                </ul>
              </Section>
            </TabsContent>

            {/* Billing */}
            <TabsContent value="billing" className="p-4 sm:p-6 space-y-6">
              <Section
                title="Billing & Credits"
                subtitle="View credits and manage your plan."
                icon={CreditCard}
              >
                <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-4">
                  <div className="rounded-2xl border border-white/10 bg-black/20 p-5">
                    <div className="text-xs text-white/40">Current plan</div>
                    <div className="text-lg font-semibold text-white mt-1">
                      Credits-based
                    </div>
                    <div className="text-sm text-white/40 mt-2">
                      Credits are used when generating cover letters and bullet points.
                    </div>
                  </div>

                  <div className="flex flex-col sm:flex-row gap-3">
                    <Button
                      type="button"
                      variant="ghost"
                      className="border border-white/10 text-white/70 hover:text-white hover:bg-white/5 rounded-xl py-5 px-5"
                      onClick={() => toast.message("Billing UI placeholder (wire to Stripe).")}
                    >
                      <CreditCard className="w-4 h-4 mr-2" />
                      Manage billing
                    </Button>

                    <Button
                      type="button"
                      className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl py-5 px-5 font-semibold"
                      onClick={() => toast.message("Upgrade UI placeholder.")}
                    >
                      Upgrade
                      <ArrowRight className="w-4 h-4 ml-2" />
                    </Button>
                  </div>
                </div>
              </Section>

              <Section
                title="Support"
                subtitle="Questions about billing or credits?"
                icon={LifeBuoy}
              >
                <Button
                  type="button"
                  onClick={openSupport}
                  className="bg-white/5 hover:bg-white/10 text-white border border-white/10 rounded-xl py-5 px-5"
                >
                  <Mail className="w-4 h-4 mr-2" />
                  Contact billing support
                </Button>
              </Section>
            </TabsContent>
          </Tabs>
        </div>
      </div>
    </div>
  );
}
