// components/AuthProvider.tsx
"use client";

import {createContext, useContext, useEffect, useMemo, useRef, useState  } from "react";
import { useAccount } from "wagmi";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { UsernameModal } from "@/app/profile/username";
import { useSession } from "./useSession";
import {
  createAuthenticationAdapter,
  RainbowKitAuthenticationProvider,
  type AuthenticationStatus,
} from "@rainbow-me/rainbowkit";
import { SiweMessage } from "siwe";
import { api, ApiError } from "@/lib/api";

//export username Modal
const UsernameModalContext = createContext({ open: () => {}, version: 0 });
export const useUsernameModal = () => useContext(UsernameModalContext);

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const { address, isConnecting, isReconnecting } = useAccount();
  const queryClient = useQueryClient();

  // Who does the server think I am? (401 means nobody)
  const session = useSession()

  const adapter = useMemo(
  () =>
    createAuthenticationAdapter({
      getNonce: async () => {
        if (!address) throw new Error("Wallet not connected");
        const { nonce } = await api<{ nonce: string }>(`/api/auth/nonce?address=${address}`);
        return nonce;
      },
      createMessage: ({ nonce, address, chainId }) =>{
        try{
          return new SiweMessage({
          domain: window.location.host,
          address,
          statement: "Sign in to NFT Marketplace",
          uri: window.location.origin,
          version: "1",
          chainId,
          nonce,
        }).prepareMessage() 
        } catch(e){
              console.error("createMessage failed:", e);
            throw e;
        }
      },
      // returns a string now
      verify: async ({ message, signature }) => {
        try {
          await api("/api/auth/verify", {
            method: "POST",
            body: JSON.stringify({ message, signature }), // message is already a string
          });
          await queryClient.invalidateQueries({ queryKey: ["session"] });
          return true;
        } catch (err) {
          console.error("SIWE verify failed:", err);
          return false;
        }
      },
      signOut: async () => {
        await api("/api/auth/logout", { method: "POST" }).catch(() => {});
        queryClient.setQueryData(["session"], null);
      },
    }),
  [address, queryClient]
);

  // Signed in = the server session belongs to the wallet connected right now
  const status: AuthenticationStatus = session.isLoading
    ? "loading"
    : session.data && address && session.data.address === address.toLowerCase()
      ? "authenticated"
      : "unauthenticated";

  // Safety net: a session cookie with no matching wallet (wallet gone, or switched
  // to another account) gets cleared, so "wallet disconnected" always means "signed out"
  const [usernameOpen, setUsernameOpen] = useState(false);
const [version, setVersion] = useState(0);
const askedRef = useRef(false);

// Ask once right after sign-in if there is no username yet
useEffect(() => {
  if (status === "unauthenticated") askedRef.current = false;
  if (status === "authenticated" && session.data?.username === null && !askedRef.current) {
    askedRef.current = true;
    setUsernameOpen(true);
  }
}, [status, session.data]);

  useEffect(() => {
    if (isConnecting || isReconnecting) return; // wait for wagmi to finish reconnecting
    if (session.data && session.data.address !== address?.toLowerCase()) {
      api("/api/auth/logout", { method: "POST" })
        .catch(() => {})
        .finally(() => queryClient.setQueryData(["session"], null));
    }
  }, [address, isConnecting, isReconnecting, session.data, queryClient]);

  return (
  <UsernameModalContext.Provider
    value={{
      version,
      open: () => {
        if (status === "authenticated") setUsernameOpen(true);
      },
    }}
  >
    <RainbowKitAuthenticationProvider adapter={adapter} status={status}>
      {children}
      <UsernameModal
        open={usernameOpen}
        onOpenChange={setUsernameOpen}
        onSaved={() => {
          queryClient.invalidateQueries({ queryKey: ["session"] });
          setVersion((v) => v + 1);
        }}
      />
    </RainbowKitAuthenticationProvider>
  </UsernameModalContext.Provider>
);
}