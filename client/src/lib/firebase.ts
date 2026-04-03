import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signInWithPopup,
  createUserWithEmailAndPassword,
  signInWithEmailAndPassword,
  setPersistence,
  browserLocalPersistence,
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

const appleProvider = new OAuthProvider("apple.com");
// Sign in with Apple specific customizations
appleProvider.addScope("email");
appleProvider.addScope("name");
appleProvider.setCustomParameters({
  locale: "en",
});

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const idToken = await result.user.getIdToken();
  return { idToken, firebaseUser: result.user };
}

export async function signInWithApple() {
  const result = await signInWithPopup(auth, appleProvider);
  const idToken = await result.user.getIdToken();
  return { idToken, firebaseUser: result.user };
}

export async function signUpWithEmail(email: string, password: string) {
  const result = await createUserWithEmailAndPassword(auth, email, password);
  const idToken = await result.user.getIdToken();
  return { idToken, firebaseUser: result.user };
}

export async function signInWithEmail(email: string, password: string) {
  const result = await signInWithEmailAndPassword(auth, email, password);
  const idToken = await result.user.getIdToken();
  return { idToken, firebaseUser: result.user };
}
