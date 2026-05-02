# Luma video → orbit demo

Self-contained playground that takes a video, extracts a frame in the browser,
and sends it through Luma's [Dream Machine API](https://docs.lumalabs.ai/) with
an orbit camera motion. The resulting 720p / 5s clip is rendered on the page.

> ### Heads up — this is _not_ a video → 3D mesh pipeline.
>
> Luma's public API does **not** expose a video-to-3D-mesh endpoint as of this
> writing. Their text-to-3D product (Genie) is a web-only tool and is not part
> of the [public REST API](https://docs.lumalabs.ai/reference/creategeneration),
> which currently covers Photon (image) and Ray-2 (video).
>
> The closest thing the public API supports is **image-to-video with an orbit
> camera motion**, which is what this demo wires up. That gives you a 360-ish
> rendered fly-around of the subject from a single frame — convincing for
> hero objects like pottery, but it is a video, not a mesh.
>
> If you need an actual 3D file, generate the model in the Genie web app, export
> it as `.glb`, and drop it into the bottom card of this page — it ships with a
> `<model-viewer>` viewer too.

## Run

```bash
cd playground/luma-video-to-3d
LUMAAI_API_KEY=luma-... node server.mjs
# open http://localhost:3000
```

No npm dependencies — Node ≥ 18.17 only. The Luma API key is read from the
`LUMAAI_API_KEY` environment variable; nothing about your key ever touches the
client bundle or the git history.

### Making the uploaded frame reachable by Luma

Luma's servers fetch the keyframe over the public internet. If you are running
locally, expose this server with a tunnel and set `PUBLIC_URL`:

```bash
ngrok http 3000
# then in another shell:
PUBLIC_URL=https://<id>.ngrok.app LUMAAI_API_KEY=luma-... node server.mjs
```

If that's not an option, paste an existing public image URL into the "manual
URL" input on the page and skip the upload step entirely.

## What it does, step by step

1. You pick a video file. The browser plays it locally — nothing is uploaded.
2. You scrub to a frame and click **Grab frame**. The page draws that frame
   into a `<canvas>`, exports a JPEG, and `POST`s it to `/api/upload-frame`.
3. The server stores the JPEG in `tmp-uploads/` and replies with a public URL.
4. You click **Generate**. The server calls
   `POST /dream-machine/v1/generations` with the keyframe URL, your prompt,
   and the camera-motion concept.
5. The page polls `/api/generation/:id` every 4 seconds until `state` is
   `completed`, then renders `assets.video` in a `<video>` element.

## Files

- `server.mjs` — zero-dep Node HTTP server: static files, frame upload,
  Luma proxy.
- `public/index.html` — the demo UI.
- `public/app.js` — frame extraction, upload, generation, polling.
- `public/style.css` — minimal dark theme.

## Why a separate playground

The Vercel AI SDK monorepo this folder lives in does not have a Luma provider,
and this is a one-off API exploration unrelated to the SDK packages. Putting it
under `playground/` keeps it out of the workspace globs in `pnpm-workspace.yaml`
so the SDK build/test pipelines aren't affected.
