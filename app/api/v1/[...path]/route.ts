import { NextRequest, NextResponse } from 'next/server';

// export const config = {
//   matcher: '/api/v1/:path*',
// };

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

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

// Local dev -> localhost
// Production fallback -> Docker service (api:8000)
// BACKEND_URL always takes precedence if provided.
function getBackendUrl(): string {
  const value = process.env.BACKEND_URL?.trim();

  if (value && value !== 'undefined' && value !== 'null') {
    return value.replace(/\/+$/, '');
  }

  return process.env.NODE_ENV === 'production'
    ? 'http://api:8000'
    : 'http://localhost:8000';
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

function isSsePath(path: string): boolean {
  return SSE_PATHS.some(sse => path.includes(sse));
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
    const response = await fetch(targetUrl, {
      method: 'GET',
      headers: getForwardingHeaders(request),
      signal: AbortSignal.timeout(60000),
    });
    
    return createProxyResponse(response);
  } catch (error) {
    console.error(`[API Proxy] GET ${fullPath} failed:`, error);
    return NextResponse.json(
      { success: false, message: `Backend unavailable at ${BACKEND_URL} — is the backend service running?` },
      { status: 502 }
    );
  }
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
    
    if (contentType.includes('multipart/form-data')) {
      // Forward multipart by re-using the parsed FormData. Letting fetch set a
      // fresh Content-Type (with a correct boundary) avoids the arrayBuffer +
      // copied-header path, which could arrive at the backend as an empty/malformed
      // part (yielding 422 "Empty file" for uploads that use a relative URL and
      // therefore proxy through Next, e.g. model uploads).
      const formData = await request.formData();
      body = formData;
    } else {
      // For JSON and other content types
      body = await request.text();
      if (contentType) headers['content-type'] = contentType;
    }
    
    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: body || undefined,
      signal: AbortSignal.timeout(30000),
    });
    
    return createProxyResponse(response);
  } catch (error) {
    console.error(`[API Proxy] POST ${fullPath} failed:`, error);
    return NextResponse.json(
      { success: false, message: `Backend unavailable at ${BACKEND_URL} — is the backend service running?` },
      { status: 502 }
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
    const response = await fetch(targetUrl, {
      method: 'PUT',
      headers: {
        'content-type': request.headers.get('content-type') || 'application/json',
        ...getAuthHeader(request),
      },
      body: body || undefined,
    });
    
    return createProxyResponse(response);
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
    const response = await fetch(targetUrl, {
      method: 'DELETE',
      headers: getForwardingHeaders(request),
    });
    
    return createProxyResponse(response);
  } catch (error) {
    console.error(`[API Proxy] DELETE ${fullPath} failed:`, error);
    return NextResponse.json(
      { success: false, message: `Backend unavailable at ${BACKEND_URL} — is the backend service running?` },
      { status: 502 }
    );
  }
}

export async function OPTIONS(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  // Handle CORS preflight
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, PUT, DELETE, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization, X-Client-Info, Apikey',
      'Access-Control-Max-Age': '86400',
    },
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
function createProxyResponse(response: Response): NextResponse {
  const headers = new Headers();
  
  // Forward relevant headers
  const forwardHeaders = ['content-type', 'cache-control', 'etag', 'last-modified'];
  for (const header of forwardHeaders) {
    const value = response.headers.get(header);
    if (value) headers.set(header, value);
  }
  
  // Add CORS headers for browser clients
  headers.set('Access-Control-Allow-Origin', '*');
  headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, X-Client-Info, Apikey');
  
  return new NextResponse(response.body, {
    status: response.status,
    headers,
  });
}

// Helper: Handle SSE streaming
async function streamResponse(targetUrl: string, request: NextRequest): Promise<NextResponse> {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 300000); // 5 min timeout for SSE
    
    const response = await fetch(targetUrl, {
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