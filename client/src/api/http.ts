import axios from "axios";

const baseURL =
  (import.meta as any).env?.VITE_API_BASE_URL?.toString() || "http://localhost:8000";

export const http = axios.create({
  baseURL,
  withCredentials: true,
  timeout: 15000,
});
