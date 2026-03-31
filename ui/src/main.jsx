import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import LoginPage from "./LoginPage";
import { getSession, handleOAuthCallback, signOut } from "./auth";
import "./styles.css";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#ffffff",
      dark: "#d9d9d9",
      light: "#ffffff",
      contrastText: "#111111"
    },
    background: {
      default: "#212121",
      paper: "#2f2f2f"
    },
    text: {
      primary: "#ececec",
      secondary: "#8e8ea0"
    },
    divider: "rgba(255, 255, 255, 0.08)"
  },
  shape: {
    borderRadius: 12
  },
  typography: {
    fontFamily: 'system-ui, "Segoe UI Variable", "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif'
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backdropFilter: "blur(8px)",
          border: "none",
          backgroundImage: "none",
          boxShadow: "none"
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          fontWeight: 600,
          borderRadius: 10
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 600
        }
      }
    }
  }
});

function Root() {
  const [loggedIn, setLoggedIn] = useState(null);
  const [oauthError, setOauthError] = useState(null);

  useEffect(() => {
    // ZohoからのOAuthコールバック処理
    if (window.location.pathname === "/oauth/callback") {
      const params = new URLSearchParams(window.location.search);
      const code = params.get("code");
      const error = params.get("error");

      // URLからコードを消してトップに戻す
      window.history.replaceState({}, "", "/");

      if (error) {
        setOauthError("Zoho認証がキャンセルされました。再度お試しください。");
        setLoggedIn(false);
        return;
      }

      if (code) {
        // 認証コードは3分で期限切れのため即座に交換
        handleOAuthCallback(code)
          .then(() => setLoggedIn(true))
          .catch(() => {
            setOauthError("認証に失敗しました。再度ログインしてください。");
            setLoggedIn(false);
          });
        return;
      }
    }

    // 通常起動時：保存済みトークンでセッション確認
    getSession()
      .then(() => setLoggedIn(true))
      .catch(() => setLoggedIn(false));
  }, []);

  if (loggedIn === null) return null;

  return (
    <ThemeProvider theme={theme}>
      <CssBaseline />
      {loggedIn ? (
        <App onSignOut={() => { signOut(); setLoggedIn(false); }} />
      ) : (
        <LoginPage onLogin={() => setLoggedIn(true)} oauthError={oauthError} />
      )}
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
