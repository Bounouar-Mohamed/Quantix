import { NextRequest, NextResponse } from 'next/server';

// Credentials admin (à configurer via env en production)
const ADMIN_EMAIL = process.env.ADMIN_EMAIL || 'admin@quantix.ai';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Quantix2025!';
const TOKEN_SECRET = process.env.TOKEN_SECRET || 'quantix-dashboard-secret-key-2025';

function generateToken(email: string): string {
  const payload = {
    email,
    exp: Date.now() + 24 * 60 * 60 * 1000,
  };
  const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
  const signature = Buffer.from(`${encoded}.${TOKEN_SECRET}`).toString('base64').slice(0, 16);
  return `${encoded}.${signature}`;
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, password } = body;

    // Validation
    if (!email || !password) {
      return NextResponse.json(
        { error: 'Email et mot de passe requis' },
        { status: 400 }
      );
    }

    // Vérifier les credentials
    if (email !== ADMIN_EMAIL || password !== ADMIN_PASSWORD) {
      return NextResponse.json(
        { error: 'Identifiants invalides' },
        { status: 401 }
      );
    }

    // Générer le token
    const token = generateToken(email);

    // Créer la réponse avec le cookie
    const response = NextResponse.json({
      success: true,
      email,
    });

    // Set cookie httpOnly pour plus de sécurité
    response.cookies.set('quantix_token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 24 * 60 * 60, // 24h
      path: '/',
    });

    return response;
  } catch (error) {
    return NextResponse.json(
      { error: 'Erreur serveur' },
      { status: 500 }
    );
  }
}

