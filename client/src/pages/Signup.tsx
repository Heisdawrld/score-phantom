// Signup is handled inside the Login page (email-signup mode)
import { useEffect } from 'react';
import { useLocation } from 'wouter';

export default function Signup() {
  const [, setLocation] = useLocation();
  useEffect(() => { setLocation('/login?mode=signup'); }, []);
  return null;
}
