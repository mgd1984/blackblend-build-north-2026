"use client";
import { ClerkProvider } from "@clerk/react";
export const clerkKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string | undefined;
export default function Providers({ children }: { children: React.ReactNode }) {
  if (!clerkKey) return <>{children}</>;
  return (
    <ClerkProvider
      publishableKey={clerkKey}
      telemetry={false}
      signInUrl="/sign-in"
      signUpUrl="/sign-in"
      appearance={{
        variables: {
          colorPrimary: "#d6edaa",
          colorBackground: "#141718",
          colorForeground: "#edece6",
          colorInput: "#0a0b0c",
          colorInputForeground: "#edece6",
          borderRadius: "0.5rem",
        },
      }}
    >
      {children}
    </ClerkProvider>
  );
}
