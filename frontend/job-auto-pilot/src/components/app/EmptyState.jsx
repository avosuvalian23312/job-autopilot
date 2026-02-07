import React from "react";
import { Button } from "@/components/ui/button";

export default function EmptyState({ icon: Icon, title, description, action, onAction }) {
  return (
    <div className="glass-card rounded-2xl p-12 text-center">
      <div className="w-16 h-16 rounded-2xl bg-white/5 flex items-center justify-center mx-auto mb-4">
        <Icon className="w-8 h-8 text-white/20" />
      </div>
      <h3 className="text-lg font-semibold text-white mb-2">{title}</h3>
      <p className="text-sm text-white/40 mb-6 max-w-sm mx-auto">{description}</p>
      {action && onAction && (
        <Button onClick={onAction} className="bg-purple-600 hover:bg-purple-500 text-white rounded-xl px-6">
          {action}
        </Button>
      )}
    </div>
  );
}