import React from "react";
import { createRoot } from "react-dom/client";
import { CssBaseline, ThemeProvider, createTheme } from "@mui/material";
import App from "./App";
import "./styles.css";

const theme = createTheme({
  palette: {
    mode: "dark",
    primary: {
      main: "#f1f1f1",
      dark: "#d9d9d9",
      light: "#ffffff",
      contrastText: "#111111"
    },
    background: {
      default: "#212121",
      paper: "rgba(43, 43, 43, 0.9)"
    },
    text: {
      primary: "#ececec",
      secondary: "#a7a7a7"
    },
    divider: "rgba(255, 255, 255, 0.12)"
  },
  shape: {
    borderRadius: 14
  },
  typography: {
    fontFamily: '"Noto Sans JP", -apple-system, BlinkMacSystemFont, "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", sans-serif'
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

createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ThemeProvider theme={theme}>
      <CssBaseline />
      <App />
    </ThemeProvider>
  </React.StrictMode>
);
