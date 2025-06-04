import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MainNavigator } from './routers/main-navigator';
import { bleService } from './services/BleService';

const App = () => {
  useEffect(() => {
    const initBle = async () => {
      try {
        console.log('Initializing BLE service...');
        const success = await bleService.initialize();
        if (success) {
          console.log('BLE service initialized successfully');
        } else {
          console.error('Failed to initialize BLE service');
        }
      } catch (error) {
        console.error('Error initializing BLE service:', error);
      }
    };

    initBle();
  }, []);

  return (
    <SafeAreaProvider>
      <MainNavigator />
    </SafeAreaProvider>
  );
};

export default App;
