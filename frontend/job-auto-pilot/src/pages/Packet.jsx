import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Button } from "@/components/ui/button";
import { Rocket, Download, CheckCircle2, ArrowLeft, FileText, Sparkles, Zap } from "lucide-react";
import { toast } from "sonner";

export default function Packet() {
  const navigate = useNavigate();
  const [packetData, setPacketData] = useState(null);

  useEffect(() => {
    const data = JSON.parse(localStorage.getItem("latestPacket") || "null");
    if (data) {
      setPacketData(data);
    } else {
      // No packet data, redirect to home
      navigate(createPageUrl("AppHome"));
    }
  }, [navigate]);

  const handleDownloadCoverLetter = () => {
    // Simulate download
    toast.success("Cover letter downloaded");
    // In production, trigger actual file download
  };

  const handleDownloadResume = () => {
    // Simulate download
    toast.success("Resume downloaded");
    // In production, trigger actual file download
  };

  const handleDownloadBoth = () => {
    // Simulate download
    toast.success("Both documents downloaded");
    // In production, trigger actual file download for both
  };

  const handleReturnHome = () => {
    navigate(createPageUrl("AppHome"));
  };

  if (!packetData) {
    return null;
  }

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
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-16 flex flex-col justify-center min-h-[calc(100vh-4rem)]">
        {/* Success State */}
        <div className="text-center mb-12">
          <div className="w-24 h-24 rounded-full bg-green-500/10 flex items-center justify-center mx-auto mb-8">
            <CheckCircle2 className="w-12 h-12 text-green-400" />
          </div>
          <h1 className="text-5xl font-bold text-white mb-4">Your packet is ready</h1>
          <p className="text-xl text-white/40">Download your tailored documents below</p>
        </div>

        {/* Download Buttons */}
        <div className="space-y-5">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
            <Button
              onClick={handleDownloadResume}
              className="w-full py-8 bg-purple-600 hover:bg-purple-500 text-white text-xl font-bold rounded-2xl shadow-xl shadow-purple-600/20 hover:shadow-2xl hover:shadow-purple-600/30 transition-all hover:scale-[1.02]"
            >
              <FileText className="w-6 h-6 mr-3" />
              Download Resume
            </Button>

            <Button
              onClick={handleDownloadCoverLetter}
              className="w-full py-8 bg-purple-600 hover:bg-purple-500 text-white text-xl font-bold rounded-2xl shadow-xl shadow-purple-600/20 hover:shadow-2xl hover:shadow-purple-600/30 transition-all hover:scale-[1.02]"
            >
              <Download className="w-6 h-6 mr-3" />
              Download Cover Letter
            </Button>
          </div>

          <Button
            onClick={handleDownloadBoth}
            className="w-full py-8 bg-white/10 hover:bg-white/15 text-white text-xl font-bold rounded-2xl border-2 border-white/20 hover:border-white/30 transition-all hover:scale-[1.02]"
          >
            <Download className="w-6 h-6 mr-3" />
            Download Both
          </Button>

          <div className="pt-6">
            <Button
              onClick={handleReturnHome}
              className="w-full py-8 bg-white/5 hover:bg-white/10 text-white text-xl font-bold rounded-2xl transition-all hover:scale-[1.02]"
            >
              <ArrowLeft className="w-5 h-5 mr-3" />
              Return to Home
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}