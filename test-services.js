/**
 * Script de test pour vérifier que tous les services OpenAI sont opérationnels
 */

const BASE_URL = 'http://localhost:3001/api/v1';

console.log('🧪 Test des services OpenAI\n');

// Test 1: Health check
async function testHealthCheck() {
  console.log('1. Test Health Check...');
  try {
    const response = await fetch(`${BASE_URL}/ai/health`);
    const data = await response.json();
    console.log('✅ Health Check:', data);
    return true;
  } catch (error) {
    console.log('❌ Erreur Health Check:', error.message);
    return false;
  }
}

// Test 2: Modèles disponibles
async function testModels() {
  console.log('\n2. Test Modèles disponibles...');
  try {
    const response = await fetch(`${BASE_URL}/ai/models`);
    const data = await response.json();
    console.log('✅ Modèles:', data);
    return true;
  } catch (error) {
    console.log('❌ Erreur Modèles:', error.message);
    return false;
  }
}

// Test 3: Génération de texte
async function testTextGeneration() {
  console.log('\n3. Test Génération de texte...');
  try {
    const response = await fetch(`${BASE_URL}/ai/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [
          { role: 'user', content: 'Dis-moi bonjour en français en une phrase' }
        ],
        model: 'gpt-4o-mini',
        maxTokens: 120
      })
    });
    const data = await response.json();
    console.log('✅ Génération de texte:', {
      model: data.model,
      content: data.content.substring(0, 100) + '...',
      usage: data.usage
    });
    return true;
  } catch (error) {
    console.log('❌ Erreur Génération de texte:', error.message);
    return false;
  }
}

// Test 4: Synthèse vocale
async function testTTS() {
  console.log('\n4. Test Synthèse vocale (TTS)...');
  try {
    const response = await fetch(`${BASE_URL}/ai/synthesize`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        text: 'Bonjour, c\'est un test de synthèse vocale.',
        voice: 'alloy'
      })
    });
    const contentType = response.headers.get('content-type');
    if (contentType?.includes('audio')) {
      console.log('✅ Synthèse vocale: Fichier audio généré');
      return true;
    } else {
      console.log('❌ Synthèse vocale: Erreur -', await response.text());
      return false;
    }
  } catch (error) {
    console.log('❌ Erreur Synthèse vocale:', error.message);
    return false;
  }
}

// Test 5: Token Realtime
async function testRealtimeToken() {
  console.log('\n5. Test Token Realtime...');
  try {
    const response = await fetch(`${BASE_URL}/ai/realtime/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        sessionId: 'test-session-123'
      })
    });
    const data = await response.json();
    console.log('✅ Token Realtime:', data);
    return true;
  } catch (error) {
    console.log('❌ Erreur Token Realtime:', error.message);
    return false;
  }
}

// Exécution des tests
async function runAllTests() {
  const results = {
    healthCheck: await testHealthCheck(),
    models: await testModels(),
    textGeneration: await testTextGeneration(),
    tts: await testTTS(),
    realtime: await testRealtimeToken()
  };

  console.log('\n📊 Résultats des tests:');
  console.log('========================');
  Object.entries(results).forEach(([test, passed]) => {
    console.log(`${passed ? '✅' : '❌'} ${test}: ${passed ? 'PASSÉ' : 'ÉCHEC'}`);
  });

  const allPassed = Object.values(results).every(r => r);
  console.log('\n' + (allPassed ? '🎉 Tous les tests sont passés !' : '⚠️ Certains tests ont échoué'));
  return allPassed;
}

// Point d'entrée
runAllTests().then(success => process.exit(success ? 0 : 1));
