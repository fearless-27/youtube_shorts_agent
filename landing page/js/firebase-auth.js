// Firebase Authentication Client for NEMO Studio / Landing Page
// Modular Firebase v10 CDN imports
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import {
  getAuth,
  signInWithPopup,
  GoogleAuthProvider,
  GithubAuthProvider,
  OAuthProvider,
  signInWithEmailAndPassword,
  createUserWithEmailAndPassword,
  updateProfile,
  onAuthStateChanged,
  signOut
} from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";


// ========================================================================
// 1. FIREBASE CONFIGURATION (Connected to nemo-8f9d8)
// ========================================================================
export const firebaseConfig = {
  apiKey: "AIzaSyAN0SV0nwk2Pk3v2FspSRvQC9nGMUj2sKY",
  authDomain: "nemo-8f9d8.firebaseapp.com",
  projectId: "nemo-8f9d8",
  storageBucket: "nemo-8f9d8.firebasestorage.app",
  messagingSenderId: "143739531473",
  appId: "1:143739531473:web:db6128c26d0ab7c0c5d5f0",
  measurementId: "G-9D2RCZ4R71"
};

export const isFirebaseConfigured = () => {
  return Boolean(firebaseConfig.apiKey && !firebaseConfig.apiKey.startsWith("YOUR_"));
};

let app = null;
let auth = null;
let googleProvider = null;
let githubProvider = null;
let appleProvider = null;

if (isFirebaseConfigured()) {
  try {
    app = initializeApp(firebaseConfig);
    auth = getAuth(app);
    googleProvider = new GoogleAuthProvider();
    googleProvider.addScope("profile");
    googleProvider.addScope("email");

    githubProvider = new GithubAuthProvider();
    githubProvider.addScope("read:user");
    githubProvider.addScope("user:email");

    appleProvider = new OAuthProvider("apple.com");
    appleProvider.addScope("email");
    appleProvider.addScope("name");
  } catch (err) {
    console.error("Failed to initialize Firebase:", err);
  }
}

// Sync user state to localStorage for instant client-side retrieval across pages
function cacheUser(user) {
  if (user) {
    const isAdmin = (user.email && user.email.toLowerCase() === "gobi56529@gmail.com");
    const userData = {
      uid: user.uid,
      email: user.email,
      displayName: user.displayName || user.email?.split("@")[0] || "User",
      photoURL: user.photoURL || null,
      provider: user.providerData?.[0]?.providerId || "password",
      role: isAdmin ? "admin" : "normal"
    };
    localStorage.setItem("nemo_user", JSON.stringify(userData));
    return userData;
  } else {
    localStorage.removeItem("nemo_user");
    return null;
  }
}

// Get cached user synchronously
export function getCachedUser() {
  try {
    const data = localStorage.getItem("nemo_user");
    return data ? JSON.parse(data) : null;
  } catch (e) {
    return null;
  }
}

// Sign in with Google Popup
export async function signInWithGoogle() {
  if (!isFirebaseConfigured()) {
    throw new Error("CONFIG_NEEDED");
  }
  try {
    const result = await signInWithPopup(auth, googleProvider);
    const user = result.user;
    cacheUser(user);
    return user;
  } catch (error) {
    console.error("Google Sign-In Error:", error);
    throw error;
  }
}

// Sign in with GitHub Popup
export async function signInWithGithub() {
  if (!isFirebaseConfigured()) {
    throw new Error("CONFIG_NEEDED");
  }
  try {
    const result = await signInWithPopup(auth, githubProvider);
    const user = result.user;
    cacheUser(user);
    return user;
  } catch (error) {
    console.error("GitHub Sign-In Error:", error);
    throw error;
  }
}

// Sign in with Apple Popup
export async function signInWithApple() {
  if (!isFirebaseConfigured()) {
    throw new Error("CONFIG_NEEDED");
  }
  try {
    const result = await signInWithPopup(auth, appleProvider);
    const user = result.user;
    cacheUser(user);
    return user;
  } catch (error) {
    console.error("Apple Sign-In Error:", error);
    throw error;
  }
}

// Sign in with Email and Password
export async function signInWithEmail(email, password) {
  if (!isFirebaseConfigured()) {
    throw new Error("CONFIG_NEEDED");
  }
  try {
    const result = await signInWithEmailAndPassword(auth, email, password);
    const user = result.user;
    cacheUser(user);
    return user;
  } catch (error) {
    console.error("Email Sign-In Error:", error);
    throw error;
  }
}

// Register with Email and Password
export async function signUpWithEmail(name, email, password) {
  if (!isFirebaseConfigured()) {
    throw new Error("CONFIG_NEEDED");
  }
  try {
    const result = await createUserWithEmailAndPassword(auth, email, password);
    const user = result.user;
    if (name) {
      await updateProfile(user, { displayName: name });
    }
    cacheUser(user);
    return user;
  } catch (error) {
    console.error("Email Sign-Up Error:", error);
    throw error;
  }
}

// Sign Out
export async function signOutUser() {
  cacheUser(null);
  if (auth) {
    await signOut(auth);
  }
}

// Observe Auth state
export function observeAuth(callback) {
  if (!auth) {
    callback(getCachedUser());
    return () => { };
  }
  return onAuthStateChanged(auth, (user) => {
    const cached = cacheUser(user);
    callback(cached);
  });
}
