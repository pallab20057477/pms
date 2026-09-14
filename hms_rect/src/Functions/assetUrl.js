import { domain } from "./domain";

const apiRoot = (import.meta.env.VITE_API_BASE_URL_API || import.meta.env.VITE_API_BASE_URL || domain)
  .replace(/\/api\/?$/, "")
  .replace(/\/$/, "");

const localHosts = new Set(["localhost", "127.0.0.1", "0.0.0.0"]);

export function resolveAssetUrl(raw, subdir = "") {
  if (!raw) return "";

  let path = String(raw).trim();

  if (/^https?:\/\//i.test(path)) {
    try {
      const parsed = new URL(path);
      if (parsed.pathname.startsWith("/uploads/")) {
        return apiRoot + parsed.pathname;
      }
      if (!localHosts.has(parsed.hostname)) {
        return path;
      }
      path = parsed.pathname;
    } catch (_) {
      return path;
    }
  }

  if (path.startsWith("./")) {
    path = path.slice(1);
  }

  path = path.replace(/^\/+/, "");

  if (path.startsWith("uploads/")) {
    return `${apiRoot}/${path}`;
  }

  if (subdir && path.startsWith(`${subdir}/`)) {
    return `${apiRoot}/uploads/${path}`;
  }

  if (subdir && !path.includes("/")) {
    return `${apiRoot}/uploads/${subdir}/${path}`;
  }

  return `${apiRoot}/${path}`;
}
