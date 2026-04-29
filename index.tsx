import './index.css';
import React from 'react';
import ReactDOM from 'react-dom/client';
import { BrowserRouter, Routes, Route } from 'react-router-dom';
import { UserProvider } from './contexts/UserContext';
import App from './App';
import { AdminRoute } from './routes/AdminRoute';
import { DeveloperRoute } from './routes/DeveloperRoute';
import { ProRoute } from './routes/ProRoute';
import { UsageTracker } from './components/Dev/UsageTracker';
import { HashRouteBridge } from './components/Dev/HashRouteBridge';

const rootElement = document.getElementById('root');
if (!rootElement) {
  throw new Error("Could not find root element to mount to");
}

const root = ReactDOM.createRoot(rootElement);
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <HashRouteBridge />
      <UserProvider>
        <UsageTracker />
        <Routes>
          <Route path="/admin/*" element={<AdminRoute />} />
          <Route path="/willydev/*" element={<DeveloperRoute />} />
          <Route path="/pro/*" element={<ProRoute />} />
          <Route path="/*" element={<App />} />
        </Routes>
      </UserProvider>
    </BrowserRouter>
  </React.StrictMode>
);
