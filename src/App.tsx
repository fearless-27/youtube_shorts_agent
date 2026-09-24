import { useEffect } from 'react';
import { Routes, Route, useLocation, Navigate } from 'react-router-dom';
import { AnimatePresence, motion } from 'framer-motion';

import Dashboard from './pages/Dashboard';

const pageVariants = {
  initial: { opacity: 0, y: 8 },
  animate: { opacity: 1, y: 0, transition: { duration: 0.4, ease: [0.25, 0.46, 0.45, 0.94] as [number, number, number, number] } },
  exit: { opacity: 0, y: -8, transition: { duration: 0.25 } },
};

/** Redirect root to landing page (if not logged in) or dashboard (if logged in) */
function RootRedirect() {
  const isLoggedIn = (() => {
    try {
      const raw = localStorage.getItem('nemo_user');
      if (!raw) return false;
      const user = JSON.parse(raw);
      return Boolean(user && user.email);
    } catch { return false; }
  })();

  useEffect(() => {
    if (!isLoggedIn) {
      window.location.href = '/landing/';
    }
  }, [isLoggedIn]);

  if (isLoggedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  return null;
}

/** Redirect /login directly to the login page */
function LoginRedirect() {
  const isLoggedIn = (() => {
    try {
      const raw = localStorage.getItem('nemo_user');
      if (!raw) return false;
      const user = JSON.parse(raw);
      return Boolean(user && user.email);
    } catch { return false; }
  })();

  useEffect(() => {
    if (!isLoggedIn) {
      window.location.href = '/landing/login.html';
    }
  }, [isLoggedIn]);

  if (isLoggedIn) {
    return <Navigate to="/dashboard" replace />;
  }

  return null;
}

function App() {
  const location = useLocation();

  useEffect(() => {
    document.title = 'NEMO — AI YouTube Shorts Automation';
    document.documentElement.lang = 'en';

    let metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.name = 'description';
      document.head.appendChild(metaDescription);
    }
    metaDescription.content = 'NEMO scans trends, generates AI-powered YouTube Shorts, predicts virality, and uploads autonomously. The complete Shorts automation pipeline.';
  }, []);

  return (
    <AnimatePresence mode="wait">
      <Routes location={location} key={location.pathname}>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/login" element={<LoginRedirect />} />
        <Route path="/landing" element={<RootRedirect />} />
        <Route path="/dashboard/*" element={<PageWrapper><Dashboard /></PageWrapper>} />
      </Routes>
    </AnimatePresence>
  );
}

function PageWrapper({ children }: { children: React.ReactNode }) {
  return (
    <motion.div variants={pageVariants} initial="initial" animate="animate" exit="exit">
      {children}
    </motion.div>
  );
}

export default App;