// if user is connected it redirects HIM to his own profile
"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { useAccount } from "wagmi";
import LoadingOverlay from "@/components/LoadingOverlay";

export default function MyProfileRedirect() {
  const [mounted, setMounted] = useState(false);
  const router = useRouter();
  const { address, status } = useAccount();
  const rehydrating = status === "connecting" || status === "reconnecting";

useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (address) router.replace(`/profile/${address}`);
  }, [address, router]);

  if (!mounted || rehydrating || address) return <LoadingOverlay />; 

  return (
    <p className="p-8 text-center text-zinc-300">
      Connect your wallet to see your profile.
    </p>
  );
}