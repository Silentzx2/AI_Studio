import { NextRequest, NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';

// export const config = {
//   matcher: '/api/v1/:path*',
// };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Storage helpers for direct persistence to /backend/storage/models and /backend/storage/uploads
 */
function getStorageDirs(subfolder: string): string[] {
  const dirs = [
    path.join('/backend/storage', subfolder),
    path.join(process.cwd(), 'backend', 'storage', subfolder),
  ];
  for (const d of dirs) {
    try {
      if (!fs.existsSync(d)) {
        fs.mkdirSync(d, { recursive: true });
      }
    } catch {}
  }
  return dirs;
}

async function handleDirectModelUpload(file: File) {
  const ext = path.extname(file.name).toLowerCase() || '.glb';
  const cleanBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const storedFilename = `${Date.now()}_${cleanBase}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const targetDirs = getStorageDirs('models');
  for (const dir of targetDirs) {
    try {
      await fs.promises.writeFile(path.join(dir, storedFilename), buffer);
    } catch (err) {
      console.warn(`Failed to write to storage dir ${dir}:`, err);
    }
  }

  return {
    success: true,
    data: {
      id: storedFilename,
      url: `/static/models/${storedFilename}`,
      filename: file.name,
      stored_filename: storedFilename,
      size: buffer.length,
      format: ext.replace('.', ''),
      thumbnail_url: null,
      mesh_stats: null,
    },
    message: 'Model uploaded successfully to storage',
  };
}

async function handleDirectImageUpload(file: File) {
  const ext = path.extname(file.name).toLowerCase() || '.png';
  const cleanBase = path.basename(file.name, ext).replace(/[^a-zA-Z0-9_-]/g, '_');
  const storedFilename = `upload_${Date.now()}_${cleanBase}${ext}`;
  const buffer = Buffer.from(await file.arrayBuffer());

  const targetDirs = getStorageDirs('uploads');
  for (const dir of targetDirs) {
    try {
      await fs.promises.writeFile(path.join(dir, storedFilename), buffer);
    } catch (err) {
      console.warn(`Failed to write to storage dir ${dir}:`, err);
    }
  }

  return {
    success: true,
    data: {
      url: `/static/uploads/${storedFilename}`,
      filename: storedFilename,
      width: 512,
      height: 512,
      size_bytes: buffer.length,
    },
    message: 'Image uploaded successfully to storage',
  };
}

async function handleDirectAssetsList() {
  const MODEL_EXTS = new Set(['.glb', '.gltf', '.obj', '.ply', '.stl', '.fbx']);
  const IMAGE_EXTS = new Set(['.png', '.jpg', '.jpeg', '.webp']);

  const models: any[] = [];
  const images: any[] = [];
  const seenModels = new Set<string>();
  const seenImages = new Set<string>();

  // Scan models
  for (const dir of getStorageDirs('models')) {
    try {
      if (fs.existsSync(dir)) {
        const files = await fs.promises.readdir(dir);
        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if (MODEL_EXTS.has(ext) && !seenModels.has(file)) {
            seenModels.add(file);
            const stat = await fs.promises.stat(path.join(dir, file));
            models.push({
              id: file,
              name: file.replace(/^[0-9]+_/, '').replace(/\.[^.]+$/, ''),
              filename: file,
              url: `/static/models/${file}`,
              size: stat.size,
              format: ext.replace('.', '').toUpperCase(),
              type: 'model',
              thumbnail_url: null,
              mesh_stats: null,
              created_at: stat.mtime.toISOString(),
            });
          }
        }
      }
    } catch {}
  }

  // Scan images
  for (const dir of getStorageDirs('uploads')) {
    try {
      if (fs.existsSync(dir)) {
        const files = await fs.promises.readdir(dir);
        for (const file of files) {
          const ext = path.extname(file).toLowerCase();
          if (IMAGE_EXTS.has(ext) && !seenImages.has(file)) {
            seenImages.add(file);
            const stat = await fs.promises.stat(path.join(dir, file));
            images.push({
              id: file,
              name: file,
              filename: file,
              url: `/static/uploads/${file}`,
              size: stat.size,
              format: ext.replace('.', '').toUpperCase(),
              type: 'image',
              created_at: stat.mtime.toISOString(),
            });
          }
        }
      }
    } catch {}
  }

  models.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
  images.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  return {
    success: true,
    data: {
      images,
      models,
      total_images: images.length,
      total_models: models.length,
    },
  };
}

async function handleDirectAssetDelete(filename: string) {
  const dirs = [...getStorageDirs('models'), ...getStorageDirs('uploads')];
  let deleted = false;
  for (const dir of dirs) {
    const target = path.join(dir, filename);
    if (fs.existsSync(target)) {
      try {
        const stat = await fs.promises.stat(target);
        if (stat.isDirectory()) {
          await fs.promises.rm(target, { recursive: true, force: true });
        } else {
          await fs.promises.unlink(target);
        }
        deleted = true;
      } catch {}
    }
  }
  return { success: true, data: { deleted, filename } };
}

/**
 * Runtime API Proxy for /api/v1/* requests
 * 
 * CRITICAL FIX: This route proxies API calls at RUNTIME, not build time.
 * 
 * Next.js rewrites() in next.config.js are evaluated during build, so
 * the BACKEND_URL value gets "baked in" at build time. In Docker, this means
 * the rewrites would use localhost:8000 (from build) instead of api:8000
 * (the Docker service name). This causes ECONNREFUSED errors.
 * 
 * This API route reads BACKEND_URL from process.env at REQUEST time,
 * allowing proper Docker networking to work.
 * 
 * Endpoint patterns:
 * - /api/v1/runtime/options -> backend:8000/api/v1/runtime/options
 * - /api/v1/generation -> backend:8000/api/v1/generation
 * - /api/v1/admin/* -> backend:8000/api/v1/admin/*
 * - SSE endpoints are handled with streaming responses
 */

let activeBackendUrl: string | null = null;

// Local dev & Colab -> loopback 127.0.0.1:8000
// BACKEND_URL always takes precedence if provided.
function getBackendUrl(): string {
  if (activeBackendUrl) {
    return activeBackendUrl;
  }

  const value = process.env.BACKEND_URL?.trim();

  if (value && value !== 'undefined' && value !== 'null') {
    return value.replace(/\/+$/, '');
  }

  // Default to IPv4 loopback where FastAPI runs in native / Colab environments
  return 'http://127.0.0.1:8000';
}

/**
 * Resilient fetcher that forwards requests to the backend.
 * If the configured backend URL uses Docker hostname 'api' but fails due to ENOTFOUND
 * (e.g. in Colab or native execution outside Docker networks), it automatically fails
 * over to 127.0.0.1:8000 and remembers the working address for subsequent requests.
 */
async function fetchWithBackendFallback(
  url: string,
  init: RequestInit
): Promise<Response> {
  try {
    return await fetch(url, init);
  } catch (error: any) {
    const isDnsOrConnectionError =
      error?.cause?.code === 'ENOTFOUND' ||
      error?.code === 'ENOTFOUND' ||
      error?.message?.includes('ENOTFOUND') ||
      error?.message?.includes('fetch failed');

    if (isDnsOrConnectionError && (url.includes('//api:8000') || url.includes('//api/'))) {
      const fallbackUrl = url.replace(/\/\/api(:8000)?\//, '//127.0.0.1:8000/');
      console.warn(`[API Proxy] Host 'api' unreachable; failing over to ${fallbackUrl}`);
      activeBackendUrl = 'http://127.0.0.1:8000';
      return await fetch(fallbackUrl, init);
    }
    throw error;
  }
}

// SSE endpoints that need streaming responses
// NOTE: fullPath from params does NOT have a leading slash (e.g. "admin/install/stream/model_id")
// so patterns must match without assuming a leading /
const SSE_PATHS = [
  'install/stream',
  'logs/stream',
  'admin/install/stream',
  'admin/logs/stream',
];

// Broader patterns: any path ending with /stream is treated as SSE
function isSsePath(path: string): boolean {
  if (SSE_PATHS.some(sse => path.includes(sse))) return true;
  return path.endsWith('/stream');
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  const pathSegments = params.path || [];
  const fullPath = pathSegments.join('/');
  const BACKEND_URL = getBackendUrl();
  const targetUrl = `${BACKEND_URL}/api/v1/${fullPath}${request.nextUrl.search}`;
  
  // Handle SSE endpoints with streaming
  if (isSsePath(fullPath)) {
    return streamResponse(targetUrl, request);
  }
  
  try {
    const response = await fetchWithBackendFallback(targetUrl, {
      method: 'GET',
      headers: getForwardingHeaders(request),
      signal: AbortSignal.timeout(30000),
    });
    
    return createProxyResponse(response, request);
  } catch (error) {
    // Backend offline; check fallback below
  }

  // Fallback for upload/assets listing
  if (fullPath === 'upload/assets') {
    const assetsData = await handleDirectAssetsList();
    return NextResponse.json(assetsData);
  }

  return NextResponse.json(
    { success: false, message: `Backend unavailable or timed out at ${BACKEND_URL}` },
    { status: 504 }
  );
}

export async function POST(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  const pathSegments = params.path || [];
  const fullPath = pathSegments.join('/');
  const BACKEND_URL = getBackendUrl();
  const targetUrl = `${BACKEND_URL}/api/v1/${fullPath}${request.nextUrl.search}`;
  
  try {
    // Check if this is a file upload (multipart/form-data)
    const contentType = request.headers.get('content-type') || '';
    
    let body: BodyInit | undefined;
    const headers: HeadersInit = {};
    
    // Forward authorization header if present
    const auth = request.headers.get('authorization');
    if (auth) headers['authorization'] = auth;
    
    let parsedFormData: FormData | null = null;
    if (contentType.includes('multipart/form-data')) {
      parsedFormData = await request.formData();
      body = parsedFormData;
    } else {
      // For JSON and other content types
      body = await request.text();
      if (contentType) headers['content-type'] = contentType;
    }
    
    try {
      const response = await fetchWithBackendFallback(targetUrl, {
        method: 'POST',
        headers,
        body: body || undefined,
        signal: AbortSignal.timeout(600000), // 10 minutes for generation/uploads
      });
      
      return createProxyResponse(response, request);
    } catch {
      // Backend fetch failed; check fallback below
    }

    // Direct fallback for model uploads to /backend/storage/models
    if (fullPath === 'upload/model' && parsedFormData) {
      const file = parsedFormData.get('file') as File | null;
      if (file && file.size > 0) {
        const uploadResult = await handleDirectModelUpload(file);
        return NextResponse.json(uploadResult);
      }
    }

    // Direct fallback for image uploads to /backend/storage/uploads
    if (fullPath === 'upload/image' && parsedFormData) {
      const file = parsedFormData.get('file') as File | null;
      if (file && file.size > 0) {
        const uploadResult = await handleDirectImageUpload(file);
        return NextResponse.json(uploadResult);
      }
    }

    return NextResponse.json(
      { success: false, message: `Backend connection error or timeout at ${BACKEND_URL}` },
      { status: 504 }
    );
  } catch (error) {
    console.error(`[API Proxy] POST ${fullPath} failed:`, error);
    return NextResponse.json(
      { success: false, message: `Upload/POST request failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 500 }
    );
  }
}

export async function PUT(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  const pathSegments = params.path || [];
  const fullPath = pathSegments.join('/');
  const BACKEND_URL = getBackendUrl();
  const targetUrl = `${BACKEND_URL}/api/v1/${fullPath}${request.nextUrl.search}`;
  
  try {
    const body = await request.text();
    const response = await fetchWithBackendFallback(targetUrl, {
      method: 'PUT',
      headers: {
        'content-type': request.headers.get('content-type') || 'application/json',
        ...getAuthHeader(request),
      },
      body: body || undefined,
      signal: AbortSignal.timeout(30000),
    });
    
    return createProxyResponse(response, request);
  } catch (error) {
    console.error(`[API Proxy] PUT ${fullPath} failed:`, error);
    return NextResponse.json(
      { success: false, message: `Backend unavailable at ${BACKEND_URL} — is the backend service running?` },
      { status: 502 }
    );
  }
}

export async function DELETE(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  const pathSegments = params.path || [];
  const fullPath = pathSegments.join('/');
  const BACKEND_URL = getBackendUrl();
  const targetUrl = `${BACKEND_URL}/api/v1/${fullPath}${request.nextUrl.search}`;
  
  try {
    const response = await fetchWithBackendFallback(targetUrl, {
      method: 'DELETE',
      headers: getForwardingHeaders(request),
      signal: AbortSignal.timeout(10000),
    });
    
    return createProxyResponse(response, request);
  } catch (error) {
    // Backend offline; check fallback below
  }

  // Fallback for asset deletion
  if (fullPath.startsWith('upload/assets/')) {
    const filename = fullPath.replace('upload/assets/', '');
    const deleteResult = await handleDirectAssetDelete(decodeURIComponent(filename));
    return NextResponse.json(deleteResult);
  }
  if (fullPath.startsWith('jobs/')) {
    const jobId = fullPath.replace('jobs/', '');
    const deleteResult = await handleDirectAssetDelete(decodeURIComponent(jobId));
    return NextResponse.json(deleteResult);
  }

  return NextResponse.json(
    { success: false, message: `Backend unavailable at ${BACKEND_URL} — is the backend service running?` },
    { status: 502 }
  );
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  // Handle CORS preflight - dynamically allow requesting origin
  const origin = request.headers.get('origin') || '*';
  const headers: Record<string, string> = {
    'Access-Control-Allow-Origin': origin,
    'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
    'Access-Control-Max-Age': '86400',
  };
  if (origin !== '*') {
    headers['Access-Control-Allow-Credentials'] = 'true';
  }
  return new NextResponse(null, {
    status: 204,
    headers,
  });
}

// Helper: Get headers to forward to backend
function getForwardingHeaders(request: NextRequest): HeadersInit {
  const headers: HeadersInit = {};
  
  const contentType = request.headers.get('content-type');
  if (contentType) headers['content-type'] = contentType;
  
  const auth = request.headers.get('authorization');
  if (auth) headers['authorization'] = auth;
  
  return headers;
}

// Helper: Get just the auth header if present
function getAuthHeader(request: NextRequest): HeadersInit {
  const headers: HeadersInit = {};
  const auth = request.headers.get('authorization');
  if (auth) headers['authorization'] = auth;
  return headers;
}

// Helper: Create response from backend response
function createProxyResponse(response: Response, request?: NextRequest): NextResponse {
  const headers = new Headers();

  // Forward relevant headers
  const forwardHeaders = ['content-type', 'content-length', 'accept-ranges', 'content-range', 'cache-control', 'etag', 'last-modified'];
  for (const header of forwardHeaders) {
    const value = response.headers.get(header);
    if (value) headers.set(header, value);
  }

  // Dynamic origin reflection to support local, Colab tunnels, and custom domains
  const origin = request?.headers.get('origin') || '*';
  headers.set('Access-Control-Allow-Origin', origin);
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Info, Apikey');
  if (origin !== '*') {
    headers.set('Access-Control-Allow-Credentials', 'true');
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers,
  });
}

// Helper: Handle SSE streaming
async function streamResponse(targetUrl: string, request: NextRequest): Promise<NextResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 1800000); // 30 min safety timeout; jobs can run longer than 5 min
    
    const response = await fetchWithBackendFallback(targetUrl, {
      method: 'GET',
      headers: {
        'accept': 'text/event-stream',
        'cache-control': 'no-cache',
        ...getAuthHeader(request),
      },
      signal: controller.signal,
    });
    
    clearTimeout(timeoutId);
    
    if (!response.ok) {
      return NextResponse.json(
        { success: false, message: `SSE connection failed: ${response.status}` },
        { status: response.status }
      );
    }
    
    const headers = new Headers({
      'content-type': 'text/event-stream',
      'cache-control': 'no-cache',
      'connection': 'keep-alive',
      'access-control-allow-origin': '*',
    });
    
    return new NextResponse(response.body, {
      status: 200,
      headers,
    });
  } catch (error) {
    console.error('[API Proxy] SSE stream failed:', error);
    return NextResponse.json(
      { success: false, message: `SSE connection failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 502 }
    );
  }
}