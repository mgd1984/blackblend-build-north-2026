"use client";
import { SignIn } from "@clerk/react";
import { clerkKey } from "../providers";
export default function Page() {
  return (
    <main className="wrap studio-main">
      <a className="wordmark" href="/studio">
        blackblend.
      </a>
      <div style={{ display: "grid", placeItems: "center", padding: "60px 0" }}>
        {clerkKey ? (
          <SignIn
            routing="hash"
            fallbackRedirectUrl="/studio"
            signUpFallbackRedirectUrl="/studio"
          />
        ) : (
          <p>
            Configure the Clerk publishable key to enable sign-in on this deployment.{" "}
            <a href="/studio">Open studio ↗</a>
          </p>
        )}
      </div>
    </main>
  );
}
