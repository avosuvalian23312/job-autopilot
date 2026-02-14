import { useEffect } from "react";
import { useLocation } from "react-router-dom";
import { useAuth } from "./AuthContext";
import { base44 } from "@/api/base44Client";
import { pagesConfig } from "@/pages.config";

export default function NavigationTracker() {
  const location = useLocation();
  const { isAuthenticated } = useAuth();
  const { Pages, mainPage } = pagesConfig;
  const mainPageKey = mainPage ?? Object.keys(Pages)[0];

  useEffect(() => {
    const pathname = location.pathname || "";
    let pageName;

    if (pathname === "/" || pathname === "") {
      pageName = mainPageKey;
    } else {
      const pathSegment = pathname.replace(/^\//, "").split("/")[0];
      const pageKeys = Object.keys(Pages || {});
      const matchedKey = pageKeys.find(
        (key) => key.toLowerCase() === String(pathSegment).toLowerCase()
      );
      pageName = matchedKey || null;
    }

    if (!isAuthenticated || !pageName) return;

    // ✅ HARD GUARD: base44 may be null during init/misconfig
    const logFn = base44?.appLogs?.logUserInApp;
    if (typeof logFn !== "function") return;

    const p = logFn(pageName);
    if (p && typeof p.catch === "function") {
      p.catch(() => {});
    }
  }, [location.pathname, isAuthenticated, Pages, mainPageKey]);

  return null;
}
