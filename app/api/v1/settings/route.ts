import { NextRequest, NextResponse } from 'next/server';

// RESERVED: This endpoint is reserved for future use.
// No client-side code currently calls this route.

function getBackendModelsUrl(): string {
  const value = process.env.BACKEND_URL?.trim();
  const base = (value && value !== 'undefined' && value !== 'null') ? value.replace(/\/+$/, '') : 'http://127.0.0.1:8000';
  return `${base}/api/v1/settings/models`;
}

export async function GET(request: NextRequest) {
  
  // Check if request is for models endpoint
  if (request.nextUrl.pathname.includes('/models')) {
    const targetUrl = getBackendModelsUrl();
    try {
      let response: Response;
      try {
        response = await fetch(targetUrl, {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          },
        });
      } catch (fetchErr: any) {
        if (targetUrl.includes('//api:8000') || fetchErr?.cause?.code === 'ENOTFOUND') {
          response = await fetch('http://127.0.0.1:8000/api/v1/settings/models', {
            method: 'GET',
            headers: {
              'Content-Type': 'application/json',
            },
          });
        } else {
          throw fetchErr;
        }
      }

      if (!response.ok) {
        throw new Error(`Backend error: ${response.status}`);
      }

      const data = await response.json();

      return NextResponse.json({
        success: true,
        data: data.models || [],
        message: 'Models retrieved successfully from backend',
      });
    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : 'Unknown error';
      console.error('Error fetching models from backend:', error);
      return NextResponse.json({
        success: false,
        message: 'Failed to retrieve models from backend - check backend status',
        error: errorMessage
      }, { status: 502 });
    }
  }

  // Handle other settings routes if needed
  return NextResponse.json({ success: false, message: 'Not found' }, { status: 404 });
}