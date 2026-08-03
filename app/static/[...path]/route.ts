import { NextRequest, NextResponse } from 'next/server';

function getBackendUrl(): string {
  const value = process.env.BACKEND_URL?.trim();
  if (!value || value === 'undefined' || value === 'null') return 'http://api:8000';
  return value.replace(/\/+$/, '');
}

function proxyResponse(response: Response): NextResponse {
  const headers = new Headers();
  const forwardHeaders = ['content-type', 'cache-control', 'etag', 'last-modified', 'content-length'];

  for (const header of forwardHeaders) {
    const value = response.headers.get(header);
    if (value) headers.set(header, value);
  }

  return new NextResponse(response.body, {
    status: response.status,
    headers,
  });
}

export async function GET(
  request: NextRequest,
  context: { params: Promise<{ path: string[] }> }
) {
  const { path } = await context.params;
  const fullPath = (path || []).map(encodeURIComponent).join('/');
  const targetUrl = `${getBackendUrl()}/static/${fullPath}${request.nextUrl.search}`;

  try {
    const response = await fetch(targetUrl, { method: 'GET' });
    return proxyResponse(response);
  } catch (error) {
    return NextResponse.json(
      { success: false, message: `Static file proxy failed: ${error instanceof Error ? error.message : 'Unknown error'}` },
      { status: 502 }
    );
  }
}