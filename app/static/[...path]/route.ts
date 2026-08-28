import { NextRequest, NextResponse } from 'next/server';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';

/**
 * Static file proxy: forwards /static/* requests to the backend.
 *
 * The backend serves uploaded files (models, thumbnails) from its /static
 * mount point, but the browser cannot reach the backend's /static path
 * directly in Docker/local dev setups. This proxy bridges that gap using
 * the same BACKEND_URL resolution as the /api/v1/* proxy.
 */

function getBackendUrl(): string {
  const value = process.env.BACKEND_URL?.trim();
  if (value && value !== 'undefined' && value !== 'null') {
    return value.replace(/\/+$/, '');
  }
  return process.env.NODE_ENV === 'production'
    ? 'http://api:8000'
    : 'http://localhost:8000';
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const params = await context.params;
  const pathSegments = params.path || [];
  const fullPath = pathSegments.join('/');

  // Security: prevent path traversal
  if (fullPath.includes('..') || fullPath.includes('~') || fullPath.startsWith('/')) {
    return new NextResponse('Invalid path', { status: 400 });
  }

  const BACKEND_URL = getBackendUrl();
  const targetUrl = `${BACKEND_URL}/static/${fullPath}`;

  try {
    const response = await fetch(targetUrl, {
      method: 'GET',
      signal: AbortSignal.timeout(30000),
    });

    if (!response.ok) {
      return new NextResponse(null, { status: response.status });
    }

    // Forward the response with appropriate headers
    const headers = new Headers();
    const contentType = response.headers.get('content-type');
    if (contentType) headers.set('content-type', contentType);

    // Add headers to prevent Cloudflare from modifying binary content
    headers.set('Cache-Control', 'no-transform');
    headers.set('X-Content-Type-Options', 'nosniff');
    headers.set('Access-Control-Allow-Origin', '*');

    // Ensure correct content types for known extensions
    if (fullPath.endsWith('.glb')) {
      headers.set('Content-Type', 'model/gltf-binary');
    } else if (fullPath.endsWith('.gltf')) {
      headers.set('Content-Type', 'model/gltf+json');
    } else if (fullPath.endsWith('.obj')) {
      headers.set('Content-Type', 'text/plain');
    } else if (fullPath.endsWith('.ply')) {
      headers.set('Content-Type', 'application/octet-stream');
    }

    return new NextResponse(response.body, {
      status: response.status,
      headers,
    });
  } catch (error) {
    console.error(`[Static Proxy] GET ${fullPath} failed:`, error);
    return NextResponse.json(
      { success: false, message: 'Failed to fetch static file' },
      { status: 502 }
    );
  }
}
