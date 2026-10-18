// lib/useSession.ts
import { useQuery } from "@tanstack/react-query";
import { api, ApiError } from "@/lib/api";

export function useSession() {
  return useQuery({
    queryKey: ["session"],
    queryFn: async () => {
      try {
        return await api<{ address: string; username: string | null }>("/api/users/me");
      } catch (err) {
        if (err instanceof ApiError && err.status === 401) return null;
        throw err;
      }
    },
    retry: false,
  });
}