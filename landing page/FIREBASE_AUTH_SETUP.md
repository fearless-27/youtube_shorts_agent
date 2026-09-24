# Complete Step-by-Step Guide: Google & GitHub Authentication with Firebase

This guide takes you through setting up **Google Sign-In** and **GitHub Sign-In** for your NEMO Studio login page (`login.html`) using Firebase Authentication.

---

## Step 1: Create a Firebase Project

1. Go to the [Firebase Console](https://console.firebase.google.com/).
2. Click **Add project** (or **Create a project**).
3. Name your project (e.g. `nemo-studio-auth`) and click **Continue**.
4. (Optional) Disable Google Analytics or link your GA account, then click **Create Project**.
5. Once your project is ready, click **Continue**.

---

## Step 2: Register a Web App & Copy Config

1. On your project's overview page, click the **Web icon (`</>`)** to add a web app.
2. Enter an App nickname (e.g., `NEMO Web`) and click **Register app**.
3. You will see a code snippet with `firebaseConfig`:
   ```javascript
   const firebaseConfig = {
     apiKey: "AIzaSy...",
     authDomain: "nemo-studio-auth.firebaseapp.com",
     projectId: "nemo-studio-auth",
     storageBucket: "nemo-studio-auth.appspot.com",
     messagingSenderId: "123456789...",
     appId: "1:123456789:web:abcdef..."
   };
   ```
4. Open [js/firebase-auth.js](file:///d:/landing%20page/js/firebase-auth.js) and paste these values into the `firebaseConfig` object at the top.

---

## Step 3: Enable Email / Password & Google Sign-In

1. In the Firebase Console left menu, click **Build** -> **Authentication**.
2. Click **Get Started**.
3. Go to the **Sign-in method** tab.

### A. Enable Email / Password
1. Click **Email/Password**.
2. Turn on the **Enable** toggle.
3. Click **Save**.

### B. Enable Google Sign-In
1. In the **Sign-in providers** list, click **Google**.
2. Toggle the switch to **Enable**.
3. Set the **Project public-facing name** (e.g., `NEMO Studio`).
4. Select your **Project support email** from the dropdown.
5. Click **Save**.
*(That's it! Firebase automatically provisions the Google Cloud OAuth client for you.)*

---

## Step 4: Configure GitHub OAuth App

Firebase requires a GitHub Client ID and Client Secret to enable GitHub sign-in:

### A. Register OAuth App on GitHub
1. Sign in to your [GitHub Account](https://github.com/).
2. In the top right corner, click your profile picture -> **Settings**.
3. In the left sidebar, scroll down to the bottom and click **Developer settings**.
4. Click **OAuth Apps** -> **New OAuth App** (or **Register a new application**).
5. Fill in the form:
   - **Application name**: `NEMO Studio`
   - **Homepage URL**: `http://localhost:8080` (or your live site URL)
   - **Application description**: `NEMO Studio Creative Systems`
   - **Authorization callback URL**:
     - Go to your Firebase Console -> Authentication -> Sign-in method -> Click **GitHub**.
     - Copy the URL shown under **Authorization callback URL**:
       `https://<YOUR-PROJECT-ID>.firebaseapp.com/__/auth/handler`
     - Paste this exact URL into the GitHub field.
6. Click **Register application**.

### B. Generate Client Secret & Save to Firebase
1. On your newly created GitHub OAuth app page, you will see your **Client ID**.
2. Click **Generate a new client secret**.
3. Copy both the **Client ID** and the generated **Client Secret**.
4. Return to your Firebase Console -> Authentication -> **Sign-in method** -> **GitHub**.
5. Toggle **Enable**.
6. Paste your **Client ID** and **Client Secret**.
7. Click **Save**.

---

## Step 5: Verify Authorized Domains

1. In the Firebase Console -> **Authentication** -> **Settings** tab -> **Authorized domains**.
2. Verify that `localhost` is listed. (If you test using `127.0.0.1` or deploy to a custom domain like `nemostudio.com`, click **Add domain** and add it here).

---

## Step 6: Test the Login Page

1. Start your local server:
   Double-click `start.bat` (or run `python -m http.server 8080`).
2. Open in your browser:
   [http://localhost:8080/login.html](http://localhost:8080/login.html)
3. Test:
   - **Continue with Google**: A Google account chooser popup appears; on selection, you are logged in and redirected back to the studio.
   - **Continue with GitHub**: A GitHub authorization popup appears; on approval, you are logged in.
   - **Email Sign Up / Sign In**: Register a test account with email & password.
