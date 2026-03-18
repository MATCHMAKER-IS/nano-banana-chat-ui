import { useEffect, useMemo, useRef, useState } from "react";
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
import RemoveRoundedIcon from "@mui/icons-material/RemoveRounded";
import AddRoundedIcon from "@mui/icons-material/AddRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import ImageSearchRoundedIcon from "@mui/icons-material/ImageSearchRounded";

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

async function callEditApi({ apiBaseUrl, proxyToken, prompt, systemPrompt, imageDataUrl, sessionId, model }) {
  const { mimeType, base64 } = parseDataUrl(imageDataUrl);
  const headers = { "Content-Type": "application/json" };
  if (proxyToken) headers["x-proxy-token"] = proxyToken;

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

  const json = await res.json();
  if (!res.ok) {
    throw new Error(json?.hint || json?.error || JSON.stringify(json?.details || "Request failed"));
  }

  if (!json.editedImageBase64 || !json.mimeType) {
    throw new Error("No image returned from API");
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

function MessageImage({ src, alt, onClick }) {
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      onClick={onClick}
      sx={{
        width: "min(560px, 100%)",
        borderRadius: 1.25,
        border: "none",
        cursor: onClick ? "zoom-in" : "default",
        backgroundColor: "#2a2a2a"
      }}
    />
  );
}

export default function App() {
  const apiBaseUrl = import.meta.env.VITE_API_BASE_URL || "http://127.0.0.1:8787";
  const [proxyTokenInput, setProxyTokenInput] = useState(() => {
    try {
      return localStorage.getItem(PROXY_TOKEN_STORAGE_KEY) || (import.meta.env.VITE_PROXY_TOKEN || "");
    } catch {
      return import.meta.env.VITE_PROXY_TOKEN || "";
    }
  });
  const proxyToken = proxyTokenInput.trim();
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
  const [compareZoom, setCompareZoom] = useState(1);
  const [compareRatios, setCompareRatios] = useState({ before: 1, after: 1 });
  const [compareViewportHeights, setCompareViewportHeights] = useState({ before: 420, after: 420 });
  const [targetNoticeOpen, setTargetNoticeOpen] = useState(false);

  const formRef = useRef(null);
  const endRef = useRef(null);
  const beforeViewportRef = useRef(null);
  const afterViewportRef = useRef(null);
  const compareDragRef = useRef({ active: false, pane: null, pointerId: null, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 });
  const [draggingPane, setDraggingPane] = useState(null);

  useEffect(() => {
    try {
      if (proxyTokenInput) localStorage.setItem(PROXY_TOKEN_STORAGE_KEY, proxyTokenInput);
      else localStorage.removeItem(PROXY_TOKEN_STORAGE_KEY);
    } catch {
      // ignore storage errors
    }
  }, [proxyTokenInput]);

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

  useEffect(() => {
    let active = true;
    if (!compareModal) return undefined;

    (async () => {
      try {
        const [beforeImg, afterImg] = await Promise.all([loadImage(compareModal.before), loadImage(compareModal.after)]);
        if (!active) return;
        const beforeRatio = (beforeImg.naturalWidth || beforeImg.width) / (beforeImg.naturalHeight || beforeImg.height);
        const afterRatio = (afterImg.naturalWidth || afterImg.width) / (afterImg.naturalHeight || afterImg.height);
        setCompareRatios({ before: beforeRatio || 1, after: afterRatio || 1 });
      } catch {
        if (active) setCompareRatios({ before: 1, after: 1 });
      }
    })();

    return () => {
      active = false;
    };
  }, [compareModal]);

  useEffect(() => {
    if (!compareModal) return undefined;
    const id = requestAnimationFrame(() => {
      [beforeViewportRef.current, afterViewportRef.current].forEach((viewport) => {
        if (!viewport) return;
        viewport.scrollLeft = Math.max(0, (viewport.scrollWidth - viewport.clientWidth) / 2);
        viewport.scrollTop = Math.max(0, (viewport.scrollHeight - viewport.clientHeight) / 2);
      });
    });
    return () => cancelAnimationFrame(id);
  }, [compareModal, compareRatios]);

  useEffect(() => {
    if (!compareModal) return undefined;

    const computeHeight = (width, ratio) => {
      const safeRatio = Math.max(0.1, ratio || 1);
      const innerWidth = Math.max(160, width - 16);
      const ideal = innerWidth / safeRatio;
      return clamp(Math.round(ideal), 260, 640);
    };

    const updateHeights = () => {
      const beforeWidth = beforeViewportRef.current?.clientWidth || 0;
      const afterWidth = afterViewportRef.current?.clientWidth || 0;
      if (!beforeWidth && !afterWidth) return;
      setCompareViewportHeights({
        before: computeHeight(beforeWidth, compareRatios.before),
        after: computeHeight(afterWidth, compareRatios.after)
      });
    };

    updateHeights();
    const observer = new ResizeObserver(updateHeights);
    if (beforeViewportRef.current) observer.observe(beforeViewportRef.current);
    if (afterViewportRef.current) observer.observe(afterViewportRef.current);
    window.addEventListener("resize", updateHeights);

    return () => {
      observer.disconnect();
      window.removeEventListener("resize", updateHeights);
    };
  }, [compareModal, compareRatios]);

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

  const onAttach = async (event) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const previewUrl = URL.createObjectURL(file);
    const rawDataUrl = await fileToDataUrl(file);
    const dataUrl = await shrinkDataUrlIfNeeded(rawDataUrl);

    setPendingAttachment((prev) => {
      if (prev?.previewUrl) URL.revokeObjectURL(prev.previewUrl);
      return { fileName: file.name, previewUrl, dataUrl };
    });
    setError("");
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
    setCompareZoom(1);
    setCompareRatios({ before: 1, after: 1 });
    setCompareModal({ before, after });
  };

  const getCompareViewport = (pane) => (pane === "before" ? beforeViewportRef.current : afterViewportRef.current);

  const onComparePointerDown = (pane, event) => {
    if (event.button !== 0) return;
    const viewport = getCompareViewport(pane);
    if (!viewport) return;

    viewport.setPointerCapture(event.pointerId);
    compareDragRef.current = {
      active: true,
      pane,
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      scrollLeft: viewport.scrollLeft,
      scrollTop: viewport.scrollTop
    };
    setDraggingPane(pane);
    event.preventDefault();
  };

  const onComparePointerMove = (pane, event) => {
    const drag = compareDragRef.current;
    if (!drag.active || drag.pane !== pane || drag.pointerId !== event.pointerId) return;
    const viewport = getCompareViewport(pane);
    if (!viewport) return;

    const dx = event.clientX - drag.startX;
    const dy = event.clientY - drag.startY;
    viewport.scrollLeft = drag.scrollLeft - dx;
    viewport.scrollTop = drag.scrollTop - dy;
  };

  const onComparePointerUp = (pane, event) => {
    const drag = compareDragRef.current;
    if (!drag.active || drag.pane !== pane || drag.pointerId !== event.pointerId) return;
    const viewport = getCompareViewport(pane);
    if (viewport?.hasPointerCapture(event.pointerId)) {
      viewport.releasePointerCapture(event.pointerId);
    }
    compareDragRef.current = { active: false, pane: null, pointerId: null, startX: 0, startY: 0, scrollLeft: 0, scrollTop: 0 };
    setDraggingPane(null);
  };

  useEffect(() => {
    if (!compareModal) return undefined;
    const beforeViewport = beforeViewportRef.current;
    const afterViewport = afterViewportRef.current;
    const handler = (event) => {
      event.preventDefault();
      event.stopPropagation();
    };

    beforeViewport?.addEventListener("wheel", handler, { passive: false });
    afterViewport?.addEventListener("wheel", handler, { passive: false });

    return () => {
      beforeViewport?.removeEventListener("wheel", handler);
      afterViewport?.removeEventListener("wheel", handler);
    };
  }, [compareModal]);

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
        proxyToken,
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
      const message = err instanceof Error ? err.message : String(err);
      setError(message.includes("gemini_timeout") ? "応答がタイムアウトしました。サイズを下げるか、時間をおいて再試行してください。" : message);
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
      <Stack direction={{ xs: "column", lg: "row" }} spacing={1.5} sx={{ height: "100%", position: "relative", zIndex: 1 }}>
        <Paper
          elevation={0}
          className="chat-panel"
          sx={{
            flex: 1,
            display: "flex",
            flexDirection: "column",
            minHeight: 0
          }}
        >
          <Box sx={{ px: 2.5, pt: 2.25, pb: 1.5 }}>
            <Typography variant="h4" sx={{ fontSize: { xs: 22, md: 26 }, fontWeight: 700, letterSpacing: "0.01em" }}>
              Nano Banana Chat UI
            </Typography>
            {/* 意図的に簡素化: 説明テキストは表示しない */}
          </Box>

          {null}

          {hasMessages ? (
            <Box sx={{ p: 2, overflow: "auto", display: "grid", gap: 1.5, alignContent: "start", flex: 1, minHeight: 0 }}>
              {messages.map((m) => (
                <Box key={m.id} sx={{ display: "flex", justifyContent: m.role === "assistant" ? "flex-start" : "flex-end" }}>
                  {/** 直前生成画像を参照するだけのユーザー発話では、重複プレビューを出さない */}
                  {(() => {
                    const hideUserPreview = m.role === "user" && m.attachmentName === "直前の生成画像";
                    const showMessageImage = Boolean(m.image) && !hideUserPreview;
                    return (
                  <Paper
                    elevation={0}
                    sx={{
                      width: "fit-content",
                      maxWidth: "min(860px, 88%)",
                      p: 1.25,
                      borderRadius: 2,
                      border: m.error ? "1px solid" : "none",
                      borderColor: m.error ? "error.main" : "transparent",
                      background:
                        m.role === "assistant"
                          ? "transparent"
                          : "rgba(57,57,57,0.96)"
                    }}
                  >
                    <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 600 }}>
                      {m.role === "assistant" ? "AI" : "YOU"}
                    </Typography>
                    <Typography variant="body2" sx={{ mt: 0.5, whiteSpace: "pre-wrap", lineHeight: 1.65 }}>
                      {m.text}
                    </Typography>

                    {showMessageImage ? (
                      <Stack spacing={1} sx={{ mt: 1 }}>
                        <MessageImage src={m.image} alt="message" onClick={() => setModalImage(m.image)} />
                        <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                          <Button size="small" variant="text" onClick={() => setAsCurrentTarget(m.image)}>
                            {!pendingAttachment && manualTargetImage === m.image ? "編集中" : "編集対象にする"}
                          </Button>
                          {m.role === "assistant" && m.beforeImage ? (
                            <Button
                              size="small"
                              variant="text"
                              startIcon={<CompareArrowsRoundedIcon />}
                              onClick={() => openCompare(m.beforeImage, m.image)}
                            >
                              比較表示
                            </Button>
                          ) : null}
                          <Button
                            size="small"
                            variant="text"
                            startIcon={<DownloadRoundedIcon />}
                            onClick={() => downloadDataUrl(m.image, "edited-image.png")}
                          >
                            保存
                          </Button>
                        </Stack>
                      </Stack>
                    ) : null}

                    {m.attachmentName ? (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "block" }}>
                        添付: {m.attachmentName}
                      </Typography>
                    ) : null}

                    {m.pending ? (
                      <Typography variant="caption" color="text.secondary" sx={{ mt: 1, display: "inline-flex", alignItems: "center" }}>
                        <Box component="span" className="thinking-text">
                          生成中
                        </Box>
                      </Typography>
                    ) : null}
                  </Paper>
                    );
                  })()}
                </Box>
              ))}
              <Box ref={endRef} />
            </Box>
          ) : null}

          <Box sx={{ mt: "auto" }}>
            {null}

            <Box component="form" ref={formRef} onSubmit={onSubmit} sx={{ p: 1.25 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 0.9,
                  borderRadius: 3,
                  border: "none",
                  backgroundColor: "rgba(38, 38, 38, 0.88)"
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
                      <Typography variant="caption" color="text.secondary" sx={{ maxWidth: 260 }} noWrap>
                        {pendingAttachment.fileName}
                      </Typography>
                      <Button size="small" variant="text" color="inherit" onClick={clearAttachment} sx={{ alignSelf: "flex-start", minWidth: 0, px: 0.5 }}>
                        削除
                      </Button>
                    </Stack>
                  </Box>
                ) : null}

                {!pendingAttachment && manualTargetImage ? (
                  <Box sx={{ mb: 1, px: 0.5, display: "flex", alignItems: "center", gap: 1 }}>
                    <Box component="img" src={manualTargetImage} alt="current-target" sx={{ width: 72, height: 46, objectFit: "cover", borderRadius: 1.25 }} />
                    <Stack spacing={0.5}>
                      <Typography variant="caption" color="text.secondary">
                        現在の編集対象
                      </Typography>
                      <Button
                        size="small"
                        variant="text"
                        color="inherit"
                        onClick={clearCurrentTarget}
                        sx={{ alignSelf: "flex-start", minWidth: 0, px: 0.5 }}
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
                        color: "text.secondary"
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
                          color: "text.secondary",
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

        <Paper
          elevation={0}
          className="side-panel"
          sx={{
            width: { xs: "100%", lg: 304 },
            p: 1.25,
            position: { xs: "static", lg: "sticky" },
            top: { lg: 12 },
            alignSelf: { lg: "flex-start" },
            maxHeight: { lg: "calc(100vh - 24px)" },
            overflow: { lg: "auto" }
          }}
        >
          <Card elevation={0} sx={{ borderRadius: 2, border: "none", backgroundColor: "rgba(46,46,46,0.86)" }}>
            <CardContent>
              <Stack spacing={1}>
                <Typography variant="subtitle1" sx={{ fontWeight: 700 }}>
                  Session
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                  {sessionId}
                </Typography>
                <Typography variant="caption" color="text.secondary" sx={{ wordBreak: "break-all" }}>
                  {apiBaseUrl}
                </Typography>
                <TextField
                  size="small"
                  type="password"
                  label="Access Token"
                  placeholder="x-proxy-token"
                  value={proxyTokenInput}
                  onChange={(e) => setProxyTokenInput(e.target.value)}
                  autoComplete="off"
                />
                <TextField
                  size="small"
                  label="Image Model"
                  select
                  value={modelInput}
                  onChange={(e) => setModelInput(e.target.value)}
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
                />
                <Button variant="text" size="small" startIcon={<RestartAltRoundedIcon />} onClick={resetSession}>
                  新規セッション
                </Button>
              </Stack>
            </CardContent>
          </Card>
        </Paper>
      </Stack>

      <Dialog open={Boolean(modalImage)} onClose={() => setModalImage("")} maxWidth="xl">
        <DialogTitle sx={{ pr: 6 }}>
          Preview
          <IconButton onClick={() => setModalImage("")} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          {modalImage ? <Box component="img" src={modalImage} alt="zoom" sx={{ maxWidth: "90vw", maxHeight: "80vh", borderRadius: 0 }} /> : null}
        </DialogContent>
      </Dialog>

      <Dialog open={Boolean(compareModal)} onClose={() => setCompareModal(null)} fullWidth maxWidth="xl">
        <DialogTitle sx={{ pr: 6 }}>
          Before / After
          <IconButton onClick={() => setCompareModal(null)} sx={{ position: "absolute", right: 8, top: 8 }}>
            <CloseRoundedIcon />
          </IconButton>
        </DialogTitle>
        <DialogContent>
          <Stack direction="row" spacing={1} sx={{ mb: 1.2, alignItems: "center", flexWrap: "wrap" }}>
            <Chip label={`${Math.round(compareZoom * 100)}%`} size="small" />
            <Button size="small" variant="text" startIcon={<RemoveRoundedIcon />} onClick={() => setCompareZoom((z) => clamp(z - 0.25, 1, 4))}>
              縮小
            </Button>
            <Button size="small" variant="text" startIcon={<AddRoundedIcon />} onClick={() => setCompareZoom((z) => clamp(z + 0.25, 1, 4))}>
              拡大
            </Button>
            <Button size="small" variant="text" onClick={() => setCompareZoom(1)}>
              リセット
            </Button>
          </Stack>

          <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.6, display: "flex", alignItems: "center", gap: 0.5 }}>
                <ImageSearchRoundedIcon fontSize="small" /> 編集前
              </Typography>
              <Box
                ref={beforeViewportRef}
                className={`compare-viewport ${draggingPane === "before" ? "dragging" : ""}`}
                onPointerDown={(event) => onComparePointerDown("before", event)}
                onPointerMove={(event) => onComparePointerMove("before", event)}
                onPointerUp={(event) => onComparePointerUp("before", event)}
                onPointerCancel={(event) => onComparePointerUp("before", event)}
                sx={{ touchAction: "none", overscrollBehavior: "contain", height: compareViewportHeights.before }}
              >
                {compareModal ? (
                  <Box
                    component="img"
                    src={compareModal.before}
                    alt="before"
                    draggable={false}
                    sx={
                      compareRatios.before < 1
                        ? {
                            height: `${Math.round(compareZoom * 100)}%`,
                            width: "auto",
                            maxWidth: "none",
                            maxHeight: "none",
                            borderRadius: 0,
                            userSelect: "none",
                            display: "block"
                          }
                        : {
                            width: `${Math.round(compareZoom * 100)}%`,
                            height: "auto",
                            maxWidth: "none",
                            maxHeight: "none",
                            borderRadius: 0,
                            userSelect: "none",
                            display: "block"
                          }
                    }
                  />
                ) : null}
              </Box>
            </Box>

            <Box sx={{ flex: 1, minWidth: 0 }}>
              <Typography variant="subtitle2" sx={{ mb: 0.6, display: "flex", alignItems: "center", gap: 0.5 }}>
                <SendRoundedIcon fontSize="small" /> 編集後
              </Typography>
              <Box
                ref={afterViewportRef}
                className={`compare-viewport ${draggingPane === "after" ? "dragging" : ""}`}
                onPointerDown={(event) => onComparePointerDown("after", event)}
                onPointerMove={(event) => onComparePointerMove("after", event)}
                onPointerUp={(event) => onComparePointerUp("after", event)}
                onPointerCancel={(event) => onComparePointerUp("after", event)}
                sx={{ touchAction: "none", overscrollBehavior: "contain", height: compareViewportHeights.after }}
              >
                {compareModal ? (
                  <Box
                    component="img"
                    src={compareModal.after}
                    alt="after"
                    draggable={false}
                    sx={
                      compareRatios.after < 1
                        ? {
                            height: `${Math.round(compareZoom * 100)}%`,
                            width: "auto",
                            maxWidth: "none",
                            maxHeight: "none",
                            borderRadius: 0,
                            userSelect: "none",
                            display: "block"
                          }
                        : {
                            width: `${Math.round(compareZoom * 100)}%`,
                            height: "auto",
                            maxWidth: "none",
                            maxHeight: "none",
                            borderRadius: 0,
                            userSelect: "none",
                            display: "block"
                          }
                    }
                  />
                ) : null}
              </Box>
            </Box>
          </Stack>
        </DialogContent>
      </Dialog>

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
