import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React from 'react';
import { PeripheralInfo } from 'react-native-ble-manager';
import { NavigationContainer } from '@react-navigation/native';
import ScanDevicesScreen from '../views/App/components/ScanDevicesScreen/ScanDevicesScreen.tsx';
import PeripheralDetailsScreen from '../views/App/components/PeripheralDetailsScreen/PeripheralDetailsScreen.tsx';

export type RootStackParamList = {
  ScanDevices: undefined;
  PeripheralDetails: {
    peripheralData: PeripheralInfo;
  };
};

// Create a type for the navigation props that will be passed to screens
type RootStackScreenProps<T extends keyof RootStackParamList> = {
  navigation: any;
  route: {
    params: RootStackParamList[T];
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

export const MainNavigator = () => {
  return (
    <NavigationContainer>
      <Stack.Navigator>
        <Stack.Screen 
          name="ScanDevices" 
          component={ScanDevicesScreen} 
          options={{ title: 'BLE Devices' }}
        />
        <Stack.Screen
          name="PeripheralDetails"
          component={PeripheralDetailsScreen}
          options={{ title: 'Device Details' }}
        />
      </Stack.Navigator>
    </NavigationContainer>
  );
};
