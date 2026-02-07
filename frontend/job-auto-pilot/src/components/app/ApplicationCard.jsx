import React from "react";
import { Link } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { Building2, Calendar, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { format } from "date-fns";

const statusColors = {
  generated: "bg-purple-600/20 text-purple-300 border-purple-500/40",
  applied: "bg-blue-600/20 text-blue-300 border-blue-500/40",
  interview: "bg-yellow-600/20 text-yellow-300 border-yellow-500/40",
  offer: "bg-green-600/20 text-green-300 border-green-500/40",
  rejected: "bg-red-600/20 text-red-300 border-red-500/40",
};

export default function ApplicationCard({ application, onStatusChange }) {
  return (
    <div
      className="relative border-b border-white/[0.08] py-4 px-2 cursor-pointer transition-all duration-200 hover:bg-white/[0.06] hover:scale-[1.02] hover:z-10 hover:shadow-xl hover:shadow-purple-500/10 group"
    >
      <div className="flex items-center justify-between gap-6">
        <div className="min-w-0 flex-1">
          <h3 className="text-lg font-bold text-white mb-1">{application.job_title}</h3>
          <div className="flex items-center gap-4 text-white/50">
            <div className="flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs">{application.company}</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Calendar className="w-3.5 h-3.5 shrink-0" />
              <span className="text-xs">
                {application.created_date ? format(new Date(application.created_date), "MMM d, yyyy") : "N/A"}
              </span>
            </div>
          </div>
        </div>

        <div className="shrink-0">
          <Select
            value={application.status}
            onValueChange={(value) => {
              onStatusChange(application.id, value);
            }}
          >
            <SelectTrigger
              className={`h-9 text-xs font-semibold border-2 rounded-lg px-3 w-auto gap-2 transition-all duration-200 group-hover:border-opacity-100 group-hover:shadow-md ${statusColors[application.status]}`}
              onClick={(e) => e.stopPropagation()}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="generated">Generated</SelectItem>
              <SelectItem value="applied">Applied</SelectItem>
              <SelectItem value="interview">Interview</SelectItem>
              <SelectItem value="offer">Offer</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </div>
    </div>
  );
}