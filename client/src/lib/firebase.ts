import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  sendEmailVerification,
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
    url: `${window.location.origin}/login?verified=success`,
    handleCodeInApp: false,
  });

  // Sign out immediately — user must verify email before accessing the app
  await signOut(auth);

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

  // Reload to get the latest emailVerified status from Firebase
  await reload(result.user);

  if (!result.user.emailVerified) {
    await signOut(auth);
    throw new Error("email_not_verified");
  }

  const idToken = await result.user.getIdToken(true);
  return { idToken, firebaseUser: result.user };
}
