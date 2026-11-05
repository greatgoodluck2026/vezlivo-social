import React, { useEffect, useState } from "react";

function SplashScreen({ onComplete }) {
  const [isFading, setIsFading] = useState(false);

  useEffect(() => {
    // Start the fade out slightly before the 2 seconds end
    const timer = setTimeout(() => {
      setIsFading(true);

      // Wait for the CSS transition to finish before unmounting
      const unmountTimer = setTimeout(() => {
        onComplete();
      }, 400);

      return () => clearTimeout(unmountTimer);
    }, 1600);

    return () => clearTimeout(timer);
  }, [onComplete]);

  return (
    <div
      className={`splash-screen ${isFading ? "fade-out" : ""}`}
      style={{
        backgroundColor: "#000000",
      }}
    >
      <img
        src="/Logo.png"
        alt="Vezlivo"
        className="splash-logo"
      />

      <p className="splash-name">
        Vezlivo
      </p>
    </div>
  );
}

export default SplashScreen;