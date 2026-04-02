import { initializeApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, signInWithPopup } from "firebase/auth";

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

const googleProvider = new GoogleAuthProvider();
// Always prompt account picker so switching accounts is easy
googleProvider.setCustomParameters({ prompt: "select_account" });

export async function signInWithGoogle() {
  const result = await signInWithPopup(auth, googleProvider);
  const idToken = await result.user.getIdToken();
  return { idToken, firebaseUser: result.user };
}
