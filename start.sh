#!/bin/bash

echo "🚀 Démarrage du Microservice IA Management (Bun)"
echo "================================================"

# Vérification des prérequis
echo "📋 Vérification des prérequis..."

# Vérifier Bun
if ! command -v bun &> /dev/null; then
    echo "❌ Bun n'est pas installé"
    echo "💡 Installez Bun avec: curl -fsSL https://bun.sh/install | bash"
    exit 1
fi

echo "✅ Bun est installé: $(bun --version)"

# Vérifier le fichier .env
if [ ! -f .env ]; then
    echo "⚠️  Fichier .env manquant, création depuis env.example..."
    cp env.example .env
    echo "📝 Veuillez éditer le fichier .env avec vos clés API"
    echo "   nano .env"
    exit 1
fi

# Vérifier la clé OpenAI
if ! grep -q "OPENAI_API_KEY=sk-" .env; then
    echo "⚠️  Clé API OpenAI manquante dans .env"
    echo "   Veuillez ajouter votre clé OpenAI dans le fichier .env"
    exit 1
fi

echo "✅ Configuration .env trouvée"

# Installation des dépendances si nécessaire
if [ ! -d "node_modules" ]; then
    echo "📦 Installation des dépendances avec Bun..."
    bun install
fi

# Compilation
echo "🔨 Compilation du projet avec Bun..."
bun run build

if [ $? -ne 0 ]; then
    echo "❌ Erreur de compilation"
    exit 1
fi

echo "✅ Compilation réussie"

# Démarrage du service
echo "🚀 Démarrage du microservice avec Bun..."
echo ""

SERVICE_PORT=${PORT:-3001}
echo "📚 Documentation disponible sur: http://localhost:${SERVICE_PORT}/api/docs"
echo "🔗 API disponible sur: http://localhost:${SERVICE_PORT}/api/v1"
echo ""
echo "Appuyez sur Ctrl+C pour arrêter le service"
echo ""

bun run start:prod
