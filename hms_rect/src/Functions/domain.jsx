const baseUrl = (import.meta.env.VITE_API_BASE_URL || "http://localhost:8080").replace(/\/$/, "")

export const domain = `${baseUrl}/`