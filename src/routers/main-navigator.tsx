import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { PeripheralInfo } from 'react-native-ble-manager';
import { NavigationContainer } from '@react-navigation/native';
import ScanDevicesScreen from '../views/App/components/ScanDevicesScreen/ScanDevicesScreen';
import PeripheralDetailsScreen from '../views/App/components/PeripheralDetailsScreen/PeripheralDetailsScreen';

// 1. Definição dos parâmetros para cada rota
export type RootStackParamList = {
  ScanDevices: undefined; // A tela ScanDevices não recebe parâmetros
  PeripheralDetails: {    // A tela PeripheralDetails PRECISA receber peripheralData
    peripheralData: PeripheralInfo;
  };
};

// Declaração global para o React Navigation (opcional, mas boa prática)
declare global {
  namespace ReactNavigation {
    interface RootParamList extends RootStackParamList {}
  }
}

const Stack = createNativeStackNavigator<RootStackParamList>();

// 2. Componente do Navegador
export const MainNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator
        initialRouteName="ScanDevices" // Define a primeira tela a ser exibida
        screenOptions={{
          headerStyle: {
            backgroundColor: '#F0F2F5', // Um estilo de header consistente
          },
          headerTintColor: '#1A202C',
          headerTitleStyle: {
            fontWeight: 'bold',
          },
        }}
      >
        {/* 3. Atribuição CORRETA de cada tela ao seu componente */}
        <Stack.Screen 
          name="ScanDevices" 
          component={ScanDevicesScreen} 
          options={{ title: 'Dispositivos BLE' }}
        />
        <Stack.Screen
          name="PeripheralDetails"
          component={PeripheralDetailsScreen}
          options={{ title: 'Detalhes do Dispositivo' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};