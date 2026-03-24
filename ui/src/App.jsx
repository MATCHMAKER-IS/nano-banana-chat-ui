import { useEffect, useMemo, useRef, useState } from "react";
import { getIdToken } from "./auth";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  Dialog,
  DialogContent,
  DialogTitle,
  IconButton,
  MenuItem,
  Paper,
  Snackbar,
  Stack,
  TextField,
  Tooltip,
  Typography
} from "@mui/material";
import AttachFileRoundedIcon from "@mui/icons-material/AttachFileRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";

const PSEUDO_STEPS = ["画像を読み込み中", "編集内容を解析中", "編集リクエストを送信中", "画像を生成中", "最終調整中"];
const PROXY_TOKEN_STORAGE_KEY = "nano_banana_proxy_token";
const MODEL_STORAGE_KEY = "nano_banana_model";
const SYSTEM_PROMPT_STORAGE_KEY = "nano_banana_system_prompt";
const DEFAULT_MODEL = import.meta.env.VITE_DEFAULT_MODEL || "gemini-3.1-flash-image-preview";
const DEFAULT_IMAGE_MODELS = [
  "gemini-3.1-flash-image-preview",
  "gemini-3-pro-image-preview",
  "gemini-2.5-flash-image"
];
const MODEL_LABELS = {
  "gemini-3.1-flash-image-preview": "Nano Banana 2 (Gemini 3.1 Flash Image Preview)",
  "gemini-3-pro-image-preview": "Nano Banana Pro (Gemini 3 Pro Image Preview)",
  "gemini-2.5-flash-image": "Nano Banana (Gemini 2.5 Flash Image)"
};
const MODEL_OPTIONS = Array.from(
  new Set(
    String(import.meta.env.VITE_IMAGE_MODELS || DEFAULT_IMAGE_MODELS.join(","))
      .split(",")
      .map((v) => v.trim())
      .filter(Boolean)
      .concat(DEFAULT_MODEL)
  )
);

function getModelLabel(modelId) {
  return MODEL_LABELS[modelId] || modelId;
}

function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("Invalid data URL");
  return { mimeType: match[1], base64: match[2] };
}

function fileToDataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function loadImage(dataUrl) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = reject;
    img.src = dataUrl;
  });
}

async function shrinkDataUrlIfNeeded(dataUrl, maxEdge = 1536) {
  const img = await loadImage(dataUrl);
  const width = img.naturalWidth || img.width;
  const height = img.naturalHeight || img.height;
  const longest = Math.max(width, height);
  if (longest <= maxEdge) return dataUrl;

  const scale = maxEdge / longest;
  const targetW = Math.max(1, Math.round(width * scale));
  const targetH = Math.max(1, Math.round(height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = targetW;
  canvas.height = targetH;
  const ctx = canvas.getContext("2d");
  if (!ctx) return dataUrl;

  ctx.drawImage(img, 0, 0, targetW, targetH);
  return canvas.toDataURL("image/jpeg", 0.9);
}

async function callEditApi({ apiBaseUrl, prompt, systemPrompt, imageDataUrl, sessionId, model }) {
  const { mimeType, base64 } = parseDataUrl(imageDataUrl);
  const idToken = await getIdToken();
  const headers = { "Content-Type": "application/json", "Authorization": `Bearer ${idToken}` };

  const res = await fetch(`${apiBaseUrl}/api/edit`, {
    method: "POST",
    headers,
    body: JSON.stringify({
      prompt,
      systemPrompt: systemPrompt || undefined,
      imageBase64: base64,
      mimeType,
      sessionId,
      model,
      modelId: model,
      selectedModel: model
    })
  });

  let json;
  try {
    json = await res.json();
  } catch {
    if (res.status === 502 || res.status === 503) {
      throw new Error("サーバーが応答できませんでした。時間をおいて再試行してください。（原因: サーバー一時エラー）");
    }
    if (res.status === 504) {
      throw new Error("処理がタイムアウトしました。画像サイズを小さくして再試行してください。");
    }
    throw new Error(`サーバーから予期しない応答がありました。（ステータス: ${res.status}）`);
  }

  if (!res.ok) {
    const errorCode = json?.error;
    if (errorCode === "gemini_request_failed") {
      throw new Error("AIモデルが応答しませんでした。別のモデルに切り替えるか、時間をおいて再試行してください。");
    }
    if (errorCode === "no_image_part") {
      throw new Error("AIが画像を生成しませんでした。プロンプトを変更して再試行してください。");
    }
    if (errorCode === "image_required") {
      throw new Error("画像が添付されていません。画像を選択してから送信してください。");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("認証エラーが発生しました。一度ログアウトして再ログインしてください。");
    }
    throw new Error(json?.hint || json?.error || "リクエストが失敗しました。再試行してください。");
  }

  if (!json.editedImageBase64 || !json.mimeType) {
    throw new Error("AIから画像が返されませんでした。プロンプトを変更して再試行してください。");
  }

  return {
    sessionId: json.sessionId || sessionId,
    model: json.model || "",
    text: json.text || "",
    requestId: json.requestId || "",
    outputImage: `data:${json.mimeType};base64,${json.editedImageBase64}`
  };
}

function downloadDataUrl(dataUrl, filename) {
  const a = document.createElement("a");
  a.href = dataUrl;
  a.download = filename;
  a.click();
}

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function MessageImage({ src, alt, onClick, variant = "generated" }) {
  const isThumb = variant === "thumb";
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      onClick={onClick}
      sx={{
        width: isThumb ? "110px" : "100%",
        height: isThumb ? "110px" : "auto",
        maxWidth: isThumb ? "110px" : "min(560px, 100%)",
        maxHeight: isThumb ? "110px" : "420px",
        objectFit: isThumb ? "cover" : "contain",
        borderRadius: isThumb ? "12px" : 1.25,
        border: "none",
        cursor: onClick ? "zoom-in" : "default",
        backgroundColor: "#2a2a2a"
      }}
    />
  );
}

export default function App({ onSignOut }) {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8787";
  const [modelInput, setModelInput] = useState(() => {
    try {
      return localStorage.getItem(MODEL_STORAGE_KEY) || DEFAULT_MODEL;
    } catch {
      return DEFAULT_MODEL;
    }
  });
  const model = (modelInput || "").trim() || DEFAULT_MODEL;
  const modelRef = useRef(model);

  useEffect(() => {
    if (!MODEL_OPTIONS.includes(model)) {
      setModelInput(DEFAULT_MODEL);
    }
  }, [model]);

  useEffect(() => {
    modelRef.current = model;
  }, [model]);

  const [systemPromptInput, setSystemPromptInput] = useState(() => {
    try {
      return localStorage.getItem(SYSTEM_PROMPT_STORAGE_KEY) || "";
    } catch {
      return "";
    }
  });

  useEffect(() => {
    try {
      if (systemPromptInput) localStorage.setItem(SYSTEM_PROMPT_STORAGE_KEY, systemPromptInput);
      else localStorage.removeItem(SYSTEM_PROMPT_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, [systemPromptInput]);

  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState([]);
  const [prompt, setPrompt] = useState("");
  const [latestGeneratedImage, setLatestGeneratedImage] = useState("");
  const [manualTargetImage, setManualTargetImage] = useState("");
  const [loading, setLoading] = useState(false);
  const [elapsedMs, setElapsedMs] = useState(0);
  const [pendingAttachment, setPendingAttachment] = useState(null);
  const [error, setError] = useState("");
  const [modalImage, setModalImage] = useState("");
  const [compareModal, setCompareModal] = useState(null);
  const [sliderPos, setSliderPos] = useState(50);
  const [compareAspect, setCompareAspect] = useState("16/9");
  const [targetNoticeOpen, setTargetNoticeOpen] = useState(false);
  const [sessionWidth, setSessionWidth] = useState(272);

  const formRef = useRef(null);
  const endRef = useRef(null);
  const sliderContainerRef = useRef(null);
  const sliderDraggingRef = useRef(false);
  const [isDragOver, setIsDragOver] = useState(false);
  const dragCounterRef = useRef(0);
  const sessionResizingRef = useRef(false);

  const onSessionResizeStart = (e) => {
    e.preventDefault();
    sessionResizingRef.current = true;
    const onMove = (ev) => {
      if (!sessionResizingRef.current) return;
      const newW = Math.min(600, Math.max(200, window.innerWidth - (ev.clientX || ev.touches?.[0]?.clientX)));
      setSessionWidth(newW);
    };
    const onUp = () => {
      sessionResizingRef.current = false;
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
      window.removeEventListener("touchmove", onMove);
      window.removeEventListener("touchend", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    window.addEventListener("touchmove", onMove);
    window.addEventListener("touchend", onUp);
  };


  useEffect(() => {
    try {
      if (modelInput) localStorage.setItem(MODEL_STORAGE_KEY, modelInput);
      else localStorage.removeItem(MODEL_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, [modelInput]);

  useEffect(() => {
    if (!loading) return undefined;
    const start = Date.now();
    const id = setInterval(() => setElapsedMs(Date.now() - start), 200);
    return () => clearInterval(id);
  }, [loading]);


  const effectiveImage = useMemo(
    () => pendingAttachment?.dataUrl || manualTargetImage || latestGeneratedImage || "",
    [pendingAttachment, manualTargetImage, latestGeneratedImage]
  );
  const effectiveAttachmentName = useMemo(() => {
    if (pendingAttachment?.fileName) return pendingAttachment.fileName;
    if (manualTargetImage) return "手動選択した編集対象画像";
    if (latestGeneratedImage) return "直前の生成画像";
    return "";
  }, [pendingAttachment, manualTargetImage, latestGeneratedImage]);
  const canSend = useMemo(() => !loading && prompt.trim().length > 0 && !!effectiveImage, [loading, prompt, effectiveImage]);
  const hasMessages = messages.length > 0;

  const pseudoStep = useMemo(() => {
    if (!loading) return "待機中";
    const idx = Math.min(PSEUDO_STEPS.length - 1, Math.floor(elapsedMs / 1500));
    return PSEUDO_STEPS[idx];
  }, [loading, elapsedMs]);

  const progressPercent = useMemo(() => {
    if (!loading) return 0;
    return Math.min(95, 10 + elapsedMs / 200);
  }, [loading, elapsedMs]);

  const attachFile = async (file) => {
    if (!file || !file.type.startsWith("image/")) return;
    const previewUrl = URL.createObjectURL(file);
    const rawDataUrl = await fileToDataUrl(file);
    const dataUrl = await shrinkDataUrlIfNeeded(rawDataUrl);
    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { fileName: file.name, previewUrl, dataUrl };
    });
    setError("");
  };

  const onAttach = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;
    await attachFile(file);
    event.target.value = "";
  };

  const clearAttachment = () => {
    if (pendingAttachment?.previewUrl) {
      URL.revokeObjectURL(pendingAttachment.previewUrl);
    }
    setPendingAttachment(null);
  };

  const setAsCurrentTarget = (imageDataUrl) => {
    // pendingAttachment takes precedence in effectiveImage, so clear it first.
    clearAttachment();
    setManualTargetImage(imageDataUrl);
    setError("");
    setTargetNoticeOpen(true);
  };

  const clearCurrentTarget = () => {
    setManualTargetImage("");
    setError("");
  };

  const openCompare = (before, after) => {
    setSliderPos(50);
    setCompareAspect("4/3");
    setCompareModal({ before, after });
  };

  const onSliderPointerDown = (e) => {
    e.preventDefault();
    sliderDraggingRef.current = true;
    e.currentTarget.setPointerCapture(e.pointerId);
  };

  const onSliderContainerMove = (e) => {
    if (!sliderDraggingRef.current) return;
    const rect = sliderContainerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const pos = Math.min(99, Math.max(1, ((e.clientX - rect.left) / rect.width) * 100));
    setSliderPos(pos);
  };

  const onSliderContainerUp = () => {
    sliderDraggingRef.current = false;
  };

  const onSubmit = async (event) => {
    event.preventDefault();
    if (!canSend) return;

    setLoading(true);
    setElapsedMs(0);
    setError("");

    const usedPrompt = prompt.trim();
    const inputImage = effectiveImage;
    const assistantId = crypto.randomUUID();
    const selectedModel = (modelRef.current || modelInput || DEFAULT_MODEL).trim() || DEFAULT_MODEL;

    setPrompt("");

    setMessages((prev) => [
      ...prev,
      {
        id: crypto.randomUUID(),
        role: "user",
        text: usedPrompt,
        image: inputImage,
        attachmentName: effectiveAttachmentName || "編集対象画像",
        createdAt: new Date().toISOString()
      },
      {
        id: assistantId,
        role: "assistant",
        text: "画像を生成しています...",
        pending: true,
        createdAt: new Date().toISOString(),
        beforeImage: inputImage
      }
    ]);

    clearAttachment();

    try {
      const result = await callEditApi({
        apiBaseUrl,
        prompt: usedPrompt,
        systemPrompt: systemPromptInput.trim(),
        imageDataUrl: inputImage,
        sessionId,
        model: selectedModel
      });

      setSessionId(result.sessionId);
      setLatestGeneratedImage(result.outputImage);

      setMessages((prev) =>
        prev.map((m) =>
          m.id === assistantId
            ? {
                ...m,
                pending: false,
                text: result.text || "編集が完了しました。続けて調整できます。",
                image: result.outputImage,
                model: result.model,
                requestId: result.requestId,
                beforeImage: inputImage
              }
            : m
        )
      );

      endRef.current?.scrollIntoView({ behavior: "smooth" });
    } catch (err) {
      let message = err instanceof Error ? err.message : String(err);
      if (message.includes("gemini_timeout")) {
        message = "応答がタイムアウトしました。画像サイズを小さくして再試行してください。";
      } else if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
        message = "ネットワークエラーが発生しました。インターネット接続を確認して再試行してください。";
      } else if (message.includes("Unexpected token") || message.includes("is not valid JSON")) {
        message = "サーバーから予期しない応答がありました。時間をおいて再試行してください。";
      }
      setError(message);
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pending: false, text: message, error: true } : m)));
    } finally {
      setLoading(false);
      setElapsedMs(0);
    }
  };

  const onPromptKeyDown = (event) => {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      formRef.current?.requestSubmit();
    }
  };

  const onDragEnter = (e) => {
    e.preventDefault();
    dragCounterRef.current += 1;
    if (dragCounterRef.current === 1) setIsDragOver(true);
  };

  const onDragLeave = (e) => {
    e.preventDefault();
    dragCounterRef.current -= 1;
    if (dragCounterRef.current === 0) setIsDragOver(false);
  };

  const onDragOver = (e) => { e.preventDefault(); };

  const onDrop = async (e) => {
    e.preventDefault();
    dragCounterRef.current = 0;
    setIsDragOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) await attachFile(file);
  };

  const resetSession = () => {
    clearAttachment();
    setSessionId(crypto.randomUUID());
    setMessages([]);
    setPrompt("");
    setLatestGeneratedImage("");
    setManualTargetImage("");
    setError("");
  };

  return (
    <Box className="app-shell">
      <Stack direction={{ xs: "column", lg: "row" }} spacing={0} sx={{ height: "100%", position: "relative", zIndex: 1 }}>
        <Paper
          elevation={0}
          className="chat-panel"
          onDragEnter={onDragEnter}
          onDragLeave={onDragLeave}
          onDragOver={onDragOver}
          onDrop={onDrop}
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0,
            background: "transparent",
            borderRadius: 0,
            position: "relative"
          }}
        >
          {isDragOver && (
            <Box sx={{
              position: "absolute",
              inset: 0,
              zIndex: 200,
              background: "rgba(255,255,255,0.04)",
              border: "2px dashed rgba(255,255,255,0.3)",
              borderRadius: "12px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              backdropFilter: "blur(2px)"
            }}>
              <Typography sx={{ color: "text.primary", fontSize: "1.1rem", fontWeight: 600, opacity: 0.85 }}>
                画像をドロップして追加
              </Typography>
            </Box>
          )}
          <Box sx={{ px: 3, pt: 2.5, pb: 1 }}>
            <Typography variant="h4" sx={{ fontSize: { xs: 18, md: 20 }, fontWeight: 600, letterSpacing: "-0.01em", color: "text.primary" }}>
              Nano Banana
            </Typography>
          </Box>

          {null}

          {hasMessages ? (
            <Box sx={{ p: 2, overflow: "auto", display: "grid", gap: 1.5, alignContent: "start", flex: 1, minHeight: 0 }}>
              {messages.map((m) => (
                <Box key={m.id} sx={{ display: "flex", flexDirection: "column", alignItems: m.role === "assistant" ? "flex-start" : "flex-end", gap: 0.75 }}>
                  {(() => {
                    const hideUserPreview = m.role === "user" && m.attachmentName === "直前の生成画像";
                    const showMessageImage = Boolean(m.image) && !hideUserPreview;
                    return (<>
                      {/* ユーザー画像：独立したカード */}
                      {m.role === "user" && showMessageImage && (
                        <Box sx={{ borderRadius: "12px", overflow: "hidden", width: "fit-content" }}>
                          <MessageImage src={m.image} alt="message" onClick={() => setModalImage(m.image)} variant="thumb" />
                        </Box>
                      )}

                      {/* テキスト or AIメッセージ */}
                      {(m.text || m.role === "assistant") && (
                        <Paper
                          elevation={0}
                          sx={{
                            width: "fit-content",
                            maxWidth: m.role === "assistant" ? "min(760px, 100%)" : "min(400px, 90%)",
                            p: m.role === "assistant" ? "10px 4px" : "10px 16px",
                            borderRadius: m.role === "assistant" ? 0 : "18px",
                            border: "none",
                            background: m.role === "assistant" ? "transparent" : "#2f2f2f"
                          }}
                        >
                          {m.role === "assistant" && (
                            <Typography variant="caption" sx={{ color: "text.primary", fontWeight: 600, fontSize: "0.7rem", letterSpacing: "0.08em", textTransform: "uppercase", display: "block", mb: 0.75 }}>
                              AI
                            </Typography>
                          )}
                          {m.text ? (
                            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "0.9375rem" }}>
                              {m.text}
                            </Typography>
                          ) : null}

                          {/* アシスタントメッセージの画像 */}
                          {m.role === "assistant" && showMessageImage ? (
                            <Stack spacing={1} sx={{ mt: 1 }}>
                              <MessageImage src={m.image} alt="message" onClick={() => setModalImage(m.image)} />
                              <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                {!m.pending && m.beforeImage && m.image ? (
                                  <Button size="small" variant="text" startIcon={<CompareArrowsRoundedIcon />} onClick={() => openCompare(m.beforeImage, m.image)}>
                                    比較
                                  </Button>
                                ) : null}
                                <Button size="small" variant="text" startIcon={<DownloadRoundedIcon />} onClick={() => downloadDataUrl(m.image, "edited-image.png")}>
                                  保存
                                </Button>
                              </Stack>
                            </Stack>
                          ) : null}

                          {m.pending ? (
                            <Typography variant="caption" sx={{ mt: 1, display: "inline-flex", alignItems: "center", color: "text.primary" }}>
                              <Box component="span" className="thinking-text">生成中</Box>
                            </Typography>
                          ) : null}
                        </Paper>
                      )}
                    </>);
                  })()}
                </Box>
              ))}
              <Box ref={endRef} />
            </Box>
          ) : null}

          <Box sx={{ mt: "auto" }}>
            {null}

            <Box component="form" ref={formRef} onSubmit={onSubmit} sx={{ px: 2, pb: 2, pt: 1 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 1,
                  borderRadius: "16px",
                  border: "none",
                  backgroundColor: "#2f2f2f"
                }}
              >
                {pendingAttachment ? (
                  <Box
                    sx={{
                      mb: 1,
                      p: 0.75,
                      display: "flex",
                      gap: 1,
                      alignItems: "center",
                      borderRadius: 2,
                      border: "none",
                      backgroundColor: "rgba(255,255,255,0.03)",
                      width: "fit-content"
                    }}
                  >
                    <Box component="img" src={pendingAttachment.previewUrl} alt="pending" sx={{ width: 88, height: 56, objectFit: "cover", borderRadius: 1.25 }} />
                    <Stack spacing={0.5}>
                      <Typography variant="caption" sx={{ maxWidth: 260, color: "text.primary" }} noWrap>
                        {pendingAttachment.fileName}
                      </Typography>
                      <Button size="small" variant="text" onClick={clearAttachment} sx={{ alignSelf: "flex-start", minWidth: 0, px: 0.5, color: "text.primary" }}>
                        削除
                      </Button>
                    </Stack>
                  </Box>
                ) : null}

                {!pendingAttachment && manualTargetImage ? (
                  <Box sx={{ mb: 1, px: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
                    <Box component="img" src={manualTargetImage} alt="current-target" sx={{ width: 72, height: 46, objectFit: "cover", borderRadius: 1.25 }} />
                    <Stack spacing={0.5}>
                      <Typography variant="caption" sx={{ color: "text.primary" }}>
                        現在の編集対象
                      </Typography>
                      <Button
                        size="small"
                        variant="text"
                        onClick={clearCurrentTarget}
                        sx={{ alignSelf: "flex-start", minWidth: 0, px: 0.5, color: "text.primary" }}
                      >
                        解除
                      </Button>
                    </Stack>
                  </Box>
                ) : null}

                <Stack direction="row" spacing={1} alignItems="center">
                  <Tooltip title="画像を添付">
                    <IconButton
                      component="label"
                      sx={{
                        width: 38,
                        height: 38,
                        borderRadius: 2,
                        border: "none",
                        color: "text.primary"
                      }}
                    >
                      <AttachFileRoundedIcon fontSize="small" />
                      <input type="file" accept="image/*" hidden onChange={onAttach} />
                    </IconButton>
                  </Tooltip>

                  <TextField
                    fullWidth
                    variant="standard"
                    multiline
                    minRows={1}
                    maxRows={10}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    onKeyDown={onPromptKeyDown}
                    placeholder="編集指示を入力"
                    InputProps={{ disableUnderline: true }}
                    sx={{
                      "& .MuiInputBase-root": {
                        px: 1,
                        py: 0.75,
                        borderRadius: 2,
                        backgroundColor: "transparent"
                      }
                    }}
                  />

                  <Tooltip title="送信">
                    <span>
                      <IconButton
                        type="submit"
                        color="primary"
                        disabled={!canSend}
                        sx={{
                          width: 40,
                          height: 40,
                          borderRadius: 2,
                          backgroundColor: "transparent",
                          color: "text.primary",
                          "&:hover": {
                            backgroundColor: "rgba(255,255,255,0.06)",
                            color: "text.primary"
                          },
                          "&.Mui-disabled": {
                            backgroundColor: "transparent",
                            color: "action.disabled"
                          }
                        }}
                      >
                        <SendRoundedIcon />
                      </IconButton>
                    </span>
                  </Tooltip>
                </Stack>
              </Paper>
            </Box>
          </Box>

          {error ? (
            <Box sx={{ px: 1.25, pb: 1.25 }}>
              <Alert severity="error">
                {error}
              </Alert>
            </Box>
          ) : null}
        </Paper>

        <Box
          className="side-panel"
          sx={{
            width: { xs: "100%", lg: sessionWidth },
            flexShrink: 0,
            background: "#171717",
            display: "flex",
            flexDirection: "column",
            position: { xs: "static", lg: "sticky" },
            top: 0,
            height: { lg: "100vh" },
            overflow: "auto",
            p: 2
          }}
        >
          {/* ドラッグリサイズハンドル */}
          <Box
            onMouseDown={onSessionResizeStart}
            onTouchStart={onSessionResizeStart}
            sx={{
              position: "absolute",
              left: 0,
              top: 0,
              bottom: 0,
              width: "4px",
              cursor: "col-resize",
              zIndex: 10,
              "&:hover": { background: "rgba(255,255,255,0.15)" },
              transition: "background 0.2s"
            }}
          />
          <Typography sx={{ color: "text.primary", fontWeight: 600, fontSize: "0.82rem", mb: 2, display: "block" }}>
            Session
          </Typography>
          <Stack spacing={1.5}>
            <Typography sx={{ wordBreak: "break-all", fontSize: "0.72rem", color: "text.primary" }}>
              {sessionId}
            </Typography>
            <Button
              variant="text"
              size="small"
              onClick={onSignOut}
              sx={{ justifyContent: "flex-start", color: "text.primary", fontSize: "0.82rem", borderRadius: "10px", "&:hover": { background: "rgba(255,255,255,0.05)" } }}
            >
              ログアウト
            </Button>
            <TextField
              size="small"
              label="Image Model"
              select
              value={modelInput}
              onChange={(e) => setModelInput(e.target.value)}
              sx={{
                "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: "0.85rem" },
                "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                "& .MuiInputBase-root": { background: "rgba(255,255,255,0.06)" },
                "& .MuiInputLabel-root": { color: "text.primary" }
              }}
            >
              {MODEL_OPTIONS.map((option) => (
                <MenuItem key={option} value={option}>
                  {getModelLabel(option)}
                </MenuItem>
              ))}
            </TextField>
            <TextField
              size="small"
              label="System Prompt"
              placeholder="AIへの基本指示を入力（省略可）"
              multiline
              minRows={3}
              maxRows={8}
              value={systemPromptInput}
              onChange={(e) => setSystemPromptInput(e.target.value)}
              sx={{
                "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: "0.85rem" },
                "& .MuiOutlinedInput-notchedOutline": { border: "none" },
                "& .MuiInputBase-root": { background: "rgba(255,255,255,0.06)" },
                "& .MuiInputLabel-root": { color: "text.primary" }
              }}
            />
            <Button
              variant="text"
              size="small"
              startIcon={<RestartAltRoundedIcon />}
              onClick={resetSession}
              sx={{ justifyContent: "flex-start", color: "text.primary", fontSize: "0.82rem", borderRadius: "10px", "&:hover": { background: "rgba(255,255,255,0.05)" } }}
            >
              新規セッション
            </Button>
          </Stack>
        </Box>
      </Stack>

      {/* フルスクリーン画像プレビュー */}
      {Boolean(modalImage) && (
        <Box
          onClick={() => setModalImage("")}
          sx={{
            position: "fixed", inset: 0, zIndex: 1300,
            background: "rgba(0,0,0,0.92)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out"
          }}
        >
          <IconButton
            onClick={(e) => { e.stopPropagation(); const a = document.createElement("a"); a.href = modalImage; a.download = "image.png"; a.click(); }}
            sx={{ position: "fixed", top: 16, right: 112, color: "#fff", background: "rgba(255,255,255,0.1)", "&:hover": { background: "rgba(255,255,255,0.2)" } }}
          >
            <DownloadRoundedIcon />
          </IconButton>
          <IconButton
            onClick={async (e) => { e.stopPropagation(); try { const res = await fetch(modalImage); const blob = await res.blob(); await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]); } catch {} }}
            sx={{ position: "fixed", top: 16, right: 64, color: "#fff", background: "rgba(255,255,255,0.1)", "&:hover": { background: "rgba(255,255,255,0.2)" } }}
          >
            <ContentCopyRoundedIcon />
          </IconButton>
          <IconButton
            onClick={() => setModalImage("")}
            sx={{ position: "fixed", top: 16, right: 16, color: "#fff", background: "rgba(255,255,255,0.1)", "&:hover": { background: "rgba(255,255,255,0.2)" } }}
          >
            <CloseRoundedIcon />
          </IconButton>
          <Box
            component="img"
            src={modalImage}
            alt="zoom"
            onClick={(e) => e.stopPropagation()}
            sx={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: "12px", cursor: "default" }}
          />
        </Box>
      )}

      {compareModal && (
        <Box
          onClick={() => setCompareModal(null)}
          sx={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.95)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {/* 閉じるボタン */}
          <IconButton
            onClick={() => setCompareModal(null)}
            sx={{ position: "fixed", top: 16, right: 16, color: "#fff", background: "rgba(255,255,255,0.1)", "&:hover": { background: "rgba(255,255,255,0.2)" } }}
          >
            <CloseRoundedIcon />
          </IconButton>
          {/* Before/After ラベル（右上） */}
          <Box sx={{ position: "fixed", top: 20, left: "50%", transform: "translateX(-50%)", color: "#fff", fontSize: "0.78rem", fontWeight: 600, letterSpacing: "0.08em", opacity: 0.7, pointerEvents: "none" }}>
            Before / After
          </Box>
          <Box
            ref={sliderContainerRef}
            onClick={(e) => e.stopPropagation()}
            sx={{
              position: "relative",
              width: "90vw",
              maxWidth: "1200px",
              maxHeight: "90vh",
              aspectRatio: compareAspect,
              overflow: "hidden",
              userSelect: "none",
              background: "#000",
              borderRadius: "12px",
              touchAction: "none",
            }}
            onPointerMove={onSliderContainerMove}
            onPointerUp={onSliderContainerUp}
            onPointerLeave={onSliderContainerUp}
          >
            {/* After image */}
            <Box
              component="img"
              src={compareModal.after}
              alt="after"
              draggable={false}
              onLoad={(e) => {
                const { naturalWidth: w, naturalHeight: h } = e.currentTarget;
                if (w && h) setCompareAspect(`${w}/${h}`);
              }}
              sx={{ position: "absolute", inset: 0, width: "100%", height: "100%", objectFit: "contain", display: "block" }}
            />
            {/* Before image with clip */}
            <Box
              component="img"
              src={compareModal.before}
              alt="before"
              draggable={false}
              sx={{
                position: "absolute",
                inset: 0,
                width: "100%",
                height: "100%",
                objectFit: "contain",
                clipPath: `inset(0 ${(100 - sliderPos).toFixed(2)}% 0 0)`,
                display: "block"
              }}
            />
            {/* Before label */}
            <Box sx={{ position: "absolute", top: 12, left: 12, color: "#fff", background: "rgba(0,0,0,0.6)", px: 1.5, py: 0.5, borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", pointerEvents: "none", zIndex: 5 }}>
              Before
            </Box>
            {/* After label */}
            <Box sx={{ position: "absolute", top: 12, right: 12, color: "#fff", background: "rgba(0,0,0,0.6)", px: 1.5, py: 0.5, borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", pointerEvents: "none", zIndex: 5 }}>
              After
            </Box>
            {/* Divider line */}
            <Box sx={{ position: "absolute", top: 0, bottom: 0, left: `${sliderPos}%`, width: "2px", background: "#fff", transform: "translateX(-50%)", pointerEvents: "none", zIndex: 10, boxShadow: "0 0 6px rgba(0,0,0,0.5)" }} />
            {/* Drag handle */}
            <Box
              onPointerDown={onSliderPointerDown}
              sx={{
                position: "absolute",
                top: "50%",
                left: `${sliderPos}%`,
                transform: "translate(-50%, -50%)",
                width: 40,
                height: 40,
                borderRadius: "50%",
                background: "#fff",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                cursor: "ew-resize",
                zIndex: 11,
                boxShadow: "0 2px 14px rgba(0,0,0,0.6)",
                "&:hover": { transform: "translate(-50%, -50%) scale(1.12)", transition: "transform 0.1s" }
              }}
            >
              <CompareArrowsRoundedIcon sx={{ color: "#111", fontSize: 18 }} />
            </Box>
          </Box>
        </Box>
      )}

      <Snackbar
        open={targetNoticeOpen}
        autoHideDuration={1400}
        onClose={() => setTargetNoticeOpen(false)}
        anchorOrigin={{ vertical: "bottom", horizontal: "center" }}
      >
        <Alert severity="success" variant="filled" sx={{ width: "100%" }} onClose={() => setTargetNoticeOpen(false)}>
          編集対象を切り替えました
        </Alert>
      </Snackbar>
    </Box>
  );
}
