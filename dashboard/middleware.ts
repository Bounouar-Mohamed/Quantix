import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

const TOKEN_SECRET = process.env.TOKEN_SECRET || 'quantix-dashboard-secret-key-2025';

// Routes publiques (pas besoin d'auth)
const PUBLIC_ROUTES = ['/login', '/api/auth/login'];

function verifyToken(token: string): boolean {
  try {
    const [encoded, signature] = token.split('.');
    if (!encoded || !signature) return false;
    
    const expectedSig = Buffer.from(`${encoded}.${TOKEN_SECRET}`).toString('base64').slice(0, 16);
    if (signature !== expectedSig) return false;
    
    const payload = JSON.parse(Buffer.from(encoded, 'base64').toString());
    if (payload.exp < Date.now()) return false;
    
    return true;
  } catch {
    return false;
  }
}

export function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Autoriser les routes publiques
  if (PUBLIC_ROUTES.some(route => pathname.startsWith(route))) {
    return NextResponse.next();
  }

  // Autoriser les fichiers statiques
  if (
    pathname.startsWith('/_next') ||
    pathname.startsWith('/favicon') ||
    pathname.includes('.')
  ) {
    return NextResponse.next();
  }

  // Vérifier le token
  const token = request.cookies.get('quantix_token')?.value;

  if (!token || !verifyToken(token)) {
    // Rediriger vers login
    const loginUrl = new URL('/login', request.url);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico).*)'],
};

