  import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import "./style.css";
import SplashScreen from "./SplashScreen";
function App() {
  const [showSplash, setShowSplash] = useState(true);

  if (showSplash) {
    return (
      <SplashScreen
        onComplete={() => setShowSplash(false)}
      />
    );
  }

  return (
    <main className="app">
      <section className="welcome-card">
        <img
          src="/Logo.png"
          alt="Vezlivo logo"
          className="vezlivo-logo"
        />

        <h1>Vezlivo</h1>

        <p>
          Connect, Stream, and Grow Together.
        </p>

        <button type="button">
          Get Started
        </button>
      </section>
    </main>
  );
}

const rootElement = document.getElementById("root");

if (!rootElement) {
  throw new Error("Vezlivo root element was not found.");
}

createRoot(rootElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>
); 