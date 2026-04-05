import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
  sendPasswordResetEmail,
  setPersistence,
  browserLocalPersistence,
  reload,
  signOut,
} from "firebase/auth";

const firebaseConfig = {
  apiKey: "AIzaSyAHXHS9kwi_4HoCDyf0yi_UzLWzDRUU9Q0",
  authDomain: "scorephantom-app.firebaseapp.com",
  projectId: "scorephantom-app",
  storageBucket: "scorephantom-app.firebasestorage.app",
  messagingSenderId: "776631141819",
  appId: "1:776631141819:web:f3e3ffca1c68d76d8f309e",
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);

// Enable persistence across browser sessions
setPersistence(auth, browserLocalPersistence).catch(console.error);

const googleProvider = new GoogleAuthProvider();
// Always prompt account picker so switching accounts is easy
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const idToken = await result.user.getIdToken();
  return { idToken, firebaseUser: result.user };
}

/**
 * Sign up with email + password via Firebase.
 * Creates the Firebase account, sends a verification email, then signs out.
 * The user must verify their email before they can log in.
 * No backend call is made here — backend account is created on first login.
 */
export async function signUpWithEmail(email: string, password: string) {
  const result = await createUserWithEmailAndPassword(auth, email, password);

  await sendEmailVerification(result.user, {
    url: window.location.origin + "/verify-email",
    handleCodeInApp: false,
  });

  // Keep Firebase session alive so verify page can check emailVerified
  // Do NOT sign out — VerifyEmail page needs auth.currentUser to check status
  return {
    email: result.user.email,
    verificationSent: true,
  };
}

/**
 * Sign in with email + password via Firebase.
 * Reloads the user to get fresh emailVerified status.
 * Throws "email_not_verified" if email is not yet verified.
 * Returns idToken for backend authentication.
 */
export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);

  // Reload to get the latest emailVerified status from Firebase.
  // IMPORTANT: reload() mutates auth.currentUser in-place — the original
  // result.user reference does NOT update. Always read from auth.currentUser after.
  await reload(result.user);
  const freshUser = auth.currentUser;

  if (!freshUser || !freshUser.emailVerified) {
    // Keep user signed in so we can resend verification from the Login page.
    // We throw the error but do NOT sign out — the Login component will use
    // auth.currentUser to call resendVerificationForCurrentUser() if needed.
    throw new Error("email_not_verified");
  }

  const idToken = await freshUser.getIdToken(true);
  return { idToken, firebaseUser: freshUser };
}

/**
 * Send a password reset email via Firebase.
 * Works for any Firebase account (Google or email signup).
 * Does not require the user to be signed in.
 */
export async function resetPassword(email: string) {
  await sendPasswordResetEmail(auth, email, {
    url: `${window.location.origin}/login`,
    handleCodeInApp: false,
  });
}

/**
 * Resend the verification email for the currently signed-in Firebase user.
 * Called when sign-in fails with "email_not_verified" — the user is still
 * signed into Firebase at that point (we don't sign them out on that error).
 */
export async function resendVerificationForCurrentUser() {
  const user = auth.currentUser;
  if (!user) throw new Error("Not signed in to Firebase. Please enter your password and try again.");
  await sendEmailVerification(user, {
    url: window.location.origin + "/verify-email",
    handleCodeInApp: false,
  });
  // Sign out after sending so they must verify before next sign-in
  // Do NOT sign out — keep session alive so verify-email page works
}
