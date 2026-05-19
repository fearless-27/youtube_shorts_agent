import { useEffect } from 'react';
import { Routes, Route } from 'react-router-dom';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';

function App() {
  useEffect(() => {
    document.title = 'GhostPipe — AI YouTube Shorts Automation';
    document.documentElement.lang = 'en';

    let metaDescription = document.querySelector<HTMLMetaElement>('meta[name="description"]');
    if (!metaDescription) {
      metaDescription = document.createElement('meta');
      metaDescription.name = 'description';
      document.head.appendChild(metaDescription);
    }
    metaDescription.content = 'GhostPipe scans trends, generates AI-powered YouTube Shorts, predicts virality, and uploads autonomously. The complete Shorts automation pipeline.';
  }, []);

  return (
    <Routes>
      <Route path="/" element={<Landing />} />
      <Route path="/login" element={<Login />} />
      <Route path="/dashboard/*" element={<Dashboard />} />
    </Routes>
  );
}

export default App;
