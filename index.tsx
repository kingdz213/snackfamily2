import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App';

console.log("App initializing...");

// Global error handler for Script Errors (usually CDN/CORS issues)
window.addEventListener('error', (event) => {
  console.error("Global error caught:", event.error || event.message);
  const container = document.getElementById('root');
  // Only show this fallback if the app hasn't rendered anything yet
  if (container && container.innerHTML === '') {
     container.innerHTML = `
       <div style="color: #333; padding: 40px; text-align: center; font-family: sans-serif;">
         <h2 style="color: #e11d48; margin-bottom: 10px;">Une erreur est survenue</h2>
         <p>Veuillez rafraîchir la page.</p>
         <p style="font-size: 12px; color: #999; margin-top: 20px;">${event.message}</p>
       </div>
     `;
  }
});

const container = document.getElementById('root');

if (container) {
  try {
    // Clear any existing content
    container.innerHTML = '';
    
    const root = createRoot(container);
    root.render(
      <React.StrictMode>
        <App />
      </React.StrictMode>
    );
    console.log("App rendered successfully.");
  } catch (error) {
    console.error("Error during app rendering:", error);
    container.innerHTML = '<div style="color: red; padding: 20px; text-align: center;">Une erreur est survenue lors du chargement de l\'application.<br/>Veuillez rafraîchir la page.</div>';
  }
} else {
  console.error("Critical Error: 'root' element not found in DOM.");
}