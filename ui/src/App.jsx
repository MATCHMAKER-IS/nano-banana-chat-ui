import { useEffect, useMemo, useRef, useState } from "react";
import { getIdToken, getUserInfo } from "./auth";
import {
  Alert,
  Box,
  Button,
  Card,
  CardContent,
  Chip,
  CircularProgress,
  Dialog,
  DialogActions,
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
import AddPhotoAlternateRoundedIcon from "@mui/icons-material/AddPhotoAlternateRounded";
import CloseRoundedIcon from "@mui/icons-material/CloseRounded";
import DownloadRoundedIcon from "@mui/icons-material/DownloadRounded";
import RestartAltRoundedIcon from "@mui/icons-material/RestartAltRounded";
import SendRoundedIcon from "@mui/icons-material/SendRounded";
import CompareArrowsRoundedIcon from "@mui/icons-material/CompareArrowsRounded";
import ContentCopyRoundedIcon from "@mui/icons-material/ContentCopyRounded";
import MailOutlineRoundedIcon from "@mui/icons-material/MailOutlineRounded";
import OpenInNewRoundedIcon from "@mui/icons-material/OpenInNewRounded";
import MenuBookRoundedIcon from "@mui/icons-material/MenuBookRounded";
import logoBanana from "./assets/logo-banana.png";
import stepPhoto from "./assets/step-photo.png";
import stepPrompt from "./assets/step-prompt.png";
import stepResult from "./assets/step-result.png";
import uploadIllustration from "./assets/upload-illustration.png";

const PSEUDO_STEPS = ["画像を読み込み中", "編集内容を解析中", "編集リクエストを送信中", "画像を生成中", "最終調整中"];
const PROXY_TOKEN_STORAGE_KEY = "nano_banana_proxy_token";
const MODEL_STORAGE_KEY = "nano_banana_model";
const SYSTEM_PROMPT_STORAGE_KEY = "nano_banana_system_prompt";
const DEFAULT_MODEL = import.meta.env.VITE_DEFAULT_MODEL || "gemini-2.5-flash-image";
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
const STEP_GUIDES = [
  { no: 1, title: "写真を入れる", detail: "ドラッグ&ドロップ、またはアップロード", image: stepPhoto },
  { no: 2, title: "変えたいことを書く", detail: "例: 背景を青空にしてください", image: stepPrompt },
  { no: 3, title: "完成を見る", detail: "保存や比較もワンクリック", image: stepResult }
];
const QUICK_PROMPT_CHIPS = [
  "ムーディーな部屋にして",
  "背景をお花畑にして",
  "海外のおしゃれな街並みにして",
  "背景をホテルのロビーにして",
  "背景を夜景の見えるバーにして",
  "背景を海辺のリゾートにして",
  "背景を緑の多い公園にして",
  "背景をカフェテラスにして",
  "背景を白基調の上品な室内にして",
  "背景を自然光の入るラウンジにして"
];
const DEFAULT_SYSTEM_PROMPT = `# Subject Preservation Rules

When editing any image, strictly follow these rules at all times:

## MUST PRESERVE (Do not change under any circumstances)
- Subject's facial geometry (face shape, eye spacing, nose width, jawline, chin)
- Facial expression and micro-expressions
- Eye color, hair length, and hair color
- Pose and body position
- Composition and framing (no cropping or reframing)
- Skin tone and undertones
- Natural asymmetry and individual characteristics

## PROHIBITED CHANGES
- No face morphing or reshaping
- No beautification or idealization
- No age alteration
- No smoothing that removes natural texture
- No style drift or reinterpretation of facial features
- No changes to composition or camera angle

## EDIT SCOPE
- Apply changes ONLY to explicitly requested elements
- When in doubt, do less — preserve over interpret
- Treat the uploaded image as the identity anchor`;

function getModelLabel(modelId) {
  return MODEL_LABELS[modelId] || modelId;
}

function parseDataUrl(dataUrl) {
  const match = dataUrl.match(/^data:(.+?);base64,(.+)$/);
  if (!match) throw new Error("画像データの形式が正しくありません。");
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
      throw new Error("サーバーが応答できませんでした。しばらく待ってから再試行してください。解決しない場合は情シス曾根崎までお知らせください。");
    }
    if (res.status === 504) {
      throw new Error("処理がタイムアウトしました。画像サイズを小さくして再試行してください。それでも解決しない場合は情シス曾根崎までお知らせください。");
    }
    throw new Error(`サーバーから予期しない応答がありました。情シス曾根崎までお知らせください。（ステータス: ${res.status}）`);
  }

  if (!res.ok) {
    const errorCode = json?.error;
    if (errorCode === "gemini_request_failed") {
      throw new Error("AIモデルが応答しませんでした。右のImage Modelを別のモデルに切り替えて再試行してください。解決しない場合は情シス曾根崎までお知らせください。");
    }
    if (errorCode === "no_image_part") {
      throw new Error("AIが画像を生成できませんでした。プロンプトに不適切な表現が含まれている可能性があります。指示の内容を変えて再試行してください。");
    }
    if (errorCode === "image_required") {
      throw new Error("画像が添付されていません。左下の📎ボタンをクリックするか、画像ファイルをチャット欄にドラッグ＆ドロップして添付してから送信してください。");
    }
    if (res.status === 401 || res.status === 403) {
      throw new Error("認証エラーが発生しました。一度ログアウトして再ログインしてください。それでも解決しない場合は情シス曾根崎までお知らせください。");
    }
    throw new Error(json?.hint || json?.error || "リクエストが失敗しました。再試行してください。解決しない場合は情シス曾根崎までお知らせください。");
  }

  if (!json.editedImageBase64 || !json.mimeType) {
    throw new Error("AIが画像を返しませんでした。指示が曖昧すぎる場合や、AIが対応できない編集内容の場合に発生します。プロンプトをより具体的に書き直して再試行してください。");
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
  const generatedMaxWidth = "min(320px, 100%)";
  const generatedMaxHeight = "min(42vh, 360px)";
  return (
    <Box
      component="img"
      src={src}
      alt={alt}
      onClick={onClick}
      sx={{
        width: isThumb ? "110px" : "auto",
        height: isThumb ? "110px" : "auto",
        maxWidth: isThumb ? "110px" : generatedMaxWidth,
        maxHeight: isThumb ? "110px" : generatedMaxHeight,
        objectFit: isThumb ? "cover" : "contain",
        borderRadius: isThumb ? "12px" : 1.25,
        border: "none",
        cursor: onClick ? "zoom-in" : "default",
        backgroundColor: "#f2e7d9",
        animation: "imgReveal 0.4s ease-out",
        "@keyframes imgReveal": {
          from: { opacity: 0, transform: "scale(0.96)" },
          to:   { opacity: 1, transform: "scale(1)" }
        }
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
      const stored = localStorage.getItem(SYSTEM_PROMPT_STORAGE_KEY);
      return stored === null ? DEFAULT_SYSTEM_PROMPT : stored;
    } catch {
      return DEFAULT_SYSTEM_PROMPT;
    }
  });

  useEffect(() => {
    try {
      localStorage.setItem(SYSTEM_PROMPT_STORAGE_KEY, systemPromptInput);
    } catch {
      // ignore storage errors
    }
  }, [systemPromptInput]);

  const [sessionId, setSessionId] = useState(() => crypto.randomUUID());
  const [messages, setMessages] = useState([]);

  // フィードバック
  const [feedbackOpen, setFeedbackOpen] = useState(false);
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackSending, setFeedbackSending] = useState(false);
  const [feedbackDone, setFeedbackDone] = useState(false);

  const sendFeedback = async () => {
    if (!feedbackMessage.trim()) return;
    setFeedbackSending(true);
    try {
      const userInfo = getUserInfo();
      await fetch(`${apiBaseUrl}/feedback`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: feedbackMessage, userEmail: userInfo?.email || "" }),
      });
      setFeedbackDone(true);
      setFeedbackMessage("");
      setTimeout(() => {
        setFeedbackOpen(false);
      }, 1500);
    } catch {
      // エラーは無視（送信失敗でもUIを止めない）
    } finally {
      setFeedbackSending(false);
    }
  };
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
  const beforeImgRef = useRef(null);
  const dividerRef = useRef(null);
  const handleRef = useRef(null);
  const [compareAspect, setCompareAspect] = useState("16/9");
  const [targetNoticeOpen, setTargetNoticeOpen] = useState(false);
  const [sessionWidth, setSessionWidth] = useState(300);

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

  // メッセージ追加・更新時に自動スクロール
  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "instant" });
  }, [messages]);

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
  const currentUser = getUserInfo();

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
    const img = new Image();
    img.onload = () => {
      if (img.naturalWidth && img.naturalHeight) {
        setCompareAspect(`${img.naturalWidth}/${img.naturalHeight}`);
      } else {
        setCompareAspect("4/3");
      }
      setCompareModal({ before, after });
    };
    img.src = after;
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
    // DOM直接更新でReact再レンダリングを回避
    if (beforeImgRef.current) beforeImgRef.current.style.clipPath = `inset(0 ${(100 - pos).toFixed(2)}% 0 0)`;
    if (dividerRef.current) dividerRef.current.style.left = `${pos}%`;
    if (handleRef.current) handleRef.current.style.left = `${pos}%`;
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
        message = "応答がタイムアウトしました。画像サイズを小さくして再試行してください。それでも解決しない場合は情シス曾根崎までお知らせください。";
      } else if (message.includes("Failed to fetch") || message.includes("NetworkError")) {
        message = "ネットワークエラーが発生しました。インターネット接続を確認して再試行してください。解決しない場合は情シス曾根崎までお知らせください。";
      } else if (message.includes("Unexpected token") || message.includes("is not valid JSON")) {
        message = "サーバーから予期しない応答がありました。時間をおいて再試行してください。解決しない場合は情シス曾根崎までお知らせください。";
      }
      setMessages((prev) => prev.map((m) => (m.id === assistantId ? { ...m, pending: false, text: message, error: true } : m)));
    } finally {
      setLoading(false);
      setElapsedMs(0);
    }
  };

  const onPromptKeyDown = (event) => {
    // Enterキーでの送信を無効化（送信ボタンのみ）
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
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
              background: "rgba(255, 233, 214, 0.55)",
              border: "2px dashed rgba(222, 147, 106, 0.7)",
              borderRadius: "24px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              pointerEvents: "none",
              backdropFilter: "blur(2px)"
            }}>
              <Typography sx={{ color: "text.primary", fontSize: "1.1rem", fontWeight: 700, opacity: 0.95 }}>
                画像をドロップして追加
              </Typography>
            </Box>
          )}
          <Box sx={{ px: 3, pt: 3, pb: 1.5 }}>
            <Stack direction="row" spacing={1.25} alignItems="center">
              <Box
                component="img"
                src={logoBanana}
                alt="バナナ写真スタジオ ロゴ"
                loading="eager"
                sx={{ width: 50, height: 50, objectFit: "contain", borderRadius: "12px" }}
              />
              <Box>
                <Typography variant="h4" sx={{ fontSize: { xs: 22, md: 27 }, fontWeight: 800, letterSpacing: "-0.01em", color: "text.primary" }}>
                  バナナ写真スタジオ
                </Typography>
                <Typography sx={{ mt: 0.25, color: "text.secondary", fontSize: "0.86rem" }}>
                  画像を入れて、文章でお願いするだけ。やさしい写真編集ツールです。
                </Typography>
              </Box>
            </Stack>
          </Box>

          {!hasMessages && (
            <Box sx={{
              flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center",
              px: 3, pb: 3,
              animation: "fadeIn 0.4s ease-out", "@keyframes fadeIn": { from: { opacity: 0 }, to: { opacity: 1 } }
            }}>
              <Card
                elevation={0}
                sx={{
                  width: "100%",
                  maxWidth: 760,
                  borderRadius: "26px",
                  border: "1px solid rgba(172,126,100,0.22)",
                  background: "linear-gradient(180deg, rgba(255,252,246,0.95), rgba(255,246,233,0.95))",
                  boxShadow: "0 12px 24px rgba(139,102,73,0.14)"
                }}
              >
                <CardContent sx={{ p: { xs: 2, md: 3 } }}>
                  <Typography sx={{ fontSize: "1rem", fontWeight: 800, color: "text.primary", mb: 2 }}>
                    3ステップで編集
                  </Typography>
                  <Stack direction={{ xs: "column", md: "row" }} spacing={1.2}>
                    {STEP_GUIDES.map((step) => (
                      <Box
                        key={step.no}
                        sx={{
                          flex: 1,
                          p: 1,
                          borderRadius: "16px",
                          background: "#fffaf3",
                          border: "1px solid rgba(210,164,136,0.4)"
                        }}
                      >
                        <Box
                          component="img"
                          src={step.image}
                          alt={`${step.title}のイラスト`}
                          loading="lazy"
                          sx={{ width: 46, height: 46, objectFit: "contain", mb: 0.45 }}
                        />
                        <Typography sx={{ fontSize: "0.72rem", color: "text.secondary", mb: 0.3 }}>STEP {step.no}</Typography>
                        <Typography sx={{ fontSize: "0.93rem", fontWeight: 700, color: "text.primary", mb: 0.25 }}>{step.title}</Typography>
                        <Typography sx={{ fontSize: "0.76rem", color: "text.secondary", lineHeight: 1.55 }}>{step.detail}</Typography>
                      </Box>
                    ))}
                  </Stack>
                  <Box
                    sx={{
                      mt: 1.6,
                      p: { xs: 1.5, md: 1.8 },
                      borderRadius: "20px",
                      border: "2px dashed rgba(224,145,102,0.7)",
                      background: "rgba(255, 236, 221, 0.5)",
                      display: "grid",
                      placeItems: "center",
                      gap: 1.3
                    }}
                  >
                    <Box
                      component="img"
                      src={uploadIllustration}
                      alt="アップロードガイド"
                      loading="lazy"
                      sx={{ width: "min(170px, 45%)", maxWidth: "170px", objectFit: "contain", opacity: 0.95 }}
                    />
                    <Typography sx={{ fontSize: "0.94rem", color: "text.primary", fontWeight: 700 }}>
                      ここに写真をドラッグ
                    </Typography>
                    <Button
                      component="label"
                      variant="contained"
                      sx={{
                        px: 5,
                        py: 1.1,
                        borderRadius: "999px",
                        fontSize: "1.02rem",
                        boxShadow: "none",
                        "&:hover": { boxShadow: "none", backgroundColor: "primary.dark" }
                      }}
                    >
                      写真をアップロード
                      <input type="file" accept="image/*" hidden onChange={onAttach} />
                    </Button>
                  </Box>
                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap" sx={{ mt: 1.6 }}>
                    {QUICK_PROMPT_CHIPS.map((sample) => (
                      <Chip
                        key={sample}
                        label={sample}
                        onClick={() => setPrompt((prev) => (prev ? `${prev} ${sample}` : sample))}
                        sx={{
                          background: "#ffe4d4",
                          color: "#875744",
                          border: "1px solid rgba(216, 136, 98, 0.34)",
                          "&:hover": { background: "#ffd7bf" }
                        }}
                      />
                    ))}
                  </Stack>
                </CardContent>
              </Card>
            </Box>
          )}

          {hasMessages ? (
            <Box sx={{ p: 2, overflow: "auto", display: "grid", gap: 1.5, alignContent: "start", flex: 1, minHeight: 0 }}>
              {messages.map((m) => (
                <Box key={m.id} sx={{ display: "flex", flexDirection: "column", alignItems: m.role === "assistant" ? "flex-start" : "flex-end", gap: 0.75, animation: "msgIn 0.25s ease-out", "@keyframes msgIn": { from: { opacity: 0, transform: "translateY(8px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>
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
                            border: m.role === "assistant" ? "none" : "1px solid rgba(217, 149, 109, 0.28)",
                            background: m.role === "assistant" ? "transparent" : "#ffe7d6"
                          }}
                        >
                          {m.role === "assistant" && (
                            <Typography variant="caption" sx={{ color: "text.secondary", fontWeight: 700, fontSize: "0.7rem", letterSpacing: "0.08em", display: "block", mb: 0.75 }}>
                              AIアシスタント
                            </Typography>
                          )}
                          {m.text && !m.pending ? (
                            <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", lineHeight: 1.7, fontSize: "0.9375rem" }}>
                              {m.text}
                            </Typography>
                          ) : null}

                          {/* アシスタントメッセージの画像 */}
                          {m.role === "assistant" && showMessageImage ? (
                            <Stack spacing={1} sx={{ mt: 1 }}>
                              <MessageImage src={m.image} alt="message" onClick={() => setModalImage(m.image)} />
                              {!m.pending && (
                                <Stack spacing={0.75} sx={{ animation: "fadeIn 0.3s ease-out 0.2s both", "@keyframes fadeIn": { from: { opacity: 0 }, to: { opacity: 1 } } }}>
                                  <Stack direction="row" spacing={1} useFlexGap flexWrap="wrap">
                                    {m.beforeImage && m.image ? (
                                      <Button size="small" variant="text" startIcon={<CompareArrowsRoundedIcon />} onClick={() => openCompare(m.beforeImage, m.image)}>
                                        編集前後を比較
                                      </Button>
                                    ) : null}
                                    <Button size="small" variant="text" startIcon={<DownloadRoundedIcon />} onClick={() => downloadDataUrl(m.image, "edited-image.png")}>
                                      保存
                                    </Button>
                                  </Stack>
                                  <Typography sx={{ fontSize: "0.75rem", color: "text.secondary", pl: 0.5 }}>
                                    続けて指示を入力すると、この画像をさらに編集できます
                                  </Typography>
                                </Stack>
                              )}
                            </Stack>
                          ) : null}

                          {m.pending ? (
                            <Box sx={{ mt: 0.5, animation: "fadeSlideIn 0.3s ease-out", "@keyframes fadeSlideIn": { from: { opacity: 0, transform: "translateY(6px)" }, to: { opacity: 1, transform: "translateY(0)" } } }}>
                              <Box component="span" className="thinking-text" sx={{ fontSize: "0.9375rem", color: "text.primary" }}>生成中</Box>
                            </Box>
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

            <Box component="form" ref={formRef} onSubmit={onSubmit} sx={{ px: 2, pb: 0.5, pt: 1 }}>
              <Paper
                elevation={0}
                sx={{
                  p: 1.2,
                  borderRadius: "20px",
                  border: "1px solid rgba(180,131,102,0.28)",
                  backgroundColor: "#fff7ee",
                  boxShadow: "0 8px 18px rgba(121, 90, 68, 0.1)"
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
                      border: "1px solid rgba(194, 140, 108, 0.24)",
                      backgroundColor: "#fff1e5",
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
                  <Tooltip title="画像を添付（クリックまたはドラッグ）">
                    <IconButton
                      component="label"
                      sx={{
                        width: 38,
                        height: 38,
                        borderRadius: "12px",
                        border: "1px solid rgba(194, 140, 108, 0.28)",
                        color: "text.primary",
                        background: "#ffe9d9",
                        "&:hover": { background: "#ffddc6" }
                      }}
                    >
                      <AddPhotoAlternateRoundedIcon fontSize="small" />
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
                    placeholder="画像を添付またはドラッグしてから編集指示を入力（例：背景を青空にしてください）"
                    InputProps={{ disableUnderline: true }}
                    sx={{
                      "& .MuiInputBase-root": {
                        px: 1,
                        py: 0.75,
                        borderRadius: 2,
                        backgroundColor: "#fffdf9"
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
                          borderRadius: "12px",
                          backgroundColor: "primary.main",
                          color: "primary.contrastText",
                          "&:hover": {
                            backgroundColor: "primary.dark",
                            color: "primary.contrastText"
                          },
                          "&.Mui-disabled": {
                            backgroundColor: "rgba(180, 168, 157, 0.5)",
                            color: "rgba(255,255,255,0.8)"
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

            {/* ベータ版フッター */}
            <Box sx={{ textAlign: "center", pt: 0.25, pb: 0.5 }}>
              <Typography sx={{ fontSize: "0.72rem", color: "text.secondary" }}>
                このツールはベータ版です。改善要望は
                <Box
                  component="span"
                  onClick={() => setFeedbackOpen(true)}
                  sx={{ cursor: "pointer", textDecoration: "underline", "&:hover": { opacity: 0.7 } }}
                >
                  こちらから
                </Box>
              </Typography>
            </Box>
          </Box>

        </Paper>

        <Box
          className="side-panel"
          sx={{
            width: { xs: "100%", lg: sessionWidth },
            flexShrink: 0,
            background: "linear-gradient(180deg, #fffaf2 0%, #fff1e2 100%)",
            border: "1px solid rgba(173, 132, 108, 0.2)",
            boxShadow: "0 12px 24px rgba(131, 90, 68, 0.1)",
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
              "&:hover": { background: "rgba(165, 116, 84, 0.18)" },
              transition: "background 0.2s"
            }}
          />
          <Stack spacing={1.4} sx={{ flex: 1, minHeight: 0, height: "100%" }}>
            <Box sx={{ p: 1.2, borderRadius: "16px", background: "#fff8ef", border: "1px solid rgba(171,130,102,0.24)" }}>
              <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: "text.primary", mb: 0.7 }}>はじめての方へ</Typography>
              <Stack spacing={0.45}>
                <Box
                  component="a"
                  href="https://connect.zoho.com/portal/ecl/manual/fromit/article/nano-banana-webui"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    px: 0.8, py: 0.6, borderRadius: "10px", textDecoration: "none", color: "text.primary",
                    background: "rgba(255, 235, 219, 0.75)", "&:hover": { background: "rgba(255, 226, 202, 0.9)" }
                  }}
                >
                  <Stack direction="row" spacing={0.7} alignItems="center">
                    <MenuBookRoundedIcon sx={{ fontSize: "0.95rem" }} />
                    <Typography sx={{ fontSize: "0.8rem", fontWeight: 600 }}>操作マニュアル</Typography>
                  </Stack>
                  <OpenInNewRoundedIcon sx={{ fontSize: "0.9rem", opacity: 0.7 }} />
                </Box>
                <Box
                  component="a"
                  href="https://connect.zoho.com/portal/ecl/manual/ladyinterview/article/kakourule"
                  target="_blank"
                  rel="noopener noreferrer"
                  sx={{
                    display: "flex", alignItems: "center", justifyContent: "space-between",
                    px: 0.8, py: 0.6, borderRadius: "10px", textDecoration: "none", color: "text.primary",
                    background: "rgba(255, 235, 219, 0.75)", "&:hover": { background: "rgba(255, 226, 202, 0.9)" }
                  }}
                >
                  <Stack direction="row" spacing={0.7} alignItems="center">
                    <MenuBookRoundedIcon sx={{ fontSize: "0.95rem" }} />
                    <Typography sx={{ fontSize: "0.8rem", fontWeight: 600 }}>写真加工のルール</Typography>
                  </Stack>
                  <OpenInNewRoundedIcon sx={{ fontSize: "0.9rem", opacity: 0.7 }} />
                </Box>
              </Stack>
            </Box>

            <Box sx={{ p: 1.2, borderRadius: "16px", background: "#fff8ef", border: "1px solid rgba(171,130,102,0.24)" }}>
              <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: "text.primary", mb: 0.8 }}>AIの設定</Typography>
              <TextField
                fullWidth
                size="small"
                label="つかうAI"
                select
                value={modelInput}
                onChange={(e) => setModelInput(e.target.value)}
                helperText="通常はNano BananaのままでOKです"
                sx={{
                  mb: 1,
                  "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: "0.85rem" },
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(176,132,105,0.4)" },
                  "& .MuiInputBase-root": { background: "#fffdf8" },
                  "& .MuiInputLabel-root": { color: "text.primary" },
                  "& .MuiSelect-select": {
                    whiteSpace: "nowrap",
                    overflow: "hidden",
                    textOverflow: "ellipsis",
                    pr: "28px !important"
                  },
                  "& .MuiFormHelperText-root": { color: "text.secondary", fontSize: "0.68rem", mx: 0 }
                }}
              >
                {MODEL_OPTIONS.map((option) => (
                  <MenuItem key={option} value={option}>
                    {getModelLabel(option)}
                  </MenuItem>
                ))}
              </TextField>
              <TextField
                fullWidth
                size="small"
                label="毎回のお願い"
                placeholder={"毎回同じ内容を適用したい時に使います\n（例：被写体には手を加えない）"}
                multiline
                minRows={4}
                maxRows={20}
                value={systemPromptInput}
                onChange={(e) => setSystemPromptInput(e.target.value)}
                helperText="ここに書いた内容は毎回の編集に反映されます"
                sx={{
                  "& .MuiOutlinedInput-root": { borderRadius: "10px", fontSize: "0.85rem" },
                  "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(176,132,105,0.4)" },
                  "& .MuiInputBase-root": { background: "#fffdf8" },
                  "& .MuiInputLabel-root": { color: "text.primary" },
                  "& .MuiInputBase-input::placeholder": { opacity: 0.5 },
                  "& .MuiFormHelperText-root": { color: "text.secondary", fontSize: "0.68rem", mx: 0 }
                }}
              />
              <Stack direction="row" justifyContent="flex-end" sx={{ mt: 0.4 }}>
                <Button
                  size="small"
                  variant="text"
                  disabled={!systemPromptInput.trim()}
                  onClick={() => setSystemPromptInput("")}
                  sx={{
                    minWidth: "auto",
                    px: 0.8,
                    color: "text.secondary",
                    fontSize: "0.74rem",
                    borderRadius: "8px",
                    "&:hover": { background: "rgba(255, 226, 202, 0.65)", color: "text.primary" }
                  }}
                >
                  クリア
                </Button>
              </Stack>
            </Box>

            <Box sx={{ p: 1.2, borderRadius: "16px", background: "#fff8ef", border: "1px solid rgba(171,130,102,0.24)" }}>
              <Typography sx={{ fontSize: "0.78rem", fontWeight: 700, color: "text.primary", mb: 0.8 }}>操作</Typography>
              <Stack spacing={0.5}>
                <Button
                  variant="outlined"
                  size="small"
                  startIcon={<RestartAltRoundedIcon sx={{ fontSize: "0.95rem" }} />}
                  onClick={resetSession}
                  sx={{
                    justifyContent: "flex-start",
                    color: "text.primary",
                    borderColor: "rgba(176,132,105,0.48)",
                    borderRadius: "10px",
                    fontSize: "0.8rem",
                    "&:hover": { borderColor: "rgba(176,132,105,0.7)", background: "rgba(255, 226, 202, 0.55)" }
                  }}
                >
                  最初からやり直す
                </Button>
                <Button
                  variant="text"
                  size="small"
                  onClick={onSignOut}
                  sx={{
                    justifyContent: "flex-start",
                    color: "text.primary",
                    fontSize: "0.8rem",
                    borderRadius: "10px",
                    "&:hover": { background: "rgba(255, 226, 202, 0.65)" }
                  }}
                >
                  ログアウト
                </Button>
              </Stack>
            </Box>

            <Box sx={{ mt: "auto", p: 1.1, borderRadius: "14px", background: "rgba(255,245,235,0.9)", border: "1px solid rgba(171,130,102,0.2)" }}>
              {currentUser?.email ? (
                <Stack direction="row" spacing={0.5} alignItems="center" sx={{ mb: 0.55 }}>
                  <MailOutlineRoundedIcon sx={{ fontSize: "0.88rem", color: "text.secondary" }} />
                  <Typography sx={{ wordBreak: "break-all", fontSize: "0.72rem", color: "text.secondary", lineHeight: 1.4 }}>
                    {currentUser.email}
                  </Typography>
                </Stack>
              ) : null}
              <Box component="details" sx={{ fontSize: "0.7rem", color: "text.secondary" }}>
                <Box component="summary" sx={{ cursor: "pointer", userSelect: "none" }}>
                  技術情報を見る
                </Box>
                <Typography sx={{ mt: 0.5, wordBreak: "break-all", fontSize: "0.68rem", color: "rgba(133, 105, 90, 0.8)", lineHeight: 1.5 }}>
                  <Box component="span" sx={{ mr: 0.5 }}>セッションID：</Box>{sessionId}
                </Typography>
              </Box>
            </Box>
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
            backdropFilter: "blur(8px)",
            display: "flex", alignItems: "center", justifyContent: "center",
            cursor: "zoom-out",
            animation: "fadeIn 0.2s ease-out",
            "@keyframes fadeIn": { from: { opacity: 0 }, to: { opacity: 1 } },
          }}
        >
          {/* トップバー */}
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{ position: "fixed", top: 0, left: 0, right: 0, height: 56, display: "flex", alignItems: "center", justifyContent: "flex-end", px: 2, gap: 0.5 }}
          >
            <IconButton
              onClick={(e) => { e.stopPropagation(); const a = document.createElement("a"); a.href = modalImage; a.download = "image.png"; a.click(); }}
              sx={{ color: "rgba(255,255,255,0.75)", "&:hover": { color: "#fff", background: "transparent" } }}
            >
              <DownloadRoundedIcon fontSize="small" />
            </IconButton>
            <IconButton
              onClick={async (e) => { e.stopPropagation(); try { const res = await fetch(modalImage); const blob = await res.blob(); await navigator.clipboard.write([new ClipboardItem({ [blob.type]: blob })]); } catch {} }}
              sx={{ color: "rgba(255,255,255,0.75)", "&:hover": { color: "#fff", background: "transparent" } }}
            >
              <ContentCopyRoundedIcon fontSize="small" />
            </IconButton>
            <IconButton
              onClick={() => setModalImage("")}
              sx={{ color: "rgba(255,255,255,0.75)", "&:hover": { color: "#fff", background: "transparent" } }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
          </Box>
          <Box
            component="img"
            src={modalImage}
            alt="zoom"
            onClick={(e) => e.stopPropagation()}
            sx={{ maxWidth: "90vw", maxHeight: "90vh", objectFit: "contain", borderRadius: "12px", cursor: "default", animation: "popIn 0.2s ease-out", "@keyframes popIn": { from: { opacity: 0, transform: "scale(0.95)" }, to: { opacity: 1, transform: "scale(1)" } } }}
          />
        </Box>
      )}

      {compareModal && (
        <Box
          onClick={() => setCompareModal(null)}
          sx={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.92)", backdropFilter: "blur(8px)", zIndex: 1300, display: "flex", alignItems: "center", justifyContent: "center" }}
        >
          {/* トップバー */}
          <Box
            onClick={(e) => e.stopPropagation()}
            sx={{ position: "fixed", top: 0, left: 0, right: 0, height: 56, display: "flex", alignItems: "center", justifyContent: "space-between", px: 2 }}
          >
            <Box sx={{ color: "#fff", fontSize: "0.78rem", fontWeight: 500, opacity: 0.7 }}>
              編集前 / 編集後
            </Box>
            <IconButton
              onClick={() => setCompareModal(null)}
              sx={{ color: "rgba(255,255,255,0.75)", "&:hover": { color: "#fff", background: "transparent" } }}
            >
              <CloseRoundedIcon fontSize="small" />
            </IconButton>
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
              ref={beforeImgRef}
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
                willChange: "clip-path",
                display: "block"
              }}
            />
            {/* 編集前ラベル */}
            <Box sx={{ position: "absolute", top: 12, left: 12, color: "#fff", background: "rgba(0,0,0,0.6)", px: 1.5, py: 0.5, borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", pointerEvents: "none", zIndex: 5 }}>
              編集前
            </Box>
            {/* 編集後ラベル */}
            <Box sx={{ position: "absolute", top: 12, right: 12, color: "#fff", background: "rgba(0,0,0,0.6)", px: 1.5, py: 0.5, borderRadius: "6px", fontSize: "0.72rem", fontWeight: 700, letterSpacing: "0.06em", pointerEvents: "none", zIndex: 5 }}>
              編集後
            </Box>
            {/* Divider line */}
            <Box ref={dividerRef} sx={{ position: "absolute", top: 0, bottom: 0, left: `${sliderPos}%`, width: "2px", background: "#fff", transform: "translateX(-50%)", pointerEvents: "none", zIndex: 10, boxShadow: "0 0 6px rgba(0,0,0,0.5)" }} />
            {/* Drag handle */}
            <Box
              ref={handleRef}
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


      {/* フィードバックダイアログ */}
      <Dialog
        open={feedbackOpen}
        onClose={() => { setFeedbackOpen(false); setFeedbackMessage(""); }}
        TransitionProps={{ onExited: () => setFeedbackDone(false) }}
        slotProps={{ backdrop: { sx: { backdropFilter: "blur(4px)", backgroundColor: "rgba(121, 89, 69, 0.3)" } } }}
        fullWidth
        maxWidth="sm"
        PaperProps={{
          sx: {
            bgcolor: "#fff8f0",
            borderRadius: 2.5,
            boxShadow: "0 8px 32px rgba(120, 84, 63, 0.22)",
          }
        }}
      >
        <DialogTitle sx={{ fontSize: "0.95rem", fontWeight: 600, pb: 1, color: "text.primary" }}>
          改善要望・フィードバック
        </DialogTitle>
        <DialogContent>
          {feedbackDone ? (
            <Typography sx={{ color: "text.primary", py: 1, fontSize: "0.9rem" }}>
              ご意見をいただきありがとうございます。
            </Typography>
          ) : (
            <>
            <TextField
              autoFocus
              multiline
              minRows={4}
              maxRows={8}
              fullWidth
              placeholder="不具合・改善要望などを入力してください（匿名で送信されます）"
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value)}
              disabled={feedbackSending}
              sx={{
                mt: 0.5,
                "& .MuiOutlinedInput-root": {
                  borderRadius: "10px",
                  fontSize: "0.85rem",
                  color: "text.primary",
                },
                "& .MuiOutlinedInput-notchedOutline": { borderColor: "rgba(176, 132, 105, 0.35)" },
                "& .MuiInputBase-root": { background: "#fffdf8" },
              }}
            />
            </>
          )}
        </DialogContent>
        {!feedbackDone && (
          <DialogActions sx={{ px: 3, pb: 2.5, gap: 1 }}>
            <Button
              onClick={() => { setFeedbackOpen(false); setFeedbackMessage(""); }}
              sx={{ color: "text.primary", "&:hover": { bgcolor: "rgba(255, 226, 202, 0.65)" } }}
              disabled={feedbackSending}
            >
              キャンセル
            </Button>
            <Button
              variant="contained"
              onClick={sendFeedback}
              disabled={!feedbackMessage.trim() || feedbackSending}
              sx={{ gap: 1 }}
            >
              {feedbackSending && <CircularProgress size={14} color="inherit" />}
              {feedbackSending ? "送信中..." : "送信"}
            </Button>
          </DialogActions>
        )}
      </Dialog>
    </Box>
  );
}
