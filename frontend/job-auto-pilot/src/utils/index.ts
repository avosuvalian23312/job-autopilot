import { pagesConfig } from "@/pages.config";

export function createPageUrl(pageName) {
  const { Pages, mainPage } = pagesConfig || {};
  const keys = Object.keys(Pages || {});
  const mainKey = mainPage ?? keys[0];

  if (!pageName) return "/";

  // Case-insensitive match to an ACTUAL key in Pages
  const wanted = String(pageName);
  const matched = keys.find((k) => k.toLowerCase() === wanted.toLowerCase());
  const key = matched || wanted;

  // Make main page resolve to "/"
  if (key === mainKey || key.toLowerCase() === "landing") return "/";

  return `/${key}`;
}
