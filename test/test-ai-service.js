#!/usr/bin/env node

/**
 * Script de test pour le microservice IA
 * Teste la connexion OpenAI et les APIs
 */

import axios from 'axios';

const BASE_URL = 'http://localhost:3001/api/v1';

async function testAiService() {
  console.log('🧪 Test du microservice IA...\n');

  try {
    // Test 1: Vérification de la santé
    console.log('1️⃣ Test de santé des services...');
    const healthResponse = await axios.get(`${BASE_URL}/ai/health`);
    console.log('✅ Santé des services:', healthResponse.data);
    console.log('');

    // Test 2: Liste des modèles disponibles
    console.log('2️⃣ Test des modèles disponibles...');
    const modelsResponse = await axios.get(`${BASE_URL}/ai/models?provider=openai`);
    console.log('✅ Modèles disponibles:', modelsResponse.data);
    console.log('');

    // Test 3: Génération d'une réponse simple
    console.log('3️⃣ Test de génération de réponse...');
    const generateResponse = await axios.post(`${BASE_URL}/ai/generate`, {
      messages: [
        { role: 'user', content: 'Bonjour, pouvez-vous me dire bonjour en français ?' }
      ],
      model: 'gpt-3.5-turbo',
      temperature: 0.7,
      maxTokens: 100,
    });
    console.log('✅ Réponse générée:', generateResponse.data);
    console.log('');

    // Test 4: Test rapide
    console.log('4️⃣ Test rapide...');
    const testResponse = await axios.post(`${BASE_URL}/ai/test`);
    console.log('✅ Test rapide:', testResponse.data);
    console.log('');

    console.log('🎉 Tous les tests sont passés avec succès !');

  } catch (error) {
    console.error('❌ Erreur lors des tests:', error.response?.data || error.message);
    
    if (error.code === 'ECONNREFUSED') {
      console.log('\n💡 Le microservice n\'est pas démarré. Lancez-le avec:');
      console.log('   npm run dev');
    }
  }
}

// Fonction pour tester la connexion au CRM
async function testCrmConnection() {
  console.log('\n🔗 Test de connexion au CRM...');
  
  try {
    const crmResponse = await axios.get('http://localhost:3000/api/health');
    console.log('✅ CRM accessible:', crmResponse.status);
  } catch (error) {
    console.log('⚠️ CRM non accessible:', error.message);
    console.log('💡 Assurez-vous que le CRM est démarré sur le port 3000');
  }
}

// Exécution des tests
async function runTests() {
  await testAiService();
  await testCrmConnection();
}

runTests();
