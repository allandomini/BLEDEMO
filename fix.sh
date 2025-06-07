#!/bin/bash

echo "🔧 Iniciando correção do app React Native BLE..."

# Para todos os processos
echo "⏹️  Parando processos..."
killall -9 node 2>/dev/null || true

# Limpa caches
echo "🧹 Limpando caches..."
cd ios 2>/dev/null && rm -rf Pods Podfile.lock build ~/Library/Developer/Xcode/DerivedData && cd .. || true
rm -rf node_modules
npm cache clean --force
watchman watch-del-all 2>/dev/null || true

# Reinstala dependências
echo "📦 Reinstalando dependências..."
npm install

# Verifica se as dependências de navegação estão instaladas
echo "🔍 Verificando dependências de navegação..."
npm list @react-navigation/native || npm install @react-navigation/native
npm list @react-navigation/native-stack || npm install @react-navigation/native-stack
npm list react-native-screens || npm install react-native-screens
npm list react-native-safe-area-context || npm install react-native-safe-area-context

# Reinstala pods
echo "🍎 Reinstalando pods do iOS..."
cd ios
pod install
cd ..

# Limpa o cache do Metro
echo "🚇 Limpando cache do Metro..."
npx react-native start --reset-cache &
METRO_PID=$!
sleep 5

# Mata o Metro para executar o app
kill $METRO_PID 2>/dev/null || true

echo "✅ Correção concluída!"
echo ""
echo "📱 Agora execute:"
echo "   npx react-native start --reset-cache"
echo ""
echo "Em outro terminal:"
echo "   npx react-native run-ios"
echo ""