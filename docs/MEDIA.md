# Native media pipeline

Mend stores customer media in the private `private-media` bucket. Browser
uploads are initialized through the authenticated API and sent directly to
Supabase Storage using the resumable upload endpoint. The API never accepts
large media as base64 in the new flow.

The worker validates the detected file type, stores the original, and creates
browser/provider variants. FFmpeg handles audio/video normalization and Sharp
handles image metadata and previews. Provider URLs are temporary transport
credentials and are never persisted in the conversation timeline.

`MEND_MEDIA_PIPELINE_V2=0` disables new upload initialization for rollback;
legacy public-URL and small data-URL sends remain available during rollout.

Support limits are 20 MB per image, 100 MB per video/document/archive, 25 MB
per audio, and 10 files/200 MB per batch. Duration is not a product limit, but
processing is bounded by `MEDIA_PROCESS_TIMEOUT_MS`.
