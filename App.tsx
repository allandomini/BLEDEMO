// Main App.tsx (with NavigationContainer) - ADJUSTED

import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import React, { useEffect } from 'react'; // Adicionado useEffect
import { Alert, PermissionsAndroid, Platform } from 'react-native'; // Adicionado para permissões e alertas
import BleManager, { PeripheralInfo } from 'react-native-ble-manager'; // Importe PeripheralInfo

import PeripheralDetailsScreen from './components/PeripheralDetailsScreen';
import ScanDevicesScreen from './components/ScanDevicesScreen';

// Defina RootStackParamList aqui ou importe de um arquivo de tipos
export type RootStackParamList = {
  ScanDevices: undefined;
  PeripheralDetails: {
    peripheralData: PeripheralInfo;
  };
};

const Stack = createNativeStackNavigator<RootStackParamList>();

// Função para lidar com permissões Android (você pode mover para um utilitário)
const handleAndroidPermissions = async () => {
  if (Platform.OS === 'android') {
    if (Platform.Version >= 31) { // Android 12+
      const permissions = await PermissionsAndroid.requestMultiple([
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN,
        PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT,
        PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION, // Ainda recomendado
      ]);
      if (permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_SCAN] === PermissionsAndroid.RESULTS.GRANTED &&
          permissions[PermissionsAndroid.PERMISSIONS.BLUETOOTH_CONNECT] === PermissionsAndroid.RESULTS.GRANTED &&
          permissions[PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION] === PermissionsAndroid.RESULTS.GRANTED) {
        console.log('[App.tsx] Permissões Android BLE OK (API 31+)');
      } else {
        console.error('[App.tsx] Permissões Android BLE negadas (API 31+)', permissions);
        Alert.alert("Permission Denied", "Bluetooth and Location permissions are required.");
      }
    } else if (Platform.Version >= 23) { // Android 6-11
      const checkResult = await PermissionsAndroid.check(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
      if (checkResult) {
        console.log('[App.tsx] Permissão Localização Android OK (API <31)');
      } else {
        const requestResult = await PermissionsAndroid.request(PermissionsAndroid.PERMISSIONS.ACCESS_FINE_LOCATION);
        if (requestResult === PermissionsAndroid.RESULTS.GRANTED) {
          console.log('[App.tsx] Permissão Localização Android concedida (API <31)');
        } else {
          console.error('[App.tsx] Permissão Localização Android negada (API <31)');
          Alert.alert("Permission Denied", "Location permission is required for BLE scanning.");
        }
      }
    }
  }
};


const App = () => {
  useEffect(() => {
    console.log('[App.tsx] Montado. Iniciando BleManager.start()...');
    BleManager.start({ showAlert: false })
      .then(() => {
        console.log('******************************************************************');
        console.log('[App.tsx] BleManager.start() SUCCESSFULLY INITIALIZED GLOBALLY!');
        console.log('******************************************************************');
        // Lidar com permissões após o BleManager ser inicializado
        handleAndroidPermissions();
      })
      .catch(error => {
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        console.error('[App.tsx] FAILED TO INITIALIZE BleManager.start():', error);
        console.error('!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!!');
        Alert.alert("Critical Error", "Failed to initialize BleManager.");
      });


  }, []);

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

export default App;