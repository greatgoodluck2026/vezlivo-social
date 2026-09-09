import React, { useEffect } from "react";

function SplashScreen({ onComplete }) {
  useEffect(() => {
    const timer = setTimeout(() => {
      onComplete();
    }, 2000);

    return () => {
      clearTimeout(timer);
    };
  }, [onComplete]);

  return (
    <div className="splash-screen">
      <img
        src="/Logo.png"
        alt="Vezlivo"
        className="splash-logo"
      />

      <p className="splash-name">Vezlivo</p>
    </div>
  );
}

export default SplashScreen;