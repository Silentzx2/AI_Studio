import { NextRequest, NextResponse } from 'next/server';

// Link to backend models API endpoint
const BACKEND_MODELS_URL = process.env.BACKEND_URL ? 
  `${process.env.BACKEND_URL}/api/v1/settings/models` : 
  'http://api:8000/api/v1/settings/models';


export async function GET(request: NextRequest) {
  
  // Check if request is for models endpoint
  if (request.nextUrl.pathname.includes('/models')) {
    try {
      const response = await fetch(BACKEND_MODELS_URL ,
        {
          method: 'GET',
          headers: {
            'Content-Type': 'application/json',
          }
        },
      );

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