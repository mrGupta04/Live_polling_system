function trimTrailingSlash(value: string): string {
	return value.replace(/\/+$/, "");
}

const defaultApiBase = "http://localhost:4000/api";
const configuredApiBase = import.meta.env.VITE_API_BASE || defaultApiBase;

export const API_BASE = trimTrailingSlash(configuredApiBase);

const configuredSocketUrl = import.meta.env.VITE_SOCKET_URL;
export const SOCKET_URL = configuredSocketUrl
	? trimTrailingSlash(configuredSocketUrl)
	: API_BASE.replace(/\/api$/, "");
