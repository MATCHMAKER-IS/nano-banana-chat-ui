import React, { useState, useEffect } from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import LoginPage from "./LoginPage";
import { getSession, signOut } from "./auth";
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
    fontFamily: '"Segoe UI Variable", "Segoe UI", "Hiragino Sans", "Noto Sans JP", sans-serif'
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

  useEffect(() => {
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
        <LoginPage onLogin={() => setLoggedIn(true)} />
      )}
    </ThemeProvider>
  );
}

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <Root />
  </React.StrictMode>
);
