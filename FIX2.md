AI 3D Studio — Fix Two Upload/Asset Issues

Read and strictly follow:

AGENTS.md

before changing anything.

Do NOT blindly rewrite code. First trace the existing implementation and identify the root cause from the actual source. Reuse existing APIs/helpers/components wherever possible. Make the smallest correct change.

ISSUE 1 — Upload should save to disk immediately

This applies to BOTH:

- image uploads
- 3D model uploads

Current image path

Inspect:

features/new-workspace/Panels/GeneratePanel.tsx
hooks/useUploadProgress.ts
features/new-workspace/store/WorkspaceContext.tsx

Current image flow uses:

File
→ FileReader/readFileWithProgress()
→ data URL
→ generationSettings.image
→ generation request

It does NOT persist the uploaded image immediately through the backend upload API.

Existing backend API already exists:

backend/app/api/v1/upload.py
POST /api/v1/upload/image

This endpoint already saves files into the configured local storage:

storage/uploads/

and returns a persistent URL.

Current 3D model path

Inspect:

features/new-workspace/RightPanel/RightAssetsPanel.tsx
features/new-workspace/Viewport/MeshViewer.tsx

Current upload path uses:

URL.createObjectURL(file)

and stores the browser-local "localUrl".

It does NOT call the existing persistent backend upload API.

Existing backend API:

backend/app/api/v1/upload.py
POST /api/v1/upload/model

which saves to:

storage/models/

and can return:

url
thumbnail_url
filename
format

Required behavior

As soon as the user selects/uploads an image or 3D model:

UI file
   ↓
existing backend upload API
   ↓
disk persistence
   ↓
persistent URL returned
   ↓
UI asset state uses persistent URL

Do NOT keep using Blob/Object URLs as the primary persistent asset source.

For images:

POST /api/v1/upload/image
→ storage/uploads/

For 3D models:

POST /api/v1/upload/model
→ storage/models/

Keep the existing storage system. Do NOT introduce another storage layer.

---

ISSUE 2 — Uploaded 3D models do not load in viewer/assets

This issue affects even ".glb".

Do NOT assume this is only a format-support problem.

The current code must be traced end-to-end.

Inspect these files:

features/new-workspace/RightPanel/RightAssetsPanel.tsx
features/new-workspace/Viewport/MeshViewer.tsx
features/new-workspace/store/WorkspaceContext.tsx
features/new-workspace/types.ts
services/apiClient.ts
backend/app/api/v1/upload.py

Also inspect:

stores/useViewerStore.ts
features/new-workspace/WorkspaceShell.tsx

and every caller related to:

currentAsset
setCurrentAsset
selectAsset
addAsset
load-glb-model
loadedModelUrl
thumbnailUrl
viewUrl
localUrl

Current observed problem

The model upload UI creates something similar to:

source.localUrl = URL.createObjectURL(file)

and sets that asset as current.

The Asset Panel renders:

asset.thumbnail

but uploaded local assets are created with:

thumbnail: ''

There is also no reliable persistent backend asset representation attached to the new UI asset.

The viewer loads using:

currentAsset.source.localUrl
OR
currentAsset.source.viewUrl

through Three.js loaders.

Trace why a ".glb" still fails to appear.

Do NOT conclude “GLB is unsupported”; "MeshViewer.tsx" already uses:

GLTFLoader

for GLB/GLTF.

Find the real reason the model is not reliably visible/loadable.

---

REQUIRED DEBUG TRACE

For one uploaded ".glb", trace this exact chain:

file selected
→ processModelFile()
→ backend upload
→ backend response
→ asset object
→ addAsset()
→ selected/current asset
→ MeshViewer currentAsset
→ source URL
→ GLTFLoader
→ scene/group
→ camera visibility
→ rendered result

Find exactly where the chain breaks.

Also verify whether the loaded mesh can be outside the camera frustum.

Check whether the viewer ever performs:

bounding-box calculation
camera framing
fit-to-screen
lookAt

for newly loaded uploaded models.

Do not assume the problem is loading failure if the model is actually loaded but outside the camera view.

---

ASSET PANEL / THUMBNAIL

The backend already has:

POST /api/v1/upload/model

which can generate a thumbnail.

Inspect the implementation carefully.

There is currently a naming inconsistency to verify:

uploaded model filename
vs
generated thumbnail filename
vs
GET /api/v1/upload/assets thumbnail lookup

The upload endpoint creates a thumbnail filename independently, while the assets listing attempts to find a thumbnail using the model filename stem.

Fix this using the smallest correct approach so the returned thumbnail belongs to the exact uploaded model.

Do NOT associate a random thumbnail with a model.

---

PERSISTED ASSET LIST

Inspect:

GET /api/v1/upload/assets

and "WorkspaceContext".

The workspace currently refreshes generation history, but verify whether it actually fetches persistent uploaded assets from:

/api/v1/upload/assets

If it does not, add the minimum integration required so uploaded images/models can reappear after:

page refresh
workspace remount

Do not duplicate asset loading logic if an existing API/helper can be reused.

---

FORMAT HANDLING

Audit these three locations and make them consistent:

RightAssetsPanel.tsx
backend/app/api/v1/upload.py
MeshViewer.tsx

Current code has different accepted formats.

Verify:

GLB
GLTF
OBJ
PLY
FBX
STL

Do not expand support blindly.

For each format, explicitly determine:

upload allowed?
persistent storage?
thumbnail supported?
browser viewer supported?

If a format cannot be browser-previewed, it must still be persisted correctly and the UI must fail gracefully rather than pretending it loaded.

---

API CLIENT

Reuse:

services/apiClient.ts

especially the existing:

apiClient.uploadFile(...)

Do NOT create another multipart upload implementation unless the existing helper genuinely cannot support the required response/behavior.

---

IMAGE BEHAVIOR

After image upload:

UI selects image
→ POST /api/v1/upload/image
→ persistent image URL
→ UI state stores persistent URL
→ generation uses persistent URL

Do NOT depend on a large base64/data URL as the only representation once the file is persisted.

Keep generation behavior working.

---

3D MODEL BEHAVIOR

After model upload:

UI selects model
→ POST /api/v1/upload/model
→ file saved to storage/models/
→ thumbnail generated when supported
→ backend returns persistent model URL + thumbnail URL
→ create/update ModelAsset with those URLs
→ add/select asset
→ MeshViewer loads persistent URL
→ model is visible/framed in camera
→ Asset Panel shows thumbnail
→ clicking the asset loads it again

The asset should continue to work after the browser Blob URL is gone.

---

PERSISTENCE REQUIREMENT

Verify these cases:

Image

select image
→ upload succeeds
→ file exists on disk
→ generation can use it
→ refresh page
→ asset remains available

3D Model

select GLB
→ upload succeeds
→ file exists on disk
→ thumbnail exists when supported
→ asset appears in Asset Panel
→ click asset
→ viewer loads it
→ refresh page
→ asset remains available
→ click again
→ viewer loads it again

---

IMPORTANT

Do NOT solve this by simply making:

URL.createObjectURL(file)

work better.

The requirement is:

«Persistent disk-backed upload immediately on user upload.»

The Blob/Object URL may be used only as an optional temporary preview during upload, not as the canonical asset URL.

Do not create a new upload/storage architecture.

Use the existing:

POST /api/v1/upload/image
POST /api/v1/upload/model
GET  /api/v1/upload/assets
apiClient.uploadFile()

where appropriate.

---

BEFORE MODIFYING CODE

First inspect and document internally:

1. Why image is not persisted immediately.
2. Why 3D model is not persisted immediately.
3. Why uploaded GLB is not visible in MeshViewer.
4. Why thumbnail is missing.
5. Why clicking the uploaded asset does not reliably load it.
6. Whether asset state is lost on refresh.
7. Whether camera framing is part of the GLB visibility issue.
8. Whether backend thumbnail mapping is incorrect.

Only after proving these root causes should you implement the minimum fix.

---

VERIFICATION

After implementation, run the smallest relevant checks.

At minimum verify:

image upload → disk exists
GLB upload → disk exists
GLB thumbnail → correct thumbnail
Asset Panel → uploaded model visible
click model → viewer loads
page refresh → model still listed
click again → viewer loads

Also verify that existing generated-model flows are not broken.

Finally, follow "AGENTS.md" and update the relevant project documentation files if the implementation/state has changed.