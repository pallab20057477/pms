const resolveDefaultBaseUrl = () => {
	if (typeof window !== "undefined") {
		const { hostname, origin } = window.location
		if (hostname === "localhost" || hostname === "127.0.0.1" || hostname === "0.0.0.0") {
			return "http://localhost:8080"
		}
		return origin
	}

	return "http://localhost:8080"
}

const baseUrl = (import.meta.env.VITE_API_BASE_URL || resolveDefaultBaseUrl()).replace(/\/$/, "")

export const domain = `${baseUrl}/`