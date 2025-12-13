import React, { useEffect, useState } from "react";
import axios from "axios";

const api = axios.create({
  baseURL: "http://localhost:8000",
  withCredentials: true,
});

export const GoogleAuthTest: React.FC = () => {
  const [status, setStatus] = useState("Idle");
  const [user, setUser] = useState<any>(null);

  const loginWithGoogle = () => {
    window.location.href = "http://localhost:8000/auth/google";
  };

  const checkAuth = async () => {
    try {
      setStatus("Checking auth...");

      const res = await api.get("/users/me");
      setUser(res.data);
      setStatus("Auth OK");
    } catch (e) {
      setStatus("Not authenticated");
      setUser(null);
    }
  };

  useEffect(() => {
    checkAuth();
  }, []);

  return (
    <div style={{ padding: 24 }}>
      <h2>Google OAuth cookie test</h2>

      <button onClick={loginWithGoogle}>Login with Google</button>

      <button onClick={checkAuth} style={{ marginLeft: 12 }}>
        Check auth
      </button>

      <p>Status: {status}</p>

      {user && <pre>{JSON.stringify(user, null, 2)}</pre>}
    </div>
  );
};
