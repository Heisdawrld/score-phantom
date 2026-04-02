// Signup now handled via Google — redirect to login
import { useEffect } from "react";
import { useLocation } from "wouter";

export default function Signup() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation("/login"); }, []);
  return null;
}
