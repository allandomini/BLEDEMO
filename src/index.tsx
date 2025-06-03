import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { MainNavigator } from './routers/main-navigator';

const App = () => {
  return (
    <SafeAreaProvider>
      <MainNavigator />
    </SafeAreaProvider>
  );
};

export default App;
