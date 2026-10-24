"use client";
import { UserButton, useUser } from "@clerk/react";
import { clerkKey } from "./providers";
function ClerkAccount() {
  const { isLoaded, isSignedIn } = useUser();
  if (!isLoaded) return null;
  return isSignedIn ? <UserButton /> : <a href="/sign-in">Sign in</a>;
}
export default function Account() {
  return clerkKey ? <ClerkAccount /> : null;
}
