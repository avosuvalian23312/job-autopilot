import React, { useState } from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Rocket, Coins, TrendingUp, Calendar, Download, Plus, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { motion } from "framer-motion";

const packages = [
  { credits: 50, price: 9, popular: false },
  { credits: 150, price: 24, popular: true, save: "20%" },
  { credits: 300, price: 45, popular: false, save: "25%" },
  { credits: 500, price: 69, popular: false, save: "30%" },
];

const usageHistory = [
  { date: "Feb 7, 2026", type: "Resume Generation", credits: -2, balance: 87 },
  { date: "Feb 6, 2026", type: "Cover Letter", credits: -2, balance: 89 },
  { date: "Feb 5, 2026", type: "Resume Generation", credits: -2, balance: 91 },
  { date: "Feb 5, 2026", type: "Analytics Access", credits: -1, balance: 93 },
  { date: "Feb 4, 2026", type: "Credit Purchase", credits: +100, balance: 94 },
];

const billingHistory = [
  { date: "Feb 4, 2026", description: "150 Credits Package", amount: "$24.00", status: "Paid" },
  { date: "Jan 15, 2026", description: "Pro Plan Subscription", amount: "$19.00", status: "Paid" },
  { date: "Dec 15, 2025", description: "Pro Plan Subscription", amount: "$19.00", status: "Paid" },
];

export default function Credits() {
  const [selectedPackage, setSelectedPackage] = useState(1);

  return (
    <div className="min-h-screen bg-[hsl(240,10%,4%)]">
      <header className="border-b border-white/5 bg-[hsl(240,10%,4%)]/80 backdrop-blur-xl sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 h-16 flex items-center justify-between">
          <Link to={createPageUrl("AppHome")} className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-lg bg-purple-600 flex items-center justify-center">
              <Rocket className="w-4 h-4 text-white" />
            </div>
            <span className="font-bold text-white text-lg">Job Autopilot</span>
          </Link>
          <Link to={createPageUrl("AppHome")}>
            <Button className="bg-white/5 hover:bg-white/10 text-white border border-white/10 text-sm font-medium px-5 py-2 rounded-lg">
              Back to Dashboard
            </Button>
          </Link>
        </div>
      </header>

      <div className="max-w-6xl mx-auto px-4 py-12">
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="mb-12"
        >
          <h1 className="text-3xl md:text-4xl font-bold text-white mb-2">Credits & Billing</h1>
          <p className="text-white/40">Manage your credits, purchase more, and view usage history</p>
        </motion.div>

        <div className="grid lg:grid-cols-3 gap-6 mb-12">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.1 }}
            className="glass-card rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center">
                <Coins className="w-6 h-6 text-purple-400" />
              </div>
              <div>
                <div className="text-sm text-white/40">Current Balance</div>
                <div className="text-3xl font-bold text-white">87</div>
              </div>
            </div>
            <div className="text-xs text-white/30 mb-3">Credits</div>
            <div className="h-2 bg-white/5 rounded-full overflow-hidden mb-4">
              <div className="h-full bg-gradient-to-r from-purple-500 to-cyan-500 rounded-full" style={{ width: "87%" }} />
            </div>
            <p className="text-sm text-white/40">From your Pro plan (100 credits/month)</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.2 }}
            className="glass-card rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-cyan-500/20 flex items-center justify-center">
                <TrendingUp className="w-6 h-6 text-cyan-400" />
              </div>
              <div>
                <div className="text-sm text-white/40">This Month</div>
                <div className="text-3xl font-bold text-white">13</div>
              </div>
            </div>
            <div className="text-xs text-white/30 mb-3">Credits Used</div>
            <p className="text-sm text-white/40">7 resume generations • 6 cover letters</p>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card rounded-2xl p-8"
          >
            <div className="flex items-center gap-3 mb-4">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center">
                <Calendar className="w-6 h-6 text-emerald-400" />
              </div>
              <div>
                <div className="text-sm text-white/40">Renews On</div>
                <div className="text-xl font-bold text-white">Mar 7</div>
              </div>
            </div>
            <div className="text-xs text-white/30 mb-3">Next Billing Date</div>
            <p className="text-sm text-white/40">+100 credits on renewal</p>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.4 }}
          className="mb-12"
        >
          <h2 className="text-2xl font-bold text-white mb-6">Buy More Credits</h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-4">
            {packages.map((pkg, i) => (
              <div
                key={i}
                onClick={() => setSelectedPackage(i)}
                className={`glass-card rounded-2xl p-6 cursor-pointer transition-all ${
                  selectedPackage === i
                    ? "border-2 border-purple-500/50 bg-purple-500/10"
                    : "border border-white/5 hover:bg-white/[0.04]"
                } ${pkg.popular ? "relative" : ""}`}
              >
                {pkg.popular && (
                  <div className="absolute -top-3 left-1/2 -translate-x-1/2 px-3 py-1 rounded-full bg-purple-600 text-white text-xs font-medium">
                    Best Value
                  </div>
                )}
                <div className="text-4xl font-bold text-white mb-2">{pkg.credits}</div>
                <div className="text-sm text-white/40 mb-4">Credits</div>
                <div className="flex items-baseline gap-1 mb-2">
                  <span className="text-2xl font-bold text-white">${pkg.price}</span>
                  <span className="text-white/40 text-sm">one-time</span>
                </div>
                {pkg.save && (
                  <div className="text-xs text-emerald-400 font-medium">Save {pkg.save}</div>
                )}
              </div>
            ))}
          </div>
          <Button className="w-full mt-6 py-6 bg-purple-600 hover:bg-purple-500 text-white rounded-xl text-base font-semibold premium-button">
            <Plus className="w-5 h-5 mr-2" />
            Purchase {packages[selectedPackage].credits} Credits for ${packages[selectedPackage].price}
          </Button>
          <p className="text-xs text-white/20 text-center mt-3">Credits never expire • Secure payment via Stripe</p>
        </motion.div>

        <div className="grid lg:grid-cols-2 gap-6">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.5 }}
            className="glass-card rounded-2xl p-6"
          >
            <h3 className="text-lg font-bold text-white mb-6">Credit Usage History</h3>
            <div className="space-y-3">
              {usageHistory.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                  <div>
                    <div className="text-sm text-white/70">{item.type}</div>
                    <div className="text-xs text-white/30">{item.date}</div>
                  </div>
                  <div className="text-right">
                    <div className={`text-sm font-semibold ${item.credits > 0 ? "text-emerald-400" : "text-white/60"}`}>
                      {item.credits > 0 ? "+" : ""}{item.credits}
                    </div>
                    <div className="text-xs text-white/30">Balance: {item.balance}</div>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>

          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.6 }}
            className="glass-card rounded-2xl p-6"
          >
            <h3 className="text-lg font-bold text-white mb-6">Billing History</h3>
            <div className="space-y-3">
              {billingHistory.map((item, i) => (
                <div key={i} className="flex items-center justify-between py-3 border-b border-white/5 last:border-0">
                  <div className="flex-1">
                    <div className="text-sm text-white/70">{item.description}</div>
                    <div className="text-xs text-white/30">{item.date}</div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className="text-sm font-semibold text-white">{item.amount}</span>
                    <span className="text-xs px-2 py-1 rounded-full bg-emerald-500/10 text-emerald-400">{item.status}</span>
                    <button className="text-xs text-purple-400 hover:text-purple-300">
                      <Download className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </motion.div>
        </div>

        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: 0.7 }}
          className="glass-card rounded-2xl p-6 mt-6"
        >
          <div className="flex items-start gap-4">
            <div className="w-12 h-12 rounded-xl bg-purple-500/20 flex items-center justify-center shrink-0">
              <Sparkles className="w-6 h-6 text-purple-400" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-white mb-2">How Credits Work</h3>
              <ul className="space-y-2 text-sm text-white/50">
                <li>• Resume Generation: <span className="text-white/70 font-medium">2 credits</span></li>
                <li>• Cover Letter Generation: <span className="text-white/70 font-medium">2 credits</span></li>
                <li>• Analytics Dashboard Access: <span className="text-white/70 font-medium">1 credit/day</span></li>
                <li>• Credits never expire and roll over monthly</li>
                <li>• Pro plan includes 100 credits/month + unlimited tracking</li>
              </ul>
            </div>
          </div>
        </motion.div>
      </div>
    </div>
  );
}