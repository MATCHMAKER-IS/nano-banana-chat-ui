import React, { useState } from "react";
import { Box, Typography, TextField, Button, CircularProgress, Alert } from "@mui/material";
import { signIn, completeNewPassword } from "./auth";

export default function LoginPage({ onLogin }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordMode, setNewPasswordMode] = useState(false);
  const [pendingUser, setPendingUser] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const handleSignIn = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      const result = await signIn(email, password);
      if (result?.newPasswordRequired) {
        setPendingUser(result.user);
        setNewPasswordMode(true);
      } else {
        onLogin();
      }
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  const handleNewPassword = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError("");
    try {
      await completeNewPassword(pendingUser, newPassword);
      onLogin();
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  function getErrorMessage(err) {
    switch (err?.code) {
      case "NotAuthorizedException": return "メールアドレスまたはパスワードが正しくありません。";
      case "UserNotFoundException": return "このメールアドレスは登録されていません。";
      case "UserNotConfirmedException": return "アカウントが確認されていません。管理者に連絡してください。";
      case "PasswordResetRequiredException": return "パスワードのリセットが必要です。管理者に連絡してください。";
      default: return err?.message || "ログインに失敗しました。";
    }
  }

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
      }}>
        <Typography variant="h5" fontWeight={700} mb={1} color="text.primary" textAlign="center">
          Nano Banana
        </Typography>
        <Typography variant="body2" color="text.primary" mb={4} textAlign="center">
          {newPasswordMode ? "初回ログインのため新しいパスワードを設定してください" : "ログインしてください"}
        </Typography>

        {error && <Alert severity="error" sx={{ mb: 2, borderRadius: 2 }}>{error}</Alert>}

        {!newPasswordMode ? (
          <Box component="form" onSubmit={handleSignIn} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="メールアドレス"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              fullWidth
              autoFocus
              size="small"
              sx={{ "& .MuiInputLabel-root": { color: "text.primary" }, "& .MuiInputBase-input": { color: "text.primary" } }}
            />
            <TextField
              label="パスワード"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              fullWidth
              size="small"
              sx={{ "& .MuiInputLabel-root": { color: "text.primary" }, "& .MuiInputBase-input": { color: "text.primary" } }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
              sx={{ mt: 1, py: 1.2 }}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : "ログイン"}
            </Button>
          </Box>
        ) : (
          <Box component="form" onSubmit={handleNewPassword} sx={{ display: "flex", flexDirection: "column", gap: 2 }}>
            <TextField
              label="新しいパスワード"
              type="password"
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              required
              fullWidth
              autoFocus
              size="small"
              helperText="8文字以上、大文字・小文字・数字を含めてください"
              sx={{ "& .MuiInputLabel-root": { color: "text.primary" }, "& .MuiInputBase-input": { color: "text.primary" } }}
            />
            <Button
              type="submit"
              variant="contained"
              fullWidth
              disabled={loading}
              sx={{ mt: 1, py: 1.2 }}
            >
              {loading ? <CircularProgress size={20} color="inherit" /> : "パスワードを設定してログイン"}
            </Button>
          </Box>
        )}
      </Box>
    </Box>
  );
}
