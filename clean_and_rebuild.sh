#!/bin/bash
echo "Starting clean build and reinstall process..."

# Determine package manager and execute install
if [ -f "yarn.lock" ]; then
  echo "Yarn project detected."
  echo "Removing node_modules and yarn.lock..."
  rm -rf node_modules
  rm -f yarn.lock
  echo "Running yarn install..."
  yarn install --check-files
  if [ $? -ne 0 ]; then echo "Yarn install failed"; exit 1; fi
elif [ -f "package-lock.json" ]; then
  echo "NPM project detected."
  echo "Removing node_modules and package-lock.json..."
  rm -rf node_modules
  rm -f package-lock.json
  echo "Running npm install..."
  npm install --legacy-peer-deps
  if [ $? -ne 0 ]; then echo "NPM install failed"; exit 1; fi
else
  echo "No lock file (yarn.lock or package-lock.json) found. Attempting npm install."
  rm -rf node_modules
  npm install --legacy-peer-deps
  if [ $? -ne 0 ]; then echo "NPM install (no lockfile) failed"; exit 1; fi
fi

echo "Cleaning Android build..."
if [ -d "android" ]; then
  cd android
  if [ -f "./gradlew" ]; then
    ./gradlew clean
    if [ $? -ne 0 ]; then echo "Android clean failed"; cd ..; exit 1; fi
    echo "Android build cleaned."
  else
    echo "Gradle wrapper not found in android directory."
  fi
  cd ..
else
  echo "Android directory not found."
fi

echo "Cleaning iOS build and reinstalling pods..."
if [ -d "ios" ]; then
  cd ios
  echo "Updating and installing Pods..."
  pod install --repo-update
  if [ $? -ne 0 ]; then echo "Pod install failed"; cd ..; exit 1; fi
  echo "Pods updated and installed."

  echo "Cleaning Xcode build (standard clean)..."
  # Try cleaning workspace first, then project, for both simulator and device SDKs
  if [ -d "MeuAppBLEPuro.xcworkspace" ]; then
    xcodebuild clean -workspace MeuAppBLEPuro.xcworkspace -scheme MeuAppBLEPuro -sdk iphonesimulator
    xcodebuild clean -workspace MeuAppBLEPuro.xcworkspace -scheme MeuAppBLEPuro -sdk iphoneos
  elif [ -f "MeuAppBLEPuro.xcodeproj" ]; then
    xcodebuild clean -project MeuAppBLEPuro.xcodeproj -scheme MeuAppBLEPuro -sdk iphonesimulator
    xcodebuild clean -project MeuAppBLEPuro.xcodeproj -scheme MeuAppBLEPuro -sdk iphoneos
  else
    echo "No Xcode workspace or project found to clean."
  fi
  # We won't fail the script if xcodebuild clean fails as it can be finicky

  echo "iOS build cleaned."
  cd ..
else
  echo "iOS directory not found."
fi

echo "Clean build and reinstall process finished successfully."
echo "PLEASE REBUILD AND RUN YOUR APPLICATION ON A DEVICE/EMULATOR to check if the issue is resolved."
echo "This tool cannot run the application for you."
