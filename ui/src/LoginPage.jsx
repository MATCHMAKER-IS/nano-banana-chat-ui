import React, { useState } from "react";
import { Box, Typography, Button, Alert, CircularProgress } from "@mui/material";
import { startZohoLogin } from "./auth";

export default function LoginPage({ oauthError, processing }) {
  const [clicking, setClicking] = useState(false);

  const handleLogin = () => {
    setClicking(true);
    startZohoLogin();
  };

  const isLoading = clicking || processing;

  return (
    <Box sx={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      bgcolor: "background.default",
    }}>
      <Box sx={{
        width: "100%",
        maxWidth: 400,
        px: 3,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        gap: 3,
      }}>
        <Typography variant="h5" fontWeight={700} color="text.primary">
          Nano Banana WebUI
        </Typography>

        {oauthError && (
          <Alert severity="error" sx={{ width: "100%" }}>{oauthError}</Alert>
        )}

        <Button
          variant="contained"
          fullWidth
          onClick={handleLogin}
          disabled={isLoading}
          sx={{ py: 1.4, gap: 1 }}
        >
          {isLoading && <CircularProgress size={16} color="inherit" />}
          {isLoading ? "検証中..." : "Zohoアカウントでログイン"}
        </Button>
      </Box>
    </Box>
  );
}
