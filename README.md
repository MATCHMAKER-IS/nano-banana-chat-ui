# nano-banana-chat-ui

Cloudflare Workers + custom UI for conversational image editing with Gemini.

## Structure

- `worker/`: Cloudflare Worker proxy (`POST /api/edit`)
- `ui/`: React UI (chat-like image editing flow)

## Security and credentials

- You do **not** share Cloudflare login credentials with me.
- You run `wrangler login` on your machine once.
- Secrets are stored in Cloudflare (`wrangler secret put ...`), not in source code.
- Worker is now configured to allow only local UI origins by default:
  - `http://localhost:5173`
  - `http://127.0.0.1:5173`

## Access restriction (recommended for production)

1. Set an explicit UI origin allowlist in `worker/wrangler.toml`.
2. Set `PROXY_TOKEN` in Worker secret.
3. Enter the same token in UI `Session > Access Token`.
4. Keep `VITE_PROXY_TOKEN` empty in committed env files.

Example production allowlist:

```toml
ALLOWED_ORIGINS = "https://your-ui.pages.dev,https://your-custom-domain.com"
```

Set secrets:

```bash
cd worker
npx wrangler secret put GEMINI_API_KEY
npx wrangler secret put PROXY_TOKEN
```

## 1) Worker setup

```bash
cd worker
npm install
npx wrangler login
npx wrangler secret put GEMINI_API_KEY
```

Local dev (recommended):

```bash
cd worker
copy .dev.vars.example .dev.vars
```

Then set actual values in `worker/.dev.vars` (never commit this file).

Optional:

```bash
npx wrangler secret put PROXY_TOKEN
```

Optional vars in `wrangler.toml`:

- `CORS_ALLOW_ORIGIN` (fallback header value, default: `*`)
- `ALLOWED_ORIGINS` (comma-separated allowlist, defaults to localhost origins only)

Run local worker:

```bash
npm run dev
```

## 2) UI setup

```bash
cd ui
npm install
copy .env.example .env
npm run dev
```

`ui/.env` example:

```bash
VITE_API_BASE_URL=http://127.0.0.1:8787
VITE_PROXY_TOKEN=
VITE_DEFAULT_MODEL=gemini-3.1-flash-image-preview
VITE_IMAGE_MODELS=gemini-3.1-flash-image-preview,gemini-3-pro-image-preview,gemini-2.5-flash-image
```

If `PROXY_TOKEN` is enabled on Worker, set it from the UI `Session` panel (`Access Token` field).
Do not hardcode production tokens in `VITE_*` vars.

## API contract

### POST `/api/edit`

Request JSON (custom UI mode):

```json
{
  "prompt": "Make background clean and brighter",
  "imageBase64": "<base64 without data URL prefix>",
  "mimeType": "image/png",
  "sessionId": "optional-client-id",
  "model": "gemini-3.1-flash-image-preview",
  "responseMode": "json"
}
```

Request JSON (legacy Dify-compatible mode):

```json
{
  "prompt": "...",
  "file_uri": "https://...",
  "mime_type": "image/png",
  "responseMode": "binary"
}
```

Response JSON (`responseMode=json`):

```json
{
  "requestId": "uuid",
  "sessionId": "same-as-request-or-generated",
  "model": "gemini-3.1-flash-image-preview",
  "text": "optional model text",
  "editedImageBase64": "<base64>",
  "mimeType": "image/png"
}
```

Response binary (`responseMode=binary`):

- Raw image bytes with `Content-Type: image/*`

## Notes

- The UI is conversational by keeping local turn history and sending the latest edited image each turn.
- This design keeps backend minimal and easy to replace later (AWS, etc.) with the same API contract.

## UI Acceptance Test (Manual)

### Test flow (fixed procedure)

1. Attach image:
   Click `画像添付` and pick one image file. Confirm thumbnail preview appears in the input area.
2. Send prompt:
   Enter an edit prompt and click send. Confirm request is accepted and `生成中...` state appears.
3. Confirm generation:
   Wait for assistant response with output image. Confirm output image is visible in the message.
4. Compare before/after:
   Click `比較表示`. Confirm modal opens and both images are shown (before/after). Confirm drag-to-pan works in each compare pane.
5. Save result:
   Click `保存` on generated image. Confirm download starts.
6. Switch / clear edit target:
   Click `編集対象にする` on a message image and confirm `現在の編集対象` preview updates. Then click `解除` and confirm current target is cleared.

### Regression checklist ("not broken")

- Image attach still works.
- Send button enable/disable rule is correct (`prompt` + image required).
- Edit API call still succeeds and response image is displayed.
- Compare modal opens/closes correctly.
- Compare pane scroll bars are visible.
- Wheel inside compare pane does not scroll image content unexpectedly.
- Dragging in compare pane still pans image.
- Save/download still works.
- `編集対象にする` works.
- `現在の編集対象` preview appears with rounded corners.
- `解除` clears current target.
- Existing error messages still show (`timeout`, `no_image_part` etc.).
- Layout does not collapse on mobile width.
