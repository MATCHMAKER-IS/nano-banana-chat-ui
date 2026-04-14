import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, Fade, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import LoginPage from "./LoginPage";
import { getSession, handleOAuthCallback, signOut } from "./auth";
import "./styles.css";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#f4a079",
      dark: "#df875f",
      light: "#f9c1a5",
      contrastText: "#fffdfa"
    },
    secondary: {
      main: "#9fc2dc",
      contrastText: "#2f3a45"
    },
    background: {
      default: "#f7f0e4",
      paper: "#fffaf2"
    },
    text: {
      primary: "#4a2f24",
      secondary: "#85695b"
    },
    divider: "rgba(134, 96, 77, 0.2)"
  },
  shape: {
    borderRadius: 18
  },
  typography: {
    fontFamily: '"M PLUS Rounded 1c", "Noto Sans JP", sans-serif',
    button: {
      fontWeight: 700
    }
  },
  components: {
    MuiCssBaseline: {
      styleOverrides: {
        body: {
          backgroundImage:
            "radial-gradient(140% 120% at 10% 8%, #fff8ef 0%, #f7efe1 50%, #f1e6d5 100%)",
          color: "#4a2f24"
        }
      }
    },
    MuiPaper: {
      styleOverrides: {
        root: {
          border: "1px solid rgba(173, 132, 108, 0.16)",
          backgroundImage: "none",
          boxShadow: "0 12px 34px rgba(131, 90, 68, 0.12)"
        }
      }
    },
    MuiButton: {
      styleOverrides: {
        root: {
          textTransform: "none",
          borderRadius: 999,
          letterSpacing: "0.01em"
        }
      }
    },
    MuiChip: {
      styleOverrides: {
        root: {
          fontWeight: 700
        }
      }
    },
    MuiOutlinedInput: {
      styleOverrides: {
        root: {
          borderRadius: 14
        }
      }
    }
  }
});

function Root() {
  const [loggedIn, setLoggedIn] = useState(null);
  const [oauthError, setOauthError] = useState(null);
  const [processing, setProcessing] = useState(false);

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
        setProcessing(true);
        handleOAuthCallback(code)
          .then(() => setLoggedIn(true))
          .catch(() => {
            setOauthError("認証に失敗しました。再度ログインしてください。");
            setLoggedIn(false);
          })
          .finally(() => setProcessing(false));
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
      <Fade in={loggedIn} timeout={400} unmountOnExit>
        <div style={{ height: "100%" }}>
          <App onSignOut={() => { signOut(); setLoggedIn(false); }} />
        </div>
      </Fade>
      <Fade in={!loggedIn} timeout={400} unmountOnExit>
        <div>
          <LoginPage onLogin={() => setLoggedIn(true)} oauthError={oauthError} processing={processing} />
        </div>
      </Fade>
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
