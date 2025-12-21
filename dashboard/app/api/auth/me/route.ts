import { NextRequest, NextResponse } from 'next/server';

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'quantix-dashboard-secret-key-2025';

function verifyToken(token: string): { valid: boolean; email?: string } {
  try {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return { valid: false };
    
    const expectedSig = Buffer.from(`${encoded}.${TOKEN_SECRET}`).toString('base64').slice(0, 16);
    if (signature !== expectedSig) return { valid: false };
    
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString());
    if (payload.exp < Date.now()) return { valid: false };
    
    return { valid: true, email: payload.email };
  } catch {
    return { valid: false };
  }
}

export async function GET(request: NextRequest) {
  const token = request.cookies.get('quantix_token')?.value;

  if (!token) {
    return NextResponse.json({ authenticated: false });
  }

  const result = verifyToken(token);
  
  if (!result.valid) {
    return NextResponse.json({ authenticated: false });
  }

  return NextResponse.json({
    authenticated: true,
    email: result.email,
  });
}

