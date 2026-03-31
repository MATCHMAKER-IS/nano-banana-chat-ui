import React from "react";
import { Box, Typography, Button, Alert } from "@mui/material";
import { startZohoLogin } from "./auth";

export default function LoginPage({ oauthError }) {
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
          Nano Banana
        </Typography>

        {oauthError && (
          <Alert severity="error" sx={{ width: "100%" }}>{oauthError}</Alert>
        )}

        <Button
          variant="contained"
          fullWidth
          onClick={startZohoLogin}
          sx={{ py: 1.4 }}
        >
          Zohoアカウントでログイン
        </Button>
      </Box>
    </Box>
  );
}
